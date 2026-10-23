import React from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import { useTenant } from '../context/TenantContext';
import { useI18n } from '../context/I18nContext';
import { SECCIONES_MAS, SECCIONES_PRINCIPALES, permitidas } from '../config/contadorNavigation';
import { LogotipoNegocio } from './LogotipoNegocio';

/** Rail de iconos del CONTADOR (barra lateral de escritorio): Inicio, Asientos, Reportes, Cierre y «Más». Usa el mismo diseño que el del cajero. */
export const ContadorRail: React.FC = () => {
  const { user } = useTenant();
  const { t } = useI18n();
  const { pathname } = useLocation();
  // «Más» guarda la ruta en la que se abrió: al navegar a otra ruta queda cerrado sin efecto adicional.
  const [masEnRuta, setMasEnRuta] = React.useState<string | null>(null);
  const masAbierto = masEnRuta === pathname;
  const principales = permitidas(SECCIONES_PRINCIPALES, user);
  const mas = permitidas(SECCIONES_MAS, user);
  const inicial = (user?.nombre || 'C').trim().charAt(0).toUpperCase();

  return (
    <nav className="cajero-rail desktop-sidebar-nav" aria-label={t('accounting.nav.label')} data-testid="contador-rail">
      <Link to="/contabilidad" aria-label={t('accounting.nav.home_link')} className="cajero-rail-brand">
        <LogotipoNegocio size={36} />
      </Link>
      <ul className="cajero-rail-list">
        {principales.map(s => {
          const Icon = s.icon!;
          return <li key={s.key}>
            <NavLink to={s.route} end title={t(s.labelKey)} className={({ isActive }) => `cajero-rail-item${isActive ? ' is-active' : ''}`}>
              <span className="cajero-rail-pill"><Icon size={20} strokeWidth={2} aria-hidden="true" /></span>
              <span>{t(s.labelKey)}</span>
            </NavLink>
          </li>;
        })}
        {mas.length > 0 && <li className="cajero-rail-mas">
          <button type="button" className={`cajero-rail-item${masAbierto || mas.some(s => pathname.startsWith(s.route)) ? ' is-active' : ''}`} aria-expanded={masAbierto} aria-controls="contador-rail-mas-panel" onClick={() => setMasEnRuta(masAbierto ? null : pathname)}>
            <span className="cajero-rail-pill"><MoreHorizontal size={20} strokeWidth={2} aria-hidden="true" /></span>
            <span>{t('navigation.more_short')}</span>
          </button>
          {masAbierto && <nav id="contador-rail-mas-panel" className="cajero-rail-panel" aria-label={t('navigation.more_menu')}>
            <ul>
              {mas.map(s => <li key={s.key}>
                <NavLink to={s.route} end className={({ isActive }) => `cajero-rail-link${isActive ? ' is-active' : ''}`}><span>{t(s.labelKey)}</span></NavLink>
              </li>)}
            </ul>
          </nav>}
        </li>}
      </ul>
      <span className="cajero-rail-avatar" title={user?.nombre} aria-hidden="true">{inicial}</span>
    </nav>
  );
};
