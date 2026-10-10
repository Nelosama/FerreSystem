/**
 * garantias-dias.test.mjs
 *
 * Garantías en días calendario de America/Tegucigalpa. El vencimiento es fecha de venta +
 * días. No se interpretan meses ni se convierten registros anteriores.
 * Mismo cargador TypeScript que fechas-negocio.test.mjs.
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
  vm.runInNewContext(code, { exports: mod.exports, module: mod, Date, Intl, crypto: globalThis.crypto, require: req });
  return mod.exports;
};

const { diaCalendarioEnZona } = load('src/utils/format.ts');
const { formatearFechaNegocio } = load('src/utils/fechasNegocio.ts');
const { DIAS_GARANTIA_MAX, validarDiasGarantia, vencimientoGarantia, generarSolicitudId } = load('src/utils/garantias.ts');

// 2026-10-10T02:30Z = 2026-10-09 20:30 en Tegucigalpa (UTC-6, sin horario de verano).
const INSTANTE = new Date('2026-10-10T02:30:00.000Z');
const ZONAS_NAVEGADOR = ['UTC', 'Asia/Tokyo', 'America/Tegucigalpa', 'Pacific/Pago_Pago'];

const conZona = (tz, fn) => {
  const previa = process.env.TZ;
  process.env.TZ = tz;
  try { return fn(); } finally {
    if (previa === undefined) delete process.env.TZ; else process.env.TZ = previa;
  }
};

test('valida días: enteros positivos entre 1 y el límite técnico', () => {
  assert.equal(validarDiasGarantia('30'), 30);
  assert.equal(validarDiasGarantia('90'), 90);
  assert.equal(validarDiasGarantia('180'), 180);
  assert.equal(validarDiasGarantia('365'), 365);
  assert.equal(validarDiasGarantia(' 30 '), 30);
  assert.equal(validarDiasGarantia('1'), 1);
  assert.equal(validarDiasGarantia(String(DIAS_GARANTIA_MAX)), DIAS_GARANTIA_MAX);
});

test('rechaza cero, negativos, decimales, notación científica, texto y vacío', () => {
  for (const malo of ['', '0', '-5', '+30', '30.5', '1e3', 'abc', '30 días', '3651', '99999999999999999999']) {
    assert.equal(validarDiasGarantia(malo), null, `debe rechazar "${malo}"`);
  }
});

test('vencimiento = fecha de venta + días calendario (30, 90, 180, 365)', () => {
  assert.equal(vencimientoGarantia('2026-10-09', 30), '2026-11-08');
  assert.equal(vencimientoGarantia('2026-10-09', 90), '2027-01-07');
  assert.equal(vencimientoGarantia('2026-10-09', 180), '2027-04-07');
  assert.equal(vencimientoGarantia('2026-10-09', 365), '2027-10-09');
});

test('cambio de mes: 31 ene + 30 días = 2 mar (no se usa el último día del mes)', () => {
  assert.equal(vencimientoGarantia('2026-01-31', 30), '2026-03-02');
  assert.equal(vencimientoGarantia('2026-02-27', 1), '2026-02-28');
});

test('cambio de año: 31 dic + 1 día = 1 ene', () => {
  assert.equal(vencimientoGarantia('2026-12-31', 1), '2027-01-01');
  assert.equal(vencimientoGarantia('2026-10-09', 365), '2027-10-09');
});

test('año bisiesto: 28 feb 2028 + 1 = 29 feb; 28 feb 2027 + 1 = 1 mar', () => {
  assert.equal(vencimientoGarantia('2028-02-28', 1), '2028-02-29');
  assert.equal(vencimientoGarantia('2028-02-28', 2), '2028-03-01');
  assert.equal(vencimientoGarantia('2027-02-28', 1), '2027-03-01');
});

test('365 días desde 9 oct 2027 cruza el 29 feb 2028 y vence el 8 oct 2028', () => {
  assert.equal(vencimientoGarantia('2027-10-09', 365), '2028-10-08');
  assert.equal(vencimientoGarantia('2028-01-01', 366), '2029-01-01');
});

test('la vista previa usa la fecha de la factura y no la del navegador', () => {
  // La fecha de la factura es un dato, no el día actual: el vencimiento depende solo de ella.
  assert.equal(vencimientoGarantia('2026-10-09', 30), '2026-11-08');
  for (const tz of ZONAS_NAVEGADOR) conZona(tz, () => assert.equal(vencimientoGarantia('2026-10-09', 30), '2026-11-08', `zona ${tz}`));
});

test('la fecha de inicio es el día de negocio, sin desplazarse por la zona del navegador', () => {
  for (const tz of ZONAS_NAVEGADOR) {
    conZona(tz, () => {
      const inicio = diaCalendarioEnZona(INSTANTE);
      assert.equal(inicio, '2026-10-09', `zona ${tz}`);
      assert.equal(vencimientoGarantia(inicio, 30), '2026-11-08', `zona ${tz}`);
      assert.equal(formatearFechaNegocio(inicio, 'es'), '9 oct 2026', `zona ${tz}`);
      assert.equal(formatearFechaNegocio(vencimientoGarantia(inicio, 30), 'es'), '8 nov 2026', `zona ${tz}`);
    });
  }
});

test('generarSolicitudId produce UUID v4 distintos', () => {
  const a = generarSolicitudId();
  const b = generarSolicitudId();
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(a, b);
});
