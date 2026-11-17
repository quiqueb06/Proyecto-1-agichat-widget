import type { LLMClient, LLMMessage, LLMTool, LLMToolCall } from '../llm/types.js';
import type { AgentEvent, AgentRequest, AgentRunner } from './types.js';
import type { MovieAgent } from './MovieAgent.js';
import type { BookComparisonAgent } from './BookComparisonAgent.js';

const ROUTING_TOOLS: LLMTool[] = [
  {
    name: 'delegate_movies',
    description: 'Usa este subagente para buscar, recomendar u obtener información de películas.',
    inputSchema: {
      type: 'object',
      properties: {
        request: {
          type: 'string',
        },
      },
      required: ['request'],
    },
  },
  {
    name: 'delegate_comparison',
    description:
      'Usa este flujo cuando el usuario quiera comparar una película con su libro o saber si vale la pena verla respecto al libro.',
    inputSchema: {
      type: 'object',
      properties: {
        request: {
          type: 'string',
        },
      },
      required: ['request'],
    },
  },
];

const SYSTEM_PROMPT = `
Eres el orquestador principal de AGIChat.

Tu trabajo es conversar con el usuario y delegar tareas a subagentes especializados.

Tienes dos capacidades principales:

1. Películas:
   - buscar películas;
   - recomendar películas;
   - obtener rating, sinopsis, géneros, póster e IMDb.

2. Libros y comparación:
   - buscar el libro relacionado con una película;
   - comparar ratings de película y libro;
   - decidir de forma razonada si vale la pena ver la película.

Usa delegate_movies para solicitudes únicamente relacionadas con películas.

Usa delegate_comparison cuando el usuario quiera comparar una película con un libro,
pregunte por la adaptación o quiera saber si vale la pena verla respecto al libro.

Si el usuario solamente conversa o pregunta por tus capacidades, responde directamente.

No inventes información que debería provenir de TMDB o Google Books.
Responde en español.
`.trim();

const CAPABILITIES_MESSAGE =
  'Puedo recomendarte películas, compararlas con sus libros cuando exista una referencia adecuada y ayudarte a abrir IMDb o Google Books.';

function historyToLLMMessages(history: AgentRequest['history']): LLMMessage[] {
  return history
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({
      role: message.role as 'user' | 'assistant',
      content: message.content,
    }));
}

function requestFromCall(call: LLMToolCall, fallback: string): string {
  const request = call.arguments.request;

  return typeof request === 'string' && request.trim() ? request : fallback;
}

function wantsOpen(input: string, target: 'imdb' | 'books'): boolean {
  const normalized = input.toLowerCase();

  const asksToOpen = /\b(abrir|abre|ábreme|mostrar|muestra|ir a|llévame|llevarme)\b/i.test(
    normalized,
  );

  if (!asksToOpen) {
    return false;
  }

  if (target === 'imdb') {
    return normalized.includes('imdb');
  }

  return normalized.includes('google books') || normalized.includes('libro');
}

export class Orchestrator implements AgentRunner {
  constructor(
    private readonly llm: LLMClient,
    private readonly movieAgent: MovieAgent,
    private readonly bookAgent: BookComparisonAgent,
  ) {}

  async *respond(request: AgentRequest): AsyncIterable<AgentEvent> {
    if (request.signal.aborted) {
      return;
    }

    if (request.history.length === 0) {
      yield {
        type: 'text',
        delta: `${CAPABILITIES_MESSAGE}\n\n`,
      };
    }

    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: SYSTEM_PROMPT,
      },
      ...historyToLLMMessages(request.history),
      {
        role: 'user',
        content: request.input.content,
      },
    ];

    let routerText = '';
    const routingCalls: LLMToolCall[] = [];

    for await (const event of this.llm.stream({
      messages,
      tools: ROUTING_TOOLS,
      signal: request.signal,
    })) {
      if (request.signal.aborted) {
        return;
      }

      if (event.type === 'text') {
        routerText += event.delta;
      } else {
        routingCalls.push(event.call);
      }
    }

    if (routingCalls.length === 0) {
      if (routerText.trim()) {
        yield {
          type: 'text',
          delta: routerText.trim(),
        };
      }

      return;
    }

    const route = routingCalls[0];

    if (!route) {
      return;
    }

    if (route.name === 'delegate_movies') {
      const delegatedRequest = requestFromCall(route, request.input.content);

      const result = await this.movieAgent.run({
        input: delegatedRequest,
        signal: request.signal,
      });

      if (result.text) {
        yield {
          type: 'text',
          delta: result.text,
        };
      }

      if (result.references.imdbUrl && wantsOpen(request.input.content, 'imdb')) {
        yield {
          type: 'action',
          action: {
            type: 'open_url',
            url: result.references.imdbUrl,
            label: 'IMDb',
          },
        };
      }

      return;
    }

    if (route.name === 'delegate_comparison') {
      const delegatedRequest = requestFromCall(route, request.input.content);

      // Primero obtenemos contexto fiable de la película.
      // La respuesta de MovieAgent NO se muestra directamente al usuario
      // en este flujo; se usa únicamente como contexto para Books.
      const movie = await this.movieAgent.run({
        input: delegatedRequest,
        signal: request.signal,
      });

      if (request.signal.aborted) {
        return;
      }

      const comparison = await this.bookAgent.run({
        input: delegatedRequest,
        movieContext: movie.context || movie.text,
        signal: request.signal,
      });

      // En comparación mostramos solamente la respuesta final del
      // BookComparisonAgent para evitar dos respuestas consecutivas.
      if (comparison.text) {
        yield {
          type: 'text',
          delta: comparison.text,
        };
      }

      if (movie.references.imdbUrl && wantsOpen(request.input.content, 'imdb')) {
        yield {
          type: 'action',
          action: {
            type: 'open_url',
            url: movie.references.imdbUrl,
            label: 'IMDb',
          },
        };
      }

      if (comparison.references.googleBooksUrl && wantsOpen(request.input.content, 'books')) {
        yield {
          type: 'action',
          action: {
            type: 'open_url',
            url: comparison.references.googleBooksUrl,
            label: 'Google Books',
          },
        };
      }

      return;
    }

    throw new Error(`El orquestador recibió una delegación desconocida: ${route.name}`);
  }
}
