
> **Estado de cierre (2026-11-05, actualizado en la integración del sprint):** los hallazgos del informe original se
> conservan sin cambios. Su estado actual es el siguiente; cada cierre remite al PR o commit de `main` que lo implementa.
>
> | Hallazgo | Estado | Referencia |
> |---|---|---|
> | P1-1 persistencia y cuota | Cerrado en `main` (`e2b12a0`) | PR #239 |
> | P1-2 recuperación de sesión con 502/503 | Cerrado en `main` | PR #236 (`8a43b06`) |
> | P1-3 aislamiento por empresa | Cerrado a nivel de aplicación (sincronización, contadores y diario por empresa y sesión). **Separación física de almacenamiento: no implementada** | PR #236, PR #238 (`6a44703`) |
> | P1-4 permisos del diario por rol | Cerrado en `main` (VENDEDOR sin acceso; CAJERO solo sus operaciones) | PR #236 (`8a43b06`) |
> | P1-5 retención | Diseñado y probado, **no activado**: no borra nada hasta cumplir las puertas del contrato | PR #239; `docs/RETENCION_CONTRATO_20261104.md` |
> | P2-1 registro del equipo por empresa | Corregido según PR #238 | PR #238 |
> | P2-2 ADMIN de otra empresa intenta enviar | Corregido según PR #238 | PR #238 |
> | P2-3 latido del dispositivo | Abierto | — |
> | P2-4 borrador único por equipo | Abierto | — |
> | P2-5 exportación del diario sin hash | Abierto (la exportación ya se limita a lo visible) | PR #236 |
> | P2-6 mensaje al agotar identificadores | Abierto | — |
> | P2-7 reloj local | Abierto (mitigado en servidor) | — |
> | P2-8 fuentes sin caché offline | Abierto | — |
>
> **Contingencia PWA en producción:** sigue desactivada. Los cambios de código no la activan; hace falta una decisión explícita.

# Auditoría offline, almacenamiento local y continuidad operativa — 2026-11-04

**Proyecto:** Jowa System (`Nelosama/FerreSystem`) · **Rama documental:** `docs/plan-ejecucion-20261102`
**Código auditado:** `main` `20f356cb82c7f002db6c950475f548277c5bd795` (la rama documental solo añade documentos sobre ese SHA).
**Alcance:** POS de contingencia (`/pos-contingencia`), IndexedDB `ferresystem-contingencia`, service worker, sesión offline, recepción en el backend y relación con los respaldos.
**Fuera de alcance por coordinación:** Codex corrige `frontend/src/offline/sync.ts`, `frontend/src/offline/journal.ts` y `frontend/src/hooks/useConexion.ts`. Aquí **no se modifican** esos archivos ni se proponen parches paralelos. Lo que afecta a esos archivos queda como **dato de entrada para Codex** (marcado ⟶ Codex) y debe revalidarse cuando su cambio llegue a `main`, porque las líneas citadas pueden moverse.

> Estado de producción: la contingencia sigue **apagada** en el plan de salida (`PLAN_SALIDA_PRODUCCION_20261102.md`) y `POS_OFFLINE_ENABLED` no está en Render. Esta auditoría no cambia el dictamen **NO-GO** vigente. Si la contingencia se enciende, los criterios de la §7 son obligatorios.

---

## 0. Resumen ejecutivo

1. **El núcleo transaccional es sólido.** Una venta offline solo se confirma cuando la transacción IndexedDB termina en `complete` con `durability: 'strict'` (`frontend/src/offline/db.ts:46-72`). Si se agota la cuota, la venta **no** se confirma y no queda nada a medias (prueba simulada ejecutada hoy: aprobada; medición en Chromium: `QuotaExceededError` aborta la transacción). El servidor es idempotente por UUID emitido, verifica el payload con hash y recalcula importes contra la instantánea firmada del catálogo.
2. **No hay ninguna política de retención.** El diario nunca borra nada (`journal.ts:4`) y no hay código que lea `navigator.storage` (0 apariciones en `frontend/src`). No se pide almacenamiento persistente aunque el diseño lo exigía (`POS_OFFLINE_CONTINGENCIA_DISENO.md:66`). Hoy el riesgo de llenar la cuota es bajo (≈1 KiB por venta), pero el coste de lectura crece sin límite: cada cobro lee el diario completo.
3. **El aislamiento local entre empresas y roles es incompleto.** La base local es única por navegador y no está separada por empresa. Las operaciones no guardan `tenantId`, y la página muestra a cualquier usuario con `pos.vender` (incluido VENDEDOR) todas las ventas guardadas en el equipo, con nombre y RTN del cliente. El servidor sí está aislado: no hay fuga de datos hacia otra empresa en PostgreSQL.
4. **Hay un hueco de continuidad confirmado en el código.** Si la API responde con un error (503 por Supabase caído, o 502/503 del borde de Render), la sesión no cae al modo contingencia. Tras recargar o reiniciar el navegador, el POS de contingencia queda bloqueado en «No pudimos verificar la sesión». Solo se recupera ante errores **sin** respuesta HTTP (`frontend/src/utils/sessionValidation.ts:71-74`).
5. **Respaldos:** el diario local es contingencia, no respaldo. Los respaldos de PostgreSQL/Supabase y la restauración siguen **sin certificar** (FS-41, D4/D6/E5 del plan). Ninguna política local sustituye esa certificación.

