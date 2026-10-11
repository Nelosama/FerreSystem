import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { getJwtSecret } from '../auth/jwt-secret';
import { plainToInstance } from 'class-transformer';
import { validate as validarDto } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { audit, authorizedActor, cashMovement, esIdInterno, id as nuevoId, idRecurso, idSolicitud, lockTenant, movement, query, Tx, fingerprint } from '../operaciones/ledger';
import { huellaDeLineas, movimientoConEvento, registrarEvento } from '../entregas/entregas-core';
import { calcularTotales, centavosADecimal } from '../common/dinero';
import { operacionEmitida, operacionesEmitidas } from './operaciones-emitidas';
import { diaCalendario, rangoDiasEnZona, ZONA_HORARIA_NEGOCIO } from '../common/zona-horaria';
import {
  ConfigContingenciaDto, LoteOperacionesDto, OperacionContingenciaDto, RegistrarDispositivoDto, ResolverOperacionDto, SolicitarVentanaDto,
} from './dto/contingencia.dto';

// POS offline de contingencia (solo EFECTIVO). Ver docs/POS_OFFLINE_CONTINGENCIA_DISENO.md.
// Principio: la operación recibida se registra PRIMERO (diario inmutable) y se aplica DESPUÉS en otra transacción.
// Una venta ya cobrada y entregada nunca se rechaza ni se borra: lo que no cuadra queda en REVISION o con requiere_revision.

export interface ConfigEfectiva {
  habilitada: boolean;
  entornoHabilitado: boolean;
  cupoPorcentaje: number;
  margenUnidades: number;
  montoMaxVentaCentavos: number;
  montoMaxAcumuladoCentavos: number;
  vigenciaHoras: number;
  dispositivosMax: number;
}
const DEFECTOS = {
  cupoPorcentaje: 50, margenUnidades: 1, montoMaxVentaCentavos: 500_000, montoMaxAcumuladoCentavos: 2_500_000,
  vigenciaHoras: 36, dispositivosMax: 1,
};
/** Sin latido en este tiempo el panel avisa que la información de la caja puede estar desactualizada. */
export const MINUTOS_SIN_CONTACTO = 5;

type Severidad = 'DURO' | 'BLANDO';
interface Conflicto { codigo: string; severidad: Severidad; detalle?: Record<string, unknown> }
interface OpcionesAplicar { forzar?: boolean; cajaId?: string; resueltoPor?: string }

