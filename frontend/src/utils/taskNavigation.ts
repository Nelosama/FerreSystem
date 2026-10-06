import { NAVIGATION_CATEGORIES, NAVIGATION_ITEMS, ROLE_PRIORITIES, type NavigationItem } from '../config/navigation';
import type { TenantInfo, UserInfo } from '../types';

import { PENDING_MODULES, CATALOGO_MODULOS } from '../config/modulesCatalog';
export const TASK_DETAILS: Record<string, { title: string; description: string; keywords: string }> = {
  dashboard: { title: 'Inicio', description: 'Elegir una tarea y revisar el resumen del negocio.', keywords: 'ayuda resumen inicio' },
  pos: { title: 'Hacer una venta', description: 'Buscar productos, cobrar y emitir el comprobante.', keywords: 'vender cobrar factura punto de venta' },
  arqueo_caja: { title: 'Abrir o cerrar caja', description: 'Registrar el fondo inicial, revisar movimientos y contar el efectivo.', keywords: 'dinero turno cierre apertura efectivo arqueo' },
  ordenes_compra: { title: 'Comprar y recibir mercadería', description: 'Registrar proveedores, facturas y recibir productos.', keywords: 'compras proveedor abastecer entrada mercaderia' },
  inventario: { title: 'Consultar productos y existencias', description: 'Buscar productos y revisar precios y stock.', keywords: 'existencias stock catalogo precio producto' },
  levantamiento: { title: 'Contar el inventario', description: 'Registrar el conteo físico de los productos.', keywords: 'conteo fisico contar inventario' },
  clientes: { title: 'Buscar o registrar un cliente', description: 'Consultar y actualizar los datos de clientes.', keywords: 'cliente nombre telefono registro' },
  cuentas: { title: 'Consultar cuentas y registrar abonos', description: 'Revisar saldos pendientes y registrar pagos.', keywords: 'deuda credito abono pagar cobrar saldo' },
  entregas: { title: 'Entregar productos vendidos', description: 'Revisar las entregas pendientes y confirmar la entrega.', keywords: 'despachar entrega pedido' },
  usuarios: { title: 'Administrar el personal', description: 'Gestionar usuarios, roles y permisos.', keywords: 'empleado cajero acceso clave usuario permisos' },
  reportes: { title: 'Revisar los reportes', description: 'Consultar los resultados del negocio.', keywords: 'ventas resultados estadisticas ganancias reporte' },
  devoluciones: { title: 'Registrar una devolución', description: 'Solicitar una devolución, revisar autorizaciones y confirmar el reembolso.', keywords: 'reversar devolver reembolso anular devolucion' },
  auditoria: { title: 'Revisar la actividad del sistema', description: 'Consultar el historial de operaciones.', keywords: 'historial auditoria cambios actividad' },
  cotizaciones: { title: 'Preparar una cotización', description: 'Crear y consultar presupuestos para clientes.', keywords: 'presupuesto cotizar cotizacion' },
  configuracion: { title: 'Configurar el negocio', description: 'Revisar las opciones de la empresa y la interfaz.', keywords: 'ajustes empresa configuracion' },
};
export function canNavigate(item: NavigationItem, user: UserInfo | null, tenant: TenantInfo): boolean {
  if (!user || (item.allowedRoles?.length && !item.allowedRoles.includes(user.rol))) return false;
  if (item.requiredPermiso && user.rol !== 'ADMIN' && !user.permisos?.includes(item.requiredPermiso)) return false;
  if (item.moduleKey && CATALOGO_MODULOS.find(module => module.key === item.moduleKey)?.isCore) return true;
  return !item.moduleKey || tenant.modulosHabilitados === undefined || tenant.modulosHabilitados.includes(item.moduleKey);
}
export const availableTasks = (user: UserInfo | null, tenant: TenantInfo) =>
  NAVIGATION_ITEMS.filter(item => (!item.moduleKey || !PENDING_MODULES.has(item.moduleKey)) && canNavigate(item, user, tenant)).sort((a,b) => NAVIGATION_CATEGORIES.indexOf(a.category) - NAVIGATION_CATEGORIES.indexOf(b.category));
const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function searchTasks(items: NavigationItem[], query: string, translate?: (key: string) => string): NavigationItem[] {
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  return items.filter(item => {
    const detail = TASK_DETAILS[item.key];
    const text = normalize(`${translate?.(item.labelKey) || ""} ${translate?.("tasks." + item.key + ".title") || ""} ${translate?.("tasks." + item.key + ".description") || ""} ${item.defaultLabel} ${detail?.title || ''} ${detail?.description || ''} ${detail?.keywords || ''}`);
    return words.every(word => text.includes(word));
  });
}

export const priorityTasks = (user: UserInfo | null, tenant: TenantInfo) => {
  const tasks = availableTasks(user, tenant);
  return (ROLE_PRIORITIES[user?.rol || ''] || []).flatMap(key => tasks.filter(item => item.key === key)).slice(0, 4);
};
export const groupNavigation = (items: NavigationItem[]) => NAVIGATION_CATEGORIES.flatMap(category => {
  const group = items.filter(item => item.category === category);
  return group.length ? [{ category, items: group }] : [];
});
