# 02 · Manual del cajero

Procedimiento para vender, cobrar, entregar y cerrar caja en FerreSystem. Los textos entre comillas son los que muestra la pantalla. Las restricciones de la última sección son reales: léalas antes del primer día.

## Antes de vender: iniciar sesión y abrir caja

1. Inicie sesión con el usuario y la clave que le entregó el administrador. La clave debe tener al menos 8 caracteres, con letras y números.
2. Abra **Caja y arqueo** (`/arqueo-caja`), o el enlace «Abrir o revisar mi caja» desde el POS.
3. Escriba el **Fondo inicial** (efectivo con el que empieza el turno) y pulse **Abrir caja**.

- **Sin caja abierta no se vende ni se cobra**, con ningún método de pago. El sistema responde: «Abra su caja antes de registrar ventas o pagos».
- Cada cajero tiene su propia caja. No abra la caja de otra persona ni comparta su usuario.

## Procedimiento de venta (POS, `/pos`)

### Paso 1 · Buscar o escanear el producto

- Use el campo **«Buscar por código o nombre de producto...»**. Busca por nombre, código, código de barras, código de fabricante y descripción.
- Si escribe un código exacto y **coincide con un solo producto**, pulse **Enter**: el producto se agrega al carrito y el campo se limpia.
- Si coinciden varios: «Código ambiguo; seleccione el producto». Elija el correcto de la lista.
- Si el lector de códigos emula teclado, el código entra en el campo de búsqueda; después pulse Enter.
- El botón de escáner con cámara exige HTTPS y **no está validado en iPhone real**. Para la venta del día, use el lector o el campo de búsqueda.

### Paso 2 · Agregar productos al carrito

- Pulse el producto en la lista para agregarlo.
- Si no encuentra un artículo, **no lo cree**: el cajero no tiene permiso para dar de alta productos. Avise al administrador.

### Paso 3 · Confirmar cantidades y precios

- En el carrito, el campo **«Cantidad {producto}»** acepta decimales (mínimo 0.01).
- Revise el **total** antes de cobrar.
- Los precios vienen del catálogo. Un cajero no puede vender a un precio distinto del registrado; si lo necesita, avise al administrador.
- **Descuento:** tiene un límite por usuario. Si el descuento lo supera, la pantalla dice: «El descuento supera su límite. Un administrador debe registrar esta venta».

### Paso 4 · Cliente (opcional, obligatorio para crédito)

- Puede seleccionar un cliente registrado. Para **Crédito** es obligatorio, y el cliente debe estar activo y con crédito habilitado.
- En crédito aparece el campo **«Vencimiento del crédito»**.

### Paso 5 · Seleccionar el método de pago

Botones de la pantalla: **Efectivo**, **Tarjeta**, **Transferencia**, **Crédito**.

### Paso 6 · Calcular el vuelto (manual)

**El sistema no calcula el vuelto.** No hay campo de «efectivo recibido». Haga la cuenta a mano:

> Vuelto = efectivo recibido − total mostrado en pantalla

Ejemplo ficticio: total L 425.00, cliente paga con L 500.00 → vuelto **L 75.00**.

- **Tarjeta y transferencia:** el sistema no consulta al banco ni al datáfono. Confirme la aprobación en el datáfono o en el comprobante del banco **antes** de procesar la venta.

### Paso 7 · Registrar el cobro

- Pulse el botón principal, que dice **«Procesar Venta»** seguido del total.
- Al confirmarse aparece: «Venta registrada. Puede imprimir o descargar el comprobante. No vuelva a cobrarla.»
- **Si la red falla o aparece «No recibimos confirmación»:** no pulse cobrar otra vez. Siga el mensaje (recargar y revisar la venta pendiente) y avise al administrador. Repetir el cobro sin revisar puede dejar dos cobros del mismo cliente.
- Después de cobrar puede imprimir o descargar el comprobante con las opciones de la pantalla.

### Paso 8 · Entregar la mercancía

