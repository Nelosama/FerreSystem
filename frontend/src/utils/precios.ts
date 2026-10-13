/**
 * Precios y aprobación para venta (solo administración).
 * Funciones puras: el margen mostrado es el mismo cálculo que el API devuelve como margenCalculado.
 */

export interface ProductoPrecio {
  id: string;
  codigo: string;
  nombre: string;
  descripcion?: string | null;
  categoriaNombre?: string | null;
  categoria?: { nombre?: string | null } | null;
  precioCosto: number;
  precioVenta: number;
  margenCalculado?: number | null;
  precioAprobado: boolean;
  precioAprobadoAt?: string | null;
  precioAprobadoPorNombre?: string | null;
  precioModificadoAt?: string | null;
  precioModificadoPorNombre?: string | null;
  stockActual: number;
  version: number;
  activo: boolean;
}

const texto = (valor: unknown) => (valor == null ? '' : String(valor).trim());
const numero = (valor: string) => Number(String(valor ?? '').trim());
const esNumero = (valor: string) => String(valor ?? '').trim() !== '' && Number.isFinite(numero(valor)) && numero(valor) >= 0;

/** Margen sobre el precio de venta, en porcentaje con dos decimales. Null si no hay precio de venta. */
export function margenCalculado(costo: number, venta: number): number | null {
  if (!(venta > 0)) return null;
  return Math.round(((venta - costo) / venta) * 10000) / 100;
}

/** Descripción y categoría presentes: el producto tiene datos suficientes para venderse. */
export function datosCompletos(producto: ProductoPrecio): boolean {
  const categoria = texto(producto.categoriaNombre ?? producto.categoria?.nombre);
  return texto(producto.descripcion) !== '' && categoria !== '';
}

export function precioPendiente(producto: ProductoPrecio): boolean {
  return !producto.precioAprobado;
}

/** Aprobar exige un precio de venta mayor que cero. */
export function puedeAprobar(venta: string): boolean {
  return esNumero(venta) && numero(venta) > 0;
}

/** Errores de los campos de precio, con clave para traducir. Vacío si son válidos. */
export function validarPrecios(costo: string, venta: string): { campo: 'costo' | 'venta'; motivo: 'numero' | 'negativo' }[] {
  const errores: { campo: 'costo' | 'venta'; motivo: 'numero' | 'negativo' }[] = [];
  if (!esNumero(costo)) errores.push({ campo: 'costo', motivo: String(costo ?? '').trim() === '' || !Number.isFinite(numero(costo)) ? 'numero' : 'negativo' });
  if (!esNumero(venta)) errores.push({ campo: 'venta', motivo: String(venta ?? '').trim() === '' || !Number.isFinite(numero(venta)) ? 'numero' : 'negativo' });
  return errores;
}

/** Solo los precios que cambian. `hayCambios` decide si hace falta una petición de guardado. */
export function cambiosDePrecio(original: ProductoPrecio, costo: string, venta: string): { payload: { precioCosto?: number; precioVenta?: number }; hayCambios: boolean } {
  const payload: { precioCosto?: number; precioVenta?: number } = {};
  if (esNumero(costo) && numero(costo) !== Number(original.precioCosto)) payload.precioCosto = numero(costo);
  if (esNumero(venta) && numero(venta) !== Number(original.precioVenta)) payload.precioVenta = numero(venta);
  return { payload, hayCambios: Object.keys(payload).length > 0 };
}
