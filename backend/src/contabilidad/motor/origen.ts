/**
 * Identidad de un asiento automático: de qué operación viene, por qué evento contable y qué datos se leyeron.
 * La clave (empresa, tipo, id, evento) es la que impide contabilizar dos veces una misma operación.
 */
import { createHash } from 'node:crypto';

export const ORIGENES = ['VENTA', 'COBRO_CXC', 'COMPRA', 'RECEPCION', 'PAGO_CXP', 'DEVOLUCION'] as const;
export type OrigenTipo = (typeof ORIGENES)[number];
export const EVENTOS = ['RECONOCIMIENTO', 'COSTO_VENTA', 'COBRO', 'FACTURA', 'RECEPCION', 'PAGO', 'DEVOLUCION', 'COSTO_DEVOLUCION'] as const;
export type Evento = (typeof EVENTOS)[number];

export interface OrigenAsiento { tipo: OrigenTipo; id: string; evento: Evento }

export const claveOrigen = (tenantId: string, o: OrigenAsiento) => `${tenantId}|${o.tipo}|${o.id}|${o.evento}`;

/** JSON canónico (claves ordenadas) para que la huella no dependa del orden de las propiedades. */
function canonico(valor: unknown): string {
  if (valor === null || typeof valor !== 'object') return JSON.stringify(valor ?? null);
  if (Array.isArray(valor)) return `[${valor.map(canonico).join(',')}]`;
  const o = valor as Record<string, unknown>;
  return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonico(o[k])}`).join(',')}}`;
}

/** Huella SHA-256 de lo que se leyó de la operación: permite detectar que cambió después de contabilizarla. */
export const huellaOrigen = (datos: unknown) => createHash('sha256').update(canonico(datos)).digest('hex');
