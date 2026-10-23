import React from 'react';
import { Boxes, Home, MoreHorizontal, ShoppingCart, Truck, Users, type LucideIcon } from 'lucide-react';
import { useTenant } from '../context/TenantContext';
import { useI18n } from '../context/I18nContext';
import { useConexion } from '../hooks/useConexion';
import { useEtiquetaTarea } from '../hooks/useEtiquetaTarea';
import { availableTasks, groupNavigation, DISPONIBLE_SIN_RED } from '../utils/taskNavigation';
import type { NavigationItem } from '../config/navigation';
import { LogotipoNegocio } from './LogotipoNegocio';
import { IndicadorConexion } from './IndicadorConexion';
import { IconRail, type RailEntry, type RailLink } from './IconRail';

/**
 * Agrupaciones visuales del rail del administrador. No sustituyen a los módulos: cada grupo solo lista los accesos que el
 * usuario puede usar (rol, permiso y módulo habilitado, según `availableTasks`). Lo que no esté aquí aparece en «Más».
 */
const GRUPOS: { key: string; etiqueta: string; icono: LucideIcon; accesos: string[] }[] = [
  { key: 'ventas', etiqueta: 'navigation.rail_sales', icono: ShoppingCart, accesos: ['pos', 'cotizaciones', 'pedidos_especiales', 'apartados', 'devoluciones', 'entregas', 'arqueo_caja', 'contingencia_admin'] },
  { key: 'inventario', etiqueta: 'navigation.rail_inventory', icono: Boxes, accesos: ['inventario', 'precios', 'levantamiento', 'transferencias', 'garantias'] },
  { key: 'compras', etiqueta: 'navigation.rail_purchases', icono: Truck, accesos: ['ordenes_compra'] },
  { key: 'clientes', etiqueta: 'navigation.rail_customers', icono: Users, accesos: ['clientes', 'cuentas', 'estado_cuenta_clientes', 'listas_precio'] },
];

/** Rail de iconos del administrador (solo en modo barra lateral): Inicio, Ventas, Inventario, Compras, Clientes y Más. */
export const AdminRail: React.FC = () => {
  const { tenant, user } = useTenant();
  const { t } = useI18n();
  const { enLinea } = useConexion();
  const etiqueta = useEtiquetaTarea();

  const visibles = availableTasks(user, tenant);
  const inicio = visibles.find(item => item.key === 'dashboard');
  const agrupadas = new Set(GRUPOS.flatMap(g => g.accesos).concat('dashboard'));

  const enlace = (item: NavigationItem): RailLink => ({
    key: item.key, label: etiqueta(item), to: item.route, icon: item.icon, end: item.exact,
    sinRed: !enLinea && !DISPONIBLE_SIN_RED.has(item.key), pista: t('navigation.needs_connection'),
  });

  // Inicio siempre está disponible, aunque el catálogo no lo ofrezca por algún motivo.
  const entradas: RailEntry[] = [{
    key: 'inicio', label: inicio ? etiqueta(inicio) : t('menu.dashboard'), icon: Home, to: '/', end: true,
  }];

  for (const grupo of GRUPOS) {
    const items = grupo.accesos.flatMap(key => visibles.filter(item => item.key === key));
    if (items.length === 0) continue;
    if (items.length === 1) {
      // Un solo acceso: enlace directo con el nombre de la agrupación.
      const unico = enlace(items[0]);
      entradas.push({ key: grupo.key, label: t(grupo.etiqueta), icon: grupo.icono, to: unico.to, end: unico.end, ayuda: unico.label, sinRed: unico.sinRed, pista: unico.pista });
    } else {
      entradas.push({ key: grupo.key, label: t(grupo.etiqueta), icon: grupo.icono, grupos: [{ titulo: '', items: items.map(enlace) }] });
    }
  }

  const resto = visibles.filter(item => !agrupadas.has(item.key));
  if (resto.length > 0) {
    entradas.push({
      key: 'mas', label: t('navigation.more_short'), icon: MoreHorizontal,
      grupos: groupNavigation(resto).map(g => ({ titulo: t('navigation.' + g.category), items: g.items.map(enlace) })),
    });
  }

  return (
    <IconRail
      className="admin-rail"
      ariaLabel={t('navigation.main')}
      marca={<LogotipoNegocio size={36} />}
      marcaEtiqueta={t('navigation.home_link')}
      entradas={entradas}
      pie={<IndicadorConexion compacto />}
      avatar={{ inicial: (user?.nombre || 'A').trim().charAt(0).toUpperCase(), titulo: user?.nombre }}
    />
  );
};
