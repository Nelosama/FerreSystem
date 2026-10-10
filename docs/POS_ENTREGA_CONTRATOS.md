# Contratos de cobro y entrega — revisión 3 (para validación de KARDEX, CENTINELA, BALANCE y NEXUS)

_Informe de **ATLAS**. Estos contratos describen lo que ATLAS necesita de cada área y lo que ATLAS entrega. **Ninguna área ha validado todavía.** Las casillas de validación permanecen sin marcar hasta que cada área responda._

Diseño general: `docs/POS_ENTREGA_DISENO_TECNICO.md` (revisión 3).

Principios que aplican a los cuatro contratos:
- Inventario único por empresa (P2). `MOSTRADOR` y `BODEGA` son modos de entrega, no ubicaciones.
- Ninguna venta pagada se cancela automáticamente (P11).
- Ventas abiertas sin cambios (P6). Migración solo en copia (P10).
- **P12 no está aprobada ni implementada.** Ningún contrato la supone.

---

## 1. Contrato con KARDEX (inventario y existencias)

### 1.1 Eventos de movimiento

Cada acción que cambia existencias produce **un movimiento por línea** en `movimientos_inventario`, agrupado por `evento_id`.

| Evento | `tipo` | Cantidad firmada | `documento_id` | `evento_id` | `detalle_venta_id` | Efecto en `stockActual` | Efecto en `stockReservado` | Cuándo |
|---|---|---|---|---|---|---|---|---|
| Cobro en mostrador | `ENTREGA` | `−q` | `ventaId` | Sí | Sí | `−q` | — | Al cobrar (`MOSTRADOR`), misma transacción |
| Cobro de bodega | — | — | — | — | — | — | `+q` | Al cobrar (`BODEGA`). Sin movimiento de stock |
| Preparación | — | — | — | — | — | — | — | Sin efecto en stock ni reserva |
| Entrega de pedido | `ENTREGA` | `−q` | `ventaId` | Sí | Sí | `−q` | `−q` | Al entregar (parcial o total) |
| Liberación de pendiente (ADMIN) | — | — | — | — | — | — | `−q` | Con motivo. Sin efecto en stock físico |
| Devolución **con reingreso** | `INGRESO` | `+q` | `ventaId` | Sí | Sí | `+q` | — | Solo sobre lo entregado, `R + S + q ≤ E` |
| Devolución **sin reingreso** (`DAÑADO` o `PROVEEDOR`) | — | — | — | — | — | — | — | Sin movimiento de stock. Solo registro de evento y contador `S` |
| Contingencia sincronizada | `ENTREGA` | `−q` | `ventaId` | Sí | Sí | `−q` | — | Una vez por `operacion_id` |

**Cambios respecto de la revisión 2:**
- La devolución se divide en **dos categorías**. Solo la categoría «con reingreso» mueve existencias.
- El índice único pasa a ser `(tenant_id, evento_id, detalle_venta_id)`. Permite entregas parciales sucesivas sobre la misma línea.

### 1.2 Contadores por línea

| Columna | Símbolo | Significado | Efecto en existencias |
|---|---|---|---|
| `cantidad` | `C` | Vendida | — |
| `cantidad_preparada` | `P` | Preparada pendiente de entrega; siempre `≤ Rr` | Ninguno |
| `cantidad_entregada` | `E` | Salió del local | Ya descontada de `stockActual` |
| `cantidad_devuelta_reingresada` | `R` | Entregada y reingresada a existencias | Ya sumada a `stockActual` |
| `cantidad_devuelta_sin_reingreso` | `S` | Entregada, volvió al local, no reingresó | **Ninguno** |
| `cantidad_cancelada` | `N` | Pendiente liberado | Ya fuera de `stockReservado` |

Derivados: reserva restante `Rr = C − E − N`; mercancía en poder del cliente `Pc = E − R − S`.

### 1.3 Regla de `P` (cantidad preparada)

Tras **entregar** o **liberar** `q` (con `q ≤ Rr`), la nueva reserva restante es `Rr' = Rr − q`, y:

```
P' = min(P, Rr')
```

