# Auditoría funcional de módulos — 2026-10-29

Base: `main` `3a6c6695`. Rama: `claude/auditoria-funcional-20261029`. Lectura de código y comprobación cruzada frontend ↔ backend ↔ esquema ↔ pruebas. **No es una prueba de extremo a extremo en navegador.** Donde afirmo «LISTO» es porque hay endpoints, persistencia, permisos y pruebas de integración en el código; no porque haya recorrido la pantalla.

## Criterio

- **LISTO:** operaciones completas con persistencia, permisos y pruebas de integración en PostgreSQL. Puede habilitarse en el piloto, con las restricciones que indique.
- **PARCIAL:** operaciones reales, pero incompletas o con un defecto que limita su uso.
- **BLOQUEADO:** defecto crítico que impide usarlo, aunque exista la funcionalidad.
- **NO IMPLEMENTADO:** interfaz o estructura sin operaciones reales.

Pantalla ≠ función: un módulo se clasifica por lo que persiste, no por lo que se ve.

## Matriz

| Módulo | Clasificación | Piloto |
| --- | --- | --- |
| POS (venta contado/crédito, cobro) | LISTO | Habilitar |
| Cotizaciones | BLOQUEADO en `main` (ISV 500 % y ADMIN convierte tasa inválida); corregido en #217 pendiente de merge | Ocultar hasta integrar #217 |
| Inventario (productos, ajustes, levantamiento) | LISTO | Habilitar |
| Clientes (CRUD, crédito, abonos, estado de cuenta) | LISTO | Habilitar |
| Proveedores (CRUD) | LISTO | Habilitar |
| Compras (orden, recepción, CxP) | PARCIAL: ISV sin validar (C-01, C-02) | Habilitar solo con revisión manual del documento del proveedor |
| Apartados | NO IMPLEMENTADO | **Ocultar** |
| Transferencias entre sucursales | NO IMPLEMENTADO | **Ocultar** |
| Pedidos especiales | NO IMPLEMENTADO | **Ocultar** |
| Listas de precio | NO IMPLEMENTADO (precio por producto sí existe) | **Ocultar** |
| Garantías | PARCIAL | Habilitar solo consulta y coberturas |
| Devoluciones | LISTO para ventas sin exentas | Habilitar; no permitir devolver ventas convertidas de cotizaciones con exentas |
| Caja y arqueo | LISTO | Habilitar |
| Contabilidad | PARCIAL: asientos automáticos sin implementar; apagado por defecto | Ocultar |
| Usuarios y permisos | LISTO | Habilitar |
| Reportes | PARCIAL: solo resumen por método de pago | Habilitar con alcance declarado |
| Super Admin | LISTO | Habilitar (solo plataforma) |
| Entregas (bodega) | LISTO | Habilitar |
| Contingencia offline (POS sin conexión) | PARCIAL: conflictos en revisión dependen de decisión D11 | Habilitar con protocolo de apagón |
| Levantamiento (conteo multiusuario) | LISTO | Habilitar |

## Detalle por módulo

### POS
1. **Pantallas:** `POSPage.tsx` (1 600 líneas), `PosContingenciaPage.tsx`, `ArqueoCajaPage.tsx`.
2. **Backend:** `ventas.controller.ts` (`POST /ventas`, `GET /ventas/:id`, solicitudes y descarte); `operaciones.controller.ts` (`caja/*`, `clientes/:id/estado-cuenta`).
3. **Modelos:** `Venta`, `DetalleVenta`, `Caja`, `MovimientoCaja`, `AprobacionBancaria`.
4. **CRUD real:** alta de venta, cobro, idempotencia por `solicitudId`, entrega, descarte de solicitud.
5. **Permisos:** roles ADMIN, CAJERO, VENDEDOR; permisos `pos.aplicar_descuento`, `pos.excepcion_precio`; aislamiento por `tenantId` en las consultas revisadas.
6. **Pruebas:** `ventas.postgres.integration.ts`, `ciclo-ventas`, `caja`, `redondeo-cobro`, `cobro-entrega` (decenas de casos).
7. **Dependencias:** inventario (reserva y stock), caja, clientes (crédito), contabilidad (asientos no automáticos).
8. **Riesgos:** ISV fijo al 15 % (correcto para las ventas actuales; no hay líneas exentas en POS, decisión D4).
9. **Recomendación:** habilitar.

