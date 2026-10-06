import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useTenant } from '../context/TenantContext';
import { useI18n } from '../context/I18nContext';
import { availableTasks, priorityTasks, searchTasks } from '../utils/taskNavigation';

export const TaskFinder: React.FC = () => {
  const { user, tenant } = useTenant();
  const { t } = useI18n();
  const { pathname } = useLocation();
  const [query, setQuery] = React.useState('');
  const [expanded, setExpanded] = React.useState(false);
  const input = React.useRef<HTMLInputElement>(null);
  const compact = pathname !== '/';
  React.useEffect(() => { setQuery(''); setExpanded(false); }, [pathname, user?.id, tenant.id]);
  React.useEffect(() => { if (expanded) input.current?.focus(); }, [expanded]);
  const results = searchTasks(availableTasks(user, tenant), query, t);
  return <section className="task-finder" aria-label={t('tasks.finder')}>
    {compact && <button type="button" className="task-finder-toggle" aria-expanded={expanded} aria-controls="task-search-panel" onClick={() => setExpanded(!expanded)}><Search size={18} aria-hidden="true" />{t('tasks.finder')}</button>}
    {(!compact || expanded) && <div id="task-search-panel" onKeyDown={event => { if (event.key === 'Escape') { setExpanded(false); setQuery(''); } }}>
      <label htmlFor="task-search"><Search size={18} aria-hidden="true" />{t('tasks.question')}</label>
      <div className="task-search-row">
        <input ref={input} id="task-search" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={t('tasks.placeholder')} aria-describedby="task-search-help" />
        {query && <button type="button" className="btn btn-secondary" onClick={() => { setQuery(''); input.current?.focus(); }}>{t('tasks.clear')}</button>}
      </div>
      <small id="task-search-help">{t('tasks.help')}</small>
      {query.trim() && <div className="task-search-results">
        <p role="status">{results.length ? t('tasks.count', { count: results.length }) : t('tasks.empty')}</p>
        {results.map(item => <Link key={item.key} to={item.route} className="task-link">
          <strong>{t('tasks.' + item.key + '.title') === 'tasks.' + item.key + '.title' ? t(item.labelKey) : t('tasks.' + item.key + '.title')}</strong>
          <span>{t('tasks.' + item.key + '.description') === 'tasks.' + item.key + '.description' ? t('tasks.open') : t('tasks.' + item.key + '.description')}</span>
        </Link>)}
      </div>}
    </div>}
  </section>;
};
export const TaskShortcuts: React.FC = () => {
  const { user, tenant } = useTenant();
  const { t } = useI18n();
  const tasks = priorityTasks(user, tenant);
  return <section aria-labelledby="daily-tasks-title" className="daily-tasks">
    <h2 id="daily-tasks-title">{t(user?.rol === 'ADMIN' ? 'tasks.manage' : 'tasks.daily')}</h2>
    <p>{t('tasks.guidance.' + user?.rol)}</p>
    <div className="task-grid">{tasks.map((item, index) => <Link to={item.route} key={item.key} className={index === 0 ? 'task-link task-primary' : 'task-link'}>
      <item.icon size={24} aria-hidden="true" />
      <strong>{t('tasks.' + item.key + '.title')}</strong>
      <span>{t('tasks.' + item.key + '.description')}</span>
    </Link>)}</div>
    {!tasks.length && <p role="status">{t('tasks.unavailable')}</p>}
  </section>;
};
