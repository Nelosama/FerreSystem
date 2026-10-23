import { activateTestUser } from './activation.fixture';
import { fillPlatformMfa, syntheticMfaFor } from './mfa.fixture';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';

// Verificación operativa (paso 10 del ciclo de entrega): el administrador consulta el historial de ventas y la auditoría después de vender y entregar.
// Backend NestJS real + PostgreSQL temporal (run.sh). Sin mocks. Solo verifica; no cambia comportamiento del producto.

const API = process.env.E2E_API_URL!;
const PASSWORD = process.env.E2E_PASSWORD!;
const PSQL = `${process.env.PG_BIN ?? '/usr/lib/postgresql/16/bin'}/psql`;
const DB = `postgresql://postgres@127.0.0.1:${process.env.E2E_PG_PORT ?? '55433'}/postgres`;
const sql = (consulta: string) => execFileSync(PSQL, ['-X', '-At', '-F', '|', DB, '-c', consulta], { encoding: 'utf8' }).trim();
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const RUN = randomUUID().slice(0, 8);
const ADMIN = 'admin.a@e2e.invalid';
const CAJERO = `hist.cajero.${RUN}@e2e.invalid`;
const TENANT = 'e2e-empresa-a';

async function login(request: APIRequestContext, email: string) {
  const res = await request.post(`${API}/auth/login`, { data: { email, password: PASSWORD, mfaCode: await syntheticMfaFor(email) } });
  expect(res.status(), `login ${email}`).toBe(200);
  const body = await res.json();
  return { token: body.accessToken as string, id: body.user.id as string };
}

test.describe.configure({ mode: 'serial' });

let admin: { token: string; id: string };
let cajero: { token: string; id: string };
let ventaId = '';
let productoId = '';
const solicitudVenta = randomUUID();

test.beforeAll(async ({ request }) => {
  admin = await login(request, ADMIN);
  const alta = await request.post(`${API}/usuarios`, { headers: auth(admin.token), data: { nombre: `Hist Cajero ${RUN}`, email: CAJERO, rol: 'CAJERO', permisos: ['pos.vender'], descuentoMaximo: 10 } });
  expect([200, 201], await alta.text()).toContain(alta.status());
  await activateTestUser(request, (await alta.json()).id);
  sql(`UPDATE usuarios SET permisos_configurados=true, permisos=ARRAY['pos.vender']::text[] WHERE email='${CAJERO}' AND tenant_id='${TENANT}'`);
  cajero = await login(request, CAJERO);
  const caja = await request.post(`${API}/operaciones/caja/abrir`, { headers: auth(cajero.token), data: { solicitudId: randomUUID(), monto: 500 } });
  expect([200, 201], await caja.text()).toContain(caja.status());
  const producto = await request.post(`${API}/productos`, { headers: auth(admin.token), data: { codigo: `HIST-${RUN}`, nombre: `Historial ${RUN}`, precioVenta: 100, precioCosto: 60, stockActual: 20, stockMinimo: 1 } });
  expect([200, 201], await producto.text()).toContain(producto.status());
  productoId = (await producto.json()).id;
});

test('el cajero vende de contado y el administrador entrega: la venta aparece en el historial con su responsable, método y total', async ({ request }) => {
  const venta = await request.post(`${API}/ventas`, { headers: auth(cajero.token), data: { solicitudId: solicitudVenta, metodoPago: 'EFECTIVO', detalles: [{ productoId, cantidad: 2, precioUnitario: 100 }] } });
  expect(venta.status()).toBe(201);
  ventaId = (await venta.json()).id;
  const entrega = await request.post(`${API}/operaciones/ventas/${ventaId}/entregar`, { headers: auth(admin.token), data: { solicitudId: randomUUID(), receptorNombre: 'Cliente historial' } });
  expect(entrega.status()).toBe(201);

  const lista = await request.get(`${API}/ventas?limit=500`, { headers: auth(admin.token) });
  expect(lista.status()).toBe(200);
  const filas = (await lista.json()) as any[];
  const fila = (Array.isArray(filas) ? filas : (filas as any).data ?? []).find((v: any) => v.id === ventaId);
  expect(fila, 'la venta está en el historial del administrador').toBeTruthy();
  expect(Number(fila.total)).toBe(230);
  expect(String(fila.metodoPago ?? fila.metodo_pago)).toBe('EFECTIVO');
  const detalle = await request.get(`${API}/ventas/${ventaId}`, { headers: auth(admin.token) });
  expect(detalle.status()).toBe(200);
  expect(sql(`SELECT usuario_id FROM ventas WHERE id='${ventaId}'`)).toBe(cajero.id);
});


