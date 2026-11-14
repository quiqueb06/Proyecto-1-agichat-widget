import { setTimeout as sleep } from 'node:timers/promises';
import type { z } from 'zod';
import { Cache } from './cache.js';
import { loadConfig, TmdbError } from './config.js';
import type { Config } from './config.js';
import { RequestBudget } from './requestBudget.js';

export class TmdbClient {
  private readonly config: Readonly<Config>;
  readonly budget: RequestBudget;
  readonly cache: Cache<unknown>;
  constructor(
    config: Config = loadConfig(),
    private fetcher: typeof fetch = fetch,
  ) {
    // También valida configuración proporcionada programáticamente.
    this.config = Object.freeze(
      loadConfig(Object.fromEntries(Object.entries(config).map(([k, v]) => [k, String(v)]))),
    );
    this.budget = new RequestBudget(this.config.TMDB_DAILY_BUDGET);
    this.cache = new Cache(this.config.TMDB_CACHE_TTL_MS, this.config.TMDB_CACHE_CAPACITY);
  }
  async get<T>(
    path: string,
    params: Record<string, string>,
    schema: z.ZodType<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    if (
      !/^\/(search\/movie|discover\/movie|genre\/movie\/list|movie\/[1-9]\d*(\/recommendations)?)$/.test(
        path,
      )
    )
      throw new TmdbError('ENDPOINT_INVALID');
    const url = new URL(`https://api.themoviedb.org/3${path}`);
    for (const key of Object.keys(params).sort()) url.searchParams.set(key, params[key]!);
    if (signal?.aborted) throw new TmdbError('CANCELLED');
    const cached = this.cache.get(url.href);
    if (cached !== undefined) return schema.parse(cached);
    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal?.addEventListener('abort', abort, { once: true });
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, this.config.TMDB_TIMEOUT_MS);
      let delay = 250 * 2 ** attempt;
      try {
        if (signal?.aborted) throw new TmdbError('CANCELLED');
        this.budget.take();
        const response = await this.fetcher(url, {
          headers: { Authorization: `Bearer ${this.config.TMDB_API_TOKEN}` },
          signal: controller.signal,
          redirect: 'error',
        });
        if (!response.ok) {
          const retry = response.status === 429 || response.status >= 500;
          const header = response.headers.get('Retry-After');
          if (header) {
            const seconds = Number(header);
            const wait = Number.isFinite(seconds)
              ? seconds * 1000
              : Date.parse(header) - Date.now();
            if (Number.isFinite(wait)) delay = Math.max(0, wait);
          }
          const code =
            response.status === 429
              ? 'RATE_LIMITED'
              : response.status >= 500
                ? 'UPSTREAM_UNAVAILABLE'
                : response.status === 401 || response.status === 403
                  ? 'AUTH_FAILED'
                  : response.status === 404
                    ? 'NOT_FOUND'
                    : 'HTTP_ERROR';
          await response.body?.cancel();
          if (!retry || attempt >= this.config.TMDB_MAX_RETRIES || delay > 30000)
            throw new TmdbError(code);
        } else {
          let raw: unknown;
          try {
            raw = await readJson(response);
          } catch (error) {
            if (error instanceof TmdbError) throw error;
            throw new TmdbError('INVALID_JSON');
          }
          const parsed = schema.safeParse(raw);
          if (!parsed.success) throw new TmdbError('INVALID_RESPONSE');
          if (controller.signal.aborted) throw new TmdbError('TIMEOUT');
          this.cache.set(url.href, parsed.data);
          return parsed.data;
        }
      } catch (error) {
        if (signal?.aborted) throw new TmdbError('CANCELLED');
        if (timedOut) throw new TmdbError('TIMEOUT');
        if (error instanceof TmdbError) throw error;
        throw new TmdbError('NETWORK_ERROR');
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
      }
      try {
        await sleep(delay, undefined, { signal });
      } catch {
        throw new TmdbError('CANCELLED');
      }
    }
  }
}

// Cuenta bytes del stream entregado por fetch (ya descomprimido), sin depender
// de Content-Length. El límite también acota el buffer previo a JSON.parse.
export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
async function readJson(response: Response): Promise<unknown> {
  if (!response.body) throw new TmdbError('INVALID_JSON');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new TmdbError('RESPONSE_TOO_LARGE');
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks, size).toString('utf8')) as unknown;
  } finally {
    reader.releaseLock();
  }
}
