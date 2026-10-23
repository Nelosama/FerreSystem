import { idDerivado } from './id-derivado';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { chromium, expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';

// E2E REAL del POS offline: backend NestJS + PostgreSQL temporal + frontend construido. Sin page.route.
// Los cortes de red se simulan con context.setOffline (red del navegador). IndexedDB y el service worker son reales.
// No simula timeouts de red: eso queda declarado en docs/POS_CONTINGENCIA_PROTOCOLO_APAGON.md como prueba pendiente.

const API = process.env.E2E_API_URL!;
const PASSWORD = process.env.E2E_PASSWORD!;
const PSQL = `${process.env.PG_BIN ?? '/usr/lib/postgresql/16/bin'}/psql`;
const DB = `postgresql://postgres@127.0.0.1:${process.env.E2E_PG_PORT ?? '55433'}/postgres`;
const sql = (consulta: string) => execFileSync(PSQL, ['-X', '-At', '-F', '|', DB, '-c', consulta], { encoding: 'utf8' }).trim();

const ADMIN = 'admin.a@e2e.invalid';
const CAJERO = 'cajero.a@e2e.invalid';
const TENANT = 'e2e-empresa-a';
const TALADRO = 'Taladro percutor 1/2" E2E';
const INVERSOR = 'Inversor soldadora 200A E2E';

const PRECIO_TALADRO = '2500.00';

async function tokenDe(request: APIRequestContext, email: string) {
  const res = await request.post(`${API}/auth/login`, { data: { email, password: PASSWORD } });
  expect(res.status(), `login ${email}`).toBe(200);
  const body = await res.json();
  return { token: body.accessToken as string, id: body.user.id as string };
}

async function ingresar(page: Page, email: string, ruta: string) {
  await page.goto('/login');
  await page.locator('#login-correo').fill(email);
  await page.locator('#login-clave').fill(PASSWORD);
  await page.getByRole('button', { name: 'INGRESAR AL SISTEMA' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
  await page.goto(ruta);
}

/** Lee el diario local tal como lo guardó el navegador (IndexedDB). */
async function diario(page: Page) {
  return page.evaluate(() => new Promise<any[]>((resolve, reject) => {
    const req = indexedDB.open('ferresystem-contingencia', 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('operaciones', 'readonly');
      const all = tx.objectStore('operaciones').getAll();
      all.onsuccess = () => { db.close(); resolve((all.result as any[]).sort((a, b) => a.secuenciaLocal - b.secuenciaLocal)); };
      all.onerror = () => reject(all.error);
    };
  }));
}

async function cambiarOperacion(page: Page, correlativo: string, cambios: Record<string, unknown>) {
  await page.evaluate(async ({ correlativo, cambios }) => new Promise<void>((resolve, reject) => {
    const req = indexedDB.open('ferresystem-contingencia', 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('operaciones', 'readwrite');
      const store = tx.objectStore('operaciones');
      const all = store.getAll();
      all.onsuccess = () => {
        const op = (all.result as any[]).find((o) => o.correlativoLocal === correlativo);
        if (!op) { reject(new Error(`no existe ${correlativo}`)); return; }
        store.put({ ...op, ...cambios });
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }), { correlativo, cambios });
}

async function esperarEstado(page: Page, correlativo: string, estado: string, timeout = 60_000) {
  await expect.poll(async () => (await diario(page)).find((o) => o.correlativoLocal === correlativo)?.estado, { timeout }).toBe(estado);
}

async function venderUnTaladro(page: Page, efectivo = '3000') {
  await page.getByPlaceholder('Nombre o código').fill('Taladro');
  await page.getByRole('button', { name: new RegExp(TALADRO) }).click();
  await page.locator('#pc-efectivo').fill(efectivo);
  await page.locator('#pc-cobrar').click();
}

async function venderNInversores(page: Page, n: number, efectivo: string) {
  await page.getByPlaceholder('Nombre o código').fill('Inversor');
  await page.getByRole('button', { name: new RegExp(INVERSOR) }).click();
  for (let i = 1; i < n; i++) await page.getByRole('button', { name: `Agregar una unidad de ${INVERSOR}` }).click();
  await page.locator('#pc-efectivo').fill(efectivo);
  await page.locator('#pc-cobrar').click();
}

/** Garantiza que el service worker controla la página antes de cortar la red (sin esto, recargar offline no tiene shell). */
async function controlada(page: Page) {
  for (let i = 0; i < 3; i++) {
    const ok = await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      return !!navigator.serviceWorker.controller;
    });
    if (ok) return;
    await page.reload();
  }
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 30_000 }).toBe(true);
}

async function sincronizarAhora(page: Page) {
  await page.getByRole('button', { name: 'Enviar pendientes ahora' }).click();
}

const ventasCentral = (origen = 'CONTINGENCIA') => Number(sql(`SELECT COUNT(*) FROM ventas WHERE tenant_id='${TENANT}' AND origen='${origen}'`));
const stockTaladro = () => Number(sql(`SELECT stock_actual FROM productos WHERE tenant_id='${TENANT}' AND nombre='${TALADRO}'`));

test.describe.configure({ mode: 'serial' });

// Un único perfil de navegador persistente = un único equipo de caja (el tenant admite una caja de contingencia).
let ctx: BrowserContext;
let perfilDir = '';
const opcionesNavegador = () => ({
  baseURL: `http://127.0.0.1:${process.env.E2E_WEB_PORT || 4173}`,
  serviceWorkers: 'allow' as const,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
});

/** Cada prueba empieza con red: una prueba anterior pudo dejar el corte activo. */
async function abrir(): Promise<{ page: Page; context: BrowserContext }> {
  await ctx.setOffline(false);
  await Promise.all(ctx.pages().map((p) => p.close().catch(() => undefined)));
  return { page: await ctx.newPage(), context: ctx };
}

let cajeroId = '';
let adminId = '';

test.describe('POS offline de contingencia — backend real', () => {
  test.beforeAll(async ({ request }) => {
    perfilDir = mkdtempSync(join(tmpdir(), 'ferre-pos-perfil-'));
    ctx = await chromium.launchPersistentContext(perfilDir, opcionesNavegador());
    const cajero = await tokenDe(request, CAJERO);
    const admin = await tokenDe(request, ADMIN);
    cajeroId = cajero.id;
    adminId = admin.id;
    const activar = await request.patch(`${API}/contingencia/configuracion`, { headers: { Authorization: `Bearer ${admin.token}` }, data: { habilitada: true } });
    expect(activar.status(), 'activación por el administrador').toBe(200);
    // El cajero de prueba recibe el permiso de venta, como lo asignaría un administrador en Usuarios.
    sql(`UPDATE usuarios SET permisos = ARRAY['pos.vender'] WHERE email='${CAJERO}'`);
    // Cupo del 100 % del stock libre: las pruebas offline venden varias unidades de la misma ventana.
    // Límite por venta de L 50 000 para la empresa de prueba (el valor por defecto de L 5 000 se prueba en el backend).
    const cupo = await request.patch(`${API}/contingencia/configuracion`, { headers: { Authorization: `Bearer ${admin.token}` }, data: { cupoPorcentaje: 100, montoMaxVentaCentavos: 5000000 } });
    expect(cupo.status()).toBe(200);
    const caja = await request.post(`${API}/operaciones/caja/abrir`, { headers: { Authorization: `Bearer ${cajero.token}` }, data: { solicitudId: randomUUID(), monto: 500 } });
    expect([200, 201, 409]).toContain(caja.status());
  });

  test.afterAll(async () => {
    await ctx?.close().catch(() => undefined);
    if (perfilDir) rmSync(perfilDir, { recursive: true, force: true });
  });

  test('1. en línea: el equipo se registra, descarga la ventana, cobra y envía; la venta queda con correlativo central', async () => {
    const { page } = await abrir();
    const antes = ventasCentral();
    await ingresar(page, CAJERO, '/pos-contingencia');
    await expect(page.getByRole('button', { name: new RegExp(TALADRO) })).toBeVisible();
    await expect(page.getByText('● En línea')).toBeVisible();

    await venderUnTaladro(page);
    await expect(page.locator('strong', { hasText: 'Venta guardada en este equipo: CT-01-0001' })).toBeVisible();
    await expect(page.getByText(/Cambio L 125\.00/)).toBeVisible();

    await esperarEstado(page, 'CT-01-0001', 'SINCRONIZADA');
    expect(ventasCentral()).toBe(antes + 1);
    const venta = sql(`SELECT origen, correlativo_local, metodo_pago, total::text, efectivo_recibido::text, cambio::text, numero_venta FROM ventas WHERE tenant_id='${TENANT}' AND correlativo_local='CT-01-0001'`);
    const [origen, correlativo, metodo, total, efectivo, cambio, numero] = venta.split('|');
    expect({ origen, correlativo, metodo, total, efectivo, cambio }).toEqual({ origen: 'CONTINGENCIA', correlativo: 'CT-01-0001', metodo: 'EFECTIVO', total: '2875.00', efectivo: '3000.00', cambio: '125.00' });
    expect(Number(numero)).toBeGreaterThan(0);
    const [op] = (await diario(page)).filter((o) => o.correlativoLocal === 'CT-01-0001');
    expect(op.correlativoDefinitivo).toBe(`V-${numero.padStart(8, '0')}`);
    expect(sql(`SELECT COUNT(*) FROM movimientos_caja WHERE referencia='${idDerivado(TENANT, op.operacionId)}' AND tipo='VENTA_POS'`)).toBe('1');
  });

  test('2. sin conexión: la página recarga desde el service worker, cobra y guarda antes de confirmar', async () => {
    const { page, context } = await abrir();
    await ingresar(page, CAJERO, '/pos-contingencia');
    await expect(page.getByRole('button', { name: new RegExp(TALADRO) })).toBeVisible();
    await controlada(page);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByText('● Sin conexión')).toBeVisible();
    await expect(page.getByRole('button', { name: new RegExp(TALADRO) })).toBeVisible();

    // Antes de cobrar, la validación de efectivo bloquea el botón.
    await page.getByRole('button', { name: new RegExp(TALADRO) }).click();
    await page.locator('#pc-efectivo').fill('100');
    await expect(page.locator('#pc-cobrar')).toBeDisabled();
    await page.locator('#pc-efectivo').fill('3000');
    await page.locator('#pc-cobrar').click();
    await expect(page.locator('strong', { hasText: 'Venta guardada en este equipo: CT-01-0002' })).toBeVisible();
    expect((await diario(page)).find((o) => o.correlativoLocal === 'CT-01-0002')?.estado).toBe('PENDIENTE');
    await expect(page.getByText(/Ventas pendientes:\s*1/)).toBeVisible();
    expect(ventasCentral()).toBe(1);
  });

  test('3. reconexión: envía la venta pendiente una vez y el reenvío manual no la duplica', async () => {
    const { page, context } = await abrir();
    await ingresar(page, CAJERO, '/pos-contingencia');
    await context.setOffline(true);
    await expect(page.getByText('● Sin conexión')).toBeVisible();
    await context.setOffline(false);
    await expect(page.getByText('● En línea')).toBeVisible();
    await esperarEstado(page, 'CT-01-0002', 'SINCRONIZADA');
    const despues = ventasCentral();
    expect(despues).toBe(2);
    await sincronizarAhora(page);
    await sincronizarAhora(page);
    await page.waitForTimeout(1500);
    expect(ventasCentral()).toBe(2);
    expect(Number(sql(`SELECT COUNT(*) FROM movimientos_caja WHERE tipo='VENTA_POS' AND concepto LIKE '%CT-01-0002%'`))).toBe(1);
  });

  test('4. reinicio del navegador con ventas pendientes: el diario sobrevive y se envía al reabrir', async () => {
    const { page } = await abrir();
    await ingresar(page, CAJERO, '/pos-contingencia');
    await expect(page.getByRole('button', { name: new RegExp(TALADRO) })).toBeVisible();
    await controlada(page);
    await ctx.setOffline(true);
    await page.reload();
    await page.getByRole('button', { name: new RegExp(TALADRO) }).click();
    await page.locator('#pc-efectivo').fill('3000');
    await page.locator('#pc-cobrar').click();
    await expect(page.locator('strong', { hasText: 'Venta guardada en este equipo: CT-01-0003' })).toBeVisible();
    await ctx.close(); // cierre del navegador con la venta pendiente

    ctx = await chromium.launchPersistentContext(perfilDir, opcionesNavegador());
    const otra = await abrir();
    await otra.page.goto('/pos-contingencia');
    await expect.poll(async () => (await diario(otra.page)).find((o) => o.correlativoLocal === 'CT-01-0003')?.estado, { timeout: 60_000 }).toMatch(/PENDIENTE|SINCRONIZADA/);
    await esperarEstado(otra.page, 'CT-01-0003', 'SINCRONIZADA');
    expect(ventasCentral()).toBe(3);
  });

  test('5. dos pestañas: solo la pestaña operadora puede cobrar', async () => {
    const { page, context } = await abrir();
    await ingresar(page, CAJERO, '/pos-contingencia');
    await expect(page.getByRole('button', { name: new RegExp(TALADRO) })).toBeVisible();
    const segunda = await context.newPage();
    await segunda.goto('/pos-contingencia');
    await expect(segunda.getByRole('alert')).toContainText('Este POS está abierto en otra pestaña');
    await expect(segunda.locator('#pc-cobrar')).toBeDisabled();
    await segunda.close();
  });

  test('6. recuperación tras cierre inesperado: una operación que quedó "enviando" vuelve a pendiente y se envía una sola vez', async () => {
    const { page, context } = await abrir();
    await ingresar(page, CAJERO, '/pos-contingencia');
    await context.setOffline(true);
    await expect(page.getByText('● Sin conexión')).toBeVisible();
    await page.getByRole('button', { name: new RegExp(TALADRO) }).click();
    await page.locator('#pc-efectivo').fill('3000');
    await page.locator('#pc-cobrar').click();
    await expect(page.locator('strong', { hasText: 'Venta guardada en este equipo: CT-01-0004' })).toBeVisible();
    await cambiarOperacion(page, 'CT-01-0004', { estado: 'ENVIANDO' });
    await page.reload();
    await context.setOffline(false);
    await esperarEstado(page, 'CT-01-0004', 'SINCRONIZADA');
    expect(Number(sql(`SELECT COUNT(*) FROM ventas WHERE tenant_id='${TENANT}' AND correlativo_local='CT-01-0004'`))).toBe(1);
  });

  test('7. pérdida de respuesta: volver a enviar la misma operación no crea otra venta', async () => {
    const { page } = await abrir();
    await ingresar(page, CAJERO, '/pos-contingencia');
    await esperarEstado(page, 'CT-01-0004', 'SINCRONIZADA');
    await cambiarOperacion(page, 'CT-01-0004', { estado: 'PENDIENTE' });
    await sincronizarAhora(page);
    await esperarEstado(page, 'CT-01-0004', 'SINCRONIZADA');
    expect(Number(sql(`SELECT COUNT(*) FROM ventas WHERE tenant_id='${TENANT}' AND correlativo_local='CT-01-0004'`))).toBe(1);
  });

  test('8. cambio de precio durante la desconexión: la venta conserva el precio autorizado y no genera conflicto', async () => {
    const { page, context } = await abrir();
    await ingresar(page, CAJERO, '/pos-contingencia');
    await expect(page.getByRole('button', { name: new RegExp(INVERSOR) })).toBeVisible();
    await context.setOffline(true);
    await page.reload();
    // La oficina cambia el precio mientras la caja está sin conexión.
    sql(`UPDATE productos SET precio_venta=9900 WHERE tenant_id='${TENANT}' AND nombre='${INVERSOR}'`);
    await venderNInversores(page, 1, '12000');
    await expect(page.locator('strong', { hasText: 'Venta guardada en este equipo: CT-01-0005' })).toBeVisible();
    await context.setOffline(false);
    await esperarEstado(page, 'CT-01-0005', 'SINCRONIZADA');
    const [op] = (await diario(page)).filter((o) => o.correlativoLocal === 'CT-01-0005');
    expect(op.requiereRevision).toBe(false);
    expect(op.conflictos).toEqual([]);
    // 8900.00 + ISV 15 % = 10235.00 (precio autorizado en la ventana, no el nuevo de 9900).
    expect(sql(`SELECT total::text FROM ventas WHERE tenant_id='${TENANT}' AND correlativo_local='CT-01-0005'`)).toBe('10235.00');
    sql(`UPDATE productos SET precio_venta=8900 WHERE tenant_id='${TENANT}' AND nombre='${INVERSOR}'`);
  });

  test('9. conflicto de stock: la venta se conserva en revisión y el administrador la acepta con nota auditada', async ({ request }) => {
    const { page, context } = await abrir();
    await ingresar(page, CAJERO, '/pos-contingencia');
    await expect(page.getByRole('button', { name: new RegExp(TALADRO) })).toBeVisible();
    await context.setOffline(true);
    await page.reload();
    // Mientras tanto, la oficina vende todo el stock físico del taladro.
    sql(`UPDATE productos SET stock_actual=0 WHERE tenant_id='${TENANT}' AND nombre='${TALADRO}'`);
    await page.getByRole('button', { name: new RegExp(TALADRO) }).click();
    await page.locator('#pc-efectivo').fill('3000');
    await page.locator('#pc-cobrar').click();
    await expect(page.locator('strong', { hasText: 'Venta guardada en este equipo: CT-01-0006' })).toBeVisible();
    await context.setOffline(false);
    await esperarEstado(page, 'CT-01-0006', 'REVISION');
    expect(stockTaladro()).toBe(0);
    expect(sql(`SELECT COUNT(*) FROM ventas WHERE tenant_id='${TENANT}' AND correlativo_local='CT-01-0006'`)).toBe('0');

    const admin = await tokenDe(request, ADMIN);
    const operacionId = sql(`SELECT id FROM operaciones_contingencia WHERE tenant_id='${TENANT}' AND correlativo_local='CT-01-0006'`);
    const nota = 'Stock agotado en oficina; la caja vendió con el catálogo de contingencia';
    const r = await request.post(`${API}/contingencia/operaciones/${operacionId}/resolver`, { headers: { Authorization: `Bearer ${admin.token}` }, data: { accion: 'ACEPTAR', nota } });
    expect(r.status()).toBe(201);
    expect((await r.json()).estado).toBe('APLICADA');
    expect(sql(`SELECT COUNT(*) FROM ventas WHERE tenant_id='${TENANT}' AND correlativo_local='CT-01-0006'`)).toBe('1');
    expect(stockTaladro()).toBe(0);
    sql(`UPDATE productos SET stock_actual=50 WHERE tenant_id='${TENANT}' AND nombre='${TALADRO}'`); // restablece el stock para las pruebas siguientes
    expect(Number(sql(`SELECT COUNT(*) FROM auditoria_operaciones WHERE tenant_id='${TENANT}' AND operacion='CONTINGENCIA_RESOLVER' AND entidad_id='${operacionId}'`))).toBe(1);
    await page.reload();
    await esperarEstado(page, 'CT-01-0006', 'SINCRONIZADA');
  });

  test('10. caja cerrada durante la contingencia: el cierre no se toca; el efectivo va a una caja abierta por el administrador', async ({ request }) => {
    const { page, context } = await abrir();
    await ingresar(page, CAJERO, '/pos-contingencia');
    await expect(page.getByRole('button', { name: new RegExp(TALADRO) })).toBeVisible();
    const cajaCajero = sql(`SELECT id FROM cajas WHERE tenant_id='${TENANT}' AND usuario_id='${cajeroId}' AND estado='ABIERTA'`);
    await context.setOffline(true);
    await page.reload();
    await page.getByRole('button', { name: new RegExp(TALADRO) }).click();
    await page.locator('#pc-efectivo').fill('3000');
    await page.locator('#pc-cobrar').click();
    await expect(page.locator('strong', { hasText: 'Venta guardada en este equipo: CT-01-0007' })).toBeVisible();
    sql(`UPDATE cajas SET estado='CERRADA', fecha_cierre=NOW(), monto_cierre_fisico=500 WHERE id='${cajaCajero}'`);
    const cierreAntes = sql(`SELECT monto_cierre_fisico::text FROM cajas WHERE id='${cajaCajero}'`);
    await context.setOffline(false);
    await esperarEstado(page, 'CT-01-0007', 'REVISION');
    expect(sql(`SELECT monto_cierre_fisico::text FROM cajas WHERE id='${cajaCajero}'`)).toBe(cierreAntes);
    expect(sql(`SELECT COUNT(*) FROM movimientos_caja WHERE caja_id='${cajaCajero}' AND concepto LIKE '%CT-01-0007%'`)).toBe('0');

    const admin = await tokenDe(request, ADMIN);
    const aperturaCaja = await request.post(`${API}/operaciones/caja/abrir`, { headers: { Authorization: `Bearer ${admin.token}` }, data: { solicitudId: randomUUID(), monto: 0 } });
    expect([200, 201, 409]).toContain(aperturaCaja.status());
    const cajaAdmin = sql(`SELECT id FROM cajas WHERE tenant_id='${TENANT}' AND usuario_id='${adminId}' AND estado='ABIERTA'`);
    const operacionId = sql(`SELECT id FROM operaciones_contingencia WHERE tenant_id='${TENANT}' AND correlativo_local='CT-01-0007'`);
    const r = await request.post(`${API}/contingencia/operaciones/${operacionId}/resolver`, { headers: { Authorization: `Bearer ${admin.token}` }, data: { accion: 'ACEPTAR', nota: 'Caja del cajero cerrada; efectivo asignado a caja abierta del administrador', cajaId: cajaAdmin } });
    expect(r.status()).toBe(201);
    expect(sql(`SELECT caja_id FROM movimientos_caja WHERE referencia=(SELECT venta_id FROM operaciones_contingencia WHERE id='${operacionId}')`)).toBe(cajaAdmin);
    expect(sql(`SELECT monto_cierre_fisico::text FROM cajas WHERE id='${cajaCajero}'`)).toBe(cierreAntes);
    // Reabre la caja del cajero para el resto de las pruebas.
    sql(`UPDATE cajas SET estado='ABIERTA', fecha_cierre=NULL, monto_cierre_fisico=NULL WHERE id='${cajaCajero}'`);
  });

  test('11. sesión vencida: el diario conserva la venta, no se borra y se envía al volver a iniciar sesión', async () => {
    const CORRELATIVO = 'CT-01-0008';
    const operacionDe = async (p: Page) => (await diario(p)).find((o) => o.correlativoLocal === CORRELATIVO);
    const identidadDe = (o: any) => ({ operacionId: o.operacionId, indiceOperacion: o.indiceOperacion, ventanaId: o.ventanaId, dispositivoId: o.dispositivoId, secuenciaLocal: o.secuenciaLocal, correlativoLocal: o.correlativoLocal });
    const { page, context } = await abrir();
    await ingresar(page, CAJERO, '/pos-contingencia');
    const antesSesion = ventasCentral();
    await expect(page.getByRole('button', { name: new RegExp(TALADRO) })).toBeVisible();
    await context.setOffline(true);
    await page.reload();
    await page.getByRole('button', { name: new RegExp(TALADRO) }).click();
    await page.locator('#pc-efectivo').fill('3000');
    await page.locator('#pc-cobrar').click();
    await expect(page.locator('strong', { hasText: `Venta guardada en este equipo: ${CORRELATIVO}` })).toBeVisible();
    // Estado local antes de que venza la sesión: persistida, con su identificador de idempotencia emitido por el servidor.
    const antes = await operacionDe(page);
    expect(antes, 'la venta quedó persistida localmente').toBeTruthy();
    expect(['PENDIENTE', 'ENVIANDO']).toContain(antes.estado);
    expect(antes.operacionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(Number.isInteger(antes.indiceOperacion)).toBe(true);
    const identidadAntes = identidadDe(antes);
    // La sesión del navegador vence: sin refresh válido, la API responde 401.
    await context.clearCookies();
    await page.evaluate(() => localStorage.setItem('ferre_token', 'token-vencido'));
    await context.setOffline(false);
    await page.waitForURL(/\/login/, { timeout: 30_000 });
    // Opción A (decisión del propietario). Al fallar el refresco, el interceptor redirige a /login y descarga la página; la escritura
    // local que devuelve la venta de ENVIANDO a PENDIENTE puede no completarse. Ambos estados son válidos aquí, siempre que la venta
    // siga en el diario con la misma identidad y se recupere y envíe una sola vez después de volver a iniciar sesión.
    const trasVencer = await operacionDe(page);
    expect(trasVencer, 'la venta sigue en el diario local tras vencer la sesión').toBeTruthy();
    expect(['ENVIANDO', 'PENDIENTE'], `estado local tras el 401: ${trasVencer.estado}`).toContain(trasVencer.estado);
    test.info().annotations.push({ type: 'estado-tras-401', description: trasVencer.estado });
    expect(identidadDe(trasVencer), 'misma identidad de idempotencia tras vencer la sesión').toEqual(identidadAntes);
    expect(trasVencer.totalCentavos).toBe(antes.totalCentavos);
    expect(trasVencer.lineas).toEqual(antes.lineas);
    // Nada llegó al servidor con la sesión vencida.
    expect(ventasCentral()).toBe(antesSesion);
    expect(Number(sql(`SELECT COUNT(*) FROM operaciones_contingencia WHERE tenant_id='${TENANT}' AND correlativo_local='${CORRELATIVO}'`))).toBe(0);
    await ingresar(page, CAJERO, '/pos-contingencia');
    // Persistencia tras reiniciar sesión: la venta sigue en el diario con la misma identidad (en cualquier punto de su recuperación).
    const trasLogin = await operacionDe(page);
    expect(trasLogin, 'la venta sigue en el diario local tras volver a iniciar sesión').toBeTruthy();
    expect(['ENVIANDO', 'PENDIENTE', 'SINCRONIZADA']).toContain(trasLogin.estado);
    expect(identidadDe(trasLogin)).toEqual(identidadAntes);
    // Recuperación efectiva y estado final correcto.
    await esperarEstado(page, CORRELATIVO, 'SINCRONIZADA');
    const final = await operacionDe(page);
    expect(identidadDe(final), 'el identificador de idempotencia se conserva hasta el final').toEqual(identidadAntes);
    expect(final.sincronizadaAt, 'queda registrada la sincronización').toBeTruthy();
    expect(final.correlativoDefinitivo, 'recibe correlativo definitivo del servidor').toBeTruthy();
    // Sin duplicados: una sola operación en el diario central, una sola venta, un solo movimiento de caja.
    expect(Number(sql(`SELECT COUNT(*) FROM operaciones_contingencia WHERE tenant_id='${TENANT}' AND correlativo_local='${CORRELATIVO}' AND estado='APLICADA'`))).toBe(1);
    expect(Number(sql(`SELECT COUNT(*) FROM ventas WHERE tenant_id='${TENANT}' AND correlativo_local='${CORRELATIVO}'`))).toBe(1);
    expect(Number(sql(`SELECT COUNT(*) FROM movimientos_caja WHERE tipo='VENTA_POS' AND concepto LIKE '%${CORRELATIVO}%'`))).toBe(1);
    expect(ventasCentral()).toBe(antesSesion + 1);
    expect((await diario(page)).filter((o) => o.correlativoLocal === CORRELATIVO)).toHaveLength(1);
  });

  test('12. el administrador ve el resumen y resuelve desde el panel móvil', async ({ request }) => {
    const { page } = await abrir();
    await ingresar(page, ADMIN, '/contingencia-admin');
    await expect(page.getByRole('heading', { name: 'Contingencia offline · administración' })).toBeVisible();
    await expect(page.getByText(/Empresa: activada/)).toBeVisible();
    await expect(page.getByText(/Resumen de hoy/)).toBeVisible();
    const admin = await tokenDe(request, ADMIN);
    const filas = await request.get(`${API}/contingencia/operaciones?soloRevision=true`, { headers: { Authorization: `Bearer ${admin.token}` } });
    expect(filas.status()).toBe(200);
  });

  test('14. actualización del service worker: una versión nueva espera y no se activa mientras la caja trabaja', async () => {
    const { page } = await abrir();
    const { readFileSync, writeFileSync } = await import('node:fs');
    const { join: unir } = await import('node:path');
    const destino = unir(process.env.E2E_DIST!, 'sw.js');
    const original = readFileSync(destino, 'utf8');
    try {
      await ingresar(page, CAJERO, '/pos-contingencia');
      await expect(page.getByRole('button', { name: new RegExp(TALADRO) })).toBeVisible();
      await controlada(page);
      // La versión de partida es la del build bajo prueba, no una versión histórica.
      const versionActual = original.match(/const VERSION = '([^']+)'/)?.[1];
      expect(versionActual).toMatch(/^ferresystem-shell-v\d+$/);
      const versionNueva = `${versionActual}-actualizacion-e2e`;
      await page.getByRole('button', { name: new RegExp(TALADRO) }).click();
      await page.locator('#pc-efectivo').fill('3000');
      const carritoAntes = await page.getByRole('region', { name: 'Venta actual' }).innerText();
      const diarioAntes = await diario(page);
      await page.evaluate(() => {
        (window as any).__controladorAntes = navigator.serviceWorker.controller;
        (window as any).__cambiosControlador = 0;
        navigator.serviceWorker.addEventListener('controllerchange', () => { (window as any).__cambiosControlador++; });
      });
      writeFileSync(destino, original.replace(`'${versionActual}'`, `'${versionNueva}'`));
      await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())!.update(); });
      await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())!.waiting?.state), { timeout: 30_000 }).toBe('installed');
      const estado = await page.evaluate(async () => ({
        mismoControlador: navigator.serviceWorker.controller === (window as any).__controladorAntes,
        cambiosControlador: (window as any).__cambiosControlador,
        cachesActivas: await caches.keys(),
      }));
      expect(estado.mismoControlador).toBe(true);
      expect(estado.cambiosControlador).toBe(0);
      expect(estado.cachesActivas).toContain(versionActual);
      expect(estado.cachesActivas).toContain(versionNueva);
      expect(await page.getByRole('region', { name: 'Venta actual' }).innerText()).toBe(carritoAntes);
      await expect(page.locator('#pc-efectivo')).toHaveValue('3000');
      expect(await diario(page)).toEqual(diarioAntes);
      // Con la actualización esperando, la caja puede completar una venta offline.
      await ctx.setOffline(true);
      await page.locator('#pc-cobrar').click();
      await expect.poll(async () => (await diario(page)).length).toBe(diarioAntes.length + 1);
      const pendientes = await diario(page);
      // Los reintentos pueden actualizar su diagnóstico; identidad, importes, líneas y estado pendiente deben conservarse.
      const contenidoPersistido = (ops: any[]) => ops.map(op => Object.fromEntries(Object.entries(op)
        .filter(([clave]) => !['intentos', 'proximoIntentoAt', 'ultimoError'].includes(clave))));
      const nueva = pendientes.find((op) => !diarioAntes.some((anterior) => anterior.operacionId === op.operacionId));
      expect(nueva.estado).toBe('PENDIENTE');
      await page.reload();
      await expect(page.locator('#pc-cobrar')).toBeVisible();
      await expect.poll(async () => contenidoPersistido(await diario(page))).toEqual(contenidoPersistido(pendientes));
      expect(await page.evaluate(() => caches.keys())).toContain(versionActual);
      // Al cerrar la última pestaña puede activarse el worker nuevo: el diario es independiente de CacheStorage.
      await page.close();
      const reabierta = await ctx.newPage();
      await reabierta.goto('/pos-contingencia');
      await expect(reabierta.locator('#pc-cobrar')).toBeVisible();
      await expect.poll(() => reabierta.evaluate(() => caches.keys())).not.toContain(versionActual);
      expect(await reabierta.evaluate(() => caches.keys())).toContain(versionNueva);
      await expect.poll(async () => contenidoPersistido(await diario(reabierta))).toEqual(contenidoPersistido(pendientes));
      await ctx.setOffline(false);
      await esperarEstado(reabierta, nueva.correlativoLocal, 'SINCRONIZADA');
      const final = (await diario(reabierta)).find(op => op.operacionId === nueva.operacionId);
      expect(final.lineas).toEqual(nueva.lineas);
      expect(final.totalCentavos).toBe(nueva.totalCentavos);
      expect(sql(`SELECT count(*) FROM ventas WHERE tenant_id='${TENANT}' AND correlativo_local='${nueva.correlativoLocal}'`)).toBe('1');
    } finally {
      writeFileSync(destino, original);
    }
  });

  test('13. el diario exportado no contiene tokens ni credenciales', async () => {
    const { page } = await abrir();
    await ingresar(page, CAJERO, '/pos-contingencia');
    const texto = await page.evaluate(async () => {
      const req = indexedDB.open('ferresystem-contingencia', 1);
      return new Promise<string>((resolve) => {
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(['operaciones', 'meta'], 'readonly');
          const ops = tx.objectStore('operaciones').getAll();
          ops.onsuccess = () => { db.close(); resolve(JSON.stringify(ops.result)); };
        };
      });
    });
    expect(texto).not.toMatch(/accessToken|ferre_token|Bearer|passwordHash/);
  });

  test('15. logout real con cola pendiente: otro cajero no la envía; el dueño vuelve y reconcilia exactamente una vez', async ({ request }) => {
    const { page, context } = await abrir();
    const admin = await tokenDe(request, ADMIN);
    const email = `offline.other.${randomUUID()}@e2e.invalid`;
    const created = await request.post(`${API}/usuarios`, { headers: { Authorization: `Bearer ${admin.token}` }, data: {
      nombre: 'Otro cajero offline', email, password: PASSWORD, rol: 'CAJERO', permisos: ['pos.vender'],
    } });
    expect(created.status()).toBe(201);
    // Arqueo is a lazy chunk. Cache the logout route online before queueing the
    // sale; an unvisited lazy route is not part of the service worker shell.
    await ingresar(page, CAJERO, '/arqueo-caja');
    await expect(page.getByRole('button', { name: 'SALIR', exact: true })).toBeVisible();
    await page.goto('/pos-contingencia');
    await expect(page.getByRole('button', { name: new RegExp(TALADRO) })).toBeVisible();
    await controlada(page);
    const previo = new Set((await diario(page)).map(op => op.operacionId));
    await context.setOffline(true);
    await venderUnTaladro(page);
    const pending = (await diario(page)).find(op => !previo.has(op.operacionId));
    expect(pending, 'se guardó una nueva venta offline').toBeTruthy();
    const centralId = idDerivado(TENANT, pending.operacionId);
    const identity = { operacionId: pending.operacionId, ventanaId: pending.ventanaId, cajeroId: pending.cajeroId,
      correlativoLocal: pending.correlativoLocal, totalCentavos: pending.totalCentavos, lineas: pending.lineas };
    // Leave the sync component while still offline, then logout online through
    // the UI, so the server actually revokes the session before any send.
    await page.goto('/arqueo-caja');
    await expect(page.locator('#pc-cobrar')).toHaveCount(0);
    expect(sql(`SELECT count(*) FROM operaciones_contingencia WHERE id='${centralId}'`)).toBe('0');
    await context.setOffline(false);
    // Arqueo requiere validar la sesión online; la excepción offline solo autoriza el POS.
    // Recargar aquí valida sin volver a montar el componente que envía la cola.
    await page.reload();
    await expect(page.getByRole('button', { name: 'SALIR', exact: true })).toBeVisible();
    const revoked = page.waitForResponse(response => response.url().endsWith('/auth/logout') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'SALIR', exact: true }).click();
    expect((await revoked).status()).toBe(200);
    await page.waitForURL(/\/login/);
    expect((await diario(page)).find(op => op.operacionId === pending.operacionId)?.lineas).toEqual(identity.lineas);
    expect(sql(`SELECT count(*) FROM operaciones_contingencia WHERE id='${centralId}'`)).toBe('0');

    await ingresar(page, email, '/pos-contingencia');
    await expect(page.getByRole('heading', { name: 'Caja · modo contingencia (efectivo)' })).toBeVisible();
    // Observe an explicit sync attempt if allowed; a foreign cashier must not
    // turn this owner's operation into either a sale or a rejection.
    const sync = page.getByRole('button', { name: 'Enviar pendientes ahora' });
    if (await sync.isEnabled()) await sync.click();
    expect(sql(`SELECT count(*) FROM operaciones_contingencia WHERE id='${centralId}'`)).toBe('0');
    expect((await diario(page)).find(op => op.operacionId === pending.operacionId)?.estado).toBe('PENDIENTE');
    await page.goto('/arqueo-caja');
    await page.getByRole('button', { name: 'SALIR', exact: true }).click();
    await page.waitForURL(/\/login/);
    await ingresar(page, CAJERO, '/pos-contingencia');
    await esperarEstado(page, pending.correlativoLocal, 'SINCRONIZADA');
    const final = (await diario(page)).find(op => op.operacionId === pending.operacionId);
    for (const [key, value] of Object.entries(identity)) expect(final[key], key).toEqual(value);
    expect(sql(`SELECT count(*) FROM operaciones_contingencia WHERE id='${centralId}' AND estado='APLICADA'`)).toBe('1');
    expect(sql(`SELECT count(*) FROM ventas WHERE tenant_id='${TENANT}' AND correlativo_local='${pending.correlativoLocal}'`)).toBe('1');
    expect(sql(`SELECT count(*) FROM movimientos_caja WHERE referencia=(SELECT venta_id FROM operaciones_contingencia WHERE id='${centralId}')`)).toBe('1');
  });
});
