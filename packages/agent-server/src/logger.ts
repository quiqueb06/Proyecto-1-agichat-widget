// logs del servidor en formato json, una linea por evento.
// asi se leen facil en la consola del servicio donde se despliegue.
// nunca hay que loguear el contenido de los mensajes ni api keys: solo ids y eventos

export type LogLevel = 'info' | 'warn' | 'error';
export type LogFields = Record<string, unknown>;

export interface Logger {
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
}

// los errores no se serializan bien con JSON.stringify, se pasan a texto
function normalize(fields: LogFields): LogFields {
  const out: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    out[key] = value instanceof Error ? value.message : value;
  }
  return out;
}

// info va a stdout; warn y error a stderr
export function createLogger(
  write: (level: LogLevel, line: string) => void = (level, line) =>
    (level === 'info' ? process.stdout : process.stderr).write(`${line}\n`),
): Logger {
  const log = (level: LogLevel, event: string, fields: LogFields = {}) =>
    write(
      level,
      JSON.stringify({ time: new Date().toISOString(), level, event, ...normalize(fields) }),
    );
  return {
    info: (event, fields) => log('info', event, fields),
    warn: (event, fields) => log('warn', event, fields),
    error: (event, fields) => log('error', event, fields),
  };
}

// logger que no hace nada, para tests
export const silentLogger: Logger = { info() {}, warn() {}, error() {} };
