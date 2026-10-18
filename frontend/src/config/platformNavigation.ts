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
    { seccion: 'tenants' as const, etiquetaKey: 'shell.platform.tenants', icon: Store },
    { seccion: 'admins' as const, etiquetaKey: 'shell.platform.admins', icon: UserCog },
  ] },
  { grupo: 'plataforma', items: [
    { seccion: 'modulos' as const, etiquetaKey: 'shell.platform.services', icon: Layers },
    { seccion: 'soporte_historial' as const, etiquetaKey: 'shell.platform.support', icon: Headset },
    { seccion: 'auditoria' as const, etiquetaKey: 'shell.platform.audit', icon: ListChecks },
    { seccion: 'mantenimiento' as const, etiquetaKey: 'shell.platform.maintenance', icon: Database },
  ] },
];

/** Pestañas de un negocio concreto; mismas rutas que NegocioNavigation. */
export const PESTANAS_NEGOCIO = [['', 'shell.business.summary'], ['/servicios', 'shell.business.services'], ['/usuarios', 'shell.business.users'], ['/marca', 'shell.business.brand'], ['/configuracion', 'shell.business.config'], ['/auditoria', 'shell.business.audit']] as const;
