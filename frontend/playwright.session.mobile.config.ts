import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

// Emulación táctil Chromium. Safari/iOS y Android físicos requieren aceptación aparte.
export default defineConfig({
  ...base,
  testMatch: /session-(lifecycle|pwa)\.spec\.ts/,
  outputDir: './test-results/session-mobile',
  projects: [{ name: 'session-mobile-chromium', use: { ...devices['Pixel 7'] } }],
});
