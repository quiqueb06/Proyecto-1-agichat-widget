# imagen del servidor del agente (incluye los servidores mcp porque el agente los lanza por stdio)
#
# se construye desde la RAIZ del repo, porque los workspaces comparten el package-lock.json:
#   docker build -f packages/agent-server/Dockerfile -t agichat-agent .
#   docker run --rm -p 8787:8787 --env-file packages/agent-server/.env agichat-agent
#
# ver docs/DESPLIEGUE.md

# ---------- etapa 1: compilar typescript ----------
FROM node:22-alpine AS build
WORKDIR /app

# primero solo los package.json para que docker cachee el npm ci si no cambian dependencias
COPY package.json package-lock.json ./
COPY packages/agent-server/package.json packages/agent-server/
COPY packages/mcp-tmdb/package.json packages/mcp-tmdb/
COPY packages/mcp-books/package.json packages/mcp-books/
RUN npm ci

COPY packages/ packages/
RUN npm run build -w @agichat/agent-server -w @agichat/mcp-tmdb -w @agichat/mcp-books

# ---------- etapa 2: imagen final, solo dependencias de produccion y el js compilado ----------
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/agent-server/package.json packages/agent-server/
COPY packages/mcp-tmdb/package.json packages/mcp-tmdb/
COPY packages/mcp-books/package.json packages/mcp-books/
# solo las dependencias de los tres paquetes, sin las de la widget ni las de desarrollo
RUN npm ci --omit=dev -w @agichat/agent-server -w @agichat/mcp-tmdb -w @agichat/mcp-books \
  && npm cache clean --force

COPY --from=build /app/packages/agent-server/dist packages/agent-server/dist
COPY --from=build /app/packages/mcp-tmdb/dist packages/mcp-tmdb/dist
COPY --from=build /app/packages/mcp-books/dist packages/mcp-books/dist

# no correr como root dentro del contenedor
USER node

# dentro del contenedor siempre escuchamos en 0.0.0.0 para que docker pueda redirigir el puerto
ENV HOST=0.0.0.0 PORT=8787
EXPOSE 8787

# docker marca el contenedor como unhealthy si /health deja de responder
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" > /dev/null || exit 1

# node directo (no npm start) para que reciba SIGTERM y haga el apagado ordenado de main.ts
CMD ["node", "packages/agent-server/dist/main.js"]
