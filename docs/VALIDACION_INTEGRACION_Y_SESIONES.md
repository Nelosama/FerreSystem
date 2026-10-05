# Ensayo de integración y actualización de permisos

Trabajo en `codex/recuperacion-ventas`, PR #59. Fecha: 5 de octubre de 2026.

## Alcance comprobado

La validación utiliza PostgreSQL temporal, bases independientes y datos sintéticos. El entorno no tiene credenciales, conexión ni respaldo suministrado de la base real de la ferretería. No se modificó producción y **todavía no está validada la actualización sobre una copia real**.

Se añadió un ensayo que instala toda la cadena de migraciones, crea cajero/administrador/producto, abre caja, registra una venta, entrega productos, solicita/autoriza/ejecuta una devolución parcial y realiza respaldo con `backup-preflight.mjs`. Restaura mediante `restore-verify.mjs` a otra base vacía y comprueba:

- Venta original conservada y solicitud ejecutada con su administrador.
- Documento e importe de reembolso iguales a los originales.
- Existencias finales, efectivo esperado, movimientos de caja y auditoría conservados.
- Inspección/despliegue de la copia restaurada sin nuevas migraciones pendientes.
- Repetir la ejecución después de restaurar no duplica devolución, movimientos ni auditoría.

Se mantienen los ensayos de adopción/actualización histórica y recuperación tras parada abrupta de PostgreSQL. Una parada de proceso no prueba daño físico de disco ni comportamiento de los equipos ante un corte de energía.

## Sesiones y cambios de rol

El servidor ya consulta el usuario activo y sus permisos en cada petición. La interfaz ahora consulta `/auth/me` al iniciar una sesión, al recuperar foco/visibilidad y cada 30 segundos mientras la ventana es visible. Actualiza rol, permisos y límite de descuento en el contexto y almacenamiento del usuario; los menús y rutas protegidas usan esos valores.

No promete cambio instantáneo de todos los menús: el servidor deniega inmediatamente las operaciones sin permiso y la pantalla se actualiza en la siguiente consulta. Sin conexión se conserva la sesión; no se inventan permisos. Respuestas de otra identidad, empresa, token o de un efecto cancelado se descartan. La sesión Superadmin usa su flujo separado y no consulta el perfil del tenant.

Pruebas nuevas: actualización de rol/descuento, respuesta antigua tras otro login, consultas simultáneas, desconexión/reintento, limpieza del efecto e identidad de otra empresa.

## Ensayo pendiente con datos reales

Usar el procedimiento de `INSTALACION_Y_ACTUALIZACION_SEGURA.md`. Requisitos que aún no están disponibles: respaldo reciente de la ferretería, destino aislado vacío para restaurarlo y, si requiere adopción histórica, otra base vacía de referencia. Configurar conexiones mediante secretos del entorno o servicios PostgreSQL; no enviar contraseñas al repositorio.

1. Identificar origen, fecha del respaldo y versión operativa; suspender cambios durante la captura.
2. Verificar checksum y restaurar en el destino aislado. Nunca usar producción como destino.
3. Inspeccionar historial, tablas, numeración de clientes y diagnóstico de caja/stock/cuentas. Resolver discrepancias antes de actualizar.
4. Adoptar solo la etapa histórica comprobada, si corresponde, y desplegar las migraciones pendientes en esa copia.
5. Con cajero y administradores, probar venta, entrega, abono, devolución parcial/total, apertura/cierre y cambio de rol con sesión abierta. Conciliar importes y existencias contra la situación inicial.
6. Ensayar reinicio, recuperación de pendientes y restauración usando los equipos previstos. Validar impresión y respaldo externo.
7. Registrar resultados e incidencias antes de planificar la puesta en producción.

## Próxima prioridad

Con el ensayo real todavía pendiente de acceso, se puede preparar la instalación local: PC del administrador como servidor inicial si tiene capacidad, PostgreSQL local, red de caja/admin independiente de Internet, arranque automático, UPS y respaldos externos programados. Esto requiere verificar sistema operativo, equipos y router de la ferretería antes de definir la instalación definitiva.

## Resultado técnico de esta etapa

Build frontend/backend aprobados. 40 pruebas frontend, 52 backend y 51 PostgreSQL aislado aprobadas (143 en total). El caso nuevo de respaldo/restauración se ejecutó junto con toda la suite de integración. No se realizó prueba visual en navegador ni aceptación del cliente; las pruebas de interfaz verifican lógica de sincronización y las pruebas existentes de renderizado/handlers.
