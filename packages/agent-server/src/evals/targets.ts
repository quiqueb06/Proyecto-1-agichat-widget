import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import type { AgentRunner } from '../agent/types.js';
import { agentActionSchema } from '../protocol/frames.js';
import type { Message } from '../protocol/message.js';
import type { GuardEvent } from '../security/GuardedAgent.js';
import { LeakDetector } from '../security/leakDetector.js';
import { createSecurityContext } from '../security/SecurityContext.js';
import type { ChatModel } from './ChatModel.js';
import { DEFAULT_TOOL_DATA } from './fixtures.js';
import { ProbeAgent } from './ProbeAgent.js';
import type { CaseRun, EvalTarget, Transcript } from './types.js';

function userMessage(content: string): Message {
  return {
    id: randomUUID(),
    role: 'user',
    content,
    createdAt: new Date().toISOString(),
    status: 'complete',
  };
}

export interface InProcessOptions {
  // false = sin guardrails. solo sirve para comprobar que las evals sí detectan fallas
  guarded?: boolean;
}

// corre el agente de evaluación en este proceso, con el llm que se le pase.
// cada caso usa un SecurityContext nuevo (canary nuevo)
export function createInProcessTarget(
  kind: 'fake' | 'groq',
  model: ChatModel,
  options: InProcessOptions = {},
): EvalTarget {
  const guarded = options.guarded ?? true;
  return {
    kind,
    description: `${kind} · ${model.name}${guarded ? '' : ' · SIN guardrails'}`,
    async run(evalCase): Promise<CaseRun> {
      const guardEvents: GuardEvent[] = [];
      const security = createSecurityContext({ onEvent: (event) => guardEvents.push(event) });
      const probe = new ProbeAgent({
        model,
        security,
        toolData: evalCase.toolData ?? DEFAULT_TOOL_DATA,
      });
      const agent: AgentRunner = guarded ? security.guardAgent(probe) : probe;
      const transcript: Transcript = { replies: [], actions: [], guardEvents, errors: [] };
      const history: Message[] = [];

      for (const turn of evalCase.turns) {
        const input = userMessage(turn);
        let reply = '';
        for await (const event of agent.respond({
          sessionId: evalCase.id,
          history: [...history],
          input,
          signal: new AbortController().signal,
        })) {
          if (event.type === 'text') reply += event.delta;
          else transcript.actions.push(event.action);
        }
        transcript.replies.push(reply);
        history.push(input, { ...userMessage(reply), role: 'assistant' });
      }

      return { transcript, context: { detector: security.detector, target: kind } };
    },
  };
}

export interface WebSocketTargetOptions {
  endpoint: string;
  // cabecera Origin (el gateway la revisa si ALLOWED_ORIGINS no es "*")
  origin?: string;
  turnTimeoutMs?: number;
  // espera después de cada respuesta para recibir el frame de error que llega detrás
  settleMs?: number;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// corre los casos contra un servidor real (local o desplegado), hablando el protocolo v2
// de docs/TRANSPORT.md. no conocemos su canary ni su prompt: el detector busca cualquier
// token con el prefijo del canary, las reglas de seguridad y los delimitadores
export function createWebSocketTarget(options: WebSocketTargetOptions): EvalTarget {
  const turnTimeoutMs = options.turnTimeoutMs ?? 90_000;
  const settleMs = options.settleMs ?? 300;
  return {
    kind: 'ws',
    description: `ws · ${options.endpoint}`,
    async run(evalCase): Promise<CaseRun> {
      const transcript: Transcript = { replies: [], actions: [], guardEvents: [], errors: [] };
      const socket = new WebSocket(
        options.endpoint,
        options.origin ? { headers: { Origin: options.origin } } : {},
      );
      let pending: ((content: string) => void) | null = null;

      socket.on('message', (data) => {
        const frame = JSON.parse(data.toString()) as {
          type: string;
          message?: Message;
          action?: unknown;
          error?: string;
        };
        if (frame.type === 'action') {
          const action = agentActionSchema.safeParse(frame.action);
          if (action.success) transcript.actions.push(action.data);
        } else if (frame.type === 'error') {
          transcript.errors.push(frame.error ?? 'error');
        } else if (
          frame.type === 'message' &&
          frame.message?.role === 'assistant' &&
          frame.message.status === 'complete'
        ) {
          pending?.(frame.message.content);
        }
      });

      try {
        await new Promise<void>((resolve, reject) => {
          socket.once('open', () => resolve());
          socket.once('error', reject);
        });
        for (const turn of evalCase.turns) {
          const reply = await new Promise<string>((resolve, reject) => {
            const timer = setTimeout(
              () => reject(new Error(`El servidor no respondió en ${turnTimeoutMs} ms`)),
              turnTimeoutMs,
            );
            pending = (content) => {
              clearTimeout(timer);
              resolve(content);
            };
            socket.send(JSON.stringify({ type: 'message', message: userMessage(turn) }));
          });
          pending = null;
          transcript.replies.push(reply);
          await wait(settleMs);
        }
      } finally {
        socket.close();
      }

      return { transcript, context: { detector: new LeakDetector(), target: 'ws' } };
    },
  };
}
