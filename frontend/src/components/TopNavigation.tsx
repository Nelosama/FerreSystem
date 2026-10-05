import { canNavigate } from '../utils/taskNavigation';
import React, { useState, useRef, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Box,
  ChevronDown,
  ShoppingCart,
  Package,
  Users,
  Briefcase,
  BarChart2,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import { useTenant } from '../context/TenantContext';
import { useRubroConfig } from '../hooks/useRubroConfig';
import { useI18n } from '../context/I18nContext';
import { NAVIGATION_ITEMS, type NavigationItem } from '../config/navigation';

const CATEGORY_CONFIG: Record<
  string,
  { label: string; icon: any }
> = {
  SYSTEM: { label: 'SUPER ADMIN', icon: ShieldCheck },
  OPERACION: { label: 'OPERACIONES', icon: ShoppingCart },
  INVENTARIO: { label: 'INVENTARIO', icon: Package },
  CLIENTES: { label: 'CLIENTES', icon: Users },
  GESTION: { label: 'GESTIÓN', icon: Briefcase },
  ANALISIS: { label: 'ANÁLISIS', icon: BarChart2 },
  CONFIGURACION: { label: 'CONFIGURACIÓN', icon: Settings },
};

export const TopNavigation: React.FC = () => {
  const { tenant, user } = useTenant();
  const rubroConfig = useRubroConfig();
  const { t } = useI18n();
  const location = useLocation();

  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);



  // Close dropdown when clicking outside or navigating
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setOpenCategory(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setOpenCategory(null);
  }, [location.pathname]);

  const visibleItems = NAVIGATION_ITEMS.filter(item => canNavigate(item, user, tenant));

  const getLabel = (item: NavigationItem) => {
    if (item.key === 'inventario') {
      return rubroConfig.nombreCatalogo.toUpperCase();
    }
    const translated = t(item.labelKey);
    return translated && translated !== item.labelKey ? translated : item.defaultLabel;
  };

  // Group items by category
  const groupedItems = visibleItems.reduce((acc, item) => {
    const cat = item.category || 'OPERACION';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {} as Record<string, NavigationItem[]>);

  const categories = Object.keys(CATEGORY_CONFIG).filter(
    (catKey) => groupedItems[catKey] && groupedItems[catKey].length > 0,
  );

  return (
    <header className="desktop-sidebar-nav" style={styles.topNavContainer}>
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

      <nav ref={navRef} style={styles.navWrapper}>
        <div style={styles.categoriesRow}>
          {categories.map((catKey) => {
            const items = groupedItems[catKey];
            const config = CATEGORY_CONFIG[catKey] || { label: catKey, icon: Box };
            const CategoryIcon = config.icon;
            const isOpen = openCategory === catKey;

            // Check if any item in this category is currently active
            const hasActiveRoute = items.some((it) =>
              it.exact ? location.pathname === it.route : location.pathname.startsWith(it.route) && it.route !== '/',
            );

            // If category only has 1 item, render directly as a link for faster access
            if (items.length === 1) {
              const single = items[0];
              const ItemIcon = single.icon;
              return (
                <NavLink
                  key={catKey}
                  to={single.route}
                  end={single.exact}
                  style={({ isActive }) => ({
                    ...styles.categoryBtn,
                    ...(isActive ? styles.categoryBtnActive : {}),
                  })}
                >
                  <ItemIcon size={15} strokeWidth={2.2} />
                  <span>{getLabel(single)}</span>
                </NavLink>
              );
            }

            return (
              <div key={catKey} style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setOpenCategory(isOpen ? null : catKey)}
                  style={{
                    ...styles.categoryBtn,
                    ...(hasActiveRoute ? styles.categoryBtnActive : {}),
                    ...(isOpen ? styles.categoryBtnOpen : {}),
                  }}
                >
                  <CategoryIcon size={15} strokeWidth={2.2} />
                  <span>{config.label}</span>
                  <ChevronDown
                    size={14}
                    style={{
                      transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 150ms ease',
                    }}
                  />
                </button>

                {/* Dropdown Menu */}
                {isOpen && (
                  <div style={styles.dropdownMenu}>
                    {items.map((item) => {
                      const Icon = item.icon;
                      return (
                        <NavLink
                          key={item.key}
                          to={item.route}
                          end={item.exact}
                          onClick={() => setOpenCategory(null)}
                          style={({ isActive }) => ({
                            ...styles.dropdownItem,
                            ...(isActive ? styles.dropdownItemActive : {}),
                          })}
                        >
                          <Icon size={16} strokeWidth={2.2} />
                          <span>{getLabel(item)}</span>
                        </NavLink>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </nav>
    </header>
  );
};

const styles: Record<string, React.CSSProperties> = {
  topNavContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'var(--color-sidebar-bg)',
    padding: '8px 24px',
    borderBottom: '2px solid var(--color-border)',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    position: 'relative',
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
  },
  categoriesRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  categoryBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 14px',
    fontFamily: 'var(--font-display)',
    fontSize: '11px',
    fontWeight: 800,
    letterSpacing: '0.04em',
    color: 'var(--color-sidebar-text)',
    backgroundColor: 'transparent',
    border: '1.5px solid transparent',
    borderRadius: 'var(--radius-sm)',
    cursor: 'pointer',
    textDecoration: 'none',
    transition: 'all 150ms ease',
    whiteSpace: 'nowrap',
  },
  categoryBtnActive: {
    backgroundColor: 'var(--color-primary)',
    color: '#FFFFFF',
    borderColor: 'var(--color-primary)',
  },
  categoryBtnOpen: {
    backgroundColor: 'var(--color-text-main)',
    borderColor: '#44403C',
    color: '#FFFFFF',
  },
  dropdownMenu: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    left: 0,
    minWidth: '210px',
    backgroundColor: 'var(--color-sidebar-bg)',
    border: '2px solid var(--color-border)',
    borderRadius: 'var(--radius-xs)',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    padding: '6px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    zIndex: 1000,
  },
  dropdownItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 12px',
    fontFamily: 'var(--font-display)',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.03em',
    color: 'var(--color-sidebar-text)',
    textDecoration: 'none',
    borderRadius: '2px',
    transition: 'all 150ms ease',
  },
  dropdownItemActive: {
    backgroundColor: 'var(--color-primary)',
    color: '#FFFFFF',
    fontWeight: 800,
  },
};
