import { comparisonInputSchema, comparisonOutputSchema } from './schemas.js';
import type { Book, ComparisonInput } from './schemas.js';
import type { BookService } from './bookService.js';

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function prepareComparison(input: ComparisonInput, candidates: readonly Book[]) {
  const args = comparisonInputSchema.parse(input);
  const titles = (
    args.book_title
      ? [args.book_title]
      : [args.movie.title, args.movie.original_title ?? args.movie.title]
  ).map(normalize);
  const matches = candidates.filter(
    (book) =>
      normalize(book.title).length > 0 &&
      titles.includes(normalize(book.title)) &&
      (!args.book_author ||
        book.authors.some(
          (author) =>
            normalize(author).length > 0 && normalize(author) === normalize(args.book_author!),
        )),
  );
  // Multiple editions by the same author are OK; a title shared by different authors is ambiguous.
  const identities = new Set(matches.map((book) => book.authors.map(normalize).sort().join('|')));
  const book =
    identities.size === 1
      ? [...matches].sort(
          (a, b) => (b.ratings_count ?? 0) - (a.ratings_count ?? 0) || a.id.localeCompare(b.id),
        )[0]
      : undefined;
  const ratings = {
    scale: 10 as const,
    movie: args.movie.rating,
    book: book && book.rating !== null ? book.rating * 2 : null,
  };
  if (!book)
    return comparisonOutputSchema.parse({ found: false, reason: 'no_reliable_match', ratings });
  return comparisonOutputSchema.parse({
    found: true,
    book,
    relationship: 'candidate',
    match: { title: true, author: args.book_author ? true : null },
    ratings,
  });
}

export async function compareMovieBook(
  service: BookService,
  input: ComparisonInput,
  signal?: AbortSignal,
) {
  const args = comparisonInputSchema.parse(input);
  const titles = [
    ...new Set(
      args.book_title
        ? [args.book_title]
        : [args.movie.original_title ?? args.movie.title, args.movie.title],
    ),
  ];
  const books: Book[] = [];
  for (const titulo of titles) {
    const { results } = await service.search(
      { titulo, autor: args.book_author, limit: 10 },
      signal,
    );
    for (const book of results)
      if (!books.some((existing) => existing.id === book.id)) books.push(book);
  }
  return prepareComparison(args, books);
}
