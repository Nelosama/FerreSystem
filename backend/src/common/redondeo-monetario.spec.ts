import { describe, expect, it } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { calcularTotales } from './dinero';
import { aCentavos, divisionMitadArriba } from './redondeo-monetario';
import { decimal, validateDiscount } from '../operaciones/ledger';

describe('aCentavos', () => {
  it('convierte importes de hasta dos decimales sin error de coma flotante', () => {
    expect(aCentavos(64.98)).toBe(6498);
    expect(aCentavos(0.29)).toBe(29);
    expect(aCentavos(1234567.89)).toBe(123456789);
  });
  it('rechaza más de dos decimales en vez de redondear en silencio', () => {
    expect(() => aCentavos(25.999)).toThrow(BadRequestException);
  });
  it.each([[16777216.01, 1677721601], [1234567890.12, 123456789012], [9999999999.99, 999999999999]])('acepta L.%s dentro del rango DECIMAL(12,2)', (importe, centavos) => {
    expect(aCentavos(importe)).toBe(centavos);
  });
  it('mantiene la tolerancia al ruido binario y rechaza milésimas en importes elevados', () => {
    expect(aCentavos(0.1 + 0.2)).toBe(30);
    expect(() => aCentavos(1234567890.123)).toThrow(BadRequestException);
    expect(() => decimal(1234567890.123, 'Pago')).toThrow(BadRequestException);
  });
  it('rechaza valores no numéricos o fuera de rango', () => {
    expect(() => aCentavos(Number.NaN)).toThrow(BadRequestException);
    expect(() => aCentavos(Number.POSITIVE_INFINITY)).toThrow(BadRequestException);
    expect(() => aCentavos(Number.MAX_SAFE_INTEGER)).toThrow(BadRequestException);
  });
});

describe('importes elevados de pagos y caja', () => {
  it('admite dos decimales válidos sin confundir el residuo binario con una milésima', () => {
    expect(decimal(1234567890.12, 'Pago', true)).toBe(1234567890.12);
  });
});

describe('divisionMitadArriba', () => {
  it('redondea .5 hacia arriba y el resto hacia el entero más cercano', () => {
    expect(divisionMitadArriba(5, 2)).toBe(3);
    expect(divisionMitadArriba(4, 2)).toBe(2);
    expect(divisionMitadArriba(649, 100)).toBe(6);
    expect(divisionMitadArriba(650, 100)).toBe(7);
  });
});

describe('reglas de línea y totales (mismas que el POS offline)', () => {
  it('2.5 × 25.99 = 64.975 se redondea a 64.98 y el ISV y total cuadran', () => {
    const t = calcularTotales([{ precioCentavos: 2599, cantidadCentesimas: 250 }], 0);
    expect(t.lineas).toEqual([6498]);
    expect(t.subtotal).toBe(6498);
    expect(t.isv).toBe(975);
    expect(t.total).toBe(7473);
  });
  it('la suma de líneas coincide con el subtotal que se muestra por línea', () => {
    const t = calcularTotales([
      { precioCentavos: 2599, cantidadCentesimas: 250 },
      { precioCentavos: 2599, cantidadCentesimas: 250 },
    ], 0);
    expect(t.lineas.reduce((a, b) => a + b, 0)).toBe(t.subtotal);
  });
});

describe('validateDiscount en centavos exactos', () => {
  const cajero = (descuentoMaximo: number) => ({ rol: 'CAJERO', descuento_maximo: descuentoMaximo, permisos_configurados: false, permisos: [] });

  it('el 10% de L.64.98 es L.6.50 y se acepta el límite exacto', () => {
    expect(() => validateDiscount(cajero(10), 64.98, 6.5)).not.toThrow();
  });
  it('un centavo por encima del límite exacto se rechaza', () => {
    expect(() => validateDiscount(cajero(10), 64.98, 6.51)).toThrow(ForbiddenException);
  });
  it('con importes elevados, el límite porcentual no permite un centavo adicional', () => {
    expect(() => validateDiscount(cajero(99.99), 9900000050.01, 9899010050)).not.toThrow();
    expect(() => validateDiscount(cajero(99.99), 9900000050.01, 9899010050.01)).toThrow(ForbiddenException);
  });
  it('administrador puede descontar hasta el subtotal, nunca más', () => {
    expect(() => validateDiscount({ rol: 'ADMIN' }, 64.98, 64.98)).not.toThrow();
    expect(() => validateDiscount({ rol: 'ADMIN' }, 64.98, 64.99)).toThrow(BadRequestException);
  });
  it('descuento negativo o mayor que el subtotal se rechaza', () => {
    expect(() => validateDiscount(cajero(100), 64.98, -1)).toThrow();
    expect(() => validateDiscount(cajero(100), 64.98, 65)).toThrow(BadRequestException);
  });
  it('sin descuento no exige permiso aunque el límite sea cero', () => {
    expect(() => validateDiscount(cajero(0), 64.98, 0)).not.toThrow();
  });
});
