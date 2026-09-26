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
  Users,
} from 'lucide-react';
import { useTenant } from '../context/TenantContext';

export const Sidebar: React.FC = () => {
  const { tenant, user } = useTenant();
  const userRole = user?.rol;

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
      label: 'INVENTARIO',
      icon: PackageSearch,
      allowedRoles: ['ADMIN', 'BODEGUERO'],
    },
    {
      path: '/pos',
      label: 'PUNTO DE VENTA',
      icon: Calculator,
      allowedRoles: ['ADMIN', 'CAJERO', 'VENDEDOR'],
    },
    {
      path: '/cotizaciones',
      label: 'COTIZACIONES',
      icon: ClipboardList,
      allowedRoles: ['ADMIN', 'VENDEDOR', 'CAJERO'],
    },
  ];

  const adminNavItems = [
    {
      path: '/usuarios',
      label: 'USUARIOS',
      icon: Users,
      allowedRoles: ['ADMIN'],
      requiredPermiso: 'usuarios.gestionar',
    },
    {
      path: '/configuracion',
      label: 'CONFIGURACIÓN',
      icon: Sliders,
      allowedRoles: ['ADMIN'],
      requiredPermiso: 'configuracion.editar',
    },
  ];

  const visibleMainNav = mainNavItems.filter((item) => isRoleAllowed(item.allowedRoles));
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
                  <Icon size={20} strokeWidth={2.4} />
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
                    <Icon size={20} strokeWidth={2.4} />
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
    gap: '6px',
    padding: 0,
    margin: 0,
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 14px',
    fontFamily: 'var(--font-display)',
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '0.04em',
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
    margin: '20px 0 16px',
  },
};
