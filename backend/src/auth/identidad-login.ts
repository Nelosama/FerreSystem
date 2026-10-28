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

type Prisma = Pick<PrismaService, 'usuario' | 'superAdmin' | '$queryRaw'>;
type Fila = { id: string };

/**
 * Candidatos por identificador NORMALIZADO en la base (`lower(trim(...))`, el mismo criterio que el login y que
 * `scripts/auth-identificadores-duplicados.sql`). Con igualdad exacta, un dato heredado sin normalizar («Juan» frente a «juan»)
 * escaparía a la detección de ambigüedad y el login elegiría una de las dos cuentas. Dos filas bastan para detectarla.
 */
async function idsDeUsuarios(prisma: Pick<Prisma, '$queryRaw'>, id: string, tenantId?: string): Promise<string[]> {
  const tenant = tenantId ?? null;
  const filas: Fila[] = id.includes('@')
    ? await prisma.$queryRaw`SELECT id FROM usuarios WHERE lower(trim(email)) = ${id} AND (${tenant}::text IS NULL OR tenant_id = ${tenant}) ORDER BY id LIMIT 2`
    : await prisma.$queryRaw`SELECT id FROM usuarios WHERE lower(trim(username)) = ${id} AND (${tenant}::text IS NULL OR tenant_id = ${tenant}) ORDER BY id LIMIT 2`;
  return filas.map(f => f.id);
}
async function idsDeSuperAdmin(prisma: Pick<Prisma, '$queryRaw'>, email: string): Promise<string[]> {
  const filas: Fila[] = await prisma.$queryRaw`SELECT id FROM super_admins WHERE lower(trim(email)) = ${email} ORDER BY id LIMIT 2`;
  return filas.map(f => f.id);
}

/**
 * `tenantId` solo llega desde un enlace privado de empresa (`/login?empresa=`), nunca de un campo visible: acota la búsqueda a
 * ese negocio para que una cuenta heredada con identificador repetido en otra empresa pueda entrar mientras se corrige. Dentro
 * de esa empresa la ambigüedad también se rechaza (el índice único distingue mayúsculas).
 */
export async function resolverCuenta(prisma: Prisma, identificador: string, tenantId?: string): Promise<CuentaResuelta> {
  const id = normalizarIdentificador(identificador);
  if (!id) return { estado: 'NO_EXISTE' };
  if (tenantId) return cuentaDeNegocio(prisma, await idsDeUsuarios(prisma, id, tenantId), tenantId);
  if (id.includes('@')) {
    // Los Super Admin solo se identifican por correo y tienen precedencia determinista: así un usuario de negocio con el mismo
    // correo (dato heredado) no puede impedir el acceso de la plataforma. Ese usuario nunca entra a la plataforma: su
    // contraseña se compara con la del Super Admin y falla igual que una incorrecta. Las altas nuevas ya no pueden repetirlo.
    const plataforma = await idsDeSuperAdmin(prisma, id);
    if (plataforma.length > 1) return { estado: 'AMBIGUA' };
    if (plataforma.length === 1) {
      const superAdmin = await prisma.superAdmin.findUnique({ where: { id: plataforma[0] } });
      if (superAdmin) return { estado: 'SUPER_ADMIN', cuenta: superAdmin };
    }
  }
  return cuentaDeNegocio(prisma, await idsDeUsuarios(prisma, id));
}

async function cuentaDeNegocio(prisma: Prisma, ids: string[], tenantId?: string): Promise<CuentaResuelta> {
  if (ids.length > 1) return { estado: 'AMBIGUA' };
  if (ids.length === 0) return { estado: 'NO_EXISTE' };
  const [usuario] = await prisma.usuario.findMany({ where: { id: ids[0] }, include: { tenant: true }, take: 1 });
  // Relectura defensiva: la cuenta debe seguir perteneciendo a la empresa del enlace.
  if (!usuario || (tenantId && usuario.tenantId !== tenantId)) return { estado: 'NO_EXISTE' };
  return { estado: 'TENANT', cuenta: usuario };
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
    // Misma normalización que el login: un dato heredado «Juan» en otra empresa también ocupa «juan».
    const usuario = (await idsDeUsuarios(tx, valor)).some(id => id !== datos.excluirId);
    const plataforma = valor.includes('@') && (await idsDeSuperAdmin(tx, valor)).length > 0;
    if (usuario || plataforma) {
      throw new ConflictException('Este usuario o correo no está disponible. Elija uno distinto para que el inicio de sesión identifique una sola cuenta.');
    }
  }
}
