import { expect, test as base, type Page, type Route } from '@playwright/test';

// E2E CON BACKEND SIMULADO para contingencia POS: timeouts reales de red y almacenamiento lleno.
// Valida el comportamiento de la interfaz y del sincronizador ante una petición que no responde o un error de cuota.
// NO prueba persistencia de servidor: eso está en backend/test/contingencia.postgres.integration.ts (PostgreSQL real).

const tenant = { id: 'tenant-cont-sim', nombreComercial: 'Ferretería de contingencia', colorPrimario: '#EA580C' };
const usuario = { id: 'cajero-sim', nombre: 'Cajero de prueba', email: 'cajero@prueba.invalid', rol: 'CAJERO' };
const producto = { id: 'prod-1', codigo: 'TOR-1', nombre: 'Tornillo 2 pulgadas', codigoBarras: null, precioCentavos: 1000,
  libreCentesimas: 4000, cupoCentesimas: 2000, usaMedida: false, unidadMedida: 'UNIDAD' };
const VIGENTE = new Date(Date.now() + 30 * 3_600_000).toISOString();

type Sim = { retenerEnvio?: boolean; liberarEnvio?: () => void; formatoImpresion?: 'A4' | 'ROLLO_80MM' | 'ROLLO_58MM'; operacionesRecibidas: string[]; colgarPrimera: boolean; errores: string[]; sinRed: boolean; lotes: number[]; rechazarLotesDeVarias: boolean };
// H-5: identificadores que el mock de la ventana emite, en orden.
const EMITIDAS = Array.from({ length: 500 }, (_, i) => `00000000-0000-4000-8000-${(i + 1).toString(16).padStart(12, '0')}`);

