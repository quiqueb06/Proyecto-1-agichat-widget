import { z } from 'zod';

// toda la configuracion del servidor sale de variables de entorno (ver .env.example).
// se valida con zod al arrancar: si algo esta mal, el servidor no arranca y dice por que,
// en vez de fallar raro a la mitad de una conversacion

// numero entero positivo que viene como texto en el env
const positiveInt = z.coerce.number().int().positive();

// lista separada por comas, ej. "http://localhost:5173, https://x.github.io"
const commaList = z.string().transform((value) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
);

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

  // ---------- limites (seguridad y cuidar las cuotas gratis de groq, tmdb y books) ----------

  // paginas que pueden abrir el websocket (cabecera Origin). "*" = cualquiera.
  // por defecto solo la demo local (vite dev y vite preview)
  ALLOWED_ORIGINS: commaList.default(['http://localhost:5173', 'http://localhost:4173']),
  // conexiones abiertas al mismo tiempo en todo el servidor
  MAX_CONNECTIONS: positiveInt.default(100),
  // tamano maximo de un frame en bytes; si alguien manda mas, ws cierra la conexion
  MAX_PAYLOAD_BYTES: positiveInt.default(16 * 1024),
  // largo maximo del texto de un mensaje del usuario
  MAX_MESSAGE_CHARS: positiveInt.default(2000),
  // mensajes que un usuario puede mandar por ventana de tiempo (10 por minuto)
  RATE_LIMIT_MESSAGES: positiveInt.default(10),
  RATE_LIMIT_WINDOW_MS: positiveInt.default(60_000),
  // mensajes esperando turno por conexion (ademas del que se esta respondiendo)
  MAX_QUEUED_MESSAGES: z.coerce.number().int().min(0).default(2),
  // cada cuanto se revisa que los clientes sigan vivos (ping/pong)
  HEARTBEAT_MS: positiveInt.default(30_000),
});

export interface GatewayConfig {
  port: number;
  host: string;
  wsPath: string;
  sessionTtlMs: number;
  maxHistoryMessages: number;
  streamThrottleMs: number;
  allowedOrigins: string[];
  maxConnections: number;
  maxPayloadBytes: number;
  maxMessageChars: number;
  rateLimit: { messages: number; windowMs: number };
  maxQueuedMessages: number;
  heartbeatMs: number;
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
    allowedOrigins: e.ALLOWED_ORIGINS,
    maxConnections: e.MAX_CONNECTIONS,
    maxPayloadBytes: e.MAX_PAYLOAD_BYTES,
    maxMessageChars: e.MAX_MESSAGE_CHARS,
    rateLimit: { messages: e.RATE_LIMIT_MESSAGES, windowMs: e.RATE_LIMIT_WINDOW_MS },
    maxQueuedMessages: e.MAX_QUEUED_MESSAGES,
    heartbeatMs: e.HEARTBEAT_MS,
  };
}
