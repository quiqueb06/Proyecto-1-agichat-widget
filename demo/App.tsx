import { AGIChatView, AGIChatWidget, StatusBadge, VERSION } from '../src';
import { agentConnection } from './connection';

// con VITE_AGENT_URL la demo habla con el servidor del agente; sin ella usa el mock
const connection = agentConnection(import.meta.env.VITE_AGENT_URL);
const usesAgent = connection.transport === 'websocket';

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

      <StatusBadge label={usesAgent ? 'Servidor del agente' : 'Mock API'} online={usesAgent} />

      <p>
        <a href="./embed.html">Ver la demo con el script embebible (sin React)</a>
      </p>

      {/* con el agente real no guardamos historial en el navegador: el servidor recuerda la
          conversacion solo mientras dura la conexion, y al recargar seria confuso ver mensajes
          viejos que el agente ya no recuerda */}
      <AGIChatWidget
        {...connection}
        title="AGIChat"
        welcomeMessage="Hola, ¿en qué te puedo ayudar?"
        persistHistory={!usesAgent}
        view={AGIChatView}
        theme="auto"
      />
    </main>
  );
}
