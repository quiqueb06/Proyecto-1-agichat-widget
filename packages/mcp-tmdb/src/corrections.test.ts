import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { loadConfig } from './config.js';
import { Cache } from './cache.js';
import { TmdbClient, MAX_RESPONSE_BYTES } from './tmdbClient.js';
import { MovieService } from './movieService.js';

// Hace que la espera de backoff utilice el reloj virtual, sin red ni esperas reales.
vi.mock('node:timers/promises', () => ({
  setTimeout: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
}));
afterEach(() => vi.useRealTimers());
const config = () => loadConfig({ TMDB_API_TOKEN: 'test', TMDB_MAX_RETRIES: '0' });
const schema = z.object({ ok: z.boolean() });
const mockFetch = () =>
  vi.fn<typeof fetch>().mockImplementation(async () => new Response('{"ok":true}'));

describe('correcciones Etapa B', () => {
  it('normaliza token programático y lo utiliza en Authorization', async () => {
    const fetcher = mockFetch();
    const client = new TmdbClient({ ...config(), TMDB_API_TOKEN: '  test  ' }, fetcher);
    await client.get('/search/movie', {}, schema);
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual({ Authorization: 'Bearer test' });
  });
  it('aísla configuración de mutaciones posteriores del llamador', async () => {
    const options = { ...config(), TMDB_DAILY_BUDGET: 1 };
    const fetcher = mockFetch();
    const client = new TmdbClient(options, fetcher);
    options.TMDB_API_TOKEN = 'changed';
    options.TMDB_DAILY_BUDGET = 99;
    await client.get('/search/movie', {}, schema);
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual({ Authorization: 'Bearer test' });
    await expect(client.get('/discover/movie', {}, schema)).rejects.toThrow('BUDGET_EXHAUSTED');
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('respeta Retry-After positivo antes de enviar el segundo intento', async () => {
    vi.useFakeTimers();
    const fetcher = mockFetch().mockResolvedValueOnce(
      new Response('{}', { status: 429, headers: { 'Retry-After': '1' } }),
    );
    const client = new TmdbClient({ ...config(), TMDB_MAX_RETRIES: 1 }, fetcher);
    const pending = client.get('/search/movie', {}, schema);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetcher).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(999);
    expect(fetcher).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(client.budget.used).toBe(2);
  });
  it('permite N y bloquea N+1 y llamadas posteriores antes de fetch', async () => {
    const fetcher = mockFetch();
    const client = new TmdbClient({ ...config(), TMDB_DAILY_BUDGET: 2 }, fetcher);
    for (let i = 0; i < 2; i++) await client.get('/search/movie', { query: String(i) }, schema);
    expect(fetcher).toHaveBeenCalledTimes(2);
    for (let i = 2; i < 4; i++)
      await expect(client.get('/search/movie', { query: String(i) }, schema)).rejects.toThrow(
        'BUDGET_EXHAUSTED',
      );
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(client.budget.used).toBe(2);
  });
  it('FIFO con capacidad dos: leer A no evita su expulsión', () => {
    const cache = new Cache<number>(1000, 2);
    cache.set('A', 1);
    cache.set('B', 2);
    expect(cache.get('A')).toBe(1);
    cache.set('C', 3);
    expect(cache.get('A')).toBeUndefined();
    expect(cache.get('B')).toBe(2);
    expect(cache.get('C')).toBe(3);
  });
  it.each([false, true])('intersección de género y año, similar_to=%s', async (similar) => {
    const movie = { id: 1, title: 'Dune', release_date: '2021-01-01', genre_ids: [18] };
    const candidates = [
      { ...movie, id: 2, release_date: '2020-01-01' },
      { ...movie, id: 3, genre_ids: [35] },
      { ...movie, id: 4 },
    ];
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      const path = new URL(String(url)).pathname;
      const data = path.endsWith('/list')
        ? { genres: [{ id: 18, name: 'Drama' }] }
        : path.includes('/search/')
          ? { results: [movie] }
          : { results: candidates };
      return new Response(JSON.stringify(data));
    });
    const service = new MovieService(new TmdbClient(config(), fetcher));
    const result = await service.recommend({
      genre: 'Drama',
      year: 2021,
      limit: 10,
      ...(similar ? { similar_to: 'Dune' } : {}),
    });
    expect(result.results.map((m) => m.id)).toEqual([4]);
  });
  it('acepta body exactamente en el límite y JSON UTF-8 fragmentado', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(' '.repeat(MAX_RESPONSE_BYTES - 2) + '{}'));
    const client = new TmdbClient(config(), fetcher);
    await expect(client.get('/search/movie', {}, z.object({}))).resolves.toEqual({});
    const bytes = new TextEncoder().encode('{"title":"é"}');
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        for (const byte of bytes) c.enqueue(new Uint8Array([byte]));
        c.close();
      },
    });
    fetcher.mockResolvedValueOnce(new Response(stream));
    await expect(
      client.get('/discover/movie', {}, z.object({ title: z.string() })),
    ).resolves.toEqual({ title: 'é' });
  });
  it.each([undefined, '1'])(
    'corta body excesivo sin confiar en Content-Length=%s ni cachear',
    async (length) => {
      const cancel = vi.fn();
      let sent = 0;
      const stream = new ReadableStream<Uint8Array>({
        pull(c) {
          c.enqueue(new Uint8Array(1024 * 1024));
          sent++;
        },
        cancel,
      });
      const fetcher = mockFetch().mockResolvedValueOnce(
        new Response(stream, { headers: length ? { 'Content-Length': length } : {} }),
      );
      const client = new TmdbClient(config(), fetcher);
      await expect(client.get('/search/movie', {}, schema)).rejects.toThrow('RESPONSE_TOO_LARGE');
      expect(cancel).toHaveBeenCalledOnce();
      expect(sent).toBeLessThanOrEqual(4);
      await expect(client.get('/search/movie', {}, schema)).resolves.toEqual({ ok: true });
      expect(fetcher).toHaveBeenCalledTimes(2);
    },
  );
});
