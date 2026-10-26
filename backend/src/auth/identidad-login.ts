import { ConflictException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';

// Un solo campo («Usuario») identifica la cuenta: usuario, código o correo. La empresa y el rol salen de la cuenta resuelta.
// Regla de seguridad: la cuenta se resuelve por el identificador ANTES de mirar ninguna contraseña. Si el identificador
// coincide con más de una cuenta (p. ej. el mismo código en dos empresas), no se elige ninguna y el acceso falla de forma
// genérica, igual que una cuenta inexistente: jamás se prueba una contraseña contra varias empresas ni se revela la duplicidad.

export type CuentaResuelta =
  | { estado: 'SUPER_ADMIN'; cuenta: any }
  | { estado: 'TENANT'; cuenta: any }
  | { estado: 'AMBIGUA' }
  | { estado: 'NO_EXISTE' };

export const normalizarIdentificador = (valor: unknown): string => (typeof valor === 'string' ? valor.toLowerCase().trim() : '');

/**
 * `tenantId` solo llega desde un enlace privado de empresa (`/login?empresa=`), nunca de un campo visible: acota la búsqueda a
 * ese negocio para que una cuenta heredada con identificador repetido pueda entrar mientras se corrige.
 */
export async function resolverCuenta(prisma: Pick<PrismaService, 'usuario' | 'superAdmin'>, identificador: string, tenantId?: string): Promise<CuentaResuelta> {
  const id = normalizarIdentificador(identificador);
  if (!id) return { estado: 'NO_EXISTE' };
  const filtro = id.includes('@') ? { email: id } : { username: id };
  if (tenantId) {
    const usuario = await prisma.usuario.findFirst({ where: { tenantId, ...filtro }, include: { tenant: true } });
    return usuario ? { estado: 'TENANT', cuenta: usuario } : { estado: 'NO_EXISTE' };
  }
  if (id.includes('@')) {
    // Los Super Admin solo se identifican por correo y tienen precedencia determinista: así un usuario de negocio con el mismo
    // correo (dato heredado) no puede impedir el acceso de la plataforma. Las altas nuevas ya no pueden repetirlo.
    const superAdmin = await prisma.superAdmin.findUnique({ where: { email: id } });
    if (superAdmin) return { estado: 'SUPER_ADMIN', cuenta: superAdmin };
  }
  // Dos filas como máximo: basta para detectar la ambigüedad entre empresas.
  const usuarios = await prisma.usuario.findMany({ where: filtro, take: 2, include: { tenant: true } });
  if ((usuarios?.length ?? 0) > 1) return { estado: 'AMBIGUA' };
  return usuarios?.length === 1 ? { estado: 'TENANT', cuenta: usuarios[0] } : { estado: 'NO_EXISTE' };
}

/**
 * Un identificador nuevo no puede repetirse en otra empresa ni coincidir con el correo de un Super Admin: así el login sin
 * empresa resuelve una sola cuenta. Serializa por identificador (bloqueo consultivo de la transacción) para que dos altas
 * simultáneas en empresas distintas no ganen las dos. El mensaje no dice en qué empresa existe.
 */
export async function exigirIdentificadorUnico(tx: any, datos: { email?: string | null; username?: string | null; excluirId?: string }) {
  for (const bruto of [datos.email, datos.username]) {
    const valor = normalizarIdentificador(bruto);
    if (!valor) continue;
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`IDENT:${valor}`}, 0))`;
    const filtro = valor.includes('@') ? { email: valor } : { username: valor };
    const usuario = await tx.usuario.findFirst({ where: { ...filtro, ...(datos.excluirId && { id: { not: datos.excluirId } }) }, select: { id: true } });
    const plataforma = valor.includes('@') ? await tx.superAdmin.findUnique({ where: { email: valor }, select: { id: true } }) : null;
    if (usuario || plataforma) {
      throw new ConflictException('Este usuario o correo no está disponible. Elija uno distinto para que el inicio de sesión identifique una sola cuenta.');
    }
  }
}
