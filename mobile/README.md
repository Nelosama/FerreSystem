# Acceso móvil del administrador

El cliente requiere **una app instalada con notificaciones push que lleguen aunque la app esté cerrada**, independiente de la sesión del navegador. Este requisito todavía no está implementado. Alcance y propuesta en `docs/APP_MOVIL_Y_NOTIFICACIONES.md`.

La web ya adapta la navegación a móvil y permite revisar solicitudes de devolución y decidir con una cuenta ADMIN. Incluye manifiesto para acceso desde la pantalla de inicio, según navegador/dispositivo; no se ha validado instalación en teléfonos reales.

Para la instalación local, el teléfono debe estar conectado a la red de la ferretería, resolver el nombre del servidor y confiar en su certificado HTTPS. Ver `docs/INSTALACION_LOCAL_Y_CONTINUIDAD.md`. Fuera del local requiere VPN o una conexión remota autorizada; no abrir PostgreSQL al Internet.

No hay todavía aplicación nativa, notificaciones push, cola offline ni puente de nube. Las solicitudes se consultan con **Actualizar estados** en Devoluciones; los avisos heredados de descuentos/transferencias guardados en el navegador no son notificaciones remotas ni autorizaciones del servidor.

Propuesta: React Native con Expo para la app y un canal push, manteniendo la base operativa local. Pendientes: confirmar Android/iOS y distribución, proveedor y presupuesto; sesión móvil segura; acceso remoto; registro/revocación de dispositivos, cola persistente de eventos, entrega/duplicados y separación por empresa. El backend de devoluciones ya conserva solicitudes, decisiones y auditoría; la app consumirá esas mismas reglas. Cerrar sesión explícitamente en la app debe revocar sus avisos y acceso; cerrar el navegador no afecta su sesión independiente.
