import { z } from 'zod';

// toda la configuracion del servidor sale de variables de entorno (ver .env.example).
// se valida con zod al arrancar: si algo esta mal, el servidor no arranca y dice por que,
// en vez de fallar raro a la mitad de una conversacion

// numero entero positivo que viene como texto en el env
const positiveInt = z.coerce.number().int().positive();

const envSchema = z.object({
  PORT: z.coerce.number().int().min(0).max(65535).default(8787),
  HOST: z.string().min(1).default('0.0.0.0'),
  // ruta donde escucha el websocket, la widget se conecta a ws://host:puerto/ws
  WS_PATH: z.string().startsWith('/').default('/ws'),
  // cuanto vive una sesion sin actividad (30 min)
  SESSION_TTL_MS: positiveInt.default(30 * 60 * 1000),
  // cuantos mensajes recordamos por sesion; mas historial = mas tokens de groq
  MAX_HISTORY_MESSAGES: positiveInt.default(30),
  // cada cuanto mandamos un snapshot del streaming a la widget
  STREAM_THROTTLE_MS: z.coerce.number().int().min(0).default(50),
});

export interface GatewayConfig {
  port: number;
  host: string;
  wsPath: string;
  sessionTtlMs: number;
  maxHistoryMessages: number;
  streamThrottleMs: number;
}

// lee y valida el env. recibe el env como parametro para poder probarlo facil
export function loadConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new Error(`Configuración inválida del servidor:\n- ${problems.join('\n- ')}`);
  }
  const e = result.data;
  return {
    port: e.PORT,
    host: e.HOST,
    wsPath: e.WS_PATH,
    sessionTtlMs: e.SESSION_TTL_MS,
    maxHistoryMessages: e.MAX_HISTORY_MESSAGES,
    streamThrottleMs: e.STREAM_THROTTLE_MS,
  };
}
