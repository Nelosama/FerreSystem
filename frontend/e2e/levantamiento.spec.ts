import { expect, test as base, type Page, type Route } from '@playwright/test';

// Recorrido del levantamiento de inventario (FS-06 fase 2).
// Todas las llamadas API se interceptan con un servidor simulado en memoria por prueba.
// Solo prueba la interfaz: no contacta el backend ni modifica datos reales.

const tenant = { id: 'tenant-lev-e2e', nombreComercial: 'Ferretería de prueba', colorPrimario: '#EA580C' };
const admin = { id: 'user-ADMIN', nombre: 'Administrador de prueba', email: 'usuario@prueba.invalid', rol: 'ADMIN' };
const otroUsuario = 'user-otro-empleado';

type Item = Record<string, any>;
type Levantamiento = { id: string; nombre: string; estado: string; aplicadoAt: string | null; items: Item[] };
type Sim = {
  levantamientos: Levantamiento[];
  solicitudesLev: Map<string, string>;
  solicitudesItem: Map<string, string>;
  postsItem: string[];
  postsLev: string[];
  aplicarTokens: string[];
  fallarSiguiente: Set<'lev' | 'item'>;
  errores: string[];
  inesperados: string[];
};

const itemBase = (partial: Partial<Item>): Item => ({
  id: crypto.randomUUID(), productoId: null, descripcion: '', cantidad: 1, unidad: 'UNIDAD',
  codigo: null, codigoBarras: null, marca: null, categoria: null, ubicacion: null,
  precioCosto: null, precioVenta: null, margen: null, notas: null, contadorId: admin.id,
  conflicto: false, version: 1, ...partial,
});

