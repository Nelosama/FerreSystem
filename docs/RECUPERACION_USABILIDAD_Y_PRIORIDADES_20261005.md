# Recuperación, facilidad de uso y pendientes priorizados

Fecha: 5 de octubre de 2026.
Estado: ideas y planificación para revisar. Este documento no implementa funcionalidades ni confirma su disponibilidad en producción.

Complementa [las opciones de arquitectura](IDEAS_ARQUITECTURA_CONTINUIDAD_Y_SUCURSALES.md), [el plan del piloto](OPERACION_PILOTO_20261004.md) y [los requisitos del negocio](REQUISITOS_NEGOCIO_VALIDADO.md).
El PR #58 ya se integró en main; las referencias del plan anterior a un PR aún en borrador describen su estado histórico.

## Contexto de adopción

El usuario indica que el negocio ya tiene un sistema, descrito como uno de Microsoft Dynamics para ferreterías, pero no lo utilizan porque lo consideran difícil. La identificación exacta del producto y las causas concretas no se han comprobado.

Quienes usarán FerreSystem pueden tener poca experiencia con computadoras. La facilidad de uso debe ser criterio de aceptación del piloto, junto con integridad de inventario, caja y ventas.

## Ideas de interfaz

- Pantalla inicial del cajero centrada en Vender, Buscar venta y Mi caja; mostrar administración según permisos.
- Venta con recorrido corto: buscar/escanear, cantidad, revisión del total y cobro.
- Botones grandes, texto legible y términos del negocio.
- Pedir solo información necesaria; explicar errores con una acción para resolverlos.
- Ejemplo: “Abra su caja para cobrar”, acompañado de acceso directo.
- Confirmaciones en acciones delicadas, sin interrumpir cada paso.
- Conservar borradores y facilitar correcciones.
- Recuperación guiada al volver: “Había una venta en proceso. Revisar venta y continuar”.
- El sistema debe comprobar el estado real antes de ofrecer reintento, cobro o comprobante; no trasladar al cajero decisiones técnicas sobre sincronización.
- Distinguir claramente Guardado como borrador, Pendiente de confirmar y Venta registrada.

Probar con cajero y administrador reales, observando dónde se traban al buscar, vender, corregir, consultar y cerrar caja. Observar también las tareas difíciles del sistema actual. No atribuir la dificultad únicamente a la marca.

## Qué existe y qué falta ante un apagón

Revisión de fuentes de main realizada durante esta conversación:

- frontend/src/pages/POSPage.tsx guarda la solicitud de venta en localStorage antes de enviarla, con identificador único y clave por empresa/usuario.
- Al abrir POS con el mismo equipo, navegador, empresa y usuario puede recuperar el pendiente y reintentar.
- backend/src/ventas/ventas.service.ts usa una transacción PostgreSQL y reconoce una solicitud repetida: devuelve la venta existente en lugar de duplicar venta, caja y reservas.
- frontend/test/operaciones.test.mjs prueba respuesta perdida, recarga y conservación de identidad.
- El carrito previo a pulsar Cobrar todavía no tiene guardado automático como borrador.
- Si el navegador recibió la confirmación y eliminó el pendiente antes del corte, la venta se consulta en el historial; no se recupera como pendiente.
- La recuperación actual no equivale a un centro de recuperación después del login ni a recuperación desde otra computadora.
- No se ha validado en esta conversación un corte físico de energía. Las pruebas de respuesta perdida no prueban apagado real, escritura durable del navegador ni restauración de una base local.

PostgreSQL permite confirmar o revertir el conjunto de cambios de una transacción. Si se instala localmente, verificar configuración de durabilidad, almacenamiento y recuperación; no prometer ausencia absoluta de pérdida ante daño físico.

El pago físico está fuera de la transacción de base de datos: el sistema no sabe por sí solo si ya se recibió efectivo o si una terminal bancaria cobró. Diseñar conciliación y evitar volver a cobrar sin comprobarlo.

## Comportamiento deseado de recuperación

1. Guardar automáticamente borradores, con versión, usuario/empresa y datos mínimos necesarios.
2. Al volver al POS, identificar borradores y operaciones pendientes.
3. Consultar al servidor si la solicitud ya se confirmó, sin crear una nueva venta por consultar.
4. Si está registrada, mostrar documento y facilitar consulta/reimpresión.
5. Si no se registró, permitir continuar la operación original con las validaciones vigentes.
6. Si no hay conexión al servidor, indicar que no puede comprobarse todavía; no presentar éxito ni autorizar entrega basada solo en un pendiente.
7. Separar recuperación del registro de la conciliación del pago físico.
8. Probar cambios de usuario, sesión vencida, datos corruptos, precios cambiados, caja cerrada, permisos revocados y respuesta perdida.
9. Definir retención y limpieza de borradores y cómo evitar restaurar datos de otra empresa o usuario.

