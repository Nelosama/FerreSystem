import { expect, test, type Page, type Route } from '@playwright/test';

// E2E CON BACKEND SIMULADO (JW-08): el administrador edita el RTN de un proveedor, lo desactiva (deja de ofrecerse en
// la factura de compra) y lo reactiva. Valida interfaz y contrato del payload; la persistencia, la auditoría y los
// permisos están en backend/test/proveedores-gestion.postgres.integration.ts (HTTP + PostgreSQL real).

const tenant = { id: 'tenant-prov-e2e', nombreComercial: 'Ferretería de prueba', colorPrimario: '#EA580C' };
const admin = { id: 'u-admin', nombre: 'Administrador', email: 'admin@prueba.invalid', rol: 'ADMIN' };

type Sim = { proveedores: any[]; patches: any[]; deletes: string[]; altas: any[]; errores: string[]; inesperados: string[] };

async function preparar(page: Page): Promise<Sim> {
  const sim: Sim = {
    proveedores: [{ id: 'prov-1', nombre: 'Distribuidora Norte', rtn: null, telefono: '9999-0000', activo: true }, { id: 'prov-2', nombre: 'Ferretera Sur', rtn: null, telefono: null, activo: true }],
    patches: [], deletes: [], altas: [], errores: [], inesperados: [],
  };
  page.on('pageerror', (e) => sim.errores.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.route('**/*', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) { if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') await route.continue(); else await route.abort(); return; }
    const cab = { 'access-control-allow-origin': request.headers().origin ?? 'http://localhost', 'access-control-allow-credentials': 'true' };
    const ok = (status: number, body: unknown) => route.fulfill({ status, json: body, headers: cab });
    const method = request.method(); const path = url.pathname.slice(4);
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...cab, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (method === 'GET' && path === '/tenant/settings') return ok(200, { ...tenant, modoNavegacion: 'SIDEBAR' });
    if (method === 'GET' && path === '/auth/me') return ok(200, { user: { sub: admin.id, tenantId: tenant.id, rol: 'ADMIN', permisos: [], permisosConfigurados: false, descuentoMaximo: 100 } });
    if (method === 'POST' && path === '/auth/login') return ok(200, { type: 'tenant', accessToken: 'prov-token', user: admin, tenant });
    // Como el servidor: /operaciones/proveedores lista todos (sin estado); /proveedores?incluirInactivos=true incluye el estado.
    if (method === 'GET' && path === '/operaciones/proveedores') return ok(200, sim.proveedores.map(({ id, nombre, telefono, rtn }) => ({ id, nombre, telefono, rtn })));
    if (method === 'GET' && path === '/proveedores') return ok(200, url.searchParams.get('incluirInactivos') === 'true' ? sim.proveedores : sim.proveedores.filter((p) => p.activo));
    if (method === 'POST' && path === '/operaciones/proveedores') { const b = request.postDataJSON(); sim.altas.push(b); sim.proveedores.push({ id: 'prov-3', nombre: b.nombre, rtn: b.rtn ?? null, telefono: b.telefono ?? null, activo: true }); return ok(201, { id: 'prov-3' }); }
    const uno = path.match(/^\/proveedores\/([^/]+)$/);
    if (uno && method === 'PATCH') { const b = request.postDataJSON(); sim.patches.push({ id: uno[1], body: b }); const p = sim.proveedores.find((x) => x.id === uno[1]); Object.assign(p, b); return ok(200, p); }
    if (uno && method === 'DELETE') { sim.deletes.push(uno[1]); const p = sim.proveedores.find((x) => x.id === uno[1]); p.activo = false; return ok(200, p); }
    if (method === 'GET' && ['/operaciones/compras', '/productos', '/dashboard', '/maintenance/backup'].includes(path)) return ok(200, path === '/dashboard' ? { ventasDelDia: { total: 0 }, alertasStock: { items: [] }, cotizacionesPendientes: { cantidad: 0 } } : []);
    if (method === 'GET') return ok(200, []);
    sim.inesperados.push(`${method} ${path}`);
    await route.abort();
  });
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(admin.email);
  await page.locator('input[type="password"]').fill('solo-para-esta-prueba');
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
  await page.goto('/ordenes-compra');
  return sim;
}

