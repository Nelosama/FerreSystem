import type { CSSProperties } from 'react';
import { variantesMarca } from './colorMarca';

// Identidad de un negocio concreto fuera de su sesión (listas y vistas previas del Super Admin) y respaldo sin logotipo.

/**
 * Variables CSS con las variantes legibles del color de un negocio concreto (vistas previas y listas del
 * Super Admin, donde el color no es el de la sesión): --tenant-color, --tenant-on-color y --tenant-text-color.
 */
export const estiloMarcaNegocio = (color: string | null | undefined): CSSProperties => {
  const v = variantesMarca(color || '#EA580C');
  return { '--tenant-color': v.primario, '--tenant-on-color': v.sobrePrimario, '--tenant-text-color': v.texto } as CSSProperties;
};

/** Iniciales del nombre comercial («Ferretería El Roble» → «ER»); ignora artículos y palabras cortas. */
export const inicialesNegocio = (nombre: string | undefined) =>
  (nombre || '').split(/\s+/).filter(p => p.length > 2).slice(-2).map(p => p[0]).join('').toUpperCase() || 'N';
