# Correcciones operativas de Jowa System

Fecha: 2026-10-16, America/Tegucigalpa. Rama única: `fix/jowa-operacion-estable`.
Base comprobada: `1e8afd617d8b215ba7063f0e2aeb72db1f18c2f5` (incluye PR #172).

Estado al publicar borrador: validación final en curso. Sin autorización para merge, despliegue ni migraciones productivas.

## Cambios

1. Login: una expiración real produce un aviso durante la redirección actual; el aviso no persiste en entradas posteriores. Logout voluntario y errores de conexión conservan su tratamiento separado. No se elimina la validación previa de sesiones restauradas de #172.
2. Logotipos: la configuración anterior devolvía almacén nulo cuando faltaba `LOGOTIPO_ALMACEN`. Ahora PostgreSQL ya configurado en la nube es el proveedor predeterminado. Se conserva la selección explícita de Supabase o volumen local. Tipos PNG/JPEG/WEBP, hasta 2 MB, validación real de firmas/cabeceras y dimensiones. Cada objeto tiene clave nueva; PostgreSQL guarda bytes, referencia y auditoría en una transacción. Otros proveedores publican primero un candidato sin sobrescribir el previo. Lecturas autenticadas por tenant y escritura exclusiva de Super Admin.
3. Navegación: TOPNAV sigue los nueve accesos indicados y SIDEBAR los cuatro grupos de las capturas. Las operaciones adicionales permanecen en menús secundarios. Inicio cubre toda la marca; buscador y navegación móvil conservados. Los permisos explícitos del POS coinciden con el backend.
4. Idioma: configuración `idioma` por tenant, validada y persistida. Solo Super Admin modifica el negocio. El usuario recibe su idioma sin selector en escritorio ni móvil. La preferencia personal de idioma del portal de Super Admin se conserva separada.
5. Plataforma: Clientes y usuarios administradores, Catálogo de servicios, Soporte, Auditoría y Mantenimiento. Detalle: Resumen, Servicios, Usuarios, Marca y navegación, Configuración y Auditoría. Se conservan soporte, impersonación, administración de módulos y respaldo. Auditoría global real, con 200 eventos recientes y detalle por tenant paginado.
6. Sucursales y usuarios: CRUD administrativo con desactivación; no existe borrado físico expuesto. UsuariosService conserva roles, descuentos, permisos, revocación de sesiones y protección concurrente del último administrador. Las rutas rechazan identificadores de otro tenant y registran al Super Admin responsable.

## PostgreSQL — NEXUS

Migración aditiva `20261019000000_cloud_branding_sucursales`: tablas `logotipo_objetos` y `sucursales`, FK restrictivas al tenant, límites y coherencia de clave, índices, RLS sin políticas públicas. Requiere rol backend propietario o BYPASSRLS. No cambia columnas de ventas, inventario, caja ni contingencia. El diagnóstico de solo lectura incluye los SHA-256 de la migración.

Antes de activar en producción: revisión humana de la migración, respaldo verificado y ejecución autorizada del mecanismo existente `migrate:deploy`. Nada de ello se ha ejecutado sobre producción. Conservar tablas y datos si se revierte el código; no eliminar tablas automáticamente. Los logotipos pequeños ahora forman parte del respaldo PostgreSQL. Si se elige Supabase, el bucket debe seguir privado y las credenciales exclusivamente en backend.

Las sucursales constituyen el catálogo administrativo solicitado; no se crean reglas de inventario/caja por sede ni transferencias nuevas. Los registros se desactivan y su historial permanece.

## Validación

Resultados finales pendientes de completar en este informe y en el PR. Evidencia ya obtenida: backend unitarias 508/508, frontend 377/377, scripts 48/48, recuperación HTTP 6/6 en repetición aislada, builds y lint sin errores. Las pruebas reales usan NestJS y clústeres PostgreSQL temporales con migraciones; ninguna implementación nueva se simula.

Se mantienen los fallos originales en los registros: la pasada inicial detectó una regresión de `{}` y un diagnóstico de migración desactualizado, ya corregidos. El navegador detectó buscador oculto en TOPNAV móvil y etiquetas ambiguas, corregidos; los fixtures de idioma se adaptan a configuración devuelta por servidor y no a preferencias locales de tenant. No se eliminan pruebas ni se fuerzan valores de navigator.

## Riesgos y límites

- La configuración y los datos de producción no se han inspeccionado ni modificado. El nuevo almacén necesita la migración autorizada antes de activarse.
- Supabase real y dispositivos físicos/Safari/impresoras no verificados.
- Chromium 151 del entorno reproduce un fallo conocido de emulación offline. Chromium 153 de Playwright no se descarga: proxy 403 Domain forbidden. CI usa la versión requerida; el resultado del HEAD debe consultarse antes de recomendar merge.
- Un almacén externo puede conservar candidatos huérfanos ante un commit ambiguo o un fallo de limpieza. Se prioriza conservar el objeto vigente; PostgreSQL evita candidatos huérfanos por rollback transaccional. No se añadió una tarea destructiva de limpieza.
- La validación de imágenes conserva el validador existente de cabeceras; no decodifica píxeles ni elimina EXIF.

Firma de integridad y persistencia: **NEXUS**. Estado final y archivos modificados pendientes de cerrar tras las suites.
