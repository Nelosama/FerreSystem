import { createHash } from 'node:crypto';
import { query, Tx } from '../operaciones/ledger';
import { ZONA_HORARIA_NEGOCIO } from '../common/zona-horaria';
import { aCentavos } from '../common/redondeo-monetario';
import {
  AutorizacionCai, CAMPOS_IMPORTE, ImportesDocumento, TIPOS_DOCUMENTO, analizarNumero, centavosAImporte, conciliarConCompra,
  conciliarConVenta, limitesPeriodo, normalizarRtn, tasaVigente, validarContraCai, verificarIsv,
} from './fiscal-hn';

/**
 * Lectura de los libros fiscales. Todo sale de la operación real (ventas, devoluciones, ordenes_compra)
 * y de los documentos fiscales que la respaldan. Nada se copia: cada consulta recalcula desde la fuente.
 */

type Db = Tx | { $queryRawUnsafe: (...args: any[]) => Promise<any> };
const dia = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === 'string' ? v.slice(0, 10) : '');
const c = (v: unknown) => aCentavos(Number(v ?? 0));

export interface FilaLibro {
  origen: 'DOCUMENTO' | 'VENTA' | 'COMPRA';
  documentoId: string | null;
  operacionId: string | null;
  referenciaInterna: string | null;
  fecha: string;
  tipoDocumento: string | null;
  tipoDocumentoNombre: string | null;
  numero: string | null;
  cai: string | null;
  contraparte: string;
  rtn: string | null;
  importeExento: string; importeExonerado: string; importeGravadoGeneral: string; importeGravadoEspecial: string;
  isvGeneral: string; isvEspecial: string; total: string;
  estado: string;
  /** −1 para notas de crédito, +1 para el resto; 0 si no suma (anulado o sin documento). */
  signo: -1 | 0 | 1;
  hallazgos: string[];
}

export interface TotalesLibro {
  documentos: number;
  importeExento: string; importeExonerado: string; importeGravadoGeneral: string; importeGravadoEspecial: string;
  isvGeneral: string; isvEspecial: string; total: string;
  /** Operaciones sin documento fiscal: se informan aparte y no suman al libro. */
  sinDocumento: { cantidad: number; base: string; isv: string; total: string };
}

export async function zonaDeEmpresa(db: Db, tenantId: string): Promise<string> {
  const [cfg] = await query(db as Tx, 'SELECT zona_horaria FROM fiscal_configuraciones WHERE tenant_id=$1', tenantId);
  return cfg?.zona_horaria ?? ZONA_HORARIA_NEGOCIO;
}

async function tasasDeEmpresa(db: Db, tenantId: string) {
  const filas = await query(db as Tx, "SELECT categoria, porcentaje, vigente_desde, vigente_hasta FROM fiscal_tasas WHERE tenant_id=$1 AND impuesto='ISV'", tenantId);
  return filas.map(t => ({ categoria: t.categoria as string, porcentaje: Number(t.porcentaje), vigenteDesde: dia(t.vigente_desde), vigenteHasta: t.vigente_hasta ? dia(t.vigente_hasta) : null }));
}

function importesDe(d: any): ImportesDocumento & { total: number } {
  return {
    importeExento: Number(d.importe_exento), importeExonerado: Number(d.importe_exonerado), importeGravadoGeneral: Number(d.importe_gravado_general),
    importeGravadoEspecial: Number(d.importe_gravado_especial), isvGeneral: Number(d.isv_general), isvEspecial: Number(d.isv_especial), total: Number(d.total),
  };
}

function caiDe(d: any): AutorizacionCai | null {
  if (!d.cai_ref_id) return null;
  return { cai: d.cai_ref, tipoDocumento: d.cai_tipo, establecimiento: d.cai_establecimiento, puntoEmision: d.cai_punto, rangoInicial: d.cai_inicial, rangoFinal: d.cai_final, fechaLimiteEmision: dia(d.cai_limite), activo: d.cai_activo };
}