### Cotizaciones
1. **Pantallas:** `CotizacionesPage.tsx` (1 896 líneas).
2. **Backend:** `cotizaciones.controller.ts` (8 endpoints: crear, editar, duplicar, convertir, estado, listar, detalle).
3. **Modelos:** `Cotizacion`, `DetalleCotizacion`.
4. **Estado en `main`:** la validación de `porcentajeIsv` acepta cualquier valor ≥ 0 (incluido 500 %) y ADMIN convierte una cotización con tasa inválida. Eso es un defecto fiscal crítico. **Corregido en #217** (`da48cb2`, pendiente de merge): tasas autorizadas y regularización explícita.
5. **Permisos:** crear y editar: ADMIN, VENDEDOR, CAJERO. Convertir: ADMIN y CAJERO, con exentas solo ADMIN. Aislamiento: consultas con `tenantId`.
6. **Pruebas:** `cotizaciones.service.spec.ts` (24), `cotizaciones.postgres.integration.ts` (11), `ciclo-ventas` (JW-04). En `main` no hay prueba del 500 %; se añadieron en #217.
7. **Dependencias:** ventas (conversión), inventario (reserva), clientes (crédito), política de precio.
8. **Riesgos:** T6 (marca de exención sin autorización ni auditoría); ISV de la cotización histórica.
9. **Recomendación:** ocultar hasta integrar #217. Después habilitar sin líneas exentas hasta decidir D5.

### Inventario
1. **Pantallas:** `InventarioPage.tsx` (533 líneas), `LevantamientoPage.tsx`.
2. **Backend:** `productos.controller.ts` (10 endpoints, incluidos importación y precios), `costo-inicial.controller.ts`, `levantamientos.controller.ts` (16), `operaciones.controller.ts` (`productos/:id/ajuste`, `historial`).
3. **Modelos:** `Producto`, `MovimientoInventario`, `Levantamiento`, `LevantamientoItem`, `ProductoProveedor`.
4. **CRUD real:** alta, edición con versión (control de concurrencia), desactivación, ajuste con motivo, importación.
5. **Permisos:** `inventario.ver`, `inventario.editar`; roles ADMIN, BODEGUERO. Aislamiento: revisadas las consultas por `id` sin `tenantId` en `productos.service.ts`, `levantamientos.service.ts`; cada una va precedida de una lectura filtrada por tenant.
6. **Pruebas:** `productos-edicion`, `auditoria-inventario`, `levantamientos` (12 archivos), cientos de casos en el arnés de integración.
7. **Dependencias:** compras (costo), ventas (stock), contingencia.
8. **Riesgos:** bajos.
9. **Recomendación:** habilitar.

### Clientes
1. **Pantallas:** `ClientesPage.tsx` (818 líneas), `EstadoCuentaClientesPage.tsx`.
2. **Backend:** `clientes.controller.ts` (9 endpoints: CRUD, búsqueda, crédito, abonos).
3. **Modelos:** `Cliente`, `AbonoCliente`, `CuentaOperativa` (CxC).
4. **CRUD real:** sí, con abonos y límite de crédito.
5. **Permisos:** ADMIN y CAJERO para estado de cuenta; VENDEDOR sin acceso a estado de cuenta. Aislamiento: `clientes.service.ts` filtra por `tenantId`.
6. **Pruebas:** `clientes-credito-auditoria`, `clientes-cajero`, `credito` (30 archivos que mencionan clientes).
7. **Dependencias:** ventas a crédito, contabilidad (CxC).
8. **Riesgos:** bajos.
9. **Recomendación:** habilitar.

