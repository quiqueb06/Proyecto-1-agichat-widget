import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer } from 'ws';
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

  const wss = new WebSocketServer({ server: http, path: config.wsPath });
  // ws reenvia aqui los errores del servidor http (ej. puerto ocupado). sin este listener
  // node los lanza como excepcion no manejada y listen() nunca se entera
  wss.on('error', (error) => logger.error('servidor_error', { error }));
  wss.on('connection', (socket) => {
    const connection = new GatewayConnection(socket, {
      agent,
      sessions,
      logger,
      streamThrottleMs: config.streamThrottleMs,
    });
    connections.add(connection);
    logger.info('conexion_abierta', { sessionId: connection.sessionId });
    socket.on('close', () => {
      connections.delete(connection);
      logger.info('conexion_cerrada', { sessionId: connection.sessionId });
    });
  });

  // las sesiones en memoria vencidas se limpian solas cada cierto tiempo.
  // unref() para que este timer no impida que node termine
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
