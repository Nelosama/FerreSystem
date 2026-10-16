import { api } from './api';

/** Metadatos públicos del logotipo (sin clave de almacenamiento). */
export interface LogotipoMeta {
  mime: string;
  bytes: number;
  actualizadoAt: string;
}

export const LIMITE_LOGOTIPO_BYTES = 2 * 1024 * 1024;
export const TIPOS_LOGOTIPO_ACEPTADOS = ['image/png', 'image/jpeg', 'image/webp'] as const;

const cache = new Map<string, Promise<string | null>>();

const leerComoDataUrl = (blob: Blob) => new Promise<string>((resolver, rechazar) => {
  const lector = new FileReader();
  lector.onload = () => resolver(String(lector.result));
  lector.onerror = () => rechazar(lector.error);
  lector.readAsDataURL(blob);
});

/**
 * Bytes del logotipo autenticado como data URL. La clave incluye la versión (fecha de actualización),
 * así un logotipo reemplazado no se confunde con el anterior. Un fallo devuelve null: la interfaz muestra el ícono.
 */
export function logotipoDataUrl(endpoint: string, version: string): Promise<string | null> {
  const clave = `${endpoint}|${version}`;
  let pendiente = cache.get(clave);
  if (!pendiente) {
    pendiente = api.get(endpoint, { responseType: 'blob' })
      .then(({ data }) => leerComoDataUrl(data as Blob))
      .catch(() => { cache.delete(clave); return null; });
    cache.set(clave, pendiente);
  }
  return pendiente;
}

/** Olvida las versiones cacheadas de un endpoint tras cargar o eliminar un logotipo. */
export function invalidarLogotipo(endpoint: string) {
  for (const clave of [...cache.keys()]) if (clave.startsWith(`${endpoint}|`)) cache.delete(clave);
}

/** Mensaje claro para errores de la carga; prioriza el texto que devuelve el servidor. */
export function mensajeErrorLogotipo(error: any): string {
  const estado = error?.response?.status;
  if (estado === 413) return 'El archivo supera el límite de 2 MB. Elija una imagen más pequeña.';
  if (estado === 415) return 'Formato no permitido. Use una imagen PNG, JPG o WEBP.';
  if (estado === 503) return 'El almacenamiento de logotipos no está disponible. Avise al equipo técnico.';
  return error?.response?.data?.message || 'No se pudo completar la operación. Intente de nuevo.';
}
