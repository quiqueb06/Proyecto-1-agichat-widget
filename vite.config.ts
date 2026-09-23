import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

const EMBED_HTML = resolve(import.meta.dirname, 'demo/embed.html');
const EMBED_SCRIPT = resolve(import.meta.dirname, 'dist/agichat.embed.js');

// agrega a la demo la pagina demo/embed.html y el script real dist/agichat.embed.js,
// tal cual (sin procesarlos), para probar el sdk como lo usaria un sitio sin react.
// en build los copia a dist-demo/ y en dev los sirve en /embed.html y /agichat.embed.js
function embedDemo(): Plugin {
  const missing = 'Falta dist/agichat.embed.js: corre "npm run build:embed" primero.';
  return {
    name: 'agichat-embed-demo',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0];
        if (path === '/embed.html') {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(readFileSync(EMBED_HTML));
        } else if (path === '/agichat.embed.js') {
          if (!existsSync(EMBED_SCRIPT)) {
            res.statusCode = 404;
            res.end(missing);
            return;
          }
          res.setHeader('Content-Type', 'text/javascript');
          res.end(readFileSync(EMBED_SCRIPT));
        } else {
          next();
        }
      });
    },
    generateBundle() {
      if (!existsSync(EMBED_SCRIPT)) this.error(missing);
      this.emitFile({ type: 'asset', fileName: 'embed.html', source: readFileSync(EMBED_HTML) });
      this.emitFile({
        type: 'asset',
        fileName: 'agichat.embed.js',
        source: readFileSync(EMBED_SCRIPT),
      });
    },
  };
}

// Tres modos de build:
//  - `lib`:   empaqueta el SDK (ESM + UMD) en dist/ para publicarlo.
//  - `embed`: script embebible autónomo (UMD con React incluido) en dist/agichat.embed.js.
//  - `demo`:  empaqueta la página de demostración en dist-demo/ (GitHub Pages).
export default defineConfig(({ mode }) => {
  if (mode === 'embed') {
    return {
      plugins: [react()],
      // react revisa process.env.NODE_ENV; en modo librería vite no lo reemplaza solo
      define: { 'process.env.NODE_ENV': JSON.stringify('production') },
      build: {
        outDir: 'dist',
        emptyOutDir: false,
        lib: {
          entry: resolve(import.meta.dirname, 'src/embed.ts'),
          name: 'AGIChat',
          // .js y no .cjs para que cualquier servidor lo sirva como javascript
          fileName: () => 'agichat.embed.js',
          formats: ['umd'],
        },
      },
    };
  }

  if (mode === 'lib') {
    return {
      plugins: [react()],
      build: {
        outDir: 'dist',
        emptyOutDir: false,
        lib: {
          entry: resolve(import.meta.dirname, 'src/index.ts'),
          name: 'AGIChat',
          fileName: 'agichat',
          formats: ['es', 'umd'],
        },
        rollupOptions: {
          external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
          output: {
            globals: {
              react: 'React',
              'react-dom': 'ReactDOM',
              'react-dom/client': 'ReactDOM',
              'react/jsx-runtime': 'jsxRuntime',
            },
          },
        },
      },
    };
  }

  return {
    plugins: [react(), embedDemo()],
    base: './',
    build: { outDir: 'dist-demo' },
  };
});
