import React from 'react';
import { MoreHorizontal } from 'lucide-react';
import { useTenant } from '../context/TenantContext';
import { useI18n } from '../context/I18nContext';
import { availableTasks, groupNavigation, DISPONIBLE_SIN_RED } from '../utils/taskNavigation';
import { type NavigationItem } from '../config/navigation';
import { LogotipoNegocio } from './LogotipoNegocio';
import { IndicadorConexion } from './IndicadorConexion';
import { IconRail, type RailEntry, type RailLink } from './IconRail';
import { useConexion } from '../hooks/useConexion';

// Accesos fijos del rail del cajero (Inicio, Caja, Mi caja). El resto queda en «Más».
const PRINCIPALES = ['dashboard', 'pos', 'arqueo_caja'] as const;
// El rail es angosto (84 px): Caja y Mi caja usan etiqueta corta; el nombre completo del módulo queda como ayuda.
const ETIQUETA_RAIL: Record<string, string> = { pos: 'navigation.rail_pos', arqueo_caja: 'navigation.rail_cash' };

/** Rail de iconos del cajero (solo en modo barra lateral). El negocio conserva su color en el estado activo. */
export const CajeroRail: React.FC = () => {
  const { tenant, user } = useTenant();
  const { t } = useI18n();
  const { enLinea } = useConexion();

  const visibles = availableTasks(user, tenant);
  const principales = PRINCIPALES.map(key => visibles.find(item => item.key === key)).filter((item): item is NavigationItem => Boolean(item));
  const resto = visibles.filter(item => !principales.includes(item));

  const etiqueta = (item: NavigationItem) => {
    const traducida = t(item.labelKey);
    return traducida && traducida !== item.labelKey ? traducida : item.defaultLabel;
  };
  const sinRed = (item: NavigationItem) => !enLinea && !DISPONIBLE_SIN_RED.has(item.key);
  const enlace = (item: NavigationItem): RailLink => ({
    key: item.key, label: etiqueta(item), to: item.route, icon: item.icon, end: item.exact,
    sinRed: sinRed(item), pista: t('navigation.needs_connection'),
  });

  const entradas: RailEntry[] = principales.map(item => ({
    ...enlace(item),
    label: ETIQUETA_RAIL[item.key] ? t(ETIQUETA_RAIL[item.key]) : etiqueta(item),
    ayuda: etiqueta(item),
  }));
  if (resto.length > 0) {
    entradas.push({
      key: 'mas', label: t('navigation.more_short'), icon: MoreHorizontal,
      grupos: groupNavigation(resto).map(grupo => ({ titulo: t('navigation.' + grupo.category), items: grupo.items.map(enlace) })),
    });
  }

  return (
    <IconRail
      className="cajero-rail"
      ariaLabel={t('navigation.main')}
      marca={<LogotipoNegocio size={36} />}
      marcaEtiqueta={t('navigation.home_link')}
      entradas={entradas}
      pie={<IndicadorConexion compacto />}
      avatar={{ inicial: (user?.nombre || 'C').trim().charAt(0).toUpperCase(), titulo: user?.nombre }}
    />
  );
};
