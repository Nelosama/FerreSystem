import { useEffect, useState } from 'react';
import { logotipoDataUrl } from '../utils/logotipo';

/** Devuelve la imagen del logotipo lista para mostrar, o null si no hay logotipo o no se pudo cargar. */
export function useLogotipoNegocio(endpoint: string | null, version: string | null) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!endpoint || !version) { setSrc(null); return; }
    let vivo = true;
    logotipoDataUrl(endpoint, version).then(valor => { if (vivo) setSrc(valor); });
    return () => { vivo = false; };
  }, [endpoint, version]);
  return src;
}