const pad = (n: number, largo: number) => String(n).padStart(largo, '0');
export const correlativoDefinitivo = (numeroVenta: number) => `V-${pad(numeroVenta, 8)}`;
const canonico = (valor: unknown): string => JSON.stringify(valor, (_, v) =>
  v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
const sha = (texto: string) => createHash('sha256').update(texto).digest('hex');

/** Rechazos definitivos de la recepción (DEF-04, R-01): se conservan en el diario como REVISION con uno de estos conflictos DUROS no superables. */
// Rechazos definitivos de la aplicación: nunca se aplican como venta (la línea/importe inválido sigue en revisión del administrador).
const CODIGOS_RECHAZO = new Set(['VENTANA_OBSOLETA', 'VENTANA_DE_OTRO_CAJERO', 'CAJA_DE_VENTANA_NO_VALIDA']);
// H5: errores de recepción que también son rechazos definitivos y se registran como RECHAZADA; solo cambian la respuesta al equipo.
const CODIGOS_RECHAZO_RECEPCION = new Set([...CODIGOS_RECHAZO, 'IMPORTE_INVALIDO', 'CAJERO_NO_AUTORIZADO', 'OPERACION_OTRO_DISPOSITIVO']);
/** Qué debe hacer quien usa el equipo ante cada rechazo definitivo. Es el mismo texto en la primera respuesta y en toda consulta posterior (O-02). */
const INSTRUCCION_RECHAZO: Record<string, string> = {
  IMPORTE_INVALIDO: 'El cobro no cubre el total. No se registró venta: avise al administrador para conciliar el efectivo.',
  CAJERO_NO_AUTORIZADO: 'Esta operación pertenece a otro cajero. No se registró venta: avise al administrador.',
  OPERACION_OTRO_DISPOSITIVO: 'La operación pertenece a otro equipo. No se registró venta: avise al administrador.',
  VENTANA_OBSOLETA: 'Solicite una ventana nueva al administrador. La venta se conserva en el equipo y queda registrada para conciliación.',
  VENTANA_DE_OTRO_CAJERO: 'No cobre con la ventana de otro cajero. Avise al administrador: la venta queda para conciliación.',
  CAJA_DE_VENTANA_NO_VALIDA: 'Avise al administrador: la caja de la ventana no corresponde a su usuario. La venta queda para conciliación.',
};
/** CENTINELA 8b/F2/F3: la respuesta al equipo no revela datos de otros cajeros, otras operaciones ni el payload de un reenvío alterado. */
const sinDatosDeOtroCajero = (c: any) => {
  if (!c?.detalle) return c;
  const { ventanaUsuarioId: _v, ventanaId: _w, payloadRecibido: _p, otras: _o, ...resto } = c.detalle;
  return { ...c, detalle: resto };
};
const esRechazo = (f: { conflictos?: unknown }) => Array.isArray(f.conflictos) && (f.conflictos as any[]).some((c) => CODIGOS_RECHAZO.has(c?.codigo));

@Injectable()
export class ContingenciaService {
  private readonly logger = new Logger(ContingenciaService.name);
  /** H-5: clave del servidor para derivar operaciones. Nunca sale del backend. */
  private readonly claveOperaciones = getJwtSecret(new ConfigService());
  constructor(private readonly prisma: PrismaService) {}

  // ───────────────────────── configuración (apagada por defecto) ─────────────────────────

  private entornoHabilitado() {
    return process.env.POS_OFFLINE_ENABLED === 'true';
  }

  async configuracion(tenantId: string): Promise<ConfigEfectiva> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { configuracion: true } });
    if (!tenant) throw new NotFoundException('Empresa no encontrada');
    const guardada = ((tenant.configuracion as any)?.contingenciaOffline ?? {}) as Partial<ConfigEfectiva>;
    const entornoHabilitado = this.entornoHabilitado();
    return {
      ...DEFECTOS, ...Object.fromEntries(Object.entries(guardada).filter(([k]) => k in DEFECTOS)),
      habilitada: entornoHabilitado && guardada.habilitada === true,
      entornoHabilitado,
    } as ConfigEfectiva;
  }

  private async exigirHabilitada(tenantId: string) {
    const config = await this.configuracion(tenantId);
    if (!config.habilitada) throw new ForbiddenException('La contingencia offline no está habilitada para esta empresa');
    return config;
  }

  async actualizarConfiguracion(tenantId: string, usuarioId: string, dto: ConfigContingenciaDto) {
    if (dto.habilitada === true && !this.entornoHabilitado()) {
      throw new ConflictException('La contingencia offline no está habilitada en este entorno (POS_OFFLINE_ENABLED)');
    }
    await this.prisma.$transaction(async (tx) => {
      await lockTenant(tx, tenantId);
      await authorizedActor(tx, tenantId, usuarioId, ['ADMIN']);
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { configuracion: true } });
      const actual = (tenant.configuracion as any) ?? {};
      const anterior = actual.contingenciaOffline ?? {};
      const nueva = { ...anterior, ...Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined)) };
      await tx.tenant.update({ where: { id: tenantId }, data: { configuracion: { ...actual, contingenciaOffline: nueva } } });
      await audit(tx, tenantId, usuarioId, 'CONTINGENCIA_CONFIG', tenantId, { anterior, nueva });
    });
    return this.configuracion(tenantId);
  }

  // ───────────────────────── dispositivos ─────────────────────────

  async registrarDispositivo(tenantId: string, usuarioId: string, dto: RegistrarDispositivoDto) {
    const config = await this.exigirHabilitada(tenantId);
    return this.prisma.$transaction(async (tx) => {
      await lockTenant(tx, tenantId);
      await authorizedActor(tx, tenantId, usuarioId, ['ADMIN', 'CAJERO'], 'pos.vender');
      // El identificador interno se deriva por empresa: un UUID usado por otra empresa responde igual que uno libre (P2 de CENTINELA).
      const idInterno = idSolicitud(tenantId, dto.dispositivoId);
      const existente = await this.buscarDispositivo(tx, tenantId, dto.dispositivoId);
      if (existente) {
        if (!existente.activo) throw new ForbiddenException('Este dispositivo fue desactivado por un administrador');
        return this.dispositivoPublico(existente, dto.dispositivoId);
      }
      const activos = await tx.dispositivoPos.count({ where: { tenantId, activo: true } });
      if (activos >= config.dispositivosMax) {
        throw new ConflictException('Ya hay una caja de contingencia registrada. Un administrador debe desactivarla antes de registrar otra');
      }
      const [{ siguiente }] = await query<{ siguiente: number }>(tx,
        `SELECT COALESCE(MAX(codigo::int), 0) + 1 AS siguiente FROM dispositivos_pos WHERE tenant_id=$1`, tenantId);
      const dispositivo = await tx.dispositivoPos.create({
        data: { id: idInterno, tenantId, codigo: pad(Number(siguiente), 2), nombre: dto.nombre.trim(), registradoPor: usuarioId, ultimoContactoAt: new Date() },
      });
      await audit(tx, tenantId, usuarioId, 'CONTINGENCIA_DISPOSITIVO_REGISTRAR', dispositivo.id, { codigo: dispositivo.codigo, nombre: dispositivo.nombre });
      return this.dispositivoPublico(dispositivo, dto.dispositivoId);
    });
  }

  /** Busca el dispositivo de ESTA empresa por el identificador del equipo (derivado o, en registros anteriores, el crudo) o por el interno de la lista. */
  private buscarDispositivo(db: { dispositivoPos: any }, tenantId: string, valor: string) {
    return db.dispositivoPos.findFirst({ where: { tenantId, id: { in: [idRecurso(tenantId, valor), valor] } } });
  }

  private dispositivoPublico(d: any, idEquipo?: string) {
    return {
      id: idEquipo ?? d.id, codigo: d.codigo, nombre: d.nombre, activo: d.activo, registradoAt: d.registradoAt,
      ultimoContactoAt: d.ultimoContactoAt, ultimaSyncAt: d.ultimaSyncAt, pendientesReportados: d.pendientesReportados,
    };
  }

  async listarDispositivos(tenantId: string) {
    const filas = await this.prisma.dispositivoPos.findMany({ where: { tenantId }, orderBy: { codigo: 'asc' } });
    return filas.map((d) => ({ ...this.dispositivoPublico(d), desactualizado: this.desactualizado(d.ultimoContactoAt) }));
  }

  private desactualizado(ultimo: Date | null, ahora = new Date()) {
    return !ultimo || ahora.getTime() - ultimo.getTime() > MINUTOS_SIN_CONTACTO * 60_000;
  }

  async latido(tenantId: string, usuarioId: string, dispositivoId: string, pendientes: number) {
    await this.exigirHabilitada(tenantId);
    const dispositivo = await this.buscarDispositivo(this.prisma, tenantId, dispositivoId);
    if (!dispositivo) throw new NotFoundException('Dispositivo no registrado');
    if (!dispositivo.activo) throw new ForbiddenException('Este dispositivo fue desactivado por un administrador');
    await this.prisma.dispositivoPos.update({ where: { id: dispositivo.id }, data: { ultimoContactoAt: new Date(), pendientesReportados: Math.max(0, Math.floor(pendientes)) } });
    return { ok: true, serverNow: new Date().toISOString() };
  }

  async desactivarDispositivo(tenantId: string, usuarioId: string, dispositivoId: string, motivo: string) {
    return this.prisma.$transaction(async (tx) => {
      await lockTenant(tx, tenantId);
      await authorizedActor(tx, tenantId, usuarioId, ['ADMIN']);
      const d = await this.buscarDispositivo(tx, tenantId, dispositivoId);
      if (!d) throw new NotFoundException('Dispositivo no encontrado');
      await tx.dispositivoPos.update({ where: { id: d.id }, data: { activo: false } });
      // Se revocan las ventanas para nuevas ventas; las operaciones ya hechas offline se siguen recibiendo y conciliando.
      await tx.contingenciaVentana.updateMany({ where: { dispositivoId: d.id, revocadaAt: null }, data: { revocadaAt: new Date() } });
      await audit(tx, tenantId, usuarioId, 'CONTINGENCIA_DISPOSITIVO_DESACTIVAR', d.id, { motivo });
      return { ok: true };
    });
  }

  // ───────────────────────── ventana de contingencia y catálogo ─────────────────────────

  private async construirCatalogo(tx: Tx | PrismaService, tenantId: string, config: ConfigEfectiva) {
    const productos = await (tx as any).producto.findMany({
      // DEF-01: solo se ofrece lo que el administrador aprobó (precio aprobado y positivo), igual que la venta en línea.
      where: { tenantId, activo: true, precioAprobado: true, precioVenta: { gt: 0 } },
      select: { id: true, codigo: true, codigoBarras: true, nombre: true, precioVenta: true, precioCosto: true, stockActual: true, stockReservado: true, usaMedida: true, unidadMedida: true },
      orderBy: { id: 'asc' },
    });
    const margen = config.margenUnidades * 100;
    return productos.map((p: any) => {
      const libre = Math.max(0, Math.round((Number(p.stockActual) - Number(p.stockReservado)) * 100));
      const base = Math.min(libre - margen, Math.floor((libre * config.cupoPorcentaje) / 100));
      const cupo = Math.max(0, p.usaMedida ? base : Math.floor(base / 100) * 100);
      return {
        id: p.id, codigo: p.codigo, codigoBarras: p.codigoBarras ?? null, nombre: p.nombre,
        precioCentavos: Math.round(Number(p.precioVenta) * 100),
        // Prueba firmada en la instantánea del servidor: la aprobación vigente al emitir la ventana. Es la única evidencia
        // válida al sincronizar; una aprobación posterior del producto no la sustituye.
        precioAprobado: true, libreCentesimas: libre, cupoCentesimas: cupo,
        usaMedida: Boolean(p.usaMedida), unidadMedida: String(p.unidadMedida ?? 'UNIDAD'),
        // Costo vigente al emitir la ventana: se guarda solo en la instantánea del servidor, nunca se envía al equipo.
        costoCentavos: Math.round(Number(p.precioCosto ?? 0) * 100),
      };
    });
  }

  async emitirVentana(tenantId: string, usuarioId: string, dto: SolicitarVentanaDto) {
    const config = await this.exigirHabilitada(tenantId);
    const ahora = new Date();
    const resultado = await this.prisma.$transaction(async (tx) => {
      await lockTenant(tx, tenantId);
      await authorizedActor(tx, tenantId, usuarioId, ['ADMIN', 'CAJERO'], 'pos.vender');
      const dispositivo = await this.buscarDispositivo(tx, tenantId, dto.dispositivoId);
      if (!dispositivo) throw new NotFoundException('Registre este dispositivo antes de pedir una ventana de contingencia');
      if (!dispositivo.activo) throw new ForbiddenException('Este dispositivo fue desactivado por un administrador');
      const [caja] = await query(tx, `SELECT id FROM cajas WHERE tenant_id=$1 AND usuario_id=$2 AND estado='ABIERTA'`, tenantId, usuarioId);
      if (!caja) throw new ConflictException('Abra su caja antes de preparar la contingencia');
      const productos = await this.construirCatalogo(tx, tenantId, config);
      const hash = sha(canonico(productos));
      await tx.catalogoInstantanea.createMany({ data: [{ tenantId, hash, datos: { productos } as any }], skipDuplicates: true });
      const offsetRelojMs = dto.relojLocal ? ahora.getTime() - new Date(dto.relojLocal).getTime() : null;
      const ventana = await tx.contingenciaVentana.create({
        data: {
          tenantId, dispositivoId: dispositivo.id, usuarioId, cajaId: caja.id, catalogoHash: hash,
          emitidaAt: ahora, vigenteHasta: new Date(ahora.getTime() + config.vigenciaHoras * 3_600_000),
          limites: {
            cupoPorcentaje: config.cupoPorcentaje, margenUnidades: config.margenUnidades,
            montoMaxVentaCentavos: config.montoMaxVentaCentavos, montoMaxAcumuladoCentavos: config.montoMaxAcumuladoCentavos,
            offsetRelojMs,
          },
        },
      });
      // R-01: al emitir una ventana nueva se revocan las anteriores del equipo cuya instantánea no guarda la prueba de precio aprobado.
      const anteriores = await tx.contingenciaVentana.findMany({ where: { tenantId, dispositivoId: dispositivo.id, revocadaAt: null, id: { not: ventana.id } } });
      for (const anterior of anteriores) {
        if (await this.ventanaObsoleta(tenantId, anterior)) await tx.contingenciaVentana.update({ where: { id: anterior.id }, data: { revocadaAt: ahora } });
      }
      await tx.dispositivoPos.update({ where: { id: dispositivo.id }, data: { ultimoContactoAt: ahora } });
      const [{ maxima }] = await query<{ maxima: number }>(tx,
        `SELECT COALESCE(MAX(secuencia_local), 0) AS maxima FROM operaciones_contingencia WHERE tenant_id=$1 AND dispositivo_id=$2`, tenantId, dispositivo.id);
      await audit(tx, tenantId, usuarioId, 'CONTINGENCIA_VENTANA_EMITIR', ventana.id, { dispositivo: dispositivo.codigo, cajaId: caja.id, vigenteHasta: ventana.vigenteHasta, catalogoHash: hash });
      return { ventana, dispositivo, productos, hash, maxima: Number(maxima) };
    });
    const { ventana, dispositivo, productos, hash, maxima } = resultado;
    return {
      ventana: {
        id: ventana.id, dispositivoId: dto.dispositivoId, dispositivoCodigo: dispositivo.codigo, cajaId: ventana.cajaId, usuarioId,
        emitidaAt: ventana.emitidaAt, vigenteHasta: ventana.vigenteHasta, catalogoHash: hash, limites: ventana.limites,
        secuenciaServidor: maxima, serverNow: ahora.toISOString(),
        operacionesEmitidas: operacionesEmitidas(this.claveOperaciones, ventana.id),
      },
      catalogo: dto.catalogoHashActual === hash ? null : { hash, generadoAt: ahora.toISOString(), productos: productos.map(({ costoCentavos: _costo, precioAprobado: _aprobado, ...publico }: any) => publico) },
    };
  }

  // ───────────────────────── recepción de operaciones ─────────────────────────

  async recibirLote(tenantId: string, usuarioId: string, rol: string, dto: LoteOperacionesDto) {
    await this.exigirHabilitada(tenantId);
    const dispositivo = await this.buscarDispositivo(this.prisma, tenantId, dto.dispositivoId);
    if (!dispositivo) throw new NotFoundException('Dispositivo no registrado');
    const resultados: any[] = [];
    for (const crudo of dto.operaciones as unknown[]) {
      // H3 (CENTINELA): una operación mal formada no rechaza el lote entero. Se valida sola: las válidas se procesan y la
      // inválida deja evidencia (auditoría) y una respuesta propia, para que el equipo no reenvíe el lote indefinidamente.
      if (typeof crudo !== 'object' || crudo === null || Array.isArray(crudo)) {
        // CENTINELA H3-N: un elemento que no es un objeto no se puede validar ni identificar: se responde sin aplicar nada.
        resultados.push({ operacionId: null, estado: 'RECHAZADA_TECNICA', codigo: 'FORMATO_INVALIDO', mensaje: 'La operación no tiene un formato válido; no se registró venta', instruccion: 'Avise al administrador: la operación no tiene un formato válido.', requiereRevision: true, conflictos: [] });
        continue;
      }
      // H-5 (CENTINELA F3): un identificador con formato interno del servidor no es una solicitud del equipo. Se responde por
      // operación, sin lanzar (lanzar tumbaría el lote entero) y sin evidencia asociada a ese identificador.
      if (esIdInterno((crudo as any).operacionId)) {
        resultados.push(await this.registrarFormatoInvalido(tenantId, usuarioId, null, crudo, [{ property: 'operacionId', constraints: { reservado: 'identificador interno del servidor' } }]));
        continue;
      }
      const op = plainToInstance(OperacionContingenciaDto, crudo as object);
      const errores = await validarDto(op, { whitelist: true });
      const uuid = (crudo as any)?.operacionId;
      if (errores.length) {
        resultados.push(await this.registrarFormatoInvalido(tenantId, usuarioId, uuid, crudo, errores));
        continue;
      }
      try {
        resultados.push(await this.procesarOperacion(tenantId, usuarioId, rol, dispositivo.id, dto.dispositivoId, op));
      } catch (error: any) {
        this.logger.error(`Operación ${op.operacionId}: ${error?.message}`);
        const status = error?.status ?? 500;
        if (status >= 500) {
          // Error técnico (BD, bloqueo, tiempo): nada definitivo; el cliente reintenta con el mismo UUID y no se pierde nada.
          resultados.push({ operacionId: op.operacionId, estado: 'ERROR_TEMPORAL', codigo: null, mensaje: error?.message ?? 'Error' });
        } else {
          // H5: un 4xx es un rechazo definitivo. Debe quedar en el servidor para que el administrador lo vea; nunca es una venta.
          resultados.push(await this.registrarRechazoDefinitivo(tenantId, usuarioId, rol, dispositivo.id, op, error));
        }
      }
    }
    await this.prisma.dispositivoPos.update({
      where: { id: dispositivo.id },
      data: { ultimoContactoAt: new Date(), ultimaSyncAt: new Date(), pendientesReportados: dto.pendientesRestantes },
    });
    return { resultados, serverNow: new Date().toISOString() };
  }

  /** Estado de varias operaciones sin efectos (consulta previa al reenvío, recuperación tras cierre inesperado). */
  async estados(tenantId: string, usuarioId: string, rol: string, ids: string[]) {
    // El equipo conoce su identificador; el registro puede estar guardado con el derivado por empresa o, si es anterior, con el crudo.
    const candidatos = ids.map((id) => [id, idRecurso(tenantId, id)] as const);
    const filas = await this.prisma.operacionContingencia.findMany({ where: { tenantId, id: { in: candidatos.flat() as string[] } } });
    // CENTINELA F1/F4: un no administrador ve sus operaciones y los rechazos que él mismo envió; nunca los de otro.
    let visibles = filas;
    if (rol !== 'ADMIN' && filas.length) {
      const remitidas = await this.prisma.auditoriaOperacion.findMany({
        where: { tenantId, usuarioId, operacion: { in: ['CONTINGENCIA_OPERACION_RECHAZADA', 'CONTINGENCIA_OPERACION_ALTERADA'] }, entidadId: { in: filas.map((f) => f.id) } },
        select: { entidadId: true },
      });
      const propias = new Set(remitidas.map((a) => a.entidadId));
      visibles = filas.filter((f) => f.usuarioId === usuarioId || propias.has(f.id));
    }
    const porId = new Map(visibles.map((f) => [f.id, f]));
    return Promise.all(candidatos.map(async ([id, derivado]) => {
      const f = porId.get(derivado) ?? porId.get(id);
      if (f) return this.resumenCliente(f, id);
      return (await this.respuestaSinRegistro(tenantId, id, rol === 'ADMIN' ? undefined : usuarioId)) ?? { operacionId: id, estado: 'NO_REGISTRADA' };
    }));
  }

  /** Rechazo definitivo sin fila en el diario (importe incoherente, ventana desconocida): se reconstruye desde su evidencia en auditoría. */
  private async respuestaSinRegistro(tenantId: string, operacionId: string, remitente?: string) {
    if (esIdInterno(operacionId)) return null;
    const idInterno = idSolicitud(tenantId, operacionId);
    const evidencia = await this.prisma.auditoriaOperacion.findFirst({ where: { tenantId, operacion: 'CONTINGENCIA_OPERACION_NO_REGISTRADA', entidadId: idInterno, ...(remitente ? { usuarioId: remitente } : {}) } });
    if (!evidencia) return null;
    const d = (evidencia.datos ?? {}) as any;
    const codigo = d.codigo ?? 'RECHAZADA';
    return { operacionId, estado: 'RECHAZADA_TECNICA', codigo, mensaje: d.mensaje ?? 'La operación fue rechazada', instruccion: INSTRUCCION_RECHAZO[codigo] ?? 'Avise al administrador: la venta queda para conciliación.', requiereRevision: true, conflictos: [] };
  }

  /** Vista para el equipo (una operación rechazada ya está en REVISION: el equipo conserva la venta local). */
  private resumenCliente(f: any, idEquipo?: string) {
    // CENTINELA F3: la vista del equipo no devuelve el payload de un reenvío alterado ni identificadores ajenos.
    const vista = (r: any) => ({ ...r, conflictos: (r.conflictos ?? []).map(sinDatosDeOtroCajero) });
    if (f.estado === 'RECHAZADA' || (esRechazo(f) && f.estado === 'REVISION')) return vista({ ...this.resumenOperacion(f, idEquipo), ...this.respuestaRechazo(f, idEquipo ?? f.id) });
    return vista(this.resumenOperacion(f, idEquipo));
  }

  private resumenOperacion(f: any, idEquipo?: string) {
    return {
      operacionId: idEquipo ?? f.id, estado: f.estado, requiereRevision: f.requiereRevision, conflictos: f.conflictos,
      correlativoLocal: f.correlativoLocal, ventaId: f.ventaId, numeroVenta: f.numeroVenta,
      correlativoDefinitivo: f.numeroVenta ? correlativoDefinitivo(f.numeroVenta) : null,
      aplicadoAt: f.aplicadoAt, referenciaFacturaExterna: f.referenciaFacturaExterna,
    };
  }

  private async procesarOperacion(tenantId: string, usuarioId: string, rol: string, dispositivoId: string, dispositivoEquipo: string, dto: OperacionContingenciaDto) {
    // A (CENTINELA): un UUID ya rechazado sin fila no puede aplicarse después con un importe corregido.
    const rechazadaSinFila = await this.respuestaSinRegistroPara(tenantId, dto.operacionId, usuarioId, rol);
    if (rechazadaSinFila) return rechazadaSinFila;
    // H-1 (CENTINELA, 06f4d831): quien no es el dueño de una operación ya guardada no la altera ni recibe sus datos,
    // aunque declare su propio cajeroId (no hay 403 en ese caso).
    if (rol !== 'ADMIN') {
      const guardada = await this.prisma.operacionContingencia.findFirst({ where: { tenantId, id: { in: [idSolicitud(tenantId, dto.operacionId), dto.operacionId] } } });
      if (guardada && guardada.usuarioId !== usuarioId) {
        return { operacionId: dto.operacionId, estado: 'RECHAZADA_TECNICA', codigo: 'CAJERO_NO_AUTORIZADO', mensaje: 'Solo el cajero de la operación o un administrador puede enviarla', instruccion: INSTRUCCION_RECHAZO.CAJERO_NO_AUTORIZADO, requiereRevision: true, conflictos: [] };
      }
    }
    if (dto.dispositivoId !== dispositivoEquipo) throw new BadRequestException({ message: 'La operación pertenece a otro dispositivo', code: 'OPERACION_OTRO_DISPOSITIVO' });
    if (rol !== 'ADMIN' && dto.cajeroId !== usuarioId) {
      throw new ForbiddenException({ message: 'Solo el cajero de la operación o un administrador puede enviarla', code: 'CAJERO_NO_AUTORIZADO' });
    }
    // Un importe cero o un cobro menor al total nunca se registra como venta. Es un rechazo permanente (no un error de red):
    // el equipo conserva la venta local y la marca para revisión del administrador, sin reintentarla indefinidamente.
    if (!(dto.totalCentavos > 0) || dto.efectivoRecibidoCentavos < dto.totalCentavos) {
      throw new BadRequestException({ message: 'La operación tiene un importe inválido; se conserva en el equipo para revisión del administrador', code: 'IMPORTE_INVALIDO' });
    }
    const hash = fingerprint(canonico({ ...dto }));
    const ventana = await this.prisma.contingenciaVentana.findFirst({ where: { id: dto.ventanaId, tenantId, dispositivoId } });
    if (!ventana) throw new BadRequestException({ message: 'Ventana de contingencia desconocida', code: 'VENTANA_DESCONOCIDA' });
    // H-5: la propiedad la fija la ventana emitida al cajero autenticado, no el cajeroId que declara el equipo. Un envío de
    // otro cajero no escribe nada: queda solo evidencia para su remitente (N-NUEVA), así nunca bloquea al dueño.
    if (rol !== 'ADMIN' && ventana.usuarioId !== usuarioId) {
      throw new ForbiddenException({ message: 'La ventana de contingencia pertenece a otro cajero', code: 'CAJERO_NO_AUTORIZADO' });
    }
    // H-5: el identificador tiene que ser una de las operaciones que el servidor emitió para esta ventana y este índice.
    // Un UUID ajeno o inventado no coincide con la derivación de la ventana de quien lo envía y no crea fila.
    if (dto.indiceOperacion === undefined || operacionEmitida(this.claveOperaciones, ventana.id, dto.indiceOperacion) !== dto.operacionId) {
      throw new BadRequestException({ message: 'La operación no fue emitida por el servidor para esta ventana; no se registró venta', code: 'OPERACION_NO_EMITIDA' });
    }

    // 1) Diario primero: idempotencia real por UUID (PK) y por (dispositivo, secuencia).
    // Identificador interno derivado por empresa (P2 de CENTINELA): el UUID de otra empresa se trata como libre.
    const idInterno = idSolicitud(tenantId, dto.operacionId);
    const buscar = () => this.prisma.operacionContingencia.findFirst({ where: { tenantId, id: { in: [idInterno, dto.operacionId] } } });
    const existente = await buscar();
    if (existente) {
      // CENTINELA 8c: un payload distinto con el mismo UUID se registra como alteración también sobre una operación ya rechazada.
      if (existente.payloadHash !== hash) {
        const alterada = await this.registrarAlteracion(tenantId, usuarioId, existente, dto, hash);
        return esRechazo(alterada) ? this.respuestaRechazo(alterada, dto.operacionId) : this.resumenCliente(alterada, dto.operacionId);
      }
      if (esRechazo(existente) || existente.estado === 'RECHAZADA') return this.respuestaRechazo(existente, dto.operacionId);
      if (existente.estado === 'RECIBIDA') return this.aplicarYResumir(tenantId, existente.id, {}, dto.operacionId);
      return this.resumenCliente(existente, dto.operacionId);
    }
    // DEF-04: la ventana, y con ella la caja, pertenecen al cajero que la pidió. Un cobro de otro cajero nunca entra en esa caja.
    // R-01: una ventana cuya instantánea no guarda la prueba de precio aprobado (formato anterior) no se acepta.
    // Ambos son rechazos definitivos: se conserva la evidencia en el diario (estado RECHAZADA), sin venta, stock ni caja.
    const rechazo = await this.motivoRechazoDeVentana(tenantId, ventana, dto);
    if (rechazo) return this.registrarRechazo(tenantId, ventana, dto, hash, idInterno, rechazo, usuarioId);
    const estimado = this.estimarHora(dto.ocurridoAtLocal, ventana.limites as any);
    try {
      await this.prisma.operacionContingencia.create({
        data: {
          id: idInterno, tenantId, dispositivoId, ventanaId: ventana.id, usuarioId: dto.cajeroId, cajaId: ventana.cajaId,
          secuenciaLocal: dto.secuenciaLocal, correlativoLocal: dto.correlativoLocal, ocurridoAtLocal: new Date(dto.ocurridoAtLocal),
          ocurridoAtEstimado: estimado, payload: dto as any, payloadHash: hash, totalCentavos: dto.totalCentavos,
          efectivoRecibidoCentavos: dto.efectivoRecibidoCentavos, referenciaFacturaExterna: dto.referenciaFacturaExterna?.trim() || null,
        },
      });
    } catch (error: any) {
      if (error?.code !== 'P2002') throw error;
      // Carrera: otra petición con el mismo UUID ya lo registró.
      const ya = await buscar();
      if (!ya) throw error;
      if (ya.payloadHash !== hash) {
        // CENTINELA H1-R: la ruta de carrera responde con la misma vista saneada que el resto.
        const alterada = await this.registrarAlteracion(tenantId, usuarioId, ya, dto, hash);
        return esRechazo(alterada) ? this.respuestaRechazo(alterada, dto.operacionId) : this.resumenCliente(alterada, dto.operacionId);
      }
      return ya.estado === 'RECIBIDA' ? this.aplicarYResumir(tenantId, ya.id, {}, dto.operacionId) : this.resumenCliente(ya, dto.operacionId);
    }
    // 2) Aplicación en transacción aparte.
    return this.aplicarYResumir(tenantId, idInterno, {}, dto.operacionId);
  }

  /** H3: operación con formato inválido. Con UUID válido queda evidencia en auditoría; sin UUID solo se responde. */
  private async registrarFormatoInvalido(tenantId: string, usuarioId: string, uuid: unknown, crudo: unknown, errores: any[]) {
    const mensaje = 'La operación tiene datos con formato inválido; no se registró venta';
    const campos = errores.map((e) => ({ campo: e.property, reglas: Object.keys(e.constraints ?? {}) }));
    const valido = typeof uuid === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);
    if (valido) {
      const idInterno = idSolicitud(tenantId, uuid);
      const yaAuditada = await this.prisma.auditoriaOperacion.findFirst({ where: { tenantId, operacion: 'CONTINGENCIA_OPERACION_NO_REGISTRADA', entidadId: idInterno, usuarioId } });
      if (!yaAuditada) {
        await this.prisma.auditoriaOperacion.create({
          data: { tenantId, usuarioId, operacion: 'CONTINGENCIA_OPERACION_NO_REGISTRADA', entidadId: idInterno,
            datos: { codigo: 'FORMATO_INVALIDO', mensaje, campos, payload: crudo } as any },
        });
      }
    }
    return { operacionId: valido ? uuid : null, estado: 'RECHAZADA_TECNICA', codigo: 'FORMATO_INVALIDO', mensaje, instruccion: 'Avise al administrador: la operación no tiene un formato válido.', requiereRevision: true, conflictos: [] };
  }

  /**
   * H-5: la evidencia de un rechazo sin fila es solo de quien lo envió (o del administrador). Un intento ajeno nunca
   * bloquea a quien es dueño de la operación: no hay «ya rechazada» global cuando no existe fila.
   */
  private async respuestaSinRegistroPara(tenantId: string, operacionId: string, usuarioId: string, rol: string) {
    return this.respuestaSinRegistro(tenantId, operacionId, rol === 'ADMIN' ? undefined : usuarioId);
  }

  /**
   * H5: registra un rechazo 4xx anterior a la aplicación. Idempotente por operación: si ya existe fila, responde su estado real.
   * Con ventana válida se guarda en el diario (RECHAZADA, con motivo). Sin ventana válida no cabe en el diario (ventana_id es
   * obligatoria): queda evidencia en auditoría y la respuesta de rechazo. En ningún caso se crea venta, caja ni movimiento de stock.
   */
  private async registrarRechazoDefinitivo(tenantId: string, usuarioId: string, rol: string, dispositivoId: string, dto: OperacionContingenciaDto, error: any) {
    const codigo = error?.response?.code ?? 'RECHAZADA';
    const mensaje = error?.response?.message ?? error?.message ?? 'La operación fue rechazada';
    const idInterno = idSolicitud(tenantId, dto.operacionId);
    const hash = fingerprint(canonico({ ...dto }));
    const existente = await this.prisma.operacionContingencia.findFirst({ where: { tenantId, id: { in: [idInterno, dto.operacionId] } } });
    if (existente) {
      // H-1/H-2 (CENTINELA, 2c62c597): quien no es el cajero de una operación ya existente no altera su fila ni recibe sus datos.
      if (codigo === 'CAJERO_NO_AUTORIZADO' && existente.usuarioId !== usuarioId) {
        return { operacionId: dto.operacionId, estado: 'RECHAZADA_TECNICA', codigo, mensaje, instruccion: INSTRUCCION_RECHAZO[codigo], requiereRevision: true, conflictos: [] };
      }
      // H6: un payload distinto con el mismo UUID se registra como alteración también sobre un rechazo ya guardado.
      if (existente.payloadHash !== hash) {
        const alterada = await this.registrarAlteracion(tenantId, usuarioId, existente, dto, hash);
        return this.respuestaRechazo(alterada, dto.operacionId);
      }
      return this.resumenCliente(existente, dto.operacionId);
    }
    // N-NUEVA (CENTINELA): un envío de quien no es el cajero de la operación no crea fila. Una fila RECHAZADA a nombre del dueño
    // bloquearía para siempre su sincronización legítima. Queda solo la evidencia por remitente, para que pueda consultarla.
    if (codigo === 'CAJERO_NO_AUTORIZADO' || codigo === 'OPERACION_NO_EMITIDA') {
      const propia = await this.prisma.auditoriaOperacion.findFirst({ where: { tenantId, operacion: 'CONTINGENCIA_OPERACION_NO_REGISTRADA', entidadId: idInterno, usuarioId } });
      if (!propia) {
        await this.prisma.auditoriaOperacion.create({
          data: { tenantId, usuarioId, operacion: 'CONTINGENCIA_OPERACION_NO_REGISTRADA', entidadId: idInterno,
            datos: { codigo, mensaje, correlativoLocal: dto.correlativoLocal, totalCentavos: dto.totalCentavos, ventanaId: dto.ventanaId, payload: dto } as any },
        });
      }
      return { operacionId: dto.operacionId, estado: 'RECHAZADA_TECNICA', codigo, mensaje, instruccion: INSTRUCCION_RECHAZO[codigo], requiereRevision: true, conflictos: [] };
    }
    // H-5 (CENTINELA F2): la evidencia previa que se devuelve es la de quien envía, nunca la de otro cajero.
    const previa = await this.respuestaSinRegistro(tenantId, dto.operacionId, rol === 'ADMIN' ? undefined : usuarioId);
    if (previa) return previa;
    // El diario exige importes coherentes (montos_check: total > 0 y efectivo >= total). Un cobro insuficiente no cabe en él
    // sin cambiar el esquema; esa decisión no está autorizada. Su evidencia completa queda en auditoría.
    const montosCoherentes = dto.totalCentavos > 0 && dto.efectivoRecibidoCentavos >= dto.totalCentavos;
    // E (CENTINELA): la ventana debe ser de este equipo; una ventana de otro equipo no cuenta como registro.
    // H-5 (CENTINELA F1): una fila RECHAZADA exige que la ventana sea de quien envía y que el identificador sea el emitido para
    // ella. Sin esa comprobación, un OPERACION_OTRO_DISPOSITIVO enviado con la ventana propia creaba la fila a nombre del intruso.
    const ventana = montosCoherentes ? await this.ventanaDelRemitente(tenantId, usuarioId, rol, dispositivoId, dto) : null;
    if (ventana) {
      return this.registrarRechazo(tenantId, ventana, dto, hash, idInterno, { codigo, mensaje }, usuarioId);
    }
    const yaAuditada = await this.prisma.auditoriaOperacion.findFirst({ where: { tenantId, operacion: 'CONTINGENCIA_OPERACION_NO_REGISTRADA', entidadId: idInterno, usuarioId } });
    if (!yaAuditada) {
      await this.prisma.auditoriaOperacion.create({
        data: { tenantId, usuarioId, operacion: 'CONTINGENCIA_OPERACION_NO_REGISTRADA', entidadId: idInterno,
          datos: { codigo, mensaje, correlativoLocal: dto.correlativoLocal, totalCentavos: dto.totalCentavos, efectivoRecibidoCentavos: dto.efectivoRecibidoCentavos, ventanaId: dto.ventanaId, payload: dto } as any },
      });
    }
    return { operacionId: dto.operacionId, estado: 'RECHAZADA_TECNICA', codigo, mensaje, instruccion: INSTRUCCION_RECHAZO[codigo] ?? 'Avise al administrador: la venta queda para conciliación.', requiereRevision: true, conflictos: [] };
  }

  /** Ventana que puede respaldar un rechazo con fila: del remitente (o de un administrador) y con el identificador emitido para ella. */
  private async ventanaDelRemitente(tenantId: string, usuarioId: string, rol: string, dispositivoId: string, dto: OperacionContingenciaDto) {
    const ventana = await this.prisma.contingenciaVentana.findFirst({ where: { id: dto.ventanaId, tenantId, dispositivoId } });
    if (!ventana) return null;
    if (rol !== 'ADMIN' && ventana.usuarioId !== usuarioId) return null;
    const emitida = dto.indiceOperacion !== undefined && operacionEmitida(this.claveOperaciones, ventana.id, dto.indiceOperacion) === dto.operacionId;
    return emitida ? ventana : null;
  }

  private async motivoRechazoDeVentana(tenantId: string, ventana: any, dto: OperacionContingenciaDto): Promise<{ codigo: string; mensaje: string } | null> {
    if (ventana.usuarioId !== dto.cajeroId) {
      return { codigo: 'VENTANA_DE_OTRO_CAJERO', mensaje: 'La ventana de contingencia pertenece a otro cajero; la operación no se aplica a su caja. La venta se conserva en el equipo para revisión del administrador' };
    }
    const [caja] = await query<any>(this.prisma as any, 'SELECT id FROM cajas WHERE id=$1 AND tenant_id=$2 AND usuario_id=$3', ventana.cajaId, tenantId, ventana.usuarioId);
    if (!caja) {
      return { codigo: 'CAJA_DE_VENTANA_NO_VALIDA', mensaje: 'La caja de la ventana no corresponde al cajero de la operación; la venta se conserva en el equipo para revisión del administrador' };
    }
    if (await this.ventanaObsoleta(tenantId, ventana)) {
      return { codigo: 'VENTANA_OBSOLETA', mensaje: 'La ventana de contingencia es anterior a la validación de precios aprobados y ya no es válida. Solicite una ventana nueva; la venta se conserva en el equipo y quedó registrada para conciliación' };
    }
    return null;
  }

  /** Una ventana es obsoleta si su instantánea no existe o algún producto no guarda la prueba `precioAprobado === true`. */
  private async ventanaObsoleta(tenantId: string, ventana: { catalogoHash: string }) {
    const instantanea = await this.prisma.catalogoInstantanea.findUnique({ where: { tenantId_hash: { tenantId, hash: ventana.catalogoHash } } });
    const productos = ((instantanea?.datos as any)?.productos ?? null) as any[] | null;
    return !productos || productos.some((p) => p?.precioAprobado !== true);
  }

  private respuestaRechazo(f: any, idEquipo: string) {
    const c = (f.conflictos as any[])?.find((x) => CODIGOS_RECHAZO_RECEPCION.has(x?.codigo)) ?? {};
    return {
      operacionId: idEquipo, estado: 'RECHAZADA_TECNICA', codigo: c.codigo ?? 'RECHAZADA', mensaje: c.detalle?.mensaje ?? 'La operación fue rechazada',
      instruccion: INSTRUCCION_RECHAZO[c.codigo] ?? 'Avise al administrador: la venta queda para conciliación.',
      requiereRevision: true, conflictos: (f.conflictos as any[]).map(sinDatosDeOtroCajero),
    };
  }

  private async registrarRechazo(tenantId: string, ventana: any, dto: OperacionContingenciaDto, hash: string, idInterno: string, rechazo: { codigo: string; mensaje: string }, remitente: string) {
    const conflictos = [{ codigo: rechazo.codigo, severidad: 'DURO', detalle: { mensaje: rechazo.mensaje, ventanaId: ventana.id, ventanaUsuarioId: ventana.usuarioId, cajeroOperacionId: dto.cajeroId } }];
    try {
      await this.prisma.$transaction(async (tx) => {
        const fila = await tx.operacionContingencia.create({
          data: {
            id: idInterno, tenantId, dispositivoId: ventana.dispositivoId, ventanaId: ventana.id, usuarioId: dto.cajeroId, cajaId: ventana.cajaId,
            secuenciaLocal: dto.secuenciaLocal, correlativoLocal: dto.correlativoLocal, ocurridoAtLocal: new Date(dto.ocurridoAtLocal),
            ocurridoAtEstimado: this.estimarHora(dto.ocurridoAtLocal, ventana.limites as any), payload: dto as any, payloadHash: hash,
            totalCentavos: dto.totalCentavos, efectivoRecibidoCentavos: dto.efectivoRecibidoCentavos,
            referenciaFacturaExterna: dto.referenciaFacturaExterna?.trim() || null,
            estado: 'RECHAZADA', requiereRevision: true, conflictos: conflictos as any,
          },
        });
        // CENTINELA F1: la evidencia se atribuye a quien envió el lote, para que pueda consultar su propio rechazo.
        await audit(tx, tenantId, remitente, 'CONTINGENCIA_OPERACION_RECHAZADA', fila.id, { codigo: rechazo.codigo, ventanaId: ventana.id, correlativoLocal: dto.correlativoLocal, totalCentavos: dto.totalCentavos });
      });
    } catch (error: any) {
      if (error?.code !== 'P2002') throw error; // carrera: otra petición ya registró la misma operación
    }
    return this.respuestaRechazo({ conflictos }, dto.operacionId);
  }

  private estimarHora(local: string, limites: { offsetRelojMs?: number | null }) {
    const base = new Date(local).getTime();
    return new Date(base + (typeof limites?.offsetRelojMs === 'number' ? limites.offsetRelojMs : 0));
  }

  private async registrarAlteracion(tenantId: string, usuarioId: string, existente: any, dto: OperacionContingenciaDto, hash: string) {
    // H2 (CENTINELA): el mismo payload alterado no añade otro conflicto ni otra auditoría.
    const ya = (existente.conflictos as any[]).some((c) => c?.codigo === 'OPERACION_ALTERADA' && c?.detalle?.payloadHashRecibido === hash);
    if (ya) return this.resumenOperacion(existente);
    const conflictos = [...(existente.conflictos as any[]), {
      codigo: 'OPERACION_ALTERADA', severidad: 'DURO',
      detalle: { payloadHashRecibido: hash, recibidoAt: new Date().toISOString(), payloadRecibido: dto },
    }];
    const actualizada = await this.prisma.operacionContingencia.update({
      where: { id: existente.id },
      data: { conflictos: conflictos as any, requiereRevision: true, ...(existente.estado === 'RECIBIDA' ? { estado: 'REVISION' } : {}) },
    });
    await this.prisma.auditoriaOperacion.create({
      data: { tenantId, usuarioId, operacion: 'CONTINGENCIA_OPERACION_ALTERADA', entidadId: existente.id, datos: { payloadHashRecibido: hash } },
    });
    return this.resumenOperacion(actualizada);
  }

  private async aplicarYResumir(tenantId: string, operacionId: string, opciones: OpcionesAplicar, idEquipo?: string) {
    const fila = await this.prisma.$transaction((tx) => this.aplicar(tx, tenantId, operacionId, opciones), { timeout: 30000 });
    return this.resumenOperacion(fila, idEquipo);
  }

  // ───────────────────────── aplicación / conciliación ─────────────────────────

  private async aplicar(tx: Tx, tenantId: string, operacionId: string, opciones: OpcionesAplicar) {
    await lockTenant(tx, tenantId);
    await query(tx, 'SELECT 1 FROM pg_advisory_xact_lock(hashtextextended($1, 0))', `VENTA:${operacionId}`);
    const [bloqueada] = await query(tx, 'SELECT id FROM operaciones_contingencia WHERE id=$1 AND tenant_id=$2 FOR UPDATE', operacionId, tenantId);
    if (!bloqueada) throw new NotFoundException('Operación no encontrada');
    const op = await tx.operacionContingencia.findUniqueOrThrow({ where: { id: operacionId } });
    if (op.estado === 'RECHAZADA' || esRechazo(op)) throw new ConflictException('Una operación rechazada nunca se aplica como venta; ciérrela con conciliación de efectivo (cerrar sin venta)');
    if (op.estado === 'APLICADA' || op.estado === 'RESUELTA_MANUAL') return op;
    if (op.estado === 'REVISION' && !opciones.forzar && !opciones.resueltoPor) return op;

    const dto = op.payload as unknown as OperacionContingenciaDto;
    const previos = (op.conflictos as any[]).filter((c) => c.codigo === 'OPERACION_ALTERADA');
    const conflictos: Conflicto[] = [...previos];
    const forzar = Boolean(opciones.forzar);
    const ventana = await tx.contingenciaVentana.findUniqueOrThrow({ where: { id: op.ventanaId } });
    const limites = ventana.limites as any;

    // Coherencia interna del importe: el servidor recalcula con la misma aritmética entera.
    const calculo = calcularTotales(dto.lineas.map((l) => ({ precioCentavos: l.precioCentavos, cantidadCentesimas: l.cantidadCentesimas })));
    if (dto.efectivoRecibidoCentavos - dto.cambioCentavos !== dto.totalCentavos) {
      conflictos.push({ codigo: 'EFECTIVO_INCONSISTENTE', severidad: 'DURO', detalle: { efectivo: dto.efectivoRecibidoCentavos, cambio: dto.cambioCentavos, total: dto.totalCentavos } });
    }
    if (calculo.subtotal !== dto.subtotalCentavos || calculo.isv !== dto.isvCentavos || calculo.total !== dto.totalCentavos
        || dto.subtotalCentavos + dto.isvCentavos !== dto.totalCentavos) {
      conflictos.push({ codigo: 'TOTAL_DIFERENTE', severidad: 'DURO', detalle: { cliente: { subtotal: dto.subtotalCentavos, isv: dto.isvCentavos, total: dto.totalCentavos }, servidor: { subtotal: calculo.subtotal, isv: calculo.isv, total: calculo.total } } });
    }

    // Nunca se crea una venta de importe cero o con líneas sin precio o sin cantidad. La operación se conserva en revisión.
    if (dto.totalCentavos <= 0 || dto.lineas.length === 0 || dto.lineas.some((l) => l.precioCentavos <= 0 || l.cantidadCentesimas <= 0)) {
      conflictos.push({ codigo: 'IMPORTE_INVALIDO', severidad: 'DURO', detalle: { total: dto.totalCentavos } });
    }

    // Usuario y empresa vigentes ahora.
    try {
      await authorizedActor(tx, tenantId, op.usuarioId, ['ADMIN', 'CAJERO', 'VENDEDOR'], 'pos.vender');
    } catch {
      conflictos.push({ codigo: 'USUARIO_NO_AUTORIZADO', severidad: 'DURO' });
    }

    // Ventana, reloj y límites.
    const estimado = op.ocurridoAtEstimado;
    if (ventana.revocadaAt && estimado > ventana.revocadaAt) conflictos.push({ codigo: 'VENTANA_REVOCADA', severidad: 'BLANDO', detalle: { revocadaAt: ventana.revocadaAt } });
    if (estimado > ventana.vigenteHasta) conflictos.push({ codigo: 'VENTANA_EXPIRADA', severidad: 'BLANDO', detalle: { vigenteHasta: ventana.vigenteHasta, ocurrido: estimado } });
    if (estimado.getTime() < ventana.emitidaAt.getTime() - 300_000 || estimado.getTime() > op.recibidoAt.getTime() + 300_000) {
      conflictos.push({ codigo: 'RELOJ_ANOMALO', severidad: 'BLANDO', detalle: { ocurrido: estimado, ventanaEmitidaAt: ventana.emitidaAt, recibidoAt: op.recibidoAt } });
    }
    if (limites?.montoMaxVentaCentavos && dto.totalCentavos > limites.montoMaxVentaCentavos) {
      conflictos.push({ codigo: 'LIMITE_VENTA_EXCEDIDO', severidad: 'BLANDO', detalle: { maximo: limites.montoMaxVentaCentavos, total: dto.totalCentavos } });
    }
    if (limites?.montoMaxAcumuladoCentavos) {
      const [{ suma }] = await query<{ suma: string }>(tx,
        `SELECT COALESCE(SUM(total_centavos),0) AS suma FROM operaciones_contingencia WHERE tenant_id=$1 AND ventana_id=$2 AND secuencia_local<=$3`, tenantId, op.ventanaId, op.secuenciaLocal);
      if (Number(suma) > limites.montoMaxAcumuladoCentavos) conflictos.push({ codigo: 'LIMITE_ACUMULADO_EXCEDIDO', severidad: 'BLANDO', detalle: { maximo: limites.montoMaxAcumuladoCentavos, acumulado: Number(suma) } });
    }

    const duplicados = await query<{ id: string }>(tx,
      `SELECT id FROM operaciones_contingencia WHERE tenant_id=$1 AND id<>$2 AND (
         (dispositivo_id=$3 AND secuencia_local=$4) OR correlativo_local=$5) LIMIT 5`,
      tenantId, op.id, op.dispositivoId, op.secuenciaLocal, op.correlativoLocal);
    if (duplicados.length) conflictos.push({ codigo: 'SECUENCIA_DUPLICADA', severidad: 'DURO', detalle: { cantidad: duplicados.length } });

    // Caja: nunca se altera un cierre histórico.
    let cajaDestino: any = null;
    const [cajaOriginal] = await query(tx, 'SELECT * FROM cajas WHERE id=$1 AND tenant_id=$2 FOR UPDATE', op.cajaId, tenantId);
    if (cajaOriginal?.estado === 'ABIERTA') cajaDestino = cajaOriginal;
    else if (opciones.cajaId) {
      const [alterna] = await query(tx, `SELECT * FROM cajas WHERE id=$1 AND tenant_id=$2 AND estado='ABIERTA' FOR UPDATE`, opciones.cajaId, tenantId);
      if (!alterna) throw new BadRequestException('La caja indicada no está abierta');
      cajaDestino = alterna;
    }
    // H1 (CENTINELA): una operación nunca entra en la caja de otro cajero por la ventana. Rechazo definitivo no superable.
    // Una caja distinta elegida por administración (opciones.cajaId) sigue siendo decisión explícita y auditada.
    if (cajaDestino && cajaOriginal && cajaDestino.id === cajaOriginal.id && cajaOriginal.usuario_id !== op.usuarioId) {
      conflictos.push({ codigo: 'VENTANA_DE_OTRO_CAJERO', severidad: 'DURO', detalle: { cajaId: cajaOriginal.id, cajeroOperacionId: op.usuarioId } });
    }
    // CENTINELA N1: una venta solo se registra en una caja abierta del cajero que la cobró. Otras cajas: conciliación de efectivo.
    if (cajaDestino && cajaOriginal && cajaDestino.id !== cajaOriginal.id && cajaDestino.usuario_id !== op.usuarioId && cajaDestino.usuario_id !== opciones.resueltoPor) {
      throw new ConflictException('La venta solo puede registrarse en una caja abierta del cajero que la cobró; para conciliar el efectivo de otra caja use el cierre sin venta');
    }
    if (!cajaDestino) conflictos.push({ codigo: 'CAJA_CERRADA', severidad: 'DURO', detalle: { cajaId: op.cajaId } });

    // Productos, precios de la ventana, cupo e inventario.
    const instantanea = await tx.catalogoInstantanea.findUnique({ where: { tenantId_hash: { tenantId, hash: ventana.catalogoHash } } });
    const enVentana = new Map<string, any>(((instantanea?.datos as any)?.productos ?? []).map((p: any) => [p.id, p]));
    const idsOrdenados = [...new Set(dto.lineas.map((l) => l.productoId))].sort();
    const productos = new Map<string, any>();
    for (const id of idsOrdenados) {
      const [p] = await query(tx, 'SELECT * FROM productos WHERE id=$1 AND tenant_id=$2 FOR UPDATE', id, tenantId);
      if (p) productos.set(id, p);
    }
    const vendidoAntes = await query<{ producto_id: string; cantidad: string }>(tx,
      `SELECT l->>'productoId' AS producto_id, SUM((l->>'cantidadCentesimas')::bigint) AS cantidad
         FROM operaciones_contingencia o, jsonb_array_elements(o.payload->'lineas') l
        WHERE o.tenant_id=$1 AND o.ventana_id=$2 AND o.secuencia_local<$3 GROUP BY 1`, tenantId, op.ventanaId, op.secuenciaLocal);
    const vendido = new Map(vendidoAntes.map((r) => [r.producto_id, Number(r.cantidad)]));
    const faltantes: { productoId: string; cantidad: number }[] = [];
    for (const linea of dto.lineas) {
      const p = productos.get(linea.productoId);
      if (!p) { conflictos.push({ codigo: 'PRODUCTO_NO_ENCONTRADO', severidad: 'DURO', detalle: { productoId: linea.productoId } }); continue; }
      if (!p.activo) conflictos.push({ codigo: 'PRODUCTO_INACTIVO', severidad: 'BLANDO', detalle: { productoId: p.id, codigo: p.codigo } });
      // El precio se vuelve a validar al sincronizar: un producto sin precio de venta aprobado no se vende ni se fuerza.
      if (!(Number(p.precio_venta) > 0)) conflictos.push({ codigo: 'PRODUCTO_SIN_PRECIO_APROBADO', severidad: 'DURO', detalle: { productoId: p.id, codigo: p.codigo } });
      const snap = enVentana.get(linea.productoId);
      // DEF-01: sin prueba de aprobación en la instantánea de la ventana la venta no se aplica (conflicto DURO, no superable).
      // Un producto fuera de la ventana (p. ej. no aprobado al emitirla) o con instantánea sin la marca de aprobación no tiene
      // prueba; se descarta mirar el estado actual del producto para que una aprobación posterior no legitime la venta.
      if (!snap) conflictos.push({ codigo: 'PRODUCTO_FUERA_DE_VENTANA', severidad: 'DURO', detalle: { productoId: p.id, codigo: p.codigo } });
      else if (snap.precioAprobado !== true || !(Number(snap.precioCentavos) > 0)) {
        conflictos.push({ codigo: 'PRECIO_SIN_APROBACION', severidad: 'DURO', detalle: { productoId: p.id, codigo: p.codigo, evidencia: 'instantanea_de_ventana' } });
      } else {
        if (!p.precio_aprobado) conflictos.push({ codigo: 'APROBACION_REVOCADA_POSTERIOR', severidad: 'BLANDO', detalle: { productoId: p.id, codigo: p.codigo } });
        if (snap.precioCentavos !== linea.precioCentavos) {
          conflictos.push({ codigo: 'PRECIO_NO_AUTORIZADO', severidad: 'BLANDO', detalle: { productoId: p.id, codigo: p.codigo, autorizado: snap.precioCentavos, cobrado: linea.precioCentavos } });
        }
        if ((vendido.get(linea.productoId) ?? 0) + linea.cantidadCentesimas > snap.cupoCentesimas) {
          conflictos.push({ codigo: 'CUPO_EXCEDIDO', severidad: 'BLANDO', detalle: { productoId: p.id, codigo: p.codigo, cupo: snap.cupoCentesimas } });
        }
      }
      const libre = Math.round((Number(p.stock_actual) - Number(p.stock_reservado)) * 100);
      if (libre < linea.cantidadCentesimas) {
        conflictos.push({ codigo: 'STOCK_INSUFICIENTE', severidad: 'DURO', detalle: { productoId: p.id, codigo: p.codigo, libreCentesimas: libre, requerido: linea.cantidadCentesimas } });
        faltantes.push({ productoId: p.id, cantidad: linea.cantidadCentesimas - libre });
      }
    }

    // Decisión: ¿qué conflictos duros se pueden aceptar por decisión de un administrador?
    // PRECIO_SIN_APROBACION, PRODUCTO_FUERA_DE_VENTANA, PRODUCTO_NO_ENCONTRADO, EFECTIVO_INCONSISTENTE y OPERACION_ALTERADA
    // no son superables: ni ACEPTAR ni REINTENTAR los convierten en venta.
    // CAJA_CERRADA no es superable: sin caja abierta no hay dónde registrar la venta (CENTINELA N2).
    const superables = new Set(['USUARIO_NO_AUTORIZADO', 'STOCK_INSUFICIENTE', 'TOTAL_DIFERENTE', 'SECUENCIA_DUPLICADA']);
    const bloqueantes = conflictos.filter((c) => c.severidad === 'DURO' && !(forzar && superables.has(c.codigo)));
    if (bloqueantes.length) {
      const actualizada = await tx.operacionContingencia.update({
        where: { id: op.id }, data: { estado: conflictos.some((c) => CODIGOS_RECHAZO.has(c.codigo)) ? 'RECHAZADA' : 'REVISION', requiereRevision: true, conflictos: conflictos as any },
      });
      await audit(tx, tenantId, op.usuarioId, 'CONTINGENCIA_REVISION', op.id, { correlativoLocal: op.correlativoLocal, conflictos: conflictos.map((c) => c.codigo) });
      return actualizada;
    }

    // Aplicación: venta COMPLETADA + entrega inmediata + movimiento de caja, todo en la misma transacción.
    const [sec] = await query<{ ultimo_numero: number }>(tx,
      `INSERT INTO secuencias_tenant (id,tenant_id,tipo,ultimo_numero) VALUES (gen_random_uuid(),$1,'VENTA'::"TipoSecuencia",1)
       ON CONFLICT (tenant_id,tipo) DO UPDATE SET ultimo_numero=secuencias_tenant.ultimo_numero+1 RETURNING ultimo_numero`, tenantId);
    const numeroVenta = Number(sec.ultimo_numero);
    const actorFinal = opciones.resueltoPor ?? op.usuarioId;
    const idsLinea = dto.lineas.map(() => nuevoId());
    const venta = await tx.venta.create({
      data: {
        id: op.id, tenantId, numeroVenta, usuarioId: op.usuarioId, cajaId: cajaDestino.id,
        clienteNombre: dto.clienteNombre?.trim() || null, clienteRtn: dto.clienteRtn?.trim() || null,
        solicitudHash: op.payloadHash, subtotal: centavosADecimal(dto.subtotalCentavos), isv: centavosADecimal(dto.isvCentavos),
        descuento: 0, total: centavosADecimal(dto.totalCentavos), metodoPago: 'EFECTIVO', tipoPago: 'CONTADO', estado: 'COMPLETADA',
        reservaPendiente: false, entregadoAt: estimado, entregadoPor: op.usuarioId,
        origen: 'CONTINGENCIA', efectivoRecibido: centavosADecimal(dto.efectivoRecibidoCentavos), cambio: centavosADecimal(dto.cambioCentavos),
        correlativoLocal: op.correlativoLocal, ocurridoAt: estimado, referenciaFacturaExterna: op.referenciaFacturaExterna,
        notas: `Venta de contingencia ${op.correlativoLocal}`,
        detalles: {
          create: dto.lineas.map((l, i) => ({
            id: idsLinea[i], tenantId, modoEntrega: 'MOSTRADOR', cantidadEntregada: l.cantidadCentesimas / 100,
            productoId: l.productoId, cantidad: l.cantidadCentesimas / 100, precioUnitario: centavosADecimal(l.precioCentavos),
            subtotal: centavosADecimal(calculo.lineas[i]), costoUnitario: centavosADecimal(enVentana.get(l.productoId)?.costoCentavos ?? 0), sinInventario: false,
          })),
        },
      },
    });
    // Eventos de cobro y de entrega inmediata (origen OFFLINE). La solicitud del cobro es la propia operación.
    const lineasEvento = dto.lineas.map((l, i) => ({ detalleId: idsLinea[i], cantidadCentesimas: l.cantidadCentesimas }));
    await registrarEvento(tx, { tenantId, solicitud: op.id, huella: huellaDeLineas('COBRO', venta.id, op.usuarioId, 'OFFLINE', lineasEvento, null, null), tipo: 'COBRO', ventaId: venta.id, usuarioId: op.usuarioId, origen: 'OFFLINE', lineas: lineasEvento });
    const eventoEntrega = await registrarEvento(tx, { tenantId, solicitud: nuevoId(), huella: huellaDeLineas('ENTREGA', venta.id, op.usuarioId, 'OFFLINE', lineasEvento, null, null), tipo: 'ENTREGA', ventaId: venta.id, usuarioId: op.usuarioId, origen: 'OFFLINE', lineas: lineasEvento });
    for (const [indice, linea] of dto.lineas.entries()) {
      const p = productos.get(linea.productoId);
      let stock = Number(p.stock_actual);
      const falta = faltantes.find((f) => f.productoId === linea.productoId);
      if (falta) {
        // Decisión explícita de un administrador: se registra el ajuste que cubre la diferencia detectada.
        const ajustado = Math.round((stock + falta.cantidad / 100) * 100) / 100;
        await query(tx, 'UPDATE productos SET stock_actual=$1, updated_at=NOW() WHERE id=$2 RETURNING id', ajustado, p.id);
        await movement(tx, tenantId, actorFinal, p.id, 'AJUSTE', stock, ajustado, venta.id, `Conciliación contingencia ${op.correlativoLocal}: faltante aceptado por administrador`);
        stock = ajustado;
      }
      const nuevo = Math.round((stock - linea.cantidadCentesimas / 100) * 100) / 100;
      await query(tx, 'UPDATE productos SET stock_actual=$1, updated_at=NOW() WHERE id=$2 RETURNING id', nuevo, p.id);
      await movimientoConEvento(tx, { tenantId, usuarioId: op.usuarioId, productoId: p.id, tipo: 'ENTREGA', anterior: Math.round(stock * 100), nuevo: Math.round(nuevo * 100), documentoId: venta.id, motivo: `Venta de contingencia ${op.correlativoLocal} (entrega inmediata)`, eventoId: eventoEntrega, detalleId: idsLinea[indice] });
    }
    await cashMovement(tx, cajaDestino.id, op.usuarioId, 'VENTA_POS', centavosADecimal(dto.totalCentavos), 'EFECTIVO', venta.id, `Venta ${correlativoDefinitivo(numeroVenta)} (${op.correlativoLocal})`);
    await audit(tx, tenantId, op.usuarioId, 'VENTA_CREAR', venta.id, { total: centavosADecimal(dto.totalCentavos), metodo: 'EFECTIVO', cajaId: cajaDestino.id, origen: 'CONTINGENCIA' });
    await audit(tx, tenantId, actorFinal, 'CONTINGENCIA_APLICAR', op.id, {
      correlativoLocal: op.correlativoLocal, correlativoDefinitivo: correlativoDefinitivo(numeroVenta), forzado: forzar, conflictos: conflictos.map((c) => c.codigo),
    });
    return tx.operacionContingencia.update({
      where: { id: op.id },
      data: {
        estado: 'APLICADA', ventaId: venta.id, numeroVenta, aplicadoAt: new Date(), conflictos: conflictos as any,
        requiereRevision: conflictos.length > 0,
      },
    });
  }

  // ───────────────────────── administración ─────────────────────────

  async resolver(tenantId: string, adminId: string, operacionId: string, dto: ResolverOperacionDto) {
    return this.prisma.$transaction(async (tx) => {
      await lockTenant(tx, tenantId);
      await authorizedActor(tx, tenantId, adminId, ['ADMIN']);
      const op = await tx.operacionContingencia.findFirst({ where: { id: { in: [idRecurso(tenantId, operacionId), operacionId] }, tenantId } });
      if (!op) throw new NotFoundException('Operación no encontrada');
      const resolucion = { accion: dto.accion, nota: dto.nota, por: adminId, en: new Date().toISOString() };
      if (dto.referenciaFacturaExterna !== undefined) {
        await tx.operacionContingencia.update({ where: { id: op.id }, data: { referenciaFacturaExterna: dto.referenciaFacturaExterna.trim() || null } });
      }
      if (dto.accion === 'MARCAR_REVISADA') {
        if (op.estado !== 'APLICADA') throw new ConflictException('Solo una venta aplicada puede marcarse como revisada');
        const fila = await tx.operacionContingencia.update({ where: { id: op.id }, data: { requiereRevision: false, resolucion, resueltoPor: adminId, resueltoAt: new Date() } });
        await audit(tx, tenantId, adminId, 'CONTINGENCIA_RESOLVER', op.id, resolucion);
        return this.resumenOperacion(fila);
      }
      if (dto.accion === 'CERRAR_MANUAL') {
        if (op.estado === 'APLICADA' || op.estado === 'RESUELTA_MANUAL') throw new ConflictException('La operación ya está resuelta');
        // R-02: cerrar sin vender no puede ocultar el efectivo cobrado. Se registra un ingreso de conciliación en una caja abierta,
        // con referencia a la operación; no se crea ninguna venta ni se toca el inventario (eso se concilia aparte).
        const conciliacionCaja = await this.conciliarEfectivo(tx, tenantId, adminId, op, dto.cajaId);
        // F-01: la conciliación física queda separada y trazable: se registra qué mercancía salió sin descuento, sin ajustar existencias.
        const inventarioPendiente = (await this.inventarioPendiente(tx as any, tenantId, [op])).get(op.id) ?? [];
        const resolucionConc = { ...resolucion, conciliacionCaja, inventarioPendiente };
        await audit(tx, tenantId, adminId, 'CONTINGENCIA_INVENTARIO_PENDIENTE', op.id, { lineas: inventarioPendiente, nota: dto.nota, existenciasModificadas: false });
        const fila = await tx.operacionContingencia.update({
          where: { id: op.id }, data: { estado: 'RESUELTA_MANUAL', requiereRevision: false, resolucion: resolucionConc, resueltoPor: adminId, resueltoAt: new Date() },
        });
        await audit(tx, tenantId, adminId, 'CONTINGENCIA_RESOLVER', op.id, resolucionConc);
        return { ...this.resumenOperacion(fila), conciliacionCaja, inventarioPendiente };
      }
      if (op.estado === 'APLICADA' || op.estado === 'RESUELTA_MANUAL') throw new ConflictException('La operación ya está resuelta');
      const fila = await this.aplicar(tx, tenantId, op.id, { forzar: dto.accion === 'ACEPTAR', cajaId: dto.cajaId, resueltoPor: adminId });
      const final = await tx.operacionContingencia.update({ where: { id: fila.id }, data: { resolucion, resueltoPor: adminId, resueltoAt: fila.estado === 'APLICADA' ? new Date() : null } });
      await audit(tx, tenantId, adminId, 'CONTINGENCIA_RESOLVER', op.id, { ...resolucion, resultado: final.estado });
      return this.resumenOperacion(final);
    }, { timeout: 30000 });
  }

  /**
   * F-01: mercancía de una operación que NO se aplicó como venta. El efectivo se concilia en caja (R-02); las existencias no se tocan:
   * el administrador debe contar y ajustar el inventario físico como acción aparte. Solo código, nombre y cantidad (sin costos).
   */
  private async inventarioPendiente(db: { producto: { findMany: (a: any) => Promise<any[]> } }, tenantId: string, ops: any[]) {
    const lineasDe = (op: any) => (Array.isArray(op.payload?.lineas) ? (op.payload.lineas as any[]) : []);
    const ids = [...new Set(ops.flatMap((op) => lineasDe(op).map((l) => String(l.productoId))))];
    const productos = ids.length ? await db.producto.findMany({ where: { tenantId, id: { in: ids } }, select: { id: true, codigo: true, nombre: true, unidadMedida: true } }) : [];
    const porId = new Map(productos.map((p: any) => [p.id, p]));
    return new Map(ops.map((op) => [op.id, lineasDe(op).map((l) => {
      const p: any = porId.get(String(l.productoId));
      return { productoId: String(l.productoId), codigo: p?.codigo ?? null, nombre: p?.nombre ?? 'Producto no encontrado', unidadMedida: p?.unidadMedida ?? null, cantidad: Number(l.cantidadCentesimas) / 100 };
    })]));
  }

  /** Ingreso de conciliación por el efectivo que se quedó en caja (total cobrado, sin el cambio). Idempotente por operación. */
  private async conciliarEfectivo(tx: Tx, tenantId: string, adminId: string, op: any, cajaSolicitada?: string) {
    const monto = op.totalCentavos / 100;
    const [previo] = await query<any>(tx as any, `SELECT m.id, m.caja_id FROM movimientos_caja m JOIN cajas c ON c.id=m.caja_id
       WHERE c.tenant_id=$1 AND m.referencia=$2 AND m.tipo='INGRESO_MANUAL' AND m.concepto LIKE 'Conciliación contingencia%'`, tenantId, op.id);
    if (previo) return { movimientoId: previo.id, cajaId: previo.caja_id, monto, reutilizado: true };
    let caja: any;
    if (cajaSolicitada) {
      [caja] = await query<any>(tx as any, `SELECT id FROM cajas WHERE id=$1 AND tenant_id=$2 AND estado='ABIERTA'`, cajaSolicitada, tenantId);
      if (!caja) throw new ConflictException('La caja indicada no existe o está cerrada');
    } else {
      [caja] = await query<any>(tx as any, `SELECT id FROM cajas WHERE tenant_id=$1 AND usuario_id=$2 AND estado='ABIERTA' ORDER BY fecha_apertura DESC LIMIT 1`, tenantId, op.usuarioId);
      if (!caja) [caja] = await query<any>(tx as any, `SELECT id FROM cajas WHERE tenant_id=$1 AND usuario_id=$2 AND estado='ABIERTA' ORDER BY fecha_apertura DESC LIMIT 1`, tenantId, adminId);
    }
    if (!caja) throw new ConflictException('Abra una caja (o indique cajaId) para registrar el efectivo cobrado antes de cerrar la operación sin venta');
    const movimientoId = nuevoId();
    await query(tx, 'INSERT INTO movimientos_caja (id,caja_id,usuario_id,tipo,monto,metodo,referencia,concepto) VALUES ($1,$2,$3,$4::"TipoMovimientoCaja",$5,$6,$7,$8) RETURNING id',
      movimientoId, caja.id, adminId, 'INGRESO_MANUAL', monto, 'EFECTIVO', op.id, `Conciliación contingencia ${op.correlativoLocal}: efectivo cobrado sin venta aplicada`);
    await audit(tx, tenantId, adminId, 'CONTINGENCIA_CONCILIAR_EFECTIVO', op.id, { cajaId: caja.id, monto, movimientoId });
    return { movimientoId, cajaId: caja.id, monto, reutilizado: false };
  }

  async actualizarReferencia(tenantId: string, usuarioId: string, rol: string, operacionId: string, referencia: string) {
    return this.prisma.$transaction(async (tx) => {
      await lockTenant(tx, tenantId);
      const op = await tx.operacionContingencia.findFirst({ where: { id: { in: [idRecurso(tenantId, operacionId), operacionId] }, tenantId } });
      if (!op) throw new NotFoundException('Operación no encontrada');
      // H-5 (CENTINELA F6): para quien no es el dueño la operación no existe; el mismo 404 evita un oráculo de identificadores.
      if (rol !== 'ADMIN' && op.usuarioId !== usuarioId) throw new NotFoundException('Operación no encontrada');
      const valor = referencia.trim() || null;
      const fila = await tx.operacionContingencia.update({ where: { id: op.id }, data: { referenciaFacturaExterna: valor } });
      if (op.ventaId) await tx.venta.update({ where: { id: op.ventaId }, data: { referenciaFacturaExterna: valor } });
      await audit(tx, tenantId, usuarioId, 'CONTINGENCIA_REFERENCIA_FACTURA', op.id, { anterior: op.referenciaFacturaExterna, nueva: valor });
      return this.resumenOperacion(fila);
    });
  }

  async listar(tenantId: string, filtros: { estado?: string; desde?: string; hasta?: string; dispositivoId?: string; soloRevision?: boolean; limit?: number; page?: number }) {
    const where: any = { tenantId };
    if (filtros.estado) where.estado = filtros.estado;
    if (filtros.dispositivoId) where.dispositivoId = filtros.dispositivoId;
    if (filtros.soloRevision) where.requiereRevision = true;
    if (filtros.desde || filtros.hasta) {
      const { inicio, fin } = rangoDiasEnZona(filtros.desde ?? filtros.hasta!, filtros.hasta ?? filtros.desde!);
      where.recibidoAt = { gte: inicio, lt: fin };
    }
    const take = Math.min(200, Math.max(1, filtros.limit ?? 50));
    const filas = await this.prisma.operacionContingencia.findMany({
      where, orderBy: { recibidoAt: 'desc' }, take, skip: Math.max(0, filtros.page ?? 0) * take,
      include: { dispositivo: { select: { codigo: true, nombre: true } } },
    });
    const usuarios = await this.prisma.usuario.findMany({ where: { tenantId, id: { in: [...new Set(filas.map((f) => f.usuarioId))] } }, select: { id: true, nombre: true } });
    const nombres = new Map(usuarios.map((u) => [u.id, u.nombre]));
    // F-01: una operación sin venta (en revisión o cerrada sin venta) con efectivo cobrado deja mercancía pendiente de conciliar físicamente.
    const sinVenta = filas.filter((f) => f.estado === 'REVISION' || f.estado === 'RECHAZADA' || f.estado === 'RESUELTA_MANUAL');
    const pendientes = await this.inventarioPendiente(this.prisma as any, tenantId, sinVenta);
    return filas.map((f) => ({
      ...this.resumenOperacion(f), inventarioPendiente: pendientes.get(f.id) ?? [], cajero: nombres.get(f.usuarioId) ?? null, cajeroId: f.usuarioId, dispositivo: f.dispositivo.codigo,
      totalCentavos: f.totalCentavos, efectivoRecibidoCentavos: f.efectivoRecibidoCentavos,
      cambioCentavos: f.efectivoRecibidoCentavos - f.totalCentavos,
      ocurridoAt: f.ocurridoAtEstimado, recibidoAt: f.recibidoAt, resolucion: f.resolucion,
    }));
  }

  /** Resumen para el panel móvil. Todo proviene de lo recibido por el servidor: puede estar desactualizado si la caja está sin conexión. */
  async resumen(tenantId: string, fecha?: string) {
    const dia = fecha ?? diaCalendario(new Date(), ZONA_HORARIA_NEGOCIO);
    const { inicio, fin } = rangoDiasEnZona(dia, dia);
    const ahora = new Date();
    const [ventas, estados, dispositivos] = await Promise.all([
      query<any>(this.prisma as any,
        `SELECT origen, COUNT(*)::int AS cantidad, COALESCE(SUM(total),0) AS total FROM ventas
          WHERE tenant_id=$1 AND estado='COMPLETADA' AND created_at>=($2::timestamptz AT TIME ZONE 'UTC') AND created_at<($3::timestamptz AT TIME ZONE 'UTC') GROUP BY origen`,
        tenantId, inicio.toISOString(), fin.toISOString()),
      query<any>(this.prisma as any,
        `SELECT estado, requiere_revision, COUNT(*)::int AS cantidad, COALESCE(SUM(total_centavos),0)::bigint AS total_centavos, COALESCE(SUM(efectivo_recibido_centavos),0)::bigint AS efectivo_centavos
           FROM operaciones_contingencia WHERE tenant_id=$1 GROUP BY estado, requiere_revision`, tenantId),
      this.listarDispositivos(tenantId),
    ]);
    const suma = (filtro: (e: any) => boolean) => estados.filter(filtro).reduce((a, e) => ({ cantidad: a.cantidad + e.cantidad, totalCentavos: a.totalCentavos + Number(e.total_centavos) }), { cantidad: 0, totalCentavos: 0 });
    const pendientesEnCajas = dispositivos.reduce((a, d) => a + (d.pendientesReportados ?? 0), 0);
    return {
      fecha: dia, generadoAt: ahora.toISOString(),
      ventasDelDia: ventas.map((v) => ({ origen: v.origen, cantidad: v.cantidad, total: Number(v.total) })),
      contingencia: {
        sincronizadas: suma((e) => e.estado === 'APLICADA' && !e.requiere_revision),
        sincronizadasConRevision: suma((e) => e.estado === 'APLICADA' && e.requiere_revision),
        conflictos: suma((e) => e.estado === 'REVISION' || e.estado === 'RECHAZADA' || e.estado === 'RECIBIDA'),
        resueltasManual: suma((e) => e.estado === 'RESUELTA_MANUAL'),
        pendientesReportadosPorCajas: pendientesEnCajas,
      },
      dispositivos,
      aviso: dispositivos.some((d) => d.desactualizado)
        ? 'Una caja no ha reportado recientemente: las cifras de contingencia pueden estar desactualizadas.'
        : null,
    };
  }
}
