# Roadmap general — FerreSystem

Este documento centraliza ideas y mejoras generales que pueden convertirse en futuras implementaciones. Los detalles específicos de cada módulo pueden mantenerse en documentos separados dentro de `docs/`.

## Prioridad alta

### 1. Cuentas por cobrar y ventas al crédito
- Permitir ventas al crédito asociadas a un cliente.
- Crear automáticamente una cuenta por cobrar desde la venta.
- Registrar monto original, abonos, saldo pendiente y fecha de vencimiento.
- Mantener historial completo de pagos y ajustes.
- Identificar cuentas vigentes y vencidas.
- Mostrar claramente quién debe, cuánto debe y desde cuándo.
- Incluir resumen de cartera total por cobrar.
- Conservar trazabilidad entre factura/venta, cliente y cuenta por cobrar.

### 2. Trazabilidad de movimientos de inventario
- No limitar el inventario al valor actual de stock.
- Registrar entradas y salidas con su origen.
- Distinguir inventario inicial, ventas, compras, devoluciones, ajustes y transferencias.
- Permitir consultar el historial de movimientos por producto.
- Registrar usuario, fecha, cantidad anterior/nueva y documento relacionado cuando corresponda.
- Facilitar investigación de diferencias de inventario.

### 3. Levantamiento de inventario
El diseño detallado se mantiene en:
`docs/PENDIENTES_LEVANTAMIENTO_INVENTARIO.md`

Incluye, entre otros:
- aplicación controlada al inventario;
- trabajo multiusuario;
- modo offline y sincronización;
- conciliación;
- código de barras/QR;
- fotografías;
- zonas, auditoría y reconteos.

## Prioridad media

### 4. Centro de alertas
Centralizar alertas operativas relevantes:
- stock bajo;
- cuentas por cobrar vencidas;
- productos próximos a agotarse;
- cotizaciones pendientes;
- apartados próximos a vencer;
- diferencias de caja;
- otros eventos que requieran atención.

Inicialmente puede implementarse dentro del sistema antes de incorporar notificaciones push.

### 5. Cierre/resumen diario del negocio
Crear una vista sencilla para el propietario o administrador con:
- ventas del día;
- efectivo esperado;
- ventas por medio de pago;
- ventas al crédito otorgadas;
- abonos recibidos;
- utilidad aproximada cuando la información de costos lo permita;
- diferencias de caja;
- otros indicadores operativos relevantes.

## Criterios generales para nuevas funcionalidades

- Priorizar problemas reales del negocio sobre agregar pantallas sin uso validado.
- Mantener compatibilidad multi-tenant.
- Mantener trazabilidad de operaciones sensibles.
- Diseñar pensando en uso desde celular.
- Evitar pérdida silenciosa de datos.
- Reutilizar servicios, modelos y componentes existentes antes de crear duplicados.
- Implementar por etapas y probar cada etapa antes de ampliar alcance.
- Validar las funcionalidades principales en una operación real de ferretería antes de sofisticarlas.

## Uso de este documento

Cuando surja una idea nueva para FerreSystem:
1. Registrarla aquí si afecta al producto en general.
2. Crear o ampliar un documento específico en `docs/` si requiere diseño detallado.
3. Revisar el código existente antes de asumir que la funcionalidad no existe.
4. Convertir la idea en una tarea concreta únicamente cuando se vaya a implementar.


## Hallazgos técnicos pendientes de corrección

### Órdenes de compra y proveedores — implementación parcial
Revisión del código actual:
- Existe interfaz para órdenes de compra y catálogo de proveedores.
- Proveedores y órdenes todavía se persisten mediante `localStorage` en el frontend.
- La acción **Confirmar recepción total** actualiza el estado de la orden y `cantidadRecibida` en el estado local.
- La recepción no debe considerarse completa hasta verificar/implementar persistencia real en backend y movimiento real de existencias.
- Pendiente conectar recepción parcial/total con inventario, trazabilidad de movimientos y costos.
- Al implementar, evitar duplicar modelos o endpoints existentes: auditar backend/Prisma primero.

### Permisos individuales — revisar persistencia y enforcement
Revisión del código actual:
- Existen roles base: `ADMIN`, `CAJERO`, `BODEGUERO` y `VENDEDOR`.
- Existe `RolesGuard` en backend para autorización basada en rol.
- La pantalla de usuarios permite seleccionar permisos individuales y límite máximo de descuento.
- El payload observado al crear/editar usuario envía nombre, email, rol, estado y contraseña cuando corresponde, pero no incluye los permisos individuales ni el límite de descuento seleccionados en la interfaz.
- Pendiente verificar modelo/DTO/backend y hacer persistentes los permisos finos.
- Pendiente asegurar que los permisos se validen en backend y no únicamente oculten o habiliten controles en frontend.
- Pendiente verificar persistencia/asignación real de sucursal mostrada en la interfaz.

### Devoluciones — auditar antes de implementar
- En la revisión inicial no se encontró una implementación clara de devolución de ventas o devolución a proveedor.
- Antes de crear el módulo, realizar una búsqueda completa de modelos, endpoints, servicios y componentes existentes.
- Si no existe, diseñar devoluciones vinculadas al documento original y con impacto trazable en inventario/caja/cuentas según corresponda.
- Una devolución no debe modificar stock sin registrar motivo, usuario, fecha y destino del artículo (reintegrado, dañado, devolución a proveedor, etc.).

### Regla para estos hallazgos
Estos puntos representan funcionalidad existente incompleta o áreas que requieren auditoría. No tratarlos automáticamente como módulos nuevos. Antes de implementar, confirmar el estado actual del backend, esquema Prisma, DTOs, endpoints y pruebas para evitar duplicar lógica.
