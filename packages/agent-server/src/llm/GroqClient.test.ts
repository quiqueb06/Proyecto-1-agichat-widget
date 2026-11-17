import { describe, expect, it, vi } from 'vitest';
import { GroqClient } from './GroqClient.js';

function streamingResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }

      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
    },
  });
}

async function collect<T>(iterable: AsyncIterable<T>): Promise<T[]> {
  const result: T[] = [];

  for await (const item of iterable) {
    result.push(item);
  }

  return result;
}

describe('GroqClient', () => {
  it('procesa texto en streaming', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        streamingResponse([
          'data: {"choices":[{"delta":{"content":"Hola"}}]}\n\n',
          'data: {"choices":[{"delta":{"content":" mundo"}}]}\n\n',
          'data: [DONE]\n\n',
        ]),
      );

    const client = new GroqClient({
      apiKey: 'test-key',
      model: 'test-model',
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const events = await collect(
      client.stream({
        messages: [
          {
            role: 'user',
            content: 'Hola',
          },
        ],
      }),
    );

    expect(events).toEqual([
      {
        type: 'text',
        delta: 'Hola',
      },
      {
        type: 'text',
        delta: ' mundo',
      },
    ]);

    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it('envía mensajes y herramientas con el formato esperado', async () => {
    const fetchFn = vi.fn().mockResolvedValue(streamingResponse(['data: [DONE]\n\n']));

    const client = new GroqClient({
      apiKey: 'secret',
      model: 'test-model',
      baseUrl: 'https://groq.test/v1',
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    await collect(
      client.stream({
        messages: [
          {
            role: 'system',
            content: 'Eres un agente.',
          },
          {
            role: 'user',
            content: 'Busca Dune',
          },
        ],
        tools: [
          {
            name: 'search_movie',
            description: 'Busca una película',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                },
              },
            },
          },
        ],
      }),
    );

    const [, options] = fetchFn.mock.calls[0] as [string, RequestInit];

    expect(fetchFn.mock.calls[0]?.[0]).toBe('https://groq.test/v1/chat/completions');

    expect(options.headers).toEqual({
      Authorization: 'Bearer secret',
      'Content-Type': 'application/json',
    });

    expect(JSON.parse(options.body as string)).toEqual({
      model: 'test-model',
      messages: [
        {
          role: 'system',
          content: 'Eres un agente.',
        },
        {
          role: 'user',
          content: 'Busca Dune',
        },
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'search_movie',
            description: 'Busca una película',
            parameters: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                },
              },
            },
          },
        },
      ],
      tool_choice: 'auto',
      stream: true,
    });
  });

  it('reconstruye un tool call fragmentado', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      streamingResponse([
        `data: ${JSON.stringify({
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'call-1',
                    function: {
                      name: 'search_',
                      arguments: '{"query":"Du',
                    },
                  },
                ],
              },
            },
          ],
        })}\n\n`,
        `data: ${JSON.stringify({
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    function: {
                      name: 'movie',
                      arguments: 'ne"}',
                    },
                  },
                ],
              },
            },
          ],
        })}\n\n`,
        'data: [DONE]\n\n',
      ]),
    );

    const client = new GroqClient({
      apiKey: 'test',
      model: 'test',
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const events = await collect(
      client.stream({
        messages: [
          {
            role: 'user',
            content: 'Busca Dune',
          },
        ],
      }),
    );

    expect(events).toEqual([
      {
        type: 'tool_call',
        call: {
          id: 'call-1',
          name: 'search_movie',
          arguments: {
            query: 'Dune',
          },
        },
      },
    ]);
  });

  it('reintenta después de un 429', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);

    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('Rate limit', {
          status: 429,
          headers: {
            'retry-after': '2',
          },
        }),
      )
      .mockResolvedValueOnce(
        streamingResponse([
          'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
          'data: [DONE]\n\n',
        ]),
      );

    const client = new GroqClient({
      apiKey: 'test',
      model: 'test',
      maxRetries: 2,
      fetchFn: fetchFn as unknown as typeof fetch,
      sleep,
    });

    const events = await collect(
      client.stream({
        messages: [],
      }),
    );

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2000);

    expect(events).toEqual([
      {
        type: 'text',
        delta: 'ok',
      },
    ]);
  });

  it('lanza error cuando Groq responde con error definitivo', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response('Servidor caído', {
        status: 500,
      }),
    );

    const client = new GroqClient({
      apiKey: 'test',
      model: 'test',
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    await expect(
      collect(
        client.stream({
          messages: [],
        }),
      ),
    ).rejects.toThrow('Groq respondió 500');
  });

  it('lanza error si Groq devuelve argumentos inválidos en un tool call', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      streamingResponse([
        `data: ${JSON.stringify({
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'call-1',
                    function: {
                      name: 'search_movie',
                      arguments: '{invalid-json',
                    },
                  },
                ],
              },
            },
          ],
        })}\n\n`,
        'data: [DONE]\n\n',
      ]),
    );

    const client = new GroqClient({
      apiKey: 'test',
      model: 'test',
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    await expect(
      collect(
        client.stream({
          messages: [],
        }),
      ),
    ).rejects.toThrow('Groq devolvió argumentos inválidos para la herramienta search_movie.');
  });

  it('no hace requests si ya está abortado', async () => {
    const controller = new AbortController();
    controller.abort();

    const fetchFn = vi.fn();

    const client = new GroqClient({
      apiKey: 'test',
      model: 'test',
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const events = await collect(
      client.stream({
        messages: [],
        signal: controller.signal,
      }),
    );

    expect(events).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