**Hallazgos:** P0 = 0 · P1 = 5 · P2 = 8. Ninguno pierde ventas en el código actual si la contingencia se usa como fue diseñada (una empresa, una caja). Los P1 son condiciones de salida si la contingencia se enciende.

---

## 1. Evidencia ejecutada en esta auditoría

| Qué | Cómo | Resultado |
|---|---|---|
| Unitarias del diario, sincronización, caracterización POS offline y comprobante | `node --test test/offline-logica.test.mjs test/pos-offline-caracterizacion.test.mjs test/comprobante-contingencia.test.mjs` (Node 22.23.4) | **45/45 aprobadas** |
| E2E simulados de contingencia y PWA | `VITE_API_URL=/api npm run build` + `npx playwright test e2e/contingencia-simulado.spec.ts e2e/contingencia-red-simulado.spec.ts e2e/session-pwa.spec.ts` (Playwright 1.63.0, Chromium 1243) | **20/20 aprobadas** |
| Tamaño serializado de catálogo y operaciones | Script Node con `v8.serialize` y JSON (scratchpad, no versionado) | Ver §2.1 |
| Uso real de IndexedDB, `persist()`, coste de `getAll`, cuota agotada | Script Playwright/Chromium contra un origen local, mismo esquema que `db.ts` | Ver §2.1 |
| E2E reales (`e2e-real/contingencia-real.spec.ts`, 16 casos) y PostgreSQL de contingencia (16 archivos) | **No ejecutados** en esta auditoría: requieren API + PostgreSQL. Se citan como pruebas existentes, sin afirmar su resultado actual. | — |

No se ejecutó nada contra bases reales, Render, Vercel ni Supabase.

---

## 2. Capacidad de almacenamiento

### 2.1 Datos medidos

| Elemento | Dónde vive | Tamaño medido |
|---|---|---|
| Catálogo de la ventana (producto con id, código, barras, nombre, precio, cupo) | `ventana['activa']`, un único valor que se **reemplaza** en cada renovación (`ventana.ts:218`, `sync.ts:265-281`) | Serializado: 1 000 productos ≈ 0.25 MiB; 10 000 ≈ 2.5 MiB; 20 000 ≈ 4.9 MiB. En disco (Chromium, datos sintéticos repetitivos y comprimibles): 10 000 productos sumaron 0.52 MiB. Con nombres reales la cifra se acercará más al tamaño serializado. |
| Identificadores emitidos | dentro de la ventana; 500 por ventana (`backend/src/contingencia/operaciones-emitidas.ts:4`) | ≈ 22 KiB |
| Venta offline | `operaciones` (keyPath `operacionId`) | 1 línea ≈ 1.0 KiB; 5 líneas ≈ 1.8 KiB; 60 líneas (máximo, `PosContingenciaPage.tsx:27`) ≈ 12 KiB |
| 20 000 ventas de 5 líneas | IndexedDB real en Chromium | **20.4 MiB** de uso |
| Lectura completa (`getAll`) | Chromium headless en este contenedor | 1 000 ventas: 94 ms; 5 000: 276 ms; 20 000: **883 ms** |
| `navigator.storage.persisted()` / `persist()` | Chromium headless, sitio no instalado | `false` / `false` (en Chromium se concede según el uso del sitio, la instalación o los marcadores; no está garantizado) |
| Cuota agotada | Cuota forzada a 1 MiB por CDP y escritura de 3 MiB | `abort: QuotaExceededError`: la transacción no se confirma |

**Conclusión:** el tamaño no es el riesgo principal. Una ferretería con 300 ventas offline por día de corte necesitaría unos 60 días de corte acumulados para llegar a 20 000 ventas. Los riesgos reales son: (a) el **desalojo** del almacenamiento no persistente, (b) el coste **O(n)** por cobro y por ciclo de 30 s, y (c) que la lista de la interfaz crezca sin paginar.

### 2.2 Límites por navegador (documentación pública de cada motor; **no medidos** aquí salvo Chromium)