Esto significa que la preparación restante se descuenta cuando ya no hay pedido que la respalde. Demostración por inducción en el diseño §2.6, y ejemplos en §2.7. KARDEX no mueve existencias por `P`.

### 1.4 Invariantes que ATLAS garantiza y KARDEX debe verificar

| ID | Invariante | Verificación |
|---|---|---|
| I1 | `0 ≤ E ≤ C` | CHECK y T23 |
| I2 | `0 ≤ N` y `E + N ≤ C` | CHECK y T15, T16 |
| I3 | `0 ≤ R`, `0 ≤ S`, `R + S ≤ E` | CHECK y T18, T20 |
| I4 | `0 ≤ P ≤ C − E − N` | CHECK y T13a–T13d |
| I5 | `MOSTRADOR`: tras el cobro, `E = C`, `N = 0`, `P = 0` | Prueba T01 e informe |
| I6 | `SIN_INVENTARIO`: contadores en 0 | CHECK |
| I7 | `stockReservado = Σ Rr` sobre líneas `BODEGA` del producto | Informe de conciliación y T21a |
| I8 | `stockActual = S₀ + Σ ingresos − Σ E + Σ R`. **`S` no entra.** | Informe de conciliación y T22a |
| I10 | `E`, `R`, `S`, `N` y `C` iguales a las sumas de sus eventos | Informe y T22b |
| I11 | `stockReservado ≥ 0` | CHECK en `productos` |

**No se garantiza** `stockReservado ≤ stockActual`. Un ajuste de inventario puede dejar reservas por encima del stock (P-K1).

### 1.5 Preguntas para KARDEX

1. **Disponible:** ¿se mantiene `disponible = stockActual − stockReservado`? ATLAS propone que sí, sin excluir pedidos antiguos.
2. **P-K1, reserva por encima del stock tras un ajuste:** ¿avisar y registrar, bloquear o permitir? ATLAS propone avisar y registrar.
3. **Existencias negativas:** ¿se mantiene la regla de no permitir existencias negativas en entregas?
4. **Movimientos de liberación y de devolución sin reingreso:** ATLAS propone que no sean movimientos de stock, sino eventos en `entregas_eventos`. ¿KARDEX necesita verlos en su bitácora de reservas?
5. **Devolución sin reingreso al proveedor:** ¿el envío al proveedor debe generar una salida de existencias en KARDEX o un evento de compras? ATLAS propone que sea un proceso separado, fuera de esta devolución.
6. **Ventas abiertas (P6):** su reserva actual corresponde a `Rr = C` por línea. ¿KARDEX confirma que esa lectura es correcta para la conciliación inicial?
7. **Backfill de entregadas (T30):** ¿KARDEX acepta que las ventas ya entregadas reciban `E = C` sin movimiento nuevo, con el movimiento histórico existente como respaldo?
8. **Costo:** el movimiento `ENTREGA` no altera costo. ¿Es correcto para la valuación?

### 1.6 Validación de KARDEX

| Punto | Acepta | Observación |
|---|---|---|
| 1.1 Eventos de movimiento (con división de devoluciones) | ☐ | |
| 1.2 Contadores | ☐ | |
| 1.3 Regla de `P` | ☐ | |
| 1.4 Invariantes | ☐ | |
| 1.5 Preguntas 1–8 | ☐ | |

---

## 2. Contrato con CENTINELA (seguridad, sesiones, permisos y aislamiento)

### 2.1 Matriz de permisos propuesta

| Acción | ADMIN | CAJERO | VENDEDOR | BODEGUERO | Regla adicional |
|---|---|---|---|---|---|
| Cobrar en mostrador (`MOSTRADOR`) | ✔ | ✔ | ✔ | — | Con `pos.vender` |
| Cobrar y dejar en bodega (`BODEGA`) | ✔ | ✔ | ✔ | — | Con `pos.vender` |
| Preparar pedido | ✔ | — | — | ✔ | P3 |
| Entregar pedido (parcial o total) | ✔ | — | — | ✔ | P3. Receptor obligatorio (P4) |
| Liberar pendiente | ✔ | — | — | — | Motivo ≥ 10 caracteres (P7) |
| Devolución con reingreso o sin reingreso | ✔ | — | — | — | Motivo ≥ 10 caracteres |
| Ver pedidos y alertas | ✔ | ✔ (sus ventas) | ✔ (sus ventas) | ✔ | |
| Ver conciliación de existencias | ✔ | — | — | — | Solo lectura |
| `MOSTRADOR` en contingencia offline | ✔ | ✔ | ✔ | — | `BODEGA` y `SIN_INVENTARIO` rechazados para todos |

