import React from 'react';
import { Info } from 'lucide-react';
import { useI18n } from '../context/I18nContext';
import { evaluarColorMarca, variantesMarca } from '../utils/colorMarca';

/**
 * Variables CSS con las variantes legibles del color de un negocio concreto (vistas previas y listas del
 * Super Admin, donde el color no es el de la sesión): --tenant-color, --tenant-on-color y --tenant-text-color.
 */
export const estiloMarcaNegocio = (color: string | null | undefined): React.CSSProperties => {
  const v = variantesMarca(color || '#EA580C');
  return { '--tenant-color': v.primario, '--tenant-on-color': v.sobrePrimario, '--tenant-text-color': v.texto } as React.CSSProperties;
};

/**
 * Aviso al elegir el color de marca: no bloquea el guardado. Explica qué ajustará el sistema para que
 * botones, totales y enlaces sigan siendo legibles con ese color.
 */
export const AvisoColorMarca: React.FC<{ color: string; id?: string }> = ({ color, id }) => {
  const { t } = useI18n();
  const evaluacion = evaluarColorMarca(color);
  if (!evaluacion || (!evaluacion.textoOscuroEncima && !evaluacion.textoDeMarcaAjustado)) return null;
  const ajustes = [
    evaluacion.textoOscuroEncima && t('shell.brand.contrast_dark_text'),
    evaluacion.textoDeMarcaAjustado && t('shell.brand.contrast_darker_text'),
  ].filter(Boolean).join(' ');
  return (
    <p id={id} className="aviso-color-marca" role="status">
      <Info size={16} aria-hidden="true" />
      <span>
        <strong>{t('shell.brand.contrast_title', { ratio: evaluacion.contrasteBlanco.toFixed(1) })}</strong>{' '}
        {ajustes}
      </span>
    </p>
  );
};
