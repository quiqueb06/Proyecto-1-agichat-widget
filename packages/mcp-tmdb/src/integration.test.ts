import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { loadConfig } from './config.js';
import { Cache } from './cache.js';
import { RequestBudget } from './requestBudget.js';
import { TmdbClient } from './tmdbClient.js';
import { MovieService } from './movieService.js';
const config = () => loadConfig({ TMDB_API_TOKEN: 'test', TMDB_MAX_RETRIES: '0' });
const m = {
  id: 1,
  title: 'Dune',
  original_title: 'Dune',
  release_date: '2021-09-01',
  overview: 'Test',
  poster_path: '/abc.jpg',
  genre_ids: [18],
};
function setup(data: unknown) {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => new Response(JSON.stringify(data)));
  const client = new TmdbClient(config(), fetcher);
  return { fetcher, client, service: new MovieService(client) };
}
describe('config, cache y budget', () => {
  it('configura sin exponer secretos', () => {
    expect(() => loadConfig({})).toThrow('CONFIGURATION_INVALID');
    expect(config().TMDB_TIMEOUT_MS).toBe(10000);
  });
  it('expira, reemplaza y limpia', () => {
    let now = 0;
    const c = new Cache<number>(10, 1, () => now);
    expect(c.get('x')).toBeUndefined();
    c.set('x', 1);
    expect(c.get('x')).toBe(1);
    c.set('y', 2);
    expect(c.get('x')).toBeUndefined();
    now = 10;
    expect(c.get('y')).toBeUndefined();
    c.set('z', 3);
    c.clear();
    expect(c.get('z')).toBeUndefined();
  });
  it('cuenta y reinicia por día UTC', () => {
    let now = 0;
    const b = new RequestBudget(1, () => now);
    b.take();
    expect(b.used).toBe(1);
    expect(() => b.take()).toThrow('BUDGET_EXHAUSTED');
    b.reset();
    expect(b.used).toBe(0);
    b.take();
    now = 86400000;
    expect(b.used).toBe(0);
  });
});
describe('cliente', () => {
  it('auth, parámetros, caché y contador', async () => {
    const { client, fetcher } = setup({ ok: true });
    const schema = z.object({ ok: z.boolean() });
    await client.get('/search/movie', { query: 'A&B' }, schema);
    await client.get('/search/movie', { query: 'A&B' }, schema);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual({ Authorization: 'Bearer test' });
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('query=A%26B');
    expect(client.budget.used).toBe(1);
  });
  it.each([
    [401, 'AUTH_FAILED'],
    [403, 'AUTH_FAILED'],
    [404, 'NOT_FOUND'],
    [429, 'RATE_LIMITED'],
    [500, 'UPSTREAM_UNAVAILABLE'],
    [400, 'HTTP_ERROR'],
  ] as const)('maneja HTTP %i', async (status, code) => {
    const { client, fetcher } = setup({});
    fetcher.mockImplementation(async () => new Response('{}', { status }));
    await expect(client.get('/search/movie', {}, z.object({}))).rejects.toThrow(code);
    expect(client.budget.used).toBe(1);
  });
  it('no cachea errores ni JSON inválido', async () => {
    const { client, fetcher } = setup({});
    fetcher.mockResolvedValueOnce(new Response('broken'));
    await expect(client.get('/search/movie', {}, z.object({ ok: z.boolean() }))).rejects.toThrow(
      'INVALID_JSON',
    );
    await expect(client.get('/search/movie', {}, z.object({ ok: z.boolean() }))).rejects.toThrow(
      'INVALID_RESPONSE',
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('reintenta 429 y 5xx contando cada intento', async () => {
    const { fetcher } = setup({});
    const c = new TmdbClient({ ...config(), TMDB_MAX_RETRIES: 2 }, fetcher);
    fetcher
      .mockResolvedValueOnce(new Response('{}', { status: 429, headers: { 'Retry-After': '0' } }))
      .mockResolvedValueOnce(
        new Response('{}', { status: 503, headers: { 'Retry-After': new Date(0).toUTCString() } }),
      );
    await c.get('/search/movie', {}, z.object({}));
    expect(c.budget.used).toBe(3);
  });
  it('no espera Retry-After excesivo', async () => {
    const { fetcher } = setup({});
    const c = new TmdbClient({ ...config(), TMDB_MAX_RETRIES: 1 }, fetcher);
    fetcher.mockResolvedValueOnce(
      new Response('{}', { status: 429, headers: { 'Retry-After': '100' } }),
    );
    await expect(c.get('/search/movie', {}, z.object({}))).rejects.toThrow('RATE_LIMITED');
  });
  it('timeout, cancelación y red', async () => {
    const { fetcher } = setup({});
    fetcher.mockImplementation(
      (_url, opts) =>
        new Promise((_resolve, reject) =>
          opts?.signal?.addEventListener('abort', () => reject(new Error('secret'))),
        ),
    );
    const c = new TmdbClient({ ...config(), TMDB_TIMEOUT_MS: 5 }, fetcher);
    await expect(c.get('/search/movie', {}, z.object({}))).rejects.toThrow('TIMEOUT');
    const abort = new AbortController();
    const pending = c.get('/search/movie', {}, z.object({}), abort.signal);
    abort.abort();
    await expect(pending).rejects.toThrow('CANCELLED');
    fetcher.mockRejectedValueOnce(new Error('secret'));
    await expect(c.get('/search/movie', {}, z.object({}))).rejects.toThrow('NETWORK_ERROR');
    await expect(c.get('/evil', {}, z.object({}))).rejects.toThrow('ENDPOINT_INVALID');
  });
});
describe('herramientas', () => {
  it('búsqueda, año, límite, vacíos y pósters', async () => {
    const { service, fetcher } = setup({ results: [m, { ...m, id: 2, poster_path: null }] });
    expect((await service.search({ query: 'Dune', year: 2021, limit: 1 })).results).toHaveLength(1);
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('year=2021');
    expect((await service.search({ query: 'Dune', limit: 2 })).results[1]?.poster_url).toBeNull();
    const empty = setup({ results: [] });
    expect((await empty.service.search({ query: 'none', limit: 5 })).results).toEqual([]);
  });
  it.each([
    undefined,
    { keywords: [] },
    { keywords: [{ id: 818, name: 'based on novel or book' }] },
  ])('detalles y evidencia %j', async (keywords) => {
    const { service } = setup({
      ...m,
      genres: [{ id: 18, name: 'Drama' }],
      vote_average: 8,
      imdb_id: 'tt123',
      keywords,
    });
    const result = await service.details({ id: 1 });
    expect(result.imdb_url).toBe('https://www.imdb.com/title/tt123/');
    expect(result.literary_adaptation.status).toBe(
      keywords?.keywords.length ? 'evidence_found' : 'unknown',
    );
  });
  it('detalles sin datos opcionales y respuesta inválida', async () => {
    const { service } = setup({ id: 1, title: 'Dune' });
    const d = await service.details({ id: 1 });
    expect(d.imdb_url).toBeNull();
    expect(d.poster_url).toBeNull();
    await expect(service.details({ id: 2 })).rejects.toThrow('INVALID_RESPONSE');
  });
  it('discover por género, año y combinación', async () => {
    for (const input of [{ genre: 'drama' }, { year: 2021 }, { genre: 'drama', year: 2021 }, {}]) {
      const { service, fetcher } = setup({ results: [m], genres: [{ id: 18, name: 'Drama' }] });
      expect((await service.recommend({ ...input, limit: 5 })).results).toHaveLength(1);
      expect(String(fetcher.mock.calls.at(-1)?.[0])).toContain('/discover/movie');
    }
  });
  it('similares ambiguos: coincidencia exacta y menor ID; filtros y errores', async () => {
    const { service, fetcher } = setup({
      results: [{ ...m, id: 20 }, m, { ...m, id: 2, title: 'Other', original_title: 'Other' }],
      genres: [{ id: 18, name: 'Drama' }],
    });
    const r = await service.recommend({ similar_to: 'Dune', genre: 'Drama', year: 2021, limit: 1 });
    expect(r.results).toHaveLength(1);
    expect(String(fetcher.mock.calls.at(-1)?.[0])).toContain('/movie/1/recommendations');
    await expect(service.recommend({ genre: 'missing', limit: 5 })).rejects.toThrow(
      'GENRE_NOT_FOUND',
    );
    const empty = setup({ results: [] });
    await expect(empty.service.recommend({ similar_to: 'none', limit: 5 })).rejects.toThrow(
      'MOVIE_NOT_FOUND',
    );
    expect((await empty.service.recommend({ limit: 5 })).results).toEqual([]);
  });
});
