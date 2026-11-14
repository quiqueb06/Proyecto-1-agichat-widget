export interface RateLimiterOptions {
  // cuantos mensajes se permiten por ventana
  messages: number;
  // tamano de la ventana en ms
  windowMs: number;
  // reloj inyectable para probar sin esperar de verdad
  now?: () => number;
}

// limitador tipo "token bucket" (cubeta de fichas).
// la cubeta empieza llena con `messages` fichas; cada mensaje gasta una y se van
// recargando poco a poco (messages fichas cada windowMs). asi se permite una rafaga
// corta, pero no mas de ~messages por ventana en promedio.
// sirve para que un usuario (o un bot) no se acabe la cuota diaria de groq
export class RateLimiter {
  private tokens: number;
  private last: number;
  private readonly capacity: number;
  private readonly refillPerMs: number;
  private readonly now: () => number;

  constructor({ messages, windowMs, now = Date.now }: RateLimiterOptions) {
    this.capacity = messages;
    this.refillPerMs = messages / windowMs;
    this.now = now;
    this.tokens = messages;
    this.last = now();
  }

  // intenta gastar una ficha. true = puede pasar, false = va muy rapido
  tryTake(): boolean {
    const now = this.now();
    // recarga lo que corresponde por el tiempo que paso, sin pasarse del maximo
    this.tokens = Math.min(this.capacity, this.tokens + (now - this.last) * this.refillPerMs);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
