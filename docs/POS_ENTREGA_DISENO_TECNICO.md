# Cobro y entrega — diseño técnico (revisión 3, lista para revisión cruzada)

_Informe de **ATLAS** (POS y continuidad operativa). Diseño, sin implementación. No modifica ventas abiertas, no ejecuta migraciones y no se fusiona a `main`._

Base verificada en código: `claude/integracion-pos-offline-p1` (PR #129), commit `9d392a69` como base de esta revisión.

Revisión 3 resuelve las cuatro observaciones de la revisión 2:
1. Huella de solicitud y conflicto explícito (§3.6).
2. Actualización de `cantidad_preparada` y prueba de invariantes (§2.5, §2.6, §2.7).
3. Aislamiento multi-tenant en claves, índices y transacciones (§3.7, §7).
4. Devoluciones con reingreso frente a devoluciones sin reingreso (§2.2, §2.4, §4.3).

Además: P12 no se implementa (§3.5, §12). Contratos para KARDEX, CENTINELA, BALANCE y NEXUS: `docs/POS_ENTREGA_CONTRATOS.md`.

**Estado: diseño listo para revisión cruzada. No listo para implementación hasta que KARDEX, CENTINELA, BALANCE y NEXUS respondan sus validaciones.**

---

## 0. Tabla de correcciones

| Observación | Qué faltaba | Dónde se resuelve |
|---|---|---|
| 1. Solicitud reutilizada con otro payload | No había huella ni regla de conflicto. El `fingerprint` existente no ordena claves ni normaliza. | §3.6, pruebas T42–T50 |
| 2. `cantidad_preparada` ante entregas y cancelaciones | La definición acumulada violaba I4 tras una entrega. | §2.5 (regla `P' = min(P, Rr')`), §2.6 (prueba inductiva), §2.7 (ejemplos), T13a–T13d |
| 3. Aislamiento multi-tenant | `detalles_venta` no tenía `tenant_id`; las claves eran simples; no había comprobación de tenant en eventos. | §3.7, §7, T51–T57 |
| 4. Reingreso frente a no reingreso | Un solo contador de devolución mezclaba ambos casos. | §2.2, §2.4, §4.3, T17–T22, T57d |

---

## 1. Línea base (verificada)

| Elemento | Situación |
|---|---|
| Venta | `POST /ventas` crea la venta `COMPLETADA` y reserva **toda** la venta (`stockReservado += cantidad`, `reserva_pendiente = true`). `backend/src/ventas/ventas.service.ts` ~213–275. |
| Idempotencia de venta | Clave = `solicitudId` como **id de la venta** (global, no por tenant). Huella con `fingerprint({usuarioId, dto})`. Ver §3.6.3. `ventas.service.ts` ~128–160. |
| Entrega | `POST /operaciones/ventas/:id/entregar`, roles ADMIN, CAJERO, BODEGUERO. Entrega **toda** la venta. Sin validación de receptor. `operaciones.service.ts` ~245–262. |
| Devolución | `POST /operaciones/ventas/:id/devoluciones`, ADMIN. Destinos `INVENTARIO`, `DAÑADO`, `PROVEEDOR`, `NO_ENTREGADO`. Tope: cantidad ≤ vendido − devuelto (validación en `devolver`). **No** compara con lo entregado. |
| Contingencia | Descuento al sincronizar, `reserva_pendiente = false`. |
| Líneas | `detalles_venta` (`id`, `venta_id`, `producto_id`, `cantidad`, `precio_unitario`, `subtotal`, `costo_unitario`, `sin_inventario`, `proveedor_id`, `orden_compra_id`). **Sin `tenant_id`.** |
| Movimientos | `movimientos_inventario` con `tenant_id`, `producto_id`, `documento_id`, `tipo`, `anterior`, `nuevo`, `cantidad`. Sin referencia a línea ni a evento. |
| Tipos de ID | `String @id @default(uuid())`, es decir `TEXT` en PostgreSQL. **No** `UUID`. |
| Unicidad compuesta | Existe `@@unique([tenantId, numeroVenta])` en `Venta`, `@@unique([tenantId, codigo])` en `Producto`, `@@unique([tenantId, email])` en `Usuario`. **No** existe `(tenant_id, id)` como clave referenciable. |

---

## 2. Modelo de cantidades

### 2.1 Unidades

- Cantidades en `NUMERIC(12,2)` (como `detalles_venta.cantidad`).
- Aritmética de aplicación en **enteros de centésimas**, como en `frontend/src/offline/money.ts` y `backend/src/common/dinero.ts`.
- Los límites se verifican **dentro de SQL** sobre `NUMERIC`, no en `number` de JavaScript.

### 2.2 Contadores por línea

Para cada línea con inventario (`modo_entrega ∈ {MOSTRADOR, BODEGA}`):

| Símbolo | Columna | Significado | Cambia con |
|---|---|---|---|
| `C` | `cantidad` | Vendida | Nunca |
| `P` | `cantidad_preparada` | Preparada pendiente de entrega (siempre ≤ `Rr`) | Preparar; entregar; liberar |
| `E` | `cantidad_entregada` | Salió del local hacia el cliente | Entregar |
| `R` | `cantidad_devuelta_reingresada` | De lo entregado, **reingresó a existencias** | Devolución con destino `INVENTARIO` |
| `S` | `cantidad_devuelta_sin_reingreso` | De lo entregado, **volvió al local pero no reingresó** | Devolución con destino `DAÑADO` o `PROVEEDOR` |
| `N` | `cantidad_cancelada` | Pendiente liberado sin entrega | Liberar |

Derivados (no se guardan):

- Reserva restante: `Rr = C − E − N` (solo `BODEGA`).
- Mercancía en poder del cliente: `Pc = E − R − S`.

Líneas `SIN_INVENTARIO` (venta sin inventario existente, P9): todos los contadores son 0 y no participan en reservas ni en existencias.

### 2.3 Invariantes

| ID | Invariante | Aplica a |
|---|---|---|
| I1 | `0 ≤ E ≤ C` | `BODEGA`, `MOSTRADOR` |
| I2 | `0 ≤ N` y `E + N ≤ C` | `BODEGA` |
| I3 | `0 ≤ R`, `0 ≤ S` y `R + S ≤ E` | `BODEGA`, `MOSTRADOR` |
| I4 | `0 ≤ P ≤ Rr = C − E − N` | `BODEGA` |
| I5 | `MOSTRADOR`: tras el cobro, `E = C`, `N = 0`, `P = 0` | `MOSTRADOR` |
| I6 | `SIN_INVENTARIO`: todos los contadores en 0 | `SIN_INVENTARIO` |
| I7 | `stockReservado = Σ Rr` sobre líneas `BODEGA` del producto | Producto |
| I8 | `stockActual = S₀ + Σ ingresos_compra + Σ ajustes − Σ E + Σ R` (sobre todas las líneas del producto). **`S` no entra.** | Producto |
| I9 | Toda fila de evento, línea de evento, línea de venta y movimiento tiene el mismo `tenant_id` que su venta o producto referenciado | Esquema |
| I10 | Los contadores son iguales a la suma de las cantidades de los eventos: `E = Σ ENTREGA`, `R = Σ DEVOLUCION_REINGRESO`, `S = Σ DEVOLUCION_SIN_REINGRESO`, `N = Σ LIBERACION`, `C = Σ COBRO` | Línea |
| I11 | `stockReservado ≥ 0` y `stockActual` no negativo tras entregas | Producto |

I1–I6 y I9 se aplican como `CHECK` o claves foráneas compuestas. I7, I8, I10 y I11 se verifican en el informe de conciliación y en pruebas.

**Nota sobre I8:** un ajuste de inventario puede dejar `stockReservado > stockActual`. No se impide: se reporta en conciliación (ver contrato KARDEX, P-K1).

### 2.4 Transiciones permitidas

Los estados de la pantalla se **derivan** de los contadores; no hay columna de estado.

| Desde | Acción | Condición | Efecto en contadores | Efecto en stock |
|---|---|---|---|---|
| (nueva) | Cobro `MOSTRADOR` | `stockActual − stockReservado ≥ C` | `E = C` | `stockActual −= C` (movimiento `ENTREGA`) |
| (nueva) | Cobro `BODEGA` | `stockActual − stockReservado ≥ C` | `E = 0`, `Rr = C` | `stockReservado += C` |
| Pendiente | Preparar `q` | `P + q ≤ Rr` | `P += q` | Ninguno |
| Pendiente o parcial | Entregar `q` | `q ≤ Rr` y `stockActual ≥ q` | `E += q`, `P = min(P, Rr')` | `stockActual −= q`, `stockReservado −= q` (movimiento `ENTREGA`) |
| Pendiente o parcial | Liberar `q` (ADMIN, motivo) | `q ≤ Rr` | `N += q`, `P = min(P, Rr')` | `stockReservado −= q` |
| Entregada (con `Pc ≥ q`) | Devolver con reingreso `q` (destino `INVENTARIO`) | `R + S + q ≤ E` | `R += q` | `stockActual += q` (movimiento `INGRESO`) |
| Entregada (con `Pc ≥ q`) | Devolver sin reingreso `q` (destino `DAÑADO` o `PROVEEDOR`) | `R + S + q ≤ E` | `S += q` | Ninguno |
| Entregada | Devolver como `NO_ENTREGADO` | — | **Prohibido** | — |
| Pendiente | Devolver con reingreso o sin reingreso | — | **Prohibido** (no hay unidades entregadas; usar liberar) | — |

`Rr' = C − (E + q) − N` para entregar, y `Rr' = C − E − (N + q)` para liberar.

**Estados derivados para pantalla:**

| Estado | Condición |
|---|---|
| `PENDIENTE` | `BODEGA`, `E = 0`, `N = 0` |
| `PARCIAL` | `BODEGA`, `Rr > 0` y (`E > 0` o `N > 0`) |
| `LISTA` | `BODEGA`, `Rr > 0` y `P > 0` (se muestra junto a `PENDIENTE` o `PARCIAL`) |
| `ENTREGADA` | `E = C` y `R + S = 0` |
| `DEVUELTA_PARCIAL` | `R + S > 0` y `Pc > 0` |
| `DEVUELTA` | `R + S = E` y `E > 0` |
| `CANCELADA` | `N = C` y `E = 0` |

### 2.5 Regla de `cantidad_preparada`

**Definición:** `P` es la cantidad que ya fue preparada en bodega y **aún no se entregó**. Por definición nunca supera la reserva restante.

**Regla de actualización (única para entregar y liberar):**

```
P' = min(P, Rr')
```

donde `Rr'` es la reserva restante **después** de la operación.

**Justificación:** tras cualquier entrega o liberación, `Rr'` puede ser menor que `P`. Ese exceso ya no tiene pedido que lo respalde, así que se descuenta. Si `P ≤ Rr'`, `P` no cambia.

**Forma en SQL (una sola sentencia, misma fila):**

```sql
UPDATE detalles_venta
   SET cantidad_entregada = cantidad_entregada + $q,
       cantidad_preparada = LEAST(
         cantidad_preparada,
         cantidad - (cantidad_entregada + $q) - cantidad_cancelada)
 WHERE tenant_id = $tenant
   AND id = $linea
   AND modo_entrega = 'BODEGA'
   AND cantidad_entregada + cantidad_cancelada + $q <= cantidad
RETURNING cantidad_entregada, cantidad_preparada;
```

La condición de la fila garantiza `q ≤ Rr`, y `LEAST` garantiza I4 en la misma sentencia.

### 2.6 Prueba de invariantes (inducción)

**Hipótesis:** antes de la operación se cumplen I1–I6.

**Caso base:** cobro `BODEGA` con `E = 0`, `N = 0`, `P = 0`, `Rr = C`. I1–I4 se cumplen (`0 ≤ 0 ≤ C`, `P = 0 ≤ C`). Cobro `MOSTRADOR` con `E = C`, `N = 0`, `P = 0`: I5 se cumple.

**Preparar `q`:** la precondición `P + q ≤ Rr` da `P' ≤ Rr`, que es I4. `E`, `N`, `R`, `S` no cambian, así que I1–I3 y I5 se mantienen.

**Entregar `q` (precondición `q ≤ Rr`):**

- `E' = E + q ≤ E + Rr = C − N`. Por tanto `E' + N ≤ C` (I2) y `E' ≤ C` (I1).
- `Rr' = C − E' − N = Rr − q ≥ 0`.
- `P' = min(P, Rr') ≥ 0` (I4 a la izquierda) y `P' ≤ Rr'` (I4 a la derecha, por definición de `min`).
- `R` y `S` no cambian; `R + S ≤ E ≤ E'` (I3).

**Liberar `q` (precondición `q ≤ Rr`):** misma demostración con `N' = N + q`, `E` fijo, `Rr' = Rr − q`.

**Devolver con o sin reingreso `q` (precondición `R + S + q ≤ E`):** `E` y `N` no cambian, así que `Rr` y `P` no cambian. Tras la operación `R' + S' = R + S + q ≤ E`, que es I3.

**Rechazos:** cada precondición se evalúa en la misma sentencia que modifica la fila. Si falla, no hay cambio.

**Conjunto de invariantes:** I5 se mantiene porque `MOSTRADOR` no admite preparar, liberar ni entregar (`Rr = 0`).

**Verificación en modelo de referencia:** un modelo secuencial de la regla de §2.4 y §2.5 se ejecutó en el entorno de trabajo de ATLAS. El script es **no versionado** (no está en el repositorio) y debe reproducirse como parte de T23 en FARO. Resultado observado: 2000 secuencias aleatorias de 400 operaciones (cobrar, preparar, entregar, liberar, devolver con y sin reingreso, con rechazos incluidos). Tras cada paso comprobó I1–I8, no negatividad y que un rechazo no modifica el estado. Resultado: sin violaciones. **Limitaciones:** es un modelo de un producto, sin concurrencia, sin idempotencia y sin PostgreSQL. No sustituye T21–T23.

### 2.7 Ejemplos numéricos

**Ejemplo A — entregas parciales, preparación y devolución diferenciada.** Línea `C = 3`, stock inicial 10, reserva 0.

| Paso | Acción | `P` | `E` | `N` | `R` | `S` | `Rr` | `Pc` | `stockActual` | `stockReservado` |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 | Cobro bodega | 0 | 0 | 0 | 0 | 0 | 3 | 0 | 10 | 3 |
| 1 | Preparar 2 | 2 | 0 | 0 | 0 | 0 | 3 | 0 | 10 | 3 |
| 2 | Entregar 1 | 2 | 1 | 0 | 0 | 0 | 2 | 1 | 9 | 2 |
| 3 | Entregar 2 | 0 | 3 | 0 | 0 | 0 | 0 | 3 | 7 | 0 |
| 4 | Devolver 1 con reingreso | 0 | 3 | 0 | 1 | 0 | 0 | 2 | 8 | 0 |
| 5 | Devolver 1 dañado | 0 | 3 | 0 | 1 | 1 | 0 | 1 | 8 | 0 |
| 6 | Intentar devolver 2 con reingreso | — | — | — | — | — | — | — | Rechazado (`R + S + 2 = 4 > 3`) | — |

En el paso 2, `P` pasa de 2 a `min(2, 2) = 2`. En el paso 3, `P` pasa de 2 a `min(2, 0) = 0`: la entrega consumió la preparación porque ya no hay reserva que la respalde.

**Ejemplo B — liberación de unidades preparadas.** Línea `C = 3`, `P = 2`, `E = 0`, `N = 0`. Liberar 2: `Rr' = 1`, `P' = min(2, 1) = 1`. La unidad preparada que sobra sigue preparada y pendiente.

### 2.8 Mostrador y sin inventario

- `MOSTRADOR`: al cobrar, `E = C`. No hay `P` ni `N` sobre pedidos. Devoluciones con reingreso o sin reingreso sí aplican (§2.4).
- `SIN_INVENTARIO`: fuera de todos los contadores (I6). Mantiene el flujo actual (P9).

---

## 3. Integridad de eventos

### 3.1 Por qué el índice único por línea estaba mal

Un índice único `(documento_id, detalle_venta_id)` para `ENTREGA` impide dos movimientos de la misma línea. Eso bloquea entregas parciales legítimas. La unicidad correcta es por **evento**, no por línea.

### 3.2 Identificadores

| Identificador | Tipo en PostgreSQL | Restricción |
|---|---|---|
| `evento_id` | `TEXT` (UUID v4 generado por el servidor) | Clave primaria de `entregas_eventos` |
| `solicitud_id` | `TEXT` (UUID v4 generado por el cliente) | `UNIQUE (tenant_id, solicitud_id)` |
| `huella` | `CHAR(64)` (SHA-256 hexadecimal en minúsculas) | `CHECK (huella ~ '^[0-9a-f]{64}$')` |
| Línea de evento | `(tenant_id, evento_id, detalle_venta_id)` | Clave primaria |
| `operacion_id` (offline, existente) | `TEXT` | Se usa como `solicitud_id` del cobro offline |

**Por qué `TEXT`:** coincide con `@default(uuid())` de Prisma en todo el esquema. Un tipo `UUID` nativo obligaría a una excepción en Prisma.

### 3.3 Tablas

**`entregas_eventos`** (solo inserción):

```
id              TEXT PK                        -- evento_id
tenant_id       TEXT NOT NULL
solicitud_id    TEXT NOT NULL
huella          CHAR(64) NOT NULL
tipo            TEXT NOT NULL CHECK (tipo IN ('COBRO','PREPARACION','ENTREGA',
                  'LIBERACION','DEVOLUCION_REINGRESO','DEVOLUCION_SIN_REINGRESO'))
venta_id        TEXT NOT NULL
usuario_id      TEXT NOT NULL                  -- responsable del evento
receptor_nombre TEXT NULL                      -- obligatorio en ENTREGA de BODEGA (P4), validado en aplicación
motivo          TEXT NULL                      -- obligatorio en LIBERACION y DEVOLUCION_* (≥ 10 caracteres)
origen          TEXT NOT NULL CHECK (origen IN ('ONLINE','OFFLINE'))
dispositivo_id  TEXT NULL
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()

UNIQUE (tenant_id, solicitud_id)
UNIQUE (tenant_id, id)                         -- referenciable desde tablas hijas
FOREIGN KEY (tenant_id, venta_id)   REFERENCES ventas (tenant_id, id)
FOREIGN KEY (tenant_id, usuario_id) REFERENCES usuarios (tenant_id, id)
CHECK (huella ~ '^[0-9a-f]{64}$')
CHECK (tipo NOT IN ('LIBERACION','DEVOLUCION_REINGRESO','DEVOLUCION_SIN_REINGRESO')
       OR length(motivo) >= 10)
```

**`entregas_eventos_lineas`** (solo inserción):

```
tenant_id        TEXT NOT NULL
evento_id        TEXT NOT NULL
detalle_venta_id TEXT NOT NULL
cantidad         NUMERIC(12,2) NOT NULL CHECK (cantidad > 0)

PRIMARY KEY (tenant_id, evento_id, detalle_venta_id)
FOREIGN KEY (tenant_id, evento_id)        REFERENCES entregas_eventos (tenant_id, id)
FOREIGN KEY (tenant_id, detalle_venta_id) REFERENCES detalles_venta (tenant_id, id)
```

**`movimientos_inventario`** (existente, columnas nuevas):

```
evento_id        TEXT NULL
detalle_venta_id TEXT NULL

FOREIGN KEY (tenant_id, evento_id)        REFERENCES entregas_eventos (tenant_id, id)
FOREIGN KEY (tenant_id, detalle_venta_id) REFERENCES detalles_venta (tenant_id, id)
FOREIGN KEY (tenant_id, producto_id)      REFERENCES productos (tenant_id, id)   -- nueva comprobación
UNIQUE INDEX (tenant_id, evento_id, detalle_venta_id)
  WHERE evento_id IS NOT NULL AND detalle_venta_id IS NOT NULL
```

Ese índice no impide entregas sucesivas: cada una tiene su `evento_id`. Solo impide dos movimientos de la misma línea dentro del mismo evento.

### 3.4 Transacción de entrega

Dentro de una transacción con `lockTenant` (bloqueo asesor por tenant, igual que hoy):

1. **Huella y solicitud (§3.6).**
2. **Líneas en orden de `id`** (evita interbloqueos entre entregas simultáneas).
3. Por cada línea: sentencia de §2.5 (CAS con `tenant_id`, `LEAST` de `P`).
4. Por cada línea entregada: `UPDATE productos ... WHERE tenant_id = $t AND id = $p AND stock_actual >= $q AND stock_reservado >= $q`. Si afecta 0 filas, se revierte.
5. Movimiento `ENTREGA` con `evento_id` y `detalle_venta_id`.
6. Filas en la línea de evento.
7. Auditoría en `auditoria_operaciones`.

Cualquier fallo revierte la transacción completa: no hay evento a medias ni contadores a medias.

### 3.5 Duplicados por doble clic con solicitudes distintas

**P12 no se implementa.** La ventana de 30 segundos queda documentada como **propuesta no aprobada**.

Sin P12, un doble clic con dos `solicitud_id` distintos sí aplica dos entregas, siempre que haya cantidad pendiente. La protección que queda es:

- **Tope acumulado:** nunca se entrega más de lo vendido (§2.5).
- **Formulario con solicitud única:** el cliente genera `solicitud_id` al abrir el formulario y deshabilita el botón tras el primer envío. Esto reduce el riesgo, pero no lo elimina.

Este riesgo queda en la lista de riesgos residuales con severidad media (§13).

### 3.6 Huella de solicitud y conflicto explícito

**3.6.1 Definición de la huella.**

```
huella = SHA-256(canonicalJSON(payloadSemantico))

payloadSemantico = {
  "v": 1,
  "tipo": <tipo de evento>,            // ver §3.3
  "ventaId": <string>,
  "usuarioId": <string>,               // actor que envía la acción
  "origen": "ONLINE" | "OFFLINE",
  "lineas": [                          // ordenadas por detalleVentaId ascendente
     { "detalleVentaId": <string>, "cantidadCentesimas": <entero> }
  ],
  "receptorNombre": <string> | null,   // NFC, recortado, espacios múltiples colapsados
  "motivo": <string> | null            // NFC, recortado, espacios múltiples colapsados
}
```

**Reglas de canonicalización:**

- JSON canónico: claves ordenadas lexicográficamente, sin espacios, enteros sin ceros a la izquierda, cadenas en UTF-8 normalizadas NFC.
- Cantidades siempre en **centésimas enteras**. `2`, `2.0` y `2.00` producen la misma huella.
- Líneas ordenadas antes de serializar. Mismas líneas en distinto orden producen la misma huella.
- **Excluidos** de la huella: `created_at`, `dispositivo_id`, `solicitud_id`, `evento_id`, cualquier campo de presentación.

**Motivo de excluir el dispositivo:** un reintento desde otro equipo con el mismo contenido sigue siendo el mismo intento. La decisión es documentada y revisable por CENTINELA (pregunta 3 del contrato).

**3.6.2 Matriz de comportamiento ante una solicitud reutilizada.**

Se busca `(tenant_id, solicitud_id)` dentro de la transacción, después del bloqueo asesor por `('ENT:' || tenant_id || ':' || solicitud_id)`.

| Caso | Resultado | Efectos |
|---|---|---|
| No existe fila | Se procesa la acción y se inserta el evento con su huella | Sí (una vez) |
| Existe, misma huella | **Respuesta de repetición:** 200 con el mismo `evento_id` y las mismas líneas | Ninguno |
| Existe, huella distinta | **409 `SOLICITUD_REUTILIZADA`**, mensaje genérico, sin revelar el contenido del evento original | Ninguno |
| Existe en otro tenant | No se encuentra (filtro por tenant). Se procesa como caso «no existe» | Sí, si la acción es válida |
| Formato de `solicitud_id` inválido | 400 | Ninguno |
| Fallo a mitad de transacción | Rollback completo; no queda fila de solicitud | Ninguno; reintento permitido |

**3.6.3 Diferencia con el patrón de ventas.** La venta usa el ID de la venta como clave de idempotencia. Esa clave es global: un UUID de otra empresa devuelve conflicto, lo que confirma la existencia de un identificador ajeno. **Las entregas no siguen ese patrón**: la clave es por tenant y la huella es canónica. Se registra como hallazgo para CENTINELA (§13).

**3.6.4 Conflicto también para el cobro offline.** `operacion_id` se trata con la misma regla: misma huella = repetición; huella distinta = conflicto explícito, con el código `OPERACION_ALTERADA` ya existente en contingencia. La huella offline usa la misma canonicalización.

**3.6.5 Concurrencia.** Dos solicitudes con el mismo `solicitud_id` y payloads distintos que llegan a la vez:
- El bloqueo asesor por `('ENT:' || tenant || ':' || solicitud)` las serializa.
- Si la restricción `UNIQUE` detecta una inserción duplicada, la transacción se revierte y la segunda relee la fila para decidir entre repetición y conflicto.
- Resultado: exactamente un evento; la otra solicitud recibe repetición o conflicto según su huella.

### 3.7 Aislamiento multi-tenant

**3.7.1 Principio:** un evento, una línea de evento o un movimiento **no puede** referenciar una venta, línea o producto de otro tenant. La base lo impide mediante claves foráneas compuestas `(tenant_id, …)`.

**3.7.2 Claves referenciables.** Se añaden restricciones `UNIQUE (tenant_id, id)` en:

| Tabla | Restricción nueva | Motivo |
|---|---|---|
| `ventas` | `UNIQUE (tenant_id, id)` | Referenciada por eventos |
| `detalles_venta` | `tenant_id` nuevo (`NOT NULL`, relleno desde `ventas`) y `UNIQUE (tenant_id, id)` | Referenciada por líneas de evento y movimientos |
| `productos` | `UNIQUE (tenant_id, id)` | Referenciada por movimientos |
| `usuarios` | `UNIQUE (tenant_id, id)` | Responsable de eventos |
| `entregas_eventos` | `UNIQUE (tenant_id, id)` | Referenciada por líneas de evento y movimientos |

**3.7.3 Qué impide cada clave.**

| Intento | Qué lo impide |
|---|---|
| Evento del tenant A con venta del tenant B | FK `(tenant_id, venta_id)` |
| Evento del tenant A con responsable del tenant B | FK `(tenant_id, usuario_id)` |
| Línea de evento del tenant A con detalle del tenant B | FK `(tenant_id, detalle_venta_id)` |
| Movimiento del tenant A con producto del tenant B | FK `(tenant_id, producto_id)` |
| Línea de evento con `tenant_id` distinto al del evento | FK `(tenant_id, evento_id)` |
| `detalles_venta` con `tenant_id` distinto al de su venta | FK `(tenant_id, venta_id)` de `detalles_venta` (nueva) |

**3.7.4 Índices.** Todas las consultas de estas tablas empiezan por `tenant_id`:

- `entregas_eventos (tenant_id, venta_id, created_at)`
- `entregas_eventos (tenant_id, created_at)`
- `detalles_venta (tenant_id, venta_id)`
- Índice parcial de pendientes: `detalles_venta (tenant_id) WHERE modo_entrega = 'BODEGA' AND cantidad > cantidad_entregada + cantidad_cancelada`
- `movimientos_inventario (tenant_id, producto_id, created_at)` (existente)

**3.7.5 Transacciones.**

- Todas las escrituras van dentro de `lockTenant` y en la misma transacción que sus filas hijas.
- Todas las sentencias de la aplicación incluyen `tenant_id` en `WHERE` (ejemplo §2.5).
- Una consulta sin `tenant_id` sobre estas tablas es un defecto de revisión. FARO debe incluir una comprobación estática (T55).

**3.7.6 Respuesta a un identificador ajeno.** Si una petición incluye una línea de otro tenant, la aplicación responde 404 «línea no encontrada» sin distinguir si existe. No hay confirmación de existencia ajena.

**3.7.7 Seguridad a nivel de fila.** No existe RLS en el proyecto. Se deja como decisión de NEXUS y CENTINELA (P-N3). El diseño no depende de RLS: las FK compuestas son la defensa en base de datos.

---

## 4. Flujos

### 4.1 Mostrador (`MOSTRADOR`)

**Cajero:** seleccionar productos → «Cobrar y entregar» → comprobante «Entregado en el momento del cobro».

**Transacción única:**
1. Venta `COMPLETADA`, `usuario_id` = cajero.
2. Evento `COBRO` y evento `ENTREGA` con las líneas, `usuario_id` = cajero, `receptor_nombre` opcional, `origen`.
3. Por línea: `E = C` (§2.5), stock descontado con condición, movimiento `ENTREGA` con `evento_id`.
4. Caja: movimiento de cobro.

**Sin existencias disponibles:** «No hay existencias disponibles para entregar ahora. Si la mercancía está pendiente de entregar, use Cobrar y dejar en bodega.» Sin venta, sin caja, sin movimiento.

### 4.2 Bodega o pedido (`BODEGA`)

**Cobro:** «Cobrar y dejar en bodega». Evento `COBRO`, reserva, caja. Sin receptor.

**Preparación (BODEGUERO o ADMIN; opcional, P3):** evento `PREPARACION` con cantidades por línea, validadas por `P + q ≤ Rr` (§2.4). No cambia stock.

**Entrega (BODEGUERO o ADMIN; P3):**
- Formulario con nombre del receptor (obligatorio, P4), cantidad por línea y botón «Confirmar entrega».
- Transacción §3.4 por línea.
- Entregas parciales y sucesivas permitidas.

**Liberación (ADMIN, motivo ≥ 10 caracteres, P7):** evento `LIBERACION`, `N += q`, reserva −q, `P = min(P, Rr')`. No cambia stock físico. No devuelve dinero: el reembolso sigue la devolución formal.

### 4.3 Devoluciones: reingreso frente a no reingreso

| Caso | Destino en la aplicación | Evento | Contador | Stock | Condición |
|---|---|---|---|---|---|
| Pendiente (`BODEGA`), cliente desiste | Liberación | `LIBERACION` | `N` | `stockReservado −= q` | `q ≤ Rr` |
| Entregada, unidad vuelve **en condición de venta** | `INVENTARIO` | `DEVOLUCION_REINGRESO` | `R` | `stockActual += q` (movimiento `INGRESO`) | `R + S + q ≤ E` |
| Entregada, unidad vuelve **dañada** | `DAÑADO` | `DEVOLUCION_SIN_REINGRESO` | `S` | **Ninguno** | `R + S + q ≤ E` |
| Entregada, unidad se envía **al proveedor** | `PROVEEDOR` | `DEVOLUCION_SIN_REINGRESO` | `S` | **Ninguno** | `R + S + q ≤ E` |
| Entregada, marcada `NO_ENTREGADO` | — | — | — | — | **Rechazado** |
| Pendiente, destino `INVENTARIO`, `DAÑADO` o `PROVEEDOR` | — | — | — | — | **Rechazado** |

**Regla de no reingreso:** `DAÑADO` y `PROVEEDOR` **no modifican existencias**. La unidad volvió al local pero no se vende; no se suma a `stockActual`, porque no es una existencia vendible. Si el envío al proveedor debe registrar una salida de existencias, es un evento de compras o de ajuste de KARDEX, **fuera** de esta devolución.

**Regla de tope:** `R + S ≤ E`. Ninguna devolución, con o sin reingreso, puede reintegrar o registrar más unidades de las realmente entregadas. Esta regla sustituye al tope actual contra `cantidad − devuelto`.

**Nota de compatibilidad:** `operaciones.service.ts` hoy trata `DAÑADO` y `PROVEEDOR` sin movimiento de stock, y `INVENTARIO` con movimiento. Esa separación ya existe en código; el diseño la mantiene y añade el tope contra `E`.

### 4.4 Contingencia offline

- **Solo `MOSTRADOR`.** El DTO rechaza `BODEGA` y `SIN_INVENTARIO` con error de validación.
- Al sincronizar: eventos `COBRO` y `ENTREGA` con `solicitud_id = operacion_id`, `origen = OFFLINE`, `created_at` = hora de sincronización. La hora del cobro se guarda aparte en la operación offline.
- La huella offline usa la canonicalización de §3.6.1.

---

## 5. Inventario único (P2)

- Una existencia por producto y por empresa. No hay ubicaciones de stock.
- `modo_entrega` (`MOSTRADOR`, `BODEGA`, `SIN_INVENTARIO`) describe **cómo se entregó o si queda pendiente**. No describe dónde está la mercancía.
- Los textos de pantalla no dicen «en mostrador» como si fuera una ubicación.

---

## 6. Trazabilidad

| Dato | Dónde | Obligatorio |
|---|---|---|
| Cajero que cobró | `ventas.usuario_id` (existente) | Sí |
| Responsable de cada evento | `entregas_eventos.usuario_id` | Sí |
| Modo de entrega por línea | `detalles_venta.modo_entrega` | Sí |
| Receptor (nombre) | `entregas_eventos.receptor_nombre` | Sí en `ENTREGA` de `BODEGA` (P4) |
| Receptor (documento) | No se captura en esta fase | — |
| Motivo de liberación o devolución | `entregas_eventos.motivo` | Sí |
| Hora y origen | `created_at`, `origen`, `dispositivo_id` | Sí |
| Huella de la solicitud | `entregas_eventos.huella` | Sí |

Las tablas de eventos son solo de inserción: un trigger impide `UPDATE` y `DELETE`.

---

## 7. Base de datos

### 7.1 Migración aditiva (no ejecutada)

Nombre propuesto: `20261012000000_entrega_eventos_y_cantidades`. Se ejecuta como **una sola migración transaccional**, en el orden indicado. Ningún paso depende de un paso posterior.

**Orden:**

| Paso | Acción | Motivo |
|---|---|---|
| 1 | `ALTER TABLE detalles_venta ADD COLUMN tenant_id TEXT`; `UPDATE` desde `ventas.tenant_id`; `SET NOT NULL`; FK a `tenants (id)` | Necesario para las FK compuestas |
| 2 | `UNIQUE (tenant_id, id)` en `ventas`, `productos`, `usuarios` y `detalles_venta` | Referenciables por FK compuesta |
| 3 | Columnas nuevas en `detalles_venta`: `modo_entrega` (con `DEFAULT 'BODEGA'` temporal), `cantidad_preparada`, `cantidad_entregada`, `cantidad_devuelta_reingresada`, `cantidad_devuelta_sin_reingreso`, `cantidad_cancelada`, todas `NUMERIC(12,2) NOT NULL DEFAULT 0` | Contadores |
| 4 | *Backfill* de `sin_inventario`: `modo_entrega = 'SIN_INVENTARIO'` donde `sin_inventario = true` | Evita que cuenten como reserva |
| 5 | *Backfill* de entregadas: ventas con `entregado_at IS NOT NULL` y `origen = 'ONLINE'`: `modo_entrega = 'BODEGA'`, `cantidad_entregada = cantidad` en líneas con inventario. Para `origen = 'CONTINGENCIA'`: `modo_entrega = 'MOSTRADOR'`, `cantidad_entregada = cantidad` | Coherencia con I5 y con I8 |
| 6 | Ventas **abiertas** (`reserva_pendiente = true`, `entregado_at IS NULL`): **no se modifican**. Sus contadores quedan en 0 y `modo_entrega = 'BODEGA'`, de modo que `Rr = C` coincide con la reserva actual | P6 |
| 7 | Crear `entregas_eventos` y `entregas_eventos_lineas` con sus claves e índices | Destino de las FK de movimientos |
| 8 | `ALTER TABLE movimientos_inventario ADD COLUMN evento_id TEXT, ADD COLUMN detalle_venta_id TEXT`; FK compuestas; índice único parcial | Trazabilidad |
| 9 | Verificación: `DO $$ ... RAISE EXCEPTION ... $$` que comprueba I1–I8 sobre los datos existentes y aborta si alguna falla | Falla rápida, sin estado parcial |
| 10 | `CHECK` de cantidades y de modo (§7.2) | Después de validar los datos |
| 11 | `ALTER COLUMN modo_entrega DROP DEFAULT` | Ninguna inserción futura puede omitir el modo |
| 12 | Triggers de inmutabilidad y de cambio de modo | Protección |

### 7.2 Restricciones de `detalles_venta`

```sql
ALTER TABLE detalles_venta
  ADD CONSTRAINT detalles_venta_tenant_fk
    FOREIGN KEY (tenant_id, venta_id) REFERENCES ventas (tenant_id, id),
  ADD CONSTRAINT detalles_venta_modo_chk
    CHECK (modo_entrega IN ('MOSTRADOR','BODEGA','SIN_INVENTARIO')),
  ADD CONSTRAINT detalles_venta_sin_inventario_chk
    CHECK (sin_inventario = (modo_entrega = 'SIN_INVENTARIO')),
  ADD CONSTRAINT detalles_venta_no_negativos_chk
    CHECK (cantidad_preparada >= 0 AND cantidad_entregada >= 0
       AND cantidad_devuelta_reingresada >= 0 AND cantidad_devuelta_sin_reingreso >= 0
       AND cantidad_cancelada >= 0),
  ADD CONSTRAINT detalles_venta_I2_chk
    CHECK (cantidad_entregada + cantidad_cancelada <= cantidad),
  ADD CONSTRAINT detalles_venta_I3_chk
    CHECK (cantidad_devuelta_reingresada + cantidad_devuelta_sin_reingreso <= cantidad_entregada),
  ADD CONSTRAINT detalles_venta_I4_chk
    CHECK (cantidad_preparada <= cantidad - cantidad_entregada - cantidad_cancelada),
  ADD CONSTRAINT detalles_venta_I5_chk
    CHECK (modo_entrega = 'BODEGA'
       OR (cantidad_cancelada = 0 AND cantidad_preparada = 0)),
  ADD CONSTRAINT detalles_venta_sin_inv_contadores_chk
    CHECK (modo_entrega <> 'SIN_INVENTARIO'
       OR (cantidad_entregada = 0 AND cantidad_preparada = 0 AND cantidad_cancelada = 0
           AND cantidad_devuelta_reingresada = 0 AND cantidad_devuelta_sin_reingreso = 0));
```

**Nota sobre I5 para `MOSTRADOR`:** `E = C` no se fuerza con `CHECK`, porque se cumple en la misma transacción del cobro. Se verifica en la prueba T01 y en el informe de conciliación.

**Nota sobre `productos`:** `ALTER TABLE productos ADD CONSTRAINT productos_reservado_no_negativo CHECK (stock_reservado >= 0)`. No se añade `stock_reservado <= stock_actual` (I8).

### 7.3 Vista de estado derivado

`v_detalle_entrega` calcula `rr`, `pc` y el estado de §2.4. Las pantallas y la conciliación leen de la vista; no guardan estados.

### 7.4 Triggers

- `entregas_eventos`, `entregas_eventos_lineas`: impiden `UPDATE` y `DELETE`.
- `detalles_venta`: impide cambiar `modo_entrega` después del cobro.

---

## 8. Alertas (P5 — configurable)

Sin cambios respecto de la revisión 2. Nunca se cancela una venta pagada por tiempo.

| Nivel | Condición | Quién ve | Acción |
|---|---|---|---|
| Informativo | Pendiente con `Rr > 0` por más de `alertaInformativaHoras` | Pestaña «Pedidos por entregar» | Ninguna |
| Aviso | Más de `alertaAvisoHoras` | Cajero que cobró, al iniciar sesión | Entregar |
| Escalamiento | Más de `alertaEscalamientoDias` | Resumen diario para ADMIN | Entregar o liberar con motivo |

Valores por defecto: 2 h, 24 h y 3 días, en la configuración JSON del tenant (sin migración).

---

## 9. Cambios por capa

### 9.1 Backend

| Archivo | Cambio |
|---|---|
| `ventas/dto` | Línea acepta `modoEntrega: 'MOSTRADOR' \| 'BODEGA' \| 'SIN_INVENTARIO'`. Por defecto `BODEGA` mientras el POS no lo envíe. `SIN_INVENTARIO` se asigna cuando `sinInventario = true`. |
| `ventas/ventas.service.ts` | `create`: `MOSTRADOR` entrega en el cobro (§4.1); `BODEGA` reserva; crea evento `COBRO`. Mantiene la idempotencia por venta existente (§1). |
| `operaciones/huella-solicitud.ts` (nuevo) | Canonicalización y SHA-256 de §3.6.1. No reutiliza `fingerprint` de `ledger.ts`, que no ordena claves ni normaliza. |
| `operaciones/operaciones.service.ts` | `preparar`, `entregarLineas`, `liberarPendiente`, `devolverReingreso`, `devolverSinReingreso`. Cada uno usa §3.4 y §3.6. `entregar` (legado) entrega lo pendiente de `BODEGA` y exige receptor. `devolver` se separa en las dos vías de §4.3. |
| `operaciones/ledger.ts` | `movement` recibe `eventoId` y `detalleVentaId`. |
| `operaciones/operaciones.controller.ts` | `POST /operaciones/ventas/:id/entregas`, `POST /operaciones/ventas/:id/preparacion`, `POST /operaciones/ventas/:id/liberaciones`, `POST /operaciones/ventas/:id/devoluciones-reingreso`, `POST /operaciones/ventas/:id/devoluciones-sin-reingreso`, `GET /operaciones/entregas/alertas`, `GET /operaciones/conciliacion/existencias`. |
| `contingencia/contingencia.service.ts` | Rechaza `BODEGA` y `SIN_INVENTARIO`. Crea eventos `COBRO` y `ENTREGA` con `solicitud_id = operacion_id`. |
| `contingencia/dto` | `modoEntrega` solo admite `MOSTRADOR`. |

**Compatibilidad:** `POST /operaciones/ventas/:id/entregar` se mantiene para el frontend actual. Exige receptor. Responde 400 sin receptor.

### 9.2 Frontend

Sin cambios respecto de la revisión 2 en pantallas. Las leyendas de comprobante dicen «Entregado en el momento del cobro» o «PENDIENTE DE ENTREGA». El formulario de entrega permite cantidades por línea y muestra estados derivados (§2.4).

### 9.3 Configuración

- Umbrales de alerta (§8).
- Sin configuración de ventana anti-repetición (P12 no aprobada).

---

## 10. Garantías

| # | Garantía | Mecanismo |
|---|---|---|
| G1 | Nunca se entrega más de lo vendido ni se reintegra o registra más de lo entregado | CAS con `tenant_id`; `CHECK` I2 e I3 |
| G2 | Entregas parciales sucesivas son posibles | Eventos distintos; sin índice por línea |
| G3 | Reintentos no duplican efectos | `UNIQUE (tenant_id, solicitud_id)` + huella + bloqueo asesor |
| G4 | Una sola línea de movimiento por línea y evento | `UNIQUE (tenant_id, evento_id, detalle_venta_id)` |
| G5 | Sin existencias negativas por entrega | `stock_actual >= q` en el mismo `UPDATE` |
| G6 | Sincronización offline sin duplicados | `operacion_id` como `solicitud_id`, con huella |
| G7 | Reservas consistentes | I7 y conciliación |
| G8 | Existencias consistentes | I8 y conciliación |
| G9 | Sin transiciones fuera de orden | Estados derivados de contadores; CAS |
| G10 | Sin cancelación automática | Ninguna acción por tiempo |
| G11 | Ninguna fila referencia a otro tenant | FK compuestas `(tenant_id, …)` (I9) |
| G12 | Solicitud reutilizada con otro contenido produce conflicto explícito | Huella canónica y matriz §3.6.2 |
| G13 | `P` nunca supera la reserva restante | Regla `min` en la misma sentencia (§2.5, §2.6) |
| G14 | Contadores iguales a la suma de eventos | I10, verificado en conciliación y T23 |

---

## 11. Plan de pruebas para FARO

Niveles: **U** unitaria, **I** integración PostgreSQL real, **S** E2E simulado, **R** E2E real, **F** físico, **M** mutación.

**Estado de cada prueba:** todas están **pendientes de escritura en rojo**. Ninguna se considera ejecutada.

### 11.1 Cobro y entrega

| ID | Prueba | Nivel | Garantía |
|---|---|---|---|
| T01 | Cobro `MOSTRADOR`: `E = C`, stock −C, eventos `COBRO` y `ENTREGA` con `evento_id` | I | G5, G4 |
| T02 | Cobro `MOSTRADOR` sin disponibilidad: rechazo sin venta, caja ni movimiento | I | G5 |
| T03 | Cobro `BODEGA`: `E = 0`, `Rr = C`, `stockReservado += C`, `stockActual` sin cambio | I | I7 |
| T04 | Entrega parcial (1 de 2): `E = 1`, stock −1, reserva −1 | I | G1 |
| T05 | Entrega total: `E = C`, reserva 0, estado `ENTREGADA`, responsable y receptor registrados | I | G1 |
| T06 | Entrega de `BODEGA` sin receptor: 400 | I | P4 |
| T07 | Reintento con la misma `solicitud_id` y misma huella: 200 con mismo `evento_id`, sin filas nuevas | I | G3 |
| T08 | **Dos entregas legítimas sucesivas** (1 + 1 de una línea de 2): ambas aplicadas, `E = 2`, dos eventos, dos movimientos | I | G2 |
| T09 | Entrega que excede lo pendiente: 409, sin efectos | I | G1 |
| T10 | Entregas simultáneas con solicitudes distintas que suman más del pendiente: solo caben las que caben; `E ≤ C` | I | G1 |
| T11 | Dos movimientos con el mismo `(tenant, evento, línea)`: rechazado por índice | I | G4 |
| T12 | Entrega con `stockActual` insuficiente: rechazo sin efectos | I | G5 |

### 11.2 Preparación, cancelación y `cantidad_preparada`

| ID | Prueba | Nivel | Garantía |
|---|---|---|---|
| T13 | Preparar `q`: `P += q`; `P + q > Rr` rechazado | I | I4 |
| T13a | Preparar 2 de 3, entregar 1: `P` pasa de 2 a 2 (`min(2, 2)`) | I | G13 |
| T13b | Preparar 2 de 3, entregar 2: `P` pasa de 2 a 0 (`min(2, 0)`) | I | G13 |
| T13c | Preparar 2 de 3, liberar 2: `P` pasa de 2 a 1 (`min(2, 1)`) | I | G13 |
| T13d | Secuencia preparar, entregar, liberar, entregar sobre línea de 5: `P ≤ Rr` tras cada paso; ejemplo §2.7-A | I | G13 |
| T14 | Liberar parcial pendiente (ADMIN, motivo): `N` sube, reserva baja, stock físico igual | I | I2 |
| T15 | Liberar más de lo pendiente: 409 | I | I2 |
| T16 | Liberar línea con entregas parciales: solo lo no entregado | I | I2 |
| T16a | Liberar por usuario CAJERO o BODEGUERO: 403 | I | CENTINELA |

### 11.3 Devoluciones con y sin reingreso

| ID | Prueba | Nivel | Garantía |
|---|---|---|---|
| T17 | Devolución con reingreso de 1 de 3 entregadas: `R = 1`, `stockActual += 1`, movimiento `INGRESO` | I | I3, I8 |
| T18 | Devolución con reingreso que excede `E − R − S`: 409 | I | I3 |
| T19 | Devolución `DAÑADO` de 1: `S = 1`, `stockActual` **sin cambio** | I | I3, I8 |
| T19a | Devolución `PROVEEDOR` de 1: igual que T19 | I | I3, I8 |
| T20 | Mezcla: reingreso 1 y dañado 1 de 2 entregadas: `R + S = 2 ≤ E`; una tercera unidad rechazada | I | I3 |
| T21 | Devolución `NO_ENTREGADO` sobre línea entregada: rechazada | I | §4.3 |
| T22 | Devolución con reingreso o sin reingreso sobre línea pendiente: rechazada | I | §4.3 |
| T23 | Tras 2000 secuencias aleatorias de 400 operaciones (semillas fijas) sobre PostgreSQL: I1–I6, I10 y no negatividad | I | I1–I6, I10 |
| T24 | **No aplica.** La ventana de 30 segundos (P12) no se implementa. Se conserva el número para trazabilidad del diseño | — | — |
| T24a | Verificar que el código no contiene la ventana de 30 segundos (comprobación estática) | U | P12 |

### 11.4 Invariantes de existencias y reservas

| ID | Prueba | Nivel | Garantía |
|---|---|---|---|
| T21a | Tras la secuencia de T23: I7 (`stockReservado = Σ Rr`) | I | I7 |
| T22a | Tras la secuencia de T23: I8 (`stockActual = S₀ + ingresos − ΣE + ΣR`), con `S` excluido | I | I8 |
| T22b | Tras la secuencia de T23: I10 (contadores iguales a sumas de eventos) | I | I10 |
| T22c | Ajuste que deja `stockReservado > stockActual`: se registra y se reporta en conciliación; no se bloquea | I | P-K1 |

### 11.5 Solicitudes, huella y conflictos

| ID | Prueba | Nivel | Garantía |
|---|---|---|---|
| T42 | Misma `solicitud_id`, misma huella: repetición con el mismo `evento_id` | I | §3.6.2 |
| T43 | Misma `solicitud_id`, cantidad distinta: 409 `SOLICITUD_REUTILIZADA`, sin efectos | I | G12 |
| T44 | Misma `solicitud_id`, nombre de receptor distinto: 409 | I | G12 |
| T45 | Misma `solicitud_id`, otro usuario: 409 | I | G12 |
| T46 | Misma `solicitud_id` en otro tenant: no hay conflicto; cada tenant tiene su evento | I | G11, §3.6.3 |
| T47 | Misma huella con líneas en distinto orden, `2` y `2.00`, NFC y espacios distintos: repetición, no conflicto | U + I | §3.6.1 |
| T48 | Tres solicitudes simultáneas con misma `solicitud_id` y payloads distintos: exactamente un evento; las demás reciben repetición o 409 según su huella | I | §3.6.5 |
| T49 | Solicitud que falla a mitad: rollback; reintento con la misma `solicitud_id` y payload corregido permitido | I | §3.6.2 |
| T50 | `solicitud_id` no UUID v4: 400 | U | §3.2 |
| T50a | Operación offline con mismo `operacion_id` y otro contenido: conflicto `OPERACION_ALTERADA` (existente) con la misma huella | I | §3.6.4 |

### 11.6 Aislamiento multi-tenant

| ID | Prueba | Nivel | Garantía |
|---|---|---|---|
| T51 | SQL directo: evento del tenant A referenciando venta del tenant B: violación de FK | I | G11, I9 |
| T52 | SQL directo: línea de evento del tenant A referenciando detalle del tenant B: violación de FK | I | G11, I9 |
| T53 | SQL directo: movimiento del tenant A con producto del tenant B: violación de FK | I | G11, I9 |
| T54 | API: petición del tenant A con línea del tenant B: 404 sin revelar existencia | I | §3.7.6 |
| T55 | Comprobación estática: toda consulta sobre `entregas_eventos`, `entregas_eventos_lineas`, `detalles_venta` y `movimientos_inventario` incluye `tenant_id` | U | §3.7.5 |
| T56 | Lectura de eventos y alertas por usuario de otro tenant: sin resultados | I | Aislamiento |
| T57 | `detalles_venta` con `tenant_id` distinto al de su venta: violación de FK | I | I9 |

### 11.7 Alertas y tiempo

| ID | Prueba | Nivel | Garantía |
|---|---|---|---|
| T28 | Umbrales configurables (2 h, 24 h, 3 d) se aplican; por debajo no aparecen | I | §8 |
| T29 | Simulación de 30 días sin intervención: ninguna venta pagada cambia de estado ni de stock | I | G10 |

### 11.8 Migración, flujo y experiencia

| ID | Prueba | Nivel | Garantía |
|---|---|---|---|
| T30 | Migración en copia con ventas abiertas, entregadas, de contingencia y sin inventario: abiertas sin cambios; entregadas con *backfill*; I1–I10 válidos; paso 9 de §7.1 no aborta | I (copia) | §7.1 |
| T31 | Permisos (matriz CENTINELA): CAJERO no prepara; VENDEDOR no entrega; BODEGUERO no libera; ADMIN libera con motivo | I | CENTINELA |
| T32 | Aislamiento entre empresas en eventos, alertas y conciliación | I | Aislamiento |
| T33 | Flujo mostrador en UI: un clic de cobro, sin campos extra | S | Sencillez |
| T34 | Flujo bodega en UI: cobro, preparación, dos entregas parciales con receptor, estados visibles | S | Sencillez |
| T35 | Alertas en pestaña y panel móvil a 390 px | S | §8 |
| T36 | Reintento tras corte de red al entregar: un solo efecto | S | G3 |
| T37 | Flujo real completo con backend y PostgreSQL reales | R | Integración |
| T38 | Comprobantes: leyenda correcta para mostrador y pendiente | U + R | §9.2 |

### 11.9 Mutaciones (validan las pruebas)

| ID | Mutación | Prueba que debe fallar |
|---|---|---|
| T39 | Quitar los `CHECK` de cantidades | T23, T13 |
| T40 | Volver al índice único por `(documento, línea)` | **T08** (demuestra que la revisión 1 bloqueaba entregas legítimas) |
| T41 | Permitir `BODEGA` en contingencia | T25 |
| T56a | Quitar el bloqueo asesor y la `UNIQUE` de solicitud | T48 |
| T57a | Quitar `LEAST` de `P` en la sentencia de entrega | T13a, T13d |
| T57b | Quitar las FK compuestas `(tenant_id, …)` | T51, T52, T53 |
| T57c | Usar `fingerprint` sin canonicalizar | T47 |
| T57d | Tratar `DAÑADO` como reingreso (sumar a `stockActual`) | T19, T22a |

### 11.10 Físicas

| ID | Prueba | Nivel |
|---|---|---|
| F01 | Impresora térmica: comprobantes de mostrador y de pendiente en 58 y 80 mm | F |
| F02 | Entrega real con receptor en iPhone (Safari, panel admin) | F |

**Criterio de entrada para implementar:** T01–T23, T42–T57 escritas y en rojo antes de implementar; T30 ejecutada en copia con informe; F01–F02 con hardware.

---

## 12. Decisiones

| ID | Decisión | Estado |
|---|---|---|
| P1 | Variante B: entrega inmediata en mostrador y entrega diferida controlada | **Aprobado conceptualmente** |
| P2 | Inventario único por empresa | **Aprobado** |
| P3 | Entrega por BODEGUERO o ADMIN; preparación opcional | **Aprobado** |
| P4 | Nombre del receptor obligatorio para entregas de bodega; documento no se captura en esta fase | **Aprobado** |
| P5 | Alertas configurables: 2 h, 24 h, 3 días | **Aprobado** |
| P6 | Ventas abiertas sin cambios | **Aprobado** |
| P7 | Liberación de pendiente y reembolso mediante devolución formal | **Aprobado** |
| P8 | Separar cobro y reconocimiento contable | **Aprobado** (definición contable: BALANCE) |
| P9 | Mantener flujo actual de venta sin inventario | **Aprobado** |
| P10 | Migración solo en copia, con informe, antes de cualquier aplicación autorizada | **Aprobado** |
| P11 | Sin cancelación automática de ventas pagadas | **Aprobado** |
| P12 | Ventana anti-repetición de 30 s con confirmación | **No aprobada. No implementada. Documentada como propuesta** |
| P13 | Caducidad automática de reservas | **Excluida** (contraria a P11) |
| P-N1 | Modelar las FK compuestas en Prisma (relaciones compuestas) frente a dejarlas solo en SQL | **Pendiente de NEXUS** (recomendación de ATLAS: modelar en Prisma) |
| P-N2 | Tipo `TEXT` para IDs de eventos, en lugar de `UUID` nativo | **Propuesta de ATLAS**, pendiente de NEXUS (compatibilidad con `@default(uuid())`) |
| P-N3 | Uso de RLS además de FK compuestas | **Pendiente de NEXUS y CENTINELA** |
| P-N4 | Ubicación del código de huella y canonicalización | **Propuesta de ATLAS**, pendiente de NEXUS |
| P-K1 | Qué hacer si un ajuste deja `stockReservado > stockActual` | **Pendiente de KARDEX** (propuesta: avisar y registrar) |
| P-C1 | Retención del nombre del receptor y de motivos | **Pendiente de CENTINELA** |
| P-B1 | Tratamiento contable de devoluciones sin reingreso (`DAÑADO`, `PROVEEDOR`) | **Pendiente de BALANCE** |

---

## 13. Riesgos residuales

| Riesgo | Severidad | Mitigación |
|---|---|---|
| Doble clic con solicitudes distintas (P12 no aprobada) | Media | Formulario con `solicitud_id` por apertura; botón deshabilitado; tope de cantidades |
| Entregas parciales olvidadas | Media | Alertas (§8) |
| Cajero marca entregado sin entregar | Media | Reporte diario por cajero; responsable registrado |
| Receptor no verificado | Media | Nombre obligatorio; el sistema registra quién lo capturó, no lo verifica |
| Ventas abiertas no conciliadas con inventario físico | Alta | P6; informe de pedidos abiertos antes de la migración |
| Idempotencia de ventas usa el ID global (existencia de UUID ajeno observable) | Baja-media | Hallazgo para CENTINELA (§3.6.3); no se toca en esta fase |
| `fingerprint` existente no canonicaliza | Media | Huella nueva para entregas (§3.6.1); revisar uso en ventas con CENTINELA |
| Sin RLS: el aislamiento descansa en FK y en disciplina de consultas | Media | FK compuestas (§3.7); T55 comprobación estática; P-N3 |
| Prisma no modela CHECK, triggers ni índices parciales: riesgo de deriva en `migrate diff` | Alta para migraciones | NEXUS verifica la lista de deriva en copia antes de la migración |
| Devoluciones sin reingreso: pérdida contable no definida | Media | P-B1 (BALANCE) |
| Crecimiento de tablas de eventos | Baja | Índices por tenant y fecha; retención pendiente |

---

## 14. Coordinación y revisión

Contratos en `docs/POS_ENTREGA_CONTRATOS.md`, revisión 3. Cada área debe responder su validación. **Ninguna validación está completada.**

- **KARDEX:** eventos, contadores, categorías de devolución (reingreso frente a no reingreso), I7 a I10, P-K1.
- **CENTINELA:** matriz de permisos, huella y conflictos, aislamiento, RLS (P-N3), retención (P-C1).
- **BALANCE:** separación cobro y reconocimiento (P8), devoluciones sin reingreso (P-B1).
- **NEXUS:** estructura de eventos, compatibilidad con Prisma (P-N1, P-N2), orden de migraciones (§7.1), deriva de `migrate diff` (§13), ubicación de la huella (P-N4).

---

## 15. Próximos pasos

1. Revisión cruzada: KARDEX, CENTINELA, BALANCE y NEXUS responden sus validaciones.
2. FARO escribe T01–T23 y T42–T57 en rojo sobre la base actual.
3. Si las validaciones son favorables, ATLAS implementa en rama aparte, sin merge.
4. NEXUS verifica la migración en copia (T30), con informe de deriva.
5. Revisión conjunta antes de cualquier merge.

_Diseño listo para revisión cruzada. No listo para implementación hasta que las cuatro validaciones estén completas. Sin implementación en esta revisión. Sin migración productiva. Ventas abiertas sin cambios._

_Informe de ATLAS. Revisión 3._
