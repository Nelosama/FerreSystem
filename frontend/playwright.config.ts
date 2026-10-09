import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // 'unsafe/' contiene scripts de siembra manual que NUNCA deben correr en CI
  // ni contra entornos con datos reales. Los archivos de esa carpeta leen
  // credenciales y URL de variables de entorno y bloquean dominios de producción.
  // El patrón cubre tanto la ubicación original (e2e/seed-alex.spec.ts, por si
  // alguien lo restaura) como la carpeta canónica (e2e/unsafe/**).
  testIgnore: ['**/unsafe/**', '**/seed-alex.spec.ts'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    serviceWorkers: 'block',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : undefined,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
  },
});
