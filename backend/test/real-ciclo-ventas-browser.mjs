import { createServer } from '../../frontend/node_modules/vite/dist/node/index.js';
import { chromium, expect } from '../../frontend/node_modules/@playwright/test/index.mjs';
import { resolve } from 'node:path';

// Backend HTTP, login, PostgreSQL y frontend reales. Sin respuestas ni autenticación simuladas.
const server = await createServer({
  root: resolve('../frontend'), configFile: resolve('../frontend/vite.config.ts'),
  server: { host: '127.0.0.1', port: 0, proxy: { '/api': { target: process.env.CYCLE_API.replace(/\/api$/, ''), changeOrigin: true } } },
});
let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH && { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }) });
  const page = await browser.newPage({ timezoneId: 'America/Tegucigalpa' });
  await page.goto(`${origin}/login`);
  await page.locator('input[type="email"]').fill(process.env.CYCLE_EMAIL);
  await page.locator('input[type="password"]').fill(process.env.CYCLE_PASSWORD);
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
  await expect(page).toHaveURL(`${origin}/`);
  await page.goto(`${origin}/cotizaciones`);
  const validity = new Date(process.env.CYCLE_VALIDITY).toLocaleDateString('es-HN', { timeZone: 'UTC' });
  await expect(page.getByText(validity, { exact: true })).toBeVisible();
  await page.getByTitle('Convertir a Factura/Venta POS').first().click();
  await expect(page.getByLabel(/Método de pago/i)).toBeVisible({ timeout: 5000 });
  await page.getByLabel(/Método de pago/i).selectOption('TRANSFERENCIA');
  const conversion = page.waitForResponse(r => r.url().endsWith('/convertir') && r.request().method() === 'POST');
  await page.getByRole('button', { name: /Confirmar.*Convertir/i }).click();
  expect((await conversion).status()).toBe(201);
  await page.goto(`${origin}/pos`);
  await page.getByText('QA NAVEGADOR', { exact: true }).click();
  await page.getByRole('button', { name: 'TARJETA', exact: true }).click();
  const sale = page.waitForResponse(r => r.url().endsWith('/ventas') && r.request().method() === 'POST');
  await page.getByRole('button', { name: /Procesar Venta/i }).click();
  expect((await sale).status()).toBe(201);
  await expect(page.getByRole('status').filter({ hasText: 'Venta registrada' })).toBeVisible();
  await page.getByRole('button', { name: /Nueva venta/i }).click();
  await page.reload();
  await page.getByText('QA NAVEGADOR', { exact: true }).click();
  await page.getByRole('button', { name: 'EFECTIVO', exact: true }).click();
  let posts = 0;
  // La petición llega al backend real y hace commit; solo se pierde la respuesta al navegador.
  await page.route('**/api/ventas', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    posts++;
    const committed = await route.fetch();
    expect(committed.status()).toBe(201);
    await route.abort('failed');
  });
  await page.getByRole('button', { name: /Procesar Venta/i }).click();
  await expect(page.getByRole('button', { name: 'Revisar venta y continuar' })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Revisar venta y continuar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Venta registrada' })).toBeVisible();
  expect(posts).toBe(1);
} finally {
  await browser?.close();
  await server.close();
}
