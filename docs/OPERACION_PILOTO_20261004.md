# Operación de FerreSystem — 4 de octubre de 2026

Fuente de negocio: `REQUISITOS_NEGOCIO_VALIDADO.md` y las anotaciones de levantamiento de main. Base revisada: `84e61ec161455d46c2786791e6422178477ac886`. El diagnóstico anterior a cambios está en `DIAGNOSTICO_MAIN_20261004.md`.

## Resultado y alcance

Se priorizó inventario, compras, venta, entrega, caja y crédito. Las operaciones nuevas se persisten en PostgreSQL. El almacenamiento del navegador conserva únicamente solicitudes pendientes para recuperar respuestas perdidas; no sustituye la persistencia del negocio. Los comprobantes de venta solo se muestran después de confirmación del servidor.

Trabajo disponible en `codex/operacion-ferreteria`, PR #58. No se ejecutaron migraciones en producción, no se modificaron sus datos y main conserva la base original. El entorno de esta tarea no dispone de credenciales de Render ni de la base productiva.

## Matriz posterior a los cambios

| Requerimiento | Estado | Frontend | Backend | Base de datos | Evidencia | Qué falta |
|---|---|---|---|---|---|---|
| Inventario inicial: conteo, revisión y aplicación separada | IMPLEMENTADO | LevantamientoPage, captura completa, CSV/Excel, vista previa y aplicación administrativa | LevantamientosService: finalización no modifica stock; versión y token contra cambios concurrentes | Levantamiento/Item: costos, precio, margen, barcode, zona, versión, responsable y aplicación | Integración PostgreSQL: conservar datos y aplicar una sola vez; unitarias: cierre y conflictos | Validación con el conteo real del local |
| Venta registrada antes de entrega física | IMPLEMENTADO | POS y Entregas | Venta reserva; entrega descuenta físico y libera reserva; reintentos no duplican salida | Producto.stockReservado; Venta.reservaPendiente; MovimientoInventario | Integración de sobreventa, entregas concurrentes y cancelación parcial | Entregas parciales, si posteriormente las pide el dueño |
| Costo vigente según última reposición, incluso inferior | IMPLEMENTADO | Compras e historial en Inventario | Recepción actualiza costo vigente, conserva proveedor/factura/cantidad/fecha; no usa valoración de lotes | RecepcionCompra, CostoCompra, Producto.ultimaCompraAt | Integración: costos 12 y después 3 de dos proveedores; recepción repetida no duplica | Revisar datos históricos antes del piloto |
| Margen y precio propios de cada producto | IMPLEMENTADO | Administración de producto y levantamiento | Validación de valores y auditoría de cambios | Producto.margen/precioVenta/precioCosto | Esquema validado y compilación; captura aplicada en PostgreSQL | No se inventó una fórmula automática de precio; costo nuevo no cambia por sí solo el precio de venta |
| Proveedores, facturas, vencimientos, saldo y pagos | IMPLEMENTADO | Compras, Cuentas y reportes | Compra crea CXP; recepción parcial valida pendientes; pago reduce saldo; efectivo insuficiente se rechaza | Proveedor, OrdenCompra/Detalle, CuentaOperativa, PagoCuenta | Integración de compras, CXP, recepciones y aislamiento | Conciliar saldos anteriores; no importar saldos ficticios desde demostraciones |
| Efectivo, transferencia y tarjeta; cierre por usuario | IMPLEMENTADO | Caja real; selección de métodos en POS | Caja obligatoria para cobros/pagos; apertura única, cierre y diferencia; transferencia no aumenta efectivo | Caja, MovimientoCaja, Venta.cajaId, MetodoPago | Integración: transferencia, cierre, reintentos y bloqueo de nueva venta tras cerrar | Prueba operativa con el cajero y terminal física; sin integración bancaria |
| Crédito solo a cliente registrado, con abonos e historial | IMPLEMENTADO | Selector de clientes, vencimiento, Cuentas | Cliente del tenant obligatorio; crédito crea CXC; pagos idempotentes y límite de saldo | Cliente, Venta, CuentaOperativa, PagoCuenta | Integración: crédito sin cliente rechazado; abono repetido único y saldo correcto | Conciliación de ventas a crédito anteriores sin cuenta real |
| Administrador/Cajero y permisos en backend | IMPLEMENTADO | Permisos y límite de descuento persistidos; controles de acceso | JWT consulta usuario activo y rol vigente; RolesGuard; cajero no modifica costos, ajustes ni CXP; descuento y precio verificados al vender | Usuario.permisos, permisosConfigurados, descuentoMaximo | HTTP contra API compilada: costos/ajustes/usuarios/CXP rechazados; permisos revocados y usuario inactivo efectivos con token anterior | Revisar permisos de las cuentas reales antes de abrir el piloto |
| Auditoría de dinero, stock y usuarios | IMPLEMENTADO | Auditoría y movimientos por producto | Escrituras y auditoría en la misma transacción; desactivación conserva usuario/historial; último administrador protegido | AuditoriaOperacion, MovimientoInventario, MovimientoCaja | Integración de movimientos, caja y reversiones; endpoint administrativo paginado | Exportación y filtros avanzados posteriores |
| Barcode, fabricante, código interno y búsqueda textual | IMPLEMENTADO | POS busca nombre, descripción y códigos; Enter de lector agrega coincidencia única; variante visible | Búsqueda real y comprobación de colisiones; códigos internos generados bajo bloqueo por empresa | Producto.codigo/codigoBarras/codigoFabricante | Backend compilado; integración de productos y frontend POS | Prueba con el lector físico del cliente |
| Cámara para leer códigos | PARCIAL | BarcodeScanner en POS y conteo; libera cámara al cerrar o cambiar estado | Usa catálogo/guardado reales del sistema | Persistencia del producto/conteo existente | Compilación y flujo de código; API nativa del navegador | Validación en el celular real; navegadores sin BarcodeDetector requieren lector o búsqueda |
| Fotografías opcionales optimizadas y fuera de la base de datos | PARCIAL | Edición de URL HTTPS; imagen opcional en POS | URL validada; no guarda base64 ni binarios | Solo Producto.imagenUrl | Código y esquema; no se simula un servicio de archivos | Subida/captura, compresión y almacenamiento externo duradero configurado; no se afirmó tenerlos |
| Venta sin inventario físico | IMPLEMENTADO | Opción explícita en POS, proveedor obligatorio | No reserva ni descuenta físico; registra ingreso/caja/cliente; valida vínculo opcional de compra | DetalleVenta.sinInventario/proveedorId/ordenCompraId; Venta y caja | Integración: vender más que stock físico no lo cambia ni crea salida | Selector de compra en POS; API ya permite el vínculo |
| Devolución con efectos en venta, físico, caja y crédito | PARCIAL | Devoluciones busca documento, cantidades y destino | Máximo vendido pendiente; reembolso proporcional; cancela crédito primero; devuelve solo mercancía vendible o libera reserva; idempotencia | Devolucion, DetalleDevolucion, cuenta, caja y movimientos | Integración: devolución entregada, cancelación no entregada y crédito con abonos | Política exacta y efecto en garantías; comprobante fiscal de devolución |
| Garantía: condiciones, vigencia y responsable | NO IMPLEMENTADO | El prototipo está señalado como pendiente | No se inventaron reglas pendientes de levantar con el dueño | Tabla histórica no equivale a flujo implementado | Notas del cliente, sección 10 | Levantar política y conectar garantía con venta/producto/devolución |
| Alertas de stock y vencimientos | IMPLEMENTADO | Reportes de datos reales y cuentas vencidas | Consulta sin límite oculto de 50 ventas; considera disponible físico menos reservado y devoluciones | Cuentas, productos, ventas y devoluciones | Consultas del módulo Operaciones y build | Avisos automáticos fuera de la pantalla y canales, si se requieren |
| Operación desde otra PC/celular y continuidad sin Internet | PARCIAL | Web y recuperación de solicitudes pendientes de POS, conteo, compra y pago | UUID/hash y transacciones evitan duplicidad al confirmar reintentos | La confirmación se realiza siempre en PostgreSQL | Prueba frontend de respuesta perdida/reload; integración de operaciones concurrentes | Cola offline completa, catálogo offline y sincronización; no se autoriza entregar una solicitud sin venta confirmada |
| Vidriería/ventanas e integración bancaria/POS | NO IMPLEMENTADO | Sin cambios de alcance | El cliente las dejó posteriores al piloto | Sin nuevas integraciones inventadas | Notas P2 | Investigación después de estabilizar ferretería |

