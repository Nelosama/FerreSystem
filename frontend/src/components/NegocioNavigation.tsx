import { Link, useLocation } from 'react-router-dom';
import { PESTANAS_NEGOCIO } from '../config/platformNavigation';

/** Pestañas tipo píldora de un negocio. Cada una enlaza a su ruta existente; «Configuración y marca» agrupa /configuracion y /marca. */
export function NegocioNavigation({ negocioId }: { negocioId: string }) {
  const { pathname } = useLocation();
  const base = `/admin/negocios/${negocioId}`;
  const rutaActual = pathname.startsWith(base) ? pathname.slice(base.length).replace(/\/$/, '') : null;
  return <div role="tablist" aria-label="Administración del negocio" className="platform-pills">
    {PESTANAS_NEGOCIO.map(pestana => {
      const activa = rutaActual !== null && (pestana.rutas as readonly string[]).includes(rutaActual);
      return <Link key={pestana.ruta} to={`${base}${pestana.ruta}`} role="tab" aria-selected={activa} aria-current={activa ? 'page' : undefined} className="platform-pill-tab">
        <span className="platform-pill-long">{pestana.etiqueta}</span>
        <span className="platform-pill-short">{'corta' in pestana ? pestana.corta : pestana.etiqueta}</span>
      </Link>;
    })}
  </div>;
}
