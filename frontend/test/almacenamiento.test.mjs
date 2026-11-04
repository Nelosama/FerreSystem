import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modulos } from './helpers/cargar-ts.mjs';

// P1-1 (AUDITORIA_OFFLINE_ALMACENAMIENTO_20261104): persistencia, cuota y mensajes de error del almacén local.
const alm = modulos()('src/offline/almacenamiento.ts');
const MiB = 1024 * 1024;
const GiB = 1024 * MiB;

const storage = ({ persisted, persist, estimate } = {}) => ({ persisted, persist, estimate });

// ───── persistencia: concedida, denegada, sin API o con error ─────
test('persistencia concedida y denegada se distinguen', async () => {
  assert.equal(await alm.leerPersistencia(storage({ persisted: async () => true })), 'concedida');
  assert.equal(await alm.leerPersistencia(storage({ persisted: async () => false })), 'no-concedida');
});
test('sin API de persistencia, no se afirma que sea persistente', async () => {
  assert.equal(await alm.leerPersistencia(undefined), 'no-soportado');
  assert.equal(await alm.leerPersistencia({}), 'no-soportado');
  assert.equal(await alm.solicitarPersistencia({}), 'no-soportado');
});
test('un error de la API de persistencia se trata como no soportado, sin rechazar', async () => {
  const roto = storage({ persisted: async () => { throw new Error('bloqueado'); }, persist: async () => { throw new Error('bloqueado'); } });
  assert.equal(await alm.leerPersistencia(roto), 'no-soportado');
  assert.equal(await alm.solicitarPersistencia(roto), 'no-soportado');
});
test('solicitar persistencia devuelve la respuesta del navegador (puede ser denegada)', async () => {
  assert.equal(await alm.solicitarPersistencia(storage({ persist: async () => true })), 'concedida');
  assert.equal(await alm.solicitarPersistencia(storage({ persist: async () => false })), 'no-concedida');
});

// ───── medición: datos válidos, ausentes o inválidos ─────
test('medición válida devuelve uso y cuota', async () => {
  assert.deepEqual(await alm.medirAlmacenamiento(storage({ estimate: async () => ({ usage: 5 * MiB, quota: GiB }) })), { usadoBytes: 5 * MiB, cuotaBytes: GiB });
});
for (const [nombre, respuesta] of [
  ['sin API', undefined],
  ['estimate rechaza', 'rechaza'],
  ['usage ausente', { quota: GiB }],
  ['quota cero', { usage: 1, quota: 0 }],
  ['usage negativo', { usage: -1, quota: GiB }],
  ['valores no numéricos', { usage: 'mucho', quota: GiB }],
  ['NaN', { usage: NaN, quota: GiB }],
]) {
  test(`medición no disponible (${nombre}) devuelve null, nunca una cifra inventada`, async () => {
    const st = respuesta === undefined ? {} : storage({ estimate: respuesta === 'rechaza' ? async () => { throw new Error('x'); } : async () => respuesta });
    assert.deepEqual(await alm.medirAlmacenamiento(st), { usadoBytes: null, cuotaBytes: null });
  });
}

// ───── niveles de la política (§5.3) ─────
test('nivel ok con mucho espacio libre y uso bajo', () => {
  assert.deepEqual(alm.nivelDeAlmacen(MiB, 10 * GiB), { nivel: 'ok', libreBytes: 10 * GiB - MiB });
});
test('nivel aviso con menos de 200 MiB libres', () => {
  assert.equal(alm.nivelDeAlmacen(GiB - 150 * MiB, GiB).nivel, 'aviso');
});
test('nivel aviso con uso superior al 70 % aunque haya más de 200 MiB libres', () => {
  assert.equal(alm.nivelDeAlmacen(8 * GiB, 10 * GiB).nivel, 'aviso');
});
test('nivel crítico con menos de 50 MiB libres', () => {
  assert.equal(alm.nivelDeAlmacen(GiB - 10 * MiB, GiB).nivel, 'critico');
});
test('uso exactamente en el umbral de crítico no bloquea (menos de 50 MiB estrictamente)', () => {
  assert.equal(alm.nivelDeAlmacen(GiB - 50 * MiB, GiB).nivel, 'aviso');
});
test('sin medición el nivel es desconocido: se avisa, no se bloquea', () => {
  assert.deepEqual(alm.nivelDeAlmacen(null, null), { nivel: 'desconocido', libreBytes: null });
});
test('uso mayor que la cuota no produce libre negativo', () => {
  assert.equal(alm.nivelDeAlmacen(2 * GiB, GiB).libreBytes, 0);
  assert.equal(alm.nivelDeAlmacen(2 * GiB, GiB).nivel, 'critico');
});

// ───── estado completo: nunca rechaza ─────
test('leerEstadoAlmacenamiento combina persistencia, uso y nivel', async () => {
  const e = await alm.leerEstadoAlmacenamiento(storage({ persisted: async () => false, estimate: async () => ({ usage: 9.99 * GiB, quota: 10 * GiB }) }));
  assert.equal(e.persistencia, 'no-concedida');
  assert.equal(e.nivel, 'critico');
});
test('leerEstadoAlmacenamiento no rechaza aunque todo falle', async () => {
  const roto = storage({ persisted: async () => { throw new Error('x'); }, estimate: async () => { throw new Error('y'); } });
  const e = await alm.leerEstadoAlmacenamiento(roto);
  assert.deepEqual([e.persistencia, e.nivel, e.usadoBytes, e.cuotaBytes], ['no-soportado', 'desconocido', null, null]);
});

// ───── errores de escritura: cuota frente a otros fallos ─────
test('QuotaExceededError (y sus equivalentes) se reconoce como espacio lleno', () => {
  assert.equal(alm.esCuotaAgotada({ name: 'QuotaExceededError' }), true);
  assert.equal(alm.esCuotaAgotada({ name: 'NS_ERROR_DOM_QUOTA_REACHED' }), true);
  assert.equal(alm.esCuotaAgotada({ code: 22 }), true);
  assert.equal(alm.motivoFalloLocal(Object.assign(new Error('cuota'), { name: 'QuotaExceededError' })), 'espacio lleno');
});
test('otros fallos no se describen como espacio lleno', () => {
  for (const error of [new Error('AbortError'), { name: 'AbortError' }, null, undefined, 'texto', { code: 7 }]) {
    assert.equal(alm.esCuotaAgotada(error), false);
    assert.equal(alm.motivoFalloLocal(error), 'error local');
  }
});
