import { createHash } from 'node:crypto';
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
  conciliaciones: { mantenerItemId: string; token: string; cantidadManual?: number }[];
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
      conciliaciones: [], aplicarTokens: [], fallarSiguiente: new Set(), errores: [], inesperados: [],
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
          const conflictivos = l.items.filter(i => i.conflicto);
          const token = createHash('sha256').update(JSON.stringify(conflictivos.map(i => [i.id, i.version, i.cantidad]))).digest('hex');
          if (method === 'GET' && resto === 'conflictos') return responder(route, 200, conflictivos.length ? [{key:'QA-CABLE',token,items:conflictivos}] : []);
          if (method === 'POST' && resto === 'conciliar') {
            sim.conciliaciones.push(body);
            if (body.token !== token) return responder(route, 409, {code:'CONTEO_CONFLICTO_VERSION',message:'Los conteos del conflicto cambiaron; recargue y revise las cantidades antes de conciliar'});
            const elegido = conflictivos.find(i => i.id === body.mantenerItemId);
            if (!elegido) return responder(route, 404, {message:'Ítem en conflicto no encontrado'});
            l.items = l.items.filter(i => !i.conflicto || i.id === elegido.id);
            Object.assign(elegido, {conflicto:false, version:elegido.version+1, cantidad:body.cantidadManual ?? elegido.cantidad});
            return responder(route, 201, elegido);
          }
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


test('QA-INV-004: conciliación muestra el nombre del contador y conserva su identificador',async({page,sim})=>{
 // La respuesta simulada replica el contrato del backend: contador resuelto dentro de la empresa.
 const ana='ce4833d4-b09c-4eb3-a233-271a10211640';
 const luis='0b9c1f2e-7d1a-4f8e-9a3b-2c5d6e7f8a9b';
 const retirado='5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d';
 sim.levantamientos.push({id:'qa-lev',nombre:'Conflicto QA',estado:'EN_PROGRESO',aplicadoAt:null,items:[
  itemBase({id:'qa-item',descripcion:'Cable',cantidad:4,contadorId:ana,contador:{id:ana,nombre:'Ana Pérez',estado:'ACTIVO'},conflicto:true}),
  itemBase({id:'qa-item-2',descripcion:'Cable',cantidad:6,contadorId:luis,contador:{id:luis,nombre:'Luis Ortega',estado:'DESACTIVADO'},conflicto:true}),
  itemBase({id:'qa-item-3',descripcion:'Cable',cantidad:7,contadorId:retirado,contador:{id:retirado,nombre:null,estado:'NO_DISPONIBLE'},conflicto:true}),
 ]});
 await ingresar(page); await page.getByRole('button',{name:/Conflicto QA/}).click();
 const panel=page.locator('section').filter({has:page.getByRole('heading',{name:'Conflictos pendientes'})});
 await expect(panel.getByRole('cell').filter({hasText:'Ana Pérez'})).toBeVisible();
 await expect(panel.getByRole('cell').filter({hasText:'Luis Ortega (desactivado)'})).toBeVisible();
 await expect(panel.getByRole('cell').filter({hasText:'Usuario no disponible'})).toBeVisible();
 await expect(panel.getByText(ana)).toHaveCount(1);
 await expect(panel.getByText(retirado)).toHaveCount(1);
 await page.screenshot({path:'test-results/qa-conflictos-nombre.png',fullPage:true});
});

for (const width of [1280, 390]) {
  test(`QA-INV-002: conciliación obsoleta recarga 12 y exige nueva decisión; doble clic (${width}px, API simulada)`, async ({ page, sim }) => {
    await page.setViewportSize({ width, height: 900 });
    const a = itemBase({ id: 'qa-a', descripcion: 'Cable', cantidad: 3, conflicto: true, contador: { nombre: 'Ana', estado: 'ACTIVO' } });
    const b = itemBase({ id: 'qa-b', descripcion: 'Cable', cantidad: 4, conflicto: true, contadorId: otroUsuario, contador: { nombre: 'Luis', estado: 'ACTIVO' } });
    const l = { id: 'qa-lev', nombre: 'Conflicto QA', estado: 'EN_PROGRESO', aplicadoAt: null, items: [a, b] };
    sim.levantamientos.push(l);
    await ingresar(page);
    await page.getByRole('button', { name: /Conflicto QA/ }).click();
    const panel = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Conflictos pendientes' }) });
    await expect(panel.getByRole('button', { name: 'Conservar este (4)', exact: true })).toBeVisible();
    await panel.getByRole('spinbutton').first().fill('8');
    Object.assign(b, { cantidad: 12, version: 2 }); // Otro empleado cambia el servidor después de cargar la pantalla.
    await panel.getByRole('button', { name: 'Conservar este (3)', exact: true }).click();
    await expect(panel.getByRole('alert')).toContainText('Los conteos del conflicto cambiaron');
    await expect(panel.getByRole('button', { name: 'Conservar este (12)', exact: true })).toBeVisible();
    await expect(panel.getByRole('spinbutton').first()).toHaveValue('');
    expect(sim.conciliaciones).toHaveLength(1);
    expect(l.items).toHaveLength(2);
    await panel.getByRole('button', { name: 'Conservar este (12)', exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
    await expect(page.getByRole('heading', { name: 'Conflictos pendientes' })).toHaveCount(0);
    expect(sim.conciliaciones).toHaveLength(2);
    expect(sim.conciliaciones[1].token).not.toBe(sim.conciliaciones[0].token);
    expect(sim.conciliaciones[1].mantenerItemId).toBe(b.id);
    expect(l.items.map(i => [i.id, i.cantidad])).toEqual([[b.id, 12]]);
  });
}
