import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createServer } from './server.js';

// stdout queda reservado para JSON-RPC; el proceso padre proporciona el entorno.
await serveStdio(() => createServer());
