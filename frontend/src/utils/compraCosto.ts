export interface LineaCompraValida { cantidad: number; costo: number }

const centavos = (valor: number) => Math.abs(Math.round(valor * 100) - valor * 100) < 1e-6;

/** Valida cantidad y costo capturados para una línea de compra; devuelve un mensaje en español si son inválidos. */
export function validarLineaCompra(cantidad: string, costo: string): { error: string } | { linea: LineaCompraValida } {
  if (costo.trim() === '') return { error: 'Escriba el costo de esta compra. Un costo vacío no se registra como cero.' };
  const c = Number(costo);
  const q = Number(cantidad);
  if (!Number.isFinite(q) || q <= 0) return { error: 'La cantidad debe ser mayor que cero.' };
  if (!Number.isFinite(c) || c < 0) return { error: 'El costo debe ser un número mayor o igual a cero.' };
  if (!centavos(c)) return { error: 'El costo admite como máximo 2 decimales.' };
  if (!centavos(q)) return { error: 'La cantidad admite como máximo 2 decimales.' };
  return { linea: { cantidad: q, costo: c } };
}

/** Costo sugerido desde el catálogo: redondeado a centavos; vacío si no hay costo conocido. */
export function costoSugerido(precioCosto: unknown): string {
  if (precioCosto === null || precioCosto === undefined || precioCosto === '') return '';
  const n = Number(precioCosto);
  return Number.isFinite(n) && n >= 0 ? String(Math.round(n * 100) / 100) : '';
}
