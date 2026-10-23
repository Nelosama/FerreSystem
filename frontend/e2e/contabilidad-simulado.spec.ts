import { readFileSync } from 'node:fs';
import { expect, test, type Page, type Route } from '@playwright/test';

// Libro de Excel de muestra generado con el escritor del backend (aLibroXlsx): el mock lo sirve como respuesta real.
const XLSX_MUESTRA = readFileSync(new URL('./fixtures/ventas-2026-09.xlsx', import.meta.url));

// Lectura mínima del ZIP del .xlsx (sin compresión) para comprobar hojas del archivo descargado.
function hojasDelXlsx(buf: Buffer): string[] {
  const fin = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let p = buf.readUInt32LE(fin + 16);
  const archivos: Record<string, string> = {};
  for (let i = 0; i < buf.readUInt16LE(fin + 10); i++) {
    const tam = buf.readUInt32LE(p + 20), nLen = buf.readUInt16LE(p + 28), eLen = buf.readUInt16LE(p + 30), cLen = buf.readUInt16LE(p + 32), offset = buf.readUInt32LE(p + 42);
    const nombre = buf.subarray(p + 46, p + 46 + nLen).toString('utf8');
    const local = offset + 30 + buf.readUInt16LE(offset + 26) + buf.readUInt16LE(offset + 28);
    archivos[nombre] = buf.subarray(local, local + tam).toString('utf8');
    p += 46 + nLen + eLen + cLen;
  }
  return [...archivos['xl/workbook.xml'].matchAll(/<sheet name="([^"]+)"/g)].map(m => m[1]);
}

// E2E CON BACKEND SIMULADO: pantalla de Contabilidad y Control Tributario para CONTADOR y ADMIN.
// Cálculos, autorización y aislamiento reales: backend/test/contabilidad.postgres.integration.ts.

const MODULOS = ['pos', 'cotizaciones', 'inventario', 'usuarios', 'reportes', 'clientes', 'arqueo_caja', 'configuracion', 'contabilidad'];
const fila = (o: Record<string, unknown>) => ({
  origen: 'DOCUMENTO', documentoId: 'd1', operacionId: 'v1', referenciaInterna: 'V-1', fecha: '2026-09-10', tipoDocumento: '01', tipoDocumentoNombre: 'Factura',
  numero: '000-001-01-00000001', cai: 'CAI-1', contraparte: 'Cliente', rtn: '08011990123456', importeExento: '0.00', importeExonerado: '0.00',
  importeGravadoGeneral: '1000.00', importeGravadoEspecial: '0.00', isvGeneral: '150.00', isvEspecial: '0.00', total: '1150.00', estado: 'VIGENTE', signo: 1, hallazgos: [], ...o,
});
const totales = { documentos: 1, importeExento: '0.00', importeExonerado: '0.00', importeGravadoGeneral: '1000.00', importeGravadoEspecial: '0.00', isvGeneral: '150.00', isvEspecial: '0.00', total: '1150.00', sinDocumento: { cantidad: 1, base: '200.00', isv: '30.00', total: '230.00' } };

// Capturas de la interfaz para la revisión: solo se guardan si se define CAPTURAS_DIR (no se versionan).
async function capturar(page: Page, nombre: string) {
  if (process.env.CAPTURAS_DIR) await page.screenshot({ path: `${process.env.CAPTURAS_DIR}/${nombre}.png`, fullPage: false });
}

type Registro = { documentos: unknown[]; errores: string[]; rutas: string[] };

