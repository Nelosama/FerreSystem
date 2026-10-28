import { tokenHash, opaqueToken } from './tokens-auth';

export const VIGENCIA_ACCION_MS = 10 * 60 * 1000;

/**
 * Token opaco de un solo uso. Solo se guarda su hash, ligado a la contraseña vigente: cambiarla lo invalida.
 * `hashSecreto` permite guardar el hash de un secreto generado por el llamador (contraseña temporal); entonces no se devuelve token.
 */
export async function crearAccionAuth(
  tx: any,
  cuenta: { id: string; tenantId?: string | null; email?: string | null; passwordHash: string },
  plataforma: boolean,
  purpose: string,
  binding = tokenHash(cuenta.passwordHash),
  hashSecreto?: string,
): Promise<string> {
  const token = hashSecreto ? '' : opaqueToken();
  await tx.authAction.deleteMany({ where: { sujetoId: cuenta.id, purpose } });
  await tx.authAction.create({
    data: {
      hash: hashSecreto ?? tokenHash(token), sujetoId: cuenta.id, tipo: plataforma ? 'SUPER_ADMIN' : 'TENANT', tenantId: plataforma ? null : cuenta.tenantId,
      purpose, email: cuenta.email, passwordBinding: binding, expiresAt: new Date(Date.now() + VIGENCIA_ACCION_MS),
    },
  });
  return token;
}

/** Evento de auditoría de autenticación. Nunca recibe contraseñas ni tokens: solo ids y el nombre del evento. */
export async function registrarEventoAuth(tx: any, actorId: string, cuenta: { id: string; tenantId?: string | null }, plataforma: boolean, event: string) {
  await tx.authEvent.create({ data: { actorId, sujetoId: cuenta.id, tenantId: plataforma ? null : cuenta.tenantId, event } });
}
