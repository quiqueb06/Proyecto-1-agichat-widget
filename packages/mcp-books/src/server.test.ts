import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { createServer } from './server.js';
import { BookService } from './bookService.js';
import { BooksClient } from './client.js';
import { loadConfig } from './config.js';

describe('MCP Books', () => {
  it('descubre herramientas por stdio sin credenciales ni APIs', async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ['--import', 'tsx', fileURLToPath(new URL('./index.ts', import.meta.url))],
      stderr: 'pipe',
    });
    const client = new Client({ name: 'books-stdio', version: '1' });
    try {
      await client.connect(transport);
      expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual([
        'search_book',
        'get_book_details',
        'compare_movie_book',
      ]);
    } finally {
      await client.close();
      await transport.close();
    }
  }, 15000);
  it('valida entradas/salidas y devuelve errores sin secretos', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Response(JSON.stringify({ totalItems: 0 })));
    const server = createServer(
      new BookService(new BooksClient(loadConfig({ GOOGLE_BOOKS_API_KEY: 'secret-key' }), fetcher)),
    );
    const client = new Client({ name: 'books-test', version: '1' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(b);
      await client.connect(a);
      expect(
        (await client.callTool({ name: 'search_book', arguments: { titulo: 'Dune' } }))
          .structuredContent,
      ).toEqual({ results: [] });
      expect(
        (
          await client.callTool({
            name: 'compare_movie_book',
            arguments: { movie: { title: 'Dune', rating: 8 } },
          })
        ).structuredContent,
      ).toMatchObject({ found: false });
      fetcher.mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'id', volumeInfo: { title: 'Book' } })),
      );
      expect(
        (await client.callTool({ name: 'get_book_details', arguments: { id: 'id' } }))
          .structuredContent,
      ).toMatchObject({ id: 'id', rating: null });
      fetcher.mockResolvedValueOnce(new Response('secret upstream', { status: 429 }));
      const error = await client.callTool({ name: 'get_book_details', arguments: { id: 'other' } });
      expect(error.isError).toBe(true);
      expect(JSON.stringify(error)).toContain('RATE_LIMITED');
      expect(JSON.stringify(error)).not.toContain('secret');
      const before = fetcher.mock.calls.length;
      const invalid = await client
        .callTool({ name: 'search_book', arguments: { titulo: '' } })
        .catch((error: unknown) => error);
      expect(invalid instanceof Error || (invalid as { isError?: boolean }).isError).toBeTruthy();
      expect(fetcher).toHaveBeenCalledTimes(before);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
