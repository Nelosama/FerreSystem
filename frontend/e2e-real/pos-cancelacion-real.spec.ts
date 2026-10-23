import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

// NestJS, JWT, migraciones, PostgreSQL y navegador reales. Sin respuestas API simuladas.
const API = process.env.E2E_API_URL!;
const sql = (q: string) => execFileSync(`${process.env.PG_BIN}/psql`, ['-X', '-At',
  `postgresql://postgres@127.0.0.1:${process.env.E2E_PG_PORT}/postgres`, '-c', q], { encoding: 'utf8' }).trim();
const login = async (page: Page, email: string) => {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'));
};
async function preparar(request: APIRequestContext) {
  const iniciar = async (email: string) => {
    const r = await request.post(`${API}/auth/login`, { data: { email, password: process.env.E2E_PASSWORD } });
    expect(r.status()).toBe(200); const body = await r.json();
    return { ...body, headers: { Authorization: `Bearer ${body.accessToken}` } };
  };
  const admin = await iniciar('admin.a@e2e.invalid');
  const cajero = await iniciar('cajero.a@e2e.invalid');
  const caja = await request.post(`${API}/operaciones/caja/abrir`, { headers: cajero.headers, data: { solicitudId: randomUUID(), monto: 500 } });
  expect([201, 409]).toContain(caja.status());
  const nombre = `Cancelacion-${randomUUID().slice(0, 8)}`;
  const r = await request.post(`${API}/productos`, { headers: admin.headers, data: { solicitudId: randomUUID(), codigo: nombre, nombre, precioVenta: 100, precioCosto: 60, stockActual: 10, stockMinimo: 0 } });
  expect(r.status(), await r.text()).toBe(201);
  const producto = await r.json();
  return { admin, cajero, producto };
}

test('borrador y solicitud interrumpida sobreviven al cierre de pestaña y se descartan sin efectos operativos', async ({ page, context, request }) => {
  const { cajero, producto } = await preparar(request);
  await login(page, 'cajero.a@e2e.invalid'); await page.goto('/pos');
  await page.getByPlaceholder('Buscar por código o nombre de producto...').fill(producto.codigo);
  await page.getByPlaceholder('Buscar por código o nombre de producto...').press('Enter');
  await expect(page.getByLabel(`Cantidad ${producto.nombre}`, { exact: true })).toBeVisible();
  await page.close();
  const otra = await context.newPage(); await otra.goto('/pos');
  await expect(otra.getByRole('button', { name: 'Continuar venta', exact: true })).toBeVisible();
  await otra.getByRole('button', { name: 'Descartar venta', exact: true }).click();
  await otra.getByRole('dialog').getByRole('button', { name: 'Descartar venta', exact: true }).click();
  await expect(otra.getByRole('button', { name: 'Cancelar venta', exact: true })).toHaveCount(0);
  const solicitudId = randomUUID();
  const key = `ferre_pending_sale:${cajero.tenant.id}:${cajero.user.id}`;
  await otra.evaluate(({ key, pending }) => localStorage.setItem(key, JSON.stringify(pending)), { key, pending: {
    solicitudId, clienteNombre: 'Consumidor Final', clienteRtn: '', metodoPago: 'EFECTIVO', descuentoPorcentaje: 0,
    cart: [{ productoId: producto.id, codigo: producto.codigo, nombre: producto.nombre, cantidad: 1, precioUnitario: 100 }],
  } });
  await otra.close();
  const reinicio = await context.newPage(); await reinicio.goto('/pos');
  await reinicio.getByRole('button', { name: 'Descartar venta', exact: true }).click();
  await reinicio.getByRole('dialog').getByRole('button', { name: 'Descartar venta', exact: true }).click();
  await expect.poll(() => reinicio.evaluate(key => localStorage.getItem(key), key)).toBeNull();
  const status = await request.get(`${API}/ventas/solicitudes/${solicitudId}`, { headers: cajero.headers });
  expect(await status.json()).toEqual({ estado: 'DESCARTADA' });
  expect(sql(`SELECT stock_actual::text || '|' || stock_reservado::text FROM productos WHERE id='${producto.id}'`)).toBe('10.00|0.00');
  expect(sql(`SELECT COUNT(*) FROM detalles_venta WHERE producto_id='${producto.id}'`)).toBe('0');
});

