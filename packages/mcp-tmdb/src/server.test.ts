import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fileURLToPath } from 'node:url';
import { createServer, SERVER_NAME } from './server.js';

afterEach(() => vi.unstubAllGlobals());

describe('servidor MCP', () => {
  it('registra esquemas y valida llamadas sin acceder a APIs', async () => {
    const fetch = vi.fn(() => {
      throw new Error('No se permite red');
    });
    vi.stubGlobal('fetch', fetch);
    const server = createServer();
    const client = new Client({ name: 'test', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      expect(client.getServerVersion()?.name).toBe(SERVER_NAME);
      const { tools } = await client.listTools();
      expect(tools.map((tool) => tool.name)).toEqual([
        'search_movie',
        'get_movie_details',
        'recommend_movies',
      ]);
      for (const tool of tools) {
        expect(tool.inputSchema.type).toBe('object');
        expect(tool.outputSchema?.type).toBe('object');
      }
      for (const [name, args] of [
        ['search_movie', { query: 'Dune', year: 2021 }],
        ['get_movie_details', { id: 438631 }],
        ['recommend_movies', { genre: 'drama', year: 2021, similar_to: 'Dune' }],
      ] as const) {
        const result = await client.callTool({ name, arguments: args });
        expect(result.isError).toBe(true);
        expect(result.content).toEqual([
          {
            type: 'text',
            text: JSON.stringify({
              code: 'NOT_IMPLEMENTED',
              message: 'La integración con TMDB todavía no está implementada.',
            }),
          },
        ]);
      }
      for (const [name, args] of [
        ['search_movie', { query: '' }],
        ['search_movie', { query: 'Dune', year: '2021' }],
        ['get_movie_details', { id: -1 }],
        ['recommend_movies', { similar_to: 123 }],
        ['recommend_movies', { limit: 11 }],
      ] as const) {
        // El SDK puede rechazar como error de protocolo o de herramienta.
        const result = await client
          .callTool({ name, arguments: args })
          .catch((error: unknown) => error);
        expect(result instanceof Error || (result as { isError?: boolean }).isError).toBeTruthy();
        expect(JSON.stringify(result)).not.toContain('NOT_IMPLEMENTED');
      }
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('inicia el proceso real y negocia MCP por stdio', async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['--import', 'tsx', fileURLToPath(new URL('./index.ts', import.meta.url))],
      stderr: 'inherit',
    });
    const client = new Client({ name: 'stdio-test', version: '1.0.0' });
    try {
      await client.connect(transport);
      expect(client.getServerVersion()?.name).toBe(SERVER_NAME);
      expect((await client.listTools()).tools).toHaveLength(3);
      expect(
        (await client.callTool({ name: 'search_movie', arguments: { query: 'Dune' } })).isError,
      ).toBe(true);
    } finally {
      await client.close();
      await transport.close();
    }
  }, 15000);
});
