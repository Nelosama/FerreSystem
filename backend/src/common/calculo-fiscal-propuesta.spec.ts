import { readFileSync } from 'node:fs';
import { calcularTotales } from './dinero';
import { calcularTotalesConExencion } from './calculo-fiscal-propuesta';
import { importesDeVenta } from '../contabilidad/fiscal-hn';

const vectores = JSON.parse(readFileSync('test/fixtures/dinero-vectores.json', 'utf8'));
const gravadas = (lineas: { precioCentavos: number; cantidadCentesimas: number }[]) => lineas.map((l) => ({ ...l, exento: false }));

describe('PROPUESTA P2-H2: cálculo común con líneas exentas (no conectado)', () => {
  it(`sin exentas coincide con calcularTotales en los ${vectores.casos.length} vectores compartidos POS/servidor`, () => {
    for (const caso of vectores.casos) {
      const { baseGravada, baseExenta, ...totales } = calcularTotalesConExencion(gravadas(caso.lineas));
      expect(totales).toEqual(caso.esperado);
      expect(baseExenta).toBe(0);
      expect(baseGravada).toBe(caso.esperado.subtotal);
    }
  });

  it('sin exentas y con descuento coincide con calcularTotales (barrido)', () => {
    for (let precio = 1; precio <= 2000; precio += 37) for (let desc = 0; desc <= precio; desc += 13) {
      const lineas = [{ precioCentavos: precio, cantidadCentesimas: 100 }, { precioCentavos: 999, cantidadCentesimas: 250 }];
      const { baseGravada: _g, baseExenta: _e, ...totales } = calcularTotalesConExencion(gravadas(lineas), desc);
      expect(totales).toEqual(calcularTotales(lineas, desc));
    }
  });

  it('solo exentas: sin ISV', () => {
    expect(calcularTotalesConExencion([{ precioCentavos: 5000, cantidadCentesimas: 300, exento: true }], 1000))
      .toEqual({ lineas: [15000], subtotal: 15000, isv: 0, total: 14000, baseGravada: 0, baseExenta: 14000 });
  });

  it('combinada con descuento: mismo resultado que la cotización del caso de prueba (148.50)', () => {
    expect(calcularTotalesConExencion([
      { precioCentavos: 10000, cantidadCentesimas: 100, exento: false },
      { precioCentavos: 5000, cantidadCentesimas: 100, exento: true },
    ], 1500)).toEqual({ lineas: [10000, 5000], subtotal: 15000, isv: 1350, total: 14850, baseGravada: 9000, baseExenta: 4500 });
  });

  it('reparte exento/gravado igual que contabilidad (importesDeVenta) para conservar el desglose histórico', () => {
    for (const [g, e, d] of [[3334, 6667, 0], [3334, 6667, 1], [10000, 5000, 1500], [1, 2, 1], [9999, 1, 333]]) {
      const r = calcularTotalesConExencion([{ precioCentavos: g, cantidadCentesimas: 100, exento: false }, { precioCentavos: e, cantidadCentesimas: 100, exento: true }], d);
      const cont = importesDeVenta({ subtotal: (g + e) / 100, descuento: d / 100, isv: r.isv / 100, total: r.total / 100 } as any,
        { porcentajeIsv: 15, lineas: [{ subtotal: g / 100, exento: false }, { subtotal: e / 100, exento: true }] }, 15);
      expect([r.baseExenta, r.baseGravada]).toEqual([Math.round(cont.importeExento * 100), Math.round(cont.importeGravadoGeneral * 100)]);
    }
  });

  it('rechaza tasas no autorizadas y descuentos inválidos', () => {
    const l = [{ precioCentavos: 100, cantidadCentesimas: 100, exento: false }];
    expect(() => calcularTotalesConExencion(l, 0, 500)).toThrow(/no autorizada/);
    expect(() => calcularTotalesConExencion(l, 0, 0)).toThrow(/no autorizada/);
    expect(() => calcularTotalesConExencion(l, 101)).toThrow(/Descuento mayor/);
    expect(() => calcularTotalesConExencion(l, -1)).toThrow(/Descuento/);
  });
});
