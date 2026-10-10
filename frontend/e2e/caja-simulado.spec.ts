import { expect, test as base, type Page, type Route } from '@playwright/test';

// E2E CON BACKEND SIMULADO: valida la interfaz de caja (apertura, movimiento autorizado, diferencia que exige
// explicación, comprobante, historial del administrador y reintentos con la misma solicitud).
// NO sustituye la persistencia: esa está en backend/test/caja.postgres.integration.ts contra PostgreSQL real.

const tenant = { id: 'tenant-caja-e2e', nombreComercial: 'Ferretería de prueba', colorPrimario: '#EA580C' };
const admin = { id: 'user-ADMIN', nombre: 'Administrador de prueba', email: 'usuario@prueba.invalid', rol: 'ADMIN' };

type Movimiento = { id: string; tipo: string; monto: number; metodo: string; concepto: string; referencia: string | null; created_at: string };
type CajaSim = { id: string; estado: 'ABIERTA' | 'CERRADA'; usuario_id: string; usuario_nombre: string; fecha_apertura: string; fecha_cierre: string | null; monto_apertura: number; monto_cierre_fisico: number | null; monto_esperado: number | null; diferencia: number | null; notas: string | null; movimientos: Movimiento[] };
type Sim = {
  cajas: CajaSim[];
  solicitudes: Map<string, { path: string; body: any; respuesta: any }>;
  posts: { path: string; solicitudId: string }[];
  fallarSiguienteApertura: boolean;
  errores: string[];
  inesperados: string[];
};

