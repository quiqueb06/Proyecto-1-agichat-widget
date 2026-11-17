// lo mínimo que necesita el agente de evaluación de un llm: mandar mensajes y recibir
// el texto completo. lo cumplen el llm falso del ci y el cliente real de groq
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatModel {
  readonly name: string;
  complete(messages: readonly ChatMessage[], signal?: AbortSignal): Promise<string>;
}

// prefijo del mensaje donde el agente de evaluación pone los resultados de las herramientas
export const TOOL_RESULTS_PREFIX = 'Resultados de las herramientas para el último mensaje';
