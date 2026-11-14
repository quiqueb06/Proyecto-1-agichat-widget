import { z } from 'zod';

// el mismo formato de mensaje que usa la widget (src/types/index.ts) y las mismas reglas
// que su validador isMessage (src/transport/guards.ts). si uno cambia, el otro tambien
export const messageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  // la widget acepta cualquier fecha que Date.parse entienda, aqui igual
  createdAt: z.string().refine((value) => Number.isFinite(Date.parse(value)), {
    message: 'createdAt debe ser una fecha valida',
  }),
  status: z.enum(['streaming', 'complete']),
});

export type Message = z.infer<typeof messageSchema>;
export type MessageRole = Message['role'];
