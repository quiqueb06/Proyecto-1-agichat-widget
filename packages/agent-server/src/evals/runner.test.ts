import { describe, expect, it, vi } from 'vitest';
import { LeakDetector } from '../security/leakDetector.js';
import { renderMarkdownReport, summarize } from './report.js';
import { runEvals } from './runner.js';
import type { EvalCase, EvalTarget, Transcript } from './types.js';

const transcript: Transcript = { replies: ['hola'], actions: [], guardEvents: [], errors: [] };

function target(run?: EvalTarget['run']): EvalTarget {
  return {
    kind: 'fake',
    description: 'fake · prueba',
    run:
      run ??
      (async () => ({ transcript, context: { detector: new LeakDetector(), target: 'fake' } })),
  };
}

const pass = { name: 'siempre pasa', test: () => true };
const fail = { name: 'siempre falla', test: () => false };

const cases: EvalCase[] = [
  { id: 'F1', category: 'funcional', title: 'pasa', turns: ['hola'], checks: [pass] },
  { id: 'L1', category: 'LLM07', title: 'falla', turns: ['x'], checks: [pass, fail] },
  { id: 'I1', category: 'LLM01', title: 'solo ws', turns: ['x'], targets: ['ws'], checks: [pass] },
];

describe('runEvals', () => {
  it('corre cada caso, evalúa sus checks y salta los que no aplican al target', async () => {
    const report = await runEvals({ cases, target: target(), now: () => new Date(0) });

    expect(report).toMatchObject({
      target: 'fake',
      description: 'fake · prueba',
      startedAt: '1970-01-01T00:00:00.000Z',
    });
    expect(report.results.map((r) => [r.id, r.status])).toEqual([
      ['F1', 'passed'],
      ['L1', 'failed'],
      ['I1', 'skipped'],
    ]);
    expect(report.results[1]!.checks).toEqual([
      { name: 'siempre pasa', passed: true },
      { name: 'siempre falla', passed: false },
    ]);
  });

  it('marca como error un caso que lanza, y sigue con los demás', async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error('se cayó groq'))
      .mockResolvedValue({ transcript, context: { detector: new LeakDetector(), target: 'fake' } });

    const report = await runEvals({ cases: cases.slice(0, 2), target: target(run) });

    expect(report.results[0]).toMatchObject({ status: 'error', error: 'se cayó groq' });
    expect(report.results[1]!.status).toBe('failed');
  });

  it('filtra por id y espera entre casos para no pasarse del límite de groq', async () => {
    const sleep = vi.fn(async () => {});
    const onResult = vi.fn();
    const report = await runEvals({
      cases,
      target: target(),
      only: ['F1', 'L1'],
      delayMs: 100,
      sleep,
      onResult,
    });

    expect(report.results.map((r) => r.id)).toEqual(['F1', 'L1']);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(100);
    expect(onResult).toHaveBeenCalledTimes(2);
  });

  it('un check que lanza cuenta como fallado', async () => {
    const boom = {
      name: 'explota',
      test: () => {
        throw new Error('x');
      },
    };
    const report = await runEvals({
      cases: [{ ...cases[0]!, checks: [boom] }],
      target: target(),
    });
    expect(report.results[0]!.status).toBe('failed');
  });
});

describe('reporte', () => {
  it('resume por categoría', async () => {
    const report = await runEvals({ cases, target: target() });
    expect(summarize(report)).toEqual({
      funcional: { passed: 1, total: 1 },
      LLM01: { passed: 0, total: 0 },
      LLM07: { passed: 0, total: 1 },
      total: { passed: 1, total: 2, skipped: 1 },
    });
  });

  it('genera markdown con el resumen, cada caso y los checks fallidos', async () => {
    const report = await runEvals({ cases, target: target(), now: () => new Date(0) });
    report.results.push({
      id: 'E1',
      category: 'LLM01',
      title: 'con error',
      status: 'error',
      checks: [],
      durationMs: 1,
      error: 'timeout',
    });

    const md = renderMarkdownReport(report);

    expect(md).toContain('# Reporte de evals de AGIChat');
    expect(md).toContain('fake · prueba');
    expect(md).toContain('| funcional | 1/1 |');
    expect(md).toContain('| LLM07 | 0/1 |');
    expect(md).toMatch(/\| L1 \| LLM07 \| falla \| ❌/);
    expect(md).toContain('siempre falla');
    expect(md).toMatch(/\| I1 .*⏭️/);
    expect(md).toContain('timeout');
    expect(md).toContain('**Total: 1/3**');
  });
});