async function preparar(page: Page, baseURL: string | undefined, rol = 'CONTADOR', modulos = MODULOS): Promise<Registro> {
  const company = { id: 'cont-company', nombreComercial: 'Ferretería Contable', colorPrimario: '#1D4ED8', modoNavegacion: 'SIDEBAR', idioma: 'es', modulosHabilitados: modulos };
  const user = { id: `u-${rol}`, nombre: 'Carla', rol, permisos: [] };
  const registro: Registro = { documentos: [], errores: [], rutas: [] };
  page.on('pageerror', e => registro.errores.push(e.message));
  await page.addInitScript(({ company, user }) => {
    localStorage.setItem('ferre_user', JSON.stringify(user));
    localStorage.setItem('ferre_tenant', JSON.stringify(company));
    localStorage.setItem('ferre_token', 'test-only');
    localStorage.setItem('ferre_language', 'es');
  }, { company, user });
  const origen = new URL(baseURL!).origin;
  const responder = (route: Route, status: number, body: unknown) => route.fulfill({ status, json: body });
  await page.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) { if (url.origin === origen) await route.continue(); else await route.abort(); return; }
    const path = url.pathname.slice(4);
    const method = request.method();
    registro.rutas.push(`${method} ${path}`);
    if (path === '/tenant/settings') return responder(route, 200, company);
    if (/\/logo$/.test(path)) return responder(route, 404, {});
    if (path === '/auth/me') return responder(route, 200, { user: { ...user, sub: user.id, tenantId: company.id, type: 'tenant' } });
    if (path === '/contabilidad/resumen-isv') return responder(route, 200, { periodo: { anio: 2026, mes: 9 }, debitoFiscal: '150.00', creditoFiscal: '60.00', retencionesIsvSufridas: '15.00', resultado: '75.00', tipoResultado: 'A_PAGAR', retencionesPorEnterar: { isv: '0.00', isr: '0.00' }, ventasSinDocumento: totales.sinDocumento, comprasSinDocumento: { cantidad: 0, base: '0.00', isv: '0.00', total: '0.00' }, aviso: '' });
    if (path === '/contabilidad/conciliacion') return responder(route, 200, { periodo: {}, estadoPeriodo: 'ABIERTO', huella: 'x', total: 2, porCodigo: {}, hallazgos: [{ libro: 'VENTAS', codigo: 'SIN_DOCUMENTO_FISCAL', referencia: 'V-2' }, { libro: 'VENTAS', codigo: 'SALTO_CORRELATIVO', referencia: '000-001-01', detalle: '2–2' }] });
    if (path === '/contabilidad/libros/ventas') return responder(route, 200, { periodo: { desde: '2026-09-01', hasta: '2026-09-30' }, filas: [fila({}), fila({ origen: 'VENTA', documentoId: null, operacionId: 'v2', referenciaInterna: 'V-2', numero: null, tipoDocumentoNombre: null, signo: 0, estado: 'COMPLETADA', hallazgos: ['SIN_DOCUMENTO_FISCAL'] })], totales, devoluciones: [] });
    if (path === '/contabilidad/documentos' && method === 'GET') return responder(route, 200, []);
    if (path === '/contabilidad/documentos' && method === 'POST') {
      const cuerpo = request.postDataJSON();
      registro.documentos.push(cuerpo);
      if (cuerpo.numero.endsWith('00000099')) return responder(route, 400, { message: 'El documento emitido no cumple las reglas fiscales configuradas', hallazgos: ['FUERA_DE_RANGO'] });
      return responder(route, 201, { id: 'nuevo', ...cuerpo });
    }
    // Igual que la API real: la cabecera Content-Disposition puede no ser legible entre orígenes; el nombre no depende de ella.
    if (path.startsWith('/contabilidad/exportar/')) {
      const formato = url.searchParams.get('formato') ?? 'xlsx';
      if (formato === 'xlsx') return route.fulfill({ status: 200, body: XLSX_MUESTRA, headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } });
      return route.fulfill({ status: 200, body: '\uFEFFLibro de ventas 2026-09\r\n', headers: { 'content-type': 'text/csv; charset=utf-8' } });
    }
    if (path === '/contabilidad/balanza') return responder(route, 200, { periodo: {}, cuentas: [{ id: 'k1', codigo: '1.1', nombre: 'Caja', debePeriodo: 1150, haberPeriodo: 0, saldo: 1150 }, { id: 'k2', codigo: '4.1', nombre: 'Ventas', debePeriodo: 0, haberPeriodo: 1150, saldo: 1150 }], totales: { debe: 1150, haber: 1150, cuadra: true } });
    if (path === '/contabilidad/mayor') return responder(route, 200, { periodo: {}, cuenta: { id: 'k1', codigo: '1.1', nombre: 'Caja', tipo: 'ACTIVO', naturaleza: 'DEUDORA' }, saldoInicial: 200, movimientos: [{ asientoId: 'a1', numero: 1, fecha: '2026-09-10', concepto: 'Venta de prueba', origen: 'MANUAL', estado: 'CONTABILIZADO', debe: 1150, haber: 0, saldo: 1350 }], totales: { debe: 1150, haber: 0 }, saldoFinal: 1350 });
    if (path === '/contabilidad/cuentas') return responder(route, 200, [{ id: 'k1', codigo: '1.1', nombre: 'Caja', tipo: 'ACTIVO', naturaleza: 'DEUDORA', aceptaMovimientos: true, activa: true }, { id: 'k2', codigo: '4.1', nombre: 'Ventas', tipo: 'INGRESO', naturaleza: 'ACREEDORA', aceptaMovimientos: true, activa: true }]);
    if (path === '/contabilidad/asientos' && method === 'GET') return responder(route, 200, [{ id: 'a1', numero: 1, fecha: '2026-09-10', concepto: 'Venta de prueba', origen: 'MANUAL', estado: 'CONTABILIZADO', lineas: [{ codigo: '1.1', nombre: 'Caja', debe: '1150.00', haber: '0.00' }, { codigo: '4.1', nombre: 'Ventas', debe: '0.00', haber: '1150.00' }] }]);
    if (/^\/contabilidad\/(asientos\/a1\/revertir|periodos\/2026\/\d+\/cerrar)$/.test(path) && method === 'POST') { registro.documentos.push({ ruta: path, ...request.postDataJSON() }); return responder(route, 201, {}); }
    if (path === '/contabilidad/periodos') return responder(route, 200, Array.from({ length: 12 }, (_, i) => ({ anio: 2026, mes: i + 1, estado: i === 7 ? 'CERRADO' : 'ABIERTO', cerradoPor: i === 7 ? 'Carla' : null })));
    if (path.startsWith('/contabilidad/')) return responder(route, 200, []);
    // Cualquier otra consulta del CONTADOR sería un acceso operativo inesperado.
    return responder(route, rol === 'CONTADOR' ? 403 : 200, method === 'GET' ? [] : {});
  });
  return registro;
}

