// funcion que recibe algo (payload) cuando pasa un evento
export type Listener<T> = (payload: T) => void;

// Events es un mapa de nombre de evento -> tipo de dato que manda ese evento
// ej: { message: Message; error: Error }
export interface Emitter<Events extends Record<string, unknown>> {
  // registra un listener, devuelve una funcion para quitarlo despues
  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void;
  // quita un listener
  off<K extends keyof Events>(event: K, listener: Listener<Events[K]>): void;
  // avisa a todos los listeners de ese evento
  emit<K extends keyof Events>(event: K, payload: Events[K]): void;
  // borra todos los listeners
  clear(): void;
}

// emisor de eventos sencillo y tipado (lo usa el ChatStore y despues el SDK)
export function createEmitter<Events extends Record<string, unknown>>(): Emitter<Events> {
  // por cada evento guardamos un set de listeners (set para no repetir el mismo)
  let listeners: { [K in keyof Events]?: Set<Listener<Events[K]>> } = {};

  const off: Emitter<Events>['off'] = (event, listener) => {
    listeners[event]?.delete(listener);
  };

  return {
    on(event, listener) {
      // si el evento todavia no tiene set, se crea
      (listeners[event] ??= new Set()).add(listener);
      return () => off(event, listener);
    },
    off,
    emit(event, payload) {
      // se copia el set por si algun listener se quita a si mismo mientras recorremos
      for (const listener of [...(listeners[event] ?? [])]) {
        try {
          listener(payload);
        } catch (error) {
          // si el listener del cliente truena no queremos que se rompa todo el chat,
          // solo lo reportamos en consola y seguimos con los demas
          console.error(`[AGIChat] Error en un listener de "${String(event)}":`, error);
        }
      }
    },
    clear() {
      listeners = {};
    },
  };
}