const SELECT_DOCUMENTO = `SELECT d.*, a.id AS cai_ref_id, a.cai AS cai_ref, a.tipo_documento AS cai_tipo, a.establecimiento AS cai_establecimiento,
  a.punto_emision AS cai_punto, a.rango_inicial AS cai_inicial, a.rango_final AS cai_final, a.fecha_limite_emision AS cai_limite, a.activo AS cai_activo
  FROM fiscal_documentos d LEFT JOIN fiscal_cai a ON a.tenant_id=d.tenant_id AND a.id=d.cai_id`;

function filaDocumento(d: any, hallazgos: string[], referenciaInterna: string | null, operacionId: string | null): FilaLibro {
  const vigente = d.estado === 'VIGENTE';
  return {
    origen: 'DOCUMENTO', documentoId: d.id, operacionId, referenciaInterna, fecha: dia(d.fecha_emision), tipoDocumento: d.tipo_documento,
    tipoDocumentoNombre: TIPOS_DOCUMENTO[d.tipo_documento] ?? null, numero: d.numero, cai: d.cai ?? d.cai_ref ?? null,
    contraparte: d.nombre_contraparte, rtn: d.rtn_contraparte,
    ...Object.fromEntries(CAMPOS_IMPORTE.map(k => [k, centavosAImporte(c(importesDe(d)[k]))])) as any,
    total: centavosAImporte(c(d.total)), estado: d.estado,
    signo: !vigente ? 0 : d.tipo_documento === '06' ? -1 : 1, hallazgos: vigente ? hallazgos : [],
  };
}

function rtnOValido(valor: unknown): string | null {
  if (typeof valor !== 'string' || !valor.trim()) return null;
  try { return normalizarRtn(valor); } catch { return 'INVALIDO'; }
}

function totalizar(filas: FilaLibro[]): TotalesLibro {
  const suma = Object.fromEntries([...CAMPOS_IMPORTE, 'total'].map(k => [k, 0])) as Record<string, number>;
  const sinDoc = { cantidad: 0, base: 0, isv: 0, total: 0 };
  let documentos = 0;
  for (const f of filas) {
    if (f.origen === 'DOCUMENTO') {
      if (f.signo === 0) continue;
      documentos++;
      for (const k of [...CAMPOS_IMPORTE, 'total']) suma[k] += f.signo * c((f as any)[k]);
    } else if (f.estado !== 'ANULADA' && f.estado !== 'CANCELADA') {
      sinDoc.cantidad++; sinDoc.base += c(f.importeGravadoGeneral); sinDoc.isv += c(f.isvGeneral); sinDoc.total += c(f.total);
    }
  }
  return {
    documentos,
    ...Object.fromEntries(Object.entries(suma).map(([k, v]) => [k, centavosAImporte(v)])) as any,
    sinDocumento: { cantidad: sinDoc.cantidad, base: centavosAImporte(sinDoc.base), isv: centavosAImporte(sinDoc.isv), total: centavosAImporte(sinDoc.total) },
  };
}

const fechaLocal = (columna: string, parametro: string) => `((${columna} AT TIME ZONE 'UTC') AT TIME ZONE ${parametro})::date`;

