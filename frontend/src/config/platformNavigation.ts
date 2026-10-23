import { House, Store, Layers, ShieldCheck } from 'lucide-react';

/** Secciones del panel del SUPERADMIN. El valor interno no cambia; la URL usa un nombre legible (?seccion=). */
export type SeccionPlataforma = 'dashboard' | 'tenants' | 'modulos' | 'admins' | 'auditoria' | 'soporte_historial' | 'mantenimiento';

export const SLUG_SECCION: Record<SeccionPlataforma, string> = {
  dashboard: 'resumen', tenants: 'negocios', admins: 'administradores', modulos: 'servicios',
  soporte_historial: 'soporte', auditoria: 'auditoria', mantenimiento: 'mantenimiento',
};
export const SECCIONES_PLATAFORMA: Record<string, SeccionPlataforma> = Object.fromEntries(
  Object.entries(SLUG_SECCION).map(([seccion, slug]) => [slug, seccion as SeccionPlataforma]),
);

export type AreaPlataforma = 'inicio' | 'clientes' | 'servicios' | 'seguridad';

/** Áreas del rail. Cada área muestra sus pestañas solo si tiene más de una sección. */
export const AREAS_PLATAFORMA: { id: AreaPlataforma; etiqueta: string; icon: typeof House; secciones: SeccionPlataforma[] }[] = [
  { id: 'inicio', etiqueta: 'Inicio', icon: House, secciones: ['dashboard'] },
  { id: 'clientes', etiqueta: 'Clientes', icon: Store, secciones: ['tenants', 'admins'] },
  { id: 'servicios', etiqueta: 'Servicios', icon: Layers, secciones: ['modulos'] },
  { id: 'seguridad', etiqueta: 'Seguridad', icon: ShieldCheck, secciones: ['auditoria', 'soporte_historial', 'mantenimiento'] },
];

/** Etiquetas de cada pestaña: larga (escritorio) y corta (tableta). */
export const ETIQUETA_SECCION: Record<SeccionPlataforma, { larga: string; corta?: string }> = {
  dashboard: { larga: 'Resumen general', corta: 'Resumen' },
  tenants: { larga: 'Negocios' },
  admins: { larga: 'Administradores' },
  modulos: { larga: 'Catálogo de servicios' },
  auditoria: { larga: 'Auditoría' },
  soporte_historial: { larga: 'Soporte remoto', corta: 'Soporte' },
  mantenimiento: { larga: 'Respaldos' },
};

/** Sección activa según ?seccion= de la URL; por defecto, Negocios. */
export const seccionDePlataforma = (parametros: URLSearchParams): SeccionPlataforma =>
  SECCIONES_PLATAFORMA[parametros.get('seccion') || ''] ?? 'tenants';

/** Área que contiene una sección. */
export const areaDeSeccion = (seccion: SeccionPlataforma): AreaPlataforma =>
  AREAS_PLATAFORMA.find(area => area.secciones.includes(seccion))?.id ?? 'clientes';

/** Pestañas de un negocio concreto; mismas rutas que NegocioNavigation. «Configuración y marca» agrupa /configuracion y /marca. */
export const PESTANAS_NEGOCIO = [
  { ruta: '', etiqueta: 'Resumen y sucursales', corta: 'Resumen', rutas: [''] },
  { ruta: '/usuarios', etiqueta: 'Usuarios', rutas: ['/usuarios'] },
  { ruta: '/servicios', etiqueta: 'Servicios', rutas: ['/servicios'] },
  { ruta: '/configuracion', etiqueta: 'Configuración y marca', corta: 'Configuración', rutas: ['/configuracion', '/marca'] },
  { ruta: '/auditoria', etiqueta: 'Auditoría', rutas: ['/auditoria'] },
] as const;
