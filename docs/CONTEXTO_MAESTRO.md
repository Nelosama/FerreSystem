Warning: truncated output (original token count: 198217)
Total output lines: 4971

# FerreSystem — contexto maestro y continuidad entre agentes

## Etapa 4 de las decisiones del 2026-11-12: RTN del cliente — 2026-11-16 (rama `claude/jowa-etapa4-rtn`, base `main` `5feae04`)

- **Estado de Git al iniciar:** `main` `5feae04` (merge de #247). Abiertos: #248 (etapa 3, caja; borrador, head `b17b4ca`, CI verde, sin hilos de revisión abiertos; las seis observaciones de Codex respondidas y corregidas) y #249 (evaluación de producción; borrador, head `057b657`, CI verde). #246 y #247 integrados. La etapa 4 no usa caja ni autorizaciones, así que parte de `main` en su propio PR sin esperar a #248.
- **Regla (decisión del dueño del 2026-11-12, Notion):** si el cliente no pide RTN, el campo queda vacío y la operación sigue; si lo pide, exactamente 14 dígitos, con espacios o guiones como separadores visuales, y se guardan solo los dígitos; si no cumple, aviso y bloqueo hasta corregirlo. Se valida el formato, no la existencia.
- **Implementado:**
  - `backend/src/common/rtn.ts`: `rtnOpcional` y `normalizarRtn`; Contabilidad (`fiscal-hn.ts`) reutiliza la misma regla.
  - Clientes (crear y editar), ventas (`clienteRtn`, después del reintento idempotente para que una venta ya registrada se siga devolviendo igual) y cotizaciones (crear y editar, también el RTN copiado del cliente registrado, con mensaje «corríjalo en Clientes»).
  - **Datos guardados antes de la regla:** no hay migración ni modificación automática de RTN de clientes; editar un cliente o una cotización sin enviar su RTN lo conserva; volver a enviarlo o copiarlo a un documento nuevo exige corregirlo. No se verificaron ni limpiaron bases reales.
  - Pantalla (`frontend/src/utils/rtn.ts`, espejo de la regla): aviso junto al campo (`aria-invalid`, `role="alert"`) y bloqueo del cobro en el POS y del guardado en cotizaciones; en el POS la sección del cliente sigue visible mientras el RTN esté mal. Una venta pendiente se reenvía idéntica (no se vuelve a validar en pantalla). Clientes usa la misma regla: antes quitaba cualquier carácter no numérico y aceptaba, por ejemplo, letras intercaladas.
- **RTN del emisor (decisión del dueño, 2026-11-16):** usa la misma regla opcional de 14 dígitos que clientes; espacios y guiones se aceptan al escribir y se persisten solo los dígitos. La configuración muestra el campo al Super Admin y el servidor rechaza un RTN inválido antes de guardar. Si ya hubiera un valor heredado inválido en la configuración del negocio, el siguiente guardado de configuración lo limpia a `null`; no se ejecuta limpieza sobre bases reales.
- **Fuera de alcance:** RTN de proveedores y RTN de la contingencia sin conexión (apagada; validarla podría rechazar al sincronizar ventas ya cobradas en el equipo).
- **Pruebas nuevas:** `backend/src/common/rtn.spec.ts` (5), `backend/test/rtn-etapa4.postgres.integration.ts` (6: persistencia en dígitos, rechazo sin efectos en ventas, cotizaciones, existencias ni caja, idempotencia, datos heredados y aislamiento; con el código de `main` fallan 4 de 6), `frontend/test/rtn.test.mjs` (2), E2E en Chromium `pos-tarjeta-simulado.spec.ts` (+2; el del RTN mal escrito falla con la página anterior) y `cotizaciones-rtn-simulado.spec.ts` (2). `operaciones.test.mjs` y `pos-client-credit.test.mjs` registran la utilidad en su cargador (sin ella, el POS quedaba en bucle en esas pruebas).
- **Fallos esperados de la integración:** los 2 son `it.fails` de `auditoria-produccion-20261030` (AUD-COM-01/02, cálculo residual de Comisiones; el módulo está en `MODULOS_NO_IMPLEMENTADOS`, no se puede contratar ni navegar). Existen desde el 2026-10-30 y no son regresiones.
- **NEXUS:** sin cambios de esquema ni migraciones.
- **Al integrar:** este documento tendrá conflicto de cabecera con #248 y #249 (cada rama añade su sección); se resuelve conservando todas.

**Bitácora 2026-11-16 (etapa 4):** estado de `main`, PR, checks y comentarios en GitHub; sin observaciones de Codex pendientes; regla tomada de Notion; implementación, pruebas y PR propio. Resultados por SHA en el PR. Sin merge, despliegue ni bases reales.

**Decisión del dueño y ampliación de #250 — 2026-11-16:** el RTN del emisor sigue la regla común; los RTN inválidos no se aceptan para guardar. Se añadió captura en Configuración, validación en servidor y normalización antes de persistir. Los RTN de cliente ya existentes no se migran ni se alteran automáticamente: al volver a enviarlos o copiarlos a una operación nueva deben corregirse. La rama y CI deben actualizarse después de esta ampliación.
## Evaluación de preparación para producción — 2026-11-16 (rama `claude/jowa-production-readiness-dq4no2`, base `main` `5feae04`)

- **Estado verificado:** `main` `5feae04` con ambos workflows en success. Único PR abierto al iniciar: #248 (borrador, head `efd2aaa`, checks verdes, sin hilos de revisión). `main` sin protección de rama (`protected: false`). Producción conocida: `46f7db7` (consulta del 2026-10-30, no reconsultada: sin acceso a Render, Vercel ni Supabase en esta sesión); la separan de `main` 142 commits y 2 migraciones.
- **Dictamen: NO-GO.** Sin defectos P0 de código; faltan Render (arranque y salud), respaldo y restauración reales, preproducción con ensayo de migraciones, equipos físicos, aceptación del cliente y decisiones del dueño. Detalle, evidencia, prioridad y criterio de aceptación de cada punto en [EVALUACION_PRODUCCION_20261116.md](EVALUACION_PRODUCCION_20261116.md). Esa tabla es la lista vigente; no se repite aquí.
- **#248 (rama `claude/affectionate-cori-pb4pv2`):** revisión independiente con tres defectos corregidos en `d49bf2b` (aprobaciones de apertura reutilizables, solicitud ajena con el mismo identificador, solicitud de cierre pendiente con la caja cerrada). Su detalle está en la sección de la etapa 3 de esa rama. Los tres supuestos del dueño siguen pendientes y sin cambios.
- **Corregido en esta rama:**
  - T-06: mensajes de validación por defecto en español (`backend/src/common/pipes/mensajes-validacion.ts`, usado por `configurarPipesGlobales`). No cambia qué se valida ni la forma de la respuesta; los mensajes propios de cada DTO no se tocan.
  - T-07: `GET /operaciones/productos/:id/historial` responde 404 para un producto ajeno o inexistente (`operaciones.service.ts`).
  - T-02: `nodemailer` 10.0.16 → 10.4.1; `npm audit --omit=dev` queda en 0 avisos. La primera versión del PR subió a 10.3.1, que seguía truncando el dominio con un espacio o un comentario junto al punto (CVE-2026-125755, revisión de Codex del 2026-11-17; `npm audit` no lo detecta). Pruebas con la biblioteca real y sin red (`recovery-mail.service.spec.ts`); la del dominio falla con 10.3.1. El envío real sigue sin probar.
  - Rama añadida al bloqueo de vistas previas de Vercel antes del primer push (`frontend/scripts/vercel-ignore.sh`, prueba 49/49).
- **No iniciado:** etapa 4 (RTN). Regla decidida por el dueño el 2026-11-12, pero sin alcance publicado en #245 ni confirmación de que sea requisito de la primera salida; Notion la asigna a Codex. Propuesta en el §5 de la evaluación.
- **NEXUS:** sin cambios de esquema ni migraciones en esta rama.
- **Al integrar con #248:** este documento tendrá conflicto en la cabecera (ambas ramas añaden una sección); se resuelve conservando las dos.

**Bitácora 2026-11-16:** lectura de `AGENTS.md`, contexto, plan de salida, matriz fiscal, auditoría de infraestructura, #245 y Notion; consulta de `main`, ramas, PR, checks y protección en GitHub; revisión y corrección de #248; correcciones T-02, T-06 y T-07; evaluación. Resultados de pruebas por SHA en los PR. Sin merge, despliegue, paneles ni bases reales.

## Etapa 2 de las decisiones del 2026-11-12: devoluciones y reembolsos — 2026-11-13 (rama `claude/affectionate-cori-pb4pv2`, base `main` `1eb7cb4`)

- **Estado de Git al iniciar:** `main` `1eb7cb4` (merge de #246, etapa 1). La rama asignada se reinició desde ese `main` tras el merge. Sin otros PR abiertos ni ramas activas. Alcance y criterios en [#245](https://github.com/Nelosama/FerreSystem/issues/245).
- **Ya existía y se conserva:** toda devolución pasa por ADMIN (directa de ADMIN, o solicitud + decisión de otro ADMIN + ejecución); la venta original no se borra (`devoluciones.venta_id`, `ON DELETE RESTRICT`); destino obligatorio por línea; sin límite de tiempo ni exigencia de garantía.
- **Implementado:**
  - Motivo opcional en la devolución y en la decisión del ADMIN (`DevolucionDto.motivo`, `DecisionDevolucionDto.motivo`). Sin texto: `devoluciones.motivo` = '' y `motivo_decision` = NULL. El evento físico de entrega exige texto (`entregas_eventos_motivo_chk`), así que recibe «Devolución de la venta N (sin motivo indicado)». **La anulación total conserva su regla anterior y exige motivo** (la decisión no la cambió).
  - Condición del producto opcional por línea: `detalles_devolucion.condicion` (columna nula, migración aditiva `20261114000000_reembolsos_devolucion`).
  - NEXUS: tabla `reembolsos` (enums `MetodoReembolso` y `EstadoReembolso`: PENDIENTE / COMPLETADO / SUSTITUIDO). Una sola fila vigente por devolución (índice único parcial); CHECK que obliga a guardar autor y hora al completar y, en tarjeta o transferencia, la referencia; la sustitución apunta a la original (`reemplaza_a_id`, sin borrar). FK simples a `usuarios(id)` (ver etapa 1). Las devoluciones anteriores no tienen fila: su dato histórico sigue en `devoluciones.reembolso/metodo` (sin relleno).
  - Al ejecutar la devolución: efectivo → sale de la caja y el reembolso queda COMPLETADO (igual que antes). Tarjeta o transferencia → PENDIENTE y **sin movimiento de caja** hasta registrar la referencia (antes se anotaba en caja de inmediato). `reembolsos.caja_id` es siempre la caja que recibió el movimiento: NULL mientras está pendiente y, al completar, la caja abierta de quien lo registra o NULL si no tiene (revisión de Codex en #247).
  - `backend/src/operaciones/reembolsos.ts`: `GET /operaciones/reembolsos` (ADMIN todos; otros los que registraron o de devoluciones que ejecutaron), `POST :id/completar` (referencia obligatoria, evidencia opcional; ADMIN o quien ejecutó la devolución; movimiento informativo en la caja abierta de quien completa, si la tiene), `POST :id/sin-reverso` (solo ADMIN, solo tarjeta pendiente: ESPERAR anota el intento; EFECTIVO sustituye y sale de la caja del ADMIN, con control de efectivo suficiente; TRANSFERENCIA sustituye y queda pendiente). Bloqueo de fila: la primera decisión gana. Eventos `REEMBOLSO_*` en `auditoria_operaciones`.
  - Web (`DevolucionesPage.tsx`): condición y motivo opcionales, decisión sin motivo obligatorio y sección «Reembolsos» con las acciones anteriores.
- **Destinos (decisión del dueño del 2026-11-13 en #247, tras la revisión de Codex):** códigos propios `GARANTIA` y `MERMA`, junto a `INVENTARIO` (reintegro, el único que vuelve a existencias) y `NO_ENTREGADO`. `DAÑADO` y `PROVEEDOR` se conservan en el DTO y en `aplicarDestinosDevolucion` por compatibilidad con datos y solicitudes anteriores, pero la pantalla ya no los ofrece. Un destino desconocido que llegue sin pasar por el DTO se rechaza (400), nunca se trata como «sin reingreso». Sin restricción de base sobre `detalles_devolucion.destino` (texto). El motor contable solo distingue `INVENTARIO` (reverso del costo); cómo contabilizar garantía y merma queda para el contador.
- **Supuestos (confirmar con el dueño):** evidencia como texto (sin adjuntos). Completar un reverso o transferencia: ADMIN o quien ejecutó la devolución.
- **Bloqueado / fuera de alcance:** nota de crédito u otro documento fiscal/contable (contador); tratamiento contable de los reembolsos pendientes (el motor contable sigue leyendo `devoluciones.reembolso/metodo`; validar con el contador); `solicitudes_devolucion.estado` sigue siendo `String`; adjuntar archivos de evidencia; push (etapa 5).
- **Pruebas nuevas:** `backend/test/reembolsos-devolucion.postgres.integration.ts` (11) y `frontend/e2e/devoluciones-reembolsos-simulado.spec.ts` (3). Ajustadas: `sec-003-devoluciones.spec.ts` (mock SQL de `reembolsos`), `frontend/test/devoluciones-recovery.test.mjs` (dependencia `alertas`), `e2e/arranque.spec.ts` (endpoint nuevo), listas explícitas de migraciones (`ventas`, `reportes-zona-horaria`) y catálogo de `estado-base-solo-lectura.sql`.

**Bitácora 2026-11-13 (etapa 2):** merge de #246 verificado; rama reiniciada desde `main`; análisis y alcance en #245; esquema y migración (NEXUS); servicio, endpoints y pantalla; pruebas. Sin despliegue, bases reales ni merge.

## Etapa 1 de las decisiones del 2026-11-12: autorización de descuentos en cotizaciones — 2026-11-13 (rama `claude/affectionate-cori-pb4pv2`, base `main` `3d6761b`)

- **Estado de Git al iniciar:** `main` `3d6761bc02d8f45655bb837461273b6394e5f2b5` (merge de #244). Sin PR abiertos ni otras ramas remotas. Coordinación, alcance y criterios publicados en el issue [#245](https://github.com/Nelosama/FerreSystem/issues/245). El SHA `f6989fc…` citado en Notion es el *blob* de `schema.prisma`, no un commit.
- **Origen:** decisiones del dueño en Notion («Decisiones del dueño — autorizaciones, devoluciones, caja y RTN»). Plan por etapas, un PR cada una: (1) descuentos en cotizaciones, (2) devoluciones y reembolsos, (3) caja, (4) RTN, (5) notificaciones, APK y tarjeta móvil.
- **Implementado (etapa 1):**
  - NEXUS: `SolicitudAutorizacion` (`solicitudes_autorizacion`), migración aditiva `20261113000000_solicitudes_autorizacion`: enums `TipoSolicitudAutorizacion` (solo `DESCUENTO_COTIZACION`) y `EstadoSolicitudAutorizacion` (PENDIENTE, APROBADA, RECHAZADA, CANCELADA, INVALIDADA); una sola pendiente por entidad (índice único parcial); solicitante y decisor con FK simple a `usuarios(id)` (una FK compuesta dependía de `usuarios_tenant_id_id_key`, que la reversión manual de #148 elimina; la empresa la exige el servicio); CHECK: pendiente sin decisión, resuelta con autor y hora. Reversión manual en `prisma/rollback-manual/`. Catálogo de `scripts/estado-base-solo-lectura.sql` actualizado. `solicitudes_devolucion` sin tocar.
  - Regla (`backend/src/cotizaciones/autorizacion-descuento.ts`): la aprobación corresponde a una huella del contenido (líneas, precios, cantidades, descuentos, cliente, totales). Sin aprobación vigente, `PATCH /cotizaciones/:id/estado` a ENVIADA/APROBADA y `POST /cotizaciones/:id/convertir` responden 409 `DESCUENTO_SIN_AUTORIZACION`. En la conversión, la aprobación sustituye al tope `descuentoMaximo`; el POS directo sigue con `validateDiscount` sin cambios.
  - Al guardar (crear, editar, duplicar), con descuento se crea una solicitud PENDIENTE a nombre de quien guarda, también si es ADMIN: guardar nunca aprueba (revisión de Codex en #246); la aprobación es siempre una acción explícita. Editar invalida la pendiente anterior (INVALIDADA, con quién editó) y también, para siempre, toda aprobación de otro contenido (INVALIDADA conservando quién aprobó; quién la invalidó queda en `AUTORIZACION_INVALIDADA`): volver luego al contenido aprobado no recupera la aprobación (segunda revisión de Codex en #246); lo mismo al quitar el descuento; una cotización ENVIADA cuyo descuento deja de estar autorizado vuelve a BORRADOR. Un rechazo no se vuelve a pedir solo por guardar: se pide con `POST /cotizaciones/:id/autorizacion-descuento`.
  - `POST /cotizaciones/:id/quitar-descuento`: cancela la pendiente y deja la cotización al precio original (precios unitarios intactos, ISV recalculado).
  - `backend/src/autorizaciones/`: `GET /autorizaciones` (ADMIN todas; otros solo las propias), `GET /autorizaciones/:id` (consultar nunca decide), `POST :id/aprobar|rechazar` (solo ADMIN, rol releído de la base, motivo opcional, primera decisión gana, 409 si la cotización cambió), `POST :id/cancelar` (solicitante o ADMIN). Eventos `AUTORIZACION_*` y `COTIZACION_QUITAR_DESCUENTO` en `auditoria_operaciones`.
  - Inicio del ADMIN: indicador `descuentos_por_autorizar` (`dashboard/pendientes.ts`). Web: insignia de estado por cotización, ventana de revisión (aprobar/rechazar con motivo opcional, cancelar, solicitar, quitar descuento), aviso y filtro «Descuento por autorizar»; el botón de convertir no se ofrece sin aprobación.
- **Supuestos de implementación (no son decisiones del dueño; confirmar en revisión):** VENDEDOR sigue la misma regla que CAJERO; cotizaciones con descuento anteriores quedan bloqueadas hasta solicitar y aprobar; «precio original» = precios de la cotización sin descuentos (un precio unitario modificado sigue con la política de excepción de precio).
- **Observación sin cambiar:** en la web, crear y editar cotizaciones sigue limitado a ADMIN y VENDEDOR (`isAdminOrSeller`), aunque la API permite CAJERO. El cajero sí ve la insignia y puede cancelar, solicitar o quitar el descuento. Ampliar la creación al cajero en la web requiere confirmación.
- **Fuera de alcance / bloqueado:** que un ADMIN quede autorizado al guardar (retirado; requiere decisión del dueño); descuentos directos del POS y contingencia (alcance sin confirmar); push (etapa 5); vencimiento automático de solicitudes, umbrales y rol VENDEDOR (sin decisión).
- **Pruebas locales (Node 22.23.4, PostgreSQL 16 temporal, usuario sin privilegios):** ver la bitácora siguiente. **Sin despliegue, bases reales ni merge.**

**Bitácora 2026-11-13 (etapa 1):** lectura de `AGENTS.md`, contexto y Notion; verificación de `main`, ramas y PR; issue #245; esquema y migración (NEXUS); servicio, endpoints y pantalla; pruebas nuevas `backend/test/autorizacion-descuento-cotizaciones.postgres.integration.ts` (12) y `frontend/e2e/cotizaciones-autorizacion-descuento-simulado.spec.ts` (4); `dashboard` (unitarias e integración), `ventas` y `reportes-zona-horaria` (lista explícita de migraciones), `consolidacion-devoluciones` (el ADMIN aprueba antes de convertir: comportamiento nuevo) y el catálogo de `estado-base-solo-lectura.sql` actualizados.

## Facilidad de uso y revisión técnica — 2026-11-11 (rama `claude/zealous-hypatia-n3fjte`, base `main` `2e72b43e`)

- **Estado de Git al iniciar:** `main` `2e72b43e3ff9d9f878ebdce961371b38c9aeee6a` (ya incluye el merge de #242; la sección del 2026-11-09 de abajo es anterior). Único PR abierto: #241 (retención PWA, head `b2fe1741`), que **no se tocó**: su alcance es la contingencia y no este trabajo. Una sola rama nueva; sin PR, merge ni despliegue.
- **Actualización con `main`:** durante la sesión se fusionó #241 en `main` (`ba312dda28c0922c2b050f5f638b40de88efed95`). Esta rama integró ese `main` por merge normal; único conflicto en este documento, resuelto conservando ambas secciones. La sección del 2026-11-10 de abajo describe #241 como abierto: quedó superada por ese merge. Tras integrar: frontend `npm test`, build y lint, y backend build y `npm test`, repetidos (resultados en la bitácora).
- **Segunda actualización con `main`:** al abrir el PR, `main` ya estaba en `389ebcf080823d7a4aec25a6951e0463e98dbeae` (merge de #243, consolidación con su propia evaluación de uso: [EVALUACION_USABILIDAD_20261110.md](EVALUACION_USABILIDAD_20261110.md)). Merge normal; conflictos en este documento (se conservan ambas secciones) y en `frontend/src/locales/es.json` (subtítulo de Inicio y nota de fechas de Reportes: se conserva el texto de `main`). Los hallazgos de esta auditoría se observaron sobre `2e72b43`; #243 corrigió por su cuenta el cobro con efectivo insuficiente, relacionado con P-02.
- **Reconciliación con #243 (2026-11-12):** la rama ya contiene `main` `389ebcf` (0 commits atrás) y su PR es el #244; no se abrió otro. Comparada archivo por archivo, no revierte nada de #243. #243 ya había resuelto el texto de turno (U-07 en español), la nota de fechas de Reportes (parte de U-12), el título de Clientes, la búsqueda sin resultados y el cobro con efectivo insuficiente; esta rama aporta lo demás. La tabla está en el informe, sección «Qué ya resolvió #243 y qué aporta esta rama». Dependencias revisadas: solo cambian los `package-lock.json` (express 5.3.0, body-parser 2.4.0, multer 2.5.0, qs 6.17.1, vite 8.3.7, follow-redirects 1.16.3, entre otras transitivas); `npm audit --omit=dev` deja 0 avisos en frontend y 1 moderado en backend (`nodemailer`, T-02).
- **Informe completo:** [AUDITORIA_USABILIDAD_TECNICA_20261111.md](AUDITORIA_USABILIDAD_TECNICA_20261111.md) — hallazgos con severidad, pasos, evidencia, pendientes y tareas para validar con usuarios reales.
- **Método:** aplicación completa en local (PostgreSQL 16 temporal, backend compilado, frontend construido, datos sintéticos de `e2e-real/seed.cjs`), recorrida en Chromium a 1280×800, 1366×768 y 390×844 con cajero, vendedor, bodeguero, administrador y contador; pruebas de caja negra contra la API. **Sin personas reales:** es inspección experta, no prueba de comprensión.
- **Corregido (usabilidad):** carrito del POS oculto en pantallas de 800 px de alto o menos (`POSPage.css`); menú lateral del contador sin estilos (`ContadorRail.tsx` sobre `IconRail`); error de cotización detrás del formulario (`CotizacionesPage.tsx`); buscador de inventario encogido (`InventarioPage.tsx`); pantallas de acceso denegado sin salida y con claves internas (`ProtectedRoute.tsx`); aviso de existencia al escribir la cantidad (`POSPage.tsx`); horario de turno fijo en Inicio y texto del vendedor (`locales`); unidades legibles (`unidadMedida.ts`); casillas del formulario de producto; área táctil de «Salir».
- **Corregido (técnico):** `npm audit fix` sin `--force` en backend (`body-parser`, `multer`, `qs`) y frontend (`follow-redirects`); largo máximo de nombre, RTN, teléfono y dirección del cliente (`create-cliente.dto.ts`, prueba `cliente-dto-limites.spec.ts`).
- **Pendiente con decisión humana:** nombre único para la pantalla de caja (P-01); confirmación al cobrar (P-02); cotizaciones a precio o descuento libre, que la conversión a venta sí bloquea (T-04); formato del RTN (T-05); `nodemailer` con aviso moderado y versión fijada (T-02); mensajes del validador en inglés (T-06). Detalle en el informe.
- **Comprobado sin defecto:** 401 sin token, 404 entre empresas, 403 por rol, precio alterado 409, existencia y descuento, idempotencia por `solicitudId`, ISV 15 % en centavos, límite de crédito, concurrencia del ajuste de inventario.
- **No probado:** personas reales, impresoras, lector y cámara, PWA instalada y venta sin conexión en dispositivo, iPhone/Safari, MFA y recuperación, Super Admin.
- **Pruebas locales (Node 22.23.4, Chromium 1243, PostgreSQL 16) sobre el código del commit `7789b8f` (los commits posteriores solo cambian documentación):** frontend build y `tsc` correctos, lint 122 avisos y 0 errores (igual que la base), `npm test` 741/741; Chromium simulado 468 aprobadas y 26 omitidas preexistentes, móvil 16/16; backend build correcto, lint 0 errores, `npm test` 850/850, scripts 52/52, guard de migraciones 0 nuevas. Integración PostgreSQL: 73 archivos, 1261 aprobadas, 2 fallos esperados preexistentes y 2 fallos de entorno en la corrida completa (`EACCES` al escribir la caché de Vite como usuario sin privilegios; `initdb` no corre como root en este contenedor); corregido el permiso, los dos archivos afectados (`ventas` y `ciclo-ventas`) pasaron 70/70 en una segunda corrida. E2E backend 6/6. Piloto real (`e2e-real`): 186 aprobadas y 2 omitidas preexistentes. **CI de GitHub: no se ejecutó**; los workflows corren en PR o en `main` y esta rama no tiene PR.
- **NEXUS:** sin cambios de esquema Prisma ni migraciones.
- **Estado de producción:** sin cambios. NO-GO general y NO-GO de la contingencia PWA se mantienen. La facilidad de uso no está validada con usuarios.

**Pruebas tras integrar `main` `ba312dda` (árbol del merge):** frontend build correcto, lint 122 avisos y 0 errores, `npm test` 764/764; Chromium simulado dirigido (regresión UX, contabilidad y almacenamiento de contingencia) aprobado; backend build correcto, `npm test` 855/855, guard 0 migraciones nuevas. Las suites completas de navegador, PostgreSQL y piloto real **no se repitieron** sobre el merge: corresponden al commit `7789b8f` y deben confirmarse con el CI del SHA final.

**Bitácora 2026-11-11:** lectura de `AGENTS.md`, contexto y workflows; comprobación de `main`, ramas y PR; recorrido en navegador por rol; correcciones acotadas con pruebas; pruebas de API; informe y este registro. Sin merge, despliegue, bases reales ni cambios en #241.

## Estado vigente de integración — 2026-11-10
## Estado vigente de integración — 2026-11-10 (consolidación)

- **main antes de esta consolidación:** `10ad32829437a69a9ed809c369157aaa2f124533` (dos commits de documentación sobre `2e72b43`), con `Operación de ferretería` y `Piloto con API y PostgreSQL reales` en verde en ese SHA.
- **PR #241 integrado:** merge `ba312dda28c0922c2b050f5f638b40de88efed95`. Head integrado `20ade7b593710e496f854e7bd27c950fa4baa73a` (rama actualizada con main por merge normal desde `b2fe174`), con `validate`, `test` y `guard-base-datos` en verde sobre ese head. Revisión de código independiente registrada en el PR. No agrega migraciones ni activa `POS_OFFLINE_ENABLED`.
- **Corrección sobre #241:** el merge `432f53d` descartó los cambios de `532e4f3` en `frontend/src/offline/retencion.ts`. El código integrado **no** tiene el límite de 30 ventanas para testigos: los testigos locales no se purgan (lo dice bien `docs/RETENCION_SEGURA_PWA_20261105.md`). Las menciones a «30 ventanas» de la sección siguiente describen ese commit, no el código de main. La política de purga de testigos sigue pendiente de decisión del dueño.
- **PR de consolidación:** rama `claude/festive-lovelace-nfqn88` sobre main `ba312dd`. Detalle en la sección siguiente. Su SHA final y los checks posteriores a la integración constan en el PR y en GitHub Actions; este documento es una fotografía.
- **Ramas y PR:** tras #241 no quedan otros PR abiertos ni ramas remotas con commits propios. La rama `nexus/retencion-segura-20261105` se conserva (contiene `532e4f3`).
- **Límites:** sin despliegue, sin bases reales, sin activar la contingencia. El merge y el GO de producción son decisiones separadas; el dictamen vigente es NO-GO (ver pendientes).

## Consolidación: usabilidad, devoluciones, reportes y datos por rol — 2026-11-10 (base `main` `ba312dd`)

- **Origen:** auditoría de solo lectura sobre `2e72b43` y recorrido de usabilidad en navegador con la aplicación completa en local (API y frontend compilados, PostgreSQL temporal, datos sintéticos). Sin usuarios reales.
- **Devolución parcial con descuento por línea (P2, corregido):** `planDevolucion` en `backend/src/operaciones/operaciones.service.ts` pondera cada línea por su neto. El neto se lee de la cotización de origen (`cotizaciones.venta_id` → `detalles_cotizacion.subtotal`), inmutable al convertirse; `detalles_venta.subtotal` conserva su contrato de importe bruto. Sin descuento propio el factor es 1 y el reparto es idéntico al anterior. Corrige también las ventas ya convertidas. Sin migración. Con `FISCAL_DESGLOSE_POR_LINEA` activo sigue rigiendo el desglose.
- **Base del resumen (P2, corregido):** `GET /operaciones/resumen` devuelve `base = SUM(subtotal - descuento)`; añade `subtotal_bruto` y `descuento`. No cambia ninguna regla fiscal: es la base sobre la que ya se calculaba el ISV.
- **Datos por rol (P3, corregido):** `backend/src/common/datos-por-rol.ts`. Fuera de ADMIN, el cliente anidado en ventas lleva solo datos comerciales; en cotizaciones añade contacto, sin crédito. La empresa anidada lleva solo datos públicos (sin `configuracion`, `plan`, `estado` ni claves de almacenamiento).
- **Ventas propias (P3, corregido):** Cajero y Vendedor ven solo sus ventas en `GET /ventas` y `GET /ventas/:id`. `GET /operaciones/ventas/buscar` sigue abierta para tramitar devoluciones, pero de una venta ajena entrega solo número, importes, líneas y devoluciones previas (`alcance: 'DEVOLUCION'`).
- **Validación de cotizaciones (P3, corregido):** `CreateCotizacionDto` con límites (1–300 líneas, vigencia entera de 1 a 365 días, topes de importe y longitud); `EstadoCotizacionDto` y `ConvertirCotizacionDto` sustituyen al cuerpo sin validar. `normalizarAutorizacion` trata un valor no textual como ausente (400).
- **Inicio del administrador (corregido):** las últimas ventas muestran el nombre escrito en la venta cuando no hay cliente registrado.
- **Usabilidad (corregido):** el POS no cobra si el efectivo escrito no cubre el total (el campo sigue siendo opcional); búsqueda sin resultados con mensaje; se retiran el texto fijo de turno, el título equivocado de Clientes y la jerga de Reportes. Hallazgos, pendientes y tareas para usuarios reales en [EVALUACION_USABILIDAD_20261110.md](EVALUACION_USABILIDAD_20261110.md).
- **Pruebas nuevas:** `backend/test/consolidacion-devoluciones-reportes-roles.postgres.integration.ts` (11), `backend/src/cotizaciones/dto/create-cotizacion.dto.spec.ts` (15), dos casos en `frontend/e2e/pos-tarjeta-simulado.spec.ts`; `roles-access.http.spec.ts` actualizado al nuevo contrato (el rol viaja al servicio) con casos de Vendedor y Admin.
- **Evidencia local antes del merge de main (Node 22.23.4, PostgreSQL 16 temporal):** backend build y lint sin errores, unitarias 860/860; integración dirigida 124/124 en 6 archivos (consolidación, cotizaciones, seguridad-fase2, reportes-zona-horaria, ventas, devoluciones-cxc); aislamiento 14/14; frontend build, lint sin errores y unitarias 740/740. La suite completa de integración y los E2E de navegador se interrumpieron por un reinicio del entorno: su resultado válido es el del CI del PR.
- **Pendientes que requieren decisión del negocio:** reembolso en efectivo de ventas cobradas con tarjeta; permisos efectivos mientras `permisosConfigurados` es falso; si Cajero y Vendedor deben poder buscar ventas ajenas; política de purga de testigos de retención; unificar nombres del menú del cajero y el trato tú/usted.
- **Pendientes técnicos:** idempotencia de altas sin `solicitudId` (cotizaciones, duplicar, clientes); en contingencia, una venta aceptada con `TOTAL_DIFERENTE` guarda los totales del equipo; rutas `PUT /tenant/settings` y `GET /operaciones/auditoria` inalcanzables por diseño (`SUPERADMIN` tras `TenantGuard`); separación física del almacenamiento offline por empresa; validación de cuota y operación en equipos reales.
- **No revisado:** aplicación móvil nativa, contabilidad a fondo, garantías, importación de productos, impresión física, despliegue y configuración real de Render y Vercel.
- **NEXUS:** sin cambios de esquema Prisma ni migraciones.

**Bitácora 2026-11-10 (consolidación):** verificación de main, PR y ramas; revisión de #241, actualización de su rama, CI en `20ade7b` e integración (`ba312dd`); recorrido de cinco roles en navegador; correcciones y pruebas de regresión; merge normal de main en la rama de consolidación; PR único. Sin force-push, despliegues ni bases reales.

- **main:** `2e72b43e3ff9d9f878ebdce961371b38c9aeee6a`, merge de #242. En esta consulta, `Operación de ferretería` y `Piloto con API y PostgreSQL reales` del SHA de main seguían en ejecución. Vercel no reportaba despliegue para este SHA.
- **PR #242:** integrado en main mediante `2e72b43`. Añade Spec Kit y una propuesta de constitución específica de Jowa System; la ratificación del propietario sigue pendiente. No cambia lógica de aplicación ni esquema.
- **PR #241:** rama `nexus/retencion-segura-20261105`, actualizada mediante merge normal de main `2e72b43`; la reconciliación conserva los cambios de contingencia y las notas de Spec Kit en `docs/CONTEXTO_MAESTRO.md`. Los workflows del head anterior `432f53d` estaban verdes, pero el nuevo SHA requiere CI propio.
- **Revisión de #241:** no agrega migraciones ni activa `POS_OFFLINE_ENABLED`. La retención solo elimina operaciones locales con evidencia reciente y coincidente de empresa, caja, venta, hash y cierre de caja; ante datos incompletos o cambios conserva el registro. La separación física por empresa y las pruebas en dispositivos reales siguen pendientes; la contingencia PWA mantiene **NO-GO**.
- **Límites:** PR #241 sigue abierto; sin merge, despliegue ni cambios en bases reales. Después de resolver la actualización, comprobar conflictos y checks del SHA actual antes de volver a evaluar la integración.

## Retención segura del diario PWA — 2026-11-05 (America/Tegucigalpa)

- **Base verificada:** `main` remoto `3b8de95b7910b02588722de6c55f96acd2ce9196`; rama de trabajo `nexus/retencion-segura-20261105`. #240 quedó integrado en `main` mediante merge `3b8de95`; #241 sigue abierto en borrador; el SHA previo `532e4f3` quedó verde y ahora se actualiza con el merge de #240. #238/#239 ya estaban integrados; no se duplican.
- **Retención conectada en código:** `sync.ts` llama después de guardar sincronización y refrescar revisiones correctamente; GET autenticado por lotes y token/identidad/rol fijados. Empresa explícita obligatoria; históricos sin tenant conservados. No se activa `POS_OFFLINE_ENABLED`. Contrato y límites: [RETENCION_SEGURA_PWA_20261105.md](RETENCION_SEGURA_PWA_20261105.md).
- **Servidor:** `estados` usa snapshot `RepeatableRead` y `Cache-Control: no-store`; añade tenant, caja original, fecha servidor, versión/hash y confirmación de cierre de cajas original/destino. Solo certifica tras comparar payload JSONB/hash persistido y venta ligada con mismo tenant/número/hash. Sin migración ni modificación de Prisma.
- **Hash corregido:** la retención calculaba una proyección diferente del DTO persistido. `payload.ts` comparte el DTO de envío y conserva exactamente el SHA256 de la doble serialización histórica (`fingerprint(canonico(dto))`), sin cambiar idempotencia ni datos históricos. Prueba cruzada frontend/backend y PostgreSQL detectan diferencias en todos los campos variables y JSONB.
- **Transacción local y cuota:** relee carga/estado/revisión/empresa/propietario y vigencia antes de borrar; testigo mínimo sin datos de cliente, con evidencia fechada y hash. Conserva los testigos de las 30 ventanas cerradas más recientes por empresa; protege la ventana activa y toda ventana con operaciones locales. Testigos incompletos se conservan. Protege además el máximo índice emitido por ventana en `meta`: sin ello, borrar la última venta permitiría reutilizar su UUID. Los marcadores de índice se conservan porque no hay evidencia del servidor para retirarlos. Sin cambio de versión IndexedDB.
- **Falla segura:** PENDIENTE/ENVIANDO/REVISION, requiereRevision local/servidor, caja abierta, campos ausentes, evidencia caducada, hash/número/correlativo diferentes, HTTP/timeout, respuestas parciales/duplicadas y cambio de empresa conservan las operaciones.
- **Validación local final:** frontend **763/763** (incluye retención/cuota **44/44**), backend **850/850** (80 archivos; paridad cruzada **5/5**); PostgreSQL 17.11 temporal contingencia **51/51** y regresión identidad/HTTP/rechazos **26/26** (HTTP final **4/4**, repetición solapada con no-store); Chromium `/usr/bin/chromium`, APIs simuladas, contingencia/aislamiento/almacenamiento **48/48**. Builds de ambos paquetes y lint frontend correctos: **122 avisos frontend**; backend: el CI de `17e80b2d` confirmó históricamente **118 avisos y 1 error `Invalid tsconfig` en lint**, corregido después. Chromium completo de ese SHA: **467 aprobadas + 26 omitidas**, móvil **16/16**. Se corrigió el arnés cruzado para cargar/transpilar el archivo cliente real sin imports estáticos fuera del programa TS del backend; no cambia código de producción ni desactiva reglas. La repetición local del arnés corregido no fue posible por pérdida del entorno: el SHA corregido requiere CI propio, más avisos existentes de Vite (configuración futura/plugin y bundle >500 kB). Guard correcto, **0 migraciones nuevas** y prueba del guard **11/11**; `git diff --check` limpio. No hay fallos u omisiones en estas selecciones; no se ejecutó localmente toda la suite de navegador/PG. CI del SHA previo `532e4f3` confirmó `validate`, `test` y `guard-base-datos` en success. El nuevo SHA que incorpora `main` requiere su propio CI; esta continuación no repitió las pruebas localmente.
- **Protección de main:** API de ramas `protected:false`; rulesets `[]`; detalle de protección denegado con 403 por permisos de integración. Recomendar exigir PR/revisión y checks `validate`, `test`, `guard-base-datos`, rama actualizada y bloqueo de force push/borrado. Configuración del repositorio intacta.
- **Límites vigentes:** NO-GO de contingencia PWA para producción; separación física por empresa y validación en equipos reales siguen pendientes. La purga local de testigos ya tiene política de 30 ventanas cerradas por empresa; no borra registros del servidor ni marcadores de índice. No se probaron bases/hosting reales. Rama `nexus/*` ya excluida de previews por guardias existentes, sin cambiar configuración. Sin merge de #241 ni despliegue.

**Bitácora:** lectura de AGENTS/contexto y límites NEXUS; fetch y consulta remota de ramas/PR/protección; auditoría del payload y ejecutor; implementación sin esquema/migraciones; regresiones en IndexedDB simulada y PostgreSQL efímero. En esta continuación se añadió la purga local acotada de testigos y se preparó el merge normal de `main` tras integrar #240, resolviendo el conflicto documental y conservando ambos registros. El SHA previo `532e4f3` pasó CI; el nuevo SHA requiere CI propio. No se repitieron pruebas localmente. Resultados finales por SHA y enlace del PR se registran en la entrega. **NEXUS:** ninguna migración requerida ni alteración de migraciones publicadas.

## Spec Kit integrado — 2026-11-06 (PR #242; merge `2e72b43`)

- **Rama y resultado:** `claude/optimistic-johnson-7m5dlr`, PR #242 integrado en `main` por el merge `2e72b43` (10-nov). Sin cambios a lógica de la aplicación ni al esquema.
- **Herramienta:** CLI `specify` de [github/spec-kit](https://github.com/github/spec-kit) instalado con `uv tool install specify-cli --from git+https://github.com/github/spec-kit.git` (global en el contenedor; cada máquina o sesión nueva debe repetir la instalación si quiere usar el CLI).
- **Inicialización:** `specify init --here --force --integration claude --script sh --non-interactive --ignore-agent-tools`. Solo añadió `.specify/` (plantillas, scripts bash, flujo y `memory/constitution.md`) y `.claude/skills/speckit-*` (constitution, specify, clarify, plan, tasks, analyze, checklist, implement, converge). No sobrescribió ningún archivo existente.
- **Constitución:** `.specify/memory/constitution.md` contiene una propuesta específica para Jowa System; su ratificación por el propietario sigue pendiente.

**Bitácora 2026-11-06 (Spec Kit):** instalación del CLI, prueba en directorio temporal para confirmar que no hay colisiones, inicialización en la raíz del repo y registro aquí.

**Bitácora 2026-11-07 (actualización de #242):** merge normal de `main` `3b8de95` en la rama; se conservaron ambos registros del contexto. **Integración 2026-11-10:** PR #242 se fusionó en `main` como `2e72b43`.

## Sprint de consolidación #237, #238 y #239 — 2026-11-05 (base y resultado `main` `54db0694`)

- **Integrado en `main`, uno a uno, con CI verificado en el SHA de cada PR y en `main` después de cada merge:**
  - #238 aislamiento de sincronización y contadores por empresa y sesión: `6a447032` (SHA del PR `29cfd856`).
  - #239 persistencia, cuota y retención segura: `e2b12a0` (SHA del PR `cf1964d`). Antes se actualizó sobre #238, con conflictos en la guardia de Vercel y en el contexto, resueltos conservando las ramas bloqueadas de ambos PR.
  - #237 docu…178217 tokens truncated…ualiza. Una lectura iniciada antes de un guardado o de otro login no debe revertir los datos actuales. Los borradores de Configuración no se borran por una actualización al recuperar foco.

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



## 2026-10-21 — Cierre documental de Impeccable (PR #182)

**Decisión:** conservar en este contexto las recomendaciones relevantes del PR #182, sin integrar sus archivos de configuración, agentes, referencias ni motor a `main`. El PR #182 se cierra sin merge. Las afirmaciones del documento `PRODUCT.md` son hallazgos de la rama, no certificación adicional de producción.

### Recomendaciones y pendientes recuperados

- Mantener **Jowa System** como identidad comercial y la arquitectura React/Vite + NestJS/Prisma/PostgreSQL con Vercel, Render y Supabase. La estrategia objetivo es **nube**; revisar y retirar o justificar el despliegue local heredado `deploy/local` antes de declarar completada la transición.
- Logotipos: el documento indica almacenamiento privado en PostgreSQL por defecto y alternativas bajo `LOGOTIPO_ALMACEN`. Validar el almacenamiento elegido, los permisos y la recuperación en servicios reales; no asumir que Supabase Storage está probado.
- Móvil: una sola PWA administrativa para consulta, supervisión, reportes e inventario; **sin POS, cobros ni caja móvil**. Verificar y bloquear la ruta `/pos` en móvil donde aún sea accesible. Completar las funciones administrativas y validar cámara/escáner en Safari e iPhone reales.
- Fotografías opcionales de productos: definir e implementar almacenamiento en nube seguro; el campo `imagenUrl` señalado por la auditoría acepta referencias HTTPS, pero eso no equivale a un flujo completo de subida.
- Notificaciones push con la PWA cerrada: requisito planificado, pendiente de implementación y pruebas reales.
- Contabilidad hondureña y rol CONTADOR: siguen en rama separada, no integrados; evaluar permisos y migraciones antes de incorporar. Exportaciones `.xlsx` reales pendientes; no confundir CSV o XML `.xls` con XLSX.
- Diseño: conservar navegación SIDEBAR/TOPNAV, personalización de marca, traducciones ES/EN y simplicidad operativa. Evaluar la facilidad de uso con usuarios reales; no declarar esa cualidad demostrada solo por la existencia de estilos.
- Infraestructura/operación: validar PWA instalada, contingencia offline, impresoras A4/80/58 mm, cámaras físicas y sincronización; distinguir pruebas automatizadas de certificación en producción.
- Sucursales: el documento señala ausencia de filtrado operativo por sucursal en ventas/productos; confirmar alcance y modelado antes de prometer soporte multi-sucursal.
- Impeccable: el PR #182 contiene documentación y cuatro descripciones de agentes, pero **no incluye motor ejecutable**. El antiguo binario de 19,8 MB no debe introducirse en `main` sin validación de procedencia y hash. `buildPath: "code"` es una preferencia pendiente de confirmar, no una ruta funcional verificada.
- Evitar incorporar documentación de terceros que no se utilizará en producción; conservar los hallazgos accionables en este contexto y reabrir el tema solo si se decide instalar Impeccable.

**Fuente:** PR #182 y `PRODUCT.md` de la rama (`aeddc71`). **Estado:** recomendaciones documentadas; no implica que los pendientes estén corregidos.
