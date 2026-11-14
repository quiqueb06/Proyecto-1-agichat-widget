# Despliegue del servidor del agente

El servidor del agente (`packages/agent-server`) se distribuye como una **imagen Docker**. La imagen incluye también los servidores MCP (`packages/mcp-tmdb` y `packages/mcp-books`), porque el agente los lanza como procesos hijos por stdio. Con un solo contenedor corre todo el backend.

La widget no se despliega aquí: la demo sigue publicándose en GitHub Pages con `cd.yml`.

## Decisión: Docker y demo local

Para el proyecto ejecutamos el servidor **en local**, con Docker o con npm. La imagen es portable y se puede llevar a cualquier plataforma que acepte un `Dockerfile`, pero por ahora no la desplegamos en la nube.

Revisamos las opciones gratuitas en noviembre de 2026. Buscábamos tres cosas: que no pidieran tarjeta de crédito, que soportaran WebSockets y que aceptaran Docker.

| Plataforma          | Resultado                                                                                                                                                                                                                                |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Render (plan Free)  | Cumple las tres condiciones: no pide pago, acepta WebSockets y Dockerfile, con 512 MB, 0.1 CPU y 750 h al mes. Pero se apaga tras 15 min sin tráfico, tarda cerca de un minuto en despertar y corta los WebSockets abiertos al dormirse. |
| Koyeb               | Fuentes recientes indican que desde 2026 pide tarjeta para el plan gratuito.                                                                                                                                                             |
| Fly.io              | No tiene plan gratuito.                                                                                                                                                                                                                  |
| Hugging Face Spaces | Se reporta que los Spaces Docker pasaron a ser de pago.                                                                                                                                                                                  |

Si más adelante se despliega, Render es la opción más directa. Los pasos generales están al final de esta guía.

## Opción A: con npm (sin Docker)

Desde la raíz del repositorio:

```bash
npm ci
npm run build -w @agichat/agent-server -w @agichat/mcp-tmdb -w @agichat/mcp-books
npm run start -w @agichat/agent-server
```

Para desarrollo es más cómodo `npm run dev:agent`, que recarga al guardar.

## Opción B: con Docker

La imagen se construye **desde la raíz**, porque los workspaces comparten el `package-lock.json`:

```bash
docker build -f packages/agent-server/Dockerfile -t agichat-agent .
```

Para correrla, pasa la configuración con `--env-file`. El archivo es el mismo `.env` del paquete, que se copia de `packages/agent-server/.env.example`:

```bash
docker run --rm -p 8787:8787 --env-file packages/agent-server/.env agichat-agent
```

Sin `.env` también arranca con los valores por defecto (`docker run --rm -p 8787:8787 agichat-agent`).

Para comprobar que está vivo:

```bash
curl http://localhost:8787/health
```

Responde `{"status":"ok","connections":0}`. Docker usa ese mismo endpoint en el `HEALTHCHECK`, y `docker ps` muestra el contenedor como `healthy`.

Para detenerlo, usa `Ctrl+C` o `docker stop`. El servidor recibe la señal, cierra las conexiones abiertas y sale de forma ordenada.

### Qué hace el Dockerfile

- **Dos etapas:**
  - la primera instala todo y compila TypeScript;
  - la segunda solo instala las dependencias de producción de los tres paquetes (sin las de la widget) y copia el JavaScript compilado.
  - La imagen final pesa unos 63 MB comprimida.
- **Corre como el usuario `node`, no como root.**
- **Escucha en `0.0.0.0:8787` dentro del contenedor.** Si la plataforma define `PORT`, el servidor usa ese valor.
- **Arranca con `node` directo, no con `npm start`.** Así el proceso recibe `SIGTERM` y hace el apagado ordenado.

### Seguridad de las claves

- **Las API keys (Groq, TMDB, Google Books) nunca entran en la imagen.** El `.dockerignore` excluye todos los `.env`. Las claves se pasan al correr el contenedor (`--env-file` o variables de la plataforma).
- La widget nunca recibe claves: solo conoce la URL del WebSocket.

## Conectar la demo al contenedor

Es igual que con `npm run dev:agent`:

1. En la raíz, copia `.env.example` como `.env.local`. Trae `VITE_AGENT_URL=ws://localhost:8787/ws`.
2. Levanta el contenedor (opción B).
3. En otra terminal, corre `npm run dev` y abre `http://localhost:5173`. El indicador dice "Servidor del agente".

Por defecto el servidor solo acepta conexiones de `http://localhost:5173` y `http://localhost:4173` (la variable `ALLOWED_ORIGINS`). Si la demo corre en otro origen, hay que agregarlo ahí.

## CI

`ci.yml` tiene el job **Imagen Docker del agente**. Construye la imagen en cada PR, la arranca y espera a que `/health` responda. Si un cambio de dependencias o de rutas rompe el `Dockerfile`, el PR lo muestra. El job no usa ninguna API key.

## Si se despliega en la nube (por ejemplo Render)

1. Crear un **Web Service** desde el repositorio con runtime Docker. Configurar `Dockerfile Path: packages/agent-server/Dockerfile` y `Docker Context: .`
2. Poner `Health Check Path: /health`.
3. Definir las variables de entorno en el panel, nunca en el repositorio:
   - las API keys;
   - `ALLOWED_ORIGINS` con el origen de la demo, por ejemplo `https://quiqueb06.github.io`.
4. La plataforma da una URL `https://...`. La widget se conecta con `wss://<dominio>/ws`.
5. Para que la demo de GitHub Pages use el agente, el build de la demo tiene que recibir `VITE_AGENT_URL=wss://<dominio>/ws`. Sin esa variable, la demo sigue usando el mock.

Hay que tener presente que en el plan gratuito la primera conexión tras un rato sin uso tarda cerca de un minuto, mientras el servicio despierta.
