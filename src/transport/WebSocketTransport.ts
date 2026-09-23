import type { Message, WebSocketTransportOptions } from '../types';
import { BaseTransport, nonNegative } from './BaseTransport';

function isMessage(value: unknown): value is Message {
  if (!value || typeof value !== 'object') return false;
  const m = value as Record<string, unknown>;
  return (
    typeof m.id === 'string' &&
    m.id.length > 0 &&
    typeof m.role === 'string' &&
    ['user', 'assistant', 'system'].includes(m.role) &&
    typeof m.content === 'string' &&
    typeof m.createdAt === 'string' &&
    Number.isFinite(Date.parse(m.createdAt)) &&
    (m.status === 'streaming' || m.status === 'complete')
  );
}

export class WebSocketTransport extends BaseTransport {
  private socket?: WebSocket;
  private retryTimer?: ReturnType<typeof setTimeout>;
  private timeout?: ReturnType<typeof setTimeout>;
  private attempts = 0;
  private active = false;
  private readonly delay: number;
  private readonly maxAttempts: number;
  private readonly timeoutMs: number;

  constructor(
    private readonly endpoint: string,
    options: WebSocketTransportOptions = {},
  ) {
    super();
    const url = new URL(endpoint);
    if (!['ws:', 'wss:'].includes(url.protocol))
      throw new Error('El endpoint debe usar ws: o wss:.');
    this.delay = nonNegative(options.reconnectDelayMs ?? 1000, 'reconnectDelayMs');
    this.maxAttempts = nonNegative(options.maxReconnectAttempts ?? 3, 'maxReconnectAttempts');
    if (!Number.isInteger(this.maxAttempts))
      throw new Error('maxReconnectAttempts debe ser entero.');
    this.timeoutMs = nonNegative(options.connectTimeoutMs ?? 10000, 'connectTimeoutMs');
  }

  connect(): void {
    if (this.active) return;
    this.active = true;
    this.attempts = 0;
    this.open();
  }

  private cleanup(): void {
    clearTimeout(this.timeout);
    const socket = this.socket;
    this.socket = undefined;
    if (socket) {
      socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
      socket.close();
    }
  }

  private retry(): void {
    this.cleanup();
    if (!this.active) return;
    if (this.attempts >= this.maxAttempts) {
      this.active = false;
      this.setState('error');
      this.fail('Se agotaron los intentos de reconexión.');
      return;
    }
    const delay = Math.min(this.delay * 2 ** this.attempts, 30000);
    this.attempts += 1;
    this.setState('reconnecting');
    if (!this.active) return;
    this.retryTimer = setTimeout(() => this.open(), delay);
  }

  private open(): void {
    if (!this.active) return;
    this.setState(this.attempts ? 'reconnecting' : 'connecting');
    if (!this.active) return;
    let socket: WebSocket;
    try {
      socket = new WebSocket(this.endpoint);
    } catch {
      this.fail('No se pudo crear la conexión WebSocket.');
      this.retry();
      return;
    }
    this.socket = socket;
    this.timeout = setTimeout(() => {
      this.fail('Tiempo de conexión agotado.');
      this.retry();
    }, this.timeoutMs);
    socket.onopen = () => {
      clearTimeout(this.timeout);
      this.attempts = 0;
      this.setState('connected');
    };
    socket.onclose = () => this.retry();
    socket.onerror = () => {
      this.fail('Error de conexión WebSocket.');
      this.retry();
    };
    socket.onmessage = (event: MessageEvent<unknown>) => {
      let frame: { type?: unknown; message?: unknown; error?: unknown };
      try {
        if (typeof event.data !== 'string') throw new Error();
        const parsed: unknown = JSON.parse(event.data);
        if (!parsed || typeof parsed !== 'object') throw new Error();
        frame = parsed;
        if (frame.type === 'error' && typeof frame.error === 'string') {
          this.fail(frame.error);
          return;
        }
        if (frame.type !== 'message' || !isMessage(frame.message)) throw new Error();
      } catch {
        this.fail('Mensaje WebSocket inválido.');
        return;
      }
      this.emit({ type: 'message', message: frame.message as Message });
    };
  }

  disconnect(): void {
    this.active = false;
    clearTimeout(this.retryTimer);
    this.cleanup();
    this.setState('disconnected');
  }

  send(message: Message): void {
    this.assertConnected();
    try {
      this.socket!.send(JSON.stringify({ type: 'message', message }));
    } catch {
      const error = this.fail('No se pudo enviar el mensaje.');
      this.retry();
      throw error;
    }
  }
}
