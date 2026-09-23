# AGIChat Widget SDK

[![CI](https://github.com/quiqueb06/Proyecto-1-agichat-widget/actions/workflows/ci.yml/badge.svg)](https://github.com/quiqueb06/Proyecto-1-agichat-widget/actions/workflows/ci.yml)
[![CD](https://github.com/quiqueb06/Proyecto-1-agichat-widget/actions/workflows/cd.yml/badge.svg)](https://github.com/quiqueb06/Proyecto-1-agichat-widget/actions/workflows/cd.yml)
![Cobertura mínima](https://img.shields.io/badge/cobertura-%E2%89%A580%25-brightgreen)
![Node](https://img.shields.io/badge/node-%3E%3D20-339933)

SDK para agregar un widget de chat agéntico a cualquier sitio web.

## Requisitos

- Node.js 22 (ver `.nvmrc`)
- npm 10 o superior

## Inicio rápido

```bash
npm install
npm run dev
```

La página de demo queda en `http://localhost:5173`.

## Guía de uso

### Integración con React

Importa `AGIChatWidget` desde el paquete y colócalo en tu aplicación. Para desarrollo puedes usar el transporte mock:

```tsx
import { AGIChatWidget } from 'agichat-widget';

export function App() {
  return (
    <AGIChatWidget
      transport="mock"
      title="Soporte"
      welcomeMessage="Hola, ¿en qué te puedo ayudar?"
    />
  );
}
```

Para conectar un servidor, configura `transport="websocket"` y proporciona un `endpoint` con protocolo `ws:` o `wss:`.

### Integración mediante la API pública

En una aplicación con módulos, importa `AGIChat` e inicializa el widget. Después puedes abrirlo o cerrarlo con los métodos de la API:

```ts
import { AGIChat } from 'agichat-widget';

AGIChat.init({ transport: 'mock', title: 'Soporte' });
AGIChat.open();
AGIChat.close();
```

La API también está disponible como `window.AGIChat` en el script embebible. Consulta la [guía del SDK](docs/SDK.md) para su configuración.

Las respuestas del asistente admiten Markdown, incluidas tablas GFM y bloques de código con resaltado de sintaxis. El contenido se sanitiza antes de renderizarse; los mensajes del usuario se muestran como texto normal.

Para más opciones de conexión y el protocolo WebSocket, consulta [docs/TRANSPORT.md](docs/TRANSPORT.md).

## Scripts

| Comando                           | Qué hace                                                                          |
| --------------------------------- | --------------------------------------------------------------------------------- |
| `npm run dev`                     | Servidor de desarrollo con la página demo                                         |
| `npm run lint`                    | ESLint (falla con cualquier warning)                                              |
| `npm run format` / `format:check` | Formatea / verifica formato con Prettier                                          |
| `npm run typecheck`               | Verificación de tipos con TypeScript                                              |
| `npm test`                        | Ejecuta los tests                                                                 |
| `npm run test:coverage`           | Tests con cobertura (mínimo 80 %)                                                 |
| `npm run build`                   | Build del SDK y del script embebible (`dist/`) y de la demo (`dist-demo/`)        |
| `npm run build:embed`             | Solo el script embebible `dist/agichat.embed.js` (ver [docs/SDK.md](docs/SDK.md)) |
| `npm run ci`                      | Corre localmente lo mismo que el pipeline de CI                                   |

## Pipeline

| Workflow      | Cuándo corre               | Qué hace                                                     |
| ------------- | -------------------------- | ------------------------------------------------------------ |
| `ci.yml`      | En cada PR y push a `main` | Lint, formato, typecheck, tests con cobertura ≥ 80 % y build |
| `cd.yml`      | Al hacer merge a `main`    | Vuelve a verificar y despliega la demo en GitHub Pages       |
| `release.yml` | Al crear un tag `vX.Y.Z`   | Construye el SDK y publica un GitHub Release con el paquete  |

## Cómo contribuir

Seguimos **GitHub Flow**. Lee [CONTRIBUTING.md](CONTRIBUTING.md) antes de abrir tu primer PR.

## Documentación

- [SDK: widget, API AGIChat y hook useChat](docs/SDK.md)
- [Conexión, Mock API y protocolo WebSocket](docs/TRANSPORT.md)
- [Arquitectura](docs/ARQUITECTURA.md)
- [Guía para herramientas agénticas](AGENTS.md)
