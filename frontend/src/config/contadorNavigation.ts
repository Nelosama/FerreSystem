import { BarChart3, BookOpenCheck, CalendarCheck, Home, type LucideIcon } from 'lucide-react';
import type { Pestana } from '../utils/contabilidad';

// Navegación del módulo de Contabilidad, agrupada por tarea y frecuencia de uso. Solo incluye pantallas que funcionan:
// «Por contabilizar» y los estados financieros se agregarán cuando el contador apruebe sus reglas (ver CONTEXTO_MAESTRO).
export interface SeccionContador {
  key: string;
  route: string;
  labelKey: string;
  /** Pestañas de la pantalla; con una sola no se muestra la barra de pestañas. */
  tabs: readonly Pestana[];
  /** Permiso de consulta: se aplica igual que en el servidor (solo restringe a quien tiene permisos configurados). */
  permiso: string;
  icon?: LucideIcon;
}

/** Accesos fijos del rail: lo que el contador usa a diario o cada mes. */
export const SECCIONES_PRINCIPALES: readonly SeccionContador[] = [
  { key: 'inicio', route: '/contabilidad', labelKey: 'accounting.nav.home', tabs: [], permiso: 'contabilidad.ver', icon: Home },
  { key: 'asientos', route: '/contabilidad/asientos', labelKey: 'accounting.nav.entries', tabs: ['asientos'], permiso: 'contabilidad.ver', icon: BookOpenCheck },
  { key: 'reportes', route: '/contabilidad/reportes', labelKey: 'accounting.nav.reports', tabs: ['balanza', 'mayor', 'ventas', 'compras', 'resumen'], permiso: 'contabilidad.ver', icon: BarChart3 },
  { key: 'cierre', route: '/contabilidad/cierre', labelKey: 'accounting.nav.closing', tabs: ['periodos'], permiso: 'contabilidad.ver', icon: CalendarCheck },
];
/** Uso ocasional: dentro de «Más». */
export const SECCIONES_MAS: readonly SeccionContador[] = [
  { key: 'catalogo', route: '/contabilidad/catalogo', labelKey: 'accounting.nav.chart', tabs: ['catalogo'], permiso: 'contabilidad.ver' },
  { key: 'cartera', route: '/contabilidad/cartera', labelKey: 'accounting.nav.receivables', tabs: ['cartera'], permiso: 'contabilidad.ver' },
  { key: 'documentos', route: '/contabilidad/documentos', labelKey: 'accounting.nav.documents', tabs: ['documentos', 'retenciones'], permiso: 'contabilidad.ver' },
  { key: 'configuracion', route: '/contabilidad/configuracion', labelKey: 'accounting.nav.tax_settings', tabs: ['configuracion'], permiso: 'contabilidad.ver' },
  { key: 'excel', route: '/contabilidad/excel', labelKey: 'accounting.nav.excel', tabs: ['excel'], permiso: 'contabilidad.ver' },
  { key: 'auditoria', route: '/contabilidad/auditoria', labelKey: 'accounting.nav.audit', tabs: ['ajustes'], permiso: 'contabilidad.ver' },
];
export const SECCIONES_CONTADOR: readonly SeccionContador[] = [...SECCIONES_PRINCIPALES, ...SECCIONES_MAS];

/** Misma regla que `RolesGuard`: ADMIN y quien no tiene permisos configurados no se restringen. */
export function permitidas(secciones: readonly SeccionContador[], user: { rol?: string; permisos?: string[]; permisosConfigurados?: boolean } | null): SeccionContador[] {
  if (!user) return [];
  return secciones.filter(s => user.rol === 'ADMIN' || !user.permisosConfigurados || !!user.permisos?.includes(s.permiso));
}
