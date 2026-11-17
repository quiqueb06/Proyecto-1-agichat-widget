import { describe, expect, it, vi } from 'vitest';
import { FakeLLM } from '../llm/FakeLLM.js';
import type { MCPClientLike } from '../mcp/types.js';
import { BookComparisonAgent } from './BookComparisonAgent.js';

function createMcp(): MCPClientLike {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),

    listTools: vi.fn().mockResolvedValue([
      {
        name: 'search_book',
        description: 'Busca libros',
        inputSchema: {
          type: 'object',
        },
      },
      {
        name: 'get_book_details',
        description: 'Obtiene detalles de un libro',
        inputSchema: {
          type: 'object',
        },
      },
      {
        name: 'compare_movie_book',
        description: 'Compara película y libro',
        inputSchema: {
          type: 'object',
        },
      },
      {
        name: 'search_movie',
        description: 'No debe exponerse a este agente',
        inputSchema: {
          type: 'object',
        },
      },
    ]),

    callTool: vi.fn().mockResolvedValue({
      isError: false,
      structuredContent: {
        found: true,
        book: {
          id: 'book-1',
          title: 'Dune',
          authors: ['Frank Herbert'],
          description: 'Novela de ciencia ficción.',
          rating: 4.5,
          ratings_count: 2000,
          infoLink:
            'https://books.google.com/books?id=book-1',
        },
        relationship: 'candidate',
        match: {
          title: true,
          author: null,
        },
        ratings: {
          scale: 10,
          movie: 8.1,
          book: 9,
        },
      },
      text: '{"found":true}',
    }),
  };
}

describe('BookComparisonAgent', () => {
  it('responde directamente sin herramientas cuando el LLM no las necesita', async () => {
    const llm = new FakeLLM([
      {
        type: 'text',
        text: 'Puedo comparar películas con sus libros.',
      },
    ]);

    const mcp = createMcp();

    const agent = new BookComparisonAgent(llm, mcp);

    const result = await agent.run({
      input: '¿Qué puedes hacer?',
    });

    expect(result.text).toBe(
      'Puedo comparar películas con sus libros.',
    );

    expect(mcp.callTool).not.toHaveBeenCalled();
  });

  it('ejecuta compare_movie_book y devuelve un veredicto', async () => {
    const llm = new FakeLLM([
      {
        type: 'tool_call',
        id: 'call-1',
        name: 'compare_movie_book',
        arguments: {
          movie: {
            title: 'Dune',
            original_title: 'Dune',
            rating: 8.1,
          },
          book_title: 'Dune',
        },
      },
      {
        type: 'text',
        text:
          'Sí vale la pena ver Dune: la película tiene 8.1/10 y el libro 9/10.',
      },
    ]);

    const mcp = createMcp();

    const agent = new BookComparisonAgent(llm, mcp);

    const result = await agent.run({
      input: 'Compara Dune con el libro',
      movieContext: 'Dune, rating TMDB 8.1/10',
    });

    expect(mcp.callTool).toHaveBeenCalledWith(
      'compare_movie_book',
      {
        movie: {
          title: 'Dune',
          original_title: 'Dune',
          rating: 8.1,
        },
        book_title: 'Dune',
      },
    );

    expect(result.text).toContain(
      'Sí vale la pena ver Dune',
    );
  });

  it('solo expone herramientas de Books', async () => {
    const llm = new FakeLLM([
      {
        type: 'text',
        text: 'ok',
      },
    ]);

    const mcp = createMcp();

    const agent = new BookComparisonAgent(llm, mcp);

    await agent.run({
      input: 'Hola',
    });

    const request = llm.requests[0];

    expect(request?.tools?.map((tool) => tool.name)).toEqual([
      'search_book',
      'get_book_details',
      'compare_movie_book',
    ]);

    expect(
      request?.tools?.some(
        (tool) => tool.name === 'search_movie',
      ),
    ).toBe(false);
  });

  it('incluye el contexto de película en el prompt', async () => {
    const llm = new FakeLLM([
      {
        type: 'text',
        text: 'ok',
      },
    ]);

    const mcp = createMcp();

    const agent = new BookComparisonAgent(llm, mcp);

    await agent.run({
      input: 'Compara con el libro',
      movieContext:
        'Título: Dune. Rating: 8.1. Basada en libro.',
    });

    const request = llm.requests[0];

    expect(
      request?.messages.some(
        (message) =>
          message.role === 'system' &&
          message.content.includes(
            'Título: Dune. Rating: 8.1',
          ),
      ),
    ).toBe(true);
  });

  it('respeta AbortSignal', async () => {
    const controller = new AbortController();
    controller.abort();

    const llm = new FakeLLM([
      {
        type: 'text',
        text: 'no debería aparecer',
      },
    ]);

    const mcp = createMcp();

    const agent = new BookComparisonAgent(llm, mcp);

    const result = await agent.run({
      input: 'Compara Dune',
      signal: controller.signal,
    });

    expect(result.text).toBe('');
    expect(llm.requests).toHaveLength(0);
  });
});
