import React from 'react';
import { Link, NavLink, useLocation, useSearchParams } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { api } from '../utils/api';
import { MENU_PLATAFORMA, PESTANAS_NEGOCIO, SECCIONES_PLATAFORMA, SLUG_SECCION } from '../config/platformNavigation';

/** Menú del SUPERADMIN: usa siempre el color de la plataforma, nunca el de un negocio. */
export const PlatformSidebar: React.FC = () => {
  const { pathname } = useLocation();
  const [parametros] = useSearchParams();
  const negocioId = /^\/admin\/negocios\/([^/]+)/.exec(pathname)?.[1];
  const seccion = pathname === '/admin' ? SECCIONES_PLATAFORMA[parametros.get('seccion') || ''] ?? 'tenants' : negocioId ? 'tenants' : null;
  const [datos, setDatos] = React.useState<{ id: string; nombreComercial?: string; colorPrimario?: string } | null>(null);
  const negocio = negocioId ? (datos?.id === negocioId ? datos : { id: negocioId }) : null;

  React.useEffect(() => {
    if (!negocioId) return;
    let vigente = true;
    api.get(`/admin/tenants/${negocioId}/settings`).then(({ data }) => { if (vigente) setDatos({ id: negocioId, nombreComercial: data?.nombreComercial, colorPrimario: data?.colorPrimario }); }).catch(() => undefined);
    return () => { vigente = false; };
  }, [negocioId]);

  const base = negocioId ? `/admin/negocios/${negocioId}` : '';
  const iniciales = (negocio?.nombreComercial || 'Negocio').split(/\s+/).filter(p => p.length > 2).slice(-2).map(p => p[0]).join('').toUpperCase() || 'N';

  return (
    <aside className="desktop-sidebar-nav jowa-sidebar jowa-platform-sidebar">
      <div className="jowa-sidebar-brand">
        <NavLink to="/admin" aria-label="Jowa System: ir al panel de plataforma" className="jowa-sidebar-home">
          <span className="jowa-platform-mark"><ShieldCheck size={20} aria-hidden="true" /></span>
          <span className="jowa-sidebar-identity"><strong>Jowa System</strong><small>Super Admin</small></span>
        </NavLink>
      </div>
      <nav className="jowa-sidebar-nav" aria-label="Menú de plataforma">
        <ul className="jowa-nav-list">
          {MENU_PLATAFORMA.map(grupo => <li key={grupo.grupo} className="jowa-nav-group">
            <span className="navigation-group">{grupo.grupo === 'clientes' ? 'Clientes' : 'Plataforma'}</span>
            <ul className="jowa-nav-list">
              {grupo.items.map(item => <li key={item.seccion}>
                <Link to={`/admin?seccion=${SLUG_SECCION[item.seccion]}`} aria-current={seccion === item.seccion ? 'page' : undefined} className={`jowa-nav-item${seccion === item.seccion ? ' active' : ''}`}>
                  <item.icon size={18} strokeWidth={2} aria-hidden="true" /><span className="jowa-nav-label">{item.etiqueta}</span>
                </Link>
                {item.seccion === 'tenants' && negocio && <div className="jowa-platform-context" style={{ '--tenant-color': negocio.colorPrimario || 'var(--plat-accent)' } as React.CSSProperties}>
                  <div className="jowa-platform-context-head"><span className="jowa-platform-tenant">{iniciales}</span><strong>{negocio.nombreComercial || 'Negocio'}</strong></div>
                  <ul className="jowa-nav-list" aria-label="Administración del negocio">
                    {PESTANAS_NEGOCIO.map(([ruta, etiqueta]) => <li key={ruta}><NavLink end to={`${base}${ruta}`} className={({ isActive }) => `jowa-nav-sub${isActive ? ' active' : ''}`}>{etiqueta}</NavLink></li>)}
                  </ul>
                </div>}
              </li>)}
            </ul>
          </li>)}
        </ul>
      </nav>
      <p className="jowa-platform-foot">Sesión de plataforma · no ligada a un negocio</p>
    </aside>
  );
};
