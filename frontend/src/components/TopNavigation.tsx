import React from 'react';
import { NavLink } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { TaskFinder } from './TaskFinder';
import { LogotipoNegocio } from './LogotipoNegocio';
import { IndicadorConexion } from './IndicadorConexion';
import { availableTasks } from '../utils/taskNavigation';
import { useTenant } from '../context/TenantContext';
import { useI18n } from '../context/I18nContext';
import { useMediaQuery } from '../hooks/useMediaQuery';

// El mismo catálogo autorizado alimenta ambos modos. Los accesos secundarios siguen disponibles.
const primaryOrder = ['dashboard', 'pos', 'cotizaciones', 'clientes', 'cuentas', 'entregas', 'inventario', 'ordenes_compra', 'usuarios'];
const related: Record<string, string[]> = {
  dashboard: ['reportes', 'admin_movil', 'conciliacion_bancaria'],
  pos: ['arqueo_caja', 'devoluciones', 'apartados', 'pedidos_especiales', 'contingencia_admin'],
  clientes: ['estado_cuenta_clientes', 'listas_precio'],
  inventario: ['precios', 'levantamiento', 'transferencias', 'garantias'],
  usuarios: ['comisiones'],
};
// Por debajo de 1200 px (tableta y escritorio estrecho) solo estas entradas quedan en la barra; el resto pasa a «Más»
// en lugar de partir la barra en dos líneas. Cada enlace existe una sola vez en el documento.
const prioritarios = new Set(['dashboard', 'pos', 'cotizaciones', 'clientes', 'inventario']);

export const TopNavigation: React.FC<{ showTaskFinder?: boolean }> = ({ showTaskFinder = true }) => {
  const { tenant, user } = useTenant();
  const { t } = useI18n();
  const tasks = availableTasks(user, tenant);
  const primary = primaryOrder.flatMap(key => tasks.filter(item => item.key === key));
  const secondary = tasks.filter(item => !primaryOrder.includes(item.key));
  const assigned = primary.flatMap(item => related[item.key] || []);
  const extras = secondary.filter(item => !assigned.includes(item.key));
  const childrenOf = (key: string) => secondary.filter(child => related[key]?.includes(child.key));
  const compacto = useMediaQuery('(max-width: 1199px)');
  const enBarra = compacto ? primary.filter(item => prioritarios.has(item.key)) : primary;
  const compactables = compacto ? primary.filter(item => !prioritarios.has(item.key)) : [];
  const link = (item: typeof tasks[number]) => <NavLink key={item.key} to={item.route} end={item.exact} className={({ isActive }) => `topnav-link${isActive ? ' active' : ''}`}>{t(item.labelKey)}</NavLink>;
  const cerrarAlElegir = (event: React.MouseEvent<HTMLDivElement>) => (event.currentTarget.parentElement as HTMLDetailsElement).removeAttribute('open');
  return <header className="desktop-sidebar-nav app-top-navigation jowa-topnav">
    <div className="jowa-topnav-header"><NavLink to="/" aria-label={t('navigation.home_link')} className="jowa-brand-home">
      <LogotipoNegocio size={32} />
      <span className="jowa-brand-text"><strong>{tenant.nombreComercial || 'Negocio'}</strong><small>Jowa System</small></span>
    </NavLink>{showTaskFinder && <TaskFinder />}<IndicadorConexion compacto /></div>
    <nav aria-label={t('navigation.main_top')} className="jowa-topnav-links" onKeyDown={event => {
      if (event.key === 'Escape') { const detail = (event.target as HTMLElement).closest('details'); detail?.removeAttribute('open'); detail?.querySelector('summary')?.focus(); }
    }}>
      {enBarra.map(item => {
        const children = childrenOf(item.key);
        const nombre = t(item.labelKey);
        return <div key={item.key} className="topnav-entry">{link(item)}{children.length > 0 && <details className="topnav-more">
          <summary aria-label={t('navigation.more_options', { name: nombre })} title={t('navigation.more_options', { name: nombre })}><ChevronDown size={16} aria-hidden="true" /></summary>
          <div className="topnav-dropdown" onClick={cerrarAlElegir}>{children.map(link)}</div>
        </details>}</div>;
      })}
      {(extras.length > 0 || compactables.length > 0) && <details className="topnav-more topnav-more--general">
        <summary aria-label={t('navigation.more_menu')}>{user?.rol === 'SUPERADMIN' ? t('navigation.platform') : t('navigation.more_short')}<ChevronDown size={16} aria-hidden="true" /></summary>
        <div className="topnav-dropdown" onClick={cerrarAlElegir}>
          {compactables.map(item => <div key={item.key} className="topnav-grupo-compacto">{link(item)}{childrenOf(item.key).map(link)}</div>)}
          {extras.map(link)}
        </div>
      </details>}
    </nav>
  </header>;
};
