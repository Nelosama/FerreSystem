import { BadRequestException } from '@nestjs/common';
import { estadoDeuda, tipoCartera, tramoAntiguedad } from './cartera';
import { importesDeVenta } from './fiscal-hn';

describe('Cartera CxC/CxP: estado y antigüedad al corte', () => {
  it('estado de deuda con las mismas reglas que Operaciones (VENCIDA tiene prioridad sobre PARCIAL)', () => {
    expect(estadoDeuda(10000, 0, '2026-09-01', '2026-10-01')).toBe('PAGADA');
    expect(estadoDeuda(10000, 4000, '2026-09-01', '2026-10-01')).toBe('VENCIDA');
    expect(estadoDeuda(10000, 4000, '2026-10-01', '2026-10-01')).toBe('PARCIAL');
    expect(estadoDeuda(10000, 10000, null, '2026-10-01')).toBe('PENDIENTE');
  });

  it('tramos por días de atraso respecto del corte', () => {
    expect(tramoAntiguedad(0, '2026-01-01', '2026-10-01')).toBeNull();
    expect(tramoAntiguedad(1, null, '2026-10-01')).toBe('SIN_VENCIMIENTO');
    expect(tramoAntiguedad(1, '2026-10-01', '2026-10-01')).toBe('AL_DIA');
    expect(tramoAntiguedad(1, '2026-09-30', '2026-10-01')).toBe('VENCIDA_1_30');
    expect(tramoAntiguedad(1, '2026-09-01', '2026-10-01')).toBe('VENCIDA_1_30');
    expect(tramoAntiguedad(1, '2026-08-31', '2026-10-01')).toBe('VENCIDA_31_60');
    expect(tramoAntiguedad(1, '2026-07-03', '2026-10-01')).toBe('VENCIDA_61_90');
    expect(tramoAntiguedad(1, '2026-07-02', '2026-10-01')).toBe('VENCIDA_MAS_90');
  });

  it('solo CXC o CXP', () => {
    expect(tipoCartera('CXP')).toBe('CXP');
    for (const v of ['cxc', '', undefined, ['CXC']]) expect(() => tipoCartera(v)).toThrow(BadRequestException);
  });
});

describe('Importes fiscales de una venta', () => {
  const venta = { subtotal: 1000, descuento: 0, isv: 150, total: 1150 };
  it('venta directa: todo gravado a la tasa general (comportamiento anterior)', () => {
    expect(importesDeVenta(venta, null, 15)).toEqual({ importeExento: 0, importeExonerado: 0, importeGravadoGeneral: 1000, importeGravadoEspecial: 0, isvGeneral: 150, isvEspecial: 0 });
  });

  it('venta convertida de cotización con líneas exentas: separa exento y gravado', () => {
    // Líneas 600 gravada + 400 exenta; ISV 15 % de 600 = 90.
    const v = { subtotal: 1000, descuento: 0, isv: 90, total: 1090 };
    expect(importesDeVenta(v, { porcentajeIsv: 15, lineas: [{ subtotal: 600, exento: false }, { subtotal: 400, exento: true }] }, 15))
      .toMatchObject({ importeExento: 400, importeGravadoGeneral: 600, isvGeneral: 90 });
  });

  it('descuento general prorrateado en centavos, sin perder ni crear centavos', () => {
    // S = 100.01 (gravada 33.34 + exenta 66.67), descuento general 10.00 → base 90.01.
    const v = { subtotal: 100.01, descuento: 10, isv: 4.5, total: 94.51 };
    const r = importesDeVenta(v, { porcentajeIsv: 15, lineas: [{ subtotal: 33.34, exento: false }, { subtotal: 66.67, exento: true }] }, 15);
    expect(Math.round((r.importeExento + r.importeGravadoGeneral) * 100)).toBe(9001);
    // 66.67 × 90.01 / 100.01 = 60.0033… → 60.00; gravado 30.01 cuyo 15 % (4.50) coincide con el ISV de la cotización.
    expect(r).toMatchObject({ importeExento: 60, importeGravadoGeneral: 30.01, isvGeneral: 4.5 });
  });

  it('tasa de la cotización distinta de la general configurada: exige desglose manual', () => {
    expect(() => importesDeVenta({ subtotal: 100, descuento: 0, isv: 18, total: 118 }, { porcentajeIsv: 18, lineas: [{ subtotal: 100, exento: false }] }, 15)).toThrow(/desglose/);
    // Todo exento: no hay base gravada, la tasa no interviene.
    expect(importesDeVenta({ subtotal: 100, descuento: 0, isv: 0, total: 100 }, { porcentajeIsv: 18, lineas: [{ subtotal: 100, exento: true }] }, 15)).toMatchObject({ importeExento: 100, importeGravadoGeneral: 0 });
  });
});
