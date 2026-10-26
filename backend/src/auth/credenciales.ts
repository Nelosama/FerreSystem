import { ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'node:crypto';
import { tokenHash } from './mfa';
import { revocarSesionesDeSujeto } from './sesiones-auth';

// Inicio de sesión con un solo identificador (usuario, código o correo) sin elegir empresa.
// La empresa y el rol salen de la cuenta encontrada. Nunca se prueba una contraseña contra varias cuentas:
// si el identificador no apunta a una sola cuenta, el intento falla antes de comparar contraseñas.

/** Fallos consecutivos con los que un Admin o Super Admin puede pedir una clave temporal. */
export const FALLOS_PARA_RECUPERAR = 3;
/** Los roles distintos de ADMIN quedan bloqueados al llegar a este número de fallos consecutivos. */
export const FALLOS_BLOQUEO_EMPLEADO = 6;
export const VIGENCIA_CLAVE_TEMPORAL_MS = 10 * 60 * 1000;
export const PROPOSITO_CLAVE_TEMPORAL = 'TEMP_PASSWORD';

export const normalizarIdentificador = (valor: unknown) => (typeof valor === 'string' ? valor.toLowerCase().trim() : '');

export type CuentaResuelta =
  | { estado: 'UNICA'; plataforma: true; cuenta: any }
  | { estado: 'UNICA'; plataforma: false; cuenta: any }
  | { estado: 'NINGUNA' }
  | { estado: 'AMBIGUA' };

/**
 * Busca la cuenta del identificador. `tenantId` solo llega desde un enlace de empresa y limita la búsqueda a ese negocio.
 * Un identificador repetido entre empresas, o un correo compartido con el Super Admin, se informa como AMBIGUA.
 */
export async function resolverCuenta(prisma: any, identificador: unknown, tenantId?: string): Promise<CuentaResuelta> {
  const id = normalizarIdentificador(identificador);
  if (!id) return { estado: 'NINGUNA' };
  const filtro = id.includes('@') ? { email: id } : { username: id };
  if (tenantId) {
    const usuario = await prisma.usuario.findFirst({ where: { tenantId, ...filtro }, include: { tenant: true } });
    return usuario ? { estado: 'UNICA', plataforma: false, cuenta: usuario } : { estado: 'NINGUNA' };
  }
  const [superAdmin, usuarios] = await Promise.all([
    id.includes('@') ? prisma.superAdmin.findUnique({ where: { email: id } }) : null,
    prisma.usuario.findMany({ where: filtro, take: 2, include: { tenant: true } }),
  ]);
  const total = (superAdmin ? 1 : 0) + (usuarios?.length ?? 0);
  if (total === 0) return { estado: 'NINGUNA' };
  if (total > 1) return { estado: 'AMBIGUA' };
  return superAdmin ? { estado: 'UNICA', plataforma: true, cuenta: superAdmin } : { estado: 'UNICA', plataforma: false, cuenta: usuarios[0] };
}

const tabla = (tx: any, plataforma: boolean) => (plataforma ? tx.superAdmin : tx.usuario);
const tipo = (plataforma: boolean) => (plataforma ? 'SUPER_ADMIN' : 'TENANT');

export async function bloquearSujeto(tx: any, id: string) {
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`AUTH:${id}`}, 0))`;
}

export async function registrarEventoAuth(tx: any, actorId: string, cuenta: { id: string; tenantId?: string | null }, plataforma: boolean, evento: string) {
  await tx.authEvent.create({ data: { actorId, sujetoId: cuenta.id, tenantId: plataforma ? null : cuenta.tenantId, event: evento } });
}

/** 'PASSWORD' con la contraseña vigente, 'TEMPORAL' con una clave temporal vigente sin usar, o null. */
export async function verificarClave(prisma: any, cuenta: any, plataforma: boolean, password: string): Promise<'PASSWORD' | 'TEMPORAL' | null> {
  if (await bcrypt.compare(password, cuenta.passwordHash)) return 'PASSWORD';
  const temporal = await prisma.authAction.findUnique({ where: { hash: tokenHash(password) } });
  return temporal && esClaveTemporalDe(temporal, cuenta, plataforma) ? 'TEMPORAL' : null;
}

// La clave temporal pertenece a la cuenta, a su correo y a la contraseña vigente al emitirla: un cambio posterior la invalida.
// Solo Admin y Super Admin tienen recuperación por correo, aunque apareciera una clave para otra cuenta.
function esClaveTemporalDe(accion: any, cuenta: any, plataforma: boolean) {
  return (plataforma || cuenta.rol === 'ADMIN') && accion.purpose === PROPOSITO_CLAVE_TEMPORAL && accion.sujetoId === cuenta.id && accion.tipo === tipo(plataforma)
    && accion.email === cuenta.email && accion.passwordBinding === tokenHash(cuenta.passwordHash) && accion.expiresAt.getTime() > Date.now();
}

/**
 * Cuenta un fallo para la cuenta. Un rol distinto de ADMIN queda bloqueado al sexto fallo consecutivo y pierde sus sesiones.
 * Admin y Super Admin no se bloquean: el límite temporal por cuenta e IP sigue aplicando.
 */
export async function registrarFalloCuenta(prisma: any, cuenta: any, plataforma: boolean): Promise<{ fallos: number; bloqueada: boolean }> {
  return prisma.$transaction(async (tx: any) => {
    await bloquearSujeto(tx, cuenta.id);
    const actual = await tabla(tx, plataforma).findUnique({ where: { id: cuenta.id } });
    if (!actual) return { fallos: 0, bloqueada: false };
    const fallos = actual.loginFallos + 1;
    const bloquear = !plataforma && actual.rol !== 'ADMIN' && !actual.bloqueadoAt && fallos >= FALLOS_BLOQUEO_EMPLEADO;
    await tabla(tx, plataforma).update({ where: { id: cuenta.id }, data: { loginFallos: fallos, ...(bloquear && { bloqueadoAt: new Date() }) } });
    if (bloquear) {
      await revocarSesionesDeSujeto(tx, cuenta.id, 'CUENTA_BLOQUEADA');
      await tx.authAction.deleteMany({ where: { sujetoId: cuenta.id } });
      await registrarEventoAuth(tx, cuenta.id, cuenta, plataforma, 'ACCOUNT_LOCKED');
    }
    return { fallos, bloqueada: bloquear || (!plataforma && !!actual.bloqueadoAt) };
  });
}

/** Un acceso con la contraseña vigente reinicia los fallos y descarta una clave temporal pendiente. */
export async function registrarExitoCuenta(prisma: any, cuenta: any, plataforma: boolean) {
  if (cuenta.loginFallos > 0) await tabla(prisma, plataforma).updateMany({ where: { id: cuenta.id, loginFallos: { gt: 0 } }, data: { loginFallos: 0 } });
  await prisma.authAction.deleteMany({ where: { sujetoId: cuenta.id, purpose: PROPOSITO_CLAVE_TEMPORAL } });
}

/**
 * Consume la clave temporal una sola vez: bloquea la cuenta, vuelve a leer y borra la clave en la misma transacción.
 * Revoca las sesiones anteriores y marca la cuenta para cambiar la contraseña antes de operar.
 * Devuelve la cuenta actualizada, o null si la clave ya se usó, venció o dejó de corresponder.
 */
export async function consumirClaveTemporal(prisma: any, cuenta: any, plataforma: boolean, password: string): Promise<any | null> {
  return prisma.$transaction(async (tx: any) => {
    await bloquearSujeto(tx, cuenta.id);
    const actual = await tabla(tx, plataforma).findUnique({ where: { id: cuenta.id } });
    const accion = await tx.authAction.findUnique({ where: { hash: tokenHash(password) } });
    if (!actual || !accion || !esClaveTemporalDe(accion, actual, plataforma)) return null;
    const borradas = await tx.authAction.deleteMany({ where: { hash: accion.hash } });
    if (borradas.count !== 1) return null;
    const actualizada = await tabla(tx, plataforma).update({ where: { id: cuenta.id }, data: { debeCambiarPassword: true, loginFallos: 0 } });
    await revocarSesionesDeSujeto(tx, cuenta.id, 'CLAVE_TEMPORAL');
    if (plataforma) await revocarSoporte(tx, 'SUPER_ADMIN_CLAVE_TEMPORAL');
    await registrarEventoAuth(tx, cuenta.id, cuenta, plataforma, 'TEMP_PASSWORD_USED');
    return actualizada;
  });
}

export async function revocarSoporte(tx: any, motivo: string) {
  await tx.$executeRaw`UPDATE sesiones_auth SET revoked_at=now(), revocation_motivo=${motivo} WHERE tipo='SOPORTE' AND revoked_at IS NULL`;
}

// Sin caracteres que se confunden al copiar a mano (0/O, 1/l/I). 16 símbolos de 54 ≈ 92 bits.
const ALFABETO_TEMPORAL = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
export function generarClaveTemporal(): string {
  const simbolos = Array.from({ length: 16 }, () => ALFABETO_TEMPORAL[randomInt(ALFABETO_TEMPORAL.length)]).join('');
  // Grupos de 4 para leerla del correo. Solo se guarda su SHA-256: con esta entropía no es adivinable por fuerza bruta.
  return simbolos.match(/.{4}/g)!.join('-');
}

/**
 * Un identificador nuevo no puede repetirse en otra empresa ni coincidir con el correo del Super Admin:
 * así el login sin empresa resuelve una sola cuenta. Serializa por identificador para evitar carreras entre empresas.
 */
export async function exigirIdentificadorUnico(tx: any, datos: { email?: string | null; username?: string | null; excluirId?: string }) {
  for (const valor of [datos.email, datos.username]) {
    if (!valor) continue;
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`IDENT:${valor}`}, 0))`;
    const filtro = valor.includes('@') ? { email: valor } : { username: valor };
    const usuario = await tx.usuario.findFirst({ where: { ...filtro, ...(datos.excluirId && { id: { not: datos.excluirId } }) }, select: { id: true } });
    const plataforma = valor.includes('@') ? await tx.superAdmin.findUnique({ where: { email: valor }, select: { id: true } }) : null;
    if (usuario || (plataforma && plataforma.id !== datos.excluirId)) {
      throw new ConflictException('Este usuario o correo ya se usa en otro acceso. Elija uno distinto para que el inicio de sesión identifique una sola cuenta.');
    }
  }
}
