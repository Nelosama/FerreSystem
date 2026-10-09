# FS-41 — automatización y recuperación de respaldos

## Auditoría del estado en main (2026-10-09)

- `frontend/src/components/BackupStatus.tsx` aparecía en el dashboard para ADMIN e informaba «backup no configurado», ofrecía «Actualizar estado» y no ocultaba el control a los demás usuarios de tenant. El API de estado requería rol ADMIN + TenantGuard, pero su dato de archivo es global y no tenant-scoped.
- `backend/scripts/backup-scheduler.mjs` corría cada 6 horas en compose local. Creaba dumps sin cifrar en volumen bind local; no validaba un destino remoto ni tenía retención, alertas o restauración automática. Un hash y `pg_restore --list` demostraban legibilidad, no recuperabilidad.
- `backup-preflight.mjs` y `restore-verify.mjs` eran comandos manuales. Su destino aislado era una URL PostgreSQL proporcionada por el operador, por lo que no se invoca automáticamente.
- `frontend/src/utils/sessionSync.ts` ya actualizaba identidad/permisos vía API y escucha focus/online cada 30s, con identidad usuario/tenant comprobada. Ante fallo de conexión conserva la sesión y no afirma que ventas pendientes estén sincronizadas.
- `DashboardPage` conserva el reintento humano de su resumen de negocio; POS conserva su recuperación de venta pendiente y reintento, y las confirmaciones de caja/ajuste. No se quitaron esas salvaguardas.
- Los controles «Actualizar» en Auditoría y Levantamiento recargan consultas operativas paginadas; no son procesos técnicos de infraestructura y quedan fuera del alcance.

**Decisión:** restauración de producción, cambios de retención/proveedor y diagnóstico de locks se reservan al Super Admin/responsable técnico; se requiere mantenimiento autorizado para recuperar datos globales. Ventas, compras y cierre persisten por operaciones transaccionales de la aplicación; nunca se hace un dump por transacción.

## Implementación verificable en esta rama

- `backend/scripts/backup-worker.mjs`: ejecutor externo al navegador y API; periodicidad predeterminada 24 h, máximo 3 reintentos exponenciales, lock exclusivo, estado atómico, bitácora append-only y hasta 100 eventos en UI. Después de cada intento publica éxito/fallo sin secretos.
- PostgreSQL `pg_dump` crea archivo custom en scratch privado. Restic cifra datos con clave externa al repositorio; sólo acepta destinos remotos configurados explícitamente. Tras subir, descarga snapshot y compara SHA-256; lo restaura en clúster PostgreSQL temporal, local, autenticado, con credenciales aleatorias y variables/credenciales fuente excluidas. Comprueba tablas núcleo. Solo después ejecuta retención de N copias (14 por defecto). Si falla cualquiera de las etapas, no corre `forget --prune`.
- Limita espera por locks de pg_dump y los recursos del worker para reducir impacto en ventas. Los fallos llevan código de etapa (sin stderr ni datos de conexión). El webhook HTTPS es opcional; su ausencia/fallo se expone en mantenimiento y debe acompañarse de un monitor externo de liveness.
- `/maintenance/backup` y `/admin/maintenance/backup` exigen tanto JWT válido como `SuperAdminGuard`; se eliminó el acceso de ADMIN de tenant al estado global. Solo el Super Admin tiene la consola en Mantenimiento. No incluye botón de restauración de producción.
- El dashboard operativo ya no muestra estado de respaldos; las lecturas técnicas consultan/reintentan al reconectar, en segundo plano, solo para Super Admin.
- Compose, imagen dedicada, `worker.env.example` y guía de operador bajo `deploy/backup/` y este documento. No se añaden credenciales.

## Configuración obligatoria antes de producción

