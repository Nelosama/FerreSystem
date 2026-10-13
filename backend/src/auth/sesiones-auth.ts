import type { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../prisma/prisma.service';

// Sesiones revocables: cada access y refresh token lleva `sid`, el id de una fila en `sesiones_auth`.
// Logout y cambio de contraseña revocan la fila; la API rechaza cualquier token de una sesión revocada o vencida.

export type TipoSesion = 'TENANT' | 'SOPORTE' | 'SUPER_ADMIN';

export async function crearSesion(
  prisma: Pick<PrismaService, 'sesionAuth'>,
  datos: { id: string; tipo: TipoSesion; sujetoId: string; tenantId?: string | null; expiresAt: Date },
): Promise<void> {
  await prisma.sesionAuth.create({
    data: { id: datos.id, tipo: datos.tipo, sujetoId: datos.sujetoId, tenantId: datos.tenantId ?? null, expiresAt: datos.expiresAt },
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
