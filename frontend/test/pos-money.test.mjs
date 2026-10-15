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
