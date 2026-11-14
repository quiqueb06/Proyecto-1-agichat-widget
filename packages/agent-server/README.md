# @agichat/agent-server

Servidor del agente de AGIChat. Recibe los mensajes de la widget por WebSocket, mantiene la sesión de cada conversación y le pasa cada turno a un `AgentRunner`. Hoy ese runner es el `EchoAgent` de pruebas; la Persona 4 lo reemplaza por el orquestador. La vista de alto nivel está en [docs/ARQUITECTURA.md](../../docs/ARQUITECTURA.md#9-sistema-de-agentes-proyecto-2-arquitectura-de-alto-nivel).

## Cómo correrlo

Desde la raíz del repositorio:

```bash
npm run dev:agent
```

Usa `tsx watch`, así que recarga al guardar. Para producción:

```bash
npm run build -w @agichat/agent-server
npm run start -w @agichat/agent-server
```

Con Docker, consulta [docs/DESPLIEGUE.md](../../docs/DESPLIEGUE.md).

El servidor expone dos rutas:

| Ruta      | Qué es                                                                           |
| --------- | -------------------------------------------------------------------------------- |
| `/ws`     | WebSocket de la widget (protocolo v2 de [TRANSPORT.md](../../docs/TRANSPORT.md)) |
| `/health` | `{"status":"ok","connections":N}` para Docker o un balanceador                   |

## Configuración

Toda la configuración sale de variables de entorno, y `src/config.ts` la valida con `zod` al arrancar. Si un valor es inválido, el servidor no arranca y dice cuál es. Para desarrollo, copia `.env.example` como `.env` en esta carpeta; git lo ignora.

| Variable                                       | Default                                       | Para qué                                      |
| ---------------------------------------------- | --------------------------------------------- | --------------------------------------------- |
| `PORT` / `HOST`                                | `8787` / `0.0.0.0`                            | Dónde escucha                                 |
| `WS_PATH`                                      | `/ws`                                         | Ruta del WebSocket                            |
| `ALLOWED_ORIGINS`                              | `http://localhost:5173,http://localhost:4173` | Orígenes que pueden conectarse (`*` = todos)  |
| `SESSION_TTL_MS`                               | `1800000` (30 min)                            | Vida de una sesión sin actividad              |
| `MAX_HISTORY_MESSAGES`                         | `30`                                          | Mensajes que se recuerdan por sesión          |
| `STREAM_THROTTLE_MS`                           | `50`                                          | Cada cuánto se manda un snapshot              |
| `MAX_CONNECTIONS`                              | `100`                                         | Conexiones simultáneas (luego responde 503)   |
| `MAX_PAYLOAD_BYTES`                            | `16384`                                       | Tamaño máximo de un frame (luego cierra 1009) |
| `MAX_MESSAGE_CHARS`                            | `2000`                                        | Largo máximo de un mensaje                    |
| `RATE_LIMIT_MESSAGES` / `RATE_LIMIT_WINDOW_MS` | `10` / `60000`                                | Mensajes por ventana y por conexión           |
| `MAX_QUEUED_MESSAGES`                          | `2`                                           | Mensajes en espera además del que se responde |
| `HEARTBEAT_MS`                                 | `30000`                                       | Intervalo del ping/pong                       |

Las API keys de Groq, TMDB y Google Books también irán aquí cuando las agreguen las demás personas. **Nunca se commitean**: solo se commitea `.env.example`.

## Estructura

```text
src/
├── main.ts                 # arranque: carga config, crea el gateway con el agente, apagado ordenado
├── index.ts                # exports públicos del paquete (contratos y piezas)
├── config.ts               # variables de entorno validadas con zod
├── logger.ts               # logs JSON de una línea (nunca registra el contenido de los mensajes)
├── protocol/               # esquemas zod de Message y de los frames del protocolo v2
├── agent/                  # contrato AgentRunner y EchoAgent de pruebas
├── session/                # SessionStore (interfaz) e InMemorySessionStore
└── gateway/                # servidor HTTP/WebSocket, conexión por cliente y RateLimiter
```

## Contrato con los agentes

El gateway no sabe nada de LLM ni de MCP. Solo llama a un `AgentRunner` (definido en `src/agent/types.ts`):

```ts
interface AgentRunner {
  respond(request: {
    sessionId: string;
    history: readonly Message[];
    input: Message;
    signal: AbortSignal;
  }): AsyncIterable<{ type: 'text'; delta: string } | { type: 'action'; action: AgentAction }>;
}
```

- Cada `text` es un **pedazo nuevo** de Markdown. El gateway los acumula y manda snapshots con el mismo `id`.
- Cada `action` (por ejemplo `open_url`) se valida con `agentActionSchema` antes de reenviarse. Las acciones inválidas se descartan y quedan en el log.
- Si el agente falla, **lanza un error**. El gateway responde con un mensaje de disculpa (o con el texto parcial y una nota) más un frame `error`. El contenido del error no llega a la widget.
- Cuando `signal` se aborta (el usuario se desconectó), el agente debe dejar de trabajar para no gastar requests.

Para conectar el agente real basta con cambiar `new EchoAgent()` en `src/main.ts` por el orquestador.

## Logs

Cada línea es un JSON con `time`, `level` y `event`:

- **Info:** `servidor_escuchando`, `conexion_abierta`, `conexion_cerrada`, `apagando`, `servidor_cerrado`.
- **Warn:** `origen_rechazado`, `servidor_lleno`, `mensaje_rechazado` (con `reason`), `accion_invalida`, `cliente_sin_respuesta`, `socket_error`, `sesion_no_borrada`.
- **Error:** `turno_fallido`, `servidor_error`.

## Tests

```bash
npm run test:coverage -w @agichat/agent-server
```

Los tests corren en entorno `node`, con un cliente `ws` real contra un puerto aleatorio y agentes falsos. Nunca llaman a APIs reales. La cobertura mínima es 80 %; hoy está en 100 %.
