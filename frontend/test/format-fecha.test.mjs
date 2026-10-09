/**
 * format-fecha.test.mjs
 *
 * Pruebas de formatFechaCalendario (FS-04) sobre src/utils/format.ts.
 * Usa node:test, igual que el resto de frontend/test, sin dependencias extra.
 *
 * Fija America/Tegucigalpa (UTC-6, sin horario de verano) para reproducir el
 * desplazamiento de un día que motivó el cambio. Node aplica un cambio de TZ
 * en tiempo de ejecución, por lo que no depende de la variable de entorno.
 */
process.env.TZ = 'America/Tegucigalpa';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const load = (file) => {
  const exports = {};
  const source = fs.readFileSync(file, 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  // Se pasa el Date del host: un realm de vm distinto haría fallar instanceof Date.
  vm.runInNewContext(code, { exports, Date, require: () => { throw new Error('import no esperado'); } });
  return exports;
};

const { formatFechaCalendario } = load('src/utils/format.ts');

test('TZ de la prueba es America/Tegucigalpa', () => {
  assert.equal(new Date('2026-10-09T00:00:00.000Z').getHours(), 18);
  assert.equal(new Date('2026-10-09T00:00:00.000Z').getDate(), 8);
});

test('medianoche UTC conserva el día capturado (sin desplazar a 08/10)', () => {
  assert.equal(formatFechaCalendario('2026-10-09T00:00:00.000Z'), '09/10/2026');
  assert.equal(formatFechaCalendario(new Date('2026-01-01T00:00:00.000Z')), '01/01/2026');
});

test('fecha pura y medianoche local en Tegucigalpa conservan el día', () => {
  assert.equal(formatFechaCalendario('2026-10-09'), '09/10/2026');
  assert.equal(formatFechaCalendario('2026-10-09T06:00:00.000Z'), '09/10/2026');
  assert.equal(formatFechaCalendario('2026-10-09 00:00:00'), '09/10/2026');
});

test('fecha de calendario imposible devuelve guion', () => {
  assert.equal(formatFechaCalendario('2026-99-99'), '—');
  assert.equal(formatFechaCalendario('2026-13-01'), '—');
  assert.equal(formatFechaCalendario('2026-02-30'), '—');
  assert.equal(formatFechaCalendario('2026-02-29'), '—');
  assert.equal(formatFechaCalendario('2024-02-29'), '29/02/2024');
});

test('valores vacíos, inválidos o mal formados devuelven guion', () => {
  assert.equal(formatFechaCalendario(null), '—');
  assert.equal(formatFechaCalendario(undefined), '—');
  assert.equal(formatFechaCalendario(''), '—');
  assert.equal(formatFechaCalendario('x'), '—');
  assert.equal(formatFechaCalendario('2026-10-09abc'), '—');
});

test('Date inválido no lanza excepción y devuelve guion', () => {
  assert.doesNotThrow(() => formatFechaCalendario(new Date('no-es-fecha')));
  assert.equal(formatFechaCalendario(new Date('no-es-fecha')), '—');
});
