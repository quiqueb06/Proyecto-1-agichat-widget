# Guía para herramientas agénticas

## 1. Proyecto

AGIChat Widget SDK es una biblioteca TypeScript para integrar un chat con un agente en sitios web. Se puede usar mediante la API pública `AGIChat`, que monta el widget en Shadow DOM, o mediante el componente React `AGIChatWidget`.

Para detalles del diseño, consulta [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md). Para integración y API, consulta [docs/SDK.md](docs/SDK.md); para transportes y protocolo, consulta [docs/TRANSPORT.md](docs/TRANSPORT.md).

## 2. Stack tecnológico

Las versiones son las declaradas en `package.json`:

- TypeScript `^6.0.3`, React y React DOM `^19.3.0`.
- Vite `^8.3.0` para desarrollo y builds.
- Vitest `^5.0.1` para pruebas; `@vitest/coverage-v8` `^5.0.1` para cobertura.
- Testing Library: `@testing-library/react` `^16.3.3`, `@testing-library/user-event` `^14.6.7` y `@testing-library/jest-dom` `^7.0.1`.
- ESLint `^10.11.0` y Prettier `^3.9.8` para análisis y formato.
- Markdown: `react-markdown` `^10.1.0`, `remark-gfm` `^4.0.1`, `rehype-highlight` `^7.0.2` y `rehype-sanitize` `^6.0.0`.
- El paquete declara Node.js `>=20`; `.nvmrc` y el README especifican Node.js 22 y npm 10 o superior.

## 3. Estructura del proyecto

- `src/components/`: componentes visuales del chat y renderer Markdown.
- `src/core/`: API, widget, `useChat`, `ChatStore`, historial y lógica central.
- `src/transport/`: contrato de transporte, fábrica e implementaciones mock y WebSocket.
- `src/types/`: tipos compartidos, incluidos `Message` y `ChatTransport`.
- `src/styles/`: estilos del widget y temas.
- `src/test/`: configuración compartida y utilidades para pruebas.
- `demo/`: demo React y página para probar el script embebible.
- `docs/`: guías del SDK, transporte y arquitectura.

Las pruebas suelen estar junto al código que verifican. La arquitectura y el flujo entre estos módulos están descritos en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).

## 4. Comandos principales

Todos estos comandos están definidos en `package.json`:

| Propósito                          | Comando                 |
| ---------------------------------- | ----------------------- |
| Desarrollo                         | `npm run dev`           |
| Ejecutar pruebas                   | `npm test`              |
| Ejecutar pruebas con cobertura     | `npm run test:coverage` |
| Lint                               | `npm run lint`          |
| Formatear archivos                 | `npm run format`        |
| Verificar formato                  | `npm run format:check`  |
| Verificar tipos                    | `npm run typecheck`     |
| Construir SDK, embed y demo        | `npm run build`         |
| Construir solo la librería         | `npm run build:lib`     |
| Construir solo el script embebible | `npm run build:embed`   |
| Construir solo la demo             | `npm run build:demo`    |
| Ejecutar el conjunto de CI local   | `npm run ci`            |

`npm run format` escribe cambios de formato en el repositorio; `npm run format:check` solo verifica.

## 5. Reglas para herramientas agénticas

- Inspecciona el código, sus pruebas y la documentación relacionada antes de implementar.
- Sigue las responsabilidades y los nombres existentes; evita refactors que no sean necesarios para la tarea.
- No amplíes ni cambies la API pública sin una necesidad concreta y compatible con el objetivo.
- Cuando cambie el comportamiento, añade o actualiza pruebas que lo verifiquen.
- Conserva el mínimo de cobertura configurado: 80 % en líneas, funciones, ramas y sentencias. No reduzcas los umbrales para hacer pasar CI.
- No desactives reglas de ESLint o TypeScript sin una justificación técnica clara.
- Trata el contenido recibido del agente como no confiable. Mantén el renderizado Markdown sanitizado y no habilites HTML crudo sin un requisito explícito y una revisión de seguridad.
- Mantén separadas la presentación, la lógica y el transporte. La lógica principal debe depender del contrato `ChatTransport`, no de una implementación concreta.
- No edites archivos ajenos al alcance autorizado por la tarea.

## 6. Convenciones de código

- Usa TypeScript con la configuración estricta de `tsconfig.json`, incluidos los chequeos de variables y parámetros sin uso.
- Los componentes React observados usan nombres PascalCase, por ejemplo `ChatWindow.tsx`; los hooks y funciones usan camelCase, por ejemplo `useChat.ts`.
- Coloca las pruebas junto al módulo, con sufijo `.test.ts` o `.test.tsx`. Vitest también busca pruebas en `tests/` si esa carpeta se usa.
- El formato de Prettier usa punto y coma, comillas simples, dos espacios, coma final y ancho de línea de 100 caracteres.
- Mantén cada responsabilidad en su carpeta: interfaz en `src/components`, lógica y estado en `src/core`, transportes en `src/transport`, tipos compartidos en `src/types` y estilos en `src/styles` o en `src/core/defaultStyles.ts` para los estilos insertados por el widget.
- Si se agrega un nuevo transporte, implementa `ChatTransport` y registra su selección en `createTransport`.

## 7. Pruebas y calidad

Vitest ejecuta las pruebas en `jsdom`, con configuración compartida en `src/test/setup.ts`. Testing Library se usa para interactuar con componentes y comprobar lo que aparece en la interfaz. El proveedor V8 genera los reportes de cobertura.

La cobertura mínima es de 80 % para líneas, funciones, ramas y sentencias. Antes de terminar cambios de código, ejecuta las pruebas y cobertura, lint, verificación de formato, typecheck y build. El pipeline de CI comprueba estos criterios antes de construir los artefactos.

## 8. GitHub Flow

Según [CONTRIBUTING.md](CONTRIBUTING.md), `main` debe permanecer estable y no recibe push directo. El trabajo se realiza en una rama y se integra mediante un Pull Request hacia `main`. Los prefijos documentados son `feature/`, `fix/`, `docs/`, `chore/` y `test/`.

El PR requiere CI en verde y al menos una aprobación. La contribución también indica squash merge y eliminación automática de la rama después de integrar. La CI se ejecuta en PR y push a `main`; comprueba lint y formato, tipos, pruebas con cobertura mínima del 80 % y build.

## 9. Lista de verificación antes de finalizar

- [ ] Ejecutar `npm test` y `npm run test:coverage`.
- [ ] Ejecutar `npm run lint` y `npm run format:check`.
- [ ] Ejecutar `npm run typecheck` y `npm run build`.
- [ ] Actualizar la documentación si cambió el comportamiento público.
- [ ] Revisar `git diff` y `git status` para confirmar el alcance de los cambios.
- [ ] Informar qué validaciones se ejecutaron y cualquier advertencia pendiente.
