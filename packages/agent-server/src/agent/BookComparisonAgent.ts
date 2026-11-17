import type {
  LLMClient,
  LLMMessage,
  LLMTool,
} from '../llm/types.js';
import type { MCPClientLike } from '../mcp/types.js';

export interface BookComparisonRequest {
  input: string;
  movieContext?: string;
  history?: readonly LLMMessage[];
  signal?: AbortSignal;
}

export interface BookComparisonResult {
  text: string;
  context: string;
  references: {
    googleBooksUrl?: string;
  };
}

const SYSTEM_PROMPT = `
Eres el subagente especializado en libros y comparación de adaptaciones de AGIChat.

Tu responsabilidad es:
- buscar libros relacionados con una película;
- obtener información del libro;
- comparar película y libro usando las herramientas disponibles;
- emitir un veredicto claro sobre si vale la pena ver la película.

Reglas:
- Usa las herramientas de Google Books cuando necesites datos.
- No inventes libros, ratings, autores ni relaciones entre película y libro.
- Los ratings de comparación ya pueden venir normalizados a una escala de 10.
- Si compare_movie_book devuelve found:false, explica que no se encontró una coincidencia fiable.
- Si devuelve found:true, eso representa un candidato y no demuestra por sí solo que la película sea una adaptación.
- El veredicto debe ser razonado y debe indicar claramente si vale la pena ver la película.
- Si existe infoLink, puedes mencionarlo como referencia de Google Books.
- Responde en español.
`.trim();

export class BookComparisonAgent {
  constructor(
    private readonly llm: LLMClient,
    private readonly mcp: MCPClientLike,
  ) {}

  async run(
    request: BookComparisonRequest,
  ): Promise<BookComparisonResult> {
    const tools = await this.getTools();

    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: SYSTEM_PROMPT,
      },
      ...(request.history ?? []),
    ];

    if (request.movieContext) {
      messages.push({
        role: 'system',
        content: `Contexto de la película:\n${request.movieContext}`,
      });
    }

    messages.push({
      role: 'user',
      content: request.input,
    });

    let finalText = '';

    const context: string[] = [];

    const references: BookComparisonResult['references'] =
      {};

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
        const result = await this.mcp.callTool(
          call.name,
          call.arguments,
        );

        if (result.structuredContent) {
          context.push(
            JSON.stringify(result.structuredContent),
          );

          const book =
            result.structuredContent.book;

          if (
            book &&
            typeof book === 'object'
          ) {
            const infoLink = (
              book as Record<string, unknown>
            ).infoLink;

            if (typeof infoLink === 'string') {
              references.googleBooksUrl =
                infoLink;
            }
          }

          const infoLink =
            result.structuredContent.infoLink;

          if (typeof infoLink === 'string') {
            references.googleBooksUrl =
              infoLink;
          }
        }

        messages.push({
          role: 'tool',
          toolCallId: call.id,
          content: JSON.stringify({
            isError: result.isError,
            structuredContent:
              result.structuredContent,
            text: result.text,
          }),
        });
      }
    }

    throw new Error(
      'BookComparisonAgent excedió el número máximo de ciclos de herramientas.',
    );
  }

  private async getTools(): Promise<LLMTool[]> {
    const tools = await this.mcp.listTools();

    const allowed = new Set([
      'search_book',
      'get_book_details',
      'compare_movie_book',
    ]);

    return tools
      .filter((tool) => allowed.has(tool.name))
      .map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      }));
  }
}
