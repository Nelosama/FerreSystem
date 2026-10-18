import { installScannerCamera } from './scanner-camera.fixture';
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

  // P2 (consolidación KARDEX): el conteo no captura, lee ni muestra costos, precios o márgenes; registra existencias
  // y responsable; y la aplicación envía solo el token de la vista previa, nunca datos comerciales.
  test('conteo sin precios: sin campos ni datos comerciales en pantalla, responsable registrado y aplicación solo con el token', async ({ page, sim }) => {
    await ingresar(page);
    await crearLevantamiento(page, 'Conteo sin precios');
    for (const etiqueta of ['Costo', 'Precio de venta', 'Margen %']) {
      await expect(page.getByLabel(etiqueta, { exact: true })).toHaveCount(0);
    }
    // Vista previa como la devuelve el servidor de #140: solo identidad, existencias y token; sin precios ni advertencias.
    await page.route('**/api/levantamientos/*/preview', async route => {
      const item = sim.levantamientos[0].items[0];
      await route.fulfill({
        status: 200,
        json: {
          estado: 'FINALIZADO', aplicadoAt: null, token: 'tok-p2',
          rows: [{ item, productoId: 'prod-cable', codigo: 'CABLE', nombre: 'Cable metro', anterior: 8, nuevo: 9, errores: [], conflicto: false, contadorId: admin.id }],
        },
        headers: { 'access-control-allow-origin': new URL(page.url()).origin, 'access-control-allow-credentials': 'true' },
      });
    });

    const itemEnviado = page.waitForRequest(r => r.method() === 'POST' && /\/levantamientos\/[^/]+\/items$/.test(new URL(r.url()).pathname));
    await contar(page, { descripcion: 'Cable metro', cantidad: '9', codigo: 'CABLE' });
    await page.getByRole('button', { name: 'Guardar y siguiente' }).click();
    const cuerpo = (await itemEnviado).postDataJSON();
    expect(cuerpo).toMatchObject({ descripcion: 'Cable metro', cantidad: 9 });
    for (const campo of ['precioCosto', 'precioVenta', 'margen']) expect(cuerpo).not.toHaveProperty(campo);
    await expect(page.getByRole('status').filter({ hasText: 'Guardado: Cable metro' })).toBeVisible();
    const registrado = sim.levantamientos[0].items.find(i => i.descripcion === 'Cable metro');
    expect([Number(registrado.cantidad), registrado.contadorId]).toEqual([9, admin.id]);

    page.once('dialog', d => d.accept());
    await page.getByRole('button', { name: 'Finalizar conteo' }).click();
    await expect(page.getByRole('heading', { name: /FINALIZADO/ })).toBeVisible();
    await page.getByRole('button', { name: 'Revisar impacto en inventario' }).click();
    await expect(page.getByRole('cell', { name: 'CABLE · Cable metro', exact: true })).toBeVisible();
    await expect(page.getByText(/no se aplica|Costo contado|Precio contado|Margen contado/)).toHaveCount(0);

    const aplicacion = page.waitForRequest(r => r.method() === 'POST' && r.url().endsWith('/aplicar'));
    page.once('dialog', d => d.accept());
    await page.getByRole('button', { name: 'Aplicar al inventario' }).click();
    expect((await aplicacion).postDataJSON()).toEqual({ token: 'tok-p2' });
    await expect(page.getByText('Aplicado al inventario el')).toBeVisible();
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

// Camera APIs are simulated. These cases do not establish Safari/iPhone acceptance.
async function cameraState(page: Page) {
  return page.evaluate(() => {
    const s = (window as any).scannerCamera;
    return { requests: s.requests, stops: s.stops, detections: s.detections, constraints: s.constraints };
  });
}
const scannerStart = (page: Page) => page.getByRole('button', { name: 'Leer código con cámara', exact: true });
const scannerStop = (page: Page) => page.getByRole('button', { name: 'Detener escáner', exact: true });

test('cámara: aperturas repetidas, cierre manual y alternativa enfocada sin alterar inventario', async ({ page, sim }) => {
  await installScannerCamera(page); await page.setViewportSize({ width: 390, height: 844 });
  await ingresar(page); await crearLevantamiento(page);
  for (let i = 0; i < 3; i++) {
    await scannerStart(page).click();
    await expect(page.getByText('Apunte al código y mantenga el teléfono estable.')).toBeVisible();
    await expect(page.locator('video')).toHaveJSProperty('playsInline', true);
    await expect(page.locator('video')).toHaveJSProperty('muted', true);
    if (i === 0) {
      const bounds = await page.locator('video').boundingBox();
      expect(bounds!.width).toBeGreaterThan(250); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
      await page.locator('.barcode-scanner').screenshot({ path: 'test-results/scanner-390.png' });
    }
    await scannerStop(page).click();
    await expect(page.locator('video')).toHaveCount(0);
  }
  await scannerStart(page).click();
  await page.getByRole('button', { name: 'Introducir código manualmente' }).click();
  await expect(page.getByLabel('Buscar por código, descripción o categoría')).toBeFocused();
  await expect(page.locator('video')).toHaveCount(0);
  const state = await cameraState(page);
  expect(state.requests).toBe(4); expect(state.stops).toBe(4);
  expect(state.constraints[0]).toMatchObject({ audio: false, video: { facingMode: { ideal: 'environment' } } });
  expect(sim.postsItem).toEqual([]); expect(sim.aplicarTokens).toEqual([]);
});

test('cámara: lecturas consecutivas, desconocido y sin duplicados ni guardado automático', async ({ page, sim }) => {
  await installScannerCamera(page); await ingresar(page); await crearLevantamiento(page);
  const searches: string[] = [];
  await page.route('**/api/productos?**', async route => {
    const code = new URL(route.request().url()).searchParams.get('search')!;
    searches.push(code);
    await route.fulfill({ json: code === 'UNKNOWN-128' ? [] : [{ id: code, codigo: code, codigoBarras: code, nombre: `Producto ${code}`, unidadMedida: 'UNIDAD', stockActual: 7 }] });
  });
  for (const code of ['5901234123457', '96385074', 'UNKNOWN-128']) {
    await page.evaluate(code => { (window as any).scannerCamera.code = code; }, code);
    await scannerStart(page).click();
    await expect(page.getByText(`Código leído: ${code}`, { exact: true })).toBeVisible();
    await expect(page.locator('video')).toHaveCount(0);
    if (code === 'UNKNOWN-128') await expect(page.getByText(/Código de barras no registrado/)).toBeVisible();
    else await expect(page.getByText(`Producto ${code}`, { exact: true })).toBeVisible();
    await expect(scannerStart(page)).toBeEnabled();
  }
  expect(searches).toEqual(['5901234123457', '96385074', 'UNKNOWN-128']);
  expect((await cameraState(page)).stops).toBe(3);
  expect(sim.postsItem).toEqual([]); expect(sim.aplicarTokens).toEqual([]);
  await expect(page).toHaveURL(/levantamiento/);
});

test('cámara: permiso denegado conserva sesión y búsqueda manual', async ({ page, sim }) => {
  await installScannerCamera(page); await ingresar(page); await crearLevantamiento(page);
  await page.evaluate(() => { (window as any).scannerCamera.denied = true; });
  await scannerStart(page).click();
  await expect(page.getByRole('alert')).toContainText('Permiso de cámara denegado');
  expect((await cameraState(page)).requests).toBe(1);
  await page.getByRole('button', { name: 'Introducir código manualmente' }).click();
  await page.getByLabel('Buscar por código, descripción o categoría').fill('MANUAL-1');
  await page.getByRole('button', { name: 'Buscar producto', exact: true }).click();
  await expect(page.getByText('Producto no encontrado. Revise el código o nombre e intente de nuevo.')).toBeVisible();
  expect(sim.postsItem).toEqual([]); await expect(page).toHaveURL(/levantamiento/);
});

test('cámara: pista interrumpida, segundo plano, BFCache y navegación liberan recursos', async ({ page, sim }) => {
  await installScannerCamera(page); await ingresar(page); await crearLevantamiento(page);
  await scannerStart(page).click(); await expect(page.getByText('Apunte al código y mantenga el teléfono estable.')).toBeVisible();
  await page.evaluate(() => { (window as any).scannerCamera.endTrack(); });
  await expect(page.getByRole('alert')).toContainText('Se interrumpió la cámara');
  await scannerStart(page).click(); await expect(page.locator('video')).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('video')).toHaveCount(0); expect((await cameraState(page)).requests).toBe(2);
  await scannerStart(page).click(); await expect(page.locator('video')).toBeVisible();
  await page.evaluate(() => { window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })); window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); });
  await expect(page.locator('video')).toHaveCount(0); expect((await cameraState(page)).requests).toBe(3);
  await scannerStart(page).click(); await expect(page.getByText('Apunte al código y mantenga el teléfono estable.')).toBeVisible();
  await page.locator('a[href="/"]').first().click();
  await expect(page.locator('video')).toHaveCount(0);
  await expect.poll(async () => (await cameraState(page)).stops).toBe(4);
  expect(sim.postsItem).toEqual([]); expect(sim.aplicarTokens).toEqual([]);
});

