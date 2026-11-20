# Paquete de desbloqueo externo — Jowa System (2026-11-20)

> Procedimiento, no estado. El estado y la prioridad de cada bloqueo viven en [EVALUACION_PRODUCCION_20261116.md](EVALUACION_PRODUCCION_20261116.md) §3 (B-01…B-11) y en el contexto maestro; aquí solo se dice **qué hacer y qué evidencia entregar**. Ningún punto se da por cerrado sin esa evidencia. No autoriza despliegue, migración productiva ni uso de datos reales. Las capturas y salidas **no deben contener valores de secretos**: solo nombres de variables.

Orden recomendado: B-01, B-08, B-09 y B-10 (no dependen de código) → B-02 y B-03 → B-06 y B-07 → B-04 → decisiones (B-05, B-11).

## Render y Vercel (B-01, B-09, B-10)

| Paso | Evidencia requerida |
|---|---|
| Render, Start Command `npm run start:prod`; Pre-Deploy vacío; Auto-Deploy Off | Captura de la pantalla de ajustes |
| Render, Health Check Path `/api/health/live` (el liveness no consulta la base; la disponibilidad de la base se vigila con `/api/health`) | Captura + `curl -i https://<servicio>/api/health/live` → 200 y `/api/health` → 200 |
| Variables de Render y Vercel: lista de **nombres** y finalidad (tabla de abajo) | Lista de nombres presentes, sin valores |
| SHA desplegado = SHA aprobado | Captura del despliegue activo con el SHA; comparar con el candidato |
| Vercel: retirar vistas previas ya publicadas y confirmar que `VITE_API_URL` en el entorno Preview **no** apunta a la API de producción (o bloquear previews por defecto) | Captura del entorno Preview y de la lista de despliegues |

Variables a verificar (solo nombre → finalidad; los valores no se copian):

| Nombre | Finalidad |
|---|---|
| `DATABASE_URL`, `DIRECT_URL` | Conexión de la aplicación (pooler) y directa para migraciones/respaldo |
| `JWT_SECRET` | Firma de sesiones |
| `CONTINGENCIA_CLAVE_OPERACIONES` | Clave de derivación de la contingencia (solo si se activa; hoy apagada) |
| `AUTH_MAIL_GMAIL_USER`, `AUTH_MAIL_GMAIL_APP_PASSWORD`, `AUTH_PUBLIC_URL` | Correo de recuperación de cuenta y URL pública de los enlaces |
| `VITE_API_URL` | URL de la API que consume el frontend (por entorno) |
| `FERRE_MIGRAR_AL_ARRANCAR` | Debe estar **ausente**; migrar al arrancar es una decisión explícita (`migration-safe.mjs startup`) |
| `POS_OFFLINE_ENABLED` | Debe estar **ausente** o distinto de activo: la contingencia sigue en NO-GO |

La lista definitiva por entorno está en `PLAN_SALIDA_PRODUCCION_20261102.md` §2.4 y §2.6; si difiere de esta tabla, prevalece el plan y se corrige este documento.

## Protección de `main` (B-08)

En GitHub, regla de rama para `main`: PR obligatorio, checks requeridos `validate`, `test` y `guard-base-datos`, sin force push ni borrado. Evidencia: captura de la regla y un PR de prueba que no pueda fusionarse con un check rojo.

## Respaldo, restauración y RPO/RTO (B-02)

1. El dueño fija RPO y RTO por escrito (decisión 0.7 del plan).
2. Activar el respaldo independiente descrito en [FS-41-RESPALDOS.md](FS-41-RESPALDOS.md), con destino fuera del proveedor de la base.
3. Respaldo previo y verificación. Desde la raíz del repositorio; la URL es la conexión **directa** (no el pooler) y se pasa por entorno, nunca por argumentos. El directorio de destino debe estar fuera del repositorio y vacío (se crea con permisos 0700):
   ```
   FERRE_ORIGEN_URL='postgresql://USUARIO:CLAVE@HOST:5432/BASE' bash backend/scripts/respaldo-previo-migracion.sh /ruta/privada/respaldo-AAAAMMDD-HHMM
   bash backend/scripts/verificar-respaldo.sh /ruta/privada/respaldo-AAAAMMDD-HHMM
   ```
   La segunda orden restaura en un PostgreSQL local temporal y deja `manifest.json.verificado` con `restoreTested=true`; requiere PostgreSQL 16 local.
