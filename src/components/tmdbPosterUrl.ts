/** Solo pósters TMDB absolutos; enlaces Markdown tienen una política independiente. */
export function isTmdbPosterUrl(value: string | undefined): boolean {
  if (!value || value !== value.trim()) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'image.tmdb.org' &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.hash &&
      !url.search &&
      /^\/t\/p\/w500\/[a-zA-Z0-9_-]+\.(jpg|png|webp)$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}
