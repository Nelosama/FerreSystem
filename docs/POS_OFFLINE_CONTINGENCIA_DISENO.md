# POS offline de contingencia — diagnóstico y diseño (propuesta)

**Estado: propuesta para revisión. Ningún comportamiento financiero offline está implementado ni autorizado por este documento.**
Fecha: 2026-10-10 (America/Tegucigalpa). Base: `origin/main` `7ccfad25`. Rama: `claude/pos-offline-contingencia`.
Alcance de este PR: documentación y pruebas de caracterización que no cambian comportamiento.
Fuera de alcance (a cargo de otra sesión): infraestructura, respaldos, migración, despliegue. Este documento **complementa** [ARQUITECTURA_CONTINUIDAD_POS_20261010.md](ARQUITECTURA_CONTINUIDAD_POS_20261010.md) (continuidad general, fotos, respaldos): aquí se desarrolla solo el POS offline en detalle (§2–§9 de ese documento resumen la fase de «efectivo offline» en una tabla).

**Escenario objetivo:** una PC de caja con la PWA, 1–5 clientes durante un corte de internet poco frecuente de hasta 24 h. Se busca *no perder ventas, no duplicarlas, no vender inventario inexistente a ciegas y poder conciliar sin rechazar silenciosamente nada ya entregado*.

---

## 1. Diagnóstico de la implementación actual

Referencias a código en la base indicada. «Evidencia» = lo que se comprobó leyendo código y ejecutando las pruebas de caracterización de este PR.

### 1.1 Qué depende de internet hoy

| Función | Dependencia | Evidencia |
|---|---|---|
| Arranque de la app | Carga de assets desde el hosting; **no hay service worker** (`frontend/public` solo trae `manifest.webmanifest`; sin `serviceWorker`, `indexedDB`, `workbox` ni `caches` en `src`). Recargar sin red = pantalla en blanco. | prueba «no existe hoy service worker…» |
| Catálogo y precios | `GET /productos/comercial` al montar y tras cada venta; vive solo en estado React (`POSPage.tsx` `fetchProductos`). Sin red tras recargar → catálogo vacío. Sin sondeo periódico. | pruebas «el catálogo… no se persiste», «botón manual…» |
| Sesión | Token de acceso en `localStorage` (`ferre_token`), JWT 15 min (`JWT_ACCESS_EXPIRES_IN`); renovación por cookie HttpOnly de 7 días vía `POST /auth/refresh`. | `auth.service.ts`, `authInterceptors.ts` |
| Cobro | `POST /ventas`: caja abierta, permisos, stock, precio, número correlativo, crédito, ISV, caja y auditoría en una transacción con bloqueo por empresa. | `ventas.service.ts` |
| Numeración | `secuencias_tenant` tipo VENTA (servidor). El comprobante muestra «N° V-{n}». | `ReciboPDF.tsx` |
| Caja | `openCash` exige una caja `ABIERTA` del usuario en el servidor; movimiento `VENTA_POS`. | `ledger.ts` |
| Inventario | La venta **reserva** (`stock_reservado`); la entrega (`POST /operaciones/ventas/:id/entregar`) descuenta físico y reserva. | `ventas.service.ts`, `operaciones.service.ts` |
| Conectividad | El POS no detecta conectividad (no usa `navigator.onLine` ni eventos online/offline); solo `maintenancePolling` (estado de respaldos) lo usa. El cliente HTTP (`utils/api.ts`) **no define timeout**. | pruebas |

### 1.2 Hallazgos (ordenados por impacto en el escenario)