4. Restauración **cronometrada** en otra base desechable y vacía (nunca la de origen). El volcado trae `CREATE SCHEMA public`, así que la base destino debe **no tener** el esquema `public`; sobre esa base destino, y solo sobre ella:
   ```
   psql 'postgresql://USUARIO:CLAVE@HOST:5432/DESTINO' -c 'DROP SCHEMA public CASCADE'
   time FERRE_RESTORE_DATABASE_URL='postgresql://USUARIO:CLAVE@HOST:5432/DESTINO' npm --prefix backend run backup:verify-restore -- /ruta/absoluta/respaldo-AAAAMMDD-HHMM/manifest.json
   ```
   Use ruta **absoluta** al manifiesto: `npm --prefix backend` ejecuta con `backend/` como directorio actual. Sin `DROP SCHEMA public` sobre una base recién creada la restauración falla con `schema "public" already exists`. Éxito: «Restauración comprobada en base aislada; manifiesto actualizado» y `manifest.json` con `restoreTested=true` (el script lo modifica en su sitio). Evidencia: tiempo medido, conteos del `manifest.json` iguales tras restaurar y comparación con RPO/RTO.

## Preproducción y ensayo de migraciones (B-03)

1. Crear una base de preproducción con volumen representativo (copia anonimizada o sintética de tamaño comparable; no datos reales sin decisión 0.7).
2. Estado de la base antes de migrar (solo lectura; `DIRECT_URL` exportada con la conexión directa a la preproducción):
   ```
   psql "$DIRECT_URL" -X -f backend/scripts/estado-base-solo-lectura.sql > estado.txt
   grep -cE '^ +[0-9]{14}_[a-z0-9_]+ +\| +(APLICADA_CHECKSUM_DISTINTO|DESCONOCIDA_EN_BASE)' estado.txt
   ```
   El `grep` debe imprimir `0` y la sección 2 del archivo debe mostrar `incompletas_requieren_atencion = 0` y `revertidas = 0`. No busque las palabras sueltas: la leyenda del propio archivo las contiene. `PENDIENTE` es normal antes de migrar.
3. Con `DIRECT_URL` exportada: `npm --prefix backend run migrate:inspect` (estado esperado `VACIA` o `LISTA`) y, solo si es correcto, `npm --prefix backend run migrate:deploy` **una vez**; el resultado debe terminar en `"state": "LISTA"` y `"errors": []`. Repita el paso 2 después.
4. Humo de API con escritura, **solo contra preproducción**. Crea un producto, abre y cierra una caja, vende y entrega, y consulta la auditoría. Desde la raíz del repositorio, con las credenciales tomadas del gestor de secretos (nunca en el repositorio ni en el historial del shell):
   ```
   API_URL=https://PREPRODUCCION/api \
   ADMIN_EMAIL=… ADMIN_PASSWORD=… \
   CAJERO_EMAIL=… CAJERO_PASSWORD=… \
   SUPERADMIN_EMAIL=… SUPERADMIN_PASSWORD=… \
   CONFIRMO_ENTORNO_NO_PRODUCTIVO=SI \
   node backend/scripts/humo-preproduccion.mjs --escribe
   ```
   Hacen falta tres cuentas: administrador, cajero (con `pos.vender`) y Super Admin (la auditoría es exclusiva de este rol). Sin `CONFIRMO_ENTORNO_NO_PRODUCTIVO=SI`, el modo `--escribe` contra un servidor remoto se rechaza con código 2; contra `127.0.0.1` o `localhost` no se exige. Con solo `API_URL`, `ADMIN_EMAIL` y `ADMIN_PASSWORD` y sin `--escribe` el humo es de solo lectura (apto para producción). Código de salida 1 si algún paso falla.
5. Evidencia: `estado.txt` antes y después, salida del humo (`N PASS / 0 FAIL`), conteos sin pérdida de filas, y plan de reversión (restaurar el respaldo del paso previo).

