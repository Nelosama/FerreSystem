# Matriz multi-tenant de tablas críticas — NEXUS (2026-10-10)

**Para revisión de CENTINELA.** Firma: NEXUS. La propuesta de FK compuestas sigue como **trabajo separado**: no se incorpora a `prisma/migrations/` ni se ejecuta en producción. Esta matriz alimenta la decisión; no cambia nada.

Fuente: catálogo de PostgreSQL de la base reconstruida con las 20 migraciones de `nexus/integracion-temp` (58 relaciones de una columna hacia tablas con `tenant_id`) y las prioridades P1/P2 de `CENTINELA_FK_COMPUESTAS_PARA_NEXUS_20261010.md`. Las filas «sin clasificar» no están en la lista de CENTINELA: se incluyen porque la base tampoco las protege.

## 1. Matriz

| Prioridad | Tabla.columna → padre | Tenant en hija | Índice de apoyo | Comprobación de auditoría | Estrategia de limpieza |
|---|---|---|---|---|---|
| P1 | `abonos_cliente.cliente_id` → `clientes` | sí | sí | `abonos_cliente.cliente_id -> clientes.id` | Congelar el caso; no borrar. Conciliar con el dueño: reasignar el padre correcto o registrar asiento compensatorio; dejar rastro en `auditoria_operaciones` |
| P1 | `abonos_cliente.venta_id` → `ventas` | sí | no | `abonos_cliente.venta_id -> ventas.id` | Congelar el caso; no borrar. Conciliar con el dueño: reasignar el padre correcto o registrar asiento compensatorio; dejar rastro en `auditoria_operaciones` |
| P1 | `cajas.usuario_id` → `usuarios` | sí | sí | `cajas.usuario_id -> usuarios.id` | Congelar el caso; no borrar. Conciliar con el dueño: reasignar el padre correcto o registrar asiento compensatorio; dejar rastro en `auditoria_operaciones` |
| P1 | `coberturas_garantia.producto_id` → `productos` | sí | no | `coberturas_garantia.producto_id -> productos.id` | Congelar el caso; no borrar. Conciliar con el dueño: reasignar el padre correcto o registrar asiento compensatorio; dejar rastro en `auditoria_operaciones` |
| P1 | `coberturas_garantia.venta_id` → `ventas` | sí | sí | `coberturas_garantia.venta_id -> ventas.id` | Congelar el caso; no borrar. Conciliar con el dueño: reasignar el padre correcto o registrar asiento compensatorio; dejar rastro en `auditoria_operaciones` |
| P1 | `costos_compra.producto_id` → `productos` | sí | sí | `costos_compra.producto_id -> productos.id` | Congelar el caso; no borrar. Conciliar con el dueño: reasignar el padre correcto o registrar asiento compensatorio; dejar rastro en `auditoria_operaciones` |
| P1 | `costos_compra.proveedor_id` → `proveedores` | sí | no | `costos_compra.proveedor_id -> proveedores.id` | Congelar el caso; no borrar. Conciliar con el dueño: reasignar el padre correcto o registrar asiento compensatorio; dejar rastro en `auditoria_operaciones` |
| P1 | `cuentas_operativas.cliente_id` → `clientes` | sí | no | `cuentas_operativas.cliente_id -> clientes.id` | Congelar el caso; no borrar. Conciliar con el dueño: reasignar el padre correcto o registrar asiento compensatorio; dejar rastro en `auditoria_operaciones` |
| P1 | `cuentas_operativas.proveedor_id` → `proveedores` | sí | no | `cuentas_operativas.proveedor_id -> proveedores.id` | Congelar el caso; no borrar. Conciliar con el dueño: reasignar el padre correcto o registrar asiento compensatorio; dejar rastro en `auditoria_operaciones` |
| P1 | `detalles_venta.producto_id` → `productos` | no | no | `detalles_venta.producto_id -> productos.id` | Añadir `tenant_id` nullable, rellenar desde el padre, auditar, `NOT NULL`, luego FK compuesta |
| P1 | `devoluciones.venta_id` → `ventas` | sí | sí | `devoluciones.venta_id -> ventas.id` | Congelar el caso; no borrar. Conciliar con el dueño: reasignar el padre correcto o registrar asiento compensatorio; dejar rastro en `auditoria_operaciones` |
| P1 | `movimientos_inventario.producto_id` → `productos` | sí | sí | `movimientos_inventario.producto_id -> productos.id` | Congelar el caso; no borrar. Conciliar con el dueño: reasignar el padre correcto o registrar asiento compensatorio; dejar rastro en `auditoria_operaciones` |
| P1 | `operaciones_contingencia.venta_id` → `ventas` | sí | sí | `operaciones_contingencia.venta_id -> ventas.id` | Congelar el caso; no borrar. Conciliar con el dueño: reasignar el padre correcto o registrar asiento compensatorio; dejar rastro en `auditoria_operaciones` |
| P1 | `ordenes_compra.proveedor_id` → `proveedores` | sí | sí | `ordenes_compra.proveedor_id -> proveedores.id` | Congelar el caso; no borrar. Conciliar con el dueño: reasignar el padre correcto o registrar asiento compensatorio; dejar rastro en `auditoria_operaciones` |
| P1 | `ordenes_compra.usuario_id` → `usuarios` | sí | no | `ordenes_compra.usuario_id -> usuarios.id` | Congelar el caso; no borrar. Conciliar con el dueño: reasignar el padre correcto o registrar asiento compensatorio; dejar rastro en `auditoria_operaciones` |
| P1 | `pagos_cuenta.cuenta_id` → `cuentas_operativas` | sí | sí | `pagos_cuenta.cuenta_id -> cuentas_operativas.id` | Congelar el caso; no borrar. Conciliar con el dueño: reasignar el padre correcto o registrar asiento compensatorio; dejar rastro en `auditoria_operaciones` |
| P1 | `ventas.cliente_id` → `clientes` | sí | no | `ventas.cliente_id -> clientes.id` | Congelar el caso; no borrar. Conciliar con el dueño: reasignar el padre correcto o registrar asiento compensatorio; dejar rastro en `auditoria_operaciones` |
| P1 | `ventas.usuario_id` → `usuarios` | sí | no | `ventas.usuario_id -> usuarios.id` | Congelar el caso; no borrar. Conciliar con el dueño: reasignar el padre correcto o registrar asiento compensatorio; dejar rastro en `auditoria_operaciones` |
| P2 | `apartados.cliente_id` → `clientes` | sí | no | `apartados.cliente_id -> clientes.id` | Aislar en cuarentena (copia de las filas) y corregir o anular con aprobación; sin `DELETE` directo |
| P2 | `apartados.producto_id` → `productos` | sí | no | `apartados.producto_id -> productos.id` | Aislar en cuarentena (copia de las filas) y corregir o anular con aprobación; sin `DELETE` directo |
| P2 | `cierres_comisiones.vendedor_id` → `usuarios` | sí | sí | `cierres_comisiones.vendedor_id -> usuarios.id` | Aislar en cuarentena (copia de las filas) y corregir o anular con aprobación; sin `DELETE` directo |
| P2 | `clientes.lista_precio_id` → `listas_precio` | sí | no | `clientes.lista_precio_id -> listas_precio.id` | Aislar en cuarentena (copia de las filas) y corregir o anular con aprobación; sin `DELETE` directo |
| P2 | `compras_proveedor.proveedor_id` → `proveedores` | sí | no | `compras_proveedor.proveedor_id -> proveedores.id` | Aislar en cuarentena (copia de las filas) y corregir o anular con aprobación; sin `DELETE` directo |
| P2 | `cotizaciones.cliente_id` → `clientes` | sí | no | `cotizaciones.cliente_id -> clientes.id` | Aislar en cuarentena (copia de las filas) y corregir o anular con aprobación; sin `DELETE` directo |
| P2 | `cotizaciones.usuario_id` → `usuarios` | sí | no | `cotizaciones.usuario_id -> usuarios.id` | Aislar en cuarentena (copia de las filas) y corregir o anular con aprobación; sin `DELETE` directo |
| P2 | `cotizaciones.venta_id` → `ventas` | sí | sí | `cotizaciones.venta_id -> ventas.id` | Aislar en cuarentena (copia de las filas) y corregir o anular con aprobación; sin `DELETE` directo |
| P2 | `detalles_compra_proveedor.producto_id` → `productos` | no | sí | `detalles_compra_proveedor.producto_id -> productos.id` | Añadir `tenant_id` nullable, rellenar desde el padre, auditar, `NOT NULL`, luego FK compuesta |
| P2 | `detalles_cotizacion.producto_id` → `productos` | no | no | `detalles_cotizacion.producto_id -> productos.id` | Añadir `tenant_id` nullable, rellenar desde el padre, auditar, `NOT NULL`, luego FK compuesta |
| P2 | `detalles_orden_compra.producto_id` → `productos` | no | no | `detalles_orden_compra.producto_id -> productos.id` | Añadir `tenant_id` nullable, rellenar desde el padre, auditar, `NOT NULL`, luego FK compuesta |
| P2 | `detalles_transferencia.producto_id` → `productos` | no | no | `detalles_transferencia.producto_id -> productos.id` | Añadir `tenant_id` nullable, rellenar desde el padre, auditar, `NOT NULL`, luego FK compuesta |
| P2 | `garantias.producto_id` → `productos` | sí | no | `garantias.producto_id -> productos.id` | Aislar en cuarentena (copia de las filas) y corregir o anular con aprobación; sin `DELETE` directo |
| P2 | `garantias.venta_id` → `ventas` | sí | no | `garantias.venta_id -> ventas.id` | Aislar en cuarentena (copia de las filas) y corregir o anular con aprobación; sin `DELETE` directo |
| P2 | `movimientos_caja.caja_id` → `cajas` | no | sí | `movimientos_caja.caja_id -> cajas.id` | Añadir `tenant_id` nullable, rellenar desde el padre, auditar, `NOT NULL`, luego FK compuesta |
| P2 | `productos_proveedores.actualizado_por` → `usuarios` | sí | no | `productos_proveedores.actualizado_por -> usuarios.id` | Aislar en cuarentena (copia de las filas) y corregir o anular con aprobación; sin `DELETE` directo |
| P2 | `productos_proveedores.creado_por` → `usuarios` | sí | no | `productos_proveedores.creado_por -> usuarios.id` | Aislar en cuarentena (copia de las filas) y corregir o anular con aprobación; sin `DELETE` directo |
| P2 | `productos_proveedores.producto_id` → `productos` | sí | sí | `productos_proveedores.producto_id -> productos.id` | Aislar en cuarentena (copia de las filas) y corregir o anular con aprobación; sin `DELETE` directo |
| P2 | `productos_proveedores.proveedor_id` → `proveedores` | sí | sí | `productos_proveedores.proveedor_id -> proveedores.id` | Aislar en cuarentena (copia de las filas) y corregir o anular con aprobación; sin `DELETE` directo |
| P2 | `transferencias.usuario_id` → `usuarios` | sí | no | `transferencias.usuario_id -> usuarios.id` | Aislar en cuarentena (copia de las filas) y corregir o anular con aprobación; sin `DELETE` directo |
| sin clasificar | `abonos_apartado.apartado_id` → `apartados` | no | sí | `abonos_apartado.apartado_id -> apartados.id` | Añadir `tenant_id` nullable, rellenar desde el padre, auditar, `NOT NULL`, luego FK compuesta |
| sin clasificar | `aprobaciones_bancarias.usuario_id` → `usuarios` | sí | no | `aprobaciones_bancarias.usuario_id -> usuarios.id` | Evaluar caso por caso al aparecer en la auditoría |
| sin clasificar | `coberturas_garantia.actualizado_por` → `usuarios` | sí | no | `coberturas_garantia.actualizado_por -> usuarios.id` | Evaluar caso por caso al aparecer en la auditoría |
| sin clasificar | `coberturas_garantia.creado_por` → `usuarios` | sí | no | `coberturas_garantia.creado_por -> usuarios.id` | Evaluar caso por caso al aparecer en la auditoría |
| sin clasificar | `conciliaciones_bancarias.usuario_id` → `usuarios` | sí | no | `conciliaciones_bancarias.usuario_id -> usuarios.id` | Evaluar caso por caso al aparecer en la auditoría |
| sin clasificar | `contingencia_ventanas.dispositivo_id` → `dispositivos_pos` | sí | sí | `contingencia_ventanas.dispositivo_id -> dispositivos_pos.id` | Evaluar caso por caso al aparecer en la auditoría |
| sin clasificar | `costos_compra.recepcion_id` → `recepciones_compra` | sí | no | `costos_compra.recepcion_id -> recepciones_compra.id` | Evaluar caso por caso al aparecer en la auditoría |
| sin clasificar | `detalles_compra_proveedor.compra_id` → `compras_proveedor` | no | sí | `detalles_compra_proveedor.compra_id -> compras_proveedor.id` | Añadir `tenant_id` nullable, rellenar desde el padre, auditar, `NOT NULL`, luego FK compuesta |
| sin clasificar | `detalles_cotizacion.cotizacion_id` → `cotizaciones` | no | sí | `detalles_cotizacion.cotizacion_id -> cotizaciones.id` | Añadir `tenant_id` nullable, rellenar desde el padre, auditar, `NOT NULL`, luego FK compuesta |
| sin clasificar | `detalles_devolucion.devolucion_id` → `devoluciones` | no | no | `detalles_devolucion.devolucion_id -> devoluciones.id` | Añadir `tenant_id` nullable, rellenar desde el padre, auditar, `NOT NULL`, luego FK compuesta |
| sin clasificar | `detalles_orden_compra.orden_id` → `ordenes_compra` | no | sí | `detalles_orden_compra.orden_id -> ordenes_compra.id` | Añadir `tenant_id` nullable, rellenar desde el padre, auditar, `NOT NULL`, luego FK compuesta |
| sin clasificar | `detalles_transferencia.transferencia_id` → `transferencias` | no | sí | `detalles_transferencia.transferencia_id -> transferencias.id` | Añadir `tenant_id` nullable, rellenar desde el padre, auditar, `NOT NULL`, luego FK compuesta |
| sin clasificar | `detalles_venta.venta_id` → `ventas` | no | sí | `detalles_venta.venta_id -> ventas.id` | Añadir `tenant_id` nullable, rellenar desde el padre, auditar, `NOT NULL`, luego FK compuesta |
| sin clasificar | `historial_garantias.garantia_id` → `garantias` | no | sí | `historial_garantias.garantia_id -> garantias.id` | Añadir `tenant_id` nullable, rellenar desde el padre, auditar, `NOT NULL`, luego FK compuesta |
| sin clasificar | `levantamiento_items.levantamiento_id` → `levantamientos` | no | sí | `levantamiento_items.levantamiento_id -> levantamientos.id` | Añadir `tenant_id` nullable, rellenar desde el padre, auditar, `NOT NULL`, luego FK compuesta |
| sin clasificar | `operaciones_contingencia.dispositivo_id` → `dispositivos_pos` | sí | sí | `operaciones_contingencia.dispositivo_id -> dispositivos_pos.id` | Evaluar caso por caso al aparecer en la auditoría |
| sin clasificar | `operaciones_contingencia.ventana_id` → `contingencia_ventanas` | sí | no | `operaciones_contingencia.ventana_id -> contingencia_ventanas.id` | Evaluar caso por caso al aparecer en la auditoría |
| sin clasificar | `pagos_proveedor.compra_id` → `compras_proveedor` | no | sí | `pagos_proveedor.compra_id -> compras_proveedor.id` | Añadir `tenant_id` nullable, rellenar desde el padre, auditar, `NOT NULL`, luego FK compuesta |
| sin clasificar | `productos.categoria_id` → `categorias` | sí | no | `productos.categoria_id -> categorias.id` | Evaluar caso por caso al aparecer en la auditoría |
| sin clasificar | `recepciones_compra.orden_id` → `ordenes_compra` | sí | sí | `recepciones_compra.orden_id -> ordenes_compra.id` | Evaluar caso por caso al aparecer en la auditoría |

