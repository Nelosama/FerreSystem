import { defineConfig, devices } from '@playwright/test';

// E2E REAL: sin page.route ni mocks. El script e2e-real/run.sh levanta PostgreSQL temporal,
// el backend NestJS compilado y el frontend construido contra ese backend.
const webPort = Number(process.env.E2E_WEB_PORT || 4173);
const dist = process.env.E2E_DIST;

export default defineConfig({
  testDir: './e2e-real',
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 90000,
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    serviceWorkers: 'block',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : undefined,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx vite preview --config e2e-real/vite.preview.mjs --outDir ${dist ?? 'dist'} --port ${webPort}`,
    url: `http://127.0.0.1:${webPort}`,
    reuseExistingServer: false,
    timeout: 120000,
  },
});
