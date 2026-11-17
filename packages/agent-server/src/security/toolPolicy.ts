import { z } from 'zod';
import { SECURITY_LIMITS } from './limits.js';
import type { MCPClientLike } from '../mcp/types.js';
import { delimitFreeText, sanitizeUntrustedValue, wrapUntrusted } from './untrusted.js';

// allowlist de herramientas y validación de sus argumentos (owasp llm01).
// el llm decide qué herramienta llamar y con qué argumentos; si una inyección lo engaña,
// podría intentar llamar algo que no le toca o mandar argumentos raros. aquí se revisa
// antes de que la llamada llegue al servidor mcp.
// los esquemas son una copia de los contratos de packages/mcp-tmdb y packages/mcp-books
// (toolPolicy.test.ts verifica que sigan iguales)

const text = z.string().trim().min(1).max(SECURITY_LIMITS.maxToolArgChars);
const year = z.number().int().min(1878).max(9999);
const limit = z.number().int().min(1).max(10).default(5);

export const TOOL_ARGUMENT_SCHEMAS = {
  search_movie: z.strictObject({ query: text, year: year.optional(), limit }),
  get_movie_details: z.strictObject({
    id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  }),
  recommend_movies: z.strictObject({
    genre: z.string().trim().min(1).max(100).optional(),
    year: year.optional(),
    similar_to: text.optional(),
    limit,
  }),
  search_book: z.strictObject({ titulo: text, autor: text.optional(), limit }),
  get_book_details: z.strictObject({ id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/) }),
  compare_movie_book: z.strictObject({
    movie: z.strictObject({
      title: text,
      original_title: text.nullish(),
      rating: z.number().min(0).max(10).nullable(),
    }),
    book_title: text.optional(),
    book_author: text.optional(),
  }),
} as const;

export type ToolName = keyof typeof TOOL_ARGUMENT_SCHEMAS;

// cada subagente solo ve las herramientas de su servidor mcp
export const AGENT_TOOLS = {
  movies: { source: 'tmdb', tools: ['search_movie', 'get_movie_details', 'recommend_movies'] },
  books: {
    source: 'google_books',
    tools: ['search_book', 'get_book_details', 'compare_movie_book'],
  },
} as const satisfies Record<string, { source: string; tools: readonly ToolName[] }>;

export type AgentKind = keyof typeof AGENT_TOOLS;

export type ToolCheck =
  | { ok: true; args: Record<string, unknown> }
  | { ok: false; reason: 'tool_not_allowed' | 'invalid_arguments' };

export interface ToolPolicy {
  readonly agent: AgentKind;
  // fuente que se usa al delimitar los resultados como datos no confiables
  readonly source: string;
  readonly allowedTools: readonly ToolName[];
  check(name: string, args: unknown): ToolCheck;
}

export function createToolPolicy(agent: AgentKind): ToolPolicy {
  const { source, tools } = AGENT_TOOLS[agent];
  const allowed: readonly string[] = tools;
  return {
    agent,
    source,
    allowedTools: tools,
    check(name, args) {
      if (!allowed.includes(name)) return { ok: false, reason: 'tool_not_allowed' };
      const parsed = TOOL_ARGUMENT_SCHEMAS[name as ToolName].safeParse(args);
      if (!parsed.success) return { ok: false, reason: 'invalid_arguments' };
      return { ok: true, args: parsed.data as Record<string, unknown> };
    },
  };
}

// lo mínimo que se necesita de un cliente mcp. es compatible con el MCPClientLike de la
// persona 4, así se puede envolver su cliente sin cambiarlo
export interface ToolCallResult {
  isError: boolean;
  text: string;
  structuredContent?: Record<string, unknown>;
}

export interface ToolCaller {
  callTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult>;
}

export interface ToolViolation {
  tool: string;
  reason: 'tool_not_allowed' | 'invalid_arguments';
}

export interface GuardToolCallerOptions {
  onViolation?: (violation: ToolViolation) => void;
}

// los servidores mcp devuelven json como texto; así queda legible dentro del bloque
function parseMaybeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// envuelve un cliente mcp: valida cada llamada con la política y devuelve el resultado
// limpio y delimitado, listo para meterlo en el mensaje role "tool" del llm
export function guardToolCaller(
  caller: ToolCaller,
  policy: ToolPolicy,
  options: GuardToolCallerOptions = {},
): ToolCaller {
  return {
    async callTool(name, args) {
      const check = policy.check(name, args);
      if (!check.ok) {
        options.onViolation?.({ tool: name, reason: check.reason });
        return {
          isError: true,
          text:
            check.reason === 'tool_not_allowed'
              ? `Herramienta no permitida: ${name}.`
              : `Argumentos inválidos para ${name}.`,
        };
      }
      const result = await caller.callTool(name, check.args);
      // los errores los arman nuestros servidores mcp con texto fijo: solo se limpian.
      // si se delimitaran, el agente los copia en su respuesta y el filtro de salida
      // bloquearía la respuesta completa
      const guarded: ToolCallResult = {
        isError: result.isError,
        text: result.isError
          ? (sanitizeUntrustedValue(result.text, SECURITY_LIMITS.maxUntrustedStringChars) as string)
          : wrapUntrusted(policy.source, parseMaybeJson(result.text)),
      };
      if (result.structuredContent) {
        guarded.structuredContent = delimitFreeText(
          result.structuredContent,
          policy.source,
        ) as Record<string, unknown>;
      }
      return guarded;
    },
  };
}

// lo mismo que guardToolCaller, pero conservando la forma completa del cliente mcp de los
// subagentes (connect, close, listTools). listTools solo muestra la allowlist, así el llm ni
// siquiera ve las herramientas que no le tocan
export function guardMcpClient(
  client: MCPClientLike,
  policy: ToolPolicy,
  options: GuardToolCallerOptions = {},
): MCPClientLike {
  const guarded = guardToolCaller(client, policy, options);
  const allowed: readonly string[] = policy.allowedTools;
  return {
    connect: () => client.connect(),
    close: () => client.close(),
    listTools: async () => (await client.listTools()).filter((tool) => allowed.includes(tool.name)),
    callTool: (name, args) => guarded.callTool(name, args),
  };
}
