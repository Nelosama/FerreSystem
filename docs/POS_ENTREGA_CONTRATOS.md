# Contratos de cobro y entrega — revisión 2 (para validación de KARDEX, CENTINELA y BALANCE)

_Informe de **ATLAS**. Estos contratos describen lo que ATLAS necesita de cada área y lo que ATLAS entrega. **Ninguna área ha validado todavía.** Las casillas de validación permanecen sin marcar hasta que cada área responda._

Diseño general: `docs/POS_ENTREGA_DISENO_TECNICO.md` (revisión 2).

Principios que aplican a los tres contratos:
- Inventario único por empresa (P2). `MOSTRADOR` y `BODEGA` son modos de entrega, no ubicaciones.
- Ninguna venta pagada se cancela automáticamente (P11).
- Ventas abiertas sin cambios (P6). Migración solo en copia (P10).

---

## 1. Contrato con KARDEX (inventario y existencias)

### 1.1 Eventos de movimiento

Un evento de entrega o devolución física produce **un movimiento por línea** en `movimientos_inventario`, con el `evento_id` que lo agrupa.

| Evento | `tipo` | Cantidad firmada | `documento_id` | `evento_id` | `detalle_venta_id` | Efecto en `stockActual` | Efecto en `stockReservado` | Cuándo |
|---|---|---|---|---|---|---|---|---|
| Cobro en mostrador | `ENTREGA` | `−q` | `ventaId` | Sí | Sí | `−q` | — | Al cobrar (`MOSTRADOR`), en la misma transacción |
| Cobro de bodega | — | — | — | — | — | — | `+q` | Al cobrar (`BODEGA`). Sin movimiento de stock; cambio de reserva |
| Preparación | — | — | — | — | — | — | — | Sin efecto en stock |
| Entrega de pedido | `ENTREGA` | `−q` | `ventaId` | Sí | Sí | `−q` | `−q` | Al entregar pedido (parcial o total) |
| Liberación de pendiente (ADMIN) | — | — | — | — | — | — | `−q` | Con motivo. Sin efecto en stock físico |
| Devolución física | `INGRESO` | `+q` | `ventaId` | Sí | Sí | `+q` | — | Solo sobre lo entregado (`R ≤ E`) |
| Devolución de mercancía dañada o a proveedor | — | — | — | — | — | — | — | Sin reingreso; registro de motivo |
| Contingencia sincronizada | `ENTREGA` | `−q` | `ventaId` | Sí | Sí | `−q` | — | Una vez por `operacion_id` |

**Cambio respecto de la revisión 1:** el índice único `(documento_id, detalle_venta_id)` se elimina. La unicidad pasa a ser `(evento_id, detalle_venta_id)`, lo que permite entregas parciales sucesivas sobre la misma línea.

**Identificadores:** cada movimiento lleva `evento_id` (UUID de la acción) y `detalle_venta_id`. Un reintento con la misma `solicitud_id` no produce movimientos nuevos.

### 1.2 Contadores por línea que KARDEX debe conocer

| Columna | Significado |
|---|---|
| `cantidad` (`C`) | Vendida |
| `cantidad_preparada` (`P`) | Preparada en bodega; sin efecto de stock |
| `cantidad_entregada` (`E`) | Entregada; ya descontada de `stockActual` |
| `cantidad_devuelta` (`R`) | De lo entregado, reingresada físicamente |
| `cantidad_cancelada` (`N`) | Pendiente liberado sin entrega |

Derivados: reserva restante `Rr = C − E − N`; mercancía en poder del cliente `Pc = E − R`.

### 1.3 Invariantes que ATLAS garantiza y KARDEX debe verificar

| ID | Invariante | Verificación |
|---|---|---|
| I1 | `0 ≤ E ≤ C` | CHECK y prueba T23 |
| I2 | `0 ≤ N` y `E + N ≤ C` | CHECK y T15, T16 |
| I3 | `0 ≤ R ≤ E` | CHECK y T18 |
| I4 | `0 ≤ P ≤ C − E − N` | CHECK y T13 |
| I5 | `MOSTRADOR`: `N = 0`, `P = 0` | CHECK |
| I7 | `stockReservado = Σ Rr` sobre líneas `BODEGA` del producto | Conciliación y T21 |
| I8 | `stockActual = S₀ + Σ ingresos − Σ E + Σ R` con ajustes registrados | Conciliación y T22 |
| — | `stockReservado ≥ 0` | CHECK en `productos` |

**No se garantiza** `stockReservado ≤ stockActual`. Un ajuste de inventario puede dejar reservas por encima del stock. KARDEX debe decidir cómo se reporta esa situación (P-K1 abajo).

### 1.4 Preguntas para KARDEX

