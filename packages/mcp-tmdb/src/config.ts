import { z } from 'zod';

export class TmdbError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
const positive = z.coerce.number().int().positive();
const schema = z.object({
  TMDB_API_TOKEN: z
    .string()
    .trim()
    .min(1)
    .regex(/^[A-Za-z0-9._-]+$/),
  TMDB_TIMEOUT_MS: positive.max(60000).default(10000),
  TMDB_CACHE_TTL_MS: positive.max(86400000).default(300000),
  TMDB_CACHE_CAPACITY: positive.max(10000).default(200),
  TMDB_DAILY_BUDGET: positive.default(500),
  TMDB_MAX_RETRIES: z.coerce.number().int().min(0).max(3).default(2),
});
export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) throw new TmdbError('CONFIGURATION_INVALID');
  return parsed.data;
}
export type Config = ReturnType<typeof loadConfig>;
