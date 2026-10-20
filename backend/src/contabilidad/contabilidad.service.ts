import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { audit, authorizedActor, id, lockTenant, query, Tx } from '../operaciones/ledger';
import { aCentavos } from '../common/redondeo-monetario';
import { diaCalendario } from '../common/zona-horaria';
import {
  CAMPOS_IMPORTE, ImportesDocumento, TIPOS_CON_REFERENCIA, analizarNumero, calcularRetencion, centavosAImporte, fechaValida,
  limitesPeriodo, normalizarCai, normalizarRtn, periodoDeFecha, periodoValido, seSolapan, tasaVigente, tipoDocumentoValido,
  totalDocumentoCentavos, validarContraCai, verificarIsv,
} from './fiscal-hn';
import { balanza as balanzaLibro, conciliacion, huellaLibros, libroCompras, libroVentas, resumenIsv, retencionesPeriodo, zonaDeEmpresa } from './libros';
import { aCsv, aExcel, aPdf, FORMATOS_ADMITIDOS, TIPO_MIME } from './exportacion';
import { libroExcel, contexto, hojasDeReporte, nombreArchivo, REPORTES, Reporte } from './reportes';
import { PERMISOS_CONTABILIDAD as P, ROLES_CONTABILIDAD, ROLES_REAPERTURA } from './permisos';
import type {
  AsientoDto, CaiDto, CerrarVigenciaDto, ConfiguracionFiscalDto, CorreccionDocumentoDto, CuentaDto, DocumentoFiscalDto,
  ReglaRetencionDto, RetencionDto, ReversionDto, TasaDto,
} from './contabilidad.dto';

const dia = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === 'string' ? v.slice(0, 10) : null);
const c = (v: unknown) => aCentavos(Number(v ?? 0));
const texto = (v: unknown, etiqueta: string, min = 1, max = 500) => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (s.length < min || s.length > max) throw new BadRequestException(`${etiqueta}: entre ${min} y ${max} caracteres`);
  return s;
};

/** Errores de restricciones de PostgreSQL (disparadores, CHECK, únicos) como respuestas 4xx, nunca 500. */
function traducir(error: any): never {
  // Prisma informa los errores de SQL crudo como P2010 con el código de PostgreSQL en meta.code.
  const codigo = String(error?.meta?.code ?? error?.code ?? '');
  if (codigo === '23505') throw new ConflictException('Ya existe un registro con esos datos');
  if (codigo === '23P01') throw new ConflictException('La vigencia se solapa con otra ya registrada');
  if (codigo === '23514') throw new BadRequestException('Los datos no cumplen las reglas contables o fiscales');
  if (codigo === '23503') throw new BadRequestException('Referencia inexistente en esta empresa');
  throw error;
}

function mapaDocumento(d: any) {
  return {
    id: d.id, direccion: d.direccion, tipoDocumento: d.tipo_documento, numero: d.numero, cai: d.cai, caiId: d.cai_id, fechaEmision: dia(d.fecha_emision),
    rtnContraparte: d.rtn_contraparte, nombreContraparte: d.nombre_contraparte, ventaId: d.venta_id, ordenCompraId: d.orden_compra_id,
    documentoReferenciaId: d.documento_referencia_id, estado: d.estado, motivoAnulacion: d.motivo_anulacion,
    ...Object.fromEntries(CAMPOS_IMPORTE.map(k => [k, centavosAImporte(c(d[k.replace(/[A-Z]/g, l => `_${l.toLowerCase()}`)]))])),
    total: centavosAImporte(c(d.total)),
  };
}

@Injectable()
export class ContabilidadService {
  constructor(private readonly prisma: PrismaService) {}

  /** Escritura: bloqueo por empresa, reautorización del actor dentro de la transacción y errores de BD traducidos. */
  private escribir<T>(tenantId: string, usuarioId: string, permiso: string, fn: (tx: Tx) => Promise<T>, roles: readonly string[] = ROLES_CONTABILIDAD) {
    return this.prisma.$transaction(async tx => {
      await lockTenant(tx, tenantId);
      await authorizedActor(tx, tenantId, usuarioId, roles, permiso);
      return fn(tx);
    }, { timeout: 60000 }).catch(traducir);
  }

  private async ajuste(tx: Tx, tenantId: string, usuarioId: string, fecha: string, entidad: string, entidadId: string, accion: string, motivo: string, anterior: unknown, nuevo: unknown) {
    const { anio, mes } = periodoDeFecha(fecha);
    await query(tx, 'INSERT INTO fiscal_ajustes (id,tenant_id,anio,mes,entidad,entidad_id,accion,motivo,anterior,nuevo,usuario_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11) RETURNING id',
      id(), tenantId, anio, mes, entidad, entidadId, accion, texto(motivo, 'Motivo', 3), anterior === undefined ? null : JSON.stringify(anterior), nuevo === undefined ? null : JSON.stringify(nuevo), usuarioId);
    await audit(tx, tenantId, usuarioId, `CONTABILIDAD_${entidad}_${accion}`, entidadId, { motivo, anterior, nuevo });
  }

  private async exigirPeriodoAbierto(tx: Tx, tenantId: string, fecha: string) {
    const { anio, mes } = periodoDeFecha(fecha);
    const [p] = await query(tx, 'SELECT estado FROM fiscal_periodos WHERE tenant_id=$1 AND anio=$2 AND mes=$3', tenantId, anio, mes);
    if (p?.estado === 'CERRADO') throw new ConflictException(`El período ${anio}-${String(mes).padStart(2, '0')} está cerrado`);
  }

  private async hoy(db: Tx | PrismaService, tenantId: string) {
    return diaCalendario(new Date(), await zonaDeEmpresa(db as Tx, tenantId));
  }

  // ---------- Configuración fiscal ----------
  async configuracion(tenantId: string) {
    const [cfg] = await query(this.prisma, 'SELECT * FROM fiscal_configuraciones WHERE tenant_id=$1', tenantId);
    const [tasas, reglas, cai] = await Promise.all([this.tasas(tenantId), this.reglas(tenantId), this.listarCai(tenantId)]);
    return {
      configuracion: cfg ? { rtn: cfg.rtn, razonSocial: cfg.razon_social, nombreComercial: cfg.nombre_comercial, agenteRetencion: cfg.agente_retencion, moneda: cfg.moneda, zonaHoraria: cfg.zona_horaria, notas: cfg.notas, actualizadoAt: cfg.updated_at } : null,
      tasas, reglas, cai,
    };
  }

