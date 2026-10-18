/** Formato de impresión de facturas, recibos y tickets del negocio. Lo configura solo el SUPERADMIN. */
export type FormatoImpresion = 'A4' | 'ROLLO_80MM' | 'ROLLO_58MM';

export const FORMATOS_IMPRESION: { valor: FormatoImpresion; etiqueta: string; descripcion: string }[] = [
  { valor: 'A4', etiqueta: 'Hoja A4', descripcion: 'Facturas y recibos en hoja tamaño carta/A4, con encabezado completo.' },
  { valor: 'ROLLO_80MM', etiqueta: 'Papel de rollo 80 mm', descripcion: 'Tickets para impresora térmica de 80 mm (el formato más común en caja).' },
  { valor: 'ROLLO_58MM', etiqueta: 'Papel de rollo 58 mm', descripcion: 'Tickets para impresora térmica angosta de 58 mm.' },
];

/** Puntos PDF (1 pt = 1/72 in). 80 mm ≈ 226.77 pt; 58 mm ≈ 164.41 pt. */
const ANCHO_ROLLO_PT: Record<Exclude<FormatoImpresion, 'A4'>, number> = { ROLLO_80MM: 226.77, ROLLO_58MM: 164.41 };

export const esFormatoRollo = (formato: FormatoImpresion | undefined) => formato === 'ROLLO_80MM' || formato === 'ROLLO_58MM';

/**
 * Tamaño de página para react-pdf. En rollo la longitud depende del contenido: se estima por líneas
 * (la impresora corta al final de la nota) con un mínimo para que el encabezado nunca quede cortado.
 */
export function tamanoPaginaRecibo(formato: FormatoImpresion | undefined, lineas: number): 'A4' | [number, number] {
  if (!esFormatoRollo(formato)) return 'A4';
  const alto = Math.max(360, 300 + lineas * 16);
  return [ANCHO_ROLLO_PT[formato as Exclude<FormatoImpresion, 'A4'>], alto];
}

/** Ancho CSS del ticket imprimible en pantalla y en el navegador. */
export function anchoTicketCss(formato: FormatoImpresion | undefined): { width: string; maxWidth: string } {
  if (formato === 'ROLLO_80MM') return { width: '80mm', maxWidth: '80mm' };
  if (formato === 'ROLLO_58MM') return { width: '58mm', maxWidth: '58mm' };
  return { width: '100%', maxWidth: '210mm' };
}

/** Valor de `@page { size }` para imprimir en el papel configurado. */
export const tamanoPaginaImpresion = (formato: FormatoImpresion | undefined, lineas = 0): string => {
  if (!esFormatoRollo(formato)) return 'A4';
  // CSS size accepts two lengths, never '80mm auto' (silently discarded).
  // Reuse the PDF height estimate, including space for header and totals.
  const [, alto] = tamanoPaginaRecibo(formato, lineas + 22) as [number, number];
  return `${formato === 'ROLLO_80MM' ? 80 : 58}mm ${(alto * 25.4 / 72).toFixed(2)}mm`;
};
