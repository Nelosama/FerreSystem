# Cobro y entrega — diseño técnico (variante B aprobada conceptualmente)

_Informe de **ATLAS** (POS y continuidad operativa). Diseño, sin implementación. No modifica ventas abiertas, no ejecuta migraciones y no se fusiona a `main`._

Base verificada en código: `claude/integracion-pos-offline-p1` (PR #129), HEAD `ebf6eec2`.

Contratos para KARDEX, CENTINELA y BALANCE: `docs/POS_ENTREGA_CONTRATOS.md`.

---

## 0. Resumen

- **Mostrador (por defecto):** el cajero cobra y entrega en el mismo paso. El stock baja en la misma transacción del cobro. Sin reserva. Sin pantalla extra.
- **Bodega o pedido (excepción marcada):** el cajero cobra y deja la mercancía en bodega. El stock queda **reservado**. La entrega se confirma después, por una persona autorizada, con receptor.
- **Ninguna venta pagada se cancela automáticamente.** Solo hay alertas. Liberar una reserva exige una acción humana con motivo y auditoría.
- **Cada descuento de existencias tiene exactamente una causa y está protegido por restricciones de base de datos**, no solo por código (sección 5).
- **Offline:** solo mostrador. La mercancía de bodega no se vende sin conexión.

---

## 1. Estado actual (línea base)

| Elemento | Situación verificada |
|---|---|
| Venta | `POST /ventas` crea la venta `COMPLETADA`, reserva **todas** las líneas con inventario (`stockReservado += cantidad`) y marca `reserva_pendiente = true`. `ventas.service.ts` líneas ~213–275. |
| Entrega | `POST /operaciones/ventas/:id/entregar`, roles ADMIN, CAJERO, BODEGUERO. Descuenta `stockActual` y `stockReservado`, registra `ENTREGA`, fija `entregado_at` y `entregado_por`. Idempotente por `entregado_at`. `operaciones.service.ts` líneas ~245–262. |
| Devolución | `POST /operaciones/ventas/:id/devoluciones`, rol ADMIN. Con destino `NO_ENTREGADO` libera solo `stockReservado`. Con destino `INVENTARIO` devuelve stock físico. |
| Contingencia | Venta offline: descuento inmediato al sincronizar (`movimiento ENTREGA` con `documento = ventaId`), `reserva_pendiente = false`. |
| Trazabilidad | `ventas.usuario_id` (cobro), `entregado_por` (confirmación). **No hay receptor.** |
| Movimientos | `movimientos_inventario` tiene `documento_id`, pero **no** referencia la línea de venta. |
| Líneas de venta | `detalles_venta` no tiene campos de entrega ni de reserva por línea. |
| Anulación | No existe anulación de ventas pagadas. |
| Lista de entregas | `GET /operaciones/entregas`: ventas completadas sin `entregado_at` con mercancía pendiente. No muestra antigüedad ni alertas. |

**Problemas que el diseño debe resolver:**
1. La reserva es por venta completa, no por línea. No se puede saber qué parte está en bodega.
2. `entregar` acepta confirmaciones de cualquier usuario del tenant sobre cualquier venta.
3. No hay receptor ni trazabilidad por línea.
4. La reserva bloquea ventas posteriores (`disponible = stockActual − stockReservado`) sin límite de tiempo.

---

## 2. Modelo de estados por línea

La unidad de control pasa de **venta** a **línea de venta**. Una venta puede tener líneas de mostrador y líneas de bodega.

### 2.1 Modo de entrega (fijado al cobrar)

| Valor | Significado | Stock al cobrar |
|---|---|---|
| `MOSTRADOR` | Se entrega en el momento del cobro | Descuenta `stockActual` (movimiento `ENTREGA`) |
| `BODEGA` | Se entregará después | Reserva `stockReservado` |
| `SIN_INVENTARIO` | Venta sin inventario existente (flujo actual `sinInventario`) | Sin efecto de stock |

### 2.2 Estado de entrega (por línea)

```
MOSTRADOR:  ENTREGADA (inmediato, al cobrar)
BODEGA:     PENDIENTE ──preparar──▶ LISTA ──entregar──▶ ENTREGADA
                │                     │
                └──── devolver ───────┴──▶ DEVUELTA_NO_ENTREGADA (libera reserva)
ENTREGADA ──devolver (con retorno físico)──▶ DEVUELTA (reingresa stock)
```

- **PENDIENTE:** en bodega, sin preparar. Reservado.
- **LISTA:** el bodeguero la preparó y la separó. Sigue reservada. Opcional (decisión P3).
- **ENTREGADA:** salió del local. Stock físico descontado una vez.
- **DEVUELTA_NO_ENTREGADA:** cancelada antes de salir. Libera la reserva; el stock físico no cambió.
- **DEVUELTA:** salió y volvió. Se reingresa el stock.

### 2.3 Regla central

> **Evitar marcar como entregada mercancía que sigue en bodega:** una línea `BODEGA` solo puede pasar a `ENTREGADA` mediante la acción de entrega, que exige receptor y responsable, y que descuenta stock en la misma transacción. Ningún otro proceso (sincronización, cobro, reporte, reintento) puede cambiar el estado a `ENTREGADA`.

Esto cierra el riesgo actual donde `entregar` marca la venta completa sin distinguir si la mercancía salió.

---

## 3. Flujos

### 3.1 Flujo A — Mostrador (entrega inmediata)

**Pasos del cajero:** 1) seleccionar productos; 2) cobrar en efectivo o tarjeta (modo por defecto `MOSTRADOR`); 3) entregar la mercancía. El comprobante dice «Entregado en mostrador».

