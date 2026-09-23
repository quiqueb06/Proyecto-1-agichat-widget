// todo lo publico de src/core sale por aqui
export { ChatStore } from './ChatStore';
export type { ChatState, ChatStoreEvents, ChatStoreOptions } from './ChatStore';
export { createEmitter } from './emitter';
export type { Emitter, Listener } from './emitter';
export { createChatStore, useChat } from './useChat';
export type { UseChatResult } from './useChat';
export { createLocalStorageHistory, DEFAULT_HISTORY_KEY } from './history';
export type { ChatHistory, LocalStorageHistoryOptions } from './history';
export { AGIChatWidget } from './AGIChatWidget';
export type { AGIChatWidgetProps } from './AGIChatWidget';
export { DefaultChatView } from './DefaultChatView';
export { DEFAULT_STYLES } from './defaultStyles';
export { createStoreFromOptions } from './options';
export type { AGIChatOptions, ChatViewProps, Theme, WidgetUIOptions } from './types';
