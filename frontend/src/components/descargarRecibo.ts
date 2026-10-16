import React from 'react';
import { pdf } from '@react-pdf/renderer';
import { ReciboPDF, type ReciboPDFProps } from './ReciboPDF';
import { logotipoDataUrl } from '../utils/logotipo';

/** Genera el PDF del comprobante con el logotipo ya resuelto y lo descarga. */
export const descargarReciboPDF = async (props: ReciboPDFProps, nombreArchivo: string) => {
  const logoDataUrl = props.tenant?.logotipo ? await logotipoDataUrl('/tenant/logo', props.tenant.logotipo.actualizadoAt).catch(() => null) : null;
  const doc = React.createElement(ReciboPDF, { ...props, logoDataUrl }) as unknown as Parameters<typeof pdf>[0];
  const blob = await pdf(doc).toBlob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nombreArchivo;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
