import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import type { AgentRunner } from '../agent/types.js';
import type { GatewayConfig } from '../config.js';
import { silentLogger } from '../logger.js';
import type { Logger } from '../logger.js';
import { InMemorySessionStore } from '../session/SessionStore.js';
import type { SessionStore } from '../session/SessionStore.js';
import { GatewayConnection } from './connection.js';

export interface GatewayOptions {
  config: GatewayConfig;
  agent: AgentRunner;
  // si no se pasa, se usan sesiones en memoria con el ttl y limite de la config
  sessions?: SessionStore;
  logger?: Logger;
}

export interface Gateway {
  // empieza a escuchar; devuelve el puerto real (util cuando PORT=0 en tests)
  listen(): Promise<AddressInfo>;
  // cierra todas las conexiones y el servidor
  close(): Promise<void>;
  // conexiones abiertas en este momento
  readonly connections: number;
}

// codigo de cierre de websocket para "el servidor se esta apagando"
const GOING_AWAY = 1001;

// decide si una pagina puede abrir el websocket segun su cabecera Origin.
// los navegadores siempre mandan Origin, asi evitamos que otra pagina cualquiera use
// nuestro agente (y nuestra cuota) desde el navegador de sus visitantes.
// si no hay Origin es un cliente que no es navegador (curl, tests): ese puede inventarse
// la cabecera de todos modos, asi que bloquearlo no protege nada; lo cuida el rate limit
export function isOriginAllowed(origin: string | undefined, allowed: readonly string[]): boolean {
  if (allowed.includes('*') || origin === undefined) return true;
  return allowed.includes(origin);
}

// rechaza un intento de websocket con una respuesta http normal y cierra el socket
function refuse(socket: Duplex, status: number, text: string): void {
  socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

// arma el servidor http (para /health) con el websocket del chat montado encima
export function createGateway({
  config,
  agent,
  sessions = new InMemorySessionStore({
    ttlMs: config.sessionTtlMs,
    maxMessages: config.maxHistoryMessages,
  }),
  logger = silentLogger,
}: GatewayOptions): Gateway {
  const connections = new Set<GatewayConnection>();

  const http = createServer((req, res) => {
    // /health lo usan las plataformas de despliegue para saber si el servicio esta vivo
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', connections: connections.size }));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'No encontrado' }));
  });
  // sin este listener un error del servidor http tumbaria todo el proceso
  http.on('error', (error) => logger.error('servidor_error', { error }));

  // noServer: nosotros decidimos a mano que conexiones se aceptan (ver 'upgrade' abajo).
  // maxPayload: si alguien manda un frame gigante, ws cierra esa conexion
  const wss = new WebSocketServer({ noServer: true, maxPayload: config.maxPayloadBytes });

  // el navegador pide "pasar" de http a websocket; aqui revisamos antes de aceptar
  http.on('upgrade', (req, socket, head) => {
    // en un servidor http req.url siempre viene (solo es opcional en el tipo de node)
    const { pathname } = new URL(String(req.url), 'http://localhost');
    if (pathname !== config.wsPath) return refuse(socket, 404, 'Not Found');
    const origin = req.headers.origin;
    if (!isOriginAllowed(origin, config.allowedOrigins)) {
      logger.warn('origen_rechazado', { origin });
      return refuse(socket, 403, 'Forbidden');
    }
    if (connections.size >= config.maxConnections) {
      logger.warn('servidor_lleno', { connections: connections.size });
      return refuse(socket, 503, 'Service Unavailable');
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
  });

  // clientes que contestaron el ultimo ping. el que no conteste se considera muerto
  // (ej. se le fue el internet sin cerrar bien) y se corta, para no gastar memoria
  const alive = new WeakSet<WebSocket>();

  wss.on('connection', (socket: WebSocket) => {
    const connection = new GatewayConnection(socket, {
      agent,
      sessions,
      logger,
      streamThrottleMs: config.streamThrottleMs,
      limits: {
        maxMessageChars: config.maxMessageChars,
        maxQueuedMessages: config.maxQueuedMessages,
        rateLimit: config.rateLimit,
      },
    });
    connections.add(connection);
    alive.add(socket);
    socket.on('pong', () => alive.add(socket));
    logger.info('conexion_abierta', { sessionId: connection.sessionId });
    socket.on('close', () => {
      connections.delete(connection);
      logger.info('conexion_cerrada', { sessionId: connection.sessionId });
    });
  });

  // heartbeat: cada heartbeatMs le hacemos ping a todos. de paso, el trafico evita que
  // algunos proxies corten conexiones que parecen inactivas.
  // unref() para que estos timers no impidan que node termine
  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      if (!alive.has(client)) {
        logger.warn('cliente_sin_respuesta');
        client.terminate();
        continue;
      }
      alive.delete(client);
      client.ping();
    }
  }, config.heartbeatMs).unref();

  // las sesiones en memoria vencidas se limpian solas cada cierto tiempo
  const sweeper =
    sessions instanceof InMemorySessionStore
      ? setInterval(() => sessions.sweep(), Math.min(config.sessionTtlMs, 60_000)).unref()
      : undefined;

  return {
    get connections() {
      return connections.size;
    },
    listen() {
      return new Promise((resolve, reject) => {
        http.once('error', reject);
        http.listen(config.port, config.host, () => {
          const address = http.address() as AddressInfo;
          logger.info('servidor_escuchando', { port: address.port, path: config.wsPath });
          resolve(address);
        });
      });
    },
    async close() {
      clearInterval(heartbeat);
      clearInterval(sweeper);
      for (const client of wss.clients) client.close(GOING_AWAY, 'El servidor se está apagando');
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      // si algun cliente no contesta el cierre, se cortan las conexiones a la fuerza
      http.closeAllConnections();
      await new Promise<void>((resolve) => http.close(() => resolve()));
      logger.info('servidor_cerrado');
    },
  };
}
