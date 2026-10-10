# Entrega a NEXUS — BALANCE (PR #142, 2026-10-10)

**Estado:** cierre funcional y entrada en espera. Sin merge, despliegue ni migraciones productivas.
**Rama:** `claude/balance-cxc-cxp`. **PR:** #142 (draft). **Base:** `claude/conciliacion-pagos-cxc` (PR #135).
**Dependencia de FORJA:** PR #143. BALANCE solo colabora si NEXUS detecta defectos de integración con #142.

## 1. Contrato definitivo

Decisiones del propietario (2026-10-10) y su estado en código:

| # | Decisión | Estado |
|---|---|---|
| 1 | Excedente de devolución = saldo a favor del cliente por defecto | **Diseñado, no implementado.** Hoy el excedente se reembolsa de caja de inmediato. El cambio de comportamiento espera al módulo de saldo a favor (fase posterior) |
| 2 | Reembolsos de saldo a favor: autorización ADMIN, auditoría e idempotencia | **Diseñado, no implementado** (`docs/DISENO_SALDO_FAVOR_REEMBOLSOS_BALANCE.md`) |
| 3 | Cotización convertida a crédito puede quedar sin vencimiento sin plazo | **Implementado.** `cotizaciones.service.ts` y `cotizaciones.postgres.integration.ts` |
| 4 | Reembolso con tarjeta: referencia, terminal y comprobante verificable | **Implementado parcialmente.** Exige referencia y terminal (`normalizarAutorizacion`) y comprobante al devolver. La evidencia se audita en `VENTA_DEVOLVER`. Falta persistirla en tabla con unicidad (fase de reembolsos) |
| 5 | Unicidad de comprobantes por empresa y procesador; referencias reutilizables en contextos distintos | **Implementado para ventas y abonos:** `aprobaciones_bancarias` tiene unicidad `(tenant_id, metodo, terminal, referencia)`. Otra terminal, otro método u otra empresa pueden reutilizar la referencia. Para reembolsos requiere ampliar el CHECK de `origen` (migración de fase posterior) |
| 6 | Sin roles financieros nuevos | Cumplido |

**Reglas que NEXUS debe respetar:**

- Pagos a proveedor: `solicitudId` UUID obligatorio. Electrónicos exigen `referencia`. Única por `(tenant_id, cuenta_id, referencia)`.
- CXC: CAJERO y ADMIN. CXP: solo ADMIN. BODEGUERO sin acceso a cuentas.
- Todas las uniones filtran por `tenant_id`.
- Ningún pago histórico, abono, devolución ni autorización se edita ni se borra.

## 2. Migraciones pendientes (en este orden)

Antes de aplicar, NEXUS debe verificar el historial real y las dependencias. **Atención:** `20261011000000_pos_contingencia_offline` está entre la conciliación y el resto de la cadena; no es de BALANCE, pero debe estar aplicada antes de la migración 1 en cualquier entorno.

