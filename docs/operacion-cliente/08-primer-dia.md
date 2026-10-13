# 08 · Primer día: procedimiento paso a paso

Este documento usa solo permisos verificados en el código del candidato `85e4ff88` (PR #155, base PR #153). Si la versión instalada en producción no es esa, confirme antes de usarlo.

**Antes de abrir la tienda:** el administrador debe haber completado los pasos 0 a 3 del día anterior (ver §0). Sin precios aprobados no se vende nada.

---

## 0. Preparación previa (día anterior, administrador)

| Paso | Qué hacer | Quién | Por qué |
|---|---|---|---|
| 0.1 | Crear cuentas de usuario y entregar contraseña temporal. Cada persona cambia la suya al entrar. | Administrador | Solo ADMIN gestiona usuarios. |
| 0.2 | Importar el inventario con `plantillas/inventario_importable_ferresystem.csv` (seis columnas; ver `11-captura-inventario-simple.md`). | Administrador o bodeguero | El importador crea productos con sus existencias. |
| 0.3 | **Capturar costo de referencia y precio de venta de cada producto** en «Precios y aprobación» y pulsar «Aprobar para venta». La hoja `precios_para_aprobar_administrador.csv` sirve de trabajo previo. | **Solo administrador** | El importador no lee precios. Un producto sin precio aprobado **no se puede vender** (el POS responde «no tiene precio aprobado»). |
| 0.4 | Confirmar que el costo capturado al aprobar es el de referencia revisado (decisiones I5 e I12). Al aprobar con costo y precio positivos, el costo vigente inicial queda registrado con motivo y auditoría. | Administrador | Sin costo vigente, las utilidades de esos productos no se calculan. |
| 0.5 | Verificar en Productos con filtro de pendientes que no quedan productos sin precio que deban venderse. | Administrador | Evita que el cliente encuentre artículos bloqueados en el mostrador. |

---

## 1. Iniciar sesión

1. Abrir la dirección del sistema en el navegador de la computadora (URL pendiente de Codex; ver `09-equipos-y-accesos.md`).
2. Escribir correo y contraseña. El cajero entra con su cuenta, nunca con la del administrador.
3. Si la cuenta exige cambiar la contraseña, cambiarla (mínimo 8 caracteres, letras y números).

**Comprobación:** aparece el menú con las opciones que su rol permite. Si falta una opción, es un permiso, no un fallo; consulte al administrador.

---

## 2. Registrar productos (solo cuando sea necesario el día de inicio)

- Alta manual: **solo ADMIN o BODEGUERO**. El cajero no puede crear productos.
- Producto nuevo sin precio: queda pendiente. Se vende cuando el administrador apruebe el precio.
- Código interno: usar el código que decida el dueño (decisión I2). No inventar códigos distintos para el mismo artículo.

---

## 3. Consultar existencias

- Cualquiera de ADMIN, CAJERO o VENDEDOR puede consultar el listado de productos con existencias y precio.
- **El cajero no ve costos ni márgenes.** Solo los ve el administrador. El bodeguero tampoco los ve.
- Existencia disponible = existencia física menos lo reservado por ventas pendientes de entrega.

---

## 4. Abrir caja

1. Entrar a la caja y abrir el turno con el fondo inicial contado.
2. **Cada usuario tiene su propia caja.** Una venta, un cobro o un pago exige que el usuario que lo registra tenga su caja abierta. Si no la tiene, el sistema responde «Abra su caja antes de registrar ventas o pagos».
3. Anotar el fondo en papel como respaldo.

Permisos: ADMIN, CAJERO y VENDEDOR pueden abrir caja.

---

## 5. Realizar una venta

1. Buscar el producto por nombre, código o código de barras.
2. Verificar el precio que aparece. Si el producto aparece como no autorizado, no se vende: avisar al administrador.
3. Agregar cantidades y revisar el total antes de cobrar.
4. Elegir el cliente si la venta es a crédito (solo con crédito habilitado y límite disponible).

**Regla importante:** no se puede vender a crédito sin cliente con crédito habilitado.

---

## 6. Registrar el cobro

Métodos disponibles y lo que exigen:

| Método | Qué exige el sistema |
|---|---|
| Efectivo | Monto recibido; el cambio se calcula en pantalla. |
| Tarjeta | **Referencia bancaria** del datáfono. El sistema no autoriza el cobro por sí mismo: el cajero debe aprobarlo en el datáfono y anotar la referencia. |
| Transferencia | **Referencia** de la transferencia, que no se puede reutilizar. Verificar en la cuenta bancaria antes de entregar. |
| Crédito | Cliente con crédito habilitado y saldo disponible. |

**Doble clic o reintento:** el sistema evita cobrar dos veces la misma venta. Si la pantalla no responde, no vuelva a cobrar: consulte el historial de ventas antes de repetir.

---

## 7. Entregar la mercancía

Hay dos caminos. **El que aparece depende del rol del usuario que cobra:**

### 7.A Entrega inmediata en mostrador

- Solo **ADMIN** o **BODEGUERO** pueden registrar una entrega física al cobrar.
- Si el cajero intenta esta opción, el sistema responde: «Su rol no registra entregas físicas. Use «Cobrar y dejar en bodega»».

### 7.B Cobrar y dejar en bodega (flujo normal del cajero)

1. El cajero elige **«Cobrar y dejar en bodega (entrega después)»** en el POS.
2. La venta queda pendiente de entrega y reserva el inventario.
3. El bodeguero (o el administrador) abre la lista de entregas pendientes (opción de entregas; el nombre puede variar en su versión), verifica el artículo contra el recibo y registra la entrega.
4. La entrega reduce el inventario físico. Una entrega parcial deja el resto pendiente.

**Autorización de entrega:** el cajero no confirma entregas. Si el cliente necesita salir con la mercancía de inmediato y no hay bodeguero presente, el cajero llama al administrador, que puede cobrar y entregar a la vez.

---

## 8. Cerrar caja

1. Contar el efectivo de la caja.
2. Registrar el cierre. El sistema calcula el efectivo esperado: **suma solo efectivo**. Tarjeta, transferencia y crédito no entran al efectivo esperado.
3. Si el conteo no coincide, **el sistema exige una explicación** para cerrar con diferencia. No se puede cerrar sin ella.
4. Imprimir el comprobante de cierre desde el navegador.
5. Un cierre confirmado no se edita. Si hay un error, lo corrige el administrador por el procedimiento que decida el dueño (pendiente, ver `00` §4).

Permisos: ADMIN, CAJERO y VENDEDOR cierran su propia caja. Solo ADMIN ve el historial de cierres de toda la empresa.

---

## 9. Qué hacer si algo falla

| Situación | Acción |
|---|---|
| Sin internet | **No se vende.** La contingencia offline está apagada en este piloto. Esperar a que vuelva la conexión. |
| Producto «no tiene precio aprobado» | No vender. Avisar al administrador. |
| Diferencia en caja | Anotar el motivo y avisar al administrador antes de cerrar. |
| Cliente pide devolución | El cajero registra la solicitud; solo ADMIN la autoriza y ejecuta. |
| Pantalla no responde al cobrar | No repetir el cobro. Revisar el historial de ventas. |

---

## 10. Cierre del día (administrador)

1. Revisar los cierres de caja del día (solo ADMIN ve todos).
2. Confirmar que no quedan entregas pendientes sin motivo.
3. Revisar productos con existencia bajo el mínimo.
4. Anotar incidentes en la bitácora de la tienda.
