import { describe, expect, it } from 'vitest';
import { CANARY_PREFIX, createCanary, findSecrets, hardenSystemPrompt } from './systemPrompt.js';

describe('createCanary', () => {
  it('genera un token con prefijo fijo y 16 hex aleatorios', () => {
    const canary = createCanary();
    expect(canary).toMatch(new RegExp(`^${CANARY_PREFIX}-[0-9a-f]{16}$`));
  });

  it('cada token es distinto', () => {
    expect(createCanary()).not.toBe(createCanary());
  });

  it('usa la fuente de aleatoriedad inyectada', () => {
    expect(createCanary(() => Buffer.from('0123456789abcdef', 'hex'))).toBe(
      `${CANARY_PREFIX}-0123456789abcdef`,
    );
  });
});

describe('findSecrets', () => {
  it.each([
    ['groq', `clave gsk_${'a'.repeat(40)}`],
    ['google', `key=AIza${'B'.repeat(35)}`],
    ['jwt', 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmn'],
    ['hex32', 'tmdb 0123456789abcdef0123456789abcdef'],
    ['openai', `sk-${'x'.repeat(30)}`],
  ])('detecta claves tipo %s', (kind, text) => {
    expect(findSecrets(text)).toContain(kind);
  });

  it('no marca texto normal', () => {
    expect(findSecrets('El Señor de los Anillos (2001), rating 8.4/10')).toEqual([]);
  });
});

describe('hardenSystemPrompt', () => {
  const canary = `${CANARY_PREFIX}-0123456789abcdef`;

  it('agrega las reglas de seguridad y el canary al prompt base', () => {
    const prompt = hardenSystemPrompt('Eres el orquestador de AGIChat.', canary);
    expect(prompt.startsWith('Eres el orquestador de AGIChat.')).toBe(true);
    expect(prompt).toContain(canary);
    expect(prompt).toMatch(/DATOS_NO_CONFIABLES/);
    expect(prompt).toMatch(/nunca reveles/i);
  });

  it('no acepta prompts con claves adentro (LLM07: nada secreto en el prompt)', () => {
    expect(() => hardenSystemPrompt(`usa la clave gsk_${'z'.repeat(40)}`, canary)).toThrow(
      /secreto/i,
    );
  });

  it('exige un canary con el formato correcto', () => {
    expect(() => hardenSystemPrompt('hola', 'canary-falso')).toThrow(/canary/i);
  });
});