**Efectos en una sola transacción (`lockTenant` + `FOR UPDATE` del producto):**
- Crear `ventas` `COMPLETADA`, con `usuario_id` = cajero.
- Por cada línea: `stockActual −= cantidad` (con condición `stockActual >= cantidad`); movimiento `ENTREGA` con `detalle_venta_id`; línea `ENTREGADA`; evento `ENTREGADA` con `usuario_id` = cajero y `receptor` = cliente (nombre opcional).
- Caja: movimiento de cobro, como hoy.

**Si no hay existencias suficientes:** el cobro se rechaza con «Sin existencias en mostrador; use Dejar en bodega si la mercancía está en bodega». No se reserva en silencio.

**Pantalla:** sin cambios de pasos. El botón «Cobrar y entregar» es el principal. La opción «Dejar en bodega» aparece como botón secundario.

### 3.2 Flujo B — Bodega o pedido (entrega diferida)

**Cobro (cajero):** 1) seleccionar productos; 2) pulsar «Cobrar y dejar en bodega»; 3) el sistema muestra el número de venta y el comprobante con la leyenda «PENDIENTE DE ENTREGA — recoger en bodega». **No pide receptor al cobrar.**

**Efectos en una transacción:**
- Crear `ventas` `COMPLETADA`, con `usuario_id` = cajero.
- Por cada línea: `stockReservado += cantidad` (CAS como hoy); línea `PENDIENTE`; evento `COBRADA_PARA_BODEGA`.
- Caja: movimiento de cobro.

**Preparación (bodeguero, opcional por decisión P3):** `PENDIENTE → LISTA`. Evento `PREPARADA` con `usuario_id` = bodeguero. Sin cambio de stock.

**Entrega (bodeguero o ADMIN; cajero solo de sus propias ventas, decisión P3):**
- Requiere **receptor**: nombre (obligatorio). Documento de identidad (decisión P4).
- Por cada línea entregada: `stockActual −= cantidad_entregada`; `stockReservado −= cantidad_entregada`; movimiento `ENTREGA` con `detalle_venta_id`; línea `ENTREGADA` (o parcial); evento `ENTREGADA` con responsable y receptor.
- Entrega parcial permitida: cada evento lleva su cantidad.

