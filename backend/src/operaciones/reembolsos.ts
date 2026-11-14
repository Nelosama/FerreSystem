import { BadRequestException, Body, ConflictException, Controller, Get, Injectable, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../prisma/prisma.service';
import { actor, audit, authorizedActor, cashMovement, id, lockTenant, money, query, type Tx } from './ledger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/tenant-id.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequiredModule } from '../common/decorators/required-module.decorator';

/**
 * Reembolsos de devoluciones con estado (decisión del dueño del 2026-11-12).
 *
 * - Efectivo: sale de la caja al registrar la devolución y queda COMPLETADO.
 * - Tarjeta: se intenta el reverso en el POS bancario. Queda PENDIENTE, sin movimiento de caja, hasta registrar la
 *   referencia del reverso. Si no se puede revertir, el ADMIN decide esperar o reembolsar en efectivo o por transferencia.
 * - Transferencia: PENDIENTE hasta registrar la referencia.
 * Registrar en Jowa no significa que el banco ya movió el dinero: por eso el estado. Un reembolso sustituido no se borra.
 * No genera documento fiscal ni asiento contable nuevo: eso está pendiente de validar con el contador.
 */
export type MetodoReembolso = 'EFECTIVO' | 'TARJETA' | 'TRANSFERENCIA';

/** Texto opcional recortado; vacío o ausente → null. Rechaza con 400 un valor de otro tipo o demasiado largo. */
export function textoOpcional(valor: unknown, maximo = 500): string | null {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== 'string') throw new BadRequestException('Texto no válido');
  const limpio = valor.trim();
  if (limpio.length > maximo) throw new BadRequestException(`El texto admite hasta ${maximo} caracteres`);
  return limpio || null;
}

export async function registrarReembolso(tx: Tx, p: {
  tenantId: string; devolucionId: string; metodo: MetodoReembolso; monto: number; usuarioId: string; cajaId: string | null;
  completado: boolean; reemplazaAId?: string | null; nota?: string | null; referencia?: string | null; evidencia?: string | null;
}) {
  const [fila] = await query(tx, `INSERT INTO reembolsos (id, tenant_id, devolucion_id, metodo, estado, monto, caja_id, reemplaza_a_id, registrado_por,
      completado_por, completado_at, nota, referencia, evidencia)
    VALUES ($1, $2, $3, $4::"MetodoReembolso", $5::"EstadoReembolso", $6, $7, $8, $9, $10, CASE WHEN $10::text IS NULL THEN NULL ELSE now() END, $11, $12, $13)
    RETURNING *`, id(), p.tenantId, p.devolucionId, p.metodo, p.completado ? 'COMPLETADO' : 'PENDIENTE', p.monto, p.cajaId,
    p.reemplazaAId ?? null, p.usuarioId, p.completado ? p.usuarioId : null, p.nota ?? null, p.referencia ?? null, p.evidencia ?? null);
  await audit(tx, p.tenantId, p.usuarioId, 'REEMBOLSO_REGISTRAR', fila.id, {
    devolucionId: p.devolucionId, metodo: p.metodo, estado: fila.estado, monto: p.monto, reemplazaAId: p.reemplazaAId ?? null,
  });
  return fila;
}

async function efectivoDisponible(tx: Tx, caja: any) {
  const [cash] = await query(tx, "SELECT COALESCE(SUM(monto),0) AS monto FROM movimientos_caja WHERE caja_id=$1 AND metodo='EFECTIVO'", caja.id);
  return money(Number(caja.monto_apertura) + Number(cash.monto));
}

async function cajaAbierta(tx: Tx, tenantId: string, usuarioId: string) {
  const [caja] = await query(tx, "SELECT * FROM cajas WHERE tenant_id=$1 AND usuario_id=$2 AND estado='ABIERTA' FOR UPDATE", tenantId, usuarioId);
  return caja ?? null;
}

