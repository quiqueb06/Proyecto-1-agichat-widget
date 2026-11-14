# MCP TMDB: base y contratos

Servidor independiente por stdio. Usa exclusivamente la línea oficial MCP v2:
`@modelcontextprotocol/server` 2.4.0 y Zod 4.6.7 en producción; el cliente oficial
2.4.0 se usa en desarrollo para probar el protocolo. Node >=20, TypeScript NodeNext,
ES2022 e imports relativos `.js`, siguiendo la infraestructura existente.

Referencias oficiales consultadas:

- https://ts.sdk.modelcontextprotocol.io/v2/get-started/first-server
- https://ts.sdk.modelcontextprotocol.io/v2/get-started/packages

## Ejecutar

Desde la raíz:

```sh
npm run dev -w @agichat/mcp-tmdb
npm run build -w @agichat/mcp-tmdb
npm run start -w @agichat/mcp-tmdb
```

Para Persona 4, el comando de producción es `node packages/mcp-tmdb/dist/index.js`
desde la raíz del contenedor/repositorio. `src/server.ts` exporta `createServer`
sin iniciar procesos; `src/index.ts` inicia stdio. stdout solo contiene MCP.
La configuración se recibe del entorno: ver `.env.example` de este paquete. No se
carga ningún `.env` automáticamente; Persona 4 debe pasar las variables al hijo.
Se valida al crear el cliente en la primera llamada válida, permitiendo descubrimiento
sin credenciales. Éxitos: structuredContent más bloque de texto JSON. Fallos:
isError:true y texto JSON con code y mensaje fijo sin datos sensibles.

## Contratos v1 del dominio

Todos los objetos rechazan propiedades desconocidas. No hay coerción de números.
Los textos de entrada se recortan; no se permiten cadenas vacías. Los años son
enteros entre 1878 y 9999 (incluye estrenos futuros sin depender del reloj).
Los IDs son enteros positivos seguros de JavaScript.

| Herramienta       | Entrada                                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| search_movie      | query: string de 1–200 caracteres; year?: año; limit?: entero 1–10, predeterminado 5                     |
| get_movie_details | id: ID TMDB                                                                                              |
| recommend_movies  | genre?: string de 1–100; year?: año; similar_to?: título de 1–200; limit?: entero 1–10, predeterminado 5 |

`genre` es un nombre legible, no un ID. `similar_to` es un título, no un ID.
Se permiten filtros combinados y también ninguno. En la siguiente etapa:

- Sin similar_to: discover con género/año; sin filtros, discover por popularidad.
- Con similar_to: priorizar coincidencia exacta de título u original_title,
  normalizada sin acentos/case, y luego menor ID para desempatar entre los primeros 20 resultados.
- Aplicar género y año como intersección sobre las recomendaciones de ese ID.
  Pueden devolverse menos de limit resultados; no se rellenan ignorando filtros.
- Acotar páginas y consultas adicionales al implementar el cliente HTTP. El límite
  de resultados por sí solo no limita las solicitudes HTTP.

search_movie y recommend_movies devuelven `{ results: MovieSummary[] }`, máximo 10.
Cada resumen contiene id, title, original_title, release_year, overview, poster_url.
Solo id y title son necesariamente conocidos; los demás campos admiten null.
Las propiedades se mantienen presentes para representar ausencias de forma uniforme.

get_movie_details devuelve id, title, original_title, overview, release_date,
genres, rating, poster_url, imdb_id, imdb_url, literary_adaptation.
original_title, overview, release_date, genres, rating, poster_url, imdb_id e imdb_url
admiten null. release_date es una fecha ISO real; genres es una lista de objetos
`{ id, name }` (máximo 100); rating es numérico de 0 a 10. Overview admite hasta
20000 caracteres. title/original_title/name admiten hasta 200 caracteres no vacíos.

