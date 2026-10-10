# Contratos de cobro y entrega — para validación de KARDEX, CENTINELA y BALANCE

_Informe de **ATLAS**. Estos contratos describen lo que ATLAS necesita de cada área y lo que ATLAS entrega. Ninguna área ha validado todavía. Cada área debe responder en la sección «Validación» antes de implementar._

Diseño general: `docs/POS_ENTREGA_DISENO_TECNICO.md`.

---

## 1. Contrato con KARDEX (inventario y existencias)

### 1.1 Eventos que ATLAS emite

Cada evento es un movimiento en `movimientos_inventario` con los campos existentes más `detalle_venta_id` (nuevo).

| Evento | `tipo` | Cantidad (firmada) | `documento_id` | `detalle_venta_id` | Efecto en `stockActual` | Efecto en `stockReservado` | Cuándo |
|---|---|---|---|---|---|---|---|
| Venta de mostrador | `ENTREGA` | `−cantidad` | `ventaId` | Sí | `−cantidad` | — | Al cobrar (`MOSTRADOR`) |
| Venta de contingencia sincronizada | `ENTREGA` | `−cantidad` | `ventaId` | Sí | `−cantidad` | — | Al sincronizar (una vez por `operacionId`) |
| Pedido de bodega cobrado | (sin movimiento de stock) | — | — | — | — | `+cantidad` | Al cobrar (`BODEGA`) |
| Preparación de pedido | (sin movimiento de stock) | — | — | — | — | — | Cambio de estado de línea |
| Entrega de pedido | `ENTREGA` | `−cantidad_entregada` | `ventaId` | Sí | `−cantidad_entregada` | `−cantidad_entregada` | Al entregar |
| Liberación de reserva (ADMIN) | (sin movimiento de stock) | — | — | — | — | `−cantidad` | Con motivo |
| Devolución con retorno físico | `INGRESO` | `+cantidad` | `devolucionId` | Sí | `+cantidad` | — | Al devolver |
| Devolución de reserva no entregada | (sin movimiento de stock) | — | — | — | — | `−cantidad` | Al devolver `NO_ENTREGADO` |

**Nota:** la liberación de reserva y la devolución de reserva no entregada no son movimientos de stock. Son cambios de reserva. KARDEX debe confirmar si quiere una bitácora separada para reservas. ATLAS propone registrarlas en `entregas_eventos` (y no en `movimientos_inventario`) para no alterar el significado del libro de movimientos.

### 1.2 Invariantes que ATLAS garantiza y que KARDEX debe verificar

| ID | Invariante | Verificación |
|---|---|---|
| G7 | `stockReservado` = Σ cantidades de líneas `BODEGA` en estado `PENDIENTE` o `LISTA` (menos entregadas y devueltas) | Informe de conciliación y prueba T20 |
| G8 | `stockActual` = inicial + Σ `INGRESO` − Σ `ENTREGA` ± `AJUSTE` registrados | Informe de conciliación y prueba T21 |
| G1 | Como máximo un `ENTREGA` por (`documento_id`, `detalle_venta_id`) | Índice único parcial (prueba T09) |

### 1.3 Preguntas para KARDEX

1. **Disponible:** ¿se mantiene `disponible = stockActual − stockReservado`? ¿Debe el disponible excluir reservas de pedidos vencidos? (ATLAS propone que no; las alertas avisan).
2. **Existencias negativas:** la regla actual impide existencias negativas en venta. ¿Se mantiene para entregas de bodega? (ATLAS propone sí).
3. **Movimientos de reserva:** ¿bitácora separada o `entregas_eventos`? (propuesta: `entregas_eventos`).
4. **Cambio de modo:** ¿es correcto que `modo_entrega` no pueda cambiar después del cobro?
5. **Ventas abiertas (P6):** ¿cómo se concilian las reservas abiertas antes de la migración? (propuesta: informe de pedidos abiertos; sin cambio automático).
6. **Costo:** el movimiento `ENTREGA` no modifica costo. ¿Es correcto para la valuación?

### 1.4 Validación de KARDEX

| Punto | Acepta | Observación |
|---|---|---|
| 1.1 Eventos | ☐ | |
| 1.2 Invariantes | ☐ | |
| 1.3 Preguntas 1–6 | ☐ | |

---

## 2. Contrato con CENTINELA (seguridad, sesiones y permisos)

### 2.1 Matriz de permisos propuesta

| Acción | ADMIN | CAJERO | VENDEDOR | BODEGUERO | Regla adicional |
|---|---|---|---|---|---|
| Cobrar en mostrador | ✔ | ✔ | ✔ | — | Con `pos.vender` |
| Cobrar y dejar en bodega | ✔ | ✔ | ✔ | — | Con `pos.vender` |
| Preparar pedido | ✔ | — | — | ✔ | Propuesta P3 |
| Entregar pedido | ✔ | Solo sus ventas (P3) | — | ✔ | Receptor obligatorio |
| Liberar reserva | ✔ | — | — | — | Motivo ≥ 10 caracteres |
| Ver alertas de pedidos | ✔ | ✔ (sus ventas) | — | ✔ | |
| Ver conciliación de existencias | ✔ | — | — | — | Solo lectura |
| Devolver mostrador/bodega | ✔ | Solicitud (flujo actual) | — | — | Sin cambio |
| Línea `BODEGA` en contingencia | Rechazado para todos | | | | Regla del servidor |

