# Autenticación consolidada (#200 + #201) — diseño vigente

**Firma de esquema y persistencia:** NEXUS · **Fecha:** 2026-10-26 UTC · **Rama:** `claude/consolidate-auth-pr200-201-xz1q5m` (base `main` `2f6168d`, parte de #201 `3b347ec`).
Sin merge, sin despliegue y sin acceso a producción. #200 y #201 quedan abiertos como referencia. #180 y #202 no se modificaron.

Sustituye al diseño de #201 (`LOGIN_UNICO_RECUPERACION_20261026.md`, retirado de esta rama porque describía el MFA del Super Admin como eliminado) y actualiza [AUTH_RECOVERY_SECURITY.md](AUTH_RECOVERY_SECURITY.md) (MFA, cifrado TOTP y enrolamiento siguen vigentes).

## 1. Política consolidada

| Tema | Comportamiento | Código |
|---|---|---|
| Pantalla de acceso | Solo «Usuario» (usuario, código o correo) y «Contraseña». Sin selector de empresa, idioma, rol ni casilla de Super Admin. | `frontend/src/pages/LoginPage.tsx` |
| Empresa y rol | Se resuelven por el identificador **antes** de comprobar ninguna contraseña. Un identificador que coincide con más de una cuenta no se resuelve y responde igual que uno inexistente. Un enlace privado `?empresa=` (no visible) acota la búsqueda para cuentas heredadas duplicadas. | `backend/src/auth/identidad-login.ts` |
| MFA del Super Admin | **Obligatorio** en login, en la recuperación, en `refresh` y en cada petición (`mfa: true` + secreto configurado). El campo del código aparece solo después de la contraseña correcta (`MFA_REQUERIDO`). Sin MFA configurado: `MFA_ENROLAMIENTO_REQUERIDO` y enrolamiento inicial por correo. Las cuentas de negocio que configuraron MFA también lo usan. | `auth.service.ts` (`exigirSegundoFactor`), `jwt.strategy.ts`, `super-admin.service.ts` |
| Límites temporales | Por identificador (5 fallos → 15 min) y por IP (100), iguales exista o no la cuenta. Durante la pausa del identificador solo entra una contraseña temporal vigente; cualquier otro intento responde 429 y cuenta para la IP. | `login-rate-limit.ts`, `auth.service.ts` (`login`) |
| Bloqueo permanente | Cuentas operativas (todo rol distinto de ADMIN: Cajero, Vendedor, Bodeguero, Contador de #180…) se bloquean en el **sexto** fallo consecutivo con una sola sentencia SQL atómica. El bloqueo revoca sesiones y anula enlaces pendientes. Una cuenta bloqueada no prueba la contraseña: la respuesta es el mismo 401 genérico (sin oráculo ni enumeración). Admin y Super Admin no se bloquean de forma permanente. | `bloqueo-cuenta.ts` |
| Reactivación | `POST /auth/security/unlock`: Admin solo sobre cuentas operativas de **su** empresa; Super Admin en cualquier empresa. No cambia contraseñas ni reactiva cuentas desactivadas. Auditado en `auth_events` (`ACCOUNT_UNLOCKED`) y en `auditoria_operaciones` (`USUARIO_DESBLOQUEAR`). `GET /auth/security/locked`: Admin ve su empresa, Super Admin todas. | `recovery.service.ts` (`unlock`, `locked`) |
| Recuperación Admin/Super Admin | Tras 3 fallos consecutivos y con correo verificado: contraseña temporal aleatoria (≈92 bits, `XXXX-XXXX-XXXX-XXXX`), un uso, 10 min, guardada solo como SHA-256 en `auth_actions` y ligada a cuenta, correo y contraseña vigente. Respuesta idéntica y de 8,5 s para cualquier identificador. El Super Admin debe aportar además su segundo factor; la temporal se consume solo después. Usarla revoca las sesiones previas (y el soporte remoto del Super Admin) y entrega un token de **cambio obligatorio** sin sesión ni cookie. | `recovery.service.ts` (`request`, `forcedChange`), `contrasena-temporal.ts` |
| Roles operativos | Sin recuperación pública. Admin de la empresa (o Super Admin) emite un enlace privado de un uso (10 min); el titular define su contraseña (cambio obligatorio inherente), lo que también levanta el bloqueo. Un Admin solo restablece a otro Admin si él mismo tiene MFA. | `adminReset`, `reset` |
| Cambio propio | Cualquier usuario con su contraseña actual (y su segundo factor si lo tiene; el Super Admin siempre). Revoca todas las sesiones. | `change` |
| Auditoría | `ACCOUNT_LOCKED`, `ACCOUNT_UNLOCKED`, `TEMP_PASSWORD_ISSUED`, `TEMP_PASSWORD_USED`, `PASSWORD_FORCED_CHANGE`, `PASSWORD_CHANGE`, `RESET_ADMIN`, `ADMIN_RESET_REQUEST`, `MFA_*`. Nunca contraseñas, temporales ni tokens (comprobado en la matriz PostgreSQL). | `auth-actions.ts` |
| Unicidad de identificadores | Altas y ediciones de usuarios, administradores y negocios rechazan (409, sin decir dónde) un usuario/correo usado en cualquier empresa o por un Super Admin, serializando por identificador con un bloqueo consultivo. | `exigirIdentificadorUnico` |

## 2. Comparación #200 frente a #201 y elección

| Aspecto | #200 | #201 | Consolidado (evidencia) |
|---|---|---|---|
| MFA del Super Admin | Retirado | Retirado | **Restaurado** (requisito). Ambos contradecían la instrucción. |
| Identificador duplicado | 401 con `IDENTIFICADOR_AMBIGUO` y mensaje propio | 401 genérico | **#201**: el código de #200 revela que el identificador existe en varias cuentas. |
| Correo de usuario igual al del Super Admin | `AMBIGUA` (el Super Admin no entra) | Precedencia del Super Admin | **#201**: un dato heredado de un negocio no puede dejar fuera a la plataforma. |
| Aviso de recuperación | El navegador cuenta 3 fallos | El servidor devuelve `recuperacionDisponible` | **#200**: el campo de #201 revela que la cuenta existe, es Admin/Super Admin, tiene correo verificado y ≥3 fallos. |
| Contador por cuenta | Transacción + bloqueo consultivo | Una sentencia `UPDATE … FOR UPDATE` | **#201** (más simple, probado con 12 y 20 intentos concurrentes en dos instancias) + efectos del bloqueo de **#200** (revocar sesiones, anular enlaces). |
| Respuesta de cuenta bloqueada | 401 `CUENTA_BLOQUEADA` solo con contraseña correcta | 403 `CUENTA_BLOQUEADA` siempre, sin probar contraseña | **Ninguno tal cual**: #200 es un oráculo para adivinar la contraseña de una cuenta bloqueada; #201 enumera cuentas bloqueadas. Consolidado: sin probar contraseña y con el 401 genérico; la pantalla orienta a pedir la reactivación al Admin. |
| Límite por identificador | Siempre (también empleados) | Omitido para empleados | **#200**: omitirlo creaba un oráculo (un empleado real nunca recibía 429; uno inexistente sí). Consecuencia documentada: el quinto fallo pausa 15 min y el sexto, tras la pausa, bloquea. |
| Temporal durante la pausa | No (podía vencer dentro de la pausa) | Sí (`soloTemporal`) | **#201**, contando además el intento para la IP. |
| Almacén de la temporal | `auth_actions` (SHA-256, ligada a contraseña y correo) | Tabla nueva `auth_temp_passwords` (bcrypt) | **#200**: sin tabla nueva y con invalidación por cambio de contraseña/correo. |
| Cambio obligatorio | Sesión restringida + guard global `CAMBIO_PASSWORD_OBLIGATORIO` | Token de un uso sin sesión (`forced-change`) | **#201**: no existe ningún access token ni cookie hasta definir la nueva contraseña. |
| Revocación al usar la temporal | Sí, al consumirla | Solo al cambiarla | **#200** (corta de inmediato una sesión robada) + **#201** al cambiarla. |
| Unicidad global | Bloqueo consultivo por identificador; usuarios, admins y alta de negocio | Sin bloqueo (carrera); solo usuarios | **#200**. |
| Desbloqueo | `/usuarios/:id/desbloquear` (también reactivaba cuentas desactivadas) y ruta de Super Admin | `/auth/security/unlock` único | **#201** + auditoría de negocio de #200; no toca `activo`. |
| Asignar contraseña por Super Admin | Sí (el Super Admin la conoce) | No | **Descartado**: el enlace privado existente cumple el requisito sin que nadie más conozca la contraseña. |
| Login `/admin/auth/login` | Lógica duplicada | Lógica duplicada | Delegado a `AuthService` (`soloPlataforma`): un solo flujo con MFA y límites. |
| Migración | 3 columnas `usuarios`, 2 `super_admins`, CHECK ≥ 0, 2 índices | 3 + 2 columnas, 2 índices, tabla nueva | Columnas de #201, CHECK de #200, sin tabla nueva, sin `debe_cambiar_password`. |

## 3. Vulnerabilidades detectadas y corregidas

1. **Retirada del MFA del Super Admin** (#200 y #201): una contraseña filtrada daba control de todas las empresas. Restaurado en login, recuperación, refresh y estrategia JWT.
2. **Enumeración por `recuperacionDisponible`** (#201): revelaba rol, correo verificado y fallos de una cuenta. Eliminado; el aviso se calcula en el navegador.
3. **Enumeración por `IDENTIFICADOR_AMBIGUO`** (#200). Eliminado.
4. **Oráculo de contraseña en cuentas bloqueadas** (#200) y **enumeración de bloqueadas** (#201, 403 sin contraseña). Corregido: respuesta genérica sin probar la contraseña.
5. **Oráculo por ausencia de límite por identificador para empleados** (#201). Corregido: límite uniforme.
6. **Carrera en la unicidad global** (#201): dos altas simultáneas en empresas distintas podían ganar ambas. Corregido con bloqueo consultivo; prueba de carrera en PostgreSQL.
7. **Desbloqueo que reactivaba cuentas desactivadas** (#200). Corregido.
8. **Temporal no ligada a la contraseña/correo vigentes** (#201). Corregido (`passwordBinding` y `email`).
9. **Sesiones vivas tras usar la temporal hasta completar el cambio** (#201). Corregido: se revocan al usarla.

Riesgos residuales aceptados (requisito o diseño previo): quien conozca el usuario de un empleado puede bloquearlo con seis intentos repartidos en el tiempo; una cuenta desactivada o una empresa suspendida siguen informando su estado solo con la contraseña correcta (comportamiento previo de `main`); enviar una contraseña por correo expone el buzón (mitigado con un uso, 10 min, hash, MFA del Super Admin y revocación).

## 4. Contrato de API

| Ruta | Cambio |
|---|---|
| `POST /auth/login` | Cuerpo `{ usuario, password, mfaCode?, tenantId? }` (`email` aceptado como alias). Respuestas: `tenant`, `super_admin` (`mfa: true`), `password_change_required` (`cambioToken`, 600 s), 401 `MFA_REQUERIDO`/`MFA_ENROLAMIENTO_REQUERIDO`, 401 genérico, 429. |
| `POST /admin/auth/login` | Mismo flujo restringido a Super Admin. |
| `POST /auth/security/request` | `{ usuario }` (alias `email`, `tenantId?` de enlace). Siempre 202 y 8,5 s. |
| `POST /auth/security/forced-change` | `{ token, password }`. |
| `POST /auth/security/unlock` · `GET /auth/security/locked` | Nuevos. |
| `POST /auth/security/reset` | Solo enlaces `RESET_ADMIN`; `RESET_EMAIL` heredados (10 min de vida) ya no se aceptan. |
| MFA (`mfa/bootstrap-request`, `mfa/bootstrap`, `mfa/enroll`, `mfa/confirm`) | Se conservan; `bootstrap-request` acepta `{ usuario, password }`. |

## 5. Base de datos (NEXUS)

**Migración única** `backend/prisma/migrations/20261026000000_auth_login_unico_bloqueo/migration.sql` (sustituye a `20261026000000_login_unico_bloqueo_recuperacion` de #201 y `20261026000000_auth_bloqueo_clave_temporal` de #200, ninguna publicada en `main`):

- `usuarios`: `intentos_fallidos INTEGER NOT NULL DEFAULT 0` (CHECK ≥ 0), `ultimo_fallo_at`, `bloqueado_at`.
- `super_admins`: `intentos_fallidos` (CHECK ≥ 0), `ultimo_fallo_at`.
- Índices **no únicos** `usuarios_email_idx`, `usuarios_username_idx`.
- Solo aditiva: no borra ni reescribe filas, hashes, sesiones ni secretos. El código anterior funciona con el esquema nuevo (columnas con valor por defecto). Catálogo SHA LF/CRLF actualizado en `scripts/estado-base-solo-lectura.sql`; `verificar-migraciones.mjs` correcto.

**Si una base de prueba ya aplicó la migración de #200 o #201** (nunca en producción): restaurar su respaldo o revertirla con el SQL inverso de esa rama antes de aplicar esta; ambas comparten la marca de tiempo y Prisma las vería como historial divergente.

### Detección de identificadores duplicados (antes de desplegar)

`backend/scripts/auth-identificadores-duplicados.sql` — solo lectura (`BEGIN READ ONLY … ROLLBACK`): usuarios/códigos y correos repetidos entre empresas, correos de usuario iguales al de un Super Admin, identificadores sin normalizar y resumen (incluye cuentas bloqueadas). Validado sobre PostgreSQL 16 efímero con datos sintéticos de cada caso.

### Procedimiento de corrección

1. Ejecutar el script con un rol de solo lectura; tratar la salida como dato personal.
2. Mientras se corrige, cada empresa puede entregar a sus usuarios afectados el enlace `https://<dominio>/login?empresa=<tenantId>`: el login acota la búsqueda a ese negocio sin mostrar ningún campo.
3. El Admin de cada empresa (o el Super Admin) cambia el usuario o el correo repetido desde Usuarios; la edición ya exige unicidad global. Comunicar el nuevo identificador al titular. Para un correo igual al de un Super Admin, cambiar el del usuario de negocio.
4. Repetir el script hasta que las consultas 1–3 devuelvan cero filas.
5. Solo entonces, en una migración posterior aprobada, crear índices únicos globales (fuera de transacción): `CREATE UNIQUE INDEX CONCURRENTLY usuarios_username_global_key ON usuarios (username) WHERE username IS NOT NULL;` y su equivalente para `email`. No se incluye en este PR porque fallaría con datos heredados duplicados.

### Reversión

- **Preferida: solo código.** El backend anterior funciona con las columnas nuevas (tienen valor por defecto e índices no únicos). No hace falta tocar la base. Se pierde el efecto del bloqueo (las columnas quedan sin uso), no datos.
- **Esquema (manual, con respaldo previo y aprobación):** validado en PostgreSQL 16 efímero: conserva identidades y hashes, `migrate deploy` la reaplica, deriva nula tras retirar la tabla de respaldo y el estado de bloqueo se restaura desde ella.

```sql
BEGIN;
CREATE TABLE IF NOT EXISTS respaldo_auth_bloqueos_20261026 AS
  SELECT id, tenant_id, intentos_fallidos, ultimo_fallo_at, bloqueado_at, now() AS respaldado_at FROM usuarios
  WHERE intentos_fallidos > 0 OR bloqueado_at IS NOT NULL;
DROP INDEX IF EXISTS usuarios_email_idx;
DROP INDEX IF EXISTS usuarios_username_idx;
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_intentos_fallidos_no_negativo,
  DROP COLUMN IF EXISTS intentos_fallidos, DROP COLUMN IF EXISTS ultimo_fallo_at, DROP COLUMN IF EXISTS bloqueado_at;
ALTER TABLE super_admins DROP CONSTRAINT IF EXISTS super_admins_intentos_fallidos_no_negativo,
  DROP COLUMN IF EXISTS intentos_fallidos, DROP COLUMN IF EXISTS ultimo_fallo_at;
DELETE FROM _prisma_migrations WHERE migration_name = '20261026000000_auth_login_unico_bloqueo';
COMMIT;
```

### Compatibilidad con #180

Verificado en PostgreSQL 16 efímero: sobre una base con esta migración, `migrate deploy` aplica después `20261022000100_rol_contador` y `20261022000200_contabilidad_honduras` de #180; desde cero se aplican las 32 migraciones juntas. El SQL de bloqueo usa `rol::text <> 'ADMIN'`, así que CONTADOR se bloquea en el sexto fallo (probado con una fila CONTADOR real). `config-auth.ts` de #180 exige `AUTH_MFA_ENCRYPTION_KEY` en producción, coherente con mantener el MFA del Super Admin. Conflictos textuales previsibles al integrar #180 después: ver la descripción del PR.

## 6. Configuración antes de producción

`AUTH_MFA_ENCRYPTION_KEY` (64 hex, respaldada), `AUTH_MAIL_RESEND_API_KEY`, `AUTH_MAIL_FROM` y `AUTH_PUBLIC_URL` (HTTPS); enrolar el MFA del Super Admin propietario (sin él no entra); los Admin deben verificar su correo para poder recuperar; ejecutar el script de duplicados. No se envió ningún correo real.

## 7. Pruebas

Código `5443672`, PostgreSQL 16 efímero y Chromium 1243: backend 621/621, integración completa 65 archivos 1141/0/1, frontend 542/542, Playwright 390/0/26 + móvil 16/16 y 48/48, piloto real 171/0/4. Detalle, primeras pasadas fallidas y limitaciones: ver la descripción del PR y la bitácora de `CONTEXTO_MAESTRO.md`. Matriz principal: `backend/test/auth-recovery.postgres.integration.ts`; unitarias: `backend/src/auth/login-unico.spec.ts`; navegador: `frontend/e2e/auth-security.spec.ts`.
