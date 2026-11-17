import { normalizeForDetection } from './injection.js';
import { CANARY_PREFIX, SECURITY_RULES, findSecrets } from './systemPrompt.js';

// filtro de salida contra la fuga del prompt de sistema (owasp llm07).
// revisa la respuesta completa antes de mandarla a la widget y la bloquea si:
// - trae un canary token (el de esta instancia o cualquier otro con el prefijo);
// - cita textualmente el prompt protegido (10 secuencias de 8 palabras iguales, o sea
//   unas 17 palabras seguidas: un anuncio de capacidades parecido al prompt no cuenta);
// - copia un pedazo de las reglas de seguridad;
// - muestra los delimitadores internos de datos no confiables;
// - trae algo con forma de api key.
// limitación conocida: una paráfrasis del prompt no se detecta con esto. para eso está
// el canary y el prompt endurecido (ver docs/SEGURIDAD.md)

export type LeakReason = 'canary' | 'prompt_quote' | 'security_rules' | 'delimiter' | 'secret';

export interface LeakResult {
  leaked: boolean;
  reasons: LeakReason[];
}

export interface LeakDetectorOptions {
  // palabras por secuencia (shingle)
  shingleSize?: number;
  // cuántas secuencias del prompt tienen que aparecer para considerarlo una cita
  minPromptShingles?: number;
}

function words(text: string): string[] {
  return normalizeForDetection(text)
    .split(/[^a-z0-9ñ]+/)
    .filter(Boolean);
}

function shingles(text: string, size: number): Set<string> {
  const list = words(text);
  const result = new Set<string>();
  for (let i = 0; i + size <= list.length; i += 1) result.add(list.slice(i, i + size).join(' '));
  return result;
}

// mayúsculas y sin nada que no sea letra o número: "a g i-c a n..." queda "AGICAN..."
function compact(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export class LeakDetector {
  private readonly shingleSize: number;
  private readonly minPromptShingles: number;
  private readonly canaries = new Set<string>();
  private readonly promptShingles = new Set<string>();
  private readonly ruleShingles: Set<string>;

  constructor(options: LeakDetectorOptions = {}) {
    this.shingleSize = options.shingleSize ?? 8;
    this.minPromptShingles = options.minPromptShingles ?? 10;
    this.ruleShingles = shingles(SECURITY_RULES, this.shingleSize);
  }

  addCanary(canary: string): void {
    if (canary.trim()) this.canaries.add(compact(canary));
  }

  // registra un prompt de sistema que no debe salir en ninguna respuesta
  protect(prompt: string): void {
    for (const shingle of shingles(prompt, this.shingleSize)) this.promptShingles.add(shingle);
  }

  inspect(output: string): LeakResult {
    const reasons: LeakReason[] = [];
    const compacted = compact(output);

    // cualquier cosa con el prefijo cuenta, aunque sea el canary de otra instancia
    if (
      compacted.includes(CANARY_PREFIX) ||
      [...this.canaries].some((canary) => compacted.includes(canary))
    ) {
      reasons.push('canary');
    }

    const outputShingles = shingles(output, this.shingleSize);
    let promptHits = 0;
    let ruleHits = 0;
    for (const shingle of outputShingles) {
      if (this.promptShingles.has(shingle)) promptHits += 1;
      if (this.ruleShingles.has(shingle)) ruleHits += 1;
    }
    if (promptHits >= this.minPromptShingles) reasons.push('prompt_quote');
    if (ruleHits > 0) reasons.push('security_rules');

    if (/DATOS_NO_CONFIABLES/i.test(output)) reasons.push('delimiter');
    if (findSecrets(output).length > 0) reasons.push('secret');

    return { leaked: reasons.length > 0, reasons };
  }
}
