import { describe, expect, it } from 'vitest';
import { SERVICE_NAME } from './index.js';

describe('@agichat/agent-server', () => {
  it('expone su nombre', () => {
    expect(SERVICE_NAME).toBe('agichat-agent-server');
  });
});