const efectivoEsperado = (c: CajaSim) => c.monto_apertura + c.movimientos.filter(m => m.metodo === 'EFECTIVO').reduce((s, m) => s + m.monto, 0);
const resumen = (c: CajaSim) => {
  const efectivo = c.movimientos.filter(m => m.metodo === 'EFECTIVO');
  const totales = Object.fromEntries(['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'CREDITO'].map(m => [m, c.movimientos.filter(x => x.metodo === m).reduce((s, x) => s + x.monto, 0)]));
  return {
    fondoInicial: c.monto_apertura,
    ingresosEfectivo: efectivo.filter(m => m.monto > 0).reduce((s, m) => s + m.monto, 0),
    egresosEfectivo: -efectivo.filter(m => m.monto < 0).reduce((s, m) => s + m.monto, 0),
    efectivoEsperado: efectivoEsperado(c),
    totalesPorMetodo: totales,
  };
};
const vista = (c: CajaSim) => ({ ...c, resumen: { ...resumen(c), ...(c.estado === 'CERRADA' ? { efectivoContado: c.monto_cierre_fisico, diferencia: c.diferencia } : {}) }, efectivoEsperado: efectivoEsperado(c), totales: resumen(c).totalesPorMetodo });

const test = base.extend<{ sim: Sim }>({
  sim: [async ({ page, baseURL }, use) => {
    const sim: Sim = { cajas: [], solicitudes: new Map(), posts: [], fallarSiguienteApertura: false, errores: [], inesperados: [] };
    const origen = new URL(baseURL!).origin;
    const cabeceras = { 'access-control-allow-origin': origen, 'access-control-allow-credentials': 'true' };
    page.on('pageerror', e => sim.errores.push(e.message));
    const responder = (route: Route, status: number, body: unknown) => route.fulfill({ status, json: body, headers: cabeceras });

    await page.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (!url.pathname.startsWith('/api/')) { if (url.origin === origen) await route.continue(); else await route.abort(); return; }
      const method = request.method();
      const path = url.pathname.slice(4);
      if (method === 'OPTIONS') { await route.fulfill({ status: 204, headers: { ...cabeceras, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } }); return; }
      if (method === 'GET' && path === '/tenant/settings') return responder(route, 200, tenant);
      if (method === 'GET' && path === '/auth/me') return responder(route, 200, { user: { sub: admin.id, tenantId: tenant.id, rol: 'ADMIN', permisos: [], descuentoMaximo: 0 } });
      if (method === 'POST' && path === '/auth/login') return responder(route, 200, { type: 'tenant', accessToken: 'caja-e2e-token', user: admin, tenant });
      const vacias: Record<string, unknown> = {
        '/dashboard': { ventasDelDia: { total: 0 }, alertasStock: { items: [] }, cotizacionesPendientes: { cantidad: 0 } },
        '/maintenance/backup': { configured: false }, '/productos/comercial': [], '/clientes': [], '/caja': [], '/operaciones/entregas': [],
        '/operaciones/solicitudes-devolucion': [], '/operaciones/auditoria': [],
      };
      if (method === 'GET' && path in vacias) return responder(route, 200, vacias[path]);
      if (method === 'GET' && path === '/operaciones/caja') return responder(route, 200, sim.cajas.filter(c => c.usuario_id === admin.id).map(vista));
      if (method === 'GET' && path === '/operaciones/caja/cierres') return responder(route, 200, sim.cajas.map(c => ({ ...c, efectivo_neto: c.movimientos.filter(m => m.metodo === 'EFECTIVO').reduce((s, m) => s + m.monto, 0) })));
      const detalle = path.match(/^\/operaciones\/caja\/([^/]+)$/);
      if (method === 'GET' && detalle) {
        const c = sim.cajas.find(x => x.id === detalle[1]);
        return c ? responder(route, 200, vista(c)) : responder(route, 404, { message: 'Caja no encontrada' });
      }
      if (method !== 'POST') { sim.inesperados.push(`${method} ${path}`); await route.abort(); return; }

      const body = request.postDataJSON();
      sim.posts.push({ path, solicitudId: body.solicitudId });
      // Un servidor aplica cada solicitud una sola vez; el reintento devuelve el mismo resultado.
      if (sim.solicitudes.has(body.solicitudId)) return responder(route, 201, sim.solicitudes.get(body.solicitudId)!.respuesta);

      if (path === '/operaciones/caja/abrir') {
        if (sim.fallarSiguienteApertura) { sim.fallarSiguienteApertura = false; await route.abort(); return; }
        const caja: CajaSim = { id: body.solicitudId, estado: 'ABIERTA', usuario_id: admin.id, usuario_nombre: admin.nombre, fecha_apertura: '2026-10-10T13:00:00Z', fecha_cierre: null, monto_apertura: body.monto, monto_cierre_fisico: null, monto_esperado: null, diferencia: null, notas: null, movimientos: [] };
        sim.cajas.push(caja);
        sim.solicitudes.set(body.solicitudId, { path, body, respuesta: caja });
        return responder(route, 201, caja);
      }
      const movimiento = path.match(/^\/operaciones\/caja\/([^/]+)\/movimientos$/);
      if (movimiento) {
        const c = sim.cajas.find(x => x.id === movimiento[1]);
        if (!c || c.estado !== 'ABIERTA') return responder(route, 409, { message: 'La caja está cerrada' });
        const signed = body.tipo === 'EGRESO_MANUAL' ? -body.monto : body.monto;
        if (signed < 0 && -signed > efectivoEsperado(c)) return responder(route, 409, { message: 'Efectivo insuficiente para esta salida' });
        const m: Movimiento = { id: body.solicitudId, tipo: body.tipo, monto: signed, metodo: 'EFECTIVO', concepto: body.concepto, referencia: body.referencia ?? null, created_at: '2026-10-10T13:10:00Z' };
        c.movimientos.push(m);
        sim.solicitudes.set(body.solicitudId, { path, body, respuesta: m });
        return responder(route, 201, m);
      }
      const cierre = path.match(/^\/operaciones\/caja\/([^/]+)\/cerrar$/);
      if (cierre) {
        const c = sim.cajas.find(x => x.id === cierre[1]);
        if (!c) return responder(route, 404, { message: 'Caja no encontrada' });
        const esperado = efectivoEsperado(c);
        const diferencia = Math.round((body.monto - esperado) * 100) / 100;
        if (diferencia !== 0 && !body.notas) return responder(route, 400, { message: 'Explique la diferencia de caja antes de cerrar' });
        Object.assign(c, { estado: 'CERRADA', fecha_cierre: '2026-10-10T20:00:00Z', monto_cierre_fisico: body.monto, monto_esperado: esperado, diferencia, notas: body.notas ?? null });
        sim.solicitudes.set(body.solicitudId ?? `cierre-${c.id}`, { path, body, respuesta: vista(c) });
        return responder(route, 201, c);
      }
      sim.inesperados.push(`POST ${path}`);
      await route.abort();
    });

    await use(sim);
    expect(sim.errores, 'La interfaz no debe lanzar errores de JavaScript').toEqual([]);
    expect(sim.inesperados, 'No debe haber peticiones API fuera del backend simulado').toEqual([]);
  }, { auto: true }],
});

async function ingresar(page: Page, ruta: string) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill('usuario@prueba.invalid');
  await page.locator('input[type="password"]').fill('solo-para-esta-prueba');
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
  await expect(page.getByRole('heading', { name: 'Administrar el negocio', exact: true })).toBeVisible();
  await page.goto(ruta);
}

