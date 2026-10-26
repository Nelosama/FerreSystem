# Inicio de sesión de dos campos, recuperación y bloqueo — diseño vigente

**Firma:** NEXUS · **Fecha:** 2026-10-26 · **Rama:** `claude/sleepy-goldberg-rtd84q` (base `main` `2f6168d`) · Sin merge ni despliegue.

Sustituye, para el flujo de autenticación, a [AUTH_RECOVERY_SECURITY.md](AUTH_RECOVERY_SECURITY.md) (histórico: MFA y recuperación por enlace). No cambia reglas comerciales, contabilidad ni POS.

## 1. Qué cambia para el usuario

| Pantalla | Antes | Ahora |
|---|---|---|
| Login | Usuario/correo, contraseña, «Business identifier», casilla «Super Admin sign-in», código MFA, botón de idioma | **Solo «Usuario» y «Contraseña»**. Sin selector de idioma (se conserva el predeterminado), sin empresa, sin casilla de Super Admin, sin MFA, sin selector de rol |
| Recuperación | Siempre visible | **Oculta**. El servidor la ofrece (`recuperacionDisponible: true`) solo tras el 3.er fallo de una cuenta válida de Admin o Super Admin con correo verificado |
| Recuperación (efecto) | Enlace por correo + MFA | **Contraseña temporal aleatoria por correo**, un uso, 10 minutos, solo hash en base de datos. Al entrar con ella: **cambio de contraseña obligatorio** antes de cualquier acceso |
| Cajero, Vendedor, Bodeguero | Límite temporal de 15 min | **Bloqueo persistente en el 6.º intento fallido**; sin recuperación pública; mensaje «contacte al Admin o Super Admin» |

El selector de rol no existe: la empresa y el rol salen de la cuenta resuelta (`resolverCuenta`, `backend/src/auth/identidad-login.ts`). «Contador» no es un rol del sistema (los roles son `ADMIN`, `CAJERO`, `BODEGUERO`, `VENDEDOR`); cualquier rol distinto de `ADMIN` recibe el bloqueo en el 6.º fallo.

## 2. Identificadores repetidos entre empresas (verificación previa a quitar el campo «empresa»)

**Hallazgo.** El esquema solo garantizaba unicidad **por empresa**: `@@unique([tenantId, email])` y `@@unique([tenantId, username])`. Dos empresas pueden tener el mismo código (`44556`) o el mismo correo. Antes, el campo de empresa desambiguaba.

**Regla implementada** (`resolverCuenta`):
1. El identificador se normaliza (minúsculas, sin espacios). Con `@` es correo; sin `@`, usuario/código.
2. Un Super Admin se identifica solo por correo y tiene precedencia determinista (no se consulta a ninguna empresa).
3. Para usuarios se consultan **como máximo dos filas** por identificador, **antes de mirar ninguna contraseña**.
4. **Una fila → se resuelve** (empresa y rol salen de ella). **Más de una → `AMBIGUA`: falla de forma segura** con el mismo 401 genérico «Credenciales inválidas»; no se compara la contraseña con ninguna cuenta, no se crea sesión, no se cuenta el fallo contra ninguna cuenta real, y jamás se ofrece recuperación. No se informa de que el identificador está repetido (evita enumeración).
5. Nunca se prueba una contraseña contra varios tenants.

**Cómo garantizar identificadores únicos sin tercer campo** (plan, sin migración destructiva):
1. **Altas y ediciones nuevas (ya aplicado en este PR).** `UsuariosService.create/update` rechazan con `409 Identificador ya registrado` cualquier usuario, código o correo ya usado por **cualquier** empresa o por un Super Admin (`identificadorEnUso`). El mensaje es el mismo que el de duplicado local, para no revelar en qué empresa existe.
2. **Detección de lo ya existente (solo lectura):**
   ```sql
   SELECT lower(email) AS identificador, count(*) AS cuentas, count(DISTINCT tenant_id) AS empresas
   FROM usuarios WHERE email IS NOT NULL GROUP BY 1 HAVING count(*) > 1
   UNION ALL
   SELECT username, count(*), count(DISTINCT tenant_id) FROM usuarios WHERE username IS NOT NULL GROUP BY 1 HAVING count(*) > 1
   UNION ALL
   SELECT lower(u.email), 2, 2 FROM usuarios u JOIN super_admins s ON lower(s.email) = lower(u.email);
   ```
   Ejecutar contra una copia o en solo lectura antes de liberar. Cada fila es un usuario **que no podrá entrar** hasta resolverse (falla seguro).
