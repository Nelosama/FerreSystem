# Lluvia de ideas: continuidad operativa, costos, celular y sucursales

Fecha: 5 de octubre de 2026.
Estado: PROPUESTA PARA ANALIZAR. No constituye una decisión de arquitectura ni una autorización para implementar o desplegar estas opciones.

## Necesidad del negocio

La ferretería es pequeña y cuenta con una computadora para caja y otra para administración. Actualmente se conectan por Wi-Fi a Internet. El negocio necesita seguir operando cuando falle Internet, mientras los equipos necesarios tengan energía. El dueño tiene interés en una aplicación en el celular para recibir notificaciones y atender autorizaciones importantes.

Se busca reducir pagos recurrentes por alojamiento y base de datos, evitar comprar otra máquina si los equipos actuales son suficientes y prever una futura sucursal.

## Punto de partida

Se conserva el sistema web existente, su backend y PostgreSQL. Una aplicación web también puede servirse dentro de una red local sin Internet: no requiere convertirse en aplicación de escritorio.

El PR #58 se integró en main mediante el commit 9704f5df9fbf74fb4fe0ba101e527f14a2b8cd4a. Contiene persistencia y mecanismos para evitar duplicación en reintentos. Eso no equivale a una operación offline completa ni a sincronización entre bases locales y nube.

Las pruebas técnicas aprobadas no sustituyen la aceptación del dueño con datos reales. La aplicación de migraciones y verificación productiva deben comprobarse por separado. Consultar también OPERACION_PILOTO_20261004.md y REQUISITOS_NEGOCIO_VALIDADO.md.

## Opciones de alojamiento

| Opción | Costo y ventajas | Continuidad | Limitaciones |
|---|---|---|---|
| Todo en la nube | Pago recurrente; acceso remoto sencillo | Sin Internet requiere desarrollar almacenamiento y sincronización offline | Dependencia del proveedor y conectividad |
| PC del administrador como servidor | Aprovecha equipo existente; PostgreSQL sin costo de licencia | Admin y caja operan mediante red local sin Internet | PC encendida, sin suspensión; reinicios y fallas afectan a ambos |
| PC del cajero como servidor | Aprovecha equipo existente | Caja local y admin por red interna | Fallos o reinicios del cajero afectan a ambos; compite con su trabajo |
| Mini PC dedicada | Compra inicial; separa servidor de equipos de uso diario | Operación por red local | Mantenimiento, respaldo y energía; capacidad por dimensionar |
| Servidor local con servicio pequeño en nube | Datos operativos locales; nube para funciones remotas | Operación local durante cortes; comunicación remota se reanuda al volver Internet | Sincronización adicional y costo recurrente por cotizar |

Orientación preliminar: evaluar primero la PC del administrador como servidor. No elegirla sin revisar capacidad, sistema operativo, horario y confiabilidad. Una mini PC puede incorporarse más adelante si la disponibilidad lo exige.

No colocar una base independiente en cada computadora sin diseñar previamente sincronización y resolución de conflictos. Para el primer local, una base compartida evita inventarios y saldos divergentes.

## Red y cortes de energía

- La red Wi-Fi local puede seguir funcionando sin Internet si el router continúa encendido y permite comunicación entre dispositivos. Verificar aislamiento de clientes, cobertura y estabilidad.
- Preferir cable para servidor y cajero cuando sea viable; Wi-Fi para dispositivos móviles.
- Mantener encendidos servidor, router y terminal de trabajo. Que una sola computadora siga encendida no garantiza el funcionamiento del conjunto.
- Evaluar UPS para servidor/router y caja. La autonomía es limitada y debe calcularse según consumo y duración de cortes.
- Para cortes largos, evaluar batería/inversor y apagado seguro.
- Configurar inicio automático, recuperación tras reinicio, suspensión deshabilitada durante operación y actualizaciones fuera de horario.
- Una UPS no sustituye los respaldos.

## Celular del dueño

Primera alternativa: PWA instalable para consultar información y atender autorizaciones. Evaluar app nativa si las funciones o dispositivos lo requieren; verificar soporte real de notificaciones en los celulares previstos.

Dos caminos posibles:

