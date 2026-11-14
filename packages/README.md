# Paquetes del backend

El repositorio usa **npm workspaces**. La widget sigue en la raíz y el backend vive en `packages/`:

| Paquete                 | Carpeta                  | Responsable    | Qué contiene                                                                      |
| ----------------------- | ------------------------ | -------------- | --------------------------------------------------------------------------------- |
| `@agichat/agent-server` | `packages/agent-server/` | Personas 1 y 4 | Gateway WebSocket, sesiones y configuración (P1); agentes, LLM y cliente MCP (P4) |
| `@agichat/mcp-tmdb`     | `packages/mcp-tmdb/`     | Persona 2      | Servidor MCP de películas (TMDB)                                                  |
| `@agichat/mcp-books`    | `packages/mcp-books/`    | Persona 3      | Servidor MCP de libros (Google Books)                                             |

## Comandos

Desde la raíz, `npm install` instala todo (widget y paquetes). Los scripts de la raíz también corren en cada paquete:

| Comando                 | Qué hace                                                           |
| ----------------------- | ------------------------------------------------------------------ |
| `npm run typecheck`     | Tipos de la widget y de cada paquete                               |
| `npm test`              | Tests de la widget y de cada paquete                               |
| `npm run test:coverage` | Cobertura de la widget y de cada paquete (mínimo 80 % en cada uno) |
| `npm run build`         | Build de la widget y de cada paquete (`packages/*/dist/`)          |
| `npm run ci`            | Lo mismo que el pipeline de CI                                     |

Para trabajar en un solo paquete se usa `-w`, por ejemplo:

```bash
npm run test -w @agichat/mcp-tmdb
npm run dev -w @agichat/agent-server
npm install zod -w @agichat/mcp-tmdb
```

Cada paquete tiene los scripts `dev` (`tsx watch`), `build` (`tsc` a `dist/`), `start`, `typecheck`, `test` y `test:coverage`.

## Convenciones

- TypeScript para Node con `module: NodeNext` (configuración común en `packages/tsconfig.base.json`).
- **Los imports relativos llevan extensión `.js`**, aunque el archivo sea `.ts`: `import { x } from './x.js'`. Así lo exige Node con ES modules.
- Los tests van junto al código (`*.test.ts`), corren en entorno `node` e importan `describe`, `it` y `expect` desde `vitest`.
- Cada paquete exige **80 % de cobertura** en su `vitest.config.ts`.
- Las dependencias se instalan en el paquete que las usa (`-w`), no en la raíz.
- **Nunca se commitean API keys.** Van en un `.env` local (ignorado por git) y en GitHub Secrets.
- Los tests **no llaman APIs reales** (Groq, TMDB, Google Books): se usa `fetch` mockeado o fakes.