**Cancelación de un pedido (solo ADMIN, con motivo):** `PENDIENTE|LISTA → DEVUELTA_NO_ENTREGADA`. Libera `stockReservado`. No cambia `stockActual`. Evento `RESERVA_LIBERADA` con motivo. **No devuelve dinero automáticamente**: el reembolso sigue el proceso de devolución existente.

### 3.3 Flujo C — Contingencia offline

- **Solo mostrador.** El DTO offline acepta líneas `MOSTRADOR` y rechaza `BODEGA` con error de validación.
- El descuento de stock ocurre al sincronizar, una vez por `operacionId` (ya existe como clave única).
- Al sincronizar, el evento `ENTREGADA` lleva `usuario_id` del cajero de la operación y la hora local del cobro.

### 3.4 Devoluciones

| Situación | Efecto en stock | Efecto en reserva |
|---|---|---|
| Línea `PENDIENTE` o `LISTA`, devolución `NO_ENTREGADO` | Ninguno | `stockReservado −= cantidad` |
| Línea `ENTREGADA`, devolución con retorno físico (`INVENTARIO`) | `stockActual += cantidad` (movimiento `INGRESO`) | Ninguno |
| Línea `ENTREGADA`, devolución `DAÑADO` o `PROVEEDOR` | Ninguno | Ninguno |
| Línea `ENTREGADA`, devolución marcada `NO_ENTREGADO` | **Rechazada** (regla actual: ya salió) | — |

Cada devolución actualiza el estado de la línea en la misma transacción. Una línea ya `DEVUELTA` o `DEVUELTA_NO_ENTREGADA` no acepta otra devolución.

### 3.5 Entrega duplicada o concurrente

- Cada acción tiene `solicitud_id` (UUID) con restricción única por tenant. Un reintento con el mismo `solicitud_id` devuelve el resultado original.
- Dos acciones distintas sobre la misma línea compiten por `FOR UPDATE`. La segunda ve el estado ya cambiado y falla con conflicto, sin tocar stock.

---

## 4. Trazabilidad

| Dato | Dónde se guarda | Obligatorio |
|---|---|---|
| Cajero que cobró | `ventas.usuario_id` (existe) | Sí |
| Modo de entrega por línea | `detalles_venta.modo_entrega` (nuevo) | Sí |
| Responsable de cada evento | `entregas_eventos.usuario_id` (nuevo) | Sí |
| Receptor (nombre) | `entregas_eventos.receptor_nombre` (nuevo) | Sí en `ENTREGADA` de bodega; opcional en mostrador |
| Receptor (documento) | `entregas_eventos.receptor_documento` (nuevo) | Decisión P4 |
| Motivo de liberación de reserva | `entregas_eventos.motivo` | Sí en `RESERVA_LIBERADA` |
| Hora del evento | `entregas_eventos.created_at` | Sí |
| Dispositivo y origen (online/offline) | `entregas_eventos.origen`, `dispositivo_id` | Sí |

**Eventos inmutables:** `entregas_eventos` es solo de inserción. Un trigger impide `UPDATE` y `DELETE`, igual que `operaciones_contingencia`.

**Datos personales:** el documento de identidad y el teléfono del receptor son datos personales. Se guarda el mínimo necesario. Requiere revisión legal (P4).

---

## 5. Garantías: sin doble descuento ni doble reserva

