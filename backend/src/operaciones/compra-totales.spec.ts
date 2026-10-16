import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { calcularTotalesCompra } from './compra-totales';

// JW-07: los importes de compra se calculan en centavos enteros (mitad hacia arriba), no en coma flotante.
describe('calcularTotalesCompra (JW-07)', () => {
  it('2.5 × L 25.99 da L 64.98 y no L 64.97 (defecto de coma flotante)', () => {
    const t = calcularTotalesCompra([{ cantidad: 2.5, costo: 25.99 }], 9.75);
    expect(t.lineas).toEqual([64.98]);
    expect(t.subtotal).toBe(64.98);
    expect(t.isv).toBe(9.75);
    expect(t.total).toBe(74.73);
  });

  it('la suma de líneas coincide con el subtotal y no se pierde ningún centavo', () => {
    const t = calcularTotalesCompra(
      [
        { cantidad: 2.5, costo: 25.99 },
        { cantidad: 1, costo: 0.29 },
        { cantidad: 3, costo: 0.07 },
      ],
      0,
    );
    expect(t.lineas).toEqual([64.98, 0.29, 0.21]);
    expect(t.subtotal).toBe(65.48);
    expect(t.total).toBe(65.48);
  });

  it('redondea .5 de centavo hacia arriba en casos típicos (1.5 × 0.05 = 0.08)', () => {
    expect(calcularTotalesCompra([{ cantidad: 1.5, costo: 0.05 }], 0).subtotal).toBe(0.08);
  });

  it('cantidad fraccionaria pequeña se redondea al centavo (0.01 × 0.01 = 0.00)', () => {
    expect(calcularTotalesCompra([{ cantidad: 0.01, costo: 0.01 }], 0).subtotal).toBe(0);
  });

  it('importes elevados mantienen centavos exactos (1234567.89 × 3.5 = 4320987.62)', () => {
    const t = calcularTotalesCompra([{ cantidad: 3.5, costo: 1234567.89 }], 0);
    expect(t.subtotal).toBe(4320987.62);
  });

  it('el ISV recibido se valida como importe y se suma sin recalcularlo', () => {
    const t = calcularTotalesCompra([{ cantidad: 1, costo: 100 }], 15);
    expect(t.total).toBe(115);
  });

  it('rechaza más de dos decimales en costo o cantidad en vez de redondear en silencio', () => {
    expect(() => calcularTotalesCompra([{ cantidad: 1, costo: 25.999 }], 0)).toThrow(BadRequestException);
    expect(() => calcularTotalesCompra([{ cantidad: 1.001, costo: 1 }], 0)).toThrow(BadRequestException);
  });

  it('rechaza un ISV con más de dos decimales', () => {
    expect(() => calcularTotalesCompra([{ cantidad: 1, costo: 1 }], 0.001)).toThrow(BadRequestException);
  });
});
