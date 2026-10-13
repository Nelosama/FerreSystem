# Autenticación fase 3 — límite de intentos, sesiones revocables y rotación (2026-10-10)

**Base:** `claude/security-audit-fase-2` (PR #132) + merge de `origin/claude/integracion-pos-offline-p1` `58941e5d`. Rama: `claude/security-audit-fase-3`. No se modificaron PR existentes. No hay merge, despliegue ni migraciones productivas.

**Riesgos que cierra:** R-02 (sin límite de intentos en login) y R-03 (logout sin revocación) de [AUDITORIA_SEGURIDAD_FASE2_20261010.md](AUDITORIA_SEGURIDAD_FASE2_20261010.md). Mejora también R-01 (tokens antiguos) con un procedimiento de transición.

## 1. Límite de intentos de inicio de sesión

**Dónde se aplica:** `POST /api/auth/login` (tenants y Super Admin) y `POST /api/admin/auth/login`. Ambos pasan por el mismo envoltorio (`login` → `autenticar`), así que no hay ruta sin límite.

**Claves (hasheadas con SHA-256, sin correo en claro):**
- `cuenta:<hash(correo normalizado)>`: fallos del correo, exista o no la cuenta.
- `ip:<hash(IP del cliente)>`: fallos desde la misma IP.

**Reglas por defecto** (variables de entorno, ver §4):
- 5 fallos por cuenta en 15 min → bloqueo de la cuenta 15 min.
- 100 fallos por IP en 15 min → bloqueo de la IP 15 min.
- Un inicio correcto reinicia el contador de la cuenta. El de la IP sigue su ventana.
- Mientras hay bloqueo, la respuesta es **429** con cabecera `Retry-After` y el mismo mensaje para cualquier correo, con contraseña correcta o incorrecta. No revela si el correo existe.
- Un fallo cuenta cuando la respuesta sería 401 (credenciales, cuenta inactiva o empresa suspendida). Un 500 de base de datos no cuenta.

**Estado compartido en PostgreSQL** (tabla `intentos_login`), para que funcione con varias instancias de la API. El conteo y el bloqueo se hacen en una sola sentencia `INSERT ... ON CONFLICT`, así que los intentos simultáneos no se pierden. El tiempo lo marca `now()` del servidor de base de datos. La limpieza borra filas sin bloqueo de más de un día.

**Detrás de proxy (Render):**
- `req.ip` solo es el cliente real si se configura `TRUST_PROXY` con el número de proxies confiables (Render = **1**).
- Sin `TRUST_PROXY`, `X-Forwarded-For` se ignora: el atacante no puede evadir el límite cambiando esa cabecera (prueba incluida).
- **Riesgo operativo:** si la API está detrás de un proxy y `TRUST_PROXY` no está configurado, **todos los usuarios comparten la IP del proxy**. Con 100 fallos por IP en 15 min, una tienda con fallos repetidos podría bloquear a todas las cuentas. Por eso `TRUST_PROXY=1` debe estar en la configuración de Render antes del despliegue.

**Limitaciones conocidas:**
- Un atacante que prueba correos ajenos puede bloquear a esos usuarios 15 min (denegación de servicio sobre cuentas). Es el compromiso habitual del bloqueo por cuenta; el límite por IP reduce el alcance de un solo origen.
- Solo lo cubre el login. No hay protección contra abuso de otros endpoints.

## 2. Sesiones revocables y logout

**Modelo:** tabla `sesiones_auth`, una fila por inicio de sesión (tenant, soporte o Super Admin). El id viaja en el claim `sid` de access y refresh tokens.

**Reglas:**
- Cada petición de API revalida la sesión: debe existir, pertenecer al `sub` del token, no estar revocada y no haber vencido. La firma válida no basta.
- El refresh token **no rota** en cada uso. Se mantiene el mismo `sid` durante toda la sesión, de modo que dos pestañas que refrescan a la vez no se invalidan entre sí. Trade-off: no hay detección de reutilización de refresh; la protección es la revocación y el vencimiento absoluto (7 días, igual que antes).
- El refresh valida sesión y usuario. Si la sesión está revocada, responde 401 y limpia la cookie.
- **Logout** (`POST /api/auth/logout`, `POST /api/admin/auth/logout`) revoca la sesión del refresh (cookie) **y** la del Bearer enviado. El frontend envía ambos, así que el logout de una sesión de soporte revoca el token de soporte. Las firmas se verifican aunque el token esté vencido.
- Logout en un dispositivo **no** cierra las demás sesiones del mismo usuario.
- **Cambio de contraseña** o **desactivación** de un usuario revoca todas sus sesiones (`usuarios.service.ts`, y el cambio de contraseña de administradores desde Super Admin).
- Las sesiones de soporte (`POST /api/admin/support/token`) crean su propia fila `SOPORTE`, con la misma vigencia del token (10 o 15 min).

**Compatibilidad de las rutas:** los endpoints no cambian. El frontend no requiere cambios.

## 3. Procedimiento de transición de tokens y rotación de `JWT_SECRET`

### 3.1 Tokens antiguos

| Tipo de token emitido antes de esta versión | Efecto al desplegar |
|---|---|
| Access token sin `sid` (vida 15 min) | **En producción se rechaza por defecto.** Solo se acepta si `AUTH_ACEPTAR_TOKENS_SIN_SESION=true` **y** `AUTH_TOKENS_SIN_SESION_HASTA` (fecha ISO 8601) es futura y no supera 24 h desde el arranque. Fuera de producción, la transición sigue disponible para desarrollo y pruebas. |
| Refresh token de #132 (con `typ` pero sin `sid`) | Se rechaza siempre: el usuario inicia sesión una vez. Igual que en #132. |
| Refresh token de versiones anteriores a #132 (sin `typ`) | Ya se rechazaba desde #132. |

**Orden de despliegue:**
1. Aplicar la migración `20261012000000_autenticacion_sesiones_intentos` (aditiva, ver §5). **Sin migración, el código nuevo falla al iniciar sesión.**
2. Desplegar el código con `TRUST_PROXY=1` y `AUTH_ACEPTAR_TOKENS_SIN_SESION=true`.
3. Esperar **al menos 16 minutos** tras el despliegue (vida del access token + margen).
4. No hace falta reiniciar para cerrar la transición: al llegar `AUTH_TOKENS_SIN_SESION_HASTA`, cada petición deja de aceptar tokens sin `sid`. Para cerrarla antes, fijar `AUTH_ACEPTAR_TOKENS_SIN_SESION=false` y reiniciar.
5. Avisar al personal: los equipos con ventas pendientes en IndexedDB deben iniciar sesión de nuevo; las ventas se sincronizan después (ver §6).

La validación es estricta al arrancar (`validarConfiguracionAuth`): un valor distinto de `true`/`false` impide iniciar la API, y en producción una transición sin fecha límite, con fecha pasada o con más de 24 h impide iniciarla. **No existe transición indefinida en producción.**

### 3.2 Rotación controlada de `JWT_SECRET`

No hay doble clave: los tokens firmados con el secreto anterior dejan de validar en cuanto cambia el secreto. Por eso la rotación es una operación de cierre de sesiones planificada.

1. Elegir ventana de bajo movimiento (fuera de horario de caja).
2. Avisar a los equipos POS: quedarán pendientes de inicio de sesión.
3. Revocar en base de datos todas las sesiones activas (por higiene, aunque el cambio de secreto ya invalida las firmas):
   ```sql
   UPDATE sesiones_auth SET revoked_at = now(), revocation_motivo = 'ROTACION_SECRETO' WHERE revoked_at IS NULL;
   ```
4. Cambiar `JWT_SECRET` en Render (valor nuevo de al menos 32 bytes aleatorios) y reiniciar la API.
5. Verificar: `GET /api/health` responde y un login de prueba funciona; un token anterior responde 401.
6. Usuarios: inician sesión de nuevo. Las operaciones de contingencia pendientes se conservan en IndexedDB y se envían al volver a entrar (§6).

**Reversión:** restaurar el secreto anterior reactiva las firmas antiguas, pero las sesiones del paso 3 siguen revocadas: los usuarios inician sesión de nuevo de todos modos.

**Secretos de desarrollo:** `getJwtSecret` sigue usando un valor fijo solo si `NODE_ENV` no es `production` (R-09 en la auditoría fase 2). Confirmar en Render.

## 4. Variables de entorno nuevas

| Variable | Defecto | Función |
|---|---|---|
| `TRUST_PROXY` | sin definir (no confiar) | Número de proxies confiables. Local (Caddy → API): `1`, ya definido en `deploy/local/compose.yaml`. Render: **pendiente de verificar** (§9). Entero ≥ 1 o error al arrancar. |
| `AUTH_LOGIN_MAX_FALLOS_CUENTA` | `5` | Fallos por cuenta antes del bloqueo. |
| `AUTH_LOGIN_MAX_FALLOS_IP` | `100` | Fallos por IP antes del bloqueo. |
| `AUTH_LOGIN_VENTANA_SEGUNDOS` | `900` | Ventana de conteo. |
| `AUTH_LOGIN_BLOQUEO_SEGUNDOS` | `900` | Duración del bloqueo. |
| `AUTH_ACEPTAR_TOKENS_SIN_SESION` | producción: `false`; resto: `true` | Transición (§3.1). |
| `AUTH_TOKENS_SIN_SESION_HASTA` | sin definir | Fecha ISO 8601 límite de la transición. Obligatoria en producción si la transición está activa; máximo 24 h. |

## 5. Migraciones (requieren aprobación de DBA antes de producción)

**Nueva migración:** `prisma/migrations/20261012000000_autenticacion_sesiones_intentos/migration.sql`.

- **Aditiva.** Crea `intentos_login` (contadores, clave hasheada) y `sesiones_auth` (sesiones con id, tipo, sujeto, vencimiento y revocación). No modifica filas ni columnas existentes.
- **Tipos de fecha:** `TIMESTAMPTZ`, para comparar con `now()` sin depender de la zona de la sesión. Las tablas anteriores usan `TIMESTAMP(3)`; esta diferencia es intencional.
- **Reversión manual:** `DROP TABLE sesiones_auth; DROP TABLE intentos_login;`. Se pierden sesiones y contadores; los usuarios vuelven a iniciar sesión. Sin efecto en ventas, caja, inventario ni auditoría.
- **Modelos Prisma:** `IntentoLogin` y `SesionAuth` en `schema.prisma`. `prisma validate` y `prisma generate` pasan.

**Verificación:** la suite PostgreSQL aplica todas las migraciones en orden sobre un clúster limpio; las dos tablas nuevas se usan en las pruebas de login y sesiones.

**Nada de esto se ejecutó en producción.** La migración debe aplicarse con `prisma migrate deploy` en la ventana acordada y revisarse por un DBA.

**Riesgo de conflicto:** otros PR que añadan modelos al final de `schema.prisma` pueden generar conflicto de texto; el bloque está al final del archivo.

**Crecimiento de tablas:** `sesiones_auth` crece con cada inicio de sesión. Pendiente: limpieza periódica de sesiones vencidas hace más de 30 días, en un job aparte (no incluido).

## 6. Compatibilidad con la contingencia offline (POS)

Revisado en el frontend (`offline/sync.ts`, `TenantContext.tsx`, `authInterceptors.ts`) y en el backend:

- **Las operaciones pendientes viven en IndexedDB** (`offline/db.ts`). El logout de `TenantContext` solo borra claves de `localStorage`; no toca IndexedDB.
- **Sincronización ante 401/403:** la operación vuelve a `PENDIENTE` con el mensaje «Inicie sesión para enviar las ventas pendientes». No se pierde ni se marca como error.
- **Idempotencia por UUID:** el reenvío del mismo lote no duplica venta, caja, stock ni numeración (cubierto en `contingencia.postgres.integration.ts` y en la prueba nueva).
- **Por diseño de lote:** un rechazo de una operación viaja en el cuerpo (`RECHAZADA_TECNICA`), con 201 para el lote. Un 401 de sesión sí es error HTTP y no toca la base.
- **Efecto esperado:** tras revocar una sesión, el equipo deja de sincronizar hasta que el cajero inicie sesión. Las ventas en cola se envían entonces. No hay pérdida, pero sí retraso en la numeración definitiva.
- **Vida de la ventana de contingencia:** la sesión dura lo mismo que antes (7 días absolutos desde el inicio de sesión). Un turno offline más largo ya exigía iniciar sesión de nuevo.

**Prueba:** `test/autenticacion-fase3.postgres.integration.ts`, «un lote enviado con la sesión cerrada no crea nada; tras volver a entrar, el mismo lote se aplica una sola vez».

## 7. Pruebas

| Archivo | Cobertura | Resultado |
|---|---|---|
| `test/autenticacion-fase3.postgres.integration.ts` (nuevo) | Límites por cuenta, IP, cuenta inexistente, reinicio, expiración, proxy con y sin `TRUST_PROXY`, Super Admin; logout con cookie y Bearer, sesiones independientes, refresh, vencimiento, sid de otro usuario, transición de tokens sin `sid`, refresh como access, logout de Super Admin, soporte, cambio de contraseña, desactivación, `sesionVigente`, contingencia | **25/25** |
| `src/auth/auth.security.spec.ts`, `auth.service.spec.ts`, `super-admin.service.spec.ts` | Mocks actualizados a las nuevas dependencias; expectativas de payload con `sid` | Unitarias: **349/349** |
| Integración PostgreSQL completa | Todas las suites existentes | Ver `CONTEXTO_MAESTRO.md` (sección de esta fase) |

**Limitaciones:** no se probó contra la base de datos de producción ni en el despliegue de Render. No se probó con navegador real el flujo de logout y renovación (las pruebas de frontend no cambian). Las pruebas de límite usan límites bajos (3 por cuenta, 50 por IP) para ser deterministas; los valores de producción están en §4 y se validan al arrancar.

## 8. Riesgos pendientes

| Riesgo | Severidad | Estado |
|---|---|---|
| Refresh sin rotación: un refresh robado funciona hasta logout o vencimiento (7 días) | MEDIUM | Aceptado; mitigado por revocación. Rotación con detección de reutilización requiere ventana de gracia para pestañas concurrentes. |
| Denegación de servicio sobre una cuenta por 15 min | LOW–MEDIUM | Aceptado; límite por IP reduce el alcance. |
| `TRUST_PROXY` no configurado detrás de proxy bloquea a todos por IP | HIGH si ocurre | Mitigación documentada; **verificar en Render antes del despliegue**. |
| Limpieza de `sesiones_auth` e `intentos_login` | LOW | Pendiente (job de mantenimiento). |
| Logs de login con correo (R-08) | LOW | Sin cambio en esta fase. |
| Rotación de `JWT_SECRET` sin doble clave | LOW | Decisión: cierre de sesiones planificado (§3.2). |

## 9. Verificación del proxy (pendiente antes de producción)

- **Local (`deploy/local`):** Caddy es el único salto hacia `backend:3000`; `TRUST_PROXY=1` es el valor correcto. Verificar en la instalación real: enviar 3 fallos de login con `X-Forwarded-For` distinto en cada petición desde el mismo equipo y comprobar que la cuarta (con cuenta correcta) responde 429 si el límite por IP está fijado en 3. Si no bloquea, Caddy no está añadiendo la IP real y el límite por IP no protege. Caddy no está instalado en el entorno de validación: **no verificado**.
- **Render:** el repositorio no documenta el número de saltos del enrutador de Render. **No se puede afirmar `TRUST_PROXY=1` sin prueba en el servicio.** Procedimiento: en un servicio de staging, con `AUTH_LOGIN_MAX_FALLOS_IP=3`, hacer 3 fallos desde una red y 1 intento correcto desde otra red distinta. Resultado esperado: la segunda red entra (200). Si la segunda red recibe 429, el número de proxies es incorrecto (demasiado bajo o demasiado alto) o Render no envía `X-Forwarded-For`.
- **Prueba automatizada (PostgreSQL):** con `TRUST_PROXY=1`, `X-Forwarded-For` falsificado por el cliente no cambia el cubo; se usa la última IP (la que añade el proxy).