| ID | Hallazgo | Severidad para contingencia | Evidencia |
|---|---|---|---|
| H1 | **No existe cola durable.** Un solo hueco `ferre_pending_sale:<tenant>:<usuario>` en `localStorage` (más borrador). No hay libro de ventas locales; no hay catálogo local. | Bloqueante | `posRecovery.ts`, `POSPage.tsx` |
| H2 | **La venta no registra efectivo recibido ni cambio**, ni terminal/dispositivo, ni hora del cliente, ni origen offline/online. `ventas.created_at` es la hora del servidor. | Bloqueante para «registro de efectivo recibido» y para auditar una venta diferida | `schema.prisma` `Venta`; prueba backend «nace COMPLETADA…» |
| H3 | **Cualquier rechazo del servidor descarta la venta en la práctica**: precio distinto (409 a no-ADMIN), stock insuficiente, caja cerrada. Una venta ya entregada físicamente no puede «fallar» al conciliar. | Bloqueante: contradice «no rechazar silenciosamente» | pruebas backend |
| H4 | `solicitudId` es **opcional** en el DTO. Sin él no hay idempotencia: dos envíos = dos ventas. El POS siempre lo manda, otros clientes no. | Alto | prueba backend «SIN solicitudId…» |
| H5 | El POS genera el UUID con `crypto.randomUUID()` directo (no usa el respaldo de `requestId.ts`). En HTTP de LAN (contexto no seguro) no existe y el cobro falla antes de enviar. | Medio (falla ruidosa, no pérdida) | prueba «el POS genera la identidad…» |
| H6 | **Una renovación de sesión fallida por falta de red borra el token y redirige a `/login`** cuando la respuesta original fue 401. Con red caída el error original es de red (no 401) y la sesión se conserva; pero al volver la red con el access token vencido, si el refresh falla se pierde la sesión de UI (los pendientes en `localStorage` sobreviven). | Alto | pruebas de `authInterceptors` |
| H7 | Axios sin timeout: una conexión «medio muerta» deja `procesandoVenta` activo indefinidamente. No hay reintento con backoff ni distinción 5xx/red/negocio. | Medio | prueba «sin timeout» |
| H8 | Dos pestañas pueden generar UUID distintos para el mismo carrito: la defensa es de lectura de `localStorage` y evento `storage`, no exclusión atómica. | Medio | análisis de `handleCobrar` |
| H9 | Reemplazo de precios del carrito es manual, sin desglose ni consentimiento («Actualizar catálogo y precios del carrito»). | Medio (no es offline, pero define cómo se acepta un precio) | prueba |
| H10 | No hay datos fiscales en el modelo (ni CAI, ni rango, ni fecha límite, ni número fiscal): el comprobante actual es un recibo interno. | Decisión legal previa (§4) | búsqueda en esquema/código: sin coincidencias |
| H11 | Cuota/almacenamiento lleno o `localStorage` bloqueado: el POS bloquea el cobro (correcto), pero el cajero no tiene salida operativa. | Bajo | prueba «cuota lleno» |

### 1.3 Lo que ya funciona y se reutiliza

- Identidad de venta: `ventas.id = solicitudId` (UUID), hash de contenido, bloqueo advisory por UUID, replay idéntico devuelve la original, contenido distinto = 409 (`ventas.service.ts`; 6 pruebas de caracterización).
- Consulta sin efectos `GET /ventas/solicitudes/:id` (REGISTRADA / NO_REGISTRADA) y flujo de recuperación del POS (consulta antes de reenviar, pendiente conservado hasta cerrar comprobante).
- Separación venta/reserva/entrega y devoluciones (no se tocan).
- Pendiente inválido **no** se descarta ni se reemplaza (bloquea el cobro).

---

## 2. Almacenamiento local: IndexedDB frente a SQLite

| Criterio | IndexedDB (PWA) | SQLite local |
|---|---|---|
| Opciones | API nativa del navegador. | (a) SQLite WASM + OPFS en el navegador; (b) agente local (Node/Electron/Tauri) con SQLite en disco. |
| Instalación | Ninguna. Encaja con «PWA en la PC de caja» y el frontend en Cloudflare Pages. | (a) Sin instalación pero requiere worker, `SharedArrayBuffer`/COOP-COEP o `createSyncAccessHandle`, más complejidad y menor madurez. (b) Instalar y mantener un programa en la caja: sale del alcance «PWA». |
| Transacciones | Atómicas por transacción (`readwrite`, múltiples stores). | Atómicas, WAL, `fsync` configurable. |
| Durabilidad ante apagón | Depende del navegador. Chrome usa por defecto durabilidad *relajada* (la transacción puede confirmarse antes del volcado a disco); existe la opción `durability: 'strict'` por transacción. Cubre cierre del navegador y caída del proceso; **el apagón eléctrico es el caso débil** y debe probarse. | (b) `PRAGMA synchronous=FULL` ofrece la garantía más fuerte. (a) depende de OPFS y del navegador. |
| Cuota y desalojo | El navegador puede desalojar datos «best-effort»; `navigator.storage.persist()` reduce el riesgo; el usuario puede borrar datos del sitio. | (b) Archivo propio: no depende del navegador. |
| Multi-pestaña | Web Locks + BroadcastChannel disponibles. | (b) Un solo proceso dueño. |
| Costo / riesgo de proyecto | Bajo; dependencia de pruebas: `fake-indexeddb` para unitarias y Chromium real para integración. | Alto (a) o medio-alto (b). |

**Recomendación:** IndexedDB como almacén primario, con estas obligaciones: transacciones `durability: 'strict'` en cada alta de operación; `navigator.storage.persist()` solicitado y medido; el cobro **no se confirma al cajero hasta que la transacción termina** (`oncomplete`); segunda copia obligatoria (comprobante de contingencia en papel con el UUID corto, §6.6, y exportación manual del diario desde la pantalla). Si el piloto con corte eléctrico controlado (§8) pierde operaciones confirmadas, pasar al agente local con SQLite (opción b) *solo* para el diario; el diseño de datos y el protocolo de sincronización de §5 no cambian (el diario es un adaptador).
Se descarta SQLite WASM por complejidad sin ganancia de durabilidad demostrada.

---

