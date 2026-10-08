import { expect, test as base } from '@playwright/test';

type Runtime = { errors: string[]; unexpected: string[]; requests: string[] };

const tenant = {
  id: 'tenant-modal-test',
  nombreComercial: 'Ferretería Demo Modal',
  colorPrimario: '#EA580C',
  modulosHabilitados: ['clientes', 'inventario', 'pos', 'cotizaciones', 'usuarios', 'reportes', 'configuracion'],
};

const user = {
  id: 'user-admin-modal',
  nombre: 'Admin Modal Test',
  email: 'admin.modal@prueba.invalid',
  rol: 'ADMIN',
  permisos: ['*'],
};

const test = base.extend<{ runtime: Runtime }>({
  runtime: [
    async ({ page, baseURL }, use) => {
      const runtime: Runtime = { errors: [], unexpected: [], requests: [] };
      page.on('pageerror', (error) => runtime.errors.push(error.message));

      await page.route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());

        if (url.pathname.startsWith('/api/')) {
          const path = url.pathname.slice(4);
          runtime.requests.push(`${request.method()} ${path}`);
          const headers = {
            'access-control-allow-origin': new URL(baseURL!).origin,
            'access-control-allow-credentials': 'true',
          };

          if (request.method() === 'OPTIONS') {
            await route.fulfill({ status: 204, headers });
            return;
          }

          const reads: Record<string, unknown> = {
            '/tenant/settings': tenant,
            '/auth/me': { user: { sub: user.id, tenantId: tenant.id, rol: user.rol, permisos: user.permisos } },
            '/clientes': [{ id: 'cli-1', nombre: 'Cliente Test', numeroCliente: 'CLI-0001', tipo: 'INDIVIDUAL', activo: true }],
            '/productos': [{ id: 'prod-1', codigo: 'PROD-001', nombre: 'Producto Test', precioVenta: 100, precioCosto: 50, stockActual: 10, stockMinimo: 2, unidadMedida: 'unidad', categoria: 'General' }],
            '/cotizaciones': [{ id: 'cot-1', numeroCotizacion: 'COT-0001', clienteNombre: 'Cliente Test', total: 100, estado: 'BORRADOR', items: [] }],
            '/usuarios': [{ id: 'usr-1', nombre: 'Usuario Test', email: 'test@demo.com', rolBase: 'CAJERO', activo: true, permisos: [] }],
            '/cajas/actual': { id: 'caja-1', estado: 'ABIERTA', montoInicial: 1000 },
          };

          let response: unknown = [];
          if (request.method() === 'GET' && path in reads) {
            response = reads[path];
          } else {
            response = [];
          }

          await route.fulfill({ json: response, headers });
          return;
        }

        if (url.origin === new URL(baseURL!).origin) {
          await route.continue();
        } else {
          await route.abort();
        }
      });

      await use(runtime);
      expect(runtime.errors, 'No JS runtime errors').toEqual([]);
    },
    { auto: true },
  ],
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ tenant, user }) => {
    localStorage.setItem('ferre_token', 'browser-modal-test-token');
    localStorage.setItem('ferre_tenant', JSON.stringify(tenant));
    localStorage.setItem('ferre_user', JSON.stringify(user));
  }, { tenant, user });
});

test('Clientes modal close button has accessible name and closes on click', async ({ page }) => {
  await page.goto('/clientes');
  await page.getByRole('button', { name: /CLIENTS\.NEW_CLIENT|NUEVO CLIENTE/i }).click();

  const closeBtn = page.getByRole('button', { name: 'Cerrar modal' });
  await expect(closeBtn).toBeVisible();

  await closeBtn.click();
  await expect(closeBtn).not.toBeVisible();
});

test('Inventario modal close button has accessible name and closes on click', async ({ page }) => {
  await page.goto('/inventario');
  await page.getByRole('button', { name: /NUEVO PRODUCTO|AGREGAR ARTÍCULO/i }).click();

  const closeBtn = page.getByRole('button', { name: 'Cerrar modal' });
  await expect(closeBtn).toBeVisible();

  await closeBtn.click();
  await expect(closeBtn).not.toBeVisible();
});

test('Cotizaciones modal close button and clear search button have accessible names', async ({ page }) => {
  await page.goto('/cotizaciones');

  // Verify search clear button accessibility
  const searchInput = page.locator('#cotizacion-search');
  if (await searchInput.isVisible()) {
    await searchInput.fill('Filtro');
    const clearBtn = page.getByRole('button', { name: 'Limpiar búsqueda' });
    await expect(clearBtn).toBeVisible();
    await clearBtn.click();
    await expect(searchInput).toHaveValue('');
  }

  // Open modal
  await page.getByRole('button', { name: /NUEVA COTIZACIÓN/i }).click();
  const closeBtn = page.getByRole('button', { name: 'Cerrar modal' });
  await expect(closeBtn).toBeVisible();
  await closeBtn.click();
  await expect(closeBtn).not.toBeVisible();
});

test('Usuarios modal close button has accessible name and closes on click', async ({ page }) => {
  await page.goto('/usuarios');
  await page.getByRole('button', { name: /NUEVO USUARIO/i }).click();

  const closeBtn = page.getByRole('button', { name: 'Cerrar modal' });
  await expect(closeBtn).toBeVisible();

  await closeBtn.click();
  await expect(closeBtn).not.toBeVisible();
});
