import { StatusBadge, VERSION } from '../src';

/**
 * Página de demostración: simula el sitio de un cliente que integra el widget.
 * Cuando el widget esté listo (Personas 3 y 4), se monta aquí.
 */
export function App() {
  return (
    <main className="demo">
      <h1>AGIChat SDK</h1>
      <p>Sitio de ejemplo de un cliente que integra el widget de chat agéntico.</p>
      <p>
        Versión del SDK: <code>{VERSION}</code>
      </p>
      <StatusBadge label="Mock API" />
    </main>
  );
}