| Navegador | Cuota habitual por origen | Desalojo |
|---|---|---|
| Chrome / Edge (escritorio y Android) | Hasta ~60 % del disco por origen; en incógnito, un límite reducido en memoria | Almacenamiento «best-effort»: con poco disco se desaloja el origen menos usado recientemente, **completo**. Con `persist()` concedido no se desaloja sin acción del usuario. |
| Firefox | ~50 % del disco libre (grupo de dominio limitado) en modo best-effort; mayor si es persistente | Desalojo LRU por origen en best-effort |
| Safari / iOS / iPadOS | ~60 % del disco en versiones 17+; antes, del orden de 1 GiB con avisos | ITP: el almacenamiento escrito por scripts puede borrarse tras **7 días sin interacción** con el sitio, salvo en una PWA añadida a la pantalla de inicio. El usuario puede borrar «Datos de sitios web». |

Requisito derivado: la caja de contingencia debe ser un equipo identificado (Chrome/Edge de escritorio o PWA instalada), sin modo incógnito, sin limpieza automática del navegador al cerrar y con `persist()` concedido y verificado (ver §4 y §7).

### 2.3 Comportamiento con cuota agotada (código actual)

- Alta de venta: la transacción aborta y el cajero ve «La venta NO se guardó en este equipo (espacio lleno). No entregue la mercancía» (`PosContingenciaPage.tsx`, función `cobrar`). Correcto y cubierto por la prueba simulada «almacenamiento lleno» (ejecutada hoy).
- Borrador: si falla al guardar, el error se ignora en silencio (`.catch(() => undefined)` en el efecto de borrador). Es aceptable porque el borrador no es una venta, pero el cajero no sabe que perderá el carrito si recarga.
- Cambios de estado de la sincronización con cuota agotada: `actualizarSincronizacion` falla. Como el lote ya se envió y el servidor es idempotente, el siguiente ciclo repite el envío sin duplicar. Riesgo aceptable.
- No hay **aviso previo**: nada mide el uso ni la cuota, así que el primer síntoma es un cobro rechazado.

---

## 3. Hallazgos

Convención: **Confirmado** = demostrado por el código citado o por una prueba ejecutada hoy; **Hipotético** = depende de condiciones externas no reproducidas (comportamiento del proveedor o del navegador, uso real).

### P0

Ninguno. No se encontró un camino que pierda o duplique una venta offline confirmada con una empresa y una caja.

### P1

| ID | Hallazgo | Evidencia | Tipo | Impacto |
|---|---|---|---|---|
| **P1-1** | **No se solicita almacenamiento persistente ni se mide la cuota.** El diario de ventas pendientes vive en almacenamiento best-effort y el navegador puede desalojarlo con poco disco (Chromium) o tras inactividad (Safari ITP). | 0 usos de `navigator.storage` en `frontend/src`; el diseño lo exigía (`docs/POS_OFFLINE_CONTINGENCIA_DISENO.md:66`); medición: `persist()` = `false` en un sitio no instalado. | Brecha **confirmada**; el desalojo real es **hipotético** (necesita poco disco o inactividad). | Pérdida silenciosa de ventas cobradas y no sincronizadas. El servidor solo puede detectar huecos en `secuenciaLocal` si llega alguna operación posterior. |
| **P1-2** | **La contingencia no se abre tras recargar si la API responde con error.** La recuperación offline de la sesión solo ocurre si el error no trae respuesta HTTP. Con Supabase inaccesible, `JwtStrategy` responde 503 (`backend/src/auth/jwt.strategy.ts:57-58`) y `/auth/me` falla con respuesta: el estado queda en `error` y `ProtectedRoute` muestra el bloqueo. Lo mismo ocurre si el borde de Render responde 502/503. | `frontend/src/utils/sessionValidation.ts:71-75`; `frontend/src/components/ProtectedRoute.tsx:32-39`. Una pestaña ya montada conserva el acceso (`mountedIdentity`), pero una recarga o un reinicio del navegador lo pierden. | **Confirmado** para el 503 del backend. **Hipotético** que Render devuelva 502/503 con cuerpo durante una caída o un despliegue (no reproducido). | El escenario «API de Render o Supabase caídos» no permite reabrir la caja de contingencia: justo cuando más se necesita. |
| **P1-3** | **La base local no está separada por empresa.** El nombre es fijo (`db.ts:5`), las operaciones no guardan `tenantId` (`journal.ts:18-52`) y el diario se lista completo (`PosContingenciaPage.tsx:66-68, 472-482`). En un navegador compartido por dos empresas (soporte del Super Admin, equipo prestado, pruebas), el usuario de B ve las ventas, totales, nombres y RTN de los clientes de A. | Lectura de código. Además, el contador global de `useConexion` cuenta pendientes de cualquier empresa (`journal.ts:144-151`) ⟶ Codex. | **Confirmado** por código; la frecuencia del navegador compartido es **hipotética**. | Exposición de datos personales y comerciales entre empresas en el equipo. El servidor rechaza los envíos cruzados (el dispositivo se busca por `tenantId`, `contingencia.service.ts:166-167, 287-290`), así que no hay contaminación en PostgreSQL. |
| **P1-4** | **Todos los roles con acceso a la página ven el diario completo.** La ruta admite ADMIN, CAJERO y VENDEDOR (`App.tsx:203`), pero el servidor solo emite ventanas a ADMIN y CAJERO (`contingencia.service.ts:241`). Un VENDEDOR o un segundo cajero ve y puede reimprimir los comprobantes de ventas ajenas (cliente, RTN, efectivo y cambio). | `PosContingenciaPage.tsx:472-482` lista `ops` sin filtrar por `cajeroId`; la reimpresión no comprueba quién la pide. | **Confirmado** por código. | Fuga dentro de la empresa y posibilidad de reimprimir comprobantes ajenos. El envío sí está filtrado (`puedeEnviar`, `sync.ts:63-65`). |
| **P1-5** | **No hay retención: el diario y su coste crecen sin límite.** Cada cobro hace `getAll` de todas las operaciones dentro de la transacción de alta (`journal.ts:69-79`) ⟶ Codex. La página relee todo cada 30 s y tras cada venta y lo pinta sin paginar. | Medición: `getAll` de 20 000 ventas = 883 ms (headless). No existe ninguna función de borrado. | Crecimiento **confirmado**; la degradación perceptible es **hipotética** (depende del volumen y del equipo). | Cobro lento con la caja ocupada, más presión de cuota y más datos personales retenidos sin necesidad. |

