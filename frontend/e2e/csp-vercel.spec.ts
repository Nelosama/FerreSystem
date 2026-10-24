import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { installScannerCamera } from './scanner-camera.fixture';
import { cabeceras, ingresar, preparar } from './csp-vercel.fixture';

// CSP y cabeceras de vercel.json aplicadas a cada respuesta de la app (ver csp-vercel.fixture.ts).

test('la CSP de vercel.json se sirve en el documento y no bloquea inicio, POS ni el PDF del comprobante (WASM)', async ({ page, baseURL }) => {
  const violaciones = await preparar(page, baseURL);
  const documento = await page.goto('/login');
  expect(documento!.headers()['content-security-policy']).toBe(cabeceras['content-security-policy']);
  await ingresar(page);
  await page.goto('/pos');
  await page.getByText('Taladro').first().click();
  await page.getByRole('button', { name: /Procesar Venta/ }).last().click();
  await expect(page.getByText(/Factura N°/)).toBeVisible();
  const descarga = page.waitForEvent('download');
  await page.getByRole('button', { name: /DESCARGAR COMPROBANTE/i }).click();
  const archivo = await descarga;
  const ruta = await archivo.path();
  expect(readFileSync(ruta!).subarray(0, 5).toString()).toBe('%PDF-');
  expect(await violaciones()).toEqual([]);
});

for (const software of [false, true]) {
  test(`la CSP permite el escáner con cámara simulada (${software ? 'decodificador de software sobre canvas' : 'detector nativo'})`, async ({ page, baseURL }) => {
    const violaciones = await preparar(page, baseURL);
    await installScannerCamera(page, software);
    await ingresar(page);
    await page.goto('/inventario');
    await page.getByRole('button', { name: 'NUEVO PRODUCTO', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('summary').first().click();
    await dialog.getByRole('button', { name: 'Leer código con cámara' }).click();
    // El detector nativo simulado no devuelve código (queda esperando); el de software lee el EAN-13 pintado en el canvas.
    await expect(software ? dialog.getByText('Código leído: 5901234123457', { exact: true }) : dialog.getByText('Apunte al código y mantenga el teléfono estable.')).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as any).scannerCamera.requests)).toBeGreaterThan(0);
    await page.waitForTimeout(500);
    expect(await violaciones()).toEqual([]);
  });
}

test.describe('service worker y modo sin conexión bajo la CSP', () => {
  test.use({ serviceWorkers: 'allow' });
  test('sw.js se registra, controla la página y el shell abre sin red', async ({ page, context, baseURL }) => {
    const violaciones = await preparar(page, baseURL);
    await page.goto('/login');
    await expect.poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.active), { timeout: 15_000 }).toBe(true);
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 15_000 }).toBe(true);
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#login-correo')).toBeVisible();
    await context.setOffline(false);
    expect(await violaciones()).toEqual([]);
  });
});

test('control negativo: la CSP bloquea un script en línea inyectado (el XSS no puede leer el token)', async ({ page, baseURL }) => {
  const violaciones = await preparar(page, baseURL);
  await page.goto('/login');
  await page.evaluate(() => {
    localStorage.setItem('ferre_token', 'secreto-de-prueba');
    const s = document.createElement('script');
    s.textContent = "window.__robado = localStorage.getItem('ferre_token')";
    document.body.appendChild(s);
    const img = document.createElement('img');
    img.setAttribute('src', 'x');
    img.setAttribute('onerror', "window.__robado = 'onerror'");
    document.body.appendChild(img);
  });
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as any).__robado)).toBeUndefined();
  const registro = await violaciones();
  expect(registro.some(v => /script-src/.test(v))).toBe(true);
});
