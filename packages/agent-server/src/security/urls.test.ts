import { describe, expect, it } from 'vitest';
import {
  isAllowedActionUrl,
  isAllowedImageUrl,
  isAllowedLinkUrl,
  sanitizeMarkdownUrls,
} from './urls.js';

describe('isAllowedActionUrl', () => {
  it.each([
    'https://www.imdb.com/title/tt0120737/',
    'https://imdb.com/title/tt0120737',
    'https://m.imdb.com/title/tt0120737/',
    'https://www.imdb.com/',
    'https://books.google.com/books?id=abc_123-X',
    'https://books.google.es/books?id=abc',
    'https://books.google.com.gt/books?id=abc',
    'https://books.google.co.uk/books?id=abc',
  ])('permite %s', (url) => {
    expect(isAllowedActionUrl(url)).toBe(true);
  });

  it.each([
    ['http (no https)', 'http://www.imdb.com/title/tt0120737/'],
    ['javascript:', 'javascript:alert(1)'],
    ['data:', 'data:text/html,<script>alert(1)</script>'],
    ['dominio ajeno', 'https://evil.example/title/tt1/'],
    ['sufijo engañoso', 'https://www.imdb.com.evil.example/title/tt1/'],
    ['books con sufijo engañoso', 'https://books.google.com.attacker.test/books?id=a'],
    ['credenciales en la url', 'https://user:pass@www.imdb.com/title/tt1/'],
    ['puerto', 'https://www.imdb.com:8443/title/tt1/'],
    ['ruta de imdb no esperada', 'https://www.imdb.com/registration/signin'],
    ['query en imdb', 'https://www.imdb.com/title/tt1/?ref=evil'],
    ['books sin id', 'https://books.google.com/books'],
    ['books con redirección', 'https://books.google.com/books?id=a&continue=https://evil.example'],
    ['books con id raro', 'https://books.google.com/books?id=<script>'],
    ['texto que no es url', 'no soy una url'],
  ])('rechaza %s', (_name, url) => {
    expect(isAllowedActionUrl(url)).toBe(false);
  });
});

describe('isAllowedImageUrl', () => {
  it('permite pósters https de image.tmdb.org', () => {
    expect(isAllowedImageUrl('https://image.tmdb.org/t/p/w500/abc123.jpg')).toBe(true);
  });

  it.each([
    'http://image.tmdb.org/t/p/w500/abc.jpg',
    'https://image.tmdb.org.evil.example/t/p/w500/abc.jpg',
    'https://evil.example/steal?data=secreto',
    'https://image.tmdb.org/otra/ruta.jpg',
    'https://image.tmdb.org/t/p/w500/abc.jpg?x=1',
    'https://u:p@image.tmdb.org/t/p/w500/abc.jpg',
    '::::',
  ])('rechaza %s', (url) => {
    expect(isAllowedImageUrl(url)).toBe(false);
  });
});

describe('isAllowedLinkUrl', () => {
  it('permite las urls de acciones y la página de TMDB', () => {
    expect(isAllowedLinkUrl('https://www.imdb.com/title/tt1/')).toBe(true);
    expect(isAllowedLinkUrl('https://www.themoviedb.org/movie/438631')).toBe(true);
    expect(isAllowedLinkUrl('https://evil.example')).toBe(false);
  });
});

describe('sanitizeMarkdownUrls', () => {
  it('deja intactos los pósters y links permitidos', () => {
    const md =
      '![Póster de El Señor de los Anillos](https://image.tmdb.org/t/p/w500/abc.jpg)\n' +
      '[IMDb](https://www.imdb.com/title/tt0120737/)';
    const result = sanitizeMarkdownUrls(md);
    expect(result.text).toBe(md);
    expect(result.removed).toEqual([]);
  });

  it('quita imágenes de dominios no permitidos y conserva el texto alternativo', () => {
    const result = sanitizeMarkdownUrls('Mira ![dato](https://evil.example/x.png?d=secreto) aquí');
    expect(result.text).toBe('Mira dato aquí');
    expect(result.removed).toEqual(['https://evil.example/x.png?d=secreto']);
  });

  it('quita imágenes con título y url entre <>', () => {
    const result = sanitizeMarkdownUrls('![a](<https://evil.example/a.png> "t")');
    expect(result.text).toBe('a');
    expect(result.removed).toHaveLength(1);
  });

  it('convierte links no permitidos en texto plano', () => {
    const result = sanitizeMarkdownUrls('[gana dinero](https://phishing.example/login)');
    expect(result.text).toBe('gana dinero');
    expect(result.removed).toEqual(['https://phishing.example/login']);
  });

  it('permite links a TMDB para la atribución', () => {
    const md = '[TMDB](https://www.themoviedb.org)';
    expect(sanitizeMarkdownUrls(md).text).toBe(md);
  });

  it('quita definiciones de referencia hacia dominios no permitidos', () => {
    const result = sanitizeMarkdownUrls('![x][r]\n\n[r]: https://evil.example/p.png');
    expect(result.text).not.toContain('evil.example');
    expect(result.removed).toEqual(['https://evil.example/p.png']);
  });

  it('quita etiquetas <img> crudas', () => {
    const result = sanitizeMarkdownUrls('hola <img src="https://evil.example/p.png"> adiós');
    expect(result.text).toBe('hola  adiós');
    expect(result.removed).toEqual(['https://evil.example/p.png']);
  });

  it('quita urls sueltas fuera de la allowlist (la widget las volvería links)', () => {
    const result = sanitizeMarkdownUrls(
      'Entra a https://evil.example/phish o <https://evil.example/b> ya.',
    );
    expect(result.text).toBe('Entra a [enlace eliminado] o <[enlace eliminado]> ya.');
    expect(result.removed).toEqual(['https://evil.example/phish', 'https://evil.example/b']);
  });

  it('respeta urls sueltas permitidas aunque terminen en puntuación', () => {
    const md =
      'Ficha: https://www.imdb.com/title/tt0120737/. Libro: https://books.google.com/books?id=a, ok';
    expect(sanitizeMarkdownUrls(md)).toEqual({ text: md, removed: [] });
  });

  it('quita etiquetas <img> sin src', () => {
    const result = sanitizeMarkdownUrls('a<img onerror=alert(1)>b');
    expect(result.text).toBe('ab');
    expect(result.removed).toEqual(['<img>']);
  });
});
