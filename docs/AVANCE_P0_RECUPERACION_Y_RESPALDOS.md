# Avance P0: recuperación de ventas y respaldo

Fecha: 5 de octubre de 2026. Cambios preparados en codex/recuperacion-ventas.

## Recuperación implementada en esta etapa

- Borrador automático de carrito, cantidades, cliente, descuento y método de pago, separado por empresa y usuario.
- Al regresar al POS con el mismo navegador/equipo/usuario se recupera el borrador o la solicitud pendiente. No se envía ninguna venta automáticamente.
- “Revisar venta y continuar” consulta un endpoint autenticado y limitado a empresa/usuario. La consulta espera la transacción de venta en curso y no registra ni cobra.
- Una venta ya registrada muestra su comprobante con datos del servidor. El pendiente solo se elimina al cerrar el comprobante o iniciar otra venta desde él, cubriendo la interrupción entre confirmación y visualización.
- Una venta no registrada permite continuar con su mismo identificador, después de verificar el pago físico. Puede corregirse sin perder ese identificador; cada reintento consulta otra vez antes de enviar.
- Datos corruptos, almacenamiento inaccesible o falta de conexión muestran mensajes y no se convierten silenciosamente en otra venta.
- Sesión vencida, permisos o conflicto no borran la identidad pendiente.

Esto no crea operación offline completa. Borradores no descuentan ni reservan inventario. No usar navegación privada, borrar datos del navegador ni cambiar el origen/URL del frontend para una recuperación pendiente. La escritura del navegador no garantiza supervivencia ante daño de disco; comprobar el equipo y usar UPS. El efecto guarda cambios después del render de React: no garantiza el último carácter justo antes de un corte físico.

La prueba de cambios de usuario impide mostrar el resultado de una consulta anterior en otra cuenta. Las notificaciones de cambios de almacenamiento actualizan otras pestañas, pero no se garantiza una sesión de cobro concurrente entre pestañas; usar una sola pestaña POS por puesto. La recuperación está en POS, no en un centro general para todas las operaciones al iniciar sesión.

Los mensajes de pago no verifican efectivo ni terminal bancaria automáticamente. Comprobar el cobro físico antes de continuar. No se implementaron reversos autorizados en esta etapa.

## Respaldo y diagnóstico preparados

Herramientas: backend/scripts/backup-preflight.mjs y backend/scripts/preflight.sql.

El diagnóstico usa una transacción READ ONLY y consulta configuración de durabilidad, historial Prisma, cantidades y anomalías básicas. No aplica migraciones ni cambia saldos. El respaldo usa pg_dump custom, comprueba que el archivo sea legible y genera checksum SHA-256. No copia credenciales en el manifiesto ni muestra errores que puedan contenerlas.

La restauración completa sigue siendo necesaria: leer un archivo no prueba que pueda restaurarse. La prueba automatizada restaura datos ficticios en otra base del clúster aislado y compara ventas, productos y movimientos de caja. Esto no certifica el respaldo de producción.

Requisitos: Node, herramientas PostgreSQL compatibles con la versión del origen, acceso de lectura suficiente y almacenamiento privado. Para POSIX se crean directorios privados y archivos con permisos limitados; en Windows revisar ACL del directorio. Usar una cuenta explícita y el almacén de credenciales del administrador, PGPASSFILE/PGSERVICE o configuración equivalente. No incluir contraseñas en comandos ni en Git. No se utiliza DATABASE_URL ni se lee .env automáticamente.

Ejemplo con servicio de conexión previamente configurado por el administrador:

```sh
PGSERVICE=ferresystem_backup node backend/scripts/backup-preflight.mjs /ruta/privada/respaldos
```

Con PGHOST/PGPORT/PGDATABASE/PGUSER también es posible; para conexión remota configurar TLS verificable según proveedor. PG_BIN permite seleccionar el directorio de binarios. El reporte y el dump se toman en momentos distintos: usar una ventana operativa controlada para conciliación final. Proteger y copiar el respaldo fuera del equipo, definir retención y probar restauración; la herramienta no configura programación ni cifrado del destino.

## Hallazgos que siguen bloqueando puesta en operación

1. Este entorno no tiene credenciales productivas configuradas: no se hizo respaldo ni consulta de producción y no se aplicaron migraciones.
2. La primera migración del repositorio presupone que tenants y otras tablas base ya existen. No basta ejecutar migrate deploy sobre una base vacía para instalar en una PC nueva. Comprobar historial real, resolver baseline y ensayar sobre copia antes de cualquier cambio productivo. No usar reset ni db push para forzar coincidencia.
3. Hay archivos .env.local y .env.vercel versionados. Revisar si contienen secretos; retirarlos del versionado y rotar cualquier secreto expuesto si corresponde. No se leyeron sus valores ni se confirmó exposición de credenciales en esta revisión.
4. Falta decidir arquitectura/equipo/UPS, comprobar dispositivos y probar usabilidad con cajero y administrador.
5. Falta automatizar respaldo externo y probar restauración de datos reales en entorno aislado.
6. Frontend y backend deben desplegarse juntos para habilitar el nuevo endpoint. Recompilar desde fuentes; no usar dist antiguos versionados.

## Verificación y límites

La suite ampliada verifica borrador previo a Cobrar, respuesta perdida, comprobante tras recarga, consulta sin POST, sesión vencida, aislamiento de usuario/empresa, datos corruptos, fallos de almacenamiento y corrección con confirmación tardía. PostgreSQL aislado verifica consulta sin escrituras, espera de transacciones, reinicio abrupto, rollback de una venta incompleta, persistencia de una confirmada y reintento sin duplicados; también respaldo/restauración y HTTP autenticado con UUID válido.

Un stop inmediato del proceso PostgreSQL modela recuperación tras caída del servidor; no es una prueba de corte eléctrico físico ni daño de disco. Pendientes: prueba real con UPS/equipos, impresión y aceptación del usuario.