3. **Resolución por cuenta, con el Admin/Super Admin y el titular:** cambiar el código o correo de las cuentas repetidas con la edición de usuarios (el cambio de correo exige reverificación; las sesiones previas siguen ligadas al hash de contraseña). No se borra ni se fusiona ninguna cuenta.
4. **Constraint a futuro (otra migración, con plan propio, NO incluida):** cuando la consulta devuelva 0 filas en producción, añadir `CREATE UNIQUE INDEX CONCURRENTLY usuarios_email_global_key ON usuarios (lower(email)) WHERE email IS NOT NULL;` y su equivalente para `username`. Se pospone porque fallaría con duplicados reales y bloquearía el despliegue. Este PR solo añade índices **no únicos** (`usuarios_email_idx`, `usuarios_username_idx`) para que la búsqueda global sea rápida.
5. **Colisión Super Admin / usuario con el mismo correo (datos heredados):** el Super Admin tiene precedencia; el usuario de empresa entra con su código de usuario. Las altas nuevas ya no pueden repetir un correo de Super Admin.

## 3. Intentos fallidos, bloqueo y concurrencia

Contadores en el servidor (`backend/src/auth/bloqueo-cuenta.ts`), columnas nuevas `usuarios.intentos_fallidos|ultimo_fallo_at|bloqueado_at` y `super_admins.intentos_fallidos|ultimo_fallo_at`.

* **Un fallo = una sentencia SQL atómica** (`UPDATE … RETURNING` con el bloqueo de fila de PostgreSQL). Solicitudes concurrentes se serializan: ninguna se pierde ni se cuenta dos veces, y **el evento `ACCOUNT_LOCKED` se emite exactamente una vez** (la CTE compara `bloqueado_at` antes/después).
* No-Admin: el fallo n.º 6 (`intentos_fallidos + 1 > 5`) fija `bloqueado_at` y esa misma respuesta ya es `403 CUENTA_BLOQUEADA`. Una cuenta bloqueada **no prueba contraseña ni cuenta más fallos**, ni siquiera con la contraseña correcta.
* Un acceso correcto reinicia la racha **solo si no hay bloqueo** (`updateMany … bloqueadoAt: null`): un bloqueo confirmado en paralelo nunca se deshace.
* Admin/Super Admin: no se bloquean de forma persistente (evita denegación de servicio sobre la cuenta que gestiona todo y es la que recupera); conservan el **límite temporal compartido** existente (`AUTH_LOGIN_MAX_FALLOS_CUENTA`, 5 fallos → 15 min por identificador y por IP) y el contador cuenta para ofrecer la recuperación a partir de 3.
* Usuarios no-Admin ya no usan la clave temporal por identificador (su contador persistente es el límite); **el límite por IP (100) sigue aplicando a todos**.
* Respuestas: genéricas («Credenciales inválidas»). Solo se añade `recuperacionDisponible: true` (Admin/Super Admin, ≥3 fallos, correo verificado) o `403` con código `CUENTA_BLOQUEADA` (no-Admin bloqueado). La respuesta de bloqueo no incluye datos de la cuenta.
* Las sesiones ya abiertas de un usuario bloqueado no se revocan al bloquear (cualquiera que conozca un código podría expulsar a un cajero en plena venta); se revocan al cambiar la contraseña.

## 4. Recuperación de Admin y Super Admin

