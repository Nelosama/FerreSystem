# Auditoría de infraestructura, respaldos, migraciones y SMTP — 2026-10-30

> Revisión de **lo que el repositorio puede demostrar** más las comprobaciones locales en entorno aislado. No hubo acceso a los paneles de Render, Vercel ni Supabase, ni a bases productivas. Cada punto que dependa de un panel figura como **NO VERIFICADO** con el dato que hay que mirar. Nada de esta auditoría se ejecutó contra servicios reales ni envió correo.

Base: `origin/main` `a4ab291aba1a8574e9c66d59b044e35f938bda38`.

## Resumen

| Área | Estado | Qué falta para autorizar el piloto |
|---|---|---|
| Render (backend) | **NO VERIFICADO** en panel; configuración documentada y arranque protegido en código | Confirmar Start Command, health check, variables y que no hay Pre-Deploy |
| Vercel (frontend) | Configuración del repositorio **verificada** (38/38 pruebas de cabeceras y guardia); variables de Preview/Production **NO VERIFICADO** | Confirmar `VITE_API_URL` y la rama de producción en el panel |
| Supabase (PostgreSQL) | Migraciones y control de deriva **verificados** en PostgreSQL temporal; base real **NO VERIFICADO** | Planes de respaldo de Supabase, copia de seguridad previa a migrar |
| Respaldos | Herramienta **verificada** en aislado (restic, cifrado, restauración, snapshot concurrente); destino productivo **NO CONFIGURADO** según la documentación | Destino independiente, frecuencia, cifrado y restauración probada en un entorno real |
| Migraciones | Historial y deriva **verificados**; migración `20261029000000_desglose_fiscal_linea` **pendiente de ensayo en preproducción con volumen** | Ensayo en copia de preproducción |
| SMTP (recuperación) | Configuración validada en código; **envío real NO VERIFICADO** (requiere autorización explícita) | Un envío de prueba a un buzón controlado, autorizado por el dueño |

## 1. Render (backend NestJS)