poster_url solo admite HTTPS en image.tmdb.org, ruta `/t/p/w500/archivo.jpg`
(también png/webp), sin credenciales, puerto no predeterminado, query ni fragmento.
Esto valida datos backend; no sustituye la futura protección del renderer frontend.
imdb_id es `tt` seguido de dígitos. imdb_url es
`https://www.imdb.com/title/{imdb_id}/`; ambos deben corresponder o ser null juntos.

## Adaptación literaria

`literary_adaptation` es una unión discriminada:

- `{ status: 'evidence_found', evidence: [...] }`: entre 1 y 20 evidencias
  `{ source: 'tmdb_keyword', keyword_id: ID, keyword_name: 'based on novel or book' }`.
- `{ status: 'unknown', evidence: [], reason: 'keywords_unavailable' | 'no_matching_keyword' }`.

No existe un estado false: no encontrar la keyword no prueba que no haya libro.
La evidencia tampoco identifica el título ni autor del libro; Persona 3 debe resolver
esa relación por separado. Estas son decisiones locales del contrato que Personas
3 y 4 deben revisar antes de integrar, no acuerdos previos atribuidos al equipo.

## Validación y pendientes

Tests con Zod, cliente MCP en memoria y proceso real por stdio, sin APIs externas.
Cobertura mínima del 80 % sin exclusiones adicionales.

## Cliente, caché y presupuesto

HTTP con Bearer, redirects bloqueados, timeout por intento y AbortSignal MCP.
El cliente conserva una copia validada, normalizada e inmutable de la configuración;
las mutaciones posteriores del objeto del llamador no afectan su funcionamiento.
El body exitoso se lee por stream con un máximo de 2 MiB de bytes entregados por
fetch (descomprimidos), antes de JSON.parse y sin confiar en Content-Length.
Al superar el límite se cancela la lectura y se devuelve RESPONSE_TOO_LARGE;
esa respuesta no se cachea ni reintenta. Un body dentro del límite todavía puede
ser rechazado por JSON o por el esquema. El límite no controla el tamaño de cada
chunk que fetch ya haya recibido ni el consumo interno del transporte.
Solo endpoints internos permitidos. JSON externo validado con Zod y salidas validadas
con los contratos públicos originales. Detalles incorpora append_to_response=keywords.
Idioma es-ES; nombres de género deben corresponder al catálogo español (sin acentos/case).
Se consulta solo la primera página: hasta 20 candidatos, máximo 10 resultados.

Caché en memoria por URL con parámetros ordenados, FIFO, expiración y capacidad.
TTL predeterminado 5 minutos, máximo configurable 24 horas. No almacena errores.
No deduplica solicitudes en vuelo: cada consumidor mantiene cancelación independiente.
Contador por proceso/día UTC, incluye reintentos enviados, excluye hits de caché.
Reinicio manual disponible para tests. Reinicios y réplicas no comparten presupuesto.

429/5xx: hasta 2 reintentos por defecto (máximo 3). Retry-After admite segundos o fecha;
si exige esperar más de 30 segundos se devuelve el error sin reintentar antes de tiempo.
Sin header válido se usa backoff 250ms exponencial. Red y timeout no se reintentan.
Errores: CONFIGURATION_INVALID, TIMEOUT, CANCELLED, AUTH_FAILED, NOT_FOUND,
RATE_LIMITED, UPSTREAM_UNAVAILABLE, HTTP_ERROR, INVALID_JSON, INVALID_RESPONSE,
BUDGET_EXHAUSTED, MOVIE_NOT_FOUND, GENRE_NOT_FOUND, NETWORK_ERROR, ENDPOINT_INVALID.
No hay logs normales en stdout ni exposición de cuerpos de error externos.

Pendientes para Personas 3/4: identificar libro original, propagar entorno del proceso,
compartir presupuesto si hay réplicas y decidir si necesitan paginación adicional.
Frontend y créditos no forman parte de esta etapa.