const opcionesFactura = (page: Page) => page.locator('form').filter({ hasText: 'Registrar factura de compra' }).getByRole('combobox').first().locator('option');

test('el administrador corrige el RTN de un proveedor: solo se envía lo que cambió', async ({ page }) => {
  const sim = await preparar(page);
  const panel = page.locator('section.proveedores-gestion');
  await panel.getByRole('button', { name: 'Editar Distribuidora Norte' }).click();
  const form = panel.locator('form');
  await form.getByLabel('RTN').fill(' 0801-1999-000123 ');
  await form.getByRole('button', { name: 'Guardar proveedor' }).click();
  await expect(panel.getByRole('status')).toContainText('Proveedor actualizado');
  expect(sim.patches).toEqual([{ id: 'prov-1', body: { rtn: '0801-1999-000123' } }]);
  await expect(panel.getByRole('row').filter({ hasText: 'Distribuidora Norte' })).toContainText('0801-1999-000123');
  expect(sim.errores).toEqual([]); expect(sim.inesperados).toEqual([]);
});

test('desactivar un proveedor lo quita de la factura de compra; reactivarlo lo devuelve', async ({ page }) => {
  const sim = await preparar(page);
  await expect(opcionesFactura(page)).toContainText(['Seleccione', 'Distribuidora Norte', 'Ferretera Sur']);
  const panel = page.locator('section.proveedores-gestion');
  await panel.getByRole('button', { name: 'Desactivar Ferretera Sur' }).click();
  await expect(panel.getByRole('status')).toContainText('Proveedor desactivado');
  expect(sim.deletes).toEqual(['prov-2']);
  await expect(panel.getByRole('row').filter({ hasText: 'Ferretera Sur' })).toContainText('Desactivado');
  await expect(opcionesFactura(page)).toHaveText(['Seleccione', 'Distribuidora Norte']);
  await panel.getByRole('button', { name: 'Reactivar Ferretera Sur' }).click();
  await expect(panel.getByRole('status')).toContainText('Proveedor reactivado');
  expect(sim.patches).toEqual([{ id: 'prov-2', body: { activo: true } }]);
  await expect(opcionesFactura(page)).toContainText(['Distribuidora Norte', 'Ferretera Sur']);
  expect(sim.errores).toEqual([]); expect(sim.inesperados).toEqual([]);
});

test('el alta de proveedor captura el RTN y el nombre vacío no se envía al editar', async ({ page }) => {
  const sim = await preparar(page);
  const alta = page.locator('form').filter({ hasText: 'Registrar proveedor' });
  await alta.getByLabel('Nombre').fill('Materiales del Valle');
  await alta.getByLabel('RTN').fill('08011999000999');
  await alta.getByRole('button', { name: 'Guardar proveedor' }).click();
  await expect.poll(() => sim.altas.length).toBe(1);
  expect(sim.altas[0]).toMatchObject({ nombre: 'Materiales del Valle', rtn: '08011999000999' });
  const panel = page.locator('section.proveedores-gestion');
  await expect(panel.getByRole('row').filter({ hasText: 'Materiales del Valle' })).toContainText('08011999000999');
  await panel.getByRole('button', { name: 'Editar Distribuidora Norte' }).click();
  const form = panel.locator('form');
  await form.getByLabel('Nombre').fill('   ');
  await form.getByRole('button', { name: 'Guardar proveedor' }).click();
  await expect(panel.getByRole('alert')).toContainText('obligatorio');
  expect(sim.patches).toEqual([]);
  expect(sim.errores).toEqual([]); expect(sim.inesperados).toEqual([]);
});
