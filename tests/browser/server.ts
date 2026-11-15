import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import { createGateway } from '../../packages/agent-server/src/gateway/server.js';
import { loadConfig } from '../../packages/agent-server/src/config.js';
import type { AgentRunner } from '../../packages/agent-server/src/agent/types.js';

// The real gateway and built embed, with a fake runner: no credentials or external APIs.
const agent: AgentRunner = {
  async *respond({ input, signal }) {
    if (input.content === 'slow') await setTimeout(6500, undefined, { signal });
    yield { type: 'text', delta: 'Respuesta de prueba completa.' };
    for (const action of [
      { type: 'open_url' as const, url: 'https://www.imdb.com/title/tt0120737/', label: 'IMDb' },
      {
        type: 'open_url' as const,
        url: 'https://books.google.com/books?id=Dune_1',
        label: 'Google Books',
      },
      {
        type: 'open_url' as const,
        url: 'https://books.google.com/books?id=Dune_1',
        label: 'Google Books',
      },
      { type: 'open_url' as const, url: 'https://example.com/untrusted', label: 'No permitido' },
    ])
      yield { type: 'action', action };
  },
};
const gateway = createGateway({
  config: loadConfig({
    HOST: '127.0.0.1',
    PORT: '0',
    ALLOWED_ORIGINS: 'http://127.0.0.1:4186',
  }),
  agent,
});
const address = await gateway.listen();
const script = await readFile(new URL('../../dist/agichat.embed.js', import.meta.url));
const html = `<!doctype html><html lang="es"><meta charset="utf-8"><title>Prueba de acciones</title>
<body><h1>Prueba de acciones AGIChat</h1><script src="/agichat.embed.js"></script><script>
window.receivedActions = [];
AGIChat.on('action', action => window.receivedActions.push(action));
window.chat = AGIChat.init({ transport: 'websocket', endpoint: 'ws://127.0.0.1:${address.port}/ws', defaultOpen: true });
</script></body></html>`;
const server = createServer((req, res) => {
  res.setHeader(
    'Content-Type',
    req.url === '/agichat.embed.js' ? 'text/javascript' : 'text/html; charset=utf-8',
  );
  res.end(req.url === '/agichat.embed.js' ? script : html);
});
server.listen(4186, '127.0.0.1');
process.on('SIGTERM', () => {
  void gateway.close();
  server.close();
});
