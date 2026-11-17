import type { CaseResult, EvalCase, EvalReport, EvalTarget } from './types.js';

export interface RunEvalsOptions {
  cases: readonly EvalCase[];
  target: EvalTarget;
  // ids a correr (si no se pone, todos)
  only?: readonly string[];
  // espera entre casos (groq free tier: ~30 requests por minuto)
  delayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  onResult?: (result: CaseResult) => void;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function runEvals(options: RunEvalsOptions): Promise<EvalReport> {
  const { target } = options;
  const now = options.now ?? (() => new Date());
  const sleep = options.sleep ?? realSleep;
  const startedAt = now().toISOString();
  const results: CaseResult[] = [];
  let executed = 0;

  for (const evalCase of options.cases) {
    if (options.only && !options.only.includes(evalCase.id)) continue;
    const base = { id: evalCase.id, category: evalCase.category, title: evalCase.title };

    if (evalCase.targets && !evalCase.targets.includes(target.kind)) {
      results.push({ ...base, status: 'skipped', checks: [], durationMs: 0 });
      continue;
    }

    if (executed > 0 && options.delayMs) await sleep(options.delayMs);
    executed += 1;
    const started = Date.now();
    let result: CaseResult;
    try {
      const { transcript, context } = await target.run(evalCase);
      const checks = evalCase.checks.map((check) => {
        // un check que lanza cuenta como fallado
        try {
          return { name: check.name, passed: check.test(transcript, context) };
        } catch {
          return { name: check.name, passed: false };
        }
      });
      result = {
        ...base,
        status: checks.every((c) => c.passed) ? 'passed' : 'failed',
        checks,
        durationMs: Date.now() - started,
        transcript,
      };
    } catch (error) {
      result = {
        ...base,
        status: 'error',
        checks: [],
        durationMs: Date.now() - started,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    results.push(result);
    options.onResult?.(result);
  }

  return {
    target: target.kind,
    description: target.description,
    startedAt,
    finishedAt: now().toISOString(),
    results,
  };
}
