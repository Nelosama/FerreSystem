import { expect, test as base, type Page, type Route } from '@playwright/test';

// E2E CON BACKEND SIMULADO: RTN del cliente en el formulario de cotizaciones (etapa 4, decisión del dueño del 2026-11-12).
// Vacío o de 14 dígitos (espacios o guiones admitidos). Mal escrito: aviso junto al campo y no se guarda hasta corregirlo.
// La regla del servidor y lo que se guarda están en backend/test/rtn-etapa4.postgres.integration.ts.

const tenant = { id: 'tenant-cot-rtn-e2e', nombreComercial: 'Ferretería de prueba', colorPrimario: '#EA580C' };
const producto = { id: 'prod-1', codigo: 'TAL-1', nombre: 'Taladro', descripcion: null, categoria: { nombre: 'Herramientas' }, precioVenta: 100, precioCosto: 60,
  stockActual: 10, stockDisponible: 10, stockMinimo: 1, unidadMedida: 'UNIDAD', usaMedida: false, activo: true };

type Sim = { creadas: any[]; errores: string[]; inesperados: string[] };
const test = base.extend<{ sim: Sim }>({
  sim: [async ({ page, baseURL }, use) => {
    const sim: Sim = { creadas: [], errores: [], inesperados: [] };
    const origen = new URL(baseURL!).origin;
    const cabeceras = { 'access-control-allow-origin': origen, 'access-control-allow-credentials': 'true' };
    page.on('pageerror', e => sim.errores.push(e.message));
    const responder = (route: Route, status: number, body: unknown) => route.fulfill({ status, json: body, headers: cabeceras });
    const usuario = { id: 'user-vendedor', nombre: 'Vendedor de prueba', email: 'vendedor@prueba.invalid', rol: 'VENDEDOR', permisos: [], permisosConfigurados: false };
    await page.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (!url.pathname.startsWith('/api/')) { if (url.origin === origen) await route.continue(); else await route.abort(); return; }
      const method = request.method();
      const path = url.pathname.slice(4);
      if (method === 'OPTIONS') { await route.fulfill({ status: 204, headers: { ...cabeceras, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } }); return; }
      if (method === 'GET' && path === '/tenant/settings') return responder(route, 200, { ...tenant, modoNavegacion: 'SIDEBAR' });
      if (method === 'GET' && path === '/auth/me') return responder(route, 200, { user: { sub: usuario.id, tenantId: tenant.id, rol: usuario.rol, permisos: [], permisosConfigurados: false, descuentoMaximo: 0 } });
      if (method === 'POST' && path === '/auth/login') return responder(route, 200, { type: 'tenant', accessToken: 'cot-rtn-token', user: usuario, tenant });
      if (method === 'GET' && path === '/productos') return responder(route, 200, [producto]);
      if (method === 'POST' && path === '/cotizaciones') {
        const body = request.postDataJSON(); sim.creadas.push(body);
        return responder(route, 201, { id: `cot-${sim.creadas.length}`, numeroCotizacion: sim.creadas.length, estado: 'BORRADOR', ...body, detalles: [] });
      }
      if (method === 'GET') return responder(route, 200, path === '/dashboard' ? { ventasDelDia: { total: 0 }, alertasStock: { items: [] }, cotizacionesPendientes: { cantidad: 0 } } : []);
      sim.inesperados.push(`${method} ${path}`);
      await route.abort();
    });
    await use(sim);
    expect(sim.errores, 'La interfaz no debe lanzar errores de JavaScript').toEqual([]);
    expect(sim.inesperados, 'No debe haber peticiones API no previstas').toEqual([]);
  }, { auto: true }],
});

async function abrirFormulario(page: Page) {
  await page.goto('/login');
  await page.locator('#login-correo').fill('vendedor@prueba.invalid');
  await page.locator('#login-clave').fill('solo-para-esta-prueba');
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'));
  await page.goto('/cotizaciones');
  await page.getByRole('button', { name: 'NUEVA COTIZACIÓN' }).click();
  await page.locator('.form-group', { hasText: 'CLIENTE O RAZÓN SOCIAL' }).locator('input').fill('Constructora del valle');
  await page.getByRole('button', { name: /AGREGAR PRODUCTO DESDE INVENTARIO/ }).click();
  await page.getByRole('row', { name: /Taladro/ }).getByRole('button').click();
}

test.describe('RTN del cliente en cotizaciones (simulado)', () => {
  test('mal escrito: aviso junto al campo y no se guarda; corregido con espacios, se guarda', async ({ page, sim }) => {
    await abrirFormulario(page);
    const rtn = page.getByLabel('RTN DEL CLIENTE (OPCIONAL)');
    await rtn.fill('0801 1999 00000');
    await expect(page.getByTestId('cot-rtn-aviso')).toContainText('RTN: escriba exactamente 14 dígitos');
    await expect(rtn).toHaveAttribute('aria-invalid', 'true');
    await page.getByRole('button', { name: 'GUARDAR BORRADOR' }).click();
    await expect(page.getByText('RTN: escriba exactamente 14 dígitos').nth(1)).toBeVisible();
    expect(sim.creadas).toEqual([]);

    await rtn.fill('0801 1999 000001');
    await expect(page.getByTestId('cot-rtn-aviso')).toHaveCount(0);
    await page.getByRole('button', { name: 'GUARDAR BORRADOR' }).click();
    await expect.poll(() => sim.creadas.length).toBe(1);
    expect(sim.creadas[0]).toMatchObject({ clienteNombre: 'Constructora del valle', clienteRtn: '0801 1999 000001' });
  });

  test('sin RTN se guarda sin el campo', async ({ page, sim }) => {
    await abrirFormulario(page);
    await page.getByRole('button', { name: 'GUARDAR BORRADOR' }).click();
    await expect.poll(() => sim.creadas.length).toBe(1);
    expect(sim.creadas[0].clienteRtn).toBeUndefined();
  });
});
