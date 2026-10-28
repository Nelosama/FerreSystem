/**
 * Autorización de Contabilidad y Control Tributario.
 * - ADMIN: todo, incluida la reapertura de períodos.
 * - CONTADOR: consulta, registro de documentos/retenciones/asientos, configuración fiscal y cierre de período.
 *   No tiene acceso de escritura a ventas, cobros, inventario ni caja: esas rutas no incluyen su rol.
 * Los permisos individuales siguen la regla existente (RolesGuard/authorizedActor): solo restringen a quien
 * tiene permisos configurados; ADMIN nunca se restringe.
 */
export const MODULO_CONTABILIDAD = 'contabilidad';
export const ROLES_CONTABILIDAD = ['ADMIN', 'CONTADOR'] as const;
export const ROLES_REAPERTURA = ['ADMIN'] as const;
export const PERMISOS_CONTABILIDAD = {
  ver: 'contabilidad.ver',
  registrar: 'contabilidad.registrar',
  configurar: 'contabilidad.configurar',
  cerrarPeriodo: 'contabilidad.cerrar_periodo',
} as const;