  guardarConfiguracion(tenantId: string, usuarioId: string, dto: ConfiguracionFiscalDto) {
    return this.escribir(tenantId, usuarioId, P.configurar, async tx => {
      const rtn = dto.rtn ? normalizarRtn(dto.rtn, 'RTN de la empresa') : null;
      const nuevo = { rtn, razonSocial: texto(dto.razonSocial, 'Razón social', 1, 200), nombreComercial: (dto.nombreComercial ?? '').trim(), agenteRetencion: dto.agenteRetencion === true, notas: dto.notas?.trim() || null };
      const [anterior] = await query(tx, 'SELECT rtn, razon_social, nombre_comercial, agente_retencion, notas FROM fiscal_configuraciones WHERE tenant_id=$1', tenantId);
      await query(tx, `INSERT INTO fiscal_configuraciones (tenant_id,rtn,razon_social,nombre_comercial,agente_retencion,notas,actualizado_por) VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (tenant_id) DO UPDATE SET rtn=EXCLUDED.rtn, razon_social=EXCLUDED.razon_social, nombre_comercial=EXCLUDED.nombre_comercial, agente_retencion=EXCLUDED.agente_retencion,
        notas=EXCLUDED.notas, actualizado_por=EXCLUDED.actualizado_por, updated_at=CURRENT_TIMESTAMP RETURNING tenant_id`, tenantId, nuevo.rtn, nuevo.razonSocial, nuevo.nombreComercial, nuevo.agenteRetencion, nuevo.notas, usuarioId);
      await this.ajuste(tx, tenantId, usuarioId, await this.hoy(tx, tenantId), 'CONFIGURACION', tenantId, anterior ? 'ACTUALIZAR' : 'CREAR', dto.motivo, anterior ?? null, nuevo);
      return nuevo;
    });
  }

  // ---------- Tasas y reglas con vigencia ----------
  async tasas(tenantId: string) {
    const filas = await query(this.prisma, 'SELECT * FROM fiscal_tasas WHERE tenant_id=$1 ORDER BY categoria, vigente_desde', tenantId);
    return filas.map(t => ({ id: t.id, impuesto: t.impuesto, categoria: t.categoria, porcentaje: Number(t.porcentaje).toFixed(2), vigenteDesde: dia(t.vigente_desde), vigenteHasta: dia(t.vigente_hasta), baseLegal: t.base_legal }));
  }

  crearTasa(tenantId: string, usuarioId: string, dto: TasaDto) {
    return this.escribir(tenantId, usuarioId, P.configurar, async tx => {
      const vigencia = { vigenteDesde: fechaValida(dto.vigenteDesde, 'Vigente desde'), vigenteHasta: dto.vigenteHasta ? fechaValida(dto.vigenteHasta, 'Vigente hasta') : null };
      if (vigencia.vigenteHasta && vigencia.vigenteHasta < vigencia.vigenteDesde) throw new BadRequestException('La vigencia termina antes de empezar');
      if (!['GENERAL', 'ESPECIAL'].includes(dto.categoria)) throw new BadRequestException('Categoría inválida');
      aCentavos(dto.porcentaje, 'Porcentaje');
      const existentes = await query(tx, "SELECT vigente_desde, vigente_hasta FROM fiscal_tasas WHERE tenant_id=$1 AND impuesto='ISV' AND categoria=$2", tenantId, dto.categoria);
      if (existentes.some(e => seSolapan({ vigenteDesde: dia(e.vigente_desde)!, vigenteHasta: dia(e.vigente_hasta) }, vigencia))) throw new ConflictException('La vigencia se solapa con otra tasa de la misma categoría');
      const tasaId = id();
      await query(tx, "INSERT INTO fiscal_tasas (id,tenant_id,impuesto,categoria,porcentaje,vigente_desde,vigente_hasta,base_legal,creado_por) VALUES ($1,$2,'ISV',$3,$4,$5::date,$6::date,$7,$8) RETURNING id",
        tasaId, tenantId, dto.categoria, dto.porcentaje, vigencia.vigenteDesde, vigencia.vigenteHasta, texto(dto.baseLegal, 'Base legal', 3), usuarioId);
      const nuevo = { categoria: dto.categoria, porcentaje: dto.porcentaje, ...vigencia, baseLegal: dto.baseLegal.trim() };
      await this.ajuste(tx, tenantId, usuarioId, vigencia.vigenteDesde, 'TASA', tasaId, 'CREAR', `Alta de tasa: ${nuevo.baseLegal}`, null, nuevo);
      return { id: tasaId, ...nuevo };
    });
  }

  cerrarVigenciaTasa(tenantId: string, usuarioId: string, tasaId: string, dto: CerrarVigenciaDto) {
    return this.cerrarVigencia(tenantId, usuarioId, 'fiscal_tasas', 'TASA', tasaId, dto);
  }

  async reglas(tenantId: string) {
    const filas = await query(this.prisma, 'SELECT * FROM fiscal_reglas_retencion WHERE tenant_id=$1 ORDER BY codigo, vigente_desde', tenantId);
    return filas.map(r => ({ id: r.id, codigo: r.codigo, impuesto: r.impuesto, descripcion: r.descripcion, porcentaje: Number(r.porcentaje).toFixed(2), baseCalculo: r.base_calculo, vigenteDesde: dia(r.vigente_desde), vigenteHasta: dia(r.vigente_hasta), baseLegal: r.base_legal }));
  }

  crearRegla(tenantId: string, usuarioId: string, dto: ReglaRetencionDto) {
    return this.escribir(tenantId, usuarioId, P.configurar, async tx => {
      const vigencia = { vigenteDesde: fechaValida(dto.vigenteDesde, 'Vigente desde'), vigenteHasta: dto.vigenteHasta ? fechaValida(dto.vigenteHasta, 'Vigente hasta') : null };
      if (vigencia.vigenteHasta && vigencia.vigenteHasta < vigencia.vigenteDesde) throw new BadRequestException('La vigencia termina antes de empezar');
      aCentavos(dto.porcentaje, 'Porcentaje');
      const existentes = await query(tx, 'SELECT vigente_desde, vigente_hasta FROM fiscal_reglas_retencion WHERE tenant_id=$1 AND codigo=$2', tenantId, dto.codigo);
      if (existentes.some(e => seSolapan({ vigenteDesde: dia(e.vigente_desde)!, vigenteHasta: dia(e.vigente_hasta) }, vigencia))) throw new ConflictException('La vigencia se solapa con otra regla del mismo código');
      const reglaId = id();
      await query(tx, 'INSERT INTO fiscal_reglas_retencion (id,tenant_id,codigo,impuesto,descripcion,porcentaje,base_calculo,vigente_desde,vigente_hasta,base_legal,creado_por) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::date,$9::date,$10,$11) RETURNING id',
        reglaId, tenantId, dto.codigo, dto.impuesto, texto(dto.descripcion, 'Descripción', 3, 300), dto.porcentaje, dto.baseCalculo, vigencia.vigenteDesde, vigencia.vigenteHasta, texto(dto.baseLegal, 'Base legal', 3), usuarioId);
      const nuevo = { codigo: dto.codigo, impuesto: dto.impuesto, porcentaje: dto.porcentaje, baseCalculo: dto.baseCalculo, ...vigencia, baseLegal: dto.baseLegal.trim() };
      await this.ajuste(tx, tenantId, usuarioId, vigencia.vigenteDesde, 'REGLA_RETENCION', reglaId, 'CREAR', `Alta de regla: ${nuevo.baseLegal}`, null, nuevo);
      return { id: reglaId, ...nuevo };
    });
  }

  cerrarVigenciaRegla(tenantId: string, usuarioId: string, reglaId: string, dto: CerrarVigenciaDto) {
    return this.cerrarVigencia(tenantId, usuarioId, 'fiscal_reglas_retencion', 'REGLA_RETENCION', reglaId, dto);
  }

