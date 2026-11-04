// Persistencia y capacidad del almacén local (P1-1 de AUDITORIA_OFFLINE_ALMACENAMIENTO_20261104).
// Lectura y solicitud de `navigator.storage`, con respaldo explícito cuando el navegador no lo ofrece.
// No escribe en IndexedDB ni modifica el diario: solo informa. Las decisiones de bloqueo las toma la página.

export type Persistencia = 'concedida' | 'no-concedida' | 'no-soportado';
export type NivelAlmacen = 'ok' | 'aviso' | 'critico' | 'desconocido';

export interface EstadoAlmacenamiento {
  persistencia: Persistencia;
  usadoBytes: number | null;
  cuotaBytes: number | null;
  libreBytes: number | null;
  nivel: NivelAlmacen;
}

/** Umbrales de la política de §5.3 de la auditoría: aviso con poco espacio o uso alto; bloqueo con muy poco. */
export const UMBRAL_AVISO_LIBRE_BYTES = 200 * 1024 * 1024;
export const UMBRAL_CRITICO_LIBRE_BYTES = 50 * 1024 * 1024;
export const UMBRAL_AVISO_USO = 0.7;

type StorageManager = {
  persisted?: () => Promise<boolean>;
  persist?: () => Promise<boolean>;
  estimate?: () => Promise<{ usage?: number; quota?: number }>;
};

const gestor = (): StorageManager | undefined =>
  typeof navigator !== 'undefined' ? (navigator as Navigator & { storage?: StorageManager }).storage : undefined;

/** Estado de persistencia actual. Sin API o con error, `no-soportado`: nunca se afirma que sea persistente. */
export async function leerPersistencia(storage = gestor()): Promise<Persistencia> {
  if (typeof storage?.persisted !== 'function') return 'no-soportado';
  try { return (await storage.persisted()) ? 'concedida' : 'no-concedida'; } catch { return 'no-soportado'; }
}

/** Pide almacenamiento persistente. El navegador puede denegarlo; devuelve el resultado, sin reintentos. */
export async function solicitarPersistencia(storage = gestor()): Promise<Persistencia> {
  if (typeof storage?.persist !== 'function') return 'no-soportado';
  try { return (await storage.persist()) ? 'concedida' : 'no-concedida'; } catch { return 'no-soportado'; }
}

/** Uso y cuota. Cualquier dato ausente o inválido deja `null`; nunca se inventa una cifra. */
export async function medirAlmacenamiento(storage = gestor()): Promise<{ usadoBytes: number | null; cuotaBytes: number | null }> {
  if (typeof storage?.estimate !== 'function') return { usadoBytes: null, cuotaBytes: null };
  try {
    const { usage, quota } = await storage.estimate();
    const validos = typeof usage === 'number' && Number.isFinite(usage) && usage >= 0
      && typeof quota === 'number' && Number.isFinite(quota) && quota > 0;
    return validos ? { usadoBytes: usage!, cuotaBytes: quota! } : { usadoBytes: null, cuotaBytes: null };
  } catch { return { usadoBytes: null, cuotaBytes: null }; }
}

/** Clasifica el espacio. Sin medición el nivel es `desconocido` (se avisa, no se bloquea). */
export function nivelDeAlmacen(usadoBytes: number | null, cuotaBytes: number | null): { nivel: NivelAlmacen; libreBytes: number | null } {
  if (usadoBytes === null || cuotaBytes === null) return { nivel: 'desconocido', libreBytes: null };
  const libreBytes = Math.max(0, cuotaBytes - usadoBytes);
  if (libreBytes < UMBRAL_CRITICO_LIBRE_BYTES) return { nivel: 'critico', libreBytes };
  if (libreBytes < UMBRAL_AVISO_LIBRE_BYTES || usadoBytes / cuotaBytes > UMBRAL_AVISO_USO) return { nivel: 'aviso', libreBytes };
  return { nivel: 'ok', libreBytes };
}

/** Estado completo para la interfaz. Nunca rechaza: cualquier fallo se refleja como `desconocido`. */
export async function leerEstadoAlmacenamiento(storage = gestor()): Promise<EstadoAlmacenamiento> {
  const [persistencia, medida] = await Promise.all([leerPersistencia(storage), medirAlmacenamiento(storage)]);
  return { persistencia, ...medida, ...nivelDeAlmacen(medida.usadoBytes, medida.cuotaBytes) };
}

/**
 * Mensaje de error de escritura local. Una cuota agotada aparece como QuotaExceededError (o código legacy 22);
 * cualquier otro fallo se describe sin volcar detalles técnicos al cajero.
 */
export function esCuotaAgotada(error: unknown): boolean {
  const e = error as { name?: unknown; code?: unknown } | null;
  return !!e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22);
}

export function motivoFalloLocal(error: unknown): string {
  if (esCuotaAgotada(error)) return 'espacio lleno';
  return 'error local';
}
