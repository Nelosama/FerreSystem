import React from 'react';
import type { SyncSnapshot } from '../utils/autoRefresh';
import { formatHoraSincronizacion } from '../utils/autoRefresh';
import './SyncStatus.css';

// Indicador discreto de conexión y última sincronización. Solo informa: no ofrece botón de actualizar.
export const SyncStatus: React.FC<{ sync: SyncSnapshot }> = ({ sync }) => {
  const { phase, lastSync } = sync;
  const hora = lastSync ? formatHoraSincronizacion(lastSync) : null;
  const texto =
    phase === 'offline' ? 'Sin conexión · se actualizará al recuperar la red'
    : phase === 'error' ? 'No se pudo actualizar · reintento automático'
    : phase === 'loading' ? 'Actualizando…'
    : hora ? `Actualizado ${hora}`
    : 'Cargando…';
  const estado = phase === 'offline' || phase === 'error' ? 'alerta' : phase === 'ok' ? 'ok' : 'neutral';
  return (
    <p className={`sync-status sync-status--${estado}`} role="status" aria-live="polite">
      <span className="sync-status__punto" aria-hidden="true" />
      {texto}
    </p>
  );
};
