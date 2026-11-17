import type {
  LLMClient,
  LLMEvent,
  LLMMessage,
  LLMRequest,
  LLMTool,
} from './types.js';

export interface GroqClientOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  maxRetries?: number;
  fetchFn?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

interface GroqToolCallDelta {
  index?: number;
  id?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

interface GroqChunk {
  choices?: Array<{
    delta?: {
      content?: string | null;
      tool_calls?: GroqToolCallDelta[];
    };
  }>;
}

interface PendingToolCall {
  id: string;
  name: string;
  arguments: string;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toGroqMessage(message: LLMMessage) {
  if (message.role === 'tool') {
    return {
      role: 'tool',
      content: message.content,
      tool_call_id: message.toolCallId,
    };
  }

  if (message.role === 'assistant' && message.toolCalls?.length) {
    return {
      role: 'assistant',
      content: message.content || null,
      tool_calls: message.toolCalls.map((call) => ({
        id: call.id,
        type: 'function',
        function: {
          name: call.name,
          arguments: JSON.stringify(call.arguments),
        },
      })),
    };
  }

  return {
    role: message.role,
    content: message.content,
  };
}

function toGroqTool(tool: LLMTool) {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  };
}

export class GroqClient implements LLMClient {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly fetchFn: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: GroqClientOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.baseUrl =
      options.baseUrl ?? 'https://api.groq.com/openai/v1';
    this.maxRetries = Math.max(0, options.maxRetries ?? 3);
    this.fetchFn = options.fetchFn ?? fetch;
    this.sleep = options.sleep ?? defaultSleep;
  }

  async *stream(request: LLMRequest): AsyncIterable<LLMEvent> {
    if (request.signal?.aborted) {
      return;
    }

    const response = await this.requestWithRetry(request);

    if (!response.body) {
      throw new Error('Groq devolvió una respuesta sin body.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    let buffer = '';

    const pendingToolCalls = new Map<number, PendingToolCall>();

    try {
      while (true) {
        if (request.signal?.aborted) {
          await reader.cancel();
          return;
        }

        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const rawLine of lines) {
          const line = rawLine.trim();

          if (!line.startsWith('data:')) {
            continue;
          }

          const data = line.slice(5).trim();

          if (!data || data === '[DONE]') {
            continue;
          }

          const chunk = JSON.parse(data) as GroqChunk;
          const delta = chunk.choices?.[0]?.delta;

          if (!delta) {
            continue;
          }

          if (delta.content) {
            yield {
              type: 'text',
              delta: delta.content,
            };
          }

          for (const toolDelta of delta.tool_calls ?? []) {
            const index = toolDelta.index ?? 0;

            const current = pendingToolCalls.get(index) ?? {
              id: '',
              name: '',
              arguments: '',
            };

            if (toolDelta.id) {
              current.id = toolDelta.id;
            }

            if (toolDelta.function?.name) {
              current.name += toolDelta.function.name;
            }

            if (toolDelta.function?.arguments) {
              current.arguments += toolDelta.function.arguments;
            }

            pendingToolCalls.set(index, current);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    for (const call of pendingToolCalls.values()) {
      let args: Record<string, unknown>;

      try {
        args = JSON.parse(call.arguments || '{}') as Record<
          string,
          unknown
        >;
      } catch {
        throw new Error(
          `Groq devolvió argumentos inválidos para la herramienta ${call.name}.`,
        );
      }

      yield {
        type: 'tool_call',
        call: {
          id: call.id,
          name: call.name,
          arguments: args,
        },
      };
    }
  }

  private async requestWithRetry(
    request: LLMRequest,
  ): Promise<Response> {
    let attempt = 0;

    while (true) {
      if (request.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      const response = await this.fetchFn(
        `${this.baseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.model,
            messages: request.messages.map(toGroqMessage),
            tools: request.tools?.map(toGroqTool),
            tool_choice:
              request.tools && request.tools.length > 0
                ? 'auto'
                : undefined,
            stream: true,
          }),
          signal: request.signal,
        },
      );

      if (response.ok) {
        return response;
      }

      if (
        response.status !== 429 ||
        attempt >= this.maxRetries
      ) {
        const text = await response.text().catch(() => '');

        throw new Error(
          `Groq respondió ${response.status}${
            text ? `: ${text}` : ''
          }`,
        );
      }

      const retryAfter = Number(
        response.headers.get('retry-after') ?? '1',
      );

      const delayMs =
        Number.isFinite(retryAfter) && retryAfter >= 0
          ? retryAfter * 1000
          : 1000;

      attempt += 1;

      await this.sleep(delayMs);
    }
  }
}
