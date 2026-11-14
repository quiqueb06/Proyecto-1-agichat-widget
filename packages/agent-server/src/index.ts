// todo lo publico del servidor del agente sale por aqui (el arranque real esta en main.ts).
// la persona 4 importa de aqui los contratos (AgentRunner, frames) para programar los agentes
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
export { loadConfig } from './config.js';
export type { GatewayConfig } from './config.js';
export { createGateway } from './gateway/server.js';
export type { Gateway, GatewayOptions } from './gateway/server.js';
export { InMemorySessionStore } from './session/SessionStore.js';
export type { InMemorySessionStoreOptions, SessionStore } from './session/SessionStore.js';
export { createLogger, silentLogger } from './logger.js';
export type { LogFields, Logger, LogLevel } from './logger.js';
export { isOriginAllowed } from './gateway/server.js';
export { RateLimiter } from './gateway/RateLimiter.js';
export type { RateLimiterOptions } from './gateway/RateLimiter.js';
export type { ConnectionLimits } from './gateway/connection.js';
