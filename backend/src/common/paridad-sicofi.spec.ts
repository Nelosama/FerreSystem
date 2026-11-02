// Paridad del cálculo de factura con SICOFI, la referencia fiscal elegida por el dueño (2026-11-02).
// La regla de SICOFI se transcribe de `js/invoices.js` (función `calculateTotals` y envío del formulario) del repositorio
// juanflores0722005/sicofi, commit faf200bfb9b277bfdd1d7e2b11d4f07d6799ca1c. Informe: docs/COMPARACION_SICOFI_20261102.md.
//
// Regla de SICOFI: total de línea = cantidad × precio redondeado a 2 decimales; se suman gravadas y exentas; el descuento
// general se resta SOLO de la parte gravada (mínimo 0); ISV = 15 % de la base gravada, una sola vez; total = exenta +
// gravada + ISV. SICOFI calcula en coma flotante; aquí se usa la misma regla en centavos exactos (mitad hacia arriba).
import { calcularTotales } from './dinero';

const mitadArriba = (n: number, d: number) => Math.floor((n * 2 + d) / (d * 2));

interface LineaSicofi { precioCentavos: number; cantidadCentesimas: number; exento?: boolean }

/** Regla de SICOFI en aritmética exacta de centavos. */
function reglaSicofi(lineas: LineaSicofi[], descuentoCentavos: number) {
  let exenta = 0;
  let gravadaBruta = 0;
  for (const l of lineas) {
    const t = mitadArriba(l.precioCentavos * l.cantidadCentesimas, 100);
    if (l.exento) exenta += t;
    else gravadaBruta += t;
  }
  const gravada = Math.max(gravadaBruta - descuentoCentavos, 0);
  const isv = mitadArriba(gravada * 15, 100);
  return { exenta, gravada, isv, total: exenta + gravada + isv };
}

/** Transcripción literal de SICOFI (coma flotante), solo para documentar sus empates mal redondeados. */
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
function sicofiFlotante(lineas: { qty: number; price: number }[], discount: number) {
  let gravadaBase = 0;
  for (const item of lineas) gravadaBase += r2(item.qty * item.price);
  gravadaBase = r2(gravadaBase);
  const gravada15 = r2(Math.max(gravadaBase - discount, 0));
  const isv15 = r2(gravada15 * 0.15);
  return { gravada15, isv15, total: r2(gravada15 + isv15) };
}

describe('Paridad con SICOFI — venta gravada (POS en línea y sin conexión)', () => {
  it('calcularTotales aplica exactamente la regla de SICOFI en 50 000 facturas sintéticas', () => {
    let semilla = 20261102;
    const azar = () => (semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let k = 0; k < 50_000; k++) {
      const lineas = Array.from({ length: 1 + Math.floor(azar() * 8) }, () => ({
        precioCentavos: 1 + Math.floor(azar() * 100_000),
        cantidadCentesimas: 1 + Math.floor(azar() * 3_000),
      }));
      const subtotal = lineas.reduce((a, l) => a + mitadArriba(l.precioCentavos * l.cantidadCentesimas, 100), 0);
      const descuento = azar() < 0.5 ? 0 : Math.floor(azar() * subtotal * 0.3);
      const nuestro = calcularTotales(lineas, descuento);
      const sicofi = reglaSicofi(lineas, descuento);
      expect({ base: nuestro.subtotal - descuento, isv: nuestro.isv, total: nuestro.total }).toEqual({
        base: sicofi.gravada,
        isv: sicofi.isv,
        total: sicofi.total,
      });
    }
  });

  it('ISV con descuento general: se calcula sobre la base gravada ya descontada, una sola vez', () => {
    // 3 × L 33.33 = L 99.99; descuento L 10.00 → base L 89.99; ISV 13.4985 → L 13.50; total L 103.49
    const t = calcularTotales([{ precioCentavos: 3333, cantidadCentesimas: 300 }], 1000);
    expect(t).toMatchObject({ subtotal: 9999, isv: 1350, total: 10349 });
    expect(reglaSicofi([{ precioCentavos: 3333, cantidadCentesimas: 300 }], 1000)).toMatchObject({ gravada: 8999, isv: 1350, total: 10349 });
  });

  it('defecto conocido de SICOFI: en empates de medio centavo su coma flotante redondea hacia abajo; FerreSystem no lo copia', () => {
    // Base L 2 016.10 → ISV exacto L 302.415 → mitad hacia arriba L 302.42. SICOFI muestra L 302.41.
    const lineas = [
      { qty: 8, price: 118.29 },
      { qty: 5, price: 145.02 },
      { qty: 2, price: 172.34 },
    ];
    expect(sicofiFlotante(lineas, 0)).toEqual({ gravada15: 2016.1, isv15: 302.41, total: 2318.51 });
    const nuestro = calcularTotales(lineas.map((l) => ({ precioCentavos: Math.round(l.price * 100), cantidadCentesimas: l.qty * 100 })));
    expect(nuestro).toMatchObject({ subtotal: 201610, isv: 30242, total: 231852 });
  });
});