| # | Garantía | Mecanismo |
|---|---|---|
| G1 | Un descuento `ENTREGA` por línea y por evento | Índice único parcial en `movimientos_inventario (documento_id, detalle_venta_id)` donde `tipo = 'ENTREGA'`. La base rechaza el segundo. |
| G2 | Una reserva por línea | Reserva creada solo al cobrar (`BODEGA`). Liberada solo por transición `PENDIENTE|LISTA → DEVUELTA_NO_ENTREGADO`, que cambia el estado y no puede repetirse. |
| G3 | Reintentos idempotentes | `solicitud_id` único por tenant en `entregas_eventos`. |
| G4 | Sin transiciones fuera de orden | Compare-and-set del estado de línea dentro de la transacción (`UPDATE ... WHERE estado = $esperado`). |
| G5 | Sin sobreventa en mostrador | Condición `stockActual >= cantidad` en el mismo `UPDATE` que descuenta. |
| G6 | Sincronización sin duplicados | `operacionId` único (existente) y solo modo `MOSTRADOR` en contingencia. |
| G7 | Invariante de reservas | `stockReservado` = Σ cantidades reservadas de líneas `PENDIENTE|LISTA`. Se verifica en pruebas y con un informe de conciliación (`GET /operaciones/conciliacion/existencias`, solo ADMIN). |
| G8 | Invariante de existencias | `stockActual` = inicial + Σ `INGRESO` − Σ `ENTREGA` (con ajustes registrados). Conciliación en el mismo informe. |

Las garantías G1 y G2 no dependen de que el código esté bien escrito: la base de datos las aplica.

---

## 6. Alertas de reservas pendientes (sin cancelaciones automáticas)

**Principio:** nunca se cancela una venta pagada de forma automática. Solo se avisa.

| Nivel | Condición | Canal | Acción permitida |
|---|---|---|---|
| Informativo | Pedido en `PENDIENTE|LISTA` por más de **N1 horas** (propuesta: 2 h) | Contador en la pestaña Entregas | Ninguna |
| Aviso | Más de **N2 horas** (propuesta: 24 h) | Aviso al cajero que cobró al iniciar sesión | Ver y entregar |
| Escalamiento | Más de **N3 días** (propuesta: 3 días) | Resumen diario a ADMIN (panel móvil) | Entregar o liberar reserva con motivo |

- Las alertas se calculan en consulta (`GET /operaciones/entregas/alertas`), sin proceso en segundo plano en esta fase.
- El resumen para ADMIN reutiliza el panel móvil existente.
- La liberación de una reserva requiere ADMIN, motivo de al menos 10 caracteres y registro en `entregas_eventos`.
- **Nunca** hay un proceso que libere reservas por tiempo. La caducidad automática (opción D) queda fuera.

---

## 7. Cambios necesarios por capa

### 7.1 Base de datos (migración aditiva — no ejecutada)

Nueva migración, por ejemplo `20261012000000_entrega_mostrador_bodega`:

1. `detalles_venta`: `modo_entrega TEXT NOT NULL DEFAULT 'BODEGA'` (ver nota de compatibilidad), `estado_entrega TEXT NOT NULL DEFAULT 'PENDIENTE'`, `cantidad_entregada NUMERIC(12,2) NOT NULL DEFAULT 0`, `cantidad_devuelta NUMERIC(12,2) NOT NULL DEFAULT 0`. Check: `cantidad_entregada + cantidad_devuelta <= cantidad`.
2. `movimientos_inventario`: `detalle_venta_id TEXT NULL` y el índice único parcial del punto G1.
3. Tabla `entregas_eventos` con los campos de la sección 4, `UNIQUE (tenant_id, solicitud_id)`, trigger de inmutabilidad, índices por `(tenant_id, venta_id)` y `(tenant_id, created_at)`.
4. Sin reescritura de datos. Las ventas abiertas existentes no se modifican en esta migración (ver §9, P6).

**Nota de compatibilidad:** el valor por defecto de `modo_entrega` debe ser `BODEGA` para que las ventas existentes conserven su comportamiento de reserva. Las líneas nuevas que envíe el POS llevarán `MOSTRADOR` explícito.

**Restricción de cambio de modo:** `modo_entrega` no puede cambiar después del cobro. Un trigger lo impide.

