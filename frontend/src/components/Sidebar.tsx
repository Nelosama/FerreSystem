import { LogotipoNegocio } from './LogotipoNegocio';
import { availableTasks, groupNavigation } from '../utils/taskNavigation';
import React from 'react';
import { NavLink } from 'react-router-dom';
import { useTenant } from '../context/TenantContext';
import { useRubroConfig } from '../hooks/useRubroConfig';
import { useI18n } from '../context/I18nContext';
import { type NavigationItem } from '../config/navigation';

export const Sidebar: React.FC = () => {
  const { tenant, user } = useTenant();
  const rubroConfig = useRubroConfig();
  const { t } = useI18n();



  const visibleItems = availableTasks(user, tenant);

  const getLabel = (item: NavigationItem) => {
    if (item.key === 'inventario') {
      return rubroConfig.nombreCatalogo.toUpperCase();
    }
    const contextualKey = item.key === 'ordenes_compra' ? 'navigation.purchases_receiving' : item.key === 'usuarios' ? 'navigation.staff_permissions' : item.labelKey;
    const translated = t(contextualKey);
    return translated && translated !== item.labelKey ? translated : item.defaultLabel;
  };

  return (
    <aside className="desktop-sidebar-nav v2-sidebar" style={styles.sidebar}>
      {/* Identidad del negocio: su logotipo y nombre. Jowa System es el proveedor y enlaza a Inicio. */}
      <div style={styles.brandHeader}>
        <NavLink to="/" aria-label="Jowa System: ir a Inicio" style={styles.logoRow}>
          <LogotipoNegocio size={40} />
          <div style={styles.identidad}>
            <div style={styles.tenantName}>{tenant.nombreComercial || 'Negocio'}</div>
            <span style={styles.plataforma}>Jowa System</span>
          </div>
        </NavLink>
      </div>

      {/* Navigation List */}
      <nav style={styles.navContainer}>
        <ul style={styles.navList}>
          {groupNavigation(visibleItems).map(group => <React.Fragment key={group.category}>
            <li className="navigation-group">{t('navigation.' + group.category)}</li>
            {group.items.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.key}>
                <NavLink
                  to={item.route}
                  end={item.exact}
                  style={({ isActive }) => ({
                    ...styles.navItem,
                    ...(isActive ? styles.navItemActive : {}),
                  })}
                >
                  <Icon size={18} strokeWidth={2.4} />
                  <span>{getLabel(item)}</span>
                </NavLink>
              </li>
            );
          })}</React.Fragment>)}
        </ul>
      </nav>
    </aside>
  );
};

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: '264px',
    backgroundColor: 'var(--color-sidebar-bg)',
    color: 'var(--color-sidebar-text)',
    display: 'flex',
    flexDirection: 'column',
    borderRight: '1px solid var(--color-border-subtle)',
    flexShrink: 0,
    minHeight: '100vh',
    userSelect: 'none',
  },
  brandHeader: {
    padding: '24px 20px 20px',
    borderBottom: '1px solid rgba(128, 128, 128, 0.2)',
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
  },
  logoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    color: 'inherit',
    textDecoration: 'none',
  },
  identidad: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  tenantName: {
    fontFamily: 'var(--font-display)',
    fontSize: '18px',
    fontWeight: 800,
    color: 'var(--color-sidebar-text)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  plataforma: {
    fontFamily: 'var(--font-display)',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--color-primary)',
    textDecoration: 'none',
  },
  navContainer: {
    padding: '16px 12px',
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
  },
  navList: {
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: 0,
    margin: 0,
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '11px 12px',
    fontFamily: 'var(--font-display)',
    fontSize: '14px',
    fontWeight: 700,
    letterSpacing: '0.03em',
    color: 'var(--color-sidebar-text)',
    textDecoration: 'none',
    borderRadius: 'var(--radius-sm)',
    transition: 'all 150ms ease',
  },
  navItemActive: {
    backgroundColor: 'var(--color-primary-light)',
    color: 'var(--color-primary)',
    fontWeight: 800,
    boxShadow: 'inset 4px 0 var(--color-primary)',
  },
};
