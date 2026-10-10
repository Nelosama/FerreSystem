/**
 * Flujo de compras: cálculo y validación puros (sin red ni estado de React).
 * El backend vuelve a validar todo; estas reglas evitan enviar datos que sabemos inválidos.
 */

export interface LineaCompra { productoId: string; nombre: string; cantidad: number; costo: number }
export interface LineaRecibida { detalleId: string; pedida: number; recibida: number }

const centavos = (valor: number) => Math.abs(Math.round(valor * 100) - valor * 100) < 1e-6;

/** Subtotal de líneas y total con impuesto, en centavos enteros para no acumular errores de punto flotante. */
export function totalesCompra(lineas: LineaCompra[], isv: number): { subtotal: number; total: number } {
  const subtotalCentavos = lineas.reduce((acc, l) => acc + Math.round(l.cantidad * 100) * Math.round(l.costo * 100) / 100, 0);
  const subtotal = Math.round(subtotalCentavos) / 100;
  return { subtotal, total: Math.round((subtotal + (Number(isv) || 0)) * 100) / 100 };
}

/** Pendiente de recibir por línea (nunca negativo). */
export const pendienteLinea = (linea: { cantidad: number; cantidad_recibida: number }) =>
  Math.max(0, Math.round((Number(linea.cantidad) - Number(linea.cantidad_recibida)) * 100) / 100);

/** Estado visible de una compra según sus líneas. */
export function estadoRecepcion(orden: { estado: string; items: { cantidad: number; cantidad_recibida: number }[] }): 'PENDIENTE' | 'PARCIAL' | 'RECIBIDA' {
  if (orden.estado === 'RECIBIDA' || orden.items.every(i => pendienteLinea(i) === 0)) return 'RECIBIDA';
  if (orden.items.some(i => Number(i.cantidad_recibida) > 0)) return 'PARCIAL';
  return 'PENDIENTE';
}

/** Valida la compra antes de confirmarla. Devuelve una clave de mensaje o null. */
export function validarCompra(opciones: { proveedorId: string; factura: string; lineas: LineaCompra[]; isv: string }): string | null {
  if (!opciones.proveedorId) return 'seleccione_proveedor';
  if (!opciones.factura.trim()) return 'factura_requerida';
  if (opciones.lineas.length === 0) return 'agregue_productos';
  const isv = Number(opciones.isv);
  if (opciones.isv.trim() === '' || !Number.isFinite(isv) || isv < 0 || !centavos(isv)) return 'isv_invalido';
  for (const l of opciones.lineas) {
    if (!Number.isFinite(l.cantidad) || l.cantidad <= 0 || !centavos(l.cantidad)) return 'cantidad_invalida';
    if (!Number.isFinite(l.costo) || l.costo < 0 || !centavos(l.costo)) return 'costo_invalido';
  }
  return null;
}

/** Valida lo que se va a recibir: entre 0 y lo pendiente, sin superar lo autorizado. */
export function validarRecepcion(lineas: LineaRecibida[]): string | null {
  const cantidades = lineas.filter(l => l.recibida !== 0);
  if (cantidades.length === 0) return 'recepcion_vacia';
  for (const l of lineas) {
    if (!Number.isFinite(l.recibida) || l.recibida < 0 || !centavos(l.recibida)) return 'cantidad_invalida';
    if (l.recibida > l.pedida) return 'excede_pendiente';
  }
  return null;
}
