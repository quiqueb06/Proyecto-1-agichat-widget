import { z } from 'zod';

export class BooksError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

const positive = z.coerce.number().int().positive();
const schema = z.object({
  GOOGLE_BOOKS_API_KEY: z
    .string()
    .trim()
    .min(1)
    .regex(/^[A-Za-z0-9_-]+$/),
  BOOKS_TIMEOUT_MS: positive.max(60000).default(10000),
  BOOKS_CACHE_TTL_MS: positive.max(86400000).default(300000),
  BOOKS_CACHE_CAPACITY: positive.max(10000).default(200),
  BOOKS_DAILY_BUDGET: positive.default(500),
});

export function loadConfig(env: Record<string, unknown> = process.env) {
  const result = schema.safeParse(env);
  if (!result.success) throw new BooksError('CONFIGURATION_INVALID');
  return Object.freeze(result.data);
}
export type Config = ReturnType<typeof loadConfig>;
