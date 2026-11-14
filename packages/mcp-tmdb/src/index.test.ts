import { describe, expect, it, vi } from 'vitest';

const { serve } = vi.hoisted(() => ({ serve: vi.fn() }));
vi.mock('@modelcontextprotocol/server/stdio', () => ({ serveStdio: serve }));

describe('entrada stdio', () => {
  it('inicia el transporte con la fábrica del servidor sin escribir logs', async () => {
    const stdout = vi.spyOn(process.stdout, 'write');
    try {
      await import('./index.js');
      expect(serve).toHaveBeenCalledOnce();
      expect(serve.mock.calls[0]?.[0]).toBeTypeOf('function');
      expect(stdout).not.toHaveBeenCalled();
    } finally {
      stdout.mockRestore();
    }
  });
});
