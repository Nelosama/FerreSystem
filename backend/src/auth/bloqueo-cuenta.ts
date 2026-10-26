import type { PrismaService } from '../prisma/prisma.service';
import { revocarSesionesDeSujeto } from './sesiones-auth';
import { registrarEventoAuth } from './auth-actions';

// Contadores de intentos fallidos por cuenta, llevados SOLO en el servidor y actualizados con una única sentencia SQL
// (el bloqueo de fila de PostgreSQL serializa las solicitudes concurrentes: ninguna se pierde ni se cuenta dos veces).
// Las cuentas operativas (todo rol distinto de ADMIN, incluido CONTADOR) se bloquean de forma permanente en el sexto fallo
// consecutivo. Admin y Super Admin no se bloquean: los frenan los límites temporales por cuenta e IP y recuperan por correo.

/** Fallos tolerados antes del bloqueo: el bloqueo ocurre en el intento número MAX_FALLOS_BLOQUEO + 1 (el sexto). */
export const MAX_FALLOS_BLOQUEO = 5;
/** Fallos consecutivos con los que Admin/Super Admin pueden pedir una contraseña temporal. */
export const FALLOS_PARA_RECUPERACION = 3;

export type TipoCuenta = 'TENANT' | 'SUPER_ADMIN';

export interface ResultadoFallo {
  fallos: number;
  /** Este intento fue el que bloqueó la cuenta. */
  bloqueadaAhora: boolean;
  bloqueada: boolean;
}

export async function registrarFalloCuenta(prisma: Pick<PrismaService, '$queryRaw'>, tipo: TipoCuenta, id: string): Promise<ResultadoFallo> {
  const filas = tipo === 'SUPER_ADMIN'
    ? await prisma.$queryRaw<{ fallos: number }[]>`
        UPDATE super_admins SET intentos_fallidos = intentos_fallidos + 1, ultimo_fallo_at = now()
        WHERE id = ${id} RETURNING intentos_fallidos AS fallos`
    : await prisma.$queryRaw<{ fallos: number; bloqueada_ahora: boolean; bloqueada: boolean }[]>`
        WITH previo AS (SELECT id, bloqueado_at FROM usuarios WHERE id = ${id} FOR UPDATE)
        UPDATE usuarios u SET
          intentos_fallidos = u.intentos_fallidos + 1,
          ultimo_fallo_at = now(),
          bloqueado_at = CASE WHEN previo.bloqueado_at IS NULL AND u.rol::text <> 'ADMIN' AND u.intentos_fallidos + 1 > ${MAX_FALLOS_BLOQUEO}::int
                              THEN now() ELSE previo.bloqueado_at END
        FROM previo WHERE u.id = previo.id
        RETURNING u.intentos_fallidos AS fallos, (previo.bloqueado_at IS NULL AND u.bloqueado_at IS NOT NULL) AS bloqueada_ahora, (u.bloqueado_at IS NOT NULL) AS bloqueada`;
  const fila = filas?.[0] as any;
  return { fallos: Number(fila?.fallos ?? 0), bloqueadaAhora: fila?.bloqueada_ahora === true, bloqueada: fila?.bloqueada === true };
}

/**
 * Efectos del bloqueo, una sola vez (solo el intento que bloqueó llega aquí): cierra las sesiones abiertas y anula enlaces y
 * contraseñas temporales pendientes, para que nadie siga operando con una cuenta que está bajo ataque. Auditado sin credenciales.
 */
export async function aplicarBloqueo(prisma: Pick<PrismaService, '$transaction'>, cuenta: { id: string; tenantId: string }) {
  await prisma.$transaction(async (tx: any) => {
    await revocarSesionesDeSujeto(tx, cuenta.id, 'CUENTA_BLOQUEADA');
    await tx.authAction.deleteMany({ where: { sujetoId: cuenta.id } });
    await registrarEventoAuth(tx, 'sistema', cuenta, false, 'ACCOUNT_LOCKED');
  });
}

/**
 * Éxito: reinicia el contador. Solo escribe si hay algo que reiniciar (un acceso normal no debe tocar `updated_at` del usuario).
 * Para usuarios el reinicio es condicional a que la cuenta NO esté bloqueada, así un bloqueo que se confirme en paralelo nunca
 * queda deshecho por un acceso. Devuelve false si la cuenta está bloqueada.
 */
export async function reiniciarFallosCuenta(prisma: Pick<PrismaService, 'usuario' | 'superAdmin'>, tipo: TipoCuenta, id: string): Promise<boolean> {
  const pendiente = { OR: [{ intentosFallidos: { gt: 0 } }, { ultimoFalloAt: { not: null } }] };
  const datos = { intentosFallidos: 0, ultimoFalloAt: null };
  if (tipo === 'SUPER_ADMIN') {
    await prisma.superAdmin.updateMany({ where: { id, ...pendiente }, data: datos });
    return true;
  }
  const { count } = await prisma.usuario.updateMany({ where: { id, bloqueadoAt: null, ...pendiente }, data: datos });
  if (count === 1) return true;
  // Nada que reiniciar, o la cuenta está bloqueada: solo el estado real de bloqueo decide.
  const fila = await prisma.usuario.findUnique({ where: { id }, select: { bloqueadoAt: true } });
  return !fila?.bloqueadoAt;
}
