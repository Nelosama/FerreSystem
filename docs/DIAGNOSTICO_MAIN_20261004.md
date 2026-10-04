# Diagnóstico de FerreSystem frente a requisitos del cliente
Fecha de auditoría: 2026-10-04.
Fuente de verdad: main, commit 84e61ec161455d46c2786791e6422178477ac886, confirmado también al terminar la inspección.
Último commit: 2026-10-03, “docs: registrar requisitos validados con dueño del negocio”.

## 1. Resumen ejecutivo
FerreSystem dispone de persistencia real para productos, usuarios, clientes, ventas, cotizaciones y capturas básicas de levantamiento. El registro de ventas y conversión de cotizaciones usan transacciones y descuentos condicionales de stock; el POS conserva una identidad para reintentar cobros.

El núcleo completo del piloto todavía no está cerrado: compras/proveedores, recepción, historial de costos, cuentas por pagar/cobrar, cierre de caja, Kardex, entrega y venta sin inventario no forman un circuito persistente y auditable. Compras, garantías, pedidos especiales y arqueos son interfaces con almacenamiento local. No se contabilizan como implementación real del requisito.

Los riesgos inmediatos son crédito sin cliente ni deuda, descuentos/precios aceptados sin autorización backend, cierres calculados con ventas vacías, modificación de existencias sin movimientos, y operaciones de levantamiento accesibles al cajero por API.

### Alcance y límites de la verificación
Se inventarió el árbol completo mediante GitHub, se obtuvieron 163 archivos propios de código/configuración/documentación/pruebas y se contrastaron rutas, servicios, DTOs, esquema y las tres migraciones versionadas. No se consideraron dependencias node_modules evidencia de funcionalidades. Se inspeccionaron además artefactos dist relevantes para detectar diferencias con src.

La clonación no pudo ejecutarse porque el proxy del shell no aceptó la conexión; la revisión continuó con el conector GitHub sobre el SHA fijado. Los archivos descargados son una copia de lectura en /workspace/FerreSystem-audit. No se modificó código del repositorio ni se hizo commit, push, despliegue o migración.

La clasificación IMPLEMENTADO significa que el circuito está conectado y persiste mediante Prisma/PostgreSQL en el código revisado. No significa validación del despliegue actual ni ejecución de operaciones sobre una base real en esta sesión. No hay credenciales de base de datos configuradas en este entorno. La ejecución de los tests frontend se bloqueó antes de ejecutar casos por ausencia de typescript; tampoco están instalados initdb/psql para la suite de PostgreSQL. Los tests existentes se inspeccionaron, pero no se presentan como pruebas aprobadas. No se usaron mocks como prueba de persistencia.

## 2. Requerimientos encontrados en las anotaciones
Fuente primaria: docs/REQUISITOS_NEGOCIO_VALIDADO.md, fecha 2026-10-02, conversación con el dueño.
1. Inventario prioritario; levantamiento inicial; registrar venta antes de entregar; trazabilidad y faltantes; reposición por rotación.
2. Historial compra/proveedor y costo vigente separado; reposición actualiza costo tanto al subir como al bajar; margen y precio por producto; capturarlos en levantamiento.
3. Múltiples proveedores, factura de compra, cantidades/costos/fechas; vencimientos/plazos, saldos y pagos propios; recepción física incrementa stock; alertas.
4. Contado: efectivo, transferencia, tarjeta/POS; venta atribuida al cajero y cierre por empleado. Integración bancaria posterior.
5. Crédito exclusivamente a clientes registrados, identificador, documento contado/crédito, deuda automática, abonos, saldo e historial.
6. Administrador/Cajero; cajero vende y consulta sin modificar información sensible; auditoría de usuario, operación, fecha, importe, método y cierre; autor/modificador administrativo.
7. Código fabricante/proveedor, código interno, escáner/cámara, búsqueda descriptiva y variantes distinguibles.
8. Foto opcional de identificación, optimizada para evitar imágenes pesadas directamente en BD.
9. Venta especial que nunca entra físicamente: ingreso/venta/documento/cierre/historial sin salida física, vinculada a compra/proveedor; no resolverla con stock negativo. Si llega al local, sí entra al inventario.
10. Devolución ligada al documento original e impacto en stock, factura, reembolso, crédito y garantía; motivo, usuario, fecha y destino.
11. Garantías vinculadas a producto/venta, condiciones/vigencia/responsable. Reglas exactas pendientes del cliente.
12. Alertas operativas, uso web desde PC/celular, offline con sincronización y prevención de duplicidad.
13. Vidriería/ventanas y estructura empresarial/permisos posteriores al piloto.
14. Investigación de integración bancaria/POS posterior, sin bloquear piloto.

Fuentes complementarias de backlog, sin atribuir todos sus detalles a la reunión:
- docs/PENDIENTES_LEVANTAMIENTO_INVENTARIO.md: aplicar explícitamente después de revisión/conciliación; multiusuario, concurrencia, zonas, offline/idempotencia; escaneo barcode/QR; foto para artículo aún no identificado y revisión posterior; decimales/presentaciones; auditoría, reconteos; exportación independiente CSV/Excel con columnas/plantillas.
- docs/ROADMAP_FERRESYSTEM.md: Kardex, cartera, alertas, resumen diario y permisos persistentes. Su P2 para costos/múltiples proveedores entra en conflicto con el P0 validado posteriormente: para esta propuesta prevalece la nota del dueño.

