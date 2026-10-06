# FerreSystem: auditoría y mejoras de experiencia

El trabajo comenzó sobre `main`, con el estado inicial de Git limpio. Los cambios se conservaron íntegros al crear `feat/ux-ui-restructure` para su revisión y publicación. No se encontraron archivos AGENTS.md en el repositorio ni en sus directorios ascendentes. No se hizo merge, despliegue ni migración contra una base de datos de una empresa.

La revisión del diff no identificó cambios ajenos a esta tarea. `ux-update.cjs` y `ux-navigation.cjs` fueron herramientas temporales de edición y ya no existen; no forman parte del commit. Los logs locales de lint también quedan fuera del commit; se incluyen las capturas de validación.

## Hallazgos verificados y decisiones

| Hallazgo previo | Evidencia en el estado inicial | Cambio |
| --- | --- | --- |
| Sidebar plano frente a TopNavigation agrupado | Sidebar recorría NAVIGATION_ITEMS directamente; TopNavigation agrupaba por categoría. | Categorías y orden comunes; lateral y móvil muestran secciones; superior conserva desplegables. |
| Hasta 12 tarjetas y buscador permanente | TaskShortcuts tenía doce prioridades ADMIN; AppLayout siempre renderizaba el formulario del buscador. | Hasta cuatro tareas frecuentes por rol; buscador desplegable fuera del inicio. |
| Guardado incompleto en Configuración | PUT enviaba seis campos; updateTenantConfig incorporaba navegación, rubro, estilos, fuentes, moneda e impuesto sin persistencia. | PUT guarda modoNavegacion y configuración validada en SQL; el contexto adopta la respuesta del servidor. |
| Marca del Super Admin guardada en memoria | El submit solo ejecutaba setTenants y setMensajeExito. | PATCH real; conservar formulario y mostrar error ante fallo. |
| Catálogo local sobrescribe servidor | El efecto buscaba por id **o nombre** en ferre_saas_tenants y aplicaba color, navegación y módulos al montar o cambiar color/nombre. | Retirado ese origen de configuración; GET por sesión autorizada al iniciar y recuperar foco. Regresiones para catálogo antiguo, otra empresa y respuesta anterior a un guardado. |
| Clientes y Caja configurables solo en catálogo | No exigían módulo en rutas ni en sus API actuales. | Funciones base, junto con Configuración. Se conservan los roles existentes; no pueden deshabilitarse por catálogo. |
| Módulos pendientes ofrecidos como operativos | Solo availableTasks los excluía. Las cinco páginas antiguas usaban ferre_mock_* y App dirigía a ModuloPendiente. | Estado pendiente centralizado; no aparece en menús ni tareas; URL autorizada conserva aviso de pendiente. No se reactivaron páginas antiguas. |
| Textos de tareas/categorías sin traducciones | TASK_DETAILS y CATEGORY_CONFIG tenían textos españoles literales. | Traducciones ES/EN de tareas, nuevas categorías, buscador y nuevas etiquetas de configuración. |

También se corrigieron tres defectos encontrados durante la implementación:

- ProtectedRoute aceptaba permisos ausentes en algunos casos; ahora los rechaza igual que los menús y consulta la entrada canónica para acceso por URL.
- Template V2 claro mostraba botones de idioma/navegación y parte de la vista previa con texto blanco sobre blanco. Se corrigió el contraste y se revisó en capturas.
- Super Admin simulaba alta, edición, activación y cambio de contraseña de administradores. Ahora usa endpoints de plataforma con guards, ámbito de empresa, hashing de contraseña y conservación del último administrador activo. Los usuarios de otros roles siguen disponibles para soporte, pero no se presentan como administradores.

La creación/eliminación de sucursales también era local y no tiene modelo ni contrato de API. El acceso está marcado como pendiente y deshabilitado; se eliminaron confirmaciones ficticias y la dirección inventada del registro de demostración. La selección de sucursal existente y su ámbito no se modificaron.

## Responsabilidades

