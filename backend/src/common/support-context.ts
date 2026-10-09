import { AsyncLocalStorage } from 'node:async_hooks';

/** Identidad real detrás de una sesión de soporte; se deriva solo de un JWT ya validado. */
export interface SupportContext {
  impersonatedBy: string;
  soporteSesionId: string;
  readOnly: boolean;
}

const storage = new AsyncLocalStorage<SupportContext>();

export const runWithSupportContext = <T>(context: SupportContext, fn: () => T): T => storage.run(context, fn);
export const getSupportContext = (): SupportContext | undefined => storage.getStore();

/** Añade la identidad real del Super Admin a los datos de auditoría cuando hay una sesión de soporte activa. */
export function withSupportIdentity(datos: unknown): unknown {
  const context = getSupportContext();
  if (!context) return datos;
  const base = datos !== null && typeof datos === 'object' && !Array.isArray(datos) ? (datos as Record<string, unknown>) : { valor: datos };
  return { ...base, _soporte: { superAdminId: context.impersonatedBy, soporteSesionId: context.soporteSesionId, readOnly: context.readOnly, resultado: 'OK' } };
}
