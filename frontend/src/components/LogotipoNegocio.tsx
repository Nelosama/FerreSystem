import React from 'react';
import { useTenant } from '../context/TenantContext';
import { useLogotipoNegocio } from '../hooks/useLogotipoNegocio';
import { useFondoLogotipo } from '../hooks/useFondoLogotipo';
import { inicialesNegocio } from '../utils/identidadNegocio';

interface LogotipoNegocioProps {
  /** Altura aproximada en píxeles. */
  size?: number;
  /** Si no hay logotipo, muestra las iniciales del negocio. Las cabeceras lo omiten para no saturar. */
  conIcono?: boolean;
  /**
   * Encuadre de marco: el logotipo se contiene entero (sin deformar ni recortar) dentro de un cuadrado de `size` px
   * con una superficie neutra del tema, clara u oscura según el contraste del propio logotipo.
   */
  encuadre?: boolean;
}

/** Identidad visual del negocio activo: su logotipo privado o, si no existe, sus iniciales sobre el color de marca. */
export const LogotipoNegocio: React.FC<LogotipoNegocioProps> = ({ size = 36, conIcono = true, encuadre = false }) => {
  const { tenant } = useTenant();
  const src = useLogotipoNegocio(tenant.logotipo ? '/tenant/logo' : null, tenant.logotipo?.actualizadoAt ?? null);
  const fondo = useFondoLogotipo(encuadre ? src : null);

  if (encuadre) {
    return (
      <span className="logo-marco" data-fondo={src ? fondo : 'iniciales'} style={{ width: size, height: size }}>
        {src
          ? <img src={src} alt={tenant.nombreComercial || 'Logotipo del negocio'} className="logo-marco-imagen" />
          : <span aria-hidden="true" className="logotipo-iniciales logo-marco-iniciales" style={{ fontSize: Math.round(size * 0.34) }}>{inicialesNegocio(tenant.nombreComercial)}</span>}
      </span>
    );
  }
  if (src) {
    return <img src={src} alt={tenant.nombreComercial || 'Logotipo del negocio'} style={{ height: size, width: 'auto', maxWidth: size * 3, objectFit: 'contain', display: 'block' }} />;
  }
  if (!conIcono) return null;
  return (
    <div aria-hidden="true" className="logotipo-iniciales" style={{ width: size, height: size, borderRadius: Math.round(size / 4), fontSize: Math.round(size * 0.38) }}>
      {inicialesNegocio(tenant.nombreComercial)}
    </div>
  );
};