## 3. Modelo de operación offline (diseño)

### 3.1 Principios

1. La nube (PostgreSQL) sigue siendo la **autoridad única**. El dispositivo guarda un *diario de operaciones inmutable*; nunca sube saldos finales ni sobrescribe stock.
2. **Efectivo únicamente** en la primera etapa. Tarjeta, transferencia, crédito, abonos, devoluciones, retiros, cierres definitivos, ediciones de precio/stock/permisos y alta de clientes: bloqueados offline.
3. Una venta de contingencia **nunca se rechaza ni se borra**. Lo que no cuadra se marca `CONFLICTO` y se resuelve con una persona (con auditoría). El efectivo recibido siempre queda registrado.
4. Autorización de contingencia emitida **online antes del corte** (el dispositivo no se autoriza solo).
5. Lo no decidido legalmente (§4) se bloquea: sin aprobación fiscal no se activa la bandera por empresa.

### 3.2 Ventana de contingencia y catálogo previo

Con sesión online, el POS (al iniciar sesión y cada ≤15 min mientras esté visible) llama a `POST /contingencia/ventanas` (nuevo). El servidor guarda una **instantánea** (precios, existencia libre = `stock_actual − stock_reservado`, estado activo, productos elegibles) deduplicada por hash de contenido, y devuelve:

- `ventanaId`, `catalogoHash`, `vigenteHasta` (emisión + horas configurables; recomendado 36 h para cubrir un corte de 24 h con refrescos al menos cada hora),
- `cupos` por producto (§3.4), límite por venta y límite acumulado en efectivo,
- `offsetRelojMs` medido (hora del servidor − hora local) y número de secuencia local inicial del dispositivo.

El cliente guarda en IndexedDB el catálogo completo de la ventana (siempre una generación activa; la nueva se activa atómicamente). Mostrar siempre «Catálogo actualizado hace X».
Verificar un precio después: cada línea offline lleva `ventanaId`; el servidor compara el precio aceptado contra **la instantánea de esa ventana**, no contra el precio actual. Así un precio manipulado en el navegador se detecta exactamente (`PRECIO_NO_AUTORIZADO`), y un cambio de precio posterior no genera falsos conflictos.

### 3.3 Registro de la operación

Cada venta offline es un registro `OperacionLocal` en IndexedDB (esquema lógico; el servidor guarda el mismo contenido como carga cruda inmutable):

```
operacionId        UUID v4 (será ventas.id; se crea al confirmar, dentro de la misma transacción del diario)
dispositivoId      UUID registrado online
secuenciaLocal     entero monotónico por dispositivo (huecos detectables) → "CT-<caja>-<n>", NO fiscal
ventanaId, catalogoHash, esquemaVersion
cajeroId, cajeroNombre, cajaId (caja abierta online antes del corte)
ocurridoAtLocal (ISO), relojOffsetMs, vigenteHastaLocal
lineas[]: productoId, codigo, nombre, cantidad (2 dec.), precioAceptado, subtotal
descuento, subtotal, isv, total (centavos enteros; mismo redondeo que el servidor)
metodoPago = EFECTIVO
efectivoRecibido, cambio
clienteNombre, clienteRtn (texto libre; sin cliente registrado)
estadoLocal: REGISTRADA_LOCAL | ENVIANDO | SINCRONIZADA | CONFLICTO | REINTENTAR
intentos, ultimoError, enviadoAt, resultadoServidor
hashContenido
```

Reglas: dinero en **centavos enteros** y cantidades con 2 decimales como enteros ×100 internamente; el cálculo de ISV usa la misma función que el servidor (extraer a utilidad compartida y cubrirla con pruebas cruzadas). El registro es **inmutable**: una corrección es una operación nueva de anulación/ajuste decidida online, nunca edición in situ.

### 3.4 Disponibilidad de inventario de contingencia (controlada)

- `disponibleLocal(p) = min(libreInstantánea(p) − margenSeguridad(p), cupo(p)) − Σ cantidades de operaciones locales no sincronizadas`. Se deriva del diario; **no se muta el catálogo base**.
- El cupo y el margen los fija el administrador (por defecto cupo = 25 % de la libre, margen = 1 unidad; ambos configurables por categoría). Un producto cuyo disponible ≤ 0 se bloquea con mensaje claro. Vender «sin existencia confirmada» es una excepción solo ADMIN con motivo, y entra como `CONFLICTO` aunque cuadre.
- **Con una única caja offline (caso objetivo), no se reserva stock en el servidor**: el riesgo de sobreventa viene de otros canales online (un administrador desde iPhone, otro cajero) y se resuelve al conciliar sin rechazar. **Si hubiera más de un dispositivo offline simultáneo** (o más de uno operando contra el mismo stock), se debe pasar a reservas exclusivas por dispositivo (cuota descontada del libre al emitir la ventana). Ver decisión D4.
- La venta de contingencia **reserva y entrega en el mismo acto** (el cliente se lleva la mercancía): al conciliar se aplica reserva + entrega en una transacción (reutilizando la lógica de `entregar`), con `entregado_at` = hora de la operación estimada.

