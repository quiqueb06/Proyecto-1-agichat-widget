import { z } from 'zod';
import type { ChatMessage, ChatModel } from './ChatModel.js';

// cliente mínimo de groq (api compatible con openai) solo para correr las evals a mano
// contra el modelo real. el agente de producción usa el GroqClient de la persona 4.
// nunca se usa en el ci: ahí va VulnerableFakeLLM

const MISSING_KEY = 'Falta GROQ_API_KEY (ponla en packages/agent-server/.env)';

const envSchema = z.object({
  GROQ_API_KEY: z.string({ error: MISSING_KEY }).min(1, MISSING_KEY),
  GROQ_MODEL: z.string().min(1).default('llama-3.3-70b-versatile'),
  GROQ_BASE_URL: z.url().default('https://api.groq.com/openai/v1'),
});

export interface GroqEvalConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
}

export function loadGroqEvalConfig(env: NodeJS.ProcessEnv = process.env): GroqEvalConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    throw new Error(result.error.issues.map((issue) => issue.message).join('; '));
  }
  return {
    apiKey: result.data.GROQ_API_KEY,
    model: result.data.GROQ_MODEL,
    baseUrl: result.data.GROQ_BASE_URL,
  };
}

export interface GroqChatModelOptions extends GroqEvalConfig {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxRetries?: number;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class GroqChatModel implements ChatModel {
  readonly name: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxRetries: number;

  constructor(private readonly options: GroqChatModelOptions) {
    this.name = `groq: ${options.model}`;
    this.fetchImpl = options.fetch ?? fetch;
    this.sleep = options.sleep ?? realSleep;
    this.maxRetries = options.maxRetries ?? 3;
  }

  async complete(messages: readonly ChatMessage[], signal?: AbortSignal): Promise<string> {
    for (let attempt = 0; ; attempt += 1) {
      const response = await this.fetchImpl(`${this.options.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.options.model,
          messages,
          // poca temperatura: queremos evals lo más repetibles posible
          temperature: 0.2,
          max_tokens: 800,
        }),
        signal,
      });

      // límite del free tier: esperamos lo que diga groq (o 1s, 2s, 4s) y reintentamos
      if (response.status === 429 && attempt < this.maxRetries) {
        const retryAfter = Number(response.headers.get('retry-after'));
        await this.sleep(retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt);
        continue;
      }
      if (!response.ok) {
        // solo el status: el cuerpo del error podría repetir datos sensibles
        throw new Error(`Groq respondió ${response.status}`);
      }
      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: string | null } }>;
      };
      return body.choices?.[0]?.message?.content ?? '';
    }
  }
}
