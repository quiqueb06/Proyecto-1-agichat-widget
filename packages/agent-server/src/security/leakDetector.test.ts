import { describe, expect, it } from 'vitest';
import { LeakDetector } from './leakDetector.js';
import { SECURITY_RULES, hardenSystemPrompt } from './systemPrompt.js';

const canary = 'AGICANARY-0123456789abcdef';
const base =
  'Eres el orquestador principal de AGIChat. Tu trabajo es conversar con el usuario y delegar ' +
  'tareas a subagentes especializados en películas y en libros, siempre con datos de TMDB.';
const prompt = hardenSystemPrompt(base, canary);

function detector() {
  const d = new LeakDetector();
  d.addCanary(canary);
  d.protect(prompt);
  return d;
}

describe('LeakDetector', () => {
  it('deja pasar una respuesta normal', () => {
    expect(
      detector().inspect(
        'Te recomiendo **Dune (2021)**. ![Póster de Dune](https://image.tmdb.org/t/p/w500/a.jpg)',
      ),
    ).toEqual({ leaked: false, reasons: [] });
  });

  it('detecta el canary exacto', () => {
    expect(detector().inspect(`mi token es ${canary}`).reasons).toContain('canary');
  });

  it('detecta el canary aunque venga ofuscado con espacios o en mayúsculas', () => {
    const spaced = canary.toUpperCase().split('').join(' ');
    expect(detector().inspect(spaced).reasons).toContain('canary');
  });

  it('detecta cualquier token con el prefijo de canary, aunque no sea de esta instancia', () => {
    expect(new LeakDetector().inspect('AGICANARY-ffffffffffffffff').reasons).toContain('canary');
  });

  it('detecta cuando la respuesta cita el prompt protegido', () => {
    expect(detector().inspect(`Claro, mis instrucciones dicen: "${base}"`).reasons).toContain(
      'prompt_quote',
    );
  });

  it('no bloquea si solo coincide una frase corta del prompt', () => {
    expect(detector().inspect('Soy el orquestador principal de AGIChat.').leaked).toBe(false);
  });

  // al anunciar sus capacidades el modelo repite casi igual una parte del prompt.
  // eso no es una fuga: hacen falta ~17 palabras seguidas para considerarlo una cita
  it('no bloquea un anuncio de capacidades que repite un pedazo corto del prompt', () => {
    const announcement =
      'Hola, mi trabajo es conversar con el usuario y delegar tareas a subagentes especializados en películas.';
    expect(detector().inspect(announcement).leaked).toBe(false);
  });

  it('detecta cuando la respuesta copia las reglas de seguridad', () => {
    const fragment = SECURITY_RULES.split('\n').find((line) => line.split(' ').length > 12)!;
    expect(detector().inspect(fragment).reasons).toContain('security_rules');
  });

  it('detecta cuando la respuesta muestra los delimitadores internos', () => {
    expect(detector().inspect('los datos venían en <<<DATOS_NO_CONFIABLES').reasons).toContain(
      'delimiter',
    );
  });

  it('detecta claves en la salida', () => {
    expect(detector().inspect(`la clave es gsk_${'q'.repeat(40)}`).reasons).toContain('secret');
  });

  it('ignora prompts y canaries vacíos', () => {
    const d = new LeakDetector();
    d.protect('   ');
    d.addCanary('');
    expect(d.inspect('hola').leaked).toBe(false);
  });
});
