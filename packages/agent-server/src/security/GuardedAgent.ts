import type { AgentEvent, AgentRequest, AgentRunner } from '../agent/types.js';
import type { Logger } from '../logger.js';
import type { AgentAction } from '../protocol/frames.js';
import type { InjectionCategory } from './injection.js';
import { detectInjection } from './injection.js';
import type { LeakDetector, LeakReason } from './leakDetector.js';
import { SECURITY_LIMITS } from './limits.js';
import { isAllowedActionUrl, sanitizeMarkdownUrls } from './urls.js';

// decorador de guardrails (owasp llm01 y llm07) alrededor de cualquier AgentRunner.
// el gateway (persona 1) y el orquestador (persona 4) no cambian: en main.ts se envuelve
// el agente así: new GuardedAgent(agente, { detector }).
//
// entrada: si el mensaje trae patrones de inyección se contesta con una negativa y el
//          agente ni se llama (tampoco se gastan requests de groq).
// salida:  la respuesta se junta completa antes de mandarla. el gateway manda snapshots
//          acumulados y no puede "borrar" lo que ya salió, así que revisar al final es la
//          única forma de que una fuga del prompt no llegue nunca a la widget.
//          luego se quitan urls fuera de la allowlist y se filtran las acciones open_url.

export const INJECTION_REPLY =
  'No puedo seguir instrucciones que intenten cambiar mis reglas o revelar mi configuración. ' +
  'Lo que sí puedo hacer: recomendarte películas, compararlas con su libro y abrirte IMDb o ' +
  'Google Books. ¿Qué película te interesa?';

export const LEAK_REPLY =
  'No puedo compartir esa respuesta porque incluía información interna de configuración. ' +
  '¿Te ayudo a buscar o comparar alguna película?';

export type GuardEvent =
  | { type: 'input_blocked'; categories: InjectionCategory[] }
  | { type: 'output_blocked'; reasons: LeakReason[] }
  | { type: 'url_removed'; urls: string[] }
  | { type: 'action_blocked'; url: string }
  | { type: 'output_truncated' };

export interface GuardedAgentOptions {
  detector: LeakDetector;
  logger?: Logger;
  // para las evals y los tests: se llama con cada guardrail que se activa
  onEvent?: (event: GuardEvent) => void;
  maxOutputChars?: number;
  maxActions?: number;
}

export class GuardedAgent implements AgentRunner {
  private readonly maxOutputChars: number;
  private readonly maxActions: number;

  constructor(
    private readonly inner: AgentRunner,
    private readonly options: GuardedAgentOptions,
  ) {
    this.maxOutputChars = options.maxOutputChars ?? SECURITY_LIMITS.maxOutputChars;
    this.maxActions = options.maxActions ?? SECURITY_LIMITS.maxActionsPerReply;
  }

  async *respond(request: AgentRequest): AsyncIterable<AgentEvent> {
    const { signal } = request;
    if (signal.aborted) return;
    const report = (event: GuardEvent) => this.report(request.sessionId, event);

    const injection = detectInjection(request.input.content);
    if (injection.flagged) {
      report({ type: 'input_blocked', categories: injection.categories });
      yield { type: 'text', delta: INJECTION_REPLY };
      return;
    }

    let text = '';
    const actions: AgentAction[] = [];
    for await (const event of this.inner.respond(request)) {
      if (signal.aborted) return;
      if (event.type === 'text') text += event.delta;
      else actions.push(event.action);
    }
    if (signal.aborted) return;

    const leak = this.options.detector.inspect(text);
    if (leak.leaked) {
      report({ type: 'output_blocked', reasons: leak.reasons });
      yield { type: 'text', delta: LEAK_REPLY };
      return;
    }

    const sanitized = sanitizeMarkdownUrls(text);
    if (sanitized.removed.length > 0) report({ type: 'url_removed', urls: sanitized.removed });
    let output = sanitized.text;
    if (output.length > this.maxOutputChars) {
      output = `${output.slice(0, this.maxOutputChars)}…`;
      report({ type: 'output_truncated' });
    }
    if (output) yield { type: 'text', delta: output };

    const sent = new Set<string>();
    for (const action of actions) {
      if (!isAllowedActionUrl(action.url)) {
        report({ type: 'action_blocked', url: action.url });
        continue;
      }
      if (sent.has(action.url) || sent.size >= this.maxActions) continue;
      sent.add(action.url);
      yield { type: 'action', action };
    }
  }

  // nunca se loguea el contenido de los mensajes, solo el tipo de evento
  private report(sessionId: string, event: GuardEvent): void {
    this.options.onEvent?.(event);
    this.options.logger?.warn('guardrail', { sessionId, ...logFields(event) });
  }
}

// una url bloqueada puede traer datos del usuario en la query (?d=...): solo el dominio
function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'url-invalida';
  }
}

function logFields(event: GuardEvent): Record<string, unknown> {
  if (event.type === 'url_removed') return { type: event.type, hosts: event.urls.map(hostOf) };
  if (event.type === 'action_blocked') return { type: event.type, host: hostOf(event.url) };
  return event;
}
