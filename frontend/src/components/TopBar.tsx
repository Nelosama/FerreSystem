import { TenantBrand } from './TenantBrand';
import React from 'react';
import { Calendar, Clock, UserCheck, LogOut, Bell, Check, X, ShieldAlert, GitBranch } from 'lucide-react';
import { useTenant } from '../context/TenantContext';
import { useNotification, type SolicitudDescuento } from '../context/NotificationContext';
import { useI18n } from '../context/I18nContext';
import { useSucursales } from '../hooks/useSucursales';
import { useNavigate } from 'react-router-dom';
import { formatLempiras } from '../utils/format';

interface TopBarProps {
  title: string;
  subtitle?: string;
}

export const TopBar: React.FC<TopBarProps> = ({
  title,
  subtitle,
}) => {
  const { user, tenant, isImpersonating, isReadOnly, enableEditMode, stopImpersonating, switchSucursal, logout } = useTenant();
  const [modalConfirmEditMode, setModalConfirmEditMode] = React.useState(false);
  const { solicitudes, notificacionesTransferencia, responderSolicitud } = useNotification();
  const { locale, setLocale, t } = useI18n();
  const navigate = useNavigate();

  const [panelNotificaciones, setPanelNotificaciones] = React.useState(false);
  const sucursalesDisponibles = useSucursales();

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

  // Formato de fecha del día de hoy generado dinámicamente en español
  const getDynamicDate = () => {
    const date = new Date();
    const day = date.getDate();
    const monthNames = locale === 'es' ? ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'] : ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const month = monthNames[date.getMonth()];
    const year = date.getFullYear();
    return `${t('topbar.today')}, ${day} ${month} ${year}`;
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="v2-topbar" style={styles.header}>
      {/* Banner de Modo Soporte Técnico (Impersonación de Super Admin) */}
      {isImpersonating && (
        <div style={styles.supportBanner}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <ShieldAlert size={18} color="#9A3412" />
            <span style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', color: '#9A3412' }}>
              {t('topbar.support', { name: tenant.nombreComercial })}
              {t(isReadOnly ? 'topbar.read_only' : 'topbar.edit_enabled')}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {isReadOnly && (
              <button
                type="button"
                onClick={() => setModalConfirmEditMode(true)}
                className="btn btn-sm"
                style={{ backgroundColor: '#DC2626', color: '#FFFFFF', fontWeight: 800, fontSize: '11px', border: '1px solid #991B1B' }}
              >
                {t('topbar.activate_edit')}
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                stopImpersonating();
                navigate('/admin');
              }}
              className="btn btn-sm"
              style={styles.exitSupportBtn}
            >
              <LogOut size={13} /> {t('topbar.exit_support')}
            </button>
          </div>
        </div>
      )}

      {/* Modal Confirmación Activar Modo Edición */}
      {modalConfirmEditMode && (
        <div style={styles.modalOverlay}>
          <div className="industrial-card" style={{ width: '100%', maxWidth: '450px', backgroundColor: '#FFFFFF', padding: '20px' }}>
            <div style={{ paddingBottom: '10px', borderBottom: '2px solid var(--color-border)', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '15px' }}>
              {t('topbar.confirm_edit')}
            </div>

            <div style={{ padding: '16px 0', fontSize: '13px', color: '#444' }}>
              {t('topbar.confirm_help')}
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setModalConfirmEditMode(false)}
              >
                {t('topbar.cancel')}
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                style={{ backgroundColor: '#DC2626', borderColor: '#991B1B', fontWeight: 800 }}
                onClick={async () => {
                  try {
                    await enableEditMode();
                    setModalConfirmEditMode(false);
                  } catch {
                    alert(t('topbar.edit_failed'));
                  }
                }}
              >
                {t('topbar.confirm_activate')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="v2-topbar-title" style={styles.titleContainer}>{tenant.templateVersion === 'v2' && <TenantBrand />}
        <div style={styles.headingWrapper}>
          <h1 style={styles.mainTitle}>{title}</h1>
          <div style={styles.accentUnderline} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div className="topbar-desktop-only" style={styles.shiftInfo}>
            <Clock size={14} strokeWidth={2.4} style={{ color: 'var(--color-text-muted)' }} />
            <span>{subtitle ?? t('topbar.guidance')}</span>
          </div>

          {/* Selector de Sucursales (Para clientes multi-sucursal) */}
          {user?.rol === 'ADMIN' && (
            <div className="topbar-desktop-only" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <GitBranch size={13} color="var(--color-primary)" />
              <select
                value={tenant.sucursal || 'Sucursal Principal'}
                disabled={sucursalesDisponibles.length < 2}
                onChange={(e) => switchSucursal(e.target.value, tenant.id)}
                className="v2-branch-select" style={styles.sucursalSelect}
                aria-label={t('topbar.select_branch')}
              >
                {sucursalesDisponibles.map((s: any) => (
                  <option key={s.id} value={s.nombre}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      <div style={styles.actionsContainer}>
        {/* Campana de Notificaciones (Solicitudes & Transferencias) */}
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
                        <div style={{ fontSize: '11px', color: 'var(--color-primary)', fontWeight: 700 }}>
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

        {/* Selector de Idioma Global ES / EN */}
        <div className="topbar-desktop-only" style={{ display: 'flex', alignItems: 'center', backgroundColor: '#FFFFFF', border: '1.5px solid var(--color-border)', borderRadius: 'var(--radius-xs)', padding: '2px' }}>
          <button
            type="button"
            onClick={() => setLocale('es')}
            style={{
              padding: '4px 8px',
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: '11px',
              border: 'none',
              borderRadius: '2px',
              backgroundColor: locale === 'es' ? 'var(--color-primary)' : 'transparent',
              color: locale === 'es' ? '#FFFFFF' : '#44403C',
              cursor: 'pointer',
            }}
          >
            ES
          </button>
          <button
            type="button"
            onClick={() => setLocale('en')}
            style={{
              padding: '4px 8px',
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: '11px',
              border: 'none',
              borderRadius: '2px',
              backgroundColor: locale === 'en' ? 'var(--color-primary)' : 'transparent',
              color: locale === 'en' ? '#FFFFFF' : '#44403C',
              cursor: 'pointer',
            }}
          >
            EN
          </button>
        </div>

        {/* Badge de Fecha Oficial */}
        <div className="v2-date-badge" style={styles.dateBadge}>
          <Calendar size={15} strokeWidth={2.5} />
          <span>{getDynamicDate()}</span>
        </div>

        {/* Info Cajero/Admin y Botón de Cerrar Sesión */}
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="v2-user-badge" style={styles.userBadge}>
              <UserCheck size={14} strokeWidth={2.4} color="var(--color-primary)" />
              <span>{user.nombre}</span>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              style={styles.logoutBtn}
              title={t('topbar.logout_title')}
            >
              <LogOut size={14} strokeWidth={2.4} />
              <span>{t('topbar.logout')}</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

const styles: Record<string, React.CSSProperties> = {
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: '24px 32px 18px',
    backgroundColor: 'var(--color-bg)',
    borderBottom: '2px solid var(--color-border)',
    flexWrap: 'wrap',
    gap: '16px',
    position: 'relative',
  },
  supportBanner: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFEDD5',
    border: '2px solid #EA580C',
    padding: '10px 16px',
    borderRadius: 'var(--radius-xs)',
    marginBottom: '8px',
  },
  exitSupportBtn: {
    backgroundColor: '#EA580C',
    color: '#FFFFFF',
    fontWeight: 800,
    fontSize: '11px',
    border: '1px solid #C2410C',
  },
  sucursalSelect: {
    padding: '3px 8px',
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '11px',
    border: '1.5px solid var(--color-border)',
    borderRadius: 'var(--radius-xs)',
    backgroundColor: '#FFFFFF',
    cursor: 'pointer',
  },
  titleContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  headingWrapper: {
    display: 'inline-block',
    position: 'relative',
  },
  mainTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '28px',
    fontWeight: 900,
    letterSpacing: '-0.02em',
    textTransform: 'uppercase',
    color: 'var(--color-text-main)',
    margin: 0,
    paddingBottom: '4px',
  },
  accentUnderline: {
    width: '100%',
    height: '4px',
    backgroundColor: 'var(--color-primary)',
    borderRadius: '1px',
  },
  shiftInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontFamily: 'var(--font-body)',
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--color-text-muted)',
  },
  actionsContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginTop: '4px',
  },
  dateBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: 'var(--color-sidebar-bg)',
    color: 'var(--color-bg)',
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: '12px',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    padding: '10px 14px',
    border: '2px solid var(--color-border)',
    borderRadius: 'var(--radius-xs)',
    boxShadow: '2px 2px 0px var(--color-border)',
  },
  userBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: '#FFFFFF',
    color: 'var(--color-text-main)',
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '11px',
    letterSpacing: '0.03em',
    padding: '8px 12px',
    border: '1.5px solid var(--color-border)',
    borderRadius: 'var(--radius-xs)',
  },
  logoutBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    backgroundColor: '#FEE2E2',
    color: '#991B1B',
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: '11px',
    letterSpacing: '0.03em',
    padding: '8px 12px',
    border: '1.5px solid #EF4444',
    borderRadius: 'var(--radius-xs)',
    cursor: 'pointer',
    transition: 'all 150ms ease',
  },
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
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.65)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1100,
    padding: '20px',
  },
};
