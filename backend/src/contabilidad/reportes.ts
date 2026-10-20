/**
 * Hojas de Excel de cada informe contable. Cada hoja se arma solo con datos registrados en Jowa System:
 * si un dato no existe, la celda queda vacía y el resumen lo dice expresamente (nunca se sustituye por cero).
 * Las cifras salen de las mismas consultas que la pantalla (libros, conciliación, balanza), filtradas por empresa y período.
 */
import { BadRequestException } from '@nestjs/common';
import type { Tx } from '../operaciones/ledger';
import { query } from '../operaciones/ledger';
import { aCentavos } from '../common/redondeo-monetario';
import { Celda, Hoja, Libro } from './excel';
import { TIPOS_DOCUMENTO, limitesPeriodo } from './fiscal-hn';
import { balanza, conciliacion, libroCompras, libroVentas, resumenIsv, retencionesPeriodo, zonaDeEmpresa } from './libros';

/** Filas de identificación que llevan todas las hojas (empresa, RTN, período, estado, generación, aviso). */
export const LINEAS_IDENTIFICACION = 6;
/** Fila de la primera fila de datos en una hoja: título (1) + identificación + vacía + encabezado. */
export const PRIMERA_FILA_DATOS = 1 + LINEAS_IDENTIFICACION + 2 + 1;

export const NOTA_TRABAJO = 'Libro de trabajo generado desde los registros de Jowa System. No sustituye las declaraciones ni los formatos oficiales del SAR; las reglas tributarias aplicadas dependen de la configuración de la empresa y deben ser validadas por el profesional responsable.';

export const REPORTES = ['ventas', 'compras', 'isv', 'retenciones', 'documentos', 'conciliacion', 'hallazgos', 'catalogo', 'diario', 'balanza', 'periodos', 'ajustes', 'mensual'] as const;
export type Reporte = typeof REPORTES[number];

export interface Contexto {
  tenantId: string;
  anio: number;
  mes: number;
  zona: string;
  nombreComercial: string;
  razonSocial: string | null;
  rtn: string | null;
  agenteRetencion: boolean | null;
  estadoPeriodo: string;
  generadoPor: string;
  generadoAt: Date;
  desde: string;
  hasta: string;
}

const etiquetaPeriodo = (anio: number, mes: number) => `${String(mes).padStart(2, '0')}/${anio}`;
const dia = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === 'string' ? v.slice(0, 10) : undefined);
const monto = (v: unknown): number | undefined => (v === null || v === undefined || v === '' ? undefined : Number(v));