test('cajero solicita anulación total; Admin autoriza desde su sesión y cajero registra una sola compensación', async ({ page, browser, request, baseURL }) => {
  const { admin, cajero, producto } = await preparar(request);
  const r = await request.post(`${API}/ventas`, { headers: cajero.headers, data: { solicitudId: randomUUID(), detalles: [{ productoId: producto.id, cantidad: 1 }] } });
  expect(r.status(), await r.text()).toBe(201); const venta = await r.json();
  await login(page, 'cajero.a@e2e.invalid'); await page.goto('/devoluciones');
  await page.getByLabel('Número del comprobante de venta').fill(String(venta.numeroVenta));
  await page.getByRole('button', { name: 'Buscar venta', exact: true }).click();
  await page.getByRole('button', { name: 'Solicitar anulación de toda la venta', exact: true }).click();
  await page.getByLabel('Motivo de la anulación').fill('Cliente desistió antes de recibir mercancía');
  await page.getByRole('button', { name: 'Enviar solicitud de autorización', exact: true }).click();
  await expect(page.getByText('Solicitud guardada.', { exact: false })).toBeVisible();
  const solicitudes = await request.get(`${API}/operaciones/solicitudes-devolucion`, { headers: cajero.headers });
  const solicitud = (await solicitudes.json()).find((s: any) => s.venta_id === venta.id);
  expect(solicitud.comando.anulacion).toBe(true);
  expect(sql(`SELECT COUNT(*) FROM devoluciones WHERE venta_id='${venta.id}'`)).toBe('0');
  const contextoAdmin = await browser.newContext({ baseURL });
  try {
    const paginaAdmin = await contextoAdmin.newPage();
    await login(paginaAdmin, 'admin.a@e2e.invalid'); await paginaAdmin.goto('/devoluciones');
    const tarjeta = paginaAdmin.locator('article').filter({ has: paginaAdmin.getByRole('heading', { name: `Anulación ${venta.numeroVenta} · Esperando al administrador`, exact: true }) });
    await tarjeta.getByLabel('Motivo de la decisión').fill('Documento y reserva revisados');
    await tarjeta.getByRole('button', { name: 'Autorizar estos productos y cantidades', exact: true }).click();
    await expect(paginaAdmin.getByRole('heading', { name: `Anulación ${venta.numeroVenta} · Autorizada: falta confirmar devolución`, exact: true })).toBeVisible();
  } finally { await contextoAdmin.close(); }
  await page.reload();
  const tarjeta = page.locator('article').filter({ has: page.getByRole('heading', { name: `Anulación ${venta.numeroVenta} · Autorizada: falta confirmar devolución`, exact: true }) });
  await tarjeta.getByRole('button', { name: 'Confirmar devolución y reembolso', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Devolución registrada', exact: true })).toBeVisible();
  const estado = await request.get(`${API}/operaciones/solicitudes-devolucion/${solicitud.id}`, { headers: cajero.headers });
  expect(await estado.json()).toMatchObject({ estado: 'EJECUTADA', solicitante_id: cajero.user.id, administrador_id: admin.user.id });
  expect(sql(`SELECT COUNT(*) || '|' || SUM(monto)::text FROM devoluciones WHERE venta_id='${venta.id}'`)).toBe('1|115.00');
  expect(sql(`SELECT stock_actual::text || '|' || stock_reservado::text FROM productos WHERE id='${producto.id}'`)).toBe('10.00|0.00');
  expect(sql(`SELECT estado::text FROM ventas WHERE id='${venta.id}'`)).toBe('COMPLETADA');
  expect(sql(`SELECT SUM(monto)::text FROM movimientos_caja WHERE referencia='${venta.id}' OR referencia IN (SELECT id FROM devoluciones WHERE venta_id='${venta.id}')`)).toBe('0.00');
});
