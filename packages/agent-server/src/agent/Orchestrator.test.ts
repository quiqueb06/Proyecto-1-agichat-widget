import { describe, expect, it, vi } from 'vitest';
import { FakeLLM } from '../llm/FakeLLM.js';
import type { AgentEvent, AgentRequest } from './types.js';
import { Orchestrator } from './Orchestrator.js';
import type { MovieAgent } from './MovieAgent.js';
import type { BookComparisonAgent } from './BookComparisonAgent.js';

async function collect(iterable: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];

  for await (const event of iterable) {
    events.push(event);
  }

  return events;
}

function request(content: string, history: AgentRequest['history'] = []): AgentRequest {
  return {
    sessionId: 'test-session',
    history,
    input: {
      id: 'message-1',
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
      status: 'complete',
    },
    signal: new AbortController().signal,
  };
}

function createMovieAgent(): MovieAgent {
  return {
    run: vi.fn().mockResolvedValue({
      text: 'Te recomiendo Dune.',
      context: JSON.stringify({
        title: 'Dune',
        rating: 8.1,
      }),
      references: {
        imdbUrl: 'https://www.imdb.com/title/tt1160419/',
        posterUrl: 'https://image.tmdb.org/t/p/w500/test.jpg',
      },
    }),
  } as unknown as MovieAgent;
}

function createBookAgent(): BookComparisonAgent {
  return {
    run: vi.fn().mockResolvedValue({
      text: 'Sí vale la pena verla; la película tiene 8.1/10 y el libro 9/10.',
      context: '',
      references: {
        googleBooksUrl: 'https://books.google.com/books?id=dune',
      },
    }),
  } as unknown as BookComparisonAgent;
}

describe('Orchestrator', () => {
  it('anuncia sus capacidades en el primer turno', async () => {
    const llm = new FakeLLM([
      {
        type: 'text',
        text: 'Hola, ¿qué película buscas?',
      },
    ]);

    const orchestrator = new Orchestrator(llm, createMovieAgent(), createBookAgent());

    const events = await collect(orchestrator.respond(request('Hola')));

    expect(events[0]).toEqual({
      type: 'text',
      delta: expect.stringContaining('Puedo recomendarte películas'),
    });

    expect(events[1]).toEqual({
      type: 'text',
      delta: 'Hola, ¿qué película buscas?',
    });
  });

  it('delega recomendaciones al MovieAgent', async () => {
    const llm = new FakeLLM([
      {
        type: 'tool_call',
        id: 'route-1',
        name: 'delegate_movies',
        arguments: {
          request: 'Recomiéndame una película de ciencia ficción',
        },
      },
    ]);

    const movieAgent = createMovieAgent();

    const orchestrator = new Orchestrator(llm, movieAgent, createBookAgent());

    const events = await collect(
      orchestrator.respond(
        request('Recomiéndame una película de ciencia ficción', [
          {
            id: 'old-1',
            role: 'assistant',
            content: 'Conversación previa',
            createdAt: new Date().toISOString(),
            status: 'complete',
          },
        ]),
      ),
    );

    expect(movieAgent.run).toHaveBeenCalledWith({
      input: 'Recomiéndame una película de ciencia ficción',
      signal: expect.any(AbortSignal),
    });

    expect(events).toEqual([
      {
        type: 'text',
        delta: 'Te recomiendo Dune.',
      },
    ]);
  });

  it('usa MovieAgent y BookComparisonAgent para comparar', async () => {
    const llm = new FakeLLM([
      {
        type: 'tool_call',
        id: 'route-1',
        name: 'delegate_comparison',
        arguments: {
          request: 'Compara Dune con su libro',
        },
      },
    ]);

    const movieAgent = createMovieAgent();
    const bookAgent = createBookAgent();

    const orchestrator = new Orchestrator(llm, movieAgent, bookAgent);

    const events = await collect(
      orchestrator.respond(
        request('Compara Dune con su libro', [
          {
            id: 'old-1',
            role: 'assistant',
            content: 'Mensaje anterior',
            createdAt: new Date().toISOString(),
            status: 'complete',
          },
        ]),
      ),
    );

    expect(movieAgent.run).toHaveBeenCalled();

    expect(bookAgent.run).toHaveBeenCalledWith({
      input: 'Compara Dune con su libro',
      movieContext: expect.stringContaining('Dune'),
      signal: expect.any(AbortSignal),
    });

    expect(events).toEqual([
      {
        type: 'text',
        delta: 'Sí vale la pena verla; la película tiene 8.1/10 y el libro 9/10.',
      },
    ]);
  });

  it('genera action para IMDb cuando el usuario pide abrirlo', async () => {
    const llm = new FakeLLM([
      {
        type: 'tool_call',
        id: 'route-1',
        name: 'delegate_movies',
        arguments: {
          request: 'Abre IMDb de Dune',
        },
      },
    ]);

    const orchestrator = new Orchestrator(llm, createMovieAgent(), createBookAgent());

    const events = await collect(
      orchestrator.respond(
        request('Abre IMDb de Dune', [
          {
            id: 'old-1',
            role: 'assistant',
            content: 'Anterior',
            createdAt: new Date().toISOString(),
            status: 'complete',
          },
        ]),
      ),
    );

    expect(events).toContainEqual({
      type: 'action',
      action: {
        type: 'open_url',
        url: 'https://www.imdb.com/title/tt1160419/',
        label: 'IMDb',
      },
    });
  });

  it('genera action para Google Books cuando se solicita', async () => {
    const llm = new FakeLLM([
      {
        type: 'tool_call',
        id: 'route-1',
        name: 'delegate_comparison',
        arguments: {
          request: 'Compara Dune y abre Google Books',
        },
      },
    ]);

    const orchestrator = new Orchestrator(llm, createMovieAgent(), createBookAgent());

    const events = await collect(
      orchestrator.respond(
        request('Compara Dune y abre Google Books', [
          {
            id: 'old-1',
            role: 'assistant',
            content: 'Anterior',
            createdAt: new Date().toISOString(),
            status: 'complete',
          },
        ]),
      ),
    );

    expect(events).toContainEqual({
      type: 'action',
      action: {
        type: 'open_url',
        url: 'https://books.google.com/books?id=dune',
        label: 'Google Books',
      },
    });
  });

  it('no abre links si el usuario no lo solicita', async () => {
    const llm = new FakeLLM([
      {
        type: 'tool_call',
        id: 'route-1',
        name: 'delegate_movies',
        arguments: {
          request: 'Recomiéndame Dune',
        },
      },
    ]);

    const orchestrator = new Orchestrator(llm, createMovieAgent(), createBookAgent());

    const events = await collect(
      orchestrator.respond(
        request('Recomiéndame Dune', [
          {
            id: 'old-1',
            role: 'assistant',
            content: 'Anterior',
            createdAt: new Date().toISOString(),
            status: 'complete',
          },
        ]),
      ),
    );

    expect(events.some((event) => event.type === 'action')).toBe(false);
  });

  it('respeta AbortSignal', async () => {
    const controller = new AbortController();
    controller.abort();

    const llm = new FakeLLM([
      {
        type: 'text',
        text: 'No debería aparecer',
      },
    ]);

    const orchestrator = new Orchestrator(llm, createMovieAgent(), createBookAgent());

    const req = request('Hola');
    req.signal = controller.signal;

    const events = await collect(orchestrator.respond(req));

    expect(events).toEqual([]);
    expect(llm.requests).toHaveLength(0);
  });
});
