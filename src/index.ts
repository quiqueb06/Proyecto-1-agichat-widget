// Punto de entrada público del SDK.
// Cada módulo (transport, core, components, markdown) exporta aquí lo que sea parte de la API.
export { VERSION } from './version';

export { StatusBadge } from './components/StatusBadge';
export type { StatusBadgeProps } from './components/StatusBadge';

export { ChatLauncher } from './components/ChatLauncher';
export { ChatWindow } from './components/ChatWindow';
export { MessageList } from './components/MessageList';
export { MessageInput } from './components/MessageInput';
export { AGIChatView } from './components/AGIChatView';

export type {
  Message,
  ChatTransport,
  WidgetConfig,
  ConnectionState,
  TransportEvent,
  MockTransportOptions,
  WebSocketTransportOptions,
} from './types';

export {
  AGIChat,
  AGIChatWidget,
  ChatStore,
  createAGIChat,
  createChatStore,
  createLocalStorageHistory,
  DEFAULT_STYLES,
  DefaultChatView,
  useChat,
} from './core';

export { createTransport, MockWebSocketTransport, WebSocketTransport } from './transport';

export type {
  AGIChatEvents,
  AGIChatInitOptions,
  AGIChatInstance,
  AGIChatOptions,
  AGIChatWidgetProps,
  ChatHistory,
  ChatState,
  ChatStoreEvents,
  ChatStoreOptions,
  ChatViewProps,
  Listener,
  LocalStorageHistoryOptions,
  Theme,
  UseChatResult,
  WidgetUIOptions,
} from './core';