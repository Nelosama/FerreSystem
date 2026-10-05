# Instalación local y continuidad sin Internet

Paquete preparado en `deploy/local/compose.yaml`, para revisión antes de instalar en la ferretería. No se ejecutó en equipos ni datos reales del cliente.

## Arquitectura inicial de menor costo

Una PC existente puede alojar PostgreSQL, backend y frontend mediante Docker Compose. La caja, los dos administradores y el teléfono acceden al mismo servidor por HTTPS en la red local. No se necesita una base de datos de pago en nube para operar dentro del local.

El servidor y el router deben permanecer encendidos. Sin Internet, las ventas siguen funcionando si esa PC y la red local funcionan. El Wi-Fi local normalmente puede seguir conectando equipos aunque falle la conexión del proveedor; comprobarlo con el router real. Si se apaga el servidor, los otros equipos deben esperar su recuperación. No se implementa cola offline independiente en cada caja.

Recomendación para revisar: PC del administrador con capacidad suficiente, SSD y al menos 8 GB RAM, IP reservada en router y UPS para servidor/router. Confirmar sistema operativo, virtualización/Docker, recursos y licencias antes de instalar. En Windows, Docker Desktop debe iniciar automáticamente y ejecutarse antes de usar caja; no se verificó arranque desatendido sin login en Windows. Linux con Docker habilitado al arrancar es otra opción. Evitar suspensión automática durante operación.

## Servicios y almacenamiento

- PostgreSQL 17 persistente en un volumen. La aplicación usa un usuario propietario sin privilegios de superusuario; el administrador del clúster tiene otra contraseña.
- Backend compila desde fuentes, genera Prisma y aplica el despliegue con comprobación de historial. Reinicia tras fallos; no ejecuta seed demo.
- Frontend sirve archivos locales y la API bajo el mismo origen `/api`. Caddy emite certificados de su CA interna, conserva esa CA en volumen y publica solo 80/443. PostgreSQL/backend no publican puertos al host.
- Respaldo cada seis horas mediante `pg_dump`, checksum y manifiesto. No borra respaldos automáticamente. Se guarda fuera del repositorio y el administrador ve estado/fallo/antigüedad desde Inicio. El estado identifica la copia exacta del programador y consulta su evidencia de restauración; un archivo generado no equivale a restauración comprobada.

La descarga de imágenes/dependencias necesita Internet durante la instalación/actualización. La operación posterior usa los servicios locales. Si el servidor tiene proxy HTTP, NO_PROXY excluye los servicios internos; las conexiones externas conservan su configuración de proxy. Tipografías web externas pueden no cargar sin Internet; hay fuentes de reserva. No se añade caché offline de transacciones ni de respuestas privadas.

## Preparar configuración privada

Con Node instalado, desde el repositorio:

```sh
node deploy/local/prepare.mjs /ruta/privada/ferresystem ferresystem.lan correo-admin@ejemplo.com "Nombre de la ferretería"
```

El destino debe ser nuevo y estar fuera del repositorio. Se generan contraseñas aleatorias, JWT y `local.env`; no se imprimen secretos ni se sobrescriben archivos existentes. Guardar la contraseña inicial de `secrets/initial_admin_password` en un gestor de contraseñas por un canal privado. En Windows usar una ruta externa privada y configurar sus ACL: los permisos POSIX no sustituyen los permisos de Windows.

Configurar resolución del nombre `ferresystem.lan` a la IP fija del servidor en el router o archivos hosts de cada equipo. El nombre debe coincidir con FERRE_HOST. Confirmar reglas de firewall solo para la red del local; no reenviar esos puertos desde Internet.

## Arranque e instalación inicial

```sh
docker compose --env-file /ruta/privada/ferresystem/local.env -f deploy/local/compose.yaml build
docker compose --env-file /ruta/privada/ferresystem/local.env -f deploy/local/compose.yaml up -d --wait
docker compose --env-file /ruta/privada/ferresystem/local.env -f deploy/local/compose.yaml run --rm --no-deps backend node scripts/provision-local.mjs
```

El alta inicial crea una empresa y un ADMIN, sin productos/clientes ficticios. Si ya hay empresa/usuarios, se bloquea y no cambia contraseñas ni datos. Crear el segundo administrador y cajero desde Usuarios; no compartir la cuenta inicial. Hacer el primer respaldo después de completar esa configuración:

```sh
docker compose --env-file /ruta/privada/ferresystem/local.env -f deploy/local/compose.yaml exec backups node scripts/container-entry.mjs node scripts/backup-preflight.mjs /backups
```

El servicio programado sigue su intervalo. Una ejecución manual genera su propio manifiesto; el estado de Inicio corresponde al último intento del programador. `exec` inicia un proceso nuevo y necesita el envoltorio `container-entry.mjs` para cargar la conexión privada; `run` lo aplica automáticamente. Respaldos concurrentes usan carpetas distintas. Revisar espacio libre/retención y programar copia fuera de ese disco; el paquete no protege frente a pérdida física del servidor si todas las copias quedan ahí.

## HTTPS y acceso de caja/celular

Extraer el certificado **público** de la CA local (nunca su clave privada):

```sh
docker compose --env-file /ruta/privada/ferresystem/local.env -f deploy/local/compose.yaml cp web:/data/caddy/pki/authorities/local/root.crt /ruta/privada/ferresystem/ca-publica.crt
```

Instalar confianza en esa CA en caja, administración y teléfonos autorizados según su sistema operativo. Acceder a `https://ferresystem.lan`. Verificar cadena/nombre; no desactivar validación TLS ni acostumbrar al usuario a ignorar alertas del certificado. Cámara/instalación móvil requieren contexto seguro.

La web incluye manifiesto para acceso desde la pantalla de inicio. Todavía no hay app nativa ni notificaciones push. Fuera de la red local, considerar VPN administrada; no abrir PostgreSQL ni cambiar la protección de autorizaciones.

## Copia existente, actualización y recuperación

El alta inicial no importa ni adopta datos de otra instalación. Seguir `INSTALACION_Y_ACTUALIZACION_SEGURA.md`: respaldo/restauración aislada, inspección de historial y adopción explícita si corresponde. No arrancar sobre un volumen productivo desconocido ni usar reset/db push.

No usar `docker compose down -v` en operación: elimina los volúmenes de base/certificados. Los secretos originales deben conservarse junto con la documentación privada; reemplazar una contraseña en el archivo no actualiza automáticamente el usuario de una base ya creada.

Ante corte: recuperar energía/red, dejar que el servidor arranque y PostgreSQL termine su recuperación; verificar `/api/health`; ingresar con la misma cuenta y consultar pendientes del POS/devoluciones antes de repetir cobros o entregar. Confirmar físicamente los pagos. Probar restauración a una base distinta y conciliar datos antes de ponerla en servicio.

## Pendientes de instalación real

Copia real de la base, hardware/OS, router/DNS/firewall, UPS, certificados en dispositivos reales, lector/impresora, respaldo en otro disco/equipo, política de retención y responsable de mantenimiento. La configuración sola no garantiza continuidad eléctrica ni aceptación de los usuarios.