### Requerimiento completo de fotografías
La fuente primaria pide una fotografía opcional como ayuda de identificación y optimización para no almacenar imágenes pesadas directamente en BD. El documento de levantamiento añade tomarla durante el conteo, usarla si aún no se identifica completamente el artículo y dejarlo pendiente de completar en revisión.
No se documentan cantidad de fotos, resolución exacta, proveedor de almacenamiento, IA, reconocimiento automático o fotos obligatorias. Las decisiones técnicas de almacenamiento/compresión son propuestas de implementación, no requisitos atribuidos al cliente.

## 3. Matriz de cumplimiento
En “Base de datos”, SQL aislado significa tabla declarada en una migración, sin modelo Prisma actual ni circuito de escritura conectado; no demuestra despliegue ni persistencia funcional.
Evidencias E01–E15 se detallan después.

| Requerimiento | Estado | Frontend | Backend | Base de datos | Evidencia | Qué falta |
|---|---|---|---|---|---|---|
| Catálogo con costo y precio vigentes persistentes | IMPLEMENTADO | Consulta/alta real | CRUD validado y aislado por tenant | Producto.precioCosto/precioVenta | E01 | Verificar despliegue; ampliaciones se evalúan abajo |
| Costos históricos por compra/proveedor, fecha/cantidad/documento | NO IMPLEMENTADO | Orden local no satisface historial real | No servicio de compras/recepciones | SQL de orden/detalle aislado; sin modelos actuales | E02 | Historial inmutable y vínculo de documentos |
| Costo vigente actualizado por compra más reciente incluso menor | NO IMPLEMENTADO | Recepción solo cambia estado local | Ninguna operación de recepción actualiza Producto | Solo campo vigente | E01/E02 | Recepción transaccional y regla temporal clara |
| Múltiples proveedores de un producto | NO IMPLEMENTADO | Selección local en órdenes | Sin relación/servicio operativo | Sin relación Prisma producto-proveedor | E02 | Relaciones y trazabilidad por compras |
| Margen y precio propios por producto | PARCIAL | Precio por artículo; margen calculado en reportes | Persiste costo/precio, no política de margen | Sin margen configurado | E01/E10 | Persistir/aplicar margen si se configura; definir relación precio-margen |
| Costo, margen y precio en levantamiento inicial | IMPLEMENTADO CON ERROR | Precio estimado visible, no enviado | DTO carece de estos campos | LevantamientoItem carece de ellos | E04 | Contrato y persistencia completos |
| Proveedores y órdenes de compra reales | PARCIAL | CRUD localStorage | No controladores/servicios | Tablas SQL aisladas | E02/E12 | Conectar almacenamiento real y permisos |
| Facturas proveedor, plazos, saldo, pagos y estado | NO IMPLEMENTADO | Órdenes no son libro de cuentas | Sin cuentas por pagar/pagos | Sin modelos actuales de factura/saldo/pago | E02/E03 | Circuito de CxP y saldo propio |
| Recepción física incrementa stock y registra movimiento | IMPLEMENTADO CON ERROR | “Recepción total” confirma solo local | Sin operación de recepción | Stock de Producto no cambia | E02 | Recepción parcial/total atómica e idempotente |
| Roles mínimos Administrador/Cajero | IMPLEMENTADO | Login/rutas por rol | JWT y RolesGuard donde se declara | Usuario.rol; enum Rol | E05 | Completar cobertura de operaciones sensibles |
| Cajero no cambia costo/producto por API | IMPLEMENTADO | Inventario restringido | POST/PUT ADMIN/BODEGUERO; DELETE ADMIN | Solo rutas autorizadas del CRUD | E01/E05 | Separar política de BODEGUERO si se decide |
| Cajero sin acceso a operaciones administrativas sensibles | IMPLEMENTADO CON ERROR | Oculta levantamiento | No @Roles en levantamientos; clientes sin RolesGuard | Puede editar/borrar capturas/clientes | E04/E05 | Matriz de permisos backend por operación |
| Permisos individuales, descuento y sucursal persistentes | IMPLEMENTADO CON ERROR | Selección y aparente guardado en estado | Payload/DTO no contienen configuración | Usuario sin estos campos/relaciones | E05 | Persistencia y enforcement real |
| Cajero consulta precio vigente desde POS | IMPLEMENTADO | GET productos y precio en tarjeta | Devuelve precioVenta real | Producto.precioVenta | E01/E06 | Refresco/validación al cobro se evalúa en bugs |
| Búsqueda textual sin memorizar códigos | PARCIAL | POS filtra nombre/código | API busca nombre/código/barcode | Nombre y descripción disponibles | E01/E06 | Incluir descripción/variantes en búsqueda completa |
| Barcode persistente y búsqueda backend | IMPLEMENTADO | Pantalla normal no lo captura | DTO/CRUD y search sí admiten barcode | Producto.codigoBarras; índice | E01 | Conectar alta/POS; unicidad/ambigüedad |
| Escáner de barcode funcional en POS | NO IMPLEMENTADO | Descarta codigoBarras al mapear; filtra nombre/codigo | Búsqueda disponible pero POS no la usa | Campo existe | E06 | Resolver lectura exacta y seleccionar artículo |
| Código fabricante/proveedor identificado separadamente | PARCIAL | Campo genérico codigo sirve manualmente | Un único codigo y barcode | Sin código fabricante ni SKU por proveedor | E01/E02 | Identidades diferenciadas y búsqueda |
| Código interno manual para producto sin barcode | IMPLEMENTADO | Alta exige codigo, barcode opcional | Conflicto por código duplicado | Unique tenantId/codigo | E01 | Generación automática evaluada aparte |
| Código interno reconocible autogenerado, sin colisiones | NO IMPLEMENTADO | Usuario escribe código | Sin generador/reserva | Solo unicidad del código manual | E01 | Propuesta basada en descripción/tipo y reserva atómica |
| Descripciones para distinguir variantes | PARCIAL | Nombre libre; levantamiento descripción/marca | Texto libre persistente | Nombre/descripcion/marca parcial | E01/E04 | Criterios operativos y visibilidad de medida/espesor/color |
| Foto opcional de producto optimizada | PARCIAL | No flujo persistente de foto de catálogo | DTO/CRUD no escriben imagenUrl | Producto.imagenUrl sin uso en escritura | E01/E07 | Carga optimizada y persistencia de referencia |
| Foto de levantamiento para identificación pendiente | IMPLEMENTADO CON ERROR | Captura cámara/file y preview base64 | Foto omitida en payload y DTO | Sin foto ni estado de identificación por item | E04/E07 | Conservar foto y pendiente hasta revisión |
| Captura básica de levantamiento, sin exigir código | IMPLEMENTADO | Alta/edición/cantidad/unidad/descripcion | CRUD real con tenant | Levantamiento y Item | E04 | Auditoría/concurrencia en filas siguientes |
| Finalizar separado de aplicar stock | PARCIAL | Marca FINALIZADO; sin Aplicar | Solo cambia estado; permite editar después | Sin aplicación ni registro aplicado | E04 | Cierre inmutable/reapertura autorizada y Aplicar |
| Revisión/conciliación/preview/aplicación transaccional | NO IMPLEMENTADO | Sin flujo de resolución/aplicación | Sin endpoint aplicar | Sin vínculo item-producto/resoluciones/movimientos | E04 | Circuito explícito completo |
| Multiusuario con conflictos y autor por conteo | PARCIAL | Varios equipos pueden usar API, sin sincronización viva | CRUD sin versión ni conflicto | Timestamps y creador de sesión; sin autor de item | E04 | Control de concurrencia y conciliación |
| Zonas/asignación/progreso por usuario/zona | IMPLEMENTADO CON ERROR | Campo ubicación no enviado; contador básico | Sin zona/asignación | Sin ubicación/zona/usuarios asignados | E04 | Persistencia y progreso real |
| Reconteo preservando original y resolución | NO IMPLEMENTADO | Solo edición del conteo actual | Update sobrescribe | Sin reconteo/versiones | E04 | Segundo conteo y resolución auditable |
| Unidades y cantidades decimales | PARCIAL | Formularios básicos; importación trunca | Prisma/ventas aceptan decimales | Decimal(12,2); enum unidades/texto en conteo | E01/E04/E11 | Corregir importación y definir presentaciones/equivalencias |
| Escáner cámara/QR y recuperación desde levantamiento | NO IMPLEMENTADO | Campo manual barcode no enviado; sin lector | Sin flujo de resolución/alta desde escaneo | Barcode de catálogo, no en item | E04/E07 | Scanner y lookup con alternativa manual |
| Exportación independiente CSV/Excel y plantillas | PARCIAL | Exporta CSV de columnas fijas | Conteos recuperables por API | Se conserva conteo salvo borrado | E04/E11 | Excel en levantamiento, columnas/plantillas y campos faltantes |
| Venta contado efectiva/tarjeta persistente | IMPLEMENTADO | POST ventas y recibo | Transacción, validación, stock condicional | Venta/DetalleVenta con método, actor, fecha | E06/E08 | Cierre/entrega se evalúan aparte |
| Transferencia como método de pago | NO IMPLEMENTADO | Solo efectivo/tarjeta/crédito | DTO y enum no la admiten | MetodoPago sin TRANSFERENCIA | E08 | Añadir método y reflejar en recibo/cierre/reportes |
| Identificador y registro de cliente | IMPLEMENTADO | Clientes CRUD y CLI-...; picker cotización | API/búsqueda/alta | Cliente.numeroCliente + secuencia/trigger migrado | E09 | Verificar historial de migraciones en despliegue |
| Crédito solo a cliente registrado y documento vinculado | IMPLEMENTADO CON ERROR | POS manda nombre/RTN, nunca clienteId | Acepta CREDITO sin exigir clienteId | Venta.clienteId opcional | E06/E08/E09 | Selección obligatoria y validación backend |
| Crédito genera deuda, abonos/saldo/historial | NO IMPLEMENTADO | Etiqueta crédito no es cartera | Sin servicios CxC/pagos | No CuentaPorCobrar/Pago | E08/E03 | Cuenta/deuda automática y aplicación de abonos |
| Registrar venta antes de entregar, seguimiento entrega | PARCIAL | Venta real; sin entrega controlada | Stock baja al registrar, sin estado de entrega | Sin Entrega/fecha/responsable | E08 | Definir reserva/salida y control de despacho |
| Movimientos, faltantes y Kardex completo | NO IMPLEMENTADO | Stock/alerta; sin historia física integral | Cambia stock directo; venta tiene documento | Sin MovimientoInventario | E01/E08/E03 | Movimientos por origen y conciliación |
| Reporte de mayor rotación/reposición confiable | IMPLEMENTADO CON ERROR | Top vendidos calculado con GET ventas | Devuelve 50 ventas por defecto | Historial real disponible, consulta incompleta | E10/E08 | Agregación backend por rango/tenant |
| Cierre por cajero/empleado y dinero esperado | IMPLEMENTADO CON ERROR | ventas=[] fija; fondo 1000; cierre local | Sin servicio de turnos/cierre | cajas/movimientos en SQL aislado | E13/E12 | Apertura, sesión, ventas/pagos y cierre persistentes |
| Auditoría venta: actor/fecha/monto/método | IMPLEMENTADO | Recibo e historial | Usuario del JWT, cálculo, fecha | Venta.usuarioId/createdAt/total/metodoPago | E08 | Auditoría de otros eventos en siguiente fila |
| Auditoría integral y autor/modificador administrativo | PARCIAL | Soporte/auditoría local; conteos editables | Sin registro integral de cambios; soporte token real | Timestamps básicos; sin eventos operativos Prisma | E04/E05/E14 | Eventos persistentes con antes/después y atribución |
| Venta especial sin inventario ligada a proveedor/compra | NO IMPLEMENTADO | Pedido especial local es flujo diferente | Toda venta exige producto y descuenta stock | DetalleVenta siempre producto; sin tipo físico/especial | E08/E15 | Flujo comercial sin salida y trazabilidad |
| Devolución ligada a original con efectos completos | NO IMPLEMENTADO | No módulo/flujo real encontrado | Sin devolución/reembolso | Sin modelos; ANULADA no implementa devolución | E03/E08 | Política y circuito transaccional |
| Garantía: venta/producto, condiciones/vigencia/responsable | PARCIAL | Reclamos locales con factura textual | Sin servicio de garantías | SQL aislado; sin modelos actuales | E12/E15 | Reglas pendientes + circuito persistente |
| Alertas de stock bajo | IMPLEMENTADO | Dashboard/listado real | GET alertas y dashboard | Consulta stockActual/stockMinimo | E01/E10 | Ninguna brecha estructural del alerta básico |
| Alertas de facturas proveedor/deudas vencidas | NO IMPLEMENTADO | Sin cartera operativa | Sin consultas/servicios | Sin documentos/vencimientos operativos | E03 | CxP/CxC y alertas |
| Otras alertas/centro operativo | PARCIAL | Cotizaciones/stock; avisos locales | Dashboard para stock/cotización | Parte real y parte local | E10/E14 | Centro persistente sobre datos reales |
| Uso web desde otra PC/celular | PARCIAL | SPA y API compartida; limitaciones móviles documentadas | Catálogo/ventas/captura accesibles por web | Solo módulos reales compartidos | E16 | Responsive POS y persistencia de módulos locales |
| Offline: captura, cola, sincronización/conflictos | PARCIAL | POS conserva un cobro pendiente y reintento manual | Idempotencia de ventas por solicitudId | Venta real; sin cola/versión de conteos | E04/E06/E08 | IndexedDB/PWA si procede, sync y resolución |
| Resumen diario completo del negocio | PARCIAL | Dashboard ventas/stock real; caja local | Totales por día; sin caja/abonos/utilidad histórica | Sin costo histórico en detalle venta ni cartera | E10/E13 | Caja, pagos, devoluciones y costo vendido |
| Vidriería/ventanas y separación empresarial posterior | NO IMPLEMENTADO | Multi-rubro genérico no concreta decisión | Multi-tenant existente, sin flujo específico validado | Tenant genérico | E03/E16 | Definir después del piloto |
| Integración bancaria/POS automática posterior | NO IMPLEMENTADO | Método TARJETA manual | Sin integración externa | Sin conciliación/transacción bancaria | E03/E08 | Investigación posterior; no bloqueante |

