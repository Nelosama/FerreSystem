import React from 'react';
import { Calendar, Clock, UserCheck, LogOut, Bell, Check, X, ShieldAlert, GitBranch } from 'lucide-react';
import { useTenant } from '../context/TenantContext';
import { useNotification, type SolicitudDescuento } from '../context/NotificationContext';
import { useNavigate } from 'react-router-dom';
import { formatLempiras } from '../utils/format';

interface TopBarProps {
  title: string;
  subtitle?: string;
}

export const TopBar: React.FC<TopBarProps> = ({
  title,
  subtitle = 'Turno Actual: 08:00 AM - 05:00 PM',
}) => {
  const { user, tenant, isImpersonating, stopImpersonating, switchSucursal, logout } = useTenant();
  const { solicitudes, responderSolicitud } = useNotification();
  const navigate = useNavigate();

  const [panelNotificaciones, setPanelNotificaciones] = React.useState(false);

  // Cargar dinámicamente las sucursales creadas por el Super Admin para esta empresa
  const sucursalesDisponibles = React.useMemo(() => {
    const defaultList = [
      { id: 'suc-1', nombre: 'Sucursal Centro (Principal)' },
      { id: 'suc-2', nombre: 'Sucursal San Pedro (Norte)' },
      { id: 'suc-3', nombre: 'Sucursal Choluteca (Sur)' },
    ];

    const saasTenantsRaw = localStorage.getItem('ferre_saas_tenants');
    if (saasTenantsRaw) {
      try {
        const saasTenants = JSON.parse(saasTenantsRaw);
        const match = saasTenants.find(
          (t: any) => t.id === tenant.id || t.nombreComercial === tenant.nombreComercial,
        );
        if (match && match.sucursalesList && match.sucursalesList.length > 0) {
          return match.sucursalesList.map((s: any) => ({
            id: s.id,
            nombre: s.nombre,
          }));
        }
      } catch (e) {
        // Fallback
      }
    }
    return defaultList;
  }, [tenant.id, tenant.nombreComercial]);

  // Verificar si el usuario tiene permiso para autorizar (ADMIN o permiso usuarios.gestionar)
  const puedeAutorizar =
    user?.rol === 'ADMIN' ||
    user?.rol === 'SUPERADMIN' ||
    user?.permisos?.includes('usuarios.gestionar') ||
    user?.permisos?.includes('pos.aplicar_descuento');

  const solicitudesPendientes = solicitudes.filter((s) => s.estado === 'PENDIENTE');

  const handleResponder = (sol: SolicitudDescuento, decision: 'APROBADA' | 'RECHAZADA') => {
    responderSolicitud(sol.id, decision, user?.nombre || 'Administrador');
  };

  // Formato de fecha del día de hoy generado dinámicamente en español
  const getDynamicDate = () => {
    const date = new Date();
    const day = date.getDate();
    const monthNames = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
    const month = monthNames[date.getMonth()];
    const year = date.getFullYear();
    return `HOY, ${day} ${month} ${year}`;
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header style={styles.header}>
      {/* Banner de Modo Soporte Técnico (Impersonación de Super Admin) */}
      {isImpersonating && (
        <div style={styles.supportBanner}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ShieldAlert size={18} color="#9A3412" />
            <span style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', color: '#9A3412' }}>
              MODO SOPORTE TÉCNICO ACTIVO: Estás suplantando remotamente al Administrador de {tenant.nombreComercial}
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              stopImpersonating();
              navigate('/admin');
            }}
            className="btn btn-sm"
            style={styles.exitSupportBtn}
          >
            <LogOut size={13} /> SALIR DE MODO SOPORTE Y VOLVER AL PORTAL SAAS
          </button>
        </div>
      )}

      <div style={styles.titleContainer}>
        <div style={styles.headingWrapper}>
          <h1 style={styles.mainTitle}>{title}</h1>
          <div style={styles.accentUnderline} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={styles.shiftInfo}>
            <Clock size={14} strokeWidth={2.4} style={{ color: 'var(--color-text-muted)' }} />
            <span>{subtitle}</span>
          </div>

          {/* Selector de Sucursales (Para clientes multi-sucursal) */}
          {user?.rol === 'ADMIN' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <GitBranch size={13} color="var(--color-primary)" />
              <select
                value={tenant.sucursal || 'Sucursal Centro (Principal)'}
                onChange={(e) => switchSucursal(e.target.value, tenant.id)}
                style={styles.sucursalSelect}
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
        {/* Campana de Notificaciones para solicitudes de descuento */}
        {puedeAutorizar && (
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setPanelNotificaciones(!panelNotificaciones)}
              style={styles.bellBtn}
              title="Solicitudes de Autorización"
            >
              <Bell size={16} strokeWidth={2.5} />
              {solicitudesPendientes.length > 0 && (
                <span style={styles.bellBadge}>{solicitudesPendientes.length}</span>
              )}
            </button>

            {/* Panel Flotante de Notificaciones */}
            {panelNotificaciones && (
              <div style={styles.notifPanel}>
                <div style={styles.notifHeader}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '12px' }}>
                    SOLICITUDES DE AUTORIZACIÓN ({solicitudesPendientes.length})
                  </div>
                  <button
                    type="button"
                    onClick={() => setPanelNotificaciones(false)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    <X size={16} />
                  </button>
                </div>

                <div style={styles.notifList}>
                  {solicitudes.length === 0 ? (
                    <div style={{ padding: '16px', textAlign: 'center', fontSize: '12px', color: '#78716C' }}>
                      No hay solicitudes registradas
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
                          Monto Venta: <strong>{formatLempiras(sol.totalOriginal)}</strong>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--color-primary)', fontWeight: 700 }}>
                          Descuento solicitado: {sol.descuentoPorcentaje}% (Monto con desc: {formatLempiras(sol.totalConDescuento)})
                        </div>

                        {sol.estado === 'PENDIENTE' && (
                          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                            <button
                              type="button"
                              onClick={() => handleResponder(sol, 'APROBADA')}
                              className="btn btn-primary btn-sm"
                              style={{ flex: 1, padding: '4px 8px', fontSize: '10px' }}
                            >
                              <Check size={12} /> APROBAR
                            </button>
                            <button
                              type="button"
                              onClick={() => handleResponder(sol, 'RECHAZADA')}
                              className="btn btn-secondary btn-sm"
                              style={{ flex: 1, padding: '4px 8px', fontSize: '10px', color: '#DC2626' }}
                            >
                              <X size={12} /> RECHAZAR
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

        {/* Badge de Fecha Oficial */}
        <div style={styles.dateBadge}>
          <Calendar size={15} strokeWidth={2.5} />
          <span>{getDynamicDate()}</span>
        </div>

        {/* Info Cajero/Admin y Botón de Cerrar Sesión */}
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={styles.userBadge}>
              <UserCheck size={14} strokeWidth={2.4} color="var(--color-primary)" />
              <span>{user.nombre}</span>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              style={styles.logoutBtn}
              title="Cerrar Sesión"
            >
              <LogOut size={14} strokeWidth={2.4} />
              <span>SALIR</span>
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
    color: '#FAFAF9',
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
    backgroundColor: '#FAFAF9',
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
