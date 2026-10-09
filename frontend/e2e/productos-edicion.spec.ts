import { expect, test as base, type Page, type Route } from '@playwright/test';

// Edición de productos (FS-07). Todas las llamadas API se interceptan con un servidor simulado
// en memoria por prueba que aplica la misma regla de versión que el backend real.
// Valida la interfaz y el contrato del payload; no contacta ni modifica el backend publicado.

const tenant = { id: 'tenant-prod-e2e', nombreComercial: 'Ferretería de prueba', colorPrimario: '#EA580C' };
const admin = { id: 'user-ADMIN', nombre: 'Administrador de prueba', email: 'usuario@prueba.invalid', rol: 'ADMIN' };

type Producto = Record<string, any>;
type Sim = {
  productos: Producto[];
  puts: { id: string; body: any }[];
  historial: string[];
  fallarSiguientePut: boolean;
  errores: string[];
  inesperados: string[];
  listados: number;
};

const productoBase = (partial: Partial<Producto>): Producto => ({
  id: crypto.randomUUID(), codigo: 'CAB-1', nombre: 'Cable metro', codigoBarras: '7701234', codigoFabricante: null,
  descripcion: 'Rollo', marca: 'Truper', categoria: { id: 'c1', nombre: 'Electricidad' }, categoriaId: 'c1',
  unidadMedida: 'METRO', usaMedida: true, precioVenta: 12.5, precioCosto: 8, margen: null,
  stockActual: 40, stockReservado: 0, stockDisponible: 40, stockMinimo: 5, activo: true, imagenUrl: null, version: 1,
  ...partial,
});

const test = base.extend<{ sim: Sim }>({
  sim: [async ({ page, baseURL }, use) => {
    const sim: Sim = { productos: [], puts: [], historial: [], fallarSiguientePut: false, errores: [], inesperados: [], listados: 0 };
    const origen = new URL(baseURL!).origin;
    const cabeceras = { 'access-control-allow-origin': origen, 'access-control-allow-credentials': 'true' };
    page.on('pageerror', e => sim.errores.push(e.message));

    const responder = (route: Route, status: number, body: unknown) => route.fulfill({ status, json: body, headers: cabeceras });

    await page.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname.startsWith('/api/')) {
        const method = request.method();
        const path = url.pathname.slice(4);
        if (method === 'OPTIONS') { await route.fulfill({ status: 204, headers: { ...cabeceras, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } }); return; }
        if (method === 'GET' && path === '/tenant/settings') return responder(route, 200, tenant);
        if (method === 'GET' && path === '/auth/me') return responder(route, 200, { user: { sub: admin.id, tenantId: tenant.id, rol: 'ADMIN', permisos: ['inventario.editar', 'inventario.ver'], descuentoMaximo: 0 } });
        if (method === 'POST' && path === '/auth/login') return responder(route, 200, { type: 'tenant', accessToken: 'prod-e2e-token', user: admin, tenant });
        const lecturasVacias: Record<string, unknown> = {
          '/dashboard': { ventasDelDia: { total: 0 }, alertasStock: { items: [] }, cotizacionesPendientes: { cantidad: 0 } },
          '/maintenance/backup': { configured: false }, '/productos/comercial': [], '/clientes': [],
          '/operaciones/proveedores': [], '/operaciones/caja': [], '/operaciones/solicitudes-devolucion': [], '/operaciones/auditoria': [],
        };
        if (method === 'GET' && path in lecturasVacias) return responder(route, 200, lecturasVacias[path]);

        if (method === 'GET' && path === '/productos') {
          sim.listados++;
          const incluir = url.searchParams.get('incluirInactivos') === 'true';
          return responder(route, 200, sim.productos.filter(p => incluir || p.activo));
        }
        const historial = path.match(/^\/operaciones\/productos\/([^/]+)\/historial$/);
        if (method === 'GET' && historial) { sim.historial.push(historial[1]); return responder(route, 200, { movimientos: [], costos: [] }); }

        const producto = path.match(/^\/productos\/([^/]+)$/);
        if (method === 'PUT' && producto) {
          const body = request.postDataJSON();
          sim.puts.push({ id: producto[1], body });
          if (sim.fallarSiguientePut) { sim.fallarSiguientePut = false; await route.abort(); return; }
          const actual = sim.productos.find(p => p.id === producto[1]);
          if (!actual) return responder(route, 404, { message: 'Producto no encontrado' });
          if (body.version !== actual.version) {
            return responder(route, 409, { message: 'El producto fue modificado por otro usuario. Recargue la información antes de guardar.', code: 'PRODUCTO_VERSION', versionActual: actual.version });
          }
          const { version, motivo, ...cambios } = body;
          Object.assign(actual, cambios, { version: actual.version + 1 });
          return responder(route, 200, actual);
        }
        sim.inesperados.push(`${method} ${path}`);
        await route.abort(); return;
      }
      if (url.origin === origen) await route.continue();
      else await route.abort();
    });

    await use(sim);
    expect(sim.errores, 'La interfaz no debe lanzar errores de JavaScript').toEqual([]);
    expect(sim.inesperados, 'No debe haber peticiones API fuera del servidor simulado').toEqual([]);
  }, { auto: true }],
});

