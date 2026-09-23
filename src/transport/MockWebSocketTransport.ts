import type { Message, MockTransportOptions } from '../types';
import { BaseTransport, nonNegative } from './BaseTransport';

const RESPONSE =
  '## Respuesta de AGIChat\n\nEste es un **mensaje simulado** con streaming.\n\n- Conexión disponible\n- Soporte para *Markdown*\n\n```ts\nconst ready = true;\n```';

export class MockWebSocketTransport extends BaseTransport {
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private readonly delay: number;
  private readonly interval: number;
  private readonly size: number;
  private readonly response: string;

  constructor(options: MockTransportOptions = {}) {
    super();
    this.delay = nonNegative(options.delayMs ?? 300, 'delayMs');
    this.interval = nonNegative(options.chunkIntervalMs ?? 40, 'chunkIntervalMs');
    this.size = options.chunkSize ?? 12;
    if (!Number.isInteger(this.size) || this.size < 1)
      throw new Error('chunkSize debe ser un entero positivo.');
    this.response = options.response ?? RESPONSE;
  }

  private schedule(callback: () => void, delay: number): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      callback();
    }, delay);
    this.timers.add(timer);
  }

  connect(): void {
    if (['connected', 'connecting'].includes(this.state)) return;
    this.setState('connecting');
    if (this.state !== 'connecting') return;
    this.schedule(() => this.setState('connected'), this.delay);
  }

  disconnect(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
    this.setState('disconnected');
  }

  send(_message: Message): void {
    this.assertConnected();
    const response: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
      status: 'streaming',
    };
    let offset = 0;
    const next = () => {
      offset += this.size;
      const complete = offset >= this.response.length;
      this.emit({
        type: 'message',
        message: {
          ...response,
          content: this.response.slice(0, offset),
          status: complete ? 'complete' : 'streaming',
        },
      });
      if (!complete && this.state === 'connected') this.schedule(next, this.interval);
    };
    this.schedule(next, this.delay);
  }
}
