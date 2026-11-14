import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { EchoAgent } from '../agent/EchoAgent.js';
import type { AgentEvent, AgentRequest, AgentRunner } from '../agent/types.js';
import { silentLogger } from '../logger.js';
import type { Logger } from '../logger.js';
import type { ServerFrame } from '../protocol/frames.js';
import type { Message } from '../protocol/message.js';
import { InMemorySessionStore } from '../session/SessionStore.js';
import type { SessionStore } from '../session/SessionStore.js';
import { EMPTY_REPLY, ERROR_REPLY, GatewayConnection, INTERRUPTED_NOTE } from './connection.js';

// socket falso: guarda lo que el servidor le manda y deja simular mensajes del cliente
class FakeSocket extends EventEmitter {
  readyState: number = WebSocket.OPEN;
  readonly sent: ServerFrame[] = [];
  send(data: string) {
    this.sent.push(JSON.parse(data) as ServerFrame);
  }
  // simula que la widget manda algo
  receive(data: unknown, isBinary = false) {
    const raw = typeof data === 'string' ? data : JSON.stringify(data);
    this.emit('message', Buffer.from(raw), isBinary);
  }
  get messages() {
    return this.sent.flatMap((f) => (f.type === 'message' ? [f.message] : []));
  }
  get errors() {
    return this.sent.flatMap((f) => (f.type === 'error' ? [f.error] : []));
  }
}

function userFrame(content: string, id = 'u-1') {
  return {
    type: 'message',
    message: {
      id,
      role: 'user',
      content,
      createdAt: '2026-11-13T10:00:00.000Z',
      status: 'complete',
    },
  };
}

// agente que devuelve exactamente los eventos que le digamos y guarda lo que recibio
function scriptedAgent(events: AgentEvent[]) {
  const requests: AgentRequest[] = [];
  const agent: AgentRunner = {
    async *respond(request) {
      requests.push(request);
      yield* events;
    },
  };
  return { agent, requests };
}

// agente que nunca manda texto: solo corre la funcion run (esperar o fallar) y termina.
// se arma el iterador a mano porque un generador sin yield no pasa el lint
function agentThat(run: (request: AgentRequest) => Promise<void>): AgentRunner {
  return {
    respond: (request) => ({
      [Symbol.asyncIterator]: () => ({
        next: async () => {
          await run(request);
          return { done: true as const, value: undefined };
        },
      }),
    }),
  };
}

function setup(
  agent: AgentRunner,
  options: { sessions?: SessionStore; logger?: Logger; throttle?: number; now?: () => number } = {},
) {
  const socket = new FakeSocket();
  const sessions = options.sessions ?? new InMemorySessionStore({ ttlMs: 60_000, maxMessages: 50 });
  const connection = new GatewayConnection(socket as unknown as WebSocket, {
    agent,
    sessions,
    logger: options.logger ?? silentLogger,
    streamThrottleMs: options.throttle ?? 0,
    now: options.now,
  });
  return { socket, sessions, connection };
}

