// punto de entrada del servidor del agente (el gateway llega en las siguientes partes).
// por ahora exporta los contratos para que la persona 4 programe contra ellos
export const SERVICE_NAME = 'agichat-agent-server';

export { messageSchema } from './protocol/message.js';
export type { Message, MessageRole } from './protocol/message.js';
export {
  agentActionSchema,
  clientFrameSchema,
  parseClientFrame,
  serializeFrame,
} from './protocol/frames.js';
export type { AgentAction, ClientFrame, ParseResult, ServerFrame } from './protocol/frames.js';
export type { AgentEvent, AgentRequest, AgentRunner } from './agent/types.js';
export { EchoAgent } from './agent/EchoAgent.js';
export type { EchoAgentOptions } from './agent/EchoAgent.js';
