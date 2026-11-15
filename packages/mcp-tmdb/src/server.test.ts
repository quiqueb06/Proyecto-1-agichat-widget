import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, vi } from 'vitest';
import { createServer } from './server.js';
import { MovieService } from './movieService.js';
import { TmdbClient } from './tmdbClient.js';
import { loadConfig } from './config.js';
describe('MCP TMDB', () => {
  it('descubre herramientas por stdio real sin consultar APIs', async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['--import', 'tsx', fileURLToPath(new URL('./index.ts', import.meta.url))],
      stderr: 'pipe',
    });
    const client = new Client({ name: 'stdio-test', version: '1' });
    try {
      await client.connect(transport);
      expect((await client.listTools()).tools).toHaveLength(3);
    } finally {
      await client.close();
      await transport.close();
    }
  }, 15000);
  it('registra, responde, valida argumentos y controla errores sin red', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Response(JSON.stringify({ results: [] })));
    const server = createServer(
      new MovieService(new TmdbClient(loadConfig({ TMDB_API_TOKEN: 'test' }), fetcher)),
    );
    const client = new Client({ name: 'test', version: '1' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(b);
      await client.connect(a);
      expect((await client.listTools()).tools.map((t) => t.name)).toEqual([
        'search_movie',
        'get_movie_details',
        'recommend_movies',
      ]);
      expect(
        (await client.callTool({ name: 'search_movie', arguments: { query: 'Dune' } }))
          .structuredContent,
      ).toEqual({ results: [] });
      expect(
        (await client.callTool({ name: 'recommend_movies', arguments: {} })).structuredContent,
      ).toEqual({ results: [] });
      fetcher.mockResolvedValueOnce(new Response('{}', { status: 401 }));
      expect(
        (await client.callTool({ name: 'get_movie_details', arguments: { id: 1 } })).isError,
      ).toBe(true);
      fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ id: 1, title: 'Dune' })));
      expect(
        (await client.callTool({ name: 'get_movie_details', arguments: { id: 1 } }))
          .structuredContent,
      ).toMatchObject({ id: 1, title: 'Dune', imdb_url: null });
      const before = fetcher.mock.calls.length;
      const invalid = await client
        .callTool({ name: 'search_movie', arguments: { query: '' } })
        .catch((e: unknown) => e);
      expect(invalid instanceof Error || (invalid as { isError?: boolean }).isError).toBeTruthy();
      expect(fetcher.mock.calls.length).toBe(before);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
