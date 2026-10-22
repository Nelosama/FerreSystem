import { expect, test } from '@playwright/test';
import { ingresar, preparar } from './csp-vercel.fixture';

// Cámara real de Chromium con su dispositivo falso (--use-fake-device-for-media-stream): getUserMedia, la pista y el
// vídeo son del navegador, sin simulación en JavaScript. Con Permissions-Policy y CSP de vercel.json aplicadas.
// No acredita una cámara física, Safari ni iPhone.
test.use({
  permissions: ['camera'],
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
  },
});

test('Permissions-Policy camera=(self) y la CSP permiten abrir el vídeo del escáner', async ({ page, baseURL }) => {
  const violaciones = await preparar(page, baseURL);
  await ingresar(page);
  await page.goto('/inventario');
  await page.getByRole('button', { name: 'NUEVO PRODUCTO', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('summary').first().click();
  await dialog.getByRole('button', { name: 'Leer código con cámara' }).click();
  const video = dialog.locator('video');
  await expect(video).toHaveCount(1);
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 10_000 }).toBeGreaterThanOrEqual(2);
  expect(await video.evaluate((v: HTMLVideoElement) => (v.srcObject as MediaStream | null)?.getVideoTracks()[0]?.readyState)).toBe('live');
  expect(await violaciones()).toEqual([]);
});