1. **Disponible:** ¿se mantiene `disponible = stockActual − stockReservado`? ATLAS propone que sí, sin excluir pedidos antiguos (las alertas avisan; no liberan).
2. **Reserva por encima del stock tras un ajuste (P-K1):** ¿debe bloquearse el ajuste, avisar, o permitirlo con registro? ATLAS propone avisar y registrar; no bloquear.
3. **Existencias negativas:** ¿se mantiene la regla de no permitir existencias negativas en entregas?
4. **Movimientos de liberación y de devolución de pendiente:** ATLAS propone que no sean movimientos de stock, sino eventos en `entregas_eventos`. ¿KARDEX necesita verlos en su bitácora de reservas?
5. **Ventas abiertas (P6):** su reserva actual corresponde a `Rr = C` por línea. ¿KARDEX confirma que esa lectura es correcta para la conciliación inicial?
6. **Backfill de entregadas (T30):** ¿KARDEX acepta que las ventas ya entregadas reciban `E = C` sin movimiento nuevo, solo con el movimiento histórico existente?
7. **Costo:** el movimiento `ENTREGA` no altera costo. ¿Es correcto para la valuación?

### 1.5 Validación de KARDEX

| Punto | Acepta | Observación |
|---|---|---|
| 1.1 Eventos de movimiento | ☐ | |
| 1.2 Contadores | ☐ | |
| 1.3 Invariantes | ☐ | |
| 1.4 Preguntas 1–7 | ☐ | |

---

## 2. Contrato con CENTINELA (seguridad, sesiones y permisos)

### 2.1 Matriz de permisos propuesta

| Acción | ADMIN | CAJERO | VENDEDOR | BODEGUERO | Regla adicional |
|---|---|---|---|---|---|
| Cobrar en mostrador (`MOSTRADOR`) | ✔ | ✔ | ✔ | — | Con `pos.vender` |
| Cobrar y dejar en bodega (`BODEGA`) | ✔ | ✔ | ✔ | — | Con `pos.vender` |
| Preparar pedido | ✔ | — | — | ✔ | P3 |
| Entregar pedido (parcial o total) | ✔ | — | — | ✔ | P3. Receptor obligatorio (P4) |
| Liberar pendiente | ✔ | — | — | — | Motivo ≥ 10 caracteres (P7) |
| Devolución física | ✔ | — | — | — | Motivo ≥ 10 caracteres |
| Ver pedidos y alertas | ✔ | ✔ (sus ventas) | ✔ (sus ventas) | ✔ | |
| Ver conciliación de existencias | ✔ | — | — | — | Solo lectura |
| `MOSTRADOR` en contingencia offline | ✔ | ✔ | ✔ | — | Solo mostrador; `BODEGA` rechazado para todos |

**Cambio respecto de la revisión 1:** CAJERO ya no entrega pedidos de bodega. P3 fija BODEGUERO o ADMIN. El cajero conserva el cobro y ve sus propias alertas.

### 2.2 Reglas que ATLAS necesita que CENTINELA confirme

1. **Autorización en servidor.** Cada acción valida rol y, cuando aplica, pertenencia a la venta. El ocultamiento de botones no es la defensa.
2. **Sesión vigente.** Entregar pedidos requiere sesión vigente y conexión. Sin conexión no se entrega mercancía de bodega (regla offline).
3. **Usuario desactivado.** Sus pedidos pendientes siguen visibles para ADMIN. No puede registrar eventos con su cuenta desactivada.
4. **Sincronización offline.** Solo lleva ventas de mostrador (`MOSTRADOR`), con `usuario_id` del cajero que cobró. No puede registrar entregas de bodega, preparaciones ni liberaciones.
5. **Solicitud única.** `solicitud_id` es único por empresa. La base lo impone. Un reintento con la misma solicitud devuelve el resultado original; con una solicitud distinta, se aplican las reglas de cantidad.
6. **Ventana anti-repetición (P12, propuesta):** una entrega con las mismas líneas dentro de 30 s requiere confirmación explícita. CENTINELA debe confirmar que el campo `confirmarRepeticion` no puede usarse para eludir el tope de cantidades. El tope siempre prevalece.
7. **Receptor.** El nombre es texto libre. El sistema registra quién lo capturó (`usuario_id`); no verifica identidad. No se captura documento de identidad en esta fase.
8. **Inmutabilidad.** `entregas_eventos` y `entregas_eventos_lineas` no admiten `UPDATE` ni `DELETE`, ni siquiera de ADMIN.
9. **Auditoría.** Cada acción también se registra en `auditoria_operaciones`.
10. **Datos personales.** Nombre del receptor y motivo: minimizar, retención pendiente (P-C1).

### 2.3 Preguntas para CENTINELA

1. ¿ADMIN necesita una segunda aprobación para liberar pendientes, o basta con motivo y registro? (propuesta: motivo y registro).
2. ¿Qué tiempo de sesión máximo se acepta para una entrega? ¿Debe exigirse reautenticación para entregas de bodega?
3. ¿Se registra el dispositivo del POS en cada evento? (propuesta: sí; ya existe en contingencia).
4. ¿La ventana anti-repetición debe ser de 30 s o de otro valor? (P12).
5. **P-C1:** ¿qué retención aplicar al nombre del receptor y a los motivos?

