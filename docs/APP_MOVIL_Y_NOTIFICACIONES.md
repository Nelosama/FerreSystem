# App instalada y notificaciones del dueño

Requisito confirmado el 5 de octubre de 2026: el dueño debe instalar una app y recibir notificaciones con la app cerrada, independientemente de la sesión del navegador. La web móvil y su manifiesto no completan este requisito. Este documento define el siguiente bloque de trabajo; aún no hay app ni entrega push implementadas.

## Primera versión propuesta

App React Native con Expo, reutilizando la API y las reglas de empresa/ADMIN existentes. Confirmar Android/iPhone y distribución antes de preparar builds firmados.

- Inicio de sesión propio del dispositivo, con renovación segura; cerrar el navegador no cierra la sesión de la app.
- Registro del dispositivo y permiso de notificaciones push.
- Bandeja de solicitudes pendientes y detalle actualizado desde el servidor.
- Aprobar/rechazar devoluciones desde la cuenta ADMIN, con motivo y auditoría existentes.
- Al tocar una notificación, abrir la solicitud y comprobar su estado vigente. Con dos ADMIN, una solicitud ya atendida se muestra como tal; un aviso antiguo no permite repetir la decisión.
- Consultas básicas del negocio y avisos de stock/vencimientos en una etapa posterior según prioridad del dueño.

La aprobación de la devolución sigue separada de su ejecución en caja. La app no crea una segunda autorización ni ejecuta ajustes financieros desde el aviso recibido.

## Sesión, cierre y recepción

Cerrar o dejar en segundo plano la app conserva el registro del dispositivo y permite recibir push mediante el sistema operativo, si hay permiso y conectividad. No depende de que una pantalla web permanezca abierta. El comportamiento debe probarse en builds instalables de los dispositivos reales, incluyendo restricciones del sistema operativo; no basta Expo Go o una prueba de navegador.

Cerrar sesión explícitamente en la app, revocar su dispositivo o desactivar/cambiar el rol de la cuenta debe cancelar su registro de avisos administrativos y su acceso. Cerrar sesión en la web no revoca automáticamente la sesión independiente de la app; una revocación global sí debe abarcar todos los dispositivos.

La expiración del access token no elimina por sí sola el registro push de una sesión móvil vigente. Para ver detalles y decidir, la app renueva su sesión o pide login. Un aviso en pantalla bloqueada muestra un mensaje genérico, sin credenciales ni información financiera sensible.

El refresh actual del backend usa cookie del navegador; el logout web borra esa cookie y no hay sesiones revocables por dispositivo. Access y refresh tampoco tienen propósito diferenciado en sus payloads. Antes de extenderlo a móvil, distinguir ambos propósitos y añadir sesiones por dispositivo con refresh rotatorio/revocable y comprobación de revocación en backend. Usar almacenamiento seguro del sistema; no asumir que copiar localStorage o una cookie web proporciona ese circuito.

## Base local y entrega de avisos

Conservar PostgreSQL local como fuente de ventas, caja, inventario y autorizaciones. Propuesta de menor alcance: registrar un evento pendiente en la misma transacción que crea la solicitud y usar un proceso local que lo entregue a Expo Push o FCM/APNs mediante HTTPS saliente. Así no se necesita alojar la base operativa en nube. Si se necesita un puente para acceso remoto sin VPN, puede manejar eventos/comandos limitados sin alojar toda la base operativa.

Los eventos deben conservarse ante reinicio o pérdida de Internet, con identidad, reintentos y control de duplicados. Aceptación por el proveedor no equivale a que el dueño lo haya leído; la bandeja del servidor sigue mostrando las solicitudes pendientes. El dispositivo se verifica contra usuario, empresa, rol y estado activo antes de cada envío administrativo.

El acceso remoto a los detalles y decisiones necesita una ruta segura al servidor: VPN o puente autenticado con alcance limitado. Push por sí solo no resuelve ese acceso ni debe conceder autorización. No publicar PostgreSQL ni aceptar decisiones anónimas desde la notificación.

Si el local pierde Internet, caja continúa con servidor/LAN encendidos y los avisos se entregan al reconectar. Mientras tanto no hay autorización remota inmediata; un ADMIN local puede decidir usando su propia cuenta. Si se apaga el servidor, la app informa falta de acceso y no presenta una aprobación como confirmada.

## Orden de implementación y aceptación

1. Confirmar plataforma, forma de distribución y conexión remota.
2. Preparar app con login seguro, bandeja y lectura del detalle usando la API existente.
3. Agregar sesiones/registro/revocación de dispositivos y cola persistente de eventos en backend.
4. Configurar proveedor/credenciales push y probar avisos con app cerrada en builds instalados.
5. Conectar decisión autorizada, comprobación del estado actual y auditoría; probar dos ADMIN simultáneos.
6. Probar logout/revocación, access token vencido, Internet interrumpido, reintentos y reconexión sin duplicar operaciones.

Las credenciales/cuentas de publicación y de push deben configurarse fuera del repositorio. La plataforma y el acceso a esos servicios aún no están confirmados. La entrega de esta app es un requisito del cliente; no debe marcarse completada por disponer de web adaptable o manifiesto.