  private cerrarVigencia(tenantId: string, usuarioId: string, tabla: 'fiscal_tasas' | 'fiscal_reglas_retencion', entidad: string, registroId: string, dto: CerrarVigenciaDto) {
    return this.escribir(tenantId, usuarioId, P.configurar, async tx => {
      const [r] = await query(tx, `SELECT id, vigente_desde, vigente_hasta FROM ${tabla} WHERE tenant_id=$1 AND id=$2`, tenantId, registroId);
      if (!r) throw new NotFoundException('Registro no encontrado');
      const hasta = fechaValida(dto.vigenteHasta, 'Vigente hasta');
      if (hasta < dia(r.vigente_desde)!) throw new BadRequestException('La vigencia termina antes de empezar');
      if (r.vigente_hasta && hasta > dia(r.vigente_hasta)!) throw new BadRequestException('Solo se puede acortar una vigencia ya cerrada');
      // Una vigencia no se acorta dentro de un período cerrado: cambiaría documentos ya declarados.
      await this.exigirPeriodoAbierto(tx, tenantId, hasta);
      await query(tx, `UPDATE ${tabla} SET vigente_hasta=$3::date WHERE tenant_id=$1 AND id=$2 RETURNING id`, tenantId, registroId, hasta);
      await this.ajuste(tx, tenantId, usuarioId, hasta, entidad, registroId, 'CERRAR_VIGENCIA', dto.motivo, { vigenteHasta: dia(r.vigente_hasta) }, { vigenteHasta: hasta });
      return { id: registroId, vigenteHasta: hasta };
    });
  }

  // ---------- CAI ----------
  async listarCai(tenantId: string) {
    const filas = await query(this.prisma, `SELECT a.*, (SELECT max(substr(d.numero, 12)::int) FROM fiscal_documentos d WHERE d.tenant_id=a.tenant_id AND d.cai_id=a.id) AS ultimo_usado
      FROM fiscal_cai a WHERE a.tenant_id=$1 ORDER BY a.fecha_limite_emision DESC`, tenantId);
    return filas.map(a => ({ id: a.id, cai: a.cai, tipoDocumento: a.tipo_documento, establecimiento: a.establecimiento, puntoEmision: a.punto_emision, rangoInicial: a.rango_inicial, rangoFinal: a.rango_final, fechaLimiteEmision: dia(a.fecha_limite_emision), activo: a.activo, ultimoUsado: a.ultimo_usado ?? null, disponibles: a.rango_final - (a.ultimo_usado ?? a.rango_inicial - 1) }));
  }

  crearCai(tenantId: string, usuarioId: string, dto: CaiDto) {
    return this.escribir(tenantId, usuarioId, P.configurar, async tx => {
      const cai = normalizarCai(dto.cai), tipo = tipoDocumentoValido(dto.tipoDocumento), limite = fechaValida(dto.fechaLimiteEmision, 'Fecha límite de emisión');
      if (dto.rangoInicial > dto.rangoFinal) throw new BadRequestException('El rango inicial es mayor que el final');
      // Un mismo correlativo no puede quedar autorizado por dos CAI del mismo punto y tipo.
      const [solape] = await query(tx, 'SELECT cai FROM fiscal_cai WHERE tenant_id=$1 AND tipo_documento=$2 AND establecimiento=$3 AND punto_emision=$4 AND rango_inicial <= $6 AND rango_final >= $5', tenantId, tipo, dto.establecimiento, dto.puntoEmision, dto.rangoInicial, dto.rangoFinal);
      if (solape) throw new ConflictException(`El rango se solapa con el CAI ${solape.cai}`);
      const caiId = id();
      await query(tx, 'INSERT INTO fiscal_cai (id,tenant_id,cai,tipo_documento,establecimiento,punto_emision,rango_inicial,rango_final,fecha_limite_emision,creado_por) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::date,$10) RETURNING id',
        caiId, tenantId, cai, tipo, dto.establecimiento, dto.puntoEmision, dto.rangoInicial, dto.rangoFinal, limite, usuarioId);
      const nuevo = { cai, tipoDocumento: tipo, establecimiento: dto.establecimiento, puntoEmision: dto.puntoEmision, rangoInicial: dto.rangoInicial, rangoFinal: dto.rangoFinal, fechaLimiteEmision: limite };
      await this.ajuste(tx, tenantId, usuarioId, await this.hoy(tx, tenantId), 'CAI', caiId, 'CREAR', 'Registro de autorización de emisión', null, nuevo);
      return { id: caiId, ...nuevo, activo: true };
    });
  }

  desactivarCai(tenantId: string, usuarioId: string, caiId: string, motivo: string) {
    return this.escribir(tenantId, usuarioId, P.configurar, async tx => {
      const [a] = await query(tx, 'SELECT id, activo FROM fiscal_cai WHERE tenant_id=$1 AND id=$2', tenantId, caiId);
      if (!a) throw new NotFoundException('CAI no encontrado');
      if (!a.activo) return { id: caiId, activo: false };
      await query(tx, 'UPDATE fiscal_cai SET activo=false WHERE tenant_id=$1 AND id=$2 RETURNING id', tenantId, caiId);
      await this.ajuste(tx, tenantId, usuarioId, await this.hoy(tx, tenantId), 'CAI', caiId, 'DESACTIVAR', motivo, { activo: true }, { activo: false });
      return { id: caiId, activo: false };
    });
  }

  // ---------- Documentos fiscales ----------
  async documentos(tenantId: string, anio: number, mes: number, direccion?: string) {
    const { desde, hasta } = limitesPeriodo(anio, mes);
    if (direccion && !['EMITIDO', 'RECIBIDO'].includes(direccion)) throw new BadRequestException('Dirección inválida');
    const filas = await query(this.prisma, `SELECT * FROM fiscal_documentos WHERE tenant_id=$1 AND fecha_emision BETWEEN $2::date AND $3::date AND ($4::text IS NULL OR direccion=$4) ORDER BY fecha_emision, numero`, tenantId, desde, hasta, direccion ?? null);
    return filas.map(mapaDocumento);
  }

  private async tasasEn(tx: Tx, tenantId: string, fecha: string) {
    const filas = await query(tx, "SELECT categoria, porcentaje, vigente_desde, vigente_hasta FROM fiscal_tasas WHERE tenant_id=$1 AND impuesto='ISV'", tenantId);
    const tasas = filas.map(t => ({ categoria: t.categoria, porcentaje: Number(t.porcentaje), vigenteDesde: dia(t.vigente_desde)!, vigenteHasta: dia(t.vigente_hasta) }));
    return { general: tasaVigente(tasas, 'GENERAL', fecha)?.porcentaje ?? null, especial: tasaVigente(tasas, 'ESPECIAL', fecha)?.porcentaje ?? null };
  }

  private importes(dto: Partial<ImportesDocumento>): ImportesDocumento {
    return Object.fromEntries(CAMPOS_IMPORTE.map(k => {
      const v = dto[k] ?? 0;
      if (typeof v !== 'number' || v < 0) throw new BadRequestException(`${k}: importe no negativo requerido`);
      aCentavos(v, k);
      return [k, v];
    })) as unknown as ImportesDocumento;
  }

