import { fileURLToPath } from 'node:url';
import { BookComparisonAgent } from './agent/BookComparisonAgent.js';
import { MovieAgent } from './agent/MovieAgent.js';
import { Orchestrator } from './agent/Orchestrator.js';
import { loadConfig } from './config.js';
import { createGateway } from './gateway/server.js';
import { GroqClient } from './llm/GroqClient.js';
import { createLogger } from './logger.js';
import { MCPClient } from './mcp/MCPClient.js';
import { createSecurityContext } from './security/index.js';

// Carga packages/agent-server/.env si existe.
// En producción, las variables las proporciona la plataforma.
try {
  process.loadEnvFile();
} catch {
  // Sin .env: se usan las variables del sistema y los defaults.
}

const logger = createLogger();
const config = loadConfig();

// guardrails contra owasp llm01 y llm07 (docs/SEGURIDAD.md). un solo contexto para todo:
// así el canary que va en los prompts es el mismo que busca el filtro de salida
const security = createSecurityContext({ logger });

if (!config.groq.apiKey) {
  throw new Error(
    'Falta GROQ_API_KEY. Configúrala en packages/agent-server/.env o como variable de entorno.',
  );
}

if (!process.env.TMDB_API_TOKEN?.trim()) {
  throw new Error(
    'Falta TMDB_API_TOKEN. Configúrala en packages/agent-server/.env o como variable de entorno.',
  );
}

// -----------------------------------------------------------------------------
// LLM
// -----------------------------------------------------------------------------

const llm = new GroqClient({
  apiKey: config.groq.apiKey,
  model: config.groq.model,
  baseUrl: config.groq.baseUrl,
});

// -----------------------------------------------------------------------------
// MCP servers
//
// Estos paths apuntan a los builds de cada paquete.
// Antes de arrancar el servidor real, mcp-tmdb y mcp-books deben estar compilados.
// -----------------------------------------------------------------------------

const tmdbEntry = fileURLToPath(new URL('../../mcp-tmdb/dist/index.js', import.meta.url));

const booksEntry = fileURLToPath(new URL('../../mcp-books/dist/index.js', import.meta.url));

// Pasamos solamente la configuración que necesita TMDB.
// El MCP lee process.env; no carga automáticamente su propio archivo .env
// cuando es levantado como proceso hijo por StdioClientTransport.
const tmdbEnv: Record<string, string> = {
  TMDB_API_TOKEN: process.env.TMDB_API_TOKEN ?? '',
  TMDB_TIMEOUT_MS: process.env.TMDB_TIMEOUT_MS ?? '10000',
  TMDB_CACHE_TTL_MS: process.env.TMDB_CACHE_TTL_MS ?? '300000',
  TMDB_CACHE_CAPACITY: process.env.TMDB_CACHE_CAPACITY ?? '200',
  TMDB_DAILY_BUDGET: process.env.TMDB_DAILY_BUDGET ?? '500',
  TMDB_MAX_RETRIES: process.env.TMDB_MAX_RETRIES ?? '2',
};

// Google Books puede necesitar configuración propia.
// Solo enviamos variables relacionadas con Books si existen.
const booksEnv: Record<string, string> = {};

for (const key of [
  'GOOGLE_BOOKS_API_KEY',
  'BOOKS_API_KEY',
  'BOOKS_TIMEOUT_MS',
  'BOOKS_CACHE_TTL_MS',
  'BOOKS_CACHE_CAPACITY',
  'BOOKS_DAILY_BUDGET',
  'BOOKS_MAX_RETRIES',
]) {
  const value = process.env[key];

  if (value !== undefined) {
    booksEnv[key] = value;
  }
}

const tmdbMcp = new MCPClient({
  name: 'agichat-tmdb-client',
  command: process.execPath,
  args: [tmdbEntry],
  env: tmdbEnv,
});

const booksMcp = new MCPClient({
  name: 'agichat-books-client',
  command: process.execPath,
  args: [booksEntry],
  env: booksEnv,
});

// Conectamos los MCP antes de aceptar usuarios.
// Si alguno no puede arrancar, el servidor falla temprano en vez de hacerlo
// a mitad de una conversación.
await tmdbMcp.connect();
await booksMcp.connect();

logger.info('mcp_conectados', {
  tmdb: 'agichat-mcp-tmdb',
  books: 'agichat-mcp-books',
});

// -----------------------------------------------------------------------------
// Multi-agent system
// -----------------------------------------------------------------------------

// cada subagente recibe su cliente mcp envuelto: solo ve las herramientas de su allowlist,
// los argumentos se validan y los resultados llegan delimitados como datos no confiables.
// los prompts de sistema van endurecidos con las reglas de seguridad y el canary
const movieAgent = new MovieAgent(llm, security.guardMcpClient(tmdbMcp, 'movies'), { security });

const bookComparisonAgent = new BookComparisonAgent(
  llm,
  security.guardMcpClient(booksMcp, 'books'),
  { security },
);

const orchestrator = new Orchestrator(llm, movieAgent, bookComparisonAgent, { security });

// -----------------------------------------------------------------------------
// Gateway
// -----------------------------------------------------------------------------

const gateway = createGateway({
  config,
  // filtro de entrada, filtro de salida (canary y citas del prompt) y allowlist de urls
  agent: security.guardAgent(orchestrator),
  logger,
});

await gateway.listen();

logger.info('agente_listo', {
  model: config.groq.model,
});

// -----------------------------------------------------------------------------
// Apagado ordenado
// -----------------------------------------------------------------------------

let closing = false;

async function shutdown(signal: string) {
  if (closing) {
    return;
  }

  closing = true;

  logger.info('apagando', { signal });

  try {
    await gateway.close();
  } finally {
    await Promise.allSettled([tmdbMcp.close(), booksMcp.close()]);
  }

  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
