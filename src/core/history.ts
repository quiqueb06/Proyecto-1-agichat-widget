import { isMessage } from '../transport/guards';
import type { Message } from '../types';

// donde se guarda el historial. es una interfaz para poder cambiar localStorage
// por otra cosa despues (ej. el backend en la fase 2) sin tocar el ChatStore
export interface ChatHistory {
  load(): Message[];
  save(messages: readonly Message[]): void;
  clear(): void;
}

export interface LocalStorageHistoryOptions {
  // cuantos mensajes se guardan como maximo (los mas nuevos)
  limit?: number;
}

export const DEFAULT_HISTORY_KEY = 'agichat:history';

// devuelve localStorage o null si no se puede usar.
// en ssr no hay window, y algunos navegadores tiran error solo por leer
// window.localStorage (modo privado, cookies bloqueadas, iframes)
function getStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

// historial guardado en localStorage. si algo falla nunca truena,
// solo se comporta como si no hubiera historial
export function createLocalStorageHistory(
  key: string = DEFAULT_HISTORY_KEY,
  { limit = 50 }: LocalStorageHistoryOptions = {},
): ChatHistory {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('limit debe ser un entero positivo.');

  // solo se guardan mensajes terminados, y solo los ultimos `limit`
  const keep = (messages: readonly unknown[]) =>
    messages.filter((m): m is Message => isMessage(m) && m.status === 'complete').slice(-limit);

  return {
    load() {
      try {
        const parsed: unknown = JSON.parse(getStorage()?.getItem(key) ?? '[]');
        // si alguien edito el storage a mano o viene de otra version, se filtra lo invalido
        return Array.isArray(parsed) ? keep(parsed) : [];
      } catch {
        return [];
      }
    },
    save(messages) {
      try {
        getStorage()?.setItem(key, JSON.stringify(keep(messages)));
      } catch {
        // storage lleno o bloqueado: no pasa nada, solo no se guarda
      }
    },
    clear() {
      try {
        getStorage()?.removeItem(key);
      } catch {
        // igual que arriba
      }
    },
  };
}