### 3.5 Sesión del cajero durante un corte

Situación actual (§1.2 H6): el access token dura 15 min; sin red no se puede renovar; mientras no haya 401 el interceptor no limpia la sesión. Diseño:

1. **No se valida la contraseña en la nube sin red ni se extiende el JWT.** El modo contingencia se arma **solo** si el cajero tenía sesión válida cuando se emitió la ventana: la ventana queda ligada a `(tenant, cajeroId, dispositivoId, cajaId)`.
2. Offline, la pantalla de contingencia **no depende del JWT**: opera con la identidad de la ventana. Todas las llamadas de red se omiten (sin intentos que provoquen 401 o redirección). Se detiene el `sessionSync`.
3. Opcional (decisión D6): bloqueo de inactividad con **PIN local** configurado online (verificador derivado con PBKDF2/WebCrypto, solo en ese dispositivo). Cambiar de cajero offline: **no permitido en la etapa 1**; si el cajero se retira, un ADMIN con sesión previa finaliza la ventana online.
4. Al volver la red: refrescar sesión de forma explícita (`/auth/refresh`). Si falla, **no vaciar el diario ni redirigir sin avisar**: mostrar «Hay N ventas pendientes: inicie sesión con el mismo usuario para enviarlas»; el login del mismo cajero (o un ADMIN, con auditoría «enviado en nombre de») habilita la sincronización. El diario no se borra al cerrar sesión.
5. En el servidor cada operación se valida con el usuario *vigente en la conciliación* (activo, mismo tenant, rol y permiso `pos.vender`) **y** con el estado de la ventana (`vigenteHasta`, revocada). Usuario desactivado o permiso revocado durante el corte ⇒ `CONFLICTO` (`USUARIO_NO_AUTORIZADO`), la venta se registra igual, nunca se descarta.

### 3.6 Comprobante en contingencia

Impreso/ en pantalla: «**COMPROBANTE DE CONTINGENCIA — NO VÁLIDO COMO FACTURA FISCAL**» (texto sujeto a §4), con `CT-<caja>-<n>`, UUID corto (8 caracteres), fecha/hora local, cajero, líneas, total, efectivo recibido y cambio. Este documento es también la **segunda copia durable** del registro (si se pierde el navegador, el papel permite reconstruir y detectar ventas faltantes por huecos de secuencia).

---

## 4. Implicaciones fiscales en Honduras (a validar; no es asesoría legal)

**No se asume que un comprobante temporal sea legalmente válido.** Lo que se puede afirmar con el repositorio, y lo que debe verificarse con el contador de la empresa y la SAR:

**Verificado en el código:** el sistema hoy **no modela datos de facturación SAR**: no hay CAI, rango autorizado, fecha límite de emisión ni número fiscal; el comprobante es «N° V-{numeroVenta}». El ISV aplicado en ventas es fijo del 15 % sobre la base después de descuento (sin exentos ni otras tasas en `ventas.service.ts`). La numeración es interna (`secuencias_tenant`).

**Preguntas fiscales que bloquean activar ventas offline (responsable fiscal / contador):**

1. ¿Cómo emite hoy la ferretería su **factura fiscal** (sistema externo, talonario con CAI, otro)? Si la factura fiscal no sale de FerreSystem, el comprobante de contingencia solo sustituye un recibo interno, y la implicación es menor; si sale de FerreSystem, el POS actual ya requiere revisión fiscal independiente de esta fase.
2. Si la factura es de **talonario/imprenta autorizada con CAI**: ¿se puede emitir el documento fiscal manualmente durante el corte y cuál es el procedimiento de contingencia ante la SAR (registro posterior, límite de plazo, declaración)?
3. Si el sistema debe numerar fiscalmente: ¿puede reservarse un **rango autorizado** para contingencia, y cómo se concilia con el rango en línea sin reutilizar ni saltar números?
4. ¿Qué indicación mínima debe tener un documento provisional (leyenda, RTN del adquirente, ISV discriminado) y por cuánto tiempo hay que sustituirlo por el definitivo?
5. Retención, tiempos de conservación y reportes de contingencia exigibles.

**Consecuencias de diseño, independientes de la respuesta:**

- Identificador de contingencia **separado** de cualquier número fiscal (`CT-…`); nunca reutilizar `secuencias_tenant` fiscales.
- Campo `origen = CONTINGENCIA` y enlace `operacion_id` en la venta; el documento definitivo, si la ley lo exige, se emite *después* y se vincula (sin renumerar ni editar la venta).
- Conservar el comprobante de contingencia, el diario crudo y la bitácora de conciliación inmutables.
- **Si no hay respuesta aprobada, la bandera `pos_contingencia_efectivo` permanece apagada.** El resto del diseño (catálogo offline, borradores, indicadores) no depende de esa decisión.

