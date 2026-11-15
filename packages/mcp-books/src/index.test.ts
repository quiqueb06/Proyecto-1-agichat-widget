import { describe, expect, it, vi } from 'vitest';

const { serve } = vi.hoisted(() => ({ serve: vi.fn() }));
vi.mock('@modelcontextprotocol/server/stdio', () => ({ serveStdio: serve }));

describe('@agichat/mcp-books', () => {
  it('inicia stdio sin credenciales', async () => {
    await import('./index.js');
    expect(serve).toHaveBeenCalledOnce();
    const factory = serve.mock.calls[0]![0] as () => { close(): Promise<void> };
    await factory().close();
  });
});
