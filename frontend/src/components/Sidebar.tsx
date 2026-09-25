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
} from 'lucide-react';
import { useTenant } from '../context/TenantContext';

export const Sidebar: React.FC = () => {
  const { tenant } = useTenant();

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
          <li>
            <NavLink
              to="/"
              end
              style={({ isActive }) => ({
                ...styles.navItem,
                ...(isActive ? styles.navItemActive : {}),
              })}
            >
              <LayoutGrid size={20} strokeWidth={2.4} />
              <span>PANEL DE CONTROL</span>
            </NavLink>
          </li>

          <li>
            <NavLink
              to="/inventario"
              style={({ isActive }) => ({
                ...styles.navItem,
                ...(isActive ? styles.navItemActive : {}),
              })}
            >
              <PackageSearch size={20} strokeWidth={2.4} />
              <span>INVENTARIO</span>
            </NavLink>
          </li>

          <li>
            <NavLink
              to="/pos"
              style={({ isActive }) => ({
                ...styles.navItem,
                ...(isActive ? styles.navItemActive : {}),
              })}
            >
              <Calculator size={20} strokeWidth={2.4} />
              <span>PUNTO DE VENTA</span>
            </NavLink>
          </li>

          <li>
            <NavLink
              to="/cotizaciones"
              style={({ isActive }) => ({
                ...styles.navItem,
                ...(isActive ? styles.navItemActive : {}),
              })}
            >
              <ClipboardList size={20} strokeWidth={2.4} />
              <span>COTIZACIONES</span>
            </NavLink>
          </li>
        </ul>

        {/* Divider */}
        <div style={styles.divider} />

        {/* Configuration and Admin */}
        <ul style={styles.navList}>
          <li>
            <NavLink
              to="/configuracion"
              style={({ isActive }) => ({
                ...styles.navItem,
                ...(isActive ? styles.navItemActive : {}),
              })}
            >
              <Sliders size={20} strokeWidth={2.4} />
              <span>CONFIGURACIÓN</span>
            </NavLink>
          </li>

          <li>
            <NavLink
              to="/admin"
              style={({ isActive }) => ({
                ...styles.navItem,
                ...(isActive ? styles.navItemActive : {}),
                fontSize: '11px',
                color: '#A8A29E',
              })}
            >
              <ShieldCheck size={18} strokeWidth={2.2} />
              <span>SUPER ADMIN (SAAS)</span>
            </NavLink>
          </li>
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
