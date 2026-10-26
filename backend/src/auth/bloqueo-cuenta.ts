import type { PrismaService } from '../prisma/prisma.service';

// Contadores de intentos fallidos por cuenta, llevados SOLO en el servidor y actualizados con una única sentencia SQL
// (el bloqueo de fila de PostgreSQL serializa las solicitudes concurrentes: ninguna se pierde ni se cuenta dos veces).

/** Fallos tolerados antes del bloqueo: el bloqueo ocurre en el intento número MAX_FALLOS_BLOQUEO + 1 (el sexto). */
export const MAX_FALLOS_BLOQUEO = 5;
/** Fallos tras los cuales Admin/Super Admin ven la opción de recuperación. */
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
 * Éxito: reinicia el contador. Para usuarios el reinicio es condicional a que la cuenta NO esté bloqueada, así un bloqueo
 * que se confirme en paralelo nunca queda deshecho por un acceso. Devuelve false si la cuenta está bloqueada.
 */
export async function reiniciarFallosCuenta(prisma: Pick<PrismaService, 'usuario' | 'superAdmin'>, tipo: TipoCuenta, id: string): Promise<boolean> {
  if (tipo === 'SUPER_ADMIN') {
    await prisma.superAdmin.updateMany({ where: { id }, data: { intentosFallidos: 0, ultimoFalloAt: null } });
    return true;
  }
  const { count } = await prisma.usuario.updateMany({ where: { id, bloqueadoAt: null }, data: { intentosFallidos: 0, ultimoFalloAt: null } });
  return count === 1;
}

export const puedeRecuperar = (fallos: number) => fallos >= FALLOS_PARA_RECUPERACION;
