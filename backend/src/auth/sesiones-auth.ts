import { randomUUID } from 'node:crypto';
import type { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../prisma/prisma.service';

// Sesiones revocables: cada access y refresh token lleva `sid`, el id de una fila en `sesiones_auth`.
// Logout y cambio de contraseña revocan la fila; la API rechaza cualquier token de una sesión revocada o vencida.

export type TipoSesion = 'TENANT' | 'SOPORTE' | 'SUPER_ADMIN';

export async function crearSesion(
  prisma: Pick<PrismaService, 'sesionAuth'>,
  datos: { id: string; tipo: TipoSesion; sujetoId: string; tenantId?: string | null; expiresAt: Date; refreshJti?: string },
): Promise<void> {
  await prisma.sesionAuth.create({
    data: { id: datos.id, tipo: datos.tipo, sujetoId: datos.sujetoId, tenantId: datos.tenantId ?? null, expiresAt: datos.expiresAt, refreshJti: datos.refreshJti ?? null },
  });
}

/** La sesión existe, pertenece al sujeto del token, no está revocada y no ha vencido. */
export async function sesionVigente(prisma: Pick<PrismaService, 'sesionAuth'>, sid: string, sujetoId: string): Promise<boolean> {
  const sesion = await prisma.sesionAuth.findUnique({ where: { id: sid }, select: { sujetoId: true, revokedAt: true, expiresAt: true } });
  return !!sesion && sesion.sujetoId === sujetoId && !sesion.revokedAt && sesion.expiresAt.getTime() > Date.now();
}

export async function revocarSesion(prisma: Pick<PrismaService, 'sesionAuth'>, sid: string, motivo: string): Promise<void> {
  await prisma.sesionAuth.updateMany({ where: { id: sid, revokedAt: null }, data: { revokedAt: new Date(), revocationMotivo: motivo } });
}

export async function revocarSesionesDeSujeto(prisma: Pick<PrismaService, 'sesionAuth'>, sujetoId: string, motivo: string): Promise<void> {
  await prisma.sesionAuth.updateMany({ where: { sujetoId, revokedAt: null }, data: { revokedAt: new Date(), revocationMotivo: motivo } });
}

/** sid de un token con firma válida, aunque esté vencido: sirve para cerrar la sesión en logout. */
export function sidDeToken(jwt: JwtService, token: string | undefined): string | undefined {
  if (!token) return undefined;
  try {
    const payload = jwt.verify<{ sid?: unknown }>(token, { ignoreExpiration: true });
    return typeof payload.sid === 'string' && payload.sid ? payload.sid : undefined;
  } catch {
    return undefined;
  }
}

/** jti que se asigna a una sesión emitida antes de la rotación: su refresh no lleva `jti`. */
const SIN_JTI = 'sin-jti';

export type ResultadoRotacion =
  | { estado: 'ROTADA'; jti: string; expiresAt: Date }
  | { estado: 'GRACIA'; jti: string; expiresAt: Date }
  | { estado: 'NO_VIGENTE' }
  | { estado: 'REUTILIZADA' };

/**
 * Rotación de refresh con detección de reutilización (H-04), serializada con un bloqueo de fila.
 * - El refresh vigente se sustituye por uno nuevo (ROTADA). La sesión, su `sid` y su vencimiento absoluto no cambian.
 * - El refresh recién sustituido se acepta durante `graciaMs` sin volver a rotar (GRACIA): pestañas que renuevan a la vez
 *   o una respuesta que no llegó. Recibe el jti vigente.
 * - Cualquier otro refresh de la sesión es una reutilización: se revoca la sesión entera (REUTILIZADA).
 * Nunca lanza tras revocar, para que la revocación quede confirmada.
 */
export async function rotarRefresh(
  prisma: Pick<PrismaService, '$transaction'>,
  datos: { sid: string; sujetoId: string; jti?: string; graciaMs: number },
  ahora = new Date(),
): Promise<ResultadoRotacion> {
  return prisma.$transaction(async (tx) => {
    const [sesion] = await tx.$queryRaw<{
      sujeto_id: string; revoked_at: Date | null; expires_at: Date;
      refresh_jti: string | null; refresh_jti_anterior: string | null; refresh_rotado_at: Date | null;
    }[]>`SELECT sujeto_id, revoked_at, expires_at, refresh_jti, refresh_jti_anterior, refresh_rotado_at
           FROM sesiones_auth WHERE id = ${datos.sid} FOR UPDATE`;
    if (!sesion || sesion.sujeto_id !== datos.sujetoId || sesion.revoked_at || sesion.expires_at.getTime() <= ahora.getTime()) {
      return { estado: 'NO_VIGENTE' as const };
    }
    const presentado = datos.jti || SIN_JTI;
    const vigente = sesion.refresh_jti ?? SIN_JTI;
    if (presentado === vigente) {
      const nuevo = randomUUID();
      await tx.$executeRaw`UPDATE sesiones_auth SET refresh_jti = ${nuevo}, refresh_jti_anterior = ${vigente}, refresh_rotado_at = ${ahora}
                            WHERE id = ${datos.sid}`;
      return { estado: 'ROTADA' as const, jti: nuevo, expiresAt: sesion.expires_at };
    }
    const enGracia = sesion.refresh_jti !== null && sesion.refresh_jti_anterior === presentado && sesion.refresh_rotado_at !== null
      && ahora.getTime() - sesion.refresh_rotado_at.getTime() <= datos.graciaMs;
    if (enGracia) return { estado: 'GRACIA' as const, jti: sesion.refresh_jti!, expiresAt: sesion.expires_at };
    await tx.$executeRaw`UPDATE sesiones_auth SET revoked_at = ${ahora}, revocation_motivo = 'REUTILIZACION_REFRESH'
                          WHERE id = ${datos.sid} AND revoked_at IS NULL`;
    return { estado: 'REUTILIZADA' as const };
  });
}
