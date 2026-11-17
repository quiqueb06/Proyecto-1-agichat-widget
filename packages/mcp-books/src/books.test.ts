import { afterEach, describe, expect, it, vi } from 'vitest';
import { BooksClient } from './client.js';
import { BooksError, loadConfig } from './config.js';
import { BookService, cleanDescription } from './bookService.js';
import { normalizeInfoLink, searchBookInputSchema, getBookDetailsInputSchema } from './schemas.js';

const rawBook = {
  id: 'dune_1',
  volumeInfo: {
    title: 'Dune',
    authors: ['Frank Herbert'],
    description: '<p>A <b>desert</b> &amp; spice.</p><script>bad()</script>',
    averageRating: 4.5,
    ratingsCount: 120,
    infoLink: 'http://books.google.com/books?id=dune_1&source=api',
  },
};
const response = (data: unknown) => new Response(JSON.stringify(data));
function setup(env: NodeJS.ProcessEnv = {}) {
  const fetcher = vi.fn<typeof fetch>();
  let now = Date.UTC(2026, 0, 1);
  const client = new BooksClient(
    loadConfig({ GOOGLE_BOOKS_API_KEY: 'test-key', ...env }),
    fetcher,
    () => now,
  );
  return {
    fetcher,
    client,
    service: new BookService(client),
    advance: (ms: number) => {
      now += ms;
    },
  };
}
afterEach(() => vi.useRealTimers());

describe('configuración y contratos de libros', () => {
  it('valida secretos, límites, argumentos y IDs sin coerciones', () => {
    expect(() => loadConfig({})).toThrow('CONFIGURATION_INVALID');
    for (const env of [
      { BOOKS_TIMEOUT_MS: '0' },
      { BOOKS_CACHE_CAPACITY: '-1' },
      { BOOKS_CACHE_TTL_MS: '86400001' },
    ])
      expect(() => loadConfig({ GOOGLE_BOOKS_API_KEY: 'key', ...env })).toThrow(BooksError);
    expect(searchBookInputSchema.parse({ titulo: ' Dune ' })).toEqual({ titulo: 'Dune', limit: 5 });
    for (const args of [{ titulo: '' }, { titulo: 'x', limit: '2' }, { titulo: 'x', extra: 1 }])
      expect(searchBookInputSchema.safeParse(args).success).toBe(false);
    for (const id of ['', '../x', 'id?key=secret', 'x'.repeat(129)])
      expect(getBookDetailsInputSchema.safeParse({ id }).success).toBe(false);
  });
  it('limpia HTML, entidades, scripts, estilos y limita descripciones', () => {
    expect(cleanDescription(rawBook.volumeInfo.description)).toBe('A desert & spice.');
    expect(cleanDescription('<style>hide</style><div>A<br>B</div>')).toBe('A B');
    expect(cleanDescription('<p>' + 'x'.repeat(3000) + '</p>')).toHaveLength(2000);
    expect(cleanDescription('<script>secret</script>')).toBeNull();
    expect(cleanDescription(undefined)).toBeNull();
    expect(cleanDescription('')).toBeNull();
  });
  it('normaliza enlaces permitidos y descarta redirecciones', () => {
    expect(normalizeInfoLink(rawBook.volumeInfo.infoLink)).toBe(
      'https://books.google.com/books?id=dune_1',
    );
    expect(normalizeInfoLink('https://books.google.es/books?id=abc')).toContain('books.google.es');
    expect(
      normalizeInfoLink('https://play.google.com/store/books/details?id=abc&source=gbs_api'),
    ).toBe('https://books.google.com/books?id=abc');
    expect(normalizeInfoLink('https://play.google.com/store/apps/details?id=abc')).toBeNull();
    expect(
      normalizeInfoLink('https://play.google.com.evil.test/store/books/details?id=abc'),
    ).toBeNull();
    for (const url of [
      undefined,
      'no-url',
      'javascript:alert(1)',
      'https://books.google.com.evil.test/books?id=a',
      'https://user@books.google.com/books?id=a',
      'https://books.google.com:8443/books?id=a',
      'https://books.google.com/redirect?id=a',
      'https://books.google.com/books',
      'https://books.google.com/books?id=../x',
    ])
      expect(normalizeInfoLink(url)).toBeNull();
  });
});

