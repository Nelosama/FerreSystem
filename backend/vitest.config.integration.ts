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
  },
});