### P2

| ID | Hallazgo | Evidencia | Tipo |
|---|---|---|---|
| P2-1 | **El registro del dispositivo es por equipo, no por empresa.** `registrado: true` se guarda una vez (`ventana.ts:229-235`). Un usuario de otra empresa en el mismo navegador nunca registra el equipo en su empresa: `renovarVentana` recibe 404 y la contingencia queda inutilizable (falla cerrada). El `codigo` y la `secuencia` local también se comparten entre empresas. | Confirmado por código |
| P2-2 | **Un ADMIN de otra empresa intenta enviar las ventas de la primera.** `puedeEnviar` acepta cualquier operación si el rol es ADMIN (`sync.ts:63-65`) ⟶ Codex. El servidor responde 404 por dispositivo desconocido y las operaciones vuelven a PENDIENTE con backoff y `ultimoError` contaminado. No se pierden, pero el estado visible se ensucia. | Confirmado por código |
| P2-3 | **Nunca se llama al latido del dispositivo.** El endpoint `POST /contingencia/dispositivos/:id/latido` existe (`contingencia.controller.ts:58-61`), pero el frontend no lo usa. `pendientesReportados` solo se actualiza cuando hay algo que enviar, así que las ventas de otro cajero que esperan su sesión no se reportan y el panel del administrador no ve ventas varadas en el equipo. | Confirmado por código (`grep latido frontend/src` = 0) |
| P2-4 | **El borrador es un único hueco por equipo** (`borrador['activo']`, `ventana.ts:224`). Un segundo cajero sobrescribe o borra el carrito del primero. Solo se restaura si `cajeroId` coincide, pero el efecto de guardado lo reemplaza. | Confirmado por código |
| P2-5 | **El diario exportado contiene datos personales sin protección.** El JSON incluye el nombre y el RTN del cliente y la identidad del dispositivo (`journal.ts:164-168`), sin hash de integridad ni cifrado. No contiene tokens (lo cubre la prueba real 13, no ejecutada hoy). | Confirmado por código |
| P2-6 | **Agotar los 500 identificadores emitidos produce un mensaje genérico.** `registrarOperacion` aborta (`journal.ts:74`) y el cajero ve «La operación local fue cancelada y no se guardó» sin saber que debe renovar la ventana ⟶ Codex. | Confirmado por código |
| P2-7 | **Reloj local adelantado o atrasado.** La vigencia de la ventana se evalúa con `Date.now()` del equipo (`ventana.ts:215-216`). Si se atrasa el reloj se puede vender después de la vigencia. El servidor lo detecta (`VENTANA_EXPIRADA` y `RELOJ_ANOMALO`, conflictos BLANDO, `contingencia.service.ts:744-751`) y lo acotan los 500 identificadores y el monto acumulado, pero la venta se aplica con revisión, no se bloquea. | Confirmado; mitigado en el servidor |
| P2-8 | **Las fuentes web no se cachean.** `index.html` carga Google Fonts y el service worker solo cachea el mismo origen (`sw.js:30`). Offline el POS se ve con fuentes de sistema. El chunk principal (que contiene `PosContingenciaPage` y `offline/ventana`) sí se precarga, comprobado en `dist/index.html` del build de hoy. | Confirmado; impacto estético |

### Verificado sin hallazgo

