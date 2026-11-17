import { parseArgs } from 'node:util';
import { z } from 'zod';
import { GroqChatModel, loadGroqEvalConfig } from './GroqChatModel.js';
import { createInProcessTarget, createWebSocketTarget } from './targets.js';
import type { EvalTarget, TargetKind } from './types.js';
import { VulnerableFakeLLM } from './VulnerableFakeLLM.js';

// opciones de `npm run evals -- ...` (ver docs/SEGURIDAD.md):
//   --target fake|groq|ws   (fake por defecto, es lo que corre el ci)
//   --endpoint ws://...     (solo ws; o la variable EVAL_ENDPOINT)
//   --origin https://...    (solo ws, si el servidor revisa ALLOWED_ORIGINS)
//   --only F1,LLM07-1       (correr solo esos casos)
//   --out carpeta           (donde se escribe el reporte .md y .json)
//   --delay-ms 2500         (espera entre casos)

export interface CliOptions {
  target: TargetKind;
  endpoint: string;
  origin: string | undefined;
  only: string[] | undefined;
  outDir: string;
  delayMs: number;
}

const targetSchema = z.enum(['fake', 'groq', 'ws'], { error: 'target debe ser fake, groq o ws' });
const delaySchema = z.coerce.number().int().min(0, 'delay-ms debe ser >= 0');

export function parseCliOptions(argv: string[], env: NodeJS.ProcessEnv): CliOptions {
  const { values } = parseArgs({
    args: argv,
    options: {
      target: { type: 'string', default: 'fake' },
      endpoint: { type: 'string' },
      origin: { type: 'string' },
      only: { type: 'string' },
      out: { type: 'string', default: 'evals-reports' },
      'delay-ms': { type: 'string' },
    },
  });
  const target = targetSchema.parse(values.target);
  return {
    target,
    endpoint: values.endpoint ?? env.EVAL_ENDPOINT ?? 'ws://localhost:8787/ws',
    origin: values.origin,
    only: values.only
      ?.split(',')
      .map((id) => id.trim())
      .filter(Boolean),
    outDir: values.out,
    // groq free tier: ~30 requests por minuto. con ws cada caso gasta varias
    delayMs: delaySchema.parse(values['delay-ms'] ?? (target === 'fake' ? 0 : 2500)),
  };
}

export function createTarget(options: CliOptions, env: NodeJS.ProcessEnv): EvalTarget {
  if (options.target === 'groq') {
    return createInProcessTarget('groq', new GroqChatModel(loadGroqEvalConfig(env)));
  }
  if (options.target === 'ws') {
    return createWebSocketTarget({ endpoint: options.endpoint, origin: options.origin });
  }
  return createInProcessTarget('fake', new VulnerableFakeLLM());
}

// nombre de archivo del reporte. ":" no se permite en nombres de archivo en windows
export function reportFileName(target: TargetKind, startedAt: string): string {
  return `evals-${target}-${startedAt.replace(/\.\d+Z$/, 'Z').replace(/:/g, '-')}`;
}
