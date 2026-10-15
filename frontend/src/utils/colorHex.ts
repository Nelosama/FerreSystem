// Validación de colores de marca en formato hexadecimal de 6 dígitos (#RRGGBB).
// Devuelve el mensaje de error para mostrar junto al campo, o null si el valor es válido.
export function errorColorHex(valor: string): string | null {
  const limpio = valor.trim();
  if (limpio === '') return 'Indique un color en formato #RRGGBB.';
  if (!/^#[0-9A-Fa-f]{6}$/.test(limpio)) return 'El color debe tener la forma #RRGGBB (seis dígitos hexadecimales, por ejemplo #EA580C).';
  return null;
}
