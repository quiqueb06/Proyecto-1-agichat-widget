import { describe, expect, it } from 'vitest';
import { createTarget, parseCliOptions, reportFileName } from './cliOptions.js';

describe('parseCliOptions', () => {
  it('por defecto corre contra el llm falso, sin espera y en evals-reports', () => {
    expect(parseCliOptions([], {})).toEqual({
      target: 'fake',
      endpoint: 'ws://localhost:8787/ws',
      origin: undefined,
      only: undefined,
      outDir: 'evals-reports',
      delayMs: 0,
    });
  });

  it('con groq o ws espera 2.5 s entre casos para cuidar el límite de requests', () => {
    expect(parseCliOptions(['--target', 'groq'], {}).delayMs).toBe(2500);
    expect(parseCliOptions(['--target=ws'], {}).delayMs).toBe(2500);
  });

  it('lee endpoint, origin, filtro de casos, carpeta y espera', () => {
    expect(
      parseCliOptions(
        [
          '--target',
          'ws',
          '--endpoint',
          'wss://agente.example/ws',
          '--origin',
          'https://demo.example',
          '--only',
          'F1, LLM07-1',
          '--out',
          '../../docs/evals',
          '--delay-ms',
          '100',
        ],
        {},
      ),
    ).toEqual({
      target: 'ws',
      endpoint: 'wss://agente.example/ws',
      origin: 'https://demo.example',
      only: ['F1', 'LLM07-1'],
      outDir: '../../docs/evals',
      delayMs: 100,
    });
  });

  it('toma el endpoint de EVAL_ENDPOINT si no se pasa', () => {
    expect(parseCliOptions([], { EVAL_ENDPOINT: 'ws://x/ws' }).endpoint).toBe('ws://x/ws');
  });

  it('rechaza targets o esperas inválidas', () => {
    expect(() => parseCliOptions(['--target', 'openai'], {})).toThrow(/target/);
    expect(() => parseCliOptions(['--delay-ms', '-1'], {})).toThrow(/delay/);
  });
});

describe('createTarget', () => {
  it('fake usa el llm falso vulnerable', () => {
    expect(createTarget(parseCliOptions([], {}), {}).description).toMatch(/^fake · fake/);
  });

  it('groq exige la key y usa el modelo configurado', () => {
    const options = parseCliOptions(['--target', 'groq'], {});
    expect(() => createTarget(options, {})).toThrow(/GROQ_API_KEY/);
    expect(
      createTarget(options, { GROQ_API_KEY: 'gsk_x', GROQ_MODEL: 'openai/gpt-oss-20b' })
        .description,
    ).toBe('groq · groq: openai/gpt-oss-20b');
  });

  it('ws apunta al endpoint', () => {
    expect(createTarget(parseCliOptions(['--target', 'ws'], {}), {}).description).toBe(
      'ws · ws://localhost:8787/ws',
    );
  });
});

describe('reportFileName', () => {
  it('incluye target y fecha sin caracteres inválidos para Windows', () => {
    expect(reportFileName('groq', '2026-11-17T20:15:30.123Z')).toBe(
      'evals-groq-2026-11-17T20-15-30Z',
    );
  });
});
