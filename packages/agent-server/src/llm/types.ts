export type LLMRole = 'system' | 'user' | 'assistant' | 'tool';

export interface LLMMessage {
  role: LLMRole;
  content: string;
  // se usa cuando el mensaje corresponde al resultado de una herramienta
  toolCallId?: string;
}

export interface LLMTool {
  name: string;
  description: string;
  // JSON Schema que describe los argumentos aceptados por la herramienta
  inputSchema: Record<string, unknown>;
}

export interface LLMToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
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
