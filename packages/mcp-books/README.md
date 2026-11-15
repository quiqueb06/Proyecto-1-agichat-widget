# MCP de libros y datos de comparación

Servidor MCP v2 por **stdio**, compatible con el cliente MCP de TMDB existente.
No abre pestañas, no llama al LLM y no decide si vale la pena ver una película.
El orquestador de Persona 4 consume estas herramientas y emite las acciones del protocolo v2.

## Configuración y ejecución

Desde la raíz:

```bash
npm ci
npm run build -w @agichat/mcp-books
node --env-file=packages/mcp-books/.env packages/mcp-books/dist/index.js
```

Copiar `.env.example` del paquete como `.env` y configurar `GOOGLE_BOOKS_API_KEY`.
El proceso no carga archivos de entorno implícitamente. El cliente MCP de Persona 4
debe lanzar `node packages/mcp-books/dist/index.js`, transmitir las variables de entorno
y propagar cancelación. stdout pertenece únicamente a JSON-RPC; no se imprimen keys,
mensajes del usuario ni cuerpos de errores externos.

Para obtener la key: usar un proyecto personal en
[Google Cloud Console](https://console.cloud.google.com/apis/library/books.googleapis.com),
habilitar Books API y crear una credencial API restringida a **Books API**.
No activar facturación ni la prueba de pago ni introducir tarjeta. Si la cuenta exige
facturación para continuar, detener esa configuración y consultar al equipo.
La aceptación de condiciones y la creación de credenciales requieren la intervención
o aprobación del titular. Nunca pegar la key en el chat, Git o variables `VITE_*`.
La guía oficial de consultas está en
[Google Books API v1](https://developers.google.com/books/docs/v1/using).

| Variable             | Predeterminado           | Límite                               |
| -------------------- | ------------------------ | ------------------------------------ |
| GOOGLE_BOOKS_API_KEY | obligatoria al consultar | Solo backend                         |
| BOOKS_TIMEOUT_MS     | 10000                    | 1–60000 ms, incluye lectura del body |
| BOOKS_CACHE_TTL_MS   | 300000                   | 1–86400000 ms                        |
| BOOKS_CACHE_CAPACITY | 200                      | 1–10000 entradas                     |
| BOOKS_DAILY_BUDGET   | 500                      | Entero positivo, por día UTC/proceso |

Descubrir herramientas no exige credenciales. La configuración se valida al realizar
la primera consulta válida. El presupuesto interno incluye solicitudes fallidas y
excluye aciertos de caché. Reiniciar el proceso reinicia caché y presupuesto; las
réplicas no los comparten. No se deduplican solicitudes simultáneas para mantener
cancelación independiente. Los 429 y los 403 con motivos reconocidos de cuota
agotada se reportan como `RATE_LIMITED`, sin reintentos automáticos. Otros 403
se reportan como `AUTH_FAILED`; no se reproducen los cuerpos de error externos.

## Contratos

Entradas estrictas con Zod: se rechazan propiedades desconocidas, títulos/autores
vacíos o mayores de 200 caracteres y números convertidos desde texto. Los IDs
de volumen son cadenas de 1–128 caracteres alfanuméricos, `_` o `-`.

| Herramienta          | Argumentos                                                                 | Resultado                        |
| -------------------- | -------------------------------------------------------------------------- | -------------------------------- |
| `search_book`        | `titulo`, `autor?`, `limit?` (1–10, por defecto 5)                         | `{ results: Book[] }`            |
| `get_book_details`   | `id` (ID de Google Books)                                                  | `Book`                           |
| `compare_movie_book` | `movie: { title, original_title?, rating }`, `book_title?`, `book_author?` | Unión por `found` descrita abajo |

`Book` contiene `id`, `title`, `authors` (lista, vacía si falta), `description`,
`rating` (/5), `ratings_count` (número de valoraciones, no reseñas textuales) e `infoLink`.
Los últimos cuatro campos admiten `null`. Una valoración ausente nunca se convierte
en cero. La descripción se convierte a texto con un parser HTML, elimina el contenido
de script/style, decodifica entidades y recorta a 2000 caracteres. Sigue siendo dato
externo **no confiable**: los guardrails de Persona 5 deben delimitarlo en los prompts.

`infoLink` solo conserva HTTPS, `/books` y un ID correspondiente al volumen devuelto,
en `books.google.com`, `books.google.es` o `books.google.com.gt`. Se eliminan parámetros
adicionales y se convierte HTTP a HTTPS. Enlaces no válidos devuelven `null`.
Google también devuelve `infoLink` con host exacto `play.google.com` y ruta
`/store/books/details?id=…` (observado en detalles reales). Ese alias se convierte
a `https://books.google.com/books?id=…` conservando solo el ID del volumen validado;
la widget nunca recibe ni abre enlaces de la tienda Play.
Esta lista de hosts exactos también se aplica en la widget; agregar otro país requiere
actualizar ambos límites y sus pruebas, nunca aceptar `books.google.*` con un comodín.

Se consulta una página por búsqueda; no garantiza encontrar todos los volúmenes.
Los argumentos se envían como frases `intitle`/`inauthor` codificadas, no como URL libre.
Solo se permiten endpoints internos de Books, redirects deshabilitados y bodies de
máximo 2 MiB antes de JSON.parse. Las respuestas inválidas y los errores no se conservan
en caché. El timeout y el AbortSignal abarcan fetch y la lectura del body.

Éxito MCP: `structuredContent` y un bloque de texto con el mismo JSON. Error MCP:
`isError: true`, texto JSON con `code` y mensaje genérico. Códigos:
`CONFIGURATION_INVALID`, `ENDPOINT_INVALID`, `AUTH_FAILED`, `NOT_FOUND`, `RATE_LIMITED`,
`UPSTREAM_ERROR`, `NETWORK_ERROR`, `INVALID_JSON`, `INVALID_RESPONSE`,
`RESPONSE_TOO_LARGE`, `BUDGET_EXHAUSTED`, `CANCELLED`, `TIMEOUT`.

## Comparación para Persona 4

Ejemplo:

```json
{
  "movie": { "title": "Duna", "original_title": "Dune", "rating": 8 },
  "book_author": "Frank Herbert"
}
```

Se buscan los títulos original/traducido (máximo dos búsquedas), o solo `book_title`
si se proporciona. Este permite libros con título distinto al de la película.
No se usa el año de estreno como año de publicación ni IDs TMDB/IMDb como IDs de libros.

Se comparan títulos completos y, si se proporciona, autor completo, ignorando acentos,
mayúsculas y puntuación. Se rechazan coincidencias que queden vacías al normalizar
(por ejemplo, títulos o autores compuestos solo por signos). No se aceptan coincidencias parciales. Si varios autores
distintos comparten título y no se pueden desambiguar, no se elige uno arbitrariamente.
Entre ediciones de una misma autoría se prioriza cantidad de valoraciones y luego ID.

- `found: true`: incluye `book`, `relationship: 'candidate'`, `match: { title: true,
author: true | null }` y `ratings: { scale: 10, movie, book }`. Books se multiplica
  por dos; los valores ausentes siguen en `null`.
- `found: false`: incluye `reason: 'no_reliable_match'` y ratings con `book: null`.
  Significa que no se encontró una coincidencia fiable en los resultados consultados;
  **no demuestra que no exista libro**. Errores de API no se convierten en `found:false`.

Una coincidencia es un candidato, no prueba que sea el libro original. La evidencia
`literary_adaptation` de TMDB no proporciona título ni autor del libro y `unknown`
no significa que no haya adaptación. Persona 4 debe verificar la relación antes de
afirmarla y construir su veredicto razonado; los ratings solos no prueban calidad.

Para abrir enlaces, Persona 4 emite `action: { type: 'open_url', url: book.infoLink,
label: 'Google Books' }` únicamente cuando `infoLink` no es null. El gateway conserva
su contrato `AgentRunner`; el MCP no conoce la widget.

## Pruebas

```bash
npm run test:coverage -w @agichat/mcp-books
```

Fetch simulado y clientes MCP en memoria/stdio real, sin consultar Google ni gastar
cuota. Se verifican contratos, HTML malicioso, enlaces, datos ausentes, ambigüedad,
ratings normalizados, caché, presupuesto, límites de respuesta, errores y cancelación.

### Navegadores: Chrome y Firefox

Desde la raíz:

```bash
npx playwright install chrome firefox
npm run test:browser
```

La suite usa perfiles temporales, el embed compilado, el gateway real y un runner
falso. Intercepta los destinos HTTPS, por lo que ninguna prueba consulta APIs reales
ni requiere claves. En cada navegador comprueba apertura automática de exactamente
dos pestañas, deduplicación, `noopener`, bloqueo de destinos ajenos y enlaces de
respaldo tras una respuesta de 6.5 s. El rechazo de `window.open` se simula de forma
determinista porque las políticas de popups en headless difieren de las de una sesión
interactiva; la apertura exitosa se prueba con `window.open` sin modificar.

El job de CI **Acciones en Chrome y Firefox** ejecuta estos casos en Ubuntu. La
versión de Playwright se fija para coincidir con su imagen oficial de pruebas.
Si Firefox no inicia en Windows por un error de ensamblado `mozglue`, se puede ejecutar
el mismo conjunto de casos de Firefox dentro de Linux sin modificar el navegador ni Windows:

```bash
npm run test:browser -- --project=chrome-*
npm run test:browser:firefox:docker
```

El Dockerfile de pruebas copia únicamente código y configuración necesarios; no
copia `.env`. La imagen de pruebas usa el entorno oficial de Playwright y se mantiene
separada de la imagen de producción del agente.

## Verificación de integración (15 de noviembre de 2026)

`npm test`, `npm run test:coverage`, `npm run lint`, `npm run typecheck` y
`npm run build` pasan. Hay 340 pruebas entre widget y paquetes, más cuatro casos
de navegador. En Books, la cobertura es 99.4 % líneas, 100 % funciones,
94.2 % ramas y 99.49 % sentencias.
El build conserva un aviso de tamaño de bundle de la demo.

Se probó en Edge la demo React con el gateway WebSocket real y un `AgentRunner`
falso local, sin LLM ni APIs: respuesta diferida 6.5 s, acciones IMDb/Books, acción
repetida y dominio no permitido. No aparecieron pestañas automáticas tras la espera;
ambos enlaces de respaldo permanecieron visibles dentro del diálogo y al pulsarlos
abrieron sus páginas en otra pestaña. La URL no permitida produjo error y no un enlace.
Las pruebas automatizadas verifican además `window.open` exitoso, bloqueado y con
excepción, eventos de instancia/API global, StrictMode y limpieza al desmontar.

Con autorización del titular se creó el proyecto `agichat-p2`, se habilitó Books API
y se creó una clave restringida a esa API, guardada solo en el `.env` local ignorado
por Git. No se activó facturación ni se agregó tarjeta. Una verificación manual real,
fuera de la suite y del CI, obtuvo tres candidatos de Dune/Frank Herbert, recuperó
detalles de un volumen, validó su enlace y preparó la comparación en escala /10.
Esa verificación permitió cubrir también el alias `infoLink` de Play Books.

La imagen de producción se construyó y respondió `/health` con `status: 'ok'`.
Se comprobó además que el `.env` de Books no está presente dentro de la imagen.
Los dos casos de Chrome pasaron en Windows con el navegador instalado y los dos
de Firefox pasaron en Linux mediante `npm run test:browser:firefox:docker`.
El Firefox de Playwright descargado para Windows no inició por un error de
ensamblado `mozglue`; la alternativa Docker documentada fue ejecutada y validada.
`npm run ci` y `npm test` se verifican sobre una copia limpia del contenido preparado
para el commit. Así se comprueban exactamente los archivos que recibirá GitHub,
sin incluir documentos locales ajenos al SDK ni credenciales.
La auditoría de dependencias de producción reportó cero vulnerabilidades. La
instalación completa mantiene quince avisos de dependencias de desarrollo ajenas
a esta funcionalidad; no se aplicaron actualizaciones generales ni se ocultaron avisos.

La conexión del MCP con el orquestador y sus guardrails corresponde a Personas 4 y 5;
el arranque general conserva `EchoAgent` hasta que se integre ese trabajo.