| Orden | Migración | Qué hace | Tipo |
|---|---|---|---|
| 1 | `20261012000000_conciliacion_pagos_bancarios` | Crea `aprobaciones_bancarias` (con unicidad por empresa, método, terminal y referencia; origen `VENTA`/`ABONO`) y `conciliaciones_bancarias` | Aditiva, solo tablas nuevas (PR #135) |
| 2 | `20261013000000_balance_referencia_pagos` | `pagos_cuenta.referencia` nullable, 1–60 caracteres, índice único parcial `(tenant_id, cuenta_id, referencia)` | Aditiva, columna nullable |
| 3 | `20261014000000_cliente_plazo_credito` | `clientes.plazo_credito_dias` nullable, 1–365 | Aditiva, columna nullable |

**Verificación antes de aplicar (NEXUS):**

1. Confirmar que `20261011000000_pos_contingencia_offline` está aplicada o se aplica antes.
2. Confirmar que ninguna migración de las tres modifica filas existentes.
3. Confirmar que el índice `pagos_cuenta_tenant_cuenta_referencia_key` no choca con referencias duplicadas ya existentes. Si las hay, NEXUS debe decidir antes de aplicar; BALANCE no cambia datos.
4. Ejecutar sobre copia de seguridad o entorno de staging primero.

**No incluidas (fase posterior, requieren diseño aprobado):**

- Migración de `aprobaciones_bancarias.origen` para admitir `DEVOLUCION`.
- Tablas de saldo a favor (`movimientos_saldo_favor`) y reembolsos (`reembolsos_cliente`), descritas en `docs/DISENO_SALDO_FAVOR_REEMBOLSOS_BALANCE.md`.

## 3. Casos de prueba

Todos sobre PostgreSQL real con la cadena completa de migraciones, sin mocks.

### 3.1 Existentes y en verde

| Decisión | Caso | Archivo |
|---|---|---|
| 3 | Conversión a crédito con plazo: vencimiento guardado; cambio posterior no lo modifica | `cotizaciones.postgres.integration.ts` |
| 3 | Conversión a crédito sin plazo: vencimiento nulo, sin VENCIDA automática | `cotizaciones.postgres.integration.ts` |
| 3 | Venta a crédito con plazo y sin plazo | `pagos-bancarios.postgres.integration.ts` |
| 4 | Tarjeta sin autorización no confirma venta ni movimiento | `pagos-bancarios.postgres.integration.ts` |
| 4 | Reembolso con tarjeta sin comprobante: 400, sin devolución ni caja | `devoluciones-cxc.postgres.integration.ts` |
| 4 | Reembolso con referencia sin terminal: 400, sin caja | `devoluciones-cxc.postgres.integration.ts` |
| 4 | Reembolso con comprobante: caja negativa y comprobante normalizado en auditoría | `devoluciones-cxc.postgres.integration.ts` |
| 5 | Misma autorización no sirve para dos ventas | `pagos-bancarios.postgres.integration.ts` |
| 5 | Misma referencia en otra terminal es válida | `pagos-bancarios.postgres.integration.ts` |
| 5 | Misma referencia y terminal en otra empresa es válida | `pagos-bancarios.postgres.integration.ts` |
| 5 | Misma autorización no sirve para un abono ni para una venta | `pagos-bancarios.postgres.integration.ts` |
| 2 | Reintento con misma solicitud no duplica venta, autorización ni reembolso | `pagos-bancarios`, `devoluciones-cxc` |
| 2 | Pagos concurrentes: solo uno aplica, saldo nunca negativo | `cxc-cxp-balance.postgres.integration.ts` |
| 2 | Pago a proveedor exige referencia | `pagos-bancarios.postgres.integration.ts` |
| 2 | Referencia repetida en la misma factura: 409 | `cxc-cxp-balance.postgres.integration.ts` |
| 6 | CAJERO y VENDEDOR no concilian; CAJERO ve CXC y no CXP | `pagos-bancarios`, `cxc-cxp-balance` |
| — | Otra empresa no ve ni paga cuentas, autorizaciones ni conciliaciones | `cxc-cxp-balance`, `pagos-bancarios` |
| 2 | Índice único por cuenta y referencia (reintento y referencia repetida) | `cxc-cxp-balance.postgres.integration.ts` |
| 3 | Plazo fuera de 1–365 rechazado por la base de datos | `pagos-bancarios.postgres.integration.ts` |
| 2 | Longitud máxima de referencia (60) | Validada en DTO (`@MaxLength(60)`); **sin prueba directa de CHECK en base de datos** |

Además, E2E real `frontend/e2e-real/balance-real.spec.ts` (6/6) con backend y frontend reales.

### 3.2 Pendientes de la fase de saldo a favor y reembolsos (no implementados)

Derivados de `docs/DISENO_SALDO_FAVOR_REEMBOLSOS_BALANCE.md`, sección 6:

1. Devolución que excede la deuda genera saldo a favor, sin movimiento de caja.
2. Aplicar saldo a otra factura reduce cuenta y saldo del cliente; no toca pagos históricos.
3. Aplicar más saldo del disponible: rechazado, sin cambios.
4. Reintento con misma `solicitud_id`: una sola aplicación; misma solicitud con otro contenido: 409.
5. Dos aplicaciones simultáneas del mismo saldo: solo una aplica.
6. Reembolso con tarjeta sin comprobante no pasa a `EJECUTADO`; sin caja.
7. Reembolso parcial deja saldo residual y no duplica.
8. Empresa B no aplica ni reembolsa saldo de empresa A.
9. CAJERO no autoriza ni ejecuta reembolsos (403).
10. Mismo comprobante de reembolso en dos devoluciones: 409 (requiere migración de `origen`).

## 4. Riesgos conocidos

- La pantalla de devoluciones permite elegir `TARJETA` pero no captura referencia ni terminal. Ahora responde 400 con mensaje claro. Requiere ajuste de pantalla en la fase de reembolsos.
- El comprobante de reembolso solo queda en auditoría hasta que exista la tabla con unicidad.
- Cambiar el excedente a saldo a favor altera el arqueo de efectivo: hay que alinearlo antes de implementarlo.

## 5. Qué no se debe hacer sin coordinación

- No aplicar migraciones en producción sin el orden y la verificación de la sección 2.
- No cambiar el comportamiento de devoluciones (reembolso inmediato) antes del módulo de saldo a favor.
- No ampliar el CHECK de `aprobaciones_bancarias.origen` por fuera de la fase de reembolsos.