### Índice de evidencias
Todos los paths son relativos al repositorio y corresponden al SHA auditado. Rutas API incluyen el prefijo /api definido en main.ts.
- E01: backend/prisma/schema.prisma:188 (Producto); backend/src/productos/productos.controller.ts:36; productos.service.ts:8, 96, 154; dto/create-producto.dto.ts:6; frontend/src/pages/InventarioPage.tsx:27, 86. GET/POST /api/productos, PUT/DELETE /api/productos/:id.
- E02: frontend/src/pages/OrdenesCompraPage.tsx:64, 73, 110, 184. handleRecepcionTotal modifica solo setOrdenes. backend/src/app.module.ts enumera los módulos realmente registrados.
- E03: backend/prisma/schema.prisma completo y backend/src/app.module.ts:16; ausencia de módulos/modelos operativos contrastada con todas las rutas.
- E04: frontend/src/pages/LevantamientoPage.tsx:240, 263, 302, 396, 415; backend/src/levantamientos/levantamientos.controller.ts:21; levantamientos.service.ts:99, 164, 196; dto/create-levantamiento-item.dto.ts:3; modelos Levantamiento/LevantamientoItem. /api/levantamientos/:id/items.
- E05: backend/src/common/guards/roles.guard.ts:14; auth/jwt.strategy.ts:34; usuarios/usuarios.controller.ts:29; usuarios.service.ts:72; DTOs de usuarios; frontend/src/pages/UsuariosPage.tsx:185; componentes ProtectedRoute y navegación.
- E06: frontend/src/pages/POSPage.tsx:103, 239, 245, 341. Mapeo pierde barcode; cobro manda nombre/RTN sin ID; localStorage aquí preserva un reintento, no sustituye el guardado real.
- E07: frontend/src/pages/LevantamientoPage.tsx:240, 263, 798; Producto.imagenUrl; DTOs de productos/levantamiento sin foto. Captura con input image/capture=environment, FileReader.readAsDataURL; no upload/compresión.
- E08: backend/src/ventas/ventas.service.ts:101, 122, 177, 191, 196, 221; ventas.controller.ts:18, 29; dto/create-venta.dto.ts:4; schema Venta/DetalleVenta/MetodoPago. CotizacionesService.convertirAVenta:415. POST /api/ventas; POST /api/cotizaciones/:id/convertir.
- E09: backend/src/clientes/clientes.service.ts:10, 76; clientes.controller.ts:42; frontend ClientesPage y ClientePicker; prisma/migrations/20261002000000_add_customer_numbers/migration.sql; docs/customer-number-deployment.md.
- E10: frontend/src/pages/ReportesPage.tsx:46, 308, 322, 429; backend/src/dashboard/dashboard.service.ts:9; productos.service.ts:70; ventas.service.ts:8. GET /api/dashboard, /api/productos/alertas/stock-bajo, /api/ventas.
- E11: frontend/src/components/ImportarProductosModal.tsx:140, 145, 271; frontend/src/pages/LevantamientoPage.tsx:415; utils/csvExport.ts y excelExport.ts. La presencia de exportToExcel en reportes no lo conecta al levantamiento.
- E12: backend/prisma/migrations/20260930000000_alter_stock_decimal_and_operational_models/migration.sql:27, 58, 74, 177; no modelos correspondientes en schema.prisma.
- E13: frontend/src/pages/ArqueoCajaPage.tsx:58, 89, 108, 119. Sin consulta API de ventas ni entidad turno real.
- E14: frontend/src/context/NotificationContext.tsx:47, 125; frontend/src/pages/SuperAdminPage.tsx:165, 389; backend/src/super-admin/super-admin.service.ts:130; support-token.dto.ts; TenantGuard. readOnly sí existe en backend; motivo/historial no están persistidos por el endpoint.
- E15: frontend/src/pages/GarantiasPage.tsx:56, 105 y PedidosEspecialesPage.tsx:54, 76; backend/src/app.module.ts; schema y migración operativa.
- E16: backend/docs/production-ui-check-2026-10-02.md; frontend App.tsx/config/rubros.ts; docs/REQUISITOS_NEGOCIO_VALIDADO.md y ROADMAP.

