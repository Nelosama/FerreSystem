import React from 'react';
import type { ReciboPDFProps } from './ReciboPDF';
import { logotipoDataUrl } from '../utils/logotipo';

// @react-pdf/renderer pesa ~1,2 MB: se descarga solo al generar el primer comprobante,
// no al abrir el POS ni Cotizaciones. Las llamadas siguientes reutilizan el módulo ya cargado.
const cargarGeneradorPDF = () => Promise.all([import('@react-pdf/renderer'), import('./ReciboPDF')]);

/** Adelanta la descarga del generador (p. ej. al acercar el puntero al botón de descarga). */
export const precargarGeneradorPDF = () => { void cargarGeneradorPDF().catch(() => undefined); };

/** Genera el PDF del comprobante con el logotipo ya resuelto y lo descarga. */
export const descargarReciboPDF = async (props: ReciboPDFProps, nombreArchivo: string) => {
  const [[{ pdf }, { ReciboPDF }], logoDataUrl] = await Promise.all([
    cargarGeneradorPDF(),
    props.tenant?.logotipo ? logotipoDataUrl('/tenant/logo', props.tenant.logotipo.actualizadoAt).catch(() => null) : null,
  ]);
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
