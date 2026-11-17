import { describe, expect, it } from 'vitest';
import { FakeLLM } from './FakeLLM.js';

async function collectAsync<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];

  for await (const item of iterable) {
    items.push(item);
  }

  return items;
}

async function collect(fake: FakeLLM) {
  return collectAsync(
  fake.stream({
    messages: [
      {
        role: 'user',
        content: 'Hola',
      },
    ],
  }),
);
}

describe('FakeLLM', () => {
  it('devuelve una respuesta de texto', async () => {
    const fake = new FakeLLM([
      {
        type: 'text',
        text: 'Hola, soy AGIChat',
      },
    ]);

    const events = await collect(fake);

    expect(events).toEqual([
      {
        type: 'text',
        delta: 'Hola, soy AGIChat',
      },
    ]);
  });

  it('puede simular streaming en varios chunks', async () => {
    const fake = new FakeLLM([
      {
        type: 'text',
        text: 'abcdef',
        chunkSize: 2,
      },
    ]);

    const events = await collect(fake);

    expect(events).toEqual([
      { type: 'text', delta: 'ab' },
      { type: 'text', delta: 'cd' },
      { type: 'text', delta: 'ef' },
    ]);
  });

  it('puede simular una llamada a herramienta', async () => {
    const fake = new FakeLLM([
      {
        type: 'tool_call',
        id: 'call-1',
        name: 'search_movie',
        arguments: {
          query: 'Dune',
        },
      },
    ]);

    const events = await collect(fake);

    expect(events).toEqual([
      {
        type: 'tool_call',
        call: {
          id: 'call-1',
          name: 'search_movie',
          arguments: {
            query: 'Dune',
          },
        },
      },
    ]);
  });

  it('guarda las solicitudes recibidas', async () => {
    const fake = new FakeLLM([
      {
        type: 'text',
        text: 'ok',
      },
    ]);

    await collect(fake);

    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0]?.messages[0]?.content).toBe('Hola');
  });

  it('falla claramente cuando no quedan respuestas programadas', async () => {
    const fake = new FakeLLM();

    await expect(async () => {
      await collect(fake);
    }).rejects.toThrow(
      'FakeLLM no tiene más respuestas programadas.',
    );
  });

  it('no responde si la solicitud ya fue abortada', async () => {
    const controller = new AbortController();
    controller.abort();

    const fake = new FakeLLM([
      {
        type: 'text',
        text: 'esto no debería salir',
      },
    ]);

    const events = await collectAsync(
  fake.stream({
    messages: [],
    signal: controller.signal,
  }),
);

    expect(events).toEqual([]);
    expect(fake.requests).toHaveLength(0);
  });
});
