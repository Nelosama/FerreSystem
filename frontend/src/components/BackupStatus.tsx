import React from 'react';
import { api } from '../utils/api';
import { useTenant } from '../context/TenantContext';
import { startMaintenancePolling } from '../utils/maintenancePolling';

interface Execution {
  lastAttempt: string; success: boolean; errorCode?: string;
  restoreTested: boolean; alertDelivery?: string;
}
interface Status extends Partial<Execution> {
  configured: boolean; available?: boolean; stale?: boolean;
  encrypted?: boolean; destinationVerified?: boolean; lastSuccess?: string;
  history?: Execution[];
}
const stages: Record<string, string> = { RUNNING: 'En ejecución o interrumpido (revisar antigüedad)', DUMP: 'Lectura de base', UPLOAD: 'Almacenamiento remoto', INTEGRITY: 'Integridad', RESTORE: 'Restauración aislada', RETENTION: 'Retención' };
export const BackupStatus: React.FC = () => {
  const { user } = useTenant();
  const [status, setStatus] = React.useState<Status | null>(null);
  const [error, setError] = React.useState(false);
  React.useEffect(() => {
    setStatus(null); setError(false);
    if (user?.rol !== 'SUPERADMIN') return;
    return startMaintenancePolling(
      signal => api.get('/admin/maintenance/backup', { signal, timeout: 10000 }).then(response => response.data),
      next => { setStatus(next); setError(false); },
      () => { setStatus(null); setError(true); },
    );
  }, [user?.id, user?.rol]);
  if (user?.rol !== 'SUPERADMIN') return null;
  const healthy = status?.success && !status.stale && status.restoreTested && status.encrypted && status.destinationVerified;
  return <section className="industrial-card" style={{ marginBottom: 24, padding: 20 }} aria-label="Mantenimiento técnico">
    <h2>Respaldos y recuperación</h2>
    {!status && !error && <p role="status">Consultando estado…</p>}
    {error && <p role="alert">No se pudo consultar el servicio. Se reintentará automáticamente al recuperar conexión.</p>}
    {status && !status.configured && <p role="alert">Respaldo automático sin configurar. Requiere instalación técnica y prueba de restauración.</p>}
    {status?.configured && !status.available && <p role="alert">No hay evidencia disponible del trabajador de respaldos.</p>}
    {status?.available && <>
      <p role={healthy ? 'status' : 'alert'}>{healthy ? 'Copia cifrada recuperada y restauración técnica verificada.' : 'Protección pendiente de verificación o con incidencias.'}</p>
      {status.stale && <p role="alert">El trabajador no publica evidencia reciente. Revisar el monitor de infraestructura.</p>}
      <p>Último intento: {status.lastAttempt ? new Date(status.lastAttempt).toLocaleString('es-HN') : 'Sin registro'}</p>
      <p>Último ciclo completo exitoso: {status.lastSuccess ? new Date(status.lastSuccess).toLocaleString('es-HN') : 'Sin evidencia'}</p>
      {status.errorCode && <p>Etapa: {stages[status.errorCode] || 'Requiere revisión técnica'}</p>}
      {!status.encrypted && <p>No hay evidencia vigente de cifrado y destino remoto verificado.</p>}
      {!status.restoreTested && <p>Falta una restauración satisfactoria de la copia actual.</p>}
      {(!status.alertDelivery || ['unconfigured', 'failed'].includes(status.alertDelivery)) && <p role="alert">Alertas externas sin configurar o sin entrega confirmada.</p>}
      <details><summary>Historial de ejecuciones ({status.history?.length || 0})</summary>
        <ul>{status.history?.map((run, index) => <li key={`${run.lastAttempt}-${index}`}>
          {new Date(run.lastAttempt).toLocaleString('es-HN')} — {run.success ? 'Verificado' : stages[run.errorCode || ''] || 'Falló'}
        </li>)}</ul>
      </details>
    </>}
    <details><summary>Procedimiento de recuperación autorizada</summary>
      <p>El responsable técnico debe recuperar el snapshot en un entorno aislado, verificar integridad y conciliar datos por empresa. El cambio de producción requiere autorización expresa y ventana de mantenimiento.</p>
      <p>La recuperación se ejecuta desde infraestructura según docs/FS-41-RESPALDOS.md. Esta consola no permite descargar datos globales ni restaurar producción.</p>
    </details>
  </section>;
};
