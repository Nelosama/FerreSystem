import { useI18n } from '../context/I18nContext';
import { useRubroConfig } from './useRubroConfig';
import type { NavigationItem } from '../config/navigation';

/** Nombre visible de un acceso del menú: el catálogo toma el nombre del rubro y Compras y Personal usan su rótulo contextual. */
export function useEtiquetaTarea() {
  const { t } = useI18n();
  const rubro = useRubroConfig();
  return (item: NavigationItem): string => {
    if (item.key === 'inventario') return rubro.nombreCatalogo;
    const clave = item.key === 'ordenes_compra' ? 'navigation.purchases_receiving' : item.key === 'usuarios' ? 'navigation.staff_permissions' : item.labelKey;
    const traducida = t(clave);
    return traducida && traducida !== clave ? traducida : item.defaultLabel;
  };
}
