import { TenantBrand } from './TenantBrand';
import React from 'react';
import { Calendar, Clock, UserCheck, LogOut, ShieldAlert } from 'lucide-react';
import { useTenant } from '../context/TenantContext';
import { useI18n } from '../context/I18nContext';
import { useNavigate } from 'react-router-dom';
import { alertas } from '../utils/alertas';
import { NotificacionesBell } from './NotificacionesBell';
import { SucursalSelect } from './SucursalSelect';
import { EstadoCajaBadge } from './EstadoCajaBadge';
import { ShellTopbarContext } from '../context/ShellTopbarContext';

interface TopBarProps {
  title: string;
  subtitle?: string;
}

export const TopBar: React.FC<TopBarProps> = ({
  title,
  subtitle,
}) => {
  const { user, tenant, isImpersonating, isReadOnly, enableEditMode, stopImpersonating, logout } = useTenant();
  const [modalConfirmEditMode, setModalConfirmEditMode] = React.useState(false);
  const [motivoEdicion, setMotivoEdicion] = React.useState('');
  const { locale, setLocale, t } = useI18n();
  const navigate = useNavigate();
  const enShell = React.useContext(ShellTopbarContext);


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

  // Dentro de un shell con barra superior propia (Super Admin, Administrador) aquí solo va el encabezado de la página.
  if (enShell) {
    return (
      <header className="shell-page-header">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </header>
    );
  }

  return (
    <header className="app-topbar" style={styles.header}>
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
            <label style={{ display: 'block', fontSize: '12px', marginBottom: '12px' }}>
              Motivo de la edición (queda en la auditoría, mínimo 10 caracteres)
              <textarea className="form-input" rows={3} maxLength={500} value={motivoEdicion} onChange={(e) => setMotivoEdicion(e.target.value)} />
            </label>

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
                className="btn btn-primary btn-sm" disabled={motivoEdicion.trim().length < 10}
                style={{ backgroundColor: '#DC2626', borderColor: '#991B1B', fontWeight: 800 }}
                onClick={async () => {
                  try {
                    await enableEditMode(motivoEdicion);
                    setModalConfirmEditMode(false);
                    setMotivoEdicion('');
                  } catch {
                    alertas.error(t('topbar.edit_failed'));
                  }
                }}
              >
                {t('topbar.confirm_activate')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="app-topbar-title" style={styles.titleContainer}><span className="mobile-brand-only"><TenantBrand /></span>
        <div style={styles.headingWrapper}>
          <h1 className="app-topbar-titulo" style={styles.mainTitle}>{title}</h1>
          <div style={styles.accentUnderline} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div className="topbar-desktop-only" style={styles.shiftInfo}>
            <Clock size={14} strokeWidth={2.4} style={{ color: 'var(--color-text-muted)' }} />
            <span>{subtitle ?? t('topbar.guidance')}</span>
          </div>

          {/* Selector de Sucursales (Para clientes multi-sucursal) */}
          {user?.rol === 'ADMIN' && <SucursalSelect />}
        </div>
      </div>

      <div className="app-topbar-acciones" style={styles.actionsContainer}>
        <NotificacionesBell />
        {user?.rol === 'SUPERADMIN' && <div aria-label="Idioma de la plataforma" className="topbar-desktop-only" style={{ display: 'flex', gap: 4 }}>
          {(['es', 'en'] as const).map(lang => <button key={lang} type="button" aria-pressed={locale === lang} onClick={() => setLocale(lang)} className="btn btn-secondary btn-sm">{lang.toUpperCase()}</button>)}
        </div>}
        <EstadoCajaBadge />
        {/* Badge de Fecha Oficial */}
        <div className="app-date-badge" style={styles.dateBadge}>
          <Calendar size={15} strokeWidth={2.5} />
          <span>{getDynamicDate()}</span>
        </div>

        {/* Info Cajero/Admin y Botón de Cerrar Sesión */}
        {user && (
          <div className="app-topbar-usuario" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '100%' }}>
            <div className="app-user-badge" style={{ ...styles.userBadge, minWidth: 0, maxWidth: '100%' }}>
              <UserCheck size={14} strokeWidth={2.4} color="var(--color-primary-text)" />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.nombre}</span>
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
    borderBottom: '1px solid var(--color-border)',
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
  // Aviso de soporte con color fijo (no el del negocio): naranja oscuro para que el blanco alcance 5.2:1.
  exitSupportBtn: {
    backgroundColor: '#C2410C',
    color: '#FFFFFF',
    fontWeight: 800,
    fontSize: '11px',
    border: '1px solid #C2410C',
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
    backgroundColor: 'var(--color-surface)',
    color: 'var(--color-text-main)',
    fontFamily: 'var(--font-body)',
    fontWeight: 600,
    fontSize: '12.5px',
    padding: '9px 14px',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
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
    flexShrink: 0,
    whiteSpace: 'nowrap',
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
