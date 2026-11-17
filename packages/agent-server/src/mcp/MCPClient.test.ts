import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/server';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';

async function createInMemoryPair() {
  const server = new McpServer({
    name: 'test-server',
    version: '1.0.0',
  });

  server.registerTool(
    'echo_tool',
    {
      description: 'Devuelve el texto recibido',
      inputSchema: z.object({
        text: z.string(),
      }),
      outputSchema: z.object({
        echoed: z.string(),
      }),
    },
    async (args) => {
      const result = {
        echoed: args.text,
      };

      return {
        structuredContent: result,
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result),
          },
        ],
      };
    },
  );

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  const client = new Client({
    name: 'test-client',
    version: '1.0.0',
  });

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  return {
    server,
    client,
  };
}

describe('MCP SDK integration', () => {
  it('descubre herramientas', async () => {
    const { server, client } = await createInMemoryPair();

    try {
      const result = await client.listTools();

      expect(result.tools.some((tool) => tool.name === 'echo_tool')).toBe(true);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it('ejecuta herramientas', async () => {
    const { server, client } = await createInMemoryPair();

    try {
      const result = await client.callTool({
        name: 'echo_tool',
        arguments: {
          text: 'hola',
        },
      });

      expect(result.structuredContent).toEqual({
        echoed: 'hola',
      });
    } finally {
      await client.close();
      await server.close();
    }
  });
});
