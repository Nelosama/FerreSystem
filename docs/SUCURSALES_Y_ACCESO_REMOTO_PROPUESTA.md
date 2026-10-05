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

El cliente confirmó que necesita una app instalada que reciba avisos con la app cerrada, independiente de la sesión del navegador. Propuesta: React Native/Expo y un canal push, conservando la base operativa local. Un servicio pequeño puede manejar eventos sin convertir toda la base operativa en una base de pago externa. Confirmar Android/iOS, distribución, proveedor y presupuesto. Alcance en `APP_MOVIL_Y_NOTIFICACIONES.md`.

Nunca publicar PostgreSQL al Internet. La app deberá reutilizar aislamiento y autorizaciones del backend con una sesión segura propia del dispositivo. VPN o puente autenticado limitado habilitará consultas/decisiones fuera del local. La web móvil sigue sirviendo para acceso en LAN, pero no completa el requisito de app instalada/push. Probar app cerrada, logout/revocación y pérdida de Internet en teléfonos reales.

## Decisiones que faltan

Fecha de apertura de la segunda sucursal; catálogos/precios/clientes compartidos; usuario por sucursal; crédito y cobro entre sucursales; responsable de transferencias; continuidad esperada; tiempo de sincronización aceptable; requerimientos fiscales; dispositivo móvil y presupuesto del puente remoto. Implementar estos cambios sin esas reglas puede mover saldos o existencias al ámbito incorrecto.
