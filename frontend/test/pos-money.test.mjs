import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

function cargar(file) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('exports', 'require', code)(exports, name => cargar(path.resolve(path.dirname(file), name + '.ts')));
  return exports;
}
const pos = cargar('src/utils/posMoney.ts');
const offline = cargar('src/offline/money.ts');
const backend = cargar('../backend/src/common/dinero.ts');

test('POS, offline y backend coinciden en 10000 carritos con cantidades decimales y descuento', () => {
  let semilla = 166;
  const random = max => { semilla = (Math.imul(semilla, 1664525) + 1013904223) >>> 0; return semilla % max; };
  for (let caso = 0; caso < 10000; caso++) {
    const lineas = Array.from({ length: 1 + random(5) }, () => ({ precioCentavos: 1 + random(100000000), cantidadCentesimas: 1 + random(1000) }));
    const porcentajeCentesimas = random(10001);
    const bruto = backend.calcularTotales(lineas).subtotal;
    const descuento = Number((BigInt(bruto) * BigInt(porcentajeCentesimas) + 5000n) / 10000n);
    const esperado = backend.calcularTotales(lineas, descuento);
    const actual = pos.calcularVentaPOS(lineas.map(l => ({ precioUnitario: l.precioCentavos / 100, cantidad: l.cantidadCentesimas / 100 })), porcentajeCentesimas / 100);
    assert.deepEqual(offline.calcularTotales(lineas, descuento), esperado);
    for (const clave of ['lineas', 'subtotal', 'isv', 'total']) assert.deepEqual(actual[clave], esperado[clave]);
    assert.equal(actual.descuento, descuento);
  }
});

test('el porcentaje no se redondea antes de calcular el descuento', () => {
  assert.equal(pos.calcularVentaPOS([{ precioUnitario: 100, cantidad: 1 }], 33.333).descuento, 3333);
  assert.equal(pos.calcularVentaPOS([{ precioUnitario: 1000000000, cantidad: 1 }], 1e-7).descuento, 100);
  assert.equal(pos.calcularVentaPOS([{ precioUnitario: 9900000050.01, cantidad: 1 }], 99.99).descuento, 989901005000);
});

test('el vuelto del POS en línea se calcula en centavos con la lectura de importes de contingencia', () => {
  assert.deepEqual(pos.calcularVuelto('', 11500), { estado: 'VACIO' });
  assert.deepEqual(pos.calcularVuelto('   ', 11500), { estado: 'VACIO' });
  assert.deepEqual(pos.calcularVuelto('abc', 11500), { estado: 'INVALIDO' });
  assert.deepEqual(pos.calcularVuelto('-5', 11500), { estado: 'INVALIDO' });
  assert.deepEqual(pos.calcularVuelto('10.555', 11500), { estado: 'INVALIDO' });
  assert.deepEqual(pos.calcularVuelto('100', 11500), { estado: 'FALTA', centavos: 1500 });
  assert.deepEqual(pos.calcularVuelto('115', 11500), { estado: 'CAMBIO', recibidoCentavos: 11500, centavos: 0 });
  assert.deepEqual(pos.calcularVuelto('200,50', 11500), { estado: 'CAMBIO', recibidoCentavos: 20050, centavos: 8550 });
  // 0.1 + 0.2 en coma flotante no altera el cambio: todo es entero.
  const { total } = pos.calcularVentaPOS([{ precioUnitario: 0.1, cantidad: 1 }, { precioUnitario: 0.2, cantidad: 1 }], 0);
  assert.deepEqual(pos.calcularVuelto('1', total), { estado: 'CAMBIO', recibidoCentavos: 100, centavos: 100 - total });
});
