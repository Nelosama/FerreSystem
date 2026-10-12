# Runbook: preproducción y producción (Render · Supabase · Vercel)

Fecha: 2026-10-12. Candidato: `95144a17` (+ rama `claude/preproduccion-entrega`). **Nada de lo que sigue se ha ejecutado contra servicios reales**: esta sesión no tiene acceso a Render, Supabase ni Vercel. Lo marcado «VERIFICADO» se probó en un PostgreSQL local aislado (`backend/scripts/ensayo-actualizacion-preproduccion.sh`, 24/24). **No escriba valores secretos en este documento, en GitHub, en tickets ni en el chat.**

## 0. Reglas
1. Primero **preproducción** (base, servicio y despliegue separados de producción), después producción.
2. **Ninguna migración se aplica sola.** `npm run start:prod` ya no migra: verifica y, si la base no coincide con el código, **no arranca** (Render normalmente conserva la versión anterior en servicio si el despliegue nuevo no llega a estar sano; compruébelo en preproducción). La migración es un paso humano: `npm run migrate:deploy`.
3. Antes de migrar: **respaldo verificado** + `estado-base-solo-lectura.sql` sin sorpresas + aprobación del propietario.
4. Despliegue de producción **fuera del horario de ventas**, con la caja del día cerrada.

## 1. Variables de entorno

Origen: lectura del código (`process.env` / `ConfigService`), no de documentación. «Obligatoria» = el backend no arranca o es inseguro sin ella.

### Render (servicio del backend)
| Variable | ¿Obligatoria? | Valor / regla |
|---|---|---|
| `NODE_ENV` | **Sí** | `production`. **Sin esto `JWT_SECRET` cae en un valor de desarrollo PÚBLICO** (`jwt-secret.ts`) y las cookies no son `Secure`. Verifíquelo antes de todo |
| `DATABASE_URL` | **Sí** | Conexión de la aplicación (puede ser el pooler de Supabase) |
| `DIRECT_URL` | **Sí** | Conexión **directa** (o *session pooler*, puerto 5432) para Prisma y para `migration-safe`; **no** el pooler en modo transacción |
| `JWT_SECRET` | **Sí** | Aleatorio, largo (≥ 48 caracteres recomendado); único por entorno |
| `CONTINGENCIA_CLAVE_OPERACIONES` | **Sí, siempre** | ≥ 32 caracteres aleatorios, **distinta de `JWT_SECRET`** y de la de cualquier otro entorno. Sin ella el backend sale con código 1 y el mensaje `[ARRANQUE] CONTINGENCIA_CLAVE_OPERACIONES es obligatoria…` (sin mostrar valores). Detalle: `docs/CONTINGENCIA_CLAVE_OPERACIONES.md` |
| `FRONTEND_URLS` | **Sí** | Orígenes exactos del frontend, separados por comas, **sin ruta, comodín ni barra final** (p. ej. el dominio de producción de Vercel). Si falta, el navegador será bloqueado por CORS |
| `TRUST_PROXY` | **Sí en Render** | `1` (un proxy delante). Sin él, el límite de intentos de inicio de sesión ve la IP del proxy de Render y no la del cliente |
| `PORT` | No | Render lo inyecta |
| `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` | No | Por defecto `15m` y `7d` |
| `POS_OFFLINE_ENABLED` | **NO definir** | La contingencia permanece **desactivada** hasta autorización expresa. Con la variable ausente toda ruta de contingencia responde que no está habilitada |
| `FERRE_MIGRAR_AL_ARRANCAR` | **NO definir** | Solo para instalaciones locales. En Render debe estar ausente |
| `AUTH_*` | No | Límites de inicio de sesión; los defaults sirven. **No** active `AUTH_ACEPTAR_TOKENS_SIN_SESION` |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | **No hacen falta** | El código actual **no las lee** y no usa el SDK de Supabase; solo usa Supabase como PostgreSQL. Si existen en Render, retirarlas reduce la superficie de riesgo |

### Vercel (frontend)
| Variable | Valor |
|---|---|
| `VITE_API_URL` | `https://<servicio>.onrender.com/api` (con `/api`). **Preview** debe apuntar a la API de **preproducción**, nunca a la de producción |

