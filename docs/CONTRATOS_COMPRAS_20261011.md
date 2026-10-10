# Compras: contratos de integración y propuesta de ajuste de costo (2026-10-11, FORJA)

Rama: `claude/forja-compras-proveedores` (PR #143, apilada sobre #140). Sin merge, despliegue ni migraciones productivas.

## Contrato para KARDEX: `precioCosto` y `costoVigente`

| Operación | `precioCosto` | `costoVigente` | `precioVenta` / aprobación |
|---|---|---|---|
| Alta de producto (ADMIN con costo) | fija el costo inicial | sin cambio (null) | ADMIN fija precio; aprueba |
| Alta de producto (personal) | 0 | null | sin precio: pendiente |
| Recepción de compra válida (`recibir`) | = costo de la línea recibida | = costo de la línea recibida | sin cambio |
| Edición manual de costo (`cambiarPrecios`) | solo si `costoVigente` es null | bloqueada si hay compra recibida (400) | sin cambio |
| Ajuste de existencias / conteo / entrega / venta | sin cambio | sin cambio | sin cambio |

Reglas: el costo vigente es el de la última recepción, incluso si baja. Cada recepción registra en auditoría `COMPRA_RECIBIR` el costo anterior (`costoAnterior`, `costoVigenteAnterior`) y el nuevo (`costoNuevo`), con compra, factura, proveedor y responsable. Las dos columnas se escriben juntas en `recibir`; KARDEX no debe escribir ninguna por separado.

## Contrato para BALANCE: cuentas por pagar

- Una factura (`compra`) crea una sola `cuentas_operativas` tipo CXP por el total, por `account()`. La recepción no crea ni modifica la deuda.
- Número de factura: único por proveedor, sin distinguir mayúsculas ni espacios (`compra`, con bloqueo de empresa). Sin índice único en base de datos.
- El plazo se conserva en `vencimiento` de la cuenta.
- `pagar` no escribe existencias ni costos (verificado por prueba).
- Pruebas de integración listas: `backend/test/integracion-balance.postgres.integration.ts` (7 casos).
  - Ejecutadas sobre la rama de BALANCE (`origin/claude/balance-cxc-cxp`, commit `7ab1cea5`, en árbol temporal): **7/7**.
  - Ejecutadas sobre esta rama (sin #142): **7/7**.
  - Pendiente: ejecutar sobre una rama de integración con ambos cambios. La combinación actual tiene conflictos (ver NEXUS).

## Contrato para NEXUS: migraciones y archivos compartidos

- #143 depende de #140 (`claude/keen-goldberg-62o7f1`). No es independiente.
- Archivos compartidos con BALANCE (#135/#142) que pueden generar conflicto: `frontend/src/locales/es.json`, `frontend/src/locales/en.json`, `backend/test/ventas.postgres.integration.ts`, `backend/test/reportes-zona-horaria.postgres.integration.ts` (listas de migraciones), `frontend/src/pages/OperacionesPage.tsx`.
- La combinación de `claude/forja-compras-proveedores` con `claude/balance-cxc-cxp` tiene conflictos en esos cuatro archivos. No fueron resueltos por FORJA.
- Migraciones nuevas de #140: `20261011150000_precio_aprobacion_producto` (revisar `WHERE precio_venta > 0`). #143 no agrega migraciones.

## Propuesta: ajuste administrativo excepcional de costo (no implementado)

Motivo: el costo vigente solo cambia por compra recibida. Puede haber errores de captura en una factura ya recibida que necesiten corrección.

- Quién: solo ADMIN, con autorización explícita (confirmación de un segundo administrador si el cambio supera un umbral; a definir por el dueño).
- Qué: un evento `AJUSTE_COSTO_EXCEPCIONAL` con costo anterior, costo nuevo, producto, compra de origen opcional y **motivo obligatorio**.
- Efectos: actualiza `costoVigente` y `precioCosto`; no cambia precio de venta ni aprobación; no cambia existencias ni deuda de la factura.
- Auditoría: antes y después, motivo, responsable, fecha y compra de referencia.
- Pendiente de decisión del dueño: umbral, segundo aprobador y si el ajuste se refleja en el historial `costos_compra`.

## Pruebas

- Unitarias backend: 345/345. Frontend unitarias: 233/233 + `compras-flujo.test.mjs` 4/4.
- PostgreSQL real: `test/compras-cierre.postgres.integration.ts` 10/10; `test/integracion-balance.postgres.integration.ts` 7/7.
- Playwright simulado: compras y contado 13/13 en las pruebas afectadas.
- E2E con backend real: `e2e-real/compras-real.spec.ts` 2/2 (administrador: parcial, total, existencias, costo y una deuda; personal: recibe sin ver costos).
