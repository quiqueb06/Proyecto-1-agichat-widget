# Conexión y Mock API

El SDK exporta `Message`, `ChatTransport`, `WidgetConfig`, los eventos/estados y
`createTransport`. La configuración es explícita: no se usa el mock como fallback
silencioso ante errores del servidor real.

```ts
import { createTransport } from 'agichat-widget';

const transport = createTransport({ transport: 'mock' });
// Para el servidor real:
// createTransport({ transport: 'websocket', endpoint: 'wss://example.com/chat' });
const unsubscribe = transport.subscribe((event) => {
  if (event.type === 'state' && event.state === 'connected') {
    transport.send({
      id: crypto.randomUUID(),
      role: 'user',
      content: 'Hola',
      createdAt: new Date().toISOString(),
      status: 'complete',
    });
  }
  if (event.type === 'message') {
    // Insertar o reemplazar por event.message.id; content es acumulado.
  }
  if (event.type === 'error') {
    // Mostrar event.error.message.
  }
});
transport.connect();
// Al desmontar: transport.disconnect(); unsubscribe();
```

`connect()` inicia una conexión asíncrona y es idempotente mientras está activa.
`state` permite consultar el estado actual; `subscribe` escucha cambios futuros.
`send()` exige estado `connected`: en caso contrario emite un error y lanza una
excepción. El transporte no agrega el mensaje del usuario al historial.

## Mock

`mock` acepta `delayMs` (300), `chunkIntervalMs` (40), `chunkSize` (12) y `response`
(Markdown predeterminado). La conexión y el inicio de respuesta tienen retraso.
Cada envío genera una respuesta independiente con ID propio. Los fragmentos
comparten ese ID y contienen el texto acumulado, con `status: streaming` hasta el
último evento `complete`. Desconectar cancela todos los temporizadores pendientes;
se puede volver a conectar explícitamente.

## Protocolo WebSocket propuesto para fase 2

El backend todavía no existe en este repositorio. Debe enviar y recibir frames de
texto JSON con este contrato (sin autenticación implícita):

```json
{
  "type": "message",
  "message": {
    "id": "assistant-1",
    "role": "assistant",
    "content": "Hola **mundo**",
    "createdAt": "2026-09-22T00:00:00.000Z",
    "status": "complete"
  }
}
```

Para streaming, enviar snapshots acumulados con el mismo ID y `status: streaming`,
seguidos de `complete`. Los errores del servidor usan
`{"type":"error","error":"Descripción"}`. Los frames inválidos generan un evento
de error sin interrumpir la conexión. El consumidor debe renderizar Markdown de
forma segura; el transporte solo entrega texto.

Estados: `disconnected`, `connecting`, `connected`, `reconnecting`, `error`.
`websocket` acepta `connectTimeoutMs` (10000), `reconnectDelayMs` (1000) y
`maxReconnectAttempts` (3, además del intento inicial). Cierres remotos, errores
de conexión, timeout y errores de envío provocan reintentos con espera exponencial
limitada a 30 segundos. Una conexión exitosa reinicia el contador. Al agotarlo,
queda en `error` y se puede llamar a `connect()` de nuevo. `disconnect()` cancela
los reintentos y libera el socket. No se reenvían mensajes automáticamente para
evitar duplicados; la recuperación del historial queda a cargo de la fase 2.

## Protocolo v2 (proyecto 2)

El servidor del agente vive en `packages/agent-server`. La fuente de verdad del protocolo
son los esquemas de `packages/agent-server/src/protocol/` (`message.ts` y `frames.ts`).
Todo frame es texto JSON con un campo `type`.

### Widget → servidor

Igual que en la fase anterior, pero el servidor es más estricto:

```json
{
  "type": "message",
  "message": {
    "id": "u-1",
    "role": "user",
    "content": "Recomiéndame una película de terror",
    "createdAt": "2026-11-13T10:00:00.000Z",
    "status": "complete"
  }
}
```

- `role` debe ser `user` y `status` debe ser `complete`. El servidor rechaza mensajes con
  `role` `system` o `assistant`, para que nadie pueda hacerse pasar por el sistema o por el
  agente.
- Un frame inválido (no es JSON, otra forma, otro `type`) recibe un frame `error` y la
  conexión sigue abierta.

### Servidor → widget

| Frame     | Forma                                                                    | Uso                                                        |
| --------- | ------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `message` | `{ "type": "message", "message": Message }`                              | Respuesta del agente en streaming (sin cambios).           |
| `error`   | `{ "type": "error", "error": "Descripción" }`                            | Error de validación, del agente o de límites.              |
| `action`  | `{ "type": "action", "action": { "type": "open_url", "url", "label" } }` | **Nuevo.** Pide a la widget abrir un link en otra pestaña. |

La respuesta del agente se sigue enviando como snapshots acumulados con el mismo `id`
(`status: streaming`) y termina con `status: complete`. Los frames `action` pueden llegar
antes, durante o después de esos snapshots.

Ejemplo de `action`:

```json
{
  "type": "action",
  "action": {
    "type": "open_url",
    "url": "https://www.imdb.com/title/tt0120737/",
    "label": "IMDb"
  }
}
```

- `url` siempre usa `https`. Los dominios permitidos (IMDb, Google Books, imágenes de
  TMDB) los define la allowlist de los guardrails de seguridad.
- `label` (1 a 80 caracteres) es el texto del link de respaldo. Los navegadores pueden
  bloquear la pestaña si pasó mucho tiempo desde el último gesto del usuario, así que la
  widget **siempre** muestra también el link.
- La widget debe aceptar este frame. Hoy `WebSocketTransport` trata cualquier `type`
  desconocido como error (lo actualiza la Persona 3).

### Contrato con los agentes: `AgentRunner`

El gateway no sabe de LLMs ni de MCP: le pasa la conversación a un `AgentRunner`
(`packages/agent-server/src/agent/types.ts`) y reenvía lo que devuelve.

```ts
interface AgentRunner {
  respond(request: AgentRequest): AsyncIterable<AgentEvent>;
}

interface AgentRequest {
  sessionId: string;
  history: readonly Message[]; // conversación anterior, sin `input`
  input: Message; // mensaje nuevo del usuario
  signal: AbortSignal; // se activa si el usuario se desconecta
}

type AgentEvent =
  | { type: 'text'; delta: string } // pedazo de texto Markdown
  | { type: 'action'; action: AgentAction }; // ej. abrir IMDb
```

- El agente devuelve **pedazos** de texto (`delta`). El gateway los acumula y arma los
  snapshots para la widget.
- Si algo falla, el agente lanza un error y el gateway lo convierte en un frame `error`.
- Cuando `signal` se aborta, el agente debe dejar de trabajar (y de gastar requests).
- `EchoAgent` es un agente falso que cumple el contrato. Repite el mensaje en streaming y,
  si el mensaje dice "abrir" o "imdb", manda un `action`. Sirve para probar el gateway y la
  widget sin LLM.