Proyecto: *Root Directory* `frontend`; `installCommand` `npm ci`; `buildCommand` `npm run build`; salida `dist` (ya en `frontend/vercel.json`, con reescritura a `index.html`).

### Supabase
No se necesitan claves de aplicación (`anon`/`service_role`) para este backend. Solo: la cadena de conexión directa y la del pooler, y los respaldos (sección 4).

## 2. Render: configuración exacta (a verificar en el panel)

| Campo | Valor |
|---|---|
| Root Directory | `backend` |
| Build Command | `npm ci --include=dev && node node_modules/prisma/build/index.js generate && npm run build` |
| **Start Command** | `npm run start:prod` (verifica y arranca; no migra) — **o** `node dist/main.js` (como dice el README: no verifica). Recomendado el primero |
| **Pre-Deploy Command** | **Vacío.** No ponga migraciones ahí (`docs/CENTINELA_CONTROLES_BASE_DE_DATOS_20261010.md`) |
| Health Check Path | `/api/health` (responde 503 si la base no conecta) |
| Auto-Deploy | Recomendado **desactivado** en producción: despliegue manual tras aprobación |

**Qué debe comprobar hoy en el panel** (yo no puedo): (1) cuál es el Start Command real; si es `npm run start:prod` **de una versión anterior al cambio de esta rama**, ese arranque sí migraba solo; (2) que no hay Pre-Deploy Command; (3) que `NODE_ENV=production`; (4) qué variables existen (nombres, no valores).

## 3. Procedimiento paso a paso

### A. Preproducción (obligatoria antes de producción)
1. Cree un proyecto Supabase **separado** y un servicio Render y un despliegue Vercel de preproducción, con sus propias variables (claves **distintas** a producción).
2. Cargue una copia de producción **solo si usted lo autoriza** (datos del cliente) o use datos de prueba. Para la copia: sección 4.
3. En la base de preproducción: `psql "$DIRECT_URL" -X -f backend/scripts/estado-base-solo-lectura.sql > estado.txt` y revise `estado.txt` (migraciones `PENDIENTE`, `APLICADA_CHECKSUM_DISTINTO`, la sección 5 en 0).
4. `cd backend && DIRECT_URL=… npm run migrate:deploy` (desde una máquina de confianza o un *Shell* de Render, **una sola vez**).
5. Despliegue el backend; compruebe en el registro `Nest application successfully started`.
6. `API_URL=https://<preprod>/api ADMIN_EMAIL=… ADMIN_PASSWORD=… CAJERO_EMAIL=… CAJERO_PASSWORD=… CONFIRMO_ENTORNO_NO_PRODUCTIVO=SI node backend/scripts/humo-preproduccion.mjs --escribe` → 20 de 20 PASS (inicio de sesión, productos, venta de contado, idempotencia, entrega, cierre de caja, historial, auditoría, renovación de sesión).
7. Reinicie el servicio desde Render y repita el humo **sin** `--escribe`: debe seguir todo y no deben aparecer migraciones.
8. Recorra el checklist de equipos reales (`docs/CHECKLIST_EQUIPOS_REALES.md`) con la preproducción.

### B. Producción (solo con su autorización expresa de merge y ventana)
1. **Respaldo** (sección 4) y **verificación con ensayo de migración sobre la copia**: si falla, **no se migra**.
2. `estado-base-solo-lectura.sql` sobre producción (solo lectura; usted lo ejecuta o lo autoriza). Debe mostrar: sin `INCOMPLETA`/`CHECKSUM_DISTINTO`/`DESCONOCIDA_EN_BASE`, la sección 5 en 0, y en 6/7 lo esperado.
3. Defina en Render las variables nuevas (`CONTINGENCIA_CLAVE_OPERACIONES`; revise `NODE_ENV`, `TRUST_PROXY`, `FRONTEND_URLS`). Guardar variables reinicia el servicio: con el código anterior no pasa nada; con el nuevo y migraciones pendientes **no arranca** (es lo esperado).
4. Con la caja del día cerrada: `DIRECT_URL=<producción> npm run migrate:deploy`.
5. Despliegue el backend (manual) y vigile el registro. Despliegue el frontend.
6. Humo **de solo lectura** en producción: `API_URL=… ADMIN_EMAIL=… ADMIN_PASSWORD=… node backend/scripts/humo-preproduccion.mjs` (9 comprobaciones; no escribe). Una venta real de prueba solo si usted la autoriza.
7. Entregue al cliente con la contingencia **apagada**.