- **Atomicidad del alta:** contador, índice emitido y operación se escriben en una sola transacción (`journal.ts:64-96`). Con cuota agotada no queda nada a medias (prueba simulada aprobada hoy).
- **Inmutabilidad de la carga:** `actualizarSincronizacion` rechaza campos que no son de sincronización (`journal.ts:107-114`; prueba unitaria aprobada hoy).
- **Modificación manual (DevTools):** el servidor exige el UUID emitido por HMAC para la ventana y el índice (`OPERACION_NO_EMITIDA`), registra un payload distinto con el mismo UUID como alteración sin modificar la venta, y recalcula precio, ISV y total contra la instantánea (`TOTAL_DIFERENTE`, `PRECIO_NO_AUTORIZADO`, `CUPO_EXCEDIDO`, `STOCK_INSUFICIENTE`, `contingencia.service.ts:705-836`).
- **Varias pestañas:** `navigator.locks` garantiza una sola pestaña operadora con relevo (`PosContingenciaPage.tsx:72-87`). Solo ella sincroniza. Sin `locks` (navegadores antiguos), la transacción del alta sigue siendo atómica y el servidor deduplica por UUID.
- **Cierre de sesión:** no borra el diario (`authInterceptors.ts:18-21`), y una sesión cerrada no puede abrir el POS offline porque `matches()` exige el token (`sessionValidation.ts:32-38`). El modo offline exige una ventana vigente de la misma empresa y del mismo usuario (`sessionValidation.ts:39-46`).
- **Actualización del service worker:** no hay `skipWaiting` (`sw.js:5`), así que una versión nueva espera a que se cierren todas las pestañas. La API nunca se cachea (`sw.js:31`). La prueba PWA simulada se aprobó hoy; la prueba real 14 existe y no se ejecutó.
- **Aislamiento en el servidor:** todas las lecturas de contingencia filtran por `tenantId` y los identificadores internos se derivan de la empresa (`idSolicitud(tenantId, …)`).

---

## 4. Matriz de escenarios y pruebas existentes

Leyenda: ✅ ejecutada hoy y aprobada · 📄 existe y no se ejecutó hoy · ❌ sin prueba.

| Escenario | Comportamiento actual | Pruebas | Brecha |
|---|---|---|---|
| Internet interrumpido con la página abierta | Vende en efectivo y guarda en IndexedDB antes de confirmar | ✅ `contingencia-simulado` «dos ventas consecutivas sin internet»; 📄 real 2 | — |
| Recarga sin red (navegador offline) | El service worker sirve el shell y la sesión pasa a `offline` si hay ventana vigente | ✅ `contingencia-red-simulado` «corte de red… sobrevive a recargar»; 📄 real 2; ✅ `session-pwa` | — |
| API de Render indisponible (sin respuesta) | Igual que sin red: `!error.response` → contingencia | 📄 indirecto (timeout en `contingencia-simulado`) | ❌ recarga con 502/503 **con** cuerpo (P1-2) |
| Supabase inaccesible | El backend responde 503 → la sesión queda en `error` tras recargar; las ventas ya abiertas siguen; la sincronización reintenta con backoff | ✅ «503 del servidor» (solo la sincronización) | ❌ recarga con 503 de `/auth/me` (P1-2) |
| Reinicio del navegador con pendientes | El diario sobrevive; `recuperarEnvios` devuelve ENVIANDO a PENDIENTE | ✅ «recargar durante un envío en vuelo»; 📄 real 4 y 6 | — |
| Actualización del service worker | La nueva versión espera; no interrumpe un cobro | ✅ `session-pwa`; 📄 real 14 | ❌ cambio de esquema IndexedDB (versión 2) con una pestaña antigua abierta (`onblocked`) |
| Almacenamiento lleno | El cobro se rechaza y no queda nada a medias | ✅ «almacenamiento lleno» | ❌ aviso previo por umbral (P1-1) |
| Desalojo del navegador / perfil borrado | Pérdida total del diario sin aviso | ❌ | P1-1; mitigación: `persist()` + exportación + latido |
| Sincronización interrumpida | Vuelve a PENDIENTE; el UUID evita duplicados | ✅ «timeout real», «recargar durante un envío»; 📄 real 6 y 7 | — |
| Operaciones duplicadas | Idempotencia por UUID; un payload alterado se registra como alteración | ✅ «lote rechazado con 400… ninguna se duplica»; 📄 real 3 y 7; 📄 `contingencia-concurrencia.postgres` | — |
| Ventana offline vencida | El cliente bloquea el cobro; el servidor marca `VENTANA_EXPIRADA` si el reloj se manipula | 📄 PostgreSQL de contingencia | ❌ prueba E2E de reloj atrasado (P2-7) |
| Identificadores emitidos agotados (500) | El alta aborta con un mensaje genérico | ❌ | P2-6 ⟶ Codex |
| Varias pestañas | Una operadora con relevo | 📄 real 5 y 5b | — |
| Cambio de usuario en la misma empresa | El diario se conserva; solo el dueño o un ADMIN lo envía | ✅ unitaria `puedeEnviar`; 📄 real 11 y 15 | ❌ visibilidad de ventas ajenas en la lista (P1-4); borrador compartido (P2-4) |
| Otra empresa en el mismo navegador | Ve el diario ajeno; no puede registrar el equipo | ❌ | P1-3, P2-1, P2-2 |
| Cierre de sesión con pendientes | El diario se conserva; el dueño lo reconcilia al volver | 📄 real 15 | — |
| Impresora falla | La venta no se revierte | ✅ | — |
| Exportación del diario | JSON sin tokens | 📄 real 13 | P2-5 |