## 4. Bugs e inconsistencias
### B01 — HIGH: crédito sin cliente y sin deuda
Trigger: POST /api/ventas con metodoPago=CREDITO y sin clienteId. DTO acepta cliente opcional y servicio solo valida su pertenencia si se suministra. La venta se guarda, stock baja y no hay cartera.
POS envía clienteNombre y clienteRtn, campos ausentes del DTO; ValidationPipe whitelist los elimina. El nombre mostrado en el ticket no acredita vínculo con Cliente.
La conversión de cotización también puede generar crédito sin cliente: no exige clienteId para ese método.
Archivos/modelos/endpoints: E06, E08, E09; Venta.clienteId, MetodoPago.

### B02 — HIGH: autorización de descuentos y precios eludible
POST /api/ventas acepta precioUnitario y descuento del solicitante. El servicio usa ese precio sin contrastarlo con política/rol y limita a cero una base negativa mediante Math.max, sin rechazar descuento mayor al subtotal.
Un request válido puede usar precioUnitario=0 para mercancía con precio vigente mayor; puede descontar todo o más del subtotal. La aprobación local de NotificationContext no tiene evidencia de autorización backend.
Cotizaciones también permite precio manual sin límite por usuario.
Archivos: ventas.service.ts:196, 213; DTO; POSPage; NotificationContext; UsuariosPage; cotizaciones.service.ts:535.
Además, POS mantiene precios en el carrito y los vuelve a enviar; un cambio de precio vigente después de cargar catálogo no fuerza actualización al cobrar. Debe definirse explícitamente política de precio congelado/autorizado.

