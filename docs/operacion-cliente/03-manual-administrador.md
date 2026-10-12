# 03 · Manual del administrador

Guía para configurar la empresa y supervisar la operación. Las rutas y roles son los del código de `main` `7ccfad25`. Donde algo no está validado en preproducción, se indica.

## 1. Roles y pantallas

| Pantalla | Ruta | Quién entra |
|---|---|---|
| Usuarios y permisos | `/usuarios` | ADMIN |
| Inventario y productos | `/inventario` | ADMIN, BODEGUERO |
| Levantamiento físico | `/levantamiento` | ADMIN, BODEGUERO (aplicar: solo ADMIN) |
| Punto de venta | `/pos` | ADMIN, CAJERO, VENDEDOR |
| Caja y arqueo | `/arqueo-caja` | ADMIN, CAJERO, VENDEDOR (el historial completo de la empresa: solo ADMIN) |
| Cuentas y abonos | `/cuentas` | ADMIN, CAJERO |
| Entregas | `/entregas` | ADMIN, CAJERO, BODEGUERO |
| Devoluciones | `/devoluciones` | ADMIN, CAJERO, VENDEDOR (decide el ADMIN) |
| Reportes | `/reportes` | ADMIN |
| Auditoría | `/auditoria` | ADMIN |
| Órdenes de compra | `/ordenes-compra` | Ver §11 |

- Crear proveedores: solo ADMIN.
- Permisos finos asignables en Usuarios: `inventario.ver`, `inventario.editar`, `reportes.ver` y `caja.movimientos_manuales`.
- Garantías (`/garantias`) existe, pero **no está en el menú**. No la habilite sin decisión del dueño.

## 2. Crear usuarios

1. En `/usuarios`, cree un usuario por persona. No comparta cuentas.
2. Asigne rol: ADMIN, CAJERO, BODEGUERO o VENDEDOR. Ajuste permisos finos si hace falta.
3. Use **«Generar contraseña segura»** o escriba una clave de al menos 8 caracteres con letras y números. Entregue la clave en persona y pida que la cambie.
4. Para entrada y salida de efectivo, asigne `caja.movimientos_manuales` solo a quien deba tenerlo.
5. Confirme que **no quedan usuarios ni claves de demostración** en la empresa real.

## 3. Crear productos

En `/inventario` → alta de producto:

- **Identificación:** código (único, sin distinguir mayúsculas), código de barras (único en toda la empresa, incluidos inactivos), código de fabricante, nombre, descripción y marca.
- **Clasificación:** categoría (si no existe, se crea) y unidad de medida (12 valores, ver `01-inventario.md` §3).
- **Precios y costo:** precio de venta, costo, margen.
- **Existencias:** existencia inicial, que genera un movimiento `INICIAL`, y stock mínimo.
- **Imagen:** solo una URL. No hay servicio de fotos.
- **Estado:** solo el ADMIN puede desactivar o reactivar un producto. Los inactivos no aparecen en el listado normal.

## 4. Registrar inventario

Tres vías, descritas en `01-inventario.md`:

- **Importación CSV** para la carga inicial. Siempre primero sin sobrescribir.
- **Alta manual** para productos sueltos y los datos que el CSV no lleva.
- **Levantamiento físico:** un conteo por empleado, vista previa, conciliación y aplicación. **Solo el ADMIN aplica** el conteo. Si el conteo cambió después de abrir el formulario, el sistema pide recargar.

## 5. Consultar existencias

- El sistema maneja la existencia **física** y la **disponible**. La disponible es la física menos lo reservado por ventas que aún no se entregaron.
- No se puede fijar una existencia por debajo de lo reservado: el sistema responde que el conteo no cubre las ventas pendientes de entrega.
- El stock mínimo activa la alerta de stock bajo.

## 6. Gestionar precios y costos

- Edite el producto en `/inventario`. Los cambios sensibles (códigos, unidad, precios, existencias, estado) piden confirmación.
- Cada edición queda en auditoría con **valor anterior y valor nuevo**, motivo y versión.
- **Existencias:** cambiarlas exige motivo. Si otra persona cambió las existencias después de abrir el formulario, el sistema responde 409 y pide recargar, para no revertir una recepción o venta.
- **Unidad de medida:** no cambia si el producto tiene existencias o movimientos.
- **Costo a mano:** ADMIN y BODEGUERO pueden escribir el costo. Queda auditado, pero **rompe la regla de costo vigente** (que es el costo de la última recepción). Decisión pendiente del dueño (ver §13).
- **Precio en el POS:** un cajero no puede vender a precio distinto del catálogo. El ADMIN sí puede.

## 7. Consultar ventas

