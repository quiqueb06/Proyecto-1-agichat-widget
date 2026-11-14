import type { Message } from '../protocol/message.js';

// donde se guarda la conversacion de cada sesion.
// es una interfaz (y async) a proposito: hoy usamos memoria, pero para escalar a varias
// instancias del servidor se puede cambiar por redis u otra base sin tocar el gateway
export interface SessionStore {
  // mensajes guardados de la sesion (vacio si no existe o ya expiro)
  history(sessionId: string): Promise<Message[]>;
  // agrega mensajes al final de la sesion
  append(sessionId: string, ...messages: Message[]): Promise<void>;
  // borra la sesion (ej. cuando el usuario se desconecta)
  delete(sessionId: string): Promise<void>;
}

export interface InMemorySessionStoreOptions {
  // milisegundos sin actividad antes de que la sesion expire
  ttlMs: number;
  // cuantos mensajes se guardan como maximo (se quedan los mas nuevos)
  maxMessages: number;
  // reloj inyectable para poder probar la expiracion sin esperar de verdad
  now?: () => number;
}

interface Entry {
  messages: Message[];
  expiresAt: number;
}

// sesiones en la memoria del proceso. sirve para una sola instancia del servidor
export class InMemorySessionStore implements SessionStore {
  private readonly entries = new Map<string, Entry>();
  private readonly ttlMs: number;
  private readonly maxMessages: number;
  private readonly now: () => number;

  constructor({ ttlMs, maxMessages, now = Date.now }: InMemorySessionStoreOptions) {
    this.ttlMs = ttlMs;
    this.maxMessages = maxMessages;
    this.now = now;
  }

  // cuantas sesiones vivas hay (para /health y para tests)
  get size(): number {
    return this.entries.size;
  }

  async history(sessionId: string): Promise<Message[]> {
    const entry = this.alive(sessionId);
    // copia, para que nadie modifique el historial guardado desde afuera
    return entry ? [...entry.messages] : [];
  }

  async append(sessionId: string, ...messages: Message[]): Promise<void> {
    const previous = this.alive(sessionId)?.messages ?? [];
    this.entries.set(sessionId, {
      // nos quedamos con los ultimos maxMessages para no crecer sin limite
      messages: [...previous, ...messages].slice(-this.maxMessages),
      expiresAt: this.now() + this.ttlMs,
    });
  }

  async delete(sessionId: string): Promise<void> {
    this.entries.delete(sessionId);
  }

  // borra todas las sesiones vencidas. el servidor lo llama cada cierto tiempo
  sweep(): number {
    const now = this.now();
    let removed = 0;
    for (const [id, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  // devuelve la sesion si existe y no ha vencido (si vencio la borra de una vez)
  private alive(sessionId: string): Entry | undefined {
    const entry = this.entries.get(sessionId);
    if (entry && entry.expiresAt <= this.now()) {
      this.entries.delete(sessionId);
      return undefined;
    }
    return entry;
  }
}
