# Correcciones de seguridad D1, D3 y R1 (ATLAS, base `nexus/integracion-temp` @ `e8b75ae6`)

## D1 (P1) — entrega solo por ADMIN y BODEGUERO
- `POST /operaciones/ventas/:id/entregar`: `@Roles('ADMIN','BODEGUERO')` en el controlador y `authorizedActor(['ADMIN','BODEGUERO'])` dentro de la transacción (el servicio también rechaza invocaciones directas). Un cajero con permisos personalizados tampoco puede: manda el rol.
- La denegación ocurre antes de tocar inventario, venta, movimientos o auditoría. Pruebas: `backend/test/centinela-correcciones.postgres.integration.ts` (CAJERO, segundo CAJERO, VENDEDOR y cajero con permisos → 403 con stock, reserva, `entregado_at`, movimientos y auditoría intactos; BODEGUERO y ADMIN entregan una sola vez aun en paralelo; administrador de otra empresa → 404).
- Interfaz: la lista de entregas del cajero ya no muestra «Confirmar entrega».

## R1 (P2) — consulta de entregas por rol
`GET /operaciones/entregas`: ADMIN y BODEGUERO ven todas las pendientes de su empresa; CAJERO solo las ventas que registró; VENDEDOR sigue sin acceso (403); otra empresa no ve nada. La lista del bodeguero sigue sin costos. El `LEFT JOIN` a clientes ahora también filtra por empresa.

## D3 (P2) — solicitudes idempotentes y empresas ajenas
**Causa:** varias tablas usaban la solicitud del cliente como clave primaria global (`ventas`, `proveedores`, `ordenes_compra`, `cajas`, `movimientos_caja`, `solicitudes_devolucion`, `devoluciones`, conteos de levantamiento). Con un identificador ya usado por otra empresa la respuesta era un 409/500 distinto al de un identificador libre (probado: proveedor → 500, movimiento y devolución → 409, venta → 409 «utilizada para otra venta»).

**Corrección:** el identificador interno se deriva por empresa, `idSolicitud(tenantId, solicitudId)` (`operaciones/ledger.ts`, SHA-256 con formato UUID v4). Las búsquedas siempre filtran por empresa y aceptan el identificador derivado o el crudo (registros anteriores y cuando la interfaz reutiliza el `id` de una lista). Resultado: un mismo UUID funciona en dos empresas sin chocar, sin revelar su uso, y el reintento dentro de la empresa devuelve el registro original sin duplicar; el mismo identificador con otro contenido sigue siendo 409 dentro de la empresa. El bloqueo de la venta incluye la empresa (`VENTA:<tenant>:<solicitud>`).

**Contrato que cambia:** el `id` de esos registros ya no es igual a la solicitud (las rutas por solicitud siguen aceptándola). Pruebas existentes que lo asumían se actualizaron (`compras-proveedores.spec`, `sec-003-devoluciones.spec`, `ventas.contingencia-caracterizacion.spec`, `ventas.postgres`, `qa-ciclo-venta` real).

**No cubierto (riesgo residual, P2 bajo):** `dispositivos_pos` y `operaciones_contingencia` siguen respondiendo 409 «no disponible» ante un UUID de otra empresa. Sus identificadores los genera y conserva el equipo sin conexión y los ecos de la sincronización los comparan literalmente; derivarlos exige coordinar el cliente offline (o una clave `(tenant_id, id)` de NEXUS). Se dejó intacto a propósito para no afectar la operación sin conexión. Los UUID v4 no son adivinables.

## Pruebas (2026-10-10)
Unitarias backend 366/366; integración PostgreSQL 536/537 (la única falla, «Chromium real: conversión por transferencia…», falla igual en `e8b75ae6` sin estos cambios); E2E real (`e2e-real/run.sh`) 69 aprobadas, 5 omitidas; frontend `npm test` 245/245; Playwright simulado 137/138 (la falla es un caso de contingencia intermitente que pasa 2/2 en aislamiento).
