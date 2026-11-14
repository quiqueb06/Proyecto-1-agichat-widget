import { z } from 'zod';
import { messageSchema } from './message.js';
import type { Message } from './message.js';

// protocolo v2 entre la widget y el servidor (ver docs/TRANSPORT.md).
// todos los frames son texto json con un campo `type`

// ---------- widget -> servidor ----------

// la widget solo puede mandar mensajes del usuario ya terminados.
// si dejaramos pasar role 'system' o 'assistant', cualquiera podria hacerse pasar
// por el sistema o por el agente (eso seria una inyeccion de prompt regalada)
export const clientFrameSchema = z.object({
  type: z.literal('message'),
  message: messageSchema.extend({
    role: z.literal('user'),
    status: z.literal('complete'),
  }),
});

export type ClientFrame = z.infer<typeof clientFrameSchema>;

// ---------- servidor -> widget ----------

// accion que el agente le pide a la widget. por ahora solo abrir un link en otra pestana.
// solo https: nada de javascript:, data:, http, etc. la lista de dominios permitidos
// la pone la persona 5 en los guardrails
export const agentActionSchema = z.object({
  type: z.literal('open_url'),
  url: z.url({ protocol: /^https$/ }),
  // texto corto para el link de respaldo si el navegador bloquea la pestana
  label: z.string().min(1).max(80),
});

export type AgentAction = z.infer<typeof agentActionSchema>;

export type ServerFrame =
  | { type: 'message'; message: Message }
  | { type: 'error'; error: string }
  | { type: 'action'; action: AgentAction };

// ---------- helpers ----------

export type ParseResult = { ok: true; frame: ClientFrame } | { ok: false; error: string };

// convierte el texto que llega por el socket en un frame valido.
// nunca lanza: si algo esta mal devuelve el motivo para mandarlo como frame de error
export function parseClientFrame(raw: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'El mensaje no es JSON válido.' };
  }
  const result = clientFrameSchema.safeParse(data);
  if (!result.success) return { ok: false, error: 'Frame inválido.' };
  return { ok: true, frame: result.data };
}

// todo lo que sale del servidor pasa por aqui, asi siempre sale con el mismo formato
export function serializeFrame(frame: ServerFrame): string {
  return JSON.stringify(frame);
}
