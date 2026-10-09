# FerreSystem — contexto maestro y continuidad entre agentes

Última revisión: **2026-10-09, America/Tegucigalpa** — actualización por Claude (auditoría PR #73 + estado PRs #74–76).

**Lectura económica:** leer desde el inicio hasta `FIN DEL CONTEXTO VIGENTE`. No cargar todo el archivo por defecto: después hay un anexo con los 20 documentos originales completos. Consultar únicamente la sección histórica relevante. La longitud del anexo no obliga a consumirlo en cada sesión.

---

## PROTOCOLO OBLIGATORIO PARA AGENTES

Antes de comenzar cualquier trabajo en FerreSystem:

1. **Leer `docs/CONTEXTO_MAESTRO.md`** hasta `FIN DEL CONTEXTO VIGENTE`.
2. **Verificar el estado actual de GitHub**: `git fetch --all --prune` + `git log main --oneline -10` + ramas remotas.
3. **No duplicar funcionalidades** ya implementadas ni ramas ya abiertas.
4. **Trabajar en ramas independientes** desde `main` actualizado; nunca directamente sobre `main`.
5. **Actualizar este documento** cuando cambie el estado de una funcionalidad, PR o hallazgo.
6. **Registrar pruebas con sus limitaciones**: distinguir entre pruebas unitarias, integración con PostgreSQL real y validación en dispositivo físico.
7. **No hacer merge automático** ni desplegar a producción sin autorización explícita del dueño del proyecto.

Prompt corto para cualquier IA: **"Lee `docs/CONTEXTO_MAESTRO.md` hasta FIN DEL CONTEXTO VIGENTE. Comprueba Git/PR actuales, continúa el pendiente autorizado y actualiza ese mismo documento con evidencia al terminar. Consulta solo el anexo necesario. No hagas merge ni despliegue sin autorización."**

---

## 1. Estado comprobado — 2026-10-09

- Repositorio: `Nelosama/FerreSystem`; checkout local: `C:\Users\Nelo\Documents\GitHub\FerreSystem`.
- **HEAD de `main` verificado:** `bbdaec3f` — Revert "Incompleto Codex" (2026-10-09).
- Rama activa de auditoría: `fix/levantamiento-barcode-audit` — commit `c9a92352` (pendiente de push y PR).
- PR #76 `codex/fix-iphone-barcode-scanner`: rama remota actualizada (`eb0aadb2`), PR aún abierto, pendiente de push del merge con main.

### Siguiente paso autorizado
- **Daniel** hace push de las tres ramas pendientes desde su máquina:
  ```bash
  git push origin fix/levantamiento-barcode-audit   # PR de auditoría P1
  git push origin codex/fix-iphone-barcode-scanner  # desbloquea PR #76 para Jules
  git push origin main                              # propaga revert bbdaec3f
  git push origin wip/incompleto-codex             # aísla trabajo incompleto
  ```
- Jules revisa PR #76 con el nuevo SHA (`eb0aadb2`).
- Abrir PR de `fix/levantamiento-barcode-audit` → revisión antes de merge.

---

## 2. Objetivo y reglas de negocio

Sistema SaaS multi-tenant para ferreterías: POS, inventario, levantamiento físico, cotizaciones, devoluciones, app móvil y respaldos. Un solo backend NestJS + Prisma + PostgreSQL; frontend React + Vite. Multi-tenant por `tenantId` con `TenantGuard` en cada controlador.

**Reglas críticas confirmadas:**
- `FINALIZADO` ≠ `APLICADO AL INVENTARIO`. Son etapas separadas con autorización explícita.
- Solo `ADMIN` puede ejecutar `POST /levantamientos/:id/aplicar`.
- El barcode del catálogo no se sobreescribe salvo que el conteo haya coincidido por barcode (`matchedByBarcode=true`) o el catálogo no tuviera barcode previo.
- `seed-alex.spec.ts` solo se ejecuta manualmente con variables de entorno; está excluido de CI (`testIgnore: ['**/unsafe/**']`).
- No desplegar ni hacer merge sin verificar `GET /api/health` y tests en copia aislada.

---

## 3. Arquitectura actual del sistema

| Capa | Tecnología | Estado |
|---|---|---|
| Backend | NestJS + Prisma ORM + PostgreSQL | IMPLEMENTADO |
| Frontend | React + Vite + TypeScript | IMPLEMENTADO |
| Auth | JWT + refresh token | IMPLEMENTADO |
| Multi-tenancy | TenantGuard + tenantId en cada query | IMPLEMENTADO |
| POS / Ventas | Módulo completo con crédito | IMPLEMENTADO |
| Cotizaciones | Conversión a venta (FUNC-001 corregido) | IMPLEMENTADO |
| Devoluciones | Solicitud + autorización ADMIN | IMPLEMENTADO |
| Inventario / Productos | CRUD + filtros + datos financieros protegidos | IMPLEMENTADO |
| Levantamiento de inventario | Flujo BORRADOR→EN_PROGRESO→FINALIZADO→aplicar | IMPLEMENTADO (ver tabla §4) |
| Escáner de código de barras | BarcodeDetector API nativa + fallback ZXing | PARCIAL — sin validar en dispositivo real |
| App móvil | PWA + React Native en evaluación | EN DESARROLLO |
| Notificaciones push | Diseño pendiente | PENDIENTE |
| Compras / Proveedores | Rama `feat/compras-proveedores` | EN DESARROLLO |
| Sucursales / Multi-sede | Propuesta documentada | PENDIENTE |
| Respaldos automáticos | Sin configurar en producción | BLOQUEADO — requiere acción en Render/Supabase |

---

## 4. Estado real del módulo de levantamiento de inventario

### Lo que está IMPLEMENTADO (confirmado en código, main `bbdaec3f`)

| # | Funcionalidad | PR / commit | Notas |
|---|---|---|---|
| LEV-001 | Normalización de `codigoBarras` en captura, corrección y `preview()` | PR #73 `fcc17492` | Trim + null si vacío; evita duplicados por espacios |
| LEV-001b | `preview()` detecta barcode duplicado dentro del conteo | PR #73 | Error en `errores[]` |
| LEV-002 | Idempotencia de conteo con `solicitudId` + `fingerprint` | PR #73 | Parcial: solo en createItem |
| LEV-008 | Auditoría: `audit()` en crear/editar/eliminar item y al aplicar | PR #73 | vía `ledger.ts` |
| LEV-010 | Exportación CSV y Excel desde `LevantamientoPage` | PR #73 | Incluye `codigoBarras` en export |
| LEV-011 | Vista previa transaccional antes de aplicar (`preview()` + `token`) | PR #73 | Token de fingerprint impide aplicar con datos obsoletos |
| LEV-012 | Aplicación transaccional al inventario (`aplicar()` + `movement()`) | PR #73 | Solo ADMIN; `lockTenant` por TX |

### Correcciones de auditoría aplicadas (rama `fix/levantamiento-barcode-audit`, commit `c9a92352` — **pendiente de PR y merge**)

| Hallazgo | Severidad | Corrección |
|---|---|---|
| `aplicar()` sobreescribía barcode del catálogo silenciosamente con el del conteo | **P1** | Solo actualiza si `matchedByBarcode=true` o `catalogBarcode=null`; `preview()` ahora emite error cuando difieren |
| Non-null assertions `precioCosto!` / `precioVenta!` en `aplicar()` — crash potencial | **P1** | Reemplazados por `?? 0` |
| `@MaxLength` faltante en `codigoBarras` de `CreateLevantamientoItemDto` y `UpdateLevantamientoItemDto` | **P1** | `@MaxLength(100)` añadido |
| Columna de código de barras invisible en tabla de ítems (`codigo\|\|codigoBarras` en una celda) | **P2** | Dos columnas separadas: **Código** y **Código de barras** |
| `@MaxLength` faltante en `codigoBarras` de DTOs de Producto | **P3** | `@MaxLength(100)` añadido |
| 4 tests de regresión para los P1 | — | Suite `Auditoría P1 — protección de código de barras del catálogo` |

### Lo que está PENDIENTE (de `PENDIENTES_LEVANTAMIENTO_INVENTARIO.md`)

| # | Funcionalidad | Prioridad | Estado |
|---|---|---|---|
| LEV-002 completo | Idempotencia de alta para operaciones simultáneas desde múltiples dispositivos | P0 | PENDIENTE |
| LEV-003 | Código fabricante en conciliación de catálogo | P0 | PENDIENTE |
| LEV-004 | Divergencia de costo entre conteo y catálogo | P1 | PENDIENTE |
| LEV-005 | Validación de fracciones y unidades en conteo | P1 | PENDIENTE |
| LEV-006 | Selector de categorías en captura | P2 | PENDIENTE |
| LEV-007 | Validación de CSV importado | P2 | PENDIENTE |
| LEV-013 | Zonas y reconteos | P2 | PENDIENTE |
| LEV-014 | Modo offline / cola local / idempotencia de sincronización | P2 | PENDIENTE |
| LEV-015 | Cámara para captura de código de barras validada en iPhone real | P1 | PARCIAL |
| LEV-016 / ítem 11 | Exportación con plantillas de columnas configurables | P2 | PARCIAL (CSV/Excel sin plantillas) |
| Ítem 2 | Levantamiento multiusuario simultáneo + conciliación por usuario | P1 | PENDIENTE |
| Ítem 3 | Modo offline con IndexedDB + service worker | P2 | PENDIENTE |
| Ítem 7 | Zonas, progreso por zona y asignación de usuarios | P2 | PENDIENTE |
| Ítem 9 | Reconteo y validación de diferencias | P2 | PENDIENTE |

---

## 5. Integración del escáner de código de barras (PR #76)

**Rama:** `codex/fix-iphone-barcode-scanner` | **PR #76** — abierto, pendiente de revisión final por Jules.

**Lo que hace el PR:**
- `frontend/src/utils/barcodeScanner.ts`: detección por feature-flag — usa `BarcodeDetector` API nativa si existe, cae a ZXing si no.
- `frontend/src/utils/zxingDecoder.ts`: decodificador software (EAN-13, EAN-8, UPC-A, CODE-128) usando canvas.
- `frontend/src/components/BarcodeScanner.tsx`: componente React con video, start/stop, errores en español, manejo de visibilidad.
- Mensajes de error mapeados a español (`NotAllowedError`, `NotFoundError`, `NotReadableError`, etc.).

**Estado de seguridad (E15 — verificado):**
- `seed-alex.spec.ts` usa solo `process.env.SEED_*` — sin credenciales hardcodeadas ✅
- `assertSafeEnvironment()` bloquea ejecución contra dominios de producción ✅
- `playwright.config.ts` excluye `**/unsafe/**` del CI ✅
- Merge con `origin/main` realizado localmente (`eb0aadb2`), integra correcciones E15 del PR #75.

**Lo que NO está validado:**
- Prueba real en iPhone físico del cliente.
- Prueba con etiquetas impresas de la ferretería.
- Comportamiento con cámara frontal vs trasera.

**Bloqueo previo de Jules (QA FAIL):** credenciales hardcodeadas en versión anterior de `seed-alex.spec.ts`. Resuelto en PR #75 y verificado en rama #76.

---

## 6. Historial de PRs — estado real verificado

| PR | Rama | Estado | Merge commit | Fecha | Descripción |
|---|---|---|---|---|---|
| #73 | `codex/fix-levantamiento-inventario` | **FUSIONADO** | `fcc17492` | 2026-10-08 | Normalización barcode LEV-001, preview, aplicar al inventario |
| #74 | `docs/bitacora-ux-fotos-20261008` | **FUSIONADO** | `66496008` | 2026-10-08 | Documentación UX/fotografías/topología WiFi |
| #75 | `fix/e15-seed-alex-isolation` | **FUSIONADO** | `f7822c1f` | 2026-10-08 | Aislamiento seed-alex (E15), guard producción, testIgnore |
| #76 | `codex/fix-iphone-barcode-scanner` | **ABIERTO** | — | — | Escáner de barras iPhone; bloqueado por Jules (QA FAIL E15 → resuelto, push pendiente) |
| — | `fix/levantamiento-barcode-audit` | **EN REVISIÓN** (local) | `c9a92352` | 2026-10-09 | Correcciones P1 auditoría PR #73; push y PR pendientes |
| — | `wip/incompleto-codex` | **LOCAL** | — | — | Aísla trabajo incompleto `907b33db`; push pendiente |

**Nota sobre `907b33db` (Incompleto Codex):** este commit se subió directamente a `main` en una rama ya mergeada. Fue revertido en `bbdaec3f` (HEAD actual de main). El trabajo original queda preservado en la rama local `wip/incompleto-codex`.

---

## 7. Pruebas ejecutadas y sus limitaciones

| Suite | Cobertura | Entorno | Limitación |
|---|---|---|---|
| Backend unit (Vitest) — PR #73 | 10/10 levantamiento + suites anteriores | Mocks en memoria | `@rolldown/binding-wasm32-wasi` falla en Linux cloud (binario Windows); ejecutar solo desde máquina local con `cd backend && npm test` |
| Integración PostgreSQL — PR #73 | 9/9 barcode + tenant isolation | PostgreSQL real (contenedor temporal) | No usa la base cloud; no valida migración de historial Prisma |
| Frontend unit — PR #76 | 120/120 + 23 barcode | Vitest + jsdom | Mismo problema rolldown en cloud; ejecutar local |
| E2E Playwright — excluidos unsafe | `**/unsafe/**` excluido de CI | — | `seed-alex.spec.ts` solo manual con `.env` configurado |
| Auditoría P1 (nueva suite) | 4 tests `levantamientos.service.spec.ts` | Mocks en memoria | Misma limitación rolldown; pendiente de ejecutar en local |

**No se ha validado nada en producción (Render/Supabase cloud).** El error HTTP 500 al cargar resumen del dashboard reportado el 2026-10-07 sigue sin diagnóstico cerrado (`PROD-QA-20261007-01`).

---

## 8. Pendientes críticos y riesgos de producción

| ID | Descripción | Riesgo | Estado |
|---|---|---|---|
| PROD-QA-20261007-01 | HTTP 500 en resumen dashboard — posible desajuste de esquema Supabase | 🔴 ALTO | Sin diagnóstico cerrado |
| E03 | Respaldo del cliente no configurado; sin restauración verificada | 🔴 ALTO | BLOQUEADO |
| E05 | Acceso web 2026-10-07: panel visible pero errores en resumen y sin respaldos automáticos | 🔴 ALTO | Diagnóstico pendiente |
| E07 | App instalable (PWA) del dueño — push independiente no funciona desde navegador | 🟡 MEDIO | Confirmado 2026-10-05; sin solución |
| LEV-015 | BarcodeScanner no validado en iPhone físico del cliente | 🟡 MEDIO | PARCIAL |
| `c9a92352` | Correcciones P1 auditoría barcode — código listo, sin PR ni merge | 🟡 MEDIO | Push pendiente |
| SEC-012 | Impersonación local sin auditoría durable | 🟡 MEDIO | PENDIENTE |
| wip/incompleto-codex | Trabajo incompleto de Codex revertido de main; sin revisar ni descartar | 🟡 MEDIO | Aislado en rama local |

---

## 9. Bitácora 2026-10-09 (esta sesión)

| Operación | Resultado |
|---|---|
| **Task A** — Revert `907b33db` ("Incompleto Codex") | Commit `bbdaec3f` en main; rama `wip/incompleto-codex` creada. Push pendiente (Daniel). |
| **Task B** — Desbloquear PR #76 (Jules QA FAIL E15) | Verificado: no hay credenciales hardcodeadas, `testIgnore` correcto, merge con main `eb0aadb2`. Push pendiente (Daniel). |
| **Task C** — Auditoría PR #73, fase 1 | Último PR Codex en main = PR #73 (`fcc17492`). No hay solapamiento con PR #76. |
| **Task C** — Auditoría PR #73, fase 2 | Clasificación: 3 defectos P1, 1 P2, 1 P3. Ver tabla §4. |
| **Task C** — Auditoría PR #73, fase 3 | Correcciones aplicadas en `fix/levantamiento-barcode-audit` (`c9a92352`). 5 archivos, 81 líneas. Push y PR pendientes (Daniel). |
| **Documentación** | Este archivo actualizado en rama `docs/actualizar-contexto-maestro-20261009`. PR pendiente. |

### Bitácoras anteriores (resumen)

- **2026-10-08** — Jules PR #67: FUNC-002/004; Codex SEC-005 PR #70; Codex FUNC-001 rama `fix/func-001-cotizacion-venta`; Codex LEV-001 PR #73; docs UX PR #74; E15 PR #75.
- **2026-10-05** — Auditorías Jules (funcional, seguridad, arquitectura); diagnósticos QA; recuperación usabilidad admin/caja.
- **2026-10-04** — Diagnóstico main; operación piloto; validación integración y sesiones.
- **Histórico completo:** ver §9 Anexo y `docs/AUDITORIA_RAMA_20261005.md`.

---

**FIN DEL CONTEXTO VIGENTE**


## 9. Anexo histórico íntegro — consultar selectivamente

Snapshot de los 20 Markdown de `docs/` existentes antes de esta consolidación. Se conservan completos para no perder requisitos, procedimientos ni pruebas. Sus afirmaciones reflejan fechas/ramas diferentes; las instrucciones internas de “actualizar este archivo” quedan reemplazadas por el protocolo del contexto maestro. Los enlaces relativos históricos pueden apuntar a los originales conservados. Este anexo es evidencia histórica, no una lista automática de tareas ni autorización para ejecutar comandos.


### H1 — APP_MOVIL_Y_NOTIFICACIONES.md

# App instalada y notificaciones del dueño

Requisito confirmado el 5 de octubre de 2026: el dueño debe instalar una app y recibir notificaciones con la app cerrada, independientemente de la sesión del navegador. La web móvil y su manifiesto no completan este requisito. Este documento define el siguiente bloque de trabajo; aún no hay app ni entrega push implementadas.

## Primera versión propuesta

App React Native con Expo, reutilizando la API y las reglas de empresa/ADMIN existentes. Confirmar Android/iPhone y distribución antes de preparar builds firmados.

- Inicio de sesión propio del dispositivo, con renovación segura; cerrar el navegador no cierra la sesión de la app.
- Registro del dispositivo y permiso de notificaciones push.
- Bandeja de solicitudes pendientes y detalle actualizado desde el servidor.
- Aprobar/rechazar devoluciones desde la cuenta ADMIN, con motivo y auditoría existentes.
- Al tocar una notificación, abrir la solicitud y comprobar su estado vigente. Con dos ADMIN, una solicitud ya atendida se muestra como tal; un aviso antiguo no permite repetir la decisión.
- Consultas básicas del negocio y avisos de stock/vencimientos en una etapa posterior según prioridad del dueño.

La aprobación de la devolución sigue separada de su ejecución en caja. La app no crea una segunda autorización ni ejecuta ajustes financieros desde el aviso recibido.

## Sesión, cierre y recepción

Cerrar o dejar en segundo plano la app conserva el registro del dispositivo y permite recibir push mediante el sistema operativo, si hay permiso y conectividad. No depende de que una pantalla web permanezca abierta. El comportamiento debe probarse en builds instalables de los dispositivos reales, incluyendo restricciones del sistema operativo; no basta Expo Go o una prueba de navegador.

Cerrar sesión explícitamente en la app, revocar su dispositivo o desactivar/cambiar el rol de la cuenta debe cancelar su registro de avisos administrativos y su acceso. Cerrar sesión en la web no revoca automáticamente la sesión independiente de la app; una revocación global sí debe abarcar todos los dispositivos.

La expiración del access token no elimina por sí sola el registro push de una sesión móvil vigente. Para ver detalles y decidir, la app renueva su sesión o pide login. Un aviso en pantalla bloqueada muestra un mensaje genérico, sin credenciales ni información financiera sensible.

El refresh actual del backend usa cookie del navegador; el logout web borra esa cookie y no hay sesiones revocables por dispositivo. Access y refresh tampoco tienen propósito diferenciado en sus payloads. Antes de extenderlo a móvil, distinguir ambos propósitos y añadir sesiones por dispositivo con refresh rotatorio/revocable y comprobación de revocación en backend. Usar almacenamiento seguro del sistema; no asumir que copiar localStorage o una cookie web proporciona ese circuito.

## Base local y entrega de avisos

Conservar PostgreSQL local como fuente de ventas, caja, inventario y autorizaciones. Propuesta de menor alcance: registrar un evento pendiente en la misma transacción que crea la solicitud y usar un proceso local que lo entregue a Expo Push o FCM/APNs mediante HTTPS saliente. Así no se necesita alojar la base operativa en nube. Si se necesita un puente para acceso remoto sin VPN, puede manejar eventos/comandos limitados sin alojar toda la base operativa.

Los eventos deben conservarse ante reinicio o pérdida de Internet, con identidad, reintentos y control de duplicados. Aceptación por el proveedor no equivale a que el dueño lo haya leído; la bandeja del servidor sigue mostrando las solicitudes pendientes. El dispositivo se verifica contra usuario, empresa, rol y estado activo antes de cada envío administrativo.

El acceso remoto a los detalles y decisiones necesita una ruta segura al servidor: VPN o puente autenticado con alcance limitado. Push por sí solo no resuelve ese acceso ni debe conceder autorización. No publicar PostgreSQL ni aceptar decisiones anónimas desde la notificación.

Si el local pierde Internet, caja continúa con servidor/LAN encendidos y los avisos se entregan al reconectar. Mientras tanto no hay autorización remota inmediata; un ADMIN local puede decidir usando su propia cuenta. Si se apaga el servidor, la app informa falta de acceso y no presenta una aprobación como confirmada.

## Orden de implementación y aceptación

1. Confirmar plataforma, forma de distribución y conexión remota.
2. Preparar app con login seguro, bandeja y lectura del detalle usando la API existente.
3. Agregar sesiones/registro/revocación de dispositivos y cola persistente de eventos en backend.
4. Configurar proveedor/credenciales push y probar avisos con app cerrada en builds instalados.
5. Conectar decisión autorizada, comprobación del estado actual y auditoría; probar dos ADMIN simultáneos.
6. Probar logout/revocación, access token vencido, Internet interrumpido, reintentos y reconexión sin duplicar operaciones.

Las credenciales/cuentas de publicación y de push deben configurarse fuera del repositorio. La plataforma y el acceso a esos servicios aún no están confirmados. La entrega de esta app es un requisito del cliente; no debe marcarse completada por disponer de web adaptable o manifiesto.


### H2 — AUDITORIA_RAMA_20261005.md

# Auditoría de codex/recuperacion-ventas

Revisión del PR #59 y del paquete de instalación local preparado el 5 de octubre de 2026. Alcance: recuperación de ventas/devoluciones, autorización e integridad económica, migraciones, respaldo/restauración, sesión entre pestañas y despliegue Docker. Se utilizaron datos sintéticos y bases aisladas; no datos de la ferretería.

## Hallazgos y correcciones

| Prioridad | Hallazgo confirmado | Corrección y evidencia |
|---|---|---|
| P1 | Respuestas tardías del POS podían sustituir el comprobante vigente y borrar la recuperación de una operación posterior. | Validar empresa, usuario e identidad de solicitud al procesar respuestas; cerrar únicamente la recuperación correspondiente al comprobante. Regresiones del flujo con respuestas demoradas. |
| P1 | Revocar rol/permisos mientras una operación esperaba el bloqueo no impedía algunos mutadores económicos. | Releer usuario activo, empresa, rol y permiso dentro del mismo bloqueo que gestión de usuarios, antes de ventas, caja, pagos, compras, entrega, productos, aplicación de conteos y conversión de cotizaciones. |
| P1 | Cerrar el comprobante de una devolución anterior podía eliminar otra solicitud pendiente. | Comparar identidad del comando antes de limpiar recuperación; conservar la solicitud posterior. |
| P1 | Un cambio de login en otra pestaña podía refrescar solo el usuario y mantener la empresa anterior en el contexto. | Vincular la sincronización a la identidad del contexto y resolver cambios completos de sesión sin mezclar empresas. |
| P2 | Un rechazo definitivo al decidir/ejecutar una devolución podía dejar el flujo bloqueado indefinidamente. | Reconciliar el estado con lectura del servidor y conservar identidad en resultados inciertos; habilitar la siguiente acción únicamente con resultado confirmado. |
| P1 | Caddy enviaba las solicitudes a la API interna al proxy externo del entorno y recibía HTTP 403. | Excluir los hosts internos mediante NO_PROXY, conservando el proxy externo. HTTPS con CA/SNI válidos aprobado para Inicio, salud y manifiesto. |
| P2 | El comando de respaldo manual omitía la preparación privada de PG* y fallaba. | Envolver comandos ejecutados con exec en container-entry.mjs; el comando corregido generó un respaldo real del ensayo. |
| P2 | El usuario de respaldos no podía leer package.json al verificar una restauración. | Declarar permisos de lectura de código/configuración pública en la imagen, conservando permisos privados de secretos y copias. |
| P2 | Una ruta externa enlazada al repositorio permitía crear secretos/copias dentro de él. | Canonicalizar proyecto y ancestro existente antes de crear directorios; regresiones con symlinks y enlaces rotos. |
| P2 | La configuración alteraba barras POSIX/nombres comerciales y podía interpolar dólares. | Conservar valores y codificar dólares literales; validar el modelo real de Compose con fixtures temporales. |
| P2 | El panel seguía diciendo que faltaba comprobar restauración después de verificarla. | Vincular el intento programado a su manifiesto y SHA mediante IPC; derivar el estado de la evidencia actualizada por restore-verify. Se rechazan rutas/manifiestos inválidos. |
| P1 | Había archivos de entorno y artefactos generados bajo seguimiento de Git. | Retirarlos del índice en commit separado y conservar copias locales. El historial anterior requiere revisión de credenciales por su propietario. |
| P1 | La lectura de Excel dependía de XLSX con vulnerabilidades conocidas sin actualización correctiva disponible. | Retirar XLSX; mantener importación CSV UTF-8 con límites de tamaño/filas y pruebas. Auditoría npm productiva sin vulnerabilidades conocidas reportadas. |

## Evidencia técnica

El despliegue de ensayo creó empresa/ADMIN sin seed, agregó un cajero, abrió caja, vendió, entregó, solicitó y autorizó una devolución parcial, la ejecutó y repitió sin duplicar el reintegro. El stock final fue 9 a partir de 10, venta de 2 y devolución de 1.

Se generó un respaldo mediante pg_dump y se restauró en otra base vacía con el usuario no privilegiado de respaldos. El endpoint administrativo informó restauración comprobada y rechazó al cajero con HTTP 403. Se mantuvieron los volúmenes al recrear servicios y se verificaron venta, devolución y stock en una red Docker interna sin salida a Internet. Después de SIGKILL a PostgreSQL/backend, el sistema recuperó la venta confirmada, la devolución y el stock esperado. La suite PostgreSQL también comprueba rollback de transacción incompleta y reintento sin duplicar dinero/reservas. La validación HTTPS usa la CA pública del ensayo y comprueba nombre/cadena; no desactiva TLS.

Resultado final: **208 pruebas aprobadas** (58 frontend, 88 backend, 55 PostgreSQL real aislado y 7 scripts). Builds frontend con `/api`, backend y las imágenes Docker aprobados; `git diff --check` limpio. Auditoría npm `--omit=dev`: cero vulnerabilidades conocidas reportadas en ambos paquetes. Las pruebas de scripts quedan incluidas en CI.

Los avisos de Vite sobre fragmentos grandes y configuración CommonJS siguen siendo deuda de rendimiento/mantenimiento; no impidieron compilar. La retirada de XLSX hace que Excel requiera guardar como CSV UTF-8 antes de importar. El ensayo Linux/Docker no verifica dispositivos móviles reales ni arranque desatendido de Docker Desktop en Windows.

## Pendientes que impiden declarar lista la instalación real

1. Copia reciente de la base real y ensayo de actualización/restauración con conciliación del negocio.
2. Si los archivos de entorno históricos contenían credenciales reales, rotarlas y evaluar limpieza del historial. No se leyeron sus valores ni se reescribió historial durante esta auditoría.
3. Hardware/OS, arranque automático, router/DNS, confianza HTTPS en caja/celulares, UPS y prueba física de corte.
4. Respaldo externo al servidor, retención/espacio y responsable de restauraciones periódicas. Seis horas entre copias implican posible pérdida de operaciones desde la última copia si se pierde el disco completo.
5. Piloto con cajero y ambos administradores; impresora/lector, reglas fiscales y política de devoluciones/garantías.
6. Acceso remoto seguro y notificaciones móviles; segunda sucursal/sincronización requieren implementación adicional.

La auditoría cubre los flujos indicados y sus regresiones; no certifica todos los módulos preexistentes. No se habilita cobro simultáneo desde varias pestañas ni operación independiente de caja cuando cae el servidor/LAN. Los bloqueos económicos conservan un orden por empresa; no convierten la instalación en un sistema distribuido.


### H3 — AVANCE_DEVOLUCIONES_AUTORIZADAS.md

# Devoluciones con autorización administrativa

Rama: `codex/recuperacion-ventas`. PR: #59.

## Recorrido

1. Caja, vendedor o administrador busca el número de venta y selecciona cantidades, destino de cada producto, motivo y método de reembolso.
2. La solicitud se guarda en la base como **PENDIENTE**. No cambia caja, cuenta ni existencias. Conserva una identidad estable y el comando exacto.
3. Un administrador autenticado, de la misma empresa, revisa productos, cantidades, importe estimado, pago original y motivo. **Autoriza o rechaza** e indica el motivo de su decisión. Tampoco se realizan ajustes en este paso.
4. El solicitante confirma una solicitud **AUTORIZADA** desde su sesión. Si hay dinero a reembolsar, necesita su propia caja abierta; el efectivo debe alcanzar.
5. Una sola transacción registra devolución, detalles, movimientos de inventario/caja, reducción de crédito, auditoría y estado **EJECUTADA**. La venta original se conserva.

La ferretería puede tener dos o más administradores con cuentas individuales. Todos ven las solicitudes de su empresa y cualquiera puede decidir; basta la autorización de uno. Si deciden simultáneamente, se conserva la primera decisión confirmada y su autor; la otra recibe un conflicto y debe actualizar el estado. No se exige una doble aprobación.

El administrador autoriza usando su cuenta: no se comparte su contraseña con el cajero ni se confía en aprobaciones almacenadas en el navegador. El solicitante no puede cambiar cantidades, motivo o método de una solicitud ya registrada. Un reintento de una decisión idéntica recupera esa decisión; otra decisión sobre la misma solicitud se rechaza.

## Controles

- Solicitudes y comprobantes están aislados por empresa. El personal consulta solo sus solicitudes; el administrador revisa las de su empresa. Solo el solicitante ejecuta la devolución contra su caja.
- El servidor valida el administrador al decidir y vuelve a comprobar que siga activo y sea ADMIN antes de la primera ejecución. Cambiar un botón o el almacenamiento local no concede autorización.
- Antes de ejecutar se recalculan cantidades disponibles y destino. Si hubo otra devolución o una entrega después de la autorización, una solicitud incompatible no produce ajustes.
- La devolución parcial distribuye el total original, incluidos descuentos e impuestos, conservando los controles existentes para no devolver de más.
- Se reduce primero el crédito pendiente. El excedente es reembolso. Solo INVENTARIO incrementa stock vendible de mercadería entregada; DAÑADO/PROVEEDOR mantienen trazabilidad; NO_ENTREGADO libera la reserva.
- El importe mostrado al administrador es estimado: los pagos y devoluciones posteriores pueden cambiar la distribución entre crédito cancelado y reembolso. El comprobante muestra los valores definitivos.
- Tarjeta y transferencia registran el movimiento contable; no procesan automáticamente pagos en el banco.
- Auditoría guarda quién solicitó, quién decidió, el motivo, quién ejecutó y la relación con la venta/devolución. Una solicitud pendiente o rechazada no equivale a una devolución registrada.

## Interrupciones y recuperación

El navegador guarda la operación pendiente por usuario/empresa antes de enviarla. Una consulta recupera solicitudes y devoluciones confirmadas; ante desconexión o sesión vencida no se genera otra identidad. Repetir ejecución consulta el resultado ya registrado o ejecuta el mismo comando una sola vez.

El comprobante permanece recuperable hasta que el usuario lo cierra. Si falla el almacenamiento antes de enviar, se bloquea la operación. JSON corrupto se conserva para revisión. Los pendientes del flujo administrativo anterior siguen consultándose como devoluciones directas, con la misma identidad.

Una solicitud no registrada puede corregirse después de consultar su ausencia, manteniendo el mismo identificador. Se consulta otra vez antes del envío: una confirmación tardía no se sustituye por otra solicitud. Si la original se confirmó con otros datos, se recupera lo registrado y se informa que las correcciones no se aplicaron; el usuario revisa la solicitud original antes de continuar.

La base conserva las solicitudes registradas aunque se reinicie el navegador o se use otro equipo. El cuerpo todavía no confirmado y el comprobante pendiente dependen del navegador original. La pérdida física del disco requiere respaldo; esto no implementa operación offline.

## Instalación y límites

Se añadió `20261005000000_autorizaciones_devolucion`; las migraciones anteriores no cambian. Aplicar el procedimiento de `INSTALACION_Y_ACTUALIZACION_SEGURA.md` sobre copia comprobada antes de producción.

El flujo cubre devoluciones/cancelaciones totales o parciales de ventas. No revierte todavía compras, recepciones, pagos, aperturas/cierres de caja ni transferencias. No incluye aplicación móvil, notificaciones push ni autorización por PIN. La revisión administrativa requiere acceso al mismo servidor. Autorizar no caduca automáticamente; una solicitud incompatible requiere nueva solicitud y revisión, y la anterior no podrá ejecutarse mientras siga siendo incompatible.

## Validación

- Build frontend/backend y validación Prisma.
- 36 pruebas frontend: recuperación de respuesta perdida sin POST, bloqueo de doble clic/almacenamiento, sesión que cambia durante consulta, pendiente antiguo/corrupto y corrección con identidad conservada.
- 52 pruebas unitarias backend.
- 50 pruebas PostgreSQL aislado, incluyendo migraciones y diez casos nuevos del flujo autorizado: permisos, aislamiento, inmutabilidad, aprobación/rechazo, rollback, reintentos concurrentes, crédito, administrador desactivado, entrega posterior, devolución parcial, cantidades consumidas y dos administradores consultando/decidiendo simultáneamente.

Pendiente: aceptación con cajero/administrador reales, corte físico de energía y actualización sobre copia real de producción. No se modificaron datos productivos.


### H4 — AVANCE_P0_RECUPERACION_Y_RESPALDOS.md

# Avance P0: recuperación de ventas y respaldo

Fecha: 5 de octubre de 2026. Cambios preparados en codex/recuperacion-ventas.

Actualización: la instalación desde cero y la adopción controlada de bases históricas están preparadas en [Instalación y actualización segura](INSTALACION_Y_ACTUALIZACION_SEGURA.md). El bloqueo de baseline descrito abajo corresponde al diagnóstico inicial; su resolución productiva sigue pendiente de inspección real.

## Recuperación implementada en esta etapa

- Borrador automático de carrito, cantidades, cliente, descuento y método de pago, separado por empresa y usuario.
- Al regresar al POS con el mismo navegador/equipo/usuario se recupera el borrador o la solicitud pendiente. No se envía ninguna venta automáticamente.
- “Revisar venta y continuar” consulta un endpoint autenticado y limitado a empresa/usuario. La consulta espera la transacción de venta en curso y no registra ni cobra.
- Una venta ya registrada muestra su comprobante con datos del servidor. El pendiente solo se elimina al cerrar el comprobante o iniciar otra venta desde él, cubriendo la interrupción entre confirmación y visualización.
- Una venta no registrada permite continuar con su mismo identificador, después de verificar el pago físico. Puede corregirse sin perder ese identificador; cada reintento consulta otra vez antes de enviar.
- Datos corruptos, almacenamiento inaccesible o falta de conexión muestran mensajes y no se convierten silenciosamente en otra venta.
- Sesión vencida, permisos o conflicto no borran la identidad pendiente.

Esto no crea operación offline completa. Borradores no descuentan ni reservan inventario. No usar navegación privada, borrar datos del navegador ni cambiar el origen/URL del frontend para una recuperación pendiente. La escritura del navegador no garantiza supervivencia ante daño de disco; comprobar el equipo y usar UPS. El efecto guarda cambios después del render de React: no garantiza el último carácter justo antes de un corte físico.

La prueba de cambios de usuario impide mostrar el resultado de una consulta anterior en otra cuenta. Las notificaciones de cambios de almacenamiento actualizan otras pestañas, pero no se garantiza una sesión de cobro concurrente entre pestañas; usar una sola pestaña POS por puesto. La recuperación está en POS, no en un centro general para todas las operaciones al iniciar sesión.

Los mensajes de pago no verifican efectivo ni terminal bancaria automáticamente. Comprobar el cobro físico antes de continuar. No se implementaron reversos autorizados en esta etapa.

## Respaldo y diagnóstico preparados

Herramientas: backend/scripts/backup-preflight.mjs y backend/scripts/preflight.sql.

El diagnóstico usa una transacción READ ONLY y consulta configuración de durabilidad, historial Prisma, cantidades y anomalías básicas. No aplica migraciones ni cambia saldos. El respaldo usa pg_dump custom, comprueba que el archivo sea legible y genera checksum SHA-256. No copia credenciales en el manifiesto ni muestra errores que puedan contenerlas.

La restauración completa sigue siendo necesaria: leer un archivo no prueba que pueda restaurarse. La prueba automatizada restaura datos ficticios en otra base del clúster aislado y compara ventas, productos y movimientos de caja. Esto no certifica el respaldo de producción.

Requisitos: Node, herramientas PostgreSQL compatibles con la versión del origen, acceso de lectura suficiente y almacenamiento privado. Para POSIX se crean directorios privados y archivos con permisos limitados; en Windows revisar ACL del directorio. Usar una cuenta explícita y el almacén de credenciales del administrador, PGPASSFILE/PGSERVICE o configuración equivalente. No incluir contraseñas en comandos ni en Git. No se utiliza DATABASE_URL ni se lee .env automáticamente.

Ejemplo con servicio de conexión previamente configurado por el administrador:

```sh
PGSERVICE=ferresystem_backup node backend/scripts/backup-preflight.mjs /ruta/privada/respaldos
```

Con PGHOST/PGPORT/PGDATABASE/PGUSER también es posible; para conexión remota configurar TLS verificable según proveedor. PG_BIN permite seleccionar el directorio de binarios. El reporte y el dump se toman en momentos distintos: usar una ventana operativa controlada para conciliación final. Proteger y copiar el respaldo fuera del equipo, definir retención y probar restauración; la herramienta no configura programación ni cifrado del destino.

## Hallazgos que siguen bloqueando puesta en operación

1. Este entorno no tiene credenciales productivas configuradas: no se hizo respaldo ni consulta de producción y no se aplicaron migraciones.
2. La primera migración del repositorio presupone que tenants y otras tablas base ya existen. No basta ejecutar migrate deploy sobre una base vacía para instalar en una PC nueva. Comprobar historial real, resolver baseline y ensayar sobre copia antes de cualquier cambio productivo. No usar reset ni db push para forzar coincidencia.
3. Hay archivos .env.local y .env.vercel versionados. Revisar si contienen secretos; retirarlos del versionado y rotar cualquier secreto expuesto si corresponde. No se leyeron sus valores ni se confirmó exposición de credenciales en esta revisión.
4. Falta decidir arquitectura/equipo/UPS, comprobar dispositivos y probar usabilidad con cajero y administrador.
5. Falta automatizar respaldo externo y probar restauración de datos reales en entorno aislado.
6. Frontend y backend deben desplegarse juntos para habilitar el nuevo endpoint. Recompilar desde fuentes; no usar dist antiguos versionados.

## Verificación y límites

La suite ampliada verifica borrador previo a Cobrar, respuesta perdida, comprobante tras recarga, consulta sin POST, sesión vencida, aislamiento de usuario/empresa, datos corruptos, fallos de almacenamiento y corrección con confirmación tardía. PostgreSQL aislado verifica consulta sin escrituras, espera de transacciones, reinicio abrupto, rollback de una venta incompleta, persistencia de una confirmada y reintento sin duplicados; también respaldo/restauración y HTTP autenticado con UUID válido.

Un stop inmediato del proceso PostgreSQL modela recuperación tras caída del servidor; no es una prueba de corte eléctrico físico ni daño de disco. Pendientes: prueba real con UPS/equipos, impresión y aceptación del usuario.


### H5 — AVANCE_USABILIDAD_ADMIN_Y_CAJA.md

# Inicio por tareas y buscador de navegación

Implementado en `codex/recuperacion-ventas`, dentro del PR #59.

- Buscador en todas las pantallas autenticadas, con navegación lateral, superior y móvil. Encuentra pantallas por palabras de trabajo cotidiano: comprar, personal, cobrar, caja, crédito o cotizar; admite mayúsculas, acentos y varias palabras.
- Inicio del administrador con compras, productos, usuarios, reportes, cuentas, caja, devoluciones y auditoría. Inicio de caja con apertura, venta, cotización, clientes, abonos y entregas. Bodega tiene sus propios accesos.
- Descripciones breves explican para qué sirve cada acceso. Caja muestra el orden recomendado: abrir, vender, contar y cerrar.
- Los accesos respetan el rol y los módulos habilitados. Menús y buscador comparten la comprobación de acceso. El administrador vuelve a ver reportes aunque no reciba una lista explícita de permisos, como ya permiten las rutas protegidas.
- Las pantallas todavía pendientes no aparecen como tareas disponibles en el buscador ni como accesos del inicio.
- Se corrigieron dos rutas que estaban fuera de `Routes` y podían impedir el arranque de la aplicación.
- El resumen informa si está cargando o falló, permite reintentar y mantiene disponibles las tareas. Se retiraron del inicio los enlaces que no respetaban el rol, el porcentaje de crecimiento ficticio y la tendencia semanal de ejemplo. La cabecera ya no inventa un horario de turno.

## Alcance y próximos pasos

Este buscador encuentra **pantallas y tareas**, no registros de todas las tablas. Los productos y clientes se buscan dentro de sus módulos. No ejecuta operaciones ni concede autorizaciones.

Sigue pendiente validar estos recorridos con el cajero y el administrador de la ferretería: abrir caja, completar una venta, recibir una compra, registrar un abono y revisar un reporte. Medir los pasos que les cuestan y simplificar esos formularios será la siguiente mejora de usabilidad. Las notificaciones y autorizaciones remotas requieren una implementación real aparte.

## Validación

Compilación de producción y 29 pruebas frontend aprobadas. Las seis pruebas nuevas cubren búsqueda, acentos, permisos, módulos deshabilitados, tareas pendientes, renderizado real de React con enlaces del router y ubicación de rutas. No se validó todavía con usuarios de la ferretería ni con una base productiva.


### H6 — DIAGNOSTICO_MAIN_20261004.md

# Diagnóstico de FerreSystem frente a requisitos del cliente
Fecha de auditoría: 2026-10-04.
Fuente de verdad: main, commit 84e61ec161455d46c2786791e6422178477ac886, confirmado también al terminar la inspección.
Último commit: 2026-10-03, “docs: registrar requisitos validados con dueño del negocio”.

## 1. Resumen ejecutivo
FerreSystem dispone de persistencia real para productos, usuarios, clientes, ventas, cotizaciones y capturas básicas de levantamiento. El registro de ventas y conversión de cotizaciones usan transacciones y descuentos condicionales de stock; el POS conserva una identidad para reintentar cobros.

El núcleo completo del piloto todavía no está cerrado: compras/proveedores, recepción, historial de costos, cuentas por pagar/cobrar, cierre de caja, Kardex, entrega y venta sin inventario no forman un circuito persistente y auditable. Compras, garantías, pedidos especiales y arqueos son interfaces con almacenamiento local. No se contabilizan como implementación real del requisito.

Los riesgos inmediatos son crédito sin cliente ni deuda, descuentos/precios aceptados sin autorización backend, cierres calculados con ventas vacías, modificación de existencias sin movimientos, y operaciones de levantamiento accesibles al cajero por API.

### Alcance y límites de la verificación
Se inventarió el árbol completo mediante GitHub, se obtuvieron 163 archivos propios de código/configuración/documentación/pruebas y se contrastaron rutas, servicios, DTOs, esquema y las tres migraciones versionadas. No se consideraron dependencias node_modules evidencia de funcionalidades. Se inspeccionaron además artefactos dist relevantes para detectar diferencias con src.

La clonación no pudo ejecutarse porque el proxy del shell no aceptó la conexión; la revisión continuó con el conector GitHub sobre el SHA fijado. Los archivos descargados son una copia de lectura en /workspace/FerreSystem-audit. No se modificó código del repositorio ni se hizo commit, push, despliegue o migración.

La clasificación IMPLEMENTADO significa que el circuito está conectado y persiste mediante Prisma/PostgreSQL en el código revisado. No significa validación del despliegue actual ni ejecución de operaciones sobre una base real en esta sesión. No hay credenciales de base de datos configuradas en este entorno. La ejecución de los tests frontend se bloqueó antes de ejecutar casos por ausencia de typescript; tampoco están instalados initdb/psql para la suite de PostgreSQL. Los tests existentes se inspeccionaron, pero no se presentan como pruebas aprobadas. No se usaron mocks como prueba de persistencia.

## 2. Requerimientos encontrados en las anotaciones
Fuente primaria: docs/REQUISITOS_NEGOCIO_VALIDADO.md, fecha 2026-10-02, conversación con el dueño.
1. Inventario prioritario; levantamiento inicial; registrar venta antes de entregar; trazabilidad y faltantes; reposición por rotación.
2. Historial compra/proveedor y costo vigente separado; reposición actualiza costo tanto al subir como al bajar; margen y precio por producto; capturarlos en levantamiento.
3. Múltiples proveedores, factura de compra, cantidades/costos/fechas; vencimientos/plazos, saldos y pagos propios; recepción física incrementa stock; alertas.
4. Contado: efectivo, transferencia, tarjeta/POS; venta atribuida al cajero y cierre por empleado. Integración bancaria posterior.
5. Crédito exclusivamente a clientes registrados, identificador, documento contado/crédito, deuda automática, abonos, saldo e historial.
6. Administrador/Cajero; cajero vende y consulta sin modificar información sensible; auditoría de usuario, operación, fecha, importe, método y cierre; autor/modificador administrativo.
7. Código fabricante/proveedor, código interno, escáner/cámara, búsqueda descriptiva y variantes distinguibles.
8. Foto opcional de identificación, optimizada para evitar imágenes pesadas directamente en BD.
9. Venta especial que nunca entra físicamente: ingreso/venta/documento/cierre/historial sin salida física, vinculada a compra/proveedor; no resolverla con stock negativo. Si llega al local, sí entra al inventario.
10. Devolución ligada al documento original e impacto en stock, factura, reembolso, crédito y garantía; motivo, usuario, fecha y destino.
11. Garantías vinculadas a producto/venta, condiciones/vigencia/responsable. Reglas exactas pendientes del cliente.
12. Alertas operativas, uso web desde PC/celular, offline con sincronización y prevención de duplicidad.
13. Vidriería/ventanas y estructura empresarial/permisos posteriores al piloto.
14. Investigación de integración bancaria/POS posterior, sin bloquear piloto.

Fuentes complementarias de backlog, sin atribuir todos sus detalles a la reunión:
- docs/PENDIENTES_LEVANTAMIENTO_INVENTARIO.md: aplicar explícitamente después de revisión/conciliación; multiusuario, concurrencia, zonas, offline/idempotencia; escaneo barcode/QR; foto para artículo aún no identificado y revisión posterior; decimales/presentaciones; auditoría, reconteos; exportación independiente CSV/Excel con columnas/plantillas.
- docs/ROADMAP_FERRESYSTEM.md: Kardex, cartera, alertas, resumen diario y permisos persistentes. Su P2 para costos/múltiples proveedores entra en conflicto con el P0 validado posteriormente: para esta propuesta prevalece la nota del dueño.

### Requerimiento completo de fotografías
La fuente primaria pide una fotografía opcional como ayuda de identificación y optimización para no almacenar imágenes pesadas directamente en BD. El documento de levantamiento añade tomarla durante el conteo, usarla si aún no se identifica completamente el artículo y dejarlo pendiente de completar en revisión.
No se documentan cantidad de fotos, resolución exacta, proveedor de almacenamiento, IA, reconocimiento automático o fotos obligatorias. Las decisiones técnicas de almacenamiento/compresión son propuestas de implementación, no requisitos atribuidos al cliente.

## 3. Matriz de cumplimiento
En “Base de datos”, SQL aislado significa tabla declarada en una migración, sin modelo Prisma actual ni circuito de escritura conectado; no demuestra despliegue ni persistencia funcional.
Evidencias E01–E15 se detallan después.

| Requerimiento | Estado | Frontend | Backend | Base de datos | Evidencia | Qué falta |
|---|---|---|---|---|---|---|
| Catálogo con costo y precio vigentes persistentes | IMPLEMENTADO | Consulta/alta real | CRUD validado y aislado por tenant | Producto.precioCosto/precioVenta | E01 | Verificar despliegue; ampliaciones se evalúan abajo |
| Costos históricos por compra/proveedor, fecha/cantidad/documento | NO IMPLEMENTADO | Orden local no satisface historial real | No servicio de compras/recepciones | SQL de orden/detalle aislado; sin modelos actuales | E02 | Historial inmutable y vínculo de documentos |
| Costo vigente actualizado por compra más reciente incluso menor | NO IMPLEMENTADO | Recepción solo cambia estado local | Ninguna operación de recepción actualiza Producto | Solo campo vigente | E01/E02 | Recepción transaccional y regla temporal clara |
| Múltiples proveedores de un producto | NO IMPLEMENTADO | Selección local en órdenes | Sin relación/servicio operativo | Sin relación Prisma producto-proveedor | E02 | Relaciones y trazabilidad por compras |
| Margen y precio propios por producto | PARCIAL | Precio por artículo; margen calculado en reportes | Persiste costo/precio, no política de margen | Sin margen configurado | E01/E10 | Persistir/aplicar margen si se configura; definir relación precio-margen |
| Costo, margen y precio en levantamiento inicial | IMPLEMENTADO CON ERROR | Precio estimado visible, no enviado | DTO carece de estos campos | LevantamientoItem carece de ellos | E04 | Contrato y persistencia completos |
| Proveedores y órdenes de compra reales | PARCIAL | CRUD localStorage | No controladores/servicios | Tablas SQL aisladas | E02/E12 | Conectar almacenamiento real y permisos |
| Facturas proveedor, plazos, saldo, pagos y estado | NO IMPLEMENTADO | Órdenes no son libro de cuentas | Sin cuentas por pagar/pagos | Sin modelos actuales de factura/saldo/pago | E02/E03 | Circuito de CxP y saldo propio |
| Recepción física incrementa stock y registra movimiento | IMPLEMENTADO CON ERROR | “Recepción total” confirma solo local | Sin operación de recepción | Stock de Producto no cambia | E02 | Recepción parcial/total atómica e idempotente |
| Roles mínimos Administrador/Cajero | IMPLEMENTADO | Login/rutas por rol | JWT y RolesGuard donde se declara | Usuario.rol; enum Rol | E05 | Completar cobertura de operaciones sensibles |
| Cajero no cambia costo/producto por API | IMPLEMENTADO | Inventario restringido | POST/PUT ADMIN/BODEGUERO; DELETE ADMIN | Solo rutas autorizadas del CRUD | E01/E05 | Separar política de BODEGUERO si se decide |
| Cajero sin acceso a operaciones administrativas sensibles | IMPLEMENTADO CON ERROR | Oculta levantamiento | No @Roles en levantamientos; clientes sin RolesGuard | Puede editar/borrar capturas/clientes | E04/E05 | Matriz de permisos backend por operación |
| Permisos individuales, descuento y sucursal persistentes | IMPLEMENTADO CON ERROR | Selección y aparente guardado en estado | Payload/DTO no contienen configuración | Usuario sin estos campos/relaciones | E05 | Persistencia y enforcement real |
| Cajero consulta precio vigente desde POS | IMPLEMENTADO | GET productos y precio en tarjeta | Devuelve precioVenta real | Producto.precioVenta | E01/E06 | Refresco/validación al cobro se evalúa en bugs |
| Búsqueda textual sin memorizar códigos | PARCIAL | POS filtra nombre/código | API busca nombre/código/barcode | Nombre y descripción disponibles | E01/E06 | Incluir descripción/variantes en búsqueda completa |
| Barcode persistente y búsqueda backend | IMPLEMENTADO | Pantalla normal no lo captura | DTO/CRUD y search sí admiten barcode | Producto.codigoBarras; índice | E01 | Conectar alta/POS; unicidad/ambigüedad |
| Escáner de barcode funcional en POS | NO IMPLEMENTADO | Descarta codigoBarras al mapear; filtra nombre/codigo | Búsqueda disponible pero POS no la usa | Campo existe | E06 | Resolver lectura exacta y seleccionar artículo |
| Código fabricante/proveedor identificado separadamente | PARCIAL | Campo genérico codigo sirve manualmente | Un único codigo y barcode | Sin código fabricante ni SKU por proveedor | E01/E02 | Identidades diferenciadas y búsqueda |
| Código interno manual para producto sin barcode | IMPLEMENTADO | Alta exige codigo, barcode opcional | Conflicto por código duplicado | Unique tenantId/codigo | E01 | Generación automática evaluada aparte |
| Código interno reconocible autogenerado, sin colisiones | NO IMPLEMENTADO | Usuario escribe código | Sin generador/reserva | Solo unicidad del código manual | E01 | Propuesta basada en descripción/tipo y reserva atómica |
| Descripciones para distinguir variantes | PARCIAL | Nombre libre; levantamiento descripción/marca | Texto libre persistente | Nombre/descripcion/marca parcial | E01/E04 | Criterios operativos y visibilidad de medida/espesor/color |
| Foto opcional de producto optimizada | PARCIAL | No flujo persistente de foto de catálogo | DTO/CRUD no escriben imagenUrl | Producto.imagenUrl sin uso en escritura | E01/E07 | Carga optimizada y persistencia de referencia |
| Foto de levantamiento para identificación pendiente | IMPLEMENTADO CON ERROR | Captura cámara/file y preview base64 | Foto omitida en payload y DTO | Sin foto ni estado de identificación por item | E04/E07 | Conservar foto y pendiente hasta revisión |
| Captura básica de levantamiento, sin exigir código | IMPLEMENTADO | Alta/edición/cantidad/unidad/descripcion | CRUD real con tenant | Levantamiento y Item | E04 | Auditoría/concurrencia en filas siguientes |
| Finalizar separado de aplicar stock | PARCIAL | Marca FINALIZADO; sin Aplicar | Solo cambia estado; permite editar después | Sin aplicación ni registro aplicado | E04 | Cierre inmutable/reapertura autorizada y Aplicar |
| Revisión/conciliación/preview/aplicación transaccional | NO IMPLEMENTADO | Sin flujo de resolución/aplicación | Sin endpoint aplicar | Sin vínculo item-producto/resoluciones/movimientos | E04 | Circuito explícito completo |
| Multiusuario con conflictos y autor por conteo | PARCIAL | Varios equipos pueden usar API, sin sincronización viva | CRUD sin versión ni conflicto | Timestamps y creador de sesión; sin autor de item | E04 | Control de concurrencia y conciliación |
| Zonas/asignación/progreso por usuario/zona | IMPLEMENTADO CON ERROR | Campo ubicación no enviado; contador básico | Sin zona/asignación | Sin ubicación/zona/usuarios asignados | E04 | Persistencia y progreso real |
| Reconteo preservando original y resolución | NO IMPLEMENTADO | Solo edición del conteo actual | Update sobrescribe | Sin reconteo/versiones | E04 | Segundo conteo y resolución auditable |
| Unidades y cantidades decimales | PARCIAL | Formularios básicos; importación trunca | Prisma/ventas aceptan decimales | Decimal(12,2); enum unidades/texto en conteo | E01/E04/E11 | Corregir importación y definir presentaciones/equivalencias |
| Escáner cámara/QR y recuperación desde levantamiento | NO IMPLEMENTADO | Campo manual barcode no enviado; sin lector | Sin flujo de resolución/alta desde escaneo | Barcode de catálogo, no en item | E04/E07 | Scanner y lookup con alternativa manual |
| Exportación independiente CSV/Excel y plantillas | PARCIAL | Exporta CSV de columnas fijas | Conteos recuperables por API | Se conserva conteo salvo borrado | E04/E11 | Excel en levantamiento, columnas/plantillas y campos faltantes |
| Venta contado efectiva/tarjeta persistente | IMPLEMENTADO | POST ventas y recibo | Transacción, validación, stock condicional | Venta/DetalleVenta con método, actor, fecha | E06/E08 | Cierre/entrega se evalúan aparte |
| Transferencia como método de pago | NO IMPLEMENTADO | Solo efectivo/tarjeta/crédito | DTO y enum no la admiten | MetodoPago sin TRANSFERENCIA | E08 | Añadir método y reflejar en recibo/cierre/reportes |
| Identificador y registro de cliente | IMPLEMENTADO | Clientes CRUD y CLI-...; picker cotización | API/búsqueda/alta | Cliente.numeroCliente + secuencia/trigger migrado | E09 | Verificar historial de migraciones en despliegue |
| Crédito solo a cliente registrado y documento vinculado | IMPLEMENTADO CON ERROR | POS manda nombre/RTN, nunca clienteId | Acepta CREDITO sin exigir clienteId | Venta.clienteId opcional | E06/E08/E09 | Selección obligatoria y validación backend |
| Crédito genera deuda, abonos/saldo/historial | NO IMPLEMENTADO | Etiqueta crédito no es cartera | Sin servicios CxC/pagos | No CuentaPorCobrar/Pago | E08/E03 | Cuenta/deuda automática y aplicación de abonos |
| Registrar venta antes de entregar, seguimiento entrega | PARCIAL | Venta real; sin entrega controlada | Stock baja al registrar, sin estado de entrega | Sin Entrega/fecha/responsable | E08 | Definir reserva/salida y control de despacho |
| Movimientos, faltantes y Kardex completo | NO IMPLEMENTADO | Stock/alerta; sin historia física integral | Cambia stock directo; venta tiene documento | Sin MovimientoInventario | E01/E08/E03 | Movimientos por origen y conciliación |
| Reporte de mayor rotación/reposición confiable | IMPLEMENTADO CON ERROR | Top vendidos calculado con GET ventas | Devuelve 50 ventas por defecto | Historial real disponible, consulta incompleta | E10/E08 | Agregación backend por rango/tenant |
| Cierre por cajero/empleado y dinero esperado | IMPLEMENTADO CON ERROR | ventas=[] fija; fondo 1000; cierre local | Sin servicio de turnos/cierre | cajas/movimientos en SQL aislado | E13/E12 | Apertura, sesión, ventas/pagos y cierre persistentes |
| Auditoría venta: actor/fecha/monto/método | IMPLEMENTADO | Recibo e historial | Usuario del JWT, cálculo, fecha | Venta.usuarioId/createdAt/total/metodoPago | E08 | Auditoría de otros eventos en siguiente fila |
| Auditoría integral y autor/modificador administrativo | PARCIAL | Soporte/auditoría local; conteos editables | Sin registro integral de cambios; soporte token real | Timestamps básicos; sin eventos operativos Prisma | E04/E05/E14 | Eventos persistentes con antes/después y atribución |
| Venta especial sin inventario ligada a proveedor/compra | NO IMPLEMENTADO | Pedido especial local es flujo diferente | Toda venta exige producto y descuenta stock | DetalleVenta siempre producto; sin tipo físico/especial | E08/E15 | Flujo comercial sin salida y trazabilidad |
| Devolución ligada a original con efectos completos | NO IMPLEMENTADO | No módulo/flujo real encontrado | Sin devolución/reembolso | Sin modelos; ANULADA no implementa devolución | E03/E08 | Política y circuito transaccional |
| Garantía: venta/producto, condiciones/vigencia/responsable | PARCIAL | Reclamos locales con factura textual | Sin servicio de garantías | SQL aislado; sin modelos actuales | E12/E15 | Reglas pendientes + circuito persistente |
| Alertas de stock bajo | IMPLEMENTADO | Dashboard/listado real | GET alertas y dashboard | Consulta stockActual/stockMinimo | E01/E10 | Ninguna brecha estructural del alerta básico |
| Alertas de facturas proveedor/deudas vencidas | NO IMPLEMENTADO | Sin cartera operativa | Sin consultas/servicios | Sin documentos/vencimientos operativos | E03 | CxP/CxC y alertas |
| Otras alertas/centro operativo | PARCIAL | Cotizaciones/stock; avisos locales | Dashboard para stock/cotización | Parte real y parte local | E10/E14 | Centro persistente sobre datos reales |
| Uso web desde otra PC/celular | PARCIAL | SPA y API compartida; limitaciones móviles documentadas | Catálogo/ventas/captura accesibles por web | Solo módulos reales compartidos | E16 | Responsive POS y persistencia de módulos locales |
| Offline: captura, cola, sincronización/conflictos | PARCIAL | POS conserva un cobro pendiente y reintento manual | Idempotencia de ventas por solicitudId | Venta real; sin cola/versión de conteos | E04/E06/E08 | IndexedDB/PWA si procede, sync y resolución |
| Resumen diario completo del negocio | PARCIAL | Dashboard ventas/stock real; caja local | Totales por día; sin caja/abonos/utilidad histórica | Sin costo histórico en detalle venta ni cartera | E10/E13 | Caja, pagos, devoluciones y costo vendido |
| Vidriería/ventanas y separación empresarial posterior | NO IMPLEMENTADO | Multi-rubro genérico no concreta decisión | Multi-tenant existente, sin flujo específico validado | Tenant genérico | E03/E16 | Definir después del piloto |
| Integración bancaria/POS automática posterior | NO IMPLEMENTADO | Método TARJETA manual | Sin integración externa | Sin conciliación/transacción bancaria | E03/E08 | Investigación posterior; no bloqueante |

### Índice de evidencias
Todos los paths son relativos al repositorio y corresponden al SHA auditado. Rutas API incluyen el prefijo /api definido en main.ts.
- E01: backend/prisma/schema.prisma:188 (Producto); backend/src/productos/productos.controller.ts:36; productos.service.ts:8, 96, 154; dto/create-producto.dto.ts:6; frontend/src/pages/InventarioPage.tsx:27, 86. GET/POST /api/productos, PUT/DELETE /api/productos/:id.
- E02: frontend/src/pages/OrdenesCompraPage.tsx:64, 73, 110, 184. handleRecepcionTotal modifica solo setOrdenes. backend/src/app.module.ts enumera los módulos realmente registrados.
- E03: backend/prisma/schema.prisma completo y backend/src/app.module.ts:16; ausencia de módulos/modelos operativos contrastada con todas las rutas.
- E04: frontend/src/pages/LevantamientoPage.tsx:240, 263, 302, 396, 415; backend/src/levantamientos/levantamientos.controller.ts:21; levantamientos.service.ts:99, 164, 196; dto/create-levantamiento-item.dto.ts:3; modelos Levantamiento/LevantamientoItem. /api/levantamientos/:id/items.
- E05: backend/src/common/guards/roles.guard.ts:14; auth/jwt.strategy.ts:34; usuarios/usuarios.controller.ts:29; usuarios.service.ts:72; DTOs de usuarios; frontend/src/pages/UsuariosPage.tsx:185; componentes ProtectedRoute y navegación.
- E06: frontend/src/pages/POSPage.tsx:103, 239, 245, 341. Mapeo pierde barcode; cobro manda nombre/RTN sin ID; localStorage aquí preserva un reintento, no sustituye el guardado real.
- E07: frontend/src/pages/LevantamientoPage.tsx:240, 263, 798; Producto.imagenUrl; DTOs de productos/levantamiento sin foto. Captura con input image/capture=environment, FileReader.readAsDataURL; no upload/compresión.
- E08: backend/src/ventas/ventas.service.ts:101, 122, 177, 191, 196, 221; ventas.controller.ts:18, 29; dto/create-venta.dto.ts:4; schema Venta/DetalleVenta/MetodoPago. CotizacionesService.convertirAVenta:415. POST /api/ventas; POST /api/cotizaciones/:id/convertir.
- E09: backend/src/clientes/clientes.service.ts:10, 76; clientes.controller.ts:42; frontend ClientesPage y ClientePicker; prisma/migrations/20261002000000_add_customer_numbers/migration.sql; docs/customer-number-deployment.md.
- E10: frontend/src/pages/ReportesPage.tsx:46, 308, 322, 429; backend/src/dashboard/dashboard.service.ts:9; productos.service.ts:70; ventas.service.ts:8. GET /api/dashboard, /api/productos/alertas/stock-bajo, /api/ventas.
- E11: frontend/src/components/ImportarProductosModal.tsx:140, 145, 271; frontend/src/pages/LevantamientoPage.tsx:415; utils/csvExport.ts y excelExport.ts. La presencia de exportToExcel en reportes no lo conecta al levantamiento.
- E12: backend/prisma/migrations/20260930000000_alter_stock_decimal_and_operational_models/migration.sql:27, 58, 74, 177; no modelos correspondientes en schema.prisma.
- E13: frontend/src/pages/ArqueoCajaPage.tsx:58, 89, 108, 119. Sin consulta API de ventas ni entidad turno real.
- E14: frontend/src/context/NotificationContext.tsx:47, 125; frontend/src/pages/SuperAdminPage.tsx:165, 389; backend/src/super-admin/super-admin.service.ts:130; support-token.dto.ts; TenantGuard. readOnly sí existe en backend; motivo/historial no están persistidos por el endpoint.
- E15: frontend/src/pages/GarantiasPage.tsx:56, 105 y PedidosEspecialesPage.tsx:54, 76; backend/src/app.module.ts; schema y migración operativa.
- E16: backend/docs/production-ui-check-2026-10-02.md; frontend App.tsx/config/rubros.ts; docs/REQUISITOS_NEGOCIO_VALIDADO.md y ROADMAP.

## 4. Bugs e inconsistencias
### B01 — HIGH: crédito sin cliente y sin deuda
Trigger: POST /api/ventas con metodoPago=CREDITO y sin clienteId. DTO acepta cliente opcional y servicio solo valida su pertenencia si se suministra. La venta se guarda, stock baja y no hay cartera.
POS envía clienteNombre y clienteRtn, campos ausentes del DTO; ValidationPipe whitelist los elimina. El nombre mostrado en el ticket no acredita vínculo con Cliente.
La conversión de cotización también puede generar crédito sin cliente: no exige clienteId para ese método.
Archivos/modelos/endpoints: E06, E08, E09; Venta.clienteId, MetodoPago.

### B02 — HIGH: autorización de descuentos y precios eludible
POST /api/ventas acepta precioUnitario y descuento del solicitante. El servicio usa ese precio sin contrastarlo con política/rol y limita a cero una base negativa mediante Math.max, sin rechazar descuento mayor al subtotal.
Un request válido puede usar precioUnitario=0 para mercancía con precio vigente mayor; puede descontar todo o más del subtotal. La aprobación local de NotificationContext no tiene evidencia de autorización backend.
Cotizaciones también permite precio manual sin límite por usuario.
Archivos: ventas.service.ts:196, 213; DTO; POSPage; NotificationContext; UsuariosPage; cotizaciones.service.ts:535.
Además, POS mantiene precios en el carrito y los vuelve a enviar; un cambio de precio vigente después de cargar catálogo no fuerza actualización al cobrar. Debe definirse explícitamente política de precio congelado/autorizado.

### B03 — HIGH: cierre de caja independiente de ventas
ArqueoCajaPage declara const [ventas] = useState<any[]>([]) y jamás carga ventas. Totales por método son cero; efectivo esperado es siempre el fondo fijo 1000. handleCerrarTurno registra localmente un éxito sin persistencia ni vinculación al cajero/turno por ID.
E13; tablas SQL cajas/movimientos_caja desconectadas.

### B04 — HIGH: recepción ficticia
OrdenesCompraPage.handleRecepcionTotal marca RECIBIDA y copia cantidades pedidas en recibidas. No POST de recepción, incremento de existencias ni modificación de costo.
Ejemplo: recibir 100 unidades a costo 80 después de costo vigente 100 no aumenta stock ni baja el costo a 80.
E02; Producto; migración operativa.

### B05 — HIGH: pérdida silenciosa de datos capturados
Foto, barcode, precio estimado y ubicación existen como estados de formulario de levantamiento, pero payload, DTO, servicio y modelo no los conservan. Tras “guardar y siguiente”, se limpian; recargar no puede recuperarlos.
El estado EN_PROGRESO se cambia localmente al guardar item, sin actualizar la sesión en servidor.
E04/E07; LevantamientoItem.

### B06 — HIGH: cajero puede administrar levantamientos por API
RolesGuard autoriza si no hay metadatos @Roles. LevantamientosController no declara ninguno, aunque frontend exige ADMIN/BODEGUERO. Un cajero autenticado de tenant con módulo habilitado puede crear, editar, finalizar y borrar levantamientos e items. ClientesController permite también eliminación sin rol; eliminar un cliente deja Venta.clienteId en null por onDelete:SetNull.
E04/E05/E09. La política precisa de altas/edición de clientes debe decidirse; el borrado y pérdida de vínculo sí requieren control administrativo.

### B07 — HIGH: permisos finos “guardados” solo en interfaz
UsuariosPage omite permisos, descuentoMaximo y sucursalActual del payload; actualiza estado local con lo seleccionado. Los DTOs y Usuario tampoco lo soportan. Al volver a cargar se reconstruyen defaults. Las restricciones backend son roles base, no esa configuración.
E05.

### B08 — HIGH: cambios de existencias sin movimiento ni autor
ProductosService.create/update escriben stockActual directamente, incluido sobreescribirlo con importación. No crean movimiento, motivo o identidad de modificador. Ventas tienen documento origen, pero no existe registro de movimientos integral ni saldo anterior/nuevo por operación.
Un PUT stock absoluto concurrente puede sobrescribir un decremento de venta que ya ocurrió.
E01/E08/E11; Producto y Venta.

### B09 — HIGH: migraciones y esquema divergentes
SQL de 20260930 crea proveedores, órdenes, cajas, garantías, apartados, transferencias, listas y auditoría soporte, pero schema.prisma no los representa y app.module no registra servicios. No deben duplicarse esas tablas sin inspeccionar la BD.
La primera migración versionada presupone tenants existente; la segunda presupone productos existente. El historial no crea un esquema base completo desde cero.
Documentación de producción informa numeración ejecutada manualmente y necesidad de reconciliar historial. start:prod ejecuta migrate deploy: sin baseline/reconciliación puede fallar.
E12; backend/package.json; backend/README.md; docs de customer-number y producción. No se confirmó qué migraciones están aplicadas hoy.

### B10 — HIGH: reportes de rotación incompletos
ReportesPage obtiene GET /ventas sin rango ni paginación; VentasService devuelve 50 registros por defecto. Con más ventas, “más vendidos”, ausencia de movimiento, resúmenes de método/cajero/cliente pueden ser incorrectos.
E10/E08. Corregir mediante agregaciones por rango en servidor, no simplemente aumentando el límite.

### B11 — HIGH: importación trunca existencias fraccionarias
ImportarProductosModal usa parseInt en stock y mínimo. 2.75 pasa a 2 y 0.5 a 0 antes de POST/PUT. Esto contradice Decimal(12,2) y afecta materiales por medida/peso.
E11; líneas 140/145. Los tests existentes no verifican que el parsing conserve ese stock fraccionario.

### B12 — MEDIUM: cierre de levantamiento no congela datos
Servicio createItem/updateItem/removeItem/update no condiciona por estado FINALIZADO ni versión. Puede alterarse o borrarse después de finalizar. Tampoco hay revisión/aprobación con historia.
E04. Ocultar un botón de finalizar no preserva inmutabilidad.

### B13 — MEDIUM: barcode y código ambiguos
codigoBarras tiene índice pero no unicidad por tenant; varios productos pueden compartirlo sin regla. codigo tiene unicidad sensible a mayúsculas; UI convierte a mayúsculas pero API solo trim. Una cadena de espacios puede pasar IsNotEmpty y volverse vacía después del trim. No hay reserva automática de códigos reconocibles.
E01. Deben definirse normalización y excepciones legítimas de múltiples presentaciones.

### B14 — HIGH: artefactos compilados desactualizados
backend/dist/ventas/ventas.service.js no contiene solicitudId, mientras src sí. start:prod ejecuta node dist/main después de migrar y no compila. Si el deploy no hace build previo, se ejecuta un servicio sin la idempotencia auditada en src.
Se inspeccionaron archivos dist remotos; no se infiere que producción actual los esté usando. Debe comprobarse pipeline y build del SHA.

### B15 — MEDIUM: requisitos móviles y QA antiguo
La nota de producción del 2 de octubre documenta carrito POS cortado en móvil y problemas de modales. No se reprodujeron en navegador en esta auditoría; deben validarse.
QA_REPORT y SYSTEM_ANALYSIS son históricos: varias conclusiones ya no describen main (sí hay DTO/guard; conversión descuenta totalMedida; soporte comienza readOnly). No deben reutilizarse como evidencia actual ni tomar cierres/mock como validados.

## 5. Riesgos de arquitectura y seguridad
- HIGH: autorización financiera incompleta y escrituras administrativas por endpoints con rol ausente, detalladas en B02/B06.
- HIGH: cuentas desactivadas, cambio de rol o suspensión del tenant no se revalidan por request en JwtStrategy; se confía en claims hasta expiración. Login/refresh sí comprueban estado. Política de revocación requiere definición e implementación.
- HIGH: UsuariosService usa una contraseña predeterminada fija cuando no se envía password. Debe sustituirse por alta/invitación segura, sin credencial compartida.
- HIGH: datos operativos en localStorage editables por el usuario y no compartidos entre dispositivos; no hay respaldo central ni autenticidad de aprobación/cierre.
- HIGH: divergencia schema/migraciones/dist; los tests de PostgreSQL construyen esquema desde Prisma y aplican numeración, no prueban toda la cadena histórica de migrate deploy.
- HIGH: ausencia de auditoría física/financiera integral; eventos administrativos y soporte no quedan durables. El token readOnly sí bloquea mutaciones en TenantGuard, pero logs/motivo viven en frontend.
- MEDIUM: dinero calculado con Number/Math.round y precisión fija de cantidades en Decimal(12,2), sin MaxDecimalPlaces equivalente en entradas. Definir política de redondeo y precisión por unidad.
- MEDIUM: modelo de autorización de módulos permite acceso si no existe TenantModule; frontend puede considerar módulo ausente deshabilitado. POS depende de módulo inventario para obtener precios. Conviene un contrato explícito de consulta comercial para cajero.
- MEDIUM: campos sensibles como precioCosto se devuelven en GET productos a cualquier usuario tenant autorizado al módulo; restringir la proyección si su consulta debe ser reservada al administrador.
- MEDIUM: metadata del árbol muestra .env.local y .env.vercel versionados. No se abrieron ni se reprodujeron valores; no se afirma que contengan secretos válidos. Verificar exposición y rotar solo si se confirma.
- MEDIUM: autenticación sin limitación de intentos visible; logs de login incluyen correo/identidad/tenant. Revisar rate limiting y política de logging.
- MEDIUM: auditoría no puede depender solo de current Producto.precioCosto; DetalleVenta no conserva costo vendido y cambios posteriores impiden utilidad histórica fiable.
- MEDIUM: varias relaciones llevan tenant solo en el padre; mantener validación de pertenencia de cada entidad vinculada y considerar invariantes relacionales para nuevas tablas. Las rutas principales revisadas sí validan productos/clientes/categorías antes de vincular.

## 6. Requerimientos documentados sin circuito contemplado
En la nota primaria: CxP, CxC/abonos, costos históricos y actualización desde reposición, entrega controlada, venta sin inventario, devoluciones integrales, alertas de deuda/facturas y operación offline completa.
En documentos complementarios: conciliación/aplicación de conteos, autor por item, control de concurrencia, zonas, reconteos, generación de SKU, fotos pendientes persistentes, presentaciones/equivalencias y exportación Excel/plantillas.
Garantías tienen prototipo local y tablas SQL aisladas: requieren conexión y definiciones de negocio. Integraciones bancarias y vidriería siguen deliberadamente fuera del piloto; no son bloqueos P0.

## 7. Lista priorizada de cambios necesarios
### CRITICAL
1. Convertir CRITICAL en criterio de salida antes de usar el sistema para el piloto: verificar baseline/historial/schema/build con una BD aislada, proteger respaldo y demostrar despliegue reproducible sin pérdida de datos. B09/B14.
2. Para piloto con inventario y caja reales, impedir confirmaciones exitosas de recepción/cierre que no afectan datos centrales; cerrar los circuitos de B03/B04/B08 antes de confiar en sus saldos.

No se confirmó un incidente de pérdida de producción ni una explotación; CRITICAL aquí clasifica el trabajo bloqueante de preparación del piloto, no un incidente demostrado.

### HIGH
3. Resolver permisos backend, clientes/levantamientos y política de descuento/precio; altas de usuario seguras y revocación de acceso. B02/B06/B07.
4. Kardex transaccional, ajustes con motivo/autor y precisión decimal; corregir importación. B08/B11.
5. Levantamiento inicial revisado, conciliado y aplicado explícitamente con idempotencia, sin perder campos. B05/B12.
6. Proveedores/compras/recepción e historial de costo; reposición reciente actualiza costo incluso a la baja; CxP y pagos.
7. Crédito exige cliente; CxC automática y abonos; transferencia manual como método inicial. B01.
8. Turnos/apertura/cierre real y entrega vinculada a venta. B03.
9. Venta sin inventario física explícita y ligada a compra/proveedor.
10. Rotación y reportes agregados por período/tenant; separar utilidad histórica de margen actual. B10.

### MEDIUM
11. Barcode/fabricante/código interno reconocible con normalización y resolución de ambigüedades; cámara en dispositivos compatibles. B13.
12. Fotos optimizadas y referencia persistente; revisión de artículos incompletos.
13. Devoluciones, garantías con reglas confirmadas y alertas operativas.
14. Multiusuario, zonas, reconteos, control de conflictos y offline idempotente.
15. Exportación independiente CSV/Excel, columnas y plantillas.
16. Responsive POS/formularios, observabilidad, limitación de intentos y validación de decimales.

### LOW
17. Investigación bancaria/POS automatizada y definición de vidriería después del piloto.
18. Mejoras de lenguaje/etiquetas y ergonomía posteriores a los bloqueos operativos.

## 8. Plan de implementación por fases (propuesta, sin ejecutar)
### Fase 0 — Base reproducible y contratos
Revisar esquema real e historial con consultas de lectura, fijar baseline y migraciones aditivas revisables; reproducir despliegue en BD aislada desde cero y desde base existente; compilar dist desde src del mismo SHA.
Definir matriz ADMIN/CAJERO/BODEGUERO, precio/costo/margen, temporalidad de “compra más reciente” (fecha efectiva vs registro y retroactividad), entrega/reserva, redondeo y tipos físico/especial.
Salida: respaldo/restauración probados, inventario de tablas existentes y pipeline coherente. Reutilizar SQL existente cuando corresponda, sin duplicar modelos.

### Fase 1 — Seguridad y evitar datos incorrectos
Enforce permisos y descuentos en API, proteger mutaciones de clientes/conteos, corregir importación decimal, revocación y alta de usuarios. Corregir campos omitidos y cierre del conteo. Evitar presentar como registrada una operación local.
Salida: pruebas HTTP con ADMIN/CAJERO, bypass directo denegado, precios/descuentos autorizados, 2.75 conservado e intento de tenant ajeno rechazado.

### Fase 2 — Inventario y levantamiento inicial
Crear libro de movimientos reutilizable por venta, conteo, compra, ajuste y devolución. Revisión/conciliación/preview y aplicar conteo explícitamente; no cambiar stock al finalizar; autor y registro anterior/nuevo. Vincular item-producto y resolver conflictos; proteger aplicación idempotente.
Salida: fallar una línea revierte todo; aplicar dos veces no duplica stock; ventas/conteos concurrentes no pierden movimientos; conservar conteo original y exportación.

### Fase 3 — Compras, proveedores, costos y CxP
Conectar proveedores/órdenes/facturas y recepciones parciales/totales. Registrar historial costo-proveedor-documento-fecha-cantidad. Incrementar stock y actualizar costo vigente en la misma transacción al costo de compra elegible más reciente, con bajas incluidas. Separar costo vigente de valoración de inventario; no inferir precio de venta de lotes históricos. Implementar saldo de proveedor/pagos/vencimientos.
Salida: compra 100 seguida de 80 deja vigente 80 y conserva ambas historias; reintento de recepción/pago no duplica; devolución/cancelación usa reversa auditable. El precio de venta sigue la política de margen/manual que se acuerde.

### Fase 4 — Venta, crédito, entrega y caja
Cliente elegido en POS, transferencia como método, documento contado/crédito, CxC y abonos; turnos/cierre vinculados a actor; entrega/control físico y venta especial sin inventario con vínculo comercial. Mantener idempotencia y transacciones existentes.
Salida: rechazar crédito anónimo; pago reduce saldo una sola vez; contado/transferencia/tarjeta cuadran por turno; especial suma ingresos sin tocar stock; física requiere venta registrada para despacho.

### Fase 5 — Identificación y uso móvil
Códigos internos legibles reservados sin colisiones, fabricante/SKU proveedor, lookup barcode exacto y búsqueda descriptiva. Scanner por teclado y cámara compatible con alternativa manual. Foto opcional comprimida en almacenamiento de objetos con referencia en BD e identificación pendiente; revisar POS responsive.
Salida: foto visible tras recarga y en otro dispositivo, barcode encuentra producto correcto, producto sin código externo puede contarse y venderse.

### Fase 6 — Control operativo y reportes
Devoluciones vinculadas al original con efectos trazables; garantías con condiciones definidas; alertas CxP/CxC/stock; reportes agregados backend, resumen diario y costos históricos de venta.
Salida: reintegro/daño/reembolso/deuda consistentes; más de 50 ventas reflejadas correctamente; reglas de garantía aprobadas.

### Fase 7 — Colaboración, offline y portabilidad
Versiones/concurrencia por item, zonas/progreso, reconteos preservados. IndexedDB/cola con estado online/offline, sincronización idempotente y resolución explícita; definir operaciones permitidas offline antes de habilitarlas. Excel y CSV con columnas/plantillas reutilizables.
Salida: dos dispositivos/reintentos/red intermitente no sobrescriben ni duplican; conflictos bloquean aplicación; exportar no elimina ni aplica el conteo.

### Fase 8 — Evolución posterior
Investigación bancaria/POS automatizada y decisión de vidriería/tenant/permisos una vez estabilizado el piloto.

### Estrategia para preservar funcionalidades existentes
Migraciones aditivas y backfill verificable; no ejecutar db push destructivo. Compatibilidad temporal de contratos al conectar módulos; lectura legacy revisada y exportación explícita de datos locales, sin mezclar demostraciones con operaciones reales. Flags por tenant para puesta en marcha gradual. Probar núcleo de ventas/cotizaciones existente, numeración clientes, aislamiento, concurrencia, reintentos y precisión en PostgreSQL aislado, además de flujos HTTP/frontend completos. Registrar cambios con actor/origen desde el inicio, sin duplicar servicios de stock o numeración.

La implementación queda pendiente de autorización del usuario.



### H7 — IDEAS_ARQUITECTURA_CONTINUIDAD_Y_SUCURSALES.md

# Lluvia de ideas: continuidad operativa, costos, celular y sucursales

Fecha: 5 de octubre de 2026.
Estado: PROPUESTA PARA ANALIZAR. No constituye una decisión de arquitectura ni una autorización para implementar o desplegar estas opciones.

## Necesidad del negocio

La ferretería es pequeña y cuenta con una computadora para caja y otra para administración. Actualmente se conectan por Wi-Fi a Internet. El negocio necesita seguir operando cuando falle Internet, mientras los equipos necesarios tengan energía. El dueño tiene interés en una aplicación en el celular para recibir notificaciones y atender autorizaciones importantes.

Se busca reducir pagos recurrentes por alojamiento y base de datos, evitar comprar otra máquina si los equipos actuales son suficientes y prever una futura sucursal.

## Punto de partida

Se conserva el sistema web existente, su backend y PostgreSQL. Una aplicación web también puede servirse dentro de una red local sin Internet: no requiere convertirse en aplicación de escritorio.

El PR #58 se integró en main mediante el commit 9704f5df9fbf74fb4fe0ba101e527f14a2b8cd4a. Contiene persistencia y mecanismos para evitar duplicación en reintentos. Eso no equivale a una operación offline completa ni a sincronización entre bases locales y nube.

Las pruebas técnicas aprobadas no sustituyen la aceptación del dueño con datos reales. La aplicación de migraciones y verificación productiva deben comprobarse por separado. Consultar también OPERACION_PILOTO_20261004.md y REQUISITOS_NEGOCIO_VALIDADO.md.

## Opciones de alojamiento

| Opción | Costo y ventajas | Continuidad | Limitaciones |
|---|---|---|---|
| Todo en la nube | Pago recurrente; acceso remoto sencillo | Sin Internet requiere desarrollar almacenamiento y sincronización offline | Dependencia del proveedor y conectividad |
| PC del administrador como servidor | Aprovecha equipo existente; PostgreSQL sin costo de licencia | Admin y caja operan mediante red local sin Internet | PC encendida, sin suspensión; reinicios y fallas afectan a ambos |
| PC del cajero como servidor | Aprovecha equipo existente | Caja local y admin por red interna | Fallos o reinicios del cajero afectan a ambos; compite con su trabajo |
| Mini PC dedicada | Compra inicial; separa servidor de equipos de uso diario | Operación por red local | Mantenimiento, respaldo y energía; capacidad por dimensionar |
| Servidor local con servicio pequeño en nube | Datos operativos locales; nube para funciones remotas | Operación local durante cortes; comunicación remota se reanuda al volver Internet | Sincronización adicional y costo recurrente por cotizar |

Orientación preliminar: evaluar primero la PC del administrador como servidor. No elegirla sin revisar capacidad, sistema operativo, horario y confiabilidad. Una mini PC puede incorporarse más adelante si la disponibilidad lo exige.

No colocar una base independiente en cada computadora sin diseñar previamente sincronización y resolución de conflictos. Para el primer local, una base compartida evita inventarios y saldos divergentes.

## Red y cortes de energía

- La red Wi-Fi local puede seguir funcionando sin Internet si el router continúa encendido y permite comunicación entre dispositivos. Verificar aislamiento de clientes, cobertura y estabilidad.
- Preferir cable para servidor y cajero cuando sea viable; Wi-Fi para dispositivos móviles.
- Mantener encendidos servidor, router y terminal de trabajo. Que una sola computadora siga encendida no garantiza el funcionamiento del conjunto.
- Evaluar UPS para servidor/router y caja. La autonomía es limitada y debe calcularse según consumo y duración de cortes.
- Para cortes largos, evaluar batería/inversor y apagado seguro.
- Configurar inicio automático, recuperación tras reinicio, suspensión deshabilitada durante operación y actualizaciones fuera de horario.
- Una UPS no sustituye los respaldos.

## Celular del dueño

Primera alternativa: PWA instalable para consultar información y atender autorizaciones. Evaluar app nativa si las funciones o dispositivos lo requieren; verificar soporte real de notificaciones en los celulares previstos.

Dos caminos posibles:

1. Acceso privado al servidor local mediante VPN, por ejemplo Tailscale. Evita exponer directamente PostgreSQL y puede reducir gasto recurrente. Revisar condiciones y precio del plan para uso comercial. Depende de Internet y servidor encendido; las notificaciones automáticas requieren diseño adicional.
2. Servicio pequeño en nube para resúmenes, solicitudes de autorización y notificaciones. Mantener local la base operativa completa. Cotizar alojamiento, almacenamiento y mensajería según uso; no asumir costo cero.

Durante un corte de Internet el dueño no puede recibir nuevas solicitudes ni autorizar remotamente. Definir qué operaciones se bloquean, cuáles admite un administrador presente y los límites de contingencia. Registrar autor, fecha, operación y resultado de cada autorización. Considerar vencimiento y evitar ejecutar dos veces una autorización.

Si el dueño quiere consultar fuera de horario, decidir entre mantener el servidor encendido o disponer de una copia de consulta en nube, mostrando cuándo se sincronizó por última vez.

## Preparación para futuras sucursales

Propuesta a estudiar:

- Una empresa puede contener varias sucursales; no confundir sucursal con tenant/empresa.
- Asociar inventario, cajas, ventas, compras y movimientos con la sucursal correspondiente.
- Cada sucursal debe poder operar localmente sin depender de la computadora de otra sucursal.
- Usar identificadores únicos, eventos o solicitudes persistentes y reintentos idempotentes para sincronización.
- Definir propiedad de datos, cambios de catálogo/precios, orden de eventos, conflictos y permisos antes de sincronizar bases.
- Registrar transferencias como envío y recepción, con existencias en tránsito y trazabilidad.
- No prometer stock consolidado actualizado durante desconexiones; mostrar fecha de sincronización.
- Evaluar un servicio central para consulta consolidada y autorizaciones al incorporar otra sucursal.

Preparar el modelo ahora puede reducir cambios posteriores. Implementar toda la sincronización multisucursal desde el inicio añade costo y complejidad; debe priorizarse según necesidad real.

## Respaldos y seguridad operativa

La base local elimina una cuota de base administrada, pero transfiere responsabilidades de mantenimiento al negocio.

Definir respaldos automáticos fuera del equipo servidor, retención, protección de datos y pruebas de restauración. Establecer cuántos datos se tolera perder y cuánto tiempo puede estar detenido el negocio. La sincronización por sí sola no es un respaldo: también puede propagar errores o borrados.

No exponer PostgreSQL directamente a Internet. Evaluar acceso remoto privado, HTTPS, autenticación, permisos, actualizaciones y custodia de credenciales según la alternativa elegida.

## Preguntas pendientes para decidir

- Especificaciones y sistema operativo de ambas computadoras.
- Disponibilidad de la PC del administrador durante y fuera de la jornada.
- Frecuencia y duración de cortes de Internet y luz.
- Modelo del router, comunicación local entre equipos y posibilidad de cableado.
- Presupuesto inicial y mensual; costo de UPS, respaldo, soporte y equipo dedicado.
- Celulares del dueño, necesidad de consulta fuera de horario y autorizaciones concretas.
- Reglas de contingencia cuando el dueño no responde.
- Plazo probable para segunda sucursal y necesidad de compartir catálogo, clientes y precios.
- Requisitos fiscales, impresión y comportamiento de la terminal de tarjetas sin Internet.

## Secuencia sugerida, pendiente de análisis

1. Revisar equipo, red, presupuesto y reglas del negocio.
2. Elegir arquitectura y documentar la decisión con sus costos y limitaciones.
3. Si se elige operación local: desplegar frontend/backend/PostgreSQL, configurar inicio y respaldos.
4. Probar desconexión de Internet, reinicios, recuperación de solicitudes y restauración de respaldo.
5. Validar con el cliente venta, compra, entrega, crédito, abono, devolución y cierre de caja.
6. Incorporar acceso del celular y luego notificaciones/autorizaciones según prioridad.
7. Diseñar e implementar sincronización multisucursal cuando se confirme el alcance.

Este documento registra la conversación para retomarla después. No se modificó la arquitectura, no se instalaron servidores y no se aplicaron cambios a producción como parte de esta documentación.
# Actualización del requisito móvil — 5 de octubre de 2026

El cliente confirmó app instalada con notificaciones push aunque esté cerrada, independiente de la sesión del navegador. Las alternativas web/PWA de esta lluvia de ideas se conservan como antecedentes; no completan ese requisito. Propuesta y límites actuales en `APP_MOVIL_Y_NOTIFICACIONES.md`. La base operativa puede seguir local.


### H8 — IDEAS_REVERSOS_Y_AUTORIZACIONES.md

# Idea: reversos con autorización administrativa

Fecha: 5 de octubre de 2026.
Estado: propuesta pendiente de definición e implementación.
Complementa RECUPERACION_USABILIDAD_Y_PRIORIDADES_20261005.md y las ideas de acceso móvil y continuidad.

## Necesidad expresada

Permitir reversar transacciones por error u otra causa válida con autorización del administrador, mediante clave local o solicitud remota. Presentar un flujo sencillo para personas con poca experiencia en computación.

## Flujo propuesto

1. Buscar la operación y seleccionar “Solicitar reverso”.
2. Mostrar documento, importe, efectos previstos y motivo obligatorio.
3. Un administrador autoriza localmente con su propia credencial/PIN de autorización, o recibe una solicitud remota vinculada a esa operación.
4. El servidor vuelve a validar permisos, vigencia y estado de la operación, y aplica el reverso una sola vez.
5. Mostrar comprobante del reverso y conservar relación con el documento original.

La autorización remota debería mostrar documento, sucursal, solicitante, motivo, importe y consecuencias. Debe permitir aprobar o rechazar, tener vencimiento y quedar vinculada a un alcance concreto. Si los datos relevantes cambian, revisar o renovar autorización.

## Reglas por definir

- Diferenciar borrador cancelado, venta registrada anulada, devolución y corrección administrativa. No son necesariamente la misma operación.
- Conservar el original y registrar una operación compensatoria; no borrar historial.
- Registrar solicitante, administrador autorizante, fecha, motivo y documento original.
- Validar en backend; ocultar un botón no constituye autorización.
- Evitar clave administrativa compartida. Evaluar credencial individual o PIN individual con protección contra intentos, almacenamiento seguro y reautenticación.
- Un cajero no debería adquirir una sesión administrativa general por obtener autorización para un reverso.
- Impedir uso repetido de autorización y duplicación tras respuesta perdida o apagón.
- Tratar venta, reservas/stock, caja, crédito y auditoría de manera coherente y transaccional.
- No devolver stock si la mercancía no regresó o no es vendible.
- Diferenciar reverso de registro y devolución física de dinero: una terminal bancaria puede requerir su propio procedimiento; no afirmar que reversar aquí revierte automáticamente un cobro bancario.
- Definir restricciones para caja ya cerrada, documentos fiscales emitidos, ventas históricas y operaciones con movimientos posteriores.
- Compras recibidas, pagos, abonos y aplicaciones de inventario requieren reglas específicas; no implementar un botón universal que ignore operaciones dependientes.
- Definir reversos parciales/totales, límites de importe y qué roles pueden solicitarlos.
- Mostrar claramente cuándo falta autorización o no se pudo comprobar el resultado.

## Sin Internet y recuperación

Si se elige servidor local y la red interna funciona, un administrador presente podría autorizar localmente. La autorización remota necesita conexión; si no existe, la solicitud queda pendiente y no se interpreta como aprobada.

Después de una interrupción, consultar el estado del reverso/autorización y recuperar la misma operación. No ejecutar otra compensación con identificador nuevo sin verificar la anterior.

## Estado conocido y prioridad

El sistema ya tiene devoluciones con efectos en inventario, caja/crédito e idempotencia según OPERACION_PILOTO_20261004.md. Esto no acredita un flujo genérico de reversos con autorización local o remota; debe revisarse el alcance existente antes de reutilizarlo.

Prioridad sugerida:
- Antes del piloto: definir y cubrir correcciones esenciales de ventas/cobros, con autorización administrativa local y auditoría, según necesidades del negocio.
- Después, o antes si el dueño lo exige: autorización remota integrada con el celular y reglas de contingencia.
- Ampliar a compras, pagos y otras operaciones solo con dependencias y políticas definidas.

## Preguntas y criterios de aceptación

Confirmar con el dueño qué operaciones pueden reversarse, plazo, motivo, tratamiento de efectivo/tarjeta/crédito, cajas cerradas y documentos fiscales.

Probar permisos, rechazo/vencimiento, credencial incorrecta, doble clic, concurrencia, cambios después de autorización, respuesta perdida y reinicio. Verificar que original y reverso sigan visibles, que dinero/stock/saldos cuadren y que no se ejecuten compensaciones duplicadas.

Esta incorporación documenta la idea; no implementa reversos ni modifica datos productivos.


### H9 — INSTALACION_LOCAL_Y_CONTINUIDAD.md

# Instalación local y continuidad sin Internet

Paquete preparado en `deploy/local/compose.yaml`, para revisión antes de instalar en la ferretería. No se ejecutó en equipos ni datos reales del cliente.

## Arquitectura inicial de menor costo

Una PC existente puede alojar PostgreSQL, backend y frontend mediante Docker Compose. La caja, los dos administradores y el teléfono acceden al mismo servidor por HTTPS en la red local. No se necesita una base de datos de pago en nube para operar dentro del local.

El servidor y el router deben permanecer encendidos. Sin Internet, las ventas siguen funcionando si esa PC y la red local funcionan. El Wi-Fi local normalmente puede seguir conectando equipos aunque falle la conexión del proveedor; comprobarlo con el router real. Si se apaga el servidor, los otros equipos deben esperar su recuperación. No se implementa cola offline independiente en cada caja.

Recomendación para revisar: PC del administrador con capacidad suficiente, SSD y al menos 8 GB RAM, IP reservada en router y UPS para servidor/router. Confirmar sistema operativo, virtualización/Docker, recursos y licencias antes de instalar. En Windows, Docker Desktop debe iniciar automáticamente y ejecutarse antes de usar caja; no se verificó arranque desatendido sin login en Windows. Linux con Docker habilitado al arrancar es otra opción. Evitar suspensión automática durante operación.

## Servicios y almacenamiento

- PostgreSQL 17 persistente en un volumen. La aplicación usa un usuario propietario sin privilegios de superusuario; el administrador del clúster tiene otra contraseña.
- Backend compila desde fuentes, genera Prisma y aplica el despliegue con comprobación de historial. Reinicia tras fallos; no ejecuta seed demo.
- Frontend sirve archivos locales y la API bajo el mismo origen `/api`. Caddy emite certificados de su CA interna, conserva esa CA en volumen y publica solo 80/443. PostgreSQL/backend no publican puertos al host.
- Respaldo cada seis horas mediante `pg_dump`, checksum y manifiesto. No borra respaldos automáticamente. Se guarda fuera del repositorio y el administrador ve estado/fallo/antigüedad desde Inicio. El estado identifica la copia exacta del programador y consulta su evidencia de restauración; un archivo generado no equivale a restauración comprobada.

La descarga de imágenes/dependencias necesita Internet durante la instalación/actualización. La operación posterior usa los servicios locales. Si el servidor tiene proxy HTTP, NO_PROXY excluye los servicios internos; las conexiones externas conservan su configuración de proxy. Tipografías web externas pueden no cargar sin Internet; hay fuentes de reserva. No se añade caché offline de transacciones ni de respuestas privadas.

## Preparar configuración privada

Con Node instalado, desde el repositorio:

```sh
node deploy/local/prepare.mjs /ruta/privada/ferresystem ferresystem.lan correo-admin@ejemplo.com "Nombre de la ferretería"
```

El destino debe ser nuevo y estar fuera del repositorio. Se generan contraseñas aleatorias, JWT y `local.env`; no se imprimen secretos ni se sobrescriben archivos existentes. Guardar la contraseña inicial de `secrets/initial_admin_password` en un gestor de contraseñas por un canal privado. En Windows usar una ruta externa privada y configurar sus ACL: los permisos POSIX no sustituyen los permisos de Windows.

Configurar resolución del nombre `ferresystem.lan` a la IP fija del servidor en el router o archivos hosts de cada equipo. El nombre debe coincidir con FERRE_HOST. Confirmar reglas de firewall solo para la red del local; no reenviar esos puertos desde Internet.

## Arranque e instalación inicial

```sh
docker compose --env-file /ruta/privada/ferresystem/local.env -f deploy/local/compose.yaml build
docker compose --env-file /ruta/privada/ferresystem/local.env -f deploy/local/compose.yaml up -d --wait
docker compose --env-file /ruta/privada/ferresystem/local.env -f deploy/local/compose.yaml run --rm --no-deps backend node scripts/provision-local.mjs
```

El alta inicial crea una empresa y un ADMIN, sin productos/clientes ficticios. Si ya hay empresa/usuarios, se bloquea y no cambia contraseñas ni datos. Crear el segundo administrador y cajero desde Usuarios; no compartir la cuenta inicial. Hacer el primer respaldo después de completar esa configuración:

```sh
docker compose --env-file /ruta/privada/ferresystem/local.env -f deploy/local/compose.yaml exec backups node scripts/container-entry.mjs node scripts/backup-preflight.mjs /backups
```

El servicio programado sigue su intervalo. Una ejecución manual genera su propio manifiesto; el estado de Inicio corresponde al último intento del programador. `exec` inicia un proceso nuevo y necesita el envoltorio `container-entry.mjs` para cargar la conexión privada; `run` lo aplica automáticamente. Respaldos concurrentes usan carpetas distintas. Revisar espacio libre/retención y programar copia fuera de ese disco; el paquete no protege frente a pérdida física del servidor si todas las copias quedan ahí.

## HTTPS y acceso de caja/celular

Extraer el certificado **público** de la CA local (nunca su clave privada):

```sh
docker compose --env-file /ruta/privada/ferresystem/local.env -f deploy/local/compose.yaml cp web:/data/caddy/pki/authorities/local/root.crt /ruta/privada/ferresystem/ca-publica.crt
```

Instalar confianza en esa CA en caja, administración y teléfonos autorizados según su sistema operativo. Acceder a `https://ferresystem.lan`. Verificar cadena/nombre; no desactivar validación TLS ni acostumbrar al usuario a ignorar alertas del certificado. Cámara/instalación móvil requieren contexto seguro.

La web incluye manifiesto para acceso desde la pantalla de inicio. Todavía no hay app nativa ni notificaciones push. Fuera de la red local, considerar VPN administrada; no abrir PostgreSQL ni cambiar la protección de autorizaciones.

## Copia existente, actualización y recuperación

El alta inicial no importa ni adopta datos de otra instalación. Seguir `INSTALACION_Y_ACTUALIZACION_SEGURA.md`: respaldo/restauración aislada, inspección de historial y adopción explícita si corresponde. No arrancar sobre un volumen productivo desconocido ni usar reset/db push.

No usar `docker compose down -v` en operación: elimina los volúmenes de base/certificados. Los secretos originales deben conservarse junto con la documentación privada; reemplazar una contraseña en el archivo no actualiza automáticamente el usuario de una base ya creada.

Ante corte: recuperar energía/red, dejar que el servidor arranque y PostgreSQL termine su recuperación; verificar `/api/health`; ingresar con la misma cuenta y consultar pendientes del POS/devoluciones antes de repetir cobros o entregar. Confirmar físicamente los pagos. Probar restauración a una base distinta y conciliar datos antes de ponerla en servicio.

## Pendientes de instalación real

Copia real de la base, hardware/OS, router/DNS/firewall, UPS, certificados en dispositivos reales, lector/impresora, respaldo en otro disco/equipo, política de retención y responsable de mantenimiento. La configuración sola no garantiza continuidad eléctrica ni aceptación de los usuarios.


### H10 — INSTALACION_Y_ACTUALIZACION_SEGURA.md

# Instalación nueva, actualización y adopción de una base existente

Fecha: 5 de octubre de 2026. Preparado en codex/recuperacion-ventas / PR #59.

## Cambio realizado

Se agregó 20260925000000_initial_core antes de las cuatro migraciones históricas. El snapshot prisma/baseline.prisma reconstruye el núcleo a partir del esquema histórico de pruebas, excluyendo levantamientos y numeración posterior. No genera el cliente actual. Las migraciones ya existentes se conservan sin cambiar sus archivos ni checksums.

migrate:deploy y start:prod usan ahora migration-safe.mjs. En una base nueva ejecutan toda la cadena. En una base existente sin baseline, con migraciones fallidas/desconocidas, checksums cambiados, huecos, tablas históricas ausentes o trigger de numeración ausente, bloquean el despliegue. No intentan arreglar datos, borrar tablas ni adivinar qué SQL se ejecutó.

**Antes de desplegar este cambio en un servidor existente, realizar la inspección y la adopción si corresponde.** El inicio productivo se detendrá ante un historial incompatible en lugar de aplicar la migración inicial sobre tablas existentes. La adopción se ejecuta aparte, nunca automáticamente durante el inicio.

## Conexiones y requisitos

Node 24, dependencias backend y herramientas PostgreSQL compatibles. Prisma usa DIRECT_URL, o DATABASE_URL si DIRECT_URL no está definida. Configurarlas explícitamente con el gestor de secretos del entorno; el procedimiento no imprime sus valores. Se admite PostgreSQL en el esquema public. Conexión directa, permisos adecuados y TLS verificable según proveedor.

El respaldo usa PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSFILE o PGSERVICE. La restauración usa FERRE_RESTORE_DATABASE_URL, y la comparación histórica FERRE_REFERENCE_DATABASE_URL. Son destinos distintos con propósitos distintos; no reutilizar producción como destino de restauración ni como referencia. No poner contraseñas en Git ni en argumentos del shell.

## 1. Base nueva y vacía

Desde backend, con una base nueva creada por el administrador:

```sh
npm ci
npx prisma generate
npm run migrate:inspect
npm run migrate:deploy
npm run build
```

La inspección debe indicar VACIA y el despliegue terminar en LISTA con pending vacío. La segunda ejecución no debe volver a crear tablas ni numerar clientes. No se ejecuta seed de demostración automáticamente. Configurar la cuenta inicial y el tenant mediante el procedimiento administrativo correspondiente; no usar usuarios/contraseñas ficticios para operación real.

## 2. Base existente: inspección antes de actualización

```sh
npm run migrate:inspect
```

La inspección es de solo lectura. Resultados:

| Estado | Acción |
|---|---|
| VACIA | Instalar toda la cadena en esa base nueva |
| LISTA | Historial comprobado; revisar respaldo, ensayo en copia y migraciones pendientes antes de deploy |
| REQUIERE_BASELINE | No desplegar todavía; comprobar qué etapa representa el esquema y adoptar explícitamente |
| BLOQUEADA | Resolver la causa con revisión técnica; no usar reset/db push ni marcar migraciones a ciegas |

LISTA comprueba historial y algunas estructuras críticas; no certifica ausencia de todo drift, datos correctos ni aceptación del negocio. El diagnóstico del respaldo revisa stock negativo, códigos duplicados, cajas abiertas y saldos. Conciliar con el dueño antes del piloto.

## 3. Respaldo y restauración verificada

En una ventana de mantenimiento, suspender operaciones y cambios de esquema; conservar también una copia fuera del equipo:

```sh
PGSERVICE=ferresystem_backup node scripts/backup-preflight.mjs /ruta/privada/respaldos
```

Obtener la carpeta creada con database.dump, preflight.txt y manifest.json. El manifiesto empieza con restoreTested false.

Crear otra base vacía y configurar FERRE_RESTORE_DATABASE_URL para ella; después:

```sh
npm run backup:verify-restore -- /ruta/privada/respaldos/CARPETA/manifest.json
```

La herramienta verifica checksum, rechaza destino ocupado y ejecuta pg_restore con parada ante error. Comprueba lectura y cantidades de tablas del núcleo y actualiza el manifiesto únicamente tras completar esa restauración. Una restauración parcial requiere otra base vacía; no reintentar sobre datos existentes. Revisar en esa copia ventas, inventario, caja, crédito y usuarios con la aplicación. La restauración no ejecuta lógica del negocio ni notificaciones, pero la copia debe permanecer aislada.

La evidencia técnica de restauración no prueba que el respaldo sea el más reciente ni que corresponda al destino seleccionado. El operador debe verificar origen, hora, pausa operativa y conciliación. No modificar restoreTested manualmente. Mantener manifiesto y dump privados juntos; la herramienta no reemplaza programación de respaldos, retención ni cifrado externo.

## 4. Adopción histórica explícita

Aplicar primero sobre una copia restaurada, no sobre producción. Seleccionar --through como la última migración cuyo efecto ya está en la base. No seleccionar automáticamente la última del repositorio.

Crear una tercera base vacía, desechable, y configurar FERRE_REFERENCE_DATABASE_URL para ella. El comando construye ahí la cadena desde la inicial hasta --through, compara ambos esquemas con Prisma y compara por separado funciones, triggers, restricciones CHECK/FK/PK y políticas RLS. Si difieren, no marca ninguna migración en el destino.

Ejemplo de una base que ya contiene todos los cambios hasta operaciones del 4 de octubre:

```sh
npm run migrate:adopt -- --through 20261004000000_operacion_ferreteria --backup-manifest /ruta/privada/respaldos/CARPETA/manifest.json
npm run migrate:inspect
```

Para una base anterior, elegir su etapa real. La herramienta exige respaldo con checksum coincidente y restauración probada; únicamente registra con migrate resolve las migraciones del prefijo que faltan en el historial. No vuelve a ejecutar su SQL sobre datos existentes. Si ya había historial de las cuatro migraciones, conserva sus checksums y registra solo la inicial.

Si la adopción se interrumpe después de registrar parte del prefijo, el historial puede necesitar revisión: inspeccionar y retomar con otra referencia vacía; no forzar deploy. La referencia queda poblada para inspección; el comando no elimina bases. Una comparación bloqueada requiere revisión de diferencias y ensayo dirigido, no ignorarlas. Extensiones, cambios propios del proveedor o SQL fuera de la cadena pueden exigir un plan específico.

## 5. Actualización y salida del mantenimiento

Después del ensayo sobre copia y la conciliación, repetir el procedimiento aplicable en el destino real, con respaldo actualizado y sin operaciones concurrentes. Después de la adopción:

```sh
npm run migrate:deploy
npm run build
npm run start:prod
```

Verificar pending vacío, API iniciada, permisos, apertura de caja, compra/recepción, contado/crédito, entrega, abono, devolución y cierre. Desplegar frontend compatible con backend. Conservar el respaldo previo; no asumir que volver a una versión antigua de código revierte una migración. Si hay una falla, no resetear: diagnosticar y decidir corrección o recuperación desde respaldo según el estado observado.

## Pruebas y pendientes reales

Pruebas PostgreSQL aisladas cubren instalación completa, segunda ejecución, cliente previo conservado y numerado, adopción de SQL sin historial, historial con baseline faltante, rechazo de drift, trigger ausente, checksum distinto, migración incompleta, huecos y restauración a destino ocupado.

No se consultó ni modificó producción: el entorno sigue sin credenciales productivas configuradas. La arquitectura local/nube, el equipo, las UPS, el alta productiva inicial y la aceptación del cajero siguen pendientes. Estas herramientas preparan ambos alojamientos; no cambian tenant ni introducen sucursales o sincronización.


### H11 — OPERACION_PILOTO_20261004.md

# Operación de FerreSystem — 4 de octubre de 2026

Fuente de negocio: `REQUISITOS_NEGOCIO_VALIDADO.md` y las anotaciones de levantamiento de main. Base revisada: `84e61ec161455d46c2786791e6422178477ac886`. El diagnóstico anterior a cambios está en `DIAGNOSTICO_MAIN_20261004.md`.

## Resultado y alcance

Se priorizó inventario, compras, venta, entrega, caja y crédito. Las operaciones nuevas se persisten en PostgreSQL. El almacenamiento del navegador conserva únicamente solicitudes pendientes para recuperar respuestas perdidas; no sustituye la persistencia del negocio. Los comprobantes de venta solo se muestran después de confirmación del servidor.

Trabajo disponible en `codex/operacion-ferreteria`, PR #58. No se ejecutaron migraciones en producción, no se modificaron sus datos y main conserva la base original. El entorno de esta tarea no dispone de credenciales de Render ni de la base productiva.

## Matriz posterior a los cambios

| Requerimiento | Estado | Frontend | Backend | Base de datos | Evidencia | Qué falta |
|---|---|---|---|---|---|---|
| Inventario inicial: conteo, revisión y aplicación separada | IMPLEMENTADO | LevantamientoPage, captura completa, CSV/Excel, vista previa y aplicación administrativa | LevantamientosService: finalización no modifica stock; versión y token contra cambios concurrentes | Levantamiento/Item: costos, precio, margen, barcode, zona, versión, responsable y aplicación | Integración PostgreSQL: conservar datos y aplicar una sola vez; unitarias: cierre y conflictos | Validación con el conteo real del local |
| Venta registrada antes de entrega física | IMPLEMENTADO | POS y Entregas | Venta reserva; entrega descuenta físico y libera reserva; reintentos no duplican salida | Producto.stockReservado; Venta.reservaPendiente; MovimientoInventario | Integración de sobreventa, entregas concurrentes y cancelación parcial | Entregas parciales, si posteriormente las pide el dueño |
| Costo vigente según última reposición, incluso inferior | IMPLEMENTADO | Compras e historial en Inventario | Recepción actualiza costo vigente, conserva proveedor/factura/cantidad/fecha; no usa valoración de lotes | RecepcionCompra, CostoCompra, Producto.ultimaCompraAt | Integración: costos 12 y después 3 de dos proveedores; recepción repetida no duplica | Revisar datos históricos antes del piloto |
| Margen y precio propios de cada producto | IMPLEMENTADO | Administración de producto y levantamiento | Validación de valores y auditoría de cambios | Producto.margen/precioVenta/precioCosto | Esquema validado y compilación; captura aplicada en PostgreSQL | No se inventó una fórmula automática de precio; costo nuevo no cambia por sí solo el precio de venta |
| Proveedores, facturas, vencimientos, saldo y pagos | IMPLEMENTADO | Compras, Cuentas y reportes | Compra crea CXP; recepción parcial valida pendientes; pago reduce saldo; efectivo insuficiente se rechaza | Proveedor, OrdenCompra/Detalle, CuentaOperativa, PagoCuenta | Integración de compras, CXP, recepciones y aislamiento | Conciliar saldos anteriores; no importar saldos ficticios desde demostraciones |
| Efectivo, transferencia y tarjeta; cierre por usuario | IMPLEMENTADO | Caja real; selección de métodos en POS | Caja obligatoria para cobros/pagos; apertura única, cierre y diferencia; transferencia no aumenta efectivo | Caja, MovimientoCaja, Venta.cajaId, MetodoPago | Integración: transferencia, cierre, reintentos y bloqueo de nueva venta tras cerrar | Prueba operativa con el cajero y terminal física; sin integración bancaria |
| Crédito solo a cliente registrado, con abonos e historial | IMPLEMENTADO | Selector de clientes, vencimiento, Cuentas | Cliente del tenant obligatorio; crédito crea CXC; pagos idempotentes y límite de saldo | Cliente, Venta, CuentaOperativa, PagoCuenta | Integración: crédito sin cliente rechazado; abono repetido único y saldo correcto | Conciliación de ventas a crédito anteriores sin cuenta real |
| Administrador/Cajero y permisos en backend | IMPLEMENTADO | Permisos y límite de descuento persistidos; controles de acceso | JWT consulta usuario activo y rol vigente; RolesGuard; cajero no modifica costos, ajustes ni CXP; descuento y precio verificados al vender | Usuario.permisos, permisosConfigurados, descuentoMaximo | HTTP contra API compilada: costos/ajustes/usuarios/CXP rechazados; permisos revocados y usuario inactivo efectivos con token anterior | Revisar permisos de las cuentas reales antes de abrir el piloto |
| Auditoría de dinero, stock y usuarios | IMPLEMENTADO | Auditoría y movimientos por producto | Escrituras y auditoría en la misma transacción; desactivación conserva usuario/historial; último administrador protegido | AuditoriaOperacion, MovimientoInventario, MovimientoCaja | Integración de movimientos, caja y reversiones; endpoint administrativo paginado | Exportación y filtros avanzados posteriores |
| Barcode, fabricante, código interno y búsqueda textual | IMPLEMENTADO | POS busca nombre, descripción y códigos; Enter de lector agrega coincidencia única; variante visible | Búsqueda real y comprobación de colisiones; códigos internos generados bajo bloqueo por empresa | Producto.codigo/codigoBarras/codigoFabricante | Backend compilado; integración de productos y frontend POS | Prueba con el lector físico del cliente |
| Cámara para leer códigos | PARCIAL | BarcodeScanner en POS y conteo; libera cámara al cerrar o cambiar estado | Usa catálogo/guardado reales del sistema | Persistencia del producto/conteo existente | Compilación y flujo de código; API nativa del navegador | Validación en el celular real; navegadores sin BarcodeDetector requieren lector o búsqueda |
| Fotografías opcionales optimizadas y fuera de la base de datos | PARCIAL | Edición de URL HTTPS; imagen opcional en POS | URL validada; no guarda base64 ni binarios | Solo Producto.imagenUrl | Código y esquema; no se simula un servicio de archivos | Subida/captura, compresión y almacenamiento externo duradero configurado; no se afirmó tenerlos |
| Venta sin inventario físico | IMPLEMENTADO | Opción explícita en POS, proveedor obligatorio | No reserva ni descuenta físico; registra ingreso/caja/cliente; valida vínculo opcional de compra | DetalleVenta.sinInventario/proveedorId/ordenCompraId; Venta y caja | Integración: vender más que stock físico no lo cambia ni crea salida | Selector de compra en POS; API ya permite el vínculo |
| Devolución con efectos en venta, físico, caja y crédito | PARCIAL | Devoluciones busca documento, cantidades y destino | Máximo vendido pendiente; reembolso proporcional; cancela crédito primero; devuelve solo mercancía vendible o libera reserva; idempotencia | Devolucion, DetalleDevolucion, cuenta, caja y movimientos | Integración: devolución entregada, cancelación no entregada y crédito con abonos | Política exacta y efecto en garantías; comprobante fiscal de devolución |
| Garantía: condiciones, vigencia y responsable | NO IMPLEMENTADO | El prototipo está señalado como pendiente | No se inventaron reglas pendientes de levantar con el dueño | Tabla histórica no equivale a flujo implementado | Notas del cliente, sección 10 | Levantar política y conectar garantía con venta/producto/devolución |
| Alertas de stock y vencimientos | IMPLEMENTADO | Reportes de datos reales y cuentas vencidas | Consulta sin límite oculto de 50 ventas; considera disponible físico menos reservado y devoluciones | Cuentas, productos, ventas y devoluciones | Consultas del módulo Operaciones y build | Avisos automáticos fuera de la pantalla y canales, si se requieren |
| Operación desde otra PC/celular y continuidad sin Internet | PARCIAL | Web y recuperación de solicitudes pendientes de POS, conteo, compra y pago | UUID/hash y transacciones evitan duplicidad al confirmar reintentos | La confirmación se realiza siempre en PostgreSQL | Prueba frontend de respuesta perdida/reload; integración de operaciones concurrentes | Cola offline completa, catálogo offline y sincronización; no se autoriza entregar una solicitud sin venta confirmada |
| Vidriería/ventanas e integración bancaria/POS | NO IMPLEMENTADO | Sin cambios de alcance | El cliente las dejó posteriores al piloto | Sin nuevas integraciones inventadas | Notas P2 | Investigación después de estabilizar ferretería |

## Reglas operativas concretas

1. Abrir la caja propia con el efectivo inicial real.
2. Administrador registra proveedores y facturas. Registrar la factura crea deuda; recibir mercancía registra ingreso físico y cambia el costo vigente, aunque baje. Los pagos se realizan desde Cuentas.
3. Cajero consulta el catálogo del POS. Puede actualizar catálogo y precios del carrito, y debe revisar el total antes de cobrar. Si el precio cambió, el servidor rechaza el precio anterior.
4. Registrar venta y obtener confirmación del servidor. Para crédito, seleccionar un cliente registrado. Las mercancías físicas quedan reservadas y no pueden venderse otra vez.
5. Confirmar entrega desde Entregas. Solo entonces se reduce el inventario físico. Las ventas históricas no se vuelven a descontar: `reservaPendiente` es falso por defecto.
6. “Venta sin inventario” se usa para mercancía que nunca entra al local. Si llega físicamente, debe recibirse como compra.
7. Administrador registra devolución sobre la venta original. NO_ENTREGADO libera reserva; INVENTARIO reintegra mercancía entregada vendible; DAÑADO/PROVEEDOR conservan destino sin aumentar existencias vendibles. Crédito se cancela primero; dinero pagado se reembolsa. Una venta histórica a crédito sin cuenta debe conciliarse antes.
8. Cerrar la caja con efectivo contado; el sistema conserva esperado, contado y diferencia. La caja es parte del núcleo operativo del POS.
9. Ante respuesta perdida, usar “Confirmar pendiente”. No registrar de nuevo con otra identidad ni entregar mientras la venta no esté confirmada.

Los módulos de apartados, garantías, listas de precio, transferencias y pedidos especiales que antes escribían demostraciones locales no se presentan como operaciones reales. Sus fuentes y datos locales previos se conservan. La venta especial operativa está en POS. No se migraron esos datos locales a saldos o inventario.

## Verificación

GitHub Actions valida Prisma y genera cliente; ejecuta compilación frontend/backend, 15 pruebas frontend, 52 pruebas unitarias/HTTP backend y 28 pruebas con PostgreSQL real aislado. La integración parte del esquema de main, reproduce migración histórica operativa y numeración, y aplica la migración nueva. Inicia además la API compilada en modo producción contra esa base aislada y prueba permisos con JWT real. No usa DATABASE_URL productiva.

Ejecución completada para `0a08ea07adb0f89c6e09e807050548fb8bbcab91`: https://github.com/Nelosama/FerreSystem/actions/runs/37215414257 . Los ajustes finales se vuelven a comprobar en el último commit del PR. No se ha probado físicamente cámara/lector/impresora ni se ha ejecutado un piloto con datos reales.

## Pendientes priorizados y fases

### Fase 1 — Activación del piloto

**CRITICAL**: respaldo y comprobación del estado real de migraciones en Render/PostgreSQL; resolver baseline existente antes de `prisma migrate deploy`. El repositorio tiene historia SQL adicional a Prisma; no usar `db push`, reset o migraciones destructivas para hacerla coincidir. Revisar cajas abiertas duplicadas por usuario, códigos/barcodes repetidos, stock histórico negativo, ventas a crédito y saldos reales anteriores. Conciliar con el dueño, sin inventar que una deuda sigue pendiente.

**CRITICAL**: aplicar `20261004000000_operacion_ferreteria` primero sobre copia del dato real, validar permisos de administrador/cajero y desplegar frontend/backend juntos. Recompilar desde fuentes; no ejecutar los directorios dist antiguos versionados. Abrir turno, comprar y recibir un producto a costo mayor y menor, vender de contado/crédito, entregar, abonar, devolver y cerrar. Validar reservas físicas y diferencia de caja antes de usar el sistema para todo el local. No se ejecutó esta fase sobre producción por falta de acceso productivo en esta sesión.

### Fase 2 — Completar control operativo

**HIGH**: garantías y su efecto con devoluciones, usando condiciones confirmadas por el dueño. **HIGH**: fotos con compresión y almacenamiento externo duradero; validar lector/cámara e impresión reales. **HIGH**: offline con cola persistente, catálogo y conciliación de conflictos, conservando prohibición de entregar ventas no confirmadas.

**MEDIUM**: selector de compra para venta especial, filtros por documento/usuario/fecha en auditoría, exportaciones financieras y entrega parcial si se solicita. **MEDIUM**: unificar fechas de negocio según zona horaria del local; reportes actuales identifican su rango en UTC. **MEDIUM**: revisar y actualizar dependencias con vulnerabilidades detectadas por npm audit, sin aplicar cambios mayores a ciegas. La instalación actual reporta vulnerabilidades preexistentes; el pase de pruebas no las elimina.

### Fase 3 — Extensiones posteriores

**LOW**: explorar integraciones bancarias/POS y unidad de vidriería. Reimplementar módulos de demostración solo cuando se confirme su alcance y su persistencia real. Medir desempeño antes de sustituir el bloqueo transaccional por empresa con una estrategia más granular.

No se requiere una nueva autorización rutinaria para seguir trabajando: el usuario autorizó este trabajo y sus siguientes pasos. El acceso al entorno productivo y las reglas de garantía pendientes son información que aún no está disponible, no una autorización repetida.


### H12 — PENDIENTES_LEVANTAMIENTO_INVENTARIO.md

# Pendientes — Levantamiento de Inventario

## Objetivo

Convertir el módulo de levantamiento de inventario en una herramienta práctica para digitalizar desde cero el inventario físico de una ferretería, incluyendo trabajo colaborativo, operación sin conexión y aplicación controlada al inventario real.

## 1. Aplicar levantamiento al inventario real

### Estado actual
Al finalizar un levantamiento, el sistema cambia su estado a `FINALIZADO`, pero no convierte automáticamente los registros capturados en productos ni actualiza las existencias del inventario.

### Pendiente
Implementar un flujo separado y explícito:

**Levantamiento → Revisión → Conciliación → Aplicar al inventario**

- Agregar una acción independiente: **Aplicar al inventario**.
- No modificar existencias reales únicamente por marcar un levantamiento como `FINALIZADO`.
- Mostrar una vista previa antes de aplicar cambios.
- Si el producto ya existe, permitir conciliar/actualizar su existencia.
- Si no existe, permitir crear el producto completando los datos faltantes.
- Identificar registros incompletos o con conflictos antes de aplicar.
- Ejecutar la aplicación al inventario de forma transaccional para evitar cargas parciales.
- Registrar quién aplicó el levantamiento y cuándo.

## 2. Levantamiento multiusuario simultáneo

Permitir que varias personas trabajen sobre un mismo levantamiento desde diferentes dispositivos.

### Requisitos
- Registrar el usuario que capturó o modificó cada artículo.
- Registrar fecha/hora de captura y última modificación.
- Permitir organizar el levantamiento por zonas, pasillos, bodegas o secciones.
- Detectar registros potencialmente duplicados.
- Evitar que dos usuarios sobrescriban silenciosamente el trabajo del otro.
- Cuando dos personas registren el mismo producto, enviarlo a conciliación.
- Permitir decidir durante la conciliación si corresponde sumar cantidades, sustituir un conteo, mantener registros separados o corregirlos.
- Diseñar el backend considerando concurrencia real.

## 3. Modo offline y sincronización

El levantamiento debe continuar funcionando si se pierde temporalmente la conexión a Internet.

### Requisitos
- Guardar localmente los registros pendientes, preferiblemente usando IndexedDB.
- Permitir crear y editar conteos mientras el dispositivo está offline.
- Mostrar claramente el estado **Online / Offline**.
- Mostrar cuántos registros están pendientes de sincronización.
- Sincronizar automáticamente cuando vuelva la conexión.
- Permitir reintentar manualmente una sincronización fallida.
- Usar identificadores/idempotencia para evitar duplicados al reintentar.
- Detectar conflictos producidos por otros usuarios mientras un dispositivo estuvo offline.
- No sobrescribir automáticamente información del servidor ante un conflicto.
- Evaluar PWA/service worker para mejorar el uso desde teléfonos.

## 4. Conciliación

Crear una etapa de revisión antes de afectar el inventario definitivo.

Debe permitir identificar:
- Productos nuevos.
- Productos ya existentes.
- Posibles duplicados.
- Conteos realizados por diferentes usuarios.
- Conflictos de cantidades.
- Registros incompletos.
- Registros pendientes de sincronización.

Ningún levantamiento con conflictos críticos o registros pendientes de sincronización debería poder aplicarse al inventario sin resolverlos.

## Criterios de seguridad funcional

- `FINALIZADO` no significa `APLICADO AL INVENTARIO`.
- El levantamiento debe conservar trazabilidad.
- La sincronización offline debe ser idempotente.
- Las operaciones concurrentes no deben causar pérdida silenciosa de datos.
- Aplicar al inventario debe ser una operación explícita, autorizada y transaccional.

## Contexto

Este trabajo está pensado especialmente para el caso de una ferretería que ya opera físicamente pero todavía no posee un inventario digital confiable. El objetivo es permitir que varias personas hagan el conteo físico desde celulares, incluso con conectividad intermitente, y posteriormente convertir ese levantamiento revisado en el inventario inicial real de FerreSystem.


## 5. Captura práctica desde celular

### Código de barras y QR
- Permitir escanear códigos de barras usando la cámara del teléfono.
- Evaluar lectura de QR cuando aplique al tipo de producto o etiquetado utilizado.
- Si el código corresponde a un producto existente, recuperarlo inmediatamente para registrar el conteo.
- Si el código no existe, permitir iniciar el alta del producto desde el levantamiento.
- Mantener captura manual como alternativa cuando la cámara o el código no estén disponibles.

### Fotografías
- Permitir tomar una foto del producto durante el levantamiento.
- Usarla como referencia cuando el producto todavía no pueda identificarse completamente.
- Permitir dejar el registro pendiente de completar durante la etapa de revisión.

### Productos sin código
- No exigir código de barras o QR para poder contar un producto.
- Soportar artículos vendidos o almacenados sin etiquetado individual.

## 6. Unidades, presentaciones y cantidades fraccionarias

El levantamiento debe adaptarse a productos típicos de ferretería.

- Soportar unidad, caja, paquete, metro, pie, libra, galón y otras unidades configurables.
- Permitir cantidades decimales cuando corresponda.
- Contemplar que un mismo artículo pueda manejar presentaciones distintas.
- Evitar conversiones automáticas ambiguas; cualquier equivalencia entre presentaciones debe estar configurada explícitamente.

## 7. Zonas y progreso del levantamiento

- Permitir dividir la tienda en zonas, pasillos, bodegas o secciones.
- Asignar zonas a usuarios cuando sea útil.
- Mostrar qué zonas están pendientes, en proceso y terminadas.
- Mostrar avance general del levantamiento.
- Mostrar avance por usuario o zona sin utilizarlo para sobrescribir conteos de otros participantes.

## 8. Auditoría y trazabilidad

Conservar evidencia completa del proceso.

- Registrar quién creó cada conteo.
- Registrar quién lo modificó y cuándo.
- Registrar valor anterior y valor nuevo en correcciones relevantes.
- Registrar quién resolvió un conflicto.
- Registrar quién aprobó y aplicó el levantamiento al inventario.
- Conservar el levantamiento original aun después de aplicarlo.

## 9. Reconteo y validación

- Permitir marcar artículos para un segundo conteo.
- Permitir solicitar reconteo cuando exista una diferencia o cantidad sospechosa.
- Conservar tanto el conteo original como el reconteo para auditoría.
- Resolver la cantidad definitiva durante la conciliación; no reemplazar silenciosamente el primer conteo.

## 10. Orden sugerido de implementación

Para reducir riesgo, implementar y probar por etapas:

1. Aplicación controlada del levantamiento al inventario.
2. Multiusuario, zonas, concurrencia y conciliación.
3. Modo offline, cola local e idempotencia de sincronización.
4. Código de barras/QR y captura con cámara.
5. Fotografías y registros pendientes de identificación.
6. Progreso, reconteo y mejoras adicionales de auditoría.

Antes de implementar cada etapa, revisar la arquitectura existente y reutilizar modelos, servicios y mecanismos de auditoría que ya existan en FerreSystem. Evitar duplicar funcionalidades o introducir cambios destructivos innecesarios.


## 11. Levantamiento independiente y migración a otros sistemas — P0

El módulo de levantamiento debe poder utilizarse aunque la empresa decida no adoptar FerreSystem como su sistema operativo final.

### Flujo de cierre
- **Finalizar levantamiento** debe consolidar/cerrar el conteo; no debe aplicar automáticamente los datos al inventario de FerreSystem.
- Después de finalizar, ofrecer acciones separadas:
  - **Aplicar a FerreSystem**.
  - **Exportar para otro sistema**.
  - Permitir ambas cuando corresponda.

### Exportación y portabilidad
- Exportar como mínimo a CSV y Excel.
- Permitir seleccionar y ordenar columnas.
- Contemplar campos como código/SKU, código de barras, descripción, cantidad, unidad, categoría, costo, precio y ubicación/zona.
- Permitir plantillas de exportación reutilizables para adaptar nombres y orden de columnas al sistema destino.
- Mantener el levantamiento original y su trazabilidad aun después de exportar.

### Enfoque comercial
El levantamiento puede convertirse en una funcionalidad utilizable de forma independiente: realizar inventario físico, revisar/conciliar la información y entregar datos preparados para migración hacia otro ERP/POS, sin obligar al cliente a adoptar FerreSystem completo.

### Principio de diseño
La captura y consolidación del inventario debe estar desacoplada del destino final de los datos. FerreSystem puede ser uno de los destinos, no el único.


### H13 — RECUPERACION_USABILIDAD_Y_PRIORIDADES_20261005.md

# Recuperación, facilidad de uso y pendientes priorizados

Fecha: 5 de octubre de 2026.
Estado: ideas y planificación para revisar. Este documento no implementa funcionalidades ni confirma su disponibilidad en producción.

Complementa [las opciones de arquitectura](IDEAS_ARQUITECTURA_CONTINUIDAD_Y_SUCURSALES.md), [el plan del piloto](OPERACION_PILOTO_20261004.md) y [los requisitos del negocio](REQUISITOS_NEGOCIO_VALIDADO.md).
El PR #58 ya se integró en main; las referencias del plan anterior a un PR aún en borrador describen su estado histórico.

## Contexto de adopción

El usuario indica que el negocio ya tiene un sistema, descrito como uno de Microsoft Dynamics para ferreterías, pero no lo utilizan porque lo consideran difícil. La identificación exacta del producto y las causas concretas no se han comprobado.

Quienes usarán FerreSystem pueden tener poca experiencia con computadoras. La facilidad de uso debe ser criterio de aceptación del piloto, junto con integridad de inventario, caja y ventas.

## Ideas de interfaz

- Pantalla inicial del cajero centrada en Vender, Buscar venta y Mi caja; mostrar administración según permisos.
- Venta con recorrido corto: buscar/escanear, cantidad, revisión del total y cobro.
- Botones grandes, texto legible y términos del negocio.
- Pedir solo información necesaria; explicar errores con una acción para resolverlos.
- Ejemplo: “Abra su caja para cobrar”, acompañado de acceso directo.
- Confirmaciones en acciones delicadas, sin interrumpir cada paso.
- Conservar borradores y facilitar correcciones.
- Recuperación guiada al volver: “Había una venta en proceso. Revisar venta y continuar”.
- El sistema debe comprobar el estado real antes de ofrecer reintento, cobro o comprobante; no trasladar al cajero decisiones técnicas sobre sincronización.
- Distinguir claramente Guardado como borrador, Pendiente de confirmar y Venta registrada.

Probar con cajero y administrador reales, observando dónde se traban al buscar, vender, corregir, consultar y cerrar caja. Observar también las tareas difíciles del sistema actual. No atribuir la dificultad únicamente a la marca.

## Qué existe y qué falta ante un apagón

Revisión de fuentes de main realizada durante esta conversación:

- frontend/src/pages/POSPage.tsx guarda la solicitud de venta en localStorage antes de enviarla, con identificador único y clave por empresa/usuario.
- Al abrir POS con el mismo equipo, navegador, empresa y usuario puede recuperar el pendiente y reintentar.
- backend/src/ventas/ventas.service.ts usa una transacción PostgreSQL y reconoce una solicitud repetida: devuelve la venta existente en lugar de duplicar venta, caja y reservas.
- frontend/test/operaciones.test.mjs prueba respuesta perdida, recarga y conservación de identidad.
- El carrito previo a pulsar Cobrar todavía no tiene guardado automático como borrador.
- Si el navegador recibió la confirmación y eliminó el pendiente antes del corte, la venta se consulta en el historial; no se recupera como pendiente.
- La recuperación actual no equivale a un centro de recuperación después del login ni a recuperación desde otra computadora.
- No se ha validado en esta conversación un corte físico de energía. Las pruebas de respuesta perdida no prueban apagado real, escritura durable del navegador ni restauración de una base local.

PostgreSQL permite confirmar o revertir el conjunto de cambios de una transacción. Si se instala localmente, verificar configuración de durabilidad, almacenamiento y recuperación; no prometer ausencia absoluta de pérdida ante daño físico.

El pago físico está fuera de la transacción de base de datos: el sistema no sabe por sí solo si ya se recibió efectivo o si una terminal bancaria cobró. Diseñar conciliación y evitar volver a cobrar sin comprobarlo.

## Comportamiento deseado de recuperación

1. Guardar automáticamente borradores, con versión, usuario/empresa y datos mínimos necesarios.
2. Al volver al POS, identificar borradores y operaciones pendientes.
3. Consultar al servidor si la solicitud ya se confirmó, sin crear una nueva venta por consultar.
4. Si está registrada, mostrar documento y facilitar consulta/reimpresión.
5. Si no se registró, permitir continuar la operación original con las validaciones vigentes.
6. Si no hay conexión al servidor, indicar que no puede comprobarse todavía; no presentar éxito ni autorizar entrega basada solo en un pendiente.
7. Separar recuperación del registro de la conciliación del pago físico.
8. Probar cambios de usuario, sesión vencida, datos corruptos, precios cambiados, caja cerrada, permisos revocados y respuesta perdida.
9. Definir retención y limpieza de borradores y cómo evitar restaurar datos de otra empresa o usuario.

## Prioridades consolidadas

La prioridad considera impacto en dinero/datos, continuidad y adopción. No implica que todas las funciones secundarias deban terminarse antes de un piloto limitado.

### P0 — Antes de usarlo como sistema principal

1. **Respaldo y datos reales.** Comprobar entorno actual, respaldo restaurable e historial de migraciones. Conciliar stock, códigos duplicados, cajas y saldos anteriores con el dueño.
2. **Arquitectura y continuidad.** Elegir nube/local según equipos, presupuesto y cortes. Evaluar PC del administrador como servidor, red local, UPS, inicio automático y mantenimiento. No construir dos arquitecturas a la vez.
3. **Recuperación de venta interrumpida.** Autoguardado de carrito, consulta de estado, recuperación guiada y conciliación de pagos. Probar apagones/reinicios en entorno controlado.
4. **Facilidad de uso y aceptación.** Simplificar flujo de caja según observación de usuarios reales. Deben completar tareas esenciales con ayuda mínima después de una breve capacitación.
5. **Migración y piloto controlado.** Ensayar sobre copia de datos reales y desplegar frontend/backend compatibles. Validar apertura, compra/recepción, contado/crédito, entrega, abono, devolución y cierre; probar lector e impresión usados por el negocio.
6. **Seguridad necesaria para el piloto.** Revisar permisos reales y credenciales/despliegue. Clasificar vulnerabilidades existentes por exposición e impacto; corregir las críticas aplicables antes de operación. El pase de pruebas no elimina vulnerabilidades.

La garantía, impresión fiscal u otra regla puede convertirse en P0 si es necesaria para las operaciones elegidas en el piloto.

### P1 — Después de estabilizar el núcleo o antes, si el negocio lo exige

7. **App instalada del dueño (requisito confirmado).** Recibir notificaciones push con app cerrada, independientes de sesión del navegador; revisar y decidir solicitudes con sesión móvil propia. Web/PWA no completa este requisito. Propuesta React Native/Expo, registro/revocación de dispositivos y cola persistente de eventos; VPN o puente limitado para acceso remoto, manteniendo base local. Ver `APP_MOVIL_Y_NOTIFICACIONES.md`.
8. **Garantías y política de devoluciones.** Confirmar vigencia, responsable, mercancía dañada y comprobantes; no inventar reglas.
9. **Continuidad adicional según arquitectura.** Con servidor local se puede operar sin Internet mientras funciona la red; una cola offline completa en cada terminal es una necesidad distinta y debe justificarse. Si se elige nube, la operación offline exige catálogo, cola, conflictos y sincronización.
10. **Dispositivos y fotos.** Validar cámara en móviles reales y, si se requieren fotografías, configurar captura, compresión y almacenamiento duradero. La URL de imagen actual no equivale a un servicio de subida.

### P2 — Mejoras y preparación de expansión

11. **Reportes y operación.** Zona horaria del local, filtros/exportaciones de auditoría y finanzas, selector de compra para venta especial; entregas parciales si se solicitan.
12. **Sucursales.** Diseñar relación empresa/sucursal, propiedad de datos y transferencias antes de cambios que dificulten expansión. Implementar sincronización y consolidación cuando se confirme plazo y alcance.
13. **Mantenimiento.** Dependencias no críticas, limpieza de artefactos versionados y desempeño según mediciones; separar esta tarea de correcciones de seguridad urgentes.

### P3 — Ampliaciones posteriores

14. Integraciones bancarias/terminales, vidriería y módulos hoy señalados como pendientes, según alcance confirmado y persistencia real.

## Información faltante para avanzar

- Capacidad y sistema operativo de PCs, disponibilidad fuera de horario y router/cableado.
- Frecuencia/duración de cortes, presupuesto y tolerancia a interrupción/pérdida de datos.
- Acceso al entorno productivo y estado observado de despliegue/migraciones.
- Disponibilidad del cajero y administrador para prueba de uso; tareas que evitan en su sistema actual.
- Política de garantías, requisitos fiscales, dispositivos y autorizaciones del dueño.
- Plazo y reglas de una segunda sucursal.

## Evidencia de cierre sugerida

No declarar continuidad, sencillez ni aceptación solo por compilación. Conservar resultados de restauración de respaldo, recuperación tras interrupción, conciliación de caja/inventario y observación de tareas reales. Registrar limitaciones del piloto y cuáles funciones siguen pendientes.


### H14 — REQUISITOS_NEGOCIO_VALIDADO.md

# Requisitos de negocio validados — FerreSystem

Fecha: 2026-10-02
Fuente: conversación con el dueño de la ferretería.

## Objetivo de negocio
FerreSystem debe permitir que el negocio deje de depender de la memoria y presencia permanente del dueño. El sistema debe convertirse en la fuente de control operativo y permitir delegar con auditoría: quién hizo qué, cuándo, por cuánto y con qué impacto.

## P0 — Núcleo para piloto real

### 1. Inventario y entrega controlada
- Inventario es la máxima prioridad.
- Flujo objetivo: Cliente solicita → Caja registra/factura → venta registrada → entrega → inventario disminuye.
- Regla operativa: no entregar mercancía antes de registrar la venta.
- Detectar faltantes y mantener trazabilidad de movimientos.
- Reportar productos de mayor movimiento para reposición.
- El levantamiento inicial sigue siendo la primera implementación.

### 2. Costos y precio vigente
- Conservar historial de costos por compra/proveedor.
- Mantener además un costo vigente del producto.
- Al registrar una nueva reposición, permitir actualizar el costo vigente al costo de la compra más reciente, incluso si sube o baja.
- No confundir costo vigente comercial con valoración histórica de lotes.
- Cada producto puede tener su propio margen y precio de venta.
- Durante el levantamiento inicial contemplar costo, margen y precio de venta.

### 3. Compras, proveedores y cuentas por pagar
Trazabilidad mínima:
Producto → proveedor → factura de compra → cantidad → costo → fecha.
- Un producto puede tener múltiples proveedores.
- Registrar facturas de proveedor, vencimiento/plazo, monto, saldo, estado y pagos.
- Alertar facturas próximas a vencer.
- El negocio debe mantener su propio saldo por proveedor y no depender del estado de cuenta del proveedor.
- Recepción de compra física debe incrementar inventario y generar movimiento trazable.

### 4. Venta de contado y caja
- Métodos iniciales: efectivo, transferencia y tarjeta/POS.
- Toda venta asociada al usuario/cajero.
- Permitir cierre por cajero/empleado.
- Integraciones bancarias/POS quedan para investigación posterior y no bloquean el piloto.

### 5. Crédito y cuentas por cobrar
- Solo clientes previamente registrados pueden comprar a crédito.
- Cliente con código/identificador.
- Factura marcada como contado o crédito.
- Venta a crédito crea/aumenta cuenta por cobrar.
- Registrar abonos/pagos y reducir saldo.
- Mantener historial y trazabilidad de deuda.

### 6. Roles, permisos y auditoría
Roles mínimos validados: Administrador y Cajero.
- Cajero vende y consulta la información necesaria.
- Cajero no modifica libremente costos ni información sensible.
- Auditar usuario, operación, fecha/hora, monto, método de pago y cierre.
- Operaciones administrativas sensibles también deben registrar autor/modificador.

### 7. Identificación de productos
- Aprovechar código de fabricante/proveedor cuando sea útil.
- Productos sin código útil reciben código interno.
- Soportar escáner/cámara.
- Mantener búsqueda por descripción.
- Descripciones operativas deben distinguir variantes: tipo, medida, espesor, color/identificador cuando corresponda.
- Fotografía opcional como ayuda de identificación, optimizada para no almacenar imágenes pesadas directamente en la base de datos.

### 8. Venta especial / mercancía que nunca entra físicamente
Crear un flujo explícito de “Venta especial” o “Venta sin inventario”.
- Cuenta como ingreso, venta del cajero, factura, cierre e historial del cliente.
- No genera salida de inventario físico si la mercancía nunca estuvo almacenada.
- Debe poder vincularse al proveedor/compra correspondiente.
- No usar stock negativo como mecanismo normal para este caso.
- Si mercancía comprada por error sí llega físicamente al local, entonces sí entra al inventario.

## P1 — Control operativo

### 9. Devoluciones
Definir devolución vinculada a venta/documento original y su efecto en:
- inventario;
- factura;
- caja/reembolso;
- crédito/cuenta por cobrar;
- garantía.
Registrar motivo, usuario, fecha y destino físico del artículo.

### 10. Garantías
- Asociar garantía a producto/venta.
- Conservar condiciones, vigencia y responsable.
- Reglas exactas pendientes de levantar con el dueño.

### 11. Alertas
- Facturas de proveedor próximas a vencer.
- Cuentas por cobrar vencidas.
- Stock bajo/reposición y otras alertas operativas relevantes.

### 12. Operación offline
- Sistema web accesible desde otra PC/celular si falla un equipo.
- Ante caída de Internet, guardar temporalmente operaciones compatibles y sincronizar al volver la conexión.
- Definir cuidadosamente qué operaciones pueden ejecutarse offline para evitar duplicidad de ventas, pagos o stock.

## P2 — Posterior al piloto

### 13. Vidriería / ventanas
Analizar después de estabilizar la ferretería:
- misma empresa/unidad de negocio;
- otra empresa/tenant;
- usuarios/permisos separados;
- o ventanas como productos/servicios.
No debe ampliar el alcance del piloto inicial.

### 14. Integraciones externas
- Investigar integración bancaria/POS.
- No bloquear el desarrollo actual por estas integraciones.

## Reglas conceptuales críticas
1. Diferenciar inventario físico de mercancía vendida que nunca entra al local.
2. Diferenciar costo histórico de compra de costo vigente comercial.
3. No modificar existencias sin un movimiento trazable.
4. No permitir que permisos de frontend sustituyan validación en backend.
5. Ventas, compras, pagos, devoluciones y ajustes deben ser auditables.
6. FerreSystem debe permitir delegar la operación sin perder control.

## Flujo núcleo validado
Compras/Proveedores → Inventario/Costos → Venta/Crédito → Entrega → Caja/Cierre → Auditoría.

Alrededor de este núcleo: cuentas por cobrar, cuentas por pagar, garantías, devoluciones, ventas especiales y alertas.

## Próximo paso recomendado
Auditar el repositorio contra estos requisitos y clasificar cada punto como:
- IMPLEMENTADO Y VALIDADO;
- IMPLEMENTADO PARCIAL;
- EXISTE PERO REQUIERE ADAPTACIÓN;
- NO IMPLEMENTADO;
- REQUIERE DEFINICIÓN DE NEGOCIO.

No implementar funciones nuevas antes de comprobar qué existe actualmente en frontend, backend, esquema Prisma, persistencia y pruebas.

## Ampliación confirmada — 5 de octubre de 2026

El dueño requiere una app instalada para recibir notificaciones push y revisar autorizaciones importantes, incluso con la app cerrada y sin depender de la sesión del navegador. La sesión de la app será independiente; cerrar sesión explícitamente o revocar el dispositivo debe cancelar sus envíos futuros y acceso. Web adaptable/manifiesto no completa esta entrega. La base operativa puede seguir local; sin Internet del local, los avisos quedan pendientes hasta reconectar. Alcance y propuesta en `APP_MOVIL_Y_NOTIFICACIONES.md`; plataforma y distribución por confirmar.


### H15 — REVISION_PENDIENTES_20261005.md

# Revisión preparada para mañana

Rama `codex/recuperacion-ventas`, PR #59. Esta lista reemplaza la interpretación de que gestión de roles seguía por implementar; los documentos iniciales mantienen el contexto histórico.

| Prioridad | Trabajo | Estado |
|---|---|---|
| P0 | Borradores de venta y recuperación sin duplicar cobro | Implementado y probado; falta prueba física de energía/equipo |
| P0 | Roles, permisos, último ADMIN y dos administradores | Implementado; sesión/menús se sincronizan mientras la ventana está visible |
| P0 | Devoluciones totales/parciales autorizadas, caja, crédito y auditoría | Implementado y probado; falta aceptación del negocio |
| P0 | Migraciones iniciales, adopción histórica y respaldo/restauración | Ensayo aislado aprobado; bloqueada la prueba con copia real por falta de acceso/respaldo |
| P0 | Instalación local, HTTPS, persistencia y arranque de servicios | Ensayo Docker aprobado, incluso sin salida a Internet y tras reinicio abrupto de procesos; faltan equipos/corte físicos |
| P0 | Respaldo automático y estado visible para ADMIN | Programador cada seis horas y panel de estado; falta copia externa/retención y restauraciones periódicas |
| P0 | Importación y dependencias | CSV limitado a 5 MB/5000 filas; retirada lectura Excel vulnerable |
| P0 | Archivos de entorno versionados | Retirados del seguimiento sin leer valores; el historial aún los contiene, revisar/rotar credenciales reales si las hubo |
| P0 | Uso sencillo y piloto | Inicio por tareas/buscador y mensajes de estado implementados; falta observación de cajero/admin y lector/impresora |
| P1 | App instalada y push (requisito del cliente) | Pendiente; web/manifiesto no lo completan. Propuesta en APP_MOVIL_Y_NOTIFICACIONES.md; confirmar plataforma/distribución, sesión móvil y canal push |
| P1 | Autorización fuera del local | Flujo backend real listo; requiere VPN/puente remoto y configuración de red |
| P1 | Garantías y política comercial | Falta vigencia/reglas/responsables y requisitos fiscales del cliente |
| P1 | Fotografías | URL de imagen existente; no captura/subida/almacenamiento durable implementados |
| P2 | Sucursales | Propuesta empresa/sucursal/outbox documentada; selector ficticio retirado; sincronización no implementada |
| P2 | Reportes/entregas adicionales | Núcleo actual operativo; zona horaria, filtros/exportaciones y entregas parciales requieren revisar alcance |
| P2 | Limpieza de artefactos | node_modules y dist retirados de Git; CI/instalación generan dependencias y bundles |
| P3 | Bancos, módulos pendientes y ampliaciones | No implementados; alcance/reglas/proveedores aún por definir |

## Cambios a revisar

- `INSTALACION_LOCAL_Y_CONTINUIDAD.md`: servidor en PC existente, LAN, HTTPS, alta inicial sin demo, respaldos y recuperación.
- `VALIDACION_INTEGRACION_Y_SESIONES.md`: evidencia del ensayo aislado y procedimiento sobre copia real.
- `AVANCE_DEVOLUCIONES_AUTORIZADAS.md`: solicitud, decisión, ejecución y auditoría.
- `SUCURSALES_Y_ACCESO_REMOTO_PROPUESTA.md`: propuesta para expansión sin sustituir el aislamiento de empresa.
- `AUDITORIA_RAMA_20261005.md`: fallos confirmados, correcciones y límites de la revisión.
- `APP_MOVIL_Y_NOTIFICACIONES.md`: app instalada con avisos independientes del navegador, sesión propia, cola de eventos y base operativa local.
- Commit separado de limpieza: elimina artefactos/entornos del seguimiento, conserva las copias locales y no elimina su historial. La cantidad grande de archivos eliminados corresponde a dependencias/bundles, no a módulos de negocio.

## Para cerrar los pendientes externos

Copia reciente de la base y conexiones aisladas; sistema operativo/recursos de las PCs; router/DNS y UPS; lector/impresora; política de respaldo externo/retención; teléfono Android/iOS y acceso remoto; prueba con el cajero y ambos administradores; reglas fiscales, garantías y segunda sucursal.

No se instaló en la ferretería ni se fusionó a main. No se cambiaron datos productivos ni se activaron pagos/servicios remotos. Estas dependencias no se consideran cerradas por compilar o pasar pruebas.

## Pruebas de código de esta etapa

58 pruebas frontend, 88 backend, 55 PostgreSQL real aislado y 7 scripts aprobadas (208) tras la auditoría. Builds de producción con `/api`, backend e imágenes Docker aprobados. Login ADMIN/cajero, recuperación de venta, devolución autorizada/reintento, respaldo y restauración aprobados en el ensayo; HTTPS e inicio sin salida a Internet comprobados. Auditoría npm de dependencias productivas: cero vulnerabilidades conocidas reportadas en ambos paquetes después de retirar XLSX; no es una certificación de seguridad de la instalación del cliente.


### H16 — ROADMAP_FERRESYSTEM.md

# Roadmap general — FerreSystem

Este documento centraliza ideas y mejoras generales que pueden convertirse en futuras implementaciones. Los detalles específicos de cada módulo pueden mantenerse en documentos separados dentro de `docs/`.

## Prioridad alta

### 1. Cuentas por cobrar y ventas al crédito
- Permitir ventas al crédito asociadas a un cliente.
- Crear automáticamente una cuenta por cobrar desde la venta.
- Registrar monto original, abonos, saldo pendiente y fecha de vencimiento.
- Mantener historial completo de pagos y ajustes.
- Identificar cuentas vigentes y vencidas.
- Mostrar claramente quién debe, cuánto debe y desde cuándo.
- Incluir resumen de cartera total por cobrar.
- Conservar trazabilidad entre factura/venta, cliente y cuenta por cobrar.

### 2. Trazabilidad de movimientos de inventario
- No limitar el inventario al valor actual de stock.
- Registrar entradas y salidas con su origen.
- Distinguir inventario inicial, ventas, compras, devoluciones, ajustes y transferencias.
- Permitir consultar el historial de movimientos por producto.
- Registrar usuario, fecha, cantidad anterior/nueva y documento relacionado cuando corresponda.
- Facilitar investigación de diferencias de inventario.

### 3. Levantamiento de inventario
El diseño detallado se mantiene en:
`docs/PENDIENTES_LEVANTAMIENTO_INVENTARIO.md`

Incluye, entre otros:
- aplicación controlada al inventario;
- trabajo multiusuario;
- modo offline y sincronización;
- conciliación;
- código de barras/QR;
- fotografías;
- zonas, auditoría y reconteos.

## Prioridad media

### 4. Centro de alertas
Centralizar alertas operativas relevantes:
- stock bajo;
- cuentas por cobrar vencidas;
- productos próximos a agotarse;
- cotizaciones pendientes;
- apartados próximos a vencer;
- diferencias de caja;
- otros eventos que requieran atención.

Inicialmente puede implementarse dentro del sistema antes de incorporar notificaciones push.

### 5. Cierre/resumen diario del negocio
Crear una vista sencilla para el propietario o administrador con:
- ventas del día;
- efectivo esperado;
- ventas por medio de pago;
- ventas al crédito otorgadas;
- abonos recibidos;
- utilidad aproximada cuando la información de costos lo permita;
- diferencias de caja;
- otros indicadores operativos relevantes.

## Criterios generales para nuevas funcionalidades

- Priorizar problemas reales del negocio sobre agregar pantallas sin uso validado.
- Mantener compatibilidad multi-tenant.
- Mantener trazabilidad de operaciones sensibles.
- Diseñar pensando en uso desde celular.
- Evitar pérdida silenciosa de datos.
- Reutilizar servicios, modelos y componentes existentes antes de crear duplicados.
- Implementar por etapas y probar cada etapa antes de ampliar alcance.
- Validar las funcionalidades principales en una operación real de ferretería antes de sofisticarlas.

## Uso de este documento

Cuando surja una idea nueva para FerreSystem:
1. Registrarla aquí si afecta al producto en general.
2. Crear o ampliar un documento específico en `docs/` si requiere diseño detallado.
3. Revisar el código existente antes de asumir que la funcionalidad no existe.
4. Convertir la idea en una tarea concreta únicamente cuando se vaya a implementar.


## Hallazgos técnicos pendientes de corrección

### Órdenes de compra y proveedores — implementación parcial
Revisión del código actual:
- Existe interfaz para órdenes de compra y catálogo de proveedores.
- Proveedores y órdenes todavía se persisten mediante `localStorage` en el frontend.
- La acción **Confirmar recepción total** actualiza el estado de la orden y `cantidadRecibida` en el estado local.
- La recepción no debe considerarse completa hasta verificar/implementar persistencia real en backend y movimiento real de existencias.
- Pendiente conectar recepción parcial/total con inventario, trazabilidad de movimientos y costos.
- Al implementar, evitar duplicar modelos o endpoints existentes: auditar backend/Prisma primero.

### Permisos individuales — revisar persistencia y enforcement
Revisión del código actual:
- Existen roles base: `ADMIN`, `CAJERO`, `BODEGUERO` y `VENDEDOR`.
- Existe `RolesGuard` en backend para autorización basada en rol.
- La pantalla de usuarios permite seleccionar permisos individuales y límite máximo de descuento.
- El payload observado al crear/editar usuario envía nombre, email, rol, estado y contraseña cuando corresponde, pero no incluye los permisos individuales ni el límite de descuento seleccionados en la interfaz.
- Pendiente verificar modelo/DTO/backend y hacer persistentes los permisos finos.
- Pendiente asegurar que los permisos se validen en backend y no únicamente oculten o habiliten controles en frontend.
- Pendiente verificar persistencia/asignación real de sucursal mostrada en la interfaz.

### Devoluciones — auditar antes de implementar
- En la revisión inicial no se encontró una implementación clara de devolución de ventas o devolución a proveedor.
- Antes de crear el módulo, realizar una búsqueda completa de modelos, endpoints, servicios y componentes existentes.
- Si no existe, diseñar devoluciones vinculadas al documento original y con impacto trazable en inventario/caja/cuentas según corresponda.
- Una devolución no debe modificar stock sin registrar motivo, usuario, fecha y destino del artículo (reintegrado, dañado, devolución a proveedor, etc.).

### Regla para estos hallazgos
Estos puntos representan funcionalidad existente incompleta o áreas que requieren auditoría. No tratarlos automáticamente como módulos nuevos. Antes de implementar, confirmar el estado actual del backend, esquema Prisma, DTOs, endpoints y pruebas para evitar duplicar lógica.


## Backlog priorizado para implementación con Codex

Las prioridades pueden ajustarse conforme avance la auditoría. La regla es cerrar primero los flujos que afectan datos reales, dinero e inventario antes de añadir sofisticación.

### P0 — Piloto / operación básica confiable
- Levantamiento de inventario con aplicación controlada al inventario real.
- Persistencia real de proveedores y órdenes de compra en backend/PostgreSQL.
- Recepción de compras conectada con movimientos y existencias reales.
- Cuentas por cobrar y ventas al crédito con saldos, abonos, vencimientos y trazabilidad.
- Corregir persistencia y enforcement backend de permisos individuales.
- Trazabilidad/Kardex de movimientos de inventario.
- Verificar y cerrar flujos críticos antes de depender del sistema en operación real.

### P1 — Control operativo
- Devoluciones de clientes y a proveedores con impacto trazable.
- Centro de alertas operativas.
- Cierre/resumen diario.
- Reconciliación y auditoría avanzada del levantamiento.
- Fortalecer controles por sucursal y usuario.

### P2 — Optimización
- Relación producto–múltiples proveedores.
- Código/SKU utilizado por cada proveedor para el producto.
- Historial de costos por producto y proveedor.
- Último costo de compra.
- Proveedor preferido.
- Plazo/tiempo habitual de entrega.
- Comparación de proveedores y condiciones de compra.
- Analítica y automatizaciones derivadas de datos históricos confiables.

### Regla de mantenimiento del roadmap
Cuando durante auditorías o conversaciones aparezca una mejora concreta:
- registrarla en este documento;
- clasificarla como P0, P1 o P2 según impacto y dependencia;
- indicar si es funcionalidad nueva, parcial o corrección;
- evitar duplicarla si ya existe en otro documento;
- mover los detalles técnicos extensos a un documento específico cuando sea necesario.


### H17 — SUCURSALES_Y_ACCESO_REMOTO_PROPUESTA.md

# Propuesta para expansión y acceso remoto

Diseño para revisión, no funcionalidad desplegada. La instalación local y las autorizaciones actuales pueden usarse como núcleo inicial; no confundir una etiqueta de sucursal en el navegador con separación real de existencias o caja.

## Empresa y sucursal

Mantener Tenant como empresa/cliente del sistema; no usar una nueva sucursal como sustituto automático de Tenant. Proponer entidad Sucursal asociada a una empresa y acceso de usuario por sucursal. Migrar instalaciones existentes a una sucursal inicial mediante migración comprobada sobre copia.

La sucursal controla existencias, reservas, caja, ventas, entregas y movimientos. La empresa puede compartir catálogo/clientes según política confirmada. Registrar sucursal origen en cada documento y autorización; toda consulta comprueba empresa y sucursales permitidas en el servidor. Un administrador puede tener alcance de una sucursal o varias; nunca se concede alcance cambiando localStorage.

## Continuidad y sincronización

Si cada sucursal debe operar sin Internet, cada una necesita servidor/instancia local y datos suficientes para sus operaciones. El servidor de sucursal conserva la autoridad sobre su caja y existencias; un servicio central consolida, sin bloquear la venta local cuando se corta Internet.

Usar UUID de documento/solicitud, secuencias comerciales por sucursal y eventos persistentes (outbox/inbox) en la misma transacción del negocio. Reintentos idempotentes, acuse, versión y auditoría. No resolver saldos ni inventario con "último cambio gana". Transferir mercadería exige documentos de salida/recepción y reglas de tránsito, cancelación y recepción parcial.

Pedidos remotos y autorizaciones requieren estado PENDIENTE/AUTORIZADA/RECHAZADA/EJECUTADA y dueño claro del documento. Sin conectividad no se inventa una autorización remota; un administrador local puede autorizar con su cuenta si la política lo permite. La fase actual de devoluciones es servidor único: no incluye outbox/inbox ni autorización por puente remoto.

## Celular y costos

El cliente confirmó que necesita una app instalada que reciba avisos con la app cerrada, independiente de la sesión del navegador. Propuesta: React Native/Expo y un canal push, conservando la base operativa local. Un servicio pequeño puede manejar eventos sin convertir toda la base operativa en una base de pago externa. Confirmar Android/iOS, distribución, proveedor y presupuesto. Alcance en `APP_MOVIL_Y_NOTIFICACIONES.md`.

Nunca publicar PostgreSQL al Internet. La app deberá reutilizar aislamiento y autorizaciones del backend con una sesión segura propia del dispositivo. VPN o puente autenticado limitado habilitará consultas/decisiones fuera del local. La web móvil sigue sirviendo para acceso en LAN, pero no completa el requisito de app instalada/push. Probar app cerrada, logout/revocación y pérdida de Internet en teléfonos reales.

## Decisiones que faltan

Fecha de apertura de la segunda sucursal; catálogos/precios/clientes compartidos; usuario por sucursal; crédito y cobro entre sucursales; responsable de transferencias; continuidad esperada; tiempo de sincronización aceptable; requerimientos fiscales; dispositivo móvil y presupuesto del puente remoto. Implementar estos cambios sin esas reglas puede mover saldos o existencias al ámbito incorrecto.


### H18 — UX_UI_AUDIT_2026-10-05.md

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


### H19 — VALIDACION_INTEGRACION_Y_SESIONES.md

# Ensayo de integración y actualización de permisos

Trabajo en `codex/recuperacion-ventas`, PR #59. Fecha: 5 de octubre de 2026.

## Alcance comprobado

La validación utiliza PostgreSQL temporal, bases independientes y datos sintéticos. El entorno no tiene credenciales, conexión ni respaldo suministrado de la base real de la ferretería. No se modificó producción y **todavía no está validada la actualización sobre una copia real**.

Se añadió un ensayo que instala toda la cadena de migraciones, crea cajero/administrador/producto, abre caja, registra una venta, entrega productos, solicita/autoriza/ejecuta una devolución parcial y realiza respaldo con `backup-preflight.mjs`. Restaura mediante `restore-verify.mjs` a otra base vacía y comprueba:

- Venta original conservada y solicitud ejecutada con su administrador.
- Documento e importe de reembolso iguales a los originales.
- Existencias finales, efectivo esperado, movimientos de caja y auditoría conservados.
- Inspección/despliegue de la copia restaurada sin nuevas migraciones pendientes.
- Repetir la ejecución después de restaurar no duplica devolución, movimientos ni auditoría.

Se mantienen los ensayos de adopción/actualización histórica y recuperación tras parada abrupta de PostgreSQL. Una parada de proceso no prueba daño físico de disco ni comportamiento de los equipos ante un corte de energía.

## Sesiones y cambios de rol

El servidor ya consulta el usuario activo y sus permisos en cada petición. La interfaz ahora consulta `/auth/me` al iniciar una sesión, al recuperar foco/visibilidad y cada 30 segundos mientras la ventana es visible. Actualiza rol, permisos y límite de descuento en el contexto y almacenamiento del usuario; los menús y rutas protegidas usan esos valores.

No promete cambio instantáneo de todos los menús: el servidor deniega inmediatamente las operaciones sin permiso y la pantalla se actualiza en la siguiente consulta. Sin conexión se conserva la sesión; no se inventan permisos. Respuestas de otra identidad, empresa, token o de un efecto cancelado se descartan. La sesión Superadmin usa su flujo separado y no consulta el perfil del tenant.

Pruebas nuevas: actualización de rol/descuento, respuesta antigua tras otro login, consultas simultáneas, desconexión/reintento, limpieza del efecto e identidad de otra empresa.

## Ensayo pendiente con datos reales

Usar el procedimiento de `INSTALACION_Y_ACTUALIZACION_SEGURA.md`. Requisitos que aún no están disponibles: respaldo reciente de la ferretería, destino aislado vacío para restaurarlo y, si requiere adopción histórica, otra base vacía de referencia. Configurar conexiones mediante secretos del entorno o servicios PostgreSQL; no enviar contraseñas al repositorio.

1. Identificar origen, fecha del respaldo y versión operativa; suspender cambios durante la captura.
2. Verificar checksum y restaurar en el destino aislado. Nunca usar producción como destino.
3. Inspeccionar historial, tablas, numeración de clientes y diagnóstico de caja/stock/cuentas. Resolver discrepancias antes de actualizar.
4. Adoptar solo la etapa histórica comprobada, si corresponde, y desplegar las migraciones pendientes en esa copia.
5. Con cajero y administradores, probar venta, entrega, abono, devolución parcial/total, apertura/cierre y cambio de rol con sesión abierta. Conciliar importes y existencias contra la situación inicial.
6. Ensayar reinicio, recuperación de pendientes y restauración usando los equipos previstos. Validar impresión y respaldo externo.
7. Registrar resultados e incidencias antes de planificar la puesta en producción.

## Próxima prioridad

Con el ensayo real todavía pendiente de acceso, se puede preparar la instalación local: PC del administrador como servidor inicial si tiene capacidad, PostgreSQL local, red de caja/admin independiente de Internet, arranque automático, UPS y respaldos externos programados. Esto requiere verificar sistema operativo, equipos y router de la ferretería antes de definir la instalación definitiva.

## Resultado técnico de esta etapa

Build frontend/backend aprobados. 40 pruebas frontend, 52 backend y 51 PostgreSQL aislado aprobadas (143 en total). El caso nuevo de respaldo/restauración se ejecutó junto con toda la suite de integración. No se realizó prueba visual en navegador ni aceptación del cliente; las pruebas de interfaz verifican lógica de sincronización y las pruebas existentes de renderizado/handlers.


### H20 — VERIFICACION_WEB_ANTES_DEL_MERGE_20261005.md

# Verificación web antes del merge

Fecha: 5 de octubre de 2026. Rama: `codex/recuperacion-ventas`; PR #59.

## Fallo confirmado y correcciones

El sitio `https://ferre-system.vercel.app` devuelve HTML y assets con HTTP 200, pero el navegador queda en blanco con el error de React Router: `A <Route> is only ever to be used as the child of <Routes>`. La versión de `main` coloca las rutas de devoluciones y auditoría fuera de `Routes`. La rama ya contiene esa corrección. El despliegue Ready de la vista previa no actualiza el dominio productivo.

El frontend de la rama agrega pruebas de Chromium sobre el bundle compilado: arranque desde rutas públicas/protegidas, ingreso y navegación ADMIN/CAJERO con API simulada y manejo de caché de notificaciones corrupta. Las pruebas interceptan la API y no contactan ni modifican datos de Render. La regresión de `main` se reprodujo contra el mismo test de arranque. También se corrigió el JSON de notificaciones inválido que impedía abrir el login.

Vercel instala con `npm ci`, usa Node 24 y `package-lock.json`. La vista previa requiere autenticación de Vercel. No se cambió esa protección.

## Estado del backend publicado

La URL pública incorporada en el bundle productivo es `https://ferresystem.onrender.com/api`. Se verificaron únicamente solicitudes de lectura y preflight, sin sesión ni datos de negocio:

- Desde el origen productivo, `OPTIONS /api/auth/login` devuelve 204 con el origen exacto permitido y credenciales.
- Desde `https://ferre-system-git-codex-recuperacion-ventas-nelspace.vercel.app`, el mismo preflight devuelve 404 y no autoriza CORS.
- `GET /api/health` devuelve 404: la API responde, pero no tiene registrado el controlador de salud de la rama.

El backend de la rama admite `FRONTEND_URLS` (lista de orígenes exactos separados por comas), conservando `FRONTEND_URL` y los orígenes locales. Rechaza rutas, comodines y credenciales en la configuración. Incluye el encabezado `X-Tenant-Id` usado por login y pruebas HTTP reales aisladas de los preflights.

## Pasos necesarios en Vercel y Render

1. Vercel: Root Directory `frontend`; API HTTPS real en `VITE_API_URL` para Preview/Production. Recompilar después de cambiar esa variable. La configuración actual de Vercel solo publica el frontend: `/api` corresponde a la instalación local con proxy.
2. Render: revisar commit/rama desplegados, Root Directory `backend`, comandos de build/start y estado de autodeploy. Configurar `NODE_ENV=production` y los orígenes autorizados; desplegar el backend compatible con el frontend. Ejemplo para los dominios conocidos:

```text
FRONTEND_URL=https://ferre-system.vercel.app
FRONTEND_URLS=https://ferre-system.vercel.app,https://ferre-system-git-codex-recuperacion-ventas-nelspace.vercel.app
```

Editar `.env.example` no configura Render. La API debe usar la implementación nueva para leer `FRONTEND_URLS`; cambiar solo la variable en una versión anterior no habilita esa lista.

3. Antes de actualizar la API, comprobar el historial y esquema de la base existente con el código y herramientas de la rama: `npm run migrate:inspect` es de solo lectura. Verificar que el script exista en la copia usada. No asumir que estará disponible en un despliegue antiguo de Render.
4. Si requiere baseline o está bloqueada, seguir [instalación y actualización segura](INSTALACION_Y_ACTUALIZACION_SEGURA.md), primero con respaldo y copia restaurada. Hay evidencia de numeración de clientes aplicada manualmente en Supabase; que Clientes abra no certifica el historial de Prisma. La rama añade la tabla `solicitudes_devolucion` y una migración inicial; `start:prod` protege el despliegue y puede detenerse ante un historial incompatible. No cambiar automáticamente el Start Command ni aplicar migraciones a ciegas.
5. Coordinar esquema, API y frontend. Publicar solo el frontend nuevo con API antigua deja sin funcionar recuperación POS, solicitudes de devolución y estado de respaldos. `node dist/main.js` permite arrancar código sin aplicar migraciones, pero no soluciona una tabla faltante.
6. Comprobar `GET /api/health` 200 (conexión a la base), ambos preflights autorizados, login/recarga/renovación de sesión y navegación con la API desplegada. El health no verifica todas las tablas ni sustituye el ensayo de recuperación/devoluciones en una copia de datos.

## Validaciones de la rama

Instalaciones npm limpias sin copiar `node_modules`, builds frontend/backend y validación/generación de Prisma aprobados con Node 24.

| Suite | Resultado |
| --- | --- |
| Frontend | 58/58 |
| Chromium: arranque y navegación con API simulada | 12/12 |
| Backend, incluyendo CORS HTTP | 115/115 |
| Instalación y respaldos | 7/7 |
| Integración PostgreSQL real aislado | 55/55 |
| Total | 247/247 |

Chromium usa el bundle compilado. La prueba de login falla al sustituir únicamente `App.tsx` por el de `main`, reproduciendo el error observado en producción, y pasa con la rama. Las pruebas PostgreSQL usan clústeres temporales; no la base cloud.

## Límite de esta revisión

Se pueden verificar el código y la compilación en este entorno. No hay acceso autenticado configurado a Render ni a la base cloud; no se inspeccionó ni modificó esa base, no se cambió el servicio de Render y no se hizo merge a `main`. Las pruebas simuladas de navegador no certifican el login de producción. La aceptación del despliegue completo depende de ejecutar y comprobar los pasos anteriores.


---

## Levantamiento multiusuario — feat/levantamiento-multiusuario (2026-10-08)

**Rama:** `feat/levantamiento-multiusuario` · **Commit:** `ab03fca7`
**Estado:** implementación completa pendiente de PR y revisión. No se hizo merge a `main`.

### Objetivo

Implementar el pendiente n.º 2 del levantamiento de inventario: conteo multiusuario seguro.

### Cambios implementados

#### Base de datos (Prisma + migración)
- `LevantamientoItem`: nuevos campos `contadorId` (quién contó) y `conflicto` (boolean, default false)
- Nuevo modelo `LevantamientoSesion`: presencia por heartbeat (TTL 5 min, unique por levantamiento+usuario)
- Migración: `backend/prisma/migrations/20261009000000_levantamiento_multiusuario/migration.sql`

#### Backend — levantamientos.service.ts (353 líneas)
- **Detección de conflicto** en `createItem()`: si otro usuario ya contó el mismo producto (por `productoId`, código o barcode), ambos ítems quedan con `conflicto=true`. El mismo usuario editando su propio conteo nunca genera conflicto.
- **Regla de conciliación documentada**: nunca suma ni elige automáticamente. El ADMIN debe llamar `POST /conciliar` eligiendo `mantenerItemId` y opcionalmente `cantidadManual`.
- **`aplicar()` bloqueado** mientras haya ítems con `conflicto=true`.
- **`previsualizar()`** incluye el error "Conteo en conflicto: conciliar antes de aplicar" en `row.errores`.
- **Heartbeat / presencia**: `heartbeat()`, `findParticipantes()`, `salirSesion()`.
- **Huérfanos**: `limpiarConflictosHuerfanos()` limpia la bandera si uno de los dos ítems en conflicto se elimina.

#### Backend — controller (5 nuevos endpoints)
```
GET    /levantamientos/:id/participantes   — lista usuarios activos (< 5 min)
POST   /levantamientos/:id/heartbeat       — registrar presencia (todos los roles)
DELETE /levantamientos/:id/heartbeat       — salir sesión
GET    /levantamientos/:id/conflictos      — lista ítems en conflicto (ADMIN)
POST   /levantamientos/:id/conciliar       — elegir conteo a conservar (ADMIN)
```

#### Frontend — LevantamientoPage.tsx (465 líneas)
- `useEffect` de heartbeat: POST cada 60 s, DELETE al salir/desmontar.
- `ParticipantesBanner`: badge de usuarios activos, se actualiza cada 30 s.
- `ConflictosPanel`: solo ADMIN; tabla con botones "Conservar este" y entrada de cantidad manual.
- Tabla de ítems: columna "Contador", filas en amarillo si hay conflicto, badge ⚠️.
- Botón "Revisar impacto" deshabilitado con tooltip mientras haya conflictos pendientes.
- Mensaje de aviso para no-ADMIN cuando hay conflictos activos.

### Pruebas — 31/31 ✅

| Suite | Tests | Resultado |
|---|---|---|
| Conteo protegido y aplicación explícita | 6 | ✅ |
| Identidad de productos durante el levantamiento | 4 | ✅ |
| Auditoría P1/P2 — aplicar() protege barcode y precios | 5 | ✅ |
| Multiusuario — detección de conflictos | 6 | ✅ |
| Multiusuario — conciliación de conflictos | 4 | ✅ |
| Multiusuario — heartbeat y participantes | 3 | ✅ |
| Aislamiento por tenant | 3 | ✅ |
| **Total** | **31** | **31/31** |

TypeScript (`tsc --noEmit`): 0 errores. Lint (oxlint): 0 errores, 128 advertencias preexistentes.

### Regla de conciliación — documentación explícita

> **Nunca se suman ni se auto-eligen conteos simultáneos.**
>
> Cuando dos usuarios registran el mismo producto en el mismo levantamiento, ambos ítems quedan marcados como `conflicto=true`. El levantamiento no se puede aplicar al inventario mientras existan conflictos. El ADMIN debe llamar `POST /conciliar` con `mantenerItemId` (el ítem a conservar) y, opcionalmente, `cantidadManual` (si ninguno de los dos conteos es correcto). El ítem elegido queda con `conflicto=false`; los hermanos se eliminan con registro de auditoría.

### Limitaciones y pendientes

- La migración SQL requiere ejecutar `prisma migrate deploy` en el entorno de staging/producción. No se ejecutó contra la base cloud.
- Pruebas de integración con PostgreSQL real no incluidas en esta rama (requieren base de pruebas aislada).
- Las pruebas de frontend (Vitest/JSDOM) no cubren el componente multiusuario aún — los componentes `ParticipantesBanner` y `ConflictosPanel` son funciones puras testeables si se agrega un suite de componentes.
- La validación `prisma validate` falló en el entorno cloud por bloqueo de red al CDN de Prisma; el schema fue validado manualmente con script Python.

### Para crear el PR

```bash
git push origin feat/levantamiento-multiusuario
gh pr create --base main --title "feat(levantamientos): conteo multiusuario seguro" \
  --body "Ver docs/CONTEXTO_MAESTRO.md sección 2026-10-08"
```
