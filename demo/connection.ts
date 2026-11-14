import type { WidgetConfig } from '../src';

// decide a que se conecta la demo segun la variable VITE_AGENT_URL (ver .env.example):
// - si es una url ws:// o wss:// valida, usa el servidor del agente real
// - si no hay url (ej. la demo de github pages sin servidor) o esta mal escrita, usa el mock
// asi la demo nunca se rompe por una variable mal puesta
export function agentConnection(url: string | undefined): WidgetConfig {
  const value = url?.trim();
  if (!value) return { transport: 'mock' };
  try {
    const { protocol } = new URL(value);
    if (protocol === 'ws:' || protocol === 'wss:')
      return { transport: 'websocket', endpoint: value };
  } catch {
    // no es una url, cae al mock de abajo
  }
  console.warn(`VITE_AGENT_URL no es una URL ws:// o wss:// válida ("${value}"); se usa el mock.`);
  return { transport: 'mock' };
}
