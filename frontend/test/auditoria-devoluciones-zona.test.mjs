/**
 * auditoria-devoluciones-zona.test.mjs
 *
 * Auditoría y Devoluciones muestran el instante del servidor (created_at) en la zona del
 * negocio, no en la del navegador. Mismo cargador TypeScript que fechas-negocio.test.mjs.
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

const { formatInstanteNegocio } = load('src/utils/format.ts');

// 2026-10-10T02:30Z = 2026-10-09 20:30 en Tegucigalpa.
const INSTANTE = '2026-10-10T02:30:00.000Z';

const conZona = (tz, fn) => {
  const previa = process.env.TZ;
  process.env.TZ = tz;
  try { return fn(); } finally {
    if (previa === undefined) delete process.env.TZ; else process.env.TZ = previa;
  }
};
const ZONAS_NAVEGADOR = ['UTC', 'Asia/Tokyo', 'America/Tegucigalpa', 'Pacific/Pago_Pago'];

test('created_at se muestra a la hora de negocio (20:30 del 9 oct), no a la del navegador', () => {
  for (const tz of ZONAS_NAVEGADOR) {
    conZona(tz, () => {
      const texto = formatInstanteNegocio(INSTANTE);
      assert.match(texto, /9\/10\/2026/, `zona ${tz}: ${texto}`);
      assert.match(texto, /8:30:00/, `zona ${tz}: ${texto}`);
      // Intl usa espacios distintos según la versión (U+0020 o U+202F); se compara la hora y la fecha.
      assert.match(texto, /^9\/10\/2026, 8:30:00\s?p\.\s?m\.$/u, `zona ${tz}`);
    });
  }
});

test('acepta Date además de cadena ISO', () => {
  assert.equal(formatInstanteNegocio(new Date(INSTANTE)), formatInstanteNegocio(INSTANTE));
});

test('valor vacío o inválido devuelve guion', () => {
  assert.equal(formatInstanteNegocio('no-es-fecha'), '—');
});
