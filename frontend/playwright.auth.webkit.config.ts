import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';

// WebKit engine coverage complements Chromium; it does not certify a physical iPhone or installed PWA.
export default defineConfig({
  ...base,
  testMatch: /auth-security\.spec\.ts/,
  outputDir: './test-results/auth-webkit',
  webServer: { ...(base.webServer as object), reuseExistingServer: true },
  projects: [{ name: 'auth-webkit', use: { ...devices['Desktop Safari'] } }],
});
