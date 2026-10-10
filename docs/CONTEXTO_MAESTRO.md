# FerreSystem — contexto maestro y continuidad entre agentes

Última revisión: **2026-10-10, America/Tegucigalpa** — implementación P1 de operaciones en `claude/p1-operaciones` desde `main` `7ccfad25` (ver bloque siguiente). El bloque de continuidad POS se conserva debajo. Las bitácoras anteriores se conservan como fotografías fechadas y no sustituyen el estado de Git.

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

## P1 operaciones — implementación (2026-10-10, rama `claude/p1-operaciones`)

- **Base:** `main` `7ccfad25`. Rama nueva; sin merge, sin despliegue, sin migraciones productivas. No se tocaron `POSPage.tsx`, contingencia, sincronización, service worker ni IndexedDB (trabajo del agente POS en `claude/pos-offline-*`).
- **Migración nueva (aditiva):** `backend/prisma/migrations/20261010140000_productos_proveedores` (tabla `productos_proveedores`). Modelo Prisma añadido en `schema.prisma` con relaciones inversas en `Producto` y `Proveedor`; no se reformateó el archivo. Aplicar con `prisma migrate deploy` tras copia de seguridad y autorización; **no** usar `prisma migrate dev` contra producción (drift de tablas heredadas). Las listas explícitas de migraciones de `ventas.postgres.integration.ts` y `reportes-zona-horaria.postgres.integration.ts` incluyen esta migración.

| Ítem | Estado | Commit | Evidencia |
|---|---|---|---|
| FS-14 Menú y ruta de Clientes vs. 403 | Corregido | `b5657475`, `73da8cbe` | Clientes solo ADMIN en menú y ruta; `GET /clientes/buscar` admite VENDEDOR (sin saldos ni límites). `taskNavigation.test.mjs` y `navigation-settings.spec.ts` 41/41 |
| FS-18 Auditoría de crédito de clientes | Corregido | `c4566f91` | `CLIENTE_CREDITO_EDITAR` con antes/después en la misma transacción; fallo forzado de auditoría revierte el cambio. `clientes-credito-auditoria.postgres.integration.ts` 4/4 |
| FS-10 Rubro del negocio solo Super Admin | Parcial | `f54b7542` | ADMIN recibe 403 al cambiar `configuracion.rubro`; reenviar el valor vigente sigue permitido. **Pendiente:** idioma por empresa y ocultar selector en ADMIN/CAJERO |
| Proveedores asociados a producto (alta, código, preferido, último costo) | Implementado | `6b5ae8c4`, `9c53c524` | `GET/PUT/DELETE /operaciones/productos/:id/proveedores/:proveedorId`; la recepción asocia el proveedor y guarda último costo (sube y baja) sin cambiar costo vigente ni historial. `productos-proveedores.postgres.integration.ts` 9/9; mutación (sin hook) hace fallar 4 pruebas |
| Compra al contado (D1) | Implementado | `8fab4105` | `pagoContado` en `POST /operaciones/compras`; pago en la misma transacción, sin caja (FS-09), solo ADMIN, reintento sin doble pago. `compras-contado.postgres.integration.ts` 7/7 |
| Estado de cuenta de cliente | API implementada, sin pantalla | `cb41e8dd` | `GET /operaciones/clientes/:id/estado-cuenta` (solo ADMIN): cuentas CXC, abonos, vencimiento por día de negocio y conciliación con el saldo del cliente. `estado-cuenta-cliente.postgres.integration.ts` 3/3 |
| Resumen administrativo para iPhone | Implementado | `024f4f45` | Ruta `/admin-movil` (solo ADMIN): ventas del día, cajas abiertas, existencias bajo mínimo, clientes con saldo, CxP a 7 días, solicitudes pendientes, reportes. `resumen-movil.test.mjs` 6/6; `admin-movil-simulado.spec.ts` 3/3 a 390 px (backend simulado) |
| Restricción de módulo en rutas de inventario | Corregido | `9c53c524` | Un commit anterior había desplazado `@RequiredModule('inventario')` del historial; regresión detectada por `operation-modules.http.spec.ts` |

