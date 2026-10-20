/**
 * pendientes-inicio.test.mjs
 *
 * Contadores del inicio: validación de GET /dashboard/pendientes y estados de carga, error y sin pendientes
 * (src/utils/pendientesInicio.ts). Mismo cargador que precios.test.mjs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const load = (file) => {
  const exports = {};
  const source = fs.readFileSync(file, 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, Error, Number, String, Boolean, Math, Object, Array, Set, require: () => { throw new Error('import no esperado'); } });
  return exports;
};

const { normalizarPendientes, estadoPendientes } = load('src/utils/pendientesInicio.ts');
const plano = (valor) => JSON.parse(JSON.stringify(valor));

const respuesta = {
  generadoAt: '2026-10-18T10:00:00.000Z',
  indicadores: [
    { clave: 'contingencia_revision', cantidad: 0, ruta: '/contingencia-admin', alcance: 'NEGOCIO' },
    { clave: 'precios_pendientes', cantidad: 3, ruta: '/precios', alcance: 'NEGOCIO' },
    { clave: 'entregas_pendientes', cantidad: 2, ruta: '/entregas', alcance: 'PROPIAS' },
  ],
};

test('una respuesta válida conserva orden, cifras y rutas del servidor', () => {
  assert.deepEqual(plano(normalizarPendientes(respuesta)), respuesta.indicadores);
});

test('una respuesta sin lista de indicadores es un error, nunca «sin pendientes»', () => {
  for (const malo of [null, undefined, {}, { indicadores: 'x' }, [], 'texto']) {
    assert.throws(() => normalizarPendientes(malo));
  }
});

test('indicadores malformados se descartan sin inventar ceros', () => {
  const r = normalizarPendientes({ indicadores: [
    { clave: 'desconocida', cantidad: 1, ruta: '/x' },
    { clave: 'precios_pendientes', cantidad: '3', ruta: '/precios' },
    { clave: 'precios_pendientes', cantidad: -1, ruta: '/precios' },
    { clave: 'precios_pendientes', cantidad: 1.5, ruta: '/precios' },
    { clave: 'entregas_pendientes', cantidad: 1, ruta: 'https://otro.example/entregas' },
    { clave: 'stock_bajo_minimo', cantidad: 4, ruta: '/inventario' },
    { clave: 'stock_bajo_minimo', cantidad: 9, ruta: '/inventario' },
    null,
  ] });
  assert.deepEqual(plano(r), [{ clave: 'stock_bajo_minimo', cantidad: 4, ruta: '/inventario', alcance: 'NEGOCIO' }]);
});

test('carga, error, sin indicadores, al día y con pendientes son estados distintos', () => {
  assert.equal(estadoPendientes(null, false).tipo, 'cargando');
  assert.equal(estadoPendientes(null, true).tipo, 'error');
  assert.equal(estadoPendientes([], false).tipo, 'sin_indicadores');
  const ceros = normalizarPendientes({ indicadores: [{ clave: 'precios_pendientes', cantidad: 0, ruta: '/precios' }] });
  assert.equal(estadoPendientes(ceros, false).tipo, 'al_dia');
  const mixto = estadoPendientes(normalizarPendientes(respuesta), false);
  assert.equal(mixto.tipo, 'con_pendientes');
  assert.deepEqual(plano(mixto.activos.map(i => i.clave)), ['precios_pendientes', 'entregas_pendientes']);
  assert.deepEqual(plano(mixto.alDia.map(i => i.clave)), ['contingencia_revision']);
});

test('un fallo posterior conserva el último dato válido', () => {
  const datos = normalizarPendientes(respuesta);
  assert.equal(estadoPendientes(datos, true).tipo, 'con_pendientes');
});
