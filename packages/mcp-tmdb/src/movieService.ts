import { z } from 'zod';
import type { TmdbClient } from './tmdbClient.js';
import { TmdbError } from './config.js';
import { searchMovieOutputSchema, getMovieDetailsOutputSchema } from './schemas.js';
import type { SearchMovieInput, GetMovieDetailsInput, RecommendMoviesInput } from './schemas.js';
const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const text = z.string().trim().min(1).max(200);
const date = z.union([z.iso.date(), z.literal('')]).nullish();
const path = z
  .string()
  .regex(/^\/[a-zA-Z0-9_-]+\.(jpg|png|webp)$/)
  .nullish();
const genre = z.object({ id, name: text });
const movie = z.object({
  id,
  title: text,
  original_title: text.nullish(),
  release_date: date,
  overview: z.string().max(20000).nullish(),
  poster_path: path,
  genre_ids: z.array(id).max(100).optional(),
});
const list = z.object({ results: z.array(movie).max(20) });
const details = movie.extend({
  genres: z.array(genre).max(100).nullish(),
  vote_average: z.number().min(0).max(10).nullish(),
  imdb_id: z.union([z.string().regex(/^tt\d+$/), z.literal('')]).nullish(),
  keywords: z.object({ keywords: z.array(z.object({ id, name: text })).max(1000) }).nullish(),
});
const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
function summary(m: z.infer<typeof movie>) {
  return {
    id: m.id,
    title: m.title,
    original_title: m.original_title ?? null,
    release_year: m.release_date ? Number(m.release_date.slice(0, 4)) : null,
    overview: m.overview ?? null,
    poster_url: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
  };
}
export class MovieService {
  constructor(private client: TmdbClient) {}
  private searchRaw(query: string, year?: number, signal?: AbortSignal) {
    return this.client.get(
      '/search/movie',
      {
        query,
        include_adult: 'false',
        language: 'es-ES',
        ...(year === undefined ? {} : { year: String(year) }),
      },
      list,
      signal,
    );
  }
  async search(input: SearchMovieInput, signal?: AbortSignal) {
    const data = await this.searchRaw(input.query, input.year, signal);
    return searchMovieOutputSchema.parse({
      results: data.results.slice(0, input.limit).map(summary),
    });
  }
  async details(input: GetMovieDetailsInput, signal?: AbortSignal) {
    const m = await this.client.get(
      `/movie/${input.id}`,
      { append_to_response: 'keywords', language: 'es-ES' },
      details,
      signal,
    );
    if (m.id !== input.id) throw new TmdbError('INVALID_RESPONSE');
    const evidence = m.keywords?.keywords
      .filter((k) => normalize(k.name) === 'based on novel or book')
      .slice(0, 20)
      .map((k) => ({
        source: 'tmdb_keyword' as const,
        keyword_id: k.id,
        keyword_name: 'based on novel or book' as const,
      }));
    return getMovieDetailsOutputSchema.parse({
      id: m.id,
      title: m.title,
      original_title: m.original_title ?? null,
      overview: m.overview ?? null,
      poster_url: summary(m).poster_url,
      release_date: m.release_date || null,
      genres: m.genres ?? null,
      rating: m.vote_average ?? null,
      imdb_id: m.imdb_id || null,
      imdb_url: m.imdb_id ? `https://www.imdb.com/title/${m.imdb_id}/` : null,
      literary_adaptation: evidence?.length
        ? { status: 'evidence_found', evidence }
        : {
            status: 'unknown',
            evidence: [],
            reason: m.keywords ? 'no_matching_keyword' : 'keywords_unavailable',
          },
    });
  }
  async recommend(input: RecommendMoviesInput, signal?: AbortSignal) {
    let genreId: number | undefined;
    if (input.genre) {
      const data = await this.client.get(
        '/genre/movie/list',
        { language: 'es-ES' },
        z.object({ genres: z.array(genre).max(100) }),
        signal,
      );
      genreId = data.genres.find((g) => normalize(g.name) === normalize(input.genre!))?.id;
      if (!genreId) throw new TmdbError('GENRE_NOT_FOUND');
    }
    let data: z.infer<typeof list>;
    if (input.similar_to) {
      const candidates = await this.searchRaw(input.similar_to, undefined, signal);
      const ranked = [...candidates.results].sort((a, b) => {
        const rank = (m: z.infer<typeof movie>) =>
          normalize(m.title) === normalize(input.similar_to!) ||
          normalize(m.original_title ?? '') === normalize(input.similar_to!)
            ? 0
            : 1;
        return rank(a) - rank(b) || a.id - b.id;
      });
      const selected = ranked[0];
      if (!selected) throw new TmdbError('MOVIE_NOT_FOUND');
      data = await this.client.get(
        `/movie/${selected.id}/recommendations`,
        { language: 'es-ES' },
        list,
        signal,
      );
    } else {
      data = await this.client.get(
        '/discover/movie',
        {
          language: 'es-ES',
          include_adult: 'false',
          sort_by: 'popularity.desc',
          ...(genreId ? { with_genres: String(genreId) } : {}),
          ...(input.year ? { primary_release_year: String(input.year) } : {}),
        },
        list,
        signal,
      );
    }
    return searchMovieOutputSchema.parse({
      results: data.results
        .filter(
          (m) =>
            (!genreId || m.genre_ids?.includes(genreId)) &&
            (!input.year || m.release_date?.startsWith(`${input.year}-`)),
        )
        .slice(0, input.limit)
        .map(summary),
    });
  }
}
