import { describe, expect, it, vi } from 'vitest';
import { GroqChatModel, loadGroqEvalConfig } from './GroqChatModel.js';

const KEY = `gsk_${'k'.repeat(40)}`;

function response(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers });
}

function model(fetchImpl: typeof fetch, sleep = vi.fn(async (_ms: number) => {})) {
  return {
    sleep,
    groq: new GroqChatModel({
      apiKey: KEY,
      model: 'openai/gpt-oss-120b',
      baseUrl: 'https://api.groq.com/openai/v1',
      fetch: fetchImpl,
      sleep,
    }),
  };
}

describe('loadGroqEvalConfig', () => {
  it('lee la key y usa el modelo y la url por defecto', () => {
    expect(loadGroqEvalConfig({ GROQ_API_KEY: KEY })).toEqual({
      apiKey: KEY,
      model: 'openai/gpt-oss-120b',
      baseUrl: 'https://api.groq.com/openai/v1',
    });
  });

  it('permite cambiar el modelo por env', () => {
    expect(loadGroqEvalConfig({ GROQ_API_KEY: KEY, GROQ_MODEL: 'openai/gpt-oss-20b' }).model).toBe(
      'openai/gpt-oss-20b',
    );
  });

  it('falla con un mensaje claro si no hay key (sin mostrarla)', () => {
    expect(() => loadGroqEvalConfig({})).toThrow(/GROQ_API_KEY/);
  });
});

describe('GroqChatModel', () => {
  it('llama a chat/completions con el modelo, los mensajes y la key en el header', async () => {
    const fetchImpl = vi.fn(async () =>
      response(200, { choices: [{ message: { content: 'Hola desde Groq' } }] }),
    );
    const { groq } = model(fetchImpl as unknown as typeof fetch);

    const text = await groq.complete([{ role: 'user', content: 'hola' }]);

    expect(text).toBe('Hola desde Groq');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      model: 'openai/gpt-oss-120b',
      messages: [{ role: 'user', content: 'hola' }],
    });
    // gpt-oss gasta tokens razonando: con poco margen la respuesta sale cortada
    expect(body.max_tokens).toBeGreaterThanOrEqual(2000);
    expect(groq.name).toBe('groq: openai/gpt-oss-120b');
  });

  it('reintenta ante un 429 respetando retry-after', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(429, {}, { 'retry-after': '2' }))
      .mockResolvedValueOnce(response(200, { choices: [{ message: { content: 'ok' } }] }));
    const { groq, sleep } = model(fetchImpl as unknown as typeof fetch);

    expect(await groq.complete([{ role: 'user', content: 'x' }])).toBe('ok');
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it('sin retry-after espera cada vez más (1s, 2s, 4s) y al final se rinde', async () => {
    const fetchImpl = vi.fn(async () => response(429, {}));
    const { groq, sleep } = model(fetchImpl as unknown as typeof fetch);

    await expect(groq.complete([{ role: 'user', content: 'x' }])).rejects.toThrow(/429/);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000, 4000]);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('no reintenta otros errores y no muestra la key en el mensaje', async () => {
    const fetchImpl = vi.fn(async () => response(401, { error: { message: `bad key ${KEY}` } }));
    const { groq } = model(fetchImpl as unknown as typeof fetch);

    const error = await groq.complete([{ role: 'user', content: 'x' }]).catch((e: Error) => e);
    expect((error as Error).message).toMatch(/401/);
    expect((error as Error).message).not.toContain(KEY);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('devuelve texto vacío si la respuesta no trae contenido', async () => {
    const { groq } = model((async () => response(200, { choices: [] })) as unknown as typeof fetch);
    expect(await groq.complete([{ role: 'user', content: 'x' }])).toBe('');
  });

  it('usa el fetch global y una espera real si no se inyectan', () => {
    expect(new GroqChatModel({ apiKey: KEY, model: 'm', baseUrl: 'https://x' }).name).toBe(
      'groq: m',
    );
  });
});