**Lectura:** «Tenant en hija = no» son las líneas de detalle (11 tablas): primero necesitan la columna. «Índice de apoyo = no» (31 de 58) no afecta a las inserciones, pero encarece borrar o actualizar padres cuando exista la FK compuesta; conviene crear el índice `(tenant_id, columna)` junto con ella.

## 2. Violaciones potenciales

Una violación es una fila hija cuyo padre pertenece a otra empresa. Impacto por prioridad (detalle por tabla en el documento de CENTINELA):

| Prioridad | Qué se contaminaría |
|---|---|
| P1 | Dinero, existencias, ventas o caja: ventas con cliente o usuario ajeno, líneas con producto ajeno, devoluciones y pagos sobre cuentas ajenas, costos de compra mezclados, movimientos de inventario sobre productos ajenos |
| P2 | Relaciones operativas sin movimiento de dinero o stock: cotizaciones, apartados, garantías (reclamos), transferencias, comisiones, vínculos producto-proveedor |

**Estado medido:** 0 violaciones en bases de prueba limpias; el detector (`backend/scripts/auditoria-tenant-cruzado-lectura.sql`, 48 comprobaciones) las encuentra cuando se siembran. **Producción: sin medir.**

## 3. Estrategia de limpieza (si la auditoría de producción encuentra filas)

