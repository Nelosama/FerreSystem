# Sesiones expiradas y navegación protegida — 2026-10-16

Rama única `codex/fix-expired-sessions`, desde `origin/main` `d5fec352`. No existía una rama Codex remota apropiada; PR abiertos consultados: #170 y #171 (otros alcances). La rama se excluye de previews automáticas en `frontend/vercel.json` antes del primer push. Sin merge, despliegue, cambios de esquema, migraciones ni dependencias nuevas.

## Causa y reproducción

1. `TenantContext` inicializaba `user` desde `localStorage` y exponía `isAuthenticated: !!user`. `ProtectedRoute` montaba módulos antes de completar `/auth/me`. La prueba nueva de arranque con `/auth/me` pendiente falló sobre el código original: ya se había montado Levantamiento.
2. Axios no tenía timeout general ni comprobación anticipada del vencimiento del access token. La invalidación dependía de una respuesta 401 posterior. No se dispone de HAR/logs de la incidencia original: no se atribuye con certeza su duración exacta de aproximadamente 60 segundos a una solicitud concreta.
3. El interceptor borraba el token si la renovación devolvía **cualquier** respuesta HTTP de error, incluidos 403/502/503/504. Cuatro regresiones rojas confirmaron cierres indebidos. Un 401 tardío posterior a una renovación terminada tampoco recuperaba su consulta (quinta regresión roja).
4. NestJS atrapaba todos los errores de `refresh`, incluidos errores de BD, los convertía en 401 y borraba la cookie. Regresión roja reproducida con indisponibilidad de persistencia; ahora conserva el error de infraestructura y la cookie.
5. La selección del refresh Super Admin dependía de la URL de la consulta; `/auth/me` podía usar equivocadamente el refresh de tenant. Logout podía perder el Bearer al borrarlo antes de ejecutarse el interceptor asíncrono.
6. Los JWT se guardan en `ferre_token` de `localStorage`; usuario/tenant son metadatos locales, no autoridad. Los refresh siguen en cookies HttpOnly. Existen sesiones revocables `sesiones_auth`, JWT con `sid` y comprobación de usuario activo, tenant activo, rol/permisos actuales y sesión en cada petición protegida. No se modificó la transición existente de tokens sin `sid`.

## Corrección

- Controlador único `sessionValidation.ts`: estados de verificación, autorización, error recuperable, prohibido y contingencia. Arranque y restauración mediante foco, visibilidad, `pageshow`, `pagehide`, cambio de almacenamiento y reconexión; un perfil en vuelo compartido. Se mantiene el sondeo de permisos a 30 segundos que ya existía.
- Las rutas existentes conservan sus roles/módulos/permisos. Hasta validar el perfil no se monta el módulo. Al revalidar una página ya abierta se oculta y bloquea su contenido conservando el estado React. El enmascarado de `pagehide` es síncrono para BFCache/PWA.
- El vencimiento emitido por JWT inicia la renovación existente antes de enviar consultas. El backend sigue autorizando cada petición; decodificar `exp` no concede acceso. Los JWT recién emitidos usan su intervalo `iat`/`exp` para evitar bucles si el reloj local está adelantado.
- Renovación compartida, reintento único, recuperación de 401 tardíos y protección frente a respuestas de otra identidad. Tenant, Super Admin y soporte conservan sus mecanismos de renovación. Un refresh de otra identidad no reemplaza el estado actual.
- Solo el rechazo 401 irrecuperable invalida la sesión; 403, errores de red, timeouts y 5xx la conservan. Validación/refresh limitados a 10 s y transporte general a 30 s: son límites de red, no políticas nuevas de expiración. La pantalla de verificación ofrece **Reintentar** cuando no puede confirmar la sesión.
- Mensaje: «Tu sesión ha expirado. Inicia sesión nuevamente para continuar.» Logout captura el Bearer para revocarlo, limpia usuario/tenant/tokens/soporte y bloquea Atrás. Los cambios de identidad invalidan la pantalla anterior sin borrar las credenciales nuevas de otra pestaña.
- Cookies: se emiten y eliminan con las mismas opciones de seguridad/ruta; su `maxAge` sigue el vencimiento real de `JWT_REFRESH_EXPIRES_IN`, en vez de siete días fijos. El refresh de tenant comprueba además la pertenencia al tenant declarado.
- API con `Cache-Control: no-store, private`, incluidos 401; los endpoints de logotipo conservan ese encabezado. El SW solo almacena shell/recursos estáticos, omite peticiones con Authorization y todas las API. No fuerza activación durante un cobro.