## Reglas operativas concretas

1. Abrir la caja propia con el efectivo inicial real.
2. Administrador registra proveedores y facturas. Registrar la factura crea deuda; recibir mercancía registra ingreso físico y cambia el costo vigente, aunque baje. Los pagos se realizan desde Cuentas.
3. Cajero consulta el catálogo del POS. Puede actualizar catálogo y precios del carrito, y debe revisar el total antes de cobrar. Si el precio cambió, el servidor rechaza el precio anterior.
4. Registrar venta y obtener confirmación del servidor. Para crédito, seleccionar un cliente registrado. Las mercancías físicas quedan reservadas y no pueden venderse otra vez.
5. Confirmar entrega desde Entregas. Solo entonces se reduce el inventario físico. Las ventas históricas no se vuelven a descontar: `reservaPendiente` es falso por defecto.
6. “Venta sin inventario” se usa para mercancía que nunca entra al local. Si llega físicamente, debe recibirse como compra.
7. Administrador registra devolución sobre la venta original. NO_ENTREGADO libera reserva; INVENTARIO reintegra mercancía entregada vendible; DAÑADO/PROVEEDOR conservan destino sin aumentar existencias vendibles. Crédito se cancela primero; dinero pagado se reembolsa. Una venta histórica a crédito sin cuenta debe conciliarse antes.
8. Cerrar la caja con efectivo contado; el sistema conserva esperado, contado y diferencia. La caja es parte del núcleo operativo del POS.
9. Ante respuesta perdida, usar “Confirmar pendiente”. No registrar de nuevo con otra identidad ni entregar mientras la venta no esté confirmada.

