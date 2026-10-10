# Diseño técnico: saldo a favor y reembolsos (BALANCE, 2026-10-10)

**Estado:** decisiones aprobadas por el propietario el 2026-10-10. **Diseño definitivo, no implementado.** No se crean tablas ni migraciones en esta fase. Implementación en una fase posterior, con coordinación de NEXUS. El contrato para NEXUS está en `docs/HANDOFF_NEXUS_BALANCE_20261010.md`.

## 0. Decisiones aprobadas (2026-10-10)

1. El excedente de una devolución se convierte **por defecto** en saldo a favor del cliente. Hoy se reembolsa de caja de inmediato; el cambio entra con el módulo.
2. Reembolsos de saldo a favor: autorización ADMIN, auditoría e idempotencia por `solicitud_id`.
3. Cotizaciones a crédito sin plazo del cliente pueden quedar sin vencimiento (implementado).
4. Reembolsos con tarjeta: referencia, terminal y comprobante verificable. Implementado en la devolución; la persistencia con unicidad va en la fase posterior.
5. Unicidad de comprobantes por empresa y procesador: `(tenant_id, metodo, terminal, referencia)`. Referencias reutilizadas en contextos distintos (otra terminal, otro método u otra empresa) son válidas.
6. No se crean roles financieros nuevos.

## 1. Regla aprobada por el propietario

- Si una devolución reduce la deuda por debajo de cero, el excedente es **saldo a favor del cliente**.
- El saldo a favor puede aplicarse después a otra factura o reembolsarse con autorización de ADMIN.
- El historial de pagos, abonos y devoluciones permanece íntegro.
- Idempotencia y transacciones evitan aplicaciones dobles.
- Sin integración bancaria automática.

## 2. Comportamiento actual (base del cambio)

`ejecutarDevolucion` (`backend/src/operaciones/operaciones.service.ts`) cancela primero el crédito pendiente (`credito = min(monto, saldo)`) y reembolsa el excedente **de inmediato** desde caja (`cashMovement 'DEVOLUCION'` negativo). No existe saldo a favor ni reembolso diferido. Las pruebas de `devoluciones-cxc.postgres.integration.ts` fijan ese comportamiento (factura abonada: reembolso 50 y caja -50).

Consecuencia: cambiar la regla altera pruebas y flujo de caja existentes. Por eso se requiere aprobación antes de codificar.

## 3. Modelo propuesto

### 3.1 Libro de movimientos de saldo a favor (append-only)

Tabla nueva `movimientos_saldo_favor`:

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `tenant_id` | text, FK tenants | obligatorio en todas las uniones |
| `cliente_id` | uuid, FK clientes, compuesto por (tenant_id, cliente_id) | |
| `tipo` | text CHECK | `GENERADO` (devolución), `APLICADO` (a factura), `REEMBOLSADO` (salida autorizada) |
| `monto` | numeric(12,2) CHECK `monto > 0` | el signo lo define `tipo` |
| `devolucion_id` / `cuenta_id` / `reembolso_id` | uuid nullable | referencia de origen o destino |
| `solicitud_id` | uuid NOT NULL | idempotencia; `UNIQUE (tenant_id, solicitud_id)` |
| `solicitud_hash` | text NOT NULL | detecta reutilización de la solicitud con otro contenido |
| `usuario_id` | uuid | responsable |
| `created_at` | timestamp | |

Saldo disponible = suma de `GENERADO` − `APLICADO` − `REEMBOLSADO`. Nunca se edita ni se borra una fila.

### 3.2 Reembolso autorizado

Tabla nueva `reembolsos_cliente`: `id`, `tenant_id`, `cliente_id`, `monto`, `estado` (`PENDIENTE_AUTORIZACION` → `EJECUTADO`), `metodo` (`EFECTIVO`, `TRANSFERENCIA`, `TARJETA`), `comprobante` (obligatorio para `TRANSFERENCIA` y `TARJETA` al ejecutar), `autorizado_por` (ADMIN), `solicitud_id` único por empresa.

**Regla:** un reembolso pasa a `EJECUTADO` solo con comprobante del procesador (o movimiento de caja en efectivo). Nunca se marca ejecutado sin evidencia.

### 3.3 Aplicación a factura

Operación transaccional: bloquear cliente y cuenta (`FOR UPDATE`), verificar saldo disponible ≥ monto, insertar `APLICADO`, reducir saldo de la cuenta y `clientes.saldo_pendiente`, auditar. Idempotente por `solicitud_id`.

## 4. Cambio de comportamiento en devolución (pendiente del módulo)

Propuesta: el excedente de una devolución se registra como `GENERADO` en lugar de reembolso inmediato de caja.

- ADMIN puede solicitar después un reembolso (`reembolsos_cliente`) con su comprobante.
- Las devoluciones ya registradas no cambian (historial íntegro).
- Opción alternativa, si el propietario no quiere cambiar el flujo: mantener el reembolso inmediato y solo exigir comprobante para electrónicos (ya implementado en esta rama).

**Decisión requerida:** ¿el excedente pasa a saldo a favor por defecto, o se mantiene el reembolso inmediato con comprobante?

## 5. Permisos

- CAJERO: consulta y aplica saldo a favor a una factura del cliente dentro de sus permisos de CXC.
- ADMIN: autoriza y ejecuta reembolsos y consulta todo.
- No se crean roles nuevos.

## 6. Pruebas esperadas (PostgreSQL real, antes de codificar)

1. Devolución que excede la deuda: genera `GENERADO` por el excedente; saldo de caja sin movimiento.
2. Aplicar saldo a otra factura: reduce la cuenta destino y el saldo del cliente; no toca pagos históricos.
3. Aplicar más saldo del disponible: rechazado, sin cambios.
4. Reintento con la misma `solicitud_id`: una sola aplicación; misma solicitud con otro contenido: 409.
5. Dos aplicaciones simultáneas del mismo saldo: solo una aplica.
6. Reembolso con tarjeta sin comprobante: no pasa a `EJECUTADO`; sin movimiento de caja.
7. Reembolso parcial: deja saldo disponible residual y no duplica.
8. Aislamiento: una empresa no puede aplicar ni reembolsar saldo de otra (404 y sin cambios).
9. Cajero no puede autorizar ni ejecutar reembolsos (403).

## 7. Migraciones previstas (no creadas)

Dos tablas nuevas y sus restricciones compuestas por empresa, aditivas. Deben crearse después de `20261014000000_cliente_plazo_credito`, con la revisión de NEXUS sobre dependencias y el historial real de migraciones.

## 8. Riesgos

- Cambio de comportamiento en caja: el reembolso inmediato hoy descuenta efectivo; con saldo a favor el efectivo sale después. Requiere alinear el arqueo.
- Doble conteo: la deuda del cliente debe reducirse solo una vez (devolución o aplicación), nunca en ambos.
- Sin integración bancaria: los reembolsos electrónicos quedan con comprobante manual.