### B03 — HIGH: cierre de caja independiente de ventas
ArqueoCajaPage declara const [ventas] = useState<any[]>([]) y jamás carga ventas. Totales por método son cero; efectivo esperado es siempre el fondo fijo 1000. handleCerrarTurno registra localmente un éxito sin persistencia ni vinculación al cajero/turno por ID.
E13; tablas SQL cajas/movimientos_caja desconectadas.

### B04 — HIGH: recepción ficticia
OrdenesCompraPage.handleRecepcionTotal marca RECIBIDA y copia cantidades pedidas en recibidas. No POST de recepción, incremento de existencias ni modificación de costo.
Ejemplo: recibir 100 unidades a costo 80 después de costo vigente 100 no aumenta stock ni baja el costo a 80.
E02; Producto; migración operativa.

### B05 — HIGH: pérdida silenciosa de datos capturados
Foto, barcode, precio estimado y ubicación existen como estados de formulario de levantamiento, pero payload, DTO, servicio y modelo no los conservan. Tras “guardar y siguiente”, se limpian; recargar no puede recuperarlos.
El estado EN_PROGRESO se cambia localmente al guardar item, sin actualizar la sesión en servidor.
E04/E07; LevantamientoItem.

### B06 — HIGH: cajero puede administrar levantamientos por API
RolesGuard autoriza si no hay metadatos @Roles. LevantamientosController no declara ninguno, aunque frontend exige ADMIN/BODEGUERO. Un cajero autenticado de tenant con módulo habilitado puede crear, editar, finalizar y borrar levantamientos e items. ClientesController permite también eliminación sin rol; eliminar un cliente deja Venta.clienteId en null por onDelete:SetNull.
E04/E05/E09. La política precisa de altas/edición de clientes debe decidirse; el borrado y pérdida de vínculo sí requieren control administrativo.

