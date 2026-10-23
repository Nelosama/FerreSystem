/** Rectángulo en coordenadas del viewport (lo que devuelve `getBoundingClientRect`). */
export interface RectViewport { top: number; bottom: number; left: number; right: number }
export interface PosicionMenu { top: number; left: number; maxHeight: number; arriba: boolean }

/**
 * Coloca un menú flotante junto a su botón sin salirse del viewport: debajo y alineado a la derecha del botón por
 * defecto; arriba si debajo no cabe y arriba hay más espacio; sin desbordar horizontalmente. Si ninguno de los dos
 * lados alcanza, usa el mayor y limita la altura (`maxHeight`) para que el menú se desplace por dentro.
 */
export function calcularPosicionMenu(
  ancla: RectViewport,
  menu: { ancho: number; alto: number },
  viewport: { ancho: number; alto: number },
  margen = 8,
  separacion = 6,
): PosicionMenu {
  const ancho = Math.min(menu.ancho, viewport.ancho - margen * 2);
  const espacioAbajo = viewport.alto - ancla.bottom - separacion - margen;
  const espacioArriba = ancla.top - separacion - margen;
  const arriba = menu.alto > espacioAbajo && espacioArriba > espacioAbajo;
  const disponible = Math.max(0, arriba ? espacioArriba : espacioAbajo);
  const alto = Math.min(menu.alto, disponible);
  const top = arriba ? ancla.top - separacion - alto : ancla.bottom + separacion;
  const izquierdaIdeal = ancla.right - ancho;
  const left = Math.min(Math.max(izquierdaIdeal, margen), viewport.ancho - margen - ancho);
  return { top, left, maxHeight: disponible, arriba };
}
