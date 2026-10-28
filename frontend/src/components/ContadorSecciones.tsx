import React from 'react';
import { NavLink } from 'react-router-dom';
import { useTenant } from '../context/TenantContext';
import { useI18n } from '../context/I18nContext';
import { SECCIONES_CONTADOR, permitidas } from '../config/contadorNavigation';

/**
 * Navegación por secciones dentro del módulo. Para el CONTADOR solo aparece en pantallas angostas (en escritorio está el rail);
 * para el ADMIN, que usa el menú general, aparece siempre. Inicio es la primera opción en todas las páginas.
 */
export const ContadorSecciones: React.FC = () => {
  const { user } = useTenant();
  const { t } = useI18n();
  const secciones = permitidas(SECCIONES_CONTADOR, user);
  return (
    <nav className={`contador-secciones${user?.rol === 'CONTADOR' ? ' solo-movil' : ''}`} aria-label={t('accounting.nav.sections')}>
      <ul>
        {secciones.map(s => <li key={s.key}>
          <NavLink to={s.route} end className={({ isActive }) => `contador-seccion${isActive ? ' is-active' : ''}`}>{t(s.labelKey)}</NavLink>
        </li>)}
      </ul>
    </nav>
  );
};
