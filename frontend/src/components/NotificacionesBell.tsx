import React from 'react';
import { Bell, Check, X } from 'lucide-react';
import { useTenant } from '../context/TenantContext';
import { useNotification, type SolicitudDescuento } from '../context/NotificationContext';
import { useI18n } from '../context/I18nContext';
import { formatLempiras } from '../utils/format';

/**
 * Campana de notificaciones (solicitudes de descuento y transferencias entrantes). La comparten la barra
 * superior de los negocios y la del Super Admin, para que exista una sola implementación.
 */
export const NotificacionesBell: React.FC = () => {
  const { user, tenant } = useTenant();
  const { solicitudes, notificacionesTransferencia, responderSolicitud } = useNotification();
  const { t } = useI18n();
  const [panelNotificaciones, setPanelNotificaciones] = React.useState(false);

  // Verificar si el usuario tiene permiso para autorizar (ADMIN o permiso usuarios.gestionar)
  const puedeAutorizar =
    user?.rol === 'ADMIN' ||
    user?.rol === 'SUPERADMIN' ||
    user?.permisos?.includes('usuarios.gestionar') ||
    user?.permisos?.includes('pos.aplicar_descuento');

  // Filtrar notificaciones de transferencia para la sucursal activa actual
  const sucursalUsuarioActiva = tenant.sucursal || 'Sucursal Centro (Principal)';
  const transferenciasParaEstaSucursal = (notificacionesTransferencia || []).filter(
    (t) => t.sucursalDestino.toLowerCase().trim() === sucursalUsuarioActiva.toLowerCase().trim(),
  );

  const solicitudesPendientes = solicitudes.filter((s) => s.estado === 'PENDIENTE');
  const totalNotificacionesPendientes = solicitudesPendientes.length + transferenciasParaEstaSucursal.length;

  const handleResponder = (sol: SolicitudDescuento, decision: 'APROBADA' | 'RECHAZADA') => {
    responderSolicitud(sol.id, decision, user?.nombre || 'Administrador');
  };

  return (
    <>
        {(puedeAutorizar || transferenciasParaEstaSucursal.length > 0) && (
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setPanelNotificaciones(!panelNotificaciones)}
              style={styles.bellBtn}
              title={t('topbar.notifications_title')}
              aria-label={t('topbar.notifications_label')}
              aria-expanded={panelNotificaciones}
            >
              <Bell size={16} strokeWidth={2.5} />
              {totalNotificacionesPendientes > 0 && (
                <span style={styles.bellBadge}>{totalNotificacionesPendientes}</span>
              )}
            </button>

            {/* Panel Flotante de Notificaciones */}
            {panelNotificaciones && (
              <div style={styles.notifPanel} role="region" aria-label={t('topbar.notification_panel')}>
                <div style={styles.notifHeader}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '12px' }}>
                    {t('topbar.notifications')}{totalNotificacionesPendientes})
                  </div>
                  <button
                    type="button"
                    onClick={() => setPanelNotificaciones(false)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                    aria-label={t('topbar.close_notifications')}
                  >
                    <X size={16} />
                  </button>
                </div>

                <div style={styles.notifList}>
                  {/* Sección Transferencias Entrantes */}
                  {transferenciasParaEstaSucursal.length > 0 && (
                    <div style={{ backgroundColor: '#EFF6FF', padding: '8px 12px', borderBottom: '1.5px solid #BFDBFE' }}>
                      <div style={{ fontSize: '11px', fontWeight: 800, color: '#1D4ED8', textTransform: 'uppercase' }}>
                        {t('topbar.transfers')}{transferenciasParaEstaSucursal.length})
                      </div>
                      {transferenciasParaEstaSucursal.map((trf) => (
                        <div key={trf.id} style={{ marginTop: '6px', padding: '6px', backgroundColor: '#FFFFFF', borderRadius: '4px', border: '1px solid #93C5FD' }}>
                          <div style={{ fontSize: '12px', fontWeight: 800, color: '#1E40AF' }}>
                            {trf.productoNombre} (Cant: {trf.cantidad})
                          </div>
                          <div style={{ fontSize: '11px', color: '#475569' }}>
                            {t('topbar.from')} <strong>{trf.sucursalOrigen}</strong>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Sección Solicitudes Descuento */}
                  {solicitudes.length === 0 && transferenciasParaEstaSucursal.length === 0 ? (
                    <div style={{ padding: '16px', textAlign: 'center', fontSize: '12px', color: 'var(--color-text-muted)' }}>
                      {t('topbar.empty')}
                    </div>
                  ) : (
                    solicitudes.slice(0, 5).map((sol) => (
                      <div key={sol.id} style={styles.notifItem}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontWeight: 700, fontSize: '12px' }}>{sol.cajeroNombre}</span>
                          <span
                            className={`badge ${
                              sol.estado === 'PENDIENTE'
                                ? 'badge-warning'
                                : sol.estado === 'APROBADA'
                                  ? 'badge-success'
                                  : 'badge-danger'
                            }`}
                          >
                            {sol.estado}
                          </span>
                        </div>
                        <div style={{ fontSize: '11px', color: '#444' }}>
                          {t('topbar.sale_amount')} <strong>{formatLempiras(sol.totalOriginal)}</strong>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--color-primary-text)', fontWeight: 700 }}>
                          {t('topbar.discount')} {sol.descuentoPorcentaje}% (Monto con desc: {formatLempiras(sol.totalConDescuento)})
                        </div>

                        {sol.estado === 'PENDIENTE' && (
                          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                            <button
                              type="button"
                              onClick={() => handleResponder(sol, 'APROBADA')}
                              className="btn btn-primary btn-sm"
                              style={{ flex: 1, padding: '4px 8px', fontSize: '10px' }}
                            >
                              <Check size={12} /> {t('topbar.approve')}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleResponder(sol, 'RECHAZADA')}
                              className="btn btn-secondary btn-sm"
                              style={{ flex: 1, padding: '4px 8px', fontSize: '10px', color: '#DC2626' }}
                            >
                              <X size={12} /> {t('topbar.reject')}
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
    </>
  );
};

const styles: Record<string, React.CSSProperties> = {
  bellBtn: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '9px',
    backgroundColor: '#FFFFFF',
    border: '1.5px solid var(--color-border)',
    borderRadius: 'var(--radius-xs)',
    cursor: 'pointer',
  },
  bellBadge: {
    position: 'absolute',
    top: '-6px',
    right: '-6px',
    backgroundColor: '#DC2626',
    color: '#FFFFFF',
    fontFamily: 'var(--font-display)',
    fontWeight: 900,
    fontSize: '10px',
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1.5px solid #FFFFFF',
  },
  notifPanel: {
    position: 'absolute',
    top: '42px',
    right: 0,
    width: '320px',
    backgroundColor: '#FFFFFF',
    border: '2px solid var(--color-border)',
    borderRadius: 'var(--radius-xs)',
    boxShadow: '4px 4px 0px rgba(0,0,0,0.2)',
    zIndex: 1000,
  },
  notifHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    borderBottom: '1.5px solid var(--color-border)',
    backgroundColor: 'var(--color-bg)',
  },
  notifList: {
    maxHeight: '280px',
    overflowY: 'auto',
  },
  notifItem: {
    padding: '10px 12px',
    borderBottom: '1px solid #E7E5E4',
  },
};
