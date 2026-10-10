import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

// WebKit with iPhone emulation and simulated APIs. This does not validate a physical camera.
export default defineConfig({
  ...base,
  testMatch: ['**/productos-edicion.spec.ts', '**/levantamiento.spec.ts'],
  workers: 2,
  outputDir: './test-results-webkit',
  use: { ...base.use, baseURL: 'http://127.0.0.1:4174', launchOptions: {} },
  projects: [{ name: 'webkit-iphone-emulado', use: { ...devices['iPhone 13'] } }],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4174 --strictPort',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: false,
  },
});
