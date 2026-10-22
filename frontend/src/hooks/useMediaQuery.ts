import { useSyncExternalStore } from 'react';

/** Coincidencia de una media query, actualizada al cambiar el tamaño de la ventana. Sin `matchMedia`, devuelve false. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (avisar) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const lista = window.matchMedia(query);
      lista.addEventListener('change', avisar);
      return () => lista.removeEventListener('change', avisar);
    },
    () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(query).matches,
    () => false,
  );
}
