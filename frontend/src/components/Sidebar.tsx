import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutGrid,
  PackageSearch,
  Calculator,
  ClipboardList,
  Sliders,
  Box,
  ShieldCheck,
  Bookmark,
  DollarSign,
  Truck,
  GitBranch,
  Shield,
  Clock,
  Tags,
  Percent,
  BarChart3,
} from 'lucide-react';
import { useTenant } from '../context/TenantContext';
import { useRubroConfig } from '../hooks/useRubroConfig';
import { useI18n } from '../context/I18nContext';

export const Sidebar: React.FC = () => {
  const { tenant, user } = useTenant();
  const rubroConfig = useRubroConfig();
  const { t } = useI18n();
  const userRole = user?.rol;

  const modulosHabilitados = tenant.modulosHabilitados || [
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

  const mainNavItems = [
    {
      path: '/admin',
      label: t('menu.super_admin'),
      icon: ShieldCheck,
      allowedRoles: ['SUPERADMIN'],
    },
    {
      path: '/',
      label: t('menu.dashboard'),
      icon: LayoutGrid,
      exact: true,
      allowedRoles: ['ADMIN', 'CAJERO', 'BODEGUERO', 'VENDEDOR'],
    },
    {
      path: '/inventario',
      label: rubroConfig.nombreCatalogo.toUpperCase(),
      icon: PackageSearch,
      allowedRoles: ['ADMIN', 'BODEGUERO'],
      moduleKey: 'inventario',
    },
    {
      path: '/pos',
      label: t('menu.pos'),
      icon: Calculator,
      allowedRoles: ['ADMIN', 'CAJERO', 'VENDEDOR'],
      moduleKey: 'pos',
    },
    {
      path: '/cotizaciones',
      label: t('menu.quotations'),
      icon: ClipboardList,
      allowedRoles: ['ADMIN', 'VENDEDOR', 'CAJERO'],
      moduleKey: 'cotizaciones',
    },
    {
      path: '/apartados',
      label: t('menu.layaway'),
      icon: Bookmark,
      allowedRoles: ['ADMIN', 'CAJERO', 'VENDEDOR'],
      moduleKey: 'apartados',
    },
    {
      path: '/arqueo-caja',
      label: t('menu.cash_drawer'),
      icon: DollarSign,
      allowedRoles: ['ADMIN', 'CAJERO'],
      moduleKey: 'arqueo_caja',
    },
    {
      path: '/ordenes-compra',
      label: t('menu.purchase_orders'),
      icon: Truck,
      allowedRoles: ['ADMIN', 'BODEGUERO'],
      moduleKey: 'ordenes_compra',
    },
    {
      path: '/transferencias',
      label: t('menu.transfers'),
      icon: GitBranch,
      allowedRoles: ['ADMIN', 'BODEGUERO'],
      moduleKey: 'transferencias_sucursal',
    },
    {
      path: '/garantias',
      label: t('menu.warranties'),
      icon: Shield,
      allowedRoles: ['ADMIN', 'CAJERO', 'VENDEDOR'],
      moduleKey: 'garantias',
    },
    {
      path: '/pedidos-especiales',
      label: t('menu.special_orders'),
      icon: Clock,
      allowedRoles: ['ADMIN', 'VENDEDOR', 'CAJERO'],
      moduleKey: 'pedidos_especiales',
    },
    {
      path: '/listas-precio',
      label: t('menu.price_lists'),
      icon: Tags,
      allowedRoles: ['ADMIN', 'VENDEDOR'],
      moduleKey: 'listas_precio',
    },
    {
      path: '/comisiones',
      label: t('menu.commissions'),
      icon: Percent,
      allowedRoles: ['ADMIN'],
      moduleKey: 'comisiones_venta',
    },
    {
      path: '/reportes',
      label: t('menu.reports') || 'REPORTES',
      icon: BarChart3,
      allowedRoles: ['ADMIN', 'CAJERO', 'VENDEDOR'],
      requiredPermiso: 'reportes.ver',
      moduleKey: 'reportes',
    },
  ];

  const adminNavItems: {
    path: string;
    label: string;
    icon: any;
    allowedRoles?: string[];
    requiredPermiso?: string;
  }[] = [
    {
      path: '/configuracion',
      label: t('menu.configuration'),
      icon: Sliders,
      allowedRoles: ['SUPERADMIN'],
    },
  ];

  const visibleMainNav = mainNavItems.filter(
    (item) => isRoleAllowed(item.allowedRoles, item.requiredPermiso) && isModuleEnabled(item.moduleKey),
  );
  const visibleAdminNav = adminNavItems.filter((item) => isRoleAllowed(item.allowedRoles, item.requiredPermiso));

  return (
    <aside style={styles.sidebar}>
      {/* Brand Header */}
      <div style={styles.brandHeader}>
        <div style={styles.logoRow}>
          <div style={styles.logoIcon}>
            <Box size={28} strokeWidth={2.5} color="var(--color-primary)" />
          </div>
          <div style={styles.brandName}>
            <span style={styles.brandFerre}>Ferre</span>
            <span style={styles.brandSystem}>System</span>
          </div>
        </div>
        <div style={styles.tenantName}>
          {tenant.nombreComercial || 'LA MUNDIAL - SUCURSAL CENTRO'}
        </div>
      </div>

      {/* Navigation List */}
      <nav style={styles.navContainer}>
        <ul style={styles.navList}>
          {visibleMainNav.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  end={item.exact}
                  style={({ isActive }) => ({
                    ...styles.navItem,
                    ...(isActive ? styles.navItemActive : {}),
                  })}
                >
                  <Icon size={18} strokeWidth={2.4} />
                  <span>{item.label}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>

        {/* Divider (Only show if admin items are visible) */}
        {visibleAdminNav.length > 0 && <div style={styles.divider} />}

        {/* Configuration and Admin */}
        {visibleAdminNav.length > 0 && (
          <ul style={styles.navList}>
            {visibleAdminNav.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    style={({ isActive }) => ({
                      ...styles.navItem,
                      ...(isActive ? styles.navItemActive : {}),
                    })}
                  >
                    <Icon size={18} strokeWidth={2.4} />
                    <span>{item.label}</span>
                  </NavLink>
                </li>
              );
            })}
          </ul>
        )}
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
  divider: {
    height: '1px',
    backgroundColor: 'rgba(128, 128, 128, 0.2)',
    margin: '16px 0 12px',
  },
};
