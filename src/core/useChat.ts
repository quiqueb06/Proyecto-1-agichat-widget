import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { createTransport } from '../transport';
import type { Message, WidgetConfig } from '../types';
import { ChatStore } from './ChatStore';
import type { ChatState } from './ChatStore';

// lo que devuelve el hook: el estado del chat + las acciones
export interface UseChatResult extends ChatState {
  send: (text: string) => Message | null;
  retry: (id: string) => boolean;
  clear: () => void;
}

// atajo para crear un store a partir de la config (mock o websocket real)
export function createChatStore(config: WidgetConfig): ChatStore {
  return new ChatStore(createTransport(config));
}

// hook para usar un ChatStore desde react.
// conecta al montar y desconecta al desmontar.
// ojo: no hace destroy, porque en StrictMode react monta, desmonta y vuelve a montar,
// y el store tiene que seguir sirviendo. el destroy lo hace quien creo el store
export function useChat(store: ChatStore): UseChatResult {
  // react se suscribe al store y vuelve a renderizar cuando cambia el estado
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  useEffect(() => {
    store.connect();
    return () => store.disconnect();
  }, [store]);

  // las acciones solo cambian si cambia el store (asi no se re-renderizan hijos de gratis)
  const actions = useMemo(
    () => ({
      send: (text: string) => store.send(text),
      retry: (id: string) => store.retry(id),
      clear: () => store.clear(),
    }),
    [store],
  );

  return { ...state, ...actions };
}
