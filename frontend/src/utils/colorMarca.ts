// Variantes legibles del color de marca (WCAG 2.1 AA). El color del negocio no se modifica: se usa tal cual
// en fondos, bordes y acentos. Lo que se deriva es el texto que va encima de la marca y la versión del color
// para texto e iconos sobre superficies claras, oscurecida solo cuando el color original no alcanza el contraste.

export const TEXTO_CLARO = '#FFFFFF';
export const TEXTO_OSCURO = '#111827';
// Contraste mínimo para texto normal; los botones usan texto de 13-15 px, que no cuenta como texto grande.
export const CONTRASTE_TEXTO = 4.5;
// Superficies claras del diseño único sobre las que se escribe con el color de marca.
const SUPERFICIES_CLARAS = ['#FFFFFF', '#F4F5F7'];
// Tinte de marca (12 %) usado como fondo del elemento activo del menú.
const OPACIDAD_TINTE = 0.12;

type Rgb = [number, number, number];

const canales = (hex: string): Rgb | null => {
  const limpio = hex.trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(limpio)) return null;
  const n = parseInt(limpio.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const aHex = ([r, g, b]: Rgb) => '#' + [r, g, b].map(c => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('').toUpperCase();

const lineal = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };

/** Luminancia relativa (0 negro, 1 blanco). Un color no válido se trata como negro. */
export function luminancia(hex: string): number {
  const rgb = canales(hex);
  if (!rgb) return 0;
  return 0.2126 * lineal(rgb[0]) + 0.7152 * lineal(rgb[1]) + 0.0722 * lineal(rgb[2]);
}

/** Relación de contraste WCAG entre dos colores #RRGGBB (de 1 a 21). */
export function contraste(a: string, b: string): number {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (oscuro + 0.05);
}

/** Mezcla `color` sobre `fondo` con la opacidad indicada (0 a 1). */
export function mezclar(color: string, fondo: string, opacidad: number): string {
  const c = canales(color);
  const f = canales(fondo);
  if (!c || !f) return color;
  return aHex([0, 1, 2].map(i => c[i] * opacidad + f[i] * (1 - opacidad)) as Rgb);
}

/**
 * Texto para escribir encima del color de marca: blanco si es legible; si no, el gris casi negro del diseño.
 * En tonos medios donde ninguno llega a 4.5:1 se usa negro, que siempre alcanza al menos 4.58:1.
 */
export function colorSobreMarca(color: string): string {
  if (contraste(TEXTO_CLARO, color) >= CONTRASTE_TEXTO) return TEXTO_CLARO;
  if (contraste(TEXTO_OSCURO, color) >= CONTRASTE_TEXTO) return TEXTO_OSCURO;
  return contraste('#000000', color) > contraste(TEXTO_CLARO, color) ? '#000000' : TEXTO_CLARO;
}

/**
 * Color de marca para texto e iconos sobre superficies claras (blanco, fondo de página y tinte del menú activo).
 * Si el original ya es legible se devuelve igual; si no, se oscurece lo mínimo necesario conservando el tono.
 */
export function colorMarcaTexto(color: string): string {
  const rgb = canales(color);
  if (!rgb) return TEXTO_OSCURO;
  const fondos = [...SUPERFICIES_CLARAS, mezclar(color, TEXTO_CLARO, OPACIDAD_TINTE)];
  const legible = (hex: string) => fondos.every(f => contraste(hex, f) >= CONTRASTE_TEXTO);
  for (let factor = 1; factor >= 0; factor -= 0.02) {
    const candidato = aHex(rgb.map(c => c * factor) as Rgb);
    if (legible(candidato)) return factor === 1 ? color.trim().toUpperCase() : candidato;
  }
  return TEXTO_OSCURO;
}

/** Aclara (porcentaje positivo) u oscurece (negativo) cada canal, como los estados hover/activo previos. */
export function ajustarBrillo(color: string, porcentaje: number): string {
  const rgb = canales(color);
  if (!rgb) return color;
  const paso = Math.round(2.55 * porcentaje);
  return aHex(rgb.map(c => c + paso) as Rgb);
}

export interface VariantesMarca {
  primario: string;
  hover: string;
  activo: string;
  sobrePrimario: string;
  texto: string;
  tinte: string;
  borde: string;
}

/**
 * Todos los tokens derivados del color del negocio. Con texto claro encima, hover y activo oscurecen
 * (comportamiento anterior); con texto oscuro encima, aclaran, para no perder contraste al pasar el puntero.
 */
export function variantesMarca(color: string): VariantesMarca {
  const primario = canales(color) ? color.trim().toUpperCase() : '#EA580C';
  const sobrePrimario = colorSobreMarca(primario);
  const textoClaro = sobrePrimario === TEXTO_CLARO;
  return {
    primario,
    hover: ajustarBrillo(primario, textoClaro ? -15 : 10),
    activo: ajustarBrillo(primario, textoClaro ? -30 : 18),
    sobrePrimario,
    texto: colorMarcaTexto(primario),
    tinte: `${primario}1F`,
    borde: `${primario}59`,
  };
}

export interface EvaluacionColorMarca {
  /** Contraste del texto blanco sobre el color (botones principales con el aspecto clásico). */
  contrasteBlanco: number;
  /** El texto de botones y elementos activos se mostrará oscuro en lugar de blanco. */
  textoOscuroEncima: boolean;
  /** Los textos e iconos con el color de marca se oscurecerán sobre fondos claros. */
  textoDeMarcaAjustado: boolean;
  /** Color que se usará para textos de marca sobre fondo claro. */
  colorTexto: string;
}

/** Diagnóstico para avisar al configurar la marca. No bloquea: el negocio puede conservar su color. */
export function evaluarColorMarca(color: string): EvaluacionColorMarca | null {
  if (!canales(color)) return null;
  const v = variantesMarca(color);
  return {
    contrasteBlanco: Math.round(contraste(TEXTO_CLARO, v.primario) * 100) / 100,
    textoOscuroEncima: v.sobrePrimario !== TEXTO_CLARO,
    textoDeMarcaAjustado: v.texto !== v.primario,
    colorTexto: v.texto,
  };
}
