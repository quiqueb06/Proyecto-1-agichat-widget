import type { LLMClient, LLMEvent, LLMRequest } from './types.js';

export type FakeLLMResponse =
  | {
      type: 'text';
      text: string;
      chunkSize?: number;
    }
  | {
      type: 'tool_call';
      id: string;
      name: string;
      arguments: Record<string, unknown>;
    };

export class FakeLLM implements LLMClient {
  private readonly responses: FakeLLMResponse[];
  private index = 0;

  readonly requests: LLMRequest[] = [];

  constructor(responses: readonly FakeLLMResponse[] = []) {
    this.responses = [...responses];
  }

  async *stream(request: LLMRequest): AsyncIterable<LLMEvent> {
    if (request.signal?.aborted) {
      return;
    }

    this.requests.push(request);

    const response = this.responses[this.index];

    if (!response) {
      throw new Error('FakeLLM no tiene más respuestas programadas.');
    }

    this.index += 1;

    if (response.type === 'tool_call') {
      yield {
        type: 'tool_call',
        call: {
          id: response.id,
          name: response.name,
          arguments: response.arguments,
        },
      };

      return;
    }

    const chunkSize = Math.max(1, response.chunkSize ?? response.text.length);

    for (let offset = 0; offset < response.text.length; offset += chunkSize) {
      if (request.signal?.aborted) {
        return;
      }

      yield {
        type: 'text',
        delta: response.text.slice(offset, offset + chunkSize),
      };
    }
  }
}
