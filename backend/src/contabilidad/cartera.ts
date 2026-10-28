import { BadRequestException } from '@nestjs/common';
import type { Tx } from '../operaciones/ledger';
import { query } from '../operaciones/ledger';
import { aCentavos } from '../common/redondeo-monetario';
import { diaCalendario, rangoDiasEnZona } from '../common/zona-horaria';
import { centavosAImporte, fechaValida } from './fiscal-hn';
import { zonaDeEmpresa } from './libros';

/**
 * Cartera de cuentas por cobrar (CxC) y por pagar (CxP) al corte, en solo lectura, para Contabilidad.
 * No escribe ni corrige operaciones: lee `cuentas_operativas`, `pagos_cuenta` y `devoluciones` (crédito cancelado)
 * de la empresa. El saldo al corte se reconstruye en centavos enteros: monto − pagos − créditos cancelados por
 * devoluciones registrados hasta el fin del día de corte (zona horaria de la empresa).
 *
 * Integridad: en el corte de hoy, el saldo reconstruido debe coincidir con el saldo guardado por la operación, y en
 * CxC la suma por cliente con `clientes.saldo_pendiente`. Las diferencias se informan como hallazgos; nunca se
 * corrigen aquí.
 */
export type TipoCartera = 'CXC' | 'CXP';
export const TIPOS_CARTERA: readonly TipoCartera[] = ['CXC', 'CXP'];
export const TRAMOS_ANTIGUEDAD = ['SIN_VENCIMIENTO', 'AL_DIA', 'VENCIDA_1_30', 'VENCIDA_31_60', 'VENCIDA_61_90', 'VENCIDA_MAS_90'] as const;
export type Tramo = typeof TRAMOS_ANTIGUEDAD[number];

const c = (v: unknown) => aCentavos(Number(v ?? 0));
const dia = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === 'string' ? v.slice(0, 10) : null);
const DIA_MS = 86400000;
const diasEntre = (desde: string, hasta: string) => Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / DIA_MS);

export function tipoCartera(valor: unknown): TipoCartera {
  if (typeof valor !== 'string' || !(TIPOS_CARTERA as readonly string[]).includes(valor)) throw new BadRequestException('Tipo de cartera inválido (CXC o CXP)');
  return valor as TipoCartera;
}

/** Tramo de antigüedad de un saldo abierto según su vencimiento y el día de corte. */
export function tramoAntiguedad(saldoCentavos: number, vencimiento: string | null, corte: string): Tramo | null {
  if (saldoCentavos <= 0) return null;
  if (!vencimiento) return 'SIN_VENCIMIENTO';
  const atraso = diasEntre(vencimiento, corte);
  if (atraso <= 0) return 'AL_DIA';
  if (atraso <= 30) return 'VENCIDA_1_30';
  if (atraso <= 60) return 'VENCIDA_31_60';
  if (atraso <= 90) return 'VENCIDA_61_90';
  return 'VENCIDA_MAS_90';
}

/** Mismas reglas que Operaciones: PAGADA, VENCIDA (tiene prioridad), PARCIAL o PENDIENTE. */
export function estadoDeuda(montoCentavos: number, saldoCentavos: number, vencimiento: string | null, corte: string) {
  if (saldoCentavos <= 0) return 'PAGADA';
  if (vencimiento && vencimiento < corte) return 'VENCIDA';
  if (saldoCentavos < montoCentavos) return 'PARCIAL';
  return 'PENDIENTE';
}

export interface MovimientoCartera {
  cuentaId: string; tipo: 'CARGO' | 'PAGO' | 'DEVOLUCION'; fecha: string; hora: string; importe: string;
  metodo: string | null; referencia: string | null; responsable: string | null; detalle: string | null;
}

