import { describe, expect, it, vi } from 'vitest';
import type { AgentEvent, AgentRunner } from '../agent/types.js';
import { GuardedAgent, LEAK_REPLY } from './GuardedAgent.js';
import { createSecurityContext } from './SecurityContext.js';
import { CANARY_PREFIX } from './systemPrompt.js';

const BASE =
  'Eres el agente de películas de AGIChat y solo usas datos de TMDB para responder. ' +
  'Cuando el usuario pida una recomendación buscas primero en TMDB y luego explicas por qué.';

async function textOf(agent: AgentRunner) {
  let text = '';
  for await (const event of agent.respond({
    sessionId: 's',
    history: [],
    input: {
      id: 'u',
      role: 'user',
      content: 'hola',
      createdAt: new Date(0).toISOString(),
      status: 'complete',
    },
    signal: new AbortController().signal,
  })) {
    if (event.type === 'text') text += event.delta;
  }
  return text;
}

function echoOf(content: string): AgentRunner {
  return {
    async *respond(): AsyncIterable<AgentEvent> {
      yield { type: 'text', delta: content };
    },
  };
}

describe('createSecurityContext', () => {
  it('genera un canary por contexto', () => {
    expect(createSecurityContext().canary).toMatch(new RegExp(`^${CANARY_PREFIX}-`));
    expect(createSecurityContext({ canary: `${CANARY_PREFIX}-aaaaaaaaaaaaaaaa` }).canary).toBe(
      `${CANARY_PREFIX}-aaaaaaaaaaaaaaaa`,
    );
  });

  it('hardenPrompt endurece el prompt y lo registra como protegido', async () => {
    const security = createSecurityContext();
    const prompt = security.hardenPrompt(BASE);
    expect(prompt).toContain(security.canary);

    // si el modelo repite el prompt, el agente envuelto lo bloquea
    expect(await textOf(security.guardAgent(echoOf(prompt)))).toBe(LEAK_REPLY);
    expect(await textOf(security.guardAgent(echoOf(`Dijeron: ${BASE}`)))).toBe(LEAK_REPLY);
  });

  it('guardAgent devuelve un GuardedAgent que reporta a onEvent y al logger', async () => {
    const onEvent = vi.fn();
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const security = createSecurityContext({ onEvent, logger });
    const agent = security.guardAgent(echoOf(security.canary));

    expect(agent).toBeInstanceOf(GuardedAgent);
    await textOf(agent);
    expect(onEvent).toHaveBeenCalledWith({ type: 'output_blocked', reasons: ['canary'] });
    expect(logger.warn).toHaveBeenCalled();
  });

  it('guardTools aplica la allowlist del subagente y registra las violaciones', async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const security = createSecurityContext({ logger });
    const inner = { callTool: vi.fn(async () => ({ isError: false, text: '{}' })) };

    const tools = security.guardTools(inner, 'movies');
    const result = await tools.callTool('search_book', { titulo: 'Dune' });

    expect(result.isError).toBe(true);
    expect(inner.callTool).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith('herramienta_bloqueada', {
      agent: 'movies',
      tool: 'search_book',
      reason: 'tool_not_allowed',
    });
  });

  it('guardMcpClient envuelve un cliente MCP completo con la allowlist del subagente', async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const security = createSecurityContext({ logger });
    const inner = {
      connect: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
      listTools: vi.fn(async () => [{ name: 'search_book', description: '', inputSchema: {} }]),
      callTool: vi.fn(async () => ({ isError: false, text: '{}' })),
    };

    const client = security.guardMcpClient(inner, 'books');

    expect((await client.listTools()).map((t) => t.name)).toEqual(['search_book']);
    await client.callTool('search_movie', { query: 'x' });
    expect(logger.warn).toHaveBeenCalledWith('herramienta_bloqueada', {
      agent: 'books',
      tool: 'search_movie',
      reason: 'tool_not_allowed',
    });
  });

  it('expone el detector de fugas con el canary y los prompts protegidos', () => {
    const security = createSecurityContext();
    security.hardenPrompt(BASE);
    expect(security.detector.inspect(security.canary).leaked).toBe(true);
    expect(security.detector.inspect(`Dijeron: ${BASE}`).reasons).toContain('prompt_quote');
  });

  it('expone wrapUntrusted para delimitar datos que no vienen de una herramienta', () => {
    expect(createSecurityContext().wrapUntrusted('tmdb', { a: 1 })).toContain(
      'DATOS_NO_CONFIABLES',
    );
  });
});