// La auditoría es exclusiva del SUPERADMIN (ruta por negocio). Un ADMIN recibe 403 en la ruta de tenant.
async function tokenSuperAdmin(request: any): Promise<string> {
  const r = await request.post(`${API}/auth/login`, { data: { email: 'superadmin.e2e@e2e.invalid', password: process.env.E2E_PASSWORD, mfaCode: await syntheticMfaFor('superadmin.e2e@e2e.invalid') } });
  expect(r.status()).toBe(200);
  return (await r.json()).accessToken as string;
}

test('la auditoría registra venta y entrega con usuario; la API por negocio la devuelve solo al SUPERADMIN', async ({ request }) => {
  expect(Number(sql(`SELECT COUNT(*) FROM auditoria_operaciones WHERE tenant_id='${TENANT}' AND operacion='VENTA_CREAR' AND entidad_id='${ventaId}' AND usuario_id='${cajero.id}'`))).toBe(1);
  expect(Number(sql(`SELECT COUNT(*) FROM auditoria_operaciones WHERE tenant_id='${TENANT}' AND operacion='VENTA_ENTREGAR' AND datos::text LIKE '%${ventaId}%' AND usuario_id='${admin.id}'`))).toBe(1);
  // ADMIN no puede leer la auditoría del negocio por la ruta de tenant: 403.
  expect((await request.get(`${API}/operaciones/auditoria?page=0`, { headers: auth(admin.token) })).status()).toBe(403);
  const sa = await tokenSuperAdmin(request);
  const api = await request.get(`${API}/admin/tenants/${TENANT}/auditoria?page=0`, { headers: auth(sa) });
  expect(api.status()).toBe(200);
  const filas = (await api.json()) as any[];
  expect(filas.every((f) => f.tenant_id === TENANT)).toBe(true);
  const operaciones = filas.filter((f) => f.entidad_id === ventaId || JSON.stringify(f.datos ?? {}).includes(ventaId)).map((f) => f.operacion).sort();
  expect(operaciones).toEqual(['VENTA_CREAR', 'VENTA_ENTREGAR']);
  expect((await request.get(`${API}/operaciones/auditoria?page=0`, { headers: auth(cajero.token) })).status()).toBe(403);
  expect((await request.get(`${API}/admin/tenants/${TENANT}/auditoria?page=0`, { headers: auth(cajero.token) })).status()).toBe(403);
});

for (const [nombre, vista] of [['escritorio', { width: 1280, height: 800 }], ['móvil 390 px', { width: 390, height: 844 }]] as const) {
  test(`el SUPERADMIN ve la auditoría del negocio (${nombre}); el administrador del negocio recibe acceso denegado`, async ({ page }) => {
    await page.setViewportSize(vista);
    // El administrador del negocio no accede a la auditoría (regla nueva): acceso denegado en la pantalla.
    await page.goto('/login');
    await page.locator('#login-correo').fill(ADMIN);
    await page.locator('#login-clave').fill(PASSWORD);
    await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'));
    await page.goto('/auditoria');
    await expect(page.getByRole('heading', { name: 'Acceso Denegado', exact: true })).toBeVisible();
    await expect(page.locator('table')).toHaveCount(0);

    // El SUPERADMIN consulta la auditoría del negocio desde el panel por negocio.
    await page.goto('/login');
    await page.locator('#login-correo').fill('superadmin.e2e@e2e.invalid'); await fillPlatformMfa(page, 'superadmin.e2e@e2e.invalid');
    await page.locator('#login-clave').fill(PASSWORD);
    await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/login'));
    await page.goto(`/admin/negocios/${TENANT}/auditoria`);
    const tabla = page.locator('table');
    await expect(tabla.getByRole('cell', { name: 'Venta registrada' }).first()).toBeVisible();
    await expect(tabla.getByRole('cell', { name: 'Entrega', exact: true }).first()).toBeVisible();
    await expect(tabla.getByRole('cell', { name: `Hist Cajero ${RUN}` }).first()).toBeVisible();
    const desborda = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    // En móvil la tabla puede desplazarse dentro de su contenedor; la página no debe desbordar.
    expect(desborda, 'sin desbordamiento horizontal de la página').toBe(false);
  });
}

test('el cajero no accede a la pantalla de auditoría', async ({ page }) => {
  await page.goto('/login');
  await page.locator('#login-correo').fill(CAJERO);
  await page.locator('#login-clave').fill(PASSWORD);
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  await page.goto('/auditoria');
  await expect(page.getByRole('heading', { name: 'Acceso Denegado' })).toBeVisible();
  await expect(page.locator('table')).toHaveCount(0);
  await expect(page.getByText('Venta registrada')).toHaveCount(0);
});
