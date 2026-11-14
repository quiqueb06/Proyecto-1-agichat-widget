import { describe, expect, it } from 'vitest';
import { RateLimiter } from './RateLimiter.js';

// limitador con un reloj que controlamos nosotros
function setup(messages: number, windowMs: number) {
  let time = 0;
  const limiter = new RateLimiter({ messages, windowMs, now: () => time });
  return { limiter, advance: (ms: number) => (time += ms) };
}

describe('RateLimiter', () => {
  it('deja pasar una rafaga de hasta `messages` y luego frena', () => {
    const { limiter } = setup(3, 60_000);
    expect([limiter.tryTake(), limiter.tryTake(), limiter.tryTake()]).toEqual([true, true, true]);
    expect(limiter.tryTake()).toBe(false);
  });

  it('recarga las fichas poco a poco con el tiempo', () => {
    // 3 mensajes por minuto = una ficha cada 20 s
    const { limiter, advance } = setup(3, 60_000);
    limiter.tryTake();
    limiter.tryTake();
    limiter.tryTake();
    advance(19_999);
    expect(limiter.tryTake()).toBe(false);
    advance(1);
    expect(limiter.tryTake()).toBe(true);
    expect(limiter.tryTake()).toBe(false);
  });

  it('no acumula mas fichas que el maximo aunque pase mucho tiempo', () => {
    const { limiter, advance } = setup(2, 1000);
    advance(1_000_000);
    expect([limiter.tryTake(), limiter.tryTake(), limiter.tryTake()]).toEqual([true, true, false]);
  });

  it('usa el reloj real por defecto', () => {
    const limiter = new RateLimiter({ messages: 1, windowMs: 60_000 });
    expect(limiter.tryTake()).toBe(true);
    expect(limiter.tryTake()).toBe(false);
  });
});
