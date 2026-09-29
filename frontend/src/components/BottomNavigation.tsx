import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { MoreHorizontal, X, GitBranch, Clock } from 'lucide-react';
import { useTenant } from '../context/TenantContext';
import { useRubroConfig } from '../hooks/useRubroConfig';
import { useI18n } from '../context/I18nContext';
import { NAVIGATION_ITEMS, type NavigationItem } from '../config/navigation';

export const BottomNavigation: React.FC = () => {
  const { tenant, user, switchSucursal } = useTenant();
  const rubroConfig = useRubroConfig();
  const { locale, setLocale, t } = useI18n();
  const userRole = user?.rol;
  const location = useLocation();

  const [showMasModal, setShowMasModal] = useState(false);

  const defaultModules = [
    'inventario',
    'levantamiento',
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

  // Orden de los 4 ítems principales preferidos
  const PREFERRED_KEYS = ['dashboard', 'pos', 'cotizaciones', 'inventario'];

  // Seleccionar los 4 ítems para la barra inferior respetando permisos
  const bottomFour: NavigationItem[] = [];
  const selectedKeys = new Set<string>();

  // 1. Agregar los preferidos que el usuario tenga permitidos
  PREFERRED_KEYS.forEach((key) => {
    const item = visibleItems.find((i) => i.key === key);
    if (item && bottomFour.length < 4) {
      bottomFour.push(item);
      selectedKeys.add(item.key);
    }
  });

  // 2. Si hay menos de 4, rellenar con los siguientes disponibles en la lista de permisos
  visibleItems.forEach((item) => {
    if (bottomFour.length < 4 && !selectedKeys.has(item.key)) {
      bottomFour.push(item);
      selectedKeys.add(item.key);
    }
  });

  // 3. El resto de los ítems permitidos van a la pantalla "Más"
  const remainingItems = visibleItems.filter((item) => !selectedKeys.has(item.key));

  const getLabel = (item: NavigationItem) => {
    if (item.key === 'inventario') {
      return rubroConfig.nombreCatalogo;
    }
    const translated = t(item.labelKey);
    return translated && translated !== item.labelKey ? translated : item.defaultLabel;
  };

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
                color: isActive ? 'var(--color-primary)' : '#78716C',
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
          onClick={() => setShowMasModal(true)}
          style={{
            ...styles.navTab,
            color: showMasModal || isMasActive ? 'var(--color-primary)' : '#78716C',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <MoreHorizontal size={20} strokeWidth={showMasModal || isMasActive ? 2.5 : 2} />
          <span style={{ ...styles.tabLabel, fontWeight: showMasModal || isMasActive ? 800 : 600 }}>
            Más
          </span>
        </button>
      </nav>

      {/* Pantalla/Modal MÁS */}
      {showMasModal && (
        <div style={styles.masOverlay}>
          <div style={styles.masHeader}>
            <span style={styles.masTitle}>Más Opciones</span>
            <button
              type="button"
              onClick={() => setShowMasModal(false)}
              style={styles.closeBtn}
              aria-label="Cerrar menú"
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
                  Turno Actual: 08:00 AM - 05:00 PM
                </span>
              </div>

              {/* Selector de Sucursal */}
              {user?.rol === 'ADMIN' && (
                <div style={styles.configRow}>
                  <GitBranch size={15} color="var(--color-primary)" />
                  <span style={{ fontSize: '12px', fontWeight: 700 }}>Sucursal:</span>
                  <select
                    value={tenant.sucursal || 'Sucursal Centro (Principal)'}
                    onChange={(e) => switchSucursal(e.target.value, tenant.id)}
                    style={styles.sucursalSelect}
                    aria-label="Seleccionar sucursal"
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
                <span style={{ fontSize: '12px', fontWeight: 700 }}>Idioma:</span>
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
            <div style={styles.gridTitle}>MÓDULOS DEL SISTEMA</div>
            <div style={styles.gridContainer}>
              {remainingItems.map((item) => {
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
                        backgroundColor: isActive ? 'var(--color-primary)' : '#F5F5F4',
                        color: isActive ? '#FFFFFF' : 'var(--color-primary)',
                      }}
                    >
                      <Icon size={22} strokeWidth={2.4} />
                    </div>
                    <span style={styles.gridLabel}>{getLabel(item)}</span>
                  </NavLink>
                );
              })}
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
    backgroundColor: '#F5F5F4',
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
