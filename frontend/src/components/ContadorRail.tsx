import React from 'react';
import { FileText, MoreHorizontal } from 'lucide-react';
import { useTenant } from '../context/TenantContext';
import { useI18n } from '../context/I18nContext';
import { SECCIONES_MAS, SECCIONES_PRINCIPALES, permitidas, type SeccionContador } from '../config/contadorNavigation';
import { LogotipoNegocio } from './LogotipoNegocio';
import { IndicadorConexion } from './IndicadorConexion';
import { IconRail, type RailEntry, type RailLink } from './IconRail';

/**
 * Rail de iconos del CONTADOR (barra lateral de escritorio): Inicio, Asientos, Reportes, Cierre y «Más».
 * Usa el mismo componente y los mismos estilos (`app-rail`) que el rail del cajero y del administrador.
 */
export const ContadorRail: React.FC = () => {
  const { user } = useTenant();
  const { t } = useI18n();
  const enlace = (s: SeccionContador): RailLink => ({ key: s.key, label: t(s.labelKey), to: s.route, icon: s.icon ?? FileText, end: true });
  const entradas: RailEntry[] = permitidas(SECCIONES_PRINCIPALES, user).map(enlace);
  const mas = permitidas(SECCIONES_MAS, user);
  if (mas.length > 0) {
    entradas.push({ key: 'mas', label: t('navigation.more_short'), icon: MoreHorizontal, grupos: [{ titulo: '', items: mas.map(enlace) }] });
  }
  return (
    <IconRail
      className="contador-rail"
      testId="contador-rail"
      ariaLabel={t('accounting.nav.label')}
      marca={<LogotipoNegocio size={56} encuadre />}
      marcaEtiqueta={t('accounting.nav.home_link')}
      entradas={entradas}
      pie={<IndicadorConexion compacto />}
      avatar={{ inicial: (user?.nombre || 'C').trim().charAt(0).toUpperCase(), titulo: user?.nombre }}
    />
  );
};
