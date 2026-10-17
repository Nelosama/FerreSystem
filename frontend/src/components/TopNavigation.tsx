import React from 'react';
import { NavLink } from 'react-router-dom';
import { TaskFinder } from './TaskFinder';
import { LogotipoNegocio } from './LogotipoNegocio';
import { availableTasks } from '../utils/taskNavigation';
import { useTenant } from '../context/TenantContext';
import { useI18n } from '../context/I18nContext';

// El mismo catálogo autorizado alimenta ambos modos. Los accesos secundarios siguen disponibles.
const primaryOrder = ['dashboard', 'pos', 'cotizaciones', 'clientes', 'cuentas', 'entregas', 'inventario', 'ordenes_compra', 'usuarios'];
const related: Record<string, string[]> = {
  dashboard: ['reportes', 'admin_movil', 'conciliacion_bancaria'],
  pos: ['arqueo_caja', 'devoluciones', 'apartados', 'pedidos_especiales'],
  clientes: ['estado_cuenta_clientes', 'listas_precio'],
  inventario: ['precios', 'levantamiento', 'transferencias', 'garantias'],
  usuarios: ['comisiones'],
};

export const TopNavigation: React.FC<{ showTaskFinder?: boolean }> = ({ showTaskFinder = true }) => {
  const { tenant, user } = useTenant();
  const { t } = useI18n();
  const tasks = availableTasks(user, tenant);
  const primary = primaryOrder.flatMap(key => tasks.filter(item => item.key === key));
  const secondary = tasks.filter(item => !primaryOrder.includes(item.key));
  const assigned = primary.flatMap(item => related[item.key] || []);
  const extras = secondary.filter(item => !assigned.includes(item.key));
  const link = (item: typeof tasks[number]) => <NavLink key={item.key} to={item.route} end={item.exact} className={({ isActive }) => `topnav-link${isActive ? ' active' : ''}`}>{t(item.labelKey)}</NavLink>;
  return <header className="desktop-sidebar-nav v2-top-navigation jowa-topnav">
    <div className="jowa-topnav-header"><NavLink to="/" aria-label="Jowa System: ir a Inicio" className="jowa-brand-home">
      <LogotipoNegocio size={32} />
      <span className="jowa-brand-text"><strong>{tenant.nombreComercial || 'Negocio'}</strong><small>Jowa System</small></span>
    </NavLink>{showTaskFinder && <TaskFinder />}</div>
    <nav aria-label="Navegación principal" className="jowa-topnav-links" onKeyDown={event => {
      if (event.key === 'Escape') { const detail = (event.target as HTMLElement).closest('details'); detail?.removeAttribute('open'); detail?.querySelector('summary')?.focus(); }
    }}>
      {primary.map(item => {
        const children = secondary.filter(child => related[item.key]?.includes(child.key));
        return <div key={item.key} className="topnav-entry">{link(item)}{children.length > 0 && <details className="topnav-more"><summary aria-label={`Más opciones: ${t(item.labelKey)}`}>▾</summary><div className="topnav-dropdown" onClick={event => (event.currentTarget.parentElement as HTMLDetailsElement).removeAttribute('open')}>{children.map(link)}</div></details>}</div>;
      })}
      {extras.length > 0 && <details className="topnav-more"><summary>{user?.rol === 'SUPERADMIN' ? 'Plataforma' : 'Más'}</summary><div className="topnav-dropdown">{extras.map(link)}</div></details>}
    </nav>
  </header>;
};