test('cámara: cerrar y reabrir mientras espera permiso no repite getUserMedia', async ({ page }) => {
  await installScannerCamera(page); await ingresar(page); await crearLevantamiento(page);
  await page.evaluate(() => { (window as any).scannerCamera.pending = true; });
  await scannerStart(page).click(); await scannerStop(page).click(); await scannerStart(page).click();
  expect((await cameraState(page)).requests).toBe(1);
  await page.evaluate(() => { (window as any).scannerCamera.resolveCamera(); });
  await expect(page.getByText('Apunte al código y mantenga el teléfono estable.')).toBeVisible();
  expect((await cameraState(page)).stops).toBe(0);
  await page.keyboard.press('Escape'); await expect(page.locator('video')).toHaveCount(0);
  expect((await cameraState(page)).stops).toBe(1);
});

test('cámara: sin BarcodeDetector carga ZXing y lee EAN-13 con canvas real', async ({ page, sim }) => {
  await installScannerCamera(page, true); await ingresar(page); await crearLevantamiento(page);
  await scannerStart(page).click();
  await expect(page.getByText('Código leído: 5901234123457', { exact: true })).toBeVisible();
  await expect(page.getByText(/Código de barras no registrado/)).toBeVisible();
  await expect(page.locator('video')).toHaveCount(0);
  expect((await cameraState(page)).stops).toBe(1); expect(sim.postsItem).toEqual([]);
});
