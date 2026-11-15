import { fireEvent, render, screen } from '@testing-library/react';
import { TmdbAttribution } from './TmdbAttribution';
describe('TmdbAttribution', () => {
  it('muestra créditos accesibles, logo y enlace oficial protegido', () => {
    render(<TmdbAttribution />);
    expect(screen.getByText('Créditos · TMDB')).toBeVisible();
    fireEvent.click(screen.getByText('Créditos · TMDB'));
    expect(
      screen.getByText('This product uses the TMDB API but is not endorsed or certified by TMDB.'),
    ).toBeVisible();
    const logo = screen.getByRole('img', { name: 'TMDB — The Movie Database' });
    expect(logo).toHaveAttribute('src');
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://www.themoviedb.org');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
