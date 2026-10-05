# Idea: reversos con autorización administrativa

Fecha: 5 de octubre de 2026.
Estado: propuesta pendiente de definición e implementación.
Complementa RECUPERACION_USABILIDAD_Y_PRIORIDADES_20261005.md y las ideas de acceso móvil y continuidad.

## Necesidad expresada

Permitir reversar transacciones por error u otra causa válida con autorización del administrador, mediante clave local o solicitud remota. Presentar un flujo sencillo para personas con poca experiencia en computación.

## Flujo propuesto

1. Buscar la operación y seleccionar “Solicitar reverso”.
2. Mostrar documento, importe, efectos previstos y motivo obligatorio.
3. Un administrador autoriza localmente con su propia credencial/PIN de autorización, o recibe una solicitud remota vinculada a esa operación.
4. El servidor vuelve a validar permisos, vigencia y estado de la operación, y aplica el reverso una sola vez.
5. Mostrar comprobante del reverso y conservar relación con el documento original.

La autorización remota debería mostrar documento, sucursal, solicitante, motivo, importe y consecuencias. Debe permitir aprobar o rechazar, tener vencimiento y quedar vinculada a un alcance concreto. Si los datos relevantes cambian, revisar o renovar autorización.

## Reglas por definir

- Diferenciar borrador cancelado, venta registrada anulada, devolución y corrección administrativa. No son necesariamente la misma operación.
- Conservar el original y registrar una operación compensatoria; no borrar historial.
- Registrar solicitante, administrador autorizante, fecha, motivo y documento original.
- Validar en backend; ocultar un botón no constituye autorización.
- Evitar clave administrativa compartida. Evaluar credencial individual o PIN individual con protección contra intentos, almacenamiento seguro y reautenticación.
- Un cajero no debería adquirir una sesión administrativa general por obtener autorización para un reverso.
- Impedir uso repetido de autorización y duplicación tras respuesta perdida o apagón.
- Tratar venta, reservas/stock, caja, crédito y auditoría de manera coherente y transaccional.
- No devolver stock si la mercancía no regresó o no es vendible.
- Diferenciar reverso de registro y devolución física de dinero: una terminal bancaria puede requerir su propio procedimiento; no afirmar que reversar aquí revierte automáticamente un cobro bancario.
- Definir restricciones para caja ya cerrada, documentos fiscales emitidos, ventas históricas y operaciones con movimientos posteriores.
- Compras recibidas, pagos, abonos y aplicaciones de inventario requieren reglas específicas; no implementar un botón universal que ignore operaciones dependientes.
- Definir reversos parciales/totales, límites de importe y qué roles pueden solicitarlos.
- Mostrar claramente cuándo falta autorización o no se pudo comprobar el resultado.

## Sin Internet y recuperación

Si se elige servidor local y la red interna funciona, un administrador presente podría autorizar localmente. La autorización remota necesita conexión; si no existe, la solicitud queda pendiente y no se interpreta como aprobada.

Después de una interrupción, consultar el estado del reverso/autorización y recuperar la misma operación. No ejecutar otra compensación con identificador nuevo sin verificar la anterior.

## Estado conocido y prioridad

El sistema ya tiene devoluciones con efectos en inventario, caja/crédito e idempotencia según OPERACION_PILOTO_20261004.md. Esto no acredita un flujo genérico de reversos con autorización local o remota; debe revisarse el alcance existente antes de reutilizarlo.

Prioridad sugerida:
- Antes del piloto: definir y cubrir correcciones esenciales de ventas/cobros, con autorización administrativa local y auditoría, según necesidades del negocio.
- Después, o antes si el dueño lo exige: autorización remota integrada con el celular y reglas de contingencia.
- Ampliar a compras, pagos y otras operaciones solo con dependencias y políticas definidas.

## Preguntas y criterios de aceptación

Confirmar con el dueño qué operaciones pueden reversarse, plazo, motivo, tratamiento de efectivo/tarjeta/crédito, cajas cerradas y documentos fiscales.

Probar permisos, rechazo/vencimiento, credencial incorrecta, doble clic, concurrencia, cambios después de autorización, respuesta perdida y reinicio. Verificar que original y reverso sigan visibles, que dinero/stock/saldos cuadren y que no se ejecuten compensaciones duplicadas.

Esta incorporación documenta la idea; no implementa reversos ni modifica datos productivos.