## 4. Respaldo, verificación, restauración y reversión (VERIFICADO en aislado)

```sh
# 1) Respaldo (SOLO LEE la base de origen). Destino fuera del repositorio, vacío, permisos 0700.
FERRE_ORIGEN_URL='<conexión directa>' bash backend/scripts/respaldo-previo-migracion.sh /ruta/privada/respaldo-AAAAMMDD-HHMM
# 2) Verificación: restaura en un PostgreSQL TEMPORAL y AISLADO, compara los conteos de TODAS las tablas con el origen,
#    y con --ensayo-migracion aplica las migraciones pendientes SOLO a la copia, comprueba que no se pierde ninguna fila,
#    que las reservas cuadran y que el backend compilado arranca con ella.
bash backend/scripts/verificar-respaldo.sh /ruta/privada/respaldo-AAAAMMDD-HHMM --ensayo-migracion
```
Resultado: `verificacion.txt`, `estado-restaurada.txt` y `manifest.json.verificado` (`restoreTested=true`). **Si dice NO VERIFICADO, no migre el origen.**

- **Supabase:** los respaldos propios de Supabase dependen del plan (los diarios y el *point-in-time recovery* son de planes de pago; confírmelo en *Database → Backups*). Aunque estén activos, haga **siempre** la copia manual anterior inmediatamente antes de migrar. El respaldo guarda el esquema `public`, que es donde vive todo el sistema.
- **Restaurar en una base nueva** (reversión de datos): cree una base vacía, ejecute `psql -c 'DROP SCHEMA public CASCADE'` **en esa base nueva** (el volcado trae `CREATE SCHEMA public`) y luego `pg_restore -d <nueva> --no-owner --no-privileges --exit-on-error database.dump`. Apunte `DATABASE_URL`/`DIRECT_URL` del servicio a la base restaurada.
- **`git revert` no revierte una migración**: el esquema y los datos ya cambiaron. La reversión real es **restaurar la copia previa**; se pierde toda venta posterior a la copia (por eso el despliegue va con la caja cerrada y el respaldo inmediato).
- **Código anterior contra la base ya migrada: NO verificado.** No dé por sentado que se puede volver al código viejo sin restaurar. Mientras tanto, el código nuevo **no arranca** contra la base vieja (probado: «faltan 11 migraciones»), lo que evita mezclar versiones por accidente.
- **Si una migración falla a medias:** `migration-safe` bloquea el arranque (`MIGRACION_INCOMPLETA`). No improvise: restaure el respaldo o aplique la recuperación documentada en `docs/MIGRACIONES_20261011150000_Y_20261017000000.md`.

## 5. Qué se verificó y qué no

| Verificado en aislado (ensayo 24/24) | NO verificado (requiere acceso o equipos reales) |
|---|---|
| Migrar `main` (13) → candidato (24) con el comando de producción sin perder ventas; aprobación de precios heredados; reparto histórico de entregas | Panel de Render (Start Command real, variables, Pre-Deploy), conectividad Render→Supabase, IPv6/pooler |
| El arranque NO migra y se niega con pendientes; el código nuevo no arranca sobre el esquema viejo | Planes y respaldos de Supabase; restauración en Supabase real |
| Respaldo → verificación → restauración con datos idénticos → arranque sobre la restaurada | Despliegue y variables de Vercel; el dominio real y CORS |
| Humo de API con escritura (20/20) y de solo lectura (9/9); reinicio con datos y sesión intactos | Safari/iPhone, impresora, lector de códigos, Wi-Fi local, corte de internet (ver checklist) |
| Entrega de la venta histórica pendiente; venta del producto heredado con precio; rechazo del producto heredado sin precio | Backend anterior contra la base ya migrada |

## 6. Autorizaciones que NO se dan por este documento
Merge a `main`, despliegue, migración productiva, lectura de la base productiva, cambio de variables en Render/Vercel/Supabase y habilitación de la contingencia requieren su orden expresa.
