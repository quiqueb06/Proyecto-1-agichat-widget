export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPToolResult {
  isError: boolean;
  structuredContent?: Record<string, unknown>;
  text: string;
}

export interface MCPClientLike {
  connect(): Promise<void>;
  close(): Promise<void>;
  listTools(): Promise<readonly MCPTool[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<MCPToolResult>;
}