### Proveedores
1. **Pantallas:** `ProveedoresGestion.tsx` (dentro de `OperacionesPage`).
2. **Backend:** `proveedores.controller.ts` (CRUD y desactivación) y `operaciones.controller.ts` (`proveedores`, vínculos producto-proveedor).
3. **Modelos:** `Proveedor`, `ProductoProveedor`.
4. **CRUD real:** sí. El frontend llama a `/proveedores` (listar con inactivos, editar, desactivar).
5. **Permisos:** `proveedores.controller.ts` exige `@Roles(ADMIN)` en todo el controlador. Aislamiento por `tenantId`.
6. **Pruebas:** `proveedores-gestion`, `productos-proveedores`.
7. **Dependencias:** compras.
8. **Riesgos:** bajos.
9. **Recomendación:** habilitar.

### Compras
1. **Pantallas:** `OrdenesCompraPage.tsx` (2 líneas: reutiliza `OperacionesPage modo="compras"`).
2. **Backend:** `operaciones.controller.ts` (`compras`, `compras/:id/recepciones`, pagos CxP).
3. **Modelos:** `OrdenCompra`, `DetalleOrdenCompra`, `RecepcionCompra`, `CuentaOperativa` (CxP), `CostoCompra`.
4. **CRUD real:** orden, recepción parcial, costo, CxP y pago de contado.
5. **Permisos:** ADMIN y BODEGUERO con `inventario.editar`; el costo lo oculta `SinCostosParaBodeguero`.
6. **Pruebas:** `compras`, `compras-cierre`, `compras-contado`, `compras-proveedores.spec.ts`, y `compras-isv` (nueva, en `claude/auditoria-compras-isv-20261029`).
7. **Dependencias:** inventario, CxP, libros de compras (`fiscal_documentos`).
8. **Riesgos:** **C-01 y C-02** (ISV sin validar y sin conciliar con el libro). Ver `AUDITORIA_COMPRAS_ISV.md`.
9. **Recomendación:** habilitar con revisión manual del documento del proveedor hasta resolver C-01 y C-02.

### Apartados
1. **Pantallas:** ruta `/apartados` renderiza `ModuloPendiente` (`App.tsx` ~70). `ApartadosPage.tsx` existe pero **no se importa** en ningún sitio; guarda datos de ejemplo en `localStorage` (`ferre_mock_apartados_*`).
2. **Backend:** ningún endpoint.
3. **Modelos:** `Apartado` y `AbonoApartado` en el esquema; **ningún servicio los usa**.
4. **CRUD real:** no.
5. **Permisos:** la navegación define roles ADMIN, CAJERO, VENDEDOR.
6. **Pruebas:** ninguna.
7. **Riesgos:** el menú lo muestra por defecto (`DEFAULT_TENANT_MODULES` incluye `apartados`). Código muerto con datos de ejemplo.
8. **Recomendación:** ocultar en el piloto; quitar del `DEFAULT_TENANT_MODULES` y eliminar el código muerto en una tarea aparte.

### Transferencias entre sucursales
1. **Pantallas:** `TransferenciasPage.tsx` existe pero no se importa; la ruta muestra `ModuloPendiente`.
2. **Backend:** ninguno para operar. Existe el CRUD de `Sucursal` solo para Super Admin (`super-admin.service.ts`).
3. **Modelos:** `Transferencia`, `DetalleTransferencia` (sin uso); `Sucursal` (solo CRUD de plataforma).
4. **CRUD real:** no.
5. **Permisos:** no aplica.
6. **Pruebas:** ninguna de operación.
7. **Riesgos:** igual que apartados; además, el menú lo muestra a ADMIN y BODEGUERO.
8. **Recomendación:** ocultar.

### Pedidos especiales
1. **Pantallas:** `PedidosEspecialesPage.tsx` no importado; ruta `ModuloPendiente especial`.
2. **Backend:** ninguno. Modelo `PedidoEspecial` sin uso.
3. **CRUD real:** no.
4. **Riesgos:** igual que apartados; el aviso enlaza a POS.
5. **Recomendación:** ocultar.