export async function libroVentas(db: Db, tenantId: string, anio: number, mes: number) {
  const { desde, hasta } = limitesPeriodo(anio, mes);
  const zona = await zonaDeEmpresa(db, tenantId);
  const tasas = await tasasDeEmpresa(db, tenantId);
  const fechaVenta = fechaLocal('COALESCE(v.ocurrido_at, v.created_at)', '$2');
  const ventas = await query(db as Tx, `SELECT v.id, v.numero_venta, v.estado, v.subtotal, v.descuento, v.isv, v.total, v.cliente_rtn,
      COALESCE(NULLIF(v.cliente_nombre, ''), c.nombre, 'CONSUMIDOR FINAL') AS cliente, ${fechaVenta} AS fecha
    FROM ventas v LEFT JOIN clientes c ON c.id=v.cliente_id AND c.tenant_id=v.tenant_id
    WHERE v.tenant_id=$1 AND ${fechaVenta} BETWEEN $3::date AND $4::date ORDER BY fecha, v.numero_venta`, tenantId, zona, desde, hasta);
  const documentos = await query(db as Tx, `${SELECT_DOCUMENTO} WHERE d.tenant_id=$1 AND d.direccion='EMITIDO' AND d.fecha_emision BETWEEN $2::date AND $3::date ORDER BY d.fecha_emision, d.numero`, tenantId, desde, hasta);
  // Ventas citadas por documentos del período aunque se hayan registrado en otro mes (para conciliarlas).
  const idsVenta = [...new Set(documentos.map(d => d.venta_id).filter(Boolean))];
  const ventasDocumento = idsVenta.length ? await query(db as Tx, `SELECT v.id, v.numero_venta, v.estado, v.subtotal, v.descuento, v.isv, v.total, v.cliente_rtn, ${fechaVenta} AS fecha
    FROM ventas v WHERE v.tenant_id=$1 AND v.id = ANY($3::text[])`, tenantId, zona, idsVenta) : [];
  const ventaPorId = new Map([...ventas, ...ventasDocumento].map(v => [v.id, v]));
  // Facturas vigentes de las ventas del período, sin importar su fecha (una venta facturada no es «sin documento»).
  const facturadas = ventas.length ? new Set((await query(db as Tx, "SELECT venta_id FROM fiscal_documentos WHERE tenant_id=$1 AND estado='VIGENTE' AND tipo_documento='01' AND venta_id = ANY($2::text[])", tenantId, ventas.map(v => v.id))).map(r => r.venta_id)) : new Set<string>();

  const filas: FilaLibro[] = [];
  for (const d of documentos) {
    const hallazgos = [...validarContraCai(d.numero, dia(d.fecha_emision), caiDe(d))];
    const fecha = dia(d.fecha_emision);
    hallazgos.push(...verificarIsv(importesDe(d), tasaVigente(tasas, 'GENERAL', fecha)?.porcentaje ?? null, tasaVigente(tasas, 'ESPECIAL', fecha)?.porcentaje ?? null));
    if (['06', '07'].includes(d.tipo_documento) && !d.documento_referencia_id) hallazgos.push('SIN_DOCUMENTO_REFERENCIA');
    const v = d.venta_id ? ventaPorId.get(d.venta_id) : null;
    if (v) {
      if (d.tipo_documento === '01') hallazgos.push(...conciliarConVenta(importesDe(d), { subtotal: Number(v.subtotal), descuento: Number(v.descuento), isv: Number(v.isv), total: Number(v.total) }));
      if (v.estado === 'ANULADA') hallazgos.push('VENTA_ANULADA_CON_DOCUMENTO_VIGENTE');
      if (dia(v.fecha).slice(0, 7) !== fecha.slice(0, 7)) hallazgos.push('FECHA_DISTINTA_A_VENTA');
      const rtnVenta = rtnOValido(v.cliente_rtn);
      if (rtnVenta && rtnVenta !== (d.rtn_contraparte ?? null)) hallazgos.push('RTN_DISTINTO_A_VENTA');
    } else if (d.tipo_documento === '01') hallazgos.push('SIN_OPERACION');
    filas.push(filaDocumento(d, hallazgos, v ? `V-${v.numero_venta}` : null, d.venta_id ?? null));
  }
  for (const v of ventas) {
    if (facturadas.has(v.id)) continue;
    const base = c(v.subtotal) - c(v.descuento);
    const rtn = rtnOValido(v.cliente_rtn);
    const hallazgos = v.estado === 'COMPLETADA' ? ['SIN_DOCUMENTO_FISCAL', ...(rtn === 'INVALIDO' ? ['RTN_INVALIDO'] : [])] : [];
    filas.push({
      origen: 'VENTA', documentoId: null, operacionId: v.id, referenciaInterna: `V-${v.numero_venta}`, fecha: dia(v.fecha), tipoDocumento: null, tipoDocumentoNombre: null,
      numero: null, cai: null, contraparte: v.cliente, rtn: rtn === 'INVALIDO' ? v.cliente_rtn : rtn,
      importeExento: '0.00', importeExonerado: '0.00', importeGravadoGeneral: centavosAImporte(base), importeGravadoEspecial: '0.00',
      isvGeneral: centavosAImporte(c(v.isv)), isvEspecial: '0.00', total: centavosAImporte(c(v.total)), estado: v.estado, signo: 0, hallazgos,
    });
  }
  filas.sort((a, b) => a.fecha.localeCompare(b.fecha) || String(a.numero ?? a.referenciaInterna).localeCompare(String(b.numero ?? b.referenciaInterna)));

  const devoluciones = (await query(db as Tx, `SELECT d.id, d.venta_id, d.monto, ${fechaLocal('d.created_at', '$2')} AS fecha, v.numero_venta,
      (SELECT f.id FROM fiscal_documentos f WHERE f.tenant_id=d.tenant_id AND f.venta_id=d.venta_id AND f.estado='VIGENTE' AND f.tipo_documento='01' LIMIT 1) AS factura_id
    FROM devoluciones d JOIN ventas v ON v.id=d.venta_id AND v.tenant_id=d.tenant_id
    WHERE d.tenant_id=$1 AND ${fechaLocal('d.created_at', '$2')} BETWEEN $3::date AND $4::date ORDER BY fecha`, tenantId, zona, desde, hasta));
  const notas = devoluciones.some(d => d.factura_id) ? await query(db as Tx, "SELECT documento_referencia_id FROM fiscal_documentos WHERE tenant_id=$1 AND tipo_documento='06' AND estado='VIGENTE' AND documento_referencia_id = ANY($2::text[])", tenantId, devoluciones.map(d => d.factura_id).filter(Boolean)) : [];
  const conNota = new Set(notas.map(n => n.documento_referencia_id));
  return {
    periodo: { anio, mes, desde, hasta, zona },
    filas,
    totales: totalizar(filas),
    devoluciones: devoluciones.map(d => ({
      id: d.id, ventaId: d.venta_id, referenciaInterna: `V-${d.numero_venta}`, fecha: dia(d.fecha), monto: centavosAImporte(c(d.monto)),
      hallazgos: d.factura_id && conNota.has(d.factura_id) ? [] : ['DEVOLUCION_SIN_NOTA_CREDITO'],
    })),
  };
}

