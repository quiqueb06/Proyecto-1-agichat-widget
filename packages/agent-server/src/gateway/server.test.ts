import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import type { ClientOptions } from 'ws';
import { EchoAgent } from '../agent/EchoAgent.js';
import type { AgentRunner } from '../agent/types.js';
import { loadConfig } from '../config.js';
import type { GatewayConfig } from '../config.js';
import { silentLogger } from '../logger.js';
import type { ServerFrame } from '../protocol/frames.js';
import { InMemorySessionStore } from '../session/SessionStore.js';
import type { SessionStore } from '../session/SessionStore.js';
import { createGateway, isOriginAllowed } from './server.js';
import type { Gateway } from './server.js';

// gateways abiertos en cada test, para cerrarlos siempre al final
const opened: Gateway[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((g) => g.close()));
});

// levanta un gateway real en un puerto libre (port 0) solo en localhost
async function start(
  agent: AgentRunner = new EchoAgent({ delayMs: 0 }),
  extra: { sessions?: SessionStore; config?: Partial<GatewayConfig> } = {},
) {
  const config = {
    ...loadConfig({}),
    port: 0,
    host: '127.0.0.1',
    streamThrottleMs: 0,
    ...extra.config,
  };
  const gateway = createGateway({ config, agent, sessions: extra.sessions });
  opened.push(gateway);
  const { port } = await gateway.listen();
  return {
    gateway,
    base: `http://127.0.0.1:${port}`,
    ws: `ws://127.0.0.1:${port}${config.wsPath}`,
  };
}

// cliente websocket de prueba que guarda todos los frames que le llegan
async function connect(url: string, options?: ClientOptions) {
  const socket = new WebSocket(url, options);
  const frames: ServerFrame[] = [];
  socket.on('message', (data) => frames.push(JSON.parse(data.toString()) as ServerFrame));
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  const send = (content: string) =>
    socket.send(
      JSON.stringify({
        type: 'message',
        message: {
          id: `u-${content}`,
          role: 'user',
          content,
          createdAt: new Date().toISOString(),
          status: 'complete',
        },
      }),
    );
  return { socket, frames, send };
}

const completes = (frames: ServerFrame[]) =>
  frames.filter((f) => f.type === 'message' && f.message.status === 'complete');