1. Acceso privado al servidor local mediante VPN, por ejemplo Tailscale. Evita exponer directamente PostgreSQL y puede reducir gasto recurrente. Revisar condiciones y precio del plan para uso comercial. Depende de Internet y servidor encendido; las notificaciones automáticas requieren diseño adicional.
2. Servicio pequeño en nube para resúmenes, solicitudes de autorización y notificaciones. Mantener local la base operativa completa. Cotizar alojamiento, almacenamiento y mensajería según uso; no asumir costo cero.

Durante un corte de Internet el dueño no puede recibir nuevas solicitudes ni autorizar remotamente. Definir qué operaciones se bloquean, cuáles admite un administrador presente y los límites de contingencia. Registrar autor, fecha, operación y resultado de cada autorización. Considerar vencimiento y evitar ejecutar dos veces una autorización.

Si el dueño quiere consultar fuera de horario, decidir entre mantener el servidor encendido o disponer de una copia de consulta en nube, mostrando cuándo se sincronizó por última vez.

## Preparación para futuras sucursales

Propuesta a estudiar:

- Una empresa puede contener varias sucursales; no confundir sucursal con tenant/empresa.
- Asociar inventario, cajas, ventas, compras y movimientos con la sucursal correspondiente.
- Cada sucursal debe poder operar localmente sin depender de la computadora de otra sucursal.
- Usar identificadores únicos, eventos o solicitudes persistentes y reintentos idempotentes para sincronización.
- Definir propiedad de datos, cambios de catálogo/precios, orden de eventos, conflictos y permisos antes de sincronizar bases.
- Registrar transferencias como envío y recepción, con existencias en tránsito y trazabilidad.
- No prometer stock consolidado actualizado durante desconexiones; mostrar fecha de sincronización.
- Evaluar un servicio central para consulta consolidada y autorizaciones al incorporar otra sucursal.

Preparar el modelo ahora puede reducir cambios posteriores. Implementar toda la sincronización multisucursal desde el inicio añade costo y complejidad; debe priorizarse según necesidad real.

## Respaldos y seguridad operativa

La base local elimina una cuota de base administrada, pero transfiere responsabilidades de mantenimiento al negocio.

Definir respaldos automáticos fuera del equipo servidor, retención, protección de datos y pruebas de restauración. Establecer cuántos datos se tolera perder y cuánto tiempo puede estar detenido el negocio. La sincronización por sí sola no es un respaldo: también puede propagar errores o borrados.

No exponer PostgreSQL directamente a Internet. Evaluar acceso remoto privado, HTTPS, autenticación, permisos, actualizaciones y custodia de credenciales según la alternativa elegida.

## Preguntas pendientes para decidir

- Especificaciones y sistema operativo de ambas computadoras.
- Disponibilidad de la PC del administrador durante y fuera de la jornada.
- Frecuencia y duración de cortes de Internet y luz.
- Modelo del router, comunicación local entre equipos y posibilidad de cableado.
- Presupuesto inicial y mensual; costo de UPS, respaldo, soporte y equipo dedicado.
- Celulares del dueño, necesidad de consulta fuera de horario y autorizaciones concretas.
- Reglas de contingencia cuando el dueño no responde.
- Plazo probable para segunda sucursal y necesidad de compartir catálogo, clientes y precios.
- Requisitos fiscales, impresión y comportamiento de la terminal de tarjetas sin Internet.

## Secuencia sugerida, pendiente de análisis

1. Revisar equipo, red, presupuesto y reglas del negocio.
2. Elegir arquitectura y documentar la decisión con sus costos y limitaciones.
3. Si se elige operación local: desplegar frontend/backend/PostgreSQL, configurar inicio y respaldos.
4. Probar desconexión de Internet, reinicios, recuperación de solicitudes y restauración de respaldo.
5. Validar con el cliente venta, compra, entrega, crédito, abono, devolución y cierre de caja.
6. Incorporar acceso del celular y luego notificaciones/autorizaciones según prioridad.
7. Diseñar e implementar sincronización multisucursal cuando se confirme el alcance.

Este documento registra la conversación para retomarla después. No se modificó la arquitectura, no se instalaron servidores y no se aplicaron cambios a producción como parte de esta documentación.
# Actualización del requisito móvil — 5 de octubre de 2026

El cliente confirmó app instalada con notificaciones push aunque esté cerrada, independiente de la sesión del navegador. Las alternativas web/PWA de esta lluvia de ideas se conservan como antecedentes; no completan ese requisito. Propuesta y límites actuales en `APP_MOVIL_Y_NOTIFICACIONES.md`. La base operativa puede seguir local.
