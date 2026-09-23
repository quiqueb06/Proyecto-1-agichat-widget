import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Dos modos de build:
//  - `lib`:  empaqueta el SDK (ESM + UMD) en dist/ para publicarlo.
//  - `demo`: empaqueta la página de demostración en dist-demo/ (GitHub Pages).
export default defineConfig(({ mode }) => {
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
