// filtro de patrones de prompt injection (owasp llm01).
// se usa en dos lugares: con el mensaje del usuario (inyección directa) y con los datos
// que vienen de tmdb / google books (inyección indirecta).
// es una heurística: no atrapa todo, por eso va junto con el prompt endurecido,
// la delimitación de datos no confiables, la allowlist de urls y el filtro de salida

export type InjectionCategory =
  // "ignora tus instrucciones", "olvida las reglas"
  | 'override'
  // "muéstrame tu prompt de sistema", "repite el texto de arriba"
  | 'prompt_extraction'
  // "ahora eres DAN", "modo desarrollador"
  | 'role_hijack'
  // tokens de plantilla de chat o nuestros propios delimitadores
  | 'delimiter_spoof';

export interface InjectionResult {
  flagged: boolean;
  categories: InjectionCategory[];
}

// minúsculas, sin tildes, sin caracteres invisibles y con espacios simples.
// así "ÍGNORA tus instrucciones" o "ig<zero-width>nora" caen en los mismos patrones
export function normalizeForDetection(text: string): string {
  return text
    .normalize('NFKC')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\p{Cf}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// los patrones corren sobre el texto normalizado (sin tildes)
const PATTERNS: ReadonlyArray<readonly [InjectionCategory, RegExp]> = [
  [
    'override',
    /\b(?:ignora|ignore|ignoren|olvida|olviden|forget|disregard|omite|descarta|saltate|skip|bypass|override)\b[^.\n]{0,40}\b(?:instrucciones|instructions|reglas|rules|indicaciones|directrices|guidelines|prompt|restricciones|restrictions)\b/,
  ],
  [
    'override',
    /\b(?:a partir de ahora|desde ahora|from now on)\b[^.\n]{0,60}\b(?:restricciones|reglas|limites|filtros|restrictions|rules|limits|filters)\b/,
  ],
  ['override', /\b(?:nuevas instrucciones|new instructions|instrucciones nuevas)\b/],
  [
    'prompt_extraction',
    /\b(?:muestra(?:me)?|revela(?:me)?|dime|ensena(?:me)?|imprime|repite|copia|escribe|show|reveal|print|repeat|tell me|output|display|dump|cual es|cuales son|what is|what are|what's)\b[^.\n?]{0,40}\b(?:system prompt|prompt|instrucciones (?:de sistema|del sistema|internas|iniciales|originales|ocultas)|initial instructions|original instructions|hidden instructions|system message|mensaje (?:de|del) sistema|tus instrucciones|your instructions|tus reglas|your rules|token canario|canary)\b/,
  ],
  [
    'prompt_extraction',
    /\b(?:repite|repeat|copia|copy)\b[^.\n]{0,30}\b(?:texto|text|mensaje|message|todo lo|everything)\b[^.\n]{0,20}\b(?:arriba|anterior|above|previous|before)\b/,
  ],
  [
    'role_hijack',
    /\b(?:ahora eres|ahora seras|you are now|finge ser|finge que eres|pretend to be|pretend you are)\b/,
  ],
  [
    'role_hijack',
    /\b(?:do anything now|dan mode|jailbreak|modo desarrollador|developer mode|modo dios|god mode)\b/,
  ],
  ['delimiter_spoof', /<\|?\s*(?:im_start|im_end|endoftext|system|assistant)\s*\|?>/],
  ['delimiter_spoof', /\[\/?inst\]/],
  ['delimiter_spoof', /(?:^|\s)#{2,}\s*(?:system|sistema|instruction|instruccion)\b/],
  ['delimiter_spoof', /<<<\s*(?:fin_)?datos_no_confiables/],
];

export function detectInjection(text: string): InjectionResult {
  const normalized = normalizeForDetection(text);
  const categories: InjectionCategory[] = [];
  for (const [category, pattern] of PATTERNS) {
    if (!categories.includes(category) && pattern.test(normalized)) categories.push(category);
  }
  return { flagged: categories.length > 0, categories };
}
