import { McpServer } from '@modelcontextprotocol/server';
import {
  getMovieDetailsInputSchema,
  getMovieDetailsOutputSchema,
  recommendMoviesInputSchema,
  recommendMoviesOutputSchema,
  searchMovieInputSchema,
  searchMovieOutputSchema,
} from './schemas.js';

export const SERVER_NAME = 'agichat-mcp-tmdb';

// Error explícito: no se devuelven datos ficticios ni listas vacías.
function notImplemented() {
  return {
    isError: true,
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({
          code: 'NOT_IMPLEMENTED',
          message: 'La integración con TMDB todavía no está implementada.',
        }),
      },
    ],
  };
}

export function createServer(): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: '0.1.0' });
  server.registerTool(
    'search_movie',
    {
      description: 'Busca películas por título y año opcional. Máximo 10 resultados.',
      inputSchema: searchMovieInputSchema,
      outputSchema: searchMovieOutputSchema,
    },
    notImplemented,
  );
  server.registerTool(
    'get_movie_details',
    {
      description: 'Obtiene detalles por ID TMDB y evidencia de adaptación literaria.',
      inputSchema: getMovieDetailsInputSchema,
      outputSchema: getMovieDetailsOutputSchema,
    },
    notImplemented,
  );
  server.registerTool(
    'recommend_movies',
    {
      description:
        'Recomienda por género y año; similar_to es un título. Los filtros se combinan por intersección. Máximo 10 resultados.',
      inputSchema: recommendMoviesInputSchema,
      outputSchema: recommendMoviesOutputSchema,
    },
    notImplemented,
  );
  return server;
}
