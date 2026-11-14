import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  it('usa valores por defecto si no hay variables', () => {
    expect(loadConfig({})).toEqual({
      port: 8787,
      host: '0.0.0.0',
      wsPath: '/ws',
      sessionTtlMs: 1_800_000,
      maxHistoryMessages: 30,
      streamThrottleMs: 50,
      allowedOrigins: ['http://localhost:5173', 'http://localhost:4173'],
      maxConnections: 100,
      maxPayloadBytes: 16_384,
      maxMessageChars: 2000,
      rateLimit: { messages: 10, windowMs: 60_000 },
      maxQueuedMessages: 2,
      heartbeatMs: 30_000,
    });
  });

  it('lee los numeros y listas que vienen como texto en el env', () => {
    const config = loadConfig({
      PORT: '3000',
      HOST: '127.0.0.1',
      WS_PATH: '/chat',
      SESSION_TTL_MS: '1000',
      MAX_HISTORY_MESSAGES: '5',
      STREAM_THROTTLE_MS: '0',
      ALLOWED_ORIGINS: ' https://a.github.io , http://localhost:5173,, ',
      MAX_CONNECTIONS: '7',
      MAX_PAYLOAD_BYTES: '1024',
      MAX_MESSAGE_CHARS: '300',
      RATE_LIMIT_MESSAGES: '3',
      RATE_LIMIT_WINDOW_MS: '5000',
      MAX_QUEUED_MESSAGES: '0',
      HEARTBEAT_MS: '1000',
    });
    expect(config).toEqual({
      port: 3000,
      host: '127.0.0.1',
      wsPath: '/chat',
      sessionTtlMs: 1000,
      maxHistoryMessages: 5,
      streamThrottleMs: 0,
      // se limpian espacios y elementos vacios
      allowedOrigins: ['https://a.github.io', 'http://localhost:5173'],
      maxConnections: 7,
      maxPayloadBytes: 1024,
      maxMessageChars: 300,
      rateLimit: { messages: 3, windowMs: 5000 },
      maxQueuedMessages: 0,
      heartbeatMs: 1000,
    });
  });

  it('no arranca con configuracion invalida y dice que esta mal', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(/PORT/);
    expect(() => loadConfig({ PORT: '70000' })).toThrow(/PORT/);
    expect(() => loadConfig({ WS_PATH: 'ws' })).toThrow(/WS_PATH/);
    expect(() => loadConfig({ MAX_HISTORY_MESSAGES: '0' })).toThrow(/MAX_HISTORY_MESSAGES/);
    expect(() => loadConfig({ RATE_LIMIT_MESSAGES: '0' })).toThrow(/RATE_LIMIT_MESSAGES/);
    expect(() => loadConfig({ MAX_QUEUED_MESSAGES: '-1' })).toThrow(/MAX_QUEUED_MESSAGES/);
    expect(() => loadConfig({ SESSION_TTL_MS: '-1', HOST: '' })).toThrow(
      /SESSION_TTL_MS[\s\S]*HOST|HOST[\s\S]*SESSION_TTL_MS/,
    );
  });

  it('por defecto lee process.env', () => {
    expect(loadConfig().wsPath).toMatch(/^\//);
  });
});
