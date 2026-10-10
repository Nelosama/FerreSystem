# BALANCE: cuentas por cobrar y por pagar (2026-10-10)

**Firma:** BALANCE — Desarrollo Financiero FerreSystem.
**Base:** `claude/conciliacion-pagos-cxc` (PR #135, pendiente). Rama: `claude/balance-cxc-cxp`. HEAD de código: `cb74444c`. PR #142 en draft. Sin merge, sin migraciones productivas, sin despliegue, sin cambios en `main`.

## 1. Diagnóstico: qué ya existía

| Funcionalidad | Estado previo | Decisión |
|---|---|---|
| Abonos parciales y totales con caja, auditoría, sobrepago rechazado, solicitud idempotente, bloqueo de la cuenta | Existía y tenía pruebas | Reutilizado |
| Cuenta por cobrar de venta a crédito y saldo del cliente | Existía (crédito) | Reutilizado; saldo verificado con varios abonos |
| Cuentas por pagar desde compra, pagos parciales y totales, factura duplicada del mismo proveedor | Existía | Reutilizado; se añadió la referencia del pago |
| Métodos efectivo, transferencia y tarjeta; autorización bancaria | Existía (PR #135) | Reutilizado |
| Estado de cuenta de cliente con cuentas y abonos | Existía (solo ADMIN) | Ampliado con movimientos y saldo acumulado |
| Listado con estado de deuda, filtros y responsable | No existía | **Nuevo** |
| Referencia de pago a proveedor y control contra repetirla en la misma factura | No existía | **Nuevo** |
| Pantalla de cuentas con filtros, estado y referencia | No existía | **Nuevo** |

## 2. Funcionalidades entregadas

- **Estado de deuda por cuenta:** PENDIENTE, PARCIAL, VENCIDA (vencimiento pasado con saldo), PAGADA (saldo cero) y POR_VENCER (7 días del día de negocio `America/Tegucigalpa`).
- **Filtros:** cliente o proveedor, estado, fecha desde/hasta y búsqueda por nombre o documento.
- **Plazo de crédito del cliente:** `clientes.plazo_credito_dias` (1–365). Una venta a crédito calcula su vencimiento como día de venta + plazo y lo guarda en la cuenta. Sin plazo, se usa el vencimiento enviado (compatibilidad).
- **Historial de pagos:** fecha, monto, método, responsable y referencia (autorización bancaria o comprobante del proveedor).
- **Estado de cuenta del cliente:** movimientos cronológicos con saldo acumulado; ADMIN ve el límite de crédito, CAJERO lo ve sin límite.
- **Referencia de pago a proveedor:** obligatoria en pagos electrónicos (transferencia y tarjeta); única por factura; la misma referencia puede usarse en otra factura.
- **Aislamiento por empresa:** todas las uniones de cuentas, pagos, usuarios y clientes filtran por `tenant_id`. Una factura de otra empresa no resuelve número ni cuenta.
- **Permisos:** CXC lo ven y abonan ADMIN y CAJERO; CXP solo ADMIN (CAJERO recibe 403); BODEGUERO no accede a cuentas.

## 3. Devoluciones (fase financiera, coordinada con ATLAS)

Reglas en código y probadas (`backend/test/devoluciones-cxc.postgres.integration.ts`, 7/7):

- Devolución parcial con deuda pendiente: reduce el saldo de la cuenta y no genera movimiento de caja.
- Devolución de factura ya abonada: cancela primero el crédito pendiente y reembolsa el excedente con movimiento de caja negativo; los pagos históricos no cambian.
- Reintento con la misma solicitud: devuelve la misma devolución, un solo reembolso.
- Dos devoluciones totales simultáneas: solo una aplica.
- **Reembolso por tarjeta o transferencia sin comprobante del procesador: 400, sin devolución ni movimiento de caja.** Con comprobante, el número se registra normalizado en la auditoría `VENTA_DEVOLVER` (`comprobanteProcesador`).

**Limitación conocida:** el comprobante se guarda en la auditoría, no en una tabla con unicidad. Reutilizar el mismo comprobante en dos devoluciones no se bloquea todavía: `aprobaciones_bancarias.origen` solo admite `VENTA` y `ABONO` por CHECK de base de datos, y ampliarlo requiere migración (NEXUS).

**Pantalla de devoluciones:** permite elegir `TARJETA`. Ahora responde 400 con el mensaje de comprobante, porque la pantalla aún no captura referencia ni terminal del procesador.

**No implementado (diseño en `docs/DISENO_SALDO_FAVOR_REEMBOLSOS_BALANCE.md`):** saldo a favor y reembolso autorizado diferido. Requieren tablas nuevas y cambio de comportamiento; esperan decisión y coordinación con NEXUS.

## 4. Pantallas y endpoints

| Recurso | Quién | Notas |
|---|---|---|
| `GET /operaciones/cuentas?tipo=CXC\|CXP&estado&clienteId&proveedorId&desde&hasta` | ADMIN y CAJERO (CXP solo ADMIN) | `estado`, `vencida`, `por_vencer`, `pagos` con `usuario_nombre`, `referencia`, `terminal` |
| `POST /operaciones/cuentas/:id/pagos` | ADMIN y CAJERO (CXP solo ADMIN) | Campo opcional `referencia`; obligatorio en CXP electrónico |
| `GET /operaciones/clientes/:id/estado-cuenta` | ADMIN y CAJERO | Campo `movimientos`; `limiteCredito` oculto a CAJERO |
| `PATCH /clientes/:id/credito` | ADMIN | Campo nuevo `plazoCreditoDias` |
| Pantalla Cuentas (`/cuentas`) | Según rol | Filtros, estado, referencia e historial |
| Pantalla Estado de cuenta (`/estado-cuenta-clientes`) | ADMIN y CAJERO | Movimientos con saldo acumulado |

## 5. Migraciones (no aplicadas en producción)

| Migración | Cambio | Notas |
|---|---|---|
| `20261013000000_balance_referencia_pagos` | `pagos_cuenta.referencia` nullable, longitud 1–60, índice único parcial por (tenant, cuenta, referencia) | Aditiva |
| `20261014000000_cliente_plazo_credito` | `clientes.plazo_credito_dias` nullable, 1–365 | Aditiva |

Orden de aplicación: después de `20261012000000_conciliacion_pagos_bancarios` (PR #135).

## 6. Pruebas (2026-10-10, entorno local)

| Suite | Resultado |
|---|---|
| `cxc-cxp-balance.postgres.integration.ts` | 11/11 |
| `pagos-bancarios.postgres.integration.ts` | 22/22 |
| `devoluciones-cxc.postgres.integration.ts` | 7/7 |
| `cotizaciones.postgres.integration.ts` | 8/8 (incluye conversión a crédito con plazo y sin plazo) |
| Integración PostgreSQL completa | 25 archivos, 414 aprobadas, 1 omitida (omitida ya antes de BALANCE) |
| Backend unitarias | 345/345 |
| Frontend unitarias | 225/225 |
| `tsc --noEmit` frontend y `tsc -p tsconfig.build.json` backend | sin errores |
| Playwright simulado (completo) | 126/126 |
| E2E real `frontend/e2e-real/run.sh` | 35/35 (repetido después de los cambios de devoluciones y cotizaciones) |

**E2E real BALANCE** (`frontend/e2e-real/balance-real.spec.ts`, 6/6): deuda y abono con saldo actualizado en pantalla y base; pago a proveedor con referencia e historial que muestra referencia y responsable; referencia repetida 409 sin cambio de saldo; cajero sin CXP (403); bodeguero sin cuentas; empresa B no ve ni abona cuentas de A (404, saldo intacto).

**Hallazgo fuera de BALANCE, sin corregir:** `frontend/e2e-real/contingencia-real.spec.ts` (caso 9) depende del stock compartido del Taladro; BALANCE usa un producto propio para no interferir.

## 7. Decisiones del propietario: estado

| Decisión | Estado en código |
|---|---|
| Plazo al convertir cotización a crédito; vencimiento guardado; cambios posteriores no tocan facturas | **Implementado** (`cotizaciones.service.ts`, pruebas en `cotizaciones.postgres.integration.ts`) |
| Sin plazo, no hay VENCIDA automática | **Implementado** (vencimiento nulo nunca cumple la condición de VENCIDA; probado) |
| Referencia de pago única por factura y empresa | **Implementado** (índice único por empresa y cuenta); la referencia no es la clave de idempotencia |
| Clave de idempotencia independiente y obligatoria | **Implementado** (`solicitudId` UUID obligatorio en pagos y devoluciones) |
| CAJERO gestiona CXC; solo ADMIN gestiona CXP | **Implementado** (pruebas de roles en `cxc-cxp-balance` y E2E real) |
| No crear roles financieros nuevos | Cumplido (no se crearon) |
| Reembolso con tarjeta: comprobante obligatorio; no marcar ejecutado sin evidencia; sin simulación bancaria | **Implementado parcialmente**: exige comprobante y lo audita. Falta unicidad del comprobante y captura en pantalla (ver sección 3) |
| Saldo a favor y reembolso autorizado diferido | **Diseño entregado, no implementado** (`docs/DISENO_SALDO_FAVOR_REEMBOLSOS_BALANCE.md`) |

## 8. Contratos de integración

### ATLAS (ventas a crédito y conversión de cotizaciones)

- Una venta a crédito obtiene su vencimiento del **plazo del cliente en el momento de la venta** (`ventas.service.ts`, `sumarDias(diaCalendario(now), plazoCreditoDias)`). Sin plazo, la cuenta queda sin vencimiento.
- La conversión de cotización a crédito aplica la misma regla (`cotizaciones.service.ts`).
- Cambios posteriores del plazo del cliente **no** modifican facturas existentes.
- BALANCE no modifica inventario, reservas ni entregas. Las devoluciones solo tocan stock según `destino` ya existente.
- ATLAS debe revisar que no dependa del listado de cuentas ni del orden de `cuentas_operativas`.

### FORJA (facturas de proveedores y pagos)

- La factura de proveedor crea una CXP por `compras` (`operaciones.service.ts`). Su saldo se reduce solo con pagos.
- Pagos a proveedor: solo ADMIN. Requieren `solicitudId` UUID obligatorio. Los electrónicos (transferencia y tarjeta) exigen `referencia`.
- La referencia es única por factura y empresa: una segunda vez responde 409 sin cambiar el saldo.
- Un pago a proveedor no abre ni toca la caja POS (`caja_id` nulo, sin movimientos).
- FORJA debe enviar `solicitudId` nuevo por intento y reutilizarlo solo en reintentos de la misma operación.

### NEXUS (migraciones y restricciones)

Orden de aplicación, sin ejecutar en producción:

1. `20261012000000_conciliacion_pagos_bancarios` (PR #135)
2. `20261013000000_balance_referencia_pagos`: `pagos_cuenta.referencia` nullable, longitud 1–60, índice único parcial por (tenant, cuenta, referencia).
3. `20261014000000_cliente_plazo_credito`: `clientes.plazo_credito_dias` nullable, 1–365.

NEXUS debe:

- Verificar el historial real de migraciones y sus dependencias antes de aplicar en cualquier entorno.
- Revisar restricciones compuestas por empresa en `pagos_cuenta`, `aprobaciones_bancarias` y `clientes`.
- Evaluar la migración propuesta para ampliar `aprobaciones_bancarias.origen` con `DEVOLUCION` (unicidad de comprobantes de reembolso).
- Revisar el diseño de saldo a favor antes de crear tablas nuevas.

## 9. Bloqueos y riesgos

- **P1:** saldo a favor y reembolso autorizado diferido. Decisión pendiente sobre el comportamiento por defecto (sección 4 del diseño).
- **P1:** pantalla de devoluciones sin captura de comprobante del procesador: un reembolso con tarjeta falla con 400.
- **P2:** unicidad del comprobante de reembolso (requiere migración de `origen`).
- **P2:** cotización convertida sin plazo: vencimiento nulo por diseño; confirmar con el propietario si debe pedirse vencimiento manual.
- **P2:** el cajero no tiene perfil intermedio para CXP; se mantiene la regla aprobada.

## 10. Límites

- Sin verificación en dispositivo móvil real ni en Vercel/Render.
- Sin merge, despliegue ni migración productiva.
