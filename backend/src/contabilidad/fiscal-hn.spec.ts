import {
  analizarNumero, aplicarPorcentaje, calcularRetencion, conciliarConCompra, conciliarConVenta, fechaValida, limitesPeriodo, normalizarCai,
  normalizarRtn, periodoValido, seSolapan, tasaVigente, totalDocumentoCentavos, validarContraCai, verificarIsv,
} from './fiscal-hn';

const vacio = { importeExento: 0, importeExonerado: 0, importeGravadoGeneral: 0, importeGravadoEspecial: 0, isvGeneral: 0, isvEspecial: 0 };

describe('Reglas fiscales de Honduras (puras)', () => {
  it('RTN: 14 dígitos; acepta separadores visuales y rechaza el resto', () => {
    expect(normalizarRtn('0801-1990-123456')).toBe('08011990123456');
    expect(normalizarRtn(' 08011990123456 ')).toBe('08011990123456');
    for (const malo of ['0801199012345', '080119901234567', '0801A990123456', '', 12345678901234 as any]) expect(() => normalizarRtn(malo)).toThrow();
  });

  it('número de documento NNN-NNN-NN-NNNNNNNN con correlativo desde 1', () => {
    expect(analizarNumero('000-001-01-00000125')).toEqual({ establecimiento: '000', puntoEmision: '001', tipoDocumento: '01', correlativo: 125 });
    for (const malo of ['000-001-01-0000012', '000001010000001', '000-001-01-00000000', 'AAA-001-01-00000001']) expect(() => analizarNumero(malo)).toThrow();
  });

  it('CAI: normaliza a mayúsculas y acota el formato', () => {
    expect(normalizarCai(' abcd12-ef34 ')).toBe('ABCD12-EF34');
    expect(() => normalizarCai('a b c')).toThrow();
    expect(() => normalizarCai('x')).toThrow();
  });

  it('valida el documento contra su CAI: tipo, punto, rango y fecha límite', () => {
    const cai = { cai: 'CAI-1', tipoDocumento: '01', establecimiento: '000', puntoEmision: '001', rangoInicial: 1, rangoFinal: 100, fechaLimiteEmision: '2026-12-31' };
    expect(validarContraCai('000-001-01-00000050', '2026-10-01', cai)).toEqual([]);
    expect(validarContraCai('000-001-01-00000101', '2026-10-01', cai)).toEqual(['FUERA_DE_RANGO']);
    expect(validarContraCai('000-001-01-00000050', '2027-01-01', cai)).toEqual(['CAI_VENCIDO']);
    expect(validarContraCai('000-002-06-00000050', '2026-10-01', cai)).toEqual(['CAI_TIPO_DISTINTO', 'CAI_PUNTO_DISTINTO']);
    expect(validarContraCai('000-001-01-00000050', '2026-10-01', null)).toEqual(['SIN_CAI']);
  });

  it('porcentajes en centavos con mitad hacia arriba (sin coma flotante)', () => {
    expect(aplicarPorcentaje(10000, 15)).toBe(1500);
    expect(aplicarPorcentaje(1003, 15)).toBe(150); // 150.45 → 150
    expect(aplicarPorcentaje(1010, 15)).toBe(152); // 151.5 → 152
    expect(aplicarPorcentaje(333333, 12.5)).toBe(41667);
    expect(() => aplicarPorcentaje(100, 15.123)).toThrow();
  });

  it('ISV del documento frente a la tasa configurada; sin tasa no se supone ninguna', () => {
    const doc = { ...vacio, importeGravadoGeneral: 1000, isvGeneral: 150 };
    expect(verificarIsv(doc, 15, null)).toEqual([]);
    expect(verificarIsv({ ...doc, isvGeneral: 150.01 }, 15, null)).toEqual([]); // 1 centavo de tolerancia
    expect(verificarIsv({ ...doc, isvGeneral: 149 }, 15, null)).toEqual(['ISV_GENERAL_INCORRECTO']);
    expect(verificarIsv(doc, null, null)).toEqual(['SIN_TASA_GENERAL']);
    expect(verificarIsv({ ...vacio, importeGravadoEspecial: 100, isvEspecial: 18 }, 15, 18)).toEqual([]);
    expect(verificarIsv({ ...vacio, importeExento: 500 }, null, null)).toEqual([]);
  });

  it('conserva el centavo de mitad hacia arriba en importes DECIMAL(14,2) altos', () => {
    expect(aplicarPorcentaje(99999999999990, 15)).toBe(14999999999999);
    expect(calcularRetencion({ ...vacio, total: 999999999999.90 }, 'TOTAL', 15))
      .toEqual({ baseCentavos: 99999999999990, montoCentavos: 14999999999999 });
  });

  it('tasa vigente por fecha y detección de solapes', () => {
    const tasas = [
      { categoria: 'GENERAL', porcentaje: 12, vigenteDesde: '2010-01-01', vigenteHasta: '2013-12-31' },
      { categoria: 'GENERAL', porcentaje: 15, vigenteDesde: '2014-01-01', vigenteHasta: null },
    ];
    expect(tasaVigente(tasas, 'GENERAL', '2013-12-31')?.porcentaje).toBe(12);
    expect(tasaVigente(tasas, 'GENERAL', '2026-10-20')?.porcentaje).toBe(15);
    expect(tasaVigente(tasas, 'ESPECIAL', '2026-10-20')).toBeNull();
    expect(tasaVigente(tasas, 'GENERAL', '2009-12-31')).toBeNull();
    expect(seSolapan({ vigenteDesde: '2014-01-01', vigenteHasta: null }, { vigenteDesde: '2020-01-01', vigenteHasta: '2020-12-31' })).toBe(true);
    expect(seSolapan({ vigenteDesde: '2010-01-01', vigenteHasta: '2013-12-31' }, { vigenteDesde: '2014-01-01', vigenteHasta: null })).toBe(false);
  });

  it('retenciones según la base configurada', () => {
    const doc = { ...vacio, importeGravadoGeneral: 1000, isvGeneral: 150, importeExento: 50, total: 1200 };
    expect(calcularRetencion(doc, 'IMPUESTO', 10)).toEqual({ baseCentavos: 15000, montoCentavos: 1500 });
    expect(calcularRetencion(doc, 'BASE_GRAVABLE', 1)).toEqual({ baseCentavos: 100000, montoCentavos: 1000 });
    expect(calcularRetencion(doc, 'TOTAL', 12.5)).toEqual({ baseCentavos: 120000, montoCentavos: 15000 });
    expect(() => calcularRetencion({ ...vacio, importeExento: 10, total: 10 }, 'IMPUESTO', 10)).toThrow();
  });

  it('total del documento: suma exacta en centavos', () => {
    expect(totalDocumentoCentavos({ ...vacio, importeGravadoGeneral: 0.1, isvGeneral: 0.2, importeExento: 64.98 })).toBe(6528);
    expect(() => totalDocumentoCentavos({ ...vacio, importeExento: 999999999999.99, importeExonerado: 0.01 })).toThrow();
  });

  it('concilia un documento emitido contra la venta real', () => {
    const venta = { subtotal: 1100, descuento: 100, isv: 150, total: 1150 };
    const doc = { ...vacio, importeGravadoGeneral: 1000, isvGeneral: 150, total: 1150 };
    expect(conciliarConVenta(doc, venta)).toEqual([]);
    expect(conciliarConVenta({ ...doc, isvGeneral: 151, total: 1151 }, venta)).toEqual(['TOTAL_DISTINTO', 'ISV_DISTINTO']);
    expect(conciliarConVenta({ ...doc, importeGravadoGeneral: 900, importeExento: 100 }, venta)).toEqual([]);
    expect(conciliarConVenta({ ...doc, importeGravadoGeneral: 990, total: 1140 }, venta)).toEqual(['TOTAL_DISTINTO', 'BASE_DISTINTA']);
  });

  it('concilia un documento recibido contra la compra registrada', () => {
    const compra = { subtotal: 200, isv: 30, total: 230 };
    expect(conciliarConCompra({ ...vacio, importeGravadoGeneral: 200, isvGeneral: 30, total: 230 }, compra)).toEqual([]);
    expect(conciliarConCompra({ ...vacio, importeGravadoGeneral: 200, isvGeneral: 29, total: 229 }, compra)).toEqual(['TOTAL_DISTINTO', 'ISV_DISTINTO']);
  });

  it('períodos y fechas', () => {
    expect(limitesPeriodo(2024, 2)).toEqual({ desde: '2024-02-01', hasta: '2024-02-29' });
    expect(limitesPeriodo(2026, 12)).toEqual({ desde: '2026-12-01', hasta: '2026-12-31' });
    expect(() => periodoValido(2026, 13)).toThrow();
    expect(() => periodoValido('x', 1)).toThrow();
    expect(fechaValida('2026-02-28')).toBe('2026-02-28');
    expect(() => fechaValida('2026-02-30')).toThrow();
    expect(() => fechaValida('26-02-01')).toThrow();
  });
});
