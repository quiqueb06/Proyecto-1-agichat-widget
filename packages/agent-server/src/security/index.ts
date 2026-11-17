// guardrails contra owasp llm01 (prompt injection) y llm07 (system prompt leakage).
// ver docs/SEGURIDAD.md
export { createSecurityContext } from './SecurityContext.js';
export type { SecurityContext, SecurityContextOptions } from './SecurityContext.js';
export { GuardedAgent, INJECTION_REPLY, LEAK_REPLY } from './GuardedAgent.js';
export type { GuardEvent, GuardedAgentOptions } from './GuardedAgent.js';
export { detectInjection, normalizeForDetection } from './injection.js';
export type { InjectionCategory, InjectionResult } from './injection.js';
export { LeakDetector } from './leakDetector.js';
export type { LeakReason, LeakResult } from './leakDetector.js';
export { SECURITY_LIMITS } from './limits.js';
export {
  CANARY_PREFIX,
  SECURITY_RULES,
  createCanary,
  findSecrets,
  hardenSystemPrompt,
} from './systemPrompt.js';
export {
  AGENT_TOOLS,
  TOOL_ARGUMENT_SCHEMAS,
  createToolPolicy,
  guardToolCaller,
} from './toolPolicy.js';
export type { AgentKind, ToolCallResult, ToolCaller, ToolName, ToolPolicy } from './toolPolicy.js';
export {
  UNTRUSTED_CLOSE,
  UNTRUSTED_OPEN,
  sanitizeUntrustedValue,
  wrapUntrusted,
} from './untrusted.js';
export {
  isAllowedActionUrl,
  isAllowedImageUrl,
  isAllowedLinkUrl,
  sanitizeMarkdownUrls,
} from './urls.js';