---

## 5. Sincronización, idempotencia y conciliación

### 5.1 Cola y recuperación tras cierres inesperados (cliente)

- Máquina de estados local: `REGISTRADA_LOCAL → ENVIANDO → SINCRONIZADA | CONFLICTO | REINTENTAR`. «ENVIANDO» es un *lease* con marca de tiempo, **nunca un estado final**.
- Al arrancar o recuperar el foco: todo lo que esté en `ENVIANDO` vuelve a `REGISTRADA_LOCAL`. Es seguro porque el servidor es idempotente por `operacionId`. Antes de reenviar, consultar `GET /contingencia/operaciones/:id` (equivalente a `findSolicitud`).
- Un único *sincronizador* por dispositivo: Web Locks (`navigator.locks`) + BroadcastChannel; la unicidad en base de datos es la garantía real.
- Reintentos solo de operaciones del diario: backoff exponencial con jitter (1, 2, 4, … 60 s), `Retry-After`, y pausa si el error es 401/403 (no cuenta como fallo de la operación). Timeouts explícitos (p. ej. 15 s). Un timeout **no** implica que el servidor no guardó.
- Lote: `POST /contingencia/operaciones` con hasta N operaciones; **cada una se procesa en su propia transacción** (una mala no bloquea a las demás) y la respuesta es un resultado por operación.

### 5.2 Servidor: diario primero, aplicación después

1. **Aceptar:** insertar en `operaciones_contingencia` (carga cruda inmutable + hash, `UNIQUE(tenant_id, operacion_id)`) en una transacción corta. Si ya existe con el mismo hash → devolver el resultado previo; con otro hash → `CONFLICTO` `OPERACION_ALTERADA` (se conserva ambas versiones, no se sobrescribe). **Desde este instante la venta no puede perderse.**
2. **Aplicar** en transacción separada: crear la `Venta` con `id = operacionId` (reutilizando `VentasService`/`ledger` mediante un modo de conciliación explícito, no ramas dispersas): venta COMPLETADA con precios *aceptados*, movimiento de caja `VENTA_POS` por el efectivo, reserva + entrega, auditoría `VENTA_CONTINGENCIA_APLICAR`, numeración interna normal, `origen=CONTINGENCIA`, `efectivo_recibido`, `cambio`, `ocurrido_at_estimado`.
3. Si algo no cuadra, **aplicar igual lo que sea posible y marcar conflicto**; lo que no pueda aplicarse queda `REQUIERE_REVISION` con su carga intacta.

### 5.3 Catálogo de conflictos (ninguno rechaza ni borra)

| Código | Causa | Tratamiento |
|---|---|---|
| `PRECIO_NO_AUTORIZADO` | precio aceptado ≠ instantánea de la ventana | Se aplica al precio *cobrado* (el dinero recibido es real), se marca para revisión de ADMIN |
| `STOCK_INSUFICIENTE` | libre actual < cantidad | Se aplica entrega; stock físico no baja de 0: exceso queda como ajuste pendiente y alerta de inventario |
| `PRODUCTO_INACTIVO` / `PRODUCTO_NO_ENCONTRADO` | dado de baja o ajeno | Se registra con referencia; revisión |
| `VENTANA_EXPIRADA` / `RELOJ_ANOMALO` | hora local fuera de `vigenteHasta` (considerando offset) o saltos hacia atrás en la secuencia | Se aplica; revisión obligatoria |
| `USUARIO_NO_AUTORIZADO` | cajero desactivado o permiso revocado | Se aplica; revisión; auditoría reforzada |
| `CAJA_CERRADA` | la caja ligada ya cerró | No se modifica el cierre histórico; el efectivo se asigna a una *caja de conciliación* abierta por ADMIN, con motivo |
| `OPERACION_ALTERADA` | mismo UUID, otro hash | Se conservan ambas; revisión |
| `HUECO_SECUENCIA` | falta `CT-n` entre las recibidas | Alerta: posible operación no subida o perdida; se cruza con comprobantes en papel |

Cada resolución es un evento auditado (quién, cuándo, motivo, decisión). Sin «última escritura gana» en dinero o inventario.

### 5.4 Indicadores claros (cliente y panel)

- Barra permanente: **EN LÍNEA** / **SIN CONEXIÓN — contingencia (efectivo)** / **SINCRONIZANDO**, hora de último contacto, edad del catálogo.
- Contadores: **Pendientes** (cantidad y total), **Sincronizadas**, **Con conflicto** (en rojo, bloquea cerrar sesión/cierre de caja hasta revisarlo).
- Estado por venta (chip) y por línea de conflicto, con texto en lenguaje del cajero.
- No es posible cerrar sesión, limpiar datos del sitio ni cerrar caja con pendientes sin una confirmación fuerte.
- Compatibilidad con el panel del administrador (iPhone/PWA): `GET /contingencia/operaciones?estado=&desde=&hasta=` y `GET …/resumen` con los mismos estados; lectura primero, acciones de resolución en un PR posterior. `origen` y `operacionId` en `GET /ventas` permiten filtrar.

