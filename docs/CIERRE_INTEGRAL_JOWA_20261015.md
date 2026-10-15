# Cierre integral de Jowa System — matriz de seguimiento

Fecha: 15 de octubre de 2026. Rama única: `claude/cierre-integral-jowa`, base `main` `74ba4dcc`. Sin merge, sin despliegue, sin acceso a datos productivos. Datos sintéticos en PostgreSQL 16 temporal.

**Trabajo paralelo respetado.** Antes de modificar código se consultaron los PR abiertos [#165](https://github.com/Nelosama/FerreSystem/pull/165) (74 archivos) y [#166](https://github.com/Nelosama/FerreSystem/pull/166) (13 archivos). No se modificó ninguno de sus archivos, entre ellos `operaciones.service.ts`, `operaciones.controller.ts`, `ledger.ts`, `POSPage.tsx`, `App.tsx`, `CotizacionesPage.tsx`, `OperacionesPage.tsx`, `Sidebar.tsx`, `vercel.json` y `docs/CONTEXTO_MAESTRO.md` (este último lo modifica #165; por eso la bitácora vive en este informe, como hizo #166). Los defectos encontrados en esos archivos se documentan abajo y se comunicaron en el PR correspondiente.

## Matriz

| ID | Módulo | Defecto | Prioridad | Estado | Prueba |
|---|---|---|---|---|---|
| JW-01 | Cotizaciones → crédito | La cotización convertida a CREDITO creaba la CxC **sin vencimiento**, ignorando `plazoCreditoDias` (la venta directa sí lo aplica). La factura nunca pasaba a VENCIDA. | P1 | Corregido | `backend/test/credito.postgres.integration.ts` «JW-01» (rojo: `null` ≠ fecha; verde tras la corrección) |
| JW-02 | Cotizaciones → venta | La conversión no comprobaba precio aprobado ni producto activo al vender: un ADMIN vendía un producto cuyo precio se **revocó** después de cotizar (la venta directa lo bloquea). | P1 | Corregido | `backend/test/cotizaciones.postgres.integration.ts` «JW-02» (HTTP + PG; rojo 201 → verde 400, sin venta ni reservas) |
| JW-03 | Dashboard | La barra «HOY» de la tendencia semanal suma ventas brutas mientras la tarjeta «ventas del día» resta devoluciones: dos cifras distintas en el mismo panel. Se corrigió y se **revirtió**: `reportes-zona-horaria.postgres.integration.ts` afirma de forma explícita esa diferencia (60 bruto / 45 neto), así que es una regla vigente. | P2 | Requiere decisión del dueño (tendencia bruta o neta) | Prueba existente FS-05 conservada |
| JW-04 | Cotizaciones → venta (fiscal/permisos) | Cualquier rol que cotiza puede fijar `porcentajeIsv` o marcar líneas exentas; un **cajero convertía** esa cotización y facturaba sin ISV, algo que la venta directa no permite. Ahora, igual que el precio modificado, solo ADMIN convierte cotizaciones con ISV ≠ 15 % o líneas exentas. | P1 | Corregido (regla reversible; confirmar con el dueño) | `backend/test/ciclo-ventas.postgres.integration.ts` «JW-04» (HTTP + PG; rojo 201 → verde 400; ADMIN sí convierte) |
| JW-05 | Clientes / crédito | El backend calcula el vencimiento con `plazoCreditoDias` (decisión aprobada), pero la pantalla de Clientes **no tenía el campo**: ningún cliente podía tener plazo y ninguna factura vencía. | P1 | Corregido | `frontend/test/clientes-credito-ui.test.mjs` «JW-05» (validación 1–365 y envío del campo) |
| JW-06 | Cotizaciones → venta (monetario) | La venta convertida calculaba subtotales con `money(cantidad × precio)` en coma flotante: 2.5 × 25.99 = 64.97 en la venta frente a 64.98 en la cotización y en la venta directa; subtotal − descuento + ISV no cuadraba con el total. | P1 | Corregido | `backend/test/cotizaciones.postgres.integration.ts` «JW-06» |
| JW-07 | Compras (CxP) | `compra()` calcula subtotales de línea y de factura con `money(cantidad × costo)`: 2.5 × 25.99 da 64.97, la factura del proveedor dice 64.98. La CxP queda un centavo corta. | P1 | Bloqueado: `operaciones.service.ts` pertenece a #165/#166. Comunicado en #166 | Reproducción: `Math.round((2.5*25.99+Number.EPSILON)*100)/100 === 64.97` |
| JW-08 | Proveedores | No hay pantalla para editar, desactivar ni capturar el RTN de un proveedor (`OperacionesPage` solo crea nombre y teléfono). `/operaciones/proveedores` lista también inactivos. Existe `PATCH/DELETE /proveedores/:id` sin interfaz. | P2 | Bloqueado: `OperacionesPage.tsx` pertenece a #165 | — |
| JW-09 | Usuarios / permisos | El permiso «Anular ventas» (`pos.anular_venta`) se puede asignar pero ninguna ruta lo usa: no existe anulación de ventas (se usa Devoluciones). | P2 | Requiere decisión: implementar anulación o retirar la casilla | — |
| JW-10 | Dashboard / permisos | BODEGUERO y VENDEDOR ven en el panel el total de ventas del día y las últimas ventas con cliente e importe, aunque `GET /ventas` está vedado a BODEGUERO. | P2 | Requiere decisión del dueño | — |
| JW-11 | Cotizaciones | Una cotización en estado RECHAZADA se puede convertir en venta (solo se bloquean CONVERTIDA y vencida). | P3 | Requiere decisión | — |

## Módulos revisados

Ventas/POS (servicio, controlador, cobro y entrega), cotizaciones (creación, edición, conversión), clientes y crédito, cuentas por cobrar/pagar (lectura; servicio protegido), compras y recepción (lectura; protegido), caja y arqueo (frontend y lectura del servicio), dashboard y reportes, productos e inventario, entregas, garantías, levantamiento, usuarios y permisos, autenticación JWT (rol leído de la base en cada petición), contingencia (lectura), aislamiento multi-tenant en SQL crudo (todas las consultas sin `tenant_id` operan sobre registros ya validados por empresa).

Estado por módulo: ventas, cotizaciones, clientes/crédito, caja, compras, CxC/CxP, inventario, entregas, garantías, devoluciones, levantamiento, usuarios y reportes **operativos** con las salvedades de la matriz. Transferencias y existencias por sucursal **pendientes** (no existe modelo de sucursal; módulo oculto). Apartados, pedidos especiales, listas de precio y comisiones **pendientes de decisión** (ver `FASE_FUNCIONAL_MODULOS_ADMIN_20261010.md`). Contingencia offline implementada y **apagada** para el piloto.

## Pruebas ejecutadas

Ver la sección «Evidencia» al final (se completa con el SHA final).

## Pendientes externos

- Integrar JW-07 y JW-08 cuando #165/#166 liberen `operaciones.service.ts` y `OperacionesPage.tsx`.
- Decisiones JW-04 (confirmar), JW-09, JW-10, JW-11.
- `frontend/vercel.json` (protegido por #166) no excluye esta rama de las vistas previas de Vercel; una vista previa no es producción, pero conviene añadir la exclusión al integrar.
- Los pendientes del contexto maestro siguen vigentes: destino externo de respaldos, aceptación en equipos físicos, impresión real, datos reales.
