import React from 'react';
import { useI18n } from '../context/I18nContext';
import { useEstadoCaja } from '../hooks/useEstadoCaja';

/** Estado de la caja («abierta», «cerrada» o «sin verificar»). No se muestra fuera del proveedor de caja o sin módulo. */
export const EstadoCajaBadge: React.FC = () => {
  const { t } = useI18n();
  const estadoCaja = useEstadoCaja();
  if (!estadoCaja) return null;
  return (
    <span className={`app-caja-estado app-caja-estado--${estadoCaja.estado}`} aria-live="polite">
      <span className="app-caja-punto" aria-hidden="true" />
      {t(`topbar.caja_${estadoCaja.estado}`)}
    </span>
  );
};
