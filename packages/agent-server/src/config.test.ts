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
    });
  });

  it('lee los numeros que vienen como texto en el env', () => {
    const config = loadConfig({
      PORT: '3000',
      HOST: '127.0.0.1',
      WS_PATH: '/chat',
      SESSION_TTL_MS: '1000',
      MAX_HISTORY_MESSAGES: '5',
      STREAM_THROTTLE_MS: '0',
    });
    expect(config).toEqual({
      port: 3000,
      host: '127.0.0.1',
      wsPath: '/chat',
      sessionTtlMs: 1000,
      maxHistoryMessages: 5,
      streamThrottleMs: 0,
    });
  });

  it('no arranca con configuracion invalida y dice que esta mal', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(/PORT/);
    expect(() => loadConfig({ PORT: '70000' })).toThrow(/PORT/);
    expect(() => loadConfig({ WS_PATH: 'ws' })).toThrow(/WS_PATH/);
    expect(() => loadConfig({ MAX_HISTORY_MESSAGES: '0' })).toThrow(/MAX_HISTORY_MESSAGES/);
    expect(() => loadConfig({ SESSION_TTL_MS: '-1', HOST: '' })).toThrow(
      /SESSION_TTL_MS[\s\S]*HOST|HOST[\s\S]*SESSION_TTL_MS/,
    );
  });

  it('por defecto lee process.env', () => {
    expect(loadConfig().wsPath).toMatch(/^\//);
  });
});
