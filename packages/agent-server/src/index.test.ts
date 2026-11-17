import { describe, expect, it } from 'vitest';
import { GuardedAgent, SERVICE_NAME, createSecurityContext } from './index.js';

describe('@agichat/agent-server', () => {
  it('expone su nombre', () => {
    expect(SERVICE_NAME).toBe('agichat-agent-server');
  });

  it('expone los guardrails para que el orquestador los use', () => {
    expect(createSecurityContext().guardAgent({ respond: async function* () {} })).toBeInstanceOf(
      GuardedAgent,
    );
  });
});