### 5.5 Prevención de duplicados, pérdidas y conflictos de inventario

| Riesgo | Control |
|---|---|
| Doble clic / doble pestaña | UUID creado dentro de la transacción del diario; botón deshabilitado por estado; una pestaña operadora (Web Locks); `UNIQUE(tenant, operacionId)` |
| Reintento tras timeout | Mismo `operacionId`, mismo hash; consulta previa; replay devuelve la original |
| Pérdida por cierre/apagón | Confirmar al cajero **después** de `oncomplete` estricto; recuperación al arrancar; comprobante en papel con secuencia |
| Perfil borrado | Huecos de secuencia detectados en servidor; exportación periódica del diario (descarga manual/archivo) |
| Sobreventa | Cupo y margen locales; conciliación sin rechazar + alerta; reservas por dispositivo solo si hay >1 caja offline |
| Cliente viejo sin `solicitudId` | Endpoint nuevo exige `operacionId`; el existente `POST /ventas` queda como está (hacerlo obligatorio es decisión aparte) |
| Reloj manipulado | Offset medido al emitir la ventana, hora del servidor al recibir, secuencia monotónica, validación de `vigenteHasta`; no es a prueba de manipulación: la ventana limita cupos y montos |

---

## 6. Archivos que deberán cambiar (en PR futuros; **no tocados aquí**)

> Áreas compartidas con trabajo de Claude en curso (POS/Clientes/permisos): coordinar antes de cada PR (fetch + PRs abiertos).

**Backend**

| Archivo | Cambio |
|---|---|
| `backend/prisma/schema.prisma` + migración nueva | Tablas `dispositivos_pos`, `contingencia_ventanas`, `catalogo_snapshots`, `operaciones_contingencia`, `conflictos_contingencia`; columnas aditivas en `ventas` (`origen`, `efectivo_recibido`, `cambio`, `ocurrido_at_estimado`, `operacion_id`); índices y CHECK (monto ≥ 0, `UNIQUE(tenant, operacion_id)`). Solo aditivo. |
| `backend/src/contingencia/` (módulo nuevo) | Controlador/servicio/DTO: ventanas, ingestión por lote, consulta por operación, resumen, resolución |
| `backend/src/ventas/ventas.service.ts` | Extraer el núcleo de creación a una función reutilizable con «modo conciliación»; sin cambiar el contrato actual de `POST /ventas` (cubierto por las pruebas de caracterización) |
| `backend/src/operaciones/{operaciones.service.ts,ledger.ts}` | Reutilizar `entregar`/`cashMovement`/`audit` dentro de la misma transacción |
| `backend/src/ventas/dto/create-venta.dto.ts` | Solo si se decide hacer `solicitudId` obligatorio (D9) |
| `backend/src/common/` | Utilidad de cálculo monetario compartida (centavos, ISV) |
| `backend/src/app.module.ts` | Registrar módulo |
| `backend/test/contingencia.postgres.integration.ts` | Nuevo (PostgreSQL real) |

**Frontend**

| Archivo | Cambio |
|---|---|
| `frontend/src/offline/` (nuevo): `db.ts`, `journal.ts`, `catalog.ts`, `sync.ts`, `locks.ts`, `money.ts`, `window.ts` | Almacén IndexedDB, diario, catálogo, sincronizador |
| `frontend/public/sw.js` + registro en `src/main.tsx`; `vite.config.ts`; `public/manifest.webmanifest` | PWA: shell versionado, activación solo sin operación en curso |
| `frontend/src/pages/POSPage.tsx` | Modo contingencia, indicadores, sustitución de `localStorage` por el diario con lectura dual |
| `frontend/src/utils/{posRecovery.ts,requestId.ts,api.ts,authInterceptors.ts}` | Migración de recuperación; usar `newRequestId`; timeout; no redirigir con pendientes |
| `frontend/src/context/TenantContext.tsx`, `utils/sessionSync.ts` | Pausar sync de sesión en contingencia; conservar diario al cerrar sesión |
| `frontend/src/components/ReciboPDF.tsx` (+ comprobante nuevo) | Leyenda de contingencia |
| `frontend/src/components/{OfflineStatusBar,ConflictosContingencia}.tsx` (nuevos), `pages/` panel admin | Indicadores y resolución |
| `frontend/src/locales/{es,en}.json` | Textos |

**No se tocan** (otra sesión): `deploy/**`, `backend/scripts/backup-*`, workflows, configuración de hosting, migraciones/restauración de infraestructura.

---

## 7. Plan de implementación en PR pequeños

