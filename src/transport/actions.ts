import type { OpenUrlAction } from '../types';

// Defense at the browser boundary, independent of backend guardrails.
export function isOpenUrlAction(value: unknown): value is OpenUrlAction {
  if (!value || typeof value !== 'object') return false;
  const action = value as Record<string, unknown>;
  if (
    action.type !== 'open_url' ||
    typeof action.url !== 'string' ||
    action.url.length > 2048 ||
    typeof action.label !== 'string' ||
    !action.label.trim() ||
    action.label.length > 80
  )
    return false;
  try {
    const url = new URL(action.url);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
    if (['imdb.com', 'www.imdb.com'].includes(url.hostname)) {
      return !url.search && !url.hash && /^(?:\/|\/title\/tt\d+\/?)$/.test(url.pathname);
    }
    return (
      ['books.google.com', 'books.google.es', 'books.google.com.gt'].includes(url.hostname) &&
      url.pathname === '/books' &&
      !url.hash &&
      [...url.searchParams.keys()].length === 1 &&
      /^[A-Za-z0-9_-]{1,128}$/.test(url.searchParams.get('id') ?? '')
    );
  } catch {
    return false;
  }
}
