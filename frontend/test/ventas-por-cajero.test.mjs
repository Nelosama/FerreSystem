import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const exports = {};
new Function('exports', ts.transpileModule(fs.readFileSync('src/utils/ventasPorCajero.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(exports);
const { agruparVentasPorCajero } = exports;

test('agrupa ventas por cajero y método en centavos, con el mayor total primero', () => {
  const r = agruparVentasPorCajero([
    { usuario_id: 'u1', usuario_nombre: 'Luis', metodo_pago: 'EFECTIVO', cantidad: 2, total: '0.10' },
    { usuario_id: 'u1', usuario_nombre: 'Luis', metodo_pago: 'TARJETA', cantidad: 1, total: '0.20' },
    { usuario_id: 'u2', usuario_nombre: 'Ana', metodo_pago: 'CREDITO', cantidad: 3, total: 1500 },
  ]);
  assert.deepEqual(r, [
    { usuarioId: 'u2', nombre: 'Ana', cantidad: 3, totalCentavos: 150000, porMetodo: { CREDITO: 150000 } },
    { usuarioId: 'u1', nombre: 'Luis', cantidad: 3, totalCentavos: 30, porMetodo: { EFECTIVO: 10, TARJETA: 20 } },
  ]);
});

test('sin datos (o servidor anterior sin la dimensión) devuelve lista vacía', () => {
  assert.deepEqual(agruparVentasPorCajero(undefined), []);
  assert.deepEqual(agruparVentasPorCajero([]), []);
});
