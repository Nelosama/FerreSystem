import { randomInt } from 'node:crypto';
import { tokenHash } from './mfa';
import { crearAccionAuth, VIGENCIA_ACCION_MS } from './auth-actions';

// Contraseña temporal de recuperación (solo Admin y Super Admin con correo verificado).
// - Aleatoria (16 símbolos de 54 ≈ 92 bits), de un solo uso y vigente 10 minutos.
// - Se guarda solo su SHA-256 en auth_actions, ligada a la cuenta, a su correo y a la contraseña vigente al emitirla:
//   cambiar la contraseña o el correo la invalida. Con esa entropía un hash rápido no es adivinable por fuerza bruta.
// - Nunca se registra: ni en logs, ni en auditoría, ni en errores. Solo viaja en el correo al titular verificado.
// - Pedirla NO invalida la contraseña actual: un tercero que provoque la solicitud no deja fuera al titular.

export const PROPOSITO_TEMPORAL = 'TEMP_PASSWORD';
export const VIGENCIA_TEMPORAL_MS = VIGENCIA_ACCION_MS;
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export function generarContrasenaTemporal(): string {
  const simbolos = Array.from({ length: 16 }, () => ALFABETO[randomInt(ALFABETO.length)]).join('');
  // Grupos de 4 para copiarla del correo sin errores.
  return simbolos.match(/.{4}/g)!.join('-');
}

/** Emite una temporal nueva; reemplaza (e invalida) cualquier temporal anterior de la misma cuenta. */
export function emitirContrasenaTemporal(tx: any, cuenta: { id: string; tenantId?: string | null; email?: string | null; passwordHash: string }, plataforma: boolean, contrasena: string) {
  return crearAccionAuth(tx, cuenta, plataforma, PROPOSITO_TEMPORAL, undefined, tokenHash(contrasena));
}

const tipo = (plataforma: boolean) => (plataforma ? 'SUPER_ADMIN' : 'TENANT');

/** ¿La acción es la temporal vigente de esta cuenta? Solo Admin y Super Admin tienen recuperación por correo. */
function esTemporalDe(accion: any, cuenta: any, plataforma: boolean) {
  return !!accion && (plataforma || cuenta.rol === 'ADMIN') && accion.purpose === PROPOSITO_TEMPORAL && accion.sujetoId === cuenta.id
    && accion.tipo === tipo(plataforma) && accion.email === cuenta.email && accion.passwordBinding === tokenHash(cuenta.passwordHash)
    && accion.expiresAt.getTime() > Date.now();
}

/** Comprueba sin consumir: el consumo ocurre solo cuando el resto del acceso (MFA incluido) también es válido. */
export async function temporalVigente(prisma: any, cuenta: any, plataforma: boolean, contrasena: string): Promise<boolean> {
  const accion = await prisma.authAction.findUnique({ where: { hash: tokenHash(contrasena) } });
  return esTemporalDe(accion, cuenta, plataforma);
}

/**
 * Consume la temporal una sola vez dentro de la transacción del llamador (que ya tomó el bloqueo de la cuenta): vuelve a leer
 * cuenta y acción, y borra la acción. Dos solicitudes simultáneas con la misma temporal no pueden ganar las dos.
 */
export async function consumirContrasenaTemporal(tx: any, cuenta: any, plataforma: boolean, contrasena: string): Promise<boolean> {
  const actual = await (plataforma ? tx.superAdmin : tx.usuario).findUnique({ where: { id: cuenta.id } });
  const accion = await tx.authAction.findUnique({ where: { hash: tokenHash(contrasena) } });
  if (!actual || !esTemporalDe(accion, actual, plataforma)) return false;
  const { count } = await tx.authAction.deleteMany({ where: { hash: accion.hash } });
  return count === 1;
}
