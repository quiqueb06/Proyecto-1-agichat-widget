import { fireEvent, render, screen } from '@testing-library/react';
import { MarkdownMessage } from './MarkdownMessage';
import { isTmdbPosterUrl } from './tmdbPosterUrl';
const valid = 'https://image.tmdb.org/t/p/w500/abc.jpg';
const invalid = [
  'http://image.tmdb.org/t/p/w500/abc.jpg',
  'https://image.tmdb.org.evil.com/t/p/w500/abc.jpg',
  'https://evil.com/image.tmdb.org/t/p/w500/abc.jpg',
  'javascript:alert(1)',
  'data:image/png;base64,AA',
  'blob:https://image.tmdb.org/abc',
  '/t/p/w500/abc.jpg',
  '//image.tmdb.org/t/p/w500/abc.jpg',
  'https://user:pass@image.tmdb.org/t/p/w500/abc.jpg',
  'https://image.tmdb.org:444/t/p/w500/abc.jpg',
  'https://image.tmdb.org/t/p/original/abc.jpg',
  'not-a-url',
  valid + '#x',
  valid + '?x=1',
];
describe('pósters seguros', () => {
  it('rechaza espacios en URLs recibidas directamente', () => {
    expect(isTmdbPosterUrl(' ' + valid)).toBe(false);
  });
  it('acepta póster y conserva alt', () => {
    expect(isTmdbPosterUrl(valid)).toBe(true);
    render(<MarkdownMessage content={`![Dune](${valid})`} />);
    expect(screen.getByRole('img', { name: 'Dune' })).toHaveAttribute('src', valid);
  });
  it.each(invalid)('rechaza URL %s', (url) => {
    expect(isTmdbPosterUrl(url)).toBe(false);
    const { container } = render(<MarkdownMessage content={`![Póster](<${url.trim()}>)`} />);
    expect(container.querySelector('img')).toBeNull();
  });
  it('conserva texto alternativo y reemplaza imágenes rotas', () => {
    const { rerender } = render(
      <MarkdownMessage content="![No permitido](https://evil.com/abc.jpg)" />,
    );
    expect(screen.getByText('No permitido')).toBeVisible();
    rerender(<MarkdownMessage content={`![Dune](${valid})`} />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('Dune')).toBeVisible();
    rerender(<MarkdownMessage content="![Otro](https://image.tmdb.org/t/p/w500/other.jpg)" />);
    expect(screen.getByRole('img', { name: 'Otro' })).toBeInTheDocument();
  });
  it('maneja alt ausente y Markdown parcial', () => {
    render(<MarkdownMessage content={`![](${valid})`} />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByText('Póster no disponible')).toBeVisible();
    expect(() =>
      render(<MarkdownMessage content="![incompleto](https://image.tmdb.org/t/p/w500/" />),
    ).not.toThrow();
    expect(isTmdbPosterUrl(undefined)).toBe(false);
  });
});
