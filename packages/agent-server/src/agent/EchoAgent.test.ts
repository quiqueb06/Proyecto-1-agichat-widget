import { describe, expect, it } from 'vitest';
import type { Message } from '../protocol/message.js';
import { EchoAgent } from './EchoAgent.js';
import type { AgentEvent } from './types.js';

function userMessage(content: string): Message {
  return {
    id: 'u-1',
    role: 'user',
    content,
    createdAt: '2026-11-13T10:00:00.000Z',
    status: 'complete',
  };
}

// junta todos los eventos que devuelve el agente
async function collect(iterable: AsyncIterable<AgentEvent>) {
  const events: AgentEvent[] = [];
  for await (const event of iterable) events.push(event);
  return events;
}

function textOf(events: AgentEvent[]) {
  return events.map((e) => (e.type === 'text' ? e.delta : '')).join('');
}

describe('EchoAgent', () => {
  it('repite el mensaje en pedacitos del tamano pedido', async () => {
    const agent = new EchoAgent({ chunkSize: 5, delayMs: 0 });
    const events = await collect(
      agent.respond({
        sessionId: 's',
        history: [],
        input: userMessage('hola'),
        signal: new AbortController().signal,
      }),
    );
    const texts = events.filter((e) => e.type === 'text');
    expect(texts.length).toBeGreaterThan(1);
    expect(texts.every((e) => e.type === 'text' && e.delta.length <= 5)).toBe(true);
    expect(textOf(events)).toContain('> hola');
    expect(textOf(events)).toContain('mensaje 1');
    expect(events.some((e) => e.type === 'action')).toBe(false);
  });

  it('cuenta los mensajes anteriores de la conversacion', async () => {
    const events = await collect(
      new EchoAgent({ delayMs: 0 }).respond({
        sessionId: 's',
        history: [userMessage('a'), userMessage('b')],
        input: userMessage('c'),
        signal: new AbortController().signal,
      }),
    );
    expect(textOf(events)).toContain('mensaje 3');
  });

  it('manda la accion de abrir imdb si se lo piden', async () => {
    const events = await collect(
      new EchoAgent({ delayMs: 0 }).respond({
        sessionId: 's',
        history: [],
        input: userMessage('Abrir IMDb por favor'),
        signal: new AbortController().signal,
      }),
    );
    expect(events.at(-1)).toEqual({
      type: 'action',
      action: { type: 'open_url', url: 'https://www.imdb.com/', label: 'IMDb' },
    });
  });

  it('deja de mandar cosas en cuanto se aborta, aunque este esperando', async () => {
    const controller = new AbortController();
    const agent = new EchoAgent({ chunkSize: 1, delayMs: 10_000 });
    const iterator = agent
      .respond({
        sessionId: 's',
        history: [],
        input: userMessage('abrir'),
        signal: controller.signal,
      })
      [Symbol.asyncIterator]();
    expect((await iterator.next()).done).toBe(false);
    // el agente esta esperando 10 s; abortar lo tiene que despertar de inmediato
    const pending = iterator.next();
    controller.abort();
    expect(await pending).toEqual({ done: true, value: undefined });
  });

  it('no manda nada si ya venia abortado y corrige opciones invalidas', async () => {
    const controller = new AbortController();
    controller.abort();
    const events = await collect(
      new EchoAgent({ chunkSize: 0, delayMs: -5 }).respond({
        sessionId: 's',
        history: [],
        input: userMessage('abrir'),
        signal: controller.signal,
      }),
    );
    expect(events).toEqual([]);
  });

  it('usa valores por defecto razonables', async () => {
    const events = await collect(
      new EchoAgent().respond({
        sessionId: 's',
        history: [],
        input: userMessage('x'),
        signal: AbortSignal.timeout(5_000),
      }),
    );
    expect(textOf(events)).toContain('> x');
  });
});
