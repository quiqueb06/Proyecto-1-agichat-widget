import { describe, expect, it, vi } from 'vitest';
import { createLogger, silentLogger } from './logger.js';
import type { LogLevel } from './logger.js';

describe('createLogger', () => {
  it('escribe una linea json por evento con nivel, evento y campos', () => {
    const lines: [LogLevel, string][] = [];
    const logger = createLogger((level, line) => lines.push([level, line]));
    logger.info('servidor_escuchando', { port: 8787 });
    logger.warn('algo_raro');
    logger.error('turno_fallido', { error: new Error('groq caido') });

    expect(lines.map(([level]) => level)).toEqual(['info', 'warn', 'error']);
    const [info, warn, error] = lines.map(([, line]) => JSON.parse(line));
    expect(info).toMatchObject({ level: 'info', event: 'servidor_escuchando', port: 8787 });
    expect(Number.isFinite(Date.parse(info.time))).toBe(true);
    expect(warn).toMatchObject({ level: 'warn', event: 'algo_raro' });
    // los errores se guardan como texto (JSON.stringify de un Error da {})
    expect(error).toMatchObject({ event: 'turno_fallido', error: 'groq caido' });
  });

  it('por defecto manda info a stdout y warn/error a stderr', () => {
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const logger = createLogger();
      logger.info('a');
      logger.error('b');
      expect(out).toHaveBeenCalledTimes(1);
      expect(err).toHaveBeenCalledTimes(1);
      expect(String(out.mock.calls[0]?.[0])).toMatch(/"event":"a".*\n$/);
    } finally {
      out.mockRestore();
      err.mockRestore();
    }
  });

  it('el logger silencioso no hace nada', () => {
    expect(() => {
      silentLogger.info('x');
      silentLogger.warn('x');
      silentLogger.error('x');
    }).not.toThrow();
  });
});
