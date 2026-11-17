import type { LLMClient, LLMMessage, LLMTool } from '../llm/types.js';
import type { MCPClientLike } from '../mcp/types.js';
import type { AgentOptions } from './types.js';

export interface MovieAgentRequest {
  input: string;
  history?: readonly LLMMessage[];
  signal?: AbortSignal;
}

export interface MovieAgentResult {
  text: string;
  context: string;
  references: {
    imdbUrl?: string;
    posterUrl?: string;
  };
}

const SYSTEM_PROMPT = `
Eres el subagente especializado en películas de AGIChat.

Tu responsabilidad es ayudar exclusivamente con películas utilizando
las herramientas disponibles de TMDB.

Puedes:
- buscar películas;
- obtener detalles de una película;
- recomendar películas;
- obtener póster, rating, IMDb y evidencia de si está basada en un libro.

Reglas:
- Usa las herramientas cuando necesites datos de películas.
- Toda afirmación factual sobre una película debe estar respaldada por los datos devueltos por TMDB en este turno.
- No inventes títulos, ratings, años, sinopsis, géneros, URLs ni otros datos.
- Si TMDB no devuelve un dato, indica que no está disponible.
- Solo menciona películas presentes en los resultados devueltos por las herramientas.
- Si una herramienta devuelve poster_url, SIEMPRE muestra el póster usando Markdown con este formato:
  ![Póster de <título>](<poster_url>)
- No muestres poster_url únicamente como enlace de texto.
- Si una herramienta devuelve imdb_url, puedes mencionarlo como enlace de referencia.
- Si literary_adaptation.status es "evidence_found", indica que existe evidencia de que la película está basada en un libro.
- Si no hay evidencia, no afirmes que no existe un libro; indica únicamente que TMDB no encontró evidencia.
- Responde en español.
`.trim();

export class MovieAgent {
  private readonly systemPrompt: string;

  constructor(
    private readonly llm: LLMClient,
    private readonly mcp: MCPClientLike,
    options: AgentOptions = {},
  ) {
    this.systemPrompt = options.security?.hardenPrompt(SYSTEM_PROMPT) ?? SYSTEM_PROMPT;
  }

  async run(request: MovieAgentRequest): Promise<MovieAgentResult> {
    const tools = await this.getTools();

    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: this.systemPrompt,
      },
      ...(request.history ?? []),
      {
        role: 'user',
        content: request.input,
      },
    ];

    let finalText = '';

    const context: string[] = [];

    const references: MovieAgentResult['references'] = {};

    for (let round = 0; round < 8; round += 1) {
      if (request.signal?.aborted) {
        return {
          text: finalText,
          context: context.join('\n'),
          references,
        };
      }

      let text = '';
      const toolCalls = [];

      for await (const event of this.llm.stream({
        messages,
        tools,
        signal: request.signal,
      })) {
        if (event.type === 'text') {
          text += event.delta;
          continue;
        }

        toolCalls.push(event.call);
      }

      if (text) {
        finalText += text;
      }

      if (toolCalls.length === 0) {
        return {
          text: finalText.trim(),
          context: context.join('\n'),
          references,
        };
      }

      messages.push({
        role: 'assistant',
        content: text,
        toolCalls,
      });

      for (const call of toolCalls) {
        const result = await this.mcp.callTool(call.name, call.arguments);

        if (result.isError) {
          return {
            text: `No pude consultar TMDB en este momento. Detalle técnico: ${result.text}`,
            context: result.text,
            references,
          };
        }

        if (result.structuredContent) {
          context.push(JSON.stringify(result.structuredContent));

          const imdbUrl = result.structuredContent.imdb_url;

          const posterUrl = result.structuredContent.poster_url;

          if (typeof imdbUrl === 'string') {
            references.imdbUrl = imdbUrl;
          }

          if (typeof posterUrl === 'string') {
            references.posterUrl = posterUrl;
          }
        }

        messages.push({
          role: 'tool',
          toolCallId: call.id,
          content: JSON.stringify({
            isError: result.isError,
            structuredContent: result.structuredContent,
            text: result.text,
          }),
        });
      }
    }

    throw new Error('MovieAgent excedió el número máximo de ciclos de herramientas.');
  }

  private async getTools(): Promise<LLMTool[]> {
    const tools = await this.mcp.listTools();

    const allowed = new Set(['search_movie', 'get_movie_details', 'recommend_movies']);

    return tools
      .filter((tool) => allowed.has(tool.name))
      .map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      }));
  }
}
