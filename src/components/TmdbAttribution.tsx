import logo from '../assets/tmdb-logo.webp?inline';

export function TmdbAttribution() {
  return (
    <footer className="agichat-credits" aria-label="Créditos">
      <details>
        <summary>Créditos · TMDB</summary>
        <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer">
          <img className="agichat-tmdb-logo" src={logo} alt="TMDB — The Movie Database" />
        </a>
        <p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
      </details>
    </footer>
  );
}