### 2.2 Solicitud, huella y conflicto (§3.6 del diseño)

1. **Huella canónica.** Cada acción mutante calcula `huella = SHA-256(canonicalJSON(payloadSemantico))`. El payload incluye tipo, venta, actor, origen, líneas en centésimas ordenadas, receptor y motivo normalizados. Excluye fecha, dispositivo y el propio `solicitud_id`.
2. **Matriz:**
   - Misma `solicitud_id` y misma huella: repetición. Responde con el mismo evento. Sin efectos.
   - Misma `solicitud_id` y huella distinta: **409 `SOLICITUD_REUTILIZADA`**, sin efectos y con mensaje genérico.
   - Misma `solicitud_id` en otro tenant: no hay conflicto.
3. **Por qué no se reutiliza `fingerprint`:** el `fingerprint` actual de `ledger.ts` usa `JSON.stringify` sin ordenar claves ni normalizar números ni cadenas. Dos payloads iguales con distinto orden producirían conflictos falsos. CENTINELA debe confirmar si `ventas` también debe migrar (ver hallazgo 2.5-2).
4. **Concurrencia:** bloqueo asesor por `ENT:<tenant>:<solicitud>` más restricción `UNIQUE`. Exactamente un evento.

### 2.3 Aislamiento multi-tenant (§3.7 del diseño)

1. **Claves foráneas compuestas** `(tenant_id, …)` en eventos, líneas de evento y movimientos. Una fila no puede referenciar venta, línea, producto o responsable de otro tenant.
2. **Pregunta para CENTINELA:** ¿es suficiente esa defensa, o se exige además RLS (P-N3)? ATLAS recomienda FK compuestas como defensa obligatoria y RLS como capa opcional a decidir.
3. **Respuesta a identificadores ajenos:** 404 sin distinguir existencia (§3.7.6).
4. **Hallazgo 2.5-2:** la idempotencia de ventas usa el ID de la venta como clave global. Un UUID de otra empresa devuelve conflicto y confirma su existencia. No se modifica en esta fase; CENTINELA debe decidir si se corrige.

### 2.4 Reglas que ATLAS necesita que CENTINELA confirme

1. **Autorización en servidor.** Cada acción valida rol y pertenencia a la venta cuando aplica.
2. **Sesión vigente.** Entregar pedidos requiere sesión vigente y conexión. Sin conexión no se entrega mercancía de bodega.
3. **Usuario desactivado.** Sus pedidos pendientes siguen visibles para ADMIN. No puede registrar eventos con su cuenta desactivada.
4. **Sincronización offline.** Solo lleva ventas de mostrador, con `usuario_id` del cajero que cobró. No registra entregas de bodega, preparaciones ni liberaciones.
5. **Receptor.** El nombre es texto libre. El sistema registra quién lo capturó; no verifica identidad. No se captura documento.
6. **Inmutabilidad.** Las tablas de eventos no admiten `UPDATE` ni `DELETE`, ni siquiera para ADMIN.
7. **Auditoría.** Cada acción también se registra en `auditoria_operaciones`.
8. **Datos personales.** Minimizar nombre de receptor y motivos. Retención pendiente (P-C1).
9. **Dispositivo fuera de la huella.** Un reintento desde otro equipo con el mismo contenido es el mismo intento. Confirmar.

### 2.5 Preguntas para CENTINELA

