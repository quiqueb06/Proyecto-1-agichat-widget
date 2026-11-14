import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createServer } from './server.js';

// stdout pertenece exclusivamente al protocolo MCP.
await serveStdio(() => createServer());