describe('Google Books sin red', () => {
  it('distingue cuotas agotadas de credenciales inválidas cuando Google devuelve 403', async () => {
    const { fetcher, client } = setup();
    fetcher.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { errors: [{ reason: 'dailyLimitExceeded' }] } }), {
        status: 403,
      }),
    );
    await expect(client.get('volumes')).rejects.toThrow('RATE_LIMITED');
    fetcher.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { errors: [{ reason: 'forbidden' }] } }), {
        status: 403,
      }),
    );
    await expect(client.get('volumes')).rejects.toThrow('AUTH_FAILED');
  });
  it('busca título/autor y normaliza los datos sin exponer la key en URL', async () => {
    const { fetcher, service } = setup();
    fetcher.mockResolvedValueOnce(response({ items: [rawBook] }));
    expect(
      (await service.search({ titulo: 'Dune', autor: 'Frank Herbert', limit: 5 })).results[0],
    ).toMatchObject({
      id: 'dune_1',
      rating: 4.5,
      ratings_count: 120,
      infoLink: 'https://books.google.com/books?id=dune_1',
    });
    const [url, options] = fetcher.mock.calls[0]!;
    expect((url as URL).origin).toBe('https://www.googleapis.com');
    expect((url as URL).searchParams.get('q')).toBe('intitle:"Dune" inauthor:"Frank Herbert"');
    expect(String(url)).not.toContain('test-key');
    expect(options).toMatchObject({ redirect: 'error', headers: { 'X-Goog-Api-Key': 'test-key' } });
  });
  it('maneja ausencia de resultados/metadatos, rating cero y enlaces inconsistentes', async () => {
    const { fetcher, service } = setup();
    fetcher.mockResolvedValueOnce(response({ totalItems: 0 }));
    expect(await service.search({ titulo: 'none', limit: 5 })).toEqual({ results: [] });
    fetcher.mockResolvedValueOnce(response({ id: 'empty', volumeInfo: { title: 'Empty' } }));
    expect(await service.details({ id: 'empty' })).toMatchObject({
      authors: [],
      description: null,
      rating: null,
      ratings_count: null,
      infoLink: null,
    });
    fetcher.mockResolvedValueOnce(
      response({
        ...rawBook,
        volumeInfo: {
          ...rawBook.volumeInfo,
          averageRating: 0,
          infoLink: 'https://books.google.com/books?id=wrong',
        },
      }),
    );
    expect(await service.details({ id: 'dune_1' })).toMatchObject({ rating: 0, infoLink: null });
  });
  it('aplica TTL/capacidad, evita mutaciones y limita requests por día', async () => {
    const { fetcher, client, advance } = setup({
      BOOKS_DAILY_BUDGET: '3',
      BOOKS_CACHE_TTL_MS: '10',
      BOOKS_CACHE_CAPACITY: '1',
    });
    fetcher.mockImplementation(async () => response({ value: 1 }));
    const first = (await client.get('volumes', { q: 'one' })) as { value: number };
    first.value = 9;
    expect(await client.get('volumes', { q: 'one' })).toEqual({ value: 1 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    advance(11);
    await client.get('volumes', { q: 'one' });
    await client.get('volumes', { q: 'two' });
    await expect(client.get('volumes', { q: 'one' })).rejects.toThrow('BUDGET_EXHAUSTED');
    advance(86400000);
    await expect(client.get('volumes', { q: 'one' })).resolves.toEqual({ value: 1 });
  });
  it.each([
    [401, 'AUTH_FAILED'],
    [403, 'AUTH_FAILED'],
    [404, 'NOT_FOUND'],
    [429, 'RATE_LIMITED'],
    [500, 'UPSTREAM_ERROR'],
  ])('traduce HTTP %s sin cachear errores', async (status, code) => {
    const { fetcher, client } = setup();
    fetcher.mockImplementation(
      async () => new Response('secret upstream body', { status: status as number }),
    );
    await expect(client.get('volumes')).rejects.toThrow(code as string);
    await expect(client.get('volumes')).rejects.toThrow(code as string);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('rechaza JSON, metadatos e IDs inválidos y permite reconsultarlos', async () => {
    const { fetcher, client, service } = setup();
    fetcher.mockResolvedValueOnce(new Response('{'));
    await expect(client.get('volumes')).rejects.toThrow('INVALID_JSON');
    fetcher.mockResolvedValueOnce(response({}));
    await expect(service.search({ titulo: 'Dune', limit: 5 })).rejects.toThrow('INVALID_RESPONSE');
    fetcher.mockResolvedValueOnce(response({ items: [rawBook] }));
    expect((await service.search({ titulo: 'Dune', limit: 5 })).results).toHaveLength(1);
    fetcher.mockResolvedValueOnce(response({ ...rawBook, id: 'other' }));
    await expect(service.details({ id: 'dune_1' })).rejects.toThrow('INVALID_RESPONSE');
    fetcher.mockResolvedValueOnce(
      response({ id: 'dune_1', volumeInfo: { title: 'Dune', averageRating: 7 } }),
    );
    await expect(service.details({ id: 'dune_1' })).rejects.toThrow('INVALID_RESPONSE');
  });
  it('acota el body sin Content-Length y maneja body ausente, red y endpoints inválidos', async () => {
    const { fetcher, client } = setup();
    fetcher.mockResolvedValueOnce(new Response('x'.repeat(2 * 1024 * 1024 + 1)));
    await expect(client.get('volumes')).rejects.toThrow('RESPONSE_TOO_LARGE');
    fetcher.mockResolvedValueOnce(new Response(null));
    await expect(client.get('volumes')).rejects.toThrow('INVALID_RESPONSE');
    fetcher.mockRejectedValueOnce(new Error('secret'));
    await expect(client.get('volumes')).rejects.toThrow('NETWORK_ERROR');
    await expect(client.get('../secrets')).rejects.toThrow('ENDPOINT_INVALID');
  });
  it('propaga cancelación y timeout y libera timers', async () => {
    vi.useFakeTimers();
    const { fetcher, client } = setup({ BOOKS_TIMEOUT_MS: '10' });
    const cancelled = new AbortController();
    cancelled.abort();
    await expect(client.get('volumes', {}, cancelled.signal)).rejects.toThrow('CANCELLED');
    expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockImplementation(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options!.signal!.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          });
        }),
    );
    const controller = new AbortController();
    const pending = expect(client.get('volumes', {}, controller.signal)).rejects.toThrow(
      'CANCELLED',
    );
    controller.abort();
    await pending;
    const timeout = expect(client.get('volumes')).rejects.toThrow('TIMEOUT');
    await vi.advanceTimersByTimeAsync(10);
    await timeout;
    expect(vi.getTimerCount()).toBe(0);
  });
});