1. ¿ADMIN necesita segunda aprobación para liberar pendientes, o basta con motivo y registro?
2. ¿Qué tiempo de sesión máximo se acepta para una entrega? ¿Reautenticación en entregas de bodega?
3. ¿Se registra el dispositivo del POS en cada evento? (propuesta: sí).
4. **Hallazgo 2.5-1:** ¿debe corregirse la idempotencia de ventas para que no revele existencia de UUID ajenos?
5. **Hallazgo 2.5-2:** ¿debe migrar `ventas` a la huella canónica, o mantener `fingerprint` ahí?
6. **P-N3:** ¿RLS además de FK compuestas?
7. **P-C1:** ¿qué retención aplicar al nombre del receptor y a los motivos?

### 2.6 Validación de CENTINELA

| Punto | Acepta | Observación |
|---|---|---|
| 2.1 Matriz | ☐ | |
| 2.2 Solicitud, huella y conflicto | ☐ | |
| 2.3 Aislamiento multi-tenant | ☐ | |
| 2.4 Reglas 1–9 | ☐ | |
| 2.5 Preguntas 1–7 | ☐ | |

---

## 3. Contrato con BALANCE (procesos financieros y conciliación)

### 3.1 Separación de cobro y reconocimiento (P8)

El sistema registra **eventos**; BALANCE define cuándo se reconoce el ingreso contable.

| Evento del sistema | Qué registra | Qué no registra |
|---|---|---|
| `COBRO` | Monto, método (solo efectivo en contingencia), cajero, caja | Reconocimiento contable |
| `ENTREGA` | Cantidades entregadas, responsable, receptor | Ingreso ni caja |
| `LIBERACION` | Cantidad liberada, motivo, responsable | Devolución de dinero |
| `DEVOLUCION_REINGRESO` | Cantidad reingresada, motivo | Reembolso (proceso formal, P7) |
| `DEVOLUCION_SIN_REINGRESO` | Cantidad no reingresada, destino (`DAÑADO` o `PROVEEDOR`), motivo | Reembolso ni baja contable |

### 3.2 Efectos financieros propuestos

| Evento | Caja | Ingreso del día (cobro) | Ingreso contable (BALANCE) | Compromiso o pasivo |
|---|---|---|---|---|
| Cobro en mostrador | Entrada | Sí | Por definir (P8) | No |
| Cobro de bodega | Entrada | Sí | Por definir (P8) | Mercancía pendiente |
| Entrega de pedido | Ninguna | No (ya contado en cobro) | Sin cambio | Se reduce el compromiso |
| Liberación de pendiente | Ninguna | Sin cambio | Sin cambio | Se reduce el compromiso |
| Devolución con reingreso y reembolso | Salida de efectivo (proceso actual) | Ajuste según proceso | Ajuste | — |
| Devolución con reingreso sin reembolso | Ninguna | Sin cambio | Sin cambio | — |
| Devolución sin reingreso (`DAÑADO` o `PROVEEDOR`) | Ninguna o reembolso | Ajuste según proceso | **Por definir (P-B1)** | — |
| Contingencia sincronizada | Ya registrada al cobrar offline | Sin doble conteo | — | — |

### 3.3 Reportes que BALANCE debe poder obtener

1. **Cobros por cajero** (independiente de la entrega).
2. **Entregas por responsable** (quién confirmó la salida).
3. **Pedidos abiertos por antigüedad** y monto (compromisos).
4. **Reservas por producto** (cifra de KARDEX; BALANCE solo la reporta).
5. **Devoluciones sin reingreso** por destino y motivo, con monto de la línea original.
6. **Conciliación diaria:** cobros, entregas y devoluciones del día. Diferencias por cajero.

### 3.4 Preguntas para BALANCE

1. **P8, reconocimiento de ingreso:** ¿al cobro o al entregar? ATLAS registra ambos eventos; la decisión es de BALANCE.
2. **P-B1, devoluciones sin reingreso:** ¿cómo se trata contablemente un producto dañado o enviado al proveedor? ¿Es gasto, cuenta por cobrar al proveedor, ajuste de ingreso o de otra forma?
3. **Pedidos cobrados y no entregados:** ¿se reportan como pasivo o como compromiso? Hay implicaciones fiscales que **no** se consideran aprobadas; requieren validación competente.
4. **Contingencia:** ¿la conciliación se hace por `operacion_id` y por correlativo `CT` contra la factura central al sincronizar?
5. **Cierre de caja:** ¿el efectivo de un pedido cobrado en bodega cuenta en el cierre del día de cobro? (propuesta: sí).
6. **Tolerancia:** ¿qué diferencia se acepta en la conciliación diaria?