### B07 — HIGH: permisos finos “guardados” solo en interfaz
UsuariosPage omite permisos, descuentoMaximo y sucursalActual del payload; actualiza estado local con lo seleccionado. Los DTOs y Usuario tampoco lo soportan. Al volver a cargar se reconstruyen defaults. Las restricciones backend son roles base, no esa configuración.
E05.

### B08 — HIGH: cambios de existencias sin movimiento ni autor
ProductosService.create/update escriben stockActual directamente, incluido sobreescribirlo con importación. No crean movimiento, motivo o identidad de modificador. Ventas tienen documento origen, pero no existe registro de movimientos integral ni saldo anterior/nuevo por operación.
Un PUT stock absoluto concurrente puede sobrescribir un decremento de venta que ya ocurrió.
E01/E08/E11; Producto y Venta.

### B09 — HIGH: migraciones y esquema divergentes
SQL de 20260930 crea proveedores, órdenes, cajas, garantías, apartados, transferencias, listas y auditoría soporte, pero schema.prisma no los representa y app.module no registra servicios. No deben duplicarse esas tablas sin inspeccionar la BD.
La primera migración versionada presupone tenants existente; la segunda presupone productos existente. El historial no crea un esquema base completo desde cero.
Documentación de producción informa numeración ejecutada manualmente y necesidad de reconciliar historial. start:prod ejecuta migrate deploy: sin baseline/reconciliación puede fallar.
E12; backend/package.json; backend/README.md; docs de customer-number y producción. No se confirmó qué migraciones están aplicadas hoy.

### B10 — HIGH: reportes de rotación incompletos
ReportesPage obtiene GET /ventas sin rango ni paginación; VentasService devuelve 50 registros por defecto. Con más ventas, “más vendidos”, ausencia de movimiento, resúmenes de método/cajero/cliente pueden ser incorrectos.
E10/E08. Corregir mediante agregaciones por rango en servidor, no simplemente aumentando el límite.

### B11 — HIGH: importación trunca existencias fraccionarias
ImportarProductosModal usa parseInt en stock y mínimo. 2.75 pasa a 2 y 0.5 a 0 antes de POST/PUT. Esto contradice Decimal(12,2) y afecta materiales por medida/peso.
E11; líneas 140/145. Los tests existentes no verifican que el parsing conserve ese stock fraccionario.

### B12 — MEDIUM: cierre de levantamiento no congela datos
Servicio createItem/updateItem/removeItem/update no condiciona por estado FINALIZADO ni versión. Puede alterarse o borrarse después de finalizar. Tampoco hay revisión/aprobación con historia.
E04. Ocultar un botón de finalizar no preserva inmutabilidad.

### B13 — MEDIUM: barcode y código ambiguos
codigoBarras tiene índice pero no unicidad por tenant; varios productos pueden compartirlo sin regla. codigo tiene unicidad sensible a mayúsculas; UI convierte a mayúsculas pero API solo trim. Una cadena de espacios puede pasar IsNotEmpty y volverse vacía después del trim. No hay reserva automática de códigos reconocibles.
E01. Deben definirse normalización y excepciones legítimas de múltiples presentaciones.

### B14 — HIGH: artefactos compilados desactualizados
backend/dist/ventas/ventas.service.js no contiene solicitudId, mientras src sí. start:prod ejecuta node dist/main después de migrar y no compila. Si el deploy no hace build previo, se ejecuta un servicio sin la idempotencia auditada en src.
Se inspeccionaron archivos dist remotos; no se infiere que producción actual los esté usando. Debe comprobarse pipeline y build del SHA.

### B15 — MEDIUM: requisitos móviles y QA antiguo
La nota de producción del 2 de octubre documenta carrito POS cortado en móvil y problemas de modales. No se reprodujeron en navegador en esta auditoría; deben validarse.
QA_REPORT y SYSTEM_ANALYSIS son históricos: varias conclusiones ya no describen main (sí hay DTO/guard; conversión descuenta totalMedida; soporte comienza readOnly). No deben reutilizarse como evidencia actual ni tomar cierres/mock como validados.

