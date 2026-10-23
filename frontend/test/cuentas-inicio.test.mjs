/**
 * cuentas-inicio.test.mjs
 *
 * Resumen de cuentas por cobrar y por pagar del inicio del administrador (src/utils/cuentasInicio.ts).
 * Funciones puras: sin red ni navegador. Verifica que solo cuenten las cuentas con saldo abierto, que la
 * respuesta malformada sea un error (nunca un cero) y los días calendario del próximo vencimiento.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(file) {
  const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(out, { module, exports: module.exports, Error, Array, Number, Math, Date });
  return module.exports;
}

const m = load('src/utils/cuentasInicio.ts');

test('solo cuentan las cuentas con saldo abierto y se suman a centavos', () => {
  const r = m.resumirCuentas([
    { saldo: 250.1, vencida: false, vencimiento: '2026-11-05T00:00:00.000Z' },
    { saldo: '100.2', vencida: false, vencimiento: '2026-10-30T00:00:00.000Z' },
    { saldo: 0, vencida: false, vencimiento: '2026-10-01T00:00:00.000Z', estado: 'PAGADA' },
    { saldo: -5, vencida: false },
  ]);
  assert.equal(r.abiertas, 2);
  assert.equal(r.saldo, 350.3);
  assert.equal(r.vencidas, 0);
  assert.equal(r.proximoVencimiento, '2026-10-30');
});

test('las vencidas se cuentan aparte y no definen el próximo vencimiento', () => {
  const r = m.resumirCuentas([
    { saldo: 400, vencida: true, vencimiento: '2026-10-01T00:00:00.000Z' },
    { saldo: 150.5, vencida: true, vencimiento: '2026-10-10T00:00:00.000Z' },
    { saldo: 90, vencida: false, vencimiento: '2026-12-01T00:00:00.000Z' },
  ]);
  assert.equal(r.abiertas, 3);
  assert.equal(r.vencidas, 2);
  assert.equal(r.saldoVencido, 550.5);
  assert.equal(r.saldo, 640.5);
  assert.equal(r.proximoVencimiento, '2026-12-01');
});

test('sin cuentas abiertas devuelve ceros y ningún vencimiento; no inventa datos', () => {
  assert.deepEqual({ ...m.resumirCuentas([]) }, { abiertas: 0, saldo: 0, vencidas: 0, saldoVencido: 0, proximoVencimiento: null });
  assert.deepEqual({ ...m.resumirCuentas([{ saldo: 0 }]) }, { abiertas: 0, saldo: 0, vencidas: 0, saldoVencido: 0, proximoVencimiento: null });
});

test('las filas malformadas se descartan y una respuesta que no es lista es un error', () => {
  const r = m.resumirCuentas([null, 'x', { saldo: 'abc' }, { saldo: '' }, { saldo: 75, vencida: false }]);
  assert.equal(r.abiertas, 1);
  assert.equal(r.saldo, 75);
  for (const mala of [null, undefined, {}, 'texto', 42, { indicadores: [] }]) {
    assert.throws(() => m.resumirCuentas(mala), /no válida/);
  }
});

test('un vencimiento sin formato de día no cuenta como próximo', () => {
  const r = m.resumirCuentas([{ saldo: 10, vencida: false, vencimiento: 'mañana' }, { saldo: 10, vencida: false, vencimiento: null }]);
  assert.equal(r.abiertas, 2);
  assert.equal(r.proximoVencimiento, null);
});

test('días entre fechas calendario y formato de fecha del negocio', () => {
  assert.equal(m.diasEntre('2026-10-23', '2026-10-23'), 0);
  assert.equal(m.diasEntre('2026-10-23', '2026-10-24'), 1);
  assert.equal(m.diasEntre('2026-10-30', '2026-11-02'), 3);
  assert.equal(m.diasEntre('2026-10-23', '2026-10-20'), -3);
  assert.equal(m.fechaCorta('2026-11-05'), '05/11/2026');
  assert.equal(m.fechaCorta('2026-11-05T00:00:00.000Z'), '05/11/2026');
});