### 2.2 Reglas que ATLAS necesita que CENTINELA confirme

1. **Autorización en servidor.** Cada acción valida rol y, cuando aplica, que el cajero sea el de la venta. La pantalla oculta el botón, pero no es la defensa.
2. **Sesión vencida.** Una entrega requiere sesión vigente y en línea. Sin conexión no se entrega mercancía de bodega (regla de offline).
3. **Revocación.** Si un usuario se desactiva, sus entregas pendientes siguen visibles para ADMIN y no se pueden entregar con esa cuenta.
4. **Sincronización offline.** La sincronización solo lleva operaciones de mostrador, con `usuario_id` del cajero que cobró. El sincronizador no puede registrar entregas de bodega ni liberar reservas.
5. **Suplantación del receptor.** El nombre del receptor es texto libre; el sistema registra quién lo capturó (`usuario_id`), no lo verifica.
6. **Datos personales.** El documento del receptor (P4) se guarda cifrado en reposo si se aprueba, o no se guarda.
7. **Inmutabilidad.** `entregas_eventos` no admite `UPDATE` ni `DELETE`, ni siquiera de ADMIN.
8. **Auditoría.** Cada acción queda en `auditoria_operaciones` además del evento.

### 2.3 Preguntas para CENTINELA

1. ¿Debe ADMIN tener permiso para liberar reservas sin segunda aprobación? (propuesta: no, con motivo y registro).
2. ¿Se exige doble confirmación para entregas parciales?
3. ¿Qué tiempo máximo de sesión para una entrega en mostrador?
4. ¿Debe registrarse la IP o el dispositivo de la entrega? (propuesta: dispositivo del POS, ya disponible).

### 2.4 Validación de CENTINELA

| Punto | Acepta | Observación |
|---|---|---|
| 2.1 Matriz | ☐ | |
| 2.2 Reglas 1–8 | ☐ | |
| 2.3 Preguntas 1–4 | ☐ | |

---

## 3. Contrato con BALANCE (procesos financieros y conciliación)

### 3.1 Efectos financieros

| Evento | Caja | Ventas del día | Cuentas por cobrar | Observación |
|---|---|---|---|---|
| Cobro de mostrador | Entrada de efectivo o tarjeta (movimiento de cobro, como hoy) | Sí | No | Entrega y cobro en el mismo acto |
| Cobro de bodega | Entrada de efectivo o tarjeta | Sí | No | Mercancía pendiente; el ingreso ya existe |
| Entrega de bodega | Ninguno | No (ya contabilizado) | No | Solo cambia el estado de la línea |
| Liberación de reserva | Ninguno | Sin cambio | Sin cambio | Reembolso por devolución formal (P7) |
| Devolución con reembolso | Salida de efectivo (flujo actual) | Ajuste según proceso | — | Sin cambio |
| Devolución de mercancía entregada | Ninguno o reembolso | Ajuste según proceso | — | Stock vuelve a inventario |
| Sincronización de contingencia | Ya registrada en caja al cobrar offline | Sin doble conteo | — | Una vez por `operacionId` |

### 3.2 Reportes que deben separar

1. **Ventas cobradas por cajero** (independiente de la entrega).
2. **Entregas registradas por responsable** (quién confirmó la salida).
3. **Pedidos abiertos por antigüedad** (compromisos, no ingreso).
4. **Reservas abiertas por producto** (cifra de KARDEX; BALANCE solo la reporta).

### 3.3 Preguntas para BALANCE

1. **Reconocimiento de ingreso (P8):** ¿al cobro, como hoy? ATLAS propone sí.
2. **Pedidos pagados no entregados:** ¿se reportan como pasivo o solo como compromiso? ¿Hay implicación fiscal en esta decisión? (Pendiente de validación competente; no se trata como fiscalmente aprobado).
3. **Venta de contingencia:** ¿se concilia por `operacionId` y por `correlativo CT` contra la factura central al sincronizar?
4. **Cierre de caja:** ¿el efectivo de pedidos cobrados en bodega cuenta en el cierre del día de cobro? (Propuesta: sí).
5. **Diferencias:** ¿qué tolerancia usar en la conciliación diaria entre cobros y entregas?

### 3.4 Validación de BALANCE

| Punto | Acepta | Observación |
|---|---|---|
| 3.1 Efectos | ☐ | |
| 3.2 Reportes | ☐ | |
| 3.3 Preguntas 1–5 | ☐ | |

---

## 4. Lo que ATLAS entrega a cada área

| Área | Entregable | Estado |
|---|---|---|
| KARDEX | Eventos de movimiento (§1.1), invariantes (§1.2), conciliación por endpoint | Diseñado |
| CENTINELA | Matriz de permisos (§2.1), reglas de sesión y offline (§2.2) | Diseñado |
| BALANCE | Efectos de caja y reportes (§3.1–3.2) | Diseñado |
| FARO | Plan de pruebas T01–T34 (`POS_ENTREGA_DISENO_TECNICO.md` §8) | Diseñado |

## 5. Condición para implementar

ATLAS no implementará hasta que:

1. El dueño decida P1 a P5 y P7 a P9 (`POS_ENTREGA_DISENO_TECNICO.md` §9).
2. KARDEX, CENTINELA y BALANCE completen sus secciones de validación.
3. FARO tenga T01–T23 y T33–T34 escritas y en rojo.

Sin merge. Sin migraciones productivas. Ventas abiertas sin cambios.
