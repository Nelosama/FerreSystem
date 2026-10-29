import { calcularTotales } from './dinero';
import { desglosarVenta, desgloseDevolucionLinea, desgloseFiscalPorLineaActivo, repartirProporcional, totalDesglose } from './desglose-fiscal';

const suma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('desglose fiscal por línea (reparte importes ya calculados; no decide tasas)', () => {
  it('apagado por defecto: solo se activa con FISCAL_DESGLOSE_POR_LINEA=true', () => {
    expect(desgloseFiscalPorLineaActivo({})).toBe(false);
    expect(desgloseFiscalPorLineaActivo({ FISCAL_DESGLOSE_POR_LINEA: '1' })).toBe(false);
    expect(desgloseFiscalPorLineaActivo({ FISCAL_DESGLOSE_POR_LINEA: 'true' })).toBe(true);
  });

  it('reparto por restos mayores: la suma es exacta y el empate favorece al índice menor', () => {
    expect(repartirProporcional(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(repartirProporcional(0, [0, 0])).toEqual([0, 0]);
    expect(() => repartirProporcional(1, [0, 0])).toThrow(/base/);
    for (let t = 0; t < 500; t += 7) expect(suma(repartirProporcional(t, [333, 1, 9999, 0, 17]))).toBe(t);
  });

  it('venta gravada del POS: Σ bases = subtotal − descuento y Σ ISV = ISV de la venta (barrido contra calcularTotales)', () => {
    for (let desc = 0; desc <= 3000; desc += 113) {
      const lineas = [{ precioCentavos: 1030, cantidadCentesimas: 100 }, { precioCentavos: 999, cantidadCentesimas: 250 }, { precioCentavos: 1, cantidadCentesimas: 1 }];
      const t = calcularTotales(lineas, desc);
      const d = desglosarVenta(t.lineas.map((b) => ({ brutoCentavos: b, exento: false })), desc, t.isv);
      expect(suma(d.map((x) => x.baseGravadaCentavos))).toBe(t.subtotal - desc);
      expect(suma(d.map((x) => x.baseExentaCentavos))).toBe(0);
      expect(suma(d.map((x) => x.isvCentavos))).toBe(t.isv);
      expect(suma(d.map(totalDesglose))).toBe(t.total);
    }
  });

  it('solo exentas: ISV 0 y toda la base es exenta; con ISV y sin base gravada se rechaza', () => {
    expect(desglosarVenta([{ brutoCentavos: 5000, exento: true }], 500, 0)).toEqual([{ baseGravadaCentavos: 0, baseExentaCentavos: 4500, isvCentavos: 0 }]);
    expect(() => desglosarVenta([{ brutoCentavos: 5000, exento: true }], 0, 750)).toThrow(/ninguna base gravada/);
  });

  it('mixta de cotización (100 gravado + 50 exento, descuento general 15, ISV 13.50 histórico): el ISV queda solo en la gravada', () => {
    expect(desglosarVenta([{ brutoCentavos: 10000, exento: false }, { brutoCentavos: 5000, exento: true }], 1500, 1350)).toEqual([
      { baseGravadaCentavos: 9000, baseExentaCentavos: 0, isvCentavos: 1350 },
      { baseGravadaCentavos: 0, baseExentaCentavos: 4500, isvCentavos: 0 },
    ]);
  });

  it('respeta el descuento propio de cada línea antes de repartir el general', () => {
    const d = desglosarVenta([{ brutoCentavos: 10000, descuentoLineaCentavos: 5000, exento: false }, { brutoCentavos: 5000, exento: false }], 1000, 1350);
    expect(d.map((x) => x.baseGravadaCentavos)).toEqual([4500, 4500]);
    expect(suma(d.map((x) => x.isvCentavos))).toBe(1350);
    expect(() => desglosarVenta([{ brutoCentavos: 100, descuentoLineaCentavos: 101, exento: false }], 0, 0)).toThrow(/supera/);
    expect(() => desglosarVenta([{ brutoCentavos: 100, exento: false }], 101, 0)).toThrow(/supera/);
    expect(() => desglosarVenta([{ brutoCentavos: 1.5, exento: false }], 0, 0)).toThrow(/entero/);
    expect(() => desglosarVenta([], 0, 0)).toThrow(/líneas/);
  });

  describe('devoluciones', () => {
    const gravada = { cantidadCentesimas: 300, baseGravadaCentavos: 10000, baseExentaCentavos: 0, isvCentavos: 1500 };
    const exenta = { cantidadCentesimas: 100, baseGravadaCentavos: 0, baseExentaCentavos: 5000, isvCentavos: 0 };

    it('devolver la línea exenta no reembolsa ISV; devolver la gravada reembolsa su ISV', () => {
      expect(desgloseDevolucionLinea(exenta, 0, 100)).toEqual({ baseGravadaCentavos: 0, baseExentaCentavos: 5000, isvCentavos: 0 });
      expect(desgloseDevolucionLinea(gravada, 0, 300)).toEqual({ baseGravadaCentavos: 10000, baseExentaCentavos: 0, isvCentavos: 1500 });
    });

    it('parciales sucesivas (1 + 1 + 1 de 3) suman exactamente la línea, sin deriva', () => {
      const partes = [0, 100, 200].map((antes) => desgloseDevolucionLinea(gravada, antes, 100));
      expect(partes.map((p) => p.baseGravadaCentavos)).toEqual([3333, 3334, 3333]);
      expect(suma(partes.map((p) => p.baseGravadaCentavos))).toBe(10000);
      expect(suma(partes.map((p) => p.isvCentavos))).toBe(1500);
    });

    it('barrido de parciales con cantidades decimales: la suma acumulada siempre coincide con la línea', () => {
      const linea = { cantidadCentesimas: 275, baseGravadaCentavos: 7013, baseExentaCentavos: 0, isvCentavos: 1052 };
      for (const pasos of [[275], [1, 274], [100, 100, 75], [33, 33, 33, 33, 33, 33, 33, 33, 11]]) {
        let antes = 0; const acum = { g: 0, i: 0 };
        for (const q of pasos) { const p = desgloseDevolucionLinea(linea, antes, q); acum.g += p.baseGravadaCentavos; acum.i += p.isvCentavos; antes += q; }
        expect(acum).toEqual({ g: 7013, i: 1052 });
      }
    });

    it('rechaza devolver más de lo vendido o cantidades no enteras', () => {
      expect(() => desgloseDevolucionLinea(gravada, 200, 101)).toThrow(/supera/);
      expect(() => desgloseDevolucionLinea(gravada, 0, 0.5)).toThrow(/entero/);
    });
  });
});
