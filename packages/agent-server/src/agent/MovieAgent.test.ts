import { describe, expect, it, vi } from 'vitest';
import { FakeLLM } from '../llm/FakeLLM.js';
import type { MCPClientLike } from '../mcp/types.js';
import { MovieAgent } from './MovieAgent.js';

function createMcp(): MCPClientLike {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),

    listTools: vi.fn().mockResolvedValue([
      {
        name: 'search_movie',
        description: 'Busca películas',
        inputSchema: {
          type: 'object',
        },
      },
      {
        name: 'get_movie_details',
        description: 'Obtiene detalles',
        inputSchema: {
          type: 'object',
        },
      },
      {
        name: 'recommend_movies',
        description: 'Recomienda películas',
        inputSchema: {
          type: 'object',
        },
      },
      {
        name: 'search_book',
        description: 'No debe llegar al MovieAgent',
        inputSchema: {
          type: 'object',
        },
      },
    ]),

    callTool: vi.fn().mockResolvedValue({
      isError: false,
      structuredContent: {
        results: [
          {
            id: 438631,
            title: 'Dune',
            release_year: 2021,
            poster_url:
              'https://image.tmdb.org/t/p/w500/test.jpg',
          },
        ],
      },
      text: '{"results":[{"id":438631,"title":"Dune"}]}',
    }),
  };
}

describe('MovieAgent', () => {
  it('responde directamente cuando el LLM no necesita herramientas', async () => {
    const llm = new FakeLLM([
      {
        type: 'text',
        text: 'Puedo ayudarte con películas.',
      },
    ]);

    const mcp = createMcp();
    const agent = new MovieAgent(llm, mcp);

    const result = await agent.run({
      input: 'Hola',
    });

    expect(result.text).toBe(
      'Puedo ayudarte con películas.',
    );

    expect(mcp.callTool).not.toHaveBeenCalled();
  });

  it('ejecuta una herramienta y continúa la conversación', async () => {
    const llm = new FakeLLM([
      {
        type: 'tool_call',
        id: 'call-1',
        name: 'search_movie',
        arguments: {
          query: 'Dune',
        },
      },
      {
        type: 'text',
        text: 'Encontré Dune (2021).',
      },
    ]);

    const mcp = createMcp();
    const agent = new MovieAgent(llm, mcp);

    const result = await agent.run({
      input: 'Busca Dune',
    });

    expect(mcp.callTool).toHaveBeenCalledWith(
      'search_movie',
      {
        query: 'Dune',
      },
    );

    expect(result.text).toBe('Encontré Dune (2021).');
  });

  it('solo expone herramientas de TMDB al LLM', async () => {
    const llm = new FakeLLM([
      {
        type: 'text',
        text: 'ok',
      },
    ]);

    const mcp = createMcp();
    const agent = new MovieAgent(llm, mcp);

    await agent.run({
      input: 'Hola',
    });

    const request = llm.requests[0];

    expect(request?.tools?.map((tool) => tool.name)).toEqual([
      'search_movie',
      'get_movie_details',
      'recommend_movies',
    ]);

    expect(
      request?.tools?.some(
        (tool) => tool.name === 'search_book',
      ),
    ).toBe(false);
  });

  it('respeta AbortSignal', async () => {
    const controller = new AbortController();
    controller.abort();

    const llm = new FakeLLM([
      {
        type: 'text',
        text: 'no debería usarse',
      },
    ]);

    const mcp = createMcp();
    const agent = new MovieAgent(llm, mcp);

    const result = await agent.run({
      input: 'Hola',
      signal: controller.signal,
    });

    expect(result.text).toBe('');
    expect(llm.requests).toHaveLength(0);
  });
});
