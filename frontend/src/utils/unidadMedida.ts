// Valores de API estables aunque el selector muestre unidades en español o inglés.
export const normalizarUnidadMedida = (value: string): string => {
  const key = value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const aliases: Record<string, string> = {
    UNIT: 'UNIDAD', BOX: 'CAJA', METER: 'METRO', GALLON: 'GALON',
    LITER: 'LITRO', PACK: 'PAQUETE', POUND: 'LIBRA', FOOT: 'PIE',
    FRASCO: 'OTRO', BOTTLE: 'OTRO', SACO: 'OTRO', BAG: 'OTRO',
    LB: 'LIBRA', QUINTAL: 'OTRO', CWT: 'OTRO', BLISTER: 'OTRO',
    RESMA: 'OTRO', REAM: 'OTRO', PALLET: 'OTRO', JUEGO: 'OTRO', SET: 'OTRO',
  };
  return aliases[key] || key;
};

// El CSV y el inventario usan las mismas doce unidades de la API; no se convierten cantidades.
export const UNIDADES_INVENTARIO = [
  'UNIDAD', 'PIE', 'METRO', 'METRO_CUADRADO', 'METRO_CUBICO', 'LIBRA',
  'KG', 'GALON', 'LITRO', 'CAJA', 'PAQUETE', 'OTRO',
] as const;

/** Nombre legible de cada unidad; el valor que se guarda y se envía a la API no cambia. */
export const ETIQUETA_UNIDAD: Record<string, string> = {
  UNIDAD: 'Unidad', PIE: 'Pie', METRO: 'Metro', METRO_CUADRADO: 'Metro cuadrado (m²)', METRO_CUBICO: 'Metro cúbico (m³)',
  LIBRA: 'Libra', KG: 'Kilogramo (kg)', GALON: 'Galón', LITRO: 'Litro', CAJA: 'Caja', PAQUETE: 'Paquete', OTRO: 'Otra',
};
export const etiquetaUnidad = (valor: string): string => ETIQUETA_UNIDAD[valor] ?? valor;

export const unidadCsvValida = (value: string): boolean =>
  (UNIDADES_INVENTARIO as readonly string[]).includes(normalizarUnidadMedida(value));
