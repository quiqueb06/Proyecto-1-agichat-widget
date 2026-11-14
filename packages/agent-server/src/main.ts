import { EchoAgent } from './agent/EchoAgent.js';
import { loadConfig } from './config.js';
import { createGateway } from './gateway/server.js';
import { createLogger } from './logger.js';

// arranque real del servidor: npm run dev -w @agichat/agent-server
// (este archivo solo conecta las piezas; la logica esta en los demas modulos y tiene tests)

// carga el .env del paquete si existe (node >= 20.12). en produccion las variables
// las pone la plataforma de despliegue, ahi no hay .env y no pasa nada
try {
  process.loadEnvFile();
} catch {
  // sin .env: se usan las variables del sistema y los valores por defecto
}

const logger = createLogger();
const config = loadConfig();

// por ahora el agente es el echo de pruebas; la persona 4 lo cambia por el orquestador
const gateway = createGateway({ config, agent: new EchoAgent(), logger });
await gateway.listen();

// apagado ordenado: cerramos las conexiones antes de salir (ctrl+c o la plataforma)
let closing = false;
async function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  logger.info('apagando', { signal });
  await gateway.close();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
