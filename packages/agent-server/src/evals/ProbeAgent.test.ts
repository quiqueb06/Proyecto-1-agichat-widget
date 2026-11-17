import { describe, expect, it } from 'vitest';
import type { AgentEvent, AgentRequest } from '../agent/types.js';
import type { Message } from '../protocol/message.js';
import { createSecurityContext } from '../security/SecurityContext.js';
import type { ChatMessage, ChatModel } from './ChatModel.js';
import { TOOL_RESULTS_PREFIX } from './ChatModel.js';
import { DEFAULT_TOOL_DATA } from './fixtures.js';
import { ProbeAgent, findToolData } from './ProbeAgent.js';

function message(role: Message['role'], content: string): Message {
  return {
    id: `${role}-${content}`,
    role,
    content,
    createdAt: new Date(0).toISOString(),
    status: 'complete',
  };
}

function request(
  content: string,
  history: Message[] = [],
  signal = new AbortController().signal,
): AgentRequest {
  return { sessionId: 's', history, input: message('user', content), signal };
}

function stubModel(reply: string) {
  const calls: ChatMessage[][] = [];
  const model: ChatModel = {
    name: 'stub',
    async complete(messages) {
      calls.push([...messages]);
      return reply;
    },
  };
  return { model, calls };
}

async function collect(events: AsyncIterable<AgentEvent>) {
  const out: AgentEvent[] = [];
  for await (const event of events) out.push(event);
  return out;
}

describe('findToolData', () => {
  it('encuentra la película por palabra clave, sin importar tildes ni mayúsculas', () => {
    expect(findToolData(DEFAULT_TOOL_DATA, '¿Vale la pena DUNE?')).toEqual({
      movies: [DEFAULT_TOOL_DATA.entries[0]!.movie],
      book: DEFAULT_TOOL_DATA.entries[0]!.book,
      bookSearched: true,
    });
  });

  it('devuelve recomendaciones cuando el usuario las pide', () => {
    expect(findToolData(DEFAULT_TOOL_DATA, 'Recomiéndame algo de ciencia ficción')?.movies).toEqual(
      DEFAULT_TOOL_DATA.recommendations,
    );
  });

  it('devuelve null si no hay datos para el mensaje', () => {
    expect(findToolData(DEFAULT_TOOL_DATA, 'hola')).toBeNull();
  });
});

describe('ProbeAgent', () => {
  it('manda el prompt endurecido con el canary como mensaje de sistema', async () => {
    const security = createSecurityContext();
    const { model, calls } = stubModel('hola');
    const agent = new ProbeAgent({ model, security, toolData: DEFAULT_TOOL_DATA });

    await collect(agent.respond(request('hola')));

    expect(calls[0]![0]!.role).toBe('system');
    expect(calls[0]![0]!.content).toContain(security.canary);
    expect(calls[0]!.at(-1)).toEqual({ role: 'user', content: 'hola' });
  });

  it('pasa el historial y los datos de herramientas delimitados como no confiables', async () => {
    const { model, calls } = stubModel('ok');
    const agent = new ProbeAgent({
      model,
      security: createSecurityContext(),
      toolData: DEFAULT_TOOL_DATA,
    });

    await collect(
      agent.respond(
        request('háblame de Dune', [
          message('user', 'hola'),
          message('assistant', 'qué tal'),
          message('system', 'x'),
        ]),
      ),
    );

    const sent = calls[0]!;
    expect(sent.slice(1, 3)).toEqual([
      { role: 'user', content: 'hola' },
      { role: 'assistant', content: 'qué tal' },
    ]);
    const data = sent.at(-1)!;
    expect(data.content.startsWith(TOOL_RESULTS_PREFIX)).toBe(true);
    expect(data.content).toContain('<<<DATOS_NO_CONFIABLES fuente="tmdb"');
    expect(data.content).toContain('<<<DATOS_NO_CONFIABLES fuente="google_books"');
  });

  it('dice found:false cuando la película no tiene libro', async () => {
    const { model, calls } = stubModel('ok');
    const agent = new ProbeAgent({
      model,
      security: createSecurityContext(),
      toolData: DEFAULT_TOOL_DATA,
    });
    await collect(agent.respond(request('Interstellar vs el libro')));
    expect(calls[0]!.at(-1)!.content).toContain('"found": false');
  });

  it('convierte las directivas [[abrir:url|etiqueta]] en acciones y las quita del texto', async () => {
    const { model } = stubModel(
      'Aquí tienes.\n[[abrir:https://www.imdb.com/title/tt1160419/|IMDb]]\n[[abrir: https://books.google.com/books?id=B1hSG45JCX4C | Google Books ]]',
    );
    const agent = new ProbeAgent({
      model,
      security: createSecurityContext(),
      toolData: DEFAULT_TOOL_DATA,
    });

    const events = await collect(agent.respond(request('abre imdb de Dune')));

    expect(events).toEqual([
      { type: 'text', delta: 'Aquí tienes.' },
      {
        type: 'action',
        action: { type: 'open_url', url: 'https://www.imdb.com/title/tt1160419/', label: 'IMDb' },
      },
      {
        type: 'action',
        action: {
          type: 'open_url',
          url: 'https://books.google.com/books?id=B1hSG45JCX4C',
          label: 'Google Books',
        },
      },
    ]);
  });

  it('usa "Abrir" como etiqueta si la directiva no trae una', async () => {
    const { model } = stubModel('[[abrir:https://www.imdb.com/]]');
    const agent = new ProbeAgent({
      model,
      security: createSecurityContext(),
      toolData: DEFAULT_TOOL_DATA,
    });
    expect(await collect(agent.respond(request('x')))).toEqual([
      {
        type: 'action',
        action: { type: 'open_url', url: 'https://www.imdb.com/', label: 'Abrir' },
      },
    ]);
  });

  it('no llama al modelo si la petición ya está abortada', async () => {
    const controller = new AbortController();
    controller.abort();
    const { model, calls } = stubModel('x');
    const agent = new ProbeAgent({
      model,
      security: createSecurityContext(),
      toolData: DEFAULT_TOOL_DATA,
    });
    expect(await collect(agent.respond(request('hola', [], controller.signal)))).toEqual([]);
    expect(calls).toEqual([]);
  });
});
