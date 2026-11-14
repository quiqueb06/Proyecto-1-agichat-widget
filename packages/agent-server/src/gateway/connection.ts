import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import type { RawData } from 'ws';
import type { AgentRunner } from '../agent/types.js';
import type { Logger } from '../logger.js';
import { agentActionSchema, parseClientFrame, serializeFrame } from '../protocol/frames.js';
import type { ServerFrame } from '../protocol/frames.js';
import type { Message } from '../protocol/message.js';
import type { SessionStore } from '../session/SessionStore.js';
import { RateLimiter } from './RateLimiter.js';

// limites por conexion (vienen de la config)
export interface ConnectionLimits {
  // largo maximo del texto de un mensaje
  maxMessageChars: number;
  // mensajes que pueden esperar turno ademas del que se esta respondiendo
  maxQueuedMessages: number;
  // cuantos mensajes por ventana de tiempo
  rateLimit: { messages: number; windowMs: number };
}

export interface ConnectionDeps {
  agent: AgentRunner;
  sessions: SessionStore;
  logger: Logger;
  // minimo de ms entre snapshots del streaming (0 = mandar cada pedazo)
  streamThrottleMs: number;
  limits: ConnectionLimits;
  // reloj inyectable para probar el throttle y el rate limit
  now?: () => number;
}

// textos que ve el usuario cuando algo sale mal
export const ERROR_REPLY = 'Lo siento, ocurrió un error al generar la respuesta. Intenta de nuevo.';
export const INTERRUPTED_NOTE = '\n\n_(La respuesta se interrumpió por un error.)_';
export const EMPTY_REPLY = 'No tengo una respuesta para eso. ¿Puedes intentarlo de otra forma?';
export const TOO_LONG_REPLY = (max: number) =>
  `Tu mensaje es muy largo. Intenta resumirlo en menos de ${max} caracteres.`;
export const BLANK_REPLY = 'No recibí ningún texto. ¿Qué te gustaría preguntar?';
export const BUSY_REPLY =
  'Espera a que termine la respuesta anterior antes de enviar otro mensaje.';
export const RATE_LIMIT_REPLY =
  'Estás enviando mensajes muy rápido. Espera un momento e inténtalo de nuevo.';

// una conexion = una sesion de chat con una widget.
// recibe los mensajes del usuario, se los pasa al agente uno por uno y le va mandando
// a la widget la respuesta en streaming
export class GatewayConnection {
  readonly sessionId = randomUUID();
  // se aborta cuando el usuario se desconecta, para que el agente deje de trabajar
  private readonly controller = new AbortController();
  // los turnos se encadenan: si el usuario manda dos mensajes rapido, el segundo
  // espera a que termine el primero (asi no se mezclan dos respuestas)
  private queue: Promise<void> = Promise.resolve();
  // turnos en cola o en curso, para no dejar que se acumulen sin limite
  private pending = 0;
  private readonly now: () => number;
  private readonly limiter: RateLimiter;

  constructor(
    private readonly socket: WebSocket,
    private readonly deps: ConnectionDeps,
  ) {
    this.now = deps.now ?? Date.now;
    this.limiter = new RateLimiter({ ...deps.limits.rateLimit, now: this.now });
    socket.on('message', (data, isBinary) => this.onMessage(data, isBinary));
    socket.on('close', () => void this.onClose());
    socket.on('error', (error) =>
      deps.logger.warn('socket_error', { sessionId: this.sessionId, error }),
    );
  }

  // promesa que se resuelve cuando ya no hay turnos pendientes (la usan los tests y el apagado)
  idle(): Promise<void> {
    return this.queue;
  }

