import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

// Comprobante interno de contingencia: modelo puro, sin navegador. La impresión y la reimpresión desde el diario
// se prueban en frontend/e2e/contingencia-simulado.spec.ts.
const cache = new Map();
function cargar(archivo) {
  const ruta = path.resolve(archivo);
  if (cache.has(ruta)) return cache.get(ruta);
  const codigo = ts.transpileModule(fs.readFileSync(ruta, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const modulo = { exports: {} };
  cache.set(ruta, modulo.exports);
  const requerir = (nombre) => {
    if (!nombre.startsWith('.')) throw new Error(`Dependencia no permitida en la prueba: ${nombre}`);
    return cargar(path.join(path.dirname(ruta), nombre.endsWith('.ts') ? nombre : `${nombre}.ts`));
  };
  new Function('exports', 'require', 'module', codigo)(modulo.exports, requerir, modulo);
  cache.set(ruta, modulo.exports);
  return modulo.exports;
}

const money = cargar('src/offline/money.ts');
const comprobante = cargar('src/offline/comprobante.ts');

/** Operación local con totales calculados por el mismo código que usa la pantalla. */
function operacion(lineas, { efectivo, descuento = 0, ferreteria, cliente = '' } = {}) {
  const totales = money.calcularTotales(lineas.map((l) => ({ precioCentavos: l.precioCentavos, cantidadCentesimas: l.cantidadCentesimas })), descuento);
  const recibido = efectivo ?? Math.ceil(totales.total / 100) * 100;
  return {
    operacionId: '6f1c2b7e-0000-4000-8000-000000000001',
    dispositivoId: 'd', ventanaId: 'v', cajeroId: 'c', cajeroNombre: 'María López', cajaId: 'caja',
    secuenciaLocal: 7, correlativoLocal: 'CT-01-0007',
    creadaAt: '2026-10-10T20:15:00.000Z', ocurridoAtLocal: '2026-10-10T20:14:00.000Z',
    lineas: lineas.map((l) => ({ productoId: l.productoId, codigo: l.codigo, nombre: l.nombre, cantidadCentesimas: l.cantidadCentesimas, precioCentavos: l.precioCentavos })),
    subtotalCentavos: totales.subtotal, isvCentavos: totales.isv, totalCentavos: totales.total,
    efectivoRecibidoCentavos: recibido, cambioCentavos: recibido - totales.total,
    clienteNombre: cliente, clienteRtn: '', esquemaVersion: 1,
    estado: 'PENDIENTE', intentos: 0, conflictos: [],
    ...(ferreteria !== undefined ? { ferreteria } : {}),
  };
}

const tornillos = { productoId: 'p1', codigo: 'TOR-1', nombre: 'Tornillo 2 pulgadas', cantidadCentesimas: 250, precioCentavos: 1000 };
const bisagra = { productoId: 'p2', codigo: 'BIS-9', nombre: 'Bisagra cromada', cantidadCentesimas: 100, precioCentavos: 2550 };

test('el comprobante incluye ferretería, CT, fecha, cajero, código, descripción, cantidades, precios, subtotales, total, efectivo y cambio', () => {
  const op = operacion([tornillos, bisagra], { efectivo: 6000, ferreteria: 'Ferretería El Clavo' });
  const c = comprobante.construirComprobante(op, 'otro nombre');
  assert.equal(c.ferreteria, 'Ferretería El Clavo');
  assert.equal(c.correlativo, 'CT-01-0007');
  assert.equal(c.fechaHora, new Date(op.ocurridoAtLocal).toLocaleString('es-HN', { dateStyle: 'short', timeStyle: 'short' }));
  assert.equal(c.cajero, 'María López');
  assert.equal(c.cliente, 'Consumidor final');
  assert.deepEqual(c.lineas.map((l) => [l.codigo, l.nombre, l.cantidad, l.precioUnitario, l.subtotal]), [
    ['TOR-1', 'Tornillo 2 pulgadas', '2.5', 'L 10.00', 'L 25.00'],
    ['BIS-9', 'Bisagra cromada', '1', 'L 25.50', 'L 25.50'],
  ]);
  assert.equal(c.subtotal, 'L 50.50');
  assert.equal(c.isv, 'L 7.58');
  assert.equal(c.total, 'L 58.08');
  assert.equal(c.efectivo, 'L 60.00');
  assert.equal(c.cambio, 'L 1.92');
});

test('indica con claridad que es un comprobante interno de contingencia y no una factura fiscal', () => {
  const c = comprobante.construirComprobante(operacion([tornillos]), 'X');
  assert.equal(c.titulo, 'COMPROBANTE INTERNO DE CONTINGENCIA');
  assert.match(c.aviso, /NO ES FACTURA FISCAL/);
  assert.doesNotMatch(JSON.stringify(c), /CAI|RTN del emisor|factura N/i);
});

test('la suma de los subtotales de línea coincide con el subtotal de la operación, sin descuentos', () => {
  const op = operacion([tornillos, bisagra, { productoId: 'p3', codigo: 'X', nombre: 'Clavo', cantidadCentesimas: 333, precioCentavos: 333 }]);
  const c = comprobante.construirComprobante(op, 'X');
  const sumaCentavos = c.lineas.reduce((acc, l) => acc + Math.round(Number(l.subtotal.replace(/[^\d.]/g, '')) * 100), 0);
  assert.equal(sumaCentavos, op.subtotalCentavos);
});

test('redondeo de línea mitad hacia arriba: 3.33 x L 3.33 = L 11.09', () => {
  const c = comprobante.construirComprobante(operacion([{ productoId: 'p', codigo: 'C', nombre: 'Clavo', cantidadCentesimas: 333, precioCentavos: 333 }]), 'X');
  assert.equal(c.lineas[0].subtotal, 'L 11.09');
});

test('reimprimir la misma operación produce exactamente el mismo comprobante', () => {
  const op = operacion([tornillos], { ferreteria: 'Ferretería El Clavo' });
  assert.deepEqual(comprobante.construirComprobante(op, 'X'), comprobante.construirComprobante(structuredClone(op), 'Y'));
});

test('sin nombre de ferretería en la operación usa el del equipo; sin cliente indica consumidor final', () => {
  const c = comprobante.construirComprobante(operacion([tornillos]), 'Ferretería del equipo');
  assert.equal(c.ferreteria, 'Ferretería del equipo');
  assert.equal(c.cliente, 'Consumidor final');
});

test('una fecha inválida no rompe la impresión: se muestra el valor guardado', () => {
  const op = { ...operacion([tornillos]), ocurridoAtLocal: 'no-es-fecha' };
  assert.equal(comprobante.construirComprobante(op, 'X').fechaHora, 'no-es-fecha');
});

test('construir el comprobante no modifica la operación guardada', () => {
  const op = operacion([tornillos, bisagra]);
  const antes = structuredClone(op);
  comprobante.construirComprobante(op, 'X');
  assert.deepEqual(op, antes);
});
