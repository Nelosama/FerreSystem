/**
 * fechas-negocio.test.mjs
 *
 * Fechas de negocio de Apartados, Transferencias, Garantías y Pedidos Especiales:
 * el día de "hoy" es el día calendario de America/Tegucigalpa, y sumar días o meses
 * se hace en aritmética de calendario. El resultado no depende de la zona del navegador.
 * Mismo cargador TypeScript que reportes-zona-horaria.test.mjs, con imports relativos.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const cache = new Map();
const load = (file) => {
  const abs = path.resolve(file);
  if (cache.has(abs)) return cache.get(abs).exports;
  const mod = { exports: {} };
  cache.set(abs, mod);
  const source = fs.readFileSync(abs, 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const req = (spec) => load(path.resolve(path.dirname(abs), spec.endsWith('.ts') ? spec : `${spec}.ts`));
  vm.runInNewContext(code, { exports: mod.exports, module: mod, Date, Intl, require: req });
  return mod.exports;
};

const { diaCalendarioEnZona, ZONA_HORARIA_NEGOCIO } = load('src/utils/format.ts');
const { sumarDiasCalendario, sumarMesesCalendario } = load('src/utils/fechasNegocio.ts');

// 2026-10-10T02:30Z = 2026-10-09 20:30 en Tegucigalpa (UTC-6, sin horario de verano).
const INSTANTE = new Date('2026-10-10T02:30:00.000Z');

/** Ejecuta fn con process.env.TZ fijado (la zona del proceso/navegador) y restaura después. */
const conZona = (tz, fn) => {
  const previa = process.env.TZ;
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    if (previa === undefined) delete process.env.TZ; else process.env.TZ = previa;
  }
};
const ZONAS_NAVEGADOR = ['UTC', 'America/Tegucigalpa', 'Asia/Tokyo', 'Pacific/Pago_Pago'];

test('zona de referencia del negocio es America/Tegucigalpa', () => {
  assert.equal(ZONA_HORARIA_NEGOCIO, 'America/Tegucigalpa');
});

test('instante 2026-10-10T02:30Z se muestra como día de negocio 2026-10-09 con cualquier zona del navegador', () => {
  for (const tz of ZONAS_NAVEGADOR) {
    conZona(tz, () => {
      assert.equal(diaCalendarioEnZona(INSTANTE), '2026-10-09', `zona del navegador ${tz}`);
    });
  }
});

test('alta de apartado: fecha de creación = hoy de negocio y límite = hoy + 30 días de calendario', () => {
  for (const tz of ZONAS_NAVEGADOR) {
    conZona(tz, () => {
      const hoy = diaCalendarioEnZona(INSTANTE);
      assert.equal(hoy, '2026-10-09', `zona ${tz}`);
      assert.equal(sumarDiasCalendario(hoy, 30), '2026-11-08', `zona ${tz}`);
    });
  }
});

test('garantía: el vencimiento cae en el mismo día de calendario de negocio tras N meses', () => {
  const hoy = diaCalendarioEnZona(INSTANTE);
  assert.equal(sumarMesesCalendario(hoy, 12), '2027-10-09');
  assert.equal(sumarMesesCalendario(hoy, 1), '2026-11-09');
  assert.equal(sumarMesesCalendario(hoy, 3), '2027-01-09');
});

test('suma de días cruza fin de mes, fin de año y febrero bisiesto', () => {
  assert.equal(sumarDiasCalendario('2026-12-31', 1), '2027-01-01');
  assert.equal(sumarDiasCalendario('2026-02-28', 1), '2026-03-01');
  assert.equal(sumarDiasCalendario('2028-02-28', 1), '2028-02-29');
  assert.equal(sumarDiasCalendario('2026-10-09', 0), '2026-10-09');
});

test('suma de meses conserva el desborde de Date.setMonth (31 ene + 1 mes = 3 mar en 2026)', () => {
  assert.equal(sumarMesesCalendario('2026-01-31', 1), '2026-03-03');
});

test('fechas de entrada no válidas se rechazan', () => {
  assert.throws(() => sumarDiasCalendario('2026-10-10T00:00:00Z', 1), /inválida/);
  assert.throws(() => sumarMesesCalendario('10/10/2026', 1), /inválida/);
});