## Formularios e inventario

Se preserva el formulario en memoria durante validaciones, renovaciones y errores temporales, sin desmontarlo ni escribirlo automáticamente. Se prueba también el retiro del formulario ante expiración irrecuperable. No se añadió almacenamiento persistente nuevo para formularios: al terminar la sesión se elimina la vista y sus datos en memoria.

Levantamiento ya usa claves por tenant/usuario y `solicitudId` para recuperar envíos de resultado incierto; el reintento conserva la identidad del comando. Solo una respuesta satisfactoria confirma el guardado. Se conservaron esos mecanismos, el borrador/recuperación del POS y el diario de ventas pendientes: borrar evidencia de una operación incierta podría permitir duplicados o pérdida de conciliación. No se cambiaron cálculos ni reglas de inventario, cobros o caja.

La excepción offline queda restringida a `/pos-contingencia`, con una ventana existente vigente para el mismo tenant/cajero. No autoriza otros módulos, no amplía la ventana y no se usa para evadir un 401/403 del servidor. También reconoce una red conectada sin acceso real a internet.

## Pruebas

Las pruebas no usan datos ni credenciales productivos. Los subconjuntos repetidos no se suman como pruebas únicas adicionales.

| Verificación | Evidencia local |
|---|---|
| Frontend unitarias | 368/368; más 3 comprobaciones nuevas del bloqueo de preview, verificadas en su suite específica |
| Backend unitarias | 498/498 |
| Backend scripts | 48/48 |
| Backend E2E HTTP | 6/6 |
| Integridad de inventario (Python) | 10/10 |
| Integración PostgreSQL completa | 979 pasan / 1 omitida preexistente, 60 archivos |
| Auth/cookies afectadas | 47/47, subconjunto de las unitarias; integración de autenticación repetida al cierre: 31/31 |
| Navegador de sesiones, escritorio | 15/15, bundle con API HTTPS de origen diferente y respuestas simuladas |
| Navegador de sesiones, emulación Pixel 7 | 15/15, incluye SW real |
| Sesiones contra NestJS/PostgreSQL reales | 3/3: sesión de ayer recuperable, irrecuperable, logout revocado + Atrás/no-store |
| Suite general de navegador simulada (repetición final) | 169 pasan / 1 falla: prueba independiente del emulador offline, 170 casos |
| Piloto real completo | 131 pasan / 1 falla / 10 omitidas preexistentes / 13 no ejecutadas por dependencia serial de contingencia |
| Repetición final real (sesiones + contingencia) | 4 pasan / 1 falla / 13 no ejecutadas; las tres sesiones nuevas pasan |
| Builds y lint | Ambos paquetes compilan; lint sin errores, avisos del proyecto |
| Control de migraciones y diff | Correctos; cero migraciones nuevas |

PostgreSQL 17.11 temporal: binarios oficiales Debian extraídos en `/tmp`, sin instalar dependencias en el proyecto; cliente Prisma regenerado desde el esquema existente. Cada arnés crea y borra su clúster aislado. Firma de la validación de persistencia: **NEXUS**.

Reproducción principal con API real:

```bash
cd frontend
PG_BIN=/ruta/postgresql/bin E2E_WEB_PORT=4174 \
  PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/ruta/chromium \
  bash e2e-real/run.sh session-real.spec.ts
```

Cobertura de escritorio/móvil y relojes simulados:

