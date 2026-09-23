import type { ChatTransport, ConnectionState, Message, TransportEvent } from '../types';
import { createEmitter } from './emitter';
import type { Listener } from './emitter';

// todo lo que la ui necesita saber del chat en un solo objeto
export interface ChatState {
  // historial en orden de llegada (los mensajes en streaming se reemplazan por id)
  readonly messages: readonly Message[];
  // estado de la conexion que nos reporta el transporte
  readonly connectionState: ConnectionState;
  // true mientras el asistente tiene respuestas pendientes (para los puntitos de "escribiendo")
  readonly isTyping: boolean;
  // ids de mensajes del usuario que no se pudieron mandar (se pueden reintentar)
  readonly failedMessageIds: readonly string[];
  // ultimo error del transporte, se limpia al conectar o al mandar algo bien
  readonly error: Error | null;
}

// eventos que se pueden escuchar con store.on(...)
export type ChatStoreEvents = {
  // mensaje ya completo: uno del usuario que se mando bien o una respuesta terminada
  message: Message;
  state: ConnectionState;
  error: Error;
};

// estados en los que ya no van a llegar las respuestas que estaban en camino
const INTERRUPTED_STATES: readonly ConnectionState[] = ['disconnected', 'reconnecting', 'error'];

// store del chat, no depende de react.
// escucha al transporte (mock o websocket real) y arma el historial.
// el estado nunca se modifica, siempre se crea uno nuevo, asi react
// (useSyncExternalStore) sabe cuando volver a renderizar
export class ChatStore {
  private state: ChatState;
  // cuantas respuestas del asistente estamos esperando
  // (el transporte no dice a que pregunta responde cada mensaje, por eso contamos)
  private pendingResponses = 0;
  private destroyed = false;
  // listeners de cambios de estado (los usa react)
  private readonly listeners = new Set<() => void>();
  // listeners de eventos (message, state, error)
  private readonly events = createEmitter<ChatStoreEvents>();
  private readonly unsubscribeTransport: () => void;

  constructor(private readonly transport: ChatTransport) {
    this.state = {
      messages: [],
      connectionState: transport.state,
      isTyping: false,
      failedMessageIds: [],
      error: null,
    };
    // todo lo que mande el transporte pasa por handleEvent
    this.unsubscribeTransport = transport.subscribe((event) => this.handleEvent(event));
  }

  // para useSyncExternalStore: avisa cuando cambia el estado.
  // son arrow functions para que no se pierda el this al pasarlas a react
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  // para useSyncExternalStore: devuelve el estado actual
  getSnapshot = (): ChatState => this.state;

  // escuchar un evento del chat, devuelve la funcion para dejar de escuchar
  on<K extends keyof ChatStoreEvents>(
    event: K,
    listener: Listener<ChatStoreEvents[K]>,
  ): () => void {
    return this.events.on(event, listener);
  }

  off<K extends keyof ChatStoreEvents>(event: K, listener: Listener<ChatStoreEvents[K]>): void {
    this.events.off(event, listener);
  }

  connect(): void {
    if (!this.destroyed) this.transport.connect();
  }

  disconnect(): void {
    this.transport.disconnect();
  }

  // agrega el mensaje del usuario al historial y lo manda.
  // si falla queda en failedMessageIds para usar retry.
  // devuelve null si el texto venia vacio
  send(text: string): Message | null {
    const content = text.trim();
    if (!content || this.destroyed) return null;
    const message: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
      status: 'complete',
    };
    // el transporte no guarda el mensaje del usuario, entonces lo agregamos nosotros
    this.update({ messages: [...this.state.messages, message] });
    this.deliver(message);
    return message;
  }

  // vuelve a mandar un mensaje que fallo, con el mismo id (asi el server puede evitar duplicados).
  // devuelve true si se pudo mandar
  retry(id: string): boolean {
    // solo se reintentan mensajes que de verdad estan marcados como fallidos
    const message = this.state.failedMessageIds.includes(id)
      ? this.state.messages.find((m) => m.id === id)
      : undefined;
    if (this.destroyed || !message) return false;
    this.update({ failedMessageIds: this.state.failedMessageIds.filter((f) => f !== id) });
    return this.deliver(message);
  }

  // borra todo el historial
  clear(): void {
    this.pendingResponses = 0;
    this.update({ messages: [], failedMessageIds: [], isTyping: false, error: null });
  }

  // suelta el transporte y todos los listeners. llamarlo dos veces no hace nada
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unsubscribeTransport();
    this.transport.disconnect();
    this.listeners.clear();
    this.events.clear();
  }

  // intenta mandar el mensaje por el transporte
  private deliver(message: Message): boolean {
    try {
      // si no hay conexion el transporte tira error (y tambien emite un evento error)
      this.transport.send(message);
    } catch {
      this.update({ failedMessageIds: [...this.state.failedMessageIds, message.id] });
      return false;
    }
    // se mando bien: ahora esperamos una respuesta mas
    this.pendingResponses += 1;
    this.update({ isTyping: true, error: null });
    this.events.emit('message', message);
    return true;
  }

  // reparte cada evento del transporte a su funcion
  private handleEvent(event: TransportEvent): void {
    switch (event.type) {
      case 'state':
        this.handleState(event.state);
        break;
      case 'message':
        this.handleMessage(event.message);
        break;
      case 'error':
        this.update({ error: event.error });
        this.events.emit('error', event.error);
        break;
    }
  }

  private handleState(connectionState: ConnectionState): void {
    if (INTERRUPTED_STATES.includes(connectionState)) {
      // se cayo o se cerro la conexion: las respuestas pendientes ya no van a llegar.
      // los mensajes que estaban a medias se cierran con el texto que alcanzo a llegar,
      // si no se quedarian "en streaming" para siempre en la ui
      this.pendingResponses = 0;
      const { messages } = this.state;
      this.update({
        connectionState,
        isTyping: false,
        // si no habia nada en streaming dejamos el mismo arreglo (evita renders de mas)
        messages: messages.some((m) => m.status === 'streaming')
          ? messages.map((m) => (m.status === 'streaming' ? { ...m, status: 'complete' } : m))
          : messages,
      });
    } else {
      // al conectar se limpia el error anterior
      this.update(
        connectionState === 'connected' ? { connectionState, error: null } : { connectionState },
      );
    }
    this.events.emit('state', connectionState);
  }

  private handleMessage(message: Message): void {
    // con streaming llegan varias versiones del mismo mensaje (mismo id, texto acumulado),
    // entonces si ya existe se reemplaza y si no se agrega al final
    const messages = [...this.state.messages];
    const index = messages.findIndex((m) => m.id === message.id);
    const previous = index === -1 ? undefined : messages[index];
    if (index === -1) messages.push(message);
    else messages[index] = message;

    // solo cuenta como terminado la primera vez que llega en 'complete'
    // (si el server lo repite no lo contamos doble)
    const completed = message.status === 'complete' && previous?.status !== 'complete';
    // una respuesta del asistente terminada = una respuesta pendiente menos (nunca bajo de 0)
    if (completed && message.role === 'assistant' && this.pendingResponses > 0) {
      this.pendingResponses -= 1;
    }
    this.update({ messages, isTyping: this.pendingResponses > 0 });
    if (completed) this.events.emit('message', message);
  }

  // crea un estado nuevo con los cambios y avisa a los listeners
  private update(patch: Partial<ChatState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of [...this.listeners]) listener();
  }
}
