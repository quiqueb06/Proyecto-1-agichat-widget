import { describe, expect, it, vi } from 'vitest';
import { compareMovieBook, prepareComparison } from './comparison.js';
import { BookService } from './bookService.js';
import { BooksClient } from './client.js';
import { loadConfig } from './config.js';
import type { Book, ComparisonInput } from './schemas.js';

const book: Book = {
  id: 'one',
  title: 'Dune',
  authors: ['Frank Herbert'],
  description: null,
  rating: 4.5,
  ratings_count: 20,
  infoLink: null,
};
const input: ComparisonInput = { movie: { title: 'Duna', original_title: 'Dune', rating: 8 } };
describe('datos de comparación', () => {
  it('no acepta coincidencias vacías al normalizar títulos o autores solo con puntuación', () => {
    expect(
      prepareComparison({ movie: { title: '!!!', rating: null } }, [{ ...book, title: '???' }])
        .found,
    ).toBe(false);
    expect(
      prepareComparison({ ...input, book_author: '!!!' }, [{ ...book, authors: ['???'] }]).found,
    ).toBe(false);
  });
  it('normaliza título/autor y ratings sin confirmar la adaptación', () => {
    expect(prepareComparison({ ...input, book_author: 'fránk HERBERT' }, [book])).toMatchObject({
      found: true,
      relationship: 'candidate',
      match: { title: true, author: true },
      ratings: { scale: 10, movie: 8, book: 9 },
    });
    expect(prepareComparison(input, [book])).toMatchObject({ match: { author: null } });
  });
  it('rechaza títulos parecidos, autor incorrecto y títulos ambiguos', () => {
    for (const candidates of [
      [],
      [{ ...book, title: 'Children of Dune' }],
      [book, { ...book, id: 'other', authors: ['Other'] }],
    ])
      expect(prepareComparison(input, candidates)).toEqual({
        found: false,
        reason: 'no_reliable_match',
        ratings: { scale: 10, movie: 8, book: null },
      });
    expect(prepareComparison({ ...input, book_author: 'Wrong' }, [book]).found).toBe(false);
  });
  it('permite título explícito, ediciones, datos faltantes y ceros', () => {
    expect(
      prepareComparison(
        { movie: { title: 'Blade Runner', rating: null }, book_title: 'Do Androids Dream?' },
        [{ ...book, title: 'Do Androids Dream?', rating: null }],
      ),
    ).toMatchObject({ found: true, ratings: { movie: null, book: null } });
    expect(
      prepareComparison(input, [book, { ...book, id: 'zero', rating: 0, ratings_count: 50 }]),
    ).toMatchObject({ book: { id: 'zero' }, ratings: { book: 0 } });
    expect(prepareComparison(input, [book, { ...book, id: 'a' }])).toMatchObject({
      book: { id: 'a' },
    });
    expect(prepareComparison({ movie: { title: 'Dune', rating: 0 } }, [book])).toMatchObject({
      ratings: { movie: 0 },
    });
  });
  it('consulta títulos original/traducido y permite libro/autor explícitos', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Response(JSON.stringify({ totalItems: 0 })));
    const service = new BookService(
      new BooksClient(loadConfig({ GOOGLE_BOOKS_API_KEY: 'test' }), fetcher),
    );
    await compareMovieBook(service, input);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await compareMovieBook(service, {
      movie: { title: 'Film', rating: 5 },
      book_title: 'Novel',
      book_author: 'Author',
    });
    expect((fetcher.mock.calls[2]![0] as URL).searchParams.get('q')).toBe(
      'intitle:"Novel" inauthor:"Author"',
    );
  });
  it('deduplica los mismos volúmenes devueltos por búsquedas traducidas', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            items: [
              {
                id: 'one',
                volumeInfo: {
                  title: 'Dune',
                  authors: ['Frank Herbert'],
                  averageRating: 4,
                  ratingsCount: 10,
                },
              },
            ],
          }),
        ),
    );
    const service = new BookService(
      new BooksClient(loadConfig({ GOOGLE_BOOKS_API_KEY: 'test' }), fetcher),
    );
    expect(await compareMovieBook(service, input)).toMatchObject({
      found: true,
      book: { id: 'one' },
      ratings: { book: 8 },
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
