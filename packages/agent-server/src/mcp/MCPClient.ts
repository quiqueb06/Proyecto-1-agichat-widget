import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import type { MCPClientLike, MCPTool, MCPToolResult } from './types.js';

export interface MCPClientOptions {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export class MCPClient implements MCPClientLike {
  private readonly client: Client;
  private readonly transport: StdioClientTransport;
  private connected = false;

  constructor(options: MCPClientOptions) {
    this.client = new Client({
      name: options.name,
      version: '0.1.0',
    });

    this.transport = new StdioClientTransport({
      command: options.command,
      args: options.args,
      env: options.env,
    });
  }

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    await this.client.connect(this.transport);
    this.connected = true;
  }

  async close(): Promise<void> {
    if (!this.connected) {
      return;
    }

    await this.client.close();
    this.connected = false;
  }

  async listTools(): Promise<readonly MCPTool[]> {
    this.ensureConnected();

    const result = await this.client.listTools();

    return result.tools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? '',
      inputSchema: tool.inputSchema as Record<string, unknown>,
    }));
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<MCPToolResult> {
    this.ensureConnected();

    const result = await this.client.callTool({
      name,
      arguments: args,
    });

    const text = result.content
      .filter(
        (
          item,
        ): item is {
          type: 'text';
          text: string;
        } => item.type === 'text',
      )
      .map((item) => item.text)
      .join('\n');

    return {
      isError: result.isError === true,
      structuredContent:
        result.structuredContent && typeof result.structuredContent === 'object'
          ? (result.structuredContent as Record<string, unknown>)
          : undefined,
      text,
    };
  }

  private ensureConnected(): void {
    if (!this.connected) {
      throw new Error('El cliente MCP no está conectado.');
    }
  }
}
