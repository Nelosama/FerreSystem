/**
 * resumen-movil.test.mjs
 *
 * Cálculos del panel administrativo móvil (src/utils/resumenMovil.ts): ventas del día por método,
 * cuentas por pagar que vencen en 7 días (inclusive), clientes con saldo, existencias bajo mínimo y
 * solicitudes pendientes. Son funciones puras: la prueba no usa red ni navegador.
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
  vm.runInNewContext(out, { module, exports: module.exports });
  return module.exports;
}

const m = load('src/utils/resumenMovil.ts');

test('ventas del día suma por método, ordena por importe y tolera un resumen vacío', () => {
  const v = m.ventasDelDia({ metodos: [
    { metodo_pago: 'TARJETA', cantidad: 2, total: '300.50' },
    { metodo_pago: 'EFECTIVO', cantidad: 3, total: 150 },
  ] });
  assert.equal(v.cantidad, 5);
  assert.equal(v.total, 450.5);
  assert.deepEqual(v.porMetodo.map(x => x.metodo), ['TARJETA', 'EFECTIVO']);
  // El array viene de otro realm (vm): se comprueban valores, no prototipos.
  const vacio = m.ventasDelDia(null);
  assert.equal(vacio.cantidad, 0);
  assert.equal(vacio.total, 0);
  assert.equal(vacio.porMetodo.length, 0);
});

test('sumar días usa calendario real: cambio de mes, de año y bisiesto', () => {
  assert.equal(m.sumarDiasCalendario('2026-12-28', 7), '2027-01-04');
  assert.equal(m.sumarDiasCalendario('2028-02-27', 2), '2028-02-29');
  assert.equal(m.sumarDiasCalendario('2026-10-10', 0), '2026-10-10');
});

test('cuentas por pagar: vencidas y las que vencen hasta hoy + 7 (inclusive), sin saldo cero', () => {
  const hoy = '2026-10-10';
  const cuentas = [
    { nombre: 'Lejana', documento: 'A', saldo: 100, vencimiento: '2026-10-18', vencida: false },
    { nombre: 'Límite', documento: 'B', saldo: 50, vencimiento: '2026-10-17', vencida: false },
    { nombre: 'Vence hoy', documento: 'C', saldo: 75, vencimiento: '2026-10-10', vencida: false },
    { nombre: 'Vencida', documento: 'D', saldo: 20, vencimiento: '2026-10-01', vencida: true },
    { nombre: 'Pagada', documento: 'E', saldo: 0, vencimiento: '2026-10-02', vencida: false },
  ];
  assert.deepEqual(m.cuentasPorVencer(cuentas, hoy).map(c => c.documento), ['D', 'C', 'B']);
});

test('clientes con saldo: solo saldo positivo, mayor deuda primero, con límite', () => {
  const clientes = [
    { id: '1', nombre: 'Ana', saldoPendiente: '0' },
    { id: '2', nombre: 'Luis', saldoPendiente: 1200.5 },
    { id: '3', nombre: 'Marta', saldoPendiente: 300 },
  ];
  assert.deepEqual(m.clientesConSaldo(clientes).map(c => c.nombre), ['Luis', 'Marta']);
  assert.equal(m.clientesConSaldo(clientes, 1).length, 1);
});

test('existencias: incluye el mínimo exacto y ordena por mayor faltante', () => {
  const productos = [
    { id: 'a', codigo: 'A', nombre: 'Tubo', stockActual: 5, stockMinimo: 5 },
    { id: 'b', codigo: 'B', nombre: 'Clavo', stockActual: 0, stockMinimo: 10 },
    { id: 'c', codigo: 'C', nombre: 'Pintura', stockActual: 12, stockMinimo: 4 },
  ];
  assert.deepEqual(m.productosBajoStock(productos).map(p => p.nombre), ['Clavo', 'Tubo']);
});

test('solicitudes de autorización: solo las pendientes', () => {
  const pendientes = m.solicitudesPendientes([
    { id: '1', estado: 'PENDIENTE' }, { id: '2', estado: 'APROBADA' }, { id: '3', estado: 'PENDIENTE' },
  ]);
  assert.deepEqual(pendientes.map(s => s.id), ['1', '3']);
});
