import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { calcularTotales, subtotalLinea } from './dinero';

const vectores = JSON.parse(readFileSync('test/fixtures/dinero-vectores.json', 'utf8'));

describe('dinero en centavos', () => {
  it(`coincide con los ${vectores.casos.length} vectores generados de forma independiente`, () => {
    for (const caso of vectores.casos) expect(calcularTotales(caso.lineas)).toEqual(caso.esperado);
  });
  it('redondea mitad hacia arriba de forma exacta (10.30 → ISV 1.55, no 1.54 por coma flotante)', () => {
    expect(calcularTotales([{ precioCentavos: 1030, cantidadCentesimas: 100 }])).toEqual({ lineas: [1030], subtotal: 1030, isv: 155, total: 1185 });
  });
  it('cantidades decimales: 2.75 u × 25.50', () => {
    expect(subtotalLinea(2550, 275)).toBe(7013); // 70.125 → 70.13
  });
  it('rechaza valores no enteros, negativos o descuento mayor al subtotal', () => {
    expect(() => subtotalLinea(10.5, 100)).toThrow(RangeError);
    expect(() => subtotalLinea(-1, 100)).toThrow(RangeError);
    expect(() => calcularTotales([{ precioCentavos: 100, cantidadCentesimas: 100 }], 101)).toThrow(RangeError);
  });
});
