import { calcularTotales } from '../../common/dinero';
import {
  asientoCobroCxc, asientoCompra, asientoCostoDevolucion, asientoCostoVenta, asientoDevolucion, asientoPagoCxp,
  asientoRecepcionCompra, asientoVenta, proporcion, validarCuadre, type LineaPropuesta, type ResultadoAsiento, type VentaEntrada,
} from './reglas';

const ok = (r: ResultadoAsiento) => { if (!r.ok) throw new Error(JSON.stringify(r.errores)); return r; };
const suma = (ls: LineaPropuesta[]) => ({ debe: ls.reduce((s, l) => s + l.debeCentavos, 0), haber: ls.reduce((s, l) => s + l.haberCentavos, 0) });
const porConcepto = (r: ResultadoAsiento, c: string) => ok(r).lineas.filter((l) => l.concepto === c);
const venta = (extra: Partial<VentaEntrada> = {}): VentaEntrada => ({ subtotalCentavos: 10000, descuentoCentavos: 0, isvCentavos: 1500, totalCentavos: 11500, tipoPago: 'CONTADO', metodoPago: 'EFECTIVO', ...extra });
const linea = (concepto: any, debeCentavos: number, haberCentavos: number): LineaPropuesta => ({ concepto, debeCentavos, haberCentavos, descripcion: '' });

describe('asientoVenta', () => {
  it('contado en efectivo sin descuento cuadra con los conceptos esperados', () => {
    for (const descuento of ['BRUTO', 'NETO'] as const) {
      const r = ok(asientoVenta(venta(), { descuento }));
      expect(r.lineas.map((l) => [l.concepto, l.debeCentavos, l.haberCentavos])).toEqual([
        ['CAJA_EFECTIVO', 11500, 0], ['VENTAS', 0, 10000], ['ISV_POR_PAGAR', 0, 1500],
      ]);
      expect(r.totalCentavos).toBe(11500);
      expect(r.regla).toBe('venta');
    }
  });

  it('con descuento de L 10.00 cuadra en BRUTO y en NETO (regresión del defecto de SICOFI)', () => {
    // subtotal 100.00 − descuento 10.00 = base 90.00; ISV 13.50; total 103.50
    const v = venta({ descuentoCentavos: 1000, isvCentavos: 1350, totalCentavos: 10350 });
    const bruto = ok(asientoVenta(v, { descuento: 'BRUTO' }));
    expect(suma(bruto.lineas)).toEqual({ debe: 11350, haber: 11350 });
    expect(porConcepto(bruto, 'DESCUENTO_VENTAS')[0].debeCentavos).toBe(1000);
    expect(porConcepto(bruto, 'VENTAS')[0].haberCentavos).toBe(10000);
    const neto = ok(asientoVenta(v, { descuento: 'NETO' }));
    expect(suma(neto.lineas)).toEqual({ debe: 10350, haber: 10350 });
    expect(porConcepto(neto, 'DESCUENTO_VENTAS')).toHaveLength(0);
    expect(porConcepto(neto, 'VENTAS')[0].haberCentavos).toBe(9000);
  });

  it('a crédito usa CXC_CLIENTES sin importar el método', () => {
    const r = ok(asientoVenta(venta({ tipoPago: 'CREDITO', metodoPago: 'CREDITO' }), { descuento: 'NETO' }));
    expect(r.lineas[0]).toMatchObject({ concepto: 'CXC_CLIENTES', debeCentavos: 11500 });
  });

  it('tarjeta y transferencia usan su concepto; un método desconocido es un error', () => {
    expect(ok(asientoVenta(venta({ metodoPago: 'TARJETA' }), { descuento: 'NETO' })).lineas[0].concepto).toBe('TARJETA_POR_LIQUIDAR');
    expect(ok(asientoVenta(venta({ metodoPago: 'TRANSFERENCIA' }), { descuento: 'NETO' })).lineas[0].concepto).toBe('BANCO_TRANSFERENCIA');
    for (const metodoPago of ['CHEQUE', 'CREDITO', '', undefined as any]) {
      const r = asientoVenta(venta({ metodoPago }), { descuento: 'NETO' });
      expect(r.ok).toBe(false);
      expect(!r.ok && r.errores[0].codigo).toBe('METODO_SIN_CONCEPTO');
    }
  });

  it('50 ventas deterministas calculadas con calcularTotales cuadran en ambas políticas', () => {
    let semilla = 12345;
    const azar = (max: number) => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla % max; };
    for (let i = 0; i < 50; i++) {
      const lineas = Array.from({ length: 1 + azar(5) }, () => ({ precioCentavos: 1 + azar(500000), cantidadCentesimas: 1 + azar(100000) }));
      const bruto = calcularTotales(lineas, 0).subtotal;
      const descuento = azar(3) === 0 ? 0 : azar(bruto + 1);
      const t = calcularTotales(lineas, descuento);
      const v = venta({ subtotalCentavos: t.subtotal, descuentoCentavos: descuento, isvCentavos: t.isv, totalCentavos: t.total, tipoPago: azar(2) ? 'CREDITO' : 'CONTADO' });
      for (const politica of ['BRUTO', 'NETO'] as const) {
        const r = asientoVenta(v, { descuento: politica });
        if (t.total === 0) { expect(r.ok).toBe(false); continue; }
        const s = suma(ok(r).lineas);
        expect(s.debe).toBe(s.haber);
        expect(s.haber).toBe(politica === 'BRUTO' ? t.subtotal + t.isv : t.total);
      }
    }
  });

  it('rechaza totales inconsistentes, importes no enteros o negativos y descuento mayor al subtotal', () => {
    const casos: Partial<VentaEntrada>[] = [{ totalCentavos: 11501 }, { subtotalCentavos: 100.5 }, { isvCentavos: -1 }, { descuentoCentavos: 10001, totalCentavos: 1500 }, { totalCentavos: NaN }];
    for (const c of casos) expect(asientoVenta(venta(c), { descuento: 'NETO' }).ok).toBe(false);
  });

  it('exige la política de descuentos: sin ella no hay propuesta', () => {
    // @ts-expect-error la política es un parámetro obligatorio
    const sinPolitica = asientoVenta(venta());
    expect(!sinPolitica.ok && sinPolitica.errores[0].codigo).toBe('POLITICA_REQUERIDA');
    const invalida = asientoVenta(venta(), { descuento: 'OTRA' as any });
    expect(invalida.ok).toBe(false);
  });
});