Los módulos de apartados, garantías, listas de precio, transferencias y pedidos especiales que antes escribían demostraciones locales no se presentan como operaciones reales. Sus fuentes y datos locales previos se conservan. La venta especial operativa está en POS. No se migraron esos datos locales a saldos o inventario.

## Verificación

GitHub Actions valida Prisma y genera cliente; ejecuta compilación frontend/backend, 15 pruebas frontend, 52 pruebas unitarias/HTTP backend y 28 pruebas con PostgreSQL real aislado. La integración parte del esquema de main, reproduce migración histórica operativa y numeración, y aplica la migración nueva. Inicia además la API compilada en modo producción contra esa base aislada y prueba permisos con JWT real. No usa DATABASE_URL productiva.

Ejecución completada para `0a08ea07adb0f89c6e09e807050548fb8bbcab91`: https://github.com/Nelosama/FerreSystem/actions/runs/37215414257 . Los ajustes finales se vuelven a comprobar en el último commit del PR. No se ha probado físicamente cámara/lector/impresora ni se ha ejecutado un piloto con datos reales.

## Pendientes priorizados y fases

### Fase 1 — Activación del piloto

**CRITICAL**: respaldo y comprobación del estado real de migraciones en Render/PostgreSQL; resolver baseline existente antes de `prisma migrate deploy`. El repositorio tiene historia SQL adicional a Prisma; no usar `db push`, reset o migraciones destructivas para hacerla coincidir. Revisar cajas abiertas duplicadas por usuario, códigos/barcodes repetidos, stock histórico negativo, ventas a crédito y saldos reales anteriores. Conciliar con el dueño, sin inventar que una deuda sigue pendiente.

**CRITICAL**: aplicar `20261004000000_operacion_ferreteria` primero sobre copia del dato real, validar permisos de administrador/cajero y desplegar frontend/backend juntos. Recompilar desde fuentes; no ejecutar los directorios dist antiguos versionados. Abrir turno, comprar y recibir un producto a costo mayor y menor, vender de contado/crédito, entregar, abonar, devolver y cerrar. Validar reservas físicas y diferencia de caja antes de usar el sistema para todo el local. No se ejecutó esta fase sobre producción por falta de acceso productivo en esta sesión.

### Fase 2 — Completar control operativo

**HIGH**: garantías y su efecto con devoluciones, usando condiciones confirmadas por el dueño. **HIGH**: fotos con compresión y almacenamiento externo duradero; validar lector/cámara e impresión reales. **HIGH**: offline con cola persistente, catálogo y conciliación de conflictos, conservando prohibición de entregar ventas no confirmadas.

**MEDIUM**: selector de compra para venta especial, filtros por documento/usuario/fecha en auditoría, exportaciones financieras y entrega parcial si se solicita. **MEDIUM**: unificar fechas de negocio según zona horaria del local; reportes actuales identifican su rango en UTC. **MEDIUM**: revisar y actualizar dependencias con vulnerabilidades detectadas por npm audit, sin aplicar cambios mayores a ciegas. La instalación actual reporta vulnerabilidades preexistentes; el pase de pruebas no las elimina.

### Fase 3 — Extensiones posteriores

**LOW**: explorar integraciones bancarias/POS y unidad de vidriería. Reimplementar módulos de demostración solo cuando se confirme su alcance y su persistencia real. Medir desempeño antes de sustituir el bloqueo transaccional por empresa con una estrategia más granular.

No se requiere una nueva autorización rutinaria para seguir trabajando: el usuario autorizó este trabajo y sus siguientes pasos. El acceso al entorno productivo y las reglas de garantía pendientes son información que aún no está disponible, no una autorización repetida.