- **Reportes** (`/reportes`): resumen por rango de fechas, en zona America/Tegucigalpa.
- **Auditoría** (`/auditoria`): acciones con usuario, por ejemplo `PRODUCTO_CREAR`, `PRODUCTO_EDITAR`, `CAJA_MOVIMIENTO_MANUAL`, `LEVANTAMIENTO_CREAR`.
- **Búsqueda por número** de venta: en **Devoluciones**.
- **Aviso:** las ventas de 18:00 a 23:59 de días pasados **cambian de día** en los reportes respecto a versiones anteriores. Los datos guardados no se tocaron, pero el dueño debe aprobar ese cambio antes de comparar con reportes viejos (pendiente en `CONTEXTO_MAESTRO.md`).

## 8. Revisar movimientos

- Las existencias cambian solo por: alta inicial (`INICIAL`), ajuste con motivo (`AJUSTE`), compra recibida (`COMPRA`), venta reservada y entrega.
- La auditoría (`/auditoria`) muestra quién hizo cada cambio. Revísela al cierre del día y ante cualquier diferencia.

## 9. Supervisar entregas

- En `/entregas` aparecen las ventas pendientes de entrega, con sus líneas.
- Cada entrega se confirma con **«Confirmar entrega»**, que baja la existencia física y libera la reserva.
- **Revise las ventas sin entregar cada día.** Una venta sin entrega mantiene reservado el stock y puede dejar el disponible en cero.

## 10. Revisar cierres de caja

- En `/arqueo-caja`, la sección **«Historial de cierres»** muestra, para el ADMIN, **«Cierres de la empresa»**: cajero, estado, esperado, contado, diferencia y fecha de apertura. Se puede filtrar por estado (abierta o cerrada).
- Revise cada diferencia y su explicación. Un cierre **no se corrige** ni se anulan sus movimientos. Si hay un error, decida con el dueño y regístrelo fuera del sistema.
- Las entradas y salidas manuales quedan con su autorización (permiso o rol ADMIN).

## 11. Compras y proveedores

- **Proveedor:** solo ADMIN lo crea.
- **Orden o factura de compra:** ADMIN y BODEGUERO. Crea la cuenta por pagar.
- **Recepción:** ADMIN y BODEGUERO. Suma existencias una sola vez y fija el costo vigente con la última recepción. Es parcial o total.
- **Pagos a proveedor:** solo ADMIN. Los pagos **no afectan la caja** de ventas.
- Pantalla: `/ordenes-compra`. Los roles por ruta no se verificaron en esta revisión: confirme en preproducción.

## 12. Cuentas y abonos de clientes

- `/cuentas`: abonos de clientes con crédito. Cada abono entra a la caja de quien lo registra.
- La ruta antigua de abonos `POST /clientes/:id/abonos` está **bloqueada** (HTTP 410). Use solo la de cuentas.

## 13. Decisiones que debe tomar el dueño

Estas decisiones no las toma el sistema ni este manual. Están pendientes en `CONTEXTO_MAESTRO.md`:

| # | Decisión | Por qué importa |
|---|---|---|
| D1 | ¿El costo puede cambiarse a mano? ¿Bloqueado, solo ADMIN o con motivo obligatorio? | Afecta el costo vigente y las utilidades |
| D4 | ¿El importador «sobrescribir» debe pedir confirmación aparte? | Reemplaza existencias de productos existentes |
| D5 | ¿Cómo se borra una marca o categoría? | Hoy vacío no borra |
| — | Reembolso de devoluciones con abonos: ¿inmediato desde caja o diferido? | Hoy es inmediato y el monto mostrado es estimado |
| — | Aprobación funcional del cambio de fechas en reportes | Cambia totales de días pasados |
| — | ¿Sucursal o punto de venta? | **No implementado.** Una empresa con varias tiendas no debe operar como una sola sin decisión |
| — | Salida de efectivo: ¿requiere segundo administrador y monto límite? | Hoy basta el permiso |
| — | Procedimiento fiscal (factura, numeración, CAI) | Fuera del sistema hasta confirmar lo contrario |

## 14. Limitaciones reales

- Sin sucursales, sin lotes, series, vencimientos ni garantías por producto, sin variantes relacionadas y sin conversión de unidades.
- Sin ventas sin conexión. El POS no tiene catálogo guardado en el equipo.
- Sin ticket térmico ni PDF: comprobantes imprimibles del navegador.
- Tarjeta y transferencia: sin validación bancaria.
- Lector de códigos con cámara: sin validar en iPhone real.
- Respaldos: el proceso existe en el código, pero **no se verificó que esté configurado ni funcionando en producción**. Ver `05-lista-verificacion-primer-dia.md`.