describe('asientoCostoVenta', () => {
  it('2.5 × L 25.99 coincide con subtotalLinea y excluye líneas sin inventario', () => {
    const r = ok(asientoCostoVenta([
      { cantidadCentesimas: 250, costoUnitarioCentavos: 2599 },
      { cantidadCentesimas: 10000, costoUnitarioCentavos: 999999, sinInventario: true },
    ]));
    // 2599 × 250 / 100 = 6497.5 → 6498 (mitad hacia arriba)
    expect(r.lineas.map((l) => [l.concepto, l.debeCentavos, l.haberCentavos])).toEqual([['COSTO_VENTA', 6498, 0], ['INVENTARIO', 0, 6498]]);
  });
  it('sin líneas costeables devuelve un resultado vacío, no un error', () => {
    expect(asientoCostoVenta([])).toMatchObject({ ok: true, lineas: [], totalCentavos: 0 });
    expect(asientoCostoVenta([{ cantidadCentesimas: 100, costoUnitarioCentavos: 500, sinInventario: true }])).toMatchObject({ ok: true, lineas: [] });
  });
  it('rechaza cantidades o costos inválidos', () => {
    expect(asientoCostoVenta([{ cantidadCentesimas: 1.5, costoUnitarioCentavos: 100 }]).ok).toBe(false);
    expect(asientoCostoVenta([{ cantidadCentesimas: 100, costoUnitarioCentavos: -1 }]).ok).toBe(false);
  });
});

