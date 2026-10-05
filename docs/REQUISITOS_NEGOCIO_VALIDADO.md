# Requisitos de negocio validados — FerreSystem

Fecha: 2026-10-02
Fuente: conversación con el dueño de la ferretería.

## Objetivo de negocio
FerreSystem debe permitir que el negocio deje de depender de la memoria y presencia permanente del dueño. El sistema debe convertirse en la fuente de control operativo y permitir delegar con auditoría: quién hizo qué, cuándo, por cuánto y con qué impacto.

## P0 — Núcleo para piloto real

### 1. Inventario y entrega controlada
- Inventario es la máxima prioridad.
- Flujo objetivo: Cliente solicita → Caja registra/factura → venta registrada → entrega → inventario disminuye.
- Regla operativa: no entregar mercancía antes de registrar la venta.
- Detectar faltantes y mantener trazabilidad de movimientos.
- Reportar productos de mayor movimiento para reposición.
- El levantamiento inicial sigue siendo la primera implementación.

### 2. Costos y precio vigente
- Conservar historial de costos por compra/proveedor.
- Mantener además un costo vigente del producto.
- Al registrar una nueva reposición, permitir actualizar el costo vigente al costo de la compra más reciente, incluso si sube o baja.
- No confundir costo vigente comercial con valoración histórica de lotes.
- Cada producto puede tener su propio margen y precio de venta.
- Durante el levantamiento inicial contemplar costo, margen y precio de venta.

### 3. Compras, proveedores y cuentas por pagar
Trazabilidad mínima:
Producto → proveedor → factura de compra → cantidad → costo → fecha.
- Un producto puede tener múltiples proveedores.
- Registrar facturas de proveedor, vencimiento/plazo, monto, saldo, estado y pagos.
- Alertar facturas próximas a vencer.
- El negocio debe mantener su propio saldo por proveedor y no depender del estado de cuenta del proveedor.
- Recepción de compra física debe incrementar inventario y generar movimiento trazable.

### 4. Venta de contado y caja
- Métodos iniciales: efectivo, transferencia y tarjeta/POS.
- Toda venta asociada al usuario/cajero.
- Permitir cierre por cajero/empleado.
- Integraciones bancarias/POS quedan para investigación posterior y no bloquean el piloto.

### 5. Crédito y cuentas por cobrar
- Solo clientes previamente registrados pueden comprar a crédito.
- Cliente con código/identificador.
- Factura marcada como contado o crédito.
- Venta a crédito crea/aumenta cuenta por cobrar.
- Registrar abonos/pagos y reducir saldo.
- Mantener historial y trazabilidad de deuda.

### 6. Roles, permisos y auditoría
Roles mínimos validados: Administrador y Cajero.
- Cajero vende y consulta la información necesaria.
- Cajero no modifica libremente costos ni información sensible.
- Auditar usuario, operación, fecha/hora, monto, método de pago y cierre.
- Operaciones administrativas sensibles también deben registrar autor/modificador.

### 7. Identificación de productos
- Aprovechar código de fabricante/proveedor cuando sea útil.
- Productos sin código útil reciben código interno.
- Soportar escáner/cámara.
- Mantener búsqueda por descripción.
- Descripciones operativas deben distinguir variantes: tipo, medida, espesor, color/identificador cuando corresponda.
- Fotografía opcional como ayuda de identificación, optimizada para no almacenar imágenes pesadas directamente en la base de datos.

### 8. Venta especial / mercancía que nunca entra físicamente
Crear un flujo explícito de “Venta especial” o “Venta sin inventario”.
- Cuenta como ingreso, venta del cajero, factura, cierre e historial del cliente.
- No genera salida de inventario físico si la mercancía nunca estuvo almacenada.
- Debe poder vincularse al proveedor/compra correspondiente.
- No usar stock negativo como mecanismo normal para este caso.
- Si mercancía comprada por error sí llega físicamente al local, entonces sí entra al inventario.

## P1 — Control operativo

### 9. Devoluciones
Definir devolución vinculada a venta/documento original y su efecto en:
- inventario;
- factura;
- caja/reembolso;
- crédito/cuenta por cobrar;
- garantía.
Registrar motivo, usuario, fecha y destino físico del artículo.

### 10. Garantías
- Asociar garantía a producto/venta.
- Conservar condiciones, vigencia y responsable.
- Reglas exactas pendientes de levantar con el dueño.

### 11. Alertas
- Facturas de proveedor próximas a vencer.
- Cuentas por cobrar vencidas.
- Stock bajo/reposición y otras alertas operativas relevantes.

### 12. Operación offline
- Sistema web accesible desde otra PC/celular si falla un equipo.
- Ante caída de Internet, guardar temporalmente operaciones compatibles y sincronizar al volver la conexión.
- Definir cuidadosamente qué operaciones pueden ejecutarse offline para evitar duplicidad de ventas, pagos o stock.

## P2 — Posterior al piloto

### 13. Vidriería / ventanas
Analizar después de estabilizar la ferretería:
- misma empresa/unidad de negocio;
- otra empresa/tenant;
- usuarios/permisos separados;
- o ventanas como productos/servicios.
No debe ampliar el alcance del piloto inicial.

### 14. Integraciones externas
- Investigar integración bancaria/POS.
- No bloquear el desarrollo actual por estas integraciones.

## Reglas conceptuales críticas
1. Diferenciar inventario físico de mercancía vendida que nunca entra al local.
2. Diferenciar costo histórico de compra de costo vigente comercial.
3. No modificar existencias sin un movimiento trazable.
4. No permitir que permisos de frontend sustituyan validación en backend.
5. Ventas, compras, pagos, devoluciones y ajustes deben ser auditables.
6. FerreSystem debe permitir delegar la operación sin perder control.

## Flujo núcleo validado
Compras/Proveedores → Inventario/Costos → Venta/Crédito → Entrega → Caja/Cierre → Auditoría.

Alrededor de este núcleo: cuentas por cobrar, cuentas por pagar, garantías, devoluciones, ventas especiales y alertas.

## Próximo paso recomendado
Auditar el repositorio contra estos requisitos y clasificar cada punto como:
- IMPLEMENTADO Y VALIDADO;
- IMPLEMENTADO PARCIAL;
- EXISTE PERO REQUIERE ADAPTACIÓN;
- NO IMPLEMENTADO;
- REQUIERE DEFINICIÓN DE NEGOCIO.

No implementar funciones nuevas antes de comprobar qué existe actualmente en frontend, backend, esquema Prisma, persistencia y pruebas.

## Ampliación confirmada — 5 de octubre de 2026

El dueño requiere una app instalada para recibir notificaciones push y revisar autorizaciones importantes, incluso con la app cerrada y sin depender de la sesión del navegador. La sesión de la app será independiente; cerrar sesión explícitamente o revocar el dispositivo debe cancelar sus envíos futuros y acceso. Web adaptable/manifiesto no completa esta entrega. La base operativa puede seguir local; sin Internet del local, los avisos quedan pendientes hasta reconectar. Alcance y propuesta en `APP_MOVIL_Y_NOTIFICACIONES.md`; plataforma y distribución por confirmar.