### 7.2 Backend

| Archivo | Cambio |
|---|---|
| `ventas/dto` | Línea de venta acepta `modoEntrega: 'MOSTRADOR' \| 'BODEGA'` (opcional; por defecto `BODEGA` mientras el POS no lo envíe). |
| `ventas/ventas.service.ts` | `create`: en `MOSTRADOR`, descuenta stock y registra `ENTREGA` en la misma transacción; en `BODEGA`, reserva como hoy. Registra `entregas_eventos` `COBRADA_*`. |
| `operaciones/operaciones.service.ts` | Reemplazar `entregar` por `entregarLineas(ventaId, {solicitudId, receptor, lineas: [{detalleId, cantidad}]})`. Mantener `entregar` como envoltorio de compatibilidad (entrega todas las líneas `BODEGA` pendientes). Añadir `preparar`, `liberarReserva` (ADMIN). Ajustar `devolver` a la tabla de §3.4. |
| `operaciones/operaciones.controller.ts` | Rutas nuevas: `POST /operaciones/ventas/:id/entregas`, `POST /operaciones/ventas/:id/preparacion`, `POST /operaciones/ventas/:id/liberar-reserva`, `GET /operaciones/entregas/alertas`, `GET /operaciones/conciliacion/existencias`. |
| `contingencia/contingencia.service.ts` | Rechaza líneas `BODEGA` en el lote. Eventos `ENTREGADA` por operación. |
| `contingencia/dto` | `modoEntrega` solo admite `MOSTRADOR`. |
| `operaciones/ledger.ts` | `movement` acepta `detalleVentaId`. |

### 7.3 Frontend

| Pantalla | Cambio |
|---|---|
| `POSPage.tsx` | Botón principal «Cobrar y entregar» (mostrador). Botón secundario «Cobrar y dejar en bodega». Un solo clic. Sin campos adicionales al cobrar. Mensaje claro si no hay existencias en mostrador. |
| Comprobante (POS y contingencia) | Leyenda «Entregado en mostrador» o «PENDIENTE DE ENTREGA — recoger en bodega». Número de venta visible para retirar. |
| `OperacionesPage.tsx` (pestaña Entregas) | Renombrar a «Pedidos por entregar». Mostrar antigüedad con color (informativo, aviso, escalamiento). Botón «Entregar» abre un formulario con **nombre del receptor** (obligatorio) y casilla «Recibe el cliente». Botón «Preparar» para bodega. |
| Admin móvil | Tarjeta «Reservas pendientes» con total y más antiguo. Acción «Liberar reserva» con motivo. |
| Contingencia (`PosContingenciaPage.tsx`) | Sin cambios de flujo: solo mostrador. |

**Principio de sencillez:** el cajero nunca ve el formulario de receptor en mostrador. Solo aparece cuando la mercancía sale de bodega.

### 7.4 Pruebas

Ver §8.

---

## 8. Plan de pruebas para FARO

Cada prueba tiene un identificador. Los niveles son: **U** unitaria, **I** integración PostgreSQL real, **S** E2E con backend simulado, **R** E2E real, **F** físico.

