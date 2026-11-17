import type { CaseResult, EvalCategory, EvalReport } from './types.js';

const CATEGORIES: EvalCategory[] = ['funcional', 'LLM01', 'LLM07'];
const ICON: Record<CaseResult['status'], string> = {
  passed: '✅',
  failed: '❌',
  error: '⚠️',
  skipped: '⏭️',
};

type Summary = Record<EvalCategory, { passed: number; total: number }> & {
  total: { passed: number; total: number; skipped: number };
};

export function summarize(report: EvalReport): Summary {
  const ran = report.results.filter((r) => r.status !== 'skipped');
  const summary = {
    total: {
      passed: ran.filter((r) => r.status === 'passed').length,
      total: ran.length,
      skipped: report.results.length - ran.length,
    },
  } as Summary;
  for (const category of CATEGORIES) {
    const inCategory = ran.filter((r) => r.category === category);
    summary[category] = {
      passed: inCategory.filter((r) => r.status === 'passed').length,
      total: inCategory.length,
    };
  }
  return summary;
}

// "|" rompe las tablas de markdown
const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function renderMarkdownReport(report: EvalReport): string {
  const summary = summarize(report);
  const lines = [
    '# Reporte de evals de AGIChat',
    '',
    `- **Target:** ${report.description}`,
    `- **Inicio:** ${report.startedAt}`,
    `- **Fin:** ${report.finishedAt}`,
    `- **Total: ${summary.total.passed}/${summary.total.total}** casos pasaron` +
      (summary.total.skipped ? ` (${summary.total.skipped} no aplican a este target)` : ''),
    '',
    '## Resumen por categoría',
    '',
    '| Categoría | Pasaron |',
    '| --- | --- |',
    ...CATEGORIES.map((c) => `| ${c} | ${summary[c].passed}/${summary[c].total} |`),
    '',
    '## Casos',
    '',
    '| Caso | Categoría | Qué prueba | Resultado | Detalle |',
    '| --- | --- | --- | --- | --- |',
    ...report.results.map((r) => {
      const detail =
        r.status === 'skipped'
          ? 'no aplica a este target'
          : r.status === 'error'
            ? `error: ${r.error ?? ''}`
            : r.checks
                .filter((c) => !c.passed)
                .map((c) => `falló: ${c.name}`)
                .join('; ') || `${r.checks.length} checks · ${r.durationMs} ms`;
      return `| ${r.id} | ${r.category} | ${cell(r.title)} | ${ICON[r.status]} ${r.status} | ${cell(detail)} |`;
    }),
    '',
  ];
  return lines.join('\n');
}