  private onMessage(data: RawData, isBinary: boolean): void {
    if (isBinary) {
      this.send({ type: 'error', error: 'Solo se aceptan mensajes de texto.' });
      return;
    }
    const parsed = parseClientFrame(data.toString());
    if (!parsed.ok) {
      // un frame malo no cierra la conexion, solo se avisa (igual que hace la widget)
      this.send({ type: 'error', error: parsed.error });
      return;
    }
    const input = parsed.frame.message;
    const { limits } = this.deps;

    // reglas antes de molestar al agente (cada llamada al agente gasta cuota de groq)
    if (input.content.length > limits.maxMessageChars) {
      return this.reject(
        TOO_LONG_REPLY(limits.maxMessageChars),
        'Mensaje demasiado largo.',
        'largo',
      );
    }
    if (!input.content.trim()) {
      return this.reject(BLANK_REPLY, 'Mensaje vacío.', 'vacio');
    }
    // uno respondiendose + maxQueuedMessages esperando; mas que eso ya es abuso
    if (this.pending > limits.maxQueuedMessages) {
      return this.reject(BUSY_REPLY, 'Demasiados mensajes en espera.', 'cola_llena');
    }
    if (!this.limiter.tryTake()) {
      return this.reject(RATE_LIMIT_REPLY, 'Límite de mensajes alcanzado.', 'rate_limit');
    }

    this.pending += 1;
    // runTurn nunca lanza, por eso la cadena de la cola nunca se rompe
    this.queue = this.queue
      .then(() => this.runTurn(input))
      .finally(() => {
        this.pending -= 1;
      });
  }

  // rechaza un mensaje valido explicandole al usuario por que.
  // igual que con los errores, mandamos un mensaje complete del asistente para que
  // la widget quite los puntitos de "escribiendo", y ademas el frame de error
  private reject(reply: string, error: string, reason: string): void {
    this.deps.logger.warn('mensaje_rechazado', { sessionId: this.sessionId, reason });
    this.send({
      type: 'message',
      message: {
        id: randomUUID(),
        role: 'assistant',
        content: reply,
        createdAt: new Date().toISOString(),
        status: 'complete',
      },
    });
    this.send({ type: 'error', error });
  }

  // un turno: guarda el mensaje del usuario, llama al agente y manda la respuesta
  private async runTurn(input: Message): Promise<void> {
    const { signal } = this.controller;
    if (signal.aborted) return;

    // la respuesta tiene su propio id; todos los snapshots lo comparten (asi la widget
    // reemplaza el mensaje en vez de agregar uno nuevo por cada pedazo)
    const reply = { id: randomUUID(), createdAt: new Date().toISOString() };
    const message = (content: string, status: Message['status']): Message => ({
      ...reply,
      role: 'assistant',
      content,
      status,
    });
    let content = '';
    let lastSnapshotAt = -Infinity;

    try {
      const history = await this.deps.sessions.history(this.sessionId);
      await this.deps.sessions.append(this.sessionId, input);

      const events = this.deps.agent.respond({
        sessionId: this.sessionId,
        history,
        input,
        signal,
      });
      for await (const event of events) {
        if (signal.aborted) return;
        if (event.type === 'text') {
          content += event.delta;
          // no mandamos un frame por cada pedacito: maximo uno cada streamThrottleMs
          const now = this.now();
          if (now - lastSnapshotAt >= this.deps.streamThrottleMs) {
            lastSnapshotAt = now;
            this.send({ type: 'message', message: message(content, 'streaming') });
          }
        } else {
          // lo que dice el agente tambien se valida: un llm puede inventar cualquier cosa
          const action = agentActionSchema.safeParse(event.action);
          if (action.success) this.send({ type: 'action', action: action.data });
          else this.deps.logger.warn('accion_invalida', { sessionId: this.sessionId });
        }
      }
      if (signal.aborted) return;

      const final = message(content.trim() ? content : EMPTY_REPLY, 'complete');
      this.send({ type: 'message', message: final });
      await this.deps.sessions.append(this.sessionId, final);
    } catch (error) {
      if (signal.aborted) return;
      this.deps.logger.error('turno_fallido', { sessionId: this.sessionId, error });
      // importante: la widget solo quita los puntitos de "escribiendo" cuando llega un
      // mensaje complete del asistente. por eso siempre cerramos con uno, ademas del error
      const text = content ? content + INTERRUPTED_NOTE : ERROR_REPLY;
      this.send({ type: 'message', message: message(text, 'complete') });
      this.send({ type: 'error', error: 'El agente no pudo completar la respuesta.' });
    }
  }

  private send(frame: ServerFrame): void {
    // si el socket ya se cerro no hay a quien mandarle nada
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(serializeFrame(frame));
  }

  private async onClose(): Promise<void> {
    // el usuario se fue: cortamos al agente y borramos su conversacion
    this.controller.abort();
    try {
      await this.deps.sessions.delete(this.sessionId);
    } catch (error) {
      this.deps.logger.warn('sesion_no_borrada', { sessionId: this.sessionId, error });
    }
  }
}