Cada PR: rama propia desde `main` actualizado, sin merge ni despliegue automáticos, `CONTEXTO_MAESTRO.md` actualizado, bandera apagada por defecto.

| PR | Contenido | Riesgo | Requiere aprobación previa |
|---|---|---|---|
| **0 (este)** | Diseño + pruebas de caracterización (frontend 16, backend 11). Sin cambio de comportamiento. | Nulo | — |
| 1 | Utilidades puras: dinero en centavos + ISV compartido, con pruebas cruzadas con `VentasService`. | Bajo | Diseño |
| 2 | Endurecer el POS **online**: `newRequestId`, timeout con consulta previa, no redirigir con pendiente, tests. Sin offline. | Medio (toca POS) | Coordinación con ramas de Claude |
| 3 | Módulo `frontend/src/offline/` (IndexedDB, diario, locks) **sin conectar a la UI**; `fake-indexeddb` y pruebas de corte simuladas. | Bajo | Diseño |
| 4 | Backend: migración aditiva + ventanas/instantáneas + consulta de operación (sin ventas). | Medio | **Migración (DBA)** |
| 5 | Backend: ingestión por lote + aplicación + conflictos, detrás de bandera por empresa; PostgreSQL real. | Alto | Diseño financiero + **decisión fiscal** |
| 6 | PWA: service worker, caché de assets y catálogo de solo lectura, borradores sin conexión; bloqueo de cobro offline. | Medio | Diseño |
| 7 | UI de contingencia (efectivo) + comprobante + indicadores, bandera apagada. | Alto | **Decisión fiscal** |
| 8 | Sincronizador + recuperación + pantalla de conflictos (admin). | Alto | — |
| 9 | Panel admin (iPhone): lectura/resolución. | Medio | — |
| 10 | Piloto: simulacros de apagón/red, métricas y activación por empresa. | — | **Aceptación explícita del propietario** |

---

## 8. Pruebas requeridas

Estado: «hoy» = existe y pasa en este PR (caracterización); «futuro» = se escribe con el PR indicado.

### 8.1 Apagón y reinicio
| Caso | Aserción | Cuándo |
|---|---|---|
| Corte eléctrico real durante `readwrite` estricto (10×) en Chromium/Edge de la caja, con UPS apagado y encendido | Toda operación confirmada al cajero está en el diario; ninguna operación sin confirmar aparece como cobrada | Piloto (PR 10); hardware real |
| Cierre forzado del navegador entre «confirmar» y `oncomplete` | La operación no existe y no se mostró comprobante | PR 3 (simulado) y 10 |
| Reinicio con operación en `ENVIANDO` | Vuelve a `REGISTRADA_LOCAL`, consulta por UUID, un solo efecto | PR 8 |
| JSON/almacén corrupto o cuota llena | No se cobra; diario previo intacto; mensaje operativo | Hoy (localStorage) / PR 3 |
| Pendiente inválido no se descarta | `readRecovery` bloquea sin tocar el dato | **Hoy** |
| Sesión: token vencido al volver la red | Refresh; si falla, diario intacto y aviso; no redirige | Hoy (documenta el defecto) / PR 2 |

### 8.2 Duplicados
| Caso | Aserción | Cuándo |
|---|---|---|
| Replay mismo UUID y contenido | Misma venta; sin segunda reserva/caja/secuencia | **Hoy** (unitaria) / PR 5 (PostgreSQL) |
| Mismo UUID con otra cantidad/precio/usuario | 409 / `OPERACION_ALTERADA`; nada sobrescrito | **Hoy** / PR 5 |
| 20 `POST` simultáneos del mismo UUID | Una venta, un movimiento de caja, una auditoría | PR 5 (PostgreSQL real) |
| Sin `solicitudId` en `POST /ventas` | Dos ventas (documenta H4) | **Hoy** |
| Dos pestañas | Un solo operador/sincronizador | PR 3/8 (browser) |
| Doble clic en «Confirmar efectivo» | Un registro | PR 7 |

### 8.3 Precios
| Caso | Aserción | Cuándo |
|---|---|---|
| CAJERO con precio distinto → 409; ADMIN puede | Contrato vigente | **Hoy** |
| Precio aceptado = instantánea de la ventana; el precio actual cambió | Sin conflicto | PR 5 |
| Precio manipulado en el cliente | `PRECIO_NO_AUTORIZADO`, dinero igual registrado | PR 5 |
| Redondeo de ISV/total cliente vs servidor (propiedad con miles de combinaciones) | Idénticos al centavo | PR 1 |
| Botón «Actualizar precios» reemplaza sin desglose | Documenta H9 | **Hoy** |

### 8.4 Inventario
| Caso | Aserción | Cuándo |
|---|---|---|
| Disponible local respeta cupo, margen y operaciones pendientes | Nunca sobrepasa; bloquea en 0 | PR 7 |
| Reserva + entrega al conciliar | `stock_actual` baja una vez; reserva neta 0 | PR 5 |
| Stock cambió online durante el corte | `STOCK_INSUFICIENTE`, venta registrada, alerta | PR 5 |
| Decimales (2.75 u) | Exactos | **Hoy** (existente) / PR 1 |

