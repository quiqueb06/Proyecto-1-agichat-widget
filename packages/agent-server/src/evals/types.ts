import type { AgentAction } from '../protocol/frames.js';
import type { GuardEvent } from '../security/GuardedAgent.js';
import type { LeakDetector } from '../security/leakDetector.js';
import type { ToolData } from './fixtures.js';

// tipos de la suite de evals (persona 5). ver docs/SEGURIDAD.md

export type EvalCategory = 'funcional' | 'LLM01' | 'LLM07';

// contra qué se corre la suite:
// - fake: en proceso, con un llm falso que a propósito cae en las trampas (ci)
// - groq: en proceso, con el modelo real de groq (a mano, gasta requests)
// - ws: contra el servidor desplegado por websocket (sistema completo: orquestador + mcp)
export type TargetKind = 'fake' | 'groq' | 'ws';

// lo que pasó en una conversación de un caso
export interface Transcript {
  // texto final del asistente en cada turno
  replies: string[];
  // acciones open_url que llegaron a la widget
  actions: AgentAction[];
  // guardrails que se activaron (solo en los targets en proceso)
  guardEvents: GuardEvent[];
  // frames de error que mandó el servidor (solo ws)
  errors: string[];
}

export interface CheckContext {
  // detector con el canary y el prompt de esta corrida. en ws no conocemos el prompt del
  // servidor, así que solo busca el prefijo del canary, las reglas y los delimitadores
  detector: LeakDetector;
  target: TargetKind;
}

export interface EvalCheck {
  name: string;
  test(transcript: Transcript, context: CheckContext): boolean;
}

export interface EvalCase {
  id: string;
  category: EvalCategory;
  // qué ataque o funcionalidad prueba (sale en el reporte)
  title: string;
  // mensajes del usuario, en orden, en la misma conversación
  turns: string[];
  // datos de "herramientas" para los targets en proceso. si no se pone, se usa el catálogo
  // normal. para inyección indirecta aquí va el libro malicioso
  toolData?: ToolData;
  // si no se pone, corre en todos. la inyección indirecta no corre en ws porque ahí no
  // se pueden cambiar los datos de tmdb ni de google books
  targets?: TargetKind[];
  checks: EvalCheck[];
}

export interface CaseRun {
  transcript: Transcript;
  context: CheckContext;
}

export interface EvalTarget {
  kind: TargetKind;
  // descripción para el reporte, ej. "groq: llama-3.3-70b-versatile"
  description: string;
  run(evalCase: EvalCase): Promise<CaseRun>;
}

export interface CheckResult {
  name: string;
  passed: boolean;
}

export interface CaseResult {
  id: string;
  category: EvalCategory;
  title: string;
  status: 'passed' | 'failed' | 'skipped' | 'error';
  checks: CheckResult[];
  durationMs: number;
  error?: string;
  transcript?: Transcript;
}

export interface EvalReport {
  target: TargetKind;
  description: string;
  startedAt: string;
  finishedAt: string;
  results: CaseResult[];
}
