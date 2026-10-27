import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { formatLempiras } from '../src/utils/format';

// API NestJS y PostgreSQL temporales reales. Solo los dos últimos casos inyectan
// latencia/pérdida de transporte después de que la API confirme la transacción.
const API = process.env.E2E_API_URL!;
const sql = (query: string) => execFileSync(`${process.env.PG_BIN}/psql`, ['-X', '-At',
  `postgresql://postgres@127.0.0.1:${process.env.E2E_PG_PORT}/postgres`, '-c', query], { encoding: 'utf8' }).trim();

async function preparar(request: APIRequestContext, page: Page) {
  const email = 'admin.a@e2e.invalid';
  const login = await request.post(`${API}/auth/login`, { data: { email, password: process.env.E2E_PASSWORD } });
  expect(login.status()).toBe(200);
  const { accessToken, user } = await login.json();
  const headers = { Authorization: `Bearer ${accessToken}` };
  const caja = await request.post(`${API}/operaciones/caja/abrir`, { headers, data: { solicitudId: randomUUID(), monto: 100 } });
  expect([201, 409]).toContain(caja.status());
  const nombre = `Revision-${randomUUID().slice(0, 8)}`;
  const alta = await request.post(`${API}/productos`, { headers, data: {
    solicitudId: randomUUID(), codigo: nombre, nombre, precioVenta: 100, precioCosto: 60, stockActual: 10, stockMinimo: 0,
  } });
  expect(alta.status(), await alta.text()).toBe(201);
  const producto = await alta.json();
  await page.goto('/login');
  await page.locator('#login-correo').fill(email);
  await page.locator('#login-clave').fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'));
  // Enter solo agrega si el catálogo ya está cargado: se espera la respuesta antes de buscar.
  const catalogo = page.waitForResponse(r => r.request().method() === 'GET' && new URL(r.url()).pathname.endsWith('/productos/comercial') && r.ok());
  await page.goto('/pos');
  await catalogo;
  const buscar = page.getByPlaceholder('Buscar por código o nombre de producto...');
  await buscar.fill(nombre);
  await expect(page.locator('.pos-producto').filter({ hasText: nombre })).toBeVisible();
  await buscar.press('Enter');
  await expect(page.getByLabel(`Cantidad ${nombre}`, { exact: true })).toBeVisible();
  return { headers, user, producto };
}

function verificarVenta(venta: any, producto: any) {
  expect(Number(venta.total)).toBe(115);
  expect(sql(`SELECT COUNT(*) FROM ventas WHERE id='${venta.id}'`)).toBe('1');
  expect(sql(`SELECT COUNT(*) || '|' || SUM(monto)::text FROM movimientos_caja WHERE referencia='${venta.id}'`)).toBe('1|115.00');
  // ADMIN entrega en mostrador: una sola salida física, sin reserva pendiente.
  expect(sql(`SELECT stock_actual::text || '|' || stock_reservado::text FROM productos WHERE id='${producto.id}'`)).toBe('9.00|0.00');
}

