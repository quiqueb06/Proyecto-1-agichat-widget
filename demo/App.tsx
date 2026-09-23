import { AGIChatWidget, StatusBadge, VERSION } from '../src';

/**
 * Página de demostración: simula el sitio de un cliente que integra el widget.
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
      {/* widget conectado al mock: responde con markdown simulado y streaming */}
      <AGIChatWidget
        transport="mock"
        title="AGIChat"
        welcomeMessage="Hola, ¿en qué te puedo ayudar?"
        persistHistory
      />
    </main>
  );
}
