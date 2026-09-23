import type { ChatStore } from './ChatStore';
import { createLocalStorageHistory, DEFAULT_HISTORY_KEY } from './history';
import type { AGIChatOptions } from './types';
import { createChatStore } from './useChat';

export const DEFAULT_TITLE = 'AGIChat';
export const DEFAULT_PLACEHOLDER = 'Escribe tu mensaje…';

// crea el store a partir de las opciones del widget (transporte + historial)
export function createStoreFromOptions(options: AGIChatOptions): ChatStore {
  const { persistHistory } = options;
  // persistHistory puede ser true (llave por defecto) o un string (llave propia)
  const key = typeof persistHistory === 'string' ? persistHistory : DEFAULT_HISTORY_KEY;
  return createChatStore(options, {
    history: persistHistory ? createLocalStorageHistory(key) : undefined,
  });
}
