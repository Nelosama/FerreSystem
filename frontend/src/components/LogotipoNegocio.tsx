import React from 'react';
import { Box } from 'lucide-react';
import { useTenant } from '../context/TenantContext';
import { useLogotipoNegocio } from '../hooks/useLogotipoNegocio';

interface LogotipoNegocioProps {
  /** Altura aproximada en píxeles. */
  size?: number;
  /** Si no hay logotipo, muestra el ícono predeterminado. Las cabeceras lo omiten para no saturar. */
  conIcono?: boolean;
}

/** Identidad visual del negocio activo: su logotipo privado o, si no existe, el ícono predeterminado. */
export const LogotipoNegocio: React.FC<LogotipoNegocioProps> = ({ size = 36, conIcono = true }) => {
  const { tenant } = useTenant();
  const src = useLogotipoNegocio(tenant.logotipo ? '/tenant/logo' : null, tenant.logotipo?.actualizadoAt ?? null);

  if (src) {
    return <img src={src} alt={tenant.nombreComercial || 'Logotipo del negocio'} style={{ height: size, width: 'auto', maxWidth: size * 3, objectFit: 'contain', display: 'block' }} />;
  }
  if (!conIcono) return null;
  return (
    <div aria-hidden="true" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: size, height: size, flexShrink: 0 }}>
      <Box size={Math.round(size * 0.78)} strokeWidth={2.5} color="var(--color-primary-text)" />
    </div>
  );
};
