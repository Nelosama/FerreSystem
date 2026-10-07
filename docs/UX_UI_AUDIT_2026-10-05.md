# FerreSystem: auditoría y mejoras de experiencia

## Cierre posterior al PR #63 — 2026-10-06

Esta sección sustituye los pendientes históricos de validación que aparecen más abajo; no elimina su registro. Base comprobada: `0331cb5937d7aeea5c2d50ca53d7762c096693cd` (merge de #63 y main remoto al iniciar). Rama de continuación: `feat/close-pending-delivery`. Se conserva el parche local anterior; no se aplicaron stashes ni se reinició el trabajo. El espacio ajeno en `backend/nest-cli.json` queda fuera del cierre.

El HEAD de #63, `0b7d8af7ea4c29afaabe38ec883e2ee1e1a27cab`, aprobó **55/55 pruebas PostgreSQL** en [CI 37494401707](https://github.com/Nelosama/FerreSystem/actions/runs/37494401707). Los cuatro fixtures de crédito ya estaban corregidos allí. La falta histórica de PostgreSQL en otro entorno no es un fallo actual de esos fixtures.

| Hallazgo / pendiente | Estado del cierre | Evidencia |
| --- | --- | --- |
| Entregas/Devoluciones visibles sin POS | Corregido | Ambas entradas declaran `moduleKey: 'pos'`; menús, prioridades y buscador comparten el filtro. |
| URL con mayúsculas o barra final omite comparación literal | Corregido | `ProtectedRoute` usa `matchPath` con las mismas reglas de React Router. |
| TOPNAV/SIDEBAR, móvil, roles y funciones base | Comprobación automatizada | 16 casos nuevos de navegador cubren POS activo/inactivo y cuatro roles; unitarias incluyen SUPERADMIN. Caja/cuentas conservan disponibilidad. |
| Persistencia de configuración y autorización sin mocks | Cobertura implementada | `settings-http-checks.ts`: login real, PUT ADMIN, PATCH Super Admin, lectura SQL/HTTP, nueva autenticación, dos tenants, Cajero rechazado, payload con tenant ajeno y limpieza de opcionales/configuración vacía. |
| Navegador con backend real | Cobertura implementada | `real-settings-browser.mjs`: Chrome/Chromium, Vite de desarrollo con proxy hacia API compilada, guardar/recargar/nuevo contexto y login. Sin interceptar peticiones ni precargar autenticación. CI activa `REAL_SETTINGS_BROWSER=1`. |
| PostgreSQL de pruebas se bloquea con pipes en Windows | Corregido en fixtures | `pg_ctl` escribe su log a archivo y no conserva pipes de captura; binarios Windows con ventana oculta. No cambia esquema ni migraciones. |
| ADMIN administra otros ADMIN del tenant | Decisión de negocio pendiente | Se conserva la política heredada; no se amplían ni reducen permisos en este cierre. |
| Funciones aún no integradas | Fuera del cierre | Multisucursal, apartados, transferencias, garantías, pedidos especiales y listas de precios requieren su propio alcance y aceptación. No se presentan como funcionalidad entregada. |

Validación local de esta continuación (Windows, 2026-10-06), código publicado `efd8c169dfb68ac5002dd041068c4b10213aeaa6` en [PR #64](https://github.com/Nelosama/FerreSystem/pull/64):

| Comando / ejecución | Resultado | Evidencia y límites |
| --- | --- | --- |
| `npm test --prefix frontend` | 78/78 | Unitarias/componentes; no prueba persistencia real. |
| `npm test --prefix backend` | 182 aprobadas, 3 omitidas | Omisiones por Windows en programador de respaldos. |
| `npm run test:scripts --prefix backend` | 7 omitidas | Requieren POSIX; no se consideran aprobadas localmente. |
| `npm run build --prefix frontend` con `VITE_API_URL=/api`; build backend | Ambos salida 0 | Advertencia de tamaño del bundle. |
| Lint frontend y backend | Ambos salida 0, sin errores | Advertencias existentes de hooks/TypeScript. |
| `npm run test:browser -- --workers=2` desde frontend | 54/54, 58.5 s | Chrome, API simulada. Incluye 16 regresiones POS. |
| `npm run test:integration` desde backend | 55/55, 2 suites, 191.31 s | PostgreSQL 18 temporal; inicio 19:37:54 America/Tegucigalpa. `PG_BIN=C:/Program Files/PostgreSQL/18/bin`, `REAL_SETTINGS_BROWSER=1`, `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=C:/Program Files/Google/Chrome/Application/chrome.exe`. Incluye login/API reales y navegador real sin mocks de endpoints. |
| `git diff --check` | Salida 0 | Formato. |

El total PostgreSQL permanece en 55 porque se amplió el escenario HTTP existente, sin contar cada aserción como un test nuevo. El navegador real usa Vite de desarrollo y API compilada; no equivale a aceptación del despliegue de producción. Los logs locales de esta ejecución se guardaron en `%TEMP%/ferre-close-*.log`, fuera del repositorio. CI Linux se inició en [ejecución 37558322184](https://github.com/Nelosama/FerreSystem/actions/runs/37558322184) sobre el SHA de código; su resultado y el del HEAD documental final se registran en el PR una vez concluidos. No se declaran aprobados por haberse iniciado.

No se añade una migración. La funcionalidad requiere la existente `20261006000100_tenant_configuration`, que añade JSONB con default `{}`. Orden de despliegue: respaldo y restauración ensayada; revisión de baseline; migraciones requeridas antes de arrancar el backend nuevo; cliente Prisma/backend compatibles; frontend después de la API; aceptación funcional por rol. Conservar la columna aditiva al revertir aplicación. El lock y la duración con volúmenes representativos requieren ensayo operativo; no se aplicaron migraciones a bases existentes.

Pendientes de entrega: confirmar versiones efectivamente desplegadas (un merge no prueba despliegue), aceptación del cliente de ventas/comprobantes/crédito/abonos/devoluciones/entregas/caja y definición de módulos comprometidos. No se hizo merge ni despliegue manual durante este cierre.

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
| Administradores de cada empresa | Super Admin y ADMIN del mismo tenant | Plataforma usa su API de administradores. La API heredada de Usuarios también permite al ADMIN crear/editar otros ADMIN de su empresa y protege al último activo; no permite trasladarlos entre tenants. |
| Soporte | Super Admin | Flujo existente de token de soporte; se conservan modo lectura y activación de edición. |
| Nombre, logo, color y navegación inicial de una empresa | Super Admin y Administrador | Mismos datos de empresa en servidor. El guardado más reciente se sincroniza al cargar o recuperar foco. |
| Rubro, apariencia y fuentes | Administrador | Configuración de empresa guardada en SQL. La configuración general fiscal queda restringida a HNL (L.) e ISV 15%; las tasas transaccionales de cotizaciones se conservan. |
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

La revisión del 6 de octubre confirmó que permitir editar moneda/tasa y utilizarlas al generar el PDF podía relabelar importes guardados. Ahora los campos generales son de solo lectura y la API rechaza valores distintos de HNL (L.) e ISV 15%. Los comprobantes usan los importes e ISV transaccionales; las cotizaciones suministran su tasa histórica, incluidas tasas cero y líneas exentas. Las ventas sin tasa histórica no muestran un porcentaje supuesto. No se agregó conversión ni se cambió ninguna fórmula de venta.

## Validación declarada en el informe inicial

Estos resultados son históricos; la evidencia reproducida para el código corregido está en la revisión del 6 de octubre al final de este documento.

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
4. Traducir textos heredados en pantallas operativas ajenas a esta corrección. Configuración, Super Admin, el encabezado compartido y la explicación de funciones pendientes se completaron en ES/EN en la revisión del 6 de octubre. Los identificadores técnicos, nombres introducidos por usuarios y registros históricos mantienen sus valores.
5. El historial local de soporte/auditoría de plataforma existente requiere un contrato durable independiente; el token de soporte sí usa la API actual.
6. El build mantiene un aviso de tamaño de bundle en ClientePicker/PDF; el lint mantiene advertencias de hooks y código heredado. No se alteraron cálculos ni código operativo para resolverlas.


## Revisión y corrección del 6 de octubre de 2026

Se leyeron completos este informe y `docs/AUDITORIA_RAMA_20261005.md` antes de editar, y se comprobaron los problemas en su implementación. Rama: `feat/ux-ui-restructure`. Punto de partida: `bba7a4647730e289e952af487313faf1f95f0bb9`. **HEAD de código y capturas publicado: `b533dbd86a9a0cc67a29e46900b927f0dcab7770`**. El siguiente commit actualiza únicamente este informe; su padre identifica exactamente el código de esta evidencia (`git rev-parse HEAD^` tras ese commit). No hubo merge ni despliegue.

### Tabla de hallazgos

| Hallazgo | Estado | Verificación previa y evidencia final |
| --- | --- | --- |
| Moneda/tasa visual relabelaba comprobantes | Corregido | `ReciboPDF` leía `tenant.moneda` y `tenant.impuesto`. Ahora usa HNL y los importes/ISV guardados. La tasa opcional procede únicamente del documento de cotización, nunca de apariencia. `receipt-fiscal.test.mjs`: venta anterior, impuesto mixto y tasa transaccional cero/15. |
| Opciones fiscales sin soporte monetario real | Corregido | Ventas calcula ISV 15% y no tiene moneda histórica/conversión. Formulario de solo lectura, ayuda ES/EN vinculada mediante `aria-describedby`; validador de servidor rechaza USD y tasas generales distintas de 15%. Lectura normaliza configuraciones fiscales heredadas sin escribir ni recalcular ventas. |
| Comprobantes anteriores | Comprobado | Venta sintética de enero de 2026: 100 + 15 = 115 permanece en L. aunque la configuración visual antigua diga USD/VAT 18%. También se generaron y extrajeron tres PDFs con el renderizador real, sin API ni base de empresa. |
| `configuracion: {}` heredaba datos del navegador | Corregido | La lectura hacía `{ ...previous, ...data }`. Ahora reconstruye identidad/contacto, módulos, navegación y apariencia desde la respuesta y defaults explícitos. Únicamente conserva selección local de sucursal; idioma permanece fuera del tenant. Regresiones de helper, proveedor React y navegador. |
| Lecturas concurrentes/tardías podían revertir datos | Corregido | La revisión local solo cambiaba al guardar; dos GET podían aceptarse al revés. Ahora hay secuencia por lectura, invalidación por guardado/login/logout/soporte/sucursal, identidad de usuario/tenant/token, limpieza del efecto y comparación de `updatedAt` del servidor. Una versión ausente no reemplaza una versión conocida. Regresiones de lecturas invertidas, réplica atrasada, guardado y cambio de sesión. |
| Endpoints operativos sin módulo | Corregido | Se verificaron los controllers de Operaciones, Compras, Proveedores y conversión de Cotizaciones. Añadidos guards de módulos, sin retirar guards de rol, permisos, soporte o tenant. `operation-modules.http.spec.ts`: 31 casos HTTP con servicios/base simulados. |
| Dependencias de varios módulos | Comprobado | Recepción y compra que modifica stock exigen Compras **e** Inventario; conversión exige Cotizaciones **y** POS. Consulta compartida de proveedores permite Compras **o** POS, pues POS la usa en ventas sin inventario. Matriz y justificación debajo. |
| Expectativa de `super-admin.service.spec.ts` | Corregido | `listTenants` selecciona intencionalmente `rol` para distinguir ADMIN de personal. Se añadió `rol` a la expectativa y se mantuvo la aserción de que `passwordHash` no está en el select. Suite completa de backend aprobada. |
| Preparación incompleta de ventas PostgreSQL | Corregido | El fixture llegaba hasta devoluciones, pero el cliente actual también requiere costo vigente/compras, crédito de clientes y configuración. Se agregaron las tres migraciones faltantes en orden. Su ejecución PostgreSQL continúa pendiente por entorno, no se declara aprobada. |
| Compatibilidad y despliegue de `tenant_configuration` | Comprobado | Migración aditiva, último paso del orden lexicográfico actual. Dos pruebas PGlite efímeras validan preservación de filas sintéticas, default `{}`, independencia y cadena completa desde cero. Proyección antigua de tenant sigue leyendo después de agregar la columna. No se modificó ni ejecutó la migración en bases existentes. |
| Exclusividad de Super Admin sobre ADMIN de tenant | Comprobado | El informe no coincidía con `UsuariosService.create/update`, sus DTO de rol y controllers: un ADMIN activo puede crear/editar ADMIN del mismo tenant; se conserva el último ADMIN activo y el ámbito. Se corrigieron tabla de responsabilidades y ayuda de plataforma. No cambió esta política. |
| Reservar creación/edición de ADMIN solo a plataforma | Pendiente | Requiere decisión explícita de producto/permisos y revisión de usuarios existentes. Esta corrección no la implementa ni la presenta como contrato actual. |
| Escape del buscador perdía el foco | Corregido | Se ocultaba el panel sin volver al disparador. Ahora devuelve el foco al botón en modo compacto; en inicio conserva el foco del input. Verificado en Chromium ES/EN. |
| Traducciones de pantallas modificadas | Corregido | Configuración, formulario fiscal, apariencia y navegación, paletas/rubros, Super Admin y sus modales/mensajes, catálogos, encabezado/soporte y funciones pendientes disponen de ES/EN. Pruebas de navegación incluyen cinco roles, ambos idiomas y ambos modos. Datos de usuario y registros anteriores no se traducen ni reescriben. |
| Funciones pendientes poco explicadas | Corregido | Explicación visible mediante `details/summary` accesible en inicio; URL de módulo pendiente tiene ayuda ES/EN y el enlace POS solo aparece si el rol/módulo permite usarlo. No se agregaron enlaces de módulos inoperantes al menú. |
| Formulario de sucursales inalcanzable | Corregido | Único disparador estaba deshabilitado; no existe modelo Prisma ni contrato API vigente. Retirados modal, handlers y estados; se mantiene explicación accesible de la limitación. La selección de sucursal existente se conserva. |
| Conservación de UX y TOPNAV/SIDEBAR | Comprobado | Sigue siendo configuración de empresa, preparada en formulario y aplicada al guardar. Chromium verifica ambos modos, móvil, permisos y variantes V1/V2. No se hizo otro rediseño. Capturas actualizadas en `frontend/artifacts/ux-settings-desktop.png` y `ux-settings-mobile.png`. |
| Integración real PostgreSQL/Prisma | Pendiente | Dos suites fallaron en `beforeAll`: no existe `initdb`; 55 casos no se ejecutaron. La instalación de paquetes fue rechazada por permisos del entorno. No se tocó producción ni una base compartida. |

### Dependencias de operaciones

`RequiredModule(a, b)` exige todos; `RequiredAnyModule(a, b)` permite cualquiera. El guard continúa autenticando antes de consultar módulos, usa exclusivamente el tenant del JWT y conserva la disponibilidad heredada para registros ausentes. Un registro opcional explícitamente deshabilitado es autoritativo.

| Operación/ruta | Módulos | Motivo |
| --- | --- | --- |
| GET `/operaciones/proveedores` | `ordenes_compra` o `pos` | Lookup compartido por compras y venta sin inventario; no obliga a contratar Compras para vender. |
| POST `/operaciones/proveedores`; API `/proveedores` | `ordenes_compra` | Administración de proveedores de compras. Roles existentes se conservan. |
| GET/POST `/operaciones/compras`; lecturas, pagos e historial de `/compras` | `ordenes_compra` | Pedido/factura y seguimiento de compras; el pedido operativo no modifica stock hasta recepción. |
| POST `/operaciones/compras/:id/recepciones`; POST `/compras` | `ordenes_compra` e `inventario` | La recepción y la compra directa cambian existencias/costo. |
| Historial y ajustes de `/operaciones/productos/:id` | `inventario` | Movimiento y ajuste de existencias, conservando permiso de lectura/edición. |
| Entregas, búsqueda de venta, devoluciones y sus solicitudes/decisiones/ejecuciones | `pos` | Ciclo posterior a una venta. No se exige Inventario para entregar/devolver una venta sin inventario. |
| GET `/operaciones/resumen` | `reportes` | Consulta de resultados gerenciales; conserva `reportes.ver` y rol ADMIN. |
| POST `/cotizaciones/:id/convertir` | `cotizaciones` y `pos` | Consume la cotización y crea una venta; conserva permiso de conversión y roles. |
| Caja, cuentas/abonos y auditoría de operaciones | Sin módulo opcional adicional | Caja y atención de obligaciones existentes son funciones base. La auditoría conserva trazabilidad para ADMIN y no posee una clave propia en catálogo; no se le asigna arbitrariamente Reportes. |
| Dashboard | Sin módulo opcional adicional | Inicio/resumen existente por rol; no se convierte el inicio en una función dependiente de Reportes. |

### Orden de despliegue y compatibilidad

Revisión documental, **sin ejecución de despliegue**: preparar respaldo y ensayo de restauración; comprobar/adoptar baseline mediante el procedimiento existente cuando corresponda; aplicar migraciones en el orden actual hasta `20261006000100_tenant_configuration`; generar cliente Prisma y arrancar backend actualizado; publicar frontend después de que la API nueva esté disponible. El backend nuevo consulta `configuracion`, por lo que no es compatible con una base que aún carezca de esa columna. La migración añade JSONB `NOT NULL DEFAULT '{}'`, conserva navegación en su columna y no elimina ni transforma importes.

El backend anterior puede seguir usando sus columnas después de la ampliación. Una reversión de aplicación debe conservar la columna aditiva y los datos; no se propone ejecutar `DROP COLUMN`. El default constante puede evitar reescritura de tabla en PostgreSQL moderno, pero el `ALTER TABLE` sigue requiriendo lock: duración, concurrencia y recuperación deben comprobarse en PostgreSQL aislado antes de una actualización real. No se aplicó `migrate deploy`, `db push`, seed ni adopción contra producción o bases existentes.

### Validación reproducida

| Comando desde raíz, salvo indicación | Resultado exacto | Tipo de evidencia |
| --- | --- | --- |
| `npm ci --prefix frontend`; `npm ci --prefix backend` | Salida 0 en ambos | Dependencias del lockfile; sin cambios a locks. |
| `npm exec --prefix backend -- prisma generate --schema backend/prisma/schema.prisma` | Salida 0, cliente Prisma 6.4.1 | Generación local, no migración. |
| `npm test --prefix frontend` | **73/73**, 0 fallos, salida 0 | Hooks/transporte controlados, lógica de sesión, permisos, navegación y regresiones fiscales. Las aserciones de PDF de esta suite simulan componentes del renderer. |
| `npm test --prefix backend` | **185/185 en 24 archivos**, salida 0 | **183 casos con servicios/Prisma simulados y 2 casos SQL PGlite efímeros**. No equivale a backend conectado a PostgreSQL real. |
| `npm run test:scripts --prefix backend` | **7/7**, salida 0 | Fixtures temporales de scripts. |
| `npm run build --prefix backend` | Salida 0 | Build con cliente actual. |
| `VITE_API_URL=/api npm run build --prefix frontend` | Salida 0; aviso de chunk >500 kB | Bundle exclusivamente local para navegador, no despliegue. |
| `npm run lint --prefix frontend` | Salida 0, sin errores; advertencias de hooks/código existente | Lint. |
| `npm run lint --prefix backend` | Salida 0, sin errores; advertencias de código/opciones de TypeScript | Lint. |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:browser --prefix frontend -- --workers=2` | **38/38**, salida 0 | Chromium con API interceptada. Incluye cinco roles, ES/EN, móvil y TOPNAV/SIDEBAR. |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:browser --prefix frontend -- --workers=2 --grep 'settings:|buscador Escape|configuración vacía|V2 preserves'` | **5/5**, salida 0 | Reejecución sobre el bundle final tras ajustar la etiqueta fiscal y consumir la tasa transaccional del PDF. Los casos ya están incluidos en los 38; no se suman como pruebas nuevas. Capturas finales revisadas visualmente. |
| `git diff --check` | Salida 0 | Formato del diff. |
| `npm run test:integration --prefix backend` | Salida **1** del runner; **2 suites fallidas, 55 casos no ejecutados** | PostgreSQL real pendiente: `PostgreSQL no instalado en /usr/bin` y `Falta PostgreSQL para estas pruebas`. El wrapper inicial imprimió el tail con salida 0; esa salida no representa aprobación del runner. |
| `apt-get update` | Salida **100**, `Permission denied` en `/etc/apt/apt.conf.d/80-applied-apt-retries` y `/var/lib/apt/lists/partial` | Preparación de PostgreSQL bloqueada por permisos del entorno. No se intentó eludir el rechazo ni usar otra base. |

La primera compilación frontend sin `VITE_API_URL` terminó en salida 1 por la validación prevista de configuración de producción; se ejecutó correctamente con `/api`. La primera ejecución de navegador produjo 37 aprobados/1 fallo porque la expectativa conservaba «guardadas» tras cambiar el mensaje a «guardada»; se corrigió la expectativa y luego pasaron los 38 casos. El primer run frontend detectó que el harness no cargaba el nuevo helper real de sincronización; se actualizó el loader y se añadieron las regresiones, sin sustituir el helper por un mock.

Ensayo adicional de PDF: desde `frontend`, `node --input-type=module` transpila el componente actual con TypeScript, lo carga, llama al renderer real `pdf(React.createElement(ReciboPDF, props)).toBlob()` y escribe únicamente PDFs sintéticos en `/tmp/audit-*.pdf`; `pdftotext <archivo> -` extrae el texto. **Tres de tres verificaciones aprobadas**: venta anterior (`subtotal=100, isv=15, total=115`); cotización tasa cero (`porcentajeIsv=0, isv=0, total=100`); cotización con línea exenta y gravada (`porcentajeIsv=15, isv=7.5, total=107.5`). En las tres, el tenant visual de prueba contiene USD/$ y VAT 18%; se confirma salida en L., ISV transaccional y ausencia de USD/$/VAT/18%. Este ensayo usa renderizador y extractor reales con props sintéticas: **no constituye integración con API/base real**.

Quedan pendientes únicamente la integración PostgreSQL/Prisma en un entorno aislado con los binarios autorizados, la aceptación de despliegue/migración en ese entorno y cualquier decisión de cambiar la política heredada de ADMIN. Los módulos operativos pendientes y la administración multisucursal requieren implementación separada, como ya indicaba el alcance inicial.


### Publicación de la rama

La validación se ejecutó sobre el commit local `7300cabdc6c995d7a8a71dfbdbe2143caa5cd232`. El intento `git push origin feat/ux-ui-restructure` terminó con salida 1: `could not read Username for https://github.com: No such device or address`. El entorno no tiene credenciales Git HTTPS de escritura. Se utilizó la conexión GitHub autorizada para crear blobs, árbol y commits, y actualizar la misma rama mediante avance directo con comprobación de HEAD esperado; no se usó force, merge ni despliegue.

El commit de código publicado tiene exactamente el árbol Git `3bd39259f59b24672dd951fcae2100ef97176a78`, idéntico al commit local validado, incluidos tests y capturas. El commit final solo agrega este informe actualizado, cuyo padre es el SHA de código publicado indicado arriba. Las diferencias de SHA de commit corresponden a metadatos de autor/fecha de la API de GitHub; el contenido validado no cambió.
