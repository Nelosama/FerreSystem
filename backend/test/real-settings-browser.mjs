import { createServer } from '../../frontend/node_modules/vite/dist/node/index.js';
import { chromium, expect } from '../../frontend/node_modules/@playwright/test/index.mjs';
import { resolve } from 'node:path';

// No routes, request interception, localStorage seeds or mocked authentication.
const server = await createServer({
  root: resolve('../frontend'), configFile: resolve('../frontend/vite.config.ts'),
  server: { host: '127.0.0.1', port: 0, proxy: { '/api': { target: process.env.SETTINGS_API.replace(/\/api$/, ''), changeOrigin: true } } },
});
let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH && { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }) });
  async function session() {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${origin}/login`);
    await page.locator('input[type="email"]').fill(process.env.SETTINGS_EMAIL);
    await page.locator('input[type="password"]').fill(process.env.SETTINGS_PASSWORD);
    await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
    await expect(page).toHaveURL(`${origin}/`);
    await page.goto(`${origin}/configuracion`);
    return { context, page };
  }
  const first = await session();
  await first.page.locator('#business-name').fill('Marca navegador real');
  await first.page.getByRole('button', { name: 'APLICAR CAMBIOS', exact: true }).click();
  await expect(first.page.getByRole('status').filter({ hasText: 'guardada correctamente' })).toBeVisible();
  await first.page.reload();
  await expect(first.page.locator('#business-name')).toHaveValue('Marca navegador real');
  await first.context.close();
  const second = await session();
  await expect(second.page.locator('#business-name')).toHaveValue('Marca navegador real');
  await second.context.close();
  console.log('Navegador + API + PostgreSQL reales: guardar, recargar y nuevo contexto/login APROBADOS');
} finally {
  await browser?.close();
  await server.close();
}
