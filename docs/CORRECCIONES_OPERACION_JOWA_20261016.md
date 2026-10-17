# Correcciones operativas de Jowa System

Fecha: 2026-10-16, America/Tegucigalpa. Rama única: `fix/jowa-operacion-estable`.
Base comprobada: `1e8afd617d8b215ba7063f0e2aeb72db1f18c2f5` (incluye PR #172).

Entrega en [PR único #173](https://github.com/Nelosama/FerreSystem/pull/173), en borrador. Validación local terminada; el SHA final y los checks definitivos se consignan en el PR. Sin merge, despliegue ni migraciones productivas. `git merge --no-ff origin/main` comprobó main ya incluido; sin conflictos, rebase ni reescritura de historial.

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

| Verificación local | Resultado |
|---|---|
| Backend unitarias | 508/508 |
| Frontend unitarias | 379/379 |
| Scripts backend | 48/48 |
| PostgreSQL 17 completo | 1012 pasan, 1 omitida preexistente; 62 archivos |
| Integración afectada repetida | 121 pasan, 1 omitida preexistente; 6 archivos |
| HTTP, caída y recuperación de PostgreSQL | 6/6 en pasada aislada |
| Navegador con API simulada | 173 pasan; 1 fallo del emulador offline Chromium 151 |
| Sesiones móviles, Chromium táctil | 15/15 |
| Piloto con API y PostgreSQL reales | 139 pasan, 1 fallo offline, 10 omisiones preexistentes, 13 sin ejecutar por serialidad |
| Nuevos escenarios del piloto real | 5/5: acceso/logout, sucursales, administradores, idioma y TOPNAV |
| Logotipos móviles con API/PostgreSQL reales | 4/4 |
| Builds de frontend/backend, lint y control de migraciones | Sin errores; una migración nueva |
| Guard de previews de esta rama | Correcto (14 comprobaciones del guard) |

En el primer commit `7aeb9411`, GitHub aprobó el piloto completo **153/153 ejecutados** y 10 omisiones preexistentes, con Chromium correspondiente a Playwright: [ejecución 39003754774](https://github.com/Nelosama/FerreSystem/actions/runs/39003754774). Incluye respaldo cifrado, restauración y ensayo de actualización/reversión. También pasaron guard y navegador completo/móvil en validate. Es evidencia del primer commit, no sustituye los checks del SHA final; estos se enlazan en el PR.

El piloto real verifica venta/cobro, caja, compras, entregas, crédito/abonos, permisos, aislamiento, revocación, almacenamiento de archivos y consultas directas a PostgreSQL. Las pruebas nuevas usan NestJS compilado y PostgreSQL con migraciones, sin respuestas de API simuladas. La suite `e2e/` existente sí utiliza interceptores de prueba y se identifica como tal.

Se mantienen los fallos originales en la evidencia: la primera integración detectó la regresión de restablecimiento `{}` y el diagnóstico de migración desactualizado. La segunda dejó un único fallo de `/admin/tenants`: la base histórica de `ventas.postgres.integration.ts` no aplicaba la nueva migración, por lo que faltaba `sucursales`. Se añadió esa migración a su ruta de actualización, manteniendo fixture histórico y expectativas; la pasada completa final pasa. La recuperación HTTP falló inicialmente al reiniciar PostgreSQL bajo carga concurrente (4/6) y pasa 6/6 en ejecución aislada; no se cambió esa prueba.

En navegador se corrigieron buscador oculto en TOPNAV móvil y etiquetas ambiguas. Los fixtures de idioma ahora reciben la configuración del servidor; los tests nuevos aíslan preferencias entre casos y usan las etiquetas de logout en ambos idiomas. Las expectativas de identidad del administrador incluyen ahora al actor de auditoría. No se eliminaron pruebas ni se forzó `navigator.onLine`; la aserción que detecta Chromium 151 permanece fallando localmente.

Comandos reproducibles desde el repositorio (PostgreSQL temporal; nunca una URL productiva):

```sh
npm test --prefix frontend
npm run build --prefix backend
VITE_API_URL=/api npm run build --prefix frontend
npm run lint --prefix frontend
npm run lint --prefix backend
npm test --prefix backend
npm run test:scripts --prefix backend
PG_BIN=/ruta/postgresql/bin npm run test:integration --prefix backend
PG_BIN=/ruta/postgresql/bin npm run test:e2e --prefix backend
npm run test:browser --prefix frontend -- --workers=2
npm run test:browser --prefix frontend -- --config playwright.session.mobile.config.ts --workers=2
PG_BIN=/ruta/postgresql/bin npm run test:e2e-real --prefix frontend
PG_BIN=/ruta/postgresql/bin PW_CONFIG=playwright.real.mobile.config.ts npm run test:e2e-real --prefix frontend -- logotipo-real
node backend/scripts/verificar-migraciones.mjs --base origin/main
```

El entorno local utilizó `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium` (151.0.7922.173) porque `npx playwright install chromium` recibe 403 Domain forbidden de `cdn.playwright.dev`. CI instala Chromium 153. No se usa esa variable en CI. Las comprobaciones SQL y restauraciones pertenecen exclusivamente a clústeres temporales.

## Riesgos y límites

- La configuración y los datos de producción no se han inspeccionado ni modificado. El nuevo almacén necesita la migración autorizada antes de activarse.
- Supabase real y dispositivos físicos/Safari/impresoras no verificados.
- Chromium 151 del entorno reproduce un fallo conocido de emulación offline. Chromium 153 de Playwright no se descarga: proxy 403 Domain forbidden. CI usa la versión requerida; el resultado del HEAD debe consultarse antes de recomendar merge.
- Un almacén externo puede conservar candidatos huérfanos ante un commit ambiguo o un fallo de limpieza. Se prioriza conservar el objeto vigente; PostgreSQL evita candidatos huérfanos por rollback transaccional. No se añadió una tarea destructiva de limpieza.
- La validación de imágenes conserva el validador existente de cabeceras; no decodifica píxeles ni elimina EXIF.

Firma de integridad y persistencia: **NEXUS**. La recomendación y los checks del HEAD definitivo se mantienen en el PR #173; el propietario decide el merge y la activación.

## Archivos modificados

55 archivos respecto de main; sin dependencias nuevas ni lockfiles modificados. El diff del PR es la referencia completa.

```text
backend/.env.example
backend/prisma/migrations/20261019000000_cloud_branding_sucursales/migration.sql
backend/prisma/schema.prisma
backend/scripts/estado-base-solo-lectura.sql
backend/src/super-admin/sucursal.dto.ts
backend/src/super-admin/super-admin.controller.ts
backend/src/super-admin/super-admin.service.ts
backend/src/super-admin/tenant-admin.http.spec.ts
backend/src/tenants/logotipo-almacen.spec.ts
backend/src/tenants/logotipo-almacen.ts
backend/src/tenants/tenant-configuration.ts
backend/src/tenants/tenant-logo.service.ts
backend/src/tenants/tenants.module.ts
backend/src/tenants/tenants.service.spec.ts
backend/src/tenants/tenants.service.ts
backend/src/usuarios/usuarios.service.ts
backend/test/administracion-cloud.postgres.integration.ts
backend/test/configuracion-logotipo.postgres.integration.ts
backend/test/ventas.postgres.integration.ts
docs/CONTEXTO_MAESTRO.md
docs/CORRECCIONES_OPERACION_JOWA_20261016.md
frontend/e2e-real/administracion-cloud-real.spec.ts
frontend/e2e-real/logotipo-real.spec.ts
frontend/e2e-real/run.sh
frontend/e2e/navigation-settings.spec.ts
frontend/e2e/productos-edicion.spec.ts
frontend/src/App.css
frontend/src/App.tsx
frontend/src/components/BottomNavigation.tsx
frontend/src/components/NegocioNavigation.tsx
frontend/src/components/ProtectedRoute.tsx
frontend/src/components/Sidebar.tsx
frontend/src/components/TenantBrand.tsx
frontend/src/components/TopBar.tsx
frontend/src/components/TopNavigation.tsx
frontend/src/config/navigation.ts
frontend/src/context/I18nContext.tsx
frontend/src/context/TenantContext.tsx
frontend/src/locales/en.json
frontend/src/locales/es.json
frontend/src/pages/AuditoriaPage.tsx
frontend/src/pages/ConfiguracionPage.tsx
frontend/src/pages/LoginPage.tsx
frontend/src/pages/NegocioDetallePage.tsx
frontend/src/pages/SuperAdminPage.tsx
frontend/src/utils/authInterceptors.ts
frontend/src/utils/taskNavigation.ts
frontend/src/utils/tenantSettings.ts
frontend/src/v2-theme.css
frontend/test/auth-session.test.mjs
frontend/test/operaciones.test.mjs
frontend/test/taskNavigation.test.mjs
frontend/test/tenantSettings.test.mjs
frontend/test/vercel-pilot-guard.test.mjs
frontend/vercel.json
```