- **Arranque en el repositorio** — verificado en `backend/package.json:14-15`: `start:prod = node scripts/migration-safe.mjs startup && node dist/main`; `migrate:deploy = node scripts/migration-safe.mjs deploy`. El arranque **verifica** el historial y no migra; si la base no coincide, no arranca. Pruebas: `backend/test/migraciones-control-arranque.postgres.integration.ts` 16/16 (integración de esta auditoría).
- **Health check** — la documentación indica `Health Check Path = /api/health` (responde 503 si la base no conecta). Rutas en `backend/src/common/health.controller.ts`: `/api/health` (con base) y `/api/health/live` (liveness, sin base, #216). Verificado en código; **el valor configurado en Render NO VERIFICADO**.
- **Pre-Deploy Command** — debe estar vacío; si existiera un `migrate deploy` ahí, se ejecutaría antes del arranque sin la verificación. **NO VERIFICADO** en panel.
- **Start Command real** — si el servicio arrancó con una versión anterior del `start:prod`, ese comando sí migraba solo. **Debe confirmarse en el panel.**
- **Variables** — nombres requeridos por el código: `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `NODE_ENV=production`, `FRONTEND_URLS`, `TRUST_PROXY`, `CONTINGENCIA_CLAVE_OPERACIONES`, `POS_OFFLINE_ENABLED`, y para recuperación `AUTH_MAIL_GMAIL_USER` y `AUTH_MAIL_GMAIL_APP_PASSWORD` (`.env.example`). **Solo se verifican los nombres en el panel; no se leen valores.**
- **Decisión operativa pendiente** — `OPENAI_API_KEY` opcional (#215, sin uso funcional): no cargarla hasta decidir su uso.

## 2. Vercel (frontend)

- **Configuración del repositorio** — `frontend/vercel.json` verificado: `buildCommand: npm run build`, `outputDirectory: dist`, reescritura SPA a `index.html`, cabeceras (`nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` con cámara solo `self`, HSTS y CSP con `script-src 'self' 'wasm-unsafe-eval'`), `ignoreCommand: sh scripts/vercel-ignore.sh`, y una lista `deploymentEnabled` que desactiva despliegues de ramas de auditoría.
- **Pruebas** — `frontend/test/vercel-security-headers.test.mjs` y `frontend/test/vercel-pilot-guard.test.mjs`: **38/38 aprobadas** en esta revisión (`node --test`).
- **Variable crítica** — `VITE_API_URL` debe apuntar a la API de Render con `/api` en producción. El build de CI usa `https://api.example.test/api` (solo ficticio). **Verificar el valor en Production y Preview en el panel.** Si falta, el frontend no puede hablar con la API.
- **Rama de producción** — confirmar en el panel qué rama despliega a producción y que coincide con la que se autorizará. **NO VERIFICADO.**
- **Política de no despliegue durante la auditoría** — esta auditoría no despliega ni cambia Vercel.

## 3. Supabase / PostgreSQL

- **Migraciones** — `node backend/scripts/verificar-migraciones.mjs --base origin/main`: correcto, 43 archivos ejecutables, 0 migraciones nuevas frente a `main`. `prisma validate` y `generate` correctos (CI).
- **Deriva de esquema** — `backend/test/esquema-deriva.postgres.integration.ts` 3/3 y el comando `prisma migrate diff --exit-code` del piloto real: **sin deriva** (`frontend/e2e-real/run.sh`, paso 3).
- **Historial aplicado en la base real** — **NO VERIFICADO.** Se puede leer con `migration-safe.mjs inspect`, que abre una transacción `READ ONLY` (`backend/scripts/migration-safe.mjs:31-34`). **No se ejecutó:** la auditoría no accede a producción.
- **Ensayo de actualización y reversión** — `backend/scripts/ensayo-actualizacion-preproduccion.sh`: **25 PASS, 0 FAIL** en copias aisladas, incluido «el código nuevo NO arranca sobre el esquema viejo restaurado» (faltan 20 migraciones) y «la base restaurada es idéntica a la de antes de migrar».
- **Migración pendiente** — `20261029000000_desglose_fiscal_linea` es aditiva (columnas nulas y CHECK `NOT VALID` + `VALIDATE`), sin relleno de históricos (`backend/prisma/migrations/20261029000000_desglose_fiscal_linea/migration.sql`). Su ensayo aislado está en `docs/ENSAYO_MIGRACION_DESGLOSE_20261029.md`. **Falta el ensayo con volumen representativo en preproducción** (ver §6).
- **Planes de Supabase** — copia de seguridad diaria/PITR, retención y ubicación: **NO VERIFICADO.**

## 4. Respaldos

- **Herramienta** — scripts `backend/scripts/backup-worker.mjs`, `backup-scheduler.mjs`, `backup-consistent.mjs`, `restore-verify.mjs`, `backup-verify-isolated.mjs`.
- **Verificado en aislado (esta revisión, como usuario `nobody`):** `FS41_INTEGRATION=1 node scripts/backup-worker.integration.mjs` → **PASS**: 4 respaldos y restauraciones cifrados con restic, 2 fallos de restauración deliberados detectados, retención que conserva 2 copias verificadas, rechazo de clave incorrecta, filas de origen sin cambios, y snapshot concurrente (3 ventas en origen, 2 en el volcado, según manifiesto).
- **Simulacro de reinicio y restauración** — `bash backend/scripts/simulacro-recuperacion.sh`: **14 PASS, FALLOS=0** (datos intactos tras reiniciar, `pg_dump`/`pg_restore` idénticos al origen, `migrate-safe deploy` sobre la copia, inicio de sesión del administrador).
- **Destino productivo — NO CONFIGURADO según la documentación** (`docs/CONTEXTO_MAESTRO.md`, fotografía del 2026-10-29: «Destino remoto del respaldo FS-41 sin configurar: no declarar respaldo de producción activo»). **No declarar respaldo activo.**
- **RPO / RTO** — no fijados por el dueño. **Pendiente.**
- **Restauración real** — los ensayos usan bases efímeras. Sin restauración probada en Supabase real. **NO VERIFICADO.**

## 5. SMTP de recuperación

- **Configuración en código** — `backend/src/auth/recovery-mail.service.ts`: `smtp.gmail.com:465`, TLS implícito, mínimo TLS 1.2, certificado verificado, sin proveedor alternativo. `backend/src/auth/config-auth.ts`: **el arranque falla si el correo no está completo y válido** (no se arranca con recuperación rota a ciegas).
- **Pruebas** — `backend/test/auth-recovery.postgres.integration.ts` 53/53 y `frontend/e2e-real/auth-recovery-real.spec.ts` 2/2 (CONTADOR, enlace de un solo uso, 390 y 1440 px): el envío se **simula** en las pruebas.
- **Comprobación sin envío** — `node backend/scripts/smtp-staging-check.mjs` sin `SMTP_STAGING_CONFIRMAR=ENVIAR`: modo simulación; con la configuración de esta sesión devuelve `Configuración inválida: Correo de seguridad no configurado` (esperado: no hay credenciales en el entorno). **No se configuró ni se envió correo.**
- **Envío real** — requiere `SMTP_STAGING_CONFIRMAR=ENVIAR` y `SMTP_STAGING_DESTINO` apuntando a un buzón controlado. **No ejecutado:** enviar correo es una acción externa que necesita autorización explícita del dueño.
- **Cuenta Gmail dedicada** — la documentación pide una cuenta dedicada a Jowa System con verificación en dos pasos y contraseña de aplicación. **Confirmar en la cuenta.** NO VERIFICADO.

## 6. Pendientes que requieren persona con acceso

1. Render: Start Command, health check, Pre-Deploy vacío, nombres de variables, SHA desplegado.
2. Vercel: `VITE_API_URL` en Production y Preview, rama de producción.
3. Supabase: planes de respaldo, historial de migraciones real (solo lectura), PITR.
4. Destino de respaldo independiente, cifrado, frecuencia, y RPO/RTO aprobados por el dueño.
5. Ensayo de la migración `20261029000000_desglose_fiscal_linea` en copia de preproducción con volumen representativo y rollback.
6. Envío SMTP de prueba a un buzón controlado (autorización del dueño).

## 7. Lo que no se hizo en esta auditoría

No se desplegó nada, no se cambió ningún panel, no se leyeron valores de variables, no se accedió a Supabase productivo, no se envió correo, no se instalaron navegadores (WebKit requiere `playwright install`, prohibido en este entorno) y no se tocó la configuración de Render ni de Vercel.

## Historial

- 2026-10-30: auditoría desde `origin/main` `a4ab291`. Pruebas: Vercel 38/38; `migraciones-control-arranque` 16/16; `esquema-deriva` 3/3; `auth-recovery` 53/53; simulacro 14 PASS; ensayo de actualización 25 PASS; respaldo cifrado PASS; SMTP solo en modo simulación.
