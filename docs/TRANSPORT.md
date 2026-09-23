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
