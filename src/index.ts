// Punto de entrada público del SDK.
// Cada módulo (transport, core, components, markdown) exporta aquí lo que sea parte de la API.
export { VERSION } from './version';
export { StatusBadge } from './components/StatusBadge';
export type { StatusBadgeProps } from './components/StatusBadge';
export type {
  Message,
  ChatTransport,
  WidgetConfig,
  ConnectionState,
  TransportEvent,
  MockTransportOptions,
  WebSocketTransportOptions,
} from './types';
export { createTransport, MockWebSocketTransport, WebSocketTransport } from './transport';
export { ChatStore, createChatStore, useChat } from './core';
export type { ChatState, ChatStoreEvents, Listener, UseChatResult } from './core';