### Listas de precio
1. **Pantallas:** `ListasPrecioPage.tsx` no importado; ruta `ModuloPendiente`. `PreciosPage.tsx` sí existe y llama a `PATCH /productos/:id/precios` (precio por producto, real).
2. **Backend:** `productos.controller.ts` `PATCH :id/precios` (real, para un producto). Modelo `ListaPrecio` sin uso; `Cliente.listaPrecioId` existe en el esquema sin lógica.
3. **CRUD real:** solo precio individual por producto.
4. **Riesgos:** un cliente con lista asignada no obtiene precios distintos.
5. **Recomendación:** ocultar la entrada «LISTAS DE PRECIO»; mantener el precio por producto.

### Garantías
1. **Pantallas:** `GarantiasPage.tsx` (373 líneas): consulta de factura y coberturas.
2. **Backend:** `garantias.controller.ts` (4 endpoints: factura, listar y crear y editar coberturas).
3. **Modelos:** `CoberturaGarantia` (en uso). `Garantia` e `HistorialGarantia` **sin uso**.
4. **CRUD real:** coberturas sí; reclamos y historial no.
5. **Permisos:** VENDEDOR sin acceso (ver pruebas).
6. **Pruebas:** `garantias.postgres.integration.ts`, `garantias.service.spec.ts`; 3 archivos.
7. **Riesgos:** no hay flujo de reclamo; el historial de garantía no se escribe.
8. **Recomendación:** habilitar solo consulta y registro de coberturas; ocultar el reclamo.

### Devoluciones
1. **Pantallas:** `DevolucionesPage.tsx` (279 líneas).
2. **Backend:** `operaciones.controller.ts`: solicitud, decisión, ejecución y consulta; devolución directa solo ADMIN.
3. **Modelos:** `Devolucion`, `DetalleDevolucion`, `SolicitudDevolucion`.
4. **CRUD real:** solicitar, autorizar (otro administrador), ejecutar, consultar; reembolso y crédito.
5. **Permisos:** solicitar ADMIN, CAJERO, VENDEDOR; autorizar solo ADMIN distinto del solicitante; el ISV de la devolución se reparte por proporción del total.
6. **Pruebas:** 15 archivos (`devoluciones-cxc`, `sec-003-devoluciones.spec.ts`, desglose en la rama de devoluciones).
7. **Riesgo:** en ventas **mixtas** (líneas exentas, solo posibles con cotización convertida) el reembolso del ISV es incorrecto. En ventas gravadas es correcto. Ver `CONSOLIDACION_FISCAL.md`.
8. **Recomendación:** habilitar; bloquear la devolución de ventas convertidas de cotizaciones con exentas hasta la decisión D8.

### Caja
1. **Pantallas:** `ArqueoCajaPage.tsx` (268 líneas).
2. **Backend:** `operaciones.controller.ts` (`caja`, `caja/abrir`, `caja/:id/cerrar`, movimientos, cierres).
3. **Modelos:** `Caja`, `MovimientoCaja`.
4. **CRUD real:** apertura, movimientos, cierre y arqueo.
5. **Permisos:** ADMIN, CAJERO, VENDEDOR; cierres solo ADMIN.
6. **Pruebas:** `caja.postgres.integration.ts` y `resumen-caja-precision.spec.ts`.
7. **Riesgos:** bajos.
8. **Recomendación:** habilitar.

### Contabilidad
1. **Pantallas:** `ContabilidadPage.tsx` (669 líneas) y 9 subrutas.
2. **Backend:** `contabilidad.controller.ts` (32 endpoints): asientos, cuentas, documentos fiscales, retenciones, libros, periodos, CAI, tasas.
3. **Modelos:** `ContableCuenta`, `ContableAsiento`, `FiscalDocumento`, `FiscalTasa`, `FiscalPeriodo`, `FiscalCai`.
4. **Operativo:** libros, periodos, documentos y tasas con vigencia.
5. **Pendiente:** asientos automáticos desde operación (solo propuesta en `prisma/propuestas`, requiere autorización de NEXUS). No hay asientos desde ventas ni compras.
6. **Permisos:** ADMIN y CONTADOR; `contabilidad.*`; apagado por defecto.
7. **Pruebas:** `contabilidad`, `reportes-zona-horaria`, `cartera.spec.ts`, motor.
8. **Recomendación:** ocultar en el piloto hasta asientos automáticos y decisiones del contador.