/** Fecha y hora en la zona de la empresa, para «Generado» y registros de bitácora. */
export function fechaHoraZona(instante: Date, zona: string) {
  const partes = new Intl.DateTimeFormat('en-GB', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(instante);
  const v = (t: string) => partes.find(p => p.type === t)?.value ?? '';
  return { fecha: `${v('year')}-${v('month')}-${v('day')}`, hora: `${v('hour')}:${v('minute')}:${v('second')}` };
}

export async function contexto(db: Tx, tenantId: string, anio: number, mes: number, usuarioId: string): Promise<Contexto> {
  const zona = await zonaDeEmpresa(db, tenantId);
  const [t] = await query(db, 'SELECT nombre_comercial FROM tenants WHERE id=$1', tenantId);
  const [cfg] = await query(db, 'SELECT rtn, razon_social, agente_retencion FROM fiscal_configuraciones WHERE tenant_id=$1', tenantId);
  const [periodo] = await query(db, 'SELECT estado FROM fiscal_periodos WHERE tenant_id=$1 AND anio=$2 AND mes=$3', tenantId, anio, mes);
  const [usuario] = await query(db, 'SELECT nombre FROM usuarios WHERE tenant_id=$1 AND id=$2', tenantId, usuarioId);
  const { desde, hasta } = limitesPeriodo(anio, mes);
  return {
    tenantId, anio, mes, zona,
    nombreComercial: t?.nombre_comercial ?? 'Empresa',
    razonSocial: cfg?.razon_social?.trim() || null,
    rtn: cfg?.rtn ?? null,
    agenteRetencion: cfg ? Boolean(cfg.agente_retencion) : null,
    estadoPeriodo: periodo?.estado ?? 'ABIERTO',
    generadoPor: usuario?.nombre ?? 'Usuario',
    generadoAt: new Date(),
    desde, hasta,
  };
}

function metadatos(ctx: Contexto): string[] {
  const generado = fechaHoraZona(ctx.generadoAt, ctx.zona);
  return [
    `Empresa: ${ctx.nombreComercial}`,
    `Razón social: ${ctx.razonSocial ?? 'NO REGISTRADA (complete los datos fiscales de la empresa)'}`,
    `RTN: ${ctx.rtn ?? 'NO REGISTRADO (complete los datos fiscales de la empresa)'}`,
    `Período contable: ${etiquetaPeriodo(ctx.anio, ctx.mes)} (del ${ctx.desde} al ${ctx.hasta})`,
    `Estado del período: ${ctx.estadoPeriodo === 'CERRADO' ? 'CERRADO' : 'ABIERTO'}`,
    `Generado: ${generado.fecha} ${generado.hora} (${ctx.zona}) por ${ctx.generadoPor}`,
  ];
}

function hoja(ctx: Contexto, nombre: string, titulo: string, columnas: Hoja['columnas'], filas: Celda[][], extra: Partial<Hoja> = {}): Hoja {
  return { nombre, titulo: `${titulo} · ${ctx.nombreComercial}`, metadatos: metadatos(ctx), columnas, filas, notas: [NOTA_TRABAJO], ...extra };
}

const SIN_REGISTROS = 'No hay registros en el período.';

// ---------- Libros ----------
export async function hojaVentas(db: Tx, ctx: Contexto): Promise<Hoja> {
  const libro = await libroVentas(db, ctx.tenantId, ctx.anio, ctx.mes);
  const columnas: Hoja['columnas'] = [
    { titulo: 'Fecha', tipo: 'fecha' }, { titulo: 'Tipo de documento', tipo: 'texto', ancho: 22 }, { titulo: 'Código tipo', tipo: 'codigo', ancho: 10 },
    { titulo: 'Número de documento', tipo: 'codigo', ancho: 22 }, { titulo: 'CAI', tipo: 'codigo', ancho: 26 }, { titulo: 'Cliente', tipo: 'texto', ancho: 30 },
    { titulo: 'RTN', tipo: 'codigo', ancho: 18 }, { titulo: 'Referencia interna', tipo: 'codigo', ancho: 14 },
    { titulo: 'Exento', tipo: 'monto' }, { titulo: 'Exonerado', tipo: 'monto' }, { titulo: 'Gravado tasa general', tipo: 'monto' }, { titulo: 'Gravado tasa especial', tipo: 'monto' },
    { titulo: 'ISV tasa general', tipo: 'monto' }, { titulo: 'ISV tasa especial', tipo: 'monto' }, { titulo: 'Total', tipo: 'monto' },
    { titulo: 'Efecto en el libro (+1 / −1 / 0)', tipo: 'entero', ancho: 16 }, { titulo: 'Estado', tipo: 'texto', ancho: 12 }, { titulo: 'Hallazgos (pendientes de revisión)', tipo: 'largo', ancho: 46 },
  ];
  const filas: Celda[][] = libro.filas.map(f => [
    f.fecha, f.tipoDocumentoNombre ?? 'Venta sin documento fiscal', f.tipoDocumento ?? undefined, f.numero ?? undefined, f.cai ?? undefined, f.contraparte, f.rtn ?? undefined, f.referenciaInterna ?? undefined,
    monto(f.importeExento), monto(f.importeExonerado), monto(f.importeGravadoGeneral), monto(f.importeGravadoEspecial), monto(f.isvGeneral), monto(f.isvEspecial), monto(f.total),
    f.signo, f.estado, f.hallazgos.join('; ') || undefined,
  ]);
  const notas = [
    libro.filas.length === 0 ? SIN_REGISTROS : '',
    `Ventas sin documento fiscal (no suman al libro): ${libro.totales.sinDocumento.cantidad} por L ${libro.totales.sinDocumento.total}.`,
    ...libro.devoluciones.map(d => `Devolución ${d.referenciaInterna} del ${d.fecha} por L ${d.monto}: ${d.hallazgos.length ? 'SIN nota de crédito registrada' : 'con nota de crédito'}.`),
    NOTA_TRABAJO,
  ].filter(Boolean);
  return hoja(ctx, 'Ventas', 'Libro de ventas', columnas, filas, {
    totales: { etiqueta: 'Total del libro (notas de crédito restan)', sumar: [8, 9, 10, 11, 12, 13, 14], signo: 15 },
    notas,
  });
}

export async function hojaCompras(db: Tx, ctx: Contexto): Promise<Hoja> {
  const libro = await libroCompras(db, ctx.tenantId, ctx.anio, ctx.mes);
  const columnas: Hoja['columnas'] = [
    { titulo: 'Fecha', tipo: 'fecha' }, { titulo: 'Tipo de documento', tipo: 'texto', ancho: 22 }, { titulo: 'Código tipo', tipo: 'codigo', ancho: 10 },
    { titulo: 'Número de factura del proveedor', tipo: 'codigo', ancho: 26 }, { titulo: 'CAI', tipo: 'codigo', ancho: 22 }, { titulo: 'Proveedor', tipo: 'texto', ancho: 30 },
    { titulo: 'RTN', tipo: 'codigo', ancho: 18 }, { titulo: 'Referencia interna', tipo: 'codigo', ancho: 14 },
    { titulo: 'Exento', tipo: 'monto' }, { titulo: 'Exonerado', tipo: 'monto' }, { titulo: 'Gravado tasa general', tipo: 'monto' }, { titulo: 'Gravado tasa especial', tipo: 'monto' },
    { titulo: 'ISV tasa general', tipo: 'monto' }, { titulo: 'ISV tasa especial', tipo: 'monto' }, { titulo: 'Total', tipo: 'monto' },
    { titulo: 'Efecto en el libro (+1 / −1 / 0)', tipo: 'entero', ancho: 16 }, { titulo: 'Estado', tipo: 'texto', ancho: 12 }, { titulo: 'Hallazgos (pendientes de revisión)', tipo: 'largo', ancho: 46 },
  ];
  const filas: Celda[][] = libro.filas.map(f => [
    f.fecha, f.tipoDocumentoNombre ?? 'Compra sin factura registrada', f.tipoDocumento ?? undefined, f.numero ?? undefined, f.cai ?? undefined, f.contraparte, f.rtn ?? undefined, f.referenciaInterna ?? undefined,
    monto(f.importeExento), monto(f.importeExonerado), monto(f.importeGravadoGeneral), monto(f.importeGravadoEspecial), monto(f.isvGeneral), monto(f.isvEspecial), monto(f.total),
    f.signo, f.estado, f.hallazgos.join('; ') || undefined,
  ]);
  return hoja(ctx, 'Compras', 'Libro de compras', columnas, filas, {
    totales: { etiqueta: 'Total del libro (notas de crédito restan)', sumar: [8, 9, 10, 11, 12, 13, 14], signo: 15 },
    notas: [
      libro.filas.length === 0 ? SIN_REGISTROS : '',
      `Compras sin factura registrada (no acreditan ISV hasta registrar la factura): ${libro.totales.sinDocumento.cantidad} por L ${libro.totales.sinDocumento.total}.`,
      NOTA_TRABAJO,
    ].filter(Boolean),
  });
}

// ---------- ISV ----------
export async function hojaIsv(db: Tx, ctx: Contexto): Promise<Hoja> {
  const r = await resumenIsv(db, ctx.tenantId, ctx.anio, ctx.mes);
  const base = PRIMERA_FILA_DATOS; // primera fila de la tabla de conceptos
  const debito = monto(r.debitoFiscal) ?? 0, credito = monto(r.creditoFiscal) ?? 0, sufrido = monto(r.retencionesIsvSufridas) ?? 0;
  const resultado = Math.round((debito - credito - sufrido) * 100) / 100;
  const filas: Celda[][] = [
    ['Débito fiscal (ISV de ventas)', debito, 'Suma del ISV de documentos de venta vigentes; las notas de crédito restan.'],
    ['Crédito fiscal (ISV de compras)', credito, 'Suma del ISV de facturas de compra vigentes; las notas de crédito restan.'],
    ['ISV retenido por clientes (sufrido)', sufrido, 'Retenciones sufridas vigentes; se descuentan del resultado.'],
    ['Resultado preliminar: débito − crédito − retenido', { formula: `B${base}-B${base + 1}-B${base + 2}`, resultado }, 'Positivo: saldo a pagar. Negativo: saldo a favor. Es un cálculo de trabajo, no la declaración del SAR.'],
    ['Retenciones de ISV efectuadas por enterar', monto(r.retencionesPorEnterar.isv) ?? 0, 'Retenciones efectuadas vigentes. Su entero se hace por el procedimiento del SAR.'],
    ['Retenciones de ISR efectuadas por enterar', monto(r.retencionesPorEnterar.isr) ?? 0, 'Retenciones de ISR efectuadas vigentes. Validar con el profesional responsable.'],
    ['Ventas sin documento fiscal (cantidad)', { valor: r.ventasSinDocumento.cantidad, tipo: 'entero' }, `Total L ${r.ventasSinDocumento.total}. No suman al débito fiscal.`],
    ['Compras sin factura registrada (cantidad)', { valor: r.comprasSinDocumento.cantidad, tipo: 'entero' }, `Total L ${r.comprasSinDocumento.total}. Su ISV no se acredita hasta registrar la factura.`],
  ];
  return hoja(ctx, 'ISV', 'Resumen de ISV del período', [
    { titulo: 'Concepto', tipo: 'texto', ancho: 48 }, { titulo: 'Monto (L)', tipo: 'monto' }, { titulo: 'Observación', tipo: 'largo', ancho: 80 },
  ], filas, {
    notas: [
      `Tipo de resultado calculado por el sistema: ${r.tipoResultado === 'A_PAGAR' ? 'a pagar' : r.tipoResultado === 'A_FAVOR' ? 'saldo a favor' : 'cero'}.`,
      'Las tasas aplicadas son las configuradas por la empresa con su vigencia y base legal. Si no hay tasa vigente, el ISV no se valida y el libro lo indica como hallazgo.',
      NOTA_TRABAJO,
    ],
  });
}

// ---------- Retenciones ----------
export async function hojaRetenciones(db: Tx, ctx: Contexto): Promise<Hoja> {
  const filas0 = await retencionesPeriodo(db, ctx.tenantId, ctx.anio, ctx.mes);
  const columnas: Hoja['columnas'] = [
    { titulo: 'Fecha', tipo: 'fecha' }, { titulo: 'Tipo', tipo: 'texto', ancho: 12 }, { titulo: 'Código de regla', tipo: 'codigo', ancho: 18 }, { titulo: 'Impuesto', tipo: 'texto', ancho: 10 },
    { titulo: 'Descripción de la regla', tipo: 'texto', ancho: 40 }, { titulo: 'Porcentaje', tipo: 'porcentaje', ancho: 12 }, { titulo: 'Documento', tipo: 'codigo', ancho: 22 },
    { titulo: 'Contraparte', tipo: 'texto', ancho: 30 }, { titulo: 'RTN', tipo: 'codigo', ancho: 18 }, { titulo: 'Base', tipo: 'monto' }, { titulo: 'Monto retenido', tipo: 'monto' },
    { titulo: 'Comprobante de retención', tipo: 'codigo', ancho: 26 }, { titulo: 'Estado', tipo: 'texto', ancho: 12 }, { titulo: 'Efecto (+1 vigente / 0 anulada)', tipo: 'entero', ancho: 18 },
  ];
  const filas: Celda[][] = filas0.map(r => [
    r.fecha, r.tipo === 'SUFRIDA' ? 'Sufrida' : 'Efectuada', r.regla.codigo, r.regla.impuesto, r.regla.descripcion, monto(r.porcentaje), r.documentoNumero,
    r.contraparte, r.rtn ?? undefined, monto(r.base), monto(r.monto), r.comprobanteNumero ?? undefined, r.estado, r.estado === 'VIGENTE' ? 1 : 0,
  ]);
  return hoja(ctx, 'Retenciones', 'Retenciones del período', columnas, filas, {
    totales: { etiqueta: 'Total retenido vigente', sumar: [10], signo: 13 },
    notas: [
      filas0.length === 0 ? `${SIN_REGISTROS} Si la empresa es agente de retención, registre las retenciones efectuadas y sufridas en el módulo.` : '',
      ctx.agenteRetencion === null ? 'La configuración de agente de retención no está registrada.' : '',
      NOTA_TRABAJO,
    ].filter(Boolean),
  });
}

// ---------- Documentos fiscales ----------
export async function hojaDocumentos(db: Tx, ctx: Contexto, direccion: 'EMITIDO' | 'RECIBIDO'): Promise<Hoja> {
  const filas0 = await query(db, `SELECT d.*, r.numero AS referencia_numero, v.numero_venta, o.codigo AS orden_codigo
    FROM fiscal_documentos d
    LEFT JOIN fiscal_documentos r ON r.tenant_id=d.tenant_id AND r.id=d.documento_referencia_id
    LEFT JOIN ventas v ON v.tenant_id=d.tenant_id AND v.id=d.venta_id
    LEFT JOIN ordenes_compra o ON o.tenant_id=d.tenant_id AND o.id=d.orden_compra_id
    WHERE d.tenant_id=$1 AND d.direccion=$2 AND d.fecha_emision BETWEEN $3::date AND $4::date ORDER BY d.fecha_emision, d.numero`, ctx.tenantId, direccion, ctx.desde, ctx.hasta);
  const columnas: Hoja['columnas'] = [
    { titulo: 'Fecha de emisión', tipo: 'fecha' }, { titulo: 'Código tipo', tipo: 'codigo', ancho: 10 }, { titulo: 'Tipo de documento', tipo: 'texto', ancho: 26 },
    { titulo: 'Número', tipo: 'codigo', ancho: 22 }, { titulo: 'CAI', tipo: 'codigo', ancho: 26 }, { titulo: direccion === 'EMITIDO' ? 'Cliente' : 'Proveedor', tipo: 'texto', ancho: 30 },
    { titulo: 'RTN', tipo: 'codigo', ancho: 18 }, { titulo: 'Exento', tipo: 'monto' }, { titulo: 'Exonerado', tipo: 'monto' }, { titulo: 'Gravado tasa general', tipo: 'monto' },
    { titulo: 'Gravado tasa especial', tipo: 'monto' }, { titulo: 'ISV tasa general', tipo: 'monto' }, { titulo: 'ISV tasa especial', tipo: 'monto' }, { titulo: 'Total', tipo: 'monto' },
    { titulo: 'Efecto en el libro (+1 / −1 / 0)', tipo: 'entero', ancho: 16 }, { titulo: 'Estado', tipo: 'texto', ancho: 12 }, { titulo: 'Motivo de anulación', tipo: 'largo', ancho: 30 },
    { titulo: 'Documento de referencia', tipo: 'codigo', ancho: 22 }, { titulo: 'Operación vinculada', tipo: 'texto', ancho: 20 },
  ];
  const filas: Celda[][] = filas0.map(d => {
    const anulado = d.estado === 'ANULADO';
    const efecto = anulado ? 0 : d.tipo_documento === '06' ? -1 : 1;
    const operacion = d.numero_venta ? `Venta V-${d.numero_venta}` : d.orden_codigo ? `Compra ${d.orden_codigo}` : undefined;
    return [
      dia(d.fecha_emision), d.tipo_documento, TIPOS_DOCUMENTO[d.tipo_documento] ?? 'Tipo no catalogado', d.numero, d.cai ?? undefined, d.nombre_contraparte, d.rtn_contraparte ?? undefined,
      monto(d.importe_exento), monto(d.importe_exonerado), monto(d.importe_gravado_general), monto(d.importe_gravado_especial), monto(d.isv_general), monto(d.isv_especial), monto(d.total),
      efecto, d.estado, d.motivo_anulacion ?? undefined, d.referencia_numero ?? undefined, operacion,
    ];
  });
  const etiqueta = direccion === 'EMITIDO' ? 'Documentos fiscales emitidos' : 'Documentos fiscales recibidos';
  return hoja(ctx, direccion === 'EMITIDO' ? 'Documentos emitidos' : 'Documentos recibidos', etiqueta, columnas, filas, {
    totales: { etiqueta: 'Total del libro (notas de crédito restan; anulados no suman)', sumar: [7, 8, 9, 10, 11, 12, 13], signo: 14 },
    notas: [
      filas0.length === 0 ? SIN_REGISTROS : '',
      direccion === 'EMITIDO' ? 'Los documentos emitidos se registran con su CAI; la validez de la numeración frente a la autorización se revisa en la conciliación.' : 'Los documentos recibidos deben corresponder a facturas del proveedor con su CAI y RTN.',
      NOTA_TRABAJO,
    ].filter(Boolean),
  });
}

// ---------- Conciliación y hallazgos ----------
const DESCRIPCION_HALLAZGO: Record<string, string> = {
  SIN_DOCUMENTO_FISCAL: 'Venta o compra sin documento fiscal', SIN_OPERACION: 'Documento sin venta o compra asociada', SIN_CAI: 'Sin CAI vigente que cubra el número',
  CAI_VENCIDO: 'Emitido después de la fecha límite del CAI', FUERA_DE_RANGO: 'Número fuera del rango autorizado', CAI_TIPO_DISTINTO: 'Tipo distinto al del CAI',
  CAI_PUNTO_DISTINTO: 'Establecimiento o punto distinto al del CAI', ISV_GENERAL_INCORRECTO: 'ISV general no corresponde a la tasa vigente', ISV_ESPECIAL_INCORRECTO: 'ISV especial no corresponde a la tasa vigente',
  SIN_TASA_GENERAL: 'Sin tasa general configurada', SIN_TASA_ESPECIAL: 'Sin tasa especial configurada', TOTAL_DISTINTO: 'Total distinto a la operación registrada',
  BASE_DISTINTA: 'Base distinta a la operación registrada', ISV_DISTINTO: 'ISV distinto a la operación registrada', VENTA_ANULADA_CON_DOCUMENTO_VIGENTE: 'Venta anulada con documento vigente',
  COMPRA_CANCELADA_CON_DOCUMENTO_VIGENTE: 'Compra cancelada con documento vigente', FECHA_DISTINTA_A_VENTA: 'Fecha en otro mes que la venta', RTN_DISTINTO_A_VENTA: 'RTN distinto al de la venta',
  RTN_INVALIDO: 'RTN inválido', SIN_RTN_PROVEEDOR: 'Sin RTN del proveedor', SIN_DOCUMENTO_REFERENCIA: 'Nota sin documento de referencia',
  DEVOLUCION_SIN_NOTA_CREDITO: 'Devolución sin nota de crédito', SALTO_CORRELATIVO: 'Salto en la numeración', SIN_RTN_EMPRESA: 'La empresa no tiene RTN configurado',
  SIN_TASA_GENERAL_VIGENTE: 'Sin tasa general vigente en el período', LIBRO_CAMBIO_TRAS_CIERRE: 'Los libros cambiaron después del cierre',
};
export const descripcionHallazgo = (codigo: string) => DESCRIPCION_HALLAZGO[codigo] ?? 'Hallazgo no catalogado';

/** Cifras de la conciliación de ventas y compras: se usan en la hoja y en el resumen para que coincidan. */
export async function cifrasConciliacion(db: Tx, ctx: Contexto) {
  const zona = ctx.zona;
  const fechaVenta = "((COALESCE(v.ocurrido_at, v.created_at) AT TIME ZONE 'UTC') AT TIME ZONE $2)::date";
  const [ventasCompletadas] = await query(db, `SELECT COALESCE(SUM(v.total),0) AS total FROM ventas v WHERE v.tenant_id=$1 AND v.estado='COMPLETADA' AND ${fechaVenta} BETWEEN $3::date AND $4::date`, ctx.tenantId, zona, ctx.desde, ctx.hasta);
  const [devoluciones] = await query(db, `SELECT COALESCE(SUM(d.monto),0) AS total FROM devoluciones d WHERE d.tenant_id=$1 AND ((d.created_at AT TIME ZONE 'UTC') AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date`, ctx.tenantId, zona, ctx.desde, ctx.hasta);
  const [docsEmitidos] = await query(db, `SELECT COALESCE(SUM(CASE WHEN estado='ANULADO' THEN 0 WHEN tipo_documento='06' THEN -total ELSE total END),0) AS neto FROM fiscal_documentos WHERE tenant_id=$1 AND direccion='EMITIDO' AND fecha_emision BETWEEN $2::date AND $3::date`, ctx.tenantId, ctx.desde, ctx.hasta);
  const [ordenes] = await query(db, `SELECT COALESCE(SUM(o.total),0) AS total FROM ordenes_compra o WHERE o.tenant_id=$1 AND o.estado <> 'CANCELADA' AND ((o.fecha_emision AT TIME ZONE 'UTC') AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date`, ctx.tenantId, zona, ctx.desde, ctx.hasta);
  const [docsRecibidos] = await query(db, `SELECT COALESCE(SUM(CASE WHEN estado='ANULADO' THEN 0 WHEN tipo_documento='06' THEN -total ELSE total END),0) AS neto FROM fiscal_documentos WHERE tenant_id=$1 AND direccion='RECIBIDO' AND fecha_emision BETWEEN $2::date AND $3::date`, ctx.tenantId, ctx.desde, ctx.hasta);
  const ventas = await libroVentas(db, ctx.tenantId, ctx.anio, ctx.mes);
  const compras = await libroCompras(db, ctx.tenantId, ctx.anio, ctx.mes);
  const ventasSinDoc = centavos(ventas.totales.sinDocumento.total);
  const comprasSinDoc = centavos(compras.totales.sinDocumento.total);
  const ventasNetas = centavos(ventasCompletadas.total) - centavos(devoluciones.total);
  const ventasDiferencia = (ventasNetas - centavos(docsEmitidos.neto) - ventasSinDoc) / 100;
  const comprasDiferencia = (centavos(ordenes.total) - centavos(docsRecibidos.neto) - comprasSinDoc) / 100;
  return {
    ventasCompletadas: centavos(ventasCompletadas.total) / 100,
    devoluciones: centavos(devoluciones.total) / 100,
    docsEmitidosNeto: centavos(docsEmitidos.neto) / 100,
    ventasSinDocumento: ventasSinDoc / 100,
    ventasDiferencia,
    comprasRegistradas: centavos(ordenes.total) / 100,
    docsRecibidosNeto: centavos(docsRecibidos.neto) / 100,
    comprasSinDocumento: comprasSinDoc / 100,
    comprasDiferencia,
    hallazgos: await conciliacion(db, ctx.tenantId, ctx.anio, ctx.mes),
  };
}
const centavos = (v: unknown) => aCentavos(Number(v ?? 0));

export async function hojaConciliacion(db: Tx, ctx: Contexto): Promise<Hoja> {
  const c = await cifrasConciliacion(db, ctx);
  const b = PRIMERA_FILA_DATOS; // fila de la primera partida
  // Partidas en orden fijo; las fórmulas referencian sus filas por posición.
  const fila = (i: number) => b + i;
  const diferencia = (formula: string, valor: number) => ({ formula, resultado: valor });
  const filas: Celda[][] = [
    ['Ventas completadas del período (operación)', c.ventasCompletadas, 'Ventas registradas en el período con estado completada, por el total con ISV.'],
    ['(−) Devoluciones del período', c.devoluciones, 'Montos devueltos en el período según el registro de devoluciones.'],
    ['(=) Ventas netas esperadas', diferencia(`B${fila(0)}-B${fila(1)}`, c.ventasCompletadas - c.devoluciones), 'Lo que debe quedar documentado en el período.'],
    ['Documentos emitidos vigentes, neto', c.docsEmitidosNeto, 'Facturas y notas de débito suman; las notas de crédito restan. Anulados no suman.'],
    ['Ventas sin documento fiscal', c.ventasSinDocumento, 'Ventas completadas sin factura vigente.'],
    ['Diferencia de ventas sin explicar', diferencia(`B${fila(2)}-B${fila(3)}-B${fila(4)}`, c.ventasDiferencia), 'Debe ser cero. Si no lo es, revise las devoluciones sin nota de crédito y los documentos sin venta.'],
    ['Compras registradas del período (operación)', c.comprasRegistradas, 'Órdenes de compra no canceladas del período, por el total con ISV.'],
    ['Facturas recibidas vigentes, neto', c.docsRecibidosNeto, 'Facturas recibidas suman; notas de crédito recibidas restan.'],
    ['Compras sin factura registrada', c.comprasSinDocumento, 'Compras sin factura vigente del proveedor.'],
    ['Diferencia de compras sin explicar', diferencia(`B${fila(6)}-B${fila(7)}-B${fila(8)}`, c.comprasDiferencia), 'Debe ser cero. Si no lo es, revise las facturas pendientes de registrar.'],
  ];
  const porCodigo = c.hallazgos.porCodigo;
  const etiquetasConteo = Object.entries(porCodigo).sort(([a], [b2]) => a.localeCompare(b2));
  for (const [codigo, cantidad] of etiquetasConteo) {
    filas.push([`Hallazgo: ${descripcionHallazgo(codigo)}`, { valor: cantidad, tipo: 'entero' }, `Código ${codigo}. Pendiente de revisión por el contador.`]);
  }
  if (etiquetasConteo.length === 0) filas.push(['Hallazgos de conciliación', { valor: 0, tipo: 'entero' }, 'Sin hallazgos registrados en el período.']);
  return hoja(ctx, 'Conciliación', 'Conciliación de documentos fiscales', [
    { titulo: 'Partida', tipo: 'texto', ancho: 50 }, { titulo: 'Monto (L) / cantidad', tipo: 'monto' }, { titulo: 'Criterio', tipo: 'largo', ancho: 80 },
  ], filas, {
    notas: [
      `Estado de la conciliación: ${c.hallazgos.total === 0 ? 'sin hallazgos en el período' : `${c.hallazgos.total} hallazgos pendientes de revisión`}. Las diferencias se revisan en la hoja «Hallazgos».`,
      'Información conciliada: diferencias de ventas y compras calculadas con los registros de la operación. Información pendiente: hallazgos y documentos sin respaldo.',
      NOTA_TRABAJO,
    ],
  });
}

export async function hojaHallazgos(db: Tx, ctx: Contexto): Promise<Hoja> {
  const c = await conciliacion(db, ctx.tenantId, ctx.anio, ctx.mes);
  const filas: Celda[][] = c.hallazgos.map(h => [h.libro, h.codigo, descripcionHallazgo(h.codigo), h.referencia || undefined, h.detalle ?? undefined, 'Pendiente de revisión']);
  return hoja(ctx, 'Hallazgos', 'Hallazgos e inconsistencias', [
    { titulo: 'Libro', tipo: 'texto', ancho: 14 }, { titulo: 'Código', tipo: 'codigo', ancho: 34 }, { titulo: 'Descripción', tipo: 'texto', ancho: 50 },
    { titulo: 'Referencia', tipo: 'codigo', ancho: 22 }, { titulo: 'Detalle', tipo: 'texto', ancho: 30 }, { titulo: 'Estado', tipo: 'texto', ancho: 24 },
  ], filas, {
    notas: [
      c.hallazgos.length === 0 ? 'Sin hallazgos en el período.' : `Total de hallazgos: ${c.total}.`,
      'Un hallazgo no es un error confirmado: indica un dato que requiere revisión o un documento sin respaldo.',
      NOTA_TRABAJO,
    ],
  });
}

// ---------- Catálogo, diario, balanza, cierres y ajustes ----------
export async function hojaCatalogo(db: Tx, ctx: Contexto): Promise<Hoja> {
  const cuentas = await query(db, `SELECT k.codigo, k.nombre, k.tipo, k.naturaleza, k.acepta_movimientos, k.activa, p.codigo AS padre_codigo
    FROM contable_cuentas k LEFT JOIN contable_cuentas p ON p.tenant_id=k.tenant_id AND p.id=k.padre_id WHERE k.tenant_id=$1 ORDER BY k.codigo`, ctx.tenantId);
  const filas: Celda[][] = cuentas.map(k => [
    k.codigo, k.nombre, k.tipo, k.naturaleza, k.padre_codigo ?? undefined, k.acepta_movimientos ? 'Sí' : 'No', k.activa ? 'Sí' : 'No', String(k.codigo).split('.').length,
  ]);
  return hoja(ctx, 'Catálogo de cuentas', 'Catálogo de cuentas', [
    { titulo: 'Código', tipo: 'codigo', ancho: 16 }, { titulo: 'Nombre', tipo: 'texto', ancho: 40 }, { titulo: 'Tipo', tipo: 'texto', ancho: 14 },
    { titulo: 'Naturaleza', tipo: 'texto', ancho: 12 }, { titulo: 'Cuenta padre', tipo: 'codigo', ancho: 16 }, { titulo: 'Admite movimientos', tipo: 'texto', ancho: 18 },
    { titulo: 'Activa', tipo: 'texto', ancho: 10 }, { titulo: 'Nivel', tipo: 'entero', ancho: 8 },
  ], filas, { notas: [cuentas.length === 0 ? 'No hay cuentas registradas en el catálogo. El catálogo lo define la empresa; el sistema no lo precarga.' : '', NOTA_TRABAJO].filter(Boolean) });
}

export async function hojaDiario(db: Tx, ctx: Contexto): Promise<Hoja> {
  const lineas = await query(db, `SELECT a.numero, a.fecha, a.concepto, a.origen, a.estado, k.codigo, k.nombre, l.debe, l.haber, l.descripcion
    FROM contable_asientos a JOIN contable_asiento_lineas l ON l.tenant_id=a.tenant_id AND l.asiento_id=a.id
    JOIN contable_cuentas k ON k.tenant_id=l.tenant_id AND k.id=l.cuenta_id
    WHERE a.tenant_id=$1 AND a.fecha BETWEEN $2::date AND $3::date ORDER BY a.fecha, a.numero, l.debe DESC, k.codigo`, ctx.tenantId, ctx.desde, ctx.hasta);
  const filas: Celda[][] = lineas.map(l => [
    l.numero, dia(l.fecha), l.concepto, l.origen === 'REVERSION' ? 'Reversión' : 'Manual', l.estado === 'REVERTIDO' ? 'Revertido' : 'Contabilizado',
    l.codigo, l.nombre, monto(l.debe) ?? 0, monto(l.haber) ?? 0, l.descripcion ?? undefined,
  ]);
  const totalFila = PRIMERA_FILA_DATOS + lineas.length;
  const debe = lineas.reduce((s, l) => s + Number(l.debe), 0), haber = lineas.reduce((s, l) => s + Number(l.haber), 0);
  return hoja(ctx, 'Libro diario', 'Libro diario', [
    { titulo: 'N.º asiento', tipo: 'entero', ancho: 12 }, { titulo: 'Fecha', tipo: 'fecha' }, { titulo: 'Concepto', tipo: 'texto', ancho: 44 }, { titulo: 'Origen', tipo: 'texto', ancho: 12 },
    { titulo: 'Estado', tipo: 'texto', ancho: 14 }, { titulo: 'Código de cuenta', tipo: 'codigo', ancho: 16 }, { titulo: 'Cuenta', tipo: 'texto', ancho: 34 },
    { titulo: 'Debe (L)', tipo: 'monto' }, { titulo: 'Haber (L)', tipo: 'monto' }, { titulo: 'Descripción de la línea', tipo: 'texto', ancho: 30 }, { titulo: 'Cuadre', tipo: 'texto', ancho: 12 },
  ], filas.map(f => [...f, undefined]), {
    totales: {
      etiqueta: 'Totales del período', sumar: [7, 8],
      extra: { 10: { formula: `IF(ROUND(H${totalFila}-I${totalFila},2)=0,"Cuadra","No cuadra")`, resultado: Math.round((debe - haber) * 100) === 0 ? 'Cuadra' : 'No cuadra' } },
    },
    notas: [
      lineas.length === 0 ? 'No hay asientos contabilizados en el período. Los asientos se registran manualmente en Partida doble.' : '',
      'Los asientos revertidos se conservan: la reversión aparece como asiento propio con origen «Reversión».',
      NOTA_TRABAJO,
    ].filter(Boolean),
  });
}

export async function hojaBalanza(db: Tx, ctx: Contexto): Promise<Hoja> {
  const b = await balanza(db, ctx.tenantId, ctx.anio, ctx.mes);
  const fin = PRIMERA_FILA_DATOS + b.cuentas.length;
  const filas: Celda[][] = b.cuentas.map(k => [k.codigo, k.nombre, k.tipo, k.naturaleza, k.debePeriodo, k.haberPeriodo, k.saldo]);
  return hoja(ctx, 'Balanza de comprobación', 'Balanza de comprobación', [
    { titulo: 'Código', tipo: 'codigo', ancho: 16 }, { titulo: 'Cuenta', tipo: 'texto', ancho: 40 }, { titulo: 'Tipo', tipo: 'texto', ancho: 14 },
    { titulo: 'Naturaleza', tipo: 'texto', ancho: 12 }, { titulo: 'Debe del período (L)', tipo: 'monto' }, { titulo: 'Haber del período (L)', tipo: 'monto' },
    { titulo: 'Saldo acumulado (L)', tipo: 'monto' }, { titulo: 'Cuadre', tipo: 'texto', ancho: 12 },
  ], filas.map(f => [...f, undefined]), {
    totales: {
      etiqueta: 'Totales del período', sumar: [4, 5],
      extra: { 7: { formula: `IF(ROUND(E${fin}-F${fin},2)=0,"Cuadra","No cuadra")`, resultado: b.totales.cuadra ? 'Cuadra' : 'No cuadra' } },
    },
    notas: [
      b.cuentas.length === 0 ? 'No hay cuentas en el catálogo. La balanza se genera cuando existan asientos.' : '',
      'El saldo acumulado se calcula con la naturaleza de cada cuenta (deudora: debe − haber; acreedora: haber − debe).',
      NOTA_TRABAJO,
    ].filter(Boolean),
  });
}

export async function hojaPeriodos(db: Tx, ctx: Contexto): Promise<Hoja> {
  const filas0 = await query(db, `SELECT p.*, u.nombre AS cerrado_nombre FROM fiscal_periodos p LEFT JOIN usuarios u ON u.tenant_id=p.tenant_id AND u.id=p.cerrado_por WHERE p.tenant_id=$1 AND p.anio=$2 ORDER BY p.mes`, ctx.tenantId, ctx.anio);
  const filas: Celda[][] = Array.from({ length: 12 }, (_, i) => {
    const f = filas0.find(p => p.mes === i + 1);
    const resumen = f?.resumen as { documentos?: number } | null | undefined;
    return [
      `${ctx.anio}-${String(i + 1).padStart(2, '0')}`,
      f?.estado === 'CERRADO' ? 'Cerrado' : 'Abierto (sin cierre registrado)',
      f?.cerrado_nombre ?? undefined,
      f?.cerrado_at ? new Date(f.cerrado_at).toISOString().replace('T', ' ').slice(0, 19) : undefined,
      f?.huella ?? undefined,
      resumen?.documentos ?? undefined,
    ];
  });
  return hoja(ctx, 'Períodos y cierres', `Períodos y cierres ${ctx.anio}`, [
    { titulo: 'Período', tipo: 'codigo', ancho: 12 }, { titulo: 'Estado', tipo: 'texto', ancho: 30 }, { titulo: 'Cerrado por', tipo: 'texto', ancho: 26 },
    { titulo: 'Fecha y hora de cierre (UTC)', tipo: 'texto', ancho: 24 }, { titulo: 'Huella SHA-256 de los libros', tipo: 'codigo', ancho: 68 }, { titulo: 'Documentos al cierre', tipo: 'entero', ancho: 18 },
  ], filas, {
    notas: [
      'La huella cambia si cambia cualquier importe, estado, documento u operación incluidos en el cierre: permite detectar modificaciones posteriores.',
      NOTA_TRABAJO,
    ],
  });
}

export async function hojaAjustes(db: Tx, ctx: Contexto): Promise<Hoja> {
  const filas0 = await query(db, `SELECT a.*, u.nombre AS usuario_nombre FROM fiscal_ajustes a JOIN usuarios u ON u.tenant_id=a.tenant_id AND u.id=a.usuario_id
    WHERE a.tenant_id=$1 AND a.anio=$2 AND a.mes=$3 ORDER BY a.created_at`, ctx.tenantId, ctx.anio, ctx.mes);
  const filas: Celda[][] = filas0.map(a => {
    const cuando = fechaHoraZona(new Date(a.created_at), ctx.zona);
    return [
      cuando.fecha, cuando.hora, a.entidad, a.entidad_id, a.accion, a.motivo, a.usuario_nombre,
      a.anterior === null ? undefined : JSON.stringify(a.anterior), a.nuevo === null ? undefined : JSON.stringify(a.nuevo),
    ];
  });
  return hoja(ctx, 'Ajustes', 'Ajustes contables y trazabilidad', [
    { titulo: 'Fecha', tipo: 'fecha' }, { titulo: 'Hora', tipo: 'texto', ancho: 10 }, { titulo: 'Registro', tipo: 'texto', ancho: 14 },
    { titulo: 'Identificador del registro', tipo: 'codigo', ancho: 38 }, { titulo: 'Acción', tipo: 'texto', ancho: 18 }, { titulo: 'Motivo', tipo: 'largo', ancho: 44 },
    { titulo: 'Usuario responsable', tipo: 'texto', ancho: 24 }, { titulo: 'Valor anterior', tipo: 'largo', ancho: 50 }, { titulo: 'Valor nuevo', tipo: 'largo', ancho: 50 },
  ], filas, {
    notas: [
      filas0.length === 0 ? SIN_REGISTROS : '',
      'La bitácora es de solo inserción: los ajustes no se editan ni se borran. Las horas están en la zona horaria de la empresa.',
      NOTA_TRABAJO,
    ].filter(Boolean),
  });
}

// ---------- Resumen general del libro mensual ----------
export async function hojaResumen(db: Tx, ctx: Contexto): Promise<Hoja> {
  const isv = await resumenIsv(db, ctx.tenantId, ctx.anio, ctx.mes);
  const c = await cifrasConciliacion(db, ctx);
  const [tasa] = await query(db, `SELECT porcentaje FROM fiscal_tasas WHERE tenant_id=$1 AND impuesto='ISV' AND categoria='GENERAL' AND vigente_desde <= $3::date AND (vigente_hasta IS NULL OR vigente_hasta >= $2::date) LIMIT 1`, ctx.tenantId, ctx.desde, ctx.hasta);
  const [reglas] = await query(db, 'SELECT count(*)::int AS n FROM fiscal_reglas_retencion WHERE tenant_id=$1', ctx.tenantId);
  const [emitidos] = await query(db, "SELECT count(*)::int AS n FROM fiscal_documentos WHERE tenant_id=$1 AND direccion='EMITIDO' AND estado='VIGENTE' AND fecha_emision BETWEEN $2::date AND $3::date", ctx.tenantId, ctx.desde, ctx.hasta);
  const [recibidos] = await query(db, "SELECT count(*)::int AS n FROM fiscal_documentos WHERE tenant_id=$1 AND direccion='RECIBIDO' AND estado='VIGENTE' AND fecha_emision BETWEEN $2::date AND $3::date", ctx.tenantId, ctx.desde, ctx.hasta);
  const debito = monto(isv.debitoFiscal) ?? 0, credito = monto(isv.creditoFiscal) ?? 0, sufrido = monto(isv.retencionesIsvSufridas) ?? 0;
  const filas: Celda[][] = [
    ['Documentos fiscales emitidos vigentes', { valor: emitidos.n, tipo: 'entero' }, 'Cantidad de documentos emitidos vigentes del período.'],
    ['Documentos fiscales recibidos vigentes', { valor: recibidos.n, tipo: 'entero' }, 'Cantidad de documentos recibidos vigentes del período.'],
    ['Débito fiscal (ISV de ventas)', debito, 'Según documentos emitidos vigentes.'],
    ['Crédito fiscal (ISV de compras)', credito, 'Según facturas recibidas vigentes.'],
    ['ISV retenido por clientes', sufrido, 'Retenciones sufridas vigentes.'],
    ['Resultado preliminar de ISV', { formula: `B${PRIMERA_FILA_DATOS + 2}-B${PRIMERA_FILA_DATOS + 3}-B${PRIMERA_FILA_DATOS + 4}`, resultado: Math.round((debito - credito - sufrido) * 100) / 100 }, 'Cálculo de trabajo. No es la declaración del SAR.'],
    ['Ventas sin documento fiscal', { valor: isv.ventasSinDocumento.cantidad, tipo: 'entero' }, `Total L ${isv.ventasSinDocumento.total}. No suman al débito fiscal.`],
    ['Compras sin factura registrada', { valor: isv.comprasSinDocumento.cantidad, tipo: 'entero' }, `Total L ${isv.comprasSinDocumento.total}.`],
    ['Diferencia de ventas sin explicar', c.ventasDiferencia, 'Debe ser cero (ver hoja Conciliación).'],
    ['Diferencia de compras sin explicar', c.comprasDiferencia, 'Debe ser cero (ver hoja Conciliación).'],
    ['Hallazgos pendientes de revisión', { valor: c.hallazgos.total, tipo: 'entero' }, 'Ver hoja Hallazgos.'],
    ['— Información no registrada en el sistema —', undefined, 'Lo siguiente falta; no se ha supuesto ningún valor.'],
    ['RTN de la empresa', ctx.rtn ?? 'NO REGISTRADO', ctx.rtn ? 'Registrado.' : 'Complete el RTN en Configuración fiscal.'],
    ['Tasa general de ISV vigente en el período', tasa ? `${Number(tasa.porcentaje).toFixed(2)}%` : 'NO CONFIGURADA', tasa ? 'Configurada con vigencia y base legal.' : 'Sin tasa vigente, el ISV de los documentos no se valida.'],
    ['Agente de retención', ctx.agenteRetencion === null ? 'NO CONFIGURADO' : ctx.agenteRetencion ? 'Sí' : 'No', 'Define si pueden registrarse retenciones efectuadas.'],
    ['Reglas de retención registradas', reglas.n > 0 ? `${reglas.n} regla(s)` : 'NO REGISTRADAS', 'Las retenciones se calculan solo con reglas registradas por la empresa.'],
    ['Estado del período', ctx.estadoPeriodo === 'CERRADO' ? 'CERRADO' : 'ABIERTO', ctx.estadoPeriodo === 'CERRADO' ? 'Los registros del período están congelados.' : 'El período puede seguir revisándose.'],
  ];
  return hoja(ctx, 'Resumen general', 'Resumen general del libro contable', [
    { titulo: 'Concepto', tipo: 'texto', ancho: 46 }, { titulo: 'Valor', tipo: 'monto', ancho: 22 }, { titulo: 'Observación', tipo: 'largo', ancho: 70 },
  ], filas, {
    notas: [
      'Este archivo es un libro de trabajo para el contador. Los importes son numéricos para permitir cálculos y tablas dinámicas.',
      'Clasificación de la información: (1) operativa registrada: ventas, compras, documentos y asientos tal como se registraron; (2) cálculos contables preliminares: ISV de trabajo, resultado y balanza; (3) información conciliada: solo las partidas sin diferencia en la hoja Conciliación; (4) pendiente de revisión: hallazgos y diferencias; (5) declaraciones oficiales: no incluidas; deben presentarse en los sistemas del SAR.',
      'No se declara certificación del SAR ni del sistema.',
      NOTA_TRABAJO,
    ],
  });
}

// ---------- Ensamblado por reporte ----------
export interface OpcionesReporte { direccion?: string }

/** Hojas de un informe. Para CSV y PDF se usa la primera; el libro mensual solo se entrega en Excel. */
export async function hojasDeReporte(db: Tx, ctx: Contexto, reporte: Reporte, opciones: OpcionesReporte = {}): Promise<Hoja[]> {
  switch (reporte as string) {
    case 'ventas': return [await hojaVentas(db, ctx)];
    case 'compras': return [await hojaCompras(db, ctx)];
    case 'isv': return [await hojaIsv(db, ctx)];
    case 'retenciones': return [await hojaRetenciones(db, ctx)];
    case 'documentos': {
      const d = opciones.direccion;
      if (d === 'EMITIDO') return [await hojaDocumentos(db, ctx, 'EMITIDO')];
      if (d === 'RECIBIDO') return [await hojaDocumentos(db, ctx, 'RECIBIDO')];
      return [await hojaDocumentos(db, ctx, 'EMITIDO'), await hojaDocumentos(db, ctx, 'RECIBIDO')];
    }
    case 'conciliacion': return [await hojaConciliacion(db, ctx), await hojaHallazgos(db, ctx)];
    case 'hallazgos': return [await hojaHallazgos(db, ctx)];
    case 'catalogo': return [await hojaCatalogo(db, ctx)];
    case 'diario': return [await hojaDiario(db, ctx)];
    case 'balanza': return [await hojaBalanza(db, ctx)];
    case 'periodos': return [await hojaPeriodos(db, ctx)];
    case 'ajustes': return [await hojaAjustes(db, ctx)];
    case 'mensual': return hojasLibroMensual(db, ctx);
    default: throw new BadRequestException('Reporte no admitido');
  }
}

/** Libro contable del mes: un único archivo con una hoja por bloque, en el orden del contador. */
export async function hojasLibroMensual(db: Tx, ctx: Contexto): Promise<Hoja[]> {
  return [
    await hojaResumen(db, ctx),
    await hojaVentas(db, ctx),
    await hojaCompras(db, ctx),
    await hojaIsv(db, ctx),
    await hojaRetenciones(db, ctx),
    await hojaDocumentos(db, ctx, 'EMITIDO'),
    await hojaDocumentos(db, ctx, 'RECIBIDO'),
    await hojaConciliacion(db, ctx),
    await hojaHallazgos(db, ctx),
    await hojaDiario(db, ctx),
    await hojaBalanza(db, ctx),
  ];
}

/** Nombre del archivo: reporte, período y extensión. El mismo criterio se usa en la pantalla. */
export function nombreArchivo(reporte: string, anio: number, mes: number, formato: string): string {
  const periodo = `${anio}-${String(mes).padStart(2, '0')}`;
  const base = reporte === 'mensual' ? 'libro-contable' : reporte;
  return reporte === 'catalogo' || reporte === 'periodos' ? `${base}-${anio}.${formato}` : `${base}-${periodo}.${formato}`;
}

export function libroExcel(ctx: Contexto, hojas: Hoja[], titulo: string): Libro {
  return { titulo, autor: 'Jowa System', creado: ctx.generadoAt, hojas };
}

