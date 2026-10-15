import { useTenant } from '../context/TenantContext';
import { LogotipoNegocio } from './LogotipoNegocio';

/** Identidad del negocio para barras y cabeceras: logotipo (o ícono) y nombre comercial como protagonista. */
export function TenantBrand() {
  const { tenant } = useTenant();
  return <div className="v2-tenant-brand">
    <LogotipoNegocio size={32} conIcono={false} />
    <span>{tenant.nombreComercial || 'Negocio'}</span>
  </div>;
}