**Segunda ronda (2026-10-10, PR #127, sin merge):**

| Ítem | Estado | Evidencia |
|---|---|---|
| Pantalla de proveedores por producto | Terminado | `frontend/src/components/ProveedoresProductoPanel.tsx`, dentro de la ficha de producto. E2E `p1-operaciones-simulado.spec.ts` (alta con código y preferido; error de inactivo) |
| Compra al contado y fuente del pago | Terminado (ADMIN) | Selector en Órdenes de compra. Fuente declarada en pantalla: fondos administrativos, **no caja**. El backend nunca descuenta caja (FS-09). E2E: payload con `pagoContado`; BODEGUERO sin selector |
| Estado de cuenta de clientes | Terminado (ADMIN) | `/estado-cuenta-clientes` + ítem de menú. Saldo, límite, conciliación, vencidas y abonos. E2E ADMIN; CAJERO y VENDEDOR sin acceso |
| Permisos del estado de cuenta y buscador | Revisado | Estado de cuenta solo ADMIN (403 a CAJERO, BODEGUERO, VENDEDOR). Buscador a VENDEDOR: conjunto exacto `codigo, creditoHabilitado, id, nombre, numeroCliente, rtn, telefono`; sin saldo, límite, correo ni dirección. Prueba PG negativa |
| Admin móvil (sin POS offline) | Terminado en su alcance | Accesos a estados de cuenta, inventario, cuentas y arqueo. Sigue sin prueba en iPhone físico |
| Compatibilidad con `claude/pos-offline-backend` | Analizada, **no integrada** | Ver bloque siguiente |

**Compatibilidad con `claude/pos-offline-backend` (no fusionada):**
- Su migración `20261011000000_pos_contingencia_offline` crea 4 tablas nuevas y hace `ALTER TABLE ventas`. No toca tablas que cambia esta rama, y su nombre no choca con `20261010140000_productos_proveedores`.
- El esquema choca **textualmente** al fusionar: ambos añaden modelos al final de `schema.prisma`. Resolución: conservar los dos bloques. Verificado en un worktree desechable; no se incorporó nada.
- Las listas explícitas de migraciones de `ventas.postgres.integration.ts` y `reportes-zona-horaria.postgres.integration.ts` también chocan. Al integrar, deben incluir **las dos** migraciones nuevas.
- `CONTEXTO_MAESTRO.md` choca al fusionar. Resolver a mano, sin borrar bloques de ninguno.
- Su migración altera `ventas`; su DBA debe revisar ambas en orden antes de `migrate deploy`.

**Regresión encontrada y corregida:** el panel nuevo llamaba `GET /operaciones/productos/:id/proveedores`, que el simulador de edición de productos no conocía. Fallaban 9 pruebas E2E. Corregido en `productos-edicion.spec.ts`.

**Pruebas ejecutadas (2026-10-10, entorno local):**
- Backend unitarias: **330/330** (`npx vitest run`).
- Integración PostgreSQL 16, cadena completa de migraciones, usuario no root: suite completa **19 archivos, 336 aprobadas, 1 omitida**, sin fallos. Ejecutada antes del último commit (`cb41e8dd`); ese archivo se verificó aparte (3/3).
- Frontend unitarias: **191/191** (`node --test test/*.test.mjs`); `tsc -b` correcto; `oxlint` sin errores en archivos tocados (avisos `set-state-in-effect` del patrón existente).
- Segunda ronda: integración PostgreSQL **20 archivos, 340 aprobadas, 1 omitida**; backend unitarias **330/330**; frontend unitarias **191/191**; Playwright Chromium **116/116** (incluye 7 E2E nuevas).
- Playwright Chromium: **109/109** tras ajustar `navigation-settings.spec.ts` (con FS-14, el grupo "Clientes y cobros" del cajero ya no aparece con un solo ítem). Las E2E usan backend simulado: validan interfaz y contrato, no persistencia.

**Clasificación de módulos (Fase 6):**
- Garantías: **parcialmente funcional** (flujo real verificado en `main` según sección de garantías; oculto en menú por `PENDING_MODULES`).
- Devoluciones y crédito: **funcional y verificado** en PostgreSQL (suites de crédito y devoluciones).
- Reportes administrativos: **funcional y verificado** en PostgreSQL (zona horaria de negocio).
- Comisiones: **bloqueado por decisión de negocio**. La pantalla usa estado en memoria, periodo fijo de marzo 2026 y no hay backend ni modelo; falta definir la base de cálculo.
- Apartados, transferencias (sin modelo de sucursal), pedidos especiales y listas de precio: **pendientes**, ocultos en menú. Transferencias además **bloqueada por sucursales**.

**Pendientes y dependencias (no tocados por no ser ámbito de este trabajo o por requerir decisión):**
1. **FS-15** venta sin vencimiento por defecto y **FS-20** límite de descuento inconsistente: dependen del POS (`POSPage.tsx`, ventas). Propuesta de integración separada para el agente POS.
2. **FS-13** recibo sin datos fiscales y rótulo de crédito: POS/recibo; mismo bloqueo.
3. **FS-16** comisiones: decisión de negocio sobre base y periodo; luego modelo y API.
4. **FS-17** sucursales ficticias en Usuarios: no hay modelo de sucursal; quitar las opciones falsas es corrección pendiente de autorización.
5. **FS-10** idioma por empresa y selector solo en configuración del Super Admin.
6. Pantalla de estado de cuenta de cliente (existe API).
7. Pantalla de proveedores por producto dentro de la ficha de producto (existe API). Sin UI.
8. Compra al contado sin selector en la pantalla de compras (existe API).
9. Hallazgos antiguos que siguen abiertos fuera de este alcance: `coberturas_garantia` no figura en las listas explícitas de migraciones de ventas y reportes.

**Riesgos:** pruebas E2E con backend simulado; el resumen móvil no se ha probado en iPhone físico; la migración requiere revisión de DBA antes de aplicarse.

---

## POS offline de contingencia (efectivo) — implementación y pruebas (2026-10-10)

- **Ramas/commits:** `claude/pos-offline-contingencia` (diseño y caracterización, `e30e9a1c`); `claude/pos-offline-backend` (esquema, migración aditiva, servicio, controlador, pruebas PostgreSQL y frontend offline: `4eacd14c` y `cd1dfaf9`). Sin merge, migración en producción ni despliegue.
- **Activación:** apagada por defecto. Requiere `POS_OFFLINE_ENABLED=true` en el entorno **y** `configuracion.contingenciaOffline.habilitada` por empresa (la activa un ADMIN). Sin ambas, el backend responde 403/409.
- **Alcance implementado (solo efectivo):** ventana de contingencia con instantánea de precios y cupo conservador (50 % de lo libre por defecto); una caja de contingencia por empresa (`dispositivosMax=1`); diario local en IndexedDB con confirmación solo tras transacción completa; correlativo local `CT-NN-NNNN` y definitivo `V-NNNNNNNN`; sincronización idempotente por UUID; conflictos en revisión sin rechazo silencioso; referencia de factura externa (no es numeración fiscal).
- **Backend:** `backend/src/contingencia/` (controlador `/contingencia/*`, servicio, DTOs). Migración `20261011000000_pos_contingencia_offline`: 4 tablas nuevas, columnas aditivas en `ventas`, trigger que impide UPDATE y DELETE de la carga recibida. `backend/src/common/dinero.ts` comparte vectores con el frontend.
- **Frontend:** `src/offline/` (db, journal, sync, ventana, money), `pages/PosContingenciaPage.tsx` (ruta `/pos-contingencia`), `pages/ContingenciaAdminPage.tsx` (ruta `/contingencia-admin`, ADMIN), `public/sw.js` (shell y recursos del build; la API nunca se cachea; sin `skipWaiting`). Se corrigió `utils/authInterceptors.ts`: un refresh sin respuesta de la API ya no borra la sesión.
- **Decisión de diseño:** la secuencia y el correlativo duplicados no se rechazan: se conservan y quedan en revisión (`SECUENCIA_DUPLICADA`).
- **Pruebas ejecutadas (2026-10-10):**
  - Backend unitarias: **344/344** (36 archivos). `tsc -p tsconfig.build.json` sin errores.
  - Backend integración PostgreSQL 16 como usuario no root, cadena completa de migraciones: `test/contingencia.postgres.integration.ts` **23/23**; suite completa **17 archivos, 339 pasan y 1 omitida** (origen de la omisión no identificado en esta sesión). Se corrigieron las listas explícitas de migraciones de `ventas` y `reportes-zona-horaria`, que ya no incluían las migraciones nuevas.
  - Frontend unitarias: **218/218** (incluye `offline-logica.test.mjs` y la caracterización). `tsc -b` y build de producción correctos. Lint sin errores (avisos del mismo tipo que ya existían).
  - E2E real con backend NestJS, PostgreSQL temporal y navegador Chromium con IndexedDB y service worker reales: `frontend/e2e-real/contingencia-real.spec.ts` **13/13** (en línea, sin conexión, reconexión, reinicio con pendientes en perfil persistente, dos pestañas, recuperación de operación "enviando", pérdida de respuesta, cambio de precio durante la desconexión, conflicto de stock aceptado por el administrador, caja cerrada, sesión vencida, panel, exportación sin credenciales). Suite `e2e-real` completa: **28/28**.
  - Suite de navegador con backend simulado: **106/106**.
- **Pruebas no realizadas (límites declarados):**
  1. Timeouts de red reales: no se simularon; solo cortes de red del navegador.
  2. Apagón eléctrico y reinicio de Windows: no ejecutados. La durabilidad de IndexedDB ante corte de energía **no está demostrada**. El protocolo está en `docs/POS_CONTINGENCIA_PROTOCOLO_APAGON.md` (estado: no ejecutado).
  3. iPhone/Safari y PWA instalada: no probados en dispositivo. El panel móvil se probó solo en viewport de escritorio.
  4. Actualización del service worker tras una versión nueva: no probada.
  5. Límite de cuota de almacenamiento lleno: no probado en navegador real.
- **Bloqueos y decisiones pendientes (no resueltos por mí):**
  - **D1 fiscal:** la leyenda y el procedimiento de comprobante de contingencia requieren aprobación del responsable fiscal antes de activar en clientes reales. El sistema no emite numeración fiscal ni CAI.
  - Límites por defecto (cupo 50 %, L 5 000 por venta, L 25 000 acumulado, vigencia 36 h) pendientes de decisión del propietario.
  - Una caja de contingencia por empresa (`dispositivosMax=1`): ampliar requiere decisión.
  - Prueba física con UPS, corte controlado y firma de resultados (sección 7 del protocolo).
- **Pendientes técnicos:** PR de revisión (borrador); coordinación con las ramas de Claude en `POSPage.tsx` (no modificado) y `ventas.service.ts` (no modificado); interfaz en inglés pendiente (textos en español).

---

## Integración QA P1 + contingencia POS (2026-10-10, rama `claude/integracion-pos-offline-p1`)

- **Estado:** integración técnicamente verificada en rama temporal; **NO aprobada para producción**. Sin merge a `main`, sin despliegue, sin migraciones productivas.
- **Base y commits:** `main` `7ccfad25`; `1deb3117` (#127 P1 operaciones, `claude/p1-operaciones`); `f281be62` (#128 contingencia, `claude/pos-offline-backend`); resolución de conflictos `2ab05cd0`; `99df299c` (costo de la ventana, timeout de sincronización, pruebas); `5c5df9bb` (asociación producto–proveedor en contingencia; mock del panel de proveedores en FS-07); `6f683331` (matriz de QA); #127 avanzó a `caa5aa15` y se integró en `a4cda7e3` (sin conflictos; mock duplicado retirado en `f2f4b44e`; `productos-edicion` 16/16 y frontend 224/224 tras la integración).
- **Conflictos resueltos:** `schema.prisma` (ambos modelos conservados, sin `prisma format`), `App.tsx` (rutas `/pos-contingencia`, `/contingencia-admin`, `/estado-cuenta-clientes`, `/admin-movil`, `/cuentas` conviven), listas de migraciones en `ventas` y `reportes-zona-horaria`, `CONTEXTO_MAESTRO.md` (dos secciones conservadas).
- **Defectos corregidos en la integración:** el costo de una venta offline se tomaba al sincronizar (ahora, el de la ventana); sincronización sin timeout (ahora 20 s por llamada); la caja no veía la decisión del administrador (`refrescarRevisiones`); 9 fallos de FS-07 por una petición del panel P1 no interceptada en la suite simulada.
- **Pruebas ejecutadas sobre `5c5df9bb`:**
  - Backend unitarias 345/345; integración PostgreSQL 16 como `nobody` 366/366 con `REAL_SETTINGS_BROWSER=1` (la prueba opt-in de Chromium real pasa 16/16). Contingencia 25/25 sobre el commit final.
  - Frontend unitarias 224/224; `tsc -b`, build y lint sin errores.
  - E2E real (`frontend/e2e-real/run.sh`, PostgreSQL temporal, API real, Chromium): 29/29; contingencia 14/14.
  - E2E con backend simulado: 118/118.
- **Lo que no se ejecutó (no declarar aprobado):** Windows (Chrome/Edge, durabilidad IndexedDB, reinicio), iPhone/Safari y PWA instalada, apagón eléctrico real (`docs/POS_CONTINGENCIA_PROTOCOLO_APAGON.md`, sin ejecutar), cuota de almacenamiento real (la prueba simulada inyecta `QuotaExceededError`), timeouts de red reales en la tienda, cámara y códigos impresos. Detalle en `docs/POS_INTEGRACION_QA_MATRIZ.md` §7.
- **Riesgos abiertos:** D1 fiscal (sin aprobación del responsable); límites por defecto (L 5 000 / L 25 000 / cupo 50 % / 36 h) pendientes de decisión; caja única por empresa (`dispositivosMax=1`); rutas nuevas sin entrada en el menú (solo por URL); textos de contingencia solo en español.
- **Pendientes:** PR de integración en borrador hacia `main` (no fusionar sin aprobación); si #127 o #128 cambian, repetir la integración desde su nuevo commit.

## CENTINELA — cierre de seguridad y protección de producción (2026-10-10, rama `claude/centinela-cierre-produccion`, sin merge)

- **Veredicto:** GO para integrar; **NO-GO para producción**.
- **Hallazgo CRITICAL:** `backend/prisma/seed.ts` tenía una credencial fija de Super Admin (presente también en el historial de git y en `main`), y el README afirmaba una guardia de producción que no existía. Corregido en código: sin claves por defecto, sin escritura en producción ni en hosts remotos sin confirmación, sin sobrescribir Super Admins. **Pendiente del dueño:** confirmar y rotar si la clave estuvo activa en algún entorno.
- **Controles de CI:** `backend/scripts/verificar-migraciones.mjs` (job `guard-base-datos`): bloquea `db push`, `migrate dev/reset`, `db seed` y `--accept-data-loss` en ejecutables; exige aprobación explícita para SQL destructivo en migraciones nuevas; hace inmutables las migraciones publicadas. Pruebas 8/8. `.github/CODEOWNERS` protege base de datos, despliegue y seguridad.
- **Deriva:** #129 no añade deriva propia tras #138; la de `main` (219 líneas) sigue abierta. Informe para el responsable de base de datos: `docs/CENTINELA_INFORME_DBA_DERIVA_20261010.md`. Evidencia regenerada y verificada por hash en `docs/evidencias/deriva-main-20261010/`.
- **TRUST_PROXY:** pendiente de prueba real en staging autorizado. Se revirtió la cabecera añadida sin verificación en `deploy/local/compose.yaml`.
- **Cierre de sesión con IndexedDB:** escenarios E1–E9 documentados (`docs/agentes/ESCENARIOS_CIERRE_SESION_INDEXEDDB.md`), no implementados. Coordinación con ATLAS y FARO pendiente: no había agentes activos. Decisión de producto pendiente sobre la propiedad de la cola (E5).
- **Identidades:** propuesta de registro en `AGENTS.md` sin reemplazar texto existente (`docs/agentes/REGISTRO_IDENTIDADES_AGENTS_PROPUESTA.md`); no aplicada.
- **Pruebas:** unitarias 357/357; scripts 21/21; build de producción sin errores. Integración PostgreSQL y E2E no repetidos en esta fase tras los cambios de seed (no afectan a los tests).
- **P0 — CI en PR de integración (2026-10-10):** el check `guard-base-datos` fallaba en #137 y #138 con `MODULE_NOT_FOUND`: el workflow se portó pero no el script. Corregido con `f7623e17` (#137) y `dd19439c` (#138), que añaden `verificar-migraciones.mjs` y su prueba sin cambios. Guard probado en local con ambas bases: correcto. **Pendiente:** confirmar el run nuevo en GitHub. La rama de ATLAS `claude/integracion-pos-offline-p1` sigue con el workflow antiguo; sin coordinación no se toca.
- **P0 — protección de ramas y checklist:** `docs/CENTINELA_PROTECCION_RAMAS_Y_CHECKLIST_20261010.md` (ruleset, checks requeridos `validate` y `guard-base-datos`, verificación con `gh api` de solo lectura, lista para Render, Vercel y Supabase). Configuración real en GitHub, Render, Vercel y Supabase **no verificada**: requiere acceso del propietario (B1–B6 del documento).
- **P0 — PR #141 (NEXUS), revisión de relaciones entre tenants:** solo cambia `schema.prisma` y añade una prueba; no añade migraciones. Las relaciones nuevas son FK de una sola columna (`apartados.cliente_id`, `garantias.venta_id`, `transferencias.usuario_id`, `cierres_comisiones.vendedor_id`, `clientes.lista_precio_id`, etc.): la base ya las tiene así, por lo que #141 **no introduce** el riesgo, pero lo deja declarado. Una FK de una columna no garantiza que ambas filas pertenezcan al mismo `tenant_id`. Riesgo real: un identificador de otra empresa aceptado por la base. Mitigación propuesta a NEXUS: FK compuestas `(tenant_id, id)` en una migración futura con revisión. No se modificó #141.
- **Pendientes P0 sin cerrar:** endpoints financieros de BALANCE (p. ej. #135) y de ATLAS (#140) respecto a roles y aislamiento, no revisados en esta fase.
- **P0 — estado final de CI (2026-10-10):** #138 `validate` y `guard-base-datos` **success**. #137 `guard-base-datos` **success**, `validate` **failure** por `frontend/e2e/contingencia-simulado.spec.ts:295`, test añadido por `1efe6146` (ATLAS) que falla también en su base `c5fe4982` sin cambios de #137 (reproducido en local). #137 y #138 pasados a **borrador**; no fusionar. Lo registrado en `mergeable_state: unstable` sugiere que `validate` no es requerido en la regla: pendiente de confirmar por el propietario.
- **P0 — contratos de ATLAS (`operaciones`, solo lectura):** `POST ventas/:id/entregar` acepta CAJERO, el contrato no; `GET entregas` muestra pedidos de todo el tenant a CAJERO, el contrato pide «sus ventas»; idempotencia de `movimientos_caja` global por id (409 confirma existencia entre empresas, P2). Comunicado a ATLAS en #129; no modificado. Sin sesión de ATLAS accesible.
- **P0 — FK compuestas para NEXUS:** lista priorizada P1/P2 en `docs/CENTINELA_FK_COMPUESTAS_PARA_NEXUS_20261010.md`. No se crean migraciones.
- **P0 — cuentas demo:** procedimiento de auditoría, rotación e invalidación de sesiones, sin ejecución, en `docs/CENTINELA_CUENTAS_DEMO_Y_SESIONES_PROCEDIMIENTO_20261010.md`.
- **Contratos de KARDEX, FORJA y BALANCE:** no encontrados en el repositorio en las ramas revisadas. Solo aparecen en `docs/POS_ENTREGA_CONTRATOS.md`, de ATLAS. Pendiente de los agentes responsables.

---

## Autenticación fase 3 — límites de intentos, sesiones revocables y rotación (2026-10-10, rama `claude/security-audit-fase-3`, [PR #133](https://github.com/Nelosama/FerreSystem/pull/133) sin merge)

- **Base:** `claude/security-audit-fase-2` (PR #132) + merge de `origin/claude/integracion-pos-offline-p1` `58941e5d`. No se modificaron PR existentes; no hay merge, despliegue ni migraciones productivas. Detalle y procedimientos: [AUTENTICACION_FASE3_SESIONES_20261010.md](AUTENTICACION_FASE3_SESIONES_20261010.md).
- **Límite de intentos:** por cuenta (5 fallos / 15 min → bloqueo 15 min) y por IP (100 / 15 min), en `intentos_login` con clave hasheada y contadores atómicos. Respuesta 429 con `Retry-After`, igual para correos existentes e inexistentes. Aplica a login de tenants y de Super Admin (`auth/login-rate-limit.ts`).
- **Proxy:** `TRUST_PROXY=1` en Render es obligatorio; sin él todos los usuarios comparten la IP del proxy y el límite por IP puede bloquear a toda la tienda.
- **Sesiones revocables:** tabla `sesiones_auth`; `sid` en access y refresh; la estrategia JWT revalida sesión, sujeto, revocación y vencimiento en cada petición. Logout revoca la sesión del cookie y del Bearer (incluye soporte). Cambio de contraseña y desactivación revocan todas las sesiones del usuario. El refresh no rota (evita romper pestañas concurrentes).
- **Transición de tokens:** en producción se rechazan por defecto; aceptarlos exige `AUTH_ACEPTAR_TOKENS_SIN_SESION=true` y `AUTH_TOKENS_SIN_SESION_HASTA` (máximo 24 h, evaluado en cada petición). Refresh previos a #132 y de #132 se rechazan: un inicio de sesión por usuario.
- **Rotación de `JWT_SECRET`:** sin doble clave; cierre planificado de sesiones (SQL en el documento) y cambio del secreto.
- **Contingencia offline:** verificado en frontend (`offline/sync.ts`) y backend: el 401 deja la operación `PENDIENTE` en IndexedDB, el logout no la borra y el UUID es idempotente. Prueba PostgreSQL del lote tras cerrar y reabrir sesión.
- **Migración nueva (requiere DBA):** `20261012000000_autenticacion_sesiones_intentos`. Aditiva: dos tablas nuevas, sin cambio de filas. Reversión: DROP de ambas tablas. Añadida también a la lista de migraciones de `test/ventas.postgres.integration.ts`, que usa una lista fija.
- **Pruebas:** `test/autenticacion-fase3.postgres.integration.ts` 25/25; unitarias 349/349 (specs de auth y super admin con mocks actualizados); integración PostgreSQL completa 24 archivos, 412 aprobadas, 1 omitida (ejecutada como usuario no root).
- **Pendientes:** limpieza de `sesiones_auth` e `intentos_login` (job); rotación de refresh con detección de reutilización (requiere ventana de gracia); logs de login con correo (R-08); confirmar `NODE_ENV=production`, `JWT_SECRET` y `TRUST_PROXY` en Render antes del despliegue.
- **Validación final de integración (2026-10-10, rama `claude/integracion-seguridad-fase3`, SHA `6fd97849`):** sobre la integración `6373692f` de #129. Unitarias backend 357/357; integración PostgreSQL 418 aprobadas (1 omitida); E2E real 29/29; E2E simulado 120/120; frontend unitarias 224/224. Transición de tokens sin sesión con fecha límite obligatoria en producción (máximo 24 h). Veredicto: **GO para integrar en la rama de integración; NO-GO para producción** hasta verificar `TRUST_PROXY` en Render y revisar la deriva de esquema preexistente de #129. Detalle: [VALIDACION_FINAL_SEGURIDAD_INTEGRACION_20261010.md](VALIDACION_FINAL_SEGURIDAD_INTEGRACION_20261010.md).
- **Coordinación:** archivos compartidos tocados: `main.ts` (trust proxy y validación), `usuarios.service.ts` (revocación), `schema.prisma` (dos modelos al final), `ventas.postgres.integration.ts` (lista de migraciones). No aparecen en #130 ni #131 al revisar sus archivos; no hubo agentes activos con los que coordinar en vivo.

---

## Auditoría de seguridad fase 2 (2026-10-10, rama `claude/security-audit-fase-2`, [PR #132](https://github.com/Nelosama/FerreSystem/pull/132) sin merge)

- **Base:** `origin/claude/integracion-pos-offline-p1` `bc0a0125` (PR #129). No se modificó #127, #128 ni #129; no hay merge, despliegue ni migraciones. Informe completo y matriz: [AUDITORIA_SEGURIDAD_FASE2_20261010.md](AUDITORIA_SEGURIDAD_FASE2_20261010.md).
- **Corregido (reproducido antes con PostgreSQL real o prueba unitaria):**
  - SEC-01 HIGH: `costo_unitario` llegaba a VENDEDOR (`GET /operaciones/ventas/buscar`) y a BODEGUERO sin `inventario.ver` (`GET /operaciones/entregas`). `common/interceptors/cashier-response.interceptor.ts` aplica ahora la regla de `canReadProductFinancials`.
  - SEC-02 MEDIUM: BODEGUERO leía `/ventas` y `/cotizaciones` (datos de clientes). `ventas.controller.ts` y `cotizaciones.controller.ts` restringen a ADMIN, CAJERO y VENDEDOR.
  - SEC-03 MEDIUM: refresh token aceptado como token de API. Refresh con `typ: 'refresh'` (`auth.service.ts`, `super-admin.service.ts`); `jwt.strategy.ts` lo rechaza.
  - SEC-04 MEDIUM: Super Admin desactivado conservaba acceso. `jwt.strategy.ts` revalida `superAdmin.activo`.
  - SEC-05 LOW: login revelaba cuenta inactiva o empresa suspendida sin contraseña correcta. `auth.service.ts` verifica la contraseña primero.
- **Verificado sin hallazgo:** aislamiento entre empresas en ventas, historial, cotizaciones y ajustes de existencias (404 o rechazo); la hipótesis de costo en `ventas.findById` y `formatCotizacion` se descartó porque remapean detalles.
- **Pruebas:** `test/seguridad-fase2.postgres.integration.ts` 16/16 (era 6 fallos reproducidos); `src/auth/auth.security.spec.ts` 4/4 (era 2 fallos). Backend unitarias 349/349. Integración PostgreSQL 22 archivos, 381 aprobadas, 1 omitida (línea base 365 aprobadas, 1 omitida). `tsc -p tsconfig.build.json` y `oxlint` limpios en archivos tocados. Ejecutar integración como usuario no root (`runuser -u nobody`) porque initdb no corre como root.
- **Ajustes de fixtures existentes:** `auth.service.spec.ts`, `super-admin.service.spec.ts` (refresh con `typ`) y `productos-security.http.spec.ts` (mock de `superAdmin`).
- **Pendientes y riesgos:** R-01 refresh tokens previos al despliegue válidos como bearer hasta 7 días (rotar `JWT_SECRET` o esperar); R-02 sin limitación de intentos en `/auth/login`; R-03 logout sin revocación (requiere `tokenVersion`); R-04 costo manual ADMIN/BODEGUERO (decisión D1); R-05 VENDEDOR ve ventas y cotizaciones de toda la empresa (decisión de negocio). Detalle en el informe.
- **Coordinación:** los archivos tocados no aparecen en #127 a #131. #131 también modifica este documento; posible conflicto de texto al integrar. Confirmar con el dueño antes de merge.
- **No verificado:** producción (Render/Supabase), respaldos y configuración real de `NODE_ENV` y `JWT_SECRET` en Render (R-09, R-10).

---
## Validación final de preproducción POS offline — PR #129 (2026-10-10)

- **Estado:** candidato técnicamente validado para **piloto controlado interno**. **NO-GO** para clientes reales hasta D1 fiscal, decisiones comerciales y pruebas físicas. Sin merge, despliegue ni migración productiva. Detalle: `docs/POS_PILOTO_QA_FINAL.md`; checklist físico no ejecutado: `docs/POS_PILOTO_CHECKLIST_FISICO.md`.
- **Procedencia:** #127 integrado hasta `caa5aa15` y #128 hasta `f281be62` (ancestros verificados en `HEAD`). Commit de esquema y prueba de flujo: ver `git log` de la rama tras esta sección.
- **Migraciones:** 15/15 aplicadas en orden sobre PostgreSQL 16 limpio, 0 fallidas. Deriva de las tablas nuevas: solo nombres de restricciones, salvo una diferencia de comportamiento corregida (`onDelete: Restrict` en `operaciones_contingencia.venta`). La deriva de `main` (~170 líneas, preexistente) obliga a usar solo `migrate deploy` tras `migrate:inspect` y respaldo.
- **Defecto corregido en esta validación:** FK `operaciones_contingencia.venta` con `SetNull` implícito frente a `RESTRICT` en la migración; detectado por `prisma migrate diff`, no por las pruebas.
- **Pruebas nuevas:** `backend/test/piloto-flujo-completo.postgres.integration.ts` (6): flujo completo proveedor → compra → recepción → costo → venta en línea y entrega → contingencia → sincronización → conciliación de inventario y caja → consulta administrativa; y pruebas negativas (permisos, revisión, otro cajero, idempotencia, aislamiento).
- **Resultados (sobre `bc0a0125` salvo indicación):** backend unitarias 345/345; integración PostgreSQL 372/372 (22 archivos, con `REAL_SETTINGS_BROWSER=1`); contingencia + piloto 31/31 tras el cambio de esquema; frontend unitarias 224/224; build con `VITE_API_URL=/api`; lint sin errores; E2E real 29/29 (14 de contingencia); simulada 118/118; respaldo worker 6/6.
- **Riesgo de negocio abierto:** la venta en línea **reserva** stock y se descuenta al entregar (`/operaciones/ventas/:id/entregar`); la venta offline descuenta **de inmediato**. Decidir el procedimiento antes del piloto.
- **No ejecutado:** Windows, Safari/iPhone, apagón real, cuota de disco real, latencia real de la tienda, restauración de respaldo con restic/pg_dump (`FS41_INTEGRATION`). No declarar aprobados.
- **Regla confirmada por el dueño (venta offline = venta normal):** verificada en `docs/POS_PILOTO_QA_FINAL.md` §4b. Corregido: si releer la lista fallaba tras guardar, la UI mostraba «NO se guardó» (`PosContingenciaPage.tsx`). Añadidas pruebas: relectura fallida tras guardar, siguiente cliente con sincronización colgada y salida de inventario `ENTREGA` por operación. Brechas abiertas: comprobante sin líneas de producto y stock central desfasado hasta sincronizar.

## Continuidad POS y sincronización — auditoría y propuesta (2026-10-10)

- **Base comprobada:** `main` y `origin/main` `5eae989dfab0ea04cc6861406ec30df459ae16c2`, checkout principal limpio; fetch realizado. Al iniciar, PR #122 abierto (`fix/qa-clientes-cajero`). Trabajo de Claude en Clientes/POS/permisos protegido; no se cambian esos archivos ni se abren PRs de implementación.
- **Rama/PR:** `codex/docs-alta-disponibilidad`, worktree independiente; [PR #125](https://github.com/Nelosama/FerreSystem/pull/125) abierto, sin merge. Propuesta en commit `67d7bcf6`. Solo documentación. Informe: [ARQUITECTURA_CONTINUIDAD_POS_20261010.md](ARQUITECTURA_CONTINUIDAD_POS_20261010.md), con auditoría de las ocho preguntas, diagrama Mermaid, matriz de fallas, riesgos, sincronización, respaldos, fases, archivos y pruebas futuras.
- **Hallazgos vigentes comprobados en código:** POS guarda borrador y pendiente en localStorage; no catálogo persistente ni service worker. Recuperación por UUID y transacción central ya existen; idempotencia exige `solicitudId`, opcional en DTO. No hay sincronización automática de catálogo. Precio distinto se rechaza para no-ADMIN; ADMIN puede conservar otro precio. Venta reserva stock; entrega reduce físico. `productos.version` no cambia en todos los escritores de existencias. TARJETA/TRANSFERENCIA no acreditan autorización bancaria. Fotos: solo URL, sin servicio LAN implementado.
- **Respaldos:** worker FS-41 sí está en la base auditada: dump, Restic cifrado, readback, restore aislado, retención. No se verificó que esté configurado o funcionando en producción. `deploy/local/compose.yaml` es instalación alternativa sin sincronización con cloud; no usarla como failover automático.
- **Propuesta, no implementación:** nube como autoridad única; fotos opcionales; validación/aceptación explícita de importes; recuperación automática por identidad; polling inicial y luego cursor/outbox transaccional; PWA de consulta/borradores. Ventas offline de efectivo requieren fase separada con cuotas exclusivas, diario durable, conciliación y aprobación fiscal; tarjeta/crédito/numeración fiscal offline bloqueados en el alcance inicial.
- **Pruebas ejecutadas en esta sesión, base sin cambios:** frontend `node --test test/pos-client-credit.test.mjs test/receipt-fiscal.test.mjs` **9/9**; selección por nombre en `test/operaciones.test.mjs` **19/19** (POS/recuperación/devoluciones); backend `node --test scripts/backup-worker.test.mjs` **6/6**. Total seleccionado **34/34**. Handlers, transporte y comandos simulados; no prueban PostgreSQL real, datáfono, apagón físico ni backup externo. No se reutilizan cifras históricas como resultados de esta sesión.
- **Pendientes reales:** revisión de arquitectura y política de precio aceptado; plan/RPO/RTO/presupuesto de infraestructura; responsable de incidentes; inventario de hardware y red; decisión offline solo borrador frente a piloto condicionado. Toda implementación requiere autorización por fase y revisar las ramas de Claude antes de tocar archivos compartidos. Sin migraciones, merge, despliegue ni aceptación del cliente.
- **Bitácora:** lectura del contexto vigente, inspección Git/PR/código y documentación oficial, ejecución de pruebas seleccionadas, propuesta, publicación del PR #125 y actualización de este estado. Verificación documental: enlaces locales y `git diff --check`; diff limitado a los dos documentos. No se afirma CI aprobada ni aceptación de arquitectura.

---

## Fechas de negocio en Apartados, Transferencias, Garantías y Pedidos Especiales (2026-10-10 UTC)

- **Rama:** `fix/fechas-zona-negocio-modulos` (PR #112), desde `origin/main` `2398e45f`. Sin merge ni despliegue.
- **Problema original:** las cuatro pantallas guardaban fechas de negocio con `toISOString()` (día UTC). Entre 18:00 y 23:59 de Tegucigalpa el registro caía en el día siguiente.
- **Corrección de zona:** "hoy" y abonos con `diaCalendarioEnZona()` (`frontend/src/utils/format.ts`). Aritmética de calendario en `frontend/src/utils/fechasNegocio.ts`.
- **Formato visible (nuevo):** `formatearFechaNegocio(dia, locale)` muestra `YYYY-MM-DD` como `9 oct 2026` (es-HN) o `Oct 9, 2026` (en). Formatea con UTC sobre el propio día y no desplaza la fecha. Las cuatro pantallas lo usan con el `locale` de `useI18n`. Los datos guardados no cambian.
- **Garantías en días (decisión funcional definitiva, 2026-10-10):** la vigencia es solo en días calendario. El vencimiento es fecha de venta + días (`vencimientoGarantia` en `frontend/src/utils/garantias.ts`). Se retiró la regla de meses (`sumarMesesCalendario` eliminada de `fechasNegocio.ts`). Se valida un entero entre 1 y 3650; el límite es técnico, no comercial. Registros anteriores con `mesesGarantia` se muestran como meses y **no** se convierten a días.
- **Pruebas:** `frontend/test/fechas-negocio.test.mjs` 11/11 con `TZ=UTC`, `Asia/Tokyo` y `America/Tegucigalpa`. Incluye meses cortos, años bisiestos, fin de año, formato es/en y entradas no válidas. Con la expresión anterior, las pruebas de zona fallan.
- **Frontend completo:** `npm test` 174/174; `tsc -b` sin errores; `vite build` con `VITE_API_URL=/api` correcto; `oxlint` sin errores (avisos `set-state-in-effect` preexistentes).
- **Playwright:** 98/98 con backend simulado, usando `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. El binario por defecto de Playwright (`…-1243`) no está instalado; no se descargó nada.
- **Limitaciones:** datos de ejemplo en `localStorage`; las fechas ya guardadas conservan el día UTC anterior y no se migraron. `AuditoriaPage` y `DevolucionesPage` quedan fuera de alcance. Node local v22; el proyecto declara 24.x.
- **Pendientes:** (1) la página de garantías no está montada en las rutas (`/garantias` sigue como módulo pendiente), por lo que no es operativa; (2) no hay modelo Prisma ni API de garantías; la tabla `garantias` de la migración `20260930000000` tiene otro significado (reclamos) y no se usa; (3) el registro se guarda en `localStorage` de demostración; (4) revisión del PR por el director.

---

## Dashboard — HTTP 500 del resumen (PROD-QA-20261007-01), diagnóstico (2026-10-10 UTC)

- **Ramas/PR:** `fix/dashboard-resumen-500` (PR #111), desde `origin/main` `2398e45f`. Sin merge, despliegue ni acceso a producción.
- **Reproducción:** `backend/test/dashboard.postgres.integration.ts` (2 casos) ejecuta `DashboardService.getDashboardData` contra PostgreSQL 16 aislado con todas las migraciones: negocio vacío, y negocio con ventas de hoy y de ayer, devolución, producto bajo stock y cotización que vence hoy. **Ambos pasan**: el 500 no se reproduce con el código de `main`.
- **Hipótesis principal (no confirmada):** el resumen lee todas las columnas de `Venta`, `Producto`, `Devolucion`, `Cotizacion`, `Usuario` y `Cliente`. Si la base de producción no tiene alguna columna de las migraciones posteriores a la inicial, un `SELECT` falla y el resumen responde 500.
- **Consulta de solo lectura preparada:** `backend/scripts/diagnostico-dashboard-lectura.sql`. Lista las columnas que Prisma selecciona (110) que faltan en `information_schema.columns`, las tablas ausentes y las migraciones de `_prisma_migrations` si existe. Termina con `ROLLBACK`. Validado en un clúster temporal con todas las migraciones: 0 faltantes; con `devoluciones.reembolso` eliminada, la detecta. No se ha ejecutado en producción.
- **Pendiente:** ejecutarla en producción con un usuario de solo lectura y autorización del responsable. Si faltan columnas, la corrección es aplicar la migración que falta, no ocultar el error con un `try/catch`.

---

## Auditoría y Devoluciones — instantes en zona de negocio (2026-10-10 UTC)

- **Rama:** `fix/fechas-negocio-auditoria-devoluciones`, desde `origin/main` `2398e45f`. Independiente de PR #112. Sin merge ni despliegue.
- **Defecto:** `AuditoriaPage` y `DevolucionesPage` mostraban `created_at` con `toLocaleString('es-HN')` sin zona. La hora dependía del navegador: una venta a las 20:30 de Tegucigalpa se veía a las 02:30 del día siguiente en un equipo configurado en UTC.
- **Corrección:** `formatInstanteNegocio(value)` en `frontend/src/utils/format.ts` fija `America/Tegucigalpa`. Lo usan ambas pantallas.
- **Pruebas:** `frontend/test/auditoria-devoluciones-zona.test.mjs` (3 casos, varias zonas de navegador). Con la zona eliminada, la prueba falla (`TZ=UTC`). `devoluciones-recovery.test.mjs` mockea `../utils/format`; se añadió el nuevo helper al mock.
- **Verificación:** `npm test` 166/166; `tsc -b` y `vite build` correctos; `oxlint` sin errores; Playwright 98/98 (con `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` del Chromium instalado).
- **Limitaciones:** el backend de auditoría y de devoluciones no se cambió; no se verificó con PostgreSQL en este PR. Las pantallas que usan fechas de calendario (`YYYY-MM-DD`) no se tocan aquí.

---

## Garantías — módulo operativo por factura (2026-10-10 UTC)

- **Rama/PR:** `feat/garantias-produccion`, dependiente de PR #118 (`feat/garantias-dias`). Sin merge ni despliegue.
- **Decisión funcional:** garantías solo en días calendario, de 1 a 3650. El vencimiento es fecha de la factura (día de negocio `America/Tegucigalpa`) más días. Se retiró la regla de meses.
- **Entidad nueva:** `coberturas_garantia` (modelo `CoberturaGarantia`), una fila por línea de factura. **No se reutiliza `garantias`**: esa tabla registra reclamos (`RECIBIDO → … → RECHAZADO`, con `motivo_falla` obligatorio y `cliente_nombre` como texto) y no tiene modelo Prisma. Sus datos no se modifican.
- **Migración:** `backend/prisma/migrations/20261010120000_coberturas_garantia/migration.sql`. Solo crea tabla, índices, FK, CHECKs y un trigger de integridad. No altera tablas existentes.
- **Integridad en PostgreSQL:** `dias_garantia` entre 1 y 3650; `fecha_vencimiento = fecha_venta + dias_garantia`; `UNIQUE(tenant, línea)` y `UNIQUE(tenant, solicitud)`; trigger que rechaza una línea que no pertenece a la factura, un producto distinto del de la línea o una factura de otra empresa.
- **Backend:** módulo `backend/src/garantias/` (`GET /garantias/facturas/:numero`, `GET|POST /garantias/coberturas`, `PATCH /garantias/coberturas/:id`). Crear y editar: solo ADMIN. Consultar: ADMIN y CAJERO. Módulo `garantias`. Registrado en `app.module.ts`.
- **Auditoría:** `GARANTIA_CREAR` y `GARANTIA_EDITAR` con antes/después. Campos `creado_por` y `actualizado_por`.
- **Frontend:** `GarantiasPage.tsx` usa solo la API. Sin `localStorage` ni datos de demostración. Flujo: buscar factura, elegir línea, días, vista previa, guardar. El vencimiento de la vista previa se calcula con la fecha de la factura. El servidor guarda el valor definitivo. Montada en `/garantias`; sigue oculta en el menú (`PENDING_MODULES`).
- **Pruebas:**
  - `backend/test/garantias.postgres.integration.ts`: 35 casos con PostgreSQL 16 y cadena completa de migraciones. Cubre 30/90/180/365 días, cambios de mes y año, bisiesto, factura inexistente, línea ajena, trigger, duplicados, 5 solicitudes concurrentes, permisos por rol, aislamiento entre tenants, auditoría e histórico de `garantias`.
  - Suite de integración completa: 294/294 en 14 archivos. Unitarias backend: 329/329.
  - Frontend: 184/184 unitarias, `tsc`, build y lint sin errores nuevos. Playwright: 106/106. Las 6 pruebas nuevas usan **backend simulado**.
- **Aplicación futura (no ejecutada en producción):** tras copia de seguridad y autorización, `npx prisma migrate deploy` en la base de destino. **No usar `prisma migrate dev` contra producción**: el esquema no mapea tablas existentes (`garantias`, `historial_garantias`, `pedidos_especiales`, etc.), y su diff propondría eliminarlas.
- **Limitaciones:** Playwright con backend real no se ejecutó. No hay verificación en navegador de la app completa con sesión real. Sin modelo de sucursal. Límite de 3650 días técnico. Módulo oculto del menú hasta decisión de habilitación.
- **E2E con backend real (2026-10-10, autorizado):** `npm run test:e2e-real` (`frontend/e2e-real/run.sh`). Levanta PostgreSQL 16 temporal como usuario sin privilegios, aplica `prisma migrate deploy`, comprueba deriva de esquema solo para `coberturas_garantia`, siembra dos empresas, compila y arranca el backend NestJS, construye el frontend y ejecuta Playwright sin `page.route`. Resultado: **11/11**. Cubre creación, persistencia tras recargar, auditoría `GARANTIA_CREAR`/`GARANTIA_EDITAR`, vencimiento, búsqueda por factura, duplicados, 5 solicitudes concurrentes, permisos ADMIN/CAJERO/BODEGUERO, aislamiento entre empresas y vista móvil 390 px.
- **Mutación verificada:** con la escritura del cajero habilitada en controlador y servicio, la prueba real falla (`Expected: 403, Received: 201`).
- **Esquema:** las FK se declaran como relaciones Prisma con los mismos nombres de la migración, para que `prisma migrate dev` no proponga eliminarlas. Se añadieron campos de relación inversa en `Tenant`, `Usuario`, `Venta`, `DetalleVenta` y `Producto` (solo líneas nuevas, sin lógica). Sin reformateo del archivo.
- **Incidente de prueba corregido:** un proceso de la API sobrevivió a una ejecución y respondió en el puerto de la siguiente, con código antiguo. Las pruebas de mutación no llegaron a ejecutarse contra el código alterado. Ahora `run.sh` falla si el puerto está ocupado y lanza la API con `exec`.
- **Pendiente antes de operar:** decidir habilitación en `PENDING_MODULES`; revisar la migración con DBA; aplicar en staging; validar con personal de la ferretería.

---

## Caja y arqueo — implementación para entrega (2026-10-10 UTC)

- **Rama:** `claude/intelligent-cerf-b3ldo0` (designada para esta sesión; partió de `origin/main` `605cb941`, sin cambios de inventario). PR publicado hacia `main` sin merge ni despliegue. Sin producción ni datos reales en las pruebas.
- **Reutilizado sin reescribir:** modelos `Caja`/`MovimientoCaja` (tablas `cajas`, `movimientos_caja`), `openCash`/`cashMovement` de `operaciones/ledger.ts`, ventas (`VENTA_POS`), abonos CxC (`ABONO_CXC` vía `pagar`), devoluciones con reembolso (`DEVOLUCION`), auditoría `auditoria_operaciones`. Pagos a proveedor siguen fuera de caja (FS-09).
- **Implementado** (`backend/src/operaciones/operaciones.service.ts`, bloque `caja`): resumen del turno (fondo, ingresos/egresos en efectivo, efectivo esperado, totales por método con `EFECTIVO`/`TARJETA`/`TRANSFERENCIA`/`CREDITO` informativos); `GET /operaciones/caja` (propio); `GET /operaciones/caja/cierres` (solo ADMIN, filtro por estado); `GET /operaciones/caja/:id` (propio o ADMIN); `POST /operaciones/caja/:id/movimientos` para `INGRESO_MANUAL`/`EGRESO_MANUAL` con permiso `caja.movimientos_manuales` o rol ADMIN, idempotente por `solicitudId` (el id del movimiento), sin salida mayor al efectivo esperado, auditoría `CAJA_MOVIMIENTO_MANUAL` con `autorizacion` (`ROL_ADMIN`/`PERMISO_CAJA`); cierre que exige `notas` cuando hay diferencia, con reintento idéntico idempotente y segundo cierre distinto rechazado.
- **Frontend:** `frontend/src/pages/ArqueoCajaPage.tsx` (+ `.css`), pantalla única: abrir caja, resumen, movimiento autorizado, cierre con diferencia en vivo, comprobante imprimible, historial propio (cajero) o de la empresa (ADMIN). Reintento explícito de la operación pendiente con la misma solicitud. Textos ES/EN en `cash_drawer.*`. Se retiró el modo `caja` de `OperacionesPage` (código muerto). Permiso nuevo `caja.movimientos_manuales` en `UsuariosPage` y `types/index.ts`.
- **Pruebas ejecutadas (2026-10-10, entorno local):**
  - Integración PostgreSQL 16 real, usuario no root (`runuser -u nobody`), cadena completa de migraciones: `backend/test/caja.postgres.integration.ts` **14/14** (apertura, venta efectivo/tarjeta/transferencia, abono de cliente, devolución, entrada/salida con permiso y sin permiso, diferencia, cierre con sobrante, doble cierre, concurrencia de cierres, venta vs. cierre simultáneos, movimientos concurrentes con la misma solicitud, idempotencia de venta, permisos, aislamiento). Suite completa de integración: **238/238 en 12 archivos**; `ventas.postgres.integration.ts` ajustado a la regla de explicación de diferencia.
  - Backend unitarias: **326/326**. Compilación de fuentes sin errores de tipos.
  - Frontend: unitarias **163/163**; `tsc -b` sin errores; `vite build` con `VITE_API_URL=/api`; lint sin errores (avisos de hooks en `ArqueoCajaPage.tsx`, mismo patrón que `OperacionesPage`).
  - Playwright Chromium: **98/98** en suite completa, incluidas **4 E2E nuevas** `frontend/e2e/caja-simulado.spec.ts`. **Son E2E con backend simulado**: validan interfaz, bloqueo de diferencia, reintento con la misma solicitud y vista de administrador; no sustituyen la persistencia.
- **Limitaciones reales:**
  1. **Sucursal / punto de venta: NO IMPLEMENTADO.** No hay modelo de sucursal; la caja identifica empresa, código y cajero.
  2. Cajero sin permiso configurado no puede registrar entradas/salidas (el permiso debe asignarse en Usuarios).
  3. Entradas/salidas: autorizadas por permiso o rol ADMIN; no hay doble aprobación por segundo administrador.
  4. No existe corrección posterior de un cierre confirmado; el cierre no se edita y tampoco hay anulación de movimientos.
  5. Regla nueva: cerrar con diferencia exige explicación (`Explique la diferencia de caja antes de cerrar`).
  6. Comprobante = vista imprimible del navegador; no hay ticket térmico ni PDF.
  7. Pantalla no verificada en iPhone/Safari físico ni con backend real en navegador; la traducción EN no tiene prueba visual dedicada.
- **Pendientes antes de aceptación del cliente:** decidir sucursal/punto de venta; definir si la salida de efectivo requiere segundo administrador y umbral; flujo de corrección auditada de cierres; revisión en dispositivo del cliente. Merge y aceptación del cliente son decisiones separadas.

---

## Inventario — estado vigente de las correcciones QA-INV (verificado en main, 2026-10-10 UTC)

Esta sección describe el estado actual. Las secciones de auditoría y reproducción siguientes son históricas: registran defectos **antes** de la corrección y no describen el código vigente.

- **PR #108 fusionado** en `main` (merge por `Nelosama`, 2026-10-10 03:57 UTC). Su rama `fix/qa-inv-estabilizacion-inventario` (head `87d7eaaf`) es ancestro de `main` `df3ae06b`; el commit `10f2590b` también está en `main`.
- **Correcciones comprobadas en el código de `main`** (no solo en la descripción del PR):
  - **QA-INV-001:** al aplicar un levantamiento, `productos.version` se incrementa (`levantamientos.service.ts`, `version:{increment:1}`). Un formulario con versión anterior recibe 409.
  - **QA-INV-001B:** al recibir mercancía, `productos.version=version+1` (`operaciones.service.ts`, recepción de compra).
  - **QA-INV-002 (P0):** la conciliación exige el `token` del grupo en conflicto (`tokenConflicto`). Si los conteos cambiaron, responde 409 `CONTEO_CONFLICTO_VERSION`. El frontend envía ese token (`LevantamientoPage.tsx`, `conciliar`).
  - **QA-INV-003:** los conflictos se agrupan con una clave única (`claveGrupo`) y se limpian los huérfanos (`limpiarConflictosHuerfanos`).
  - **QA-INV-004:** el nombre del contador se expone como `contador.nombre`, con estado `ACTIVO`, `DESACTIVADO` o `NO_DISPONIBLE`, dentro de la misma empresa. **No es `contadorNombre`**, como decía la descripción original del PR #108.
- **Pruebas:** backend unitarias ejecutadas sobre `main` `df3ae06b`: **329/329** en 34 archivos (`TZ=UTC`). Las cifras de Codex (326 backend, 250 integración PostgreSQL, 163 frontend, 13 scripts, 100 Chromium) se citan como reportadas; no se han vuelto a ejecutar en esta sesión.
- **Compatibilidad:** frontend y backend deben desplegarse juntos. Un frontend en caché que no envíe `token` no puede conciliar.
- **No validado todavía:**
  1. Hardware físico: Safari en iPhone, cámara trasera, códigos impresos reales, permiso denegado.
  2. Sucursales reales: no existe modelo de sucursal; el stock es por empresa.
  3. Aceptación del cliente.
  4. Datos productivos: no se ha ejecutado ninguna comprobación contra producción.
- **Conclusión:** las cuatro correcciones QA-INV están integradas en `main`. Eso no equivale a Inventario listo para producción.

---

## Inventario — auditoría QA independiente (2026-10-10 UTC)

- Base comprobada `origin/main` `b314ef0e` (PR #100/#101/#102/#105 fusionados); rama local `audit/inventario-independent-20261010`. Sin PR abiertos al consultar inicio/cierre; sin cambios en ramas de Claude, push, merge, despliegue ni producción.
- Informe: [AUDITORIA_INVENTARIO_INDEPENDIENTE_20261010.md](AUDITORIA_INVENTARIO_INDEPENDIENTE_20261010.md); evidencia en `docs/qa-inventario-20261010/`. Reproducciones: `backend/test/auditoria-inventario.postgres.integration.ts` y `frontend/e2e/auditoria-inventario.spec.ts`. Solo pruebas/documentación; no corregido código de producción.
- Confirmados: **QA-INV-002 P0** conciliación obsoleta elimina un conteo corregido 4→12 y permite aplicar 3; **QA-INV-001 P1** aplicar/recibir no invalidan versión del producto y aceptan formulario antiguo (precio o costo); **QA-INV-003 P1** identidad mixta ID/barcode rompe agrupación y limpia conflictos pendientes; **QA-INV-004 P2** conciliación muestra UUID en lugar de nombre del empleado.
- Ejecutadas: backend 326/326; scripts 13/13; PostgreSQL 17.11 local, usuario no root: 221 regresiones + 4 reproducciones únicas (suite inicial 224/224 incluye 3, ejecución final específica 4/4); frontend 163/163; Chromium 93/93 + 1 reproducción visual. Builds backend/frontend aprobados. Reproducciones pasan afirmando el defecto actual; no equivalen a corrección. WebKit 23/23 con APIs/cámara simuladas tras resolver bibliotecas locales y omitir el comprobador automático de dependencias; navegador real ejecutado, no iPhone físico.
- **Verificación para publicación autorizada:** reproducciones copiadas a worktree detached `b314ef0ecf2820c57b525d157918413b2972544f`, sin cambios de fuentes de producción: PostgreSQL 4/4 y Chromium 1/1. Comandos individuales/resultados en `docs/qa-inventario-20261010/REPRODUCCIONES.md`; logs de esta repetición en esa carpeta. El usuario autorizó publicar la rama de evidencia; no autoriza merge, despliegue ni correcciones. Claude implementará y QA validará después.
- Inventario **no aceptable al 100 %** con P0 abierto. Pendientes: hardware físico, fotografías locales cuando exista arquitectura, integración conjunta de conteo/reserva/entrega y aceptación de cliente. Autorizar hallazgos específicos antes de corregir; mantener reglas de reserva/entrega y costos.

---

## Inventario — corrección prioritaria para entrega al cliente (2026-10-09/10 UTC)

**Estado de esta revisión:** rama `fix/inventario-entrega-cliente` desde `origin/main` `00f72c02` (PR #103 ya fusionado). PR [#105](https://github.com/Nelosama/FerreSystem/pull/105) hacia main; sin merge, comandos de despliegue ni consultas a producción. Este bloque describe la revisión más reciente de inventario; las bitácoras fechadas de abajo se conservan como evidencia histórica.

**Continuidad y aislamiento:** revisados los PR #37/#39/#43/#44/#51/#73/#76/#79/#100/#101/#102/#103. Se reutilizan CRUD, generación de códigos internos, conteo persistente, idempotencia del conteo, conciliación multiusuario, preview/aplicar, versión de producto, auditoría y recepción con costo de última compra. Claude trabaja en PR #104 (`fix/p0-credit-integrity`): esta rama no modifica sus archivos de clientes, cotizaciones, operaciones, crédito ni sus pruebas. El único archivo compartido es este contexto, donde la sección de inventario se agrega al principio y su sección de crédito se conserva en su rama. No se modifica el esquema Prisma ni se añaden migraciones.

### Defectos confirmados y correcciones

| Hallazgo | Causa raíz | Corrección / evidencia |
|---|---|---|
| Alta directa repetida genera otro producto y otro stock inicial si no lleva código. | `POST /productos` sin identidad de solicitud; la UI no bloqueaba envíos. | `solicitudId` UUID v4 + hash estable del contenido en `PRODUCTO_CREAR`, misma transacción y bloqueo de empresa. Reintento devuelve el producto existente; clave usada con otros datos o por otro empleado responde 409. Frontend persiste clave y contenido por empresa/usuario, muestra Guardando/Guardado, y bloquea doble envío. |
| Buscar una categoría no encuentra sus productos; filtros solo incluyen categorías predeterminadas. | API busca solo campos de producto; frontend ignora categorías de catálogo. | Búsqueda por nombre de categoría y trim del término; filtros incluyen las categorías reales. Lookup del conteo anuncia búsqueda por código, descripción o categoría; captura de categoría conserva texto libre y agrega sugerencias. |
| `null` en edición puede convertir cantidades o precios a 0; códigos null pueden provocar error interno. | `@IsOptional()` omite validación de null; `Number(null)` produce cero. | Campos opcionales validan si no son undefined: null inválido responde 400 antes de escribir. `imagenUrl: null` y `margen: null` conservan sus contratos de borrado explícito. |
| Baja lógica no invalida formularios antiguos; se puede reactivar con una versión obsoleta. | DELETE no incrementa `productos.version`. | Baja incrementa versión; edición con versión anterior responde 409. |
| Un ajuste abierto antes de una recepción borra las existencias recibidas. | Recepciones/entregas cambian cantidades mediante SQL sin incrementar `productos.version`; la versión sola no detecta el cambio. | Un ajuste que cambia stock exige `stockAnterior` y lo compara dentro de la transacción. Si cambió responde `409 PRODUCTO_STOCK`; la UI recarga. Importador también envía la cantidad leída. Reproducción SQL del contrato vigente y prueba con recepción efectiva/ajuste concurrentes. |
| Alta no permite guardar descripción ni indicar venta por medida; captura datos sin persistencia y el modal resulta difícil en móvil. | `usaMedida: false` fijo; descripción omitida; controles de lote/serie/vencimiento sin campo en BD; modal sin límite vertical. | Nombre y variante primero; códigos internos automáticos; descripción y datos opcionales plegados; usaMedida editable; cantidades a dos decimales; modal desplazable y columnas adaptables. Se retiran los controles que simulaban persistencia de lote/serie/vencimiento/garantía. |
| Mensajes de cámara no reconocen errores de otro contexto; pruebas existentes no ejecutaban esa lógica. | Dependencia de `instanceof Error`; cinco pruebas comprobaban una copia de la condición. | Mapeo por nombre del error, válido para DOMException/otro realm; esas pruebas ahora llaman a `cameraError` real. Permisos, cámara ocupada/no disponible y alternativa manual en ES/EN. Seis pruebas fallaban antes del cambio. |
| Captura manual puede fallar cuando no existe `crypto.randomUUID` (LAN sin HTTPS). | randomUUID exige contexto seguro; la captura manual lo llamaba incondicionalmente. | UUID v4 con `crypto.getRandomValues` como alternativa, sin Math.random. E2E con randomUUID ausente y cámara denegada guarda manualmente una sola solicitud. Cámara sigue exigiendo HTTPS. |

**Reproducción:** en PostgreSQL 17 aislado, cuatro pruebas nuevas fallaron sobre main (alta duplicada, categoría, null, baja/version). Una quinta reprodujo pérdida de recepción al ajustar. Tras los cambios pasan. El fallo sintético de auditoría mediante trigger PostgreSQL prueba rollback después de escribir producto/categoría/movimiento, y luego se retira para reintentar la misma solicitud. No es un mock de transacción.

### Operación y cobertura

- BODEGUERO con `inventario.editar` crea directamente canaletas, láminas, varillas, tornillos y aerosoles, con cantidades enteras o decimales persistidas en PostgreSQL, sin aprobación de ADMIN para cada alta. Las variantes de medida/color/espesor son productos separados con nombre descriptivo y códigos independientes; no hay modelo de variantes relacionadas.
- El flujo de levantamiento conserva la regla previa: finalizar no aplica; solo ADMIN aplica un conteo revisado. No cambia reserva al facturar, descuento físico al entregar ni permisos de ajuste/costo manual.
- Recepciones conservan costo de la última recepción efectiva (incluso menor), histórico por compra y precio de venta sin cambio. La prueba de recepción/ajuste concurrentes usa el servicio vigente sin modificar sus archivos. La regresión de compras cubre 45 → 60 → 40, recepción parcial, reintentos y concurrencia.
- UI de alta, lookup, cámara y levantamiento traducida ES/EN. Datos de usuario y mensajes del backend conservan su idioma original. Inventario se monta con clave de tenant/usuario: no conserva formulario de otra sesión.

**Matriz de pruebas obligatorias con PostgreSQL real:**

| Criterio | Evidencia |
|---|---|
| 1. Crear producto | Altas HTTP ADMIN/BODEGUERO; cinco ejemplos de ferretería con lectura posterior de BD. |
| 2. Evitar códigos duplicados | Códigos internos/barras, activos/inactivos, carrera entre empleados: una alta y un movimiento. |
| 3. Existencias iniciales | Movimiento INICIAL, cantidad exacta, usuario, motivo y fecha. |
| 4. Actualizar cantidades | AJUSTE con motivo y stock anterior; ajuste obsoleto rechazado. |
| 5. Decimales | 12.75 → 14.25 → 13.50; movimientos +1.50 y -0.75; tercer decimal rechazado. |
| 6. Movimientos auditables | Lectura real de movimientos/auditoría con usuario, fecha, motivo y antes/después. |
| 7. Reintentos | Alta concurrente/idempotente y conteo/aplicación existentes; ajuste repetido rechazado sin segundo movimiento. |
| 8. Concurrencia | Altas/ediciones entre empleados y recepción efectiva simultánea con ajuste: ninguna recepción se pierde. |
| 9. Aislamiento tenants | Lecturas, códigos, solicitudes y escrituras ajenas; mismos códigos válidos en otra empresa. |
| 10. Atomicidad | Trigger que falla al auditar el alta revierte categoría/producto/movimiento; recepción fallida en suite de compras. |

**Resultados locales finales y límites:**

- Backend unitarias: 326/326. Scripts: 13/13. TypeScript de compilación, Nest build y lint ejecutados sin errores; avisos existentes.
- PostgreSQL real: **186/186 en 9 archivos**; `productos-edicion.postgres.integration.ts` 32/32. Clústeres temporales PostgreSQL 17.11 como usuario no root; nunca se usa DATABASE_URL de producción. DDL del esquema actual para las suites HTTP y migraciones reales en la suite de migraciones.
- Frontend: 163/163, incluidos cinco casos con ZXing real e imágenes sintéticas EAN-13/EAN-8/UPC-A/CODE-128/checksum inválido. TypeScript (`tsc -b`), Vite build y lint sin errores. Avisos previos de React y tamaño del bundle.
- Playwright Chromium: **93/93**. APIs simuladas: verifica interfaz y payloads; no acredita persistencia.
- Playwright WebKit 26.6 con emulación iPhone 13: 23/23; archivo `frontend/playwright.inventory-webkit.config.ts`. APIs y permiso de cámara simulados. **No es Safari instalado en un iPhone físico y no acredita cámara real.** El decodificador con imágenes sintéticas tampoco valida iluminación/enfoque/etiquetas del cliente.
- Comandos: `npm test`, `npm run test:scripts`, `npm run test:integration` con PG_BIN local temporal; `npm run build`/`npm run lint` en ambos paquetes; `npm run test:browser -- --workers=2`; `npx playwright test --config playwright.inventory-webkit.config.ts`.
- GitHub Actions: consultar el último head y enlaces de ejecución en la descripción del único PR. APTO PARA MERGE solo con checks aprobados y sin conflictos; no equivale a aceptación en dispositivo/infraestructura del cliente.

### Pendientes y riesgos para la primera entrega

1. **Sucursales: NO IMPLEMENTADO.** El stock es por empresa/producto, no por sucursal. No existe modelo real de sucursal. No se agregó un selector ficticio ni se reinterpretó un tenant como sucursal. Multi-sede exige definir pertenencia, existencias y permisos e integrar recepción/venta/entrega en archivos donde trabaja Claude. Se separa ese trabajo; esta revisión no acredita operación multi-sucursal. Una entrega a varias sucursales queda bloqueada.
2. **Fotografías locales: PENDIENTE de infraestructura.** Solo hay referencia textual `imagenUrl`; no hay servicio de captura/almacenamiento local compartido por Wi-Fi. No se suben imágenes a Supabase ni a otro servicio cloud. Falta definir PC principal, ubicación/retención de archivos, URL de servicio LAN, autenticación, HTTPS/certificados confiables en iPhone y acceso de las cajas por la misma Wi-Fi. Después: captura escritorio/móvil, referencia en BD, consulta en otra PC y pruebas con foto ausente/servidor desconectado. El inventario actual funciona sin foto (probado); no se afirma funcionamiento de un servidor de fotos inexistente.
3. **iPhone físico / LEV-015:** validar Safari, permiso aceptado/denegado, cámara trasera, códigos impresos reales, iluminación, cierre y regreso a la app, HTTPS de LAN y captura manual. Emulación e imágenes sintéticas dejan este punto abierto.
4. **Costo manual:** ADMIN/BODEGUERO pueden modificar costo manualmente, auditado pero fuera de la regla de última recepción. Se conserva el permiso por instrucción; pendiente decisión sobre restricción y motivo obligatorio. Precio de venta no se actualiza automáticamente.
5. **Compatibilidad de clientes antiguos:** ajustes que cambian cantidades sin `stockAnterior` ahora reciben 400; null inválido recibe 400. Frontend, importador y backend deben actualizarse juntos cuando se autorice. Reintentos de alta solo son idempotentes si se envía solicitudId; la UI lo hace. La auditoría usada para idempotencia debe conservarse; consulta sin índice de expresión específico, a medir para empresas con historial muy grande.
6. **Funciones no implementadas:** variantes relacionadas, lotes, series, vencimientos, conversión de unidades. Ubicación queda en historial del conteo. No se ofrecen controles que prometan guardar esos datos en el catálogo.
7. **Importador:** conserva la decisión vigente de sobrescribir cantidades/precios con confirmación; ahora protege la cantidad anterior. Un archivo no reemplaza la revisión del empleado. No se cambia esa regla de negocio.

**Veredicto de alcance:** las correcciones permiten alta y administración persistentes para una tienda con empleado autorizado. Merge y aceptación del cliente son decisiones separadas: multi-sucursal y cámara/fotos en red física no están acreditadas. Sin merge ni despliegue.

---

## 1. Estado comprobado — 2026-10-09

- Repositorio: `Nelosama/FerreSystem`; checkout local: `C:\Users\Nelo\Documents\GitHub\FerreSystem`.
- **HEAD de `main` verificado:** `600486a9` — Merge PR #76 codex/fix-iphone-barcode-scanner (2026-10-09). PR #77 (docs) también fusionado (`26fad5ac`).
- Rama activa de auditoría: `fix/levantamiento-barcode-audit` — rebased sobre `origin/main` (`f06b2bfb`). PR #76 está en main; nuestros fixes P1 re-aplicados correctamente sobre sus cambios.
- PR #76 `codex/fix-iphone-barcode-scanner`: **FUSIONADO** a main (`600486a9`). Introduce `LevantamientoProductLookup` en lugar de `BarcodeScanner`.

### Siguiente paso autorizado
- **Daniel** hace push de la rama de auditoría desde su máquina:
  ```bash
  git push origin fix/levantamiento-barcode-audit   # PR de auditoría P1 (rebased)
  git push origin wip/incompleto-codex              # aísla trabajo incompleto
  ```
- Abrir PR de `fix/levantamiento-barcode-audit` → revisión antes de merge.
- PR #76 ya está en main; no requiere acción adicional.
- Para continuar levantamiento: ver §4 y tabla de pendientes; priorizar los estrictamente necesarios para un conteo real (ítems 2 y 5 de PENDIENTES).

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

**Rama:** `codex/fix-iphone-barcode-scanner` | **PR #76** — **FUSIONADO** a main (`600486a9`, 2026-10-09). Revisado por Jules.

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
| #76 | `codex/fix-iphone-barcode-scanner` | **FUSIONADO** | `600486a9` | 2026-10-09 | Escáner de barras iPhone; `LevantamientoProductLookup` reemplaza `BarcodeScanner` |
| — | `fix/levantamiento-barcode-audit` | **EN REVISIÓN** (local, rebased) | `f06b2bfb` | 2026-10-09 | Correcciones P1 auditoría + rebase sobre main post-PR#76; push y PR pendientes |
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
| **Task B** — Desbloquear PR #76 (Jules QA FAIL E15) | Verificado: no hay credenciales hardcodeadas, `testIgnore` correcto, merge con main `eb0aadb2`. PR #76 fusionado por Daniel. |
| **Task C** — Auditoría PR #73, fase 1 | Último PR Codex en main = PR #73 (`fcc17492`). No hay solapamiento con PR #76. |
| **Task C** — Auditoría PR #73, fase 2 | Clasificación: 3 defectos P1, 1 P2, 1 P3. Ver tabla §4. |
| **Task C** — Auditoría PR #73, fase 3 | Correcciones aplicadas en `fix/levantamiento-barcode-audit` (`c9a92352`). 5 archivos, 81 líneas. |
| **PR #77** — Docs actualización | Fusionado a main (`26fad5ac`). CONTEXTO_MAESTRO vigente en main. |
| **PR #76 fusionado** — Diagnóstico de conflicto | PR #76 revirtió todos los P1 fixes de `c9a92352`. Diagnóstico completo registrado. |
| **Rebase** — `fix/levantamiento-barcode-audit` | Rebased sobre `origin/main` (nuevo hash `f06b2bfb`). P1 fixes re-aplicados correctamente sobre código de `LevantamientoProductLookup`. Sin conflictos. |
| **Análisis `??0`** — `precioCosto??0`/`precioVenta??0` | Verificado seguro: `preview()` bloquea nuevos productos sin precio; existentes obtienen precio del catálogo. `??0` evita crash de non-null assertion sin introducir precios incorrectos. |
| **Diagnóstico pendientes** — ítems 2,3,5-11 PENDIENTES | Item 5 (barcode cámara): PARCIAL vía PR #76. Exportación CSV/Excel: PARCIAL (sin plantillas). Ítem 2 (multiusuario), 3 (offline), 7 (zonas), 9 (reconteo): NO implementados. |
| **Documentación** | Este archivo actualizado. Rama `docs/contexto-levantamiento-post-rebase`. |
| **PR #79 — Auditoría P1/P2 completada** | Dos defectos confirmados y corregidos. Commit `bac89b1b` en rama `docs/contexto-levantamiento-post-rebase`. **Pendiente: push y merge manual.** |
**FS-03 (2026-10-09)** — rama `fix/fs-03-password-predeterminada`, PR abierto, sin merge/despliegue. Se eliminan `Ferre2026!`/`FerreAdmin2026!` precargadas en `UsuariosPage.tsx` y `SuperAdminPage.tsx`; botón «Generar contraseña segura» (`frontend/src/utils/generatePassword.ts`, CSPRNG). Backend: `backend/src/common/password-policy.ts` (≥8, letras+números, lista bloqueada) en crear/editar usuario y admin de tenant; test `common/password-policy.spec.ts`. Backend 119/119, frontend 122/122, tsc OK. **Pendiente:** `backend/prisma/seed.ts` aún usa `Ferre2026!` (solo desarrollo; no ejecutar en producción); usuarios existentes con esa clave deben cambiarla.

**SEC-012 (2026-10-09)** — rama `fix/sec-012-auditoria-impersonacion`, PR #94, sin merge/despliegue. Trazabilidad extremo a extremo de sesiones de soporte:
- Emisión (`SuperAdminService.supportToken`): solo lectura por defecto; exige `motivo` (≥10); escritura exige `confirmarEscritura` y dura 10 min (lectura 15); genera `soporteSesionId`; registra `SOPORTE_IMPERSONAR` (superadmin, motivo, sesión, expiración; nunca el token) antes de firmar, y si falla no se emite.
- Validación (`jwt.strategy.ts`): un token con `impersonatedBy` requiere `soporteSesionId` y que el Super Admin siga activo (revocación inmediata).
- Bloqueo: `TenantGuard` (403 en no-GET con `readOnly`, registra `SOPORTE_ESCRITURA_DENEGADA`) + defensa en profundidad en `SupportAuditInterceptor`.
- Auditoría: `common/support-context.ts` (AsyncLocalStorage alimentado solo por el JWT validado); `ledger.audit()` añade `datos._soporte {superAdminId, soporteSesionId, readOnly, resultado}` a las 27 auditorías existentes (misma transacción que la operación); `SupportAuditInterceptor` registra `SOPORTE_ESCRITURA_INICIO` ANTES de cualquier escritura (si falla, no se ejecuta) y `SOPORTE_ESCRITURA_RESULTADO` (OK/ERROR). No se guarda cuerpo, query, cabeceras ni tokens.
- Frontend: `SuperAdminPage`/`TenantContext`/`TopBar` envían el motivo y piden justificación para activar edición.
- Pruebas: backend unit/HTTP 285/285 (`common/support-impersonation.http.spec.ts` 14 casos, `super-admin.service.spec.ts`); frontend 122/122, tsc OK; **PostgreSQL 16 aislado** `test/soporte-auditoria.postgres.integration.ts` 6/6 (pago atribuido, solo lectura, rollback si falla la auditoría, fail-closed, aislamiento de tenant, Super Admin desactivado). Ejecutado con `PG_BIN=/usr/lib/postgresql/16/bin` como usuario no root.
- **Limitaciones pendientes (no declarar resuelto del todo):** (1) columnas de negocio como `usuario_id`/`entregado_por` siguen mostrando al usuario representado; la identidad real vive en `auditoria_operaciones.datos._soporte`. (2) Escrituras sin llamada a `audit()` (p. ej. clientes, configuración del tenant) quedan cubiertas solo por los registros INICIO/RESULTADO del interceptor (sin before/after de datos y no en la misma transacción). (3) El resultado de `SOPORTE_ESCRITURA_RESULTADO` es best-effort. (4) No se probó en navegador ni contra la base real.

### Auditoría PR #79 (2026-10-09)

**Hallazgo P1 — `??0` silencia precios null del catálogo:**
- En `preview()`, `rows.push` calculaba `precioCosto: p ? Number(p.precioCosto) : null`. Cuando `p.precioCosto` es null en el catálogo, `Number(null) = 0`. El row llegaba a `aplicar()` con `precioCosto: 0`, no `null`, así que el guard `??0` nunca disparaba. Se escribía 0 en el catálogo silenciosamente.
- **Corrección**: `rows.push` ahora preserva null: `p ? (p.precioCosto == null ? null : Number(p.precioCosto)) : null`.
- **Guard en `aplicar()`**: reemplazado `??0` por throw `BadRequestException` explícito si precio es null.

**Hallazgo P2 — tests solo cubrían `previsualizar()`, no `aplicar()`:**
- La suite existente ("Auditoría P1 — protección de código de barras del catálogo") tenía 4 tests, todos terminaban en `previsualizar()`. Ninguno inspeccionaba `producto.update.mock.calls`.
- **Corrección**: nueva suite "Auditoría P1/P2 — aplicar() protege barcode y precios" con 5 tests:
  1. barcode mismatch bloquea `aplicar()` — `producto.update` nunca se llama
  2. barcode persiste cuando `matchedByBarcode=true`
  3. barcode se asigna cuando `catalogBarcode` era null
  4. `precioCosto`/`precioVenta` del catálogo se preservan (nunca 0)
  5. precio null en catálogo lanza error explícito (no escribe 0)

**Resultado de tests:** 19/19 ✅ (`npx vitest run src/levantamientos/levantamientos.service.spec.ts`)

**Estado del commit:** `bac89b1b` en rama `docs/contexto-levantamiento-post-rebase` — **pendiente push manual** (credenciales GitHub no disponibles en sesión cloud).

**Acción requerida por Daniel:** `git push origin docs/contexto-levantamiento-post-rebase`


### Bitácora FS (sesión autónoma 2026-10-09)

| FS | Estado | Rama | Evidencia |
|---|---|---|---|
| FS-01 | Corregido, PR abierto (sin merge/despliegue) | `fix/fs-01-pos-vencimiento-iso` | Causa: `@IsOptional()` no omite `''`; el pendiente corregido del POS guardaba `vencimiento: ''` y el backend respondía "must be a valid ISO 8601 date string", dejando la venta pendiente bloqueada. Fix: `backend/src/common/empty-to-undefined.ts` aplicado a `vencimiento` en ventas/operaciones/compras + POS envía `pending.vencimiento \|\| undefined`. Test: `backend/src/ventas/create-venta-vencimiento.spec.ts` (11/11 en `src/ventas`). No validado en navegador ni producción. |

### Bitácoras anteriores (resumen)

- **2026-10-08** — Jules PR #67: FUNC-002/004; Codex SEC-005 PR #70; Codex FUNC-001 rama `fix/func-001-cotizacion-venta`; Codex LEV-001 PR #73; docs UX PR #74; E15 PR #75.
- **2026-10-05** — Auditorías Jules (funcional, seguridad, arquitectura); diagnósticos QA; recuperación usabilidad admin/caja.
- **2026-10-04** — Diagnóstico main; operación piloto; validación integración y sesiones.
- **Histórico completo:** ver §9 Anexo y `docs/AUDITORIA_RAMA_20261005.md`.

---


### FS-41 — actualización de continuidad (2026-10-09)

- Auditoría, garantías, configuración de infraestructura, evidencia y pendientes de esta rama: `docs/FS-41-RESPALDOS.md`.
- Código en revisión: `feat/fs-41-automatizacion-tecnica`, base `origin/main` `64291e76`; ver PR enlazado en Bitácora de continuidad de FS-41.
- Worker Restic cifrado con verificación de checksum/restauración aislada previo a retención. Prueba PostgreSQL 18 + restic local temporal pasa, pero NO configura ni acredita destino remoto de producción. Backup operativo permanece BLOQUEADO hasta despliegue a staging y prueba externa satisfactoria.
- Consola movida del dashboard ADMIN a Super Admin; rutas con `SuperAdminGuard`. Tests backend/frontend y limitaciones en documento FS-41.
- Sin cambios a base/producción, sin merge ni despliegue. Pendiente infraestructura de cliente, credenciales externas fuera del repo, webhook/monitor, restauración staging y revisión PR.
### FS-06 — auditoría e integridad del levantamiento inicial de inventario (2026-10-09)

- **Rama:** `fix/fs-06-levantamiento-inventario` desde `origin/main` `4c104a24`. PR abierto hacia `main`. Sin merge ni despliegue.
- **Ya resuelto en `main` antes de este trabajo (verificado en código, no reabierto):** normalización y protección de barcode (PR #73/#76, LEV-001); guard de precio null en `aplicar()` (`levantamientos.service.ts`, auditoría P1 de PR #79); `@MaxLength(100)` en `codigoBarras` de DTOs de levantamiento y producto; idempotencia de alta por `solicitudId` con hash de contenido; bloqueo de doble envío en frontend (`inFlight`) y `solicitudId` persistido en `localStorage` para reintentos; `lockTenant` en alta y edición de productos (no hay duplicado por concurrencia en `productos.create`).
- **Defectos confirmados con pruebas en PostgreSQL real (HTTP) que fallaban antes del cambio y ahora pasan:**
  1. `productoId` de otra empresa se guardaba sin validar en el conteo → ahora `400` (`createItem`).
  2. `heartbeat` creaba presencia en levantamientos de otra empresa → ahora `404`.
  3. Producto heredado con código en minúsculas no se identificaba en preview/aplicar → se creaba un producto duplicado que solo difería en mayúsculas. Corregido con comparación sin distinguir mayúsculas.
  4. Editar un conteo para que coincida con el de otro usuario no marcaba conflicto → alta y edición usan ahora la misma regla (`conflictingItems`) y limpian conflictos huérfanos.
- **Protecciones verificadas que ya pasan (regresión añadida):** dos solicitudes simultáneas con el mismo `solicitudId` crean un solo ítem y una sola auditoría `CONTEO_CREAR`; reintento tras pérdida de respuesta no duplica existencias; editar solo el nombre de un producto conserva código, barcode, costo, precio, existencias y unidad.
- **Pruebas:** integración PostgreSQL 16 (`levantamientos.postgres.integration.ts`): antes del cambio 4 de 16 fallaban (defectos 1–4); tras la corrección 16/16. Suite de integración completa **6 archivos, 86/86**. Unitarias backend **316/316** (en `main`; 3 mocks de la unitaria se ajustaron para el nuevo comportamiento sin relajar aserciones). `tsc -p tsconfig.build.json` y oxlint sin errores. Todo ejecutado como `nobody` (`runuser`).
- **Permisos y tenant:** cubiertos por pruebas existentes: CAJERO `403` en alta de productos, levantamientos y conteo; BODEGUERO sin permiso `403` y no puede aplicar; aislamiento de levantamientos, ítems y productos entre empresas.
- **No implementado (fuera de lo verificable o requiere decisión):**
  - **Fase 3 UX** (búsqueda por categoría, flujo de escáner en móvil, confirmaciones visibles): no modificada en este PR. Requiere validación en navegador y dispositivo real, no hecha aquí.
  - **Fase 4 fotografías:** no implementada. La bitácora `BITACORA_UI_UX_FOTOGRAFIAS_20261008.md` deja pendiente topología Wi‑Fi, HTTPS LAN y servicio local. Solo existe el campo `imagenUrl` (texto). No se simula.
  - **Lotes, series, vencimientos y garantías:** `Producto` no tiene esos campos en el esquema. No se inventó modelo. Garantías existe en frontend, sin verificar persistencia en backend.
- **Decisiones pendientes (requieren autorización, no implementadas):**
  1. `marca`, `categoría`, `ubicación` y `notas` se capturan en el conteo, pero al crear un producto nuevo solo se usan `categoría` y `descripción`. `marca`, `ubicación` y `notas` no se persisten en el catálogo porque `Producto` no tiene esos campos. Opciones: ampliar `Producto` (cambio de esquema) o documentar que quedan solo en el historial del conteo.
  2. Mismo usuario captura el mismo producto dos veces: no se marca conflicto al capturar; el bloqueo ocurre al previsualizar ("Conteo duplicado"). Regla de negocio: ¿sumar, reemplazar o advertir al capturar?
  3. `POST /levantamientos` no tiene idempotencia (sin `solicitudId`). Un reintento tras pérdida de respuesta puede crear dos levantamientos. El frontend lo evita con bloqueo de doble clic, pero no ante reintento de red.
- **Riesgos residuales:** Playwright y navegador real no ejecutados; iPhone y cámara sin validar (LEV-015); `ubicacion` solo en historial; búsqueda de preview sin índice para códigos muy numerosos (`OR` con una cláusula por código); mocks de la unitaria dependen de la forma de la consulta.

### FS-06 fase 2 — levantamiento de inventario listo para operación (2026-10-09)

- **Base:** `main` `318802ab` (PR #100, FS-06 fase 1, **ya fusionado** por `Nelosama` el 2026-10-09 19:31 UTC). Esta fase no duplica correcciones de fase 1. Rama `fix/fs-06-fase-2-levantamiento-operacion`. PR abierto hacia `main`. Sin merge ni despliegue.
- **Estado de decisiones de fase 1:** (1) marca → **resuelta** en esta fase. Ubicación → **bloqueada** (ver pendientes). (2) mismo empleado repetido → **resuelta**: se rechaza con `409 CONTEO_DUPLICADO`; el empleado debe editar el conteo anterior. (3) idempotencia de `POST /levantamientos` → **resuelta** con clave persistida y unicidad en PostgreSQL.

**Hallazgos de la auditoría (antes de cambiar código)**

- La **marca** se captura en el formulario y en el conteo, pero `Producto` no tenía campo: se perdía al aplicar. Tampoco se podía editar en el catálogo (`ProductoGestion` y alta en `InventarioPage`).
- La **categoría** sí se conservaba al crear y editar productos (`productos.service`). En el conteo solo se usaba al crear un producto nuevo al aplicar; no se modifica en productos existentes.
- Un empleado que repetía un artículo **no** recibía conflicto: el duplicado solo se detectaba al previsualizar (`Conteo duplicado`).
- `POST /levantamientos` no tenía idempotencia: un reintento tras perder la respuesta podía crear dos levantamientos.
- **Ubicación** y **notas**: la ubicación no existe a nivel de sucursal (no hay modelo de sucursal). Las notas se guardan en el ítem y en la auditoría `CONTEO_CREAR`/`CONTEO_EDITAR`, pero no se copian al catálogo (correcto).
- Frontend: sin advertencia antes de guardar; sin confirmación visible al confirmar un conteo pendiente tras un fallo de red; `ConflictosPanel` llamaba `useState` dentro de un `map` (incumple reglas de hooks, `oxlint` lo marcaba como error).
- **Lotes, series, vencimientos y garantías:** `Producto` no tiene esos campos; no se inventó modelo.

**Cambios implementados**

- **Catálogo / marca:** `marca` en alta y edición (DTO máx. 100); se devuelve en la respuesta pública; una actualización parcial o vacía **no borra** la marca existente. `ProductoGestion` e `InventarioPage` la muestran.
- **Aplicar:** productos nuevos reciben la marca del conteo; productos existentes solo la reciben **si el catálogo no tiene marca**. Nunca se sobrescribe. Vista previa expone `catalogMarca`.
- **Duplicados:** `coincidencias()` devuelve todos los ítems que coinciden por producto, código o código de barras. Si el mismo empleado ya lo contó → `409 CONTEO_DUPLICADO` con `itemId` (alta y edición). Si lo contó otro empleado → se registra con `conflicto=true` para conciliación del administrador (sin cambio de regla). Nunca se suman cantidades. La protección se apoya en `lockTenant`, por lo que dos solicitudes simultáneas no la evaden.
- **Idempotencia de `POST /levantamientos`:** `solicitudId` (UUID v4, opcional). Misma clave y mismos datos → devuelve el levantamiento original. Misma clave con otros datos → `409` controlado. Concurrencia serializada por `lockTenant` y respaldada por índice único `(tenant_id, solicitud_id)`. Alta ahora genera auditoría `LEVANTAMIENTO_CREAR`.
- **Frontend (levantamiento):** clave de creación persistida en `localStorage` (un fallo de red la conserva; 400/409/422 la descartan); advertencia **bloqueante** del propio duplicado con botón «Editar conteo anterior» y botón de guardar deshabilitado; advertencia **informativa** cuando otro empleado ya contó el artículo; confirmación visible «Guardado: …» también al confirmar un conteo pendiente; `ConflictoFila` extraída (corrige la regla de hooks).

**Migraciones**

- `backend/prisma/migrations/20261009120000_fs06_marca_idempotencia_levantamiento/migration.sql`: `productos.marca TEXT NULL`; `levantamientos.solicitud_id TEXT NULL`, `levantamientos.solicitud_hash TEXT NULL`; índice único `levantamientos_tenant_id_solicitud_id_key`. Solo agrega columnas nullables e índice; **no modifica filas existentes ni inventarios**. Los levantamientos históricos quedan con `solicitud_id` NULL, que el índice no compara. Reversión manual si hiciera falta: `DROP INDEX`, luego `DROP COLUMN` (sin pérdida de datos previos).
- Las listas explícitas de migraciones de `ventas.postgres.integration.ts` y `reportes-zona-horaria.postgres.integration.ts` se actualizaron con la nueva migración.

**Pruebas**

- Unitarias backend: **331/331** (`levantamientos.service.spec.ts`: 31/31; la prueba de «mismo usuario sin conflicto» pasó a verificar `CONTEO_DUPLICADO` y que no se crea ítem).
- Integración PostgreSQL (`levantamientos.postgres.integration.ts`): **30/30**. Nuevas: marca persistida y actualizaciones parciales; categoría; aplicar con/sin sobrescribir marca; campos opcionales; notas solo en auditoría; duplicado propio por código, producto y edición; simultáneas con claves distintas; conflicto entre empleados; reintento tras pérdida de respuesta; creación simultánea con la misma clave; clave reutilizada con datos distintos; aislamiento entre empresas; flujo completo con reintento de aplicación sin movimientos duplicados.
- La prueba «bloquea dos barcodes equivalentes» se reescribió: la captura por API ahora responde `409`, y la red de seguridad del preview se prueba con un duplicado insertado directamente.
- Suite de integración completa: **7 archivos, 120/120** (incluye migraciones desde cero con `migrate deploy`).
- Frontend `npm test`: **143/143**. `tsc -b`, `vite build` y oxlint de archivos tocados: sin errores.
- Playwright (`frontend`, suite de la CI): **71/71** (64 previas + **7 nuevas** de `e2e/levantamiento.spec.ts`: fallo de red al crear, reintento de conteo pendiente, duplicado propio con edición, aviso de otro empleado, 409 de carrera entre dispositivos, flujo completo hasta aplicar, y móvil 390 px sin desbordamiento). Las E2E usan un servidor simulado en memoria por prueba: validan la interfaz, no el backend real.
- Todo ejecutado como `nobody` (PostgreSQL 16).

**Riesgos residuales**

- Interpretación de reglas a revisar: (a) el duplicado propio se **rechaza**, no se puede forzar; (b) la marca vacía en una edición **no borra** la marca; (c) la marca del conteo **no reemplaza** la del catálogo.
- `ubicación` solo se guarda en el historial del conteo.
- Playwright con servidor simulado: no prueba el backend real ni el flujo de cámara.
- Búsqueda de candidatos del preview con una cláusula `OR` por código: sin índice dedicado para catálogos muy grandes.
- Idempotencia de `POST /levantamientos` solo aplica si el cliente envía `solicitudId`; la UI siempre lo envía.

**Funcionalidades pendientes**

- **Ubicación física por sucursal:** bloqueada. No existe modelo de sucursal en el esquema (multi-sede está en propuesta). Requiere autorización: modelo de sucursal y ubicación por producto y sucursal. Sin tocar existencias por sede.
- **Validación en iPhone real (Safari):** permisos de cámara, inicio/cierre, lectura de códigos, permiso denegado, sin cámara y entrada manual. **No validado en dispositivo.** LEV-015 sigue abierto.
- **Fase 3 UX completa:** búsqueda por categoría en el conteo, revisión de diferencias más clara y prueba de navegación SIDEBAR/TOPNAV en móvil con levantamiento. Solo se cubrieron advertencias, confirmaciones, mensajes y el E2E de móvil.
- **Fase 4 fotografías:** no implementada (fase separada).
- Lotes, series, vencimientos y garantías: sin modelo en el esquema.

### Ciclo de compras — auditoría e integridad (2026-10-09)

- **Base:** `main` `d24b420e` (PR #102, FS-07, **ya fusionado** por `Nelosama` el 2026-10-09 22:02 UTC). No hay PRs abiertos. Rama `fix/fs-compras-ciclo`. PR abierto hacia `main`. Sin merge ni despliegue.
- **Implementaciones previas verificadas, no reimplementadas:** FS-09 (pagos a proveedor independientes de la caja: ningún método exige caja ni genera `movimientos_caja`; `caja_id` NULL) y FS-04 (fechas de calendario en CxP), FS-08 (validación de costos en captura). Se añadieron pruebas PostgreSQL reales que las comprueban.
- **Documentos no encontrados:** `FS-08` y `FS-09` no tenían sección propia en este documento; su contexto está en el historial de commits (`a4857722`, `4da064f8`, `bf0b73ba`, PRs #92 y #93) y en `docs/BITACORA_PENDIENTES_2026-10-09.md`.

**Flujo real verificado** (`operaciones.service.ts`; módulo legado retirado): Proveedor (`ProveedorDto`) → Orden/factura `compra()` (estado `SOLICITADA`, CxP en el saldo del proveedor) → `recibir()` (recepción parcial o completa, exactamente una vez por `solicitudId`) → `productos.stock_actual`, `precio_costo`, `costo_vigente`, `costos_compra`, `movimientos_inventario` (tipo `COMPRA`) → `pagar()` (CxP sin caja; saldo con `FOR UPDATE`) → `cuentas()` (solo ADMIN para CxP) → auditoría `COMPRA_CREAR`, `COMPRA_RECIBIR`, `CUENTA_PAGAR`.

**Matriz de hallazgos**

| # | Hallazgo | Gravedad | Causa raíz | Corrección |
|---|---|---|---|---|
| H1 | Módulo legado `/compras` (ADMIN) registraba compras que **cambiaban `costo_vigente` y `precio_costo` sin recepción y sin aumentar existencias**; además creaba pagos a proveedor en tablas separadas (`compras_proveedor`/`pagos_proveedor`) fuera de la CxP real. | **P0** | Segunda implementación paralela del ciclo de compras, sin uso desde la interfaz, que violaba la regla de costo vigente. | Módulo `ComprasModule` retirado de `AppModule`; código eliminado de `src/compras/`. Las tablas y datos históricos **se conservan** (sin migración). Ver conciliación propuesta. |
| H2 | `costo_vigente` nunca se actualizaba en la recepción activa (solo `precio_costo`); quedaba `NULL`. | **P1** | El flujo activo no escribía la segunda columna de costo. | `recibir()` escribe `costo_vigente = precio_costo = costo de línea`. Prueba: baja 50→45 y sube 45→60; historial `[45, 60]`. |
| H3 | Factura repetida del mismo proveedor se aceptaba si cambiaban mayúsculas o espacios (`FAC-200` vs ` fac-200 `). | **P1** | Comparación exacta de `numero_factura`. | Comparación `UPPER(TRIM(...))` en `compra()`. Prueba PostgreSQL y mock unitario actualizado al mismo criterio. |
| H4 | Una cuenta CxP que vence **hoy** (Tegucigalpa) aparecía como `VENCIDA` desde las 18:00 locales del día anterior. | **P1** | `vencimiento < NOW()` compara un día calendario naive con un instante UTC. | `vencimiento::date < (NOW() AT TIME ZONE 'America/Tegucigalpa')::date`. Prueba con fecha de hoy (no vencida) y de ayer (vencida). |
| H5 | Compra sin pruebas de **costo que baja**, de **recepción parcial con pendiente**, de **concurrencia de recepciones** y de **rollback** con datos reales. | P2 (cobertura) | Pruebas existentes con mocks. | Nueva suite PostgreSQL `compras.postgres.integration.ts` (24 casos). |
| H6 | Pantalla: recepción y pago se enviaban **sin confirmación**; una cuenta pagada no se distinguía; la nota de caja no aparecía. | P2 (UX) | Flujos sin paso de confirmación. | Confirmación antes de recibir y pagar; nota «Los pagos a proveedores no afectan la caja POS»; etiqueta «PAGADA». Textos ES/EN en `purchases.*`. |

**Lo que ya funcionaba y se verificó con PostgreSQL real**

- Recepción completa e idempotente: una recepción confirmada suma existencias **una vez**; reintento con la misma solicitud devuelve la recepción original sin volver a sumar.
- Recepción parcial: suma solo lo recibido; la orden queda `SOLICITADA`; exceder el pendiente se rechaza.
- Dos recepciones simultáneas que juntas exceden el pendiente: solo una aplica (`FOR UPDATE` sobre orden, línea y producto).
- Atomicidad: un producto inactivo en la recepción revierte todo (sin recepción, sin existencias, sin costos).
- Pagos: parcial, sobrepago rechazado, dos pagos concurrentes que juntos superan el saldo (solo uno aplica; saldo nunca negativo), reintento no descuenta dos veces.
- Caja: un pago a proveedor en efectivo, tarjeta o transferencia no exige caja abierta, `caja_id` queda NULL y no crea `movimientos_caja`.
- Permisos: CAJERO no compra ni recibe; BODEGUERO no paga; CxP solo ADMIN. Aislamiento: otra empresa no recibe, paga ni compra con entidades ajenas.
- Costo histórico: `costos_compra` conserva costo, proveedor y recepción de cada recepción.

**Reglas de negocio aplicadas**

- Costo vigente = costo unitario de la **última recepción que actualizó inventario**, suba o baje. No hay promedio ponderado. El precio de venta no cambia.
- Cada compra conserva proveedor, factura, fecha, monto (subtotal calculado en servidor) y vencimiento.
- Un pago no puede superar el saldo; un pago a proveedor no afecta la caja POS, con ningún método.
- Factura repetida: mismo proveedor, sin distinguir mayúsculas ni espacios, en la misma empresa.

**Pruebas ejecutadas**

- Unitarias backend: **326/326** (331 previas; 5 casos menos por la retirada de las rutas legadas). `tsc -p tsconfig.build.json`, `nest build` y oxlint sin errores.
- Integración PostgreSQL 16 (usuario `nobody`): **9 archivos, 159/159**. Nuevo `test/compras.postgres.integration.ts`: **24/24**, con 5 casos que fallaban antes de corregir (costo vigente en dos escenarios, factura duplicada sin distinguir mayúsculas, vencimiento por calendario, y la consulta de movimientos de caja de la prueba, que fallaba por un error propio de la prueba y se corrigió).
- Frontend `npm test`: **157/157**. `tsc -b`, `vite build` y oxlint de archivos tocados sin errores.
- Playwright: **84/84**, incluidas **5 E2E nuevas** en `e2e/compras-simulado.spec.ts`. **Son E2E con backend simulado** (identificadas en el nombre del archivo y en el propio spec): validan confirmaciones, doble envío, reintento con la misma solicitud, nota de caja y estado pagada. No sustituyen la validación de persistencia.

**Decisiones pendientes (no implementadas; requieren autorización)**

- **D1 · Compra al contado.** No existe: toda compra genera CxP y se paga después con `pagar()`. Alternativa: registrar compra ya pagada (sin caja, misma regla).
- **D2 · Momento de reconocer la CxP.** Hoy se reconoce al registrar la factura, antes de recibir la mercancía. Alternativa: reconocer al recibir. Es un criterio contable: no cambiado.
- **D3 · Anulación y corrección.** No hay endpoint para anular compras, recepciones ni pagos. Revertir una recepción plantea una pregunta de costo vigente (¿qué recepción queda vigente?). Requiere diseño y autorización.
- **D4 · ISV de la factura.** Se captura manualmente y no se valida contra las líneas. Alternativa: calcular el impuesto desde las líneas gravadas. Regla fiscal: no cambiado.
- **D5 · Costo editado manualmente.** Un ADMIN o BODEGUERO puede cambiar `precioCosto` en el catálogo (FS-07, decisión D1), lo que rompe la regla «costo vigente = última recepción». Decidir si se bloquea o se audita como excepción.
- **D6 · Alertas de vencimiento a 7 días.** **Resuelta en la revisión final del PR #103:** `resumen()` compara `vencimiento::date <= día de Tegucigalpa + 7` (antes comparaba instante UTC y en 18:00–23:59 locales incluía el día +8). Pruebas en `compras.postgres.integration.ts`. Sin cambio de reglas de reconocimiento de deuda.

**Conciliación propuesta para datos históricos (solo lectura; consultas completas en `backend/scripts/auditoria-compras-lectura.sql`, ejecutadas en PostgreSQL temporal por la prueba de auditoría)**

Antes de decidir qué hacer con H1, conviene medir si existen registros en el módulo legado y si algún pago CxP histórico quedó en caja. Consultas de solo lectura para ejecutar en una réplica o copia:

```sql
-- Compras registradas por el módulo legado (no afectan CxP real).
SELECT COUNT(*) AS compras_legado, COALESCE(SUM(monto),0) AS monto FROM compras_proveedor WHERE tenant_id = '<tenant>';
-- Pagos a proveedor del módulo legado.
SELECT COUNT(*) AS pagos_legado FROM pagos_proveedor p JOIN compras_proveedor c ON c.id = p.compra_id WHERE c.tenant_id = '<tenant>';
-- Pagos CxP históricos que sí quedaron ligados a una caja (incorrecto según FS-09).
SELECT p.id, p.monto, p.metodo, p.caja_id, p.created_at FROM pagos_cuenta p JOIN cuentas_operativas c ON c.id = p.cuenta_id WHERE c.tipo = 'CXP' AND p.caja_id IS NOT NULL;
-- Movimientos de caja generados por pagos CxP históricos.
SELECT m.* FROM movimientos_caja m JOIN cajas c ON c.id = m.caja_id WHERE c.tenant_id = '<tenant>' AND m.concepto ILIKE '%CXP%';  -- corregido: movimientos_caja no tiene columna tipo; el concepto no está tipificado
```

Si aparecen filas en la última consulta, la propuesta es **no modificar** `movimientos_caja` ni `cierres`: documentar cada caso con su cierre histórico y proponer un asiento de conciliación auditable, aprobado por el dueño.

**Riesgos residuales**

- **Despliegue:** retirar `/compras` puede romper integraciones externas que lo usen; la interfaz no lo usa.
- **Datos legados:** `compras_proveedor` y `pagos_proveedor` pueden contener deuda que no aparece en CxP (ejecutar la consulta de conciliación).
- Playwright con backend simulado: no prueba persistencia.
- Alertas de vencimiento (D6) y ISV manual (D4).

#### Revisión final de PR #103 (2026-10-09)

**Alcance de esta revisión:** no se modifica producción, datos reales, ni permisos. No se implementan compras al contado, cambio del momento de reconocer CxP, anulación de recepciones, automatización de ISV ni cambio de permisos de costo manual (D1–D5 quedan pendientes). La rama no toca ningún archivo de caja ni de cierres (`git diff --name-only origin/main...HEAD`).

**Hallazgo adicional H7 (P2, corregido):** la alerta de vencimiento a 7 días de `resumen()` comparaba contra `NOW() + 7 días` en instante UTC. Reproducido con una prueba exploratoria de un solo uso (a las 18:00 y 23:59 de Tegucigalpa la cuenta con vencimiento el día +8 entraba en la alerta; a las 00:00 no). Corrección: límite calendario `sumarDias(diaCalendario(ahora, zona), 7)` y comparación `vencimiento::date <= $2::date`. `cuentas()` recibe el mismo instante de referencia (`ahora`) para que la marca `vencida` sea verificable a cualquier hora; la regla no cambia.

**Matriz de rutas: legado frente a actual** (`backend/src/operaciones/operaciones.controller.ts`; el módulo `/compras` ya no está registrado en `app.module.ts`)

| Ruta legada | Estado | Ruta vigente | Diferencias de permiso |
|---|---|---|---|
| `GET /compras` | retirada | `GET /operaciones/compras` | `inventario.ver`; ADMIN y BODEGUERO. Incluye las líneas (no hay ruta de detalle aparte). |
| `POST /compras` | retirada | `POST /operaciones/compras` (registra factura y CxP, sin recibir) | `inventario.editar`; ADMIN y BODEGUERO. Ya no escribe costos ni existencias. |
| `GET /compras/:id` | retirada | sin equivalente de detalle; usar `GET /operaciones/compras` | — |
| `POST /compras/:id/pagos` | retirada | `POST /operaciones/cuentas/:id/pagos` | Guard ADMIN y CAJERO; el servicio rechaza no-ADMIN para CxP («requieren administrador»). Probado en PostgreSQL. |
| `GET /productos/:id/historial-compras` | retirada | `GET /operaciones/productos/:id/historial` | `inventario.ver`; ADMIN y BODEGUERO. |
| — (nuevo) | — | `POST /operaciones/compras/:id/recepciones` | Única vía que aumenta existencias y actualiza `costo_vigente`. |

Verificación: la ausencia de las rutas legadas se deduce de que el controlador y el módulo ya no existen; no hay prueba HTTP que lo afirme. Las pruebas HTTP de `operation-modules.http.spec.ts` ya no contienen esos casos.

**Pruebas añadidas en esta revisión** (todas contra PostgreSQL real salvo que se indique)
- Alerta de 7 días y vencida: 00:00, 18:00 y 23:59 locales, cambio de día a las 00:00, cuenta pagada que sale de la alerta, límites día +7 incluido y día +8 excluido.
- Secuencia de costos 45 → 60 → 40: costo vigente 40, costo histórico por compra `[45, 60, 40]`, precio de venta sin cambio.
- Recepción rechazada: costo vigente, existencias y líneas sin cambio.
- Factura reenviada con la misma solicitud: misma orden y una sola CxP.
- Auditoría histórica: `backend/scripts/auditoria-compras-lectura.sql` (11 consultas, solo `SELECT`). La prueba las ejecuta dentro de `SET TRANSACTION READ ONLY` sobre datos con anomalías sembradas por SQL (factura duplicada con espacios y mayúsculas, orden RECIBIDA con líneas pendientes, saldo que no concilia) y verifica que se detectan, que no cambian los datos, y que una escritura en modo lectura falla.
- Frontend simulado (`compras-simulado.spec.ts`): registrar factura con doble clic envía una sola solicitud.

**Resultados locales de esta revisión** (ejecutados, no declarados)
- Backend unitarias: 326/326. Integración PostgreSQL como usuario sin privilegios: 169/169 en 9 archivos (línea base 159; +6 vencimiento, +3 costos/recepción/idempotencia, +1 auditoría).
- `tsc -p tsconfig.build.json`, `nest build`, `oxlint`: sin errores. Avisos existentes en archivos no tocados y en `operaciones.service.ts` (`no-useless-default-assignment`, por parámetros por defecto que ya existían). `test:scripts`: 13/13.
- Prettier: `operaciones.service.ts` y `compras.postgres.integration.ts` ya no cumplían Prettier en `HEAD`; no se reformatearon para no ensuciar el diff.
- Frontend: `npm test` 157/157; `tsc -b` sin errores; build con `VITE_API_URL=https://api.example.test/api` correcto; `npm run lint` sin errores (avisos `react(set-state-in-effect)` en páginas no tocadas); Playwright completo 85/85 (línea base 84; +1 doble clic de factura).
- Migraciones: sin cambios en `backend/prisma` en la rama.

**Qué no cubre esta revisión (riesgo residual declarado)**
- No hay prueba automatizada de que los cierres de caja históricos queden intactos tras pagos CxP. La rama no toca código de caja ni de cierres, pero la comprobación explícita sigue pendiente.
- Playwright usa backend simulado: valida la interfaz, no la persistencia.
- Sidebar y topnav no se validaron visualmente.
- No se ejecutó la consulta de conciliación contra datos históricos reales: no hay acceso a la base de producción desde este entorno. Es el primer paso antes de decidir sobre H1.
- Los datos del módulo legado (`compras_proveedor`, `pagos_proveedor`) pueden contener deuda que no aparece en CxP.

**Decisiones pendientes** (sin implementar; ver D1–D6 arriba)
- D1 compra al contado, D2 momento de reconocer la CxP, D3 anulación de recepciones, D4 ISV automatizado: sin cambio.
- D5 costo editado a mano: **recomendación** restringir el cambio de `precioCosto` a ADMIN, exigir motivo y registrar auditoría con valor anterior y nuevo. No implementado por instrucción: requiere autorización de negocio.

**Riesgos residuales:** datos históricos del módulo legado (ejecutar la auditoría antes de decidir), costo editable a mano hasta decidir D5, prueba de cierres pendiente, UI validada solo con backend simulado.

**Veredicto de esta revisión:** APTO PARA MERGE, condicionado a que el commit nuevo tenga los workflows de GitHub Actions en verde y que la rama siga sin conflictos con `main` en el momento de fusionar. La fusión no se ha hecho.

### Crédito de clientes — blindaje P0 (2026-10-09, rama `fix/p0-credit-integrity`)

**Base:** `main` `00f72c02` (PR #103 ya fusionado). Rama nueva desde `main`. Sin merge ni despliegue. Sin migraciones: `backend/prisma` no cambia.

**Evidencia de la auditoría de Codex:** no encontrada en el repositorio ni en los artefactos de la sesión. Las menciones de Codex en el repositorio son de otros temas (escáner de código de barras, `907b33db` revertido). No se usaron resultados de Codex. Todos los defectos se reprodujeron directamente con PostgreSQL real.

**Reproducción inicial** (`backend/test/credito.postgres.integration.ts`, 15 casos, antes de corregir): **8 fallaban y 7 pasaban**.
- Fallaban: conversión de cotización a crédito por encima del límite (C1), conversión a crédito de cliente sin crédito habilitado (C1), venta de cotización guardada como `CONTADO` sin saldo de crédito (C2), reintento de abono heredado aplicado dos veces (C3), abono heredado sin `pagos_cuenta`, caja ni auditoría (C3), devolución de venta a crédito que deja la deuda del cliente en 115 (C4), y la invariante CxC = monto − pagos rota por el abono heredado (C3).
- Pasaban (protecciones existentes): dos ventas que compiten por el mismo cupo (serializadas por `lockTenant`), dos pagos simultáneos sobre la misma CxC, reintento de `pagar` con la misma solicitud, abonos sucesivos hasta saldar, aislamiento entre empresas y consistencia cliente = suma de CxC.
- Nota del arnés: la primera versión aplicaba DDL generado desde el esquema y no incluía los triggers de numeración de clientes de las migraciones. Se cambió a la cadena completa de migraciones, en orden, sobre base vacía (verificada sin errores).

**Causas raíz**
- **C1 · Cotización a crédito sin validación de crédito.** `convertirAVenta` creaba la CxC sin revisar `creditoHabilitado`, `activo` ni el límite.
- **C2 · Cotización a crédito incompleta.** No guardaba `tipo_pago = CREDITO` ni `saldo_credito`, y no incrementaba `clientes.saldo_pendiente`. Ventas, abonos y devoluciones tratan esos campos como la fuente de verdad.
- **C3 · Ruta paralela de abonos.** `POST /clientes/:id/abonos` (`ClientesService.addPayment`) no tenía idempotencia, no registraba caja, `pagos_cuenta` ni auditoría, y sí reducía la CxC y el saldo del cliente. No tenía llamadas desde el frontend.
- **C4 · Cancelación incompleta.** `ejecutarDevolucion` reducía la CxC pero no `clientes.saldo_pendiente` ni `ventas.saldo_credito`: deuda ficticia.

**P0 corregidos**
- **P0-A (conversión a crédito):** la conversión desde cotización aplica las mismas reglas que una venta directa: cliente activo, crédito habilitado, límite con saldo actual. Guarda `tipo_pago`, `saldo_credito` e incrementa el saldo del cliente, todo en la misma transacción. Una cotización no puede convertirse dos veces. Una venta con solicitud repetida no duplica venta, CxC ni saldo.
- **P0-B (abonos):** el único camino de abono es `POST /operaciones/cuentas/:id/pagos` (`operaciones.pagar`): idempotente por `solicitud_id` con hash, bloqueo `FOR UPDATE` de la CxC, actualización condicional del cliente, caja (`ABONO_CXC`), `pagos_cuenta` y auditoría. La ruta heredada `POST /clientes/:id/abonos` queda **bloqueada con HTTP 410** (`GoneException`) y no modifica saldos. No se inventó una regla nueva para ella.
- **P0-C (cancelaciones):** la devolución de venta a crédito cancela en la misma transacción la CxC, el saldo del cliente y `saldo_credito`. Con abonos previos se mantiene la **regla vigente** documentada en `CONTEXTO_MAESTRO` (sección de devoluciones): primero se cancela el crédito pendiente y el excedente pagado es reembolso. Nota: en un primer intento se bloqueó este caso, pero contradecía la regla documentada y se revirtió antes de cerrar la fase.

**Matriz de invariantes y pruebas** (todas contra PostgreSQL real salvo indicación)
| Invariante | Prueba |
|---|---|
| Saldo de CxC = monto − pagos − crédito cancelado por devolución | `invariante: el saldo de cada CxC…` |
| Saldo del cliente = suma de sus CxC abiertas | `invariante: el saldo del cliente…` |
| Ninguna operación consume más crédito que el autorizado | `P0-A dos ventas…` (cupo de 150, una de 115) y `P0-A una venta… supera el límite` |
| Solicitud repetida no duplica obligaciones ni pagos | `P0-B un reintento de la misma solicitud…`, `una misma solicitud de venta…`, `una cotización convertida… no puede convertirse de nuevo` |
| Transacción fallida sin cambios parciales | `caso 7…` (inconsistencia previa; el abono falla tras escribir CxC y pago) |
| Operaciones de un tenant no afectan a otro | `multi-tenant…` |
| Cancelaciones sin deuda ficticia | `P0-C devolver… sin abonos…` y `con abonos…` |
| Trazabilidad por operación | `P0-B un abono de CxC (ruta canónica)…` (pago, caja y auditoría `CUENTA_PAGAR`) |
| Abonos parciales hasta saldar exactamente | `P0-B abonos parciales sucesivos…` |
| Revocación de permisos antes de ejecutar | `caso 6…` (el autorizador pierde el rol; `ejecutarAutorizada` rechaza) |

**Casos de estrés solicitados**
- Caso 1 (dos ventas por el mismo crédito): cubierto, PostgreSQL real.
- Caso 2 (doble clic en abonar) y caso 3 (reintento tras perder la respuesta): cubiertos a nivel backend con la misma solicitud. La prueba usa el mismo usuario.
- Caso 4 (dos cajeros sobre la misma CxC): cubierto con concurrencia real, pero **ambas operaciones usan el mismo ADMIN**. No se simularon dos usuarios distintos.
- Caso 5 (devolución y abono simultáneos sobre la misma venta): cubierto. Se verifica que exactamente una prospera y que los saldos coinciden.
- Caso 6 (ADMIN que pierde autorización antes de ejecutar): cubierto como **revocación secuencial**, no concurrente.
- Caso 7 (fallo intencional entre escrituras): cubierto con una inconsistencia previa que provoca el fallo tras escribir CxC y pago.
- Caso 8 (cliente o CxC de otro tenant): cubierto.
- Caso 9 (abonos sucesivos hasta exacto): cubierto.
- Caso 10 (cancelación con pagos previos): cubierto con la regla vigente.

**Resultados locales** (ejecutados)
- Backend unitarias: 326/326. Se actualizaron dos pruebas unitarias por cambio de comportamiento intencional (abono heredado bloqueado) y por fixture incompleto (CxC sin cliente).
- Integración PostgreSQL (usuario no root): 190/190 en 10 archivos (línea base 169 + 21 de crédito).
- `tsc -p tsconfig.build.json`, `nest build`, `oxlint`: sin errores.
- Frontend: `npm test` 157/157, `tsc -b`, build correctos. Playwright 85/85. **Las E2E usan backend simulado.** No se cambió el frontend: la interfaz ya muestra los mensajes del backend (`POSPage`, `OperacionesPage`).

**Decisiones de negocio pendientes (no implementadas)**
- Ruta heredada `POST /clientes/:id/abonos`: se bloquea (410). Si algún integrador la usa, debe migrar a `/operaciones/cuentas/:id/pagos`. Decidir si se elimina por completo.
- Reembolso con abonos: se conserva la regla vigente, pero el importe mostrado es estimado y puede cambiar con pagos o devoluciones posteriores. Necesita confirmación del propietario sobre el comportamiento final.
- Conversiones a crédito hechas antes de esta corrección: si la cotización se convirtió a crédito, la venta tiene CxC pero `clientes.saldo_pendiente` no incluye ese saldo. Hace falta una conciliación de solo lectura antes de corregir datos.

**Riesgos residuales**
- La conciliación de datos históricos no se ha ejecutado sobre producción.
- Caso 4 y caso 6 no se probaron con usuarios concurrentes distintos.
- Playwright usa backend simulado; no demuestra persistencia.
- Sidebar y topnav no se validaron visualmente.
- Esta fase no añade prueba automatizada de cierres de caja históricos (pendiente desde la revisión de PR #103).

#### Validación financiera final de devoluciones con abonos (2026-10-10, PR #104)

**Veredicto sobre reembolsos:** el flujo actual **no genera reembolsos pendientes**. Cada devolución ejecuta en la misma transacción: (1) cancela primero el crédito pendiente de la CxC, (2) reduce el saldo del cliente y `saldo_credito` por ese importe, (3) calcula el reembolso como `monto − crédito cancelado` (el excedente pagado), (4) si hay reembolso, registra un movimiento de caja negativo en la **caja abierta del solicitante**, verificando efectivo suficiente cuando el método es EFECTIVO, y (5) guarda devolución, método, caja, responsable y auditoría. Es lo que documenta la regla de devoluciones: el reembolso sale de la caja del solicitante. No existe un estado "reembolso pendiente". Si el negocio quiere reembolsos diferidos, es una decisión nueva (ver pendientes).

**Fuente de verdad de los saldos:** la CxC (`cuentas_operativas.saldo`). `clientes.saldo_pendiente` y `ventas.saldo_credito` son derivados que se actualizan en la misma transacción. Invariante verificada: `saldo CxC = monto − pagos aplicados − crédito cancelado por devoluciones`.

**Escenarios probados** (PostgreSQL real; venta de 1 unidad a 100 + ISV = 115.00; abono de 30 % = 34.50):
| Escenario | Resultado verificado |
|---|---|
| A. Sin abonos | Crédito cancelado 115.00, reembolso 0.00, sin movimiento de caja, crédito disponible vuelve a 250 (límite), 1 auditoría |
| B. Abono 34.50 | Crédito cancelado 80.50 + reembolso 34.50 = 115.00. Caja −34.50 (un movimiento, usuario y método). Abono conservado en `pagos_cuenta` |
| C. Pagada 115.00 | Crédito cancelado 0.00, reembolso 115.00, caja −115.00, devolución trazable (caja, usuario, método) |
| D. Reintentos | Misma solicitud devuelve el mismo registro sin nuevos efectos. Segunda solicitud sobre venta cancelada se rechaza. Una devolución, un movimiento, una auditoría |
| E. Concurrencia (orden 1 y 2 secuenciales, y concurrente en sesiones independientes) | Orden abono→cancelación: reembolso 34.50. Orden cancelación→abono: abono rechazado (saldo 0), caja sin cambio. En concurrencia, solo son válidos esos dos resultados; la CxC, el cliente y la venta cuadran en ambos |
| F. Fallo intermedio (trigger de error tras escribir CxC, cliente, venta y devolución) | Estado idéntico al previo (CxC, cliente, venta, caja, devoluciones, auditoría, stock). Después, la misma solicitud se ejecuta una sola vez |
| Devoluciones parciales sucesivas (2 unidades, abono 69.00) | Primera: crédito 115.00, reembolso 0. Segunda: crédito 46.00, reembolso 69.00. Total reembolsos 69.00 = pagado; crédito + reembolsos = 230.00 |
| Ruta 410 `POST /clientes/:id/abonos` | Sin pagos, sin saldos alterados, sin movimientos de caja ni abonos creados |
| Permisos | CAJERO no puede cancelar directamente; otra empresa no puede cancelar; autorizador que pierde el rol impide la ejecución |
| Caja cerrada | Sus movimientos no cambian al cancelar una venta con abonos |

**Estado de caja** (efectivo, variación por operación): A 0.00 · B −34.50 · C −115.00 · D −34.50 (una sola vez) · E orden 1: −34.50 respecto a la caja tras el abono; concurrente: 0.00 si ambas se confirman; si solo se confirma la cancelación, la caja no cambia · F 0.00 tras el fallo y −34.50 al reintentar.

**Defecto confirmado y corregido en esta revisión:** ninguno en el flujo de reembolsos. Se corrigió la **aserción** de la prueba de caso 5 (concurrencia): asumía que solo prosperaba una de las dos operaciones, lo que venía del bloqueo que se revirtió. Ahora acepta los dos órdenes válidos y verifica cada uno. Las pruebas de orden secuencial lo fijan explícitamente.

**Tratamiento de caja:** registra reembolso automático en la caja abierta del solicitante y no en cierres históricos (la caja debe estar `ABIERTA`). Exige autorización de otro administrador cuando la solicitud la hace un cajero. El administrador que cancela directamente se autoriza a sí mismo (diseño existente, no modificado). Guarda método y responsable.

**Conciliación histórica (solo lectura):** `backend/scripts/conciliacion-credito-lectura.sql` (8 consultas): CxC sin cliente, saldo de cliente que no concilia con sus CxC, venta a crédito sin CxC, firma de conversión antigua (método CREDITO con tipo CONTADO), `ventas.saldo_credito` que no concilia, CxC que no concilia con pagos y devoluciones, reembolsos sin movimiento de caja, y abonos de la ruta heredada (informativo). La prueba verifica cero falsos positivos sobre flujos válidos, detección de anomalías sembradas y que la consulta no modifica datos. **No se ejecutó sobre producción.**

**Antes de una eventual conciliación real hay que verificar:** (1) cuántas conversiones de cotización a crédito se hicieron antes de la corrección y cuáles aún no reflejan saldo del cliente; (2) si hubo abonos por la ruta heredada (`abonos_cliente`) y en qué caja se registraron, porque no tienen pago ni movimiento de caja; (3) qué cierres de caja contienen efectivo de devoluciones o abonos; (4) si algún cliente tiene saldo distinto de la suma de sus CxC; (5) decisión del propietario sobre cada hallazgo antes de corregir.

**Pruebas (ejecutadas):** integración PostgreSQL 16, usuario no root, cadena completa de migraciones: 203/203 en 10 archivos (la suite de crédito tiene 34 casos). Unitarias 326/326. `tsc`, `nest build` y `oxlint` sin errores. Frontend: 157/157, `tsc -b` y build correctos. Playwright 85/85 con backend simulado.

**Frontend:** Cuentas usa `POST /operaciones/cuentas/:id/pagos` con solicitud idempotente. No hay llamadas a `/clientes/:id/abonos`.

**Riesgos residuales**
- Caso 4 (dos cajeros) y caso 6 (revocación) siguen sin probarse con usuarios concurrentes distintos.
- La conciliación no se ha ejecutado sobre datos reales.
- Playwright usa backend simulado.
- El importe mostrado al administrador es estimado.

**Decisiones de negocio pendientes**
1. ¿El reembolso debe ser inmediato desde la caja (como está documentado) o diferido como obligación? Hoy no hay estado diferido.
2. ¿El administrador puede cancelar directamente su propia venta a crédito sin segunda autorización? Hoy sí.
3. Eliminar o mantener bloqueada `POST /clientes/:id/abonos` (decisión de la fase anterior).

### FS-07 — edición integral y segura de productos (2026-10-09)

- **Base:** `main` `52703309` (PR #101, FS-06 fase 2, **ya fusionado** por `Nelosama` el 2026-10-09 20:43 UTC; CI de `59e39313` en success). Rama `fix/fs-07-edicion-productos`. PR abierto hacia `main`. Sin merge ni despliegue.

**Matriz de campos (auditoría antes del cambio)**

| Campo | En BD | En formulario | Editable | Persistencia real antes → después |
|---|---|---|---|---|
| Nombre, descripción, código interno, código de barras, código fabricante | sí | sí | sí | sí, sin control de versión → con versión |
| Marca | sí (FS-06) | sí | sí | sí; vacío no borra (FS-06) |
| Categoría | sí (`categoriaId`) | **no** | solo API | sí; `''` **borraba** la categoría → vacío no cambia |
| Unidad de medida | sí | **no** | solo API | sí, sin protección con historial → protegida |
| Precio de venta | sí | sí | sí | sí, auditado; ventas históricas intactas (probado) |
| Costo vigente | sí | sí | sí (ADMIN/BODEGUERO) | sí, auditado; ver decisión D1 |
| Margen propio | sí | sí | sí | sí |
| Stock mínimo | sí | sí | sí | sí |
| Existencias | sí | sí, **siempre enviado** | sí, con motivo | sí, con AJUSTE; **un formulario viejo podía revertirlas** → ahora protegido |
| Estado activo | sí | **no** | solo baja lógica (ADMIN) | **sin reactivación desde la UI** → reactivable |
| Imagen (URL) | sí | sí | sí | sí (fotografías: fase separada) |
| Usa medida | sí | no | solo API | sí |
| Lotes, series, vencimientos | **no** existen en el esquema | — | — | no se inventó modelo |

**Hallazgos**

- `PUT /productos/:id` sin control de concurrencia: una edición simultánea o un formulario abierto sobrescribía en silencio.
- El formulario enviaba `stockActual` en cada guardado: un valor leído antes podía revertir existencias.
- `InventarioPage` reducía cada producto a una lista blanca de campos **sin `version`**: con el control de versión, ninguna edición se habría podido guardar. Corregido junto con el control de versión.
- `categoria: ''` en actualización parcial borraba la categoría.
- Desactivar era irreversible desde la interfaz (la lista solo muestra activos).
- Cambiar la unidad de medida reinterpretaba cantidades históricas.
- Código de barras repetido solo se validaba contra productos activos.
- Auditoría `PRODUCTO_EDITAR` guardaba solo costo, precio y stock anteriores: cambios de nombre, código o barras no tenían valor anterior.
- Importador masivo (`ImportarProductosModal`) llama a `PUT /productos/:id` y sobrescribe existencias al elegir «sobrescribir» (comportamiento existente, ver D4).

**Cambios implementados**

- **Versión (control optimista):** columna `productos.version` (default 1). Cada edición exitosa la incrementa. Una versión obsoleta responde `409` con `code: PRODUCTO_VERSION` y no escribe nada. La validación ocurre dentro de la transacción con `lockTenant`.
- **Edición parcial:** `UpdateProductoDto` exige `version`; sin ella, `400`. El backend escribe solo los campos enviados. Frontend: `construirCambiosProducto` envía solo lo que cambió, la versión, y las existencias únicamente si cambiaron (con motivo).
- **Estado:** `activo` editable solo por ADMIN (`403` para BODEGUERO y CAJERO). `GET /productos?incluirInactivos=true` permite reactivar.
- **Unidad de medida:** cambia solo si no hay existencias, reservas ni movimientos distintos del alta `INICIAL`; si no, `409` con mensaje.
- **Códigos:** código interno único por empresa sin distinguir mayúsculas; código de barras único entre **todos** los productos de la empresa (activos o inactivos), en alta y edición y al reactivar. Empresas distintas pueden usar los mismos códigos.
- **Categoría:** vacía no cambia la categoría (igual que la marca).
- **Auditoría `PRODUCTO_EDITAR`:** `datos.cambios` con `{anterior, nuevo}` de cada campo modificado, `motivo`, `version` anterior y nueva; el usuario queda en `usuario_id`.
- **Frontend:** `ProductoGestion` reescrito en grupos (Identificación, Clasificación, Precios y costo, Existencias, Estado, Imagen), con validación antes de guardar, advertencia de confirmación para cambios sensibles (códigos, unidad, precios, existencias, estado), prevención de doble envío, mensaje de éxito, error de conexión sin perder datos, y conflicto de versión que recarga la lista. Textos en ES y EN (`product_edit.*`). Categoría, unidad y estado ahora son editables en la interfaz.
- **Importador:** envía la versión que leyó del listado; un producto cambiado después se cuenta como error, no se sobrescribe.
- **Corrección de regresión detectada por E2E:** `InventarioPage` ahora conserva `version`, `marca`, `categoriaId` y nombre real de categoría. `'General'` (texto de visualización) ya no se convierte en categoría.

**Migración**

- `backend/prisma/migrations/20261009130000_fs07_version_producto/migration.sql`: `ALTER TABLE productos ADD COLUMN version INTEGER NOT NULL DEFAULT 1`. Solo agrega columna con valor por defecto; no modifica existencias, precios ni filas existentes. Reversión manual: `ALTER TABLE productos DROP COLUMN version`.
- Listas explícitas de migraciones de `ventas.postgres.integration.ts` y `reportes-zona-horaria.postgres.integration.ts` actualizadas.

**Pruebas**

- Unitarias backend: **331/331** (`npx vitest run`). `tsc -p tsconfig.build.json` y `nest build` sin errores. Lint de `src/productos` y `src/levantamientos` sin errores.
- Integración PostgreSQL 16 (usuario `nobody`): suite completa **8 archivos, 135/135**. Nuevo `test/productos-edicion.postgres.integration.ts`: **15/15** (edición parcial sin pérdida; versión obsoleta sin revertir existencias; edición simultánea; reintento; código y barras con auditoría; duplicados activos e inactivos; otra empresa; permisos ADMIN/BODEGUERO/CAJERO; reactivación; existencias sin cambio por nombre/marca/categoría; AJUSTE con motivo auditado; precio y costo sin tocar ventas históricas; unidad protegida; marca y categoría que persisten; edición sin versión rechazada).
- **Mutación de control:** al desactivar la comprobación de versión, fallan 3 pruebas de concurrencia (versión obsoleta, simultáneas, reintento). Archivo restaurado.
- Pruebas existentes actualizadas por el nuevo contrato (enviar versión): `productos.postgres.integration.ts` (SEC-005 y BODEGUERO) y 6 pruebas de `levantamientos.postgres.integration.ts`. Ninguna aserción se relajó.
- Frontend `npm test`: **157/157** (incluye `producto-edicion.test.mjs`, 14 casos, con regresión del mapeo de inventario). `tsc -b` y `vite build` (con `VITE_API_URL=https://api.example.test/api`) correctos. Lint de archivos tocados sin errores.
- Playwright (suite de la CI): **79/79** (71 previas + **8 nuevas** de `e2e/productos-edicion.spec.ts`: edición parcial, confirmación de costo con cancelación, conflicto de versión, doble clic, fallo de red y reintento, motivo de existencias, reactivación, móvil 390 px). Usa servidor simulado en memoria con la misma regla de versión; **valida la interfaz y el contrato del payload, no el backend real**.

**Decisiones pendientes (no implementadas; requieren autorización)**

- **D1 · Costo vigente manual (financiero).** Hoy ADMIN y BODEGUERO pueden cambiar el costo a mano; queda auditado. Alternativas: (a) mantener así; (b) bloquear el cambio manual y que el costo solo cambie por recepción de compra o ajuste con motivo; (c) manual solo ADMIN con motivo obligatorio. Impacta reglas de compras: no cambiado.
- **D2 · Código de barras y productos inactivos.** Implementado como único en toda la empresa (más estricto). Alternativa: solo activos. Riesgo: duplicados heredados entre inactivos impedirán crear o reactivar ese código hasta corregirlos. Conviene consultar primero los datos reales.
- **D3 · Unidad de medida.** Implementado: cambio solo sin historial. Alternativa: factores de conversión (no implementados; requieren definición de negocio).
- **D4 · Importador «sobrescribir».** Mantiene que el archivo sustituya existencias de productos existentes (auditado con motivo «Importación de inventario revisada»). Decidir si debe confirmarse por separado o solo sobrescribir precios.
- **D5 · Borrar marca o categoría.** En actualización parcial vacío no borra. Para borrar hace falta un indicador explícito (p. ej. `null` o acción dedicada). No implementado.
- **D6 · Visibilidad de inactivos.** `incluirInactivos` lo puede pedir cualquiera con acceso al listado de productos. Alternativa: solo ADMIN.

**Riesgos residuales**

- **Despliegue acoplado:** las versiones antiguas del frontend (en caché) envían `PUT` sin `version` y recibirán `400`. Desplegar backend y frontend juntos y refrescar el navegador.
- **Datos de producción:** antes de activar, consultar duplicados de código de barras entre productos inactivos (D2).
- **Interfaz no validada visualmente** en SIDEBAR y TOPNAV: no hubo cambios de navegación, pero no se capturaron capturas en ambos modos.
- Playwright con servidor simulado: no prueba el backend real ni el importador.
- Importador masivo sin prueba automatizada propia (cambios de versión verificados solo por compilación).
- Textos de ayuda de `ProductoGestion` nuevos en ES y EN; otras pantallas del catálogo siguen con textos existentes.

**Pendientes de otras fases**

- Ubicación física por sucursal: bloqueada (sin modelo de sucursal).
- Validación en iPhone real: pendiente.
- Lotes, series, vencimientos y garantías: sin modelo en el esquema.

### FS-05 — fechas y horarios de reportes (2026-10-09)

- **Causa raíz:** `created_at` es `TIMESTAMP(3)` sin zona que guarda UTC. El resumen de `/operaciones/resumen` filtraba con `created_at >= $2::date`, es decir, medianoche UTC; el dashboard calculaba "hoy", "ayer" y la tendencia con `setHours`, que usa la zona del servidor (UTC en el despliegue). Resultado: ventas de 18:00–23:59 hora de Tegucigalpa caían en el día siguiente. La página de Reportes además armaba su rango por defecto con `toISOString()` y mostraba el aviso «Fechas del reporte en UTC».
- **Corrección** (rama `fix/fs-05-reportes-zona-horaria`): `backend/src/common/zona-horaria.ts` (zona por defecto `America/Tegucigalpa` como constante, configurable por parámetro; sin zona fija global); `operaciones.service.ts` `resumen()` consulta con instantes UTC del día local (`::timestamptz AT TIME ZONE 'UTC'`, independiente de la zona de la sesión de PostgreSQL); `dashboard.service.ts` usa día calendario local para hoy/ayer/tendencia/cotizaciones por vencer/hora; `ReportesPage` usa `diaCalendarioEnZona()` y el aviso se traduce con la zona; recibo de POS y cierres (`OperacionesPage`) muestran hora en la zona del negocio. No se modificaron datos ni instantes almacenados.
- **Reproducción previa:** con `TZ=UTC`, 5 pruebas nuevas fallaban (`dashboard.zona-horaria.spec.ts`, `resumen-zona-horaria.spec.ts`). Tras el cambio pasan con `TZ=UTC`, `America/Tegucigalpa` y `Asia/Tokyo`.
- **Pruebas:** backend unitarias 331/331 (antes 316); `zona-horaria.spec.ts` cubre medianoche, cambio de día/mes/año y horario de verano de Nueva York; `tsc` backend y `tsc -b` frontend sin errores; frontend `npm test` 143/143 (incluye `reportes-zona-horaria.test.mjs`, 5 casos); `vite build` OK (con `VITE_API_URL=/api`, salida fuera del repo); oxlint sin errores en archivos tocados.
- **Validación PostgreSQL real (2026-10-09, sesión posterior):** `test/reportes-zona-horaria.postgres.integration.ts` (PostgreSQL 16.15, migraciones reales, clúster temporal). Ejecutado como usuario existente `nobody` (`runuser`), porque `initdb` no corre como root; no se crearon cuentas ni se cambiaron permisos del repositorio.
  - Suite de integración completa: **7 archivos, 99/99** (79 previas + 20 nuevas).
  - Nueva prueba: **20/20** = 5 casos × 4 zonas de sesión (`UTC`, `Asia/Tokyo`, `America/Tegucigalpa`, `Pacific/Pago_Pago`), verificando `current_setting('TimeZone')` en cada sesión. Cubre primer y último milisegundo del día local, venta de las 20:30 locales, anuladas, rangos inclusivos (8–10), particiones diarias sin duplicar ni omitir (5 ventas, L 3,060) y coincidencia POS/reporte/dashboard en el neto del 9 (L 45).
  - **Mutación 1** (quitar `AT TIME ZONE 'UTC'`): 12/20 fallan, solo en zonas no UTC. Confirma que la conversión vuelve el resultado independiente de la zona de sesión.
  - **Mutación 2** (código de `origin/main`, previo al fix): 16/20 fallan en todas las zonas. Confirma la regresión. Código restaurado; `git status` limpio.
  - Unitarias backend 331/331; `tsc -p tsconfig.build.json` sin errores. `tsc -p tsconfig.json` reporta 1366 errores de tipos globales de Vitest en specs y pruebas de integración existentes (pre-existente, no introducido por este PR).
  - Frontend: 143/143 (`npm test`), `tsc -b` y `vite build` correctos, oxlint sin errores.
  - GitHub Actions sobre el head `157b3732`: `Operación de ferretería` run [37970951477](https://github.com/Nelosama/FerreSystem/actions/runs/37970951477) = **success** (incluye «Backend: compilación y pruebas» e «Integración con persistencia PostgreSQL real», `npm run test:integration`); `Playwright Tests` run [37970951163](https://github.com/Nelosama/FerreSystem/actions/runs/37970951163) = **success**. Ejecuciones previas sobre `7f31a24f` (37966166005) y `18b5adfc` (37970924872) también en success.
  - **Cambio histórico en reportes:** las ventas de 18:00–23:59 locales se asignan al día local correcto. Los totales diarios de días pasados cambian en esa franja; en rangos solo cambian los bordes. Los datos almacenados no se modifican. Impacto documentado en el cuerpo del PR #99. **Aprobación del responsable funcional: PENDIENTE** (no identificado en el repositorio). No fusionar hasta registrarla.
- **Pendientes / riesgos:** (1) `cotizaciones.service.ts` (≈7 bloques `setHours`) sigue usando la zona del servidor para vencimientos; mismo patrón, fuera de alcance de FS-05, decidir si se corrige. (2) `ApartadosPage`, `TransferenciasPage`, `GarantiasPage` y `PedidosEspecialesPage` corregidos en la rama `fix/fechas-zona-negocio-modulos` (bloque siguiente); `AuditoriaPage`/`DevolucionesPage` siguen pendientes. (3) El supuesto de que la sesión de PostgreSQL y `NOW()` usan UTC para columnas `TIMESTAMP` no está verificado en producción (`SHOW timezone`). (4) Los datos históricos no se tocaron, pero los reportes de días pasados **cambiarán** al desplegar: ventas de 18:00–23:59 locales se moverán al día correcto. Avisar al cliente antes de desplegar. (5) Sin validación en navegador ni en producción.
- PR [#99](https://github.com/Nelosama/FerreSystem/pull/99), rama `fix/fs-05-reportes-zona-horaria`: **fusionado en `main`** (`ef6b9fa1`). Se fusionó **antes** de registrar la aprobación funcional del cambio histórico, que sigue **PENDIENTE**: registrarla o evaluar su reversión/comunicación. Sin despliegue.

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

