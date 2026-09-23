import type { ChatTransport, ConnectionState, Message, TransportEvent } from '../types';

export abstract class BaseTransport implements ChatTransport {
  private currentState: ConnectionState = 'disconnected';
  private listeners = new Set<(event: TransportEvent) => void>();

  get state(): ConnectionState {
    return this.currentState;
  }

  subscribe(listener: (event: TransportEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  protected emit(event: TransportEvent): void {
    for (const listener of [...this.listeners]) listener(event);
  }

  protected setState(state: ConnectionState): void {
    if (state === this.currentState) return;
    this.currentState = state;
    this.emit({ type: 'state', state });
  }

  protected fail(message: string): Error {
    const error = new Error(message);
    this.emit({ type: 'error', error });
    return error;
  }

  protected assertConnected(): void {
    if (this.state !== 'connected') throw this.fail('El transporte no está conectado.');
  }

  abstract connect(): void;
  abstract disconnect(): void;
  abstract send(message: Message): void;
}

export function nonNegative(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0)
    throw new Error(`${name} debe ser finito y no negativo.`);
  return value;
}