### 8.5 Sincronización
| Caso | Aserción | Cuándo |
|---|---|---|
| Lote con una operación inválida | Las demás se aplican; la inválida queda `CONFLICTO` | PR 5 |
| Pérdida de red a mitad de lote / respuesta perdida | Reintento seguro; sin duplicado | PR 8 |
| 24 h de corte con 5 ventas | Ventana vigente; reconcilia en orden; totales de caja exactos | PR 10 |
| Usuario desactivado durante el corte | `USUARIO_NO_AUTORIZADO`, venta registrada | PR 5 |
| Caja ya cerrada | `CAJA_CERRADA`, cierre histórico intacto | PR 5 |
| Hueco de secuencia | Alerta | PR 5/8 |
| Aislamiento entre empresas | Ninguna operación visible/aplicable entre tenants | PR 5 |

Las 27 pruebas de este PR se ejecutan con `cd frontend && node --test test/pos-offline-caracterizacion.test.mjs` y `cd backend && npx vitest run src/ventas/ventas.contingencia-caracterizacion.spec.ts`.

---

## 9. Riesgos y decisiones pendientes

### 9.1 Riesgos principales

1. **Durabilidad de IndexedDB ante apagón eléctrico** no está demostrada en el equipo real (mitigación: `strict`, UPS, papel con secuencia, simulacro; plan B: agente local con SQLite solo para el diario).
2. **Legalidad del comprobante** (§4): puede impedir el piloto o forzar un procedimiento de talonario.
3. **Manipulación local** (reloj, precios, diario): la PWA no ofrece contabilidad a prueba de manipulación; se acota con ventana, cupos, límites y detección de huecos.
4. **Conciliación de caja**: el efectivo recibido offline cambia el esperado del arqueo; hay que definir caja de conciliación y evitar tocar cierres históricos.
5. **Alcance de cambios en `ventas.service.ts`** (área compartida y crítica): extraer sin cambiar el contrato actual (protegido por pruebas de caracterización).
6. **Compatibilidad frontend/backend**: clientes en caché sin la ventana → no pueden operar en contingencia; la bandera y la versión mínima deben negociarse.
7. **Datos en el equipo**: el catálogo local debe construirse con el contrato público existente (`publicProduct` en `producto-response.ts`, que hoy excluye `precioCosto`); la instantánea de la ventana no puede ampliar ese contrato (sin costos, saldos ni datos de clientes registrados).

### 9.2 Decisiones que requieren autorización

| ID | Decisión | Recomendación |
|---|---|---|
| D1 | Aprobación fiscal de la leyenda/procedimiento de contingencia (§4) | Obligatoria antes del PR 7; si no, solo borradores |
| D2 | Almacén primario: IndexedDB (con plan B agente local SQLite) | IndexedDB estricto + simulacro |
| D3 | Cobrar solo en efectivo en la etapa 1 | Sí |
| D4 | ¿Una sola caja offline sin reserva de stock, o reservas exclusivas por dispositivo? | Una caja, sin reserva; reservas si hay >1 |
| D5 | Cupos, márgenes, monto máximo por venta/acumulado y vigencia de ventana (propuesto 36 h) | Fijar con el propietario |
| D6 | PIN local de bloqueo/desbloqueo del cajero offline | Sí, opcional por empresa |
| D7 | Qué hacer con `CAJA_CERRADA`: caja de conciliación abierta por ADMIN | Sí |
| D8 | Migraciones aditivas del §6 (tablas + columnas de `ventas`) | Aprobar tras revisión del DBA |
| D9 | Hacer `solicitudId` obligatorio en `POST /ventas` | Sí, con transición compatible |
| D10 | Quién resuelve conflictos y plazos (SLA operativo) | ADMIN, al día siguiente del corte |
| D11 | Piloto: hardware (UPS, segundo enlace), ensayo de corte y criterios de aceptación | Ensayo antes de activar |
| D12 | Coordinación de archivos compartidos (`POSPage.tsx`, `ventas.service.ts`) con las ramas de Claude | Integrar sus PR primero |

---

## 10. Evidencia de este PR

- Solo se agregaron: este documento, `frontend/test/pos-offline-caracterizacion.test.mjs` (16 pruebas) y `backend/src/ventas/ventas.contingencia-caracterizacion.spec.ts` (11 pruebas), más el bloque de estado en `docs/CONTEXTO_MAESTRO.md`.
- Sin cambios de código de producción, esquema, migraciones, dependencias ni configuración.
- Las pruebas usan mocks (almacenamiento en memoria, Prisma simulado). **No prueban PostgreSQL real, apagón físico, navegador real ni fiscalidad.**
