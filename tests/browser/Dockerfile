# Firefox in the official Linux environment, independent of host browser installation.
# Build from the repository root; .dockerignore excludes every local .env.
FROM mcr.microsoft.com/playwright:v1.65.1-noble
WORKDIR /app
ENV CI=true
COPY package.json package-lock.json ./
COPY packages/agent-server/package.json packages/agent-server/
COPY packages/mcp-tmdb/package.json packages/mcp-tmdb/
COPY packages/mcp-books/package.json packages/mcp-books/
RUN npm ci
COPY src/ src/
COPY packages/ packages/
COPY tests/browser/ tests/browser/
COPY playwright.config.ts vite.config.ts tsconfig*.json ./
RUN npm run build:embed
CMD ["npx", "playwright", "test", "--project=firefox-*"]