## Prioridades consolidadas

La prioridad considera impacto en dinero/datos, continuidad y adopción. No implica que todas las funciones secundarias deban terminarse antes de un piloto limitado.

### P0 — Antes de usarlo como sistema principal

1. **Respaldo y datos reales.** Comprobar entorno actual, respaldo restaurable e historial de migraciones. Conciliar stock, códigos duplicados, cajas y saldos anteriores con el dueño.
2. **Arquitectura y continuidad.** Elegir nube/local según equipos, presupuesto y cortes. Evaluar PC del administrador como servidor, red local, UPS, inicio automático y mantenimiento. No construir dos arquitecturas a la vez.
3. **Recuperación de venta interrumpida.** Autoguardado de carrito, consulta de estado, recuperación guiada y conciliación de pagos. Probar apagones/reinicios en entorno controlado.
4. **Facilidad de uso y aceptación.** Simplificar flujo de caja según observación de usuarios reales. Deben completar tareas esenciales con ayuda mínima después de una breve capacitación.
5. **Migración y piloto controlado.** Ensayar sobre copia de datos reales y desplegar frontend/backend compatibles. Validar apertura, compra/recepción, contado/crédito, entrega, abono, devolución y cierre; probar lector e impresión usados por el negocio.
6. **Seguridad necesaria para el piloto.** Revisar permisos reales y credenciales/despliegue. Clasificar vulnerabilidades existentes por exposición e impacto; corregir las críticas aplicables antes de operación. El pase de pruebas no elimina vulnerabilidades.

La garantía, impresión fiscal u otra regla puede convertirse en P0 si es necesaria para las operaciones elegidas en el piloto.

### P1 — Después de estabilizar el núcleo o antes, si el negocio lo exige

7. **App instalada del dueño (requisito confirmado).** Recibir notificaciones push con app cerrada, independientes de sesión del navegador; revisar y decidir solicitudes con sesión móvil propia. Web/PWA no completa este requisito. Propuesta React Native/Expo, registro/revocación de dispositivos y cola persistente de eventos; VPN o puente limitado para acceso remoto, manteniendo base local. Ver `APP_MOVIL_Y_NOTIFICACIONES.md`.
8. **Garantías y política de devoluciones.** Confirmar vigencia, responsable, mercancía dañada y comprobantes; no inventar reglas.
9. **Continuidad adicional según arquitectura.** Con servidor local se puede operar sin Internet mientras funciona la red; una cola offline completa en cada terminal es una necesidad distinta y debe justificarse. Si se elige nube, la operación offline exige catálogo, cola, conflictos y sincronización.
10. **Dispositivos y fotos.** Validar cámara en móviles reales y, si se requieren fotografías, configurar captura, compresión y almacenamiento duradero. La URL de imagen actual no equivale a un servicio de subida.

### P2 — Mejoras y preparación de expansión

11. **Reportes y operación.** Zona horaria del local, filtros/exportaciones de auditoría y finanzas, selector de compra para venta especial; entregas parciales si se solicitan.
12. **Sucursales.** Diseñar relación empresa/sucursal, propiedad de datos y transferencias antes de cambios que dificulten expansión. Implementar sincronización y consolidación cuando se confirme plazo y alcance.
13. **Mantenimiento.** Dependencias no críticas, limpieza de artefactos versionados y desempeño según mediciones; separar esta tarea de correcciones de seguridad urgentes.

### P3 — Ampliaciones posteriores

14. Integraciones bancarias/terminales, vidriería y módulos hoy señalados como pendientes, según alcance confirmado y persistencia real.

## Información faltante para avanzar

- Capacidad y sistema operativo de PCs, disponibilidad fuera de horario y router/cableado.
- Frecuencia/duración de cortes, presupuesto y tolerancia a interrupción/pérdida de datos.
- Acceso al entorno productivo y estado observado de despliegue/migraciones.
- Disponibilidad del cajero y administrador para prueba de uso; tareas que evitan en su sistema actual.
- Política de garantías, requisitos fiscales, dispositivos y autorizaciones del dueño.
- Plazo y reglas de una segunda sucursal.

## Evidencia de cierre sugerida

No declarar continuidad, sencillez ni aceptación solo por compilación. Conservar resultados de restauración de respaldo, recuperación tras interrupción, conciliación de caja/inventario y observación de tareas reales. Registrar limitaciones del piloto y cuáles funciones siguen pendientes.