export async function libroCompras(db: Db, tenantId: string, anio: number, mes: number) {
  const { desde, hasta } = limitesPeriodo(anio, mes);
  const zona = await zonaDeEmpresa(db, tenantId);
  const tasas = await tasasDeEmpresa(db, tenantId);
  const fechaOrden = fechaLocal('o.fecha_emision', '$2');
  const documentos = await query(db as Tx, `${SELECT_DOCUMENTO} WHERE d.tenant_id=$1 AND d.direccion='RECIBIDO' AND d.fecha_emision BETWEEN $2::date AND $3::date ORDER BY d.fecha_emision, d.numero`, tenantId, desde, hasta);
  const idsOrden = [...new Set(documentos.map(d => d.orden_compra_id).filter(Boolean))];
  const ordenesDoc = idsOrden.length ? await query(db as Tx, 'SELECT id, codigo, subtotal, isv, total, estado FROM ordenes_compra WHERE tenant_id=$1 AND id = ANY($2::text[])', tenantId, idsOrden) : [];
  const ordenPorId = new Map(ordenesDoc.map(o => [o.id, o]));
  const ordenes = await query(db as Tx, `SELECT o.id, o.codigo, o.numero_factura, o.subtotal, o.isv, o.total, o.estado, p.nombre AS proveedor, p.rtn, ${fechaOrden} AS fecha,
      EXISTS (SELECT 1 FROM fiscal_documentos f WHERE f.tenant_id=o.tenant_id AND f.orden_compra_id=o.id AND f.estado='VIGENTE' AND f.tipo_documento='01') AS facturada
    FROM ordenes_compra o JOIN proveedores p ON p.id=o.proveedor_id AND p.tenant_id=o.tenant_id
    WHERE o.tenant_id=$1 AND o.estado <> 'CANCELADA' AND ${fechaOrden} BETWEEN $3::date AND $4::date ORDER BY fecha, o.codigo`, tenantId, zona, desde, hasta);

  const filas: FilaLibro[] = [];
  for (const d of documentos) {
    const fecha = dia(d.fecha_emision);
    const hallazgos: string[] = [];
    if (d.tipo_documento === '01' && !d.cai) hallazgos.push('SIN_CAI');
    if (!d.rtn_contraparte) hallazgos.push('SIN_RTN_PROVEEDOR');
    hallazgos.push(...verificarIsv(importesDe(d), tasaVigente(tasas, 'GENERAL', fecha)?.porcentaje ?? null, tasaVigente(tasas, 'ESPECIAL', fecha)?.porcentaje ?? null));
    if (['06', '07'].includes(d.tipo_documento) && !d.documento_referencia_id) hallazgos.push('SIN_DOCUMENTO_REFERENCIA');
    const o = d.orden_compra_id ? ordenPorId.get(d.orden_compra_id) : null;
    if (o) {
      if (d.tipo_documento === '01') hallazgos.push(...conciliarConCompra(importesDe(d), { subtotal: Number(o.subtotal), isv: Number(o.isv), total: Number(o.total) }));
      if (o.estado === 'CANCELADA') hallazgos.push('COMPRA_CANCELADA_CON_DOCUMENTO_VIGENTE');
    }
    filas.push(filaDocumento(d, hallazgos, o?.codigo ?? null, d.orden_compra_id ?? null));
  }
  for (const o of ordenes) {
    if (o.facturada) continue;
    filas.push({
      origen: 'COMPRA', documentoId: null, operacionId: o.id, referenciaInterna: o.codigo, fecha: dia(o.fecha), tipoDocumento: null, tipoDocumentoNombre: null,
      numero: o.numero_factura ?? null, cai: null, contraparte: o.proveedor, rtn: rtnOValido(o.rtn) === 'INVALIDO' ? o.rtn : rtnOValido(o.rtn),
      importeExento: '0.00', importeExonerado: '0.00', importeGravadoGeneral: centavosAImporte(c(o.subtotal)), importeGravadoEspecial: '0.00',
      isvGeneral: centavosAImporte(c(o.isv)), isvEspecial: '0.00', total: centavosAImporte(c(o.total)), estado: o.estado, signo: 0, hallazgos: ['SIN_DOCUMENTO_FISCAL'],
    });
  }
  filas.sort((a, b) => a.fecha.localeCompare(b.fecha) || String(a.numero ?? a.referenciaInterna).localeCompare(String(b.numero ?? b.referenciaInterna)));
  return { periodo: { anio, mes, desde, hasta, zona }, filas, totales: totalizar(filas) };
}

