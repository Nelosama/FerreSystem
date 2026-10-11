import { defineConfig, devices } from '@playwright/test';
import base from './playwright.real.config';

// E2E REAL en emulación móvil (Chromium con pantalla táctil de teléfono). NO es Safari ni un iPhone real:
// WebKit/Safari y dispositivos físicos se prueban aparte. Uso: PW_CONFIG=playwright.real.mobile.config.ts bash e2e-real/run.sh <archivos>
export default defineConfig({
  ...base,
  projects: [{ name: 'movil-chromium', use: { ...devices['Pixel 7'] } }],
});
