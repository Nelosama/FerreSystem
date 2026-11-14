import { ConflictException } from '@nestjs/common';
import { audit, fingerprint, id, money, query, type Tx } from './ledger';

/**
 * Etapa 3 — caja (decisión del dueño del 2026-11-12).
 *
 * - Cada persona tiene su caja. ADMIN configura si el cajero abre y cierra solo o necesita autorización.
 * - Cierre ciego: el cajero registra el conteo y después ve si cuadra o cuánto falta/sobra; puede volver a contar.
 * - Si la diferencia persiste: con cierre autónomo cierra con motivo; si no, solicita autorización del ADMIN.
 * - Saldo trasladable a la siguiente apertura de la misma persona.
 * - Un cierre con diferencia ≥ umbral queda como aviso para los ADMIN hasta que uno lo revise.
 * Sin umbrales fijos de cierre ni alertas por horas abierta (fuera de alcance por decisión del dueño).
 */
export interface ConfigCaja { aperturaAutonoma: boolean; cierreAutonomo: boolean; umbralAvisoDiferencia: number }

export const CONFIG_CAJA_POR_DEFECTO: ConfigCaja = { aperturaAutonoma: true, cierreAutonomo: true, umbralAvisoDiferencia: 0 };

export async function configuracionCaja(tx: Tx, tenantId: string): Promise<ConfigCaja> {
  const [fila] = await query(tx, 'SELECT apertura_autonoma, cierre_autonomo, umbral_aviso_diferencia FROM configuracion_caja WHERE tenant_id=$1', tenantId);
  if (!fila) return { ...CONFIG_CAJA_POR_DEFECTO };
  return { aperturaAutonoma: fila.apertura_autonoma, cierreAutonomo: fila.cierre_autonomo, umbralAvisoDiferencia: Number(fila.umbral_aviso_diferencia) };
}

export type ResultadoConteo = 'CUADRA' | 'FALTA' | 'SOBRA';
export const resultadoDe = (diferencia: number): ResultadoConteo => (diferencia === 0 ? 'CUADRA' : diferencia < 0 ? 'FALTA' : 'SOBRA');

/** Lo que el cajero ve de su conteo: si cuadra, falta o sobra y cuánto. El esperado no se devuelve (cierre ciego). */
export const vistaConteo = (c: any, numero: number) => {
  const diferencia = Number(c.diferencia);
  return { conteoId: c.id, numero, monto: Number(c.monto), diferencia, resultado: resultadoDe(diferencia), registradoAt: c.created_at };
};