---

## 5. Política recomendada de almacenamiento y retención

**Principio:** se borra por **evidencia**, no por antigüedad. Un registro local solo es prescindible cuando el servidor tiene una copia íntegra **y** confirmada **y** el ciclo operativo que la contiene está cerrado. No hay plazos arbitrarios para transacciones.

### 5.1 Clasificación de datos locales

| Clase | Contenido | Regla |
|---|---|---|
| **A. Intocable** | Operaciones `PENDIENTE`, `ENVIANDO`, `REVISION`, y `SINCRONIZADA` con `requiereRevision = true` | **Nunca** se borran automáticamente, ni por cuota, ni por cierre de sesión, ni por cambio de usuario o empresa. Su eliminación manual requiere la confirmación del servidor (paso B). |
| **B. Confirmada, en conciliación** | `SINCRONIZADA` sin revisión cuya caja (`cajaId`) sigue abierta en el servidor, o cuya ventana es la vigente | Se conserva para reimprimir y conciliar. |
| **C. Confirmada y conciliada** | `SINCRONIZADA` sin revisión, con `correlativoDefinitivo`, con una reconfirmación del servidor en el momento de depurar (`GET /contingencia/operaciones/estados` → `APLICADA` o `RESUELTA_MANUAL` con el mismo `payloadHash`) y con su caja cerrada | **Depurable.** Se sustituye por un **testigo** compacto: `operacionId`, `ventanaId`, `secuenciaLocal`, `correlativoLocal`, `correlativoDefinitivo`, `totalCentavos`, hash del payload y `sincronizadaAt`, sin cliente ni RTN (~200 B). |
| **D. Testigos** | Resumen de las ventas depuradas | Se conservan las últimas N ventanas (p. ej. 30) y se compactan a un rango `[secuencia mínima, secuencia máxima]` por ventana. Solo protegen contra la reutilización de secuencias y sirven de auditoría local; la evidencia íntegra está en `operaciones_contingencia` (PostgreSQL), con payload y hash. |
| **E. Catálogo y ventana** | `ventana['activa']` | Un solo valor que ya se reemplaza en cada renovación. Una ventana vencida se puede borrar cuando no queda ninguna operación de clase A o B que la referencie. |
| **F. Borrador** | Carrito en curso | Debe ser por usuario y empresa (P2-4); se borra al cobrar, al cancelar o al cerrar sesión **solo después de avisar**. No es una venta. |
| **G. Identidad del equipo** | `dispositivo`, `secuencia` | Persisten. Deben ser por empresa (P1-3, P2-1). |

### 5.2 Disparadores de depuración (por evidencia o capacidad, nunca por reloj)

1. Después de una sincronización exitosa con conexión y sesión válida de la misma empresa.
2. Solo para la clase C, en lotes pequeños, cada uno con reconfirmación del servidor dentro del mismo ciclo y borrado en una transacción IndexedDB que **vuelve a leer el estado** antes de borrar. Si cambió, no se borra.
3. Con un tope de capacidad: si las clases B y C superan un umbral (p. ej. 2 000 operaciones o 10 MiB), se depura la clase C hasta volver al 50 % del umbral. La clase A nunca cuenta para el tope.
4. Nunca sin conexión, nunca con una sesión de otra empresa o de otro usuario que no sea ADMIN de la misma empresa, y nunca si la reconfirmación falla.

### 5.3 Capacidad y alertas

- Al montar la página y tras cada venta: `navigator.storage.estimate()`.
  - **Aviso** si quedan menos de 200 MiB libres o el uso supera el 70 % de la cuota.
  - **Bloqueo preventivo** de nuevas ventas de contingencia si quedan menos de 50 MiB, con el mensaje «Exporte el diario y avise al administrador». Es mejor que descubrir la cuota en pleno cobro.
- `navigator.storage.persist()` al preparar la contingencia (registro del equipo). Si devuelve `false`: aviso permanente en la cabecera y registro en el servidor (latido) para que el administrador lo vea. El encendido en producción exige `persisted() === true` en la caja (ver §7).

