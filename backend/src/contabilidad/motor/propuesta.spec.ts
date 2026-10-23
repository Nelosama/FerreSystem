import { centavosDeFila, compraDesdeFila, devolucionDesdeFilas, lineasCostoDesdeFilas, pagoDesdeFila, ventaDesdeFila } from './adaptadores';
import { claveOrigen, huellaOrigen } from './origen';
import { proponer } from './propuesta';
import { asientoCostoVenta, asientoDevolucion, asientoVenta } from './reglas';
import { resolverCuentas, type CuentaCatalogo, type MapeoVigencia } from './resolucion';

const cuentas: CuentaCatalogo[] = [
  { id: 'k-caja', codigo: '1.1', nombre: 'Caja', activa: true, aceptaMovimientos: true },
  { id: 'k-ventas', codigo: '4.1', nombre: 'Ventas', activa: true, aceptaMovimientos: true },
  { id: 'k-isv', codigo: '2.1', nombre: 'ISV por pagar', activa: true, aceptaMovimientos: true },
  { id: 'k-grupo', codigo: '1', nombre: 'Activo', activa: true, aceptaMovimientos: false },
  { id: 'k-baja', codigo: '9.9', nombre: 'Cuenta inactiva', activa: false, aceptaMovimientos: true },
];
const mapeos: MapeoVigencia[] = [
  { concepto: 'CAJA_EFECTIVO', cuentaId: 'k-caja', desde: '2026-01-01', hasta: null },
  { concepto: 'VENTAS', cuentaId: 'k-ventas', desde: '2026-01-01', hasta: null },
  { concepto: 'ISV_POR_PAGAR', cuentaId: 'k-isv', desde: '2026-01-01', hasta: null },
];
const filaVenta = { subtotal: '100.00', descuento: '0.00', isv: '15.00', total: '115.00', tipo_pago: 'CONTADO', metodo_pago: 'EFECTIVO' };
const origen = { tipo: 'VENTA', id: 'v-1', evento: 'RECONOCIMIENTO' } as const;

describe('adaptadores', () => {
  it('convierten decimales exactos a centavos sin coma flotante', () => {
    expect(centavosDeFila('115.00')).toBe(11500);
    expect(centavosDeFila('0.1')).toBe(10);
    expect(centavosDeFila(2599.5)).toBe(259950);
    expect(centavosDeFila({ toString: () => '12.30' })).toBe(1230);
    expect(centavosDeFila('1.000')).toBe(100);
    expect(centavosDeFila('9007199254740.99')).toBe(900719925474099);
  });
  it('rechazan valores no numéricos, con más de dos decimales o fuera de rango', () => {
    for (const malo of ['abc', '', null, undefined, '1.005', NaN, '99999999999999999.99']) expect(() => centavosDeFila(malo)).toThrow(RangeError);
  });
  it('arman las entradas del motor desde filas de la base', () => {
    expect(ventaDesdeFila(filaVenta)).toEqual({ subtotalCentavos: 10000, descuentoCentavos: 0, isvCentavos: 1500, totalCentavos: 11500, tipoPago: 'CONTADO', metodoPago: 'EFECTIVO' });
    expect(pagoDesdeFila({ monto: '50.00', metodo: 'TARJETA' })).toEqual({ montoCentavos: 5000, metodo: 'TARJETA' });
    expect(compraDesdeFila({ subtotal: '200.00', isv: '30.00', total: '230.00' })).toEqual({ subtotalCentavos: 20000, isvCentavos: 3000, totalCentavos: 23000 });
    expect(lineasCostoDesdeFilas([{ cantidad: '2.50', costo_unitario: '25.99', sin_inventario: false }])).toEqual([{ cantidadCentesimas: 250, costoUnitarioCentavos: 2599, sinInventario: false }]);
    const d = devolucionDesdeFilas({ monto: '57.50', credito_cancelado: '0.00', reembolso: '57.50', metodo: 'EFECTIVO' }, filaVenta);
    expect(d).toMatchObject({ montoCentavos: 5750, reembolsoCentavos: 5750, metodoReembolso: 'EFECTIVO', venta: { totalCentavos: 11500 } });
    expect(asientoDevolucion(d, { descuento: 'NETO' }).ok).toBe(true);
  });
});