export async function registrarConteo(tx: Tx, p: { tenantId: string; cajaId: string; usuarioId: string; monto: number; esperado: number }) {
  const diferencia = money(p.monto - p.esperado);
  const [fila] = await query(tx, 'INSERT INTO conteos_caja (id, tenant_id, caja_id, usuario_id, monto, esperado, diferencia) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    id(), p.tenantId, p.cajaId, p.usuarioId, p.monto, p.esperado, diferencia);
  const [{ n }] = await query(tx, 'SELECT COUNT(*)::int AS n FROM conteos_caja WHERE caja_id=$1', p.cajaId);
  await audit(tx, p.tenantId, p.usuarioId, 'CAJA_CONTEO', p.cajaId, { conteoId: fila.id, numero: n, monto: p.monto, diferencia });
  return { fila, numero: n as number };
}

export async function ultimoConteo(tx: Tx, cajaId: string) {
  const [fila] = await query(tx, 'SELECT * FROM conteos_caja WHERE caja_id=$1 ORDER BY created_at DESC, id DESC LIMIT 1', cajaId);
  if (!fila) return null;
  const [{ n }] = await query(tx, 'SELECT COUNT(*)::int AS n FROM conteos_caja WHERE caja_id=$1', cajaId);
  return { fila, numero: n as number };
}

/** Caja cerrada de la persona con saldo trasladado que todavía no se usó en otra apertura. */
export async function saldoTrasladable(tx: Tx, tenantId: string, usuarioId: string) {
  const [fila] = await query(tx, `SELECT c.id, c.monto_trasladado FROM cajas c
    WHERE c.tenant_id=$1 AND c.usuario_id=$2 AND c.estado='CERRADA' AND COALESCE(c.monto_trasladado,0) > 0
      AND NOT EXISTS (SELECT 1 FROM cajas s WHERE s.caja_anterior_id = c.id)
    ORDER BY c.fecha_cierre DESC NULLS LAST, c.id DESC LIMIT 1`, tenantId, usuarioId);
  return fila ? { cajaId: fila.id as string, monto: Number(fila.monto_trasladado) } : null;
}

type TipoCaja = 'APERTURA_CAJA' | 'CIERRE_CAJA';

/**
 * Exige una autorización APROBADA de ADMIN para esta operación exacta (tipo + entidad + huella). Si no existe:
 * - con una RECHAZADA para la misma huella, 409 (no se vuelve a pedir sola);
 * - si no, crea (o conserva) la solicitud PENDIENTE a nombre del usuario e indica que hay que esperar.
 * Una pendiente de otra huella para la misma entidad se invalida (el cajero volvió a contar o cambió el monto).
 */
export async function exigirAutorizacionCaja(tx: Tx, p: { tenantId: string; usuarioId: string; tipo: TipoCaja; entidadId: string; datos: unknown; resumen: Record<string, unknown> }):
  Promise<{ aprobada: true; solicitudId: string } | { aprobada: false; solicitudId: string; estado: 'PENDIENTE' }> {
  const huella = fingerprint({ tipo: p.tipo, entidad: p.entidadId, usuario: p.usuarioId, datos: p.datos });
  const filas = await query(tx, `SELECT id, estado::text AS estado, operacion_hash FROM solicitudes_autorizacion
    WHERE tenant_id=$1 AND tipo=$2::"TipoSolicitudAutorizacion" AND entidad_id=$3 ORDER BY solicitada_at DESC, id DESC FOR UPDATE`, p.tenantId, p.tipo, p.entidadId);
  const mismas = filas.filter((f: any) => f.operacion_hash === huella);
  const aprobada = mismas.find((f: any) => f.estado === 'APROBADA');
  if (aprobada) return { aprobada: true, solicitudId: aprobada.id };
  const pendiente = mismas.find((f: any) => f.estado === 'PENDIENTE');
  if (pendiente) return { aprobada: false, solicitudId: pendiente.id, estado: 'PENDIENTE' };
  if (mismas.some((f: any) => f.estado === 'RECHAZADA')) {
    throw new ConflictException(p.tipo === 'APERTURA_CAJA'
      ? 'El administrador rechazó esta apertura. Inicie una nueva solicitud de apertura'
      : 'El administrador rechazó este cierre. Vuelva a contar el efectivo para solicitarlo de nuevo');
  }
  const otras = filas.filter((f: any) => f.estado === 'PENDIENTE' && f.operacion_hash !== huella);
  for (const f of otras) {
    await query(tx, `UPDATE solicitudes_autorizacion SET estado='INVALIDADA', decisor_id=$3, decidida_at=now(), motivo_decision=$4
      WHERE id=$1 AND tenant_id=$2 AND estado='PENDIENTE' RETURNING id`, f.id, p.tenantId, p.usuarioId, 'La operación de caja cambió después de solicitar la autorización');
    await audit(tx, p.tenantId, p.usuarioId, 'AUTORIZACION_INVALIDADA', f.id, { tipo: p.tipo, entidadId: p.entidadId });
  }
  const solicitudId = id();
  await query(tx, `INSERT INTO solicitudes_autorizacion (id, tenant_id, tipo, estado, entidad_id, operacion_hash, resumen, solicitante_id)
    VALUES ($1, $2, $3::"TipoSolicitudAutorizacion", 'PENDIENTE', $4, $5, $6::jsonb, $7) RETURNING id`,
    solicitudId, p.tenantId, p.tipo, p.entidadId, huella, JSON.stringify(p.resumen), p.usuarioId);
  await audit(tx, p.tenantId, p.usuarioId, 'AUTORIZACION_SOLICITADA', solicitudId, { tipo: p.tipo, entidadId: p.entidadId, ...p.resumen });
  return { aprobada: false, solicitudId, estado: 'PENDIENTE' };
}

/** Cierres con diferencia que requieren la atención de un ADMIN según el umbral vigente de la tienda. */
export const CONDICION_AVISO_DIFERENCIA = `c.estado='CERRADA' AND c.diferencia IS NOT NULL AND c.diferencia <> 0 AND c.diferencia_revisada_at IS NULL
  AND ABS(c.diferencia) >= COALESCE((SELECT umbral_aviso_diferencia FROM configuracion_caja cc WHERE cc.tenant_id = c.tenant_id), 0)`;
