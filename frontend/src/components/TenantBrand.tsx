import { NavLink } from 'react-router-dom';
import { useTenant } from '../context/TenantContext';
import { LogotipoNegocio } from './LogotipoNegocio';

/** Identidad del negocio para barras y cabeceras: logotipo (o ícono) y nombre comercial como protagonista. */
export function TenantBrand() {
  const { tenant } = useTenant();
  return <NavLink to="/" aria-label="Ir a Inicio del negocio" className="app-tenant-brand" style={{ color: 'inherit', textDecoration: 'none' }}>
    <LogotipoNegocio size={32} conIcono={false} />
    <span>{tenant.nombreComercial || 'Negocio'}</span>
  </NavLink>;
}