  /** Reglas del documento propio: CAI vigente que cubre el correlativo e ISV con la tasa configurada. */
  private async validarEmitido(tx: Tx, tenantId: string, numero: string, fecha: string, importes: ImportesDocumento) {
    const n = analizarNumero(numero);
    const [cai] = await query(tx, 'SELECT * FROM fiscal_cai WHERE tenant_id=$1 AND tipo_documento=$2 AND establecimiento=$3 AND punto_emision=$4 AND rango_inicial <= $5 AND rango_final >= $5 AND activo=true', tenantId, n.tipoDocumento, n.establecimiento, n.puntoEmision, n.correlativo);
    const hallazgos = validarContraCai(numero, fecha, cai ? { cai: cai.cai, tipoDocumento: cai.tipo_documento, establecimiento: cai.establecimiento, puntoEmision: cai.punto_emision, rangoInicial: cai.rango_inicial, rangoFinal: cai.rango_final, fechaLimiteEmision: dia(cai.fecha_limite_emision)! } : null);
    const tasas = await this.tasasEn(tx, tenantId, fecha);
    hallazgos.push(...verificarIsv(importes, tasas.general, tasas.especial));
    if (hallazgos.length) throw new BadRequestException({ message: 'El documento emitido no cumple las reglas fiscales configuradas', hallazgos });
    return cai;
  }

  crearDocumento(tenantId: string, usuarioId: string, dto: DocumentoFiscalDto) {
    return this.escribir(tenantId, usuarioId, P.registrar, async tx => {
      const direccion = dto.direccion;
      if (!['EMITIDO', 'RECIBIDO'].includes(direccion)) throw new BadRequestException('Dirección inválida');
      const tipo = tipoDocumentoValido(dto.tipoDocumento);
      const numero = dto.numero.trim();
      if (analizarNumero(numero).tipoDocumento !== tipo) throw new BadRequestException('El número no corresponde al tipo de documento');
      const fecha = fechaValida(dto.fechaEmision, 'Fecha de emisión');
      await this.exigirPeriodoAbierto(tx, tenantId, fecha);
      if (direccion === 'EMITIDO' && dto.ordenCompraId) throw new BadRequestException('Un documento emitido no se asocia a una compra');
      if (direccion === 'RECIBIDO' && dto.ventaId) throw new BadRequestException('Un documento recibido no se asocia a una venta');
      let rtn = dto.rtnContraparte?.trim() ? normalizarRtn(dto.rtnContraparte, 'RTN de la contraparte') : null;
      let nombre = dto.nombreContraparte?.trim() || '';
      let importes: ImportesDocumento;
      const sinImportes = CAMPOS_IMPORTE.every(k => dto[k] === undefined);
      // Venta o compra: debe existir en esta empresa. Los importes pueden tomarse de ella (no se escriben de nuevo a mano).
      if (dto.ventaId) {
        const [v] = await query(tx, "SELECT v.id, v.subtotal, v.descuento, v.isv, v.total, v.estado, v.cliente_rtn, COALESCE(NULLIF(v.cliente_nombre,''), c.nombre) AS cliente FROM ventas v LEFT JOIN clientes c ON c.id=v.cliente_id AND c.tenant_id=v.tenant_id WHERE v.tenant_id=$1 AND v.id=$2", tenantId, dto.ventaId);
        if (!v) throw new NotFoundException('Venta no encontrada');
        if (v.estado === 'ANULADA' && tipo === '01') throw new ConflictException('La venta está anulada');
        if (!nombre) nombre = v.cliente || 'CONSUMIDOR FINAL';
        if (!rtn && v.cliente_rtn) { try { rtn = normalizarRtn(v.cliente_rtn); } catch { rtn = null; } }
        importes = sinImportes && dto.importesDeOperacion !== false
          ? { importeExento: 0, importeExonerado: 0, importeGravadoGeneral: (c(v.subtotal) - c(v.descuento)) / 100, importeGravadoEspecial: 0, isvGeneral: c(v.isv) / 100, isvEspecial: 0 }
          : this.importes(dto);
      } else if (dto.ordenCompraId) {
        const [o] = await query(tx, 'SELECT o.id, o.subtotal, o.isv, o.estado, p.nombre, p.rtn FROM ordenes_compra o JOIN proveedores p ON p.id=o.proveedor_id AND p.tenant_id=o.tenant_id WHERE o.tenant_id=$1 AND o.id=$2', tenantId, dto.ordenCompraId);
        if (!o) throw new NotFoundException('Compra no encontrada');
        if (o.estado === 'CANCELADA' && tipo === '01') throw new ConflictException('La compra está cancelada');
        if (!nombre) nombre = o.nombre;
        if (!rtn && o.rtn) { try { rtn = normalizarRtn(o.rtn); } catch { rtn = null; } }
        importes = sinImportes && dto.importesDeOperacion !== false
          ? { importeExento: 0, importeExonerado: 0, importeGravadoGeneral: c(o.subtotal) / 100, importeGravadoEspecial: 0, isvGeneral: c(o.isv) / 100, isvEspecial: 0 }
          : this.importes(dto);
      } else importes = this.importes(dto);
      nombre = texto(nombre || 'CONSUMIDOR FINAL', 'Nombre de la contraparte', 1, 200);
      const total = totalDocumentoCentavos(importes);
      if (total <= 0) throw new BadRequestException('El documento no tiene importes');
      let referencia: any = null;
      if (TIPOS_CON_REFERENCIA.has(tipo)) {
        if (!dto.documentoReferenciaId) throw new BadRequestException('Las notas de crédito y débito deben referenciar el documento que modifican');
        [referencia] = await query(tx, 'SELECT id, direccion, estado, total FROM fiscal_documentos WHERE tenant_id=$1 AND id=$2', tenantId, dto.documentoReferenciaId);
        if (!referencia) throw new NotFoundException('Documento de referencia no encontrado');
        if (referencia.direccion !== direccion || referencia.estado !== 'VIGENTE') throw new BadRequestException('El documento de referencia debe estar vigente y ser de la misma dirección');
        if (tipo === '06') {
          const [{ acreditado }] = await query(tx, "SELECT COALESCE(sum(total),0) AS acreditado FROM fiscal_documentos WHERE tenant_id=$1 AND documento_referencia_id=$2 AND tipo_documento='06' AND estado='VIGENTE'", tenantId, referencia.id);
          if (c(acreditado) + total > c(referencia.total)) throw new BadRequestException('Las notas de crédito superan el total del documento original');
        }
      } else if (dto.documentoReferenciaId) throw new BadRequestException('Solo las notas de crédito o débito llevan documento de referencia');
      let caiId: string | null = null, caiTexto: string | null = null;
      if (direccion === 'EMITIDO') {
        const cai = await this.validarEmitido(tx, tenantId, numero, fecha, importes);
        caiId = cai.id; caiTexto = cai.cai;
      } else {
        caiTexto = dto.cai ? normalizarCai(dto.cai) : null;
        if (tipo === '01' && !rtn) throw new BadRequestException('La factura recibida requiere el RTN del proveedor');
      }
      const documentoId = id();
      await query(tx, `INSERT INTO fiscal_documentos (id,tenant_id,direccion,tipo_documento,numero,cai,cai_id,fecha_emision,rtn_contraparte,nombre_contraparte,venta_id,orden_compra_id,documento_referencia_id,
          importe_exento,importe_exonerado,importe_gravado_general,importe_gravado_especial,isv_general,isv_especial,total,creado_por)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8::date,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING id`,
        documentoId, tenantId, direccion, tipo, numero, caiTexto, caiId, fecha, rtn, nombre, dto.ventaId ?? null, dto.ordenCompraId ?? null, referencia?.id ?? null,
        importes.importeExento, importes.importeExonerado, importes.importeGravadoGeneral, importes.importeGravadoEspecial, importes.isvGeneral, importes.isvEspecial, total / 100, usuarioId);
      await audit(tx, tenantId, usuarioId, 'CONTABILIDAD_DOCUMENTO_CREAR', documentoId, { direccion, tipo, numero, fecha, total: centavosAImporte(total), ventaId: dto.ventaId ?? null, ordenCompraId: dto.ordenCompraId ?? null });
      const [d] = await query(tx, 'SELECT * FROM fiscal_documentos WHERE tenant_id=$1 AND id=$2', tenantId, documentoId);
      return mapaDocumento(d);
    });
  }