describe('cobros y pagos', () => {
  it('el cobro de CxC y el pago de CxP cuadran por método', () => {
    expect(ok(asientoCobroCxc({ montoCentavos: 5000, metodo: 'EFECTIVO' })).lineas.map((l) => [l.concepto, l.debeCentavos, l.haberCentavos]))
      .toEqual([['CAJA_EFECTIVO', 5000, 0], ['CXC_CLIENTES', 0, 5000]]);
    expect(ok(asientoPagoCxp({ montoCentavos: 7000, metodo: 'TRANSFERENCIA' })).lineas.map((l) => [l.concepto, l.debeCentavos, l.haberCentavos]))
      .toEqual([['CXP_PROVEEDORES', 7000, 0], ['BANCO_TRANSFERENCIA', 0, 7000]]);
  });
  it('monto cero, negativo o método desconocido son errores', () => {
    for (const fn of [asientoCobroCxc, asientoPagoCxp]) {
      expect(fn({ montoCentavos: 0, metodo: 'EFECTIVO' }).ok).toBe(false);
      expect(fn({ montoCentavos: -5, metodo: 'EFECTIVO' }).ok).toBe(false);
      expect(fn({ montoCentavos: 100, metodo: 'CHEQUE' }).ok).toBe(false);
    }
  });
});

describe('compras', () => {
  const compra = { subtotalCentavos: 20000, isvCentavos: 3000, totalCentavos: 23000 };
  it('FACTURA lleva el inventario al registrar; RECEPCION lo deja en tránsito y luego lo traslada', () => {
    const f = ok(asientoCompra(compra, { momentoInventario: 'FACTURA' }));
    expect(f.lineas.map((l) => [l.concepto, l.debeCentavos, l.haberCentavos])).toEqual([['INVENTARIO', 20000, 0], ['ISV_CREDITO_FISCAL', 3000, 0], ['CXP_PROVEEDORES', 0, 23000]]);
    const r = ok(asientoCompra(compra, { momentoInventario: 'RECEPCION' }));
    expect(r.lineas[0].concepto).toBe('MERCADERIA_EN_TRANSITO');
    expect(suma(r.lineas).debe).toBe(suma(r.lineas).haber);
    expect(ok(asientoRecepcionCompra(20000)).lineas.map((l) => [l.concepto, l.debeCentavos, l.haberCentavos])).toEqual([['INVENTARIO', 20000, 0], ['MERCADERIA_EN_TRANSITO', 0, 20000]]);
  });
  it('compra sin ISV omite la línea; total inconsistente y política ausente fallan', () => {
    expect(ok(asientoCompra({ subtotalCentavos: 500, isvCentavos: 0, totalCentavos: 500 }, { momentoInventario: 'FACTURA' })).lineas).toHaveLength(2);
    expect(asientoCompra({ ...compra, totalCentavos: 23001 }, { momentoInventario: 'FACTURA' }).ok).toBe(false);
    // @ts-expect-error la política es un parámetro obligatorio
    const sinPolitica = asientoCompra(compra);
    expect(!sinPolitica.ok && sinPolitica.errores[0].codigo).toBe('POLITICA_REQUERIDA');
    expect(asientoRecepcionCompra(0).ok).toBe(false);
  });
});

