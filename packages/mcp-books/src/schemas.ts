import { z } from 'zod';

const title = z.string().trim().min(1).max(200);
export const volumeId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const searchBookInputSchema = z.strictObject({
  titulo: title,
  autor: title.optional(),
  limit: z.number().int().min(1).max(10).default(5),
});
export const getBookDetailsInputSchema = z.strictObject({ id: volumeId });

// Exact hosts: never accept a suffix such as books.google.com.attacker.test.
export function normalizeInfoLink(value: string | undefined): string | null {
  try {
    const url = new URL(value ?? '');
    const isPlayBooks =
      url.hostname === 'play.google.com' && url.pathname === '/store/books/details';
    const isGoogleBooks =
      ['books.google.com', 'books.google.es', 'books.google.com.gt'].includes(url.hostname) &&
      url.pathname === '/books';
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      (!isGoogleBooks && !isPlayBooks) ||
      url.username ||
      url.password ||
      url.port ||
      !volumeId.safeParse(url.searchParams.get('id')).success
    )
      return null;
    url.protocol = 'https:';
    // Retain only the volume identity, never external redirects or tracking parameters.
    return `https://${isPlayBooks ? 'books.google.com' : url.hostname}/books?id=${encodeURIComponent(url.searchParams.get('id')!)}`;
  } catch {
    return null;
  }
}

export const bookSchema = z.strictObject({
  id: volumeId,
  title,
  authors: z.array(title).max(30),
  description: z.string().max(2000).nullable(),
  rating: z.number().min(0).max(5).nullable(),
  ratings_count: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
  infoLink: z
    .string()
    .refine((url) => normalizeInfoLink(url) === url)
    .nullable(),
});
export const searchBookOutputSchema = z.strictObject({ results: z.array(bookSchema).max(10) });
export const comparisonInputSchema = z.strictObject({
  movie: z.strictObject({
    title,
    original_title: title.nullish(),
    rating: z.number().min(0).max(10).nullable(),
  }),
  book_title: title.optional(),
  book_author: title.optional(),
});
const ratingsSchema = z.strictObject({
  scale: z.literal(10),
  movie: z.number().min(0).max(10).nullable(),
  book: z.number().min(0).max(10).nullable(),
});
export const comparisonOutputSchema = z.discriminatedUnion('found', [
  z.strictObject({
    found: z.literal(false),
    reason: z.literal('no_reliable_match'),
    ratings: ratingsSchema,
  }),
  z.strictObject({
    found: z.literal(true),
    book: bookSchema,
    relationship: z.literal('candidate'),
    match: z.strictObject({ title: z.literal(true), author: z.boolean().nullable() }),
    ratings: ratingsSchema,
  }),
]);
export type Book = z.infer<typeof bookSchema>;
export type SearchBookInput = z.infer<typeof searchBookInputSchema>;
export type ComparisonInput = z.infer<typeof comparisonInputSchema>;