  corregirDocumento(tenantId: string, usuarioId: string, documentoId: string, dto: CorreccionDocumentoDto) {
    return this.escribir(tenantId, usuarioId, P.registrar, async tx => {
      const [d] = await query(tx, 'SELECT * FROM fiscal_documentos WHERE tenant_id=$1 AND id=$2 FOR UPDATE', tenantId, documentoId);
      if (!d) throw new NotFoundException('Documento no encontrado');
      if (d.estado !== 'VIGENTE') throw new ConflictException('Un documento anulado no se corrige');
      const fechaAnterior = dia(d.fecha_emision)!;
      const fecha = dto.fechaEmision ? fechaValida(dto.fechaEmision, 'Fecha de emisión') : fechaAnterior;
      await this.exigirPeriodoAbierto(tx, tenantId, fechaAnterior);
      await this.exigirPeriodoAbierto(tx, tenantId, fecha);
      const [{ n }] = await query(tx, "SELECT count(*)::int AS n FROM fiscal_retenciones WHERE tenant_id=$1 AND documento_id=$2 AND estado='VIGENTE'", tenantId, documentoId);
      if (n > 0) throw new ConflictException('Anule primero las retenciones vigentes del documento');
      const actual = mapaDocumento(d) as any;
      const tocaImportes = CAMPOS_IMPORTE.some(k => dto[k] !== undefined);
      const importes = this.importes(Object.fromEntries(CAMPOS_IMPORTE.map(k => [k, dto[k] ?? Number(actual[k])])) as any);
      const total = totalDocumentoCentavos(importes);
      if (total <= 0) throw new BadRequestException('El documento no tiene importes');
      const rtn = dto.rtnContraparte !== undefined ? (dto.rtnContraparte.trim() ? normalizarRtn(dto.rtnContraparte, 'RTN de la contraparte') : null) : d.rtn_contraparte;
      const nombre = dto.nombreContraparte !== undefined ? texto(dto.nombreContraparte, 'Nombre de la contraparte', 1, 200) : d.nombre_contraparte;
      if (d.direccion === 'EMITIDO') {
        if (dto.cai !== undefined) throw new BadRequestException('El CAI de un documento emitido proviene de su autorización registrada');
        if (tocaImportes || fecha !== fechaAnterior) await this.validarEmitido(tx, tenantId, d.numero, fecha, importes);
      }
      if (d.direccion === 'RECIBIDO' && d.tipo_documento === '01' && !rtn) throw new BadRequestException('La factura recibida requiere el RTN del proveedor');
      const cai = d.direccion === 'RECIBIDO' && dto.cai !== undefined ? normalizarCai(dto.cai) : d.cai;
      await query(tx, `UPDATE fiscal_documentos SET fecha_emision=$3::date, rtn_contraparte=$4, nombre_contraparte=$5, cai=$6, importe_exento=$7, importe_exonerado=$8, importe_gravado_general=$9,
          importe_gravado_especial=$10, isv_general=$11, isv_especial=$12, total=$13, updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$1 AND id=$2 RETURNING id`,
        tenantId, documentoId, fecha, rtn, nombre, cai, importes.importeExento, importes.importeExonerado, importes.importeGravadoGeneral, importes.importeGravadoEspecial, importes.isvGeneral, importes.isvEspecial, total / 100);
      const [nuevo] = await query(tx, 'SELECT * FROM fiscal_documentos WHERE tenant_id=$1 AND id=$2', tenantId, documentoId);
      await this.ajuste(tx, tenantId, usuarioId, fecha, 'DOCUMENTO', documentoId, 'CORREGIR', dto.motivo, actual, mapaDocumento(nuevo));
      return mapaDocumento(nuevo);
    });
  }

  anularDocumento(tenantId: string, usuarioId: string, documentoId: string, motivo: string) {
    return this.escribir(tenantId, usuarioId, P.registrar, async tx => {
      const [d] = await query(tx, 'SELECT * FROM fiscal_documentos WHERE tenant_id=$1 AND id=$2 FOR UPDATE', tenantId, documentoId);
      if (!d) throw new NotFoundException('Documento no encontrado');
      if (d.estado === 'ANULADO') return mapaDocumento(d);
      await this.exigirPeriodoAbierto(tx, tenantId, dia(d.fecha_emision)!);
      const [{ n }] = await query(tx, "SELECT (SELECT count(*) FROM fiscal_retenciones WHERE tenant_id=$1 AND documento_id=$2 AND estado='VIGENTE') + (SELECT count(*) FROM fiscal_documentos WHERE tenant_id=$1 AND documento_referencia_id=$2 AND estado='VIGENTE') AS n", tenantId, documentoId);
      if (Number(n) > 0) throw new ConflictException('Anule primero las retenciones y notas vigentes que dependen del documento');
      const m = texto(motivo, 'Motivo', 3);
      await query(tx, "UPDATE fiscal_documentos SET estado='ANULADO', motivo_anulacion=$3, updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$1 AND id=$2 RETURNING id", tenantId, documentoId, m);
      await this.ajuste(tx, tenantId, usuarioId, dia(d.fecha_emision)!, 'DOCUMENTO', documentoId, 'ANULAR', m, { estado: 'VIGENTE' }, { estado: 'ANULADO' });
      const [nuevo] = await query(tx, 'SELECT * FROM fiscal_documentos WHERE tenant_id=$1 AND id=$2', tenantId, documentoId);
      return mapaDocumento(nuevo);
    });
  }

  // ---------- Retenciones ----------
  retenciones(tenantId: string, anio: number, mes: number) { return retencionesPeriodo(this.prisma, tenantId, anio, mes); }

