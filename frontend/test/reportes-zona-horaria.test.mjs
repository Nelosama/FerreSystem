/**
 * reportes-zona-horaria.test.mjs
 *
 * FS-05: el rango por defecto de Reportes y el día "hoy" deben seguir el día
 * calendario de America/Tegucigalpa, no el día UTC (toISOString).
 * Sigue el mismo cargador que format-fecha.test.mjs (node:test, sin dependencias extra).
 */
process.env.TZ = 'UTC';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const load = (file) => {
  const exports = {};
  const source = fs.readFileSync(file, 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, Date, Intl, require: () => { throw new Error('import no esperado'); } });
  return exports;
};

const { diaCalendarioEnZona, ZONA_HORARIA_NEGOCIO } = load('src/utils/format.ts');

test('zona de referencia del negocio es America/Tegucigalpa', () => {
  assert.equal(ZONA_HORARIA_NEGOCIO, 'America/Tegucigalpa');
});

test('a las 20:30 locales (02:30 UTC del día siguiente) el día es el local, no el UTC', () => {
  // 2026-10-10T02:30Z = 2026-10-09 20:30 en Tegucigalpa
  assert.equal(diaCalendarioEnZona(new Date('2026-10-10T02:30:00.000Z')), '2026-10-09');
  // Con toISOString el mismo instante daría 2026-10-10: es el error que corrige FS-05.
  assert.equal(new Date('2026-10-10T02:30:00.000Z').toISOString().slice(0, 10), '2026-10-10');
});

test('cambio de día exacto a medianoche local', () => {
  assert.equal(diaCalendarioEnZona(new Date('2026-10-10T05:59:59.999Z')), '2026-10-09');
  assert.equal(diaCalendarioEnZona(new Date('2026-10-10T06:00:00.000Z')), '2026-10-10');
});

test('cambio de mes en la zona del negocio (31 oct 19:00 local = 1 nov UTC)', () => {
  assert.equal(diaCalendarioEnZona(new Date('2026-11-01T01:00:00.000Z')), '2026-10-31');
});

test('la zona se puede cambiar por empresa sin tocar la función', () => {
  assert.equal(diaCalendarioEnZona(new Date('2026-10-10T02:30:00.000Z'), 'UTC'), '2026-10-10');
});
