> **Estado vigente (2026-10-27, decisión del propietario):** el segundo factor (MFA) del Super Admin **queda retirado**. No hay TOTP, códigos de emergencia, enrolamiento MFA ni `AUTH_MFA_ENCRYPTION_KEY`. Login de dos campos; Super Admin y ADMIN recuperan el acceso con una contraseña temporal de un solo uso enviada por Gmail SMTP al correo verificado. Las secciones de MFA de este documento son historia y no aplican. Ver [AUTH_CONSOLIDACION_20261026.md](AUTH_CONSOLIDACION_20261026.md) y [MFA_RETIRO_PLAN_20261027.md](MFA_RETIRO_PLAN_20261027.md).

# Jowa System: acceso y recuperación de credenciales

> **Vigente desde 2026-10-27 (PR #205, alineado con #203):** el correo de seguridad sale por **Gmail SMTP** (`AUTH_MAIL_GMAIL_USER`, `AUTH_MAIL_GMAIL_APP_PASSWORD`, `AUTH_MAIL_FROM_NAME` opcional, `AUTH_PUBLIC_URL`). Resend y `AUTH_MAIL_RESEND_API_KEY`/`AUTH_MAIL_FROM` ya no se usan; las menciones a Resend de este documento son históricas. En producción, `config-auth.ts` impide arrancar si el correo Gmail está incompleto o es inválido y ya **no** exige `AUTH_MFA_ENCRYPTION_KEY` (decisión del propietario de no usar MFA; su retiro del código de autenticación se coordina sobre #203). La prueba real de envío es `backend/scripts/smtp-staging-check.mjs` (opt-in, solo staging); `prueba-correo-resend.mjs` se retiró.


[PR dedicado #192](https://github.com/Nelosama/FerreSystem/pull/192) en borrador. Rama `codex/auth-recovery-security`, base inicial `main` `ed720baf`, sincronizada con `ba201465` (#190). Sin merge, despliegue ni acceso a datos de producción. Revisión de esquema y persistencia: **NEXUS**.

## Auditoría inicial

- React enviaba solo `email/password`. NestJS buscaba Super Admin y después usuarios en todas las empresas; cuando había varias coincidencias comparaba sus contraseñas para elegir una empresa. Se elimina esa selección por contraseña. Un correo globalmente único puede resolver la empresa **antes** de verificar credenciales; nombres, códigos y correos compartidos requieren `tenantId`. La autorización de las siguientes peticiones sigue tomando el tenant del JWT revalidado, nunca de una cabecera del cliente.
- Prisma tenía `Usuario.email` obligatorio y unicidad `(tenantId,email)`, sin nombre/código de acceso, verificación de correo, MFA ni tokens de recuperación. Se añade `username` normalizado, único por empresa, sin `@` para evitar ambigüedad con correos. Cajeros, vendedores y bodegueros pueden usar solo ese identificador. ADMIN necesita correo. `CONTADOR` aún no existe en `main`: pertenece al PR #180, que sigue separado; las políticas de recuperación excluyen cualquier rol distinto de ADMIN, por lo que un futuro CONTADOR seguirá el flujo de empleado.
- `UsuariosService.update` y `SuperAdminService.updateTenantAdmin` permitían al administrador elegir la contraseña de otra persona. Se rechaza esa asignación. El alta general genera un hash de una clave aleatoria desconocida y requiere un enlace privado posterior. El alta específica de administradores y la creación de negocios conservan su contrato de contraseña inicial; **no** se permiten cambios posteriores por ese camino. No se devuelven hashes ni contraseñas.
- El seed principal ya tiene `upsert(update: {})` para Super Admin y usuario inicial, y exige marcador de desarrollo/staging y secretos explícitos. No se ejecuta durante startup/deploy. No se encontró una migración que reescriba hashes ni evidencia que permita atribuir una pérdida real de contraseña en producción: no se consultó esa base.
- El comando manual `admin:replace-super-admin` sí eliminaba y recreaba la identidad de plataforma. Cambiaba ID y contraseña, podía romper referencias operativas y no revocaba explícitamente sesiones. Queda retirado y falla antes de conectar. Su sustituto de mantenimiento actualiza únicamente el hash de una cuenta activa existente, conserva identidad/correo/MFA, revoca sesiones y deja auditoría.
- Se conservan JWT firmado, revalidación de cuentas/empresas, CSRF por origen, CORS exacto, cookies HttpOnly/Secure, rotación de refresh con gracia/detección de replay y revocación durable. No se cambian claves reales ni hashes existentes. JWT_SECRET equivocado, cookies bloqueadas, empresa suspendida o login al tenant incorrecto pueden aparentar credenciales inválidas sin cambiar la contraseña; no se certificó la configuración productiva.

## Comportamiento y límites

| Cuenta | Inicio de sesión | Recuperación |
|---|---|---|
| Super Admin | Tabla independiente, correo/usuario + contraseña | Contraseña temporal de un uso por correo verificado; cambio obligatorio |
| ADMIN | Empresa resuelta + contraseña | Contraseña temporal de un uso por correo verificado; alternativamente enlace emitido por el Super Admin. Un ADMIN no restablece a otro ADMIN |
| Empleado | Usuario/código/correo + contraseña en su empresa | Sin correo automático; enlace emitido por ADMIN autorizado de su empresa o Super Admin |

Todos pueden cambiar su propia clave aportando la actual. Las sesiones de soporte no gestionan credenciales. Ningún administrador puede leer contraseñas. Los enlaces de empleado son credenciales temporales: entregarlos únicamente al titular por un canal privado y no abrirlos en el dispositivo del administrador. El receptor elige su contraseña. Quien posea un enlace puede usarlo; la entrega privada y comprobación presencial de identidad forman parte del procedimiento administrativo.

Los tokens tienen 256 bits aleatorios, se guardan como SHA-256, duran 10 minutos y se consumen con bloqueo por cuenta y transacción PostgreSQL. Están ligados a cuenta/tipo/empresa, correo y hash actual. La expiración, cambio de correo/clave, un segundo consumo o una cuenta/empresa desactivada impiden usarlos. Un nuevo token del mismo propósito invalida el anterior. El reset elimina otras acciones pendientes y revoca access/refresh mediante la tabla de sesiones. Emitir un enlace administrativo revoca las sesiones del empleado de inmediato. Cambiar la contraseña de Super Admin cierra además todas las sesiones de soporte; es una medida conservadora porque las filas históricas de soporte no conservan el ID de origen.

Segundo factor retirado (2026-10-27): no hay TOTP, códigos de emergencia ni cifrado de secretos. Las columnas `mfa_secret`/`mfa_last_step` y la tabla `auth_recovery_codes` se conservan sin uso (migración aditiva; su eliminación requiere autorización explícita del propietario).

Limitación compartida en PostgreSQL por cuenta/acción e IP, incluyendo solicitudes válidas de correo. Los límites existentes `AUTH_LOGIN_*` siguen aplicando. Los consumos públicos limitan por hash del token, evitando un bloqueo global entre usuarios. La solicitud pública devuelve el mismo mensaje con cuenta inexistente, empleado, no verificada o sin MFA; usa un suelo de respuesta de 8,5 s y el proveedor tiene timeout de 8 s. Las caídas de correo se registran con un mensaje fijo sin destinatario, token ni detalle del proveedor. No hay reintento automático: el titular puede solicitar otro enlace después del límite. El proxy debe tener límites de conexión/solicitudes para proteger también recursos antes de llegar a NestJS.

Los enlaces llevan el token en el fragmento y React lo retira de la URL; no se guarda en localStorage/sessionStorage. API con `no-store`, origen fijo para enlaces y sin reconstruir URLs desde `Host`. Los endpoints de seguridad no son reintentados por el interceptor de renovación. Las nuevas contraseñas respetan la política existente y el límite de 72 bytes de bcrypt para evitar truncamiento silencioso; no se altera el hash ni el acceso de claves antiguas.

## Configuración externa requerida antes de liberar

| Variable backend | Uso |
|---|---|
| `AUTH_MAIL_GMAIL_USER` | Dirección completa de la cuenta Gmail **dedicada** a Jowa System (también es el remitente) |
| `AUTH_MAIL_GMAIL_APP_PASSWORD` | Contraseña de aplicación de Google de esa cuenta (16 caracteres; requiere verificación en dos pasos). Nunca la contraseña normal |
| `AUTH_MAIL_FROM_NAME` | Opcional: nombre visible del remitente (por defecto «Jowa System») |
| `AUTH_PUBLIC_URL` | Origen HTTPS definitivo del frontend, sin credenciales ni datos del usuario |
| `FRONTEND_URLS`, `NODE_ENV`, `TRUST_PROXY` | Conservar CORS/orígenes exactos, modo production y número real de proxies |
| `JWT_SECRET`, `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` | Conservar las claves y políticas existentes; una rotación de JWT_SECRET termina sesiones, no cambia contraseñas |

No se ha creado ninguna cuenta de correo, configurado secretos externos ni enviado correo real. **Proveedor (2026-10-27): Gmail SMTP** (`smtp.gmail.com:465`, TLS implícito ≥ 1.2, certificado verificado) con contraseña de aplicación, mediante `nodemailer` (versión exacta). Resend se retiró por decisión del propietario y no queda como respaldo. Detalle, requisitos de la cuenta y límites de envío: [AUTH_CONSOLIDACION_20261026.md](AUTH_CONSOLIDACION_20261026.md) §6.

Reloj/NTP correcto en hosts y dispositivos. Probar la entrega real y enlaces en los dominios definitivos y cookies de Safari/PWA; preferir API en el mismo sitio para evitar cookies de terceros. Nunca copiar estos secretos a variables `VITE_*`.

## Configuración de cuentas y transición

1. Respaldar y ensayar restauración en una copia aislada. Revisar la migración `20261023000000_auth_recovery`, su checksum y el guard existente. Se añaden campos/tablas/índices y se permite email nulo; no se reescriben credenciales. Confirmar capacidad y duración de bloqueos de DDL en una copia representativa.
2. **No liberar sin correo Gmail configurado y probado en staging** (`AUTH_MAIL_GMAIL_USER`, `AUTH_MAIL_GMAIL_APP_PASSWORD`, `AUTH_PUBLIC_URL`). Sin esas variables la recuperación por correo no envía nada.
3. Super Admin: entra con su usuario o correo y su contraseña, sin segundo factor. Si olvidó la contraseña, pide la temporal al correo verificado de la cuenta (ver recuperación); usarla obliga a definir una contraseña nueva.
4. ADMIN existente: entrar normalmente y verificar su correo desde «Seguridad de mi cuenta» (enlace de un solo uso). Sin correo verificado no dispone de recuperación automática; el Super Admin puede emitirle un enlace.
5. Alta general de empleado: crear usuario/código y rol, sin contraseña ni correo obligatorio; emitir enlace en «Seguridad de mi cuenta» después de seleccionar empresa/empleado y volver a verificar la identidad del administrador. El empleado lo abre en su propio dispositivo y establece su clave.
6. Un eventual despliegue posterior corresponde al propietario; este PR no hace merge ni deploy. Vercel excluye esta rama en `vercel-ignore.sh`; Render no fue modificado. **Corrección (2026-10-24):** revertir solo el código hacia `main` NO es viable tras migrar: `migration-safe.mjs` rechaza migraciones desconocidas (`MIGRACION_DESCONOCIDA`) y el backend anterior no arranca; el rollback real exige restaurar el respaldo previo o una reversión revisada (ver `PREPARACION_PRODUCCION_PR180.md` §4). Además, una versión antigua volvería a permitir login de plataforma sin MFA: no usarla como salida rutinaria a un problema de configuración.

## Emergencia administrativa (no ejecutada)

Primero intentar la contraseña temporal por correo verificado. Si el propietario perdió también el acceso a su correo, abrir un incidente, verificar su identidad fuera de la aplicación con dos responsables autorizados, respaldar y comprobar restauración, registrar aprobaciones y limitar temporalmente el acceso de mantenimiento al host/base. La aprobación de dos personas depende del control de infraestructura; una variable de entorno no la reemplaza.

En una sesión de mantenimiento autorizada, fuera de CI/startup, suministrar mediante el gestor de secretos: `DATABASE_URL`, `SUPER_ADMIN_OBJETIVO_EMAIL`, `CONFIRM_SUPER_ADMIN_RECOVERY` con el mismo correo exacto, `AUTH_EMERGENCY_TICKET` con formato de ticket (por ejemplo `INC-123`), y `SUPER_ADMIN_PASSWORD` elegido privadamente por el titular. Ejecutar `npm run admin:recover-super-admin`. No registra valores sensibles, crea cuentas ni sustituye correo/ID. Revoca sesiones y acciones pendientes y registra `EMERGENCY_PASSWORD_RECOVERY` con el ticket. El titular entra con la nueva clave; retirar variables de mantenimiento y comprobar auditoría. Nunca dejar estas variables en despliegues.

Si también se pierde el control del correo verificado, **este comando no lo salta**. Se requiere intervención del propietario de la base con doble aprobación e identificación documentada: contener la cuenta, verificar/restablecer el control del correo por un canal independiente, respaldar, y revocar sus sesiones y acciones pendientes conservando trazabilidad y la misma identidad. No hay endpoint, contraseña maestra ni código universal. No se incluye un SQL genérico para ejecutar sin revisión de la cuenta afectada.

## Web/PWA y passkeys

Formularios responsive ES/EN, autocomplete de usuario/contraseña/código, enlaces de recuperación sin persistencia, bloqueo de interfaz a los cinco minutos sin interacción y cambio explícito de empleado mediante logout. En backend una sesión no se acepta tras 15 minutos sin actividad API; cada sesión conserva su vencimiento absoluto. El bloqueo local no se revierte con un PIN: exige otro login online. Se conservan el diario y la autorización offline existente del POS de contingencia; no se crea login ni recuperación offline, ni se borra una venta pendiente al cerrar sesión.

**Passkeys/acceso rápido preparados como contrato de integración, no activados en este PR:** exigir WebAuthn con origen y RP ID HTTPS definitivos, challenge aleatorio de un uso/expiración corta almacenado como hash, credencial vinculada a sujeto y tenant, verificación de usuario y política de registro/revocación de dispositivos. El enrolamiento exige sesión personal y reautenticación, MFA de plataforma, auditoría y comprobación de origen. El servidor decide el tenant antes de validar la credencial. Un PIN solo puede desbloquear localmente un autenticador autorizado; nunca enviarse como autenticación suficiente desde un dispositivo desconocido. No hay botón de passkey, endpoint PIN, promesa de soporte biométrico ni almacenamiento de contraseña para «acceso rápido». Activarlo requerirá implementación y pruebas WebAuthn dedicadas; no añadir una simulación insegura.

## Evidencia y criterio de revisión

La matriz real está en `backend/test/auth-recovery.postgres.integration.ts`; crea exclusivamente un clúster temporal en loopback y nunca usa una URL productiva. Comprueba migración desde la versión anterior, repetición de deploy, ausencia de deriva Prisma, recuperación de Super Admin/Admin, empleados denegados, autorización/aislamiento, token vencido/reutilizado/cambio de correo o clave, concurrencia, códigos de emergencia, revocación, carrera de login y bloqueo backend. El correo es un adaptador simulado capturando destinatario/token, no una entrega real.

Pruebas de TOTP retiradas junto con el segundo factor (`mfa.spec.ts`). Persistencia/seed/startup/emergencia en `backend/scripts/auth-credentials.test.mjs`. Navegador en `frontend/e2e/auth-security.spec.ts`: 320/390/1440, identificadores/empresa/MFA, privacidad del enlace, códigos en memoria, idioma y bloqueo. Esa suite usa API simulada; no acredita iPhone físico ni proveedor real. Los resultados finales y las limitaciones del entorno se registran en el contexto maestro y en el PR, vinculados al commit publicado.

Antes de producción: checks completos del SHA final, verificación real de correo y autenticador del propietario, aceptación PWA/iPhone/Safari y revisión de operaciones de emergencia. Las instalaciones actuales reportan avisos de seguridad de dependencias heredadas; no se actualizan versiones ajenas al alcance. Los access tokens siguen en localStorage conforme al contrato actual y CSP: migrarlos a memoria requiere otro cambio de sesiones/soporte/offline. No se declara el sistema certificado ni listo para desplegar por pasar pruebas locales.

Referencias: [OWASP Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), [RFC 6238](https://www.rfc-editor.org/rfc/rfc6238).


## Corrección del piloto de PR #192 (2026-10-23 UTC)

El run 39884731901, job 120190280620, terminó con 7 fallos, 61 aprobados, 4 omitidos y 90 sin ejecutar. Los siete fallos son regresiones del arnés: contingencia-real, faro-auditoria-integral, faro-validacion-def01, historial-auditoria-real, pilot-permisos-real, piloto-ciclo-completo-real y qa-ciclo-venta enviaban password a POST /usuarios. El 400 del backend es correcto y se conserva.

Los fixtures ahora crean sin contraseña y usan activation.fixture.ts: Super Admin sintético con MFA de un uso, emisión autorizada de RESET_ADMIN, establecimiento privado por el destinatario y rechazo de reutilización. Solo loopback y tenants e2e; no se escriben hashes de empleados mediante SQL. Se completa además el MFA de un acceso de Super Admin antes oculto por las pruebas en cascada. La prueba de creación denegada por rol elimina password para comprobar exclusivamente autorización.

run.sh configura límites finitos de 1000 por cuenta/IP exclusivamente en su clúster efímero: el piloto hace altas masivas desde un único emisor/IP. No cambia valores predeterminados ni configuración productiva. La matriz PostgreSQL verifica por separado bloqueo a 5 solicitudes por sujeto y 100 por IP, compartido entre instancias, además de MFA, tokens, sesiones, tenants y persistencia. Resultados finales y enlaces de CI por SHA: PR #192. Se mantiene borrador hasta CI y revisión de seguridad; sin merge ni despliegue.

Portabilidad del arnés: la matriz PostgreSQL usa socket propio en Linux (no /var/run/postgresql) y muestra el log de arranque si falla. Las pasadas nativas Windows usan build React de producción, clúster UTC y codificación de argumentos de psql coherente con Windows; errores anteriores de ese arnés no se confunden con los siete 400 de CI. La evidencia definitiva, SHA y estado de los dos workflows quedan en el PR, que continúa en borrador.

El simulacro de actualización también contenía un acceso de Super Admin sin MFA, antes oculto por el fallo temprano del piloto. Se adapta humo-preproduccion.mjs a SUPERADMIN_MFA_CODE; el ensayo aislado genera un código sintético distinto por login mediante test/synthetic-upgrade-mfa.cjs, sin modificar la contraseña. Se comprueba el hash histórico antes de inicializar MFA. Esta es otra incompatibilidad nueva del arnés con MFA obligatorio, no un fallo heredado del backend.

La validación general cf8f4550 descubrió además 5 suites de integración incompatibles (72 fallos / 989 aprobadas / 2 omitidas): ventas y reportes omitían auth_recovery; migracion-autenticacion la aplicaba antes de sesiones_auth; la foto de Modo Guía incluía columnas nuevas; real-ciclo-ventas-browser conservaba input[type=email]. Se corrigen exclusivamente fixtures: orden/listas de migración, proyección de TODOS los campos históricos (hash incluido), MFA sintético para un login adicional de plataforma y selector estable. Primeras tres suites locales: 72/72; se repiten las restantes y CI. Son regresiones nuevas del arnés de esta rama, no fallos heredados del negocio.

## Verificación previa a producción (2026-10-23 UTC, rama `feat/contabilidad-honduras`)

- **Arranque:** con `NODE_ENV=production`, `validarConfiguracionAuth` (`backend/src/auth/config-auth.ts`) impide iniciar el servicio si falta o es inválido `AUTH_MFA_ENCRYPTION_KEY` (64 hex), `AUTH_MAIL_RESEND_API_KEY`, `AUTH_MAIL_FROM` o `AUTH_PUBLIC_URL` (origen HTTPS sin ruta, consulta ni credenciales). El mensaje nombra variables, nunca valores. Comprobado con `dist/main.js`: salida con código 1 y lista de variables. Fuera de producción no se exige nada.
- **Correo sin configuración:** `RecoveryMailService` responde 503 y no llama a Resend; un 4xx/5xx de Resend también es 503 sin revelar clave ni destinatario (`recovery-mail.service.spec.ts`).
- **Prueba real de entrega (no ejecutada):** `backend/scripts/prueba-correo-resend.mjs` envía un único mensaje de configuración sin enlaces a un destinatario confirmado explícitamente con `CONFIRM_ENVIO_REAL`. Sin esa confirmación o con una URL no válida rechaza sin enviar (comprobado). Requisitos: dominio del remitente verificado en Resend, clave de envío restringida, registros SPF/DKIM según el proveedor. Resultado a registrar: estado HTTP e identificador devuelto; la ejecución requiere autorización del propietario.
- **Secretos:** ninguna clave, dominio o token de producción se ha generado, leído ni publicado. Los valores de prueba son sintéticos y viven solo en pruebas.
- **MFA del Super Admin verificado en pruebas:** enrolamiento y bootstrap (`auth-recovery.postgres.integration.ts`, 19/19), login con código TOTP y código de emergencia de un solo uso (`mfa.spec.ts`), expiración de tokens y de sesión por inactividad, y revocación de sesiones tras cambio o restablecimiento de contraseña.
- **Vías de recuperación:** Super Admin y ADMIN con correo verificado, token de 10 minutos y MFA; empleados con enlace privado emitido por un ADMIN de su empresa. Ningún administrador asigna contraseñas ajenas.

## Procedimiento seguro: variables de autenticación en Render (no ejecutado)

Solo el propietario ejecuta estos pasos, en el panel de Render del servicio de producción. Ningún valor se pega en chat, repositorio, issues, logs ni variables `VITE_*`.

1. **Antes:** respaldo verificado de la base y ensayo de restauración en una copia aislada (`npm run backup:verify-restore`). Confirmar que el despliegue de este PR corresponde al SHA aprobado.
2. **Generar la clave MFA en una máquina del propietario:** `openssl rand -hex 32` (64 caracteres hexadecimales). Guardarla en el gestor de contraseñas junto con una copia de seguridad. Perderla impide descifrar el TOTP de todos los administradores; cambiarla exige recifrado planificado.
3. **Crear la cuenta de envío en Resend** con un dominio o subdominio propio verificado (SPF y DKIM publicados). Crear una clave restringida solo a envío. Desactivar el seguimiento de enlaces para estos correos.
4. **En Render → Environment**, añadir como *secret*: `AUTH_MFA_ENCRYPTION_KEY`, `AUTH_MAIL_RESEND_API_KEY`, `AUTH_MAIL_FROM` (`Nombre <correo@dominio-verificado>`) y `AUTH_PUBLIC_URL` (origen HTTPS del frontend, sin ruta). Confirmar que `NODE_ENV=production`, `FRONTEND_URLS`, `TRUST_PROXY` y `JWT_SECRET` siguen definidos y no son valores públicos de ejemplo.
5. **Desplegar** con el comando de inicio existente (`prisma migrate deploy` antes de `node dist/main.js`). Si falta una variable, el log indica solo su nombre: «Configuración de seguridad incompleta en producción: …». Corregir la variable y redesplegar; no relajar la validación.
6. **Verificar:** `GET /api/health` responde OK; la página de acceso carga; no hay errores de arranque en el log.
7. **Rollback:** ver `PREPARACION_PRODUCCION_PR180.md` §4. Revertir solo el código hacia `main` no arranca tras migrar; se decide antes de la ventana y depende del respaldo verificado. Una versión anterior no exige MFA de plataforma; no usarla como salida rutinaria.

## Prueba de envío real por Resend (preparada, NO ejecutada)

Requiere autorización explícita del propietario y el destinatario confirmado por escrito. El script `backend/scripts/prueba-correo-resend.mjs` envía **un** mensaje de configuración, sin enlaces ni tokens, y rechaza cualquier ejecución sin `CONFIRM_ENVIO_REAL` con el correo exacto.

Procedimiento: ejecutar desde una máquina del propietario con las cuatro variables en el entorno local de la sesión (no en ficheros), comprobar la salida (`estado`, `ok`, `id`), revisar la bandeja de entrada y los encabezados (SPF/DKIM = pass) y anotar el resultado aquí. Un resultado distinto de `ok: true` bloquea la liberación.

## Checklist de enrolamiento MFA del Super Admin

Marcar cada punto; los pasos 3 y 4 dependen de la entrega de correo.

- [ ] Correo de prueba recibido y enlace funcional (Resend verificado).
- [ ] Inicio de sesión con correo y contraseña actual; elegir «Configurar MFA inicial».
- [ ] Abrir el enlace del correo **en el dispositivo del titular** y volver a introducir la contraseña.
- [ ] Registrar la clave en un autenticador (no en el mismo navegador que el administrador de contraseñas, si es posible) y confirmar un código de seis dígitos.
- [ ] Guardar los diez códigos de emergencia fuera del equipo; se muestran una sola vez.
- [ ] Iniciar sesión de nuevo con TOTP. Comprobar que un código de emergencia funciona una sola vez.
- [ ] Probar que la sesión caduca tras el periodo de inactividad y que «cerrar sesión» revoca la sesión en otra pestaña.
- [ ] Probar el restablecimiento: solicitar enlace, abrirlo, fijar contraseña nueva y comprobar que las sesiones previas dejan de valer.
- [ ] Confirmar que no hay MFA de respaldo sin custodia: al menos un código de emergencia conservado.
- [ ] Registrar la fecha y el responsable del enrolamiento en `CONTEXTO_MAESTRO.md`. No registrar códigos ni claves.
