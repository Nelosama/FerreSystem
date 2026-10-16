import type { ProductItem } from '../types';

// Índice del catálogo del POS. Se construye una vez por catálogo cargado (no en cada tecla ni en cada
// cambio del carrito) y conserva exactamente las reglas de búsqueda anteriores:
// - texto: nombre, código, código de fabricante y descripción sin distinguir mayúsculas; código de barras literal;
// - código exacto (Enter o escáner): código, código de barras o de fabricante, sin distinguir mayúsculas.

interface EntradaCatalogo {
  producto: ProductItem;
  nombre: string;
  codigo: string;
  fabricante?: string;
  descripcion?: string;
}

export interface IndiceCatalogo {
  entradas: EntradaCatalogo[];
  porCodigo: Map<string, ProductItem[]>;
  productos: ProductItem[];
}

export const indexarCatalogo = (productos: ProductItem[]): IndiceCatalogo => {
  const porCodigo = new Map<string, ProductItem[]>();
  const entradas = productos.map((producto) => {
    const codigos = new Set<string>();
    for (const c of [producto.codigo, producto.codigoBarras, producto.codigoFabricante]) {
      if (typeof c === 'string') codigos.add(c.toUpperCase());
    }
    for (const c of codigos) {
      const lista = porCodigo.get(c);
      if (lista) lista.push(producto); else porCodigo.set(c, [producto]);
    }
    return {
      producto,
      nombre: producto.nombre.toLowerCase(),
      codigo: producto.codigo.toLowerCase(),
      fabricante: producto.codigoFabricante?.toLowerCase(),
      descripcion: producto.descripcion?.toLowerCase(),
    };
  });
  return { entradas, porCodigo, productos };
};

/** Productos cuyo código, código de barras o código de fabricante coincide exactamente. */
export const buscarPorCodigo = (indice: IndiceCatalogo, codigo: string): ProductItem[] =>
  indice.porCodigo.get(codigo.toUpperCase()) ?? [];

/** Filtro de texto del catálogo; con búsqueda vacía devuelve todo el catálogo. */
export const filtrarCatalogo = (indice: IndiceCatalogo, busqueda: string): ProductItem[] => {
  if (!busqueda) return indice.productos;
  const b = busqueda.toLowerCase();
  const resultado: ProductItem[] = [];
  for (const e of indice.entradas) {
    if (e.nombre.includes(b) || e.codigo.includes(b) || e.producto.codigoBarras?.includes(busqueda)
      || e.fabricante?.includes(b) || e.descripcion?.includes(b)) resultado.push(e.producto);
  }
  return resultado;
};
