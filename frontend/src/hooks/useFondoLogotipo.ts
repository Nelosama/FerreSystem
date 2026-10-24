import { useEffect, useState } from 'react';
import { fondoParaLogotipo, type FondoLogotipo } from '../utils/fondoLogotipo';

const LADO = 32;

/** Superficie neutra recomendada para un logotipo ya cargado (`claro` mientras se mide o si no se puede leer). */
export function useFondoLogotipo(src: string | null): FondoLogotipo {
  // El resultado se asocia a la imagen medida: si cambia el logotipo, vale `claro` hasta medir el nuevo.
  const [medido, setMedido] = useState<{ origen: string; fondo: FondoLogotipo } | null>(null);
  useEffect(() => {
    if (!src) return;
    let vivo = true;
    const imagen = new Image();
    imagen.onload = () => {
      try {
        const lienzo = document.createElement('canvas');
        lienzo.width = LADO;
        lienzo.height = LADO;
        const contexto = lienzo.getContext('2d', { willReadFrequently: true });
        if (!contexto || !imagen.naturalWidth || !imagen.naturalHeight) return;
        // La miniatura se estira al cuadrado: solo cuenta la transparencia propia de la imagen, no el margen de encuadre.
        contexto.drawImage(imagen, 0, 0, LADO, LADO);
        const datos = contexto.getImageData(0, 0, LADO, LADO).data;
        if (vivo) setMedido({ origen: src, fondo: fondoParaLogotipo(datos) });
      } catch {
        /* sin lectura de píxeles se conserva el marco claro */
      }
    };
    imagen.src = src;
    return () => { vivo = false; };
  }, [src]);
  return src && medido?.origen === src ? medido.fondo : 'claro';
}