export async function retencionesPeriodo(db: Db, tenantId: string, anio: number, mes: number) {
  const { desde, hasta } = limitesPeriodo(anio, mes);
  const filas = await query(db as Tx, `SELECT r.id, r.tipo, r.fecha, r.base, r.porcentaje, r.monto, r.comprobante_numero, r.estado, r.documento_id,
      g.codigo, g.impuesto, g.descripcion, d.numero AS documento_numero, d.nombre_contraparte, d.rtn_contraparte
    FROM fiscal_retenciones r JOIN fiscal_reglas_retencion g ON g.tenant_id=r.tenant_id AND g.id=r.regla_id
    JOIN fiscal_documentos d ON d.tenant_id=r.tenant_id AND d.id=r.documento_id
    WHERE r.tenant_id=$1 AND r.fecha BETWEEN $2::date AND $3::date ORDER BY r.fecha, r.created_at`, tenantId, desde, hasta);
  return filas.map(r => ({
    id: r.id, tipo: r.tipo, fecha: dia(r.fecha), base: centavosAImporte(c(r.base)), porcentaje: Number(r.porcentaje).toFixed(2), monto: centavosAImporte(c(r.monto)),
    comprobanteNumero: r.comprobante_numero, estado: r.estado, documentoId: r.documento_id, documentoNumero: r.documento_numero,
    contraparte: r.nombre_contraparte, rtn: r.rtn_contraparte, regla: { codigo: r.codigo, impuesto: r.impuesto, descripcion: r.descripcion },
  }));
}