test.describe('Caja y arqueo — interfaz con backend simulado (E2E simulado)', () => {
  test('abrir caja, registrar una salida autorizada y ver el efectivo esperado', async ({ page, sim }) => {
    await ingresar(page, '/arqueo-caja');
    await expect(page.getByRole('heading', { name: 'Abrir mi caja' })).toBeVisible();
    await page.getByLabel('Fondo inicial').fill('1000');
    await page.getByRole('button', { name: 'Abrir caja' }).click();
    await expect(page.getByRole('heading', { name: 'Resumen del turno' })).toBeVisible();
    await expect(page.locator('.cash-expected')).toContainText('1,000');

    await page.getByLabel('Tipo').selectOption('EGRESO_MANUAL');
    await page.getByLabel('Monto').fill('200');
    await page.getByLabel('Concepto').fill('Pago de mensajería');
    await page.getByRole('button', { name: 'Registrar movimiento' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Movimiento registrado.' })).toBeVisible();
    await expect(page.locator('.cash-expected')).toContainText('800');
    await expect(page.getByRole('cell', { name: 'Pago de mensajería' })).toBeVisible();
  });

  test('una diferencia al cerrar exige explicación antes de confirmar; el comprobante muestra el resultado', async ({ page, sim }) => {
    await ingresar(page, '/arqueo-caja');
    await page.getByLabel('Fondo inicial').fill('500');
    await page.getByRole('button', { name: 'Abrir caja' }).click();
    await expect(page.getByRole('heading', { name: 'Cierre de caja' })).toBeVisible();

    await page.getByLabel('Efectivo contado').fill('480');
    await expect(page.getByText(/Faltante L\. 20\.00/)).toBeVisible();
    const explicacion = page.getByLabel('Explique la diferencia');
    await expect(explicacion).toBeVisible();
    await expect(explicacion).toHaveAttribute('required', '');

    page.once('dialog', d => void d.dismiss());
    await explicacion.fill('Cambio mal dado');
    await page.getByRole('button', { name: 'Cerrar caja' }).click();
    await page.waitForTimeout(150);
    expect(sim.cajas[0].estado).toBe('ABIERTA');

    page.once('dialog', d => d.accept());
    await page.getByRole('button', { name: 'Cerrar caja' }).click();
    await expect.poll(() => sim.cajas[0].estado).toBe('CERRADA');
    await expect(page.getByRole('heading', { name: 'Comprobante de cierre' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Comprobante de cierre' })).toContainText('Cambio mal dado');
    await expect(page.getByRole('button', { name: 'Imprimir' })).toBeVisible();
  });

  test('si se pierde la respuesta de la apertura, el reintento usa la misma solicitud y no abre dos cajas', async ({ page, sim }) => {
    sim.fallarSiguienteApertura = true;
    await ingresar(page, '/arqueo-caja');
    await page.getByLabel('Fondo inicial').fill('300');
    await page.getByRole('button', { name: 'Abrir caja' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    // Mientras haya una operación pendiente, el formulario queda bloqueado y solo se reenvía la misma solicitud.
    await expect(page.getByRole('button', { name: 'Abrir caja' })).toBeDisabled();
    await page.getByRole('button', { name: 'Reintentar operación pendiente' }).click();
    await expect(page.getByRole('heading', { name: 'Resumen del turno' })).toBeVisible();
    const aperturas = sim.posts.filter(p => p.path === '/operaciones/caja/abrir');
    expect(aperturas).toHaveLength(2);
    expect(aperturas[0].solicitudId).toBe(aperturas[1].solicitudId);
    expect(sim.cajas).toHaveLength(1);
  });

  test('el administrador ve los cierres de todos los cajeros de la empresa', async ({ page, sim }) => {
    sim.cajas.push({ id: 'caja-ajena', estado: 'CERRADA', usuario_id: 'otro', usuario_nombre: 'Cajera Lucía', fecha_apertura: '2026-10-09T13:00:00Z', fecha_cierre: '2026-10-09T20:00:00Z', monto_apertura: 500, monto_cierre_fisico: 470, monto_esperado: 500, diferencia: -30, notas: 'Faltante', movimientos: [] });
    await ingresar(page, '/arqueo-caja');
    await expect(page.getByRole('heading', { name: 'Cierres de la empresa' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Cajera Lucía' })).toBeVisible();
    await expect(page.getByRole('cell', { name: /Faltante L\. 30\.00/ })).toBeVisible();
    await page.getByRole('button', { name: 'Ver' }).click();
    await expect(page.getByRole('region', { name: 'Comprobante de cierre' })).toContainText('Faltante');
  });
});
