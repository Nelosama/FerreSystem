import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// E2E REAL (BALANCE): backend NestJS + PostgreSQL temporal + frontend real. Sin mocks.
// Flujo: crédito con plazo → abono en pantalla → saldo actualizado; pago a proveedor con referencia e historial;
// acceso por rol y separación entre empresas. Cada resultado se comprueba también en la base de datos.

const API = process.env.E2E_API_URL!;
const PASSWORD = process.env.E2E_PASSWORD!;
const PSQL = `${process.env.PG_BIN ?? '/usr/lib/postgresql/16/bin'}/psql`;
const DB = `postgresql://postgres@127.0.0.1:${process.env.E2E_PG_PORT ?? '55433'}/postgres`;
const sql = (consulta: string) => execFileSync(PSQL, ['-X', '-At', '-F', '|', DB, '-c', consulta], { encoding: 'utf8' }).trim();

const USUARIOS = { adminA: 'admin.a@e2e.invalid', cajeroA: 'cajero.a@e2e.invalid', bodegueroA: 'bodeguero.a@e2e.invalid', adminB: 'admin.b@e2e.invalid' };

async function sesion(request: APIRequestContext, email: string) {
  const res = await request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } });
  expect(res.status(), `login ${email}`).toBe(200);
  const body = await res.json();
  return { auth: { Authorization: `Bearer ${body.accessToken}` }, id: body.user.id as string };
}

async function ingresar(page: Page, email: string, ruta: string) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  await page.goto(ruta);
}

