# BALANCE: cuentas por cobrar y por pagar (2026-10-10)

**Firma:** BALANCE — Desarrollo Financiero FerreSystem.
**Base:** `claude/conciliacion-pagos-cxc` (PR #135, pendiente). Rama: `claude/balance-cxc-cxp`. Sin merge, sin migraciones productivas, sin despliegue, sin cambios en `main`.

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

- **Estado de deuda por cuenta:** PENDIENTE, PARCIAL, VENCIDA (vencimiento pasado con saldo), PAGADA (saldo cero) y filtro POR_VENCER (vence dentro de los próximos 7 días del día de negocio).
- **Filtros:** cliente o proveedor, estado de deuda y fecha de emisión (día de negocio `America/Tegucigalpa`).
- **Historial de pagos:** fecha, monto, método, responsable (nombre) y referencia (autorización bancaria o comprobante del proveedor).
- **Estado de cuenta del cliente:** movimientos cronológicos (cargos por factura y abonos) con saldo acumulado; el último saldo coincide con el saldo abierto de las cuentas.
- **Referencia de pago a proveedor:** opcional. No se repite dentro de la misma factura (evita pagar dos veces con el mismo comprobante). La misma referencia sí puede usarse en otra factura.
- **Permisos:** CXC lo ven y pagan ADMIN y CAJERO. CXP lo ven y pagan solo ADMIN; el cajero recibe 403. BODEGUERO no accede a cuentas.

## 3. Pantallas y endpoints

| Recurso | Quién | Notas |
|---|---|---|
| `GET /operaciones/cuentas?tipo=CXC\|CXP&estado&clienteId&proveedorId&desde&hasta` | ADMIN y CAJERO (CXP solo ADMIN) | Incluye `estado`, `vencida`, `por_vencer`, `pagos` con `usuario_nombre`, `referencia`, `terminal` |
| `POST /operaciones/cuentas/:id/pagos` | ADMIN y CAJERO (CXP solo ADMIN) | Campo nuevo opcional `referencia` para CXP |
| `GET /operaciones/clientes/:id/estado-cuenta` | ADMIN | Campo nuevo `movimientos` |
| Pantalla Cuentas (`/cuentas`) | Según rol | Filtros, distintivo de estado, referencia de pago a proveedor |
| Pantalla Estado de cuenta (`/estado-cuenta-clientes`) | ADMIN | Tabla de movimientos con saldo acumulado y responsable |

## 4. Migración

`backend/prisma/migrations/20261013000000_balance_referencia_pagos`: añade `pagos_cuenta.referencia` (nullable) y un índice único parcial por empresa, cuenta y referencia. No modifica filas existentes. Aplicar con `prisma migrate deploy` tras copia de seguridad y revisión de DBA. El modelo `PagoCuenta` tiene el campo nuevo (una línea).

## 5. Pruebas (2026-10-10, entorno local)

| Suite | Resultado |
|---|---|
| `cxc-cxp-balance.postgres.integration.ts` (nueva) | 10/10: varios abonos con estado parcial y saldo correcto, pago total y CXC pagada, sobrepago, reintento sin duplicar, pagos concurrentes (solo uno aplica, saldo nunca negativo), facturas de proveedor duplicadas, estados vencida/parcial/pagada/por vencer, referencia repetida en la misma factura, permisos ADMIN/CAJERO/BODEGUERO, separación entre empresas y persistencia tras cerrar y reabrir la conexión |
| `estado-cuenta-cliente` y suites de caja, crédito, compras, ventas, pagos bancarios y clientes | 166/166 antes de añadir la prueba nueva; todas en verde |
| Integración PostgreSQL completa | 24 archivos, 402 aprobadas, 1 omitida |
| Backend unitarias | 345/345 |
| Frontend unitarias | 225/225 |
| Playwright Chromium | 126/126; incluye 3 E2E nuevas (filtro y pago a proveedor con referencia; movimientos con saldo acumulado; cajero sin cuentas por pagar) |

**Devoluciones con crédito:** se verifican con las pruebas existentes de cancelación (abonos previos, reembolso, caja). No se añadieron pruebas nuevas.

## 6. Bloqueos y decisiones del dueño

1. **Vencimiento de facturas de cliente:** el estado VENCIDA usa la fecha de vencimiento de la venta a crédito. ¿Debe calcularse desde el plazo del cliente?
2. **Pagos de proveedor con tarjeta:** no exigen autorización bancaria (solo la referencia opcional). ¿Debe exigirse el mismo control que en cobros?
3. **Cajero y cuentas por pagar:** el cajero no paga proveedores. ¿Debe existir un perfil intermedio?
4. **Reembolsos con crédito abonado:** siguen la regla vigente; es decisión pendiente desde la fase de devoluciones.
5. **Referencia única por empresa:** hoy la unicidad es por factura. ¿Debe ser por empresa para evitar pagar dos facturas con el mismo comprobante?
6. **Reportes avanzados:** no se han iniciado, como indicó la prioridad.

## 7. Límites

- Sin verificación en dispositivo móvil real ni en Vercel/Render: solo pruebas locales y simuladas.
- Playwright usa backend simulado; la persistencia la prueban las pruebas PostgreSQL.
- Los nuevos endpoints no cambian contratos del POS offline; ATLAS debe revisar que no dependa del listado de cuentas.

## 8. Instrucciones breves para integrar

1. Integrar después de #135 (PR de pagos), porque reutiliza `aprobaciones_bancarias` y `normalizarAutorizacion`.
2. Aplicar `20261013000000_balance_referencia_pagos` después de `20261012000000_conciliacion_pagos_bancarios`.
3. Ejecutar `npx prisma generate` antes de compilar.
4. Las listas explícitas de migraciones de `ventas` y `reportes-zona-horaria` ya incluyen la nueva migración.
5. Verificar en staging un abono y un pago a proveedor con referencia antes de usarlos en producción.
