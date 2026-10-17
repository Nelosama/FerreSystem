import { NavLink } from 'react-router-dom';
export function NegocioNavigation({ negocioId }: { negocioId: string }) {
  const base = `/admin/negocios/${negocioId}`;
  return <nav className="negocio-tabs" aria-label="Administración del negocio">
    {([['', 'Resumen'], ['/servicios', 'Servicios'], ['/usuarios', 'Usuarios'], ['/marca', 'Marca y navegación'], ['/configuracion', 'Configuración'], ['/auditoria', 'Auditoría']] as const).map(([path, label]) => <NavLink key={path} end to={`${base}${path}`} className={({ isActive }) => isActive ? 'active' : ''}>{label}</NavLink>)}
  </nav>;
}
