import { describe, expect, it } from 'vitest';
import { MCPClient } from './MCPClient.js';

describe('MCPClient', () => {
  it('no permite listar herramientas antes de conectar', async () => {
    const client = new MCPClient({
      name: 'test',
      command: 'node',
      args: [],
    });

    await expect(client.listTools()).rejects.toThrow('El cliente MCP no está conectado.');
  });

  it('no permite llamar herramientas antes de conectar', async () => {
    const client = new MCPClient({
      name: 'test',
      command: 'node',
      args: [],
    });

    await expect(client.callTool('echo_tool', {})).rejects.toThrow(
      'El cliente MCP no está conectado.',
    );
  });

  it('close no falla si todavía no está conectado', async () => {
    const client = new MCPClient({
      name: 'test',
      command: 'node',
      args: [],
    });

    await expect(client.close()).resolves.toBeUndefined();
  });
});