### 2.4 Validación de CENTINELA

| Punto | Acepta | Observación |
|---|---|---|
| 2.1 Matriz | ☐ | |
| 2.2 Reglas 1–10 | ☐ | |
| 2.3 Preguntas 1–5 | ☐ | |

---

## 3. Contrato con BALANCE (procesos financieros y conciliación)

### 3.1 Separación de cobro y reconocimiento (P8)

El sistema registra **eventos**; BALANCE define cuándo se reconoce el ingreso contable.

| Evento del sistema | Qué registra | Qué no registra |
|---|---|---|
| `COBRO` | Monto cobrado, método (solo efectivo en contingencia), cajero, caja | Reconocimiento contable |
| `ENTREGA` | Cantidades entregadas, responsable, receptor | Ingreso ni caja |
| `LIBERACION` | Cantidad liberada, motivo, responsable | Devolución de dinero |
| `DEVOLUCION_FISICA` | Cantidad reingresada, motivo | Reembolso (proceso formal, P7) |

### 3.2 Efectos financieros propuestos

| Evento | Caja | Ingreso del día (cobro) | Ingreso contable (BALANCE) | Pasivo o compromiso |
|---|---|---|---|---|
| Cobro en mostrador | Entrada | Sí | Por definir (P8) | No |
| Cobro de bodega | Entrada | Sí | Por definir (P8) | Mercancía pendiente |
| Entrega de pedido | Ninguna | No (ya contado en cobro) | Sin cambio | Se reduce el compromiso |
| Liberación de pendiente | Ninguna | Sin cambio | Sin cambio | Se reduce el compromiso |
| Devolución formal con reembolso | Salida de efectivo (proceso actual) | Ajuste según proceso | Ajuste | — |
| Devolución física | Ninguna o reembolso | Ajuste según proceso | Ajuste | — |
| Contingencia sincronizada | Ya registrada al cobrar offline | Sin doble conteo | — | — |

### 3.3 Reportes que BALANCE debe poder obtener

1. **Cobros por cajero** (independiente de la entrega).
2. **Entregas por responsable** (quién confirmó la salida).
3. **Pedidos abiertos por antigüedad** y monto (compromisos).
4. **Reservas por producto** (cifra de KARDEX; BALANCE solo la reporta).
5. **Conciliación diaria:** cobros del día contra entregas del día y devoluciones. Diferencias por cajero.

### 3.4 Preguntas para BALANCE

1. **P8 — reconocimiento de ingreso:** ¿el ingreso contable se reconoce al cobro o al entregar? ATLAS registra ambos eventos; la decisión es de BALANCE.
2. **Pedidos cobrados y no entregados:** ¿se reportan como pasivo, como compromiso o de otra forma? Hay implicaciones fiscales que **no** se consideran aprobadas: requieren validación competente.
3. **Contingencia:** ¿la conciliación se hace por `operacion_id` y por correlativo `CT` contra la factura central al sincronizar?
4. **Cierre de caja:** ¿el efectivo de un pedido cobrado en bodega cuenta en el cierre del día de cobro? (propuesta: sí).
5. **Tolerancia:** ¿qué diferencia se acepta en la conciliación diaria entre cobros y entregas?
6. **Devolución física:** ¿cómo se trata el ajuste contable cuando la mercancía vuelve a existencias?

### 3.5 Validación de BALANCE

| Punto | Acepta | Observación |
|---|---|---|
| 3.1 Separación cobro y reconocimiento | ☐ | |
| 3.2 Efectos financieros | ☐ | |
| 3.3 Reportes | ☐ | |
| 3.4 Preguntas 1–6 | ☐ | |

---

## 4. Lo que ATLAS entrega a cada área

| Área | Entregable | Estado |
|---|---|---|
| KARDEX | Eventos (§1.1), contadores (§1.2), invariantes (§1.3) | Diseñado; **no validado** |
| CENTINELA | Matriz (§2.1), reglas (§2.2) | Diseñado; **no validado** |
| BALANCE | Separación cobro/reconocimiento (§3.1), efectos (§3.2), reportes (§3.3) | Diseñado; **no validado** |
| FARO | Plan de pruebas T01–T41 (diseño §11) | Diseñado; pendiente de escritura en rojo |

---

## 5. Condiciones para implementar

ATLAS no implementará hasta que:

1. El dueño decida P12 y las preguntas abiertas de P-K1 y P-C1.
2. KARDEX, CENTINELA y BALANCE completen sus validaciones. Hasta entonces, las casillas quedan sin marcar.
3. FARO escriba T01–T29, T31–T36 y T39–T41 en rojo sobre la base actual.

Sin merge. Sin migraciones productivas. Ventas abiertas sin cambios.

_Informe de ATLAS. Revisión 2._
