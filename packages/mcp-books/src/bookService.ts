import { Parser } from 'htmlparser2';
import { z } from 'zod';
import type { BooksClient } from './client.js';
import { BooksError } from './config.js';
import {
  bookSchema,
  getBookDetailsInputSchema,
  normalizeInfoLink,
  searchBookInputSchema,
  volumeId,
} from './schemas.js';
import type { SearchBookInput } from './schemas.js';

const volumeSchema = z.object({
  id: volumeId,
  volumeInfo: z.object({
    title: z.string().trim().min(1).max(200),
    authors: z.array(z.string().trim().min(1).max(200)).max(30).optional(),
    description: z.string().max(200000).optional(),
    averageRating: z.number().min(0).max(5).optional(),
    ratingsCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
    infoLink: z.string().optional(),
  }),
});

export function cleanDescription(html: string | undefined): string | null {
  if (!html) return null;
  const parts: string[] = [];
  let ignored = 0;
  const parser = new Parser(
    {
      onopentag(name) {
        if (['script', 'style'].includes(name)) ignored++;
        else if (!ignored) parts.push(' ');
      },
      ontext(text) {
        if (!ignored) parts.push(text);
      },
      onclosetag(name) {
        if (['script', 'style'].includes(name)) ignored--;
        else if (!ignored) parts.push(' ');
      },
    },
    { decodeEntities: true },
  );
  parser.end(html);
  return parts.join('').replace(/\s+/g, ' ').trim().slice(0, 2000) || null;
}

function normalizeVolume(raw: unknown) {
  const volume = volumeSchema.parse(raw);
  const info = volume.volumeInfo;
  const link = normalizeInfoLink(info.infoLink);
  return bookSchema.parse({
    id: volume.id,
    title: info.title,
    authors: info.authors ?? [],
    description: cleanDescription(info.description),
    rating: info.averageRating ?? null,
    ratings_count: info.ratingsCount ?? null,
    infoLink: link && new URL(link).searchParams.get('id') === volume.id ? link : null,
  });
}

export class BookService {
  constructor(private readonly client: BooksClient) {}

  async search(input: SearchBookInput, signal?: AbortSignal) {
    const args = searchBookInputSchema.parse(input);
    // Quotes are data: users cannot inject Google Books query operators.
    const phrase = (value: string) => value.replace(/["\\:]/g, ' ');
    const q = `intitle:"${phrase(args.titulo)}"${args.autor ? ` inauthor:"${phrase(args.autor)}"` : ''}`;
    const raw = await this.client.get(
      'volumes',
      { q, maxResults: String(args.limit), printType: 'books' },
      signal,
    );
    try {
      const data = z
        .object({
          items: z.array(z.unknown()).max(40).optional(),
          totalItems: z.number().nonnegative().optional(),
        })
        .parse(raw);
      if (!data.items && data.totalItems !== 0) throw new BooksError('INVALID_RESPONSE');
      return { results: (data.items ?? []).slice(0, args.limit).map(normalizeVolume) };
    } catch {
      this.client.invalidate();
      throw new BooksError('INVALID_RESPONSE');
    }
  }

  async details(input: { id: string }, signal?: AbortSignal) {
    const { id } = getBookDetailsInputSchema.parse(input);
    const raw = await this.client.get(`volumes/${id}`, {}, signal);
    try {
      const book = normalizeVolume(raw);
      if (book.id !== id) throw new BooksError('INVALID_RESPONSE');
      return book;
    } catch {
      this.client.invalidate();
      throw new BooksError('INVALID_RESPONSE');
    }
  }
}