describe('createGateway', () => {
  it('responde /health con el numero de conexiones y 404 en lo demas', async () => {
    const { base, ws } = await start();
    await connect(ws);
    const health = await fetch(`${base}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: 'ok', connections: 1 });
    const other = await fetch(`${base}/otra-cosa`);
    expect(other.status).toBe(404);
  });

  it('conversa por websocket de punta a punta con streaming y acciones', async () => {
    const { ws } = await start();
    const client = await connect(ws);
    client.send('abrir imdb');
    await vi.waitFor(() => expect(completes(client.frames)).toHaveLength(1));
    await vi.waitFor(() => expect(client.frames.some((f) => f.type === 'action')).toBe(true));

    const messages = client.frames.flatMap((f) => (f.type === 'message' ? [f.message] : []));
    expect(messages.length).toBeGreaterThan(2);
    expect(messages.at(-1)?.content).toContain('> abrir imdb');

    // el segundo mensaje ya ve el historial de la sesion
    client.send('otro');
    await vi.waitFor(() => expect(completes(client.frames)).toHaveLength(2));
    const last = completes(client.frames).at(-1);
    expect(last?.type === 'message' && last.message.content).toContain('mensaje 3');
  });

  it('cada conexion tiene su propia sesion', async () => {
    const { ws, gateway } = await start();
    const a = await connect(ws);
    const b = await connect(ws);
    expect(gateway.connections).toBe(2);
    a.send('uno');
    await vi.waitFor(() => expect(completes(a.frames)).toHaveLength(1));
    b.send('dos');
    await vi.waitFor(() => expect(completes(b.frames)).toHaveLength(1));
    const reply = completes(b.frames)[0];
    // b no ve la conversacion de a
    expect(reply?.type === 'message' && reply.message.content).toContain('mensaje 1');
  });

  it('un frame invalido devuelve error pero la conexion sigue funcionando', async () => {
    const { ws } = await start();
    const client = await connect(ws);
    client.socket.send('no es json');
    await vi.waitFor(() =>
      expect(client.frames).toContainEqual({
        type: 'error',
        error: 'El mensaje no es JSON válido.',
      }),
    );
    client.send('sigo aqui');
    await vi.waitFor(() => expect(completes(client.frames)).toHaveLength(1));
    expect(client.socket.readyState).toBe(WebSocket.OPEN);
  });

  it('borra la sesion cuando el cliente se desconecta', async () => {
    const deleted: string[] = [];
    const sessions: SessionStore = {
      history: async () => [],
      append: async () => {},
      delete: async (id) => void deleted.push(id),
    };
    const { ws, gateway } = await start(new EchoAgent({ delayMs: 0 }), { sessions });
    const client = await connect(ws);
    client.socket.close();
    await vi.waitFor(() => expect(gateway.connections).toBe(0));
    expect(deleted).toHaveLength(1);
  });

  it('solo acepta websockets en la ruta configurada', async () => {
    const { base } = await start(undefined, { config: { wsPath: '/chat' } });
    const wrong = new WebSocket(`${base.replace('http', 'ws')}/ws`);
    await new Promise((resolve) => wrong.once('error', resolve));
    const right = await connect(`${base.replace('http', 'ws')}/chat`);
    expect(right.socket.readyState).toBe(WebSocket.OPEN);
  });

  it('al cerrar avisa a los clientes con 1001 y deja de escuchar', async () => {
    const { ws, gateway } = await start();
    const client = await connect(ws);
    const closed = new Promise<number>((resolve) => client.socket.once('close', resolve));
    await gateway.close();
    opened.length = 0;
    expect(await closed).toBe(1001);
    await expect(connect(ws)).rejects.toThrow();
  });

  it('listen falla si el puerto ya esta ocupado', async () => {
    const { base } = await start();
    const port = Number(new URL(base).port);
    const config = { ...loadConfig({}), port, host: '127.0.0.1' };
    const second = createGateway({ config, agent: new EchoAgent(), logger: silentLogger });
    await expect(second.listen()).rejects.toThrow();
    await second.close();
  });

  it('usa sesiones en memoria por defecto y las limpia con el tiempo', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const sweep = vi.spyOn(InMemorySessionStore.prototype, 'sweep');
    try {
      const gateway = createGateway({
        config: { ...loadConfig({}), port: 0, host: '127.0.0.1', sessionTtlMs: 1000 },
        agent: new EchoAgent(),
      });
      opened.push(gateway);
      // el limpiador corre cada min(ttl, 60 s) = cada 1000 ms en este caso
      vi.advanceTimersByTime(999);
      expect(sweep).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(sweep).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(2000);
      expect(sweep).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
      sweep.mockRestore();
    }
  });
});

// intenta abrir un websocket que el servidor deberia rechazar y devuelve el codigo http
function refusedStatus(url: string, options?: ClientOptions) {
  return new Promise<number>((resolve, reject) => {
    const socket = new WebSocket(url, options);
    socket.on('unexpected-response', (req, res) => {
      resolve(res.statusCode ?? 0);
      req.destroy();
    });
    socket.on('open', () => reject(new Error('el servidor acepto la conexion')));
    socket.on('error', () => {});
  });
}

describe('endurecimiento del gateway', () => {
  it('solo deja conectarse a las paginas permitidas (Origin)', async () => {
    const { ws } = await start(undefined, {
      config: { allowedOrigins: ['https://quiqueb06.github.io'] },
    });
    expect(await refusedStatus(ws, { origin: 'https://pagina-mala.com' })).toBe(403);
    const ok = await connect(ws, { origin: 'https://quiqueb06.github.io' });
    expect(ok.socket.readyState).toBe(WebSocket.OPEN);
  });

  it('rechaza rutas que no son la del websocket con 404', async () => {
    const { base } = await start();
    expect(await refusedStatus(`${base.replace('http', 'ws')}/otra`)).toBe(404);
  });

  it('con el servidor lleno rechaza conexiones nuevas con 503', async () => {
    const { ws, gateway } = await start(undefined, { config: { maxConnections: 1 } });
    const first = await connect(ws);
    expect(await refusedStatus(ws)).toBe(503);
    // cuando se libera un lugar, vuelve a aceptar
    first.socket.close();
    await vi.waitFor(() => expect(gateway.connections).toBe(0));
    const second = await connect(ws);
    expect(second.socket.readyState).toBe(WebSocket.OPEN);
  });

  it('corta la conexion si mandan un frame gigante (1009)', async () => {
    const { ws } = await start(undefined, { config: { maxPayloadBytes: 1024 } });
    const client = await connect(ws);
    const closed = new Promise<number>((resolve) => client.socket.once('close', resolve));
    client.socket.send('x'.repeat(2048));
    expect(await closed).toBe(1009);
  });

  it('el heartbeat corta a los clientes que no contestan y deja a los vivos', async () => {
    const { ws, gateway } = await start(undefined, { config: { heartbeatMs: 30 } });
    const vivo = await connect(ws);
    // autoPong false = el cliente ignora los ping, como si se le hubiera ido el internet
    const muerto = await connect(ws, { autoPong: false });
    const closed = new Promise<void>((resolve) => muerto.socket.once('close', () => resolve()));
    await closed;
    // el cliente se entera del corte un poquito antes que el contador del servidor
    await vi.waitFor(() => expect(gateway.connections).toBe(1));
    expect(vivo.socket.readyState).toBe(WebSocket.OPEN);
  });

  it('aplica el rate limit de la config a cada conexion', async () => {
    const { ws } = await start(undefined, {
      config: { rateLimit: { messages: 1, windowMs: 60_000 } },
    });
    const client = await connect(ws);
    client.send('uno');
    client.send('dos');
    await vi.waitFor(() =>
      expect(client.frames).toContainEqual({
        type: 'error',
        error: 'Límite de mensajes alcanzado.',
      }),
    );
  });
});

describe('isOriginAllowed', () => {
  const allowed = ['http://localhost:5173'];

  it('acepta las paginas de la lista y rechaza las demas', () => {
    expect(isOriginAllowed('http://localhost:5173', allowed)).toBe(true);
    expect(isOriginAllowed('http://localhost:5174', allowed)).toBe(false);
    expect(isOriginAllowed('null', allowed)).toBe(false);
  });

  it('"*" acepta cualquiera y sin Origin (no navegador) tambien pasa', () => {
    expect(isOriginAllowed('https://lo-que-sea.com', ['*'])).toBe(true);
    expect(isOriginAllowed(undefined, allowed)).toBe(true);
    expect(isOriginAllowed('http://localhost:5173', [])).toBe(false);
  });
});
