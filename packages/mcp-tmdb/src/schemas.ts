import { z } from 'zod';

export const MAX_RESULTS = 10;
const title = z.string().trim().min(1).max(200);
const year = z.number().int().min(1878).max(9999);
const movieId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const limit = z.number().int().min(1).max(MAX_RESULTS).default(5);

export const searchMovieInputSchema = z.strictObject({
  query: title,
  year: year.optional(),
  limit,
});
export const getMovieDetailsInputSchema = z.strictObject({ id: movieId });
export const recommendMoviesInputSchema = z.strictObject({
  genre: z.string().trim().min(1).max(100).optional(),
  year: year.optional(),
  similar_to: title.optional(),
  limit,
});

const posterUrl = z.url().pipe(
  z.string().refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'image.tmdb.org' &&
      !url.username &&
      !url.password &&
      !url.port &&
      /^\/t\/p\/w500\/[a-zA-Z0-9_-]+\.(jpg|png|webp)$/.test(url.pathname) &&
      !url.search &&
      !url.hash
    );
  }, 'Debe ser un póster HTTPS w500 de image.tmdb.org'),
);

export const movieSummarySchema = z.strictObject({
  id: movieId,
  title,
  original_title: title.nullable(),
  release_year: year.nullable(),
  overview: z.string().max(20000).nullable(),
  poster_url: posterUrl.nullable(),
});

export const literaryAdaptationSchema = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('evidence_found'),
    evidence: z
      .array(
        z.strictObject({
          source: z.literal('tmdb_keyword'),
          keyword_id: movieId,
          keyword_name: z.literal('based on novel or book'),
        }),
      )
      .min(1)
      .max(20),
  }),
  z.strictObject({
    status: z.literal('unknown'),
    evidence: z.array(z.never()).length(0),
    reason: z.enum(['keywords_unavailable', 'no_matching_keyword']),
  }),
]);

export const searchMovieOutputSchema = z.strictObject({
  results: z.array(movieSummarySchema).max(MAX_RESULTS),
});
export const recommendMoviesOutputSchema = searchMovieOutputSchema;
export const getMovieDetailsOutputSchema = z
  .strictObject({
    id: movieId,
    title,
    original_title: title.nullable(),
    overview: z.string().max(20000).nullable(),
    release_date: z.iso.date().nullable(),
    genres: z
      .array(z.strictObject({ id: movieId, name: title }))
      .max(100)
      .nullable(),
    rating: z.number().min(0).max(10).nullable(),
    poster_url: posterUrl.nullable(),
    imdb_id: z
      .string()
      .regex(/^tt\d+$/)
      .nullable(),
    imdb_url: z
      .string()
      .regex(/^https:\/\/www\.imdb\.com\/title\/tt\d+\/$/)
      .nullable(),
    literary_adaptation: literaryAdaptationSchema,
  })
  .refine(
    (movie) =>
      movie.imdb_id === null
        ? movie.imdb_url === null
        : movie.imdb_url === `https://www.imdb.com/title/${movie.imdb_id}/`,
    { message: 'imdb_id e imdb_url deben corresponder' },
  );

export type SearchMovieInput = z.infer<typeof searchMovieInputSchema>;
export type SearchMovieOutput = z.infer<typeof searchMovieOutputSchema>;
export type GetMovieDetailsInput = z.infer<typeof getMovieDetailsInputSchema>;
export type GetMovieDetailsOutput = z.infer<typeof getMovieDetailsOutputSchema>;
export type RecommendMoviesInput = z.infer<typeof recommendMoviesInputSchema>;
export type RecommendMoviesOutput = z.infer<typeof recommendMoviesOutputSchema>;
export type LiteraryAdaptation = z.infer<typeof literaryAdaptationSchema>;
