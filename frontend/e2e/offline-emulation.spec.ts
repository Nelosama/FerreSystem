import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type BrowserContext } from '@playwright/test';

// Prueba del emulador, sin React, API de Jowa, mocks de red ni alteraciones de navigator.onLine.
// Un navegador alternativo debe conservar tanto el bloqueo de red como el estado offline al recargar por SW.
test('el emulador offline conserva navigator.onLine tras recargar desde un service worker', async ({ playwright }, testInfo) => {
  let peticionesAPI = 0;
  const html = '<!doctype html><title>Offline probe</title><body>Shell local</body>';
  const server = createServer((req, res) => {
    if (req.url === '/api/probe') {
      peticionesAPI++;
      res.setHeader('Content-Type', 'application/json');
      res.end('{"ok":true}');
    } else if (req.url === '/sw.js') {
      res.setHeader('Content-Type', 'text/javascript');
      res.end(`
        self.addEventListener('install', e => e.waitUntil(caches.open('offline-probe').then(c => c.add('/shell'))));
        self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
        self.addEventListener('fetch', e => {
          if (new URL(e.request.url).pathname.startsWith('/api/')) return;
          e.respondWith(fetch(e.request).catch(() => caches.match('/shell')));
        });
      `);
    } else {
      res.setHeader('Content-Type', 'text/html');
      res.end(html);
    }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const perfil = await mkdtemp(join(tmpdir(), 'pr166-offline-probe-'));
  let context: BrowserContext | undefined;
  try {
    context = await playwright.chromium.launchPersistentContext(perfil, {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      serviceWorkers: 'allow',
    });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}`);
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
    });
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    const estado = () => page.evaluate(() => ({ online: navigator.onLine, serviceWorker: !!navigator.serviceWorker.controller }));
    const api = () => page.evaluate(async () => {
      try { return (await fetch('/api/probe', { cache: 'no-store' })).status; }
      catch { return 'NETWORK_ERROR'; }
    });
    const inicio = { ...await estado(), api: await api(), peticionesAPI };
    await context.setOffline(true);
    const antesRecarga = await estado();
    await page.reload();
    const despuesRecarga = { ...await estado(), api: await api(), peticionesAPI };
    const diagnostico = { navegador: context.browser()?.version(), ejecutable: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? 'Playwright bundled', inicio, antesRecarga, despuesRecarga };
    console.info('offline-emulation', JSON.stringify(diagnostico));
    await testInfo.attach('offline-emulation.json', { body: JSON.stringify(diagnostico, null, 2), contentType: 'application/json' });
    expect(inicio).toEqual({ online: true, serviceWorker: true, api: 200, peticionesAPI: 1 });
    expect(antesRecarga).toEqual({ online: false, serviceWorker: true });
    expect(despuesRecarga.api).toBe('NETWORK_ERROR');
    expect(despuesRecarga.peticionesAPI).toBe(1);
    expect(despuesRecarga.serviceWorker).toBe(true);
    await expect.poll(() => page.evaluate(() => navigator.onLine), { message:
      `Emulación offline incoherente en ${diagnostico.navegador}: la API sigue bloqueada, pero navigator.onLine cambió al recargar. Use el Chromium instalado por esta versión de Playwright (npx playwright install chromium); no fuerce navigator.onLine ni omita esta prueba.`,
    }).toBe(false);
    await context.setOffline(false);
    const reconexion = { ...await estado(), api: await api(), peticionesAPI };
    console.info('offline-reconnection', JSON.stringify(reconexion));
    await testInfo.attach('offline-reconnection.json', { body: JSON.stringify(reconexion, null, 2), contentType: 'application/json' });
    expect(reconexion).toEqual({ online: true, serviceWorker: true, api: 200, peticionesAPI: 2 });
  } finally {
    await context?.close();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(perfil, { recursive: true, force: true });
  }
});
