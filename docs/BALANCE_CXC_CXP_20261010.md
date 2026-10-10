# BALANCE: cuentas por cobrar y por pagar (2026-10-10)

**Firma:** BALANCE — Desarrollo Financiero FerreSystem.
**Base:** `claude/conciliacion-pagos-cxc` (PR #135, pendiente). Rama: `claude/balance-cxc-cxp`. HEAD: `5f974f76`. PR #142 en draft. Sin merge, sin migraciones productivas, sin despliegue, sin cambios en `main`.

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

Reglas ya en código y probadas (`backend/test/devoluciones-cxc.postgres.integration.ts`, 4/4):

- Devolución parcial con deuda pendiente: reduce el saldo de la cuenta y no genera movimiento de caja.
- Devolución de factura ya abonada: cancela primero el crédito pendiente y reembolsa el excedente con movimiento de caja negativo; los pagos históricos no cambian.
- Reintento con la misma solicitud: devuelve la misma devolución, un solo reembolso.
- Dos devoluciones totales simultáneas: solo una aplica.

**No implementado:** saldo a favor del cliente y reembolso parcial diferido. Requieren modelo de saldo a favor con movimientos auditables (ver bloqueos).

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

## 6. Pruebas (2026-10-10, entorno local, Playwright sobre Chromium 1194)

| Suite | Resultado |
|---|---|
| `cxc-cxp-balance.postgres.integration.ts` | 11/11 |
| `pagos-bancarios.postgres.integration.ts` | 22/22 |
| `devoluciones-cxc.postgres.integration.ts` | 4/4 |
| Integración PostgreSQL completa | 25 archivos, 409 aprobadas, 1 omitida (ya omitida antes de BALANCE) |
| Backend unitarias | 345/345 |
| Frontend unitarias | 225/225 |
| `tsc --noEmit` frontend | sin errores |
| Playwright simulado (completo) | 126/126 |
| E2E real `frontend/e2e-real/run.sh` | 35/35; incluye 6 de BALANCE en `balance-real.spec.ts` |

**Real E2E BALANCE:** backend NestJS y PostgreSQL temporal, frontend real, sin mocks. Cubre: deuda y abono con saldo actualizado en pantalla y base; pago a proveedor con referencia e historial que muestra referencia y responsable; referencia repetida 409 sin cambio de saldo; cajero sin CXP (403); bodeguero sin cuentas; empresa B no ve ni abona cuentas de empresa A (404, saldo intacto).

**Corrección durante la integración:** el historial de pagos no mostraba referencia ni responsable aunque la API los devolvía; el E2E real lo detectó y se corrigió.

## 7. Bloqueos y decisiones del dueño

1. **Saldo a favor:** sin modelo de saldo a favor, un excedente de devolución siempre se reembolsa de caja. Decisión: crear saldo a favor con movimientos auditables.
2. **Reembolso parcial diferido:** hoy el reembolso es inmediato. Decisión pendiente junto con el punto 1.
3. **Plazo en cotizaciones:** la conversión de cotización a venta crea CXC con vencimiento nulo. Requiere cambio en la conversión (ATLAS).
4. **VENCIDA:** hoy usa la fecha de vencimiento guardada (desde el plazo). Confirmar si debe medirse desde la fecha de venta cuando no hay plazo.
5. **Referencia única:** hoy por factura, con idempotencia por solicitud obligatoria. Confirmar si debe ser por empresa.
6. **Perfil intermedio:** el cajero no paga proveedores. Confirmar si debe existir un perfil intermedio.
7. **Reembolso con tarjeta:** requiere autorización bancaria igual que los cobros. Pendiente de decisión.

## 8. Pendientes y coordinación

- **NEXUS:** aplicar ambas migraciones; revisar restricciones compuestas por empresa en `pagos_cuenta`, `aprobaciones_bancarias` y `clientes`.
- **ATLAS:** revisar `ventas.service.ts` (vencimiento por plazo) y la conversión de cotizaciones; BALANCE no tocó inventario ni entregas.
- **CENTINELA:** revisión multi-tenant de `pagos_cuenta`, `usuarios`, `clientes`, `proveedores`, `aprobaciones_bancarias`, `ventas`, `ordenes_compra`. Sin migraciones de seguridad implementadas por BALANCE.
- **Fuera de BALANCE:** `frontend/e2e-real/contingencia-real.spec.ts` (caso 9) depende del stock compartido del Taladro; debe aislar su fixture.

## 9. Límites

- Sin verificación en dispositivo móvil real ni en Vercel/Render: solo pruebas locales.
- No hay merge, despliegue ni migración productiva en esta fase.
- El cierre para producción requiere resolver los bloqueos 1–7 y la aplicación de migraciones por NEXUS.