### 3.5 Validación de BALANCE

| Punto | Acepta | Observación |
|---|---|---|
| 3.1 Separación de cobro y reconocimiento | ☐ | |
| 3.2 Efectos financieros (incluye P-B1) | ☐ | |
| 3.3 Reportes | ☐ | |
| 3.4 Preguntas 1–6 | ☐ | |

---

## 4. Contrato con NEXUS (estructura de eventos, Prisma y migraciones)

NEXUS revisa la parte técnica de persistencia. Esta sección es nueva en la revisión 3.

### 4.1 Estructura de eventos

| Tabla | Propósito | Clave | Restricciones clave |
|---|---|---|---|
| `entregas_eventos` | Un evento por acción | `id TEXT` | `UNIQUE (tenant_id, solicitud_id)`, `UNIQUE (tenant_id, id)`, FK compuestas a `ventas` y `usuarios`, `CHECK` de tipo, origen, huella y motivo |
| `entregas_eventos_lineas` | Líneas de cada evento | `(tenant_id, evento_id, detalle_venta_id)` | FK compuestas a `entregas_eventos` y `detalles_venta`, `CHECK` de cantidad positiva |
| `movimientos_inventario` (ampliada) | Movimientos con referencia a evento y línea | Existente | `UNIQUE (tenant_id, evento_id, detalle_venta_id)` parcial; FK compuestas |
| `detalles_venta` (ampliada) | Contadores `P`, `E`, `R`, `S`, `N` y modo | Existente | `CHECK` I1–I6 |

**Preguntas para NEXUS:**
1. ¿Es correcto que la clave primaria de la línea de evento sea compuesta `(tenant_id, evento_id, detalle_venta_id)` y no un `id` propio?
2. ¿Se justifica la columna `huella CHAR(64)` frente a `TEXT`?
3. ¿Hay que añadir un índice por `(tenant_id, solicitud_id)` además de la `UNIQUE`? (propuesta: no, la `UNIQUE` ya indexa).
4. ¿Son correctos los tipos `NUMERIC(12,2)` para `P`, `E`, `R`, `S`, `N`?

### 4.2 Compatibilidad con Prisma

| Punto | Propuesta de ATLAS | Riesgo |
|---|---|---|
| IDs | `TEXT` con `@default(uuid())` en Prisma (P-N2) | Bajo |
| FK compuestas | Modelarlas como relaciones compuestas en `schema.prisma` (P-N1). Requiere `@@unique([tenantId, id])` en `Venta`, `Producto`, `Usuario`, `DetalleVenta` y `EntregaEvento` | **Alto**: cambia la forma de `DetalleVenta.venta` y de sus `include` existentes |
| `tenant_id` nuevo en `detalles_venta` | `tenantId String @map("tenant_id")` con relación a `Tenant` | Medio: escrituras existentes de `detalles_venta` deben rellenarlo |
| `CHECK`, triggers e índices parciales | No modelables en Prisma. Quedan en SQL de la migración | **Alto**: deriva en `prisma migrate diff` |
| `DEFAULT` temporal de `modo_entrega` | Se retira en la migración (paso 11 del diseño §7.1) | Bajo, pero Prisma debe quedar sin default |
| `NUMERIC(12,2)` | `Decimal @db.Decimal(12,2)` | Bajo |