test.describe.serial('BALANCE: cuentas por cobrar y por pagar contra backend real', () => {
  let admin: { auth: Record<string, string>; id: string };
  let adminB: { auth: Record<string, string> };
  let clienteId = '';
  let productoId = '';
  let cuentaVentaId = '';
  let documentoVenta = '';
  let proveedorId = '';
  let cuentaCompraId = '';

  test.beforeAll(async ({ request }) => {
    admin = await sesion(request, USUARIOS.adminA);
    adminB = await sesion(request, USUARIOS.adminB);
    const caja = await request.post(`${API}/operaciones/caja/abrir`, { headers: admin.auth, data: { solicitudId: randomUUID(), monto: 1000 } });
    expect([201, 409]).toContain(caja.status()); // ya abierta en una ejecución previa del mismo clúster
    const clientes = await (await request.get(`${API}/clientes/buscar?q=Constructora`, { headers: admin.auth })).json();
    clienteId = clientes[0].id;
    await request.patch(`${API}/clientes/${clienteId}/credito`, { headers: admin.auth, data: { creditoHabilitado: true, limiteCredito: 5000, plazoCreditoDias: 30 } });
    const productos = await (await request.get(`${API}/productos/comercial`, { headers: admin.auth })).json();
    productoId = productos.find((p: any) => p.codigo === 'TAL-E2E-1').id;
    const venta = await request.post(`${API}/ventas`, { headers: admin.auth, data: { solicitudId: randomUUID(), clienteId, metodoPago: 'CREDITO', tipoPago: 'CREDITO', detalles: [{ productoId, cantidad: 1 }] } });
    expect(venta.status()).toBe(201);
    const v = await venta.json();
    documentoVenta = String(v.numeroVenta);
    cuentaVentaId = sql(`SELECT id FROM cuentas_operativas WHERE documento_id='${v.id}' AND tipo='CXC'`);
    expect(cuentaVentaId).not.toBe('');
    // Vencimiento = día de venta + plazo del cliente (30), calculado por el servidor.
    const plazo = sql(`SELECT (vencimiento::date - created_at::date) FROM cuentas_operativas WHERE id='${cuentaVentaId}'`);
    expect(plazo).toBe('30');
    const prov = await request.post(`${API}/operaciones/proveedores`, { headers: admin.auth, data: { solicitudId: randomUUID(), nombre: 'Distribuidora E2E Balance' } });
    expect(prov.status()).toBe(201);
    proveedorId = (await prov.json()).id;
    const compra = await request.post(`${API}/operaciones/compras`, { headers: admin.auth, data: { solicitudId: randomUUID(), proveedorId, numeroFactura: 'FAC-BAL-9', isv: 0, items: [{ productoId, cantidad: 2, costo: 1500 }] } });
    expect(compra.status()).toBe(201);
    cuentaCompraId = sql(`SELECT id FROM cuentas_operativas WHERE documento_id='${(await compra.json()).id}' AND tipo='CXP'`);
  });

  test('el administrador ve la deuda del cliente y registra un abono; el saldo se actualiza en pantalla y en la base', async ({ page }) => {
    await ingresar(page, USUARIOS.adminA, '/cuentas');
    await expect(page.getByText(`Documento ${documentoVenta}`).first()).toBeVisible();
    const tarjeta = page.locator('section.operation-card').filter({ hasText: `Documento ${documentoVenta}` });
    await tarjeta.getByRole('button', { name: 'Registrar abono' }).click();
    await page.getByRole('button', { name: 'Registrar', exact: true }).click().catch(() => undefined);
    const form = page.locator('form').filter({ has: page.getByRole('heading', { name: /Registrar abono/ }) });
    page.once('dialog', (d) => d.accept());
    await form.locator('input[type="number"]').fill('40');
    await form.getByRole('button', { name: 'Registrar', exact: true }).click();
    await expect.poll(() => sql(`SELECT saldo::text FROM cuentas_operativas WHERE id='${cuentaVentaId}'`)).toBe('75.00');
    await expect(page.locator('section.operation-card').filter({ hasText: `Documento ${documentoVenta}` }).getByText('Parcial').first()).toBeVisible();
    expect(sql(`SELECT COUNT(*) FROM pagos_cuenta WHERE cuenta_id='${cuentaVentaId}'`)).toBe('1');
  });

  test('el administrador registra un pago a proveedor con referencia; el historial la muestra con el responsable', async ({ page }) => {
    await ingresar(page, USUARIOS.adminA, '/cuentas');
    await page.getByRole('button', { name: 'Proveedores · Por pagar' }).click();
    const tarjeta = page.locator('section.operation-card').filter({ hasText: 'FAC-BAL-9' });
    await tarjeta.getByRole('button', { name: 'Registrar pago' }).click();
    const form = page.locator('form').filter({ has: page.getByRole('heading', { name: /Registrar pago/ }) });
    page.once('dialog', (d) => d.accept());
    await form.getByLabel('Referencia de pago (comprobante)').fill('TRF-E2E-778');
    await form.locator('input[type="number"]').fill('1000');
    await form.getByRole('button', { name: 'Registrar', exact: true }).click();
    await expect.poll(() => sql(`SELECT saldo::text FROM cuentas_operativas WHERE id='${cuentaCompraId}'`)).toBe('2000.00');
    await expect(tarjeta.getByText('TRF-E2E-778')).toBeVisible();
    await expect(tarjeta.getByText('Administrador E2E')).toBeVisible();
  });

  test('una referencia repetida en la misma factura se rechaza y no cambia el saldo (API real)', async ({ request }) => {
    const res = await request.post(`${API}/operaciones/cuentas/${cuentaCompraId}/pagos`, { headers: admin.auth, data: { solicitudId: randomUUID(), monto: 100, metodo: 'TRANSFERENCIA', referencia: 'TRF-E2E-778' } });
    expect(res.status()).toBe(409);
    expect(sql(`SELECT saldo::text FROM cuentas_operativas WHERE id='${cuentaCompraId}'`)).toBe('2000.00');
  });

  test('el cajero ve las cuentas por cobrar pero no las de proveedores', async ({ page, request }) => {
    const cajero = await sesion(request, USUARIOS.cajeroA);
    const cxp = await request.get(`${API}/operaciones/cuentas?tipo=CXP`, { headers: cajero.auth });
    expect(cxp.status()).toBe(403);
    await ingresar(page, USUARIOS.cajeroA, '/cuentas');
    await expect(page.getByText(`Documento ${documentoVenta}`).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Proveedores · Por pagar' })).toHaveCount(0);
  });

  test('el bodeguero no accede a información financiera', async ({ page, request }) => {
    const bodeguero = await sesion(request, USUARIOS.bodegueroA);
    expect((await request.get(`${API}/operaciones/cuentas?tipo=CXC`, { headers: bodeguero.auth })).status()).toBe(403);
    await ingresar(page, USUARIOS.bodegueroA, '/cuentas');
    await expect(page.getByText(`Documento ${documentoVenta}`)).toHaveCount(0);
  });

  test('otra empresa no ve ni paga las cuentas de esta (separación entre empresas en backend real)', async ({ request }) => {
    const listado = await request.get(`${API}/operaciones/cuentas?tipo=CXC`, { headers: adminB.auth });
    expect(listado.status()).toBe(200);
    const filas = await listado.json();
    expect(filas.map((f: any) => f.id)).not.toContain(cuentaVentaId);
    const pago = await request.post(`${API}/operaciones/cuentas/${cuentaVentaId}/pagos`, { headers: adminB.auth, data: { solicitudId: randomUUID(), monto: 1, metodo: 'EFECTIVO' } });
    expect(pago.status()).toBe(404);
    expect(sql(`SELECT saldo::text FROM cuentas_operativas WHERE id='${cuentaVentaId}'`)).toBe('75.00');
  });
});