/** Cálculo de trabajo del ISV del período. No sustituye la declaración que se presenta ante el SAR. */
export async function resumenIsv(db: Db, tenantId: string, anio: number, mes: number) {
  const [ventas, compras, retenciones] = await Promise.all([libroVentas(db, tenantId, anio, mes), libroCompras(db, tenantId, anio, mes), retencionesPeriodo(db, tenantId, anio, mes)]);
  const debito = c(ventas.totales.isvGeneral) + c(ventas.totales.isvEspecial);
  const credito = c(compras.totales.isvGeneral) + c(compras.totales.isvEspecial);
  const sumaRet = (tipo: string, impuesto: string) => retenciones.filter(r => r.estado === 'VIGENTE' && r.tipo === tipo && r.regla.impuesto === impuesto).reduce((s, r) => s + c(r.monto), 0);
  const isvSufrido = sumaRet('SUFRIDA', 'ISV');
  const resultado = debito - credito - isvSufrido;
  return {
    periodo: ventas.periodo,
    debitoFiscal: centavosAImporte(debito),
    creditoFiscal: centavosAImporte(credito),
    retencionesIsvSufridas: centavosAImporte(isvSufrido),
    resultado: centavosAImporte(Math.abs(resultado)),
    tipoResultado: resultado > 0 ? 'A_PAGAR' : resultado < 0 ? 'A_FAVOR' : 'CERO',
    retencionesPorEnterar: { isv: centavosAImporte(sumaRet('EFECTUADA', 'ISV')), isr: centavosAImporte(sumaRet('EFECTUADA', 'ISR')) },
    ventasSinDocumento: ventas.totales.sinDocumento,
    comprasSinDocumento: compras.totales.sinDocumento,
    aviso: 'Cálculo de trabajo con los documentos registrados. La declaración se presenta en los sistemas del SAR y debe revisarla el contador responsable.',
  };
}

/** Huella de los libros: cambia si cambia cualquier importe, estado, documento u operación incluida. */
export function huellaLibros(ventas: { filas: FilaLibro[]; devoluciones: unknown[] }, compras: { filas: FilaLibro[] }, retenciones: unknown[]) {
  const sinHallazgos = (f: FilaLibro) => ({ ...f, hallazgos: undefined });
  return createHash('sha256').update(JSON.stringify({ v: ventas.filas.map(sinHallazgos), d: ventas.devoluciones, c: compras.filas.map(sinHallazgos), r: retenciones })).digest('hex');
}

/** Saltos en la numeración emitida por establecimiento, punto y tipo (dentro del período). */
export function saltosCorrelativo(filas: FilaLibro[], limite = 50) {
  const grupos = new Map<string, number[]>();
  for (const f of filas) {
    if (f.origen !== 'DOCUMENTO' || !f.numero) continue;
    const n = analizarNumero(f.numero);
    const clave = `${n.establecimiento}-${n.puntoEmision}-${n.tipoDocumento}`;
    grupos.set(clave, [...(grupos.get(clave) ?? []), n.correlativo]);
  }
  const saltos: { serie: string; desde: number; hasta: number }[] = [];
  for (const [serie, numeros] of grupos) {
    const orden = [...new Set(numeros)].sort((a, b) => a - b);
    for (let i = 1; i < orden.length && saltos.length < limite; i++) if (orden[i] - orden[i - 1] > 1) saltos.push({ serie, desde: orden[i - 1] + 1, hasta: orden[i] - 1 });
  }
  return saltos;
}

