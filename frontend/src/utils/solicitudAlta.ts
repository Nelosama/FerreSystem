/**
 * A-02: clave de reintento para altas (cliente, cotización, copia de cotización).
 *
 * Mismo criterio que el alta de levantamientos e inventario:
 * - La clave se guarda junto con el contenido antes de enviar, por empresa, usuario y operación, y sobrevive a una
 *   recarga. Un reintento con el mismo contenido (fallo de red, respuesta perdida, doble clic) reutiliza la clave y el
 *   servidor devuelve el registro ya creado.
 * - Un contenido distinto, una alta terminada o una clave de más de 24 horas generan una clave nueva: es otra operación.
 * - Una respuesta del servidor que rechaza la solicitud (4xx) descarta la clave; un fallo de red o un 5xx la conserva.
 * Sin dependencias para poder probarse sin navegador; el almacenamiento puede fallar (modo privado): entonces la clave
 * vive solo en memoria mientras la pantalla siga abierta.
 */
export type OperacionAlta = 'CLIENTE_CREAR' | 'COTIZACION_CREAR' | 'COTIZACION_DUPLICAR';

interface Guardada { solicitudId: string; huella: string; creada: number }

const VIGENCIA_MS = 24 * 60 * 60 * 1000;
const memoria = new Map<string, Guardada>();

/** Clave de almacenamiento: separada por empresa, usuario, operación y, si aplica, el documento de origen. */
export function claveAlmacenAlta(operacion: OperacionAlta, tenantId: string | undefined, usuarioId: string | undefined, origen?: string): string {
  return ['jowa:alta', operacion, tenantId || 'sin-empresa', usuarioId || 'sin-usuario', ...(origen ? [origen] : [])].join(':');
}

/** JSON con claves ordenadas: el mismo contenido da la misma huella aunque el objeto se arme en otro orden. */
export function huellaContenido(valor: unknown): string {
  if (valor === null || typeof valor !== 'object') return JSON.stringify(valor ?? null);
  if (Array.isArray(valor)) return `[${valor.map((v) => (v === undefined ? 'null' : huellaContenido(v))).join(',')}]`;
  const objeto = valor as Record<string, unknown>;
  return `{${Object.keys(objeto).filter((k) => objeto[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${huellaContenido(objeto[k])}`).join(',')}}`;
}

function leer(clave: string): Guardada | null {
  try {
    const crudo = localStorage.getItem(clave);
    if (crudo) {
      const valor = JSON.parse(crudo);
      if (valor && typeof valor.solicitudId === 'string' && typeof valor.huella === 'string' && typeof valor.creada === 'number') return valor;
    }
  } catch { /* almacenamiento no disponible: se usa la memoria */ }
  return memoria.get(clave) ?? null;
}

function escribir(clave: string, valor: Guardada) {
  memoria.set(clave, valor);
  try { localStorage.setItem(clave, JSON.stringify(valor)); } catch { /* queda en memoria */ }
}

/**
 * Clave para enviar `contenido`: la guardada si es el mismo contenido y sigue vigente; si no, una nueva (que se guarda
 * antes de enviar). `nuevaClave` debe devolver un UUID v4.
 */
export function solicitudParaAlta(clave: string, contenido: unknown, nuevaClave: () => string, ahora = Date.now()): string {
  const huella = huellaContenido(contenido);
  const previa = leer(clave);
  if (previa && previa.huella === huella && ahora - previa.creada >= 0 && ahora - previa.creada < VIGENCIA_MS) return previa.solicitudId;
  const nueva: Guardada = { solicitudId: nuevaClave(), huella, creada: ahora };
  escribir(clave, nueva);
  return nueva.solicitudId;
}

/** El alta terminó (o el servidor la rechazó): la próxima será una operación nueva. */
export function cerrarSolicitudAlta(clave: string) {
  memoria.delete(clave);
  try { localStorage.removeItem(clave); } catch { /* sin almacenamiento */ }
}

/** Sin respuesta del servidor, 408, 429 o 5xx: no se sabe si el alta quedó hecha y la clave debe conservarse. */
export function conservarSolicitudTrasError(error: any): boolean {
  const estado = Number(error?.response?.status);
  if (!Number.isFinite(estado) || estado <= 0) return true;
  return estado === 408 || estado === 429 || estado >= 500;
}
