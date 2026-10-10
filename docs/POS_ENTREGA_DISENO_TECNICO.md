# Cobro y entrega — diseño técnico (revisión 2)

_Informe de **ATLAS** (POS y continuidad operativa). Diseño, sin implementación. No modifica ventas abiertas, no ejecuta migraciones y no se fusiona a `main`._

Revisión 2: corrige tres defectos de la revisión 1 (commit `a0aca443`): índice único que bloqueaba entregas parciales, falta de modelo matemático para cantidades, y lenguaje que implicaba conocer existencias por ubicación.

Base verificada en código: `claude/integracion-pos-offline-p1` (PR #129).

Contratos para KARDEX, CENTINELA y BALANCE: `docs/POS_ENTREGA_CONTRATOS.md` (revisión 2, pendientes de validación).

---

## 0. Correcciones respecto de la revisión 1

| # | Defecto de la revisión 1 | Corrección en esta revisión |
|---|---|---|
| 1 | Índice único `(documento_id, detalle_venta_id)` para `ENTREGA`. Una segunda entrega parcial de la misma línea violaba el índice y quedaba bloqueada. | La integridad pasa a tres mecanismos: identificador único de **evento** de entrega, idempotencia por **solicitud**, y **validación transaccional de cantidades acumuladas** con restricciones `CHECK` en base de datos (§3). |
| 2 | Estados y cantidades sin modelo matemático. No había límite explícito para devolver más de lo entregado. | Contadores acumulados por línea, invariantes formales, tabla de transiciones y restricciones compatibles con `NUMERIC(12,2)` (§2). |
| 3 | El diseño hablaba de entrega «desde mostrador» como si el sistema conociera ubicaciones físicas. | Inventario único por empresa (P2). `MOSTRADOR` y `BODEGA` son **modos de entrega**, no ubicaciones de stock. El sistema registra cómo se entregó, no dónde está físicamente cada unidad (§5). |

---

## 1. Línea base (verificada)

| Elemento | Situación |
|---|---|
| Venta | `POST /ventas` crea la venta `COMPLETADA` y reserva **toda** la venta (`stockReservado += cantidad`, `reserva_pendiente = true`). `backend/src/ventas/ventas.service.ts` ~213–275. |
| Entrega | `POST /operaciones/ventas/:id/entregar`, roles ADMIN, CAJERO, BODEGUERO. Descuenta stock y reserva **toda** la venta, fija `entregado_at`. No admite entregas parciales. `backend/src/operaciones/operaciones.service.ts` ~245–262. |
| Devolución | `POST /operaciones/ventas/:id/devoluciones`, ADMIN. Con `NO_ENTREGADO` libera reserva; con `INVENTARIO` reingresa stock. Tope actual: cantidad ≤ vendido − devuelto (validación en `devolver`, `operaciones.service.ts`). **No** se compara con lo entregado, porque hoy la entrega es total; con entregas parciales esa comparación es obligatoria (§4.3, I3). |
| Contingencia | Descuento inmediato al sincronizar, `reserva_pendiente = false`. |
| Líneas de venta | `detalles_venta`: `cantidad`, `precio_unitario`, `sin_inventario`. Sin campos de entrega. |
| Movimientos | `movimientos_inventario`: `documento_id`, sin referencia a línea ni a evento. |
| Anulación | No existe anulación de ventas pagadas. |

**Problemas que la revisión 2 resuelve:** entrega solo total; ausencia de tope acumulado en devoluciones; falta de identificadores de evento; reserva por venta y no por línea.

---

## 2. Modelo de cantidades

### 2.1 Unidad y tipo

- Cantidades en `NUMERIC(12,2)`, como hoy (`detalles_venta.cantidad`).
- Toda aritmética de aplicación usa **enteros en centésimas** (`cantidadCentesimas`), igual que `frontend/src/offline/money.ts` y `backend/src/common/dinero.ts`. No se usan `number` de punto flotante para comparar cantidades.
- Las comparaciones de límites se hacen **dentro de SQL** sobre `NUMERIC`, para que el límite se verifique en la base.

### 2.2 Contadores por línea

Para cada línea `L` de una venta, con modo `BODEGA` o `MOSTRADOR`:

| Símbolo | Columna | Significado |
|---|---|---|
| `C` | `cantidad` (existente) | Cantidad vendida |
| `P` | `cantidad_preparada` (nueva) | Acumulado preparado en bodega (sin efecto de stock) |
| `E` | `cantidad_entregada` (nueva) | Acumulado entregado al cliente (sale de existencias) |
| `R` | `cantidad_devuelta` (nueva) | Acumulado de `E` que volvió físicamente a existencias |
| `N` | `cantidad_cancelada` (nueva) | Acumulado de pendiente liberado sin entrega (reserva liberada) |

**Derivados (no se guardan):**

- Reserva restante: `Rr = C − E − N`. Solo aplica a líneas `BODEGA`.
- Mercancía en poder del cliente: `Pc = E − R`.
- Pendiente de preparar: `Pp = Rr − P` (no negativo).

### 2.3 Invariantes

Para toda línea con inventario (`sin_inventario = false`):

| ID | Invariante | Motivo |
|---|---|---|
| I1 | `0 ≤ E ≤ C` | No se entrega más de lo vendido |
| I2 | `0 ≤ N` y `E + N ≤ C` | No se libera más de lo pendiente |
| I3 | `0 ≤ R ≤ E` | No se reintegra más de lo entregado |
| I4 | `0 ≤ P ≤ C − E − N` | No se prepara más de lo pendiente |
| I5 | Si `modo = MOSTRADOR`: `N = 0` y `P = 0`, y `E = C` tras el cobro | Mostrador no genera pendientes |
| I6 | Si `modo = BODEGA`: `E + N ≤ C` (ya cubierto por I2) | Reserva restante nunca negativa |
| I7 | `stockReservado = Σ Rr` sobre líneas `BODEGA` del producto | Reserva consistente |
| I8 | `stockActual = S₀ + Σ ingresos − Σ E + Σ R` (sobre todas las líneas del producto, con ajustes registrados) | Existencias consistentes |

I7 e I8 se verifican en el informe de conciliación y en las pruebas T21 y T22. I1 a I6 se aplican como `CHECK` en la base (§7.1).

### 2.4 Transiciones permitidas

Los estados son **derivados** de los contadores. No hay columna de estado que pueda contradecir a los contadores.

| Desde | Acción | Hasta | Condición | Efecto en stock |
|---|---|---|---|---|
| (nueva) | Cobro `MOSTRADOR` | `E = C` | Stock disponible `≥ C` | `stockActual −= C` |
| (nueva) | Cobro `BODEGA` | `E = 0`, `Rr = C` | Disponible `≥ C` | `stockReservado += C` |
| Pendiente | Preparar `q` | `P += q` | `q ≤ Pp` | Ninguno |
| Pendiente | Entregar `q` | `E += q` | `E + q + N ≤ C` y `stockActual ≥ q` | `stockActual −= q`, `stockReservado −= q` |
| Pendiente | Liberar `q` (ADMIN, motivo) | `N += q` | `q ≤ C − E − N` | `stockReservado −= q` |
| Entregada | Devolver físicamente `q` | `R += q` | `R + q ≤ E` | `stockActual += q` |
| Entregada | Devolver como `NO_ENTREGADO` | — | **Prohibido** | — |
| Mostrador entregado | Liberar | — | **Prohibido** (`N = 0` siempre) | — |

**Estados derivados para la pantalla:**

| Estado | Condición |
|---|---|
| `PENDIENTE` | `BODEGA`, `E = 0`, `N = 0` |
| `PARCIAL` | `BODEGA`, `E > 0` o `N > 0`, con `Rr > 0` |
| `LISTA` | `BODEGA`, `P > 0`, `Rr > 0` (se muestra junto a `PENDIENTE` o `PARCIAL`) |
| `ENTREGADA` | `E = C` |
| `CANCELADA` | `N = C` y `E = 0` |
| `DEVUELTA` | `R > 0` |

### 2.5 Ejemplo numérico

Línea de 2 unidades en bodega. Stock inicial 10, reserva 0.

| Paso | Acción | `C` | `E` | `N` | `R` | `Rr` | `stockActual` | `stockReservado` |
|---|---|---|---|---|---|---|---|---|
| 0 | Cobro bodega | 2 | 0 | 0 | 0 | 2 | 10 | 2 |
| 1 | Entrega 1 de 2 | 2 | 1 | 0 | 0 | 1 | 9 | 1 |
| 2 | Entrega 1 de 2 | 2 | 2 | 0 | 0 | 0 | 8 | 0 |
| 3 | Intento de entregar 1 más | — | — | — | — | — | Rechazado (`E + q = 3 > C`) | — |
| 4 | Devolver 1 físicamente | 2 | 2 | 0 | 1 | 0 | 9 | 0 |
| 5 | Devolver 2 más | — | — | — | — | — | Rechazado (`R + q = 3 > E = 2`) | — |

Mismo ejemplo con cancelación: en el paso 0, liberar 1 pendiente (`N = 1`, `Rr = 1`, `stockReservado = 1`, `stockActual = 10`). Luego entregar 1 (`E = 1`, `Rr = 0`, `stockActual = 9`, `stockReservado = 0`). Ningún paso descuenta dos veces.

---

## 3. Integridad de eventos: entregas parciales sin duplicados

### 3.1 Por qué el índice único por línea estaba mal

Un índice único `(documento_id, detalle_venta_id)` para `ENTREGA` prohíbe **dos** movimientos de la misma línea. Una entrega parcial legítima es precisamente eso. El índice confundía «un evento» con «una línea». La revisión 2 separa ambos conceptos.

### 3.2 Identificadores

| Identificador | Qué identifica | Restricción |
|---|---|---|
| `evento_id` (UUID v4, nuevo) | Una acción de entrega, preparación, cobro, cancelación o devolución | Clave primaria de `entregas_eventos` |
| `solicitud_id` (UUID v4, enviado por el cliente) | Intento de una acción, para reintentos | `UNIQUE (tenant_id, solicitud_id)` |
| `evento_linea_id` | Una línea dentro de un evento | `UNIQUE (evento_id, detalle_venta_id)` |
| `operacion_id` (existente, offline) | Venta de contingencia | `UNIQUE` existente; se usa como `solicitud_id` del cobro offline |

### 3.3 Tablas

**`entregas_eventos`** (solo inserción):

```
id              UUID PK = evento_id
tenant_id       TEXT NOT NULL
solicitud_id    UUID NOT NULL
UNIQUE (tenant_id, solicitud_id)
venta_id        TEXT NOT NULL REFERENCES ventas(id)
tipo            TEXT NOT NULL CHECK (tipo IN ('COBRO','PREPARACION','ENTREGA','DEVOLUCION_FISICA','LIBERACION'))
usuario_id      TEXT NOT NULL      -- responsable del evento
receptor_nombre TEXT NULL          -- obligatorio si tipo = 'ENTREGA' y modo = BODEGA (P4)
motivo          TEXT NULL          -- obligatorio si tipo = 'LIBERACION' o 'DEVOLUCION_FISICA' (≥ 10 caracteres)
origen          TEXT NOT NULL CHECK (origen IN ('ONLINE','OFFLINE'))
dispositivo_id  TEXT NULL
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
```

**`entregas_eventos_lineas`** (solo inserción):

```
evento_id       UUID NOT NULL REFERENCES entregas_eventos(id)
detalle_venta_id TEXT NOT NULL REFERENCES detalles_venta(id)
cantidad        NUMERIC(12,2) NOT NULL CHECK (cantidad > 0)
PRIMARY KEY (evento_id, detalle_venta_id)
```

**`movimientos_inventario`** (existente, con dos columnas nuevas):

```
evento_id        UUID NULL REFERENCES entregas_eventos(id)
detalle_venta_id TEXT NULL
UNIQUE (evento_id, detalle_venta_id) WHERE evento_id IS NOT NULL AND detalle_venta_id IS NOT NULL
```

Ese índice **no** impide entregas sucesivas: cada una tiene su `evento_id`. Solo impide dos movimientos de la misma línea dentro del mismo evento.

### 3.4 Validación transaccional de cantidades acumuladas

Cada acción que cambia cantidades ejecuta, dentro de una transacción con `lockTenant`:

1. **Idempotencia:** `INSERT INTO entregas_eventos (...) ON CONFLICT (tenant_id, solicitud_id) DO NOTHING RETURNING id`. Si no devuelve fila, se lee el evento existente y se devuelve su resultado. **No se repite ningún efecto.**
2. **Reserva de cantidad por línea (compare-and-set):**

```sql
UPDATE detalles_venta
   SET cantidad_entregada = cantidad_entregada + $q
 WHERE id = $linea
   AND venta_id = $venta
   AND cantidad_entregada + cantidad_cancelada + $q <= cantidad
RETURNING cantidad_entregada;
```

   Si la sentencia afecta 0 filas, la entrega excede lo pendiente: se revierte la transacción y se responde 409 «excede lo pendiente». Si afecta 1 fila, la cantidad acumulada ya está validada.
3. **Stock con condición:** `UPDATE productos SET stock_actual = stock_actual − $q, stock_reservado = stock_reservado − $q WHERE id = $p AND stock_actual >= $q AND stock_reservado >= $q`. Si afecta 0 filas, se revierte.
4. **Movimiento** `ENTREGA` con `evento_id` y `detalle_venta_id`.
5. **Líneas del evento** en `entregas_eventos_lineas`.

**Orden de bloqueo:** las líneas de un evento se bloquean en orden de `id` para evitar interbloqueos entre entregas simultáneas.

**Resultado para las entregas legítimas:**

- Entrega A (solicitud `S1`, cantidad 1) sobre línea `C = 2`: `E` pasa de 0 a 1. Válida.
- Entrega B (solicitud `S2`, cantidad 1): `E` pasa de 1 a 2. Válida. Dos eventos distintos, dos movimientos.
- Reintento de la entrega A (misma `S1`): `ON CONFLICT` devuelve el evento original. Sin nuevo movimiento.
- Entrega C (solicitud `S3`, cantidad 1): `E + 1 = 3 > C`. La sentencia del punto 2 afecta 0 filas. Rechazada.

### 3.5 Duplicados por doble clic (solicitudes distintas)

Un doble clic con dos `solicitud_id` distintos no se detecta por la restricción de idempotencia. El tope de cantidades evita que se entregue más de lo vendido, pero no evita que se entregue dos veces una cantidad que el cliente solo pidió una vez.

**Mitigación (no es garantía de integridad):**

- El cliente genera `solicitud_id` al abrir el formulario de entrega, no al pulsar el botón. El botón se deshabilita tras el primer envío.
- El servidor rechaza con 409 `ENTREGA_REPETIDA` una entrega con las mismas líneas y cantidades que otra de la misma venta, aplicada en los últimos 30 segundos, salvo que la solicitud incluya `confirmarRepeticion: true`. Esta regla es configurable (P12).

La garantía fuerte es el tope de cantidades (§3.4). La regla de 30 segundos es una ayuda operativa.

---

## 4. Flujos

### 4.1 Mostrador (`MOSTRADOR`)

**Cajero:** seleccionar productos → «Cobrar y entregar» → comprobante «Entregado en mostrador».

**Transacción única:**

1. Crear `ventas` (`COMPLETADA`, `usuario_id` = cajero).
2. Crear `entregas_eventos` `tipo = COBRO` y `tipo = ENTREGA` con `usuario_id` = cajero, `receptor_nombre` opcional, `origen`.
3. Por cada línea: `cantidad_entregada = C` (CAS del §3.4), stock descontado con condición, movimiento `ENTREGA` con `evento_id`.
4. Caja: movimiento de cobro.

**Sin existencias disponibles:** rechazo con «No hay existencias disponibles para entregar ahora. Si la mercancía está en bodega, use Cobrar y dejar en bodega.» Sin venta, sin caja, sin movimiento.

**Aclaración de inventario único:** «entregado en mostrador» significa que el cajero entrega la mercancía en el momento del cobro. El sistema no verifica que la unidad esté físicamente en el mostrador ni en otra ubicación. La existencia es la única de la empresa.

### 4.2 Bodega o pedido (`BODEGA`)

**Cobro (cajero):** seleccionar productos → «Cobrar y dejar en bodega» → comprobante «PENDIENTE DE ENTREGA» con número de venta.

**Transacción:** crear venta, `COBRO`, reserva por línea (`stockReservado += C`), caja.

**Preparación (BODEGUERO o ADMIN, opcional — P3):** evento `PREPARACION` con cantidades por línea, validadas por `P + q ≤ C − E − N`. No cambia stock.

**Entrega (BODEGUERO o ADMIN — P3):**

- Formulario: nombre del receptor (**obligatorio** — P4), cantidad por línea (por defecto, lo pendiente), botón «Confirmar entrega».
- Transacción del §3.4 por cada línea.
- Entregas parciales y sucesivas permitidas.

**Cancelación de pendiente (ADMIN, motivo ≥ 10 caracteres — P7):** evento `LIBERACION`, `N += q`, `stockReservado −= q`. No cambia stock físico. No devuelve dinero: el reembolso sigue el proceso formal de devolución.

### 4.3 Devoluciones

| Caso | Acción | Efecto |
|---|---|---|
| Línea pendiente (`BODEGA`), cliente desiste | Liberación (§4.2) | `N += q` |
| Línea entregada, mercancía regresa a existencias | Devolución física `DEVOLUCION_FISICA` con `R += q` | `stockActual += q`; `R ≤ E` |
| Línea entregada, mercancía dañada o devuelta al proveedor | Devolución con destino `DAÑADO` o `PROVEEDOR` | Sin reingreso de stock; `R` no cambia; registro de motivo |
| Línea entregada marcada `NO_ENTREGADO` | **Prohibida** (ya salió) | — |

Toda devolución usa el mismo patrón de compare-and-set del §3.4, con el tope `R ≤ E` o `E + N ≤ C` según corresponda.

### 4.4 Contingencia offline

- **Solo mostrador.** El DTO rechaza líneas `BODEGA` con error de validación.
- Al sincronizar: evento `COBRO` + `ENTREGA` con `solicitud_id` = `operacion_id`. Una vez por operación.
- `usuario_id` = cajero de la operación; `origen = OFFLINE`; `created_at` = hora local del cobro, con la hora de sincronización registrada aparte.

### 4.5 Alertas de pedidos pendientes

Ver §8.

---

## 5. Inventario único (P2)

- Existe una sola existencia por producto y por empresa. No hay ubicaciones de stock.
- `modo_entrega` (`MOSTRADOR` o `BODEGA`) describe **cómo se entregó o si quedó pendiente**. No describe dónde está la mercancía.
- Las pantallas no deben decir «en mostrador» como si fuera ubicación. Usar «entregado en el momento del cobro» o «pendiente de entrega».
- Cuando se decida separar ubicaciones (fase posterior), se requiere un rediseño de KARDEX. Esta revisión no lo prepara.

---

## 6. Trazabilidad

| Dato | Dónde | Obligatorio |
|---|---|---|
| Cajero que cobró | `ventas.usuario_id` (existente) | Sí |
| Responsable de cada evento | `entregas_eventos.usuario_id` | Sí |
| Modo de entrega por línea | `detalles_venta.modo_entrega` (nuevo) | Sí |
| Receptor (nombre) | `entregas_eventos.receptor_nombre` | Sí en `ENTREGA` de `BODEGA` (P4); opcional en mostrador |
| Receptor (documento de identidad) | No se captura en esta fase | — (P4: revisión legal antes de capturarlo) |
| Motivo de liberación o devolución física | `entregas_eventos.motivo` | Sí |
| Hora del evento y origen | `created_at`, `origen`, `dispositivo_id` | Sí |

`entregas_eventos` y `entregas_eventos_lineas` son append-only: un trigger impide `UPDATE` y `DELETE`, igual que en `operaciones_contingencia`.

---

## 7. Base de datos

### 7.1 Migración aditiva (no ejecutada)

Nombre propuesto: `20261012000000_entrega_eventos_y_cantidades`.

**Columnas nuevas en `detalles_venta`:**

```sql
ALTER TABLE detalles_venta
  ADD COLUMN modo_entrega        TEXT          NOT NULL DEFAULT 'BODEGA' CHECK (modo_entrega IN ('MOSTRADOR','BODEGA')),
  ADD COLUMN cantidad_preparada  NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN cantidad_entregada  NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN cantidad_devuelta   NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN cantidad_cancelada  NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD CONSTRAINT detalles_venta_cantidades_no_negativas CHECK (
        cantidad_preparada >= 0 AND cantidad_entregada >= 0
    AND cantidad_devuelta  >= 0 AND cantidad_cancelada >= 0),
  ADD CONSTRAINT detalles_venta_entrega_acotada CHECK (
        cantidad_entregada + cantidad_cancelada <= cantidad            -- I2
    AND cantidad_devuelta <= cantidad_entregada                        -- I3
    AND cantidad_preparada <= cantidad - cantidad_entregada - cantidad_cancelada  -- I4
  ),
  ADD CONSTRAINT detalles_venta_modo_coherente CHECK (
        (modo_entrega = 'BODEGA')
     OR (cantidad_preparada = 0 AND cantidad_cancelada = 0)            -- I5
  );
```

Notas de compatibilidad:

- `DEFAULT 'BODEGA'` con contadores en 0 deja las **ventas abiertas** tal como están: su reserva actual equivale a `Rr = C`, que coincide con `stockReservado` (P6: sin cambios).
- Las ventas **ya entregadas** (`entregado_at IS NOT NULL`) necesitan un *backfill*: `cantidad_entregada = cantidad` para cada línea con inventario, y `modo_entrega = 'MOSTRADOR'` para las ventas de contingencia. Este *backfill* solo se ejecutaría en la migración autorizada, verificada en copia (T30). No se aplica a ventas abiertas.
- Las restricciones `CHECK` se añaden después del *backfill*, para que la migración no falle con datos legados.

**Orden de la migración:** crear primero `entregas_eventos` y `entregas_eventos_lineas`; después las columnas de `movimientos_inventario` que referencian `evento_id`; después el *backfill*; por último los `CHECK` de `detalles_venta`.

**Columnas nuevas en `movimientos_inventario`:**

```sql
ALTER TABLE movimientos_inventario
  ADD COLUMN evento_id UUID NULL REFERENCES entregas_eventos(id),
  ADD COLUMN detalle_venta_id TEXT NULL;

CREATE UNIQUE INDEX movimientos_evento_linea_key
  ON movimientos_inventario (evento_id, detalle_venta_id)
  WHERE evento_id IS NOT NULL AND detalle_venta_id IS NOT NULL;
```

**Tablas nuevas:** `entregas_eventos`, `entregas_eventos_lineas` (§3.3), con triggers de inmutabilidad.

**Restricción adicional:** `ALTER TABLE productos ADD CONSTRAINT productos_reservado_no_negativo CHECK (stock_reservado >= 0);`. No se añade `stock_reservado <= stock_actual`, porque un ajuste de inventario puede dejar reservas por encima del stock. Esa condición se reporta en conciliación.

**Triggers:**

- `detalles_venta`: impedir cambio de `modo_entrega` después del cobro.
- `entregas_eventos` y `entregas_eventos_lineas`: impedir `UPDATE` y `DELETE`.

### 7.2 Índices de consulta

- `entregas_eventos (tenant_id, venta_id, created_at)`.
- `detalles_venta (venta_id)` (existente).
- Parcial sobre `detalles_venta` para pendientes: `WHERE modo_entrega = 'BODEGA' AND cantidad > cantidad_entregada + cantidad_cancelada`.

### 7.3 Vista de estado derivado

`v_detalle_entrega` calcula `rr`, `pc`, `pp` y el estado de §2.4. Las pantallas y el informe de conciliación leen de esta vista; no guardan estados.

---

## 8. Alertas (P5 — configurable)

**Principio:** nunca se cancela una venta pagada por tiempo. Las alertas solo avisan.

**Configuración** en la configuración del tenant (JSON existente, sin migración):

```json
"entregas": {
  "alertaInformativaHoras": 2,
  "alertaAvisoHoras": 24,
  "alertaEscalamientoDias": 3
}
```

Valores por defecto: 2 h, 24 h, 3 días. ADMIN puede cambiarlos desde configuración.

| Nivel | Condición | Quién ve | Acción |
|---|---|---|---|
| Informativo | Pendiente con `Rr > 0` por más de `alertaInformativaHoras` | Pestaña «Pedidos por entregar» | Ninguna |
| Aviso | Más de `alertaAvisoHoras` | Cajero que cobró, al iniciar sesión | Entregar |
| Escalamiento | Más de `alertaEscalamientoDias` | Resumen diario para ADMIN (panel móvil) | Entregar o liberar con motivo |

- Cálculo en consulta: `GET /operaciones/entregas/alertas`. Sin proceso en segundo plano en esta fase.
- Ninguna acción automática cambia estado, reserva o stock.

---

## 9. Cambios por capa

### 9.1 Backend

| Archivo | Cambio |
|---|---|
| `ventas/dto` | Línea acepta `modoEntrega` (por defecto `BODEGA` mientras el POS no lo envíe). |
| `ventas/ventas.service.ts` | `create`: `MOSTRADOR` entrega en la transacción del cobro (§4.1); `BODEGA` reserva por línea. Crea evento `COBRO`. |
| `operaciones/operaciones.service.ts` | Nuevos métodos `preparar`, `entregarLineas`, `liberarPendiente`, `devolverFisico`. `entregar` (legado) se mantiene como envoltorio que entrega lo pendiente de `BODEGA`. `devolver` se ajusta a §4.3. Toda acción usa §3.4. |
| `operaciones/ledger.ts` | `movement` recibe `eventoId` y `detalleVentaId`. |
| `operaciones/operaciones.controller.ts` | `POST /operaciones/ventas/:id/entregas`, `POST /operaciones/ventas/:id/preparacion`, `POST /operaciones/ventas/:id/liberaciones`, `POST /operaciones/ventas/:id/devoluciones-fisicas`, `GET /operaciones/entregas/alertas`, `GET /operaciones/conciliacion/existencias`. |
| `contingencia/contingencia.service.ts` | Rechaza `BODEGA`; crea eventos `COBRO` y `ENTREGA` por operación. |
| `contingencia/dto` | `modoEntrega` solo admite `MOSTRADOR`. |
| `common/` | Utilidad de cantidades en centésimas compartida (ya existe `dinero.ts`; se amplía con pruebas de vectores). |

**Compatibilidad:** `POST /operaciones/ventas/:id/entregar` sigue existiendo para el frontend actual, pero solo entrega líneas `BODEGA` pendientes y exige `receptor` (P4). Sin receptor responde 400.

### 9.2 Frontend

| Pantalla | Cambio |
|---|---|
| `POSPage.tsx` | «Cobrar y entregar» (principal, mostrador). «Cobrar y dejar en bodega» (secundario). Sin campos extra al cobrar. |
| Comprobantes (POS y contingencia) | «Entregado en el momento del cobro» o «PENDIENTE DE ENTREGA — número de venta». |
| `OperacionesPage.tsx`, pestaña «Pedidos por entregar» | Antigüedad con colores (informativo, aviso, escalamiento). Entrega parcial con cantidades por línea. Formulario de receptor (nombre obligatorio). Botón «Preparar». |
| Panel admin móvil | Tarjeta «Pedidos pendientes»: total, más antiguo. Acción «Liberar» con motivo. |
| Contingencia | Sin cambio de flujo; solo mostrador. |

**Sencillez:** el cajero en mostrador no ve nada adicional. El formulario de receptor solo aparece al entregar un pedido de bodega.

### 9.3 Configuración

- Umbrales de alerta (§8) en configuración del tenant.
- Ventana anti-repetición de 30 s (P12) en configuración del tenant.

---

## 10. Garantías (revisadas)

| # | Garantía | Mecanismo |
|---|---|---|
| G1 | Nunca se entrega más de lo vendido ni se reintegra más de lo entregado | CAS sobre `cantidad_entregada` y `cantidad_devuelta` + `CHECK` (I1–I3) |
| G2 | Entregas parciales sucesivas son posibles | Eventos distintos con `evento_id` propio; sin índice por línea |
| G3 | Reintentos no duplican efectos | `UNIQUE (tenant_id, solicitud_id)` y `ON CONFLICT` |
| G4 | Un movimiento por línea y evento | `UNIQUE (evento_id, detalle_venta_id)` |
| G5 | Sin existencias negativas por entrega | `stock_actual >= q` en el mismo `UPDATE` |
| G6 | Sincronización offline sin duplicados | `operacion_id` como `solicitud_id` |
| G7 | Reservas consistentes | I7 + conciliación |
| G8 | Existencias consistentes | I8 + conciliación |
| G9 | Sin transiciones fuera de orden | Estados derivados de contadores; CAS |
| G10 | Sin cancelación automática | Ninguna acción por tiempo |

---

## 11. Plan de pruebas para FARO

Niveles: **U** unitaria, **I** integración PostgreSQL real, **S** E2E simulado, **R** E2E real, **F** físico. Las pruebas T01 a T24 son **nuevas o revisadas**; las marcadas con (r) reemplazan casos de la revisión 1.

| ID | Prueba | Nivel | Garantía |
|---|---|---|---|
| T01 | Cobro mostrador: `E = C`, stock −C, evento `COBRO` y `ENTREGA` con `evento_id` | I | G5, G4 |
| T02 | Cobro mostrador sin existencias: rechazo sin venta, caja ni movimiento | I | G5 |
| T03 | Cobro bodega: `E = 0`, `Rr = C`, `stockReservado += C`, `stockActual` sin cambio | I | I7 |
| T04 (r) | Entrega parcial (1 de 2): `E = 1`, stock −1, reserva −1, estado `PARCIAL` | I | G1 |
| T05 | Entrega total: `E = C`, reserva 0, estado `ENTREGADA`, evento con responsable y receptor | I | G1 |
| T06 | Entrega de bodega sin receptor: 400 | I | P4 |
| T07 | Reintento con misma `solicitud_id`: mismo resultado, sin filas nuevas | I | G3 |
| T08 (r) | **Dos entregas legítimas sucesivas** (1 + 1 de una línea de 2): ambas aplicadas, `E = 2`, dos eventos, dos movimientos | I | G2 |
| T09 (r) | Entrega que excede lo pendiente (tercera de 1): 409, sin efectos | I | G1 |
| T10 (r) | Entregas simultáneas con solicitudes distintas que suman más del pendiente: se aplican solo las que caben; `E ≤ C` | I | G1, G9 |
| T11 (r) | Mismo `evento_id` y misma línea dos veces (SQL directo): rechazado por índice `(evento, línea)` | I | G4 |
| T12 | Entrega con stock actual insuficiente: rechazo, sin efectos | I | G5 |
| T13 | Preparar: no cambia stock; `P` acotado por `Pp` | I | I4 |
| T14 | Liberar pendiente parcial (ADMIN, motivo): `N` sube, reserva baja, stock físico igual | I | I2 |
| T15 | Liberar más de lo pendiente: 409 | I | I2 |
| T16 | Liberar línea con entregas parciales: solo lo no entregado | I | I2 |
| T17 | Devolución física de lo entregado: `R` y stock suben; repetir hasta `E` permitido | I | I3 |
| T18 | Devolución física que excede `E`: 409 | I | I3 |
| T19 | Devolución `NO_ENTREGADO` sobre línea entregada: rechazo | I | §4.3 |
| T20 | Devolución física tras entrega parcial: solo sobre lo entregado | I | I3 |
| T21 | Invariante I7 tras 200 operaciones aleatorias con semilla fija (cobrar, entregar, preparar, liberar, devolver) en centésimas | I | I7 |
| T22 | Invariante I8 tras la misma secuencia | I | I8 |
| T23 | Invariantes por línea I1–I5 tras la misma secuencia | I | I1–I5 |
| T24 | Anti-repetición: mismas líneas en 30 s sin confirmación → 409; con `confirmarRepeticion` → aplica | I | §3.5 |
| T25 | Venta offline con línea `BODEGA`: rechazo de validación | I | §4.4 |
| T26 | Sincronización repetida con misma `operacion_id`: un evento, un movimiento | I | G6 |
| T27 | Sincronización offline mientras se entrega un pedido en servidor: sin interferencia | I | G9 |
| T28 | Alertas: umbrales configurables (2 h, 24 h, 3 d) se aplican; por debajo no aparecen | I | §8 |
| T29 | Ninguna venta pagada cambia de estado por tiempo (simulación de 30 días) | I | G10 |
| T30 | Migración en copia con ventas abiertas y entregadas: abiertas sin cambios; entregadas con `backfill`; invariantes I1–I8 válidas | I (copia) | §7.1 |
| T31 | Permisos (matriz CENTINELA): CAJERO no prepara; VENDEDOR no entrega; BODEGUERO no libera; ADMIN libera con motivo | I | CENTINELA |
| T32 | Aislamiento entre empresas en eventos, alertas y conciliación | I | Aislamiento |
| T33 | Flujo mostrador en UI: un clic de cobro, sin campos extra | S | Sencillez |
| T34 | Flujo bodega en UI: cobro, preparación, dos entregas parciales con receptor, estados visibles | S | Sencillez |
| T35 | Alertas en pestaña y panel móvil a 390 px | S | §8 |
| T36 | Reintento tras corte de red al entregar: un solo efecto | S | G3 |
| T37 | Flujo real completo con backend y PostgreSQL reales | R | Integración |
| T38 | Comprobantes: leyenda correcta para mostrador y pendiente | U + R | §9.2 |
| T39 | Mutación: quitar `CHECK` de cantidades → T23 falla; quitar CAS → T10 falla | I (mutación) | Prueba de la prueba |
| T40 | Mutación: volver al índice `(documento, línea)` → **T08 falla** (demuestra que la revisión 1 bloqueaba entregas legítimas) | I (mutación) | Regresión del defecto 1 |
| T41 | Mutación: permitir `BODEGA` en contingencia → T25 falla | I (mutación) | |
| F01 | Impresora térmica: comprobantes de mostrador y de pendiente en 58 y 80 mm | F | C1–C2 |
| F02 | Entrega real con receptor en iPhone (Safari, panel admin) | F | Usabilidad |

**Criterio de entrada:** T01–T29, T31–T36 y T39–T41 automatizadas y en rojo antes de implementar; T30 en copia con informe; F01–F02 con hardware.

---

## 12. Decisiones

| ID | Decisión | Estado |
|---|---|---|
| P1 | Variante B: entrega inmediata en mostrador y entrega diferida controlada | **Aprobado conceptualmente** |
| P2 | Inventario único por empresa; sin ubicaciones físicas separadas en esta fase | **Aprobado** |
| P3 | Entrega por BODEGUERO o ADMIN; preparación opcional | **Aprobado** |
| P4 | Nombre del receptor obligatorio para entregas de bodega; documento de identidad no se captura en esta fase | **Aprobado** (documento: pendiente de revisión legal si se decide capturarlo) |
| P5 | Alertas configurables con valores 2 h, 24 h, 3 días | **Aprobado** |
| P6 | Ventas abiertas sin cambios | **Aprobado** |
| P7 | Liberación de pendiente y reembolso mediante devolución formal | **Aprobado** |
| P8 | Separar cobro y reconocimiento contable. El sistema registra eventos de cobro y de entrega; BALANCE define cuándo se reconoce el ingreso | **Aprobado** (definición contable: pendiente de BALANCE) |
| P9 | Mantener flujo actual de venta sin inventario (`sin_inventario`) | **Aprobado** |
| P10 | La migración solo se ejecuta en copia, con informe, antes de cualquier aplicación autorizada | **Aprobado** |
| P11 | Sin cancelación automática de ventas pagadas | **Aprobado** |
| P12 | Ventana anti-repetición de 30 s con confirmación explícita | **Propuesta de ATLAS, pendiente de decisión del dueño** |
| P13 | Caducidad automática de reservas | **Excluida** por P11 |

---

## 13. Riesgos residuales

| Riesgo | Mitigación |
|---|---|
| Doble clic con solicitudes distintas | Formulario con `solicitud_id` único por apertura, botón deshabilitado, ventana anti-repetición (P12). El tope de cantidades evita sobreentrega. |
| Entregas parciales olvidadas | Alertas (§8); pestaña de pendientes por antigüedad. |
| Cajero marca entregado sin entregar | Reporte diario por cajero (BALANCE); responsable registrado. |
| Receptor sin verificar identidad | Nombre obligatorio; sin documento en esta fase; el sistema registra quién capturó el nombre, no lo verifica. |
| Migración con ventas entregadas legadas | *Backfill* verificado en copia (T30); restricciones después del *backfill*. |
| Crecimiento de tablas de eventos | Índices por tenant y fecha; retención pendiente. |

---

## 14. Coordinación

Contratos actualizados en `docs/POS_ENTREGA_CONTRATOS.md`:

- **KARDEX:** eventos con `evento_id`, invariantes I7 e I8, y tope por línea.
- **CENTINELA:** matriz de permisos, reglas de sesión y de sincronización offline.
- **BALANCE:** efectos de caja y separación cobro/reconocimiento (P8).

**Estado:** los contratos se entregan para validación. **Ninguna validación está completada.**

---

## 15. Próximos pasos

1. KARDEX, CENTINELA y BALANCE validan sus contratos.
2. FARO escribe T01–T41 en rojo sobre la base actual.
3. ATLAS implementa en rama aparte, sin merge.
4. Migración verificada en copia (T30), con informe.
5. Revisión conjunta antes de cualquier merge.

_Sin implementación en esta revisión. Sin migración productiva. Ventas abiertas sin cambios._
