import { describe, expect, it } from 'vitest';
import { SERVER_NAME } from './index.js';

describe('@agichat/mcp-tmdb', () => {
  it('expone su nombre', () => {
    expect(SERVER_NAME).toBe('agichat-mcp-tmdb');
  });
});
