import type { AgentEvent, AgentRequest, AgentRunner } from './types.js';

export interface EchoAgentOptions {
  // cuantos caracteres manda en cada pedazo
  chunkSize?: number;
  // espera entre pedazos, para que se vea el streaming en la widget
  delayMs?: number;
}

// espera `ms` milisegundos, pero se corta si la senal se aborta
function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (ms <= 0 || signal.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done, { once: true });
  });
}

// agente falso para desarrollo y pruebas: no usa llm ni apis.
// repite lo que dijo el usuario en pedacitos (streaming) y si el mensaje dice
// "abrir" o "imdb" manda una accion para probar el frame action de la widget.
// cuando la persona 4 tenga el orquestador real, solo se cambia este por ese
export class EchoAgent implements AgentRunner {
  private readonly chunkSize: number;
  private readonly delayMs: number;

  constructor(options: EchoAgentOptions = {}) {
    this.chunkSize = Math.max(1, options.chunkSize ?? 8);
    this.delayMs = Math.max(0, options.delayMs ?? 40);
  }

  async *respond({ input, history, signal }: AgentRequest): AsyncIterable<AgentEvent> {
    const text =
      `**Echo** (mensaje ${history.length + 1} de la conversación):\n\n> ${input.content}\n\n` +
      'Soy un agente de prueba. Escribe "abrir imdb" para probar que la widget abre una pestaña.';

    for (let offset = 0; offset < text.length; offset += this.chunkSize) {
      // si el usuario se fue, no seguimos mandando nada
      if (signal.aborted) return;
      yield { type: 'text', delta: text.slice(offset, offset + this.chunkSize) };
      await wait(this.delayMs, signal);
    }

    if (!signal.aborted && /abrir|imdb/i.test(input.content)) {
      yield {
        type: 'action',
        action: { type: 'open_url', url: 'https://www.imdb.com/', label: 'IMDb' },
      };
    }
  }
}