describe('origen', () => {
  it('la clave incluye la empresa, el tipo, el id y el evento', () => {
    expect(claveOrigen('t1', origen)).toBe('t1|VENTA|v-1|RECONOCIMIENTO');
    expect(claveOrigen('t2', origen)).not.toBe(claveOrigen('t1', origen));
    expect(claveOrigen('t1', { ...origen, evento: 'COSTO_VENTA' })).not.toBe(claveOrigen('t1', origen));
  });
  it('la huella es estable ante el orden de propiedades y cambia si cambia un dato', () => {
    expect(huellaOrigen({ a: 1, b: { c: 2, d: [1, 2] } })).toBe(huellaOrigen({ b: { d: [1, 2], c: 2 }, a: 1 }));
    expect(huellaOrigen({ a: 1 })).not.toBe(huellaOrigen({ a: 2 }));
    expect(huellaOrigen({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
    expect(huellaOrigen({ a: 1, b: undefined })).toBe(huellaOrigen({ a: 1 }));
  });
});

describe('resolverCuentas', () => {
  const lineas = (r: ReturnType<typeof asientoVenta>) => { if (!r.ok) throw new Error('motor'); return r.lineas; };
  const venta = asientoVenta(ventaDesdeFila(filaVenta), { descuento: 'NETO' });
  it('asigna la cuenta vigente a cada concepto', () => {
    const r = resolverCuentas(lineas(venta), '2026-09-10', mapeos, cuentas);
    expect(r.ok && r.lineas.map((l) => l.cuentaCodigo)).toEqual(['1.1', '4.1', '2.1']);
  });
  it('sin mapeo vigente a la fecha informa el concepto faltante (no elige otra cuenta)', () => {
    const r = resolverCuentas(lineas(venta), '2025-12-31', mapeos, cuentas);
    expect(r).toMatchObject({ ok: false, faltantes: ['CAJA_EFECTIVO', 'VENTAS', 'ISV_POR_PAGAR'] });
    const parcial = resolverCuentas(lineas(venta), '2026-09-10', mapeos.slice(0, 2), cuentas);
    expect(parcial).toMatchObject({ ok: false, faltantes: ['ISV_POR_PAGAR'] });
  });
  it('respeta el cierre de vigencia y detecta mapeos ambiguos', () => {
    const cerrado: MapeoVigencia[] = [{ ...mapeos[0], hasta: '2026-06-30' }, ...mapeos.slice(1)];
    expect(resolverCuentas(lineas(venta), '2026-06-30', cerrado, cuentas).ok).toBe(true);
    expect(resolverCuentas(lineas(venta), '2026-07-01', cerrado, cuentas)).toMatchObject({ ok: false, faltantes: ['CAJA_EFECTIVO'] });
    const ambiguo = [...mapeos, { concepto: 'VENTAS', cuentaId: 'k-caja', desde: '2026-02-01', hasta: null } as MapeoVigencia];
    expect(resolverCuentas(lineas(venta), '2026-09-10', ambiguo, cuentas)).toMatchObject({ ok: false, invalidas: [{ concepto: 'VENTAS', motivo: 'MAPEO_AMBIGUO' }] });
  });
  it('rechaza cuentas inexistentes, inactivas o que no aceptan movimientos', () => {
    const con = (cuentaId: string): MapeoVigencia[] => [{ ...mapeos[0], cuentaId }, ...mapeos.slice(1)];
    const motivo = (id: string) => { const r = resolverCuentas(lineas(venta), '2026-09-10', con(id), cuentas); return !r.ok && r.invalidas[0].motivo; };
    expect(motivo('no-existe')).toBe('CUENTA_INEXISTENTE');
    expect(motivo('k-baja')).toBe('CUENTA_INACTIVA');
    expect(motivo('k-grupo')).toBe('CUENTA_NO_ACEPTA_MOVIMIENTOS');
  });
  it('exige una fecha contable válida', () => {
    expect(() => resolverCuentas([], '10/09/2026', mapeos, cuentas)).toThrow(RangeError);
  });
});

describe('proponer', () => {
  const datos = (resultado = asientoVenta(ventaDesdeFila(filaVenta), { descuento: 'NETO' })) => ({ origen, fecha: '2026-09-10', concepto: 'Venta 1', resultado, fuente: filaVenta });
  it('LISTA: líneas con cuenta, huella y total', () => {
    const p = proponer(datos(), mapeos, cuentas);
    expect(p).toMatchObject({ estado: 'LISTA', regla: 'venta', version: 1, totalCentavos: 11500 });
    expect(p.estado === 'LISTA' && p.huella).toMatch(/^[0-9a-f]{64}$/);
    expect(p.estado === 'LISTA' && p.lineas.reduce((s, l) => s + l.debeCentavos - l.haberCentavos, 0)).toBe(0);
  });
  it('la huella cambia si cambia la operación leída', () => {
    const a = proponer(datos(), mapeos, cuentas);
    const b = proponer({ ...datos(), fuente: { ...filaVenta, total: '116.00' } }, mapeos, cuentas);
    expect(a.estado === 'LISTA' && b.estado === 'LISTA' && a.huella !== b.huella).toBe(true);
  });
  it('FALTA_MAPEO cuando el catálogo no está configurado y ERROR cuando la operación no cuadra', () => {
    expect(proponer(datos(), [], cuentas)).toMatchObject({ estado: 'FALTA_MAPEO', faltantes: ['CAJA_EFECTIVO', 'VENTAS', 'ISV_POR_PAGAR'] });
    const mala = asientoVenta({ ...ventaDesdeFila(filaVenta), totalCentavos: 1 }, { descuento: 'NETO' });
    expect(proponer(datos(mala), mapeos, cuentas)).toMatchObject({ estado: 'ERROR', errores: [{ codigo: 'TOTAL_INCONSISTENTE' }] });
  });
  it('una operación sin costo contabilizable queda sin líneas y no inventa un asiento', () => {
    const vacio = asientoCostoVenta(lineasCostoDesdeFilas([{ cantidad: '1.00', costo_unitario: '10.00', sin_inventario: true }]));
    expect(vacio).toMatchObject({ ok: true, lineas: [] });
    expect(proponer({ ...datos(vacio), origen: { tipo: 'VENTA', id: 'v-1', evento: 'COSTO_VENTA' } }, mapeos, cuentas)).toMatchObject({ estado: 'SIN_ASIENTO', regla: 'costo_venta' });
  });
});