async function ingresarAInventario(page: Page) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill('usuario@prueba.invalid');
  await page.locator('input[type="password"]').fill('solo-para-esta-prueba');
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
  await expect(page.getByRole('heading', { name: 'Administrar el negocio', exact: true })).toBeVisible();
  await page.goto('/inventario');
  await expect(page.getByRole('heading', { name: 'Administrar producto y revisar movimientos', exact: true })).toBeVisible();
}

async function selectorProducto(page: Page) {
  // La etiqueta envuelve al select y su nombre accesible incluye todas las opciones: se localiza por la sección.
  return page.locator('section').filter({ has: page.getByRole('heading', { name: 'Administrar producto y revisar movimientos', exact: true }) }).locator('select').first();
}

async function elegirProducto(page: Page, id: string) {
  await (await selectorProducto(page)).selectOption(id);
  await expect(page.getByLabel('Nombre y variante', { exact: true })).toHaveValue(/.+/);
}

test.describe('Edición de productos (FS-07)', () => {
  test('una edición parcial envía solo el nombre y la versión, sin tocar existencias ni precios', async ({ page, sim }) => {
    const cable = productoBase({});
    sim.productos.push(cable);
    await ingresarAInventario(page);
    await elegirProducto(page, cable.id);
    await page.getByLabel('Nombre y variante', { exact: true }).fill('Cable metro reforzado');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Producto guardado' })).toBeVisible();
    expect(sim.puts).toHaveLength(1);
    expect(Object.keys(sim.puts[0].body).sort()).toEqual(['nombre', 'version']);
    expect(sim.puts[0].body).toEqual({ nombre: 'Cable metro reforzado', version: 1 });
    expect(sim.productos[0]).toMatchObject({ nombre: 'Cable metro reforzado', stockActual: 40, precioVenta: 12.5, version: 2 });
  });

  test('cambiar costo pide confirmación; cancelar no envía nada y aceptar envía el costo', async ({ page, sim }) => {
    const cable = productoBase({});
    sim.productos.push(cable);
    await ingresarAInventario(page);
    await elegirProducto(page, cable.id);
    await page.getByLabel(/^Costo vigente/).fill('9');

    page.once('dialog', d => { expect(d.message()).toContain('Costo vigente'); void d.dismiss(); });
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await page.waitForTimeout(100);
    expect(sim.puts).toHaveLength(0);

    page.once('dialog', d => d.accept());
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Producto guardado' })).toBeVisible();
    expect(sim.puts[0].body).toEqual({ precioCosto: 9, version: 1 });
  });

  test('si otro usuario cambió el producto, el servidor rechaza la edición, no sobrescribe y recarga la lista', async ({ page, sim }) => {
    const cable = productoBase({});
    sim.productos.push(cable);
    await ingresarAInventario(page);
    const listadosAntes = sim.listados;
    await elegirProducto(page, cable.id);
    // Otro usuario guarda un cambio mientras este formulario está abierto.
    cable.version = 2; cable.nombre = 'Cambio de otro usuario';
    await page.getByLabel('Nombre y variante', { exact: true }).fill('Mi cambio');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Otro usuario modificó este producto' })).toBeVisible();
    expect(cable.nombre).toBe('Cambio de otro usuario');
    expect(sim.listados).toBeGreaterThan(listadosAntes);
  });

  test('un doble clic en Guardar envía una sola edición', async ({ page, sim }) => {
    const cable = productoBase({});
    sim.productos.push(cable);
    await ingresarAInventario(page);
    await elegirProducto(page, cable.id);
    await page.getByLabel('Nombre y variante', { exact: true }).fill('Doble clic');
    const guardar = page.getByRole('button', { name: 'Guardar cambios' });
    await guardar.dblclick();
    await expect(page.getByRole('status').filter({ hasText: 'Producto guardado' })).toBeVisible();
    expect(sim.puts).toHaveLength(1);
  });

  test('un fallo de red no pierde el formulario y el reintento usa la misma versión', async ({ page, sim }) => {
    const cable = productoBase({});
    sim.productos.push(cable);
    await ingresarAInventario(page);
    await elegirProducto(page, cable.id);
    await page.getByLabel(/^Marca/).fill('Stanley');
    sim.fallarSiguientePut = true;
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'No se guardó por un problema de conexión' })).toBeVisible();
    await expect(page.getByLabel(/^Marca/)).toHaveValue('Stanley');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Producto guardado' })).toBeVisible();
    expect(sim.puts.map(p => p.body.version)).toEqual([1, 1]);
    expect(sim.productos[0]).toMatchObject({ marca: 'Stanley', version: 2 });
  });

  test('cambiar existencias exige motivo antes de enviar', async ({ page, sim }) => {
    const cable = productoBase({});
    sim.productos.push(cable);
    await ingresarAInventario(page);
    await elegirProducto(page, cable.id);
    await page.getByLabel('Nuevas existencias', { exact: true }).fill('35');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Indique el motivo del cambio de existencias' })).toBeVisible();
    expect(sim.puts).toHaveLength(0);
    await page.getByLabel(/^Motivo del cambio de existencias/).fill('Merma verificada');
    page.once('dialog', d => d.accept());
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Producto guardado' })).toBeVisible();
    expect(sim.puts[0].body).toEqual({ stockActual: 35, motivo: 'Merma verificada', version: 1 });
  });

  test('reactivar un producto inactivo: se muestra al activar la opción y se envía activo=true tras confirmar', async ({ page, sim }) => {
    const inactivo = productoBase({ codigo: 'INA-1', nombre: 'Llave vieja', activo: false });
    sim.productos.push(inactivo);
    await ingresarAInventario(page);
    await expect((await selectorProducto(page)).locator('option', { hasText: 'Llave vieja' })).toHaveCount(0);
    await page.getByLabel('Mostrar productos inactivos').check();
    await elegirProducto(page, inactivo.id);
    await page.getByRole('checkbox', { name: /Producto activo/ }).check();
    page.once('dialog', d => d.accept());
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Producto guardado' })).toBeVisible();
    expect(sim.puts[0].body).toEqual({ activo: true, version: 1 });
  });

  test('la edición cabe en un teléfono sin desbordamiento horizontal', async ({ page, sim }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const cable = productoBase({});
    sim.productos.push(cable);
    await ingresarAInventario(page);
    await elegirProducto(page, cable.id);
    const sinDesborde = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
    expect(sinDesborde).toBe(true);
    await expect(page.getByRole('button', { name: 'Guardar cambios' })).toBeVisible();
  });
});
