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
No se necesitan credenciales en esta etapa. No se consulta ninguna API.

Las tres herramientas registran inputSchema y outputSchema. Para argumentos válidos
devuelven un error de herramienta MCP (`isError: true`) con un bloque de texto JSON:

```json
{ "code": "NOT_IMPLEMENTED", "message": "La integración con TMDB todavía no está implementada." }
```

Este error no es una salida de éxito y no incluye structuredContent. Los argumentos
inválidos son rechazados por el SDK antes del handler. Cuando se implemente TMDB,
las salidas de éxito deberán respetar los esquemas de `src/schemas.ts` y enviarse
como structuredContent, con representación de texto compatible con el cliente.

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
- Con similar_to: resolver el título a un ID; si hay ambigüedad, pedir aclaración
  mediante un error controlado, sin escoger arbitrariamente una película.
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
Cobertura mínima del 80 % sin exclusiones adicionales. Los módulos de herramientas
se separarán cuando tengan lógica propia; hoy comparten un handler NOT_IMPLEMENTED.

Pendientes: cliente TMDB, manejo de errores HTTP, cancelación, TTL/capacidad de caché,
presupuesto diario, recomendaciones reales, frontend y créditos. No están implementados.