export async function conciliacion(db: Db, tenantId: string, anio: number, mes: number) {
  const [ventas, compras, retenciones, periodos, configuracion, tasas] = await Promise.all([
    libroVentas(db, tenantId, anio, mes), libroCompras(db, tenantId, anio, mes), retencionesPeriodo(db, tenantId, anio, mes),
    query(db as Tx, 'SELECT estado, huella FROM fiscal_periodos WHERE tenant_id=$1 AND anio=$2 AND mes=$3', tenantId, anio, mes),
    query(db as Tx, 'SELECT rtn FROM fiscal_configuraciones WHERE tenant_id=$1', tenantId),
    tasasDeEmpresa(db, tenantId),
  ]);
  const hallazgos: { libro: string; codigo: string; referencia: string; detalle?: string }[] = [];
  const agregar = (libro: string, filas: FilaLibro[]) => {
    for (const f of filas) for (const codigo of f.hallazgos) hallazgos.push({ libro, codigo, referencia: f.numero ?? f.referenciaInterna ?? '' });
  };
  agregar('VENTAS', ventas.filas);
  agregar('COMPRAS', compras.filas);
  for (const d of ventas.devoluciones) for (const codigo of d.hallazgos) hallazgos.push({ libro: 'VENTAS', codigo, referencia: d.referenciaInterna, detalle: `Devolución L ${d.monto}` });
  const saltos = saltosCorrelativo(ventas.filas);
  for (const s of saltos) hallazgos.push({ libro: 'VENTAS', codigo: 'SALTO_CORRELATIVO', referencia: s.serie, detalle: `${s.desde}–${s.hasta}` });
  if (!configuracion[0]?.rtn) hallazgos.push({ libro: 'CONFIGURACION', codigo: 'SIN_RTN_EMPRESA', referencia: '' });
  const { desde, hasta } = limitesPeriodo(anio, mes);
  if (!tasaVigente(tasas, 'GENERAL', desde) || !tasaVigente(tasas, 'GENERAL', hasta)) hallazgos.push({ libro: 'CONFIGURACION', codigo: 'SIN_TASA_GENERAL_VIGENTE', referencia: `${desde}/${hasta}` });
  const periodo = periodos[0];
  const huella = huellaLibros(ventas, compras, retenciones);
  if (periodo?.estado === 'CERRADO' && periodo.huella !== huella) hallazgos.push({ libro: 'PERIODO', codigo: 'LIBRO_CAMBIO_TRAS_CIERRE', referencia: `${anio}-${String(mes).padStart(2, '0')}` });
  const porCodigo: Record<string, number> = {};
  for (const h of hallazgos) porCodigo[h.codigo] = (porCodigo[h.codigo] ?? 0) + 1;
  return { periodo: ventas.periodo, estadoPeriodo: periodo?.estado ?? 'ABIERTO', huella, total: hallazgos.length, porCodigo, hallazgos };
}


/** Balanza de comprobación del período: movimientos del mes y saldo acumulado al cierre, por cuenta. */
export async function balanza(db: Tx, tenantId: string, anio: number, mes: number) {
  const { desde, hasta } = limitesPeriodo(anio, mes);
  const filas = await query(db, `SELECT k.id, k.codigo, k.nombre, k.tipo, k.naturaleza,
      COALESCE(sum(l.debe) FILTER (WHERE a.fecha BETWEEN $2::date AND $3::date),0) AS debe_periodo,
      COALESCE(sum(l.haber) FILTER (WHERE a.fecha BETWEEN $2::date AND $3::date),0) AS haber_periodo,
      COALESCE(sum(l.debe) FILTER (WHERE a.fecha <= $3::date),0) AS debe_acumulado,
      COALESCE(sum(l.haber) FILTER (WHERE a.fecha <= $3::date),0) AS haber_acumulado
    FROM contable_cuentas k LEFT JOIN contable_asiento_lineas l ON l.tenant_id=k.tenant_id AND l.cuenta_id=k.id
    LEFT JOIN contable_asientos a ON a.tenant_id=l.tenant_id AND a.id=l.asiento_id
    WHERE k.tenant_id=$1 GROUP BY k.id ORDER BY k.codigo`, tenantId, desde, hasta);
  let td = 0, th = 0;
  const cuentas = filas.map(k => {
    const d = c(k.debe_acumulado), h = c(k.haber_acumulado);
    td += c(k.debe_periodo); th += c(k.haber_periodo);
    const saldo = k.naturaleza === 'DEUDORA' ? d - h : h - d;
    return { id: k.id as string, codigo: k.codigo as string, nombre: k.nombre as string, tipo: k.tipo as string, naturaleza: k.naturaleza as string, debePeriodo: c(k.debe_periodo) / 100, haberPeriodo: c(k.haber_periodo) / 100, saldo: saldo / 100 };
  });
  return { periodo: { anio, mes, desde, hasta }, cuentas, totales: { debe: td / 100, haber: th / 100, cuadra: td === th } };
}