Referencia local ya existente (bases temporales): `backend/scripts/ensayo-actualizacion-preproduccion.sh` y `simulacro-recuperacion.sh`; ver la bitácora del contexto maestro para el resultado sobre el candidato actual. No sustituyen la preproducción real.

## Correo real, monitoreo y alertas (B-06, B-07)

- Correo: con cuenta Gmail dedicada y contraseña de aplicación, desde el gestor de secretos de **staging**: `SMTP_STAGING_DESTINO=<buzón controlado> SMTP_STAGING_CONFIRMAR=ENVIAR node backend/scripts/smtp-staging-check.mjs`. Sin `ENVIAR` solo valida la configuración. Evidencia: mensaje recibido y texto/enlace correctos.
- Monitoreo: monitor externo sobre `/api/health/live` (proceso) y `/api/health` (base) con alerta a una persona identificada y prueba de alerta provocada. Evidencia: captura de la regla y de una alerta recibida.

## Equipos, red y apagones (B-04)

Ejecutar [CHECKLIST_FISICO_Y_ACEPTACION_20261030.md](CHECKLIST_FISICO_Y_ACEPTACION_20261030.md) y [CHECKLIST_EQUIPOS_REALES.md](CHECKLIST_EQUIPOS_REALES.md) en los equipos de la tienda: impresora, lector, cajón, navegador/dispositivo, red y corte de energía/internet (la tienda sin conexión **no** vende: la contingencia sigue apagada). Evidencia: A2, C1 y D1 aprobados, fotografías o registros y firmas F1–F8.

## Capacitación y aceptación del cliente

Capacitación por rol (cajero, administrador) con el guion del checklist; aceptación firmada por el cliente tras la ejecución en sitio. La aprobación técnica de Codex no sustituye esta aceptación ni la autorización de despliegue.

## Decisiones pendientes (B-05, B-11, A-03, A-04, A-06)

| Decisión | Quién | Qué se necesita |
|---|---|---|
| Alcance de la primera salida, título del comprobante, RPO/RTO y datos reales (0.1, 0.5, 0.7 del plan) | Dueño | Respuesta escrita en #245 o en el plan |
| Precios libres en cotizaciones (A-03): límite, autorización o permitirlo | Dueño | Regla; hoy la conversión a venta los rechaza (409) |
| ISV de compras (A-04): tasa y tratamiento | Contador | Regla; hasta entonces compras es solo registro de costo |
| Observaciones operativas de caja (A-06): conteo por `POST conteos`, venta mientras espera cierre, mensaje de efectivo insuficiente, listado de 100 cierres | Dueño | Decisión por cada una |
| Nota de crédito de devoluciones, garantía, merma y reembolsos (B-11) | Contador | Respuesta escrita |

## Contingencia offline

Sigue en **NO-GO** propio hasta satisfacer sus criterios (aislamiento por empresa, validación en equipos, decisión del dueño). La primera salida es solo en línea. Este paquete no la activa.

## Verificación de estas instrucciones

Los comandos de B-02 y B-03 se ejecutaron tal como están escritos el 2026-11-20 en un PostgreSQL 16 temporal con datos sintéticos (una empresa, tres usuarios sintéticos y las 36 migraciones del candidato), contra el backend compilado en `127.0.0.1`: `migrate:inspect` (`VACIA`) y `migrate:deploy` (`LISTA`, sin errores); `estado-base-solo-lectura.sql` (36 `APLICADA_OK`, el `grep` imprime `0`); respaldo previo y verificación (77 tablas con conteos idénticos); restauración con `FERRE_RESTORE_DATABASE_URL` y ruta absoluta (tras `DROP SCHEMA public CASCADE` en el destino; sin esa precondición falla, comprobado); humo de solo lectura 7/7; humo con escritura contra un host tratado como remoto (`127.0.0.2`): rechazado con código 2 sin `CONFIRMO_ENTORNO_NO_PRODUCTIVO=SI` y 23/23 con todas las variables. Esto prueba los comandos, no la infraestructura real: Render, Supabase y los tiempos reales de restauración siguen pendientes.