**Preguntas para NEXUS:**
4. ¿Prisma 6.4.1 permite relaciones compuestas con `fields` y `references` múltiples sin cambiar el nombre de las relaciones existentes? ¿Qué `include` del código actual se rompen?
5. ¿Cómo se evita que `migrate diff` proponga eliminar `CHECK`, triggers e índices parciales en cada migración futura? ¿Se acepta una lista de exclusiones documentada?
6. ¿Conviene modelar `EntregaEvento` y `EntregaEventoLinea` en Prisma o dejarlas solo en SQL con acceso por `$queryRaw`?
7. ¿Hay que regenerar el cliente antes de desplegar, o basta con la migración?

### 4.3 Orden de migraciones

Migración única transaccional `20261012000000_entrega_eventos_y_cantidades` (diseño §7.1). Orden propuesto:

1. `tenant_id` en `detalles_venta` con *backfill* y `SET NOT NULL`.
2. `UNIQUE (tenant_id, id)` en `ventas`, `productos`, `usuarios`, `detalles_venta`.
3. Columnas de contadores y `modo_entrega` con `DEFAULT 'BODEGA'` temporal.
4. *Backfill* de `SIN_INVENTARIO`.
5. *Backfill* de entregadas (`ONLINE` → `BODEGA`; `CONTINGENCIA` → `MOSTRADOR`).
6. Ventas abiertas: sin cambios.
7. Crear `entregas_eventos` y `entregas_eventos_lineas`.
8. Columnas y FK en `movimientos_inventario`; índice parcial.
9. Verificación de I1–I8 con `DO $$ … RAISE EXCEPTION … $$`.
10. `CHECK` de cantidades y modo.
11. `DROP DEFAULT` de `modo_entrega`.
12. Triggers.

**Preguntas para NEXUS:**
8. ¿El orden es correcto? En particular, ¿el paso 2 debe ir antes del paso 1 si `tenants` ya tiene la FK?
9. ¿Prisma ejecuta esta migración dentro de una transacción? Si no, ¿qué estado queda si falla el paso 9?
10. ¿Hay que partir la migración en dos (estructura y datos) para que `migrate deploy` sea reanudable?
11. ¿Se aceptan `RAISE EXCEPTION` en una migración de Prisma, o hay que validar en un script externo?

### 4.4 Copia de verificación

Antes de cualquier aplicación autorizada: NEXUS ejecuta la migración sobre una copia, con `migrate status`, `migrate diff` y T30. Entrega informe con la lista de deriva. Sin esa copia, la migración no se aprueba (P10).

### 4.5 Validación de NEXUS

| Punto | Acepta | Observación |
|---|---|---|
| 4.1 Estructura de eventos | ☐ | |
| 4.2 Compatibilidad con Prisma (preguntas 4–7) | ☐ | |
| 4.3 Orden de migraciones (preguntas 8–11) | ☐ | |
| 4.4 Copia de verificación | ☐ | |

---

## 5. Lo que ATLAS entrega a cada área

| Área | Entregable | Estado |
|---|---|---|
| KARDEX | Eventos (§1.1), contadores (§1.2), regla de `P` (§1.3), invariantes (§1.4) | Diseñado; **no validado** |
| CENTINELA | Matriz (§2.1), solicitud y huella (§2.2), aislamiento (§2.3), reglas (§2.4) | Diseñado; **no validado** |
| BALANCE | Separación cobro y reconocimiento (§3.1), efectos (§3.2), reportes (§3.3), P-B1 | Diseñado; **no validado** |
| NEXUS | Estructura de eventos (§4.1), Prisma (§4.2), orden de migraciones (§4.3) | Diseñado; **no validado** |
| FARO | Plan de pruebas T01–T57 (diseño §11) | Diseñado; pendiente de escritura en rojo |

---

## 6. Condiciones para implementar

ATLAS no implementará hasta que:

1. KARDEX, CENTINELA, BALANCE y NEXUS completen sus validaciones. Hasta entonces, las casillas quedan sin marcar.
2. Las preguntas P-K1, P-C1, P-B1, P-N1 a P-N4 tengan respuesta.
3. FARO escriba T01–T23 y T42–T57 en rojo sobre la base actual.
4. NEXUS apruebe la migración en copia (§4.4).

Sin merge. Sin migraciones productivas. Ventas abiertas sin cambios.

_Informe de ATLAS. Revisión 3._
