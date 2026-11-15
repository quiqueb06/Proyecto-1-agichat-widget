import { McpServer } from '@modelcontextprotocol/server';
import { TmdbClient } from './tmdbClient.js';
import { MovieService } from './movieService.js';
import { TmdbError } from './config.js';
import {
  getMovieDetailsInputSchema,
  getMovieDetailsOutputSchema,
  searchMovieInputSchema,
  searchMovieOutputSchema,
  recommendMoviesInputSchema,
  recommendMoviesOutputSchema,
} from './schemas.js';
export const SERVER_NAME = 'agichat-mcp-tmdb';
export function createServer(service?: MovieService): McpServer {
  // Lazy: descubrimiento/health sin credenciales; la configuración se valida al crear el cliente.
  let movies = service;
  const getService = () => (movies ??= new MovieService(new TmdbClient()));
  async function run(work: () => Promise<object>) {
    try {
      const data = await work();
      return {
        structuredContent: { ...data },
        content: [{ type: 'text' as const, text: JSON.stringify(data) }],
      };
    } catch (error) {
      const code = error instanceof TmdbError ? error.code : 'INVALID_RESPONSE';
      return {
        isError: true,
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ code, message: 'No se pudo completar la consulta TMDB.' }),
          },
        ],
      };
    }
  }
  const server = new McpServer({ name: SERVER_NAME, version: '0.1.0' });
  server.registerTool(
    'search_movie',
    {
      description: 'Busca películas por título y año.',
      inputSchema: searchMovieInputSchema,
      outputSchema: searchMovieOutputSchema,
    },
    (args, ctx) => run(() => getService().search(args, ctx.mcpReq.signal)),
  );
  server.registerTool(
    'get_movie_details',
    {
      description: 'Detalles y evidencia literaria por ID TMDB.',
      inputSchema: getMovieDetailsInputSchema,
      outputSchema: getMovieDetailsOutputSchema,
    },
    (args, ctx) => run(() => getService().details(args, ctx.mcpReq.signal)),
  );
  server.registerTool(
    'recommend_movies',
    {
      description: 'Recomendaciones con filtros combinados por intersección.',
      inputSchema: recommendMoviesInputSchema,
      outputSchema: recommendMoviesOutputSchema,
    },
    (args, ctx) => run(() => getService().recommend(args, ctx.mcpReq.signal)),
  );
  return server;
}