test('1.2 / 13.3 efectivo, comprobante, caja y reporte por cajero concilian con PostgreSQL', async ({ page, request }) => {
  const { headers, user, producto } = await preparar(request, page);
  await page.getByLabel('Efectivo recibido').fill('200,50');
  await expect(page.getByTestId('pos-vuelto')).toContainText('85.50');
  const responseEvent = page.waitForResponse(r => new URL(r.url()).pathname === '/api/ventas' && r.request().method() === 'POST');
  await page.getByRole('button', { name: /Procesar Venta/ }).click();
  const response = await responseEvent;
  expect(response.status(), await response.text()).toBe(201);
  expect(response.request().postDataJSON()).not.toHaveProperty('efectivoRecibido');
  const venta = await response.json();
  await expect(page.getByTestId('ticket-vuelto')).toContainText('200.50');
  await expect(page.getByTestId('ticket-vuelto')).toContainText('85.50');
  verificarVenta(venta, producto);
  await page.getByRole('button', { name: 'NUEVA VENTA' }).click();
  await page.getByPlaceholder('Buscar por código o nombre de producto...').fill(producto.codigo);
  await expect(page.locator('.pos-producto').filter({ hasText: producto.codigo })).toBeVisible();
  await page.getByPlaceholder('Buscar por código o nombre de producto...').press('Enter');
  await expect(page.getByLabel('Efectivo recibido')).toHaveValue('');
  const dia = new Date(venta.createdAt).toLocaleDateString('en-CA', { timeZone: 'America/Tegucigalpa' });
  const resumen = await request.get(`${API}/operaciones/resumen?desde=${dia}&hasta=${dia}`, { headers });
  expect(resumen.status()).toBe(200);
  const { cajeros, metodos } = await resumen.json();
  const suma = (filas: any[]) => filas.reduce((s, f) => s + Math.round(Number(f.total) * 100), 0);
  expect(suma(cajeros)).toBe(suma(metodos));
  const propias = cajeros.filter((c: any) => c.usuario_id === user.id);
  const total = suma(propias) / 100;
  expect(total).toBeGreaterThanOrEqual(115);
  await page.goto('/reportes');
  await page.locator('input[type="date"]').first().fill(dia);
  await page.locator('input[type="date"]').last().fill(dia);
  const section = page.getByRole('region', { name: 'Ventas por cajero' });
  await expect(section.locator('tbody tr').filter({ hasText: user.nombre }).locator('td').last()).toHaveText(formatLempiras(total));
  const downloadEvent = page.waitForEvent('download');
  await section.getByRole('button', { name: 'Exportar CSV' }).click();
  const stream = await (await downloadEvent).createReadStream();
  const chunks = [];
  for await (const chunk of stream!) chunks.push(chunk);
  expect(Buffer.concat(chunks).toString('utf8')).toContain(`"${total.toFixed(2)}"`);
  const cajeroLogin = await request.post(`${API}/auth/login`, { data: { email: 'cajero.a@e2e.invalid', password: process.env.E2E_PASSWORD } });
  expect(cajeroLogin.status()).toBe(200);
  const token = (await cajeroLogin.json()).accessToken;
  expect((await request.get(`${API}/operaciones/resumen?desde=${dia}&hasta=${dia}`, { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(403);
});

for (const perder of [false, true]) {
  test(`14.4 API real con respuesta ${perder ? 'perdida' : 'tardía'}: una venta, un movimiento y una salida`, async ({ page, request }) => {
    const { producto } = await preparar(request, page);
    let envios = 0;
    let venta: any;
    let liberar!: () => void;
    const espera = new Promise<void>(resolve => { liberar = resolve; });
    await page.route('**/api/ventas', async route => {
      if (route.request().method() !== 'POST') return route.continue();
      envios++;
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      venta = await response.json();
      await espera;
      if (perder) await route.abort('connectionreset');
      else await route.fulfill({ response });
    });
    try {
      const cobrar = page.getByRole('button', { name: /Procesar Venta|Procesando venta/ }).last();
      await cobrar.click();
      await expect.poll(() => venta?.id).toBeTruthy();
      await expect(cobrar).toBeDisabled();
      await cobrar.click({ force: true });
      await page.keyboard.press('Enter');
      await expect(page.getByLabel(`Cantidad ${producto.nombre}`, { exact: true })).toHaveValue('1');
      liberar();
      if (perder) {
        await expect(page.getByRole('button', { name: 'Revisar venta y continuar' })).toBeEnabled();
        await page.getByRole('button', { name: 'Revisar venta y continuar' }).click();
      }
      await expect(page.getByRole('button', { name: 'NUEVA VENTA' })).toBeVisible();
      expect(envios).toBe(1);
      verificarVenta(venta, producto);
    } finally { liberar(); }
  });
}
