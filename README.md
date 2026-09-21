# AGIChat Widget SDK

[![CI](https://github.com/quiqueb06/Proyecto-1-agichat-widget/actions/workflows/ci.yml/badge.svg)](https://github.com/quiqueb06/Proyecto-1-agichat-widget/actions/workflows/ci.yml)
[![CD](https://github.com/quiqueb06/Proyecto-1-agichat-widget/actions/workflows/cd.yml/badge.svg)](https://github.com/quiqueb06/Proyecto-1-agichat-widget/actions/workflows/cd.yml)
![Cobertura mínima](https://img.shields.io/badge/cobertura-%E2%89%A580%25-brightgreen)
![Node](https://img.shields.io/badge/node-%3E%3D20-339933)

SDK para agregar un widget de chat agéntico a cualquier sitio web.

> Reemplaza `quiqueb06/Proyecto-1-agichat-widget` en los badges por el nombre real del repositorio.

## Requisitos

- Node.js 22 (ver `.nvmrc`)
- npm 10 o superior

## Inicio rápido

```bash
npm install
npm run dev
```

La página de demo queda en `http://localhost:5173`.

## Scripts

| Comando                           | Qué hace                                            |
| --------------------------------- | --------------------------------------------------- |
| `npm run dev`                     | Servidor de desarrollo con la página demo           |
| `npm run lint`                    | ESLint (falla con cualquier warning)                |
| `npm run format` / `format:check` | Formatea / verifica formato con Prettier            |
| `npm run typecheck`               | Verificación de tipos con TypeScript                |
| `npm test`                        | Ejecuta los tests                                   |
| `npm run test:coverage`           | Tests con cobertura (mínimo 80 %)                   |
| `npm run build`                   | Build del SDK (`dist/`) y de la demo (`dist-demo/`) |
| `npm run ci`                      | Corre localmente lo mismo que el pipeline de CI     |

## Pipeline

| Workflow      | Cuándo corre               | Qué hace                                                     |
| ------------- | -------------------------- | ------------------------------------------------------------ |
| `ci.yml`      | En cada PR y push a `main` | Lint, formato, typecheck, tests con cobertura ≥ 80 % y build |
| `cd.yml`      | Al hacer merge a `main`    | Vuelve a verificar y despliega la demo en GitHub Pages       |
| `release.yml` | Al crear un tag `vX.Y.Z`   | Construye el SDK y publica un GitHub Release con el paquete  |

## Cómo contribuir

Seguimos **GitHub Flow**. Lee [CONTRIBUTING.md](CONTRIBUTING.md) antes de abrir tu primer PR.

## Documentación

- [Arquitectura](docs/ARQUITECTURA.md)
- [Guía para herramientas agénticas](AGENTS.md)