- Al cobrar, las existencias quedan **reservadas** para esa venta.
- La entrega se confirma en **Entregas** (`/entregas`). Cada venta muestra sus líneas. Pulse **«Confirmar entrega»** cuando entregue la mercancía. Solo entonces baja la existencia física.
- Pueden entregar: ADMIN, CAJERO y BODEGUERO.
- **Venta sin inventario:** existe la casilla «Venta sin inventario: mercancía que no entra al local». Al marcarla aparece una lista para elegir el proveedor de esa mercancía. Úsela solo si el dueño lo autoriza; el flujo completo no está validado en preproducción.

### Paso 9 · Consultar ventas

- **El cajero no tiene un listado general de ventas.** Opciones reales:
  - **Movimientos del turno** en Caja y arqueo: hora, método, monto y concepto de lo que cobró en su caja.
  - **Devoluciones** (`/devoluciones`): busca una venta por número para devolverla. Las devoluciones las decide el administrador.
- El administrador consulta ventas en **Reportes** (`/reportes`) y **Auditoría** (`/auditoria`).

### Paso 10 · Cierre de caja

En **Caja y arqueo** (`/arqueo-caja`):

1. Cuente el efectivo de la caja.
2. Escriba **«Efectivo contado»**. El sistema muestra la diferencia en vivo: **Sobrante**, **Faltante** o **Cuadra**.
3. Si hay diferencia, aparece **«Explique la diferencia»**. **Es obligatorio** escribir la explicación para poder cerrar.
4. Pulse **«Cerrar caja»** y confirme. Mensaje: «¿Cerrar la caja con el efectivo contado? Ya no podrá registrar movimientos en este turno.»
5. Imprima el **comprobante de cierre** (vista imprimible del navegador).

**Un cierre confirmado no se edita y no se anulan movimientos.** Si cometió un error, avise al administrador de inmediato.

## Movimientos manuales de efectivo (solo con permiso)

- En **Caja y arqueo** → **«Registrar movimiento»**: tipo (entrada o salida), monto, concepto y referencia opcional.
- Necesita el permiso `caja.movimientos_manuales`, que asigna el administrador. Sin el permiso aparece: «Su usuario no tiene permiso para registrar entradas o salidas».
- Una salida no puede superar el efectivo esperado de la caja.
- No hay segundo aprobador: la salida la autoriza el propio permiso.

## Otras tareas del cajero

- **Abonos de clientes** (`/cuentas`): registra abonos a cuentas por cobrar. Cada abono entra a su caja.
- **Solicitar devolución:** puede solicitarla, pero el administrador decide. Sin esa autorización no se devuelve dinero.

## Restricciones reales del sistema

| Tema | Situación real |
|---|---|
| Vuelto | **Manual.** No hay campo de efectivo recibido ni cálculo automático. |
| Caja | **Obligatoria** para cualquier venta, incluidas tarjeta, transferencia y crédito. |
| Sucursal o punto de venta | **No implementado.** La caja identifica empresa, código y cajero. |
| Ticket | Comprobante imprimible del navegador. **No hay ticket térmico ni PDF.** |
| Sin conexión | **No se vende sin conexión.** El POS guarda borrador y venta pendiente en el navegador, pero eso no es un modo offline. |
| Tarjeta y transferencia | No hay conexión con el banco ni con el datáfono. La confirmación es manual. |
| Cierres | No se corrigen ni se anulan una vez confirmados. |
| Listado de ventas | No hay listado general para cajero (ver paso 9). |
| Lector con cámara | No validado en iPhone real. |
| Facturación fiscal | Fuera de este manual. Siga el procedimiento fiscal externo que defina el dueño. |

## Qué hacer si pasa algo

| Situación | Acción |
|---|---|
| Se cayó la red durante un cobro | No cobre de nuevo. Siga el mensaje de la pantalla y avise al administrador. |
| El producto no aparece | Busque por parte del nombre o por código. Si no existe, avise al administrador. |
| El descuento supera su límite | El administrador debe registrar la venta. |
| No cuadra la caja | Cuente de nuevo. Si persiste la diferencia, escriba la explicación y cierre. Avise al administrador. |
| No puede abrir o cerrar caja | Verifique que sea su usuario y que no tenga otra caja abierta. Avise al administrador. |