const test = base.extend<{ sim: Sim }>({
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

async function ingresarYAbrirPos(page: Page) {
  await page.goto('/login');
  await page.locator('#login-correo').fill(usuario.email);
  await page.locator('#login-clave').fill('clave-de-prueba');
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  await page.goto('/pos-contingencia');
  await expect(page.getByRole('button', { name: /Tornillo 2 pulgadas/ })).toBeVisible();
}

/** Botón del catálogo (no los «Quitar/Agregar una unidad de …» de la línea del carrito, que contienen el mismo nombre). */
function botonTornillo(page: Page) {
  return page.getByRole('region', { name: 'Buscar productos' }).getByRole('button', { name: /^Tornillo 2 pulgadas/ });
}

async function venderUnTornillo(page: Page) {
  await botonTornillo(page).click();
  await page.locator('#pc-efectivo').fill('20');
  await page.locator('#pc-cobrar').click();
}

async function diario(page: Page) {
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

test.describe('Contingencia POS — red y almacenamiento con backend simulado', () => {
  test('timeout real: una petición colgada no deja la venta en "enviando"; vuelve a pendiente y se envía una sola vez', async ({ page, sim }) => {
    test.setTimeout(90_000);
    await ingresarYAbrirPos(page);
    // La primera venta se guarda con la conexión activa y la primera petición de envío no responde.
    sim.colgarPrimera = true;
    await venderUnTornillo(page);
    await expect(page.locator('strong', { hasText: 'Venta guardada en este equipo: CT-01-0001' })).toBeVisible();

    // Tras el límite de espera (20 s) la venta vuelve a pendiente con el motivo, no queda en "enviando".
    await expect.poll(async () => (await diario(page)).find((o) => o.correlativoLocal === 'CT-01-0001')?.ultimoError, { timeout: 45_000 }).toBeTruthy();
    const trasTimeout = (await diario(page)).find((o) => o.correlativoLocal === 'CT-01-0001');
    expect(trasTimeout.estado).toBe('PENDIENTE');
    expect(trasTimeout.intentos).toBe(1);

    // El reintento usa el mismo identificador y termina aplicado: la misma operación llegó dos veces, con una sola venta.
    await expect.poll(async () => (await diario(page)).find((o) => o.correlativoLocal === 'CT-01-0001')?.estado, { timeout: 45_000 }).toBe('SINCRONIZADA');
    const [primera, segunda] = sim.operacionesRecibidas;
    // H-5: los identificadores distintos enviados son el prefijo, en orden, de los emitidos por la ventana.
    expect([...new Set(sim.operacionesRecibidas)]).toEqual(EMITIDAS.slice(0, new Set(sim.operacionesRecibidas).size));
    expect(sim.operacionesRecibidas.length).toBeGreaterThanOrEqual(2);
    expect(segunda).toBe(primera);
    expect(sim.errores).toEqual([]);
  });

  test('almacenamiento lleno: el cobro no se confirma, no hay comprobante ni operación a medias', async ({ page, sim }) => {
    await ingresarYAbrirPos(page);
    // Simula el error de cuota en la escritura del diario (no llena el disco real).
    await page.addInitScript(() => {
      const original = IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add = function (...args: any[]) {
        if ((window as any).__cuotaLlena && this.name === 'operaciones') throw new DOMException('Cuota de almacenamiento excedida', 'QuotaExceededError');
        return original.apply(this, args as any);
      } as any;
    });
    await page.reload();
    await expect(page.getByRole('button', { name: /Tornillo 2 pulgadas/ })).toBeVisible();
    await page.evaluate(() => { (window as any).__cuotaLlena = true; });
    const antes = (await diario(page)).length;
    await venderUnTornillo(page);
    await expect(page.getByRole('alert').filter({ hasText: 'La venta NO se guardó en este equipo' })).toBeVisible();
    await expect(page.locator('strong', { hasText: 'Venta guardada en este equipo' })).toHaveCount(0);
    expect((await diario(page)).length).toBe(antes);
    expect(sim.operacionesRecibidas).toEqual([]);
  });

  test('si la lista del diario falla después de guardar, la venta sigue confirmada y no se dice que no se guardó', async ({ page, sim }) => {
    await ingresarYAbrirPos(page);
    // La primera lectura del diario que ocurre después de una escritura falla (la escritura sí se completó).
    await page.addInitScript(() => {
      const add = IDBObjectStore.prototype.add;
      const getAll = IDBObjectStore.prototype.getAll;
      IDBObjectStore.prototype.add = function (...args: any[]) {
        const peticion = add.apply(this, args as any);
        if ((window as any).__fallarLecturaTrasGuardar && this.name === 'operaciones') (window as any).__armado = true;
        return peticion;
      } as any;
      IDBObjectStore.prototype.getAll = function (...args: any[]) {
        if ((window as any).__armado && this.name === 'operaciones') {
          (window as any).__armado = false;
          (window as any).__fallarLecturaTrasGuardar = false;
          throw new DOMException('Lectura fallida tras guardar', 'UnknownError');
        }
        return getAll.apply(this, args as any);
      } as any;
    });
    await page.reload();
    await expect(page.getByRole('button', { name: /Tornillo 2 pulgadas/ })).toBeVisible();
    await page.evaluate(() => { (window as any).__fallarLecturaTrasGuardar = true; });

    await venderUnTornillo(page);
    await expect(page.locator('strong', { hasText: 'Venta guardada en este equipo: CT-01-0001' })).toBeVisible();
    await expect(page.getByText(/NO se guardó/)).toHaveCount(0);
    // La venta está en el diario aunque la lista no se pudo recargar.
    expect((await diario(page)).map((o) => o.correlativoLocal)).toEqual(['CT-01-0001']);
    expect(sim.errores).toEqual([]);
  });

  test('la venta siguiente se cobra y guarda mientras la sincronización de la anterior sigue sin respuesta', async ({ page, sim }) => {
    await ingresarYAbrirPos(page);
    sim.colgarPrimera = true;
    await venderUnTornillo(page);
    await expect(page.locator('strong', { hasText: 'Venta guardada en este equipo: CT-01-0001' })).toBeVisible();
    // Mientras el envío de la primera espera respuesta, el cajero atiende al siguiente cliente de inmediato.
    await page.getByRole('button', { name: 'Siguiente cliente' }).click();
    await venderUnTornillo(page);
    await expect(page.locator('strong', { hasText: 'Venta guardada en este equipo: CT-01-0002' })).toBeVisible({ timeout: 5_000 });
    expect(sim.operacionesRecibidas.length).toBe(1);
    // El diario no tiene orden garantizado (se lee por UUID): cada venta se busca por su correlativo.
    const estadoDe = async (c: string) => (await diario(page)).find((o) => o.correlativoLocal === c)?.estado;
    expect(await estadoDe('CT-01-0001')).toBe('ENVIANDO');
    expect(await estadoDe('CT-01-0002')).toBe('PENDIENTE');
  });
});

// Impresión: window.print se sustituye para registrar lo que se enviaría a la impresora térmica.
// Una impresora real no se puede simular aquí; ver docs/POS_PILOTO_CHECKLIST_FISICO.md.
async function preparaImpresion(page: Page) {
  await page.addInitScript(() => {
    (window as any).__impresiones = [];
    (window as any).__fallarImpresion = false;
    (window as any).__cancelarImpresion = false;
    window.print = () => {
      if ((window as any).__fallarImpresion) throw new Error('Impresora no disponible');
      if ((window as any).__cancelarImpresion) return; // el cajero cierra el diálogo: el navegador no informa la cancelación
      const nodo = document.querySelector('.pc-comprobante-impresion');
      (window as any).__impresiones.push({ texto: nodo?.textContent ?? '', clase: nodo?.className ?? '' });
    };
  });
}
const impresiones = (page: Page) => page.evaluate(() => (window as any).__impresiones as { texto: string; clase: string }[]);

test.describe('Impresión del comprobante de contingencia', () => {
  test('el comprobante interno trae ferretería, CT, cajero, código, descripción, cantidades, precios, total, efectivo y cambio', async ({ page }) => {
    await preparaImpresion(page);
    await ingresarYAbrirPos(page);
    await venderUnTornillo(page);
    await expect(page.locator('strong', { hasText: 'Venta guardada en este equipo: CT-01-0001' })).toBeVisible();
    await page.getByRole('button', { name: 'Imprimir comprobante' }).click();
    await expect.poll(async () => (await impresiones(page)).length).toBe(1);
    const [{ texto, clase }] = await impresiones(page);
    expect(clase).toContain('papel-A4');
    for (const esperado of [
      'COMPROBANTE INTERNO DE CONTINGENCIA', 'NO ES FACTURA FISCAL', 'Ferretería de contingencia',
      'Número temporal: CT-01-0001', 'Cajero: Cajero de prueba', 'Cliente: Consumidor final',
      'TOR-1 Tornillo 2 pulgadas', '1 x L 10.00 = L 10.00',
      'Subtotal', 'L 10.00', 'ISV 15%', 'L 1.50', 'TOTAL', 'L 11.50', 'Efectivo recibido', 'L 20.00', 'Cambio entregado', 'L 8.50',
    ]) expect(texto, esperado).toContain(esperado);
    expect(texto).not.toMatch(/CAI|factura N/i);
  });

  test('reimprimir desde el diario muestra el mismo comprobante y no crea otra venta', async ({ page }) => {
    await preparaImpresion(page);
    await ingresarYAbrirPos(page);
    await venderUnTornillo(page);
    await page.getByRole('button', { name: 'Imprimir comprobante' }).click();
    await expect.poll(async () => (await impresiones(page)).length).toBe(1);
    await page.getByRole('button', { name: 'Reimprimir' }).click();
    await expect.poll(async () => (await impresiones(page)).length).toBe(2);
    const [primera, segunda] = await impresiones(page);
    expect(segunda.texto).toBe(primera.texto);
    expect((await diario(page)).map((o) => o.correlativoLocal)).toEqual(['CT-01-0001']);
  });

  test('recargar el navegador después de guardar: la venta sigue en el diario y se reimprime', async ({ page }) => {
    await preparaImpresion(page);
    await ingresarYAbrirPos(page);
    await venderUnTornillo(page);
    await expect(page.locator('strong', { hasText: 'Venta guardada en este equipo: CT-01-0001' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: /Tornillo 2 pulgadas/ })).toBeVisible();
    await page.getByRole('button', { name: 'Reimprimir' }).click();
    await expect.poll(async () => (await impresiones(page)).length).toBe(1);
    expect((await impresiones(page))[0].texto).toContain('Número temporal: CT-01-0001');
    expect((await diario(page)).length).toBe(1);
  });

  test('una impresora que falla no revierte la venta, no permite cobrarla otra vez y deja atender al siguiente cliente', async ({ page, sim }) => {
    sim.retenerEnvio = true;
    await preparaImpresion(page);
    await ingresarYAbrirPos(page);
    await venderUnTornillo(page);
    await page.evaluate(() => { (window as any).__fallarImpresion = true; });
    await page.getByRole('button', { name: 'Imprimir comprobante' }).click();
    await expect(page.getByRole('status').or(page.getByRole('alert')).filter({ hasText: 'No se pudo imprimir' })).toBeVisible();
    await expect.poll(() => Boolean(sim.liberarEnvio)).toBe(true);
    sim.retenerEnvio = false; sim.liberarEnvio!();
    await expect(page.getByText('1 venta(s) enviadas y confirmadas por la oficina.')).toBeVisible();
    await expect(page.getByRole('status').or(page.getByRole('alert')).filter({ hasText: 'No se pudo imprimir' })).toBeVisible();
    await expect(page.locator('strong', { hasText: 'Venta guardada en este equipo: CT-01-0001' })).toBeVisible();
    expect((await diario(page)).map((o) => o.correlativoLocal)).toEqual(['CT-01-0001']);
    await page.getByRole('button', { name: 'Siguiente cliente' }).click();
    await page.evaluate(() => { (window as any).__fallarImpresion = false; });
    await venderUnTornillo(page);
    await expect(page.locator('strong', { hasText: 'Venta guardada en este equipo: CT-01-0002' })).toBeVisible();
    expect((await diario(page)).map((o) => o.correlativoLocal).sort()).toEqual(['CT-01-0001', 'CT-01-0002']);
    expect(sim.errores).toEqual([]);
  });

  test('cancelar el diálogo de impresión no cambia la venta ni muestra un error', async ({ page }) => {
    await preparaImpresion(page);
    await ingresarYAbrirPos(page);
    await venderUnTornillo(page);
    await page.evaluate(() => { (window as any).__cancelarImpresion = true; });
    await page.getByRole('button', { name: 'Imprimir comprobante' }).click();
    await expect(page.locator('strong', { hasText: 'Venta guardada en este equipo: CT-01-0001' })).toBeVisible();
    await expect(page.getByText(/No se pudo imprimir|NO se guardó/)).toHaveCount(0);
    expect((await diario(page)).length).toBe(1);
  });

  test('el formato de 58 mm configurado por negocio se aplica y se conserva al recargar', async ({ page, sim }) => {
    sim.formatoImpresion = 'ROLLO_58MM';
    await preparaImpresion(page);
    await ingresarYAbrirPos(page);
    await expect(page.getByLabel('Papel de la impresora')).toBeDisabled();
    await expect(page.getByLabel('Papel de la impresora')).toHaveValue('58');
    await venderUnTornillo(page);
    await page.getByRole('button', { name: 'Imprimir comprobante' }).click();
    await expect.poll(async () => (await impresiones(page)).length).toBe(1);
    expect((await impresiones(page))[0].clase).toContain('papel-58');
    await page.reload();
    await expect(page.getByLabel('Papel de la impresora')).toHaveValue('58');
  });
});

test.describe('Contingencia POS — sin internet y existencias locales', () => {
  test('dos ventas consecutivas sin internet: ambas quedan guardadas y pendientes, sin duplicar', async ({ page, sim }) => {
    await ingresarYAbrirPos(page);
    sim.sinRed = true;
    await venderUnTornillo(page);
    await expect(page.locator('strong', { hasText: 'Venta guardada en este equipo: CT-01-0001' })).toBeVisible();
    await page.getByRole('button', { name: 'Siguiente cliente' }).click();
    await venderUnTornillo(page);
    await expect(page.locator('strong', { hasText: 'Venta guardada en este equipo: CT-01-0002' })).toBeVisible();
    await expect.poll(async () => (await diario(page)).length, { timeout: 5_000 }).toBe(2);
    expect(sim.operacionesRecibidas).toEqual([]);
    expect(sim.errores).toEqual([]);
  });

  test('lote rechazado con 400: el equipo reenvía las ventas de una en una, ninguna se pierde ni se duplica', async ({ page, sim }) => {
    await ingresarYAbrirPos(page);
    sim.sinRed = true;
    await venderUnTornillo(page);
    await page.getByRole('button', { name: 'Siguiente cliente' }).click();
    await venderUnTornillo(page);
    await expect.poll(async () => (await diario(page)).length, { timeout: 5_000 }).toBe(2);
    expect(sim.operacionesRecibidas).toEqual([]);

    // Cada venta intentó enviarse sin red y quedó con una espera de reintento (2 s). Se deja vencer para que ambas sean elegibles a la vez
    // y el primer envío sea de verdad un lote de dos.
    await page.waitForTimeout(5_000);
    // Vuelve la conexión: el primer envío es un lote de dos y el servidor lo rechaza entero con 400.
    sim.rechazarLotesDeVarias = true;
    sim.sinRed = false;
    await page.getByRole('button', { name: 'Enviar pendientes ahora' }).click();

    // El equipo cae al reenvío individual: ambas quedan sincronizadas, cada una con su propio identificador emitido.
    await expect.poll(async () => (await diario(page)).map((o) => o.estado).sort(), { timeout: 20_000 }).toEqual(['SINCRONIZADA', 'SINCRONIZADA']);
    expect(sim.lotes[0]).toBe(2);
    expect(sim.lotes.slice(1).filter((n) => n === 1).length).toBeGreaterThanOrEqual(2);
    expect(sim.lotes.slice(1).every((n) => n === 1)).toBe(true);
    const distintas = [...new Set(sim.operacionesRecibidas)];
    expect(distintas).toEqual(EMITIDAS.slice(0, 2));
    // Ninguna se rechazó ni quedó en revisión, y no hay errores de página.
    expect((await diario(page)).some((o) => o.estado === 'REVISION' || o.estado === 'ERROR')).toBe(false);
    expect(sim.errores).toEqual([]);
  });

  test('la existencia local baja al instante con cada venta, sin esperar la sincronización', async ({ page, sim }) => {
    await ingresarYAbrirPos(page);
    sim.colgarPrimera = true;
    const tornillo = botonTornillo(page);
    await expect(tornillo).toContainText('Disponible: 20');
    await venderUnTornillo(page);
    await expect(tornillo).toContainText('Disponible: 19');
    await page.getByRole('button', { name: 'Siguiente cliente' }).click();
    await venderUnTornillo(page);
    await expect(tornillo).toContainText('Disponible: 18');
  });
});


for (const [formato, papel] of [['A4', 'A4'], ['ROLLO_80MM', '80'], ['ROLLO_58MM', '58']] as const) {
  test(`contingencia: ${formato} mantiene página y ancho coherentes y respeta la configuración del negocio frente a la preferencia local`, async ({ page, sim }) => {
    sim.formatoImpresion = formato;
    await preparaImpresion(page);
    await page.addInitScript(preferencia => localStorage.setItem('pos-contingencia-papel', preferencia), papel === '58' ? '80' : '58');
    await ingresarYAbrirPos(page); await venderUnTornillo(page);
    await expect(page.getByLabel('Papel de la impresora')).toBeDisabled();
    await expect(page.getByLabel('Papel de la impresora')).toHaveValue(papel);
    await page.getByRole('button', { name: 'Imprimir comprobante' }).click();
    await expect.poll(async () => (await impresiones(page)).length).toBe(1);
    expect((await impresiones(page))[0].clase).toContain(`papel-${papel}`);
    const size = await page.evaluate(() => [...document.querySelectorAll('style')].flatMap(style => [...(style.sheet?.cssRules ?? [])])
      .filter(rule => rule instanceof CSSPageRule).map(rule => (rule as CSSPageRule).style.getPropertyValue('size')).filter(Boolean).at(-1));
    if (formato === 'A4') expect(size).toBe('a4');
    else expect(size).toMatch(new RegExp(`^${papel}mm [0-9.]+mm$`));
  });
}
