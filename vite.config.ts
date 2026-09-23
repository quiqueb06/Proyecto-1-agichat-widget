import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

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
    plugins: [react()],
    base: './',
    build: { outDir: 'dist-demo' },
  };
});
