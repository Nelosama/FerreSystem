import { expect, test as base, type Page, type Route } from '@playwright/test';

// Arnés compartido de contingencia POS con backend simulado: intercepta /api y simula cortes, errores y respuestas colgadas.
// Solo prueba la interfaz y el sincronizador del navegador. La persistencia real del servidor está en PostgreSQL (backend/test).


export const tenant = { id: 'tenant-cont-sim', nombreComercial: 'Ferretería de contingencia', colorPrimario: '#EA580C' };
export const usuario = { id: 'cajero-sim', nombre: 'Cajero de prueba', email: 'cajero@prueba.invalid', rol: 'CAJERO' };
export const producto = { id: 'prod-1', codigo: 'TOR-1', nombre: 'Tornillo 2 pulgadas', codigoBarras: null, precioCentavos: 1000,
  libreCentesimas: 4000, cupoCentesimas: 2000, usaMedida: false, unidadMedida: 'UNIDAD' };
export const VIGENTE = new Date(Date.now() + 30 * 3_600_000).toISOString();

export type Sim = { retenerEnvio?: boolean; liberarEnvio?: () => void; formatoImpresion?: 'A4' | 'ROLLO_80MM' | 'ROLLO_58MM'; operacionesRecibidas: string[]; colgarPrimera: boolean; errores: string[]; sinRed: boolean; lotes: number[]; rechazarLotesDeVarias: boolean; fallosTemporales?: number };
// H-5: identificadores que el mock de la ventana emite, en orden.
export const EMITIDAS = Array.from({ length: 500 }, (_, i) => `00000000-0000-4000-8000-${(i + 1).toString(16).padStart(12, '0')}`);