  crearRetencion(tenantId: string, usuarioId: string, documentoId: string, dto: RetencionDto) {
    return this.escribir(tenantId, usuarioId, P.registrar, async tx => {
      const fecha = fechaValida(dto.fecha, 'Fecha');
      await this.exigirPeriodoAbierto(tx, tenantId, fecha);
      const [d] = await query(tx, 'SELECT * FROM fiscal_documentos WHERE tenant_id=$1 AND id=$2', tenantId, documentoId);
      if (!d) throw new NotFoundException('Documento no encontrado');
      if (d.estado !== 'VIGENTE') throw new ConflictException('El documento está anulado');
      // Efectuada: la empresa retiene a su proveedor (documento recibido). Sufrida: un cliente retiene a la empresa.
      if (dto.tipo === 'EFECTUADA' && d.direccion !== 'RECIBIDO') throw new BadRequestException('Una retención efectuada se aplica a un documento recibido');
      if (dto.tipo === 'SUFRIDA' && d.direccion !== 'EMITIDO') throw new BadRequestException('Una retención sufrida se aplica a un documento emitido');
      if (dto.tipo === 'EFECTUADA') {
        const [cfg] = await query(tx, 'SELECT agente_retencion FROM fiscal_configuraciones WHERE tenant_id=$1', tenantId);
        if (!cfg?.agente_retencion) throw new ForbiddenException('La empresa no está configurada como agente de retención');
      }
      const [regla] = await query(tx, 'SELECT * FROM fiscal_reglas_retencion WHERE tenant_id=$1 AND id=$2', tenantId, dto.reglaId);
      if (!regla) throw new NotFoundException('Regla de retención no encontrada');
      if (dia(regla.vigente_desde)! > fecha || (regla.vigente_hasta && dia(regla.vigente_hasta)! < fecha)) throw new BadRequestException('La regla no está vigente en la fecha de la retención');
      const [{ duplicada }] = await query(tx, "SELECT count(*)::int AS duplicada FROM fiscal_retenciones WHERE tenant_id=$1 AND documento_id=$2 AND regla_id=$3 AND estado='VIGENTE'", tenantId, documentoId, regla.id);
      if (duplicada) throw new ConflictException('El documento ya tiene una retención vigente con esta regla');
      const { baseCentavos, montoCentavos } = calcularRetencion({ ...mapaDocumento(d) as any, total: Number(d.total) }, regla.base_calculo, Number(regla.porcentaje));
      const retencionId = id();
      await query(tx, 'INSERT INTO fiscal_retenciones (id,tenant_id,documento_id,regla_id,tipo,fecha,base,porcentaje,monto,comprobante_numero,creado_por) VALUES ($1,$2,$3,$4,$5,$6::date,$7,$8,$9,$10,$11) RETURNING id',
        retencionId, tenantId, documentoId, regla.id, dto.tipo, fecha, baseCentavos / 100, Number(regla.porcentaje), montoCentavos / 100, dto.comprobanteNumero ?? null, usuarioId);
      const resultado = { id: retencionId, documentoId, reglaId: regla.id, tipo: dto.tipo, fecha, base: centavosAImporte(baseCentavos), porcentaje: Number(regla.porcentaje).toFixed(2), monto: centavosAImporte(montoCentavos), comprobanteNumero: dto.comprobanteNumero ?? null };
      await audit(tx, tenantId, usuarioId, 'CONTABILIDAD_RETENCION_CREAR', retencionId, resultado);
      return resultado;
    });
  }

  anularRetencion(tenantId: string, usuarioId: string, retencionId: string, motivo: string) {
    return this.escribir(tenantId, usuarioId, P.registrar, async tx => {
      const [r] = await query(tx, 'SELECT * FROM fiscal_retenciones WHERE tenant_id=$1 AND id=$2', tenantId, retencionId);
      if (!r) throw new NotFoundException('Retención no encontrada');
      if (r.estado === 'ANULADA') return { id: retencionId, estado: 'ANULADA' };
      await this.exigirPeriodoAbierto(tx, tenantId, dia(r.fecha)!);
      await query(tx, "UPDATE fiscal_retenciones SET estado='ANULADA' WHERE tenant_id=$1 AND id=$2 RETURNING id", tenantId, retencionId);
      await this.ajuste(tx, tenantId, usuarioId, dia(r.fecha)!, 'RETENCION', retencionId, 'ANULAR', motivo, { estado: 'VIGENTE', monto: centavosAImporte(c(r.monto)) }, { estado: 'ANULADA' });
      return { id: retencionId, estado: 'ANULADA' };
    });
  }

  // ---------- Libros, resumen y conciliación (solo lectura) ----------
  libroVentas(tenantId: string, anio: number, mes: number) { const p = periodoValido(anio, mes); return libroVentas(this.prisma, tenantId, p.anio, p.mes); }
  libroCompras(tenantId: string, anio: number, mes: number) { const p = periodoValido(anio, mes); return libroCompras(this.prisma, tenantId, p.anio, p.mes); }
  resumenIsv(tenantId: string, anio: number, mes: number) { const p = periodoValido(anio, mes); return resumenIsv(this.prisma, tenantId, p.anio, p.mes); }
  conciliacion(tenantId: string, anio: number, mes: number) { const p = periodoValido(anio, mes); return conciliacion(this.prisma, tenantId, p.anio, p.mes); }

  async ajustes(tenantId: string, anio: number, mes: number) {
    const p = periodoValido(anio, mes);
    const filas = await query(this.prisma, 'SELECT a.*, u.nombre AS usuario_nombre FROM fiscal_ajustes a JOIN usuarios u ON u.id=a.usuario_id AND u.tenant_id=a.tenant_id WHERE a.tenant_id=$1 AND a.anio=$2 AND a.mes=$3 ORDER BY a.created_at DESC', tenantId, p.anio, p.mes);
    return filas.map(a => ({ id: a.id, entidad: a.entidad, entidadId: a.entidad_id, accion: a.accion, motivo: a.motivo, anterior: a.anterior, nuevo: a.nuevo, usuario: a.usuario_nombre, fecha: a.created_at }));
  }

  // ---------- Períodos ----------
  async periodos(tenantId: string, anio: number) {
    const filas = await query(this.prisma, 'SELECT p.*, u.nombre AS cerrado_por_nombre FROM fiscal_periodos p LEFT JOIN usuarios u ON u.id=p.cerrado_por AND u.tenant_id=p.tenant_id WHERE p.tenant_id=$1 AND p.anio=$2 ORDER BY p.mes', tenantId, anio);
    return Array.from({ length: 12 }, (_, i) => {
      const f = filas.find(p => p.mes === i + 1);
      return { anio, mes: i + 1, estado: f?.estado ?? 'ABIERTO', cerradoPor: f?.cerrado_por_nombre ?? null, cerradoAt: f?.cerrado_at ?? null, resumen: f?.resumen ?? null, huella: f?.huella ?? null };
    });
  }

