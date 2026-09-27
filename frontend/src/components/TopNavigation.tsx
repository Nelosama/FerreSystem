import React from 'react';
import { NavLink } from 'react-router-dom';
import { Box } from 'lucide-react';
import { useTenant } from '../context/TenantContext';
import { useRubroConfig } from '../hooks/useRubroConfig';
import { useI18n } from '../context/I18nContext';
import { NAVIGATION_ITEMS, type NavigationItem } from '../config/navigation';

export const TopNavigation: React.FC = () => {
  const { tenant, user } = useTenant();
  const rubroConfig = useRubroConfig();
  const { t } = useI18n();
  const userRole = user?.rol;

  const defaultModules = [
    'inventario',
    'pos',
    'cotizaciones',
    'usuarios',
    'configuracion',
    'apartados',
    'arqueo_caja',
    'ordenes_compra',
    'transferencias_sucursal',
    'garantias',
    'pedidos_especiales',
    'listas_precio',
    'comisiones_venta',
    'reportes',
  ];

  const modulosHabilitados = tenant.modulosHabilitados || defaultModules;

  const isModuleEnabled = (moduleKey?: string) => {
    if (!moduleKey) return true;
    return modulosHabilitados.includes(moduleKey);
  };

  const isRoleAllowed = (allowedRoles?: string[], requiredPermiso?: string) => {
    if (!userRole) return false;
    if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(userRole)) {
      return false;
    }
    if (requiredPermiso) {
      return user?.permisos?.includes(requiredPermiso) ?? false;
    }
    return true;
  };

  const visibleItems = NAVIGATION_ITEMS.filter(
    (item) => isRoleAllowed(item.allowedRoles, item.requiredPermiso) && isModuleEnabled(item.moduleKey),
  );

  const getLabel = (item: NavigationItem) => {
    if (item.key === 'inventario') {
      return rubroConfig.nombreCatalogo.toUpperCase();
    }
    const translated = t(item.labelKey);
    return translated && translated !== item.labelKey ? translated : item.defaultLabel;
  };

  return (
    <header style={styles.topNavContainer}>
      <div style={styles.brandContainer}>
        {tenant.logoUrl ? (
          <img
            src={tenant.logoUrl}
            alt="Logo"
            style={{ height: '32px', width: 'auto', maxHeight: '36px', objectFit: 'contain' }}
          />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Box size={22} strokeWidth={2.5} color="var(--color-primary)" />
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '18px', color: '#FFFFFF' }}>
              Ferre<span style={{ color: 'var(--color-primary)' }}>System</span>
            </span>
          </div>
        )}
        <span style={styles.tenantTag}>{tenant.nombreComercial}</span>
      </div>

      <nav style={styles.navWrapper}>
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
                  <Icon size={16} strokeWidth={2.2} />
                  <span>{getLabel(item)}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
};

const styles: Record<string, React.CSSProperties> = {
  topNavContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1C1917',
    padding: '8px 24px',
    borderBottom: '2px solid var(--color-border)',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    flexWrap: 'wrap',
    gap: '12px',
    zIndex: 100,
  },
  brandContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  tenantTag: {
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: '11px',
    letterSpacing: '0.04em',
    color: '#A8A29E',
    borderLeft: '1px solid #44403C',
    paddingLeft: '10px',
    textTransform: 'uppercase',
  },
  navWrapper: {
    display: 'flex',
    alignItems: 'center',
    overflowX: 'auto',
  },
  navList: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    listStyle: 'none',
    padding: 0,
    margin: 0,
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 12px',
    fontFamily: 'var(--font-display)',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.03em',
    color: '#D6D3D1',
    textDecoration: 'none',
    borderRadius: 'var(--radius-sm)',
    whiteSpace: 'nowrap',
    transition: 'all 150ms ease',
  },
  navItemActive: {
    backgroundColor: 'var(--color-primary)',
    color: '#FFFFFF',
    fontWeight: 800,
  },
};
