# Guía de contribución

## Flujo de ramas: GitHub Flow

1. `main` siempre está estable y desplegable. **Nadie hace push directo a `main`.**
2. Crea una rama desde `main` actualizado:
   ```bash
   git checkout main
   git pull
   git checkout -b feature/nombre-corto
   ```
3. Haz commits pequeños y descriptivos.
4. Sube tu rama y abre un Pull Request hacia `main`.
5. El PR necesita **CI en verde** y **al menos 1 aprobación** del grupo.
6. Se hace _squash merge_ y la rama se borra automáticamente.
7. Al hacer merge, el workflow de CD despliega la demo.

### Nombres de ramas

| Prefijo    | Uso                             |
| ---------- | ------------------------------- |
| `feature/` | Nueva funcionalidad             |
| `fix/`     | Corrección de un bug            |
| `docs/`    | Solo documentación              |
| `chore/`   | Configuración, dependencias, CI |
| `test/`    | Solo tests                      |

### Mensajes de commit

Usamos [Conventional Commits](https://www.conventionalcommits.org/es/):

```
feat(transport): agrega reconexión automática al mock de WebSocket
fix(ui): corrige el scroll al recibir mensajes largos
docs: agrega diagrama de arquitectura
```

## Antes de abrir un PR

```bash
npm run ci
```

Corre lo mismo que el pipeline: lint, formato, tipos, tests con cobertura y build.

## Revisiones

- Revisión en rueda: Persona 1 → 2 → 3 → 4 → 5 → 1. `CODEOWNERS` asigna además al dueño del área.
- Quien revisa verifica que haya tests, que el código siga el estilo y que la descripción del PR esté completa.
- Los comentarios se resuelven antes del merge.

## Configuración inicial del repositorio (solo admin)

1. Crear el repo en GitHub y subir `main`.
2. **Settings → Pages → Source: GitHub Actions** (para el deploy de la demo).
3. Proteger `main` con GitHub CLI:
   ```bash
   ./scripts/proteger-main.sh OWNER/REPO
   ```
   O manualmente en **Settings → Branches → Add rule** para `main`:
   - Require a pull request before merging (1 aprobación)
   - Require status checks: `Lint y formato`, `Typecheck`, `Tests y cobertura (>= 80 %)`, `Build`
   - Require branches to be up to date before merging
   - Require conversation resolution before merging
4. Reemplazar `@persona-N` en `.github/CODEOWNERS` por los usuarios del equipo.
