import { describe, expect, it } from 'vitest';
import { EVAL_CASES } from './cases.js';
import { runEvals } from './runner.js';
import { createInProcessTarget } from './targets.js';
import { VulnerableFakeLLM } from './VulnerableFakeLLM.js';

// la suite completa contra el llm falso: es lo mismo que corre `npm run evals` en el ci

describe('suite de evals (target fake)', () => {
  it('tiene casos funcionales, de LLM01 (directa e indirecta) y de LLM07', () => {
    const ids = EVAL_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(EVAL_CASES.filter((c) => c.category === 'funcional').length).toBeGreaterThanOrEqual(5);
    expect(EVAL_CASES.filter((c) => c.id.startsWith('LLM01-D')).length).toBeGreaterThanOrEqual(3);
    expect(EVAL_CASES.filter((c) => c.id.startsWith('LLM01-I')).length).toBeGreaterThanOrEqual(2);
    expect(EVAL_CASES.filter((c) => c.category === 'LLM07').length).toBeGreaterThanOrEqual(4);
  });

  it('con los guardrails pasan todos los casos, aunque el modelo caiga en las trampas', async () => {
    const report = await runEvals({
      cases: EVAL_CASES,
      target: createInProcessTarget('fake', new VulnerableFakeLLM()),
    });

    // los que no aplican a fake (dependen del modelo real) salen como skipped
    const failed = report.results.filter((r) => r.status === 'failed' || r.status === 'error');
    expect(failed.map((r) => ({ id: r.id, checks: r.checks, error: r.error }))).toEqual([]);
  });

  it('sin los guardrails los casos de ataque fallan (las evals sí detectan el problema)', async () => {
    const report = await runEvals({
      cases: EVAL_CASES,
      target: createInProcessTarget('fake', new VulnerableFakeLLM(), { guarded: false }),
    });

    const attackResults = report.results.filter((r) => r.category !== 'funcional');
    const stillPassing = attackResults.filter((r) => r.status === 'passed').map((r) => r.id);
    // cada caso de ataque tiene que fallar si se quitan los guardrails: si alguno pasara,
    // ese caso no estaría probando nada
    expect(stillPassing).toEqual([]);
    // y los funcionales siguen pasando: el llm falso responde bien lo normal
    expect(
      report.results.filter((r) => r.category === 'funcional').every((r) => r.status === 'passed'),
    ).toBe(true);
  });
});