## 5. Riesgos de arquitectura y seguridad
- HIGH: autorización financiera incompleta y escrituras administrativas por endpoints con rol ausente, detalladas en B02/B06.
- HIGH: cuentas desactivadas, cambio de rol o suspensión del tenant no se revalidan por request en JwtStrategy; se confía en claims hasta expiración. Login/refresh sí comprueban estado. Política de revocación requiere definición e implementación.
- HIGH: UsuariosService usa una contraseña predeterminada fija cuando no se envía password. Debe sustituirse por alta/invitación segura, sin credencial compartida.
- HIGH: datos operativos en localStorage editables por el usuario y no compartidos entre dispositivos; no hay respaldo central ni autenticidad de aprobación/cierre.
- HIGH: divergencia schema/migraciones/dist; los tests de PostgreSQL construyen esquema desde Prisma y aplican numeración, no prueban toda la cadena histórica de migrate deploy.
- HIGH: ausencia de auditoría física/financiera integral; eventos administrativos y soporte no quedan durables. El token readOnly sí bloquea mutaciones en TenantGuard, pero logs/motivo viven en frontend.
- MEDIUM: dinero calculado con Number/Math.round y precisión fija de cantidades en Decimal(12,2), sin MaxDecimalPlaces equivalente en entradas. Definir política de redondeo y precisión por unidad.
- MEDIUM: modelo de autorización de módulos permite acceso si no existe TenantModule; frontend puede considerar módulo ausente deshabilitado. POS depende de módulo inventario para obtener precios. Conviene un contrato explícito de consulta comercial para cajero.
- MEDIUM: campos sensibles como precioCosto se devuelven en GET productos a cualquier usuario tenant autorizado al módulo; restringir la proyección si su consulta debe ser reservada al administrador.
- MEDIUM: metadata del árbol muestra .env.local y .env.vercel versionados. No se abrieron ni se reprodujeron valores; no se afirma que contengan secretos válidos. Verificar exposición y rotar solo si se confirma.
- MEDIUM: autenticación sin limitación de intentos visible; logs de login incluyen correo/identidad/tenant. Revisar rate limiting y política de logging.
- MEDIUM: auditoría no puede depender solo de current Producto.precioCosto; DetalleVenta no conserva costo vendido y cambios posteriores impiden utilidad histórica fiable.
- MEDIUM: varias relaciones llevan tenant solo en el padre; mantener validación de pertenencia de cada entidad vinculada y considerar invariantes relacionales para nuevas tablas. Las rutas principales revisadas sí validan productos/clientes/categorías antes de vincular.

## 6. Requerimientos documentados sin circuito contemplado
En la nota primaria: CxP, CxC/abonos, costos históricos y actualización desde reposición, entrega controlada, venta sin inventario, devoluciones integrales, alertas de deuda/facturas y operación offline completa.
En documentos complementarios: conciliación/aplicación de conteos, autor por item, control de concurrencia, zonas, reconteos, generación de SKU, fotos pendientes persistentes, presentaciones/equivalencias y exportación Excel/plantillas.
Garantías tienen prototipo local y tablas SQL aisladas: requieren conexión y definiciones de negocio. Integraciones bancarias y vidriería siguen deliberadamente fuera del piloto; no son bloqueos P0.

## 7. Lista priorizada de cambios necesarios
### CRITICAL
1. Convertir CRITICAL en criterio de salida antes de usar el sistema para el piloto: verificar baseline/historial/schema/build con una BD aislada, proteger respaldo y demostrar despliegue reproducible sin pérdida de datos. B09/B14.
2. Para piloto con inventario y caja reales, impedir confirmaciones exitosas de recepción/cierre que no afectan datos centrales; cerrar los circuitos de B03/B04/B08 antes de confiar en sus saldos.

No se confirmó un incidente de pérdida de producción ni una explotación; CRITICAL aquí clasifica el trabajo bloqueante de preparación del piloto, no un incidente demostrado.

### HIGH
3. Resolver permisos backend, clientes/levantamientos y política de descuento/precio; altas de usuario seguras y revocación de acceso. B02/B06/B07.
4. Kardex transaccional, ajustes con motivo/autor y precisión decimal; corregir importación. B08/B11.
5. Levantamiento inicial revisado, conciliado y aplicado explícitamente con idempotencia, sin perder campos. B05/B12.
6. Proveedores/compras/recepción e historial de costo; reposición reciente actualiza costo incluso a la baja; CxP y pagos.
7. Crédito exige cliente; CxC automática y abonos; transferencia manual como método inicial. B01.
8. Turnos/apertura/cierre real y entrega vinculada a venta. B03.
9. Venta sin inventario física explícita y ligada a compra/proveedor.
10. Rotación y reportes agregados por período/tenant; separar utilidad histórica de margen actual. B10.

### MEDIUM
11. Barcode/fabricante/código interno reconocible con normalización y resolución de ambigüedades; cámara en dispositivos compatibles. B13.
12. Fotos optimizadas y referencia persistente; revisión de artículos incompletos.
13. Devoluciones, garantías con reglas confirmadas y alertas operativas.
14. Multiusuario, zonas, reconteos, control de conflictos y offline idempotente.
15. Exportación independiente CSV/Excel, columnas y plantillas.
16. Responsive POS/formularios, observabilidad, limitación de intentos y validación de decimales.