| ID | Prueba | Nivel | Garantía |
|---|---|---|---|
| T01 | Cobro en mostrador descuenta stock una vez y registra `ENTREGA` con `detalle_venta_id` | I | G5, G1 |
| T02 | Cobro en mostrador sin existencias: rechazo, sin venta, sin movimiento, sin caja | I | G5 |
| T03 | Cobro en bodega reserva, no descuenta; la línea queda `PENDIENTE` | I | G2 |
| T04 | Entrega parcial de bodega: stock y reserva bajan por la cantidad entregada; estado parcial | I | G4 |
| T05 | Entrega total de bodega: reserva a cero, `ENTREGADA`, evento con responsable y receptor | I | G1, G4 |
| T06 | Entrega sin receptor: rechazo | I | Trazabilidad |
| T07 | Entrega repetida con el mismo `solicitud_id`: mismo resultado, un movimiento | I | G3 |
| T08 | Entregas simultáneas de la misma línea (3 hilos): un descuento | I | G1, G4 |
| T09 | Intento de `ENTREGA` duplicado directo en SQL: rechazado por índice único | I | G1 (defensa en profundidad) |
| T10 | Preparar y luego entregar: estados correctos; preparar no cambia stock | I | §2 |
| T11 | Liberar reserva (ADMIN, con motivo): reserva baja, stock físico igual, evento registrado | I | G2 |
| T12 | Liberar reserva sin motivo o por CAJERO: rechazo | I | CENTINELA |
| T13 | Liberar reserva de línea ya entregada: rechazo | I | G4 |
| T14 | Devolución `INVENTARIO` de línea entregada: stock sube una vez; devolución repetida rechazada | I | G4 |
| T15 | Devolución `NO_ENTREGADO` de línea entregada: rechazada | I | §3.4 |
| T16 | Devolución parcial de bodega seguida de entrega del resto: totales cuadran | I | G7, G8 |
| T17 | Venta offline con línea `BODEGA`: rechazo de validación, sin registro | I | Offline solo mostrador |
| T18 | Sincronización offline repetida (mismo `operacionId`): un descuento y un evento | I | G6 |
| T19 | Sincronización offline mientras una entrega de bodega ocurre en el servidor: sin interferencia en esa línea | I | G4 |
| T20 | Invariante de reservas tras secuencia aleatoria (semilla fija, 200 operaciones de reservar, entregar, devolver, liberar): `stockReservado` = Σ pendientes | I | G7 |
| T21 | Invariante de existencias tras la misma secuencia: `stockActual` = inicial + ingresos − entregas | I | G8 |
| T22 | Alerta: pedido de más de N1 horas aparece; menos de N1 no aparece | I | §6 |
| T23 | Ninguna venta pagada se cancela por tiempo (simular 30 días, sin intervención): estado y stock intactos | I | §6 |
| T24 | Migración en copia de base con ventas abiertas: ventas y reservas existentes intactas; `modo_entrega = BODEGA` | I (copia) | §7.1 |
| T25 | Permisos: CAJERO entrega solo ventas propias (si se aprueba P3); BODEGUERO no devuelve; VENDEDOR no entrega | I | CENTINELA |
| T26 | Aislamiento entre empresas en entregas, alertas y conciliación | I | Aislamiento |
| T27 | Flujo mostrador completo en UI: un clic de cobro, sin campos extra | S | Sencillez |
| T28 | Flujo bodega completo en UI: cobro, lista, entrega con receptor, estados visibles | S | Sencillez |
| T29 | Alertas visibles en pestaña Entregas y en admin móvil a 390 px | S | Alertas |
| T30 | Reintento de entrega tras cortar la respuesta de red: un solo descuento | S | G3 |
| T31 | Flujo real completo con backend y PostgreSQL reales (cobro mostrador, cobro bodega, entrega, devolución, conciliación) | R | Integración |
| T32 | Comprobante de bodega muestra la leyenda correcta y el número para retirar | U + R | Trazabilidad |
| T33 | Mutación: quitar el índice único o el compare-and-set debe hacer fallar T08/T09 | I (mutación) | Prueba de la prueba |
| T34 | Mutación: permitir `ENTREGA` en contingencia para línea `BODEGA` debe hacer fallar T17 | I (mutación) | |
| F01 | Impresora térmica: comprobante de mostrador y de bodega legible en 58 y 80 mm | F | C1–C2 |
| F02 | Entrega real con receptor en iPhone (Safari, panel admin) | F | Usabilidad |

**Criterio de entrada:** T01–T23 y T33–T34 automatizadas y verdes; T24 en copia con informe firmado; F01–F02 con hardware.

---

## 9. Decisiones pendientes

