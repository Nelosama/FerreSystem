import { expect, test as base } from '@playwright/test';

type Role = 'ADMIN' | 'CAJERO';
type Runtime = { errors: string[]; unexpected: string[]; requests: string[]; role?: Role };
const tenant = { id: 'tenant-browser-test', nombreComercial: 'Ferretería de prueba', colorPrimario: '#EA580C' };
const user = (role: Role) => ({ id: `user-${role}`, nombre: 'Usuario de prueba', email: 'usuario@prueba.invalid', rol: role });

// Todas las llamadas API se interceptan: estas pruebas no contactan ni modifican
// el backend publicado, incluso si el bundle fue compilado con su URL real.
const test = base.extend<{ runtime: Runtime }>({
  runtime: [async ({ page, baseURL }, use) => {
    const runtime: Runtime = { errors: [], unexpected: [], requests: [] };
    page.on('pageerror', error => runtime.errors.push(error.message));
    await page.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname.startsWith('/api/')) {
        const path = url.pathname.slice(4);
        runtime.requests.push(`${request.method()} ${path}`);
        const headers = { 'access-control-allow-origin': new URL(baseURL!).origin, 'access-control-allow-credentials': 'true' };
        if (request.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers }); return; }
        const role = runtime.role;
        const reads: Record<string, unknown> = {
          '/tenant/settings': tenant,
          '/auth/me': { user: role ? { sub: user(role).id, tenantId: tenant.id, rol: role, permisos: ['pos.vender'], descuentoMaximo: 0 } : null },
          '/dashboard': { ventasDelDia: { total: 0 }, alertasStock: { items: [] }, cotizacionesPendientes: { cantidad: 0 } },
          '/maintenance/backup': { configured: false },
          '/productos/comercial': [],
          '/operaciones/proveedores': [],
          '/operaciones/caja': [],
          '/operaciones/solicitudes-devolucion': [],
          '/operaciones/auditoria': [],
        };
        let response: unknown;
        if (role && request.method() === 'POST' && path === '/auth/login') response = { type: 'tenant', accessToken: 'browser-test-token', user: user(role), tenant };
        else if (role && request.method() === 'GET' && path in reads) response = reads[path];
        else {
          runtime.unexpected.push(`${request.method()} ${path}`);
          await route.abort(); return;
        }
        await route.fulfill({ json: response, headers }); return;
      }
      if (url.origin === new URL(baseURL!).origin) await route.continue();
      else await route.abort();
    });
    await use(runtime);
    expect(runtime.errors, 'El bundle no debe lanzar errores de JavaScript').toEqual([]);
    expect(runtime.unexpected, 'No debe haber peticiones API fuera de los mocks autorizados').toEqual([]);
  }, { auto: true }],
});

for (const path of ['/', '/login', '/pos', '/devoluciones', '/auditoria', '/admin/login']) {
  test(`sin sesión, ${path} muestra el login del bundle construido`, async ({ page, runtime }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'INGRESAR AL SISTEMA' })).toBeVisible();
    expect(runtime.requests).toEqual([]);
  });
}

for (const key of ['ferre_solicitudes_descuento_tenant-demo-1', 'ferre_solicitudes_descuento', 'ferre_notificaciones_transferencia_tenant-demo-1']) {
  test(`el login sigue disponible si ${key} contiene JSON corrupto`, async ({ page, runtime }) => {
    await page.addInitScript(key => localStorage.setItem(key, '{'), key);
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'INGRESAR AL SISTEMA' })).toBeVisible();
    expect(runtime.requests).toEqual([]);
  });
}

test('eventos de otras pestañas con notificaciones inválidas no interrumpen el login', async ({ page, runtime }) => {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'INGRESAR AL SISTEMA' })).toBeVisible();
  await page.evaluate(() => {
    for (const key of ['ferre_solicitudes_descuento_tenant-demo-1', 'ferre_notificaciones_transferencia_tenant-demo-1']) {
      for (const newValue of ['{', '{}']) window.dispatchEvent(new StorageEvent('storage', { key, newValue }));
    }
  });
  await expect(page.getByRole('button', { name: 'INGRESAR AL SISTEMA' })).toBeVisible();
  expect(runtime.requests).toEqual([]);
});

for (const role of ['ADMIN', 'CAJERO'] as const) {
  test(`login simulado de ${role} carga las pantallas y respeta acceso a auditoría`, async ({ page, runtime }) => {
    runtime.role = role;
    await page.addInitScript(() => {
      localStorage.setItem('ferre_solicitudes_descuento_tenant-browser-test', '{}');
      localStorage.setItem('ferre_notificaciones_transferencia_tenant-browser-test', 'null');
    });
    await page.goto('/login');
    await page.locator('input[type="email"]').fill('usuario@prueba.invalid');
    await page.locator('input[type="password"]').fill('solo-para-esta-prueba');
    await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
    await expect(page.getByRole('heading', { name: role === 'ADMIN' ? 'Administrar el negocio' : 'Tareas del día', exact: true })).toBeVisible();

    await page.locator('#task-search').fill('devolución');
    await page.getByRole('link', { name: /^Registrar una devolución/ }).click();
    await expect(page).toHaveURL(/\/devoluciones$/);
    await expect(page.getByRole('heading', { name: role === 'ADMIN' ? 'Revisar devoluciones' : 'Solicitar una devolución', exact: true })).toBeVisible();

    await page.goto('/auditoria');
    await expect(page.getByRole('heading', { name: role === 'ADMIN' ? 'AUDITORÍA' : 'Acceso Denegado', exact: true })).toBeVisible();
    if (role === 'CAJERO') expect(runtime.requests).not.toContain('GET /operaciones/auditoria');

    await page.goto('/pos');
    await expect(page.getByRole('link', { name: 'Abrir o revisar mi caja', exact: true })).toBeVisible();
  });
}