### LOW
17. Investigación bancaria/POS automatizada y definición de vidriería después del piloto.
18. Mejoras de lenguaje/etiquetas y ergonomía posteriores a los bloqueos operativos.

## 8. Plan de implementación por fases (propuesta, sin ejecutar)
### Fase 0 — Base reproducible y contratos
Revisar esquema real e historial con consultas de lectura, fijar baseline y migraciones aditivas revisables; reproducir despliegue en BD aislada desde cero y desde base existente; compilar dist desde src del mismo SHA.
Definir matriz ADMIN/CAJERO/BODEGUERO, precio/costo/margen, temporalidad de “compra más reciente” (fecha efectiva vs registro y retroactividad), entrega/reserva, redondeo y tipos físico/especial.
Salida: respaldo/restauración probados, inventario de tablas existentes y pipeline coherente. Reutilizar SQL existente cuando corresponda, sin duplicar modelos.

### Fase 1 — Seguridad y evitar datos incorrectos
Enforce permisos y descuentos en API, proteger mutaciones de clientes/conteos, corregir importación decimal, revocación y alta de usuarios. Corregir campos omitidos y cierre del conteo. Evitar presentar como registrada una operación local.
Salida: pruebas HTTP con ADMIN/CAJERO, bypass directo denegado, precios/descuentos autorizados, 2.75 conservado e intento de tenant ajeno rechazado.

### Fase 2 — Inventario y levantamiento inicial
Crear libro de movimientos reutilizable por venta, conteo, compra, ajuste y devolución. Revisión/conciliación/preview y aplicar conteo explícitamente; no cambiar stock al finalizar; autor y registro anterior/nuevo. Vincular item-producto y resolver conflictos; proteger aplicación idempotente.
Salida: fallar una línea revierte todo; aplicar dos veces no duplica stock; ventas/conteos concurrentes no pierden movimientos; conservar conteo original y exportación.

### Fase 3 — Compras, proveedores, costos y CxP
Conectar proveedores/órdenes/facturas y recepciones parciales/totales. Registrar historial costo-proveedor-documento-fecha-cantidad. Incrementar stock y actualizar costo vigente en la misma transacción al costo de compra elegible más reciente, con bajas incluidas. Separar costo vigente de valoración de inventario; no inferir precio de venta de lotes históricos. Implementar saldo de proveedor/pagos/vencimientos.
Salida: compra 100 seguida de 80 deja vigente 80 y conserva ambas historias; reintento de recepción/pago no duplica; devolución/cancelación usa reversa auditable. El precio de venta sigue la política de margen/manual que se acuerde.

### Fase 4 — Venta, crédito, entrega y caja
Cliente elegido en POS, transferencia como método, documento contado/crédito, CxC y abonos; turnos/cierre vinculados a actor; entrega/control físico y venta especial sin inventario con vínculo comercial. Mantener idempotencia y transacciones existentes.
Salida: rechazar crédito anónimo; pago reduce saldo una sola vez; contado/transferencia/tarjeta cuadran por turno; especial suma ingresos sin tocar stock; física requiere venta registrada para despacho.

### Fase 5 — Identificación y uso móvil
Códigos internos legibles reservados sin colisiones, fabricante/SKU proveedor, lookup barcode exacto y búsqueda descriptiva. Scanner por teclado y cámara compatible con alternativa manual. Foto opcional comprimida en almacenamiento de objetos con referencia en BD e identificación pendiente; revisar POS responsive.
Salida: foto visible tras recarga y en otro dispositivo, barcode encuentra producto correcto, producto sin código externo puede contarse y venderse.

### Fase 6 — Control operativo y reportes
Devoluciones vinculadas al original con efectos trazables; garantías con condiciones definidas; alertas CxP/CxC/stock; reportes agregados backend, resumen diario y costos históricos de venta.
Salida: reintegro/daño/reembolso/deuda consistentes; más de 50 ventas reflejadas correctamente; reglas de garantía aprobadas.

### Fase 7 — Colaboración, offline y portabilidad
Versiones/concurrencia por item, zonas/progreso, reconteos preservados. IndexedDB/cola con estado online/offline, sincronización idempotente y resolución explícita; definir operaciones permitidas offline antes de habilitarlas. Excel y CSV con columnas/plantillas reutilizables.
Salida: dos dispositivos/reintentos/red intermitente no sobrescriben ni duplican; conflictos bloquean aplicación; exportar no elimina ni aplica el conteo.

### Fase 8 — Evolución posterior
Investigación bancaria/POS automatizada y decisión de vidriería/tenant/permisos una vez estabilizado el piloto.

### Estrategia para preservar funcionalidades existentes
Migraciones aditivas y backfill verificable; no ejecutar db push destructivo. Compatibilidad temporal de contratos al conectar módulos; lectura legacy revisada y exportación explícita de datos locales, sin mezclar demostraciones con operaciones reales. Flags por tenant para puesta en marcha gradual. Probar núcleo de ventas/cotizaciones existente, numeración clientes, aislamiento, concurrencia, reintentos y precisión en PostgreSQL aislado, además de flujos HTTP/frontend completos. Registrar cambios con actor/origen desde el inicio, sin duplicar servicios de stock o numeración.

La implementación queda pendiente de autorización del usuario.

