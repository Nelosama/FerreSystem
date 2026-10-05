# Auditoría de codex/recuperacion-ventas

Revisión del PR #59 y del paquete de instalación local preparado el 5 de octubre de 2026. Alcance: recuperación de ventas/devoluciones, autorización e integridad económica, migraciones, respaldo/restauración, sesión entre pestañas y despliegue Docker. Se utilizaron datos sintéticos y bases aisladas; no datos de la ferretería.

## Hallazgos y correcciones

| Prioridad | Hallazgo confirmado | Corrección y evidencia |
|---|---|---|
| P1 | Respuestas tardías del POS podían sustituir el comprobante vigente y borrar la recuperación de una operación posterior. | Validar empresa, usuario e identidad de solicitud al procesar respuestas; cerrar únicamente la recuperación correspondiente al comprobante. Regresiones del flujo con respuestas demoradas. |
| P1 | Revocar rol/permisos mientras una operación esperaba el bloqueo no impedía algunos mutadores económicos. | Releer usuario activo, empresa, rol y permiso dentro del mismo bloqueo que gestión de usuarios, antes de ventas, caja, pagos, compras, entrega, productos, aplicación de conteos y conversión de cotizaciones. |
| P1 | Cerrar el comprobante de una devolución anterior podía eliminar otra solicitud pendiente. | Comparar identidad del comando antes de limpiar recuperación; conservar la solicitud posterior. |
| P1 | Un cambio de login en otra pestaña podía refrescar solo el usuario y mantener la empresa anterior en el contexto. | Vincular la sincronización a la identidad del contexto y resolver cambios completos de sesión sin mezclar empresas. |
| P2 | Un rechazo definitivo al decidir/ejecutar una devolución podía dejar el flujo bloqueado indefinidamente. | Reconciliar el estado con lectura del servidor y conservar identidad en resultados inciertos; habilitar la siguiente acción únicamente con resultado confirmado. |
| P1 | Caddy enviaba las solicitudes a la API interna al proxy externo del entorno y recibía HTTP 403. | Excluir los hosts internos mediante NO_PROXY, conservando el proxy externo. HTTPS con CA/SNI válidos aprobado para Inicio, salud y manifiesto. |
| P2 | El comando de respaldo manual omitía la preparación privada de PG* y fallaba. | Envolver comandos ejecutados con exec en container-entry.mjs; el comando corregido generó un respaldo real del ensayo. |
| P2 | El usuario de respaldos no podía leer package.json al verificar una restauración. | Declarar permisos de lectura de código/configuración pública en la imagen, conservando permisos privados de secretos y copias. |
| P2 | Una ruta externa enlazada al repositorio permitía crear secretos/copias dentro de él. | Canonicalizar proyecto y ancestro existente antes de crear directorios; regresiones con symlinks y enlaces rotos. |
| P2 | La configuración alteraba barras POSIX/nombres comerciales y podía interpolar dólares. | Conservar valores y codificar dólares literales; validar el modelo real de Compose con fixtures temporales. |
| P2 | El panel seguía diciendo que faltaba comprobar restauración después de verificarla. | Vincular el intento programado a su manifiesto y SHA mediante IPC; derivar el estado de la evidencia actualizada por restore-verify. Se rechazan rutas/manifiestos inválidos. |
| P1 | Había archivos de entorno y artefactos generados bajo seguimiento de Git. | Retirarlos del índice en commit separado y conservar copias locales. El historial anterior requiere revisión de credenciales por su propietario. |
| P1 | La lectura de Excel dependía de XLSX con vulnerabilidades conocidas sin actualización correctiva disponible. | Retirar XLSX; mantener importación CSV UTF-8 con límites de tamaño/filas y pruebas. Auditoría npm productiva sin vulnerabilidades conocidas reportadas. |

## Evidencia técnica

El despliegue de ensayo creó empresa/ADMIN sin seed, agregó un cajero, abrió caja, vendió, entregó, solicitó y autorizó una devolución parcial, la ejecutó y repitió sin duplicar el reintegro. El stock final fue 9 a partir de 10, venta de 2 y devolución de 1.

Se generó un respaldo mediante pg_dump y se restauró en otra base vacía con el usuario no privilegiado de respaldos. El endpoint administrativo informó restauración comprobada y rechazó al cajero con HTTP 403. Se mantuvieron los volúmenes al recrear servicios y se verificaron venta, devolución y stock en una red Docker interna sin salida a Internet. Después de SIGKILL a PostgreSQL/backend, el sistema recuperó la venta confirmada, la devolución y el stock esperado. La suite PostgreSQL también comprueba rollback de transacción incompleta y reintento sin duplicar dinero/reservas. La validación HTTPS usa la CA pública del ensayo y comprueba nombre/cadena; no desactiva TLS.

Resultado final: **208 pruebas aprobadas** (58 frontend, 88 backend, 55 PostgreSQL real aislado y 7 scripts). Builds frontend con `/api`, backend y las imágenes Docker aprobados; `git diff --check` limpio. Auditoría npm `--omit=dev`: cero vulnerabilidades conocidas reportadas en ambos paquetes. Las pruebas de scripts quedan incluidas en CI.

Los avisos de Vite sobre fragmentos grandes y configuración CommonJS siguen siendo deuda de rendimiento/mantenimiento; no impidieron compilar. La retirada de XLSX hace que Excel requiera guardar como CSV UTF-8 antes de importar. El ensayo Linux/Docker no verifica dispositivos móviles reales ni arranque desatendido de Docker Desktop en Windows.

## Pendientes que impiden declarar lista la instalación real

1. Copia reciente de la base real y ensayo de actualización/restauración con conciliación del negocio.
2. Si los archivos de entorno históricos contenían credenciales reales, rotarlas y evaluar limpieza del historial. No se leyeron sus valores ni se reescribió historial durante esta auditoría.
3. Hardware/OS, arranque automático, router/DNS, confianza HTTPS en caja/celulares, UPS y prueba física de corte.
4. Respaldo externo al servidor, retención/espacio y responsable de restauraciones periódicas. Seis horas entre copias implican posible pérdida de operaciones desde la última copia si se pierde el disco completo.
5. Piloto con cajero y ambos administradores; impresora/lector, reglas fiscales y política de devoluciones/garantías.
6. Acceso remoto seguro y notificaciones móviles; segunda sucursal/sincronización requieren implementación adicional.

La auditoría cubre los flujos indicados y sus regresiones; no certifica todos los módulos preexistentes. No se habilita cobro simultáneo desde varias pestañas ni operación independiente de caja cuando cae el servidor/LAN. Los bloqueos económicos conservan un orden por empresa; no convierten la instalación en un sistema distribuido.
