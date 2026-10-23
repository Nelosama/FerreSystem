import React from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { useTenant } from '../context/TenantContext';
import { AREAS_PLATAFORMA, SLUG_SECCION, areaDeSeccion, seccionDePlataforma, type AreaPlataforma } from '../config/platformNavigation';

/** Rail de iconos del Super Admin. Usa siempre el color de la plataforma, nunca el de un negocio. */
export const PlatformRail: React.FC = () => {
  const { pathname } = useLocation();
  const [parametros] = useSearchParams();
  const { user } = useTenant();
  // Un negocio abierto pertenece al área Clientes aunque la URL no tenga ?seccion=.
  const area: AreaPlataforma = pathname.startsWith('/admin/negocios') ? 'clientes' : areaDeSeccion(seccionDePlataforma(parametros));
  const inicial = (user?.nombre || 'S').trim().charAt(0).toUpperCase();

  return (
    <nav className="platform-rail" aria-label="Áreas de la plataforma">
      <Link to="/admin" aria-label="Jowa System: ir al panel de plataforma" className="platform-rail-brand">
        <ShieldCheck size={20} aria-hidden="true" />
      </Link>
      <ul className="platform-rail-list">
        {AREAS_PLATAFORMA.map(item => {
          const Icon = item.icon;
          const activa = area === item.id;
          return <li key={item.id}>
            <Link to={`/admin?seccion=${SLUG_SECCION[item.secciones[0]]}`} aria-current={activa ? 'page' : undefined} className={`platform-rail-item${activa ? ' is-active' : ''}`}>
              <span className="platform-rail-pill"><Icon size={20} strokeWidth={2} aria-hidden="true" /></span>
              <span>{item.etiqueta}</span>
            </Link>
          </li>;
        })}
      </ul>
      <span className="platform-rail-avatar" title="Super Admin" aria-hidden="true">{inicial}</span>
    </nav>
  );
};