### 5.4 Respaldos: qué es cada cosa

| Capa | Qué contiene | Quién lo garantiza | Estado |
|---|---|---|---|
| **Datos locales de contingencia** (IndexedDB) | Ventas cobradas sin conexión hasta que el servidor las confirma, más el catálogo de la ventana | El navegador del equipo; durabilidad estricta del alta; exportación manual del diario | Implementado; sin `persist()` (P1-1). **No es un respaldo**: es un búfer de tránsito. |
| **Datos persistidos** (PostgreSQL en Supabase) | Fuente de verdad: ventas, `operaciones_contingencia` con payload y hash, auditoría | API (Render) + Supabase | En uso en el piloto; sin aceptación del cliente |
| **Respaldos de base de datos** | Copias de PostgreSQL: copias o PITR de Supabase según el plan, y el worker FS-41 (`pg_dump` + Restic cifrado en un destino externo) | Infraestructura | **No certificado**: plan, PITR, retención y destino FS-41 pendientes (D4, D6 de `PLAN_EJECUCION_PENDIENTES_20261102.md`) |
| **Recuperación ante desastres** | Restaurar en una base aislada, conciliar por empresa y medir RPO/RTO | Infraestructura + dueño | **No ensayada** con datos representativos (E5) |

Reglas: (1) el diario exportado no reemplaza un respaldo del servidor, solo cubre el tramo «cobrado y no sincronizado»; (2) un respaldo del servidor no cubre ventas que nunca llegaron al servidor; (3) el RPO real de una ferretería en contingencia = RPO de la base + todo lo que siga en los equipos sin sincronizar. Por eso el latido (P2-3) y el panel de pendientes son parte de la recuperación.

---

## 6. Requisitos de seguridad

| ID | Requisito | Hallazgo que cubre |
|---|---|---|
| S-1 | El almacén local se separa por empresa: base `ferresystem-contingencia:<tenantId>` o `tenantId` obligatorio en cada registro, con índice y filtro en todas las lecturas. La migración de la versión 1 asigna las operaciones existentes a la empresa de la ventana que las emitió y nunca descarta registros sin asignar: los deja en cuarentena visible. | P1-3, P2-1 |
| S-2 | Lectura local por rol: CAJERO ve y reimprime solo sus operaciones; ADMIN de la misma empresa ve todas; VENDEDOR sin ventana no ve el diario (o la ruta deja de admitirlo, en línea con el backend). El contador de pendientes muestra el total de la empresa sin detalle. | P1-4 |
| S-3 | `puedeEnviar` exige también que la empresa de la operación sea la de la sesión ⟶ Codex. | P2-2 |
| S-4 | El cambio de usuario o de empresa conserva las clases A y B y avisa «Hay N ventas de otro usuario o empresa en este equipo»; nunca las borra ni las envía con otra identidad. | P1-3, P2-4 |
| S-5 | El cierre de sesión con pendientes exige una confirmación fuerte y no borra el diario (ya se cumple el no borrado). | — |
| S-6 | La recuperación tras cerrar el navegador sigue exigiendo un token presente, la misma empresa y usuario y una ventana vigente (ya se cumple). Además, debe aceptar 502, 503 y 504 sin cuerpo de la aplicación como «servidor no disponible» para abrir la contingencia, **nunca** 401 ni 403. | P1-2 |
| S-7 | La exportación del diario incluye un hash SHA-256 del contenido y avisa de que contiene datos personales. El administrador puede reimportarla al servidor sin pasar por el equipo (diseño pendiente). | P2-5 |
| S-8 | Protección frente a modificaciones accidentales: se mantiene la inmutabilidad de la carga, el UUID emitido por HMAC y el recálculo en el servidor. Ningún botón de la interfaz borra registros de clase A. | — |
| S-9 | Las pestañas siguen con una sola operadora (`navigator.locks`); la depuración (§5.2) corre solo en la pestaña operadora. | — |
| S-10 | El latido reporta pendientes por empresa, el estado de `persisted()`, el uso y la cuota, sin datos personales. | P1-1, P2-3 |

---

## 7. Recomendaciones de implementación priorizadas

Sin solaparse con Codex: las filas marcadas ⟶ Codex se le entregan como requisito y no se implementan en paralelo.

