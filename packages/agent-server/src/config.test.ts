import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  it('usa valores por defecto si no hay variables', () => {
    expect(loadConfig({})).toEqual({
      port: 8787,
      host: '0.0.0.0',
      wsPath: '/ws',
      sessionTtlMs: 30 * 60 * 1000,
      maxHistoryMessages: 30,
      streamThrottleMs: 50,

      groq: {
        apiKey: undefined,
        model: 'openai/gpt-oss-120b',
        baseUrl: 'https://api.groq.com/openai/v1',
      },

      allowedOrigins: [
        'http://localhost:5173',
        'http://localhost:4173',
      ],

      maxConnections: 100,
      maxPayloadBytes: 16 * 1024,
      maxMessageChars: 2000,

      rateLimit: {
        messages: 10,
        windowMs: 60_000,
      },

      maxQueuedMessages: 2,
      heartbeatMs: 30_000,
    });
  });

  it('lee los numeros y listas que vienen como texto en el env', () => {
    const config = loadConfig({
      PORT: '3000',
      HOST: '127.0.0.1',
      WS_PATH: '/chat',

      SESSION_TTL_MS: '5000',
      MAX_HISTORY_MESSAGES: '5',
      STREAM_THROTTLE_MS: '25',

      GROQ_API_KEY: 'test-key',
      GROQ_MODEL: 'test-model',
      GROQ_BASE_URL: 'https://groq.example.com/v1',

      ALLOWED_ORIGINS:
        'https://a.github.io, http://localhost:5173',

      MAX_CONNECTIONS: '7',
      MAX_PAYLOAD_BYTES: '2048',
      MAX_MESSAGE_CHARS: '300',

      RATE_LIMIT_MESSAGES: '4',
      RATE_LIMIT_WINDOW_MS: '5000',

      MAX_QUEUED_MESSAGES: '1',
      HEARTBEAT_MS: '1000',
    });

    expect(config).toEqual({
      port: 3000,
      host: '127.0.0.1',
      wsPath: '/chat',

      sessionTtlMs: 5000,
      maxHistoryMessages: 5,
      streamThrottleMs: 25,

      groq: {
        apiKey: 'test-key',
        model: 'test-model',
        baseUrl: 'https://groq.example.com/v1',
      },

      allowedOrigins: [
        'https://a.github.io',
        'http://localhost:5173',
      ],

      maxConnections: 7,
      maxPayloadBytes: 2048,
      maxMessageChars: 300,

      rateLimit: {
        messages: 4,
        windowMs: 5000,
      },

      maxQueuedMessages: 1,
      heartbeatMs: 1000,
    });
  });

  it('no arranca con configuracion invalida y dice que esta mal', () => {
    expect(() =>
      loadConfig({
        PORT: '-1',
        WS_PATH: 'sin-slash',
        MAX_CONNECTIONS: '0',
        GROQ_BASE_URL: 'no-es-url',
      }),
    ).toThrow('Configuración inválida del servidor');
  });

  it('por defecto lee process.env', () => {
    process.env = {
      ...originalEnv,
      PORT: '4567',
      GROQ_MODEL: 'modelo-env',
    };

    const config = loadConfig();

    expect(config.port).toBe(4567);
    expect(config.groq.model).toBe('modelo-env');
  });
});
