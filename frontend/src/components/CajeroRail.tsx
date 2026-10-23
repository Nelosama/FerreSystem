import React from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import { useTenant } from '../context/TenantContext';
import { useI18n } from '../context/I18nContext';
import { availableTasks, groupNavigation } from '../utils/taskNavigation';
import { type NavigationItem } from '../config/navigation';
import { LogotipoNegocio } from './LogotipoNegocio';
import { IndicadorConexion } from './IndicadorConexion';
import { useConexion } from '../hooks/useConexion';

// Accesos fijos del rail del cajero (Inicio, Caja, Mi caja). El resto queda en «Más».
const PRINCIPALES = ['dashboard', 'pos', 'arqueo_caja'] as const;
// Sin red solo sigue operando el POS (contingencia en efectivo); el resto necesita el servidor.
const DISPONIBLE_SIN_RED = new Set(['pos']);

/** Rail de iconos del cajero (solo en modo barra lateral). Usa el tema global; el negocio conserva su color en el contenido. */
export const CajeroRail: React.FC = () => {
  const { tenant, user } = useTenant();
  const { t } = useI18n();
  const { pathname } = useLocation();
  const { enLinea } = useConexion();
  // «Más» guarda la ruta en la que se abrió: al navegar a otra ruta queda cerrado sin efecto adicional.
  const [masEnRuta, setMasEnRuta] = React.useState<string | null>(null);
  const masAbierto = masEnRuta === pathname;

  const visibles = availableTasks(user, tenant);
  const principales = PRINCIPALES.map(key => visibles.find(item => item.key === key)).filter((item): item is NavigationItem => Boolean(item));
  const resto = visibles.filter(item => !principales.includes(item));
  const grupos = groupNavigation(resto);

  const sinRed = (item: NavigationItem) => !enLinea && !DISPONIBLE_SIN_RED.has(item.key);
  const pista = (item: NavigationItem) => sinRed(item) ? <span className="sr-only">{' — '}{t('navigation.needs_connection')}</span> : null;

  const etiqueta = (item: NavigationItem) => {
    const traducida = t(item.labelKey);
    return traducida && traducida !== item.labelKey ? traducida : item.defaultLabel;
  };
  // El rail es angosto (84 px): Caja y Mi caja usan etiqueta corta; el nombre completo del módulo queda como ayuda.
  const ETIQUETA_RAIL: Record<string, string> = { pos: 'navigation.rail_pos', arqueo_caja: 'navigation.rail_cash' };
  const etiquetaRail = (item: NavigationItem) => ETIQUETA_RAIL[item.key] ? t(ETIQUETA_RAIL[item.key]) : etiqueta(item);

  const inicial = (user?.nombre || 'C').trim().charAt(0).toUpperCase();

  return (
    <nav className="cajero-rail desktop-sidebar-nav" aria-label={t('navigation.main')}>
      <Link to="/" aria-label={t('navigation.home_link')} className="cajero-rail-brand">
        <LogotipoNegocio size={36} />
      </Link>

      <ul className="cajero-rail-list">
        {principales.map(item => {
          const Icon = item.icon;
          return <li key={item.key}>
            <NavLink to={item.route} end={item.exact} title={sinRed(item) ? t('navigation.needs_connection') : etiqueta(item)} className={({ isActive }) => `cajero-rail-item${isActive ? ' is-active' : ''}${sinRed(item) ? ' sin-red' : ''}`}>
              <span className="cajero-rail-pill"><Icon size={20} strokeWidth={2} aria-hidden="true" /></span>
              <span>{etiquetaRail(item)}</span>
              {pista(item)}
            </NavLink>
          </li>;
        })}
        {resto.length > 0 && <li className="cajero-rail-mas">
          <button type="button" className={`cajero-rail-item${masAbierto ? ' is-active' : ''}`} aria-expanded={masAbierto} aria-controls="cajero-rail-mas-panel" onClick={() => setMasEnRuta(masAbierto ? null : pathname)}>
            <span className="cajero-rail-pill"><MoreHorizontal size={20} strokeWidth={2} aria-hidden="true" /></span>
            <span>{t('navigation.more_short')}</span>
          </button>
          {masAbierto && <nav id="cajero-rail-mas-panel" className="cajero-rail-panel" aria-label={t('navigation.more_menu')}>
            {grupos.map(grupo => <div key={grupo.category} className="cajero-rail-grupo">
              <span className="cajero-rail-grupo-titulo">{t('navigation.' + grupo.category)}</span>
              <ul>
                {grupo.items.map(item => {
                  const Icon = item.icon;
                  return <li key={item.key}>
                    <NavLink to={item.route} end={item.exact} className={({ isActive }) => `cajero-rail-link${isActive ? ' is-active' : ''}${sinRed(item) ? ' sin-red' : ''}`}>
                      <Icon size={16} strokeWidth={2} aria-hidden="true" /><span>{etiqueta(item)}</span>
                      {sinRed(item) && <small className="cajero-rail-hint">{t('navigation.needs_connection')}</small>}
                    </NavLink>
                  </li>;
                })}
              </ul>
            </div>)}
          </nav>}
        </li>}
      </ul>

      <div className="cajero-rail-conexion"><IndicadorConexion compacto /></div>
      <span className="cajero-rail-avatar" title={user?.nombre} aria-hidden="true">{inicial}</span>
    </nav>
  );
};
