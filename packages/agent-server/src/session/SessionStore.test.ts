import { describe, expect, it } from 'vitest';
import type { Message } from '../protocol/message.js';
import { InMemorySessionStore } from './SessionStore.js';

function msg(id: string): Message {
  return {
    id,
    role: 'user',
    content: id,
    createdAt: '2026-11-13T10:00:00.000Z',
    status: 'complete',
  };
}

// store con un reloj que controlamos nosotros
function setup(maxMessages = 10, ttlMs = 1000) {
  let time = 0;
  const store = new InMemorySessionStore({ ttlMs, maxMessages, now: () => time });
  return { store, advance: (ms: number) => (time += ms) };
}

describe('InMemorySessionStore', () => {
  it('guarda y devuelve la conversacion de cada sesion por separado', async () => {
    const { store } = setup();
    await store.append('a', msg('1'), msg('2'));
    await store.append('b', msg('x'));
    expect((await store.history('a')).map((m) => m.id)).toEqual(['1', '2']);
    expect((await store.history('b')).map((m) => m.id)).toEqual(['x']);
    expect(await store.history('no-existe')).toEqual([]);
    expect(store.size).toBe(2);
  });

  it('devuelve una copia: modificarla no cambia lo guardado', async () => {
    const { store } = setup();
    await store.append('a', msg('1'));
    const copy = await store.history('a');
    copy.push(msg('intruso'));
    expect(await store.history('a')).toHaveLength(1);
  });

  it('se queda solo con los ultimos mensajes', async () => {
    const { store } = setup(3);
    await store.append('a', msg('1'), msg('2'));
    await store.append('a', msg('3'), msg('4'));
    expect((await store.history('a')).map((m) => m.id)).toEqual(['2', '3', '4']);
  });

  it('las sesiones vencen sin actividad y la actividad las renueva', async () => {
    const { store, advance } = setup(10, 1000);
    await store.append('a', msg('1'));
    advance(900);
    await store.append('a', msg('2'));
    advance(900);
    // la actividad a los 900 ms renovo el ttl, entonces sigue viva
    expect(await store.history('a')).toHaveLength(2);
    advance(200);
    expect(await store.history('a')).toEqual([]);
    expect(store.size).toBe(0);
  });

  it('agregar a una sesion vencida empieza de cero', async () => {
    const { store, advance } = setup(10, 1000);
    await store.append('a', msg('viejo'));
    advance(1000);
    await store.append('a', msg('nuevo'));
    expect((await store.history('a')).map((m) => m.id)).toEqual(['nuevo']);
  });

  it('sweep borra solo las vencidas y delete borra una sesion', async () => {
    const { store, advance } = setup(10, 1000);
    await store.append('vieja', msg('1'));
    advance(600);
    await store.append('nueva', msg('2'));
    advance(500);
    expect(store.sweep()).toBe(1);
    expect(store.size).toBe(1);
    await store.delete('nueva');
    expect(store.size).toBe(0);
    expect(store.sweep()).toBe(0);
  });

  it('usa el reloj real por defecto', async () => {
    const store = new InMemorySessionStore({ ttlMs: 60_000, maxMessages: 5 });
    await store.append('a', msg('1'));
    expect(await store.history('a')).toHaveLength(1);
  });
});