1. `POST /api/auth/security/request` `{ usuario }` (CSRF/origen, límite compartido, respuesta idéntica y con piso de 8,5 s exista o no la cuenta). Solo envía si el identificador resuelve a **una** cuenta activa de Admin/Super Admin, **con correo verificado** y **≥3 fallos**. Si el correo falla, la temporal se elimina.
2. Contraseña temporal: 16 caracteres aleatorios (`crypto.randomInt`), **solo hash bcrypt** en `auth_temp_passwords` (una fila por cuenta; una nueva invalida la anterior), **vigencia 10 min**, **un uso** (consumo atómico `used_at IS NULL`). Solo viaja en el correo; no se registra en logs, auditoría, errores ni trazas (las pruebas verifican logs, `auth_events`, `auth_actions` y `sesiones_auth`).
3. Login con la temporal → **no hay sesión ni cookie ni `accessToken`**; la respuesta es `{ type: 'password_change_required', cambioToken }`. El token es una acción opaca de un uso (`FORCED_CHANGE`, 10 min, ligada al hash de la contraseña vigente) que **no es un access token** (la API lo rechaza) y solo sirve en `POST /api/auth/security/forced-change`.
4. `forced-change` `{ token, password }` exige la política de contraseñas, rechaza la contraseña actual, y en una transacción: cambia el hash, reinicia contadores, borra temporales y acciones, **revoca todas las sesiones anteriores** (y las de soporte del Super Admin) y audita `PASSWORD_FORCED_CHANGE`. No abre sesión: el usuario inicia sesión con la contraseña nueva.
5. Si el bloqueo temporal por identificador está activo, **solo una temporal vigente puede entrar** (para que la recuperación no caduque dentro del bloqueo); entrar con ella levanta ese bloqueo.
6. Requisito operativo: el correo del Admin/Super Admin debe estar **verificado** (`email_verified_at`). Las cuentas con MFA ya enrolado lo tienen. Una cuenta sin verificar entra normalmente, abre «Seguridad de mi cuenta» y pulsa «Verificar mi correo».

## 5. Gestión por Admin y Super Admin

* **Admin:** gestiona usuarios **de su empresa que no sean Admin** (otro Admin lo gestiona el Super Admin o se recupera por correo; evita toma de cuenta entre pares). **Super Admin:** cualquier usuario de cualquier empresa (`tenantId` explícito).
* `POST /api/auth/security/unlock` `{ usuarioId, tenantId? }`: reactiva una cuenta bloqueada (limpia `bloqueado_at` y contadores). No cambia ni devuelve contraseñas.
* `POST /api/auth/security/admin-reset` (contraseña actual del actor, **sin MFA**): emite un enlace privado de un uso para que el titular defina su contraseña; revoca sus sesiones; al aplicarse reinicia contadores y bloqueo. El administrador nunca conoce ni elige la contraseña.
* Eventos en `auth_events` (sin credenciales): `ACCOUNT_LOCKED` (actor `sistema`), `ACCOUNT_UNLOCKED`, `ADMIN_RESET_REQUEST`, `TEMP_PASSWORD_ISSUED`, `TEMP_PASSWORD_USED`, `PASSWORD_FORCED_CHANGE`, `PASSWORD_CHANGE`, `RESET_ADMIN`.
* UI: «Usuarios» muestra la insignia BLOQUEADA y el botón «Reactivar cuenta»; «Seguridad de mi cuenta» (Admin y Super Admin) permite reactivar y emitir el enlace.

## 6. Retiro del MFA

* Login, recuperación, cambio de contraseña, restablecimiento y renovación de sesión de Super Admin **no solicitan MFA**. `JwtStrategy` ya no exige `mfaSecret` ni el reclamo `mfa` (los tokens emitidos antes siguen válidos; los nuevos no lo llevan). Se retiraron los endpoints `mfa/enroll`, `mfa/confirm`, `mfa/bootstrap(-request)` y el campo `mfaCode`.
* **Sin borrado de datos ni migración destructiva:** las columnas `mfa_secret|mfa_last_step`, la tabla `auth_recovery_codes` y `AUTH_MFA_ENCRYPTION_KEY` se conservan sin uso (`mfa.ts` se mantiene con sus primitivas y pruebas; `requireMfa` ya no se invoca). Plan seguro para eliminarlos más adelante: (1) un ciclo de versión sin lecturas; (2) respaldo verificado; (3) migración propia con `-- APROBACION-DESTRUCTIVA` según `verificar-migraciones.mjs`; (4) retirar la variable del entorno.
* Impacto de seguridad: el Super Admin queda protegido solo por contraseña + límites de intentos + recuperación por correo verificado. Es la decisión del propietario del producto; se recomienda contraseñas largas únicas y vigilar `auth_events`.

## 7. Migración `20261026000000_login_unico_bloqueo_recuperacion`

Solo aditiva (`ALTER TABLE … ADD COLUMN`, `CREATE TABLE`, `CREATE INDEX`): no reescribe credenciales, no elimina nada. Pasa `verificar-migraciones.mjs`. Los índices `usuarios_email_idx`/`usuarios_username_idx` toman un bloqueo breve en `usuarios` (tabla pequeña); `CREATE INDEX CONCURRENTLY` no es posible dentro de la transacción de Prisma. Reversión lógica: el código anterior ignora las columnas/tabla nuevas. Catálogo `estado-base-solo-lectura.sql` actualizado (SHA LF/CRLF).

