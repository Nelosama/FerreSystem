import { LogotipoNegocio } from './LogotipoNegocio';
import { PlatformSidebar } from './PlatformSidebar';
import { availableTasks, groupNavigation } from '../utils/taskNavigation';
import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDown, MapPin, WifiOff } from 'lucide-react';
import { useTenant } from '../context/TenantContext';
import { useRubroConfig } from '../hooks/useRubroConfig';
import { useI18n } from '../context/I18nContext';
import { useConexion } from '../hooks/useConexion';
import { type NavigationItem } from '../config/navigation';

const CLAVE_GRUPOS = 'jowa_menu_grupos_cerrados';
// Sin red solo sigue operando el POS (contingencia en efectivo); el resto necesita el servidor.
const DISPONIBLE_SIN_RED = new Set(['pos']);

const leerCerrados = (): string[] => {
  try { const valor = JSON.parse(localStorage.getItem(CLAVE_GRUPOS) || '[]'); return Array.isArray(valor) ? valor : []; } catch { return []; }
};

export const Sidebar: React.FC = () => {
  const { user } = useTenant();
  if (user?.rol === 'SUPERADMIN') return <PlatformSidebar />;
  return <TenantSidebar />;
};

const TenantSidebar: React.FC = () => {
  const { tenant, user } = useTenant();
  const rubroConfig = useRubroConfig();
  const { t } = useI18n();
  const { pathname } = useLocation();
  const { enLinea, ventasPorEnviar } = useConexion();
  const [cerrados, setCerrados] = React.useState<string[]>(leerCerrados);

  const visibleItems = availableTasks(user, tenant);
  const inicio = visibleItems.find(item => item.key === 'dashboard');
  const grupos = groupNavigation(visibleItems.filter(item => item !== inicio));

  const getLabel = (item: NavigationItem) => {
    if (item.key === 'inventario') return rubroConfig.nombreCatalogo;
    const contextualKey = item.key === 'ordenes_compra' ? 'navigation.purchases_receiving' : item.key === 'usuarios' ? 'navigation.staff_permissions' : item.labelKey;
    const translated = t(contextualKey);
    return translated && translated !== contextualKey ? translated : item.defaultLabel;
  };

  const alternar = (categoria: string) => setCerrados(actual => {
    const siguiente = actual.includes(categoria) ? actual.filter(c => c !== categoria) : [...actual, categoria];
    try { localStorage.setItem(CLAVE_GRUPOS, JSON.stringify(siguiente)); } catch { /* preferencia opcional */ }
    return siguiente;
  });

  const enlace = (item: NavigationItem) => {
    const Icon = item.icon;
    const sinRed = !enLinea && !DISPONIBLE_SIN_RED.has(item.key);
    return <li key={item.key}>
      <NavLink to={item.route} end={item.exact} className={({ isActive }) => `jowa-nav-item${isActive ? ' active' : ''}${sinRed ? ' sin-red' : ''}`}>
        <Icon size={18} strokeWidth={2} aria-hidden="true" />
        <span className="jowa-nav-label">{getLabel(item)}</span>
        {sinRed && <small className="jowa-nav-hint">{t('navigation.needs_connection')}</small>}
      </NavLink>
    </li>;
  };

  return (
    <aside className="desktop-sidebar-nav app-sidebar jowa-sidebar">
      {/* Identidad del negocio: su logotipo y nombre. Jowa System es el proveedor y enlaza a Inicio. */}
      <div className="jowa-sidebar-brand">
        <NavLink to="/" aria-label="Jowa System: ir a Inicio" className="jowa-sidebar-home">
          <LogotipoNegocio size={40} />
          <span className="jowa-sidebar-identity">
            <strong>{tenant.nombreComercial || 'Negocio'}</strong>
            <small>Jowa System</small>
          </span>
        </NavLink>
        {tenant.sucursal && <p className="jowa-sidebar-branch"><MapPin size={14} aria-hidden="true" />{tenant.sucursal}</p>}
      </div>

      <nav className="jowa-sidebar-nav" aria-label={t('navigation.main')}>
        <ul className="jowa-nav-list">
          {inicio && enlace(inicio)}
          {grupos.map(group => {
            const abierto = !cerrados.includes(group.category) || group.items.some(item => pathname.startsWith(item.route));
            const id = `menu-grupo-${group.category.toLowerCase()}`;
            return <li key={group.category} className="jowa-nav-group">
              <button type="button" className="navigation-group" aria-expanded={abierto} aria-controls={id} onClick={() => alternar(group.category)}>
                <span>{t('navigation.' + group.category)}</span>
                <ChevronDown size={14} aria-hidden="true" />
              </button>
              <ul id={id} className="jowa-nav-list" hidden={!abierto}>{group.items.map(enlace)}</ul>
            </li>;
          })}
        </ul>
      </nav>

      <div className={`jowa-connection${enLinea ? '' : ' offline'}`} aria-live="polite">
        {enLinea ? <span className="jowa-connection-dot" aria-hidden="true" /> : <WifiOff size={16} aria-hidden="true" />}
        <span>
          <strong>{t(enLinea ? 'navigation.online' : 'navigation.offline')}</strong>
          {ventasPorEnviar > 0 && <> · {t('navigation.pending_sales', { count: ventasPorEnviar })}</>}
        </span>
      </div>
    </aside>
  );
};
