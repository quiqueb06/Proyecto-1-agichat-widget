import { BooksError, loadConfig } from './config.js';
import type { Config } from './config.js';
import { z } from 'zod';

const quotaErrorSchema = z.object({
  error: z.object({ errors: z.array(z.object({ reason: z.string() })).max(100) }),
});

async function readJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new BooksError('INVALID_RESPONSE');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 2 * 1024 * 1024) {
        await reader.cancel();
        throw new BooksError('RESPONSE_TOO_LARGE');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new BooksError('INVALID_JSON');
  }
}

export class BooksClient {
  private readonly config: Config;
  private readonly cache = new Map<string, { text: string; expires: number }>();
  private day = '';
  private requests = 0;

  constructor(
    config = loadConfig(),
    private readonly fetcher: typeof fetch = fetch,
    private readonly now = Date.now,
  ) {
    this.config = loadConfig(config);
  }

  async get(
    path: string,
    params: Record<string, string> = {},
    signal?: AbortSignal,
  ): Promise<unknown> {
    if (!/^volumes(?:\/[A-Za-z0-9_-]{1,128})?$/.test(path))
      throw new BooksError('ENDPOINT_INVALID');
    const url = new URL(`https://www.googleapis.com/books/v1/${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    url.searchParams.sort();
    const cacheKey = url.href;
    if (signal?.aborted) throw new BooksError('CANCELLED');
    for (const [key, entry] of this.cache) if (entry.expires <= this.now()) this.cache.delete(key);
    const cached = this.cache.get(cacheKey);
    if (cached) return JSON.parse(cached.text);
    const day = new Date(this.now()).toISOString().slice(0, 10);
    if (this.day !== day) {
      this.day = day;
      this.requests = 0;
    }
    if (this.requests >= this.config.BOOKS_DAILY_BUDGET) throw new BooksError('BUDGET_EXHAUSTED');
    this.requests++;
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(abort, this.config.BOOKS_TIMEOUT_MS);
    try {
      const response = await this.fetcher(url, {
        headers: { 'X-Goog-Api-Key': this.config.GOOGLE_BOOKS_API_KEY },
        redirect: 'error',
        signal: controller.signal,
      });
      if (!response.ok) {
        let quotaLimited = false;
        if (response.status === 403) {
          try {
            const error = quotaErrorSchema.safeParse(await readJson(response));
            quotaLimited =
              error.success &&
              error.data.error.errors.some(({ reason }) =>
                [
                  'dailyLimitExceeded',
                  'userRateLimitExceeded',
                  'rateLimitExceeded',
                  'quotaExceeded',
                ].includes(reason),
              );
          } catch {
            // Malformed upstream error bodies must not expose their contents or mask the status.
          }
        } else await response.body?.cancel();
        const code =
          response.status === 429 || quotaLimited
            ? 'RATE_LIMITED'
            : response.status === 401 || response.status === 403
              ? 'AUTH_FAILED'
              : response.status === 404
                ? 'NOT_FOUND'
                : 'UPSTREAM_ERROR';
        throw new BooksError(code);
      }
      const result = await readJson(response);
      const text = JSON.stringify(result);
      if (controller.signal.aborted)
        throw new BooksError(signal?.aborted ? 'CANCELLED' : 'TIMEOUT');
      // Domain-invalid JSON is evicted by the service, never retained as a successful result.
      if (this.cache.size >= this.config.BOOKS_CACHE_CAPACITY)
        this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(cacheKey, { text, expires: this.now() + this.config.BOOKS_CACHE_TTL_MS });
      return result;
    } catch (error) {
      if (controller.signal.aborted)
        throw new BooksError(signal?.aborted ? 'CANCELLED' : 'TIMEOUT');
      if (error instanceof BooksError) throw error;
      throw new BooksError('NETWORK_ERROR');
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    }
  }

  invalidate(): void {
    this.cache.clear();
  }
}
