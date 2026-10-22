import React from 'react';
import { Info } from 'lucide-react';
import { useI18n } from '../context/I18nContext';
import { evaluarColorMarca } from '../utils/colorMarca';

/**
 * Aviso al elegir el color de marca: no bloquea el guardado. Explica qué ajustará el sistema para que
 * botones, totales y enlaces sigan siendo legibles con ese color.
 */
export const AvisoColorMarca: React.FC<{ color: string | null | undefined; id?: string }> = ({ color, id }) => {
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