| Prioridad | Acción | Archivos probables | Dependencia |
|---|---|---|---|
| 1 | `persist()` + `estimate()` con aviso y bloqueo preventivo (§5.3) | nuevo `frontend/src/offline/capacidad.ts`, `PosContingenciaPage.tsx` | Ninguna |
| 2 | Recuperación de sesión ante 502/503/504 (S-6) | `frontend/src/utils/sessionValidation.ts` + prueba en `e2e/session-*` | Ninguna |
| 3 | Filtro por rol y por usuario en la lista y la reimpresión (S-2); revisar VENDEDOR en `App.tsx:203` | `PosContingenciaPage.tsx`, `App.tsx` | Decisión de producto sobre VENDEDOR |
| 4 | Separación por empresa del almacén (S-1) con migración de versión de IndexedDB y prueba de `onblocked` | `frontend/src/offline/db.ts`, `ventana.ts` ⟶ coordinar con Codex por `journal.ts` | Después de que Codex integre su cambio |
| 5 | Latido periódico con pendientes, persistencia y cuota (S-10, P2-3) | `PosContingenciaPage.tsx`, nuevo cliente; el backend ya tiene el endpoint | 1 |
| 6 | Retención por evidencia (§5.1-5.2): clases C y D, reconfirmación y testigos | nuevo `frontend/src/offline/retencion.ts`; lectura por índice en lugar de `getAll` ⟶ Codex (`journal.ts`) | 4 |
| 7 | Borrador por usuario y empresa (P2-4) | `ventana.ts`, `PosContingenciaPage.tsx` | 4 |
| 8 | Exportación con hash y aviso (S-7) | `journal.ts` ⟶ Codex | — |
| 9 | Mensaje claro al agotar los identificadores (P2-6) ⟶ Codex; caché de fuentes (P2-8) | `journal.ts`, `sw.js` | — |

Para el backend no se proponen cambios de esquema. La reimportación del diario por el administrador (S-7) necesitaría un diseño y, si toca el esquema, revisión de NEXUS.

---

## 8. Criterios de aceptación para producción (si se enciende la contingencia)

Todos se verifican por SHA y con evidencia ejecutada; el verde de un SHA anterior no cuenta.

1. **Durabilidad:** en la caja real, `navigator.storage.persisted() === true` registrado en el servidor; navegador sin incógnito ni limpieza al cerrar; PWA instalada o Chrome/Edge de escritorio.
2. **Cuota:** prueba E2E con cuota forzada que demuestre el aviso al 70 %, el bloqueo preventivo con menos de 50 MiB y el rechazo correcto con `QuotaExceededError` (este último ya existe).
3. **Disponibilidad parcial:** E2E que recarga `/pos-contingencia` con `/auth/me` respondiendo 503 y 502 y abre la contingencia con la ventana vigente; con 401 o 403 **no** la abre.
4. **Aislamiento:** E2E con dos empresas y tres roles en el mismo navegador: nadie ve, reimprime ni envía operaciones de otra empresa; un CAJERO no ve las de otro cajero; el ADMIN de la misma empresa sí.
5. **Retención:** prueba que demuestre que las clases A y B nunca se borran (ni con cuota agotada, ni al cerrar sesión, ni al cambiar de empresa) y que la clase C solo se borra tras la reconfirmación del servidor; prueba de carga con 5 000 operaciones y un cobro por debajo de 300 ms en el equipo objetivo.
6. **Visibilidad:** el panel del administrador muestra pendientes por equipo actualizados por el latido en un máximo de 5 minutos (`MINUTOS_SIN_CONTACTO`), también cuando las pendientes son de otro cajero.
7. **Respaldo y recuperación:** respaldo del servidor certificado (D4/D6) y restauración cronometrada (E5) con RPO/RTO aceptados por el dueño; procedimiento escrito para recuperar un diario exportado.
8. **Suite completa:** `e2e-real/contingencia-real.spec.ts` (16 casos) y las 16 integraciones PostgreSQL de contingencia en verde sobre el SHA candidato, más las unitarias y simuladas citadas en §1.
9. **Aceptación del cliente:** ensayo físico de corte de internet y de API en la ferretería, con cierre de caja conciliado. Los tests, el merge y el despliegue no equivalen a aceptación.

---

## 9. Bitácora de esta auditoría

- 2026-11-04: lectura de `AGENTS.md` y del contexto vigente; `fetch` de `main` (`20f356c`) y de `docs/plan-ejecucion-20261102` (`03592be`, solo documentos sobre `main`). Lectura de `frontend/src/offline/*`, `useConexion.ts`, `PosContingenciaPage.tsx`, `sessionValidation.ts`, `ProtectedRoute.tsx`, `authInterceptors.ts`, `TenantContext.tsx`, `sw.js`, `main.tsx`, `App.tsx`, `backend/src/contingencia/*`, `backend/src/auth/jwt.strategy.ts` y `docs/FS-41-RESPALDOS.md`.
- Ejecutado: 45/45 unitarias y 20/20 E2E simulados (§1); mediciones de tamaño, `persist()`, `getAll` y cuota en Chromium (§2.1).
- No se modificaron `sync.ts`, `journal.ts` ni `useConexion.ts`, ni ningún archivo de producto. Sin despliegues, merges, bases reales ni ramas nuevas.