describe('GatewayConnection', () => {
  it('manda la respuesta en snapshots acumulados con el mismo id y cierra con complete', async () => {
    const { agent } = scriptedAgent([
      { type: 'text', delta: 'Hola' },
      { type: 'text', delta: ' mundo' },
    ]);
    const { socket, connection } = setup(agent);
    socket.receive(userFrame('hola'));
    await connection.idle();

    expect(socket.messages.map((m) => [m.content, m.status])).toEqual([
      ['Hola', 'streaming'],
      ['Hola mundo', 'streaming'],
      ['Hola mundo', 'complete'],
    ]);
    expect(new Set(socket.messages.map((m) => m.id)).size).toBe(1);
    expect(socket.messages[0]).toMatchObject({ role: 'assistant' });
    expect(Number.isFinite(Date.parse(socket.messages[0]!.createdAt))).toBe(true);
  });

  it('respeta el throttle: no manda un snapshot por cada pedacito', async () => {
    const { agent } = scriptedAgent(
      ['a', 'b', 'c', 'd'].map((delta) => ({ type: 'text' as const, delta })),
    );
    // reloj falso que avanza 10 ms por pedacito (10, 20, 30, 40) con throttle de 25 ms:
    // sale 'a' (primero), se saltan 'b' y 'c' (menos de 25 ms) y sale 'abcd' (30 ms despues)
    let time = 0;
    const { socket, connection } = setup(agent, { throttle: 25, now: () => (time += 10) });
    socket.receive(userFrame('x'));
    await connection.idle();
    const streaming = socket.messages.filter((m) => m.status === 'streaming');
    expect(streaming.map((m) => m.content)).toEqual(['a', 'abcd']);
    expect(socket.messages.at(-1)).toMatchObject({ content: 'abcd', status: 'complete' });
  });

  it('pasa la conversacion al agente y guarda ambos mensajes en la sesion', async () => {
    const { agent, requests } = scriptedAgent([{ type: 'text', delta: 'ok' }]);
    const { socket, connection, sessions } = setup(agent);
    socket.receive(userFrame('primero', 'u-1'));
    socket.receive(userFrame('segundo', 'u-2'));
    await connection.idle();

    expect(requests).toHaveLength(2);
    expect(requests[0]!.history).toEqual([]);
    expect(requests[0]!.input.content).toBe('primero');
    expect(requests[0]!.sessionId).toBe(connection.sessionId);
    // el segundo turno ya ve el primer mensaje y la primera respuesta
    expect(requests[1]!.history.map((m) => [m.role, m.content])).toEqual([
      ['user', 'primero'],
      ['assistant', 'ok'],
    ]);
    expect((await sessions.history(connection.sessionId)).map((m) => m.content)).toEqual([
      'primero',
      'ok',
      'segundo',
      'ok',
    ]);
  });

  it('atiende los mensajes uno por uno aunque lleguen juntos', async () => {
    const order: string[] = [];
    const agent: AgentRunner = {
      async *respond({ input }) {
        order.push(`inicio ${input.content}`);
        await new Promise((r) => setTimeout(r, 5));
        yield { type: 'text', delta: input.content };
        order.push(`fin ${input.content}`);
      },
    };
    const { socket, connection } = setup(agent);
    socket.receive(userFrame('a', 'u-1'));
    socket.receive(userFrame('b', 'u-2'));
    await connection.idle();
    expect(order).toEqual(['inicio a', 'fin a', 'inicio b', 'fin b']);
  });

  it('reenvia acciones validas y descarta las que el agente invento mal', async () => {
    const warn = vi.fn();
    const logger = { ...silentLogger, warn };
    const { agent } = scriptedAgent([
      { type: 'action', action: { type: 'open_url', url: 'https://www.imdb.com/', label: 'IMDb' } },
      {
        type: 'action',
        action: { type: 'open_url', url: 'javascript:alert(1)', label: 'malo' },
      },
      { type: 'text', delta: 'listo' },
    ]);
    const { socket, connection } = setup(agent, { logger });
    socket.receive(userFrame('abrir'));
    await connection.idle();

    const actions = socket.sent.filter((f) => f.type === 'action');
    expect(actions).toEqual([
      { type: 'action', action: { type: 'open_url', url: 'https://www.imdb.com/', label: 'IMDb' } },
    ]);
    expect(warn).toHaveBeenCalledWith('accion_invalida', { sessionId: connection.sessionId });
  });

  it('si el agente no dice nada, igual cierra con un mensaje complete', async () => {
    const { agent } = scriptedAgent([{ type: 'text', delta: '   ' }]);
    const { socket, connection } = setup(agent);
    socket.receive(userFrame('x'));
    await connection.idle();
    expect(socket.messages.at(-1)).toMatchObject({ content: EMPTY_REPLY, status: 'complete' });
  });

  it('si el agente falla sin texto, manda disculpa complete y un error', async () => {
    const error = vi.fn();
    const agent = agentThat(async () => {
      throw new Error('groq caido');
    });
    const { socket, connection } = setup(agent, { logger: { ...silentLogger, error } });
    socket.receive(userFrame('x'));
    await connection.idle();

    expect(socket.messages.at(-1)).toMatchObject({ content: ERROR_REPLY, status: 'complete' });
    expect(socket.errors).toEqual(['El agente no pudo completar la respuesta.']);
    expect(error).toHaveBeenCalledWith('turno_fallido', {
      sessionId: connection.sessionId,
      error: expect.any(Error),
    });
  });

  it('si el agente falla a la mitad, conserva lo que alcanzo a decir', async () => {
    let calls = 0;
    const agent: AgentRunner = {
      async *respond() {
        calls += 1;
        yield { type: 'text', delta: 'Te recomiendo' };
        // solo el primer turno falla
        if (calls === 1) throw new Error('se corto');
      },
    };
    const { socket, connection } = setup(agent);
    socket.receive(userFrame('x', 'u-1'));
    await connection.idle();
    expect(socket.messages.at(-1)).toMatchObject({
      content: 'Te recomiendo' + INTERRUPTED_NOTE,
      status: 'complete',
    });
    expect(socket.errors).toHaveLength(1);

    // la cola sigue viva: el siguiente mensaje se atiende normal
    socket.receive(userFrame('y', 'u-2'));
    await connection.idle();
    expect(socket.messages.at(-1)).toMatchObject({ content: 'Te recomiendo', status: 'complete' });
    expect(socket.errors).toHaveLength(1);
  });

  it('si falla la sesion (ej. redis caido) responde con error sin romper la cola', async () => {
    const sessions: SessionStore = {
      history: () => Promise.reject(new Error('sin conexion')),
      append: () => Promise.resolve(),
      delete: () => Promise.resolve(),
    };
    const { agent } = scriptedAgent([{ type: 'text', delta: 'ok' }]);
    const { socket, connection } = setup(agent, { sessions });
    socket.receive(userFrame('x'));
    await connection.idle();
    expect(socket.messages.at(-1)).toMatchObject({ content: ERROR_REPLY, status: 'complete' });
  });

  it('frames invalidos o binarios reciben un error y no llegan al agente', async () => {
    const { agent, requests } = scriptedAgent([]);
    const { socket, connection } = setup(agent);
    socket.receive('{roto');
    socket.receive({ type: 'message', message: { role: 'system' } });
    socket.receive('hola', true);
    await connection.idle();
    expect(socket.errors).toEqual([
      'El mensaje no es JSON válido.',
      'Frame inválido.',
      'Solo se aceptan mensajes de texto.',
    ]);
    expect(requests).toHaveLength(0);
  });

  it('al desconectarse aborta al agente, no manda nada mas y borra la sesion', async () => {
    let seenSignal: AbortSignal | undefined;
    const agent: AgentRunner = {
      async *respond({ signal }) {
        seenSignal = signal;
        yield { type: 'text', delta: 'empiezo' };
        // espera hasta que lo aborten
        await new Promise((resolve) => signal.addEventListener('abort', resolve));
        yield { type: 'text', delta: 'esto ya no deberia salir' };
      },
    };
    const { socket, connection, sessions } = setup(agent);
    socket.receive(userFrame('x'));
    await vi.waitFor(() => expect(socket.messages).toHaveLength(1));

    socket.readyState = WebSocket.CLOSED;
    socket.emit('close');
    await connection.idle();
    expect(seenSignal?.aborted).toBe(true);
    expect(socket.messages).toHaveLength(1);
    expect(await sessions.history(connection.sessionId)).toEqual([]);

    // y si llega algo despues de cerrar, se ignora
    socket.receive(userFrame('tarde'));
    await connection.idle();
    expect(socket.messages).toHaveLength(1);
  });

  it('si se aborta mientras el agente falla, no manda la disculpa', async () => {
    const agent = agentThat(async ({ signal }) => {
      await new Promise((resolve) => signal.addEventListener('abort', resolve));
      throw new Error('abortado');
    });
    const { socket, connection } = setup(agent);
    socket.receive(userFrame('x'));
    await new Promise((r) => setTimeout(r, 0));
    socket.emit('close');
    await connection.idle();
    expect(socket.sent).toEqual([]);
  });

  it('si el agente termina justo cuando se desconectan, no manda el complete', async () => {
    let release: () => void = () => {};
    const agent = agentThat(() => new Promise<void>((resolve) => (release = resolve)));
    const { socket, connection } = setup(agent);
    socket.receive(userFrame('x'));
    await new Promise((r) => setTimeout(r, 0));
    socket.emit('close');
    release();
    await connection.idle();
    expect(socket.sent).toEqual([]);
  });

  it('avisa si no pudo borrar la sesion y registra errores del socket', async () => {
    const warn = vi.fn();
    const sessions: SessionStore = {
      history: async () => [],
      append: async () => {},
      delete: () => Promise.reject(new Error('redis caido')),
    };
    const { socket, connection } = setup(new EchoAgent({ delayMs: 0 }), {
      sessions,
      logger: { ...silentLogger, warn },
    });
    socket.emit('error', new Error('reset'));
    socket.emit('close');
    await vi.waitFor(() =>
      expect(warn).toHaveBeenCalledWith('sesion_no_borrada', {
        sessionId: connection.sessionId,
        error: expect.any(Error),
      }),
    );
    expect(warn).toHaveBeenCalledWith('socket_error', {
      sessionId: connection.sessionId,
      error: expect.any(Error),
    });
  });

  it('no intenta mandar nada si el socket ya se esta cerrando', async () => {
    const { socket, connection } = setup(new EchoAgent({ delayMs: 0 }));
    // ej. el usuario cerro la pestana justo cuando llegaba la respuesta
    socket.readyState = WebSocket.CLOSING;
    socket.receive('{roto');
    await connection.idle();
    expect(socket.sent).toEqual([]);
  });

  it('funciona de punta a punta con el EchoAgent', async () => {
    const { socket, connection } = setup(new EchoAgent({ delayMs: 0 }));
    socket.receive(userFrame('abrir imdb'));
    await connection.idle();
    const last: Message | undefined = socket.messages.at(-1);
    expect(last?.content).toContain('> abrir imdb');
    expect(socket.sent.some((f) => f.type === 'action')).toBe(true);
  });
});
