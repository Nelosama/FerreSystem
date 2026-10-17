import { Store, UserCog, Layers, Headset, ListChecks, Database } from 'lucide-react';

/** Áreas del panel del SUPERADMIN. El valor interno no cambia; la URL usa un nombre legible. */
export type SeccionPlataforma = 'dashboard' | 'tenants' | 'modulos' | 'admins' | 'auditoria' | 'soporte_historial' | 'mantenimiento';

export const SLUG_SECCION: Record<SeccionPlataforma, string> = {
  dashboard: 'resumen', tenants: 'negocios', admins: 'administradores', modulos: 'servicios',
  soporte_historial: 'soporte', auditoria: 'auditoria', mantenimiento: 'mantenimiento',
};
export const SECCIONES_PLATAFORMA: Record<string, SeccionPlataforma> = Object.fromEntries(
  Object.entries(SLUG_SECCION).map(([seccion, slug]) => [slug, seccion as SeccionPlataforma]),
);

export const MENU_PLATAFORMA = [
  { grupo: 'clientes', items: [
    { seccion: 'tenants' as const, etiqueta: 'Negocios', icon: Store },
    { seccion: 'admins' as const, etiqueta: 'Usuarios administradores', icon: UserCog },
  ] },
  { grupo: 'plataforma', items: [
    { seccion: 'modulos' as const, etiqueta: 'Catálogo de servicios', icon: Layers },
    { seccion: 'soporte_historial' as const, etiqueta: 'Soporte remoto', icon: Headset },
    { seccion: 'auditoria' as const, etiqueta: 'Auditoría', icon: ListChecks },
    { seccion: 'mantenimiento' as const, etiqueta: 'Mantenimiento y respaldos', icon: Database },
  ] },
];

/** Pestañas de un negocio concreto; mismas rutas que NegocioNavigation. */
export const PESTANAS_NEGOCIO = [['', 'Resumen y sucursales'], ['/servicios', 'Servicios'], ['/usuarios', 'Usuarios'], ['/marca', 'Marca y navegación'], ['/configuracion', 'Configuración'], ['/auditoria', 'Auditoría']] as const;
