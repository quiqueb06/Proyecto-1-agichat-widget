import { defineConfig } from 'vitest/config';

// tests del paquete: corren en node (no en jsdom como la widget)
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.ts'],
      // main.ts solo arranca el servidor (conecta piezas que ya tienen tests)
      exclude: ['src/**/*.test.ts', 'src/main.ts'],
      // misma regla que la widget: si la cobertura baja de 80 % el ci falla
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
