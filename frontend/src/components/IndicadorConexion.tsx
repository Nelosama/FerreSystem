import React from 'react';
import { WifiOff } from 'lucide-react';
import { useConexion } from '../hooks/useConexion';
import { useI18n } from '../context/I18nContext';

/**
 * Estado de la conexión y ventas de contingencia por enviar. Lo comparten el menú lateral (pie) y el superior
 * (cabecera), para que en ningún modo de navegación quede oculta la contingencia. Solo informa.
 */
export const IndicadorConexion: React.FC<{ compacto?: boolean }> = ({ compacto = false }) => {
  const { t } = useI18n();
  const { enLinea, ventasPorEnviar } = useConexion();
  return (
    <div className={`jowa-connection${enLinea ? '' : ' offline'}${compacto ? ' jowa-connection--compacta' : ''}`} aria-live="polite" title={t('navigation.connection_status')}>
      {enLinea ? <span className="jowa-connection-dot" aria-hidden="true" /> : <WifiOff size={16} aria-hidden="true" />}
      <span>
        <strong>{t(enLinea ? 'navigation.online' : 'navigation.offline')}</strong>
        {ventasPorEnviar > 0 && <> · {t('navigation.pending_sales', { count: ventasPorEnviar })}</>}
      </span>
    </div>
  );
};
