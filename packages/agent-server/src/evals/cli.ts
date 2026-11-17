import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { EVAL_CASES } from './cases.js';
import { createTarget, parseCliOptions, reportFileName } from './cliOptions.js';
import { renderMarkdownReport, summarize } from './report.js';
import { runEvals } from './runner.js';

// punto de entrada de `npm run evals` (este archivo solo conecta piezas que ya tienen tests).
//   npm run evals                          -> llm falso (lo mismo que el ci)
//   npm run evals -- --target groq         -> modelo real de groq (gasta ~20 requests)
//   npm run evals -- --target ws --endpoint ws://localhost:8787/ws  -> sistema completo

try {
  process.loadEnvFile();
} catch {
  // sin .env: se usan las variables del sistema
}

const options = parseCliOptions(process.argv.slice(2), process.env);
const target = createTarget(options, process.env);
const write = (line: string) => process.stdout.write(`${line}\n`);

write(`Corriendo evals contra ${target.description}...`);
const report = await runEvals({
  cases: EVAL_CASES,
  target,
  only: options.only,
  delayMs: options.delayMs,
  onResult: (result) =>
    write(`  ${result.status === 'passed' ? 'ok ' : 'MAL'} ${result.id} · ${result.title}`),
});

await mkdir(options.outDir, { recursive: true });
const base = path.join(options.outDir, reportFileName(report.target, report.startedAt));
await writeFile(`${base}.md`, renderMarkdownReport(report), 'utf8');
await writeFile(`${base}.json`, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

const { total } = summarize(report);
write(`\n${total.passed}/${total.total} casos pasaron (${total.skipped} no aplican).`);
write(`Reporte: ${base}.md`);
process.exitCode = total.passed === total.total ? 0 : 1;