| Configuración o tarea | Responsable | Persistencia y alcance |
| --- | --- | --- |
| Empresas, estado de suscripción, plan y módulos opcionales | Super Admin | API de plataforma, por empresa. |
| Administradores de cada empresa | Super Admin | API de plataforma; no se permite trasladar un usuario a otra empresa mediante edición. |
| Soporte | Super Admin | Flujo existente de token de soporte; se conservan modo lectura y activación de edición. |
| Nombre, logo, color y navegación inicial de una empresa | Super Admin y Administrador | Mismos datos de empresa en servidor. El guardado más reciente se sincroniza al cargar o recuperar foco. |
| Rubro, apariencia, fuentes y datos de moneda/impuesto | Administrador | Configuración de empresa guardada en SQL. |
| Personal del negocio y permisos de cajeros/vendedores/bodega | Administrador | Flujo existente de Usuarios; no se ampliaron permisos operativos. |
| Ventas, caja, cobros, entregas, compras y conteo | Roles ya autorizados | Reglas e integraciones operativas existentes. Los accesos contextuales respetan el catálogo de navegación. |
| Idioma ES/EN | Usuario | Preferencia local del navegador; no forma parte del guardado de empresa. |
| Sucursal seleccionada | Usuario autorizado por el flujo actual | Conserva la selección existente; una etiqueta no crea una nueva empresa ni modifica el ámbito autorizado. |

TOPNAV/SIDEBAR sigue siendo una elección de **empresa**, como en el contrato actual de Super Admin. Ambos presentan la misma organización y reglas. No se añadió una preferencia personal de navegación que pudiera contradecir la configuración de empresa. El cambio se prepara en el formulario y se aplica al guardar.

El catálogo local ferre_saas_tenants ya no decide marca, módulos ni navegación. ferre_tenant sigue siendo una caché de sesión; el servidor la actualiza. Una lectura iniciada antes de un guardado o de otro login no debe revertir los datos actuales. Los borradores de Configuración no se borran por una actualización al recuperar foco.

## Organización

- Plataforma: administrar empresas y soporte, sin acceso directo a Configuración del negocio desde la sesión independiente de Super Admin.
- Ventas y caja: inicio, venta, cotizaciones, devoluciones, entregas y caja, respetando módulos y roles.
- Inventario y compras: productos, conteo y recepción/compras; se conserva la asignación existente de otras entradas.
- Clientes y cobros: clientes y cuentas.
- Personal: usuarios y comisiones habilitadas.
- Resultados: reportes y auditoría.
- Configuración del negocio: identidad, contacto, moneda/impuesto, apariencia, navegación y tipografía secundaria.

Prioridades: ADMIN compras/inventario/personal/reportes; CAJERO caja/venta/cobros/clientes; VENDEDOR venta/cotizaciones/clientes/caja; BODEGUERO entregas/inventario/compras/conteo. Se omiten tareas cuyo módulo no está habilitado. No se concedió acceso a inventario al cajero o vendedor: los productos y precios se buscan en su pantalla de venta.

El buscador encuentra **pantallas y tareas**; su ayuda indica que productos y clientes se buscan dentro de sus respectivas pantallas. Búsqueda por acentos y palabras, títulos ES/EN, estado sin resultados y limpieza conservan accesibilidad.

## Persistencia y preparación de entrega

Migración nueva: `backend/prisma/migrations/20261006000100_tenant_configuration/migration.sql`. Añade `tenants.configuracion JSONB NOT NULL DEFAULT '{}'`; navegación permanece en su columna actual. El cliente Prisma local se regeneró para compilar. La migración debe aplicarse mediante el flujo de migración existente **antes** de usar el backend actualizado en un entorno compartido. No se ejecutó contra una base de datos existente en esta tarea.

GET `/tenant/settings` permite a los roles de tenant leer la apariencia compartida; PUT sigue limitado a ADMIN. No se abrió ningún permiso de operación. En suscripciones heredadas, la ausencia de un registro de módulo conserva el comportamiento del backend: permitido por defecto; un registro deshabilitado controla módulos opcionales. Los módulos base permanecen disponibles para sus roles.

