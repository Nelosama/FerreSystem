import { TenantBrand } from './TenantBrand';
import { canNavigate } from '../utils/taskNavigation';
import React from 'react';
import { NavLink } from 'react-router-dom';
import { Box } from 'lucide-react';
import { useTenant } from '../context/TenantContext';
import { useRubroConfig } from '../hooks/useRubroConfig';
import { useI18n } from '../context/I18nContext';
import { NAVIGATION_ITEMS, type NavigationItem } from '../config/navigation';

export const Sidebar: React.FC = () => {
  const { tenant, user } = useTenant();
  const rubroConfig = useRubroConfig();
  const { t } = useI18n();



  const visibleItems = NAVIGATION_ITEMS.filter(item => canNavigate(item, user, tenant));

  const getLabel = (item: NavigationItem) => {
    if (item.key === 'inventario') {
      return rubroConfig.nombreCatalogo.toUpperCase();
    }
    const translated = t(item.labelKey);
    return translated && translated !== item.labelKey ? translated : item.defaultLabel;
  };

  return (
    <aside className="desktop-sidebar-nav v2-sidebar" style={styles.sidebar}>
      {/* Brand Header */}
      <div style={styles.brandHeader}>
        <div style={styles.logoRow}>
          {tenant.templateVersion === 'v2' ? <TenantBrand /> : tenant.logoUrl ? (
            <img
              src={tenant.logoUrl}
              alt="Tenant Logo"
              style={{ height: '36px', width: 'auto', maxHeight: '42px', objectFit: 'contain' }}
            />
          ) : (
            <div style={styles.logoIcon}>
              <Box size={28} strokeWidth={2.5} color="var(--color-primary)" />
            </div>
          )}
          {tenant.templateVersion !== 'v2' && !tenant.logoUrl && (
            <div style={styles.brandName}>
              <span style={styles.brandFerre}>Ferre</span>
              <span style={styles.brandSystem}>System</span>
            </div>
          )}
        </div>
        <div style={styles.tenantName}>
          {tenant.nombreComercial || 'LA MUNDIAL - SUCURSAL CENTRO'}
        </div>
      </div>

      {/* Navigation List */}
      <nav style={styles.navContainer}>
        <ul style={styles.navList}>
          {visibleItems.map((item) => {
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
          })}
        </ul>
      </nav>
    </aside>
  );
};

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: '240px',
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
  },
  logoIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: {
    fontFamily: 'var(--font-display)',
    fontSize: '22px',
    fontWeight: 800,
    letterSpacing: '-0.02em',
  },
  brandFerre: {
    color: 'var(--color-sidebar-text)',
  },
  brandSystem: {
    color: 'var(--color-primary)',
  },
  tenantName: {
    fontFamily: 'var(--font-display)',
    fontSize: '10px',
    fontWeight: 700,
    color: 'var(--color-sidebar-text)',
    opacity: 0.75,
    marginTop: '6px',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
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
    padding: '10px 12px',
    fontFamily: 'var(--font-display)',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.03em',
    color: 'var(--color-sidebar-text)',
    textDecoration: 'none',
    borderRadius: 'var(--radius-sm)',
    transition: 'all 150ms ease',
  },
  navItemActive: {
    backgroundColor: 'var(--color-sidebar-active-bg)',
    color: '#FFFFFF',
    fontWeight: 800,
    boxShadow: 'var(--shadow-hard-sm)',
  },
};