describe('asientoDevolucion', () => {
  // venta: subtotal 100.00, descuento 10.00, ISV 13.50, total 103.50
  const origen = { subtotalCentavos: 10000, descuentoCentavos: 1000, isvCentavos: 1350, totalCentavos: 10350 };
  it('parcial en NETO: separa ISV proporcional (mitad hacia arriba) y el resto es la base', () => {
    // monto 51.75 (la mitad): ISV = 6.75, base = 45.00
    const r = ok(asientoDevolucion({ montoCentavos: 5175, creditoCanceladoCentavos: 5175, reembolsoCentavos: 0, venta: origen }, { descuento: 'NETO' }));
    expect(r.lineas.map((l) => [l.concepto, l.debeCentavos, l.haberCentavos])).toEqual([['DEVOLUCIONES_VENTAS', 4500, 0], ['ISV_POR_PAGAR', 675, 0], ['CXC_CLIENTES', 0, 5175]]);
  });
  it('en BRUTO revierte la parte proporcional del descuento y sigue cuadrando', () => {
    const r = ok(asientoDevolucion({ montoCentavos: 5175, creditoCanceladoCentavos: 1000, reembolsoCentavos: 4175, metodoReembolso: 'EFECTIVO', venta: origen }, { descuento: 'BRUTO' }));
    expect(porConcepto(r, 'DEVOLUCIONES_VENTAS')[0].debeCentavos).toBe(5000);
    expect(porConcepto(r, 'DESCUENTO_VENTAS')[0].haberCentavos).toBe(500);
    expect(porConcepto(r, 'CAJA_EFECTIVO')[0].haberCentavos).toBe(4175);
    expect(suma(r.lineas).debe).toBe(suma(r.lineas).haber);
  });
  it('cuadra para montos arbitrarios y ambas políticas (redondeo de ISV)', () => {
    for (let monto = 1; monto <= 10350; monto += 137) {
      for (const politica of ['BRUTO', 'NETO'] as const) {
        const r = ok(asientoDevolucion({ montoCentavos: monto, creditoCanceladoCentavos: monto, reembolsoCentavos: 0, venta: origen }, { descuento: politica }));
        expect(suma(r.lineas).debe).toBe(suma(r.lineas).haber);
      }
    }
  });
  it('rechaza crédito + reembolso distinto del monto, monto cero, exceso y reembolso sin método', () => {
    const base = { montoCentavos: 1000, creditoCanceladoCentavos: 400, reembolsoCentavos: 600, metodoReembolso: 'EFECTIVO', venta: origen };
    const politica = { descuento: 'NETO' } as const;
    expect(asientoDevolucion({ ...base, reembolsoCentavos: 599 }, politica).ok).toBe(false);
    expect(asientoDevolucion({ ...base, montoCentavos: 0, creditoCanceladoCentavos: 0, reembolsoCentavos: 0 }, politica).ok).toBe(false);
    expect(asientoDevolucion({ ...base, montoCentavos: 10351, creditoCanceladoCentavos: 10351, reembolsoCentavos: 0 }, politica).ok).toBe(false);
    expect(asientoDevolucion({ ...base, metodoReembolso: undefined }, politica).ok).toBe(false);
    expect(asientoDevolucion({ ...base, venta: { ...origen, totalCentavos: 0 } }, politica).ok).toBe(false);
  });
  it('el costo de la mercadería devuelta al inventario es el reverso del costo de venta', () => {
    const r = ok(asientoCostoDevolucion([{ cantidadCentesimas: 200, costoUnitarioCentavos: 1000 }]));
    expect(r.lineas.map((l) => [l.concepto, l.debeCentavos, l.haberCentavos])).toEqual([['INVENTARIO', 2000, 0], ['COSTO_VENTA', 0, 2000]]);
    expect(asientoCostoDevolucion([])).toMatchObject({ ok: true, lineas: [] });
  });
});

describe('validarCuadre y proporcion', () => {
  it('rechaza una línea, línea con debe y haber, decimales y un descuadre de un centavo', () => {
    expect(validarCuadre([linea('VENTAS', 0, 100)])[0].codigo).toBe('LINEAS_INSUFICIENTES');
    expect(validarCuadre([linea('VENTAS', 100, 100), linea('CAJA_EFECTIVO', 100, 0)])[0].codigo).toBe('LINEA_INVALIDA');
    expect(validarCuadre([linea('VENTAS', 0, 100.5), linea('CAJA_EFECTIVO', 100.5, 0)])[0].codigo).toBe('LINEA_INVALIDA');
    expect(validarCuadre([linea('VENTAS', 0, 100), linea('CAJA_EFECTIVO', 101, 0)])[0].codigo).toBe('DESCUADRE');
    expect(validarCuadre([linea('VENTAS', 0, 0), linea('CAJA_EFECTIVO', 0, 0)])[0].codigo).toBe('LINEA_INVALIDA');
    expect(validarCuadre([linea('VENTAS', 0, 100), linea('CAJA_EFECTIVO', 100, 0)])).toEqual([]);
  });
  it('nunca ajusta: un descuadre mínimo se informa tal cual', () => {
    const e = validarCuadre([linea('VENTAS', 0, 10000), linea('CAJA_EFECTIVO', 10001, 0)]);
    expect(e).toHaveLength(1);
    expect(e[0].mensaje).toContain('10001');
  });
  it('proporcion redondea con mitad hacia arriba y no pierde precisión con productos grandes', () => {
    expect(proporcion(1, 1, 2)).toBe(1);
    expect(proporcion(1, 1, 3)).toBe(0);
    expect(proporcion(999_999_999_999, 999_999_999_999, 999_999_999_999)).toBe(999_999_999_999);
  });
});