const test = base.extend<{ sim: Sim }>({
  sim: [async ({ page, baseURL }, use) => {
    const sim: Sim = {
      levantamientos: [], solicitudesLev: new Map(), solicitudesItem: new Map(), postsItem: [], postsLev: [],
      aplicarTokens: [], fallarSiguiente: new Set(), errores: [], inesperados: [],
    };
    const origen = new URL(baseURL!).origin;
    page.on('pageerror', e => sim.errores.push(e.message));

    const responder = async (route: Route, status: number, body: unknown) => {
      await route.fulfill({ status, json: body, headers: { 'access-control-allow-origin': origen, 'access-control-allow-credentials': 'true' } });
    };
    const buscarLev = (id: string) => sim.levantamientos.find(l => l.id === id);

    await page.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname.startsWith('/api/')) {
        const method = request.method();
        const path = url.pathname.slice(4);
        const body = request.postDataJSON?.() ?? {};
        if (method === 'OPTIONS') { await route.fulfill({ status: 204, headers: { 'access-control-allow-origin': origen, 'access-control-allow-credentials': 'true', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } }); return; }

        const lev = path.match(/^\/levantamientos\/([^/]+)(?:\/(.*))?$/);
        if (method === 'GET' && path === '/tenant/settings') return responder(route, 200, tenant);
        if (method === 'GET' && path === '/auth/me') return responder(route, 200, { user: { sub: admin.id, tenantId: tenant.id, rol: 'ADMIN', permisos: ['inventario.editar', 'inventario.ver'], descuentoMaximo: 0 } });
        if (method === 'POST' && path === '/auth/login') return responder(route, 200, { type: 'tenant', accessToken: 'lev-e2e-token', user: admin, tenant });
        const lecturasVacias: Record<string, unknown> = {
          '/dashboard': { ventasDelDia: { total: 0 }, alertasStock: { items: [] }, cotizacionesPendientes: { cantidad: 0 } },
          '/maintenance/backup': { configured: false }, '/productos/comercial': [], '/productos': [], '/clientes': [],
          '/operaciones/proveedores': [], '/operaciones/caja': [], '/operaciones/solicitudes-devolucion': [], '/operaciones/auditoria': [],
        };
        if (method === 'GET' && path in lecturasVacias) return responder(route, 200, lecturasVacias[path]);

        if (path === '/levantamientos' && method === 'GET') return responder(route, 200, sim.levantamientos.map(l => ({ ...l, totalItems: l.items.length })));
        if (path === '/levantamientos' && method === 'POST') {
          sim.postsLev.push(body.solicitudId);
          if (sim.fallarSiguiente.delete('lev')) { await route.abort(); return; }
          const previo = sim.solicitudesLev.get(body.solicitudId);
          if (previo) return responder(route, 201, sim.levantamientos.find(l => l.id === previo));
          const nuevo: Levantamiento = { id: crypto.randomUUID(), nombre: body.nombre, estado: 'BORRADOR', aplicadoAt: null, items: [] };
          sim.levantamientos.push(nuevo); sim.solicitudesLev.set(body.solicitudId, nuevo.id);
          return responder(route, 201, nuevo);
        }
        if (lev) {
          const [, id, resto = ''] = lev;
          const l = buscarLev(id);
          if (!l) return responder(route, 404, { message: 'Levantamiento no encontrado' });
          if (method === 'GET' && resto === '') return responder(route, 200, l);
          if (method === 'GET' && resto === 'participantes') return responder(route, 200, []);
          if (method === 'GET' && resto === 'conflictos') return responder(route, 200, []);
          if (method === 'POST' && resto === 'heartbeat') return responder(route, 201, { ok: true });
          if (method === 'DELETE' && resto === 'heartbeat') return responder(route, 200, { ok: true });
          if (method === 'PATCH' && resto === '') { l.estado = body.estado; return responder(route, 200, l); }
          if (method === 'GET' && resto === 'preview') {
            const rows = l.items.map(i => ({ item: i, productoId: null, codigo: i.codigo || 'INTERNO-1', nombre: i.descripcion, anterior: 0, nuevo: i.cantidad, errores: [], conflicto: false, contadorId: i.contadorId }));
            return responder(route, 200, { estado: l.estado, aplicadoAt: l.aplicadoAt, rows, token: `tok-${l.items.length}-${l.items.map(i => i.cantidad).join('-')}` });
          }
          if (method === 'POST' && resto === 'aplicar') {
            sim.aplicarTokens.push(body.token);
            l.aplicadoAt = new Date().toISOString();
            return responder(route, 201, { aplicadoAt: l.aplicadoAt });
          }
          if (resto === 'items' && method === 'POST') {
            sim.postsItem.push(body.solicitudId);
            if (sim.fallarSiguiente.delete('item')) { await route.abort(); return; }
            const previo = sim.solicitudesItem.get(body.solicitudId);
            if (previo) return responder(route, 201, l.items.find(i => i.id === previo));
            const codigo = body.codigo?.trim().toUpperCase() || null;
            const duplicado = l.items.find(i => i.contadorId === admin.id && ((body.productoId && i.productoId === body.productoId) || (codigo && i.codigo === codigo)));
            if (duplicado) return responder(route, 409, { message: 'Este artículo ya está contado en este levantamiento. Edite el conteo anterior en lugar de capturarlo de nuevo.', code: 'CONTEO_DUPLICADO', itemId: duplicado.id });
            const otroContador = l.items.some(i => i.contadorId !== admin.id && i.codigo === codigo);
            const nuevo = itemBase({ ...body, codigo, contadorId: admin.id, conflicto: otroContador, id: crypto.randomUUID() });
            l.items.push(nuevo); sim.solicitudesItem.set(body.solicitudId, nuevo.id);
            l.estado = l.estado === 'BORRADOR' ? 'EN_PROGRESO' : l.estado;
            return responder(route, 201, nuevo);
          }
          const item = resto.match(/^items\/([^/]+)$/);
          if (item && method === 'PATCH') {
            const i = l.items.find(x => x.id === item[1]);
            if (!i) return responder(route, 404, { message: 'Item no encontrado' });
            Object.assign(i, body, { version: i.version + 1 });
            return responder(route, 200, i);
          }
          if (item && method === 'DELETE') { l.items = l.items.filter(x => x.id !== item[1]); return responder(route, 200, { success: true }); }
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

async function ingresar(page: Page) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill('usuario@prueba.invalid');
  await page.locator('input[type="password"]').fill('solo-para-esta-prueba');
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
  await expect(page.getByRole('heading', { name: 'Administrar el negocio', exact: true })).toBeVisible();
  await page.goto('/levantamiento');
}

async function crearLevantamiento(page: Page, nombre = 'Conteo bodega') {
  await page.getByLabel('Nombre del levantamiento', { exact: true }).fill(nombre);
  await page.getByRole('button', { name: 'Crear levantamiento' }).click();
  await expect(page.getByRole('heading', { name: 'Contar producto', exact: true })).toBeVisible();
}

async function contar(page: Page, datos: { descripcion: string; cantidad?: string; codigo?: string; marca?: string }) {
  await page.getByLabel('Descripción y variante', { exact: true }).fill(datos.descripcion);
  if (datos.cantidad) await page.getByLabel('Cantidad', { exact: true }).fill(datos.cantidad);
  if (datos.codigo) await page.getByLabel('Código interno o fabricante (opcional)', { exact: true }).fill(datos.codigo);
  if (datos.marca) await page.getByLabel('Marca', { exact: true }).fill(datos.marca);
}

test.describe('Levantamiento de inventario (FS-06 fase 2)', () => {
  test('crear levantamiento: un fallo de red conserva la clave y el reintento no duplica el levantamiento', async ({ page, sim }) => {
    await ingresar(page);
    sim.fallarSiguiente.add('lev');
    await page.getByLabel('Nombre del levantamiento', { exact: true }).fill('Conteo bodega');
    await page.getByRole('button', { name: 'Crear levantamiento' }).click();
    await expect(page.getByText('No se pudo guardar. Revise la conexión y reintente.')).toBeVisible();
    await page.getByRole('button', { name: 'Crear levantamiento' }).click();
    await expect(page.getByRole('heading', { name: 'Contar producto', exact: true })).toBeVisible();
    expect(sim.postsLev).toHaveLength(2);
    expect(sim.postsLev[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(sim.postsLev[1]).toBe(sim.postsLev[0]);
    expect(sim.levantamientos).toHaveLength(1);
  });

  test('contar: un envío perdido queda pendiente, se confirma sin duplicar y el guardado es visible', async ({ page, sim }) => {
    await ingresar(page);
    await crearLevantamiento(page);
    sim.fallarSiguiente.add('item');
    await contar(page, { descripcion: 'Tornillo 1/4', cantidad: '12', codigo: 'TOR-14' });
    await page.getByRole('button', { name: 'Guardar y siguiente' }).click();
    await expect(page.getByText('Hay un conteo pendiente de confirmar')).toBeVisible();
    await page.getByRole('button', { name: 'Confirmar conteo pendiente' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Guardado: Tornillo 1/4 · 12 UNIDAD' })).toBeVisible();
    expect(sim.postsItem).toHaveLength(2);
    expect(sim.postsItem[1]).toBe(sim.postsItem[0]);
    expect(sim.levantamientos[0].items).toHaveLength(1);
  });

  test('advierte antes de guardar un artículo ya contado por el mismo empleado y permite editar el conteo anterior', async ({ page, sim }) => {
    await ingresar(page);
    await crearLevantamiento(page);
    const previo = itemBase({ descripcion: 'Tornillo 1/4', codigo: 'TOR-14', cantidad: 5 });
    sim.levantamientos[0].items.push(previo);
    await page.getByRole('button', { name: 'Actualizar' }).click();
    await contar(page, { descripcion: 'Tornillo 1/4', codigo: 'tor-14' });
    await expect(page.getByRole('alert').filter({ hasText: 'Este artículo ya está en el conteo.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Guardar y siguiente' })).toBeDisabled();
    await page.getByRole('button', { name: 'Editar conteo anterior' }).click();
    await expect(page.getByRole('heading', { name: 'Corregir conteo', exact: true })).toBeVisible();
    await expect(page.getByLabel('Cantidad', { exact: true })).toHaveValue('5');
    expect(sim.postsItem).toHaveLength(0);
  });

  test('avisa, sin bloquear, cuando otro empleado ya contó el artículo y registra el conflicto', async ({ page, sim }) => {
    await ingresar(page);
    await crearLevantamiento(page);
    sim.levantamientos[0].items.push(itemBase({ descripcion: 'Llave', codigo: 'CLV-9', cantidad: 7, contadorId: otroUsuario }));
    await page.getByRole('button', { name: 'Actualizar' }).click();
    await contar(page, { descripcion: 'Llave ajustable', cantidad: '3', codigo: 'CLV-9' });
    await expect(page.getByRole('status').filter({ hasText: 'Otro usuario ya contó este artículo' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Guardar y siguiente' })).toBeEnabled();
    await page.getByRole('button', { name: 'Guardar y siguiente' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Guardado: Llave ajustable · 3 UNIDAD' })).toBeVisible();
    expect(sim.levantamientos[0].items.find(i => i.descripcion === 'Llave ajustable')?.conflicto).toBe(true);
  });

  test('si otro dispositivo registró el artículo después de cargar la pantalla, el servidor rechaza el duplicado y muestra el motivo', async ({ page, sim }) => {
    await ingresar(page);
    await crearLevantamiento(page);
    // Otro dispositivo registra el artículo; esta pantalla todavía no lo conoce.
    sim.levantamientos[0].items.push(itemBase({ descripcion: 'Cinta métrica', codigo: 'CINTA-1', contadorId: admin.id }));
    await contar(page, { descripcion: 'Cinta métrica', cantidad: '4', codigo: 'CINTA-1' });
    await page.getByRole('button', { name: 'Guardar y siguiente' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Este artículo ya está contado en este levantamiento' })).toBeVisible();
    expect(sim.levantamientos[0].items.filter(i => i.codigo === 'CINTA-1')).toHaveLength(1);
    expect(Number(sim.levantamientos[0].items[0].cantidad)).toBe(1);
  });

  test('flujo completo: crear, contar con marca, finalizar, revisar impacto y aplicar', async ({ page, sim }) => {
    await ingresar(page);
    await crearLevantamiento(page, 'Conteo completo');
    await contar(page, { descripcion: 'Llave inglesa 10 mm', cantidad: '2', codigo: 'LLAVE-10', marca: 'Stanley' });
    await page.getByRole('button', { name: 'Guardar y siguiente' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Guardado: Llave inglesa 10 mm' })).toBeVisible();
    await contar(page, { descripcion: 'Cable metro', cantidad: '5' });
    await page.getByRole('button', { name: 'Guardar y siguiente' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Guardado: Cable metro' })).toBeVisible();

    page.once('dialog', d => d.accept());
    await page.getByRole('button', { name: 'Finalizar conteo' }).click();
    await expect(page.getByRole('heading', { name: /FINALIZADO/ })).toBeVisible();

    await page.getByRole('button', { name: 'Revisar impacto en inventario' }).click();
    await expect(page.getByRole('heading', { name: 'Vista previa de aplicación', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'LLAVE-10 · Llave inglesa 10 mm', exact: true })).toBeVisible();

    page.once('dialog', d => d.accept());
    await page.getByRole('button', { name: 'Aplicar al inventario' }).click();
    await expect(page.getByText('Aplicado al inventario el')).toBeVisible();
    expect(sim.aplicarTokens).toHaveLength(1);
    expect(sim.aplicarTokens[0]).toBe(`tok-2-2-5`);
  });
});

test.describe('Levantamiento en teléfono', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('la captura cabe en el ancho del teléfono y registra un producto sin fotografía', async ({ page, sim }) => {
    await ingresar(page);
    await crearLevantamiento(page, 'Conteo en piso');
    await contar(page, { descripcion: 'Clavo 2 pulgadas', cantidad: '10' });
    const sinDesbordeHorizontal = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
    expect(sinDesbordeHorizontal).toBe(true);
    await page.getByRole('button', { name: 'Guardar y siguiente' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Guardado: Clavo 2 pulgadas · 10 UNIDAD' })).toBeVisible();
    expect(sim.levantamientos[0].items[0].imagenUrl).toBeUndefined();
  });
});
