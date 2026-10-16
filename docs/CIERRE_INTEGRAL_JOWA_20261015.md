# Cierre integral de Jowa System — matriz de seguimiento

Fecha: 15 de octubre de 2026. Rama única: `claude/cierre-integral-jowa`, base `main` `74ba4dcc`. Sin merge, sin despliegue, sin acceso a datos productivos. Datos sintéticos en PostgreSQL 16 temporal.

**Trabajo paralelo respetado.** Antes de modificar código se consultaron los PR abiertos [#165](https://github.com/Nelosama/FerreSystem/pull/165) (74 archivos) y [#166](https://github.com/Nelosama/FerreSystem/pull/166) (13 archivos). No se modificó ninguno de sus archivos, entre ellos `operaciones.service.ts`, `operaciones.controller.ts`, `ledger.ts`, `POSPage.tsx`, `App.tsx`, `CotizacionesPage.tsx`, `OperacionesPage.tsx`, `Sidebar.tsx`, `vercel.json` y `docs/CONTEXTO_MAESTRO.md` (este último lo modifica #165; por eso la bitácora vive en este informe, como hizo #166). Los defectos encontrados en esos archivos se documentan abajo y se comunicaron en el PR correspondiente.

## Matriz

| ID | Módulo | Defecto | Prioridad | Estado | Prueba |
|---|---|---|---|---|---|
| JW-01 | Cotizaciones → crédito | La cotización convertida a CREDITO creaba la CxC **sin vencimiento**, ignorando `plazoCreditoDias` (la venta directa sí lo aplica). La factura nunca pasaba a VENCIDA. | P1 | Corregido | `backend/test/credito.postgres.integration.ts` «JW-01» (rojo: `null` ≠ fecha; verde tras la corrección) |
| JW-02 | Cotizaciones → venta | La conversión no comprobaba precio aprobado ni producto activo al vender: un ADMIN vendía un producto cuyo precio se **revocó** después de cotizar (la venta directa lo bloquea). | P1 | Corregido | `backend/test/cotizaciones.postgres.integration.ts` «JW-02» (HTTP + PG; rojo 201 → verde 400, sin venta ni reservas) |
| JW-03 | Dashboard | La barra «HOY» de la tendencia suma ventas **brutas** y la tarjeta «ventas del día» resta devoluciones (**neto**). Es la regla vigente: `reportes-zona-horaria.postgres.integration.ts` afirma 60 bruto / 45 neto. Con #165 ya integrado se rotularon ambas cifras sin cambiar el cálculo (`f14b759e`): «Ventas del día (netas de devoluciones)» y «Tendencia semanal (ventas brutas)». Pasar la tendencia a neto sigue siendo decisión del dueño. | P2 | Corregido (rotulado); cálculo: requiere decisión | `e2e/admin-home-simulado.spec.ts` |
| JW-04 | Cotizaciones → venta (fiscal/permisos) | Cualquier rol que cotiza puede fijar `porcentajeIsv` o marcar líneas exentas; un **cajero convertía** esa cotización y facturaba sin ISV, algo que la venta directa no permite. Ahora, igual que el precio modificado, solo ADMIN convierte cotizaciones con ISV ≠ 15 % o líneas exentas. | P1 | Corregido (regla reversible; confirmar con el dueño) | `backend/test/ciclo-ventas.postgres.integration.ts` «JW-04» (HTTP + PG; rojo 201 → verde 400; ADMIN sí convierte) |
| JW-05 | Clientes / crédito | El backend calcula el vencimiento con `plazoCreditoDias` (decisión aprobada), pero la pantalla de Clientes **no tenía el campo**: ningún cliente podía tener plazo y ninguna factura vencía. | P1 | Corregido | `frontend/test/clientes-credito-ui.test.mjs` «JW-05» (validación 1–365 y envío del campo) |
| JW-06 | Cotizaciones → venta (monetario) | La venta convertida calculaba subtotales con `money(cantidad × precio)` en coma flotante: 2.5 × 25.99 = 64.97 en la venta frente a 64.98 en la cotización y en la venta directa; subtotal − descuento + ISV no cuadraba con el total. | P1 | Corregido | `backend/test/cotizaciones.postgres.integration.ts` «JW-06» |
| JW-07 | Compras (CxP) | `compra()` calcula línea y factura con `money(cantidad × costo)`: 2.5 × 25.99 = 64.97 frente a 64.98 de la factura; la CxP queda un centavo corta (igual en la devolución proporcional). Solución propuesta (misma de JW-06): `subtotalLinea(aCentavos(costo), Math.round(cantidad*100))`. #166 (`afd14930`) aún no la incluye. | P1 | Bloqueado: `operaciones.service.ts` en #165 y #166. [Comunicado en #166](https://github.com/Nelosama/FerreSystem/pull/166#issuecomment-6186403393) | Reproducción numérica en el comentario |
| JW-08 | Proveedores | `PATCH /proveedores/:id` no admitía RTN ni dirección, no auditaba y respondía 404 con un proveedor desactivado. **Backend** (`ceaeb710`): edición parcial con RTN y dirección, reactivación, desactivación idempotente, auditoría `PROVEEDOR_EDITAR/_REACTIVAR/_DESACTIVAR`, solo ADMIN y aislamiento por empresa. **Interfaz** (`63e940ac`, tras integrarse #165): panel «Proveedores registrados» en Compras con edición (solo envía lo que cambió), desactivación y reactivación; RTN en el alta; la factura de compra ya no ofrece proveedores desactivados. **Pendiente:** el servidor aún acepta una compra con un proveedor inactivo enviada por API (`compra()` en `operaciones.service.ts`, archivo de #166). | P2 | Corregido (pendiente menor bloqueado por #166) | `proveedores-gestion.postgres.integration.ts` 5/5 (3 en rojo con el código anterior), `proveedor-edicion.test.mjs`, `e2e/proveedores-gestion-simulado.spec.ts` 3/3 |
| JW-09 | Usuarios / permisos | El permiso «Anular ventas» (`pos.anular_venta`) se asignaba en Usuarios pero el servidor no lo aplica: no existe anulación (una venta se revierte con devolución; directa solo ADMIN). Se retiró la casilla (`a25b6177`). Prueba de servidor: cajero con el permiso → 403 y venta intacta; ADMIN con el mismo cuerpo → 201. | P2 | Corregido | `ciclo-ventas.postgres.integration.ts` «JW-09» (HTTP + PG) y `frontend/test/usuarios-permisos.test.mjs` |
| JW-10 | Permisos / BODEGUERO | `GET /ventas` está vedado a BODEGUERO, pero `GET /dashboard` le devolvía ventas del día, tendencia y últimas ventas con cliente e importe, y `GET /entregas/pendientes` y `/entregas/ventas/:id` el total de cada venta. Ahora recibe un resumen operativo (existencias y cotizaciones) y entregas sin importe; la interfaz no muestra un L 0.00 falso (`b7404b07`). ADMIN y VENDEDOR sin cambios. | P1 | Corregido | `dashboard.postgres.integration.ts` y `centinela-entregas-148.postgres.integration.ts` «JW-10» (HTTP + PG), `e2e/bodeguero-sin-ventas-simulado.spec.ts` |
| JW-11 | Cotizaciones | La interfaz solo ofrece convertir cotizaciones enviadas/aprobadas, pero el servidor convertía una **RECHAZADA** (`0845c851`). Ahora debe reabrirse antes. BORRADOR sigue convertible por API (regla vigente probada). | P1 | Corregido | `cotizaciones.postgres.integration.ts` «JW-11» (HTTP + PG, rojo 201 → verde 400) |

## Módulos revisados

Ventas/POS (servicio, controlador, cobro y entrega), cotizaciones (creación, edición, conversión), clientes y crédito, cuentas por cobrar/pagar (lectura; servicio protegido), compras y recepción (lectura; protegido), caja y arqueo (frontend y lectura del servicio), dashboard y reportes, productos e inventario, entregas, garantías, levantamiento, usuarios y permisos, autenticación JWT (rol leído de la base en cada petición), contingencia (lectura), aislamiento multi-tenant en SQL crudo (todas las consultas sin `tenant_id` operan sobre registros ya validados por empresa).

Estado por módulo: ventas, cotizaciones, clientes/crédito, caja, compras, CxC/CxP, inventario, entregas, garantías, devoluciones, levantamiento, usuarios y reportes **operativos** con las salvedades de la matriz. Transferencias y existencias por sucursal **pendientes** (no existe modelo de sucursal; módulo oculto). Apartados, pedidos especiales, listas de precio y comisiones **pendientes de decisión** (ver `FASE_FUNCIONAL_MODULOS_ADMIN_20261010.md`). Contingencia offline implementada y **apagada** para el piloto.

## Pruebas ejecutadas (código en `80c58ec5`)

Entorno: Node 22.22.0 (CI usa 24), npm 11 para `npm ci`, PostgreSQL 16 temporal ejecutado con un usuario sin privilegios (envoltorio externo `PG_BIN`, no versionado), Chromium 1194 del entorno.

- Línea base en `main` `74ba4dcc`: backend unitarias 446/446; frontend unitarias 312/312; integración PostgreSQL 934 aprobadas y 1 omitida (las 2 rojas eran regresiones nuevas JW-02/JW-03 antes de corregir).
- Final: backend build correcto; unitarias **446/446**; `test:scripts` **48/48**; integración PostgreSQL **58 archivos, 938 aprobadas, 1 omitida** (prueba de navegador condicionada, ya existente).
- Frontend (`d221d32f`, sin cambios posteriores en `frontend/`): `tsc -b` + `vite build` con `VITE_API_URL=/api` correctos; unitarias **314/314**; oxlint 0 errores (112 avisos previos); Playwright simulado **146/146**.
- E2E real (backend NestJS + PostgreSQL + Chromium, `e2e-real/run.sh`): **140 aprobadas, 10 omitidas, 0 fallos**. Las omitidas son pendientes ya documentados (vuelto en POS en línea, canal web, reporte por cajero, latencia controlada, entrega parcial, datáfono).
- Flujos completos cubiertos por esas suites: apertura de caja → venta → cobro → entrega → cierre; compra → recepción → inventario → venta; cliente → crédito → factura → abono → saldo cero; cotización → conversión (contado/crédito).
- Durante la validación, una prueba vigente (FS-05) falló con JW-03. JW-03 se revirtió en lugar de modificar la prueba. Una fixture unitaria incompleta (producto sin `precioAprobado`) se completó sin cambiar su aserción.

## Segunda fase (2026-10-15)

Correcciones nuevas en esta rama, cada una con regresión que falla antes y pasa después: JW-11 (`0845c851`), JW-10 (`b7404b07`), JW-09 (`a25b6177`) y JW-08 backend (`ceaeb710`).

Revisados sin defecto reproducible:
- **Crédito:** el plazo y el vencimiento aplican a la venta directa y a la convertida (JW-01, JW-05). Los abonos parciales y totales, el tope de saldo y la idempotencia ya tenían pruebas HTTP + PG (`credito`, `redondeo-cobro`, `qa-ciclo-venta`).
- **CxP:** no toca la caja con ningún método (regla FS-09 en `pagar()`). Un pago a proveedor exige ADMIN, y un pago electrónico exige referencia no repetida.
- **Inventario:** la aplicación del conteo rechaza conteos menores que lo pendiente de entrega y vistas previas obsoletas; las ventas bajo pedido exigen proveedor.
- **Usuarios:** el rol se valida contra el enum (sin escalada a SUPERADMIN), el rol se lee de la base en cada petición, y el último administrador está protegido.
- **Estado de cuenta:** vencidas según la zona del negocio y conciliación con el saldo del cliente.

## Integración con #165 y #166

Simulación local con `git merge-tree`, sin crear ramas, sobre `main` `74ba4dcc`, #165 `28ffbde9` y #166 `afd14930`:
- #165 + #166 solo chocan en `docs/CONTEXTO_MAESTRO.md` (documental).
- Esta rama se fusiona encima **sin conflictos**.
- `ContingenciaAdminPage.tsx` recibe dos correcciones complementarias del mismo defecto (la de #165 conserva la confirmación tras recargar; la de #166 la muestra después de recargar). Conviven sin contradicción.

## Evidencia de la segunda fase

| Ejecución | Backend unitarias | Scripts | Integración PG (navegador real) | Frontend unitarias | Navegador simulado | E2E real |
|---|---|---|---|---|---|---|
| Esta rama, código `ceaeb710` | 446/446 | 48/48 | 948/948 | 316/316 | 148/148 | 140 OK, 10 omitidas, 0 fallos |
| Conjunta main + #165 `28ffbde9` + #166 `afd14930` + esta rama (commit temporal local, sin rama) | 486/486 | 48/48 | 977/977 | 334/334 | 152/152 | 145 OK, 10 omitidas, 0 fallos |

Builds correctos y lint del frontend sin errores. CI de GitHub en `88167a17`: `validate`, `test` y `guard-base-datos` aprobados.

En `b7404b07`, `validate` falló una vez en `contingencia-admin-simulado.spec.ts:83`. Es un defecto intermitente heredado de `main`: la recarga borraba la confirmación de la decisión. #165 (`28ffbde9`) y #166 (`afd14930`) ya lo corrigen; no se porta aquí porque el archivo pertenece a ambos PR. Verificación con compilación nueva en #165: falló 1 de 20 ejecuciones sin la corrección y 0 de 20 con ella.

## Integración de #165 en main (2026-10-16)

#165 se integró en `main` (`34dd1feb`). Esta rama incorporó `main` en `4f3ad934` **sin conflictos**. Validación local completa de ese commit: backend unitarias 474/474, scripts 48/48, integración PostgreSQL con navegador real 972/972, frontend unitarias 325/325, navegador simulado 151/151, E2E real 144 aprobadas, 10 omitidas y 0 fallos. CI de GitHub en verde. Con #165 integrado quedaron libres `OperacionesPage.tsx`, `App.tsx` y `AdminHomePage.tsx`, lo que permitió terminar JW-08 (interfaz) y rotular JW-03.

**CI intermitente en `66276f75` (job `test`):** el paso 7 de `backend/scripts/ensayo-actualizacion-preproduccion.sh` (heredado de `main`) no pudo arrancar PostgreSQL en el puerto fijo 55612. Ese puerto cae en el rango efímero de Linux (32768-60999), así que un socket cliente abierto puede ocuparlo. Además, la guardia final daba PASS vacío aunque el clúster no hubiera arrancado. Corrección: los puertos de PostgreSQL se eligen libres al momento de arrancar cada clúster, el fallo de arranque se informa como FAIL y la guardia exige el mensaje «faltan N migraciones». Ensayo local completo: FALLOS=0.

## Pendientes externos

- **JW-07** (centavo de CxP) y el rechazo en servidor de compras con proveedor inactivo (JW-08): aplicar cuando #166 libere `operaciones.service.ts`. La solución está descrita en la matriz.
- **Decisiones del dueño:** confirmar JW-04; en JW-03, decidir si la tendencia pasa a neto (hoy está rotulada como bruta).
- `frontend/vercel.json` (protegido por #166) no excluye esta rama de las vistas previas de Vercel. Una vista previa no es producción, pero conviene añadir la exclusión al integrar.
- Siguen vigentes los pendientes del contexto maestro: destino externo de respaldos, aceptación en equipos físicos, impresión real y datos reales.