```bash
cd frontend
npm test
VITE_API_URL=/api npm run build
npm run test:browser -- session-lifecycle session-pwa
npm run test:browser -- --config playwright.session.mobile.config.ts
```

## Archivos modificados

- `.github/workflows/operacion-ferreteria.yml`
- `backend/src/auth/auth.service.spec.ts`
- `backend/src/auth/auth.service.ts`
- `backend/src/auth/refresh-cookie.spec.ts`
- `backend/src/auth/refresh-cookie.ts`
- `backend/src/common/no-store.middleware.ts`
- `backend/src/main.ts`
- `backend/src/super-admin/super-admin.controller.ts`
- `backend/src/super-admin/super-admin.service.spec.ts`
- `backend/src/super-admin/super-admin.service.ts`
- `backend/src/tenants/tenants.controller.ts`
- `backend/test/autenticacion-fase3.postgres.integration.ts`
- `docs/CONTEXTO_MAESTRO.md`
- `docs/CORRECCION_SESIONES_20261016.md`
- `frontend/e2e-real/session-real.spec.ts`
- `frontend/e2e/navigation-settings.spec.ts`
- `frontend/e2e/session-lifecycle.spec.ts`
- `frontend/e2e/session-pwa.spec.ts`
- `frontend/e2e/template-v2.spec.ts`
- `frontend/playwright.session.mobile.config.ts`
- `frontend/public/sw.js`
- `frontend/src/App.css`
- `frontend/src/components/ProtectedRoute.tsx`
- `frontend/src/context/TenantContext.tsx`
- `frontend/src/pages/LoginPage.tsx`
- `frontend/src/utils/api.ts`
- `frontend/src/utils/authInterceptors.ts`
- `frontend/src/utils/sessionSync.ts`
- `frontend/src/utils/sessionValidation.ts`
- `frontend/test/auth-session.test.mjs`
- `frontend/test/operaciones.test.mjs`
- `frontend/test/pos-offline-caracterizacion.test.mjs`
- `frontend/test/session-validation.test.mjs`
- `frontend/test/sessionSync.test.mjs`
- `frontend/test/vercel-pilot-guard.test.mjs`
- `frontend/vercel.json`

Las eliminaciones de `sessionSync.ts` y su prueba trasladan esa cobertura al controlador nuevo; los ajustes de fixtures reflejan la validación real y no relajan autorización.

## Límites y veredicto

- Chromium 151 del entorno restablece `navigator.onLine=true` después de recargar offline desde un SW, aunque la API continúa bloqueada. Lo demuestra `offline-emulation.spec.ts`, que no carga Jowa ni su código. El piloto real se detiene en la misma aserción «● Sin conexión»; tras la corrección la captura muestra el catálogo de contingencia restaurado, pero el emulador dice «● En línea». No se omitió ni debilitó la prueba, no se modificó `navigator.onLine` y no se certifica la secuencia offline restante.
- La descarga del Chromium 153 requerido por Playwright fue rechazada por el proxy: `cdn.playwright.dev`, HTTP 403 «Domain forbidden». Se deja su ejecución en CI con el navegador correspondiente; el workflow añade también los escenarios móviles nuevos.
- Emulación móvil no equivale a Safari/WebKit ni a PWA instalada físicamente en iOS/Android. Falta aceptación en dispositivos físicos, incluida la política real de cookies entre dominios. Un logout sin conectividad limpia el navegador; la revocación remota requiere que la solicitud llegue al backend.
- El cierre irrecuperable elimina formularios volátiles; no se ofrece recuperación persistente nueva. Los comandos inciertos existentes siguen aislados por cuenta/tenant para conciliarlos tras una nueva autenticación.

**NO LISTO PARA MERGE mientras no se confirme en CI la secuencia offline completa con Chromium correspondiente y los checks del commit publicado.** Sin merge ni despliegue automático. El criterio de sesión de ayer está demostrado contra API real; el límite pendiente es la certificación completa de regresión offline y los dispositivos indicados.