## 8. Pruebas

| Requisito | Prueba |
|---|---|
| Login de cada rol y detección automática de empresa/rol | `auth-recovery.postgres.integration.ts` › «%s entra con usuario, código o correo…» (ADMIN, CAJERO, VENDEDOR, BODEGUERO) y «Super Admin entra solo con su correo, sin código MFA…»; `login-unico.spec.ts`; `auth.service.spec.ts` |
| Identificadores repetidos | integración › «un código repetido en dos empresas…», «el mismo correo en dos empresas…» (+ altas globales); `login-unico.spec.ts` |
| Recuperación oculta antes del 3.er fallo / por correo verificado | integración › «platform=%s: la opción aparece al tercer fallo…»; `login-unico.spec.ts` (1, 2, 3, 4 fallos; sin correo verificado; inexistente/ambiguo); Playwright `auth-security.spec.ts` |
| No envía a quien no cumple | integración › «responde igual, y no envía nada…» (antes del 3.º, sin correo verificado, empleado, inexistente, ambiguo) |
| Expiración, un solo uso, hash, sin secretos en logs/auditoría | integración › «una temporal expirada…», «platform=%s…» (hash bcrypt, 10 min, reuso, logs/eventos/acciones/sesiones sin la temporal ni la nueva), carrera de dos usos |
| Cambio obligatorio antes del acceso | integración (sin cookie/sesión/accessToken; el token de cambio no autoriza la API; `forced-change` por HTTP con política) · Playwright «contraseña temporal: cambio obligatorio…» |
| Sesiones revocadas al completar | integración (`strategy.validate` y `refresh` rechazan la sesión previa) |
| Bloqueo en el 6.º intento, concurrencia | integración › «los fallos 1 a 5 no bloquean, el sexto sí…», «solicitudes concurrentes…» (12 en paralelo: un solo `ACCOUNT_LOCKED`), «un acceso correcto simultáneo…»; `login-unico.spec.ts` |
| Reactivación Admin/Super Admin, alcance | integración › «Admin del negocio y Super Admin reactivan…» (otra empresa y otro Admin denegados; Super Admin global) y «el cambio de contraseña por Admin/Super Admin…» |
| CSRF/origen, contrato HTTP | integración › «enforces real HTTP validation, origin checks…» (propiedades `tenantId`/`mfaCode` rechazadas, 403 con origen ajeno) |
| MFA retirado | integración (Super Admin con y sin `mfaSecret` entra y opera), `jwt.strategy`, `super-admin.service.spec.ts` |

## 9. Riesgos residuales y decisiones a confirmar

1. **Enumeración acotada (exigida por el requisito).** Tras 3 fallos, `recuperacionDisponible: true` revela que el identificador es un Admin/Super Admin con correo verificado; y el `403 CUENTA_BLOQUEADA` revela que un identificador existe y no es Admin. No se revela nada más (ni correo enmascarado, ni empresa, ni rol exacto). Todo lo anterior al tercer fallo o con identificadores inexistentes/repetidos es idéntico.
2. **Bloqueo como denegación de servicio.** Quien conozca el código de un cajero puede bloquearlo con 6 intentos; lo reactiva el Admin o el Super Admin. Se limita por IP (100 fallos) y las sesiones abiertas no se cortan al bloquear.
3. **Recuperación pisable.** Cada solicitud reemplaza la temporal anterior y consume el límite de 5 solicitudes / 15 min por identificador; un tercero con ≥3 fallos acumulados podría agotar ese límite. El titular puede reintentar al terminar la ventana o pedir al Super Admin un enlace de restablecimiento.
4. **Datos heredados repetidos** (sección 2): esos usuarios no pueden entrar hasta cambiar su código o correo. Ejecutar la consulta de detección **antes** de liberar.
5. **Super Admin sin segundo factor** (sección 6): decisión de producto; no se activó nada que lo sustituya (passkeys sigue como contrato futuro).
6. Admin no gestiona a otro Admin (decisión de este PR, más estricta que «cualquier usuario de su empresa»); ampliarlo requeriría reautenticación reforzada.
