# Acceso móvil del administrador

La web ya adapta la navegación a móvil y permite revisar solicitudes de devolución y decidir con una cuenta ADMIN. Incluye manifiesto para acceso desde la pantalla de inicio, según navegador/dispositivo; no se ha validado instalación en teléfonos reales.

Para la instalación local, el teléfono debe estar conectado a la red de la ferretería, resolver el nombre del servidor y confiar en su certificado HTTPS. Ver `docs/INSTALACION_LOCAL_Y_CONTINUIDAD.md`. Fuera del local requiere VPN o una conexión remota autorizada; no abrir PostgreSQL al Internet.

No hay todavía aplicación nativa, notificaciones push, cola offline ni puente de nube. Las solicitudes se consultan con **Actualizar estados** en Devoluciones; los avisos heredados de descuentos/transferencias guardados en el navegador no son notificaciones remotas ni autorizaciones del servidor.

Pendientes para una app nativa/servicio de notificaciones: confirmar Android/iOS, proveedor y presupuesto; acceso remoto; registro de dispositivos, revocación, entrega/duplicados y separación por empresa. El backend de devoluciones ya conserva solicitudes, decisiones y auditoría; un cliente móvil deberá consumirlo con las mismas reglas. No implementar una autorización paralela por almacenamiento local.