export const test = base.extend<{ sim: Sim }>({
  sim: [async ({ page, baseURL }, use) => {
    const sim: Sim = { operacionesRecibidas: [], colgarPrimera: false, errores: [], sinRed: false, lotes: [], rechazarLotesDeVarias: false };
    const origen = new URL(baseURL!).origin;
    const cabeceras = { 'access-control-allow-origin': origen, 'access-control-allow-credentials': 'true' };
    page.on('pageerror', (e) => sim.errores.push(e.message));
    const responder = (route: Route, status: number, body: unknown) => route.fulfill({ status, json: body, headers: cabeceras });

    await page.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (!url.pathname.startsWith('/api/')) { if (url.origin === origen) await route.continue(); else await route.abort(); return; }
      const method = request.method();
      const path = url.pathname.slice(4);
      if (sim.sinRed) { await route.abort(); return; } // sin internet: ninguna llamada a la API llega
      if (method === 'OPTIONS') { await route.fulfill({ status: 204, headers: { ...cabeceras, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } }); return; }
      if (method === 'GET' && path === '/tenant/settings') return responder(route, 200, { ...tenant, formatoImpresion: sim.formatoImpresion, modoNavegacion: 'SIDEBAR' });
      if (method === 'GET' && path === '/auth/me') return responder(route, 200, { user: { sub: usuario.id, tenantId: tenant.id, rol: usuario.rol, permisos: ['pos.vender'], permisosConfigurados: true, descuentoMaximo: 0, nombre: usuario.nombre } });
      if (method === 'POST' && path === '/auth/login') return responder(route, 200, { type: 'tenant', accessToken: 'cont-sim-token', user: usuario, tenant });
      if (method === 'GET' && path === '/contingencia/configuracion') return responder(route, 200, { habilitada: true, entornoHabilitado: true });
      if (method === 'POST' && path === '/contingencia/dispositivos') return responder(route, 201, { id: '00000000-0000-4000-8000-000000000001', codigo: '01', nombre: 'Caja de contingencia', activo: true });
      if (method === 'POST' && path === '/contingencia/ventanas') {
        return responder(route, 201, {
          // H-5: identificadores de operación emitidos por el servidor para la ventana (formato UUID v4).
          ventana: { id: '00000000-0000-4000-8000-0000000000aa', dispositivoId: '00000000-0000-4000-8000-000000000001', cajaId: 'caja-1', usuarioId: usuario.id, vigenteHasta: VIGENTE, catalogoHash: 'h1', limites: {}, operacionesEmitidas: EMITIDAS },
          catalogo: { hash: 'h1', productos: [producto] },
        });
      }
      if (method === 'POST' && path === '/contingencia/operaciones') {
        const cuerpo = request.postDataJSON() as { operaciones: { operacionId: string; indiceOperacion?: number }[] };
        sim.operacionesRecibidas.push(...cuerpo.operaciones.map((o) => o.operacionId));
        sim.lotes.push(cuerpo.operaciones.length);
        // Un 400 sobre un lote de varias operaciones: el servidor no sabe cuál es la mala; el equipo debe reenviar de una en una.
        if (sim.rechazarLotesDeVarias && cuerpo.operaciones.length > 1) return responder(route, 400, { statusCode: 400, message: 'El lote contiene datos inválidos' });
        // Fallo temporal del servidor (5xx): la petición llegó, el servidor no pudo procesarla. Se reintenta con espera.
        if ((sim.fallosTemporales ?? 0) > 0) { sim.fallosTemporales = (sim.fallosTemporales ?? 0) - 1; return responder(route, 503, { statusCode: 503, message: 'Servicio no disponible' }); }
        if (sim.colgarPrimera) { sim.colgarPrimera = false; return; } // la conexión se queda sin respuesta
        // H-5: como el servidor real, solo acepta una operación cuyo identificador es el emitido en la posición indiceOperacion.
        // Sin el índice (o con otro) la rechaza: así el equipo no puede ocultar que omite el campo.
        const emitida = (o: { operacionId: string; indiceOperacion?: number }) => typeof o.indiceOperacion === 'number' && EMITIDAS[o.indiceOperacion] === o.operacionId;
        if (sim.retenerEnvio) await new Promise<void>(resolve => { sim.liberarEnvio = resolve; });
        return responder(route, 200, { resultados: cuerpo.operaciones.map((o) => emitida(o)
          ? { operacionId: o.operacionId, estado: 'APLICADA', numeroVenta: 7, correlativoDefinitivo: 'V-00000007', ventaId: o.operacionId, requiereRevision: false, conflictos: [] }
          : { operacionId: o.operacionId, estado: 'RECHAZADA_TECNICA', codigo: 'OPERACION_NO_EMITIDA', mensaje: 'La operación no fue emitida por el servidor para esta ventana', requiereRevision: true, conflictos: [] }), serverNow: new Date().toISOString() });
      }
      if (method === 'GET' && path.startsWith('/contingencia/operaciones/estados')) return responder(route, 200, []);
      if (method === 'GET') return responder(route, 200, []);
      return responder(route, 200, {});
    });
    await use(sim);
  }, { auto: true }],
});

export async function ingresarYAbrirPos(page: Page) {
  await page.goto('/login');
  await page.locator('#login-correo').fill(usuario.email);
  await page.locator('#login-clave').fill('clave-de-prueba');
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  await page.goto('/pos-contingencia');
  await expect(page.getByRole('button', { name: /Tornillo 2 pulgadas/ })).toBeVisible();
}

/** Botón del catálogo (no los «Quitar/Agregar una unidad de …» de la línea del carrito, que contienen el mismo nombre). */
export function botonTornillo(page: Page) {
  return page.getByRole('region', { name: 'Buscar productos' }).getByRole('button', { name: /^Tornillo 2 pulgadas/ });
}

export async function venderUnTornillo(page: Page) {
  await botonTornillo(page).click();
  await page.locator('#pc-efectivo').fill('20');
  await page.locator('#pc-cobrar').click();
}

export async function diario(page: Page) {
  return page.evaluate(() => new Promise<any[]>((resolve, reject) => {
    const req = indexedDB.open('ferresystem-contingencia', 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const all = db.transaction('operaciones', 'readonly').objectStore('operaciones').getAll();
      all.onsuccess = () => { db.close(); resolve(all.result as any[]); };
      all.onerror = () => reject(all.error);
    };
  }));
}

