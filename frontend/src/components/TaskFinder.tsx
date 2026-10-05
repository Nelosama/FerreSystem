import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useTenant } from '../context/TenantContext';
import { availableTasks, searchTasks, TASK_DETAILS } from '../utils/taskNavigation';

export const TaskFinder: React.FC = () => {
  const { user, tenant } = useTenant();
  const { pathname } = useLocation();
  const [query, setQuery] = React.useState('');
  React.useEffect(() => setQuery(''), [pathname, user?.id, tenant.id]);
  const results = searchTasks(availableTasks(user, tenant), query);
  return <section className="task-finder" aria-label="Buscador de pantallas y tareas">
    <label htmlFor="task-search"><Search size={18} aria-hidden="true" /> ¿Qué necesitas hacer?</label>
    <div className="task-search-row">
      <input id="task-search" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar una pantalla o tarea: caja, comprar, clientes…" aria-describedby="task-search-help" />
      {query && <button type="button" className="btn btn-secondary" onClick={() => setQuery('')}>Limpiar</button>}
    </div>
    <small id="task-search-help">Encuentra dónde trabajar. Busca productos y clientes dentro de su pantalla.</small>
    {query.trim() && <div className="task-search-results">
      <p role="status">{results.length ? `${results.length} tareas disponibles` : 'No encontramos esa tarea. Prueba con “caja”, “comprar” o “clientes”.'}</p>
      {results.map(item => <Link key={item.key} to={item.route} className="task-link">
        <strong>{TASK_DETAILS[item.key]?.title || item.defaultLabel}</strong>
        <span>{TASK_DETAILS[item.key]?.description || 'Abrir esta pantalla.'}</span>
      </Link>)}
    </div>}
  </section>;
};

export const TaskShortcuts: React.FC = () => {
  const { user, tenant } = useTenant();
  const priorities = user?.rol === 'ADMIN'
    ? ['ordenes_compra', 'inventario', 'usuarios', 'reportes', 'cuentas', 'arqueo_caja', 'devoluciones', 'auditoria', 'pos', 'cotizaciones', 'clientes', 'entregas']
    : user?.rol === 'BODEGUERO' ? ['entregas', 'inventario', 'ordenes_compra', 'levantamiento']
    : ['arqueo_caja', 'pos', 'cotizaciones', 'clientes', 'cuentas', 'entregas', 'devoluciones'];
  const tasks = availableTasks(user, tenant);
  return <section aria-labelledby="daily-tasks-title" className="daily-tasks">
    <h2 id="daily-tasks-title">{user?.rol === 'ADMIN' ? 'Administrar el negocio' : 'Tareas del día'}</h2>
    <p>{user?.rol === 'ADMIN' ? 'Elige lo que necesitas hacer. Cada acceso te lleva directamente a su pantalla.' : user?.rol === 'BODEGUERO' ? 'Revisa entregas y existencias antes de registrar movimientos.' : 'Primero abre la caja, luego registra las ventas. Al terminar, cuenta el efectivo y cierra la caja.'}</p>
    <div className="task-grid">{priorities.map(key => tasks.find(item => item.key === key)).filter(item => !!item).map(item => <Link to={item.route} key={item.key} className="task-link">
      <item.icon size={24} aria-hidden="true" />
      <strong>{TASK_DETAILS[item.key]?.title || item.defaultLabel}</strong>
      <span>{TASK_DETAILS[item.key]?.description}</span>
    </Link>)}</div>
  </section>;
};
