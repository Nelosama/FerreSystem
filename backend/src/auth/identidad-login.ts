import type { PrismaService } from '../prisma/prisma.service';

// Un solo campo («Usuario») identifica la cuenta: usuario, código o correo. La empresa y el rol salen de la cuenta resuelta.
// Regla de seguridad: la cuenta se resuelve por el identificador ANTES de mirar ninguna contraseña. Si el identificador
// coincide con más de una cuenta (p. ej. el mismo código en dos empresas), no se elige ninguna y el acceso falla de forma
// genérica: jamás se prueba una contraseña contra varias empresas.

export type CuentaResuelta =
  | { estado: 'SUPER_ADMIN'; cuenta: any }
  | { estado: 'TENANT'; cuenta: any }
  | { estado: 'AMBIGUA' }
  | { estado: 'NO_EXISTE' };

export const normalizarIdentificador = (valor: unknown): string => (typeof valor === 'string' ? valor.toLowerCase().trim() : '');

export async function resolverCuenta(prisma: Pick<PrismaService, 'usuario' | 'superAdmin'>, identificador: string): Promise<CuentaResuelta> {
  const id = normalizarIdentificador(identificador);
  if (!id) return { estado: 'NO_EXISTE' };
  if (id.includes('@')) {
    // Los Super Admin solo se identifican por correo y tienen precedencia determinista: altas nuevas ya no pueden repetir su correo
    // (ver identificadorEnUso). Con un Super Admin no se consulta a ninguna empresa y solo se prueba SU contraseña.
    const superAdmin = await prisma.superAdmin.findUnique({ where: { email: id } });
    if (superAdmin) return { estado: 'SUPER_ADMIN', cuenta: superAdmin };
    // Se piden dos filas como máximo: basta para detectar la ambigüedad entre empresas.
    const usuarios = await prisma.usuario.findMany({ where: { email: id }, take: 2, include: { tenant: true } });
    if ((usuarios?.length ?? 0) > 1) return { estado: 'AMBIGUA' };
    return usuarios?.length === 1 ? { estado: 'TENANT', cuenta: usuarios[0] } : { estado: 'NO_EXISTE' };
  }
  const usuarios = await prisma.usuario.findMany({ where: { username: id }, take: 2, include: { tenant: true } });
  if ((usuarios?.length ?? 0) > 1) return { estado: 'AMBIGUA' };
  return usuarios?.length === 1 ? { estado: 'TENANT', cuenta: usuarios[0] } : { estado: 'NO_EXISTE' };
}

/**
 * ¿Otra cuenta de cualquier empresa (o un Super Admin) ya usa este identificador? Se usa al crear o editar usuarios
 * para conservar la unicidad global que exige el inicio de sesión de un solo campo.
 */
export async function identificadorEnUso(
  prisma: Pick<PrismaService, 'usuario' | 'superAdmin'>,
  datos: { email?: string | null; username?: string | null; exceptoUsuarioId?: string },
): Promise<'email' | 'username' | null> {
  const exceptuar = datos.exceptoUsuarioId ? { id: { not: datos.exceptoUsuarioId } } : {};
  if (datos.email) {
    const email = datos.email.toLowerCase().trim();
    if (await prisma.usuario.findFirst({ where: { email, ...exceptuar }, select: { id: true } })) return 'email';
    if (await prisma.superAdmin.findUnique({ where: { email }, select: { id: true } })) return 'email';
  }
  if (datos.username) {
    if (await prisma.usuario.findFirst({ where: { username: datos.username.toLowerCase().trim(), ...exceptuar }, select: { id: true } })) return 'username';
  }
  return null;
}