1. **No borrar nada.** Cada fila incoherente se trata como un caso: se documenta tabla, relación, conteo y empresa afectada (sin exponer datos personales).
2. **Decidir el dueño del dato** con el propietario del negocio: si la empresa de la fila hija es la correcta, se corrige la referencia al padre equivalente de esa empresa; si el padre es el correcto, se reasigna la fila hija.
3. **P1:** congelar el caso, conciliar con asiento compensatorio auditable en `auditoria_operaciones` y no tocar cierres de caja históricos.
4. **P2:** cuarentena (copia de las filas antes de cualquier corrección) y corrección con aprobación.
5. **Reintentar la auditoría** hasta obtener cero filas. Solo entonces se ejecuta `VALIDATE CONSTRAINT`.
6. Toda corrección de datos reales requiere respaldo previo y aprobación explícita independiente.

## 4. Riesgos de despliegue

| Riesgo | Detalle | Mitigación |
|---|---|---|
| Bloqueo por `UNIQUE (tenant_id, id)` | Construye un índice; mientras dura bloquea las escrituras de esa tabla | Ventana de baja actividad; empezar por tablas pequeñas; medir en una copia con volumen real |
| `ADD FOREIGN KEY … NOT VALID` | Bloqueo breve sobre hija y padre; no revisa filas existentes | Seguro por diseño; aplicar por tabla |
| `VALIDATE CONSTRAINT` | Recorre la hija; no bloquea lecturas ni escrituras, pero consume I/O | Fuera de hora pico; solo con auditoría en cero |
| Falta de índice (31 relaciones) | Borrar o actualizar un padre recorre la hija | Crear `(tenant_id, columna)` con cada FK |
| Tablas sin `tenant_id` (11) | Requieren columna, *backfill* y `NOT NULL`: el único paso que escribe datos | Respaldo, ensayo en copia, aprobación independiente |
| Modelo Prisma | Una FK compuesta que no está en `schema.prisma` hace que `migrate diff` proponga eliminarla | Modelarla en el mismo cambio (parche de ejemplo en `propuestas/tenant-fk-compuestas/04_schema_piloto.diff`) |
| `onDelete: SetNull` | En FK compuesta anularía también `tenant_id` | Usar `NoAction`; decidir el caso de `ventas.cliente_id` |
| Compatibilidad con otros agentes | Un cambio de FK afecta a ATLAS, FORJA, KARDEX y BALANCE a la vez | Una migración por tabla padre, avisada a cada agente |
| Producción distinta de la base de prueba | Las pruebas usan datos sintéticos | Auditoría de solo lectura primero (`VERIFICACION_PRODUCCION_SOLO_LECTURA_NEXUS.md`) |

## 5. Solicitud de revisión a CENTINELA

Se pide a CENTINELA que revise: (a) las prioridades de las filas «sin clasificar»; (b) si la estrategia de limpieza respeta la política de auditoría; (c) el orden propuesto en `PROPUESTA_FK_COMPUESTAS_TENANT_NEXUS_20261010.md` §3; (d) si acepta `NoAction` en FK compuesta; (e) los casos en que quiera un trigger de coherencia en lugar de FK compuesta.

*Firmado: NEXUS.*
