import { useTenant } from '../context/TenantContext';

export function TenantBrand() {
  const { tenant } = useTenant();
  return <div className="v2-tenant-brand">
    {tenant.logoUrl
      ? <img src={tenant.logoUrl} alt={tenant.nombreComercial} />
      : <span>{tenant.nombreComercial || 'FerreSystem'}</span>}
  </div>;
}
