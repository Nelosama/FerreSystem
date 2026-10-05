# Devoluciones con autorización administrativa

Rama: `codex/recuperacion-ventas`. PR: #59.

## Recorrido

1. Caja, vendedor o administrador busca el número de venta y selecciona cantidades, destino de cada producto, motivo y método de reembolso.
2. La solicitud se guarda en la base como **PENDIENTE**. No cambia caja, cuenta ni existencias. Conserva una identidad estable y el comando exacto.
3. Un administrador autenticado, de la misma empresa, revisa productos, cantidades, importe estimado, pago original y motivo. **Autoriza o rechaza** e indica el motivo de su decisión. Tampoco se realizan ajustes en este paso.
4. El solicitante confirma una solicitud **AUTORIZADA** desde su sesión. Si hay dinero a reembolsar, necesita su propia caja abierta; el efectivo debe alcanzar.
5. Una sola transacción registra devolución, detalles, movimientos de inventario/caja, reducción de crédito, auditoría y estado **EJECUTADA**. La venta original se conserva.

La ferretería puede tener dos o más administradores con cuentas individuales. Todos ven las solicitudes de su empresa y cualquiera puede decidir; basta la autorización de uno. Si deciden simultáneamente, se conserva la primera decisión confirmada y su autor; la otra recibe un conflicto y debe actualizar el estado. No se exige una doble aprobación.

El administrador autoriza usando su cuenta: no se comparte su contraseña con el cajero ni se confía en aprobaciones almacenadas en el navegador. El solicitante no puede cambiar cantidades, motivo o método de una solicitud ya registrada. Un reintento de una decisión idéntica recupera esa decisión; otra decisión sobre la misma solicitud se rechaza.

## Controles

- Solicitudes y comprobantes están aislados por empresa. El personal consulta solo sus solicitudes; el administrador revisa las de su empresa. Solo el solicitante ejecuta la devolución contra su caja.
- El servidor valida el administrador al decidir y vuelve a comprobar que siga activo y sea ADMIN antes de la primera ejecución. Cambiar un botón o el almacenamiento local no concede autorización.
- Antes de ejecutar se recalculan cantidades disponibles y destino. Si hubo otra devolución o una entrega después de la autorización, una solicitud incompatible no produce ajustes.
- La devolución parcial distribuye el total original, incluidos descuentos e impuestos, conservando los controles existentes para no devolver de más.
- Se reduce primero el crédito pendiente. El excedente es reembolso. Solo INVENTARIO incrementa stock vendible de mercadería entregada; DAÑADO/PROVEEDOR mantienen trazabilidad; NO_ENTREGADO libera la reserva.
- El importe mostrado al administrador es estimado: los pagos y devoluciones posteriores pueden cambiar la distribución entre crédito cancelado y reembolso. El comprobante muestra los valores definitivos.
- Tarjeta y transferencia registran el movimiento contable; no procesan automáticamente pagos en el banco.
- Auditoría guarda quién solicitó, quién decidió, el motivo, quién ejecutó y la relación con la venta/devolución. Una solicitud pendiente o rechazada no equivale a una devolución registrada.

## Interrupciones y recuperación

El navegador guarda la operación pendiente por usuario/empresa antes de enviarla. Una consulta recupera solicitudes y devoluciones confirmadas; ante desconexión o sesión vencida no se genera otra identidad. Repetir ejecución consulta el resultado ya registrado o ejecuta el mismo comando una sola vez.

El comprobante permanece recuperable hasta que el usuario lo cierra. Si falla el almacenamiento antes de enviar, se bloquea la operación. JSON corrupto se conserva para revisión. Los pendientes del flujo administrativo anterior siguen consultándose como devoluciones directas, con la misma identidad.

Una solicitud no registrada puede corregirse después de consultar su ausencia, manteniendo el mismo identificador. Se consulta otra vez antes del envío: una confirmación tardía no se sustituye por otra solicitud. Si la original se confirmó con otros datos, se recupera lo registrado y se informa que las correcciones no se aplicaron; el usuario revisa la solicitud original antes de continuar.

La base conserva las solicitudes registradas aunque se reinicie el navegador o se use otro equipo. El cuerpo todavía no confirmado y el comprobante pendiente dependen del navegador original. La pérdida física del disco requiere respaldo; esto no implementa operación offline.

## Instalación y límites

Se añadió `20261005000000_autorizaciones_devolucion`; las migraciones anteriores no cambian. Aplicar el procedimiento de `INSTALACION_Y_ACTUALIZACION_SEGURA.md` sobre copia comprobada antes de producción.

El flujo cubre devoluciones/cancelaciones totales o parciales de ventas. No revierte todavía compras, recepciones, pagos, aperturas/cierres de caja ni transferencias. No incluye aplicación móvil, notificaciones push ni autorización por PIN. La revisión administrativa requiere acceso al mismo servidor. Autorizar no caduca automáticamente; una solicitud incompatible requiere nueva solicitud y revisión, y la anterior no podrá ejecutarse mientras siga siendo incompatible.

## Validación

- Build frontend/backend y validación Prisma.
- 36 pruebas frontend: recuperación de respuesta perdida sin POST, bloqueo de doble clic/almacenamiento, sesión que cambia durante consulta, pendiente antiguo/corrupto y corrección con identidad conservada.
- 52 pruebas unitarias backend.
- 50 pruebas PostgreSQL aislado, incluyendo migraciones y diez casos nuevos del flujo autorizado: permisos, aislamiento, inmutabilidad, aprobación/rechazo, rollback, reintentos concurrentes, crédito, administrador desactivado, entrega posterior, devolución parcial, cantidades consumidas y dos administradores consultando/decidiendo simultáneamente.

Pendiente: aceptación con cajero/administrador reales, corte físico de energía y actualización sobre copia real de producción. No se modificaron datos productivos.
