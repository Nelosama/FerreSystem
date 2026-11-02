import { calcularTotales, subtotalLinea } from './dinero';
import { isvDocumentoCentavos } from './isv-documento';

describe('isvDocumentoCentavos — ISV una vez sobre la base gravada (regla confirmada 2026-11-02)', () => {
  it('sin exentas coincide con el POS (calcularTotales) en 20 000 documentos con y sin descuento general', () => {
    let semilla = 1102;
    const azar = () => (semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let k = 0; k < 20_000; k++) {
      const lineas = Array.from({ length: 1 + Math.floor(azar() * 8) }, () => ({ precioCentavos: 1 + Math.floor(azar() * 100_000), cantidadCentesimas: 1 + Math.floor(azar() * 3_000) }));
      const subtotales = lineas.map((l) => subtotalLinea(l.precioCentavos, l.cantidadCentesimas));
      const subtotal = subtotales.reduce((a, b) => a + b, 0);
      const descuento = azar() < 0.5 ? 0 : Math.floor(azar() * subtotal * 0.3);
      expect(isvDocumentoCentavos(subtotales.map((s) => ({ subtotalCentavos: s, exento: false })), descuento, 15)).toBe(calcularTotales(lineas, descuento).isv);
    }
  });

  it('caso que difería con el ISV por línea: 5 líneas y descuento L 538.33 → ISV L 1 254.00 (antes L 1 254.02)', () => {
    const lineas = [[34693, 500], [27564, 600], [25125, 500], [47836, 200], [32969, 1000]].map(([p, q]) => ({ subtotalCentavos: subtotalLinea(p, q), exento: false }));
    expect(isvDocumentoCentavos(lineas, 53833, 15)).toBe(125400);
  });

  it('empate de medio centavo se redondea hacia arriba: base L 2 016.10 → ISV L 302.42', () => {
    expect(isvDocumentoCentavos([{ subtotalCentavos: 201610, exento: false }], 0, 15)).toBe(30242);
  });

  it('el descuento general no reduce el ISV por la parte exenta (cotizaciones heredadas)', () => {
    // L 100 gravado + L 100 exento, descuento L 20 → base gravada L 90 → ISV L 13.50
    expect(isvDocumentoCentavos([{ subtotalCentavos: 10000, exento: false }, { subtotalCentavos: 10000, exento: true }], 2000, 15)).toBe(1350);
    expect(isvDocumentoCentavos([{ subtotalCentavos: 10000, exento: true }], 0, 15)).toBe(0);
    expect(isvDocumentoCentavos([], 0, 15)).toBe(0);
  });
});