  cerrarPeriodo(tenantId: string, usuarioId: string, anio: number, mes: number, motivo: string) {
    const p = periodoValido(anio, mes);
    return this.escribir(tenantId, usuarioId, P.cerrarPeriodo, async tx => {
      const [actual] = await query(tx, 'SELECT estado FROM fiscal_periodos WHERE tenant_id=$1 AND anio=$2 AND mes=$3', tenantId, p.anio, p.mes);
      if (actual?.estado === 'CERRADO') throw new ConflictException('El período ya está cerrado');
      const hoy = await this.hoy(tx, tenantId);
      if (limitesPeriodo(p.anio, p.mes).hasta >= hoy) throw new ConflictException('Solo se cierra un período que ya terminó');
      const [ventas, compras, retenciones, resumen] = await Promise.all([libroVentas(tx, tenantId, p.anio, p.mes), libroCompras(tx, tenantId, p.anio, p.mes), retencionesPeriodo(tx, tenantId, p.anio, p.mes), resumenIsv(tx, tenantId, p.anio, p.mes)]);
      const huella = huellaLibros(ventas, compras, retenciones);
      const datos = { ventas: ventas.totales, compras: compras.totales, isv: resumen, documentos: ventas.filas.length + compras.filas.length };
      await query(tx, `INSERT INTO fiscal_periodos (tenant_id,anio,mes,estado,resumen,huella,cerrado_por,cerrado_at) VALUES ($1,$2,$3,'CERRADO',$4::jsonb,$5,$6,CURRENT_TIMESTAMP)
        ON CONFLICT (tenant_id,anio,mes) DO UPDATE SET estado='CERRADO', resumen=EXCLUDED.resumen, huella=EXCLUDED.huella, cerrado_por=EXCLUDED.cerrado_por, cerrado_at=EXCLUDED.cerrado_at, updated_at=CURRENT_TIMESTAMP RETURNING tenant_id`,
        tenantId, p.anio, p.mes, JSON.stringify(datos), huella, usuarioId);
      await this.ajuste(tx, tenantId, usuarioId, limitesPeriodo(p.anio, p.mes).desde, 'PERIODO', `${p.anio}-${String(p.mes).padStart(2, '0')}`, 'CERRAR', motivo, { estado: actual?.estado ?? 'ABIERTO' }, { estado: 'CERRADO', huella });
      return { anio: p.anio, mes: p.mes, estado: 'CERRADO', huella, resumen: datos };
    });
  }

  reabrirPeriodo(tenantId: string, usuarioId: string, anio: number, mes: number, motivo: string) {
    const p = periodoValido(anio, mes);
    return this.escribir(tenantId, usuarioId, P.cerrarPeriodo, async tx => {
      const [actual] = await query(tx, 'SELECT estado, huella FROM fiscal_periodos WHERE tenant_id=$1 AND anio=$2 AND mes=$3', tenantId, p.anio, p.mes);
      if (actual?.estado !== 'CERRADO') throw new ConflictException('El período no está cerrado');
      await query(tx, "UPDATE fiscal_periodos SET estado='ABIERTO', updated_at=CURRENT_TIMESTAMP WHERE tenant_id=$1 AND anio=$2 AND mes=$3 RETURNING tenant_id", tenantId, p.anio, p.mes);
      await this.ajuste(tx, tenantId, usuarioId, limitesPeriodo(p.anio, p.mes).desde, 'PERIODO', `${p.anio}-${String(p.mes).padStart(2, '0')}`, 'REABRIR', motivo, { estado: 'CERRADO', huella: actual.huella }, { estado: 'ABIERTO' });
      return { anio: p.anio, mes: p.mes, estado: 'ABIERTO' };
    }, ROLES_REAPERTURA);
  }

  // ---------- Partida doble ----------
  async cuentas(tenantId: string) {
    const filas = await query(this.prisma, 'SELECT * FROM contable_cuentas WHERE tenant_id=$1 ORDER BY codigo', tenantId);
    return filas.map(a => ({ id: a.id, codigo: a.codigo, nombre: a.nombre, tipo: a.tipo, naturaleza: a.naturaleza, padreId: a.padre_id, aceptaMovimientos: a.acepta_movimientos, activa: a.activa }));
  }

  crearCuenta(tenantId: string, usuarioId: string, dto: CuentaDto) {
    return this.escribir(tenantId, usuarioId, P.registrar, async tx => {
      if (dto.padreId) {
        const [padre] = await query(tx, 'SELECT id, codigo, tipo, acepta_movimientos FROM contable_cuentas WHERE tenant_id=$1 AND id=$2', tenantId, dto.padreId);
        if (!padre) throw new NotFoundException('Cuenta padre no encontrada');
        if (!dto.codigo.startsWith(`${padre.codigo}.`)) throw new BadRequestException('El código debe extender el de la cuenta padre');
        if (padre.tipo !== dto.tipo) throw new BadRequestException('La subcuenta debe ser del mismo tipo que su cuenta padre');
        const [{ n }] = await query(tx, 'SELECT count(*)::int AS n FROM contable_asiento_lineas WHERE tenant_id=$1 AND cuenta_id=$2', tenantId, padre.id);
        if (n > 0) throw new ConflictException('La cuenta padre ya tiene movimientos; no admite subcuentas');
        await query(tx, 'UPDATE contable_cuentas SET acepta_movimientos=false WHERE tenant_id=$1 AND id=$2 RETURNING id', tenantId, padre.id);
      }
      const cuentaId = id();
      await query(tx, 'INSERT INTO contable_cuentas (id,tenant_id,codigo,nombre,tipo,naturaleza,padre_id,acepta_movimientos,creado_por) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
        cuentaId, tenantId, dto.codigo, texto(dto.nombre, 'Nombre', 2, 150), dto.tipo, dto.naturaleza, dto.padreId ?? null, dto.aceptaMovimientos ?? true, usuarioId);
      const cuenta = { codigo: dto.codigo, nombre: dto.nombre.trim(), tipo: dto.tipo, naturaleza: dto.naturaleza, padreId: dto.padreId ?? null, aceptaMovimientos: dto.aceptaMovimientos ?? true };
      await audit(tx, tenantId, usuarioId, 'CONTABILIDAD_CUENTA_CREAR', cuentaId, cuenta);
      return { id: cuentaId, ...cuenta, activa: true };
    });
  }

  async asientos(tenantId: string, anio: number, mes: number) {
    const p = periodoValido(anio, mes);
    const { desde, hasta } = limitesPeriodo(p.anio, p.mes);
    const filas = await query(this.prisma, `SELECT a.*, COALESCE(json_agg(json_build_object('cuentaId', l.cuenta_id, 'codigo', k.codigo, 'nombre', k.nombre, 'debe', l.debe, 'haber', l.haber, 'descripcion', l.descripcion) ORDER BY l.debe DESC, k.codigo) FILTER (WHERE l.id IS NOT NULL), '[]') AS lineas
      FROM contable_asientos a LEFT JOIN contable_asiento_lineas l ON l.tenant_id=a.tenant_id AND l.asiento_id=a.id LEFT JOIN contable_cuentas k ON k.tenant_id=l.tenant_id AND k.id=l.cuenta_id
      WHERE a.tenant_id=$1 AND a.fecha BETWEEN $2::date AND $3::date GROUP BY a.id ORDER BY a.fecha, a.numero`, tenantId, desde, hasta);
    return filas.map(a => ({ id: a.id, numero: a.numero, fecha: dia(a.fecha), concepto: a.concepto, origen: a.origen, revierteId: a.revierte_id, estado: a.estado, lineas: a.lineas.map((l: any) => ({ ...l, debe: centavosAImporte(c(l.debe)), haber: centavosAImporte(c(l.haber)) })) }));
  }

  private async insertarAsiento(tx: Tx, tenantId: string, usuarioId: string, fecha: string, concepto: string, lineas: { cuentaId: string; debe: number; haber: number; descripcion?: string | null }[], revierteId: string | null) {
    const [{ siguiente }] = await query(tx, 'SELECT COALESCE(max(numero),0)+1 AS siguiente FROM contable_asientos WHERE tenant_id=$1', tenantId);
    const asientoId = id();
    await query(tx, 'INSERT INTO contable_asientos (id,tenant_id,numero,fecha,concepto,origen,revierte_id,creado_por) VALUES ($1,$2,$3,$4::date,$5,$6,$7,$8) RETURNING id',
      asientoId, tenantId, Number(siguiente), fecha, concepto, revierteId ? 'REVERSION' : 'MANUAL', revierteId, usuarioId);
    for (const l of lineas) {
      await query(tx, 'INSERT INTO contable_asiento_lineas (id,tenant_id,asiento_id,cuenta_id,debe,haber,descripcion) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id', id(), tenantId, asientoId, l.cuentaId, l.debe, l.haber, l.descripcion ?? null);
    }
    return { id: asientoId, numero: Number(siguiente) };
  }

