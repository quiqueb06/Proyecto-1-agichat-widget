import { createTransport, MockWebSocketTransport, WebSocketTransport } from './index';
import type { Message, TransportEvent, WidgetConfig } from '../types';

const message: Message = {
  id: 'user-1',
  role: 'user',
  content: 'Hola',
  createdAt: '2026-09-22T00:00:00.000Z',
  status: 'complete',
};

class SocketStub {
  static instances: SocketStub[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  send = vi.fn();
  close = vi.fn();
  constructor(public url: string) {
    SocketStub.instances.push(this);
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  SocketStub.instances = [];
  vi.stubGlobal('WebSocket', SocketStub);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function real(options = {}) {
  const transport = new WebSocketTransport('wss://example.test/chat', options);
  const events: TransportEvent[] = [];
  transport.subscribe((event) => events.push(event));
  transport.connect();
  return { transport, events, socket: SocketStub.instances.at(-1)! };
}

describe('MockWebSocketTransport', () => {
  it('conecta con retraso y entrega Markdown acumulado con un id estable', () => {
    const transport = new MockWebSocketTransport({
      delayMs: 10,
      chunkIntervalMs: 5,
      chunkSize: 3,
      response: '**Hola**',
    });
    const events: TransportEvent[] = [];
    transport.subscribe((event) => events.push(event));
    transport.connect();
    transport.connect();
    expect(transport.state).toBe('connecting');
    vi.advanceTimersByTime(10);
    expect(transport.state).toBe('connected');
    transport.send(message);
    vi.advanceTimersByTime(9);
    expect(events.filter((e) => e.type === 'message')).toHaveLength(0);
    vi.runAllTimers();
    const messages = events.filter((e) => e.type === 'message').map((e) => e.message);
    expect(messages.map((m) => m.content)).toEqual(['**H', '**Hola', '**Hola**']);
    expect(new Set(messages.map((m) => m.id)).size).toBe(1);
    expect(messages[0]?.status).toBe('streaming');
    expect(messages[2]?.status).toBe('complete');
    transport.disconnect();
  });

  it('cancela conexión y respuestas pendientes, permite reconectar y desuscribir', () => {
    const transport = new MockWebSocketTransport();
    const listener = vi.fn();
    const unsubscribe = transport.subscribe(listener);
    expect(() => transport.send(message)).toThrow('no está conectado');
    transport.connect();
    transport.disconnect();
    vi.runAllTimers();
    expect(transport.state).toBe('disconnected');
    transport.connect();
    vi.runAllTimers();
    transport.send(message);
    transport.send(message);
    transport.disconnect();
    const count = listener.mock.calls.length;
    vi.runAllTimers();
    expect(listener).toHaveBeenCalledTimes(count);
    unsubscribe();
    transport.connect();
    vi.runAllTimers();
    expect(listener).toHaveBeenCalledTimes(count);
    transport.disconnect();
  });

  it('incluye una respuesta Markdown por defecto y admite respuesta vacía', () => {
    for (const options of [{}, { response: '' }]) {
      const transport = new MockWebSocketTransport(options);
      const listener = vi.fn();
      transport.subscribe(listener);
      transport.connect();
      vi.runAllTimers();
      transport.send(message);
      vi.runAllTimers();
      const last = listener.mock.lastCall?.[0] as { message: Message };
      expect(last.message.status).toBe('complete');
      expect(last.message.content).toEqual(
        'response' in options ? '' : expect.stringContaining('**'),
      );
      transport.disconnect();
    }
  });

  it('valida opciones', () => {
    expect(() => new MockWebSocketTransport({ chunkSize: 0 })).toThrow();
    expect(() => new MockWebSocketTransport({ delayMs: -1 })).toThrow();
    expect(() => new MockWebSocketTransport({ chunkIntervalMs: Infinity })).toThrow();
  });
});

describe('WebSocketTransport', () => {
  it('envía JSON, recibe snapshots y no abre conexiones duplicadas', () => {
    const { transport, events, socket } = real();
    expect(transport.state).toBe('connecting');
    transport.connect();
    expect(SocketStub.instances).toHaveLength(1);
    socket.onopen!();
    expect(transport.state).toBe('connected');
    transport.send(message);
    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'message', message }));
    for (const status of ['streaming', 'complete'])
      socket.onmessage!({
        data: JSON.stringify({
          type: 'message',
          message: { ...message, role: 'assistant', status },
        }),
      });
    expect(events.filter((e) => e.type === 'message')).toHaveLength(2);
    transport.disconnect();
    expect(socket.close).toHaveBeenCalled();
    expect(transport.state).toBe('disconnected');
  });

  it('reporta frames inválidos y errores del servidor sin cerrar la conexión', () => {
    const { transport, events, socket } = real();
    socket.onopen!();
    for (const data of [
      '{',
      'null',
      '42',
      '{}',
      new ArrayBuffer(1),
      JSON.stringify({ type: 'message', message: null }),
      JSON.stringify({ type: 'message', message: { ...message, status: 'bad' } }),
      JSON.stringify({ type: 'error', error: 'Servidor ocupado' }),
    ])
      socket.onmessage!({ data });
    expect(events.filter((e) => e.type === 'error')).toHaveLength(8);
    expect(transport.state).toBe('connected');
    transport.disconnect();
  });

  it('reintenta con espera creciente y termina al alcanzar el límite', () => {
    const { transport, socket } = real({ reconnectDelayMs: 10, maxReconnectAttempts: 2 });
    socket.onclose!();
    expect(transport.state).toBe('reconnecting');
    vi.advanceTimersByTime(10);
    expect(SocketStub.instances).toHaveLength(2);
    SocketStub.instances[1]!.onerror!();
    vi.advanceTimersByTime(19);
    expect(SocketStub.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(SocketStub.instances).toHaveLength(3);
    SocketStub.instances[2]!.onclose!();
    expect(transport.state).toBe('error');
    vi.runAllTimers();
    expect(SocketStub.instances).toHaveLength(3);
    transport.connect();
    expect(SocketStub.instances).toHaveLength(4);
    transport.disconnect();
  });

  it('restablece intentos al conectar y cancela la reconexión al desconectar', () => {
    const { transport, socket } = real({ reconnectDelayMs: 10, maxReconnectAttempts: 1 });
    socket.onclose!();
    vi.advanceTimersByTime(10);
    const next = SocketStub.instances[1]!;
    next.onopen!();
    next.onclose!();
    expect(transport.state).toBe('reconnecting');
    transport.disconnect();
    vi.runAllTimers();
    expect(SocketStub.instances).toHaveLength(2);
    expect(socket.onmessage).toBeNull();
  });

  it('maneja timeout, errores de constructor y envío', () => {
    const { transport, socket } = real({ maxReconnectAttempts: 0, connectTimeoutMs: 5 });
    vi.advanceTimersByTime(5);
    expect(transport.state).toBe('error');
    expect(socket.close).toHaveBeenCalled();
    const second = real({ maxReconnectAttempts: 0 });
    second.socket.onopen!();
    second.socket.send.mockImplementation(() => {
      throw new Error('send');
    });
    expect(() => second.transport.send(message)).toThrow('No se pudo enviar');
    expect(second.transport.state).toBe('error');
    vi.stubGlobal(
      'WebSocket',
      class {
        constructor() {
          throw new Error('constructor');
        }
      },
    );
    const third = new WebSocketTransport('ws://localhost', { maxReconnectAttempts: 0 });
    third.connect();
    expect(third.state).toBe('error');
    third.disconnect();
    third.disconnect();
  });

  it('valida endpoint, opciones y envío sin conexión', () => {
    expect(() => new WebSocketTransport('https://example.test')).toThrow();
    expect(() => new WebSocketTransport('invalid')).toThrow();
    expect(() => new WebSocketTransport('ws://localhost', { maxReconnectAttempts: 0.5 })).toThrow();
    expect(() => new WebSocketTransport('ws://localhost', { reconnectDelayMs: -1 })).toThrow();
    expect(() => new WebSocketTransport('ws://localhost').send(message)).toThrow();
  });
});

it('elige el transporte explícito en la factory', () => {
  expect(createTransport({ transport: 'mock' })).toBeInstanceOf(MockWebSocketTransport);
  expect(createTransport({ transport: 'websocket', endpoint: 'ws://localhost' })).toBeInstanceOf(
    WebSocketTransport,
  );
  expect(() => createTransport({ transport: 'unknown' } as unknown as WidgetConfig)).toThrow();
});

it('permite desconectar desde los listeners de conexión y reconexión', () => {
  for (const transport of [
    new MockWebSocketTransport(),
    new WebSocketTransport('ws://localhost'),
  ]) {
    transport.subscribe((event) => {
      if (event.type === 'state' && event.state === 'connecting') transport.disconnect();
    });
    transport.connect();
    vi.runAllTimers();
    expect(transport.state).toBe('disconnected');
  }
  expect(SocketStub.instances).toHaveLength(0);
  const { transport, socket } = real();
  transport.subscribe((event) => {
    if (event.type === 'state' && event.state === 'reconnecting') transport.disconnect();
  });
  socket.onclose!();
  vi.runAllTimers();
  expect(SocketStub.instances).toHaveLength(1);
  expect(transport.state).toBe('disconnected');
});
