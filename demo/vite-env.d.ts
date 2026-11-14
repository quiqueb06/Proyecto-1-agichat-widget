/// <reference types="vite/client" />

// variables de entorno que usa la demo (vite solo expone las que empiezan con VITE_)
interface ImportMetaEnv {
  // url del websocket del servidor del agente, ej. ws://localhost:8787/ws
  readonly VITE_AGENT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
