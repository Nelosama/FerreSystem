import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

// Carga módulos TypeScript del POS offline sin dependencias nuevas: transpila y resuelve imports relativos.
// Las operaciones de IndexedDB se prueban en navegador real (e2e-real/contingencia-real.spec.ts).
const cache = new Map();
function cargar(archivo) {
  const ruta = path.resolve(archivo);
  if (cache.has(ruta)) return cache.get(ruta);
  const codigo = ts.transpileModule(fs.readFileSync(ruta, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const modulo = { exports: {} };
  cache.set(ruta, modulo.exports);
  const requerir = (nombre) => {
    if (!nombre.startsWith('.')) throw new Error(`Dependencia no permitida en la prueba: ${nombre}`);
    return cargar(path.join(path.dirname(ruta), nombre.endsWith('.ts') ? nombre : `${nombre}.ts`));
  };
  new Function('exports', 'require', 'module', 'crypto', codigo)(modulo.exports, requerir, modulo, globalThis.crypto);
  cache.set(ruta, modulo.exports);
  return modulo.exports;
}

const money = cargar('src/offline/money.ts');
const journal = cargar('src/offline/journal.ts');
const sync = cargar('src/offline/sync.ts');

const vectores = JSON.parse(fs.readFileSync('test/fixtures/dinero-vectores.json', 'utf8'));

test('dinero: coincide con los vectores compartidos con el backend (mismos valores que backend/src/common/dinero.spec.ts)', () => {
  for (const caso of vectores.casos) assert.deepEqual(money.calcularTotales(caso.lineas), caso.esperado);
});

test('dinero: convierte texto de efectivo y cantidades sin errores de coma flotante', () => {
  assert.equal(money.aCentavos('10.30'), 1030);
  assert.equal(money.aCentavos('10,3'), 1030);
  assert.equal(money.aCentavos('0.1'), 10);
  assert.equal(money.aCentavos('1.234'), null);
  assert.equal(money.aCentavos('-5'), null);
  assert.equal(money.aCentesimas('2.75'), 275);
  assert.equal(money.aCentesimas('0'), null);
  assert.equal(money.aCentesimas('2.755'), null);
});

test('correlativo local: formato CT-NN-NNNN, secuencial y no confundible con V-NNNNNNNN', () => {
  assert.equal(journal.correlativoLocal('01', 1), 'CT-01-0001');
  assert.equal(journal.correlativoLocal('1', 125), 'CT-01-0125');
  assert.match(journal.correlativoLocal('01', 9999), /^CT-\d{2,3}-\d{4,8}$/);
});

const op = (extra = {}) => ({
  operacionId: 'a', dispositivoId: 'd', ventanaId: 'v', cajeroId: 'u1', cajeroNombre: 'Ana', cajaId: 'c', secuenciaLocal: 1,
  correlativoLocal: 'CT-01-0001', creadaAt: '2026-10-10T12:00:00Z', ocurridoAtLocal: '2026-10-10T12:00:00Z',
  lineas: [{ productoId: 'p1', codigo: 'T', nombre: 'Tornillo', cantidadCentesimas: 200, precioCentavos: 1000 }],
  subtotalCentavos: 2000, isvCentavos: 300, totalCentavos: 2300, efectivoRecibidoCentavos: 2500, cambioCentavos: 200,
  clienteNombre: '', clienteRtn: '', esquemaVersion: 1, estado: 'PENDIENTE', intentos: 0, conflictos: [], ...extra,
});

test('respuesta APLICADA: la operación pasa a sincronizada con correlativo central y conserva observaciones', () => {
  const c = sync.cambiosSegunRespuesta(op(), { operacionId: 'a', estado: 'APLICADA', numeroVenta: 125, correlativoDefinitivo: 'V-00000125', ventaId: 'a', requiereRevision: true, conflictos: [{ codigo: 'PRECIO_NO_AUTORIZADO' }] }, new Date('2026-10-10T13:00:00Z'));
  assert.equal(c.estado, 'SINCRONIZADA');
  assert.equal(c.correlativoDefinitivo, 'V-00000125');
  assert.equal(c.requiereRevision, true);
  assert.equal(c.conflictos[0].codigo, 'PRECIO_NO_AUTORIZADO');
});

test('respuesta REVISION: nunca se descarta; queda con sus conflictos', () => {
  const c = sync.cambiosSegunRespuesta(op(), { operacionId: 'a', estado: 'REVISION', conflictos: [{ codigo: 'CAJA_CERRADA' }] });
  assert.equal(c.estado, 'REVISION');
  assert.equal(c.requiereRevision, true);
  assert.equal(c.conflictos[0].codigo, 'CAJA_CERRADA');
});

test('rechazo técnico del servidor: pasa a revisión con el motivo visible, no desaparece', () => {
  const c = sync.cambiosSegunRespuesta(op(), { operacionId: 'a', estado: 'RECHAZADA_TECNICA', codigo: 'VENTANA_DESCONOCIDA', mensaje: 'Ventana de contingencia desconocida' });
  assert.equal(c.estado, 'REVISION');
  assert.equal(c.conflictos[0].codigo, 'VENTANA_DESCONOCIDA');
  assert.equal(c.conflictos[0].detalle.mensaje, 'Ventana de contingencia desconocida');
});

test('error temporal: vuelve a pendiente con reintento programado y contador de intentos', () => {
  const ahora = new Date('2026-10-10T13:00:00Z');
  const c = sync.cambiosSegunRespuesta(op({ intentos: 2 }), { operacionId: 'a', estado: 'ERROR_TEMPORAL', mensaje: 'Servidor ocupado' }, ahora);
  assert.equal(c.estado, 'PENDIENTE');
  assert.equal(c.intentos, 3);
  assert.equal(c.ultimoError, 'Servidor ocupado');
  assert.equal(new Date(c.proximoIntentoAt).getTime(), ahora.getTime() + sync.espera(3));
});

test('esperas exponenciales con tope de 60 s', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 9].map(sync.espera), [2000, 4000, 8000, 16000, 32000, 60000, 60000]);
});

