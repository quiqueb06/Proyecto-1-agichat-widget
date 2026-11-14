import { describe, expect, it } from 'vitest';
import {
  searchMovieInputSchema,
  getMovieDetailsInputSchema,
  recommendMoviesInputSchema,
  searchMovieOutputSchema,
  getMovieDetailsOutputSchema,
  recommendMoviesOutputSchema,
  literaryAdaptationSchema,
} from './schemas.js';

const summary = {
  id: 1,
  title: 'Dune',
  original_title: null,
  release_year: null,
  overview: null,
  poster_url: null,
};
const details = {
  id: 1,
  title: 'Dune',
  original_title: null,
  overview: null,
  release_date: null,
  genres: null,
  rating: null,
  poster_url: null,
  imdb_id: null,
  imdb_url: null,
  literary_adaptation: { status: 'unknown', evidence: [], reason: 'keywords_unavailable' },
};

describe('entradas', () => {
  it('normaliza query y aplica límite predeterminado', () => {
    expect(searchMovieInputSchema.parse({ query: ' Dune ', year: 2021 })).toEqual({
      query: 'Dune',
      year: 2021,
      limit: 5,
    });
  });
  it.each([undefined, '', '   ', 12, 'a'.repeat(201)])('rechaza query inválido %s', (query) => {
    expect(searchMovieInputSchema.safeParse({ query }).success).toBe(false);
  });
  it.each([1877, 10000, 2021.5, '2021', null, NaN, Infinity])('rechaza año %s', (year) => {
    expect(searchMovieInputSchema.safeParse({ query: 'Dune', year }).success).toBe(false);
    expect(recommendMoviesInputSchema.safeParse({ year }).success).toBe(false);
  });
  it.each([1878, 2021, 9999])('acepta año %s', (year) => {
    expect(searchMovieInputSchema.safeParse({ query: 'Dune', year }).success).toBe(true);
  });
  it('acepta ID positivo', () => {
    expect(getMovieDetailsInputSchema.parse({ id: 1 })).toEqual({ id: 1 });
  });
  it.each([0, -1, 1.5, '1', undefined, Number.MAX_SAFE_INTEGER + 1])('rechaza ID %s', (id) => {
    expect(getMovieDetailsInputSchema.safeParse({ id }).success).toBe(false);
  });
  it('acepta filtros combinados, individuales o ninguno', () => {
    for (const args of [
      {},
      { genre: 'drama' },
      { similar_to: 'Dune' },
      { year: 2021 },
      { genre: 'drama', year: 2021, similar_to: 'Dune', limit: 10 },
    ]) {
      expect(recommendMoviesInputSchema.safeParse(args).success).toBe(true);
    }
  });
  it.each([
    { genre: '' },
    { genre: 1 },
    { genre: 'a'.repeat(101) },
    { similar_to: 1 },
    { similar_to: ' ' },
    { similar_to: 'a'.repeat(201) },
    { año: 2021 },
  ])('rechaza filtro inválido %j', (args) => {
    expect(recommendMoviesInputSchema.safeParse(args).success).toBe(false);
  });
  it.each([0, 11, 1.5, '5', null])('rechaza límite %s', (limit) => {
    expect(searchMovieInputSchema.safeParse({ query: 'Dune', limit }).success).toBe(false);
    expect(recommendMoviesInputSchema.safeParse({ limit }).success).toBe(false);
  });
});

describe('salidas', () => {
  it('acepta listas vacías, datos ausentes como null y máximo 10 resultados', () => {
    for (const schema of [searchMovieOutputSchema, recommendMoviesOutputSchema]) {
      expect(schema.safeParse({ results: [] }).success).toBe(true);
      expect(schema.safeParse({ results: Array(10).fill(summary) }).success).toBe(true);
      expect(schema.safeParse({ results: Array(11).fill(summary) }).success).toBe(false);
      expect(schema.safeParse({ results: [{ id: 1, title: 'Dune' }] }).success).toBe(false);
    }
    expect(getMovieDetailsOutputSchema.safeParse(details).success).toBe(true);
  });
  it('valida detalles completos y correspondencia IMDb', () => {
    const movie = {
      ...details,
      original_title: 'Dune',
      overview: 'Sinopsis',
      release_date: '2021-09-15',
      genres: [{ id: 18, name: 'Drama' }],
      rating: 8,
      poster_url: 'https://image.tmdb.org/t/p/w500/abc.jpg',
      imdb_id: 'tt1160419',
      imdb_url: 'https://www.imdb.com/title/tt1160419/',
    };
    expect(getMovieDetailsOutputSchema.safeParse(movie).success).toBe(true);
    for (const invalid of [
      { rating: 11 },
      { release_date: '2021-02-30' },
      { imdb_url: null },
      { imdb_url: 'https://www.imdb.com/title/tt123/' },
      { imdb_id: '123' },
    ]) {
      expect(getMovieDetailsOutputSchema.safeParse({ ...movie, ...invalid }).success).toBe(false);
    }
    expect(
      getMovieDetailsOutputSchema.safeParse({ ...details, imdb_url: movie.imdb_url }).success,
    ).toBe(false);
  });
  it.each([
    'https://image.tmdb.org/t/p/w500/abc.jpg',
    'http://image.tmdb.org/t/p/w500/abc.jpg',
    'https://image.tmdb.org.evil.test/t/p/w500/abc.jpg',
    'https://user:pass@image.tmdb.org/t/p/w500/abc.jpg',
    'https://image.tmdb.org:444/t/p/w500/abc.jpg',
    'https://image.tmdb.org/t/p/original/abc.jpg',
    'https://image.tmdb.org/t/p/w500/abc.jpg?x=1',
    'https://image.tmdb.org/t/p/w500/abc.jpg#x',
    'javascript:alert(1)',
    '/abc.jpg',
  ])('restringe pósters %s', (poster_url) => {
    expect(
      searchMovieOutputSchema.safeParse({ results: [{ ...summary, poster_url }] }).success,
    ).toBe(poster_url === 'https://image.tmdb.org/t/p/w500/abc.jpg');
  });
  it('exige evidencia para evidencia encontrada y conserva unknown sin keyword', () => {
    const evidence = [
      { source: 'tmdb_keyword', keyword_id: 818, keyword_name: 'based on novel or book' },
    ];
    expect(literaryAdaptationSchema.safeParse({ status: 'evidence_found', evidence }).success).toBe(
      true,
    );
    expect(
      literaryAdaptationSchema.safeParse({ status: 'evidence_found', evidence: [] }).success,
    ).toBe(false);
    expect(
      literaryAdaptationSchema.safeParse({
        status: 'unknown',
        evidence: [],
        reason: 'no_matching_keyword',
      }).success,
    ).toBe(true);
    expect(
      literaryAdaptationSchema.safeParse({
        status: 'unknown',
        evidence,
        reason: 'no_matching_keyword',
      }).success,
    ).toBe(false);
    expect(literaryAdaptationSchema.safeParse(false).success).toBe(false);
  });
});