1. Instalar Docker/Compose en infraestructura administrada y construir con `docker compose -f deploy/backup/compose.yaml build`.
2. Crear bucket/repositorio dedicado en S3 compatible (`RESTIC_REPOSITORY=s3:https://...`), cuenta con privilegio restringido, cifrado del lado del cliente de Restic; aplicar separación de cuenta/región y versionado/object lock según proveedor. Crear aparte `FS41_ENV_FILE`, `FS41_SECRETS_DIRECTORY` y `FS41_STATE_DIRECTORY` con permisos de servicio mínimos. `/scratch` debe ser tmpfs suficiente para el mayor dump; ampliar el límite de 1 GiB si es necesario.
3. Poner `restic_password`, `source_password` y credenciales IAM/cuenta de almacenamiento fuera del repo, idealmente en secret manager. Guardar clave de Restic en un gestor independiente: perderla hace irrecuperables las copias. Configurar endpoint HTTPS `FERRE_BACKUP_ALERT_URL` a guardia técnica de SUPER_ADMIN.
4. `backup_reader` necesita `CONNECT`, `USAGE` y `SELECT` de todas las tablas/secuencias; SSL `verify-full`, CA/hostname/certificados según política. No dar escritura a esta cuenta.
5. Elegir frecuencia, retención, RPO/RTO, tolerancia de scratch y costos según volumen. La retención es número de copias exitosas (no protección inmutable por sí sola). El bucket debe ser exclusivo: la poda es a nivel de repositorio.
6. Desplegar primero en staging con destino externo; ejecutar backup, comprobar alerta de fallo deliberado con base inválida, revisar `restic check`, restaurar una copia nueva e inspeccionar conciliación por tenant antes de programar en producción.
7. Monitorizar en infraestructura el estado/reinicio del contenedor y antigüedad del último éxito. Lock `worker.lock` sobreviviente a apagado forzado bloquea arranque; el operador verifica proceso y bitácora antes de retirar solo el lock obsoleto.
8. Restauración de datos de cliente requiere aislamiento de red, copia a base vacía/efímera, revisión del dueño de datos y ventana explícita; este worker de preflight jamás restaura producción.

Para levantar worker: configurar las variables requeridas en archivos privados y ejecutar `docker compose --env-file <archivo-privado> -f deploy/backup/compose.yaml up -d --build`; revisar `/state/latest-status.json` y `/state/executions.jsonl` desde el plano técnico. Ejecutar `node backend/scripts/backup-worker.mjs --once` solo en staging debidamente configurado. La UI no permite iniciar jobs ni filtra detalles de conexión.

**No declarar respaldo de producción activo:** todavía no existe destino remoto o credenciales del cliente en esta entrega. El indicador sano exige copia cifrada en remoto, readback íntegro y restore reciente de ESA misma copia en base aislada. Aún se requiere staging del cliente y una prueba de recuperación aprobada.

## Verificación y pendientes

- `node --test backend/scripts/backup-worker.test.mjs`: 6/6 (programación; límites/configuración; reintentos; errores; orden readback→restore→retención; contaminación del entorno de restore).
- `FS41_INTEGRATION=1`, PostgreSQL 18 local efímero + restic 0.19.1: 3 respaldos reales cifrados a repo temporal, 3 readback con SHA-256, 3 restores aislados, `restic check --read-data`, retención 3→2, clave equivocada rechazada; filas de ambos tenants fuente iguales antes/después. El destino local fue solo de prueba y NO prueba configuración externa en producción.
- Backend Vitest: 269 pasan, 3 skip; build y lint ejecutados. Lint informó advertencias existentes. Frontend build con `VITE_API_URL=/api`, 4/4 pruebas de polling/rol/desconexión. La suite frontend completa encontró tests de escáner con ruta absoluta `C:\C:\...` bajo Windows; se registra como limitación de entorno/rama, no como fallo de FS-41. No se validó navegador/producción/CI.
- Pendientes: alertas externas, destino/configuración de infraestructura, prueba restore de staging, monitor externo, resolver fallo de rutas test Win32 si se aborda por separado.
- Estado: código enviado en PR de FS-41 a `main`; sin merge/despliegue. Bitácora de pendientes del 2026-10-09 vive en la rama Claude `docs/bitacora-auditoria-admin-20261009`; no se modifica ese checkout para evitar conflicto. Este registro y este documento versionado en FS-41 describen el estado de esta entrega.

### Registro de continuidad 2026-10-09 — FS-41

- Rama `feat/fs-41-automatizacion-tecnica` desde `origin/main` `64291e76` (checkout aislado, cambios de otros agentes intactos).
- Auditoría y decisión técnica arriba; implementación worker con respaldo cifrado, recuperación aislada, retención/reintento/permisos/UI integrada.
- Pruebas y límites anotados arriba; ninguna conexión a la base de producción, ningún restore destructivo, sin despliegue ni merge.
- PR y commit se anotan una vez publicados.
