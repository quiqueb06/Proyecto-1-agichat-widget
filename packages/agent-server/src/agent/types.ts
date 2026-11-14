import type { AgentAction } from '../protocol/frames.js';
import type { Message } from '../protocol/message.js';

// contrato entre el gateway (persona 1) y los agentes (persona 4).
// el gateway no sabe nada de llm ni de mcp: solo le pasa la conversacion a un AgentRunner
// y va mandando a la widget lo que el agente le devuelva

// lo que recibe el agente en cada turno
export interface AgentRequest {
  // id de la sesion (una por conexion), sirve para logs o memoria del agente
  sessionId: string;
  // mensajes anteriores de la conversacion, sin incluir `input`
  history: readonly Message[];
  // el mensaje nuevo del usuario
  input: Message;
  // se activa si el usuario se desconecta: el agente debe dejar de trabajar
  // (y de gastar requests de groq) en cuanto lo vea
  signal: AbortSignal;
}

// lo que el agente va devolviendo mientras trabaja
export type AgentEvent =
  // un pedacito nuevo de texto (markdown). el gateway los va juntando
  | { type: 'text'; delta: string }
  // pedirle a la widget que haga algo, ej. abrir imdb en otra pestana
  | { type: 'action'; action: AgentAction };

// cualquier agente (el echo de pruebas o el orquestador real) cumple esto.
// si algo falla, el agente simplemente lanza un error y el gateway lo convierte
// en un frame de error para la widget
export interface AgentRunner {
  respond(request: AgentRequest): AsyncIterable<AgentEvent>;
}