### Usuarios y permisos
1. **Pantallas:** `UsuariosPage.tsx` (828 líneas).
2. **Backend:** `usuarios.controller.ts` (5 endpoints).
3. **Modelos:** `Usuario`.
4. **Permisos verificados:** las escrituras de `permisos` pasan por un único camino (`usuarios.service.ts`). `PUT /usuarios` exige `@Roles('ADMIN')`: un CAJERO recibe 403. Un ADMIN que no sea de plataforma no gestiona cuentas ADMIN, incluida la suya. No puede concederse `pos.excepcion_precio` a sí mismo.
5. **Pruebas:** `saas-onboarding` (CAJERO no lista ni crea usuarios), `centinela-verificacion-atlas` (CAJERO con todos los permisos personalizados recibe 403), `admin-usuarios-soporte`, `usuarios` (35 archivos que mencionan usuarios y permisos).
6. **Riesgos:** pendiente decidir si cualquier ADMIN puede conceder `pos.excepcion_precio` a terceros (ver #211).
7. **Recomendación:** habilitar.

### Reportes
1. **Pantallas:** `ReportesPage.tsx` (40 líneas): ventas por método de pago, devoluciones y total neto.
2. **Backend:** `operaciones.controller.ts` `GET resumen`; `dashboard.controller.ts`.
3. **Persistencia:** solo lectura de `ventas`, `devoluciones`.
4. **Limitación:** sin reporte de ISV neto de devoluciones (C6 en `AUDITORIA_DEVOLUCIONES_EXENCIONES`), sin reporte de compras ni de inventario valorizado.
5. **Pruebas:** `reportes-zona-horaria`, `dashboard`.
6. **Recomendación:** habilitar con el alcance declarado.

### Super Admin
1. **Pantallas:** `SuperAdminPage.tsx` (1 635 líneas), `NegocioDetallePage.tsx`, `AuditoriaPage.tsx`.
2. **Backend:** `super-admin.controller.ts` (30 endpoints): negocios, estado, módulos, administradores, sucursales (solo lectura en la empresa), auditoría de plataforma.
3. **Modelos:** `Tenant`, `TenantModule`, `SuperAdmin`, `Sucursal`, `AuditoriaSoporte`.
4. **Permisos:** solo SUPERADMIN de plataforma. Aislamiento: el administrador de plataforma opera sobre un negocio por `tenantId` explícito; es el diseño, no una fuga.
5. **Pruebas:** `admin-usuarios-soporte`, `tenant-admin.http.spec.ts`, `administracion-cloud`, `aislamiento-barrido` (7/7).
6. **Riesgo:** `DEFAULT_TENANT_MODULES` activa apartados, transferencias, pedidos y listas de precio para todo negocio nuevo.
7. **Recomendación:** habilitar; corregir `DEFAULT_TENANT_MODULES`.

## Barrido de aislamiento multi-tenant

- Consultas por `id` sin `tenantId` en backend (`findUnique`, `update`, `delete`): revisadas. Las de Super Admin son de plataforma; las de `auth` buscan sesiones o cuentas por identificador con `tenant` derivado del token. Las de módulos operativos (`levantamientos`, `productos`, `usuarios`, `costo-inicial`, `contingencia`, `proveedores`) están precedidas por lectura filtrada por tenant.
- Sin hallazgo de fuga en la muestra revisada. Cobertura global: `aislamiento-barrido` (7 casos) y pruebas por módulo.
- Limitación: no es una auditoría exhaustiva de cada consulta SQL cruda.

## Entregas de esta fase

- Este documento, con la matriz de clasificación.
- Evidencia de archivos: rutas en `App.tsx` (líneas 70–79, 355–429), `config/navigation.ts`, `common/tenant-modules.ts`, controladores y servicios citados.
- Pruebas ejecutadas en esta fase: `compras-isv` (9/9) y las del módulo de devoluciones de la rama de devoluciones (8/8, ver su informe). No se ejecutó la suite completa de cada módulo.
