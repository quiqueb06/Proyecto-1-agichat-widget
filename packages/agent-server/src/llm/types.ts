export type LLMRole = 'system' | 'user' | 'assistant' | 'tool';

export interface LLMTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface LLMToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LLMMessage {
  role: LLMRole;
  content: string;

  // Solo aplica a mensajes role="tool"
  toolCallId?: string;

  // Solo aplica a mensajes role="assistant" cuando pidió herramientas
  toolCalls?: readonly LLMToolCall[];
}

export interface LLMRequest {
  messages: readonly LLMMessage[];
  tools?: readonly LLMTool[];
  signal?: AbortSignal;
}

export type LLMEvent =
  | {
      type: 'text';
      delta: string;
    }
  | {
      type: 'tool_call';
      call: LLMToolCall;
    };

export interface LLMClient {
  stream(request: LLMRequest): AsyncIterable<LLMEvent>;
}
