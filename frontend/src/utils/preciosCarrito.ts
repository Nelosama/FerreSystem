// Precios vigentes del carrito del POS. Sin dependencias: se prueba aislada (test/pos-precios-vigentes.test.mjs).
// El catálogo comercial solo trae productos vendibles: una línea cuyo producto ya no aparece no se puede cobrar.

export interface LineaConPrecio {
  productoId: string;
  nombre: string;
  precioUnitario: number;
}

export interface ProductoVigente {
  id: string;
  precioVenta: number;
}

export interface CambioPrecio {
  productoId: string;
  nombre: string;
  anterior: number;
  nuevo: number;
}

export interface ResultadoPreciosVigentes<T> {
  /** El mismo arreglo si no hubo cambios, para no provocar renders ni escrituras del borrador. */
  carrito: T[];
  cambios: CambioPrecio[];
  /** Nombres de líneas cuyo producto ya no está en el catálogo de venta. */
  noDisponibles: string[];
}

const centavos = (valor: number) => Math.round(Number(valor) * 100);

export function aplicarPreciosVigentes<T extends LineaConPrecio>(carrito: T[], catalogo: ProductoVigente[]): ResultadoPreciosVigentes<T> {
  const precios = new Map(catalogo.map(p => [p.id, Number(p.precioVenta)]));
  const cambios: CambioPrecio[] = [];
  const noDisponibles: string[] = [];
  const actualizado = carrito.map(linea => {
    const vigente = precios.get(linea.productoId);
    if (vigente === undefined) { noDisponibles.push(linea.nombre); return linea; }
    if (centavos(vigente) === centavos(linea.precioUnitario)) return linea;
    cambios.push({ productoId: linea.productoId, nombre: linea.nombre, anterior: Number(linea.precioUnitario), nuevo: vigente });
    return { ...linea, precioUnitario: vigente };
  });
  return { carrito: cambios.length ? actualizado : carrito, cambios, noDisponibles };
}