Los campos de moneda/impuesto se persisten, pero las ventas actuales usan ISV del 15% y los importes se formatean en lempiras. Se informa de ese límite en el formulario. No se cambió la fórmula, conversión, costo, stock, cobro ni estado operativo.

## Validación

Resultados finales: **64 pruebas de frontend**, **60 pruebas pertinentes de backend** (10 archivos en tres ejecuciones) y **35 pruebas de navegador** aprobadas. Compilaciones y lint de frontend y backend con código de salida 0; permanecen advertencias. `git diff --check` sin defectos de formato. La evidencia se divide así:

- Pruebas de frontend: permisos, roles y módulos; tareas limitadas; búsqueda ES/EN; catálogo local antiguo; respuestas tardías; ventas/devoluciones y recuperación existentes.
- Pruebas de backend: persistencia en servicio, tasa cero, configuración inválida, ámbito de empresa, hashing de contraseña, último administrador, guards y disponibilidad de módulos heredados.
- Prueba SQL: migración aplicada a PGlite temporal con dos empresas; lectura posterior demuestra independencia y conservación del registro previo.
- Navegador: bundle local con API interceptada para ambos modos, cinco roles, ES/EN, móvil, URL denegada, guardado, recarga, nuevo login y errores. **Estas pruebas no son una sesión contra la API de una empresa real.**
- Revisión visual: capturas del formulario de Configuración en escritorio y móvil, con datos de prueba y sin contacto con producción.

Capturas locales: `frontend/artifacts/ux-settings-desktop.png` y `frontend/artifacts/ux-settings-mobile.png`.

Comandos de verificación:

```powershell
npm test --prefix frontend
npm run build --prefix backend
# Frontend: VITE_API_URL=/api, exclusivamente para el bundle local de pruebas.
npm run build --prefix frontend
npm run lint --prefix frontend
# Backend: src/tenants, super-admin.service, auth.service, tenant-modules,
# tenant-module.guard, auth-kind-guards, roles-access.http y tenant-admin.http.
npm test --prefix backend -- src/tenants src/super-admin/super-admin.service.spec.ts src/auth/auth.service.spec.ts src/common/tenant-modules.spec.ts src/common/guards/tenant-module.guard.spec.ts src/common/guards/auth-kind-guards.spec.ts
npm test --prefix backend -- src/common/roles-access.http.spec.ts
npm test --prefix backend -- src/super-admin/tenant-admin.http.spec.ts
# Chrome instalado mediante PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.
npm run test:browser --prefix frontend -- --workers=2
git diff --check
```

El navegador verifica también cierre por Escape y retorno del foco del menú móvil, los tres modos de Template V2 y vuelta a variantes clásicas, persistencia de marca de Super Admin con API interceptada y fallo sin éxito ficticio. El permiso HTTP para GET de apariencia compartida y la prohibición de PUT del cajero están comprobados; la API de administradores rechaza los cuatro roles de tenant y descarta cambios de rol/empresa enviados en el body.

## Pendientes y límites

1. Aplicar la migración y ejecutar una aceptación con backend/base reales de pruebas, especialmente login, soporte y administración de usuarios. No se usaron credenciales de empresas.
2. Integrar un modelo real de sucursales y su autorización antes de habilitar administración multisucursal.
3. Apartados, transferencias, garantías, pedidos especiales y listas de precio siguen pendientes de implementación operativa real.
4. Traducir textos españoles heredados restantes en pantallas operativas, Configuración y Super Admin. Las etiquetas nuevas de navegación/tareas tienen ambos idiomas.
5. El historial local de soporte/auditoría de plataforma existente requiere un contrato durable independiente; el token de soporte sí usa la API actual.
6. El build mantiene un aviso de tamaño de bundle en ClientePicker/PDF; el lint mantiene advertencias de hooks y código heredado. No se alteraron cálculos ni código operativo para resolverlas.
