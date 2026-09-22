export type ConnectionState =
  'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  /** Los eventos de streaming reemplazan el mensaje con el mismo id. */
  status: 'streaming' | 'complete';
}

export type TransportEvent =
  | { type: 'state'; state: ConnectionState }
  | { type: 'message'; message: Message }
  | { type: 'error'; error: Error };

export interface ChatTransport {
  readonly state: ConnectionState;
  connect(): void;
  disconnect(): void;
  send(message: Message): void;
  subscribe(listener: (event: TransportEvent) => void): () => void;
}

export interface MockTransportOptions {
  delayMs?: number;
  chunkIntervalMs?: number;
  chunkSize?: number;
  response?: string;
}

export interface WebSocketTransportOptions {
  reconnectDelayMs?: number;
  maxReconnectAttempts?: number;
  connectTimeoutMs?: number;
}

export type WidgetConfig =
  | { transport: 'mock'; mock?: MockTransportOptions }
  | { transport: 'websocket'; endpoint: string; websocket?: WebSocketTransportOptions };