export class CompletarReembolsoDto {
  @IsString() @MaxLength(100) referencia!: string;
  @IsOptional() @IsString() @MaxLength(500) evidencia?: string;
  @IsOptional() @IsString() @MaxLength(500) nota?: string;
}

export const DECISIONES_SIN_REVERSO = ['ESPERAR', 'EFECTIVO', 'TRANSFERENCIA'] as const;
export class SinReversoDto {
  @IsIn([...DECISIONES_SIN_REVERSO]) decision!: (typeof DECISIONES_SIN_REVERSO)[number];
  @IsOptional() @IsString() @MaxLength(500) motivo?: string;
}

export class ListarReembolsosDto {
  @IsOptional() @IsIn(['PENDIENTE', 'COMPLETADO', 'SUSTITUIDO']) estado?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page?: number;
}

const POR_PAGINA = 50;
const SELECT = `SELECT r.id, r.devolucion_id, r.metodo::text AS metodo, r.estado::text AS estado, r.monto, r.referencia, r.evidencia, r.nota,
  r.intentos_fallidos, r.caja_id, r.reemplaza_a_id, r.registrado_por, ur.nombre AS registrado_por_nombre, r.registrado_at,
  r.completado_por, uc.nombre AS completado_por_nombre, r.completado_at, r.actualizado_at,
  d.venta_id, v.numero_venta, v.metodo_pago AS metodo_venta, d.monto AS monto_devolucion, d.usuario_id AS devolucion_usuario_id, d.created_at AS devolucion_at
  FROM reembolsos r
  JOIN devoluciones d ON d.id = r.devolucion_id AND d.tenant_id = r.tenant_id
  JOIN ventas v ON v.id = d.venta_id AND v.tenant_id = r.tenant_id
  LEFT JOIN usuarios ur ON ur.id = r.registrado_por AND ur.tenant_id = r.tenant_id
  LEFT JOIN usuarios uc ON uc.id = r.completado_por AND uc.tenant_id = r.tenant_id`;

@Injectable()
export class ReembolsosService {
  constructor(private readonly prisma: PrismaService) {}

  /** ADMIN ve todos los de su empresa; los demás, los que registraron o los de devoluciones que ejecutaron. */
  async listar(tenantId: string, usuarioId: string, estado?: string, page = 1) {
    const usuario = await actor(this.prisma as unknown as Tx, tenantId, usuarioId);
    const pagina = Number.isInteger(page) && page > 0 ? page : 1;
    const propios = usuario.rol === 'ADMIN' ? null : usuarioId;
    const filas = await query(this.prisma as unknown as Tx, `${SELECT}
      WHERE r.tenant_id = $1 AND ($2::text IS NULL OR r.estado::text = $2) AND ($3::text IS NULL OR r.registrado_por = $3 OR d.usuario_id = $3)
      ORDER BY (r.estado = 'PENDIENTE') DESC, r.registrado_at DESC, r.id DESC LIMIT ${POR_PAGINA + 1} OFFSET $4`,
      tenantId, estado ?? null, propios, (pagina - 1) * POR_PAGINA);
    return { reembolsos: filas.slice(0, POR_PAGINA), page: pagina, hayMas: filas.length > POR_PAGINA };
  }