| ID | Decisión | Opciones | Recomendación de ATLAS | Responsable |
|---|---|---|---|---|
| P1 | Confirmar el modo por defecto `MOSTRADOR` en el POS | Sí / No | Sí | Dueño |
| P2 | ¿Existe stock de bodega separado de mostrador? | (a) Un solo stock con modo por línea (diseño actual); (b) dos ubicaciones | (a) para esta fase; (b) requiere rediseño de KARDEX | Dueño, KARDEX |
| P3 | ¿Quién confirma la entrega de bodega? ¿Hace falta preparación? | Bodeguero / ADMIN / cajero propio; preparación obligatoria u opcional | BODEGUERO o ADMIN; cajero solo sus ventas; preparación opcional | Dueño, CENTINELA |
| P4 | Datos del receptor | Solo nombre / nombre y documento / nombre y teléfono | Nombre obligatorio; documento solo si el dueño lo exige; revisión legal antes de guardar documento | Dueño, legal |
| P5 | Umbrales de alerta | N1, N2, N3 | 2 h, 24 h, 3 días | Dueño |
| P6 | Tratamiento de las ventas abiertas hoy | (a) Dejarlas como están hasta decisión; (b) marcarlas `BODEGA` en migración; (c) entregarlas o cancelarlas con responsable | (a) ahora; luego (b) con inventario físico previo | Dueño, KARDEX, BALANCE |
| P7 | Reembolso al liberar una reserva | Automático / devolución formal | Devolución formal (proceso actual) | Dueño, BALANCE |
| P8 | Reconocimiento de ingreso | Al cobro / al entregar | Al cobro (ya es así); confirmar | BALANCE |
| P9 | Venta sin inventario (`sinInventario`) | Sin cambio / incorporarla al modelo | Sin cambio en esta fase | Dueño |
| P10 | Autorizar la migración aditiva | Sí / No | Después de revisar T24 en copia | Dueño, FARO |
| P11 | Caducidad automática de reservas | No / Sí | No (fuera de alcance; contraria a la regla de no cancelar pagadas) | Dueño |

---

## 10. Riesgos residuales

| Riesgo | Mitigación |
|---|---|
| Cajero marca mostrador sin entregar | Reporte diario por cajero (ventas contra entregas); el cajero es responsable del cobro. |
| Mercancía de bodega cobrada como mostrador | El cobro en mostrador rechaza sin existencias en mostrador; no hay ubicación separada en esta fase (P2). |
| Datos personales del receptor | Mínimo necesario; revisión legal (P4). |
| Reservas que siguen abiertas tras la migración | Informe de pedidos abiertos antes de la migración; decisión P6. |
| Un cliente reclama mercancía no recibida | Evento con receptor y hora; el dueño decide liberar con motivo. |
| Crecimiento de `entregas_eventos` | Índices por tenant y fecha; sin límite de retención definido. |

---

## 11. Coordinación (contratos)

Los contratos están en `docs/POS_ENTREGA_CONTRATOS.md`:

- **KARDEX:** eventos de movimiento, invariantes G7 y G8, fórmula de disponible.
- **CENTINELA:** matriz de permisos, reglas de sesión y sincronización offline.
- **BALANCE:** efectos en caja, ingresos y reportes.

**Estado:** solicitudes enviadas en documento. No hay validación de otros agentes en esta ronda. Cada contrato indica qué debe confirmar cada agente antes de implementar.

---

## 12. Próximos pasos (sin implementar hasta aprobación)

1. Dueño resuelve P1–P5 y P7–P9.
2. KARDEX, CENTINELA y BALANCE validan sus contratos.
3. FARO escribe T01–T34 en rojo.
4. ATLAS implementa en una rama aparte, con migración en copia (T24).
5. Revisión conjunta antes de cualquier merge.

_Sin merge. Sin migración productiva. Sin cambio a ventas abiertas._