  crearAsiento(tenantId: string, usuarioId: string, dto: AsientoDto) {
    return this.escribir(tenantId, usuarioId, P.registrar, async tx => {
      const fecha = fechaValida(dto.fecha, 'Fecha');
      await this.exigirPeriodoAbierto(tx, tenantId, fecha);
      if (!Array.isArray(dto.lineas) || dto.lineas.length < 2) throw new BadRequestException('Un asiento requiere al menos dos líneas');
      let debe = 0, haber = 0;
      const lineas = dto.lineas.map(l => {
        const d = c(l.debe ?? 0), h = c(l.haber ?? 0);
        if (d < 0 || h < 0 || (d > 0) === (h > 0)) throw new BadRequestException('Cada línea lleva un importe en el debe o en el haber, no en ambos');
        debe += d; haber += h;
        return { cuentaId: l.cuentaId, debe: d / 100, haber: h / 100, descripcion: l.descripcion?.trim() || null };
      });
      if (debe !== haber) throw new BadRequestException(`El asiento no cuadra: debe L ${centavosAImporte(debe)} / haber L ${centavosAImporte(haber)}`);
      const cuentas = await query(tx, 'SELECT id, acepta_movimientos, activa FROM contable_cuentas WHERE tenant_id=$1 AND id = ANY($2::text[])', tenantId, [...new Set(lineas.map(l => l.cuentaId))]);
      for (const l of lineas) {
        const k = cuentas.find(x => x.id === l.cuentaId);
        if (!k) throw new NotFoundException('Cuenta no encontrada en esta empresa');
        if (!k.activa || !k.acepta_movimientos) throw new BadRequestException('La cuenta no admite movimientos');
      }
      const asiento = await this.insertarAsiento(tx, tenantId, usuarioId, fecha, texto(dto.concepto, 'Concepto', 3, 300), lineas, null);
      await audit(tx, tenantId, usuarioId, 'CONTABILIDAD_ASIENTO_CREAR', asiento.id, { fecha, numero: asiento.numero, total: centavosAImporte(debe) });
      return { ...asiento, fecha, total: centavosAImporte(debe) };
    });
  }

  revertirAsiento(tenantId: string, usuarioId: string, asientoId: string, dto: ReversionDto) {
    return this.escribir(tenantId, usuarioId, P.registrar, async tx => {
      const [a] = await query(tx, 'SELECT * FROM contable_asientos WHERE tenant_id=$1 AND id=$2 FOR UPDATE', tenantId, asientoId);
      if (!a) throw new NotFoundException('Asiento no encontrado');
      if (a.estado !== 'CONTABILIZADO' || a.origen === 'REVERSION') throw new ConflictException('El asiento ya fue revertido o es una reversión');
      const fecha = fechaValida(dto.fecha, 'Fecha');
      if (fecha < dia(a.fecha)!) throw new BadRequestException('La reversión no puede ser anterior al asiento');
      await this.exigirPeriodoAbierto(tx, tenantId, fecha);
      const lineas = await query(tx, 'SELECT cuenta_id, debe, haber, descripcion FROM contable_asiento_lineas WHERE tenant_id=$1 AND asiento_id=$2', tenantId, asientoId);
      const reversion = await this.insertarAsiento(tx, tenantId, usuarioId, fecha, texto(`Reversión del asiento ${a.numero}: ${dto.motivo}`.slice(0, 300), 'Concepto', 3, 300),
        lineas.map(l => ({ cuentaId: l.cuenta_id, debe: Number(l.haber), haber: Number(l.debe), descripcion: l.descripcion })), asientoId);
      await query(tx, "UPDATE contable_asientos SET estado='REVERTIDO' WHERE tenant_id=$1 AND id=$2 RETURNING id", tenantId, asientoId);
      await this.ajuste(tx, tenantId, usuarioId, fecha, 'ASIENTO', asientoId, 'REVERTIR', dto.motivo, { numero: a.numero, estado: 'CONTABILIZADO' }, { estado: 'REVERTIDO', reversionId: reversion.id, reversionNumero: reversion.numero });
      return { id: asientoId, estado: 'REVERTIDO', reversion };
    });
  }

  balanza(tenantId: string, anio: number, mes: number) { const p = periodoValido(anio, mes); return balanzaLibro(this.prisma as unknown as Tx, tenantId, p.anio, p.mes); }

  // ---------- Exportación (Excel principal; CSV y PDF secundarios). No modifica la información contable. ----------
  async exportar(tenantId: string, usuarioId: string, reporte: string, anio: number, mes: number | undefined, formato: string, direccion?: string) {
    if (!(REPORTES as readonly string[]).includes(reporte)) throw new BadRequestException('Reporte no admitido');
    if (!(FORMATOS_ADMITIDOS as string[]).includes(formato)) throw new BadRequestException('Formato no admitido (xlsx, csv o pdf)');
    if (direccion !== undefined && !['EMITIDO', 'RECIBIDO'].includes(direccion)) throw new BadRequestException('Dirección inválida');
    if (reporte === 'mensual' && formato !== 'xlsx') throw new BadRequestException('El libro contable del mes se descarga en Excel (.xlsx)');
    if (reporte === 'documentos' && formato !== 'xlsx' && !direccion) throw new BadRequestException('Para CSV o PDF indique documentos emitidos o recibidos');
    const periodo = periodoValido(anio, reporte === 'catalogo' || reporte === 'periodos' ? (mes ?? 1) : mes ?? 0);
    return this.prisma.$transaction(async (tx: any) => {
      // Una sola instantánea: todas las hojas del archivo muestran el mismo estado de la base.
      await tx.$executeRawUnsafe("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      const ctx = await contexto(tx, tenantId, periodo.anio, periodo.mes, usuarioId);
      const hojas = await hojasDeReporte(tx, ctx, reporte as Reporte, { direccion });
      await audit(tx, tenantId, usuarioId, 'CONTABILIDAD_EXPORTACION', reporte, { reporte, periodo: `${periodo.anio}-${String(periodo.mes).padStart(2, '0')}`, formato, direccion: direccion ?? null, hojas: hojas.map(h => h.nombre) });
      const nombre = nombreArchivo(reporte, periodo.anio, periodo.mes, formato);
      if (formato === 'xlsx') return { contenido: aExcel(libroExcel(ctx, hojas, `${reporte} ${periodo.anio}-${periodo.mes}`)), tipo: TIPO_MIME.xlsx, nombre };
      const hoja = hojas[0];
      return formato === 'csv'
        ? { contenido: aCsv(hoja), tipo: TIPO_MIME.csv, nombre }
        : { contenido: aPdf(hoja), tipo: TIPO_MIME.pdf, nombre };
    }, { timeout: 120000 });
  }
}