test.describe('Contabilidad y Control Tributario (simulado)', () => {
  test('el CONTADOR entra directo a Contabilidad y solo ve ese acceso', async ({ page, baseURL }) => {
    const r = await preparar(page, baseURL);
    await page.goto('/');
    await expect(page).toHaveURL(/\/contabilidad$/);
    await expect(page.getByRole('heading', { name: 'Inicio' })).toBeVisible();
    await expect(page.getByText('Resultado: a pagar')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Salto en la numeración' })).toBeVisible();
    const menu = page.locator('aside, nav').first();
    for (const operativo of ['Punto de venta', 'Inventario', 'Arqueo de caja', 'Cuentas y abonos']) await expect(menu.getByRole('link', { name: operativo, exact: true })).toHaveCount(0);
    expect(r.rutas.filter(x => !x.includes('/contabilidad/') && !/\/(auth\/me|tenant\/settings|tenant\/logo)$/.test(x))).toEqual([]);
    expect(r.errores).toEqual([]);
  });

  test('Exportar a Excel descarga un .xlsx real con sus hojas, aunque no se pueda leer la cabecera del nombre', async ({ page, baseURL }) => {
    await preparar(page, baseURL);
    await page.goto('/contabilidad/reportes');
    await page.getByRole('tab', { name: 'Libro de ventas' }).click();
    const descarga = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exportar a Excel' }).click();
    const archivo = await descarga;
    expect(archivo.suggestedFilename()).toBe('ventas-2026-09.xlsx');
    const contenido = readFileSync((await archivo.path())!);
    expect(contenido.subarray(0, 2).toString()).toBe('PK');
    expect(hojasDelXlsx(contenido)).toEqual(['Ventas']);
    await expect(page.getByRole('status')).toContainText('ventas-2026-09.xlsx');
  });

  test('libro contable del mes: un único Excel con su nombre', async ({ page, baseURL }) => {
    await preparar(page, baseURL);
    await page.goto('/contabilidad');
    const descarga = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Libro contable del mes (Excel)' }).click();
    expect((await descarga).suggestedFilename()).toBe('libro-contable-2026-09.xlsx');
  });

  test('libro de ventas con hallazgos, registro de documento con error explicado y exportación CSV', async ({ page, baseURL }) => {
    const r = await preparar(page, baseURL);
    await page.goto('/contabilidad/reportes');
    await page.getByRole('tab', { name: 'Libro de ventas' }).click();
    await expect(page.getByRole('cell', { name: /000-001-01-00000001/ })).toBeVisible();
    await expect(page.getByText('Sin documento fiscal').first()).toBeVisible();
    const descarga = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exportar CSV' }).click();
    expect((await descarga).suggestedFilename()).toBe('ventas-2026-09.csv');

    await page.goto('/contabilidad/documentos');
    await page.getByRole('tab', { name: 'Documentos fiscales' }).click();
    const form = page.getByRole('form', { name: 'Registrar documento fiscal' });
    const guardar = form.getByRole('button', { name: 'Guardar' });
    await form.getByLabel('Número (000-001-01-00000001)').fill('000-001-06-00000001');
    await expect(guardar).toBeDisabled(); // el tipo 06 no corresponde a «Factura»
    await form.getByLabel('Número (000-001-01-00000001)').fill('000-001-01-00000099');
    await form.getByLabel('Gravado tasa general').fill('100');
    await form.getByLabel('ISV tasa general').fill('15');
    await guardar.click();
    await expect(page.getByRole('alert')).toContainText('Fuera del rango autorizado');
    await form.getByLabel('Número (000-001-01-00000001)').fill('000-001-01-00000005');
    await guardar.click();
    await expect(page.getByRole('status')).toContainText('Documento registrado');
    expect(r.documentos.at(-1)).toMatchObject({ direccion: 'EMITIDO', tipoDocumento: '01', numero: '000-001-01-00000005', importeGravadoGeneral: 100, isvGeneral: 15 });
  });

  test('períodos: el CONTADOR no ve «Reabrir»; el ADMIN sí', async ({ page, baseURL }) => {
    await preparar(page, baseURL);
    await page.goto('/contabilidad/cierre');
    await expect(page.getByRole('cell', { name: 'Cerrado' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reabrir' })).toHaveCount(0);
    const admin = await page.context().newPage();
    await preparar(admin, baseURL, 'ADMIN');
    await admin.goto('/contabilidad/cierre');
    await expect(admin.getByRole('button', { name: 'Reabrir' })).toHaveCount(1);
  });

  test('sin módulo contratado o con rol CAJERO no se muestra', async ({ page, baseURL }) => {
    await preparar(page, baseURL, 'CONTADOR', MODULOS.filter(m => m !== 'contabilidad'));
    await page.goto('/contabilidad');
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByTestId('contabilidad-page')).toHaveCount(0);
    const cajero = await page.context().newPage();
    await preparar(cajero, baseURL, 'CAJERO');
    await cajero.goto('/contabilidad');
    await expect(cajero.getByTestId('contabilidad-page')).toHaveCount(0);
  });

  test('móvil 390 px sin desbordamiento horizontal de la página', async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await preparar(page, baseURL);
    await page.goto('/contabilidad/reportes');
    await page.getByRole('tab', { name: 'Libro de ventas' }).click();
    await expect(page.getByRole('cell', { name: /000-001-01-00000001/ })).toBeVisible();
    const desborda = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(desborda).toBe(false);
  });

  test('el CONTADOR ve el rail con Inicio, Asientos, Reportes, Cierre y Más, y Más abre las secciones ocasionales', async ({ page, baseURL }) => {
    await preparar(page, baseURL);
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/contabilidad');
    const rail = page.getByTestId('contador-rail');
    for (const nombre of ['Inicio', 'Asientos', 'Reportes', 'Cierre']) await expect(rail.getByRole('link', { name: nombre, exact: true })).toBeVisible();
    await rail.getByRole('button', { name: 'Más' }).click();
    for (const nombre of ['Catálogo de cuentas', 'Documentos fiscales', 'Configuración fiscal', 'Excel', 'Auditoría']) await expect(page.getByRole('link', { name: nombre, exact: true }).first()).toBeVisible();
    await rail.getByRole('link', { name: 'Reportes', exact: true }).click();
    await expect(page).toHaveURL(/\/contabilidad\/reportes$/);
    await rail.getByRole('link', { name: 'Inicio', exact: true }).click();
    await expect(page).toHaveURL(/\/contabilidad$/);
    await capturar(page, 'contador-inicio-1366');
  });

  test('el ADMIN no recibe el rail del contador pero sí las secciones, con Inicio primero', async ({ page, baseURL }) => {
    await preparar(page, baseURL, 'ADMIN');
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/contabilidad/cierre');
    await expect(page.getByTestId('contador-rail')).toHaveCount(0);
    const secciones = page.getByRole('navigation', { name: 'Secciones de Contabilidad' });
    await expect(secciones.getByRole('link').first()).toHaveText('Inicio');
  });

  test('móvil: secciones en píldoras con Inicio primero, sin rail ni desbordamiento', async ({ page, baseURL }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await preparar(page, baseURL);
    await page.goto('/contabilidad/asientos');
    await expect(page.getByTestId('contador-rail')).toBeHidden();
    const secciones = page.getByRole('navigation', { name: 'Secciones de Contabilidad' });
    await expect(secciones.getByRole('link').first()).toHaveText('Inicio');
    // El contenedor principal recorta en silencio (overflow-y:auto): se comprueba él y no solo el documento.
    expect(await page.evaluate(() => { const m = document.querySelector('.main-content')!; return m.scrollWidth > m.clientWidth + 1; })).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)).toBe(false);
    await capturar(page, 'contador-asientos-390');
  });

  test('revertir un asiento pide motivo y confirmación; cancelar no envía nada', async ({ page, baseURL }) => {
    const r = await preparar(page, baseURL);
    await page.goto('/contabilidad/asientos');
    await page.getByRole('button', { name: 'Revertir', exact: true }).click();
    const form = page.getByRole('form', { name: 'Revertir el asiento 1' });
    await form.getByLabel('Motivo').fill('Registrado por error');
    await form.getByRole('button', { name: 'Revertir asiento' }).click();
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.locator('.swal2-container')).toHaveCount(0);
    expect(r.documentos).toEqual([]);
  });

  test('revertir un asiento confirmado envía la reversión con su motivo', async ({ page, baseURL }) => {
    const r = await preparar(page, baseURL);
    await page.goto('/contabilidad/asientos');
    await page.getByRole('button', { name: 'Revertir', exact: true }).click();
    const form = page.getByRole('form', { name: 'Revertir el asiento 1' });
    await form.getByLabel('Motivo').fill('Registrado por error');
    await form.getByRole('button', { name: 'Revertir asiento' }).click();
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.getByRole('status')).toContainText('Asiento 1 revertido');
    expect(r.documentos.at(-1)).toMatchObject({ ruta: '/contabilidad/asientos/a1/revertir', motivo: 'Registrado por error' });
    await capturar(page, 'contador-asientos-1366');
  });

  test('cerrar un período: muestra validaciones previas y cancelar no envía nada', async ({ page, baseURL }) => {
    const r = await preparar(page, baseURL);
    await page.goto('/contabilidad/cierre');
    await expect(page.getByTestId('validaciones-cierre')).toContainText('Cuadra');
    await page.getByLabel('Motivo').fill('Cierre mensual');
    await page.getByRole('button', { name: 'Cerrar período', exact: true }).first().click();
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.locator('.swal2-container')).toHaveCount(0);
    expect(r.documentos).toEqual([]);
    await capturar(page, 'contador-cierre-1366');
  });

  test('cerrar un período confirmado envía el motivo', async ({ page, baseURL }) => {
    const r = await preparar(page, baseURL);
    await page.goto('/contabilidad/cierre');
    await page.getByLabel('Motivo').fill('Cierre mensual');
    await page.getByRole('button', { name: 'Cerrar período', exact: true }).first().click();
    await page.getByRole('button', { name: 'Confirmar' }).click();
    await expect(page.getByRole('status')).toBeVisible();
    expect(r.documentos.at(-1)).toMatchObject({ motivo: 'Cierre mensual' });
  });

  test('libro mayor: elegir una cuenta muestra saldo inicial, movimientos y saldo final, y descarga su Excel', async ({ page, baseURL }) => {
    const r = await preparar(page, baseURL);
    await page.goto('/contabilidad/reportes');
    await expect(page.getByRole('columnheader', { name: 'Saldo inicial' })).toBeVisible();   // balanza
    await page.getByRole('tab', { name: 'Libro mayor' }).click();
    await expect(page.getByText('Elija una cuenta para ver su saldo inicial')).toBeVisible();
    await page.getByLabel('Cuenta').selectOption({ label: '1.1 Caja' });
    await expect(page.getByRole('row', { name: /Saldo inicial.*L\. 200\.00/ })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Venta de prueba' })).toBeVisible();
    await expect(page.getByRole('row', { name: /Totales.*L\. 1,350\.00/ })).toBeVisible();
    const descarga = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exportar a Excel' }).last().click();
    expect((await descarga).suggestedFilename()).toBe('mayor-2026-09.xlsx');
    expect(r.rutas.some(x => x.includes('/contabilidad/exportar/mayor'))).toBe(true);
    await capturar(page, 'contador-mayor-1366');
  });

  test('centro Excel: descarga el libro del mes y avisa que la importación llegará después', async ({ page, baseURL }) => {
    await preparar(page, baseURL);
    await page.goto('/contabilidad/excel');
    await expect(page.getByText('La importación desde Excel se habilitará más adelante')).toBeVisible();
    const descarga = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Balanza de comprobación · Excel' }).click();
    expect((await descarga).suggestedFilename()).toBe('balanza-2026-09.xlsx');
  });
});
