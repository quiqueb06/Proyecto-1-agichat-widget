import { afterEach, describe, expect, it } from 'vitest';
import { EchoAgent } from '../agent/EchoAgent.js';
import type { AgentRunner } from '../agent/types.js';
import { loadConfig } from '../config.js';
import { createGateway } from '../gateway/server.js';
import type { Gateway } from '../gateway/server.js';
import { silentLogger } from '../logger.js';
import { createSecurityContext } from '../security/SecurityContext.js';
import type { ChatModel } from './ChatModel.js';
import { MALICIOUS_BOOK_TOOL_DATA } from './fixtures.js';
import { createInProcessTarget, createWebSocketTarget } from './targets.js';
import type { EvalCase } from './types.js';

const evalCase = (turns: string[], extra: Partial<EvalCase> = {}): EvalCase => ({
  id: 't',
  category: 'funcional',
  title: 't',
  turns,
  checks: [],
  ...extra,
});

function recordingModel(reply: string | ((n: number) => string)) {
  const seen: number[] = [];
  const model: ChatModel = {
    name: 'grabadora',
    async complete(messages) {
      seen.push(messages.length);
      return typeof reply === 'string' ? reply : reply(seen.length);
    },
  };
  return { model, seen };
}

describe('createInProcessTarget', () => {
  it('corre los turnos en la misma conversación y junta respuestas y acciones', async () => {
    const { model, seen } = recordingModel((n) =>
      n === 2 ? 'segunda\n[[abrir:https://www.imdb.com/|IMDb]]' : 'primera',
    );
    const target = createInProcessTarget('fake', model);

    const { transcript } = await target.run(evalCase(['hola', 'abre imdb']));

    expect(target.description).toBe('fake · grabadora');
    expect(transcript.replies).toEqual(['primera', 'segunda']);
    expect(transcript.actions).toEqual([
      { type: 'open_url', url: 'https://www.imdb.com/', label: 'IMDb' },
    ]);
    // el segundo turno lleva el historial: system + user + assistant + user
    expect(seen).toEqual([2, 4]);
  });

  it('registra los guardrails que se activan y usa un canary nuevo por caso', async () => {
    const { model } = recordingModel('![x](https://evil.example/a.png)');
    const target = createInProcessTarget('fake', model);

    const first = await target.run(evalCase(['hola']));
    const second = await target.run(evalCase(['hola']));

    expect(first.transcript.guardEvents).toEqual([
      { type: 'url_removed', urls: ['https://evil.example/a.png'] },
    ]);
    expect(first.context.detector).not.toBe(second.context.detector);
  });

  it('usa los datos de herramientas del caso (inyección indirecta)', async () => {
    let sent = '';
    const model: ChatModel = {
      name: 'm',
      async complete(messages) {
        sent = messages.at(-1)!.content;
        return 'ok';
      },
    };
    await createInProcessTarget('groq', model).run(
      evalCase(['Compara Dune'], { toolData: MALICIOUS_BOOK_TOOL_DATA }),
    );
    expect(sent).toContain('sospechoso="true"');
  });

  it('sin guardrails deja pasar todo (para comprobar que las evals detectan fallas)', async () => {
    const { model } = recordingModel('AGICANARY-0123456789abcdef');
    const { transcript } = await createInProcessTarget('fake', model, { guarded: false }).run(
      evalCase(['hola']),
    );
    expect(transcript.replies).toEqual(['AGICANARY-0123456789abcdef']);
  });
});

describe('createWebSocketTarget', () => {
  let gateway: Gateway | undefined;

  afterEach(async () => {
    await gateway?.close();
    gateway = undefined;
  });

  async function start(agent: AgentRunner) {
    const config = loadConfig({ PORT: '0', HOST: '127.0.0.1', STREAM_THROTTLE_MS: '0' });
    gateway = createGateway({ config, agent, logger: silentLogger });
    const { port } = await gateway.listen();
    return `ws://127.0.0.1:${port}/ws`;
  }

  it('habla con el gateway real por websocket y junta respuestas y acciones', async () => {
    const security = createSecurityContext();
    const endpoint = await start(
      security.guardAgent(new EchoAgent({ delayMs: 0, chunkSize: 1000 })),
    );
    const target = createWebSocketTarget({ endpoint, settleMs: 20 });

    const { transcript, context } = await target.run(evalCase(['hola', 'abrir imdb']));

    expect(target.kind).toBe('ws');
    expect(target.description).toBe(`ws · ${endpoint}`);
    expect(transcript.replies).toHaveLength(2);
    expect(transcript.replies[0]).toContain('hola');
    expect(transcript.actions).toEqual([
      { type: 'open_url', url: 'https://www.imdb.com/', label: 'IMDb' },
    ]);
    expect(context.target).toBe('ws');
  });

  it('guarda los frames de error que manda el servidor', async () => {
    const endpoint = await start(new EchoAgent({ delayMs: 0 }));
    const target = createWebSocketTarget({ endpoint, settleMs: 50 });

    const { transcript } = await target.run(evalCase(['   ']));

    expect(transcript.errors).toEqual(['Mensaje vacío.']);
  });

  it('falla si el servidor no contesta a tiempo', async () => {
    const endpoint = await start({
      respond: () => ({
        [Symbol.asyncIterator]: () => ({ next: () => new Promise(() => {}) }),
      }),
    });
    const target = createWebSocketTarget({ endpoint, turnTimeoutMs: 50 });

    await expect(target.run(evalCase(['hola']))).rejects.toThrow(/no respondió/);
  });

  it('falla si no se puede conectar', async () => {
    const target = createWebSocketTarget({ endpoint: 'ws://127.0.0.1:1/ws', turnTimeoutMs: 500 });
    await expect(target.run(evalCase(['hola']))).rejects.toThrow();
  });
});
