import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(fs.existsSync('src/pages/ClientesPage.tsx') ? 'src/pages/ClientesPage.tsx' : 'frontend/src/pages/ClientesPage.tsx', 'utf8');

test('FS-02: Clientes administra el crédito mediante PATCH /clientes/:id/credito', () => {
  assert.match(src, /api\.patch\(`\/clientes\/\$\{clienteCredito\.id\}\/credito`/);
  assert.match(src, /creditoHabilitado: creditoActivo, limiteCredito: limite/);
  assert.match(src, /abrirCredito\(c\)/);
});

test('FS-02: límite vacío significa sin límite (null) y se rechazan negativos', () => {
  assert.match(src, /texto === '' \? null : Number\(texto\)/);
  assert.match(src, /limite < 0/);
});

// JW-05: el plazo de crédito (plazoCreditoDias) del backend no tenía campo en la interfaz: ninguna factura vencía.
import vm from 'node:vm';
import ts from 'typescript';
const plazoSrc = fs.readFileSync(fs.existsSync('src/utils/plazoCredito.ts') ? 'src/utils/plazoCredito.ts' : 'frontend/src/utils/plazoCredito.ts', 'utf8');
const plazoMod = { exports: {} };
vm.runInNewContext(ts.transpileModule(plazoSrc, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { module: plazoMod, exports: plazoMod.exports });
const { leerPlazoCredito } = plazoMod.exports;

test('JW-05: plazo vacío = sin plazo; entero 1–365 aceptado; decimales, cero, negativos y >365 rechazados', () => {
  assert.deepEqual({ ...leerPlazoCredito('  ') }, { ok: true, valor: null });
  assert.deepEqual({ ...leerPlazoCredito('30') }, { ok: true, valor: 30 });
  assert.deepEqual({ ...leerPlazoCredito('365') }, { ok: true, valor: 365 });
  for (const malo of ['0', '366', '-5', '15.5', 'treinta']) assert.equal(leerPlazoCredito(malo).ok, false, malo);
});

test('JW-05: el modal de crédito envía plazoCreditoDias y valida antes de guardar', () => {
  assert.match(src, /plazoCreditoDias: plazo\.valor/);
  assert.match(src, /const plazo = leerPlazoCredito\(creditoPlazo\)/);
  assert.match(src, /if \(!plazo\.ok\)/);
});
