/**
 * Elige la superficie neutra sobre la que se muestra un logotipo en el rail. La imagen original nunca se modifica:
 * solo se decide si el marco es claro (lo habitual) u oscuro (logotipos claros con fondo transparente, que sobre blanco
 * desaparecerían). Función pura sobre los píxeles RGBA de una miniatura; sin navegador.
 */
export type FondoLogotipo = 'claro' | 'oscuro';

/** Fracción mínima de píxeles transparentes para considerar que el logotipo no trae fondo propio. */
const MINIMO_TRANSPARENTE = 0.15;
/** Luminancia relativa (0–1) desde la cual el trazo visible se considera claro. */
const UMBRAL_CLARO = 0.72;

const canal = (valor: number) => {
  const c = valor / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

export function fondoParaLogotipo(pixeles: ArrayLike<number>): FondoLogotipo {
  let visibles = 0;
  let transparentes = 0;
  let luminancia = 0;
  for (let i = 0; i + 3 < pixeles.length; i += 4) {
    const alfa = pixeles[i + 3] / 255;
    if (alfa < 0.5) { transparentes += 1; continue; }
    visibles += 1;
    luminancia += 0.2126 * canal(pixeles[i]) + 0.7152 * canal(pixeles[i + 1]) + 0.0722 * canal(pixeles[i + 2]);
  }
  const total = visibles + transparentes;
  if (total === 0 || visibles === 0) return 'claro';
  const sinFondoPropio = transparentes / total >= MINIMO_TRANSPARENTE;
  return sinFondoPropio && luminancia / visibles >= UMBRAL_CLARO ? 'oscuro' : 'claro';
}