  /**
   * Registra que el reverso de tarjeta o la transferencia ya se hizo, con su referencia bancaria (obligatoria) y evidencia
   * opcional. Lo registra el ADMIN o quien ejecutó la devolución. El movimiento informativo de caja (tarjeta o
   * transferencia no cambian el efectivo esperado) se anota en la caja abierta de quien lo registra, si la tiene. `caja_id`
   * guarda exactamente esa caja, o NULL si no hubo movimiento: nunca la de otra sesión (revisión de #247).
   */
  async completar(tenantId: string, usuarioId: string, reembolsoId: string, dto: CompletarReembolsoDto) {
    const referencia = textoOpcional(dto.referencia, 100);
    if (!referencia) throw new BadRequestException('Registre la referencia del reverso o de la transferencia');
    const evidencia = textoOpcional(dto.evidencia), nota = textoOpcional(dto.nota);
    return this.prisma.$transaction(async (tx) => {
      await lockTenant(tx, tenantId);
      const usuario = await authorizedActor(tx, tenantId, usuarioId, ['ADMIN', 'CAJERO', 'VENDEDOR']);
      const r = await this.bloquear(tx, tenantId, reembolsoId);
      if (usuario.rol !== 'ADMIN' && r.registrado_por !== usuarioId && r.devolucion_usuario_id !== usuarioId) throw new NotFoundException('Reembolso no encontrado');
      if (r.estado !== 'PENDIENTE') throw new ConflictException(`El reembolso ya está ${r.estado === 'COMPLETADO' ? 'completado' : 'sustituido por otro'}`);
      if (r.metodo === 'EFECTIVO') throw new ConflictException('Un reembolso en efectivo se completa al registrarse');
      const caja = await cajaAbierta(tx, tenantId, usuarioId);
      if (caja) await cashMovement(tx, caja.id, usuarioId, 'DEVOLUCION', -Number(r.monto), r.metodo, r.devolucion_id, `Reembolso ${r.metodo === 'TARJETA' ? 'por reverso de tarjeta' : 'por transferencia'} · venta ${r.numero_venta}`);
      await query(tx, `UPDATE reembolsos SET estado='COMPLETADO', referencia=$3, evidencia=COALESCE($4, evidencia), nota=COALESCE($5, nota),
        completado_por=$6, completado_at=now(), actualizado_at=now(), caja_id=$7
        WHERE id=$1 AND tenant_id=$2 AND estado='PENDIENTE' RETURNING id`, r.id, tenantId, referencia, evidencia, nota, usuarioId, caja?.id ?? null);
      await audit(tx, tenantId, usuarioId, 'REEMBOLSO_COMPLETAR', r.id, { metodo: r.metodo, monto: Number(r.monto), referencia, evidencia, cajaId: caja?.id ?? null, devolucionId: r.devolucion_id });
      return this.fila(tx, tenantId, r.id);
    }, { timeout: 60000 });
  }

