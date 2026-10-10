import { createHash } from 'node:crypto';

// Huella canónica de una solicitud (docs/POS_ENTREGA_DISENO_TECNICO.md §3.6).
// Dos payloads con el mismo significado producen la misma huella, sin importar el orden de las claves,
// de las líneas, la forma en que se escriben las cantidades o los espacios del texto.
// Cualquier diferencia de contenido produce otra huella y se trata como conflicto.

export type ValorCanonico = null | boolean | number | string | ValorCanonico[] | { [clave: string]: ValorCanonico };

export function normalizarTexto(texto: string | null | undefined): string | null {
  if (texto === null || texto === undefined) return null;
  const limpio = texto.normalize('NFC').trim().replace(/\s+/g, ' ');
  return limpio === '' ? null : limpio;
}

/** Convierte una cantidad a centésimas enteras. Rechaza más de dos decimales y valores no finitos. */
export function aCentesimas(valor: unknown, etiqueta: string, positiva = false): number {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) throw new Error(`${etiqueta}: valor no numérico`);
  const centesimas = Math.round(valor * 100);
  if (Math.abs(valor * 100 - centesimas) > 1e-7) throw new Error(`${etiqueta}: máximo dos decimales`);
  if (!Number.isSafeInteger(centesimas)) throw new Error(`${etiqueta}: fuera de rango`);
  if (positiva ? centesimas <= 0 : centesimas < 0) throw new Error(`${etiqueta}: debe ser ${positiva ? 'mayor que cero' : 'no negativo'}`);
  return centesimas;
}

/** JSON con claves ordenadas en todos los niveles. Solo admite enteros; los decimales deben convertirse antes. */
export function canonicalJson(valor: ValorCanonico): string {
  if (valor === null) return 'null';
  if (typeof valor === 'boolean') return valor ? 'true' : 'false';
  if (typeof valor === 'number') {
    if (!Number.isSafeInteger(valor)) throw new Error('canonicalJson: solo se admiten enteros seguros');
    return String(valor);
  }
  if (typeof valor === 'string') return JSON.stringify(valor.normalize('NFC'));
  if (Array.isArray(valor)) return `[${valor.map(canonicalJson).join(',')}]`;
  const claves = Object.keys(valor).filter((k) => valor[k] !== undefined).sort();
  return `{${claves.map((k) => `${JSON.stringify(k)}:${canonicalJson(valor[k]!)}`).join(',')}}`;
}

/** SHA-256 hexadecimal en minúsculas de la forma canónica de un valor. */
export function huellaCanonica(valor: ValorCanonico): string {
  return createHash('sha256').update(canonicalJson(valor)).digest('hex');
}

export interface LineaSolicitud {
  detalleVentaId: string;
  cantidadCentesimas: number;
}

/** Huella de una acción de entrega, preparación, liberación o devolución sobre una venta. */
export function huellaAccionVenta(p: {
  tipo: string;
  ventaId: string;
  usuarioId: string;
  origen: 'ONLINE' | 'OFFLINE';
  lineas: LineaSolicitud[];
  receptorNombre?: string | null;
  motivo?: string | null;
}): string {
  const lineas = [...p.lineas]
    .map((l) => ({ detalleVentaId: l.detalleVentaId, cantidadCentesimas: l.cantidadCentesimas }))
    .sort((a, b) => (a.detalleVentaId < b.detalleVentaId ? -1 : a.detalleVentaId > b.detalleVentaId ? 1 : 0));
  return huellaCanonica({
    v: 1,
    tipo: p.tipo,
    ventaId: p.ventaId,
    usuarioId: p.usuarioId,
    origen: p.origen,
    lineas,
    receptorNombre: normalizarTexto(p.receptorNombre),
    motivo: normalizarTexto(p.motivo),
  });
}
