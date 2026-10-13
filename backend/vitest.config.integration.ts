import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    include: ['test/*.postgres.integration.ts'],
    fileParallelism: false,
    hookTimeout: 60000,
    testTimeout: 15000,
    // F4: clave de derivación dedicada. Valor no productivo, solo para PostgreSQL temporal.
    env: { CONTINGENCIA_CLAVE_OPERACIONES: 'clave-de-integracion-no-productiva-00000001' },
  },
});
