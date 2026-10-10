import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { audit, authorizedActor, cashMovement, lockTenant, movement, query, Tx, fingerprint } from '../operaciones/ledger';
import { calcularTotales, centavosADecimal } from '../common/dinero';
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

@Injectable()
export class ContingenciaService {
  private readonly logger = new Logger(ContingenciaService.name);
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
      const existente = await tx.dispositivoPos.findUnique({ where: { id: dto.dispositivoId } });
      if (existente) {
        if (existente.tenantId !== tenantId) throw new ConflictException('Identificador de dispositivo no disponible');
        if (!existente.activo) throw new ForbiddenException('Este dispositivo fue desactivado por un administrador');
        return this.dispositivoPublico(existente);
      }
      const activos = await tx.dispositivoPos.count({ where: { tenantId, activo: true } });
      if (activos >= config.dispositivosMax) {
        throw new ConflictException('Ya hay una caja de contingencia registrada. Un administrador debe desactivarla antes de registrar otra');
      }
      const [{ siguiente }] = await query<{ siguiente: number }>(tx,
        `SELECT COALESCE(MAX(codigo::int), 0) + 1 AS siguiente FROM dispositivos_pos WHERE tenant_id=$1`, tenantId);
      const dispositivo = await tx.dispositivoPos.create({
        data: { id: dto.dispositivoId, tenantId, codigo: pad(Number(siguiente), 2), nombre: dto.nombre.trim(), registradoPor: usuarioId, ultimoContactoAt: new Date() },
      });
      await audit(tx, tenantId, usuarioId, 'CONTINGENCIA_DISPOSITIVO_REGISTRAR', dispositivo.id, { codigo: dispositivo.codigo, nombre: dispositivo.nombre });
      return this.dispositivoPublico(dispositivo);
    });
  }

  private dispositivoPublico(d: any) {
    return {
      id: d.id, codigo: d.codigo, nombre: d.nombre, activo: d.activo, registradoAt: d.registradoAt,
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
    const dispositivo = await this.prisma.dispositivoPos.findFirst({ where: { id: dispositivoId, tenantId } });
    if (!dispositivo) throw new NotFoundException('Dispositivo no registrado');
    if (!dispositivo.activo) throw new ForbiddenException('Este dispositivo fue desactivado por un administrador');
    await this.prisma.dispositivoPos.update({ where: { id: dispositivoId }, data: { ultimoContactoAt: new Date(), pendientesReportados: Math.max(0, Math.floor(pendientes)) } });
    return { ok: true, serverNow: new Date().toISOString() };
  }

  async desactivarDispositivo(tenantId: string, usuarioId: string, dispositivoId: string, motivo: string) {
    return this.prisma.$transaction(async (tx) => {
      await lockTenant(tx, tenantId);
      await authorizedActor(tx, tenantId, usuarioId, ['ADMIN']);
      const d = await tx.dispositivoPos.findFirst({ where: { id: dispositivoId, tenantId } });
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
      where: { tenantId, activo: true },
      select: { id: true, codigo: true, codigoBarras: true, nombre: true, precioVenta: true, stockActual: true, stockReservado: true, usaMedida: true, unidadMedida: true },
      orderBy: { id: 'asc' },
    });
    const margen = config.margenUnidades * 100;
    return productos.map((p: any) => {
      const libre = Math.max(0, Math.round((Number(p.stockActual) - Number(p.stockReservado)) * 100));
      const base = Math.min(libre - margen, Math.floor((libre * config.cupoPorcentaje) / 100));
      const cupo = Math.max(0, p.usaMedida ? base : Math.floor(base / 100) * 100);
      return {
        id: p.id, codigo: p.codigo, codigoBarras: p.codigoBarras ?? null, nombre: p.nombre,
        precioCentavos: Math.round(Number(p.precioVenta) * 100), libreCentesimas: libre, cupoCentesimas: cupo,
        usaMedida: Boolean(p.usaMedida), unidadMedida: String(p.unidadMedida ?? 'UNIDAD'),
      };
    });
  }

  async emitirVentana(tenantId: string, usuarioId: string, dto: SolicitarVentanaDto) {
    const config = await this.exigirHabilitada(tenantId);
    const ahora = new Date();
    const resultado = await this.prisma.$transaction(async (tx) => {
      await lockTenant(tx, tenantId);
      await authorizedActor(tx, tenantId, usuarioId, ['ADMIN', 'CAJERO'], 'pos.vender');
      const dispositivo = await tx.dispositivoPos.findFirst({ where: { id: dto.dispositivoId, tenantId } });
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
      await tx.dispositivoPos.update({ where: { id: dispositivo.id }, data: { ultimoContactoAt: ahora } });
      const [{ maxima }] = await query<{ maxima: number }>(tx,
        `SELECT COALESCE(MAX(secuencia_local), 0) AS maxima FROM operaciones_contingencia WHERE tenant_id=$1 AND dispositivo_id=$2`, tenantId, dispositivo.id);
      await audit(tx, tenantId, usuarioId, 'CONTINGENCIA_VENTANA_EMITIR', ventana.id, { dispositivo: dispositivo.codigo, cajaId: caja.id, vigenteHasta: ventana.vigenteHasta, catalogoHash: hash });
      return { ventana, dispositivo, productos, hash, maxima: Number(maxima) };
    });
    const { ventana, dispositivo, productos, hash, maxima } = resultado;
    return {
      ventana: {
        id: ventana.id, dispositivoId: dispositivo.id, dispositivoCodigo: dispositivo.codigo, cajaId: ventana.cajaId, usuarioId,
        emitidaAt: ventana.emitidaAt, vigenteHasta: ventana.vigenteHasta, catalogoHash: hash, limites: ventana.limites,
        secuenciaServidor: maxima, serverNow: ahora.toISOString(),
      },
      catalogo: dto.catalogoHashActual === hash ? null : { hash, generadoAt: ahora.toISOString(), productos },
    };
  }

  // ───────────────────────── recepción de operaciones ─────────────────────────

  async recibirLote(tenantId: string, usuarioId: string, rol: string, dto: LoteOperacionesDto) {
    await this.exigirHabilitada(tenantId);
    const dispositivo = await this.prisma.dispositivoPos.findFirst({ where: { id: dto.dispositivoId, tenantId } });
    if (!dispositivo) throw new NotFoundException('Dispositivo no registrado');
    const resultados: any[] = [];
    for (const op of dto.operaciones) {
      try {
        resultados.push(await this.procesarOperacion(tenantId, usuarioId, rol, dispositivo.id, op));
      } catch (error: any) {
        // Error técnico (BD, bloqueo, tiempo): la operación (si llegó a registrarse) sigue en el diario; el cliente reintenta con el mismo UUID.
        this.logger.error(`Operación ${op.operacionId}: ${error?.message}`);
        const status = error?.status ?? 500;
        resultados.push({ operacionId: op.operacionId, estado: status >= 500 ? 'ERROR_TEMPORAL' : 'RECHAZADA_TECNICA', codigo: error?.response?.code ?? null, mensaje: error?.message ?? 'Error' });
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
    const filas = await this.prisma.operacionContingencia.findMany({
      where: { tenantId, id: { in: ids }, ...(rol === 'ADMIN' ? {} : { usuarioId }) },
    });
    const porId = new Map(filas.map((f) => [f.id, f]));
    return ids.map((id) => {
      const f = porId.get(id);
      return f ? this.resumenOperacion(f) : { operacionId: id, estado: 'NO_REGISTRADA' };
    });
  }

  private resumenOperacion(f: any) {
    return {
      operacionId: f.id, estado: f.estado, requiereRevision: f.requiereRevision, conflictos: f.conflictos,
      correlativoLocal: f.correlativoLocal, ventaId: f.ventaId, numeroVenta: f.numeroVenta,
      correlativoDefinitivo: f.numeroVenta ? correlativoDefinitivo(f.numeroVenta) : null,
      aplicadoAt: f.aplicadoAt, referenciaFacturaExterna: f.referenciaFacturaExterna,
    };
  }

  private async procesarOperacion(tenantId: string, usuarioId: string, rol: string, dispositivoId: string, dto: OperacionContingenciaDto) {
    if (dto.dispositivoId !== dispositivoId) throw new BadRequestException('La operación pertenece a otro dispositivo');
    if (rol !== 'ADMIN' && dto.cajeroId !== usuarioId) {
      throw new ForbiddenException('Solo el cajero de la operación o un administrador puede enviarla');
    }
    const hash = fingerprint(canonico({ ...dto }));
    const ventana = await this.prisma.contingenciaVentana.findFirst({ where: { id: dto.ventanaId, tenantId, dispositivoId } });
    if (!ventana) throw new BadRequestException({ message: 'Ventana de contingencia desconocida', code: 'VENTANA_DESCONOCIDA' });

    // 1) Diario primero: idempotencia real por UUID (PK) y por (dispositivo, secuencia).
    const existente = await this.prisma.operacionContingencia.findUnique({ where: { id: dto.operacionId } });
    if (existente) {
      if (existente.tenantId !== tenantId) throw new ConflictException('Identificador de operación no disponible');
      if (existente.payloadHash !== hash) return this.registrarAlteracion(tenantId, usuarioId, existente, dto, hash);
      if (existente.estado === 'RECIBIDA') return this.aplicarYResumir(tenantId, existente.id, {});
      return this.resumenOperacion(existente);
    }
    const estimado = this.estimarHora(dto.ocurridoAtLocal, ventana.limites as any);
    try {
      await this.prisma.operacionContingencia.create({
        data: {
          id: dto.operacionId, tenantId, dispositivoId, ventanaId: ventana.id, usuarioId: dto.cajeroId, cajaId: ventana.cajaId,
          secuenciaLocal: dto.secuenciaLocal, correlativoLocal: dto.correlativoLocal, ocurridoAtLocal: new Date(dto.ocurridoAtLocal),
          ocurridoAtEstimado: estimado, payload: dto as any, payloadHash: hash, totalCentavos: dto.totalCentavos,
          efectivoRecibidoCentavos: dto.efectivoRecibidoCentavos, referenciaFacturaExterna: dto.referenciaFacturaExterna?.trim() || null,
        },
      });
    } catch (error: any) {
      if (error?.code !== 'P2002') throw error;
      // Carrera: otra petición con el mismo UUID ya lo registró.
      const ya = await this.prisma.operacionContingencia.findUnique({ where: { id: dto.operacionId } });
      if (!ya || ya.tenantId !== tenantId) throw error;
      if (ya.payloadHash !== hash) return this.registrarAlteracion(tenantId, usuarioId, ya, dto, hash);
      return ya.estado === 'RECIBIDA' ? this.aplicarYResumir(tenantId, ya.id, {}) : this.resumenOperacion(ya);
    }
    // 2) Aplicación en transacción aparte.
    return this.aplicarYResumir(tenantId, dto.operacionId, {});
  }

  private estimarHora(local: string, limites: { offsetRelojMs?: number | null }) {
    const base = new Date(local).getTime();
    return new Date(base + (typeof limites?.offsetRelojMs === 'number' ? limites.offsetRelojMs : 0));
  }

  private async registrarAlteracion(tenantId: string, usuarioId: string, existente: any, dto: OperacionContingenciaDto, hash: string) {
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

  private async aplicarYResumir(tenantId: string, operacionId: string, opciones: OpcionesAplicar) {
    const fila = await this.prisma.$transaction((tx) => this.aplicar(tx, tenantId, operacionId, opciones), { timeout: 30000 });
    return this.resumenOperacion(fila);
  }

  // ───────────────────────── aplicación / conciliación ─────────────────────────

  private async aplicar(tx: Tx, tenantId: string, operacionId: string, opciones: OpcionesAplicar) {
    await lockTenant(tx, tenantId);
    await query(tx, 'SELECT 1 FROM pg_advisory_xact_lock(hashtextextended($1, 0))', `VENTA:${operacionId}`);
    const [bloqueada] = await query(tx, 'SELECT id FROM operaciones_contingencia WHERE id=$1 AND tenant_id=$2 FOR UPDATE', operacionId, tenantId);
    if (!bloqueada) throw new NotFoundException('Operación no encontrada');
    const op = await tx.operacionContingencia.findUniqueOrThrow({ where: { id: operacionId } });
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
    if (duplicados.length) conflictos.push({ codigo: 'SECUENCIA_DUPLICADA', severidad: 'DURO', detalle: { otras: duplicados.map((d) => d.id) } });

    // Caja: nunca se altera un cierre histórico.
    let cajaDestino: any = null;
    const [cajaOriginal] = await query(tx, 'SELECT * FROM cajas WHERE id=$1 AND tenant_id=$2 FOR UPDATE', op.cajaId, tenantId);
    if (cajaOriginal?.estado === 'ABIERTA') cajaDestino = cajaOriginal;
    else if (opciones.cajaId) {
      const [alterna] = await query(tx, `SELECT * FROM cajas WHERE id=$1 AND tenant_id=$2 AND estado='ABIERTA' FOR UPDATE`, opciones.cajaId, tenantId);
      if (!alterna) throw new BadRequestException('La caja indicada no está abierta');
      cajaDestino = alterna;
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
      const snap = enVentana.get(linea.productoId);
      if (!snap) conflictos.push({ codigo: 'PRODUCTO_FUERA_DE_VENTANA', severidad: 'BLANDO', detalle: { productoId: p.id, codigo: p.codigo } });
      else {
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
    const superables = new Set(['USUARIO_NO_AUTORIZADO', 'CAJA_CERRADA', 'STOCK_INSUFICIENTE', 'TOTAL_DIFERENTE', 'SECUENCIA_DUPLICADA']);
    const bloqueantes = conflictos.filter((c) => c.severidad === 'DURO' && !(forzar && superables.has(c.codigo)));
    if (bloqueantes.length) {
      const actualizada = await tx.operacionContingencia.update({
        where: { id: op.id }, data: { estado: 'REVISION', requiereRevision: true, conflictos: conflictos as any },
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
            productoId: l.productoId, cantidad: l.cantidadCentesimas / 100, precioUnitario: centavosADecimal(l.precioCentavos),
            subtotal: centavosADecimal(calculo.lineas[i]), costoUnitario: Number(productos.get(l.productoId).precio_costo ?? 0), sinInventario: false,
          })),
        },
      },
    });
    for (const linea of dto.lineas) {
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
      await movement(tx, tenantId, op.usuarioId, p.id, 'ENTREGA', stock, nuevo, venta.id, `Venta de contingencia ${op.correlativoLocal} (entrega inmediata)`);
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
      const op = await tx.operacionContingencia.findFirst({ where: { id: operacionId, tenantId } });
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
        const fila = await tx.operacionContingencia.update({
          where: { id: op.id }, data: { estado: 'RESUELTA_MANUAL', requiereRevision: false, resolucion, resueltoPor: adminId, resueltoAt: new Date() },
        });
        await audit(tx, tenantId, adminId, 'CONTINGENCIA_RESOLVER', op.id, resolucion);
        return this.resumenOperacion(fila);
      }
      if (op.estado === 'APLICADA' || op.estado === 'RESUELTA_MANUAL') throw new ConflictException('La operación ya está resuelta');
      const fila = await this.aplicar(tx, tenantId, op.id, { forzar: dto.accion === 'ACEPTAR', cajaId: dto.cajaId, resueltoPor: adminId });
      const final = await tx.operacionContingencia.update({ where: { id: fila.id }, data: { resolucion, resueltoPor: adminId, resueltoAt: fila.estado === 'APLICADA' ? new Date() : null } });
      await audit(tx, tenantId, adminId, 'CONTINGENCIA_RESOLVER', op.id, { ...resolucion, resultado: final.estado });
      return this.resumenOperacion(final);
    }, { timeout: 30000 });
  }

  async actualizarReferencia(tenantId: string, usuarioId: string, rol: string, operacionId: string, referencia: string) {
    return this.prisma.$transaction(async (tx) => {
      await lockTenant(tx, tenantId);
      const op = await tx.operacionContingencia.findFirst({ where: { id: operacionId, tenantId } });
      if (!op) throw new NotFoundException('Operación no encontrada');
      if (rol !== 'ADMIN' && op.usuarioId !== usuarioId) throw new ForbiddenException('No puede modificar esta operación');
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
    return filas.map((f) => ({
      ...this.resumenOperacion(f), cajero: nombres.get(f.usuarioId) ?? null, cajeroId: f.usuarioId, dispositivo: f.dispositivo.codigo,
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
        conflictos: suma((e) => e.estado === 'REVISION' || e.estado === 'RECIBIDA'),
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
