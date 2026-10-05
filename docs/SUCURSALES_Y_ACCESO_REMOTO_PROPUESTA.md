# Propuesta para expansión y acceso remoto

Diseño para revisión, no funcionalidad desplegada. La instalación local y las autorizaciones actuales pueden usarse como núcleo inicial; no confundir una etiqueta de sucursal en el navegador con separación real de existencias o caja.

## Empresa y sucursal

Mantener Tenant como empresa/cliente del sistema; no usar una nueva sucursal como sustituto automático de Tenant. Proponer entidad Sucursal asociada a una empresa y acceso de usuario por sucursal. Migrar instalaciones existentes a una sucursal inicial mediante migración comprobada sobre copia.

La sucursal controla existencias, reservas, caja, ventas, entregas y movimientos. La empresa puede compartir catálogo/clientes según política confirmada. Registrar sucursal origen en cada documento y autorización; toda consulta comprueba empresa y sucursales permitidas en el servidor. Un administrador puede tener alcance de una sucursal o varias; nunca se concede alcance cambiando localStorage.

## Continuidad y sincronización

Si cada sucursal debe operar sin Internet, cada una necesita servidor/instancia local y datos suficientes para sus operaciones. El servidor de sucursal conserva la autoridad sobre su caja y existencias; un servicio central consolida, sin bloquear la venta local cuando se corta Internet.

Usar UUID de documento/solicitud, secuencias comerciales por sucursal y eventos persistentes (outbox/inbox) en la misma transacción del negocio. Reintentos idempotentes, acuse, versión y auditoría. No resolver saldos ni inventario con "último cambio gana". Transferir mercadería exige documentos de salida/recepción y reglas de tránsito, cancelación y recepción parcial.

Pedidos remotos y autorizaciones requieren estado PENDIENTE/AUTORIZADA/RECHAZADA/EJECUTADA y dueño claro del documento. Sin conectividad no se inventa una autorización remota; un administrador local puede autorizar con su cuenta si la política lo permite. La fase actual de devoluciones es servidor único: no incluye outbox/inbox ni autorización por puente remoto.

## Celular y costos

Primera opción: web móvil en la red local, sin pago de base en nube. Segunda: VPN administrada para ver el mismo servidor fuera del local. Notificaciones push requieren registro de dispositivos y un canal de entrega; pueden usar un servicio pequeño para eventos sin convertir toda la base operativa en una base de pago externa. Confirmar restricciones de Android/iOS, proveedor, presupuesto y privacidad.

Nunca publicar PostgreSQL al Internet. Una app nativa deberá reutilizar autenticación, aislamiento y autorizaciones del backend. La web móvil puede ser suficiente para el piloto; evaluar instalación y notificaciones en teléfonos reales antes de elegir React Native/Expo.

## Decisiones que faltan

Fecha de apertura de la segunda sucursal; catálogos/precios/clientes compartidos; usuario por sucursal; crédito y cobro entre sucursales; responsable de transferencias; continuidad esperada; tiempo de sincronización aceptable; requerimientos fiscales; dispositivo móvil y presupuesto del puente remoto. Implementar estos cambios sin esas reglas puede mover saldos o existencias al ámbito incorrecto.
