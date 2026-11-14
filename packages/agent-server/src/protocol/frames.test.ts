import { describe, expect, it } from 'vitest';
import { agentActionSchema, parseClientFrame, serializeFrame } from './frames.js';
import { messageSchema } from './message.js';

// mensaje del usuario valido, igual al que manda la widget
const userMessage = {
  id: 'u-1',
  role: 'user',
  content: 'Recomiéndame una película',
  createdAt: '2026-11-13T10:00:00.000Z',
  status: 'complete',
};

const frame = (message: unknown) => JSON.stringify({ type: 'message', message });

describe('messageSchema', () => {
  it('acepta los mismos mensajes que la widget', () => {
    expect(messageSchema.safeParse(userMessage).success).toBe(true);
    expect(
      messageSchema.safeParse({ ...userMessage, role: 'assistant', status: 'streaming' }).success,
    ).toBe(true);
  });

  it('rechaza mensajes mal formados', () => {
    for (const bad of [
      null,
      { ...userMessage, id: '' },
      { ...userMessage, role: 'bot' },
      { ...userMessage, content: 5 },
      { ...userMessage, createdAt: 'ayer' },
      { ...userMessage, status: 'error' },
    ])
      expect(messageSchema.safeParse(bad).success).toBe(false);
  });
});

describe('parseClientFrame', () => {
  it('acepta un mensaje del usuario', () => {
    const result = parseClientFrame(frame(userMessage));
    expect(result).toEqual({ ok: true, frame: { type: 'message', message: userMessage } });
  });

  it('rechaza texto que no es json sin lanzar', () => {
    expect(parseClientFrame('{no es json')).toEqual({
      ok: false,
      error: 'El mensaje no es JSON válido.',
    });
  });

  it('rechaza frames con otra forma o tipo', () => {
    for (const raw of ['null', '42', '{}', JSON.stringify({ type: 'action' }), frame(null)])
      expect(parseClientFrame(raw)).toEqual({ ok: false, error: 'Frame inválido.' });
  });

  it('no deja que el cliente se haga pasar por el sistema o el agente', () => {
    // si esto pasara, un usuario podria inyectar "instrucciones del sistema"
    expect(parseClientFrame(frame({ ...userMessage, role: 'system' })).ok).toBe(false);
    expect(parseClientFrame(frame({ ...userMessage, role: 'assistant' })).ok).toBe(false);
  });

  it('solo acepta mensajes terminados', () => {
    expect(parseClientFrame(frame({ ...userMessage, status: 'streaming' })).ok).toBe(false);
  });
});

describe('agentActionSchema', () => {
  const action = { type: 'open_url', url: 'https://www.imdb.com/title/tt0120737/', label: 'IMDb' };

  it('acepta abrir un link https', () => {
    expect(agentActionSchema.safeParse(action).success).toBe(true);
  });

  it('rechaza links que no son https y etiquetas vacias o enormes', () => {
    for (const url of [
      'http://www.imdb.com/',
      'javascript:alert(1)',
      'data:text/html,hola',
      'no es url',
    ])
      expect(agentActionSchema.safeParse({ ...action, url }).success).toBe(false);
    expect(agentActionSchema.safeParse({ ...action, label: '' }).success).toBe(false);
    expect(agentActionSchema.safeParse({ ...action, label: 'x'.repeat(81) }).success).toBe(false);
    expect(agentActionSchema.safeParse({ ...action, type: 'run_code' }).success).toBe(false);
  });
});

describe('serializeFrame', () => {
  it('convierte cualquier frame del servidor a json', () => {
    expect(JSON.parse(serializeFrame({ type: 'error', error: 'x' }))).toEqual({
      type: 'error',
      error: 'x',
    });
    const action = { type: 'open_url' as const, url: 'https://books.google.com/', label: 'Libro' };
    expect(JSON.parse(serializeFrame({ type: 'action', action }))).toEqual({
      type: 'action',
      action,
    });
  });
});
