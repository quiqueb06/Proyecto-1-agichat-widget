import type { AgentRunner } from '../agent/types.js';
import type { Logger } from '../logger.js';
import type { MCPClientLike } from '../mcp/types.js';
import type { GuardEvent } from './GuardedAgent.js';
import { GuardedAgent } from './GuardedAgent.js';
import { LeakDetector } from './leakDetector.js';
import { createCanary, hardenSystemPrompt } from './systemPrompt.js';
import type { AgentKind, GuardToolCallerOptions, ToolCaller } from './toolPolicy.js';
import { createToolPolicy, guardMcpClient, guardToolCaller } from './toolPolicy.js';
import { wrapUntrusted } from './untrusted.js';

// punto de entrada de los guardrails. se crea uno al arrancar el servidor (main.ts) y se
// comparte con el orquestador y los subagentes:
//
//   const security = createSecurityContext({ logger });
//   const prompt = security.hardenPrompt(SYSTEM_PROMPT);       // cada prompt de sistema
//   const tmdb = security.guardMcpClient(tmdbClient, 'movies');  // cada cliente mcp
//   const agent = security.guardAgent(new Orchestrator(...));   // el agente del gateway
//
// así el canary que va en los prompts es el mismo que busca el filtro de salida

export interface SecurityContext {
  readonly canary: string;
  // filtro de salida con el canary y los prompts endurecidos (lo usan las evals)
  readonly detector: LeakDetector;
  hardenPrompt(basePrompt: string): string;
  guardAgent(agent: AgentRunner): GuardedAgent;
  guardTools(caller: ToolCaller, agent: AgentKind): ToolCaller;
  // igual que guardTools, pero conserva connect, close y listTools (filtrado)
  guardMcpClient(client: MCPClientLike, agent: AgentKind): MCPClientLike;
  wrapUntrusted: typeof wrapUntrusted;
}

export interface SecurityContextOptions {
  logger?: Logger;
  onEvent?: (event: GuardEvent) => void;
  // para tests y evals; si no se pasa se genera uno aleatorio
  canary?: string;
}

export function createSecurityContext(options: SecurityContextOptions = {}): SecurityContext {
  const canary = options.canary ?? createCanary();
  const detector = new LeakDetector();
  detector.addCanary(canary);
  const logViolations = (agent: AgentKind): GuardToolCallerOptions => ({
    onViolation: (violation) =>
      options.logger?.warn('herramienta_bloqueada', { agent, ...violation }),
  });

  return {
    canary,
    detector,
    hardenPrompt(basePrompt) {
      const prompt = hardenSystemPrompt(basePrompt, canary);
      detector.protect(prompt);
      return prompt;
    },
    guardAgent(agent) {
      return new GuardedAgent(agent, {
        detector,
        logger: options.logger,
        onEvent: options.onEvent,
      });
    },
    guardTools(caller, agent) {
      return guardToolCaller(caller, createToolPolicy(agent), logViolations(agent));
    },
    guardMcpClient(client, agent) {
      return guardMcpClient(client, createToolPolicy(agent), logViolations(agent));
    },
    wrapUntrusted,
  };
}