export async function carteraAlCorte(db: Tx, tenantId: string, tipo: TipoCartera, corteSolicitado?: string, ahora = new Date()) {
  const zona = await zonaDeEmpresa(db, tenantId);
  const hoy = diaCalendario(ahora, zona);
  const corte = corteSolicitado ? fechaValida(corteSolicitado, 'Fecha de corte') : hoy;
  if (corte > hoy) throw new BadRequestException('La fecha de corte no puede ser futura');
  const finCorte = rangoDiasEnZona(corte, corte, zona).fin.toISOString();
  // Fecha y hora del movimiento en la zona de la empresa (los timestamp sin zona son UTC).
  const formato = new Intl.DateTimeFormat('en-GB', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const hora = (v: unknown) => {
    const partes = formato.formatToParts(v instanceof Date ? v : new Date(`${(v as string).replace(' ', 'T')}Z`));
    const p = (t: string) => partes.find(x => x.type === t)?.value ?? '';
    return { fecha: `${p('year')}-${p('month')}-${p('day')}`, hora: `${p('hour')}:${p('minute')}:${p('second')}` };
  };
  // Una sola lectura por tabla (sin N+1). Los created_at se guardan en UTC sin zona.
  const limite = `($3::timestamptz AT TIME ZONE 'UTC')`;
  const cuentas = await query(db, `SELECT c.id, c.tipo, c.cliente_id, c.proveedor_id, c.documento_id, c.monto, c.saldo, c.vencimiento, c.created_at,
      COALESCE(cl.nombre, p.nombre) AS contraparte, COALESCE(cl.rtn, p.rtn) AS rtn,
      CASE WHEN c.tipo='CXC' THEN v.numero_venta::text ELSE COALESCE(o.numero_factura, o.codigo) END AS documento,
      u.nombre AS responsable
    FROM cuentas_operativas c
    LEFT JOIN clientes cl ON cl.id=c.cliente_id AND cl.tenant_id=c.tenant_id
    LEFT JOIN proveedores p ON p.id=c.proveedor_id AND p.tenant_id=c.tenant_id
    LEFT JOIN ventas v ON c.tipo='CXC' AND v.id=c.documento_id AND v.tenant_id=c.tenant_id
    LEFT JOIN ordenes_compra o ON c.tipo='CXP' AND o.id=c.documento_id AND o.tenant_id=c.tenant_id
    LEFT JOIN usuarios u ON u.id=c.usuario_id AND u.tenant_id=c.tenant_id
    WHERE c.tenant_id=$1 AND c.tipo=$2 AND c.created_at < ${limite}
    ORDER BY c.created_at, c.id`, tenantId, tipo, finCorte);
  const pagos = await query(db, `SELECT p.id, p.cuenta_id, p.monto, p.metodo, p.created_at, p.notas, COALESCE(ap.referencia, p.referencia) AS referencia, u.nombre AS responsable
    FROM pagos_cuenta p JOIN cuentas_operativas c ON c.id=p.cuenta_id AND c.tenant_id=p.tenant_id
    LEFT JOIN usuarios u ON u.id=p.usuario_id AND u.tenant_id=p.tenant_id
    LEFT JOIN aprobaciones_bancarias ap ON ap.tenant_id=p.tenant_id AND ap.origen='ABONO' AND ap.origen_id=p.id
    WHERE p.tenant_id=$1 AND c.tipo=$2 AND p.created_at < ${limite} ORDER BY p.created_at, p.id`, tenantId, tipo, finCorte);
  // Solo las ventas a crédito cancelan saldo de CxC por devolución (operaciones.ejecutarDevolucion).
  const devoluciones = tipo === 'CXC' ? await query(db, `SELECT d.id, c.id AS cuenta_id, d.credito_cancelado, d.created_at, d.motivo, u.nombre AS responsable
    FROM devoluciones d JOIN cuentas_operativas c ON c.tenant_id=d.tenant_id AND c.tipo='CXC' AND c.documento_id=d.venta_id
    LEFT JOIN usuarios u ON u.id=d.usuario_id AND u.tenant_id=d.tenant_id
    WHERE d.tenant_id=$1 AND $2='CXC' AND d.credito_cancelado > 0 AND d.created_at < ${limite} ORDER BY d.created_at, d.id`, tenantId, tipo, finCorte) : [];

  const pagosPor = new Map<string, any[]>(), devPor = new Map<string, any[]>();
  for (const p of pagos) pagosPor.set(p.cuenta_id, [...(pagosPor.get(p.cuenta_id) ?? []), p]);
  for (const d of devoluciones) devPor.set(d.cuenta_id, [...(devPor.get(d.cuenta_id) ?? []), d]);

  const hallazgos: { codigo: string; cuentaId: string | null; clienteId?: string | null; detalle: string }[] = [];
  const movimientos: MovimientoCartera[] = [];
  const totales = { monto: 0, pagado: 0, devoluciones: 0, saldo: 0 };
  const antiguedad = Object.fromEntries(TRAMOS_ANTIGUEDAD.map(t => [t, 0])) as Record<Tramo, number>;
  const saldoPorCliente = new Map<string, number>();
  const esCorteActual = corte === hoy;

  const filas = cuentas.map(k => {
    const monto = c(k.monto);
    const ps = pagosPor.get(k.id) ?? [], ds = devPor.get(k.id) ?? [];
    const pagado = ps.reduce((s, p) => s + c(p.monto), 0);
    const devuelto = ds.reduce((s, d) => s + c(d.credito_cancelado), 0);
    const saldo = monto - pagado - devuelto;
    const vencimiento = dia(k.vencimiento);
    if (saldo < 0) hallazgos.push({ codigo: 'SALDO_NEGATIVO', cuentaId: k.id, detalle: `Pagos y devoluciones superan el monto del documento ${k.documento ?? k.documento_id}` });
    // En el corte de hoy, la reconstrucción contable debe coincidir con el saldo que mantiene la operación.
    if (esCorteActual && saldo !== c(k.saldo)) hallazgos.push({ codigo: 'SALDO_NO_CONCILIA', cuentaId: k.id, detalle: `Saldo registrado L ${centavosAImporte(c(k.saldo))} ≠ monto − pagos − devoluciones L ${centavosAImporte(saldo)}` });
    if (k.tipo === 'CXC' && k.cliente_id) saldoPorCliente.set(k.cliente_id, (saldoPorCliente.get(k.cliente_id) ?? 0) + saldo);
    const tramo = tramoAntiguedad(saldo, vencimiento, corte);
    if (tramo) antiguedad[tramo] += saldo;
    totales.monto += monto; totales.pagado += pagado; totales.devoluciones += devuelto; totales.saldo += saldo;
    const alta = hora(k.created_at);
    movimientos.push({ cuentaId: k.id, tipo: 'CARGO', ...alta, importe: centavosAImporte(monto), metodo: null, referencia: k.documento ?? null, responsable: k.responsable ?? null, detalle: k.tipo === 'CXC' ? 'Venta a crédito' : 'Compra a crédito' });
    for (const p of ps) movimientos.push({ cuentaId: k.id, tipo: 'PAGO', ...hora(p.created_at), importe: centavosAImporte(c(p.monto)), metodo: p.metodo, referencia: p.referencia ?? null, responsable: p.responsable ?? null, detalle: p.notas ?? null });
    for (const d of ds) movimientos.push({ cuentaId: k.id, tipo: 'DEVOLUCION', ...hora(d.created_at), importe: centavosAImporte(c(d.credito_cancelado)), metodo: null, referencia: null, responsable: d.responsable ?? null, detalle: d.motivo ?? null });
    return {
      id: k.id, contraparteId: k.cliente_id ?? k.proveedor_id ?? null, contraparte: k.contraparte ?? null, rtn: k.rtn ?? null, documentoId: k.documento_id, documento: k.documento ?? null,
      fecha: alta.fecha, vencimiento, responsable: k.responsable ?? null,
      monto: centavosAImporte(monto), pagado: centavosAImporte(pagado), devoluciones: centavosAImporte(devuelto), saldo: centavosAImporte(saldo),
      estado: estadoDeuda(monto, saldo, vencimiento, corte), tramo, diasVencida: saldo > 0 && vencimiento && vencimiento < corte ? diasEntre(vencimiento, corte) : 0,
      pagos: ps.length,
    };
  });

  if (tipo === 'CXC' && esCorteActual && saldoPorCliente.size) {
    const clientes = await query(db, 'SELECT id, nombre, saldo_pendiente FROM clientes WHERE tenant_id=$1 AND id = ANY($2::text[])', tenantId, [...saldoPorCliente.keys()]);
    for (const cl of clientes) {
      const esperado = saldoPorCliente.get(cl.id) ?? 0;
      if (c(cl.saldo_pendiente) !== esperado) hallazgos.push({ codigo: 'SALDO_CLIENTE_NO_CONCILIA', cuentaId: null, clienteId: cl.id, detalle: `${cl.nombre}: saldo del cliente L ${centavosAImporte(c(cl.saldo_pendiente))} ≠ suma de sus cuentas por cobrar L ${centavosAImporte(esperado)}` });
    }
  }
  movimientos.sort((a, b) => `${a.fecha} ${a.hora}`.localeCompare(`${b.fecha} ${b.hora}`));
  return {
    tipo, corte, zona, integridadVerificada: esCorteActual,
    cuentas: filas, movimientos, hallazgos,
    totales: {
      cuentas: filas.length, abiertas: filas.filter(f => f.estado !== 'PAGADA').length,
      monto: centavosAImporte(totales.monto), pagado: centavosAImporte(totales.pagado), devoluciones: centavosAImporte(totales.devoluciones), saldo: centavosAImporte(totales.saldo),
      antiguedad: Object.fromEntries(TRAMOS_ANTIGUEDAD.map(t => [t, centavosAImporte(antiguedad[t])])) as Record<Tramo, string>,
    },
  };
}
