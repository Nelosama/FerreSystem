import { randomInt } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import type { TipoCuenta } from './bloqueo-cuenta';

// Contraseña temporal de recuperación (solo Admin y Super Admin).
// - Aleatoria, de un solo uso y vigente 10 minutos; en la base de datos queda únicamente su hash bcrypt.
// - Nunca se registra: ni en logs, ni en auditoría, ni en errores. Solo viaja en el correo al titular verificado.

export const VIGENCIA_TEMPORAL_MS = 10 * 60 * 1000;
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const LONGITUD = 16;

export function generarContrasenaTemporal(): string {
  let valor = '';
  for (let i = 0; i < LONGITUD; i++) valor += ALFABETO[randomInt(ALFABETO.length)];
  return valor;
}

type Tx = { authTempPassword: any };

/** Emite una temporal nueva; reemplaza (e invalida) cualquier temporal anterior de la misma cuenta. */
export async function emitirContrasenaTemporal(tx: Tx, cuenta: { id: string; tenantId?: string | null }, tipo: TipoCuenta): Promise<string> {
  const contrasena = generarContrasenaTemporal();
  const passwordHash = await bcrypt.hash(contrasena, 12);
  const datos = { passwordHash, tenantId: tipo === 'TENANT' ? cuenta.tenantId! : null, expiresAt: new Date(Date.now() + VIGENCIA_TEMPORAL_MS), usedAt: null };
  await tx.authTempPassword.upsert({
    where: { sujetoId_tipo: { sujetoId: cuenta.id, tipo } },
    create: { sujetoId: cuenta.id, tipo, ...datos },
    update: datos,
  });
  return contrasena;
}

/**
 * ¿La contraseña presentada es la temporal vigente de la cuenta? Si lo es, se consume en la misma operación atómica:
 * dos solicitudes simultáneas con la misma temporal no pueden ganar las dos.
 */
export async function consumirContrasenaTemporal(prisma: Tx, sujetoId: string, tipo: TipoCuenta, contrasena: string): Promise<boolean> {
  const fila = await prisma.authTempPassword.findUnique({ where: { sujetoId_tipo: { sujetoId, tipo } } });
  if (!fila || fila.usedAt || fila.expiresAt.getTime() <= Date.now()) return false;
  if (!(await bcrypt.compare(contrasena, fila.passwordHash))) return false;
  const { count } = await prisma.authTempPassword.updateMany({ where: { id: fila.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
  return count === 1;
}
