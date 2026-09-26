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
} from 'lucide-react';
import { useTenant } from '../context/TenantContext';
import { useRubroConfig } from '../hooks/useRubroConfig';

export const Sidebar: React.FC = () => {
  const { tenant, user } = useTenant();
  const rubroConfig = useRubroConfig();
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
      label: 'PANEL SUPER ADMIN',
      icon: ShieldCheck,
      allowedRoles: ['SUPERADMIN'],
    },
    {
      path: '/',
      label: 'PANEL DE CONTROL',
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
      label: 'PUNTO DE VENTA',
      icon: Calculator,
      allowedRoles: ['ADMIN', 'CAJERO', 'VENDEDOR'],
      moduleKey: 'pos',
    },
    {
      path: '/cotizaciones',
      label: 'COTIZACIONES',
      icon: ClipboardList,
      allowedRoles: ['ADMIN', 'VENDEDOR', 'CAJERO'],
      moduleKey: 'cotizaciones',
    },
    {
      path: '/apartados',
      label: 'APARTADOS',
      icon: Bookmark,
      allowedRoles: ['ADMIN', 'CAJERO', 'VENDEDOR'],
      moduleKey: 'apartados',
    },
    {
      path: '/arqueo-caja',
      label: 'ARQUEO DE CAJA',
      icon: DollarSign,
      allowedRoles: ['ADMIN', 'CAJERO'],
      moduleKey: 'arqueo_caja',
    },
    {
      path: '/ordenes-compra',
      label: 'ÓRDENES DE COMPRA',
      icon: Truck,
      allowedRoles: ['ADMIN', 'BODEGUERO'],
      moduleKey: 'ordenes_compra',
    },
    {
      path: '/transferencias',
      label: 'TRANSFERENCIAS',
      icon: GitBranch,
      allowedRoles: ['ADMIN', 'BODEGUERO'],
      moduleKey: 'transferencias_sucursal',
    },
    {
      path: '/garantias',
      label: 'GARANTÍAS & SERIES',
      icon: Shield,
      allowedRoles: ['ADMIN', 'CAJERO', 'VENDEDOR'],
      moduleKey: 'garantias',
    },
    {
      path: '/pedidos-especiales',
      label: 'PEDIDOS ESPECIALES',
      icon: Clock,
      allowedRoles: ['ADMIN', 'VENDEDOR', 'CAJERO'],
      moduleKey: 'pedidos_especiales',
    },
    {
      path: '/listas-precio',
      label: 'LISTAS DE PRECIO',
      icon: Tags,
      allowedRoles: ['ADMIN', 'VENDEDOR'],
      moduleKey: 'listas_precio',
    },
    {
      path: '/comisiones',
      label: 'COMISIONES VENTA',
      icon: Percent,
      allowedRoles: ['ADMIN'],
      moduleKey: 'comisiones_venta',
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
      label: 'CONFIGURACIÓN GLOBAL',
      icon: Sliders,
      allowedRoles: ['SUPERADMIN'],
    },
  ];

  const visibleMainNav = mainNavItems.filter(
    (item) => isRoleAllowed(item.allowedRoles) && isModuleEnabled(item.moduleKey),
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
    borderRight: '2px solid #292524',
    flexShrink: 0,
    minHeight: '100vh',
    userSelect: 'none',
  },
  brandHeader: {
    padding: '24px 20px 20px',
    borderBottom: '1px solid #292524',
    backgroundColor: '#161413',
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
    color: '#FAFAF9',
  },
  brandSystem: {
    color: 'var(--color-primary)',
  },
  tenantName: {
    fontFamily: 'var(--font-display)',
    fontSize: '10px',
    fontWeight: 700,
    color: '#A8A29E',
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
    borderRadius: 'var(--radius-xs)',
    transition: 'all 150ms ease',
  },
  navItemActive: {
    backgroundColor: 'var(--color-sidebar-active-bg)',
    color: '#FFFFFF',
    fontWeight: 800,
    boxShadow: '2px 2px 0px rgba(0,0,0,0.5)',
  },
  divider: {
    height: '1px',
    backgroundColor: '#292524',
    margin: '16px 0 12px',
  },
};
