import { expect, test, type Page, type Route } from '@playwright/test';

// E2E CON BACKEND SIMULADO de la pantalla de entregas pendientes. Valida interfaz y contrato del payload.
// Las reglas de servidor (descuento una vez, concurrencia, permisos) se prueban en backend/test/cobro-entrega.postgres.integration.ts.

const tenant = { id: 'tenant-ent-e2e', nombreComercial: 'Ferretería de prueba', colorPrimario: '#EA580C' };
const pendiente = {
  ventaId: 'venta-1', numeroVenta: 41, creadaAt: '2026-10-10T12:00:00.000Z', total: 230, cliente: 'Constructora del Norte', cajero: 'Cajero Uno',
  antiguedadHoras: 30, alerta: 'AVISO',
  lineas: [{ detalleId: 'det-1', codigo: 'TOR-1', nombre: 'Tornillo 2 pulgadas', modoEntrega: 'BODEGA', cantidad: 10, entregada: 4, preparada: 0, cancelada: 0, pendiente: 6, enPoderDelCliente: 4 }],
};

async function preparar(page: Page, rol: 'ADMIN' | 'BODEGUERO' | 'CAJERO', posts: any[], fallos: { siguiente: number | null }) {
  const origen = 'http://localhost';
  const errores: string[] = [];
  page.on('pageerror', e => errores.push(e.message));
  await page.route('**/*', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) { if (url.origin === new URL(page.url() || request.url()).origin || url.hostname === 'localhost' || url.hostname === '127.0.0.1') await route.continue(); else await route.abort(); return; }
    const cab = { 'access-control-allow-origin': request.headers().origin ?? origen, 'access-control-allow-credentials': 'true' };
    const ok = (status: number, body: unknown) => route.fulfill({ status, json: body, headers: cab });
    const method = request.method(); const path = url.pathname.slice(4);
    const usuario = { id: 'u1', nombre: 'Usuario de prueba', email: 'usuario@prueba.invalid', rol };
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...cab, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (method === 'GET' && path === '/tenant/settings') return ok(200, { ...tenant, modoNavegacion: 'SIDEBAR' });
    if (method === 'GET' && path === '/auth/me') return ok(200, { user: { sub: usuario.id, tenantId: tenant.id, rol, permisos: [], permisosConfigurados: false, descuentoMaximo: 0 } });
    if (method === 'POST' && path === '/auth/login') return ok(200, { type: 'tenant', accessToken: 'ent-token', user: usuario, tenant });
    if (method === 'GET' && path === '/entregas/pendientes') return ok(200, { umbrales: {}, pendientes: [pendiente] });
    if (method === 'POST' && path === '/entregas/ventas/venta-1/entregas') {
      posts.push(request.postDataJSON());
      if (fallos.siguiente) { const s = fallos.siguiente; fallos.siguiente = null; return ok(s, { message: 'Cantidad supera lo pendiente de entrega (pendiente: 6)' }); }
      return ok(201, { ok: true });
    }
    if (method === 'GET') return ok(200, []);
    await route.abort();
  });
  return errores;
}

async function entrar(page: Page) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill('usuario@prueba.invalid');
  await page.locator('input[type="password"]').fill('solo-para-esta-prueba');
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
  await page.waitForURL(url => !url.pathname.startsWith('/login'));
  await page.goto('/entregas');
}

test('bodega ve vendido, entregado y pendiente; entrega parcial exige receptor y envía una solicitud', async ({ page }) => {
  const posts: any[] = [];
  const errores = await preparar(page, 'BODEGUERO', posts, { siguiente: null });
  await entrar(page);
  const tarjeta = page.getByRole('region', { name: 'Venta 41' });
  await expect(tarjeta).toContainText('Vendido 10');
  await expect(tarjeta).toContainText('Entregado 4');
  await expect(tarjeta).toContainText('Pendiente 6');
  await tarjeta.getByRole('button', { name: 'Entregar' }).click();
  await tarjeta.getByLabel('Entregar ahora').fill('2.5');
  await tarjeta.getByRole('button', { name: 'Confirmar entrega' }).click();
  await expect(page.getByRole('alert')).toContainText('nombre de quien recibe');
  expect(posts).toHaveLength(0);
  await tarjeta.getByPlaceholder('Nombre de quien recibe').fill('  Juan Pérez ');
  await tarjeta.getByRole('button', { name: 'Confirmar entrega' }).click();
  await expect(page.getByRole('status')).toContainText('Entrega registrada de la venta 41');
  expect(posts).toHaveLength(1);
  expect(posts[0]).toMatchObject({ receptorNombre: 'Juan Pérez', lineas: [{ detalleId: 'det-1', cantidad: 2.5 }] });
  expect(posts[0].solicitudId).toMatch(/^[0-9a-f-]{36}$/);
  expect(errores).toEqual([]);
});

test('rechazo del servidor se muestra en español, no se envía exceso y el reintento usa una solicitud nueva', async ({ page }) => {
  const posts: any[] = [];
  const fallos = { siguiente: 409 as number | null };
  await preparar(page, 'ADMIN', posts, fallos);
  await entrar(page);
  const tarjeta = page.getByRole('region', { name: 'Venta 41' });
  await tarjeta.getByRole('button', { name: 'Entregar' }).click();
  await tarjeta.getByPlaceholder('Nombre de quien recibe').fill('María López');
  await tarjeta.getByLabel('Entregar ahora').fill('7');
  await tarjeta.getByRole('button', { name: 'Confirmar entrega' }).click();
  await expect(page.getByRole('alert')).toContainText('supera lo pendiente');
  expect(posts).toHaveLength(0);
  await tarjeta.getByLabel('Entregar ahora').fill('6');
  await tarjeta.getByRole('button', { name: 'Confirmar entrega' }).click();
  await expect(page.getByRole('alert')).toContainText('supera lo pendiente de entrega');
  await tarjeta.getByRole('button', { name: 'Confirmar entrega' }).click();
  await expect(page.getByRole('status')).toContainText('Entrega registrada');
  expect(posts).toHaveLength(2);
  expect(posts[1].solicitudId).not.toBe(posts[0].solicitudId);
});

test('cajero ve las cantidades pero no puede confirmar la entrega', async ({ page }) => {
  await preparar(page, 'CAJERO', [], { siguiente: null });
  await entrar(page);
  const tarjeta = page.getByRole('region', { name: 'Venta 41' });
  await expect(tarjeta).toContainText('Pendiente 6');
  await expect(tarjeta.getByRole('button', { name: 'Entregar' })).toHaveCount(0);
  await expect(tarjeta).toContainText('Solo bodega o administración');
});