test('una operación solo se reenvía cuando es pendiente y su espera venció', () => {
  assert.equal(sync.debeEnviarse(op()), true);
  assert.equal(sync.debeEnviarse(op({ estado: 'SINCRONIZADA' })), false);
  assert.equal(sync.debeEnviarse(op({ proximoIntentoAt: '2026-10-10T13:00:00Z' }), Date.parse('2026-10-10T12:59:00Z')), false);
  assert.equal(sync.debeEnviarse(op({ proximoIntentoAt: '2026-10-10T13:00:00Z' }), Date.parse('2026-10-10T13:00:01Z')), true);
});

test('solo el cajero de la operación o un administrador la envían', () => {
  assert.equal(sync.puedeEnviar(op(), { id: 'u1', rol: 'CAJERO' }), true);
  assert.equal(sync.puedeEnviar(op(), { id: 'u2', rol: 'CAJERO' }), false);
  assert.equal(sync.puedeEnviar(op(), { id: 'u2', rol: 'ADMIN' }), true);
});

test('el DTO enviado no incluye campos de sincronización ni datos internos del diario', () => {
  const dto = sync.aOperacionDto(op({ numeroVenta: 5, conflictos: [{ codigo: 'X' }], ultimoError: 'e' }));
  for (const campo of ['estado', 'intentos', 'conflictos', 'numeroVenta', 'ultimoError', 'creadaAt', 'cajeroNombre']) assert.ok(!(campo in dto), campo);
  assert.equal(dto.metodoPago, 'EFECTIVO');
  assert.equal(dto.operacionId, 'a');
});

test('vendido por producto suma solo la ventana indicada y cuenta también las no sincronizadas', () => {
  const ops = [op({ ventanaId: 'v' }), op({ operacionId: 'b', ventanaId: 'otra' }), op({ operacionId: 'c', ventanaId: 'v', estado: 'REVISION' })];
  assert.equal(journal.vendidoPorProducto(ops, 'v').get('p1'), 400);
});

test('cuenta por estado y total pendiente', () => {
  const r = journal.cuentaPorEstado([op(), op({ operacionId: 'b', estado: 'ENVIANDO', totalCentavos: 100 }), op({ operacionId: 'c', estado: 'SINCRONIZADA' }), op({ operacionId: 'd', estado: 'REVISION' })]);
  assert.deepEqual(r, { pendientes: 2, sincronizadas: 1, revision: 1, totalPendienteCentavos: 2400 });
});

test('el diario no permite modificar la carga recibida; solo campos de sincronización', async () => {
  await assert.rejects(journal.actualizarSincronizacion('a', { lineas: [] }), /no modificable/);
  await assert.rejects(journal.actualizarSincronizacion('a', { totalCentavos: 1 }), /no modificable/);
});

test('revisión resuelta en el servidor: la caja recibe la decisión (aplicada, cerrada o sin cambio)', () => {
  const enRevision = op({ estado: 'REVISION', requiereRevision: true, conflictos: [{ codigo: 'STOCK_INSUFICIENTE' }] });
  const aplicada = sync.cambiosDesdeServidor(enRevision, { operacionId: 'a', estado: 'APLICADA', numeroVenta: 9, correlativoDefinitivo: 'V-00000009', ventaId: 'a', requiereRevision: false, conflictos: [] });
  assert.equal(aplicada.estado, 'SINCRONIZADA');
  assert.equal(aplicada.correlativoDefinitivo, 'V-00000009');
  assert.equal(aplicada.requiereRevision, false);
  const cerrada = sync.cambiosDesdeServidor(enRevision, { operacionId: 'a', estado: 'RESUELTA_MANUAL' });
  assert.equal(cerrada.estado, 'SINCRONIZADA');
  assert.equal(cerrada.requiereRevision, false);
  assert.equal(sync.cambiosDesdeServidor(enRevision, { operacionId: 'a', estado: 'REVISION' }), null, 'sin cambio: no se reescribe');
});

test('revisión: una operación ya aplicada en el servidor no se vuelve a escribir', () => {
  const ya = op({ estado: 'SINCRONIZADA', requiereRevision: false, correlativoDefinitivo: 'V-00000009', sincronizadaAt: '2026-10-10T13:00:00Z' });
  assert.equal(sync.cambiosDesdeServidor(ya, { operacionId: 'a', estado: 'APLICADA', numeroVenta: 9, correlativoDefinitivo: 'V-00000009', requiereRevision: false, conflictos: [] }), null);
});
