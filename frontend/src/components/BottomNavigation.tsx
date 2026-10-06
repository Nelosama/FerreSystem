import { availableTasks, groupNavigation, priorityTasks } from '../utils/taskNavigation';
import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { MoreHorizontal, X, GitBranch, Clock } from 'lucide-react';
import { useTenant } from '../context/TenantContext';
import { useRubroConfig } from '../hooks/useRubroConfig';
import { useSucursales } from '../hooks/useSucursales';
import { useI18n } from '../context/I18nContext';
import { type NavigationItem } from '../config/navigation';

export const BottomNavigation: React.FC = () => {
  const { tenant, user, switchSucursal } = useTenant();
  const rubroConfig = useRubroConfig();
  const { locale, setLocale, t } = useI18n();
  const location = useLocation();

  const [showMasModal, setShowMasModal] = useState(false);
  const moreButton = React.useRef<HTMLButtonElement>(null);
  const dialog = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!showMasModal) return;
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => { moreButton.current?.focus(); };
  }, [showMasModal]);
  React.useEffect(() => { setShowMasModal(false); }, [location.pathname, user?.id, tenant.id]);



  const visibleItems = availableTasks(user, tenant);

  const preferred = priorityTasks(user, tenant);
  const home = visibleItems.find(item => item.key === 'dashboard' || item.key === 'superadmin');
  const bottomFour: NavigationItem[] = [...(home ? [home] : []), ...preferred.filter(item => item !== home)].slice(0,4);
  const selectedKeys = new Set(bottomFour.map(item => item.key));
  const remainingItems = visibleItems.filter(item => !selectedKeys.has(item.key));

  const getLabel = (item: NavigationItem) => {
    if (item.key === 'inventario') {
      return rubroConfig.nombreCatalogo;
    }
    const translated = t(item.labelKey);
    return translated && translated !== item.labelKey ? translated : item.defaultLabel;
  };

  const sucursalesDisponibles = useSucursales();

  const isMasActive = remainingItems.some((item) =>
    item.exact
      ? location.pathname === item.route
      : location.pathname.startsWith(item.route) && item.route !== '/',
  );

  return (
    <>
      {/* Barra de navegación inferior fija para móviles */}
      <nav style={styles.bottomBar} className="mobile-bottom-nav">
        {bottomFour.map((item) => {
          const Icon = item.icon;
          const isActive = item.exact
            ? location.pathname === item.route
            : location.pathname.startsWith(item.route) && item.route !== '/';

          return (
            <NavLink
              key={item.key}
              to={item.route}
              end={item.exact}
              style={{
                ...styles.navTab,
                color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
              }}
            >
              <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
              <span style={{ ...styles.tabLabel, fontWeight: isActive ? 800 : 600 }}>
                {getLabel(item)}
              </span>
            </NavLink>
          );
        })}

        {/* Botón MÁS */}
        <button
          type="button"
          ref={moreButton}
          aria-expanded={showMasModal}
          aria-controls="mobile-more-menu"
          onClick={() => setShowMasModal(true)}
          style={{
            ...styles.navTab,
            color: showMasModal || isMasActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <MoreHorizontal size={20} strokeWidth={showMasModal || isMasActive ? 2.5 : 2} />
          <span style={{ ...styles.tabLabel, fontWeight: showMasModal || isMasActive ? 800 : 600 }}>
            {t('navigation.more')}
          </span>
        </button>
      </nav>

      {/* Pantalla/Modal MÁS */}
      {showMasModal && (
        <div ref={dialog} id="mobile-more-menu" role="dialog" aria-modal="true" aria-label={t('navigation.more')} style={styles.masOverlay} onKeyDown={event => {
          if (event.key === 'Escape') { event.preventDefault(); setShowMasModal(false); }
          if (event.key === 'Tab') {
            const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], select:not(:disabled)') || []);
            const first = controls[0], last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
          }
        }}>
          <div style={styles.masHeader}>
            <span style={styles.masTitle}>{t('navigation.more')}</span>
            <button
              type="button"
              onClick={() => setShowMasModal(false)}
              style={styles.closeBtn}
              aria-label={t('navigation.close')}
            >
              <X size={22} color="var(--color-text-main)" />
            </button>
          </div>

          <div style={styles.masBody}>
            {/* Sección superior de configuración (Turno, Sucursal, Idioma) */}
            <div style={styles.configSection}>
              {/* Turno Actual */}
              <div style={styles.configRow}>
                <Clock size={15} color="var(--color-text-muted)" />
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-muted)' }}>
                  {t('navigation.cash_help')}
                </span>
              </div>

              {/* Selector de Sucursal */}
              {user?.rol === 'ADMIN' && (
                <div style={styles.configRow}>
                  <GitBranch size={15} color="var(--color-primary)" />
                  <span style={{ fontSize: '12px', fontWeight: 700 }}>{t('navigation.branch')}</span>
                  <select
                    value={tenant.sucursal || 'Sucursal Principal'}
                disabled={sucursalesDisponibles.length < 2}
                    onChange={(e) => switchSucursal(e.target.value, tenant.id)}
                    style={styles.sucursalSelect}
                    aria-label={t('navigation.branch')}
                  >
                    {sucursalesDisponibles.map((s: any) => (
                      <option key={s.id} value={s.nombre}>
                        {s.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Selector de Idioma ES / EN */}
              <div style={styles.configRow}>
                <span style={{ fontSize: '12px', fontWeight: 700 }}>{t('navigation.language')}</span>
                <div style={styles.langToggle}>
                  <button
                    type="button"
                    onClick={() => setLocale('es')}
                    style={{
                      ...styles.langBtn,
                      backgroundColor: locale === 'es' ? 'var(--color-primary)' : 'transparent',
                      color: locale === 'es' ? '#FFFFFF' : '#44403C',
                    }}
                  >
                    ES
                  </button>
                  <button
                    type="button"
                    onClick={() => setLocale('en')}
                    style={{
                      ...styles.langBtn,
                      backgroundColor: locale === 'en' ? 'var(--color-primary)' : 'transparent',
                      color: locale === 'en' ? '#FFFFFF' : '#44403C',
                    }}
                  >
                    EN
                  </button>
                </div>
              </div>
            </div>

            {/* Cuadrícula de opciones restadas */}
            <div style={styles.gridTitle}>{t('navigation.modules')}</div>
            <div style={styles.gridContainer}>
              {groupNavigation(remainingItems).map(group => <React.Fragment key={group.category}>
                <h3 className="mobile-navigation-group">{t('navigation.' + group.category)}</h3>
                {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = item.exact
                  ? location.pathname === item.route
                  : location.pathname.startsWith(item.route) && item.route !== '/';

                return (
                  <NavLink
                    key={item.key}
                    to={item.route}
                    end={item.exact}
                    onClick={() => setShowMasModal(false)}
                    style={{
                      ...styles.gridCard,
                      borderColor: isActive ? 'var(--color-primary)' : 'var(--color-border)',
                      backgroundColor: isActive ? 'var(--color-sidebar-active-bg, #292524)' : '#FFFFFF',
                      color: isActive ? '#FFFFFF' : 'var(--color-text-main)',
                    }}
                  >
                    <div
                      style={{
                        ...styles.iconWrapper,
                        backgroundColor: isActive ? 'var(--color-primary)' : 'var(--color-surface-hover)',
                        color: isActive ? '#FFFFFF' : 'var(--color-primary)',
                      }}
                    >
                      <Icon size={22} strokeWidth={2.4} />
                    </div>
                    <span style={styles.gridLabel}>{getLabel(item)}</span>
                  </NavLink>
                );
              })}</React.Fragment>)}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const styles: Record<string, React.CSSProperties> = {
  bottomBar: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    height: '64px',
    backgroundColor: '#FFFFFF',
    borderTop: '2px solid var(--color-border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-around',
    zIndex: 999,
    boxShadow: '0 -2px 10px rgba(0, 0, 0, 0.08)',
  },
  navTab: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    height: '100%',
    textDecoration: 'none',
    gap: '2px',
    padding: '4px 0',
  },
  tabLabel: {
    fontFamily: 'var(--font-display)',
    fontSize: '10px',
    letterSpacing: '0.02em',
    textTransform: 'uppercase',
    textAlign: 'center',
    lineHeight: 1.1,
    maxWidth: '68px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  masOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'var(--color-bg, #FAFAF9)',
    zIndex: 10000,
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto',
  },
  masHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 20px',
    backgroundColor: '#FFFFFF',
    borderBottom: '2px solid var(--color-border)',
  },
  masTitle: {
    fontFamily: 'var(--font-display)',
    fontWeight: 900,
    fontSize: '18px',
    textTransform: 'uppercase',
    letterSpacing: '-0.01em',
    color: 'var(--color-text-main)',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  masBody: {
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  configSection: {
    backgroundColor: '#FFFFFF',
    border: '1.5px solid var(--color-border)',
    borderRadius: 'var(--radius-xs)',
    padding: '12px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  configRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontFamily: 'var(--font-display)',
  },
  sucursalSelect: {
    flex: 1,
    padding: '4px 8px',
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '11px',
    border: '1.5px solid var(--color-border)',
    borderRadius: 'var(--radius-xs)',
    backgroundColor: '#FFFFFF',
  },
  langToggle: {
    display: 'flex',
    alignItems: 'center',
    backgroundColor: 'var(--color-surface-hover)',
    border: '1.5px solid var(--color-border)',
    borderRadius: 'var(--radius-xs)',
    padding: '2px',
  },
  langBtn: {
    padding: '4px 10px',
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: '11px',
    border: 'none',
    borderRadius: '2px',
    cursor: 'pointer',
  },
  gridTitle: {
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: '12px',
    letterSpacing: '0.05em',
    color: 'var(--color-text-muted)',
    marginTop: '4px',
  },
  gridContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '12px',
    paddingBottom: '24px',
  },
  gridCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px 12px',
    border: '2px solid var(--color-border)',
    borderRadius: 'var(--radius-xs)',
    textDecoration: 'none',
    gap: '8px',
    boxShadow: 'var(--shadow-hard-sm, 2px 2px 0px var(--color-border))',
    textAlign: 'center',
  },
  iconWrapper: {
    width: '40px',
    height: '40px',
    borderRadius: 'var(--radius-xs)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridLabel: {
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: '11px',
    letterSpacing: '0.02em',
    textTransform: 'uppercase',
  },
};