  /**
   * El reverso de tarjeta no se pudo hacer: solo el ADMIN decide. ESPERAR deja el reembolso pendiente y anota el intento;
   * EFECTIVO lo sustituye por uno en efectivo que sale de la caja del ADMIN; TRANSFERENCIA lo sustituye por uno pendiente
   * hasta registrar la referencia. El original queda SUSTITUIDO, sin borrarse.
   */
  async sinReverso(tenantId: string, usuarioId: string, reembolsoId: string, dto: SinReversoDto) {
    const motivo = textoOpcional(dto.motivo);
    if (!(DECISIONES_SIN_REVERSO as readonly string[]).includes(dto.decision)) throw new BadRequestException('Decisión no válida');
    return this.prisma.$transaction(async (tx) => {
      await lockTenant(tx, tenantId);
      // Rol releído de la base en esta transacción: un token antiguo de quien dejó de ser ADMIN no decide.
      await authorizedActor(tx, tenantId, usuarioId, ['ADMIN']);
      const r = await this.bloquear(tx, tenantId, reembolsoId);
      if (r.estado !== 'PENDIENTE') throw new ConflictException(`El reembolso ya está ${r.estado === 'COMPLETADO' ? 'completado' : 'sustituido por otro'}`);
      if (r.metodo !== 'TARJETA') throw new ConflictException('Solo un reverso de tarjeta pendiente admite esta decisión');
      const anotacion = `Reverso de tarjeta no realizado${motivo ? `: ${motivo}` : ''}`;
      if (dto.decision === 'ESPERAR') {
        await query(tx, `UPDATE reembolsos SET intentos_fallidos = intentos_fallidos + 1, actualizado_at = now(),
          nota = CASE WHEN nota IS NULL OR nota = '' THEN $3 ELSE nota || ' | ' || $3 END
          WHERE id=$1 AND tenant_id=$2 AND estado='PENDIENTE' RETURNING id`, r.id, tenantId, `${anotacion}. Se espera.`);
        await audit(tx, tenantId, usuarioId, 'REEMBOLSO_ESPERAR', r.id, { motivo, devolucionId: r.devolucion_id });
        return this.fila(tx, tenantId, r.id);
      }
      let caja: any = null;
      if (dto.decision === 'EFECTIVO') {
        caja = await cajaAbierta(tx, tenantId, usuarioId);
        if (!caja) throw new ConflictException('Abra su caja para reembolsar en efectivo');
        if (Number(r.monto) > await efectivoDisponible(tx, caja)) throw new ConflictException('Efectivo insuficiente para reembolsar');
      }
      await query(tx, `UPDATE reembolsos SET estado='SUSTITUIDO', actualizado_at=now(),
        nota = CASE WHEN nota IS NULL OR nota = '' THEN $3 ELSE nota || ' | ' || $3 END
        WHERE id=$1 AND tenant_id=$2 AND estado='PENDIENTE' RETURNING id`, r.id, tenantId, `${anotacion}. Sustituido por ${dto.decision === 'EFECTIVO' ? 'efectivo' : 'transferencia'}.`);
      await audit(tx, tenantId, usuarioId, 'REEMBOLSO_SUSTITUIR', r.id, { decision: dto.decision, motivo, devolucionId: r.devolucion_id });
      if (caja) await cashMovement(tx, caja.id, usuarioId, 'DEVOLUCION', -Number(r.monto), 'EFECTIVO', r.devolucion_id, `Reembolso en efectivo (tarjeta no revertida) · venta ${r.numero_venta}`);
      const nuevo = await registrarReembolso(tx, {
        tenantId, devolucionId: r.devolucion_id, metodo: dto.decision, monto: Number(r.monto), usuarioId, cajaId: caja?.id ?? null,
        completado: dto.decision === 'EFECTIVO', reemplazaAId: r.id, nota: motivo,
      });
      return this.fila(tx, tenantId, nuevo.id);
    }, { timeout: 60000 });
  }

  private async bloquear(tx: Tx, tenantId: string, reembolsoId: string) {
    const [bloqueado] = await query(tx, 'SELECT id FROM reembolsos WHERE id=$1 AND tenant_id=$2 FOR UPDATE', reembolsoId, tenantId);
    if (!bloqueado) throw new NotFoundException('Reembolso no encontrado');
    return this.fila(tx, tenantId, reembolsoId);
  }

  private async fila(tx: Tx, tenantId: string, reembolsoId: string) {
    const [fila] = await query(tx, `${SELECT} WHERE r.id=$1 AND r.tenant_id=$2`, reembolsoId, tenantId);
    if (!fila) throw new NotFoundException('Reembolso no encontrado');
    return fila;
  }
}

@Controller('operaciones/reembolsos')
@RequiredModule('pos')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles('ADMIN', 'CAJERO', 'VENDEDOR')
export class ReembolsosController {
  constructor(private readonly service: ReembolsosService) {}

  @Get()
  listar(@TenantId() t: string, @CurrentUser('sub') u: string, @Query() filtro: ListarReembolsosDto) {
    return this.service.listar(t, u, filtro.estado, filtro.page);
  }

  @Post(':id/completar')
  completar(@TenantId() t: string, @CurrentUser('sub') u: string, @Param('id') id: string, @Body() dto: CompletarReembolsoDto) {
    return this.service.completar(t, u, id, dto);
  }

  @Post(':id/sin-reverso')
  @Roles('ADMIN')
  sinReverso(@TenantId() t: string, @CurrentUser('sub') u: string, @Param('id') id: string, @Body() dto: SinReversoDto) {
    return this.service.sinReverso(t, u, id, dto);
  }
}

