import type { ChatTransport, WidgetConfig } from '../types';
import { MockWebSocketTransport } from './MockWebSocketTransport';
import { WebSocketTransport } from './WebSocketTransport';

export { MockWebSocketTransport, WebSocketTransport };

export function createTransport(config: WidgetConfig): ChatTransport {
  switch (config.transport) {
    case 'mock':
      return new MockWebSocketTransport(config.mock);
    case 'websocket':
      return new WebSocketTransport(config.endpoint, config.websocket);
    default:
      throw new Error('Tipo de transporte no soportado.');
  }
}
