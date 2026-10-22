# Revisión de seguridad — FerreSystem / Jowa System (2026-10-20)

**Rama:** `claude/revision-seguridad-jowa-20261020`, desde `main` `c4cadc3` (igual que `origin/main`).
**PR abiertos al iniciar:** #180 (`feat/contabilidad-honduras`, borrador) y #181 (`claude/impeccable-init`). No se tocaron.
**Alcance:** autenticación y sesiones, aislamiento multi-tenant, roles y permisos, frontend, operaciones críticas e infraestructura en el código versionado.
**Sin:** merge, despliegue, acceso a producción, datos reales ni consultas a Render, Vercel o Supabase (no accesibles desde esta sesión).

## Estado vigente — continuación del 2026-10-21 (sustituye las tablas «Resumen» y «Priorización residual» de abajo)

Misma rama y PR #183; `main` `c4cadc3` sigue siendo la base (sin conflictos). Las secciones posteriores se conservan como historial de la revisión inicial.

| ID | Severidad | Hallazgo | Estado | Evidencia |
|---|---|---|---|---|
| H-01 | Alta | Secreto JWT público fuera de producción | Corregido (revisión inicial) | `jwt-secret.spec.ts` |
| H-07 | **Alta** | `vercel.json` inválido: `ignoreCommand` de 266 caracteres en `main` (306 en este PR); Vercel exige ≤ 256 y rechaza el despliegue | **Corregido** | Mensaje del bot de Vercel en #184; `frontend/scripts/vercel-ignore.sh`; `vercel-pilot-guard.test.mjs` (rojo con la configuración anterior) |
| H-04 | Media | Refresh sin rotación ni detección de reutilización | **Corregido** | `rotarRefresh` (`auth/sesiones-auth.ts`); 9 pruebas PostgreSQL en `autenticacion-fase3` (rojas sin la corrección) |
| H-05 | Media (antes Baja) | CSRF de login/refresh/logout con cookie `SameSite=None` | **Corregido** | `OrigenPermitidoGuard`; unitarias + 2 de integración HTTP |
| H-08 | Media | Correo en claro en los registros de cada login; `error.message` de Prisma (con argumentos de la consulta) en registros de soporte y contingencia | **Corregido** | `diagnosticoSeguro`; prueba de registros del login (roja antes) |
| H-02 | Media | Frontend sin cabeceras | Corregido + **CSP validada** | `e2e/csp-vercel.spec.ts`, `e2e/camara-real-csp.spec.ts` |
| H-09 | Baja | API sin cabeceras de seguridad y con `X-Powered-By` | **Corregido** | `cabeceras-seguridad.middleware.spec.ts` |
| H-03 | Media → **Baja** con CSP | Access token en `localStorage` | Pendiente (decisión justificada abajo) | Control negativo de la CSP: un script inyectado no lee el token |
| H-06 | Baja | `GET /api/health/db` público | Pendiente, sin cambio | Expone lo mismo que `/api/health` (readiness pública por diseño); retirarlo puede romper un monitor externo no identificado |

### Correcciones de esta continuación

- **H-07 Vercel (causa del despliegue fallido).** El bot de Vercel en #184 publica el error exacto: «`ignoreCommand` should NOT be longer than 256 characters». #182 (solo documentación) también falla en Vercel, así que el fallo no lo causaba el contenido de #183. `main` ya mide 266 desde que #178 añadió su rama: con alta probabilidad, el despliegue de producción de `main` posterior a #178 tampoco pasa la validación. La lista de ramas pasa a `frontend/scripts/vercel-ignore.sh` (misma semántica); `ignoreCommand` queda en 27 caracteres y una prueba fija el límite.
- **H-04 rotación.** Cada refresh (negocio y Super Admin) emite una cookie con `jti` nuevo, mismo `sid` y el vencimiento absoluto original (no se alarga la sesión). La rotación se serializa con `SELECT … FOR UPDATE`. La cookie recién sustituida vale `AUTH_REFRESH_GRACIA_SEGUNDOS` (120 s por defecto, tope 600) sin volver a rotar, para pestañas concurrentes y respuestas perdidas. Cualquier otra (sustituida fuera de la gracia, más antigua o con `jti` inventado) revoca la sesión completa (`REUTILIZACION_REFRESH`) y su access token deja de valer. Las sesiones previas al despliegue (refresh sin `jti`) se aceptan una vez y pasan a rotar: nadie pierde la sesión por el cambio. **NEXUS:** migración aditiva `20261021000000_sesiones_auth_rotacion_refresh` (3 columnas nulas, compatible con el código anterior) y reversión manual sin sentencias activas.
- **H-05 CSRF.** `OrigenPermitidoGuard` en login, refresh y logout (negocio y Super Admin): se acepta un `Origin` de los orígenes de CORS (`FRONTEND_URL[S]` + locales) o `Sec-Fetch-Site: same-origin` (frontend que llega por un proxy en `/api` sin `FRONTEND_URL`; la cabecera la fija el navegador y ninguna página puede falsificarla). Cualquier otro `Origin`, o `cross-site`/`same-site` sin origen autorizado, recibe 403. La primera versión no contemplaba el proxy del mismo origen: lo detectaron en CI las pruebas con Chromium real (`REAL_SETTINGS_BROWSER=1`) y se corrigió. CORS ya impedía que esos orígenes leyeran la respuesta, por lo que ningún cliente legítimo cambia. Los endpoints con Bearer no dependen de la cookie.
- **CSP (H-02).** `script-src 'self' 'wasm-unsafe-eval'` (sin `unsafe-inline` ni `unsafe-eval`), estilos en línea y Google Fonts, `connect-src 'self' https: data:`, `img-src` con `blob:`/`data:`, `worker-src 'self' blob:`, `frame-ancestors 'self'`, `object-src 'none'`. La primera versión bloqueaba el PDF del comprobante (react-pdf carga su WASM con `fetch(data:)`): lo detectó la prueba y se ajustó. `connect-src https:` es deliberadamente amplio para no depender del dominio exacto del API en Render.
- **Cabeceras del API (H-09).** `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, CSP `default-src 'none'`, COOP, HSTS solo en producción, sin `X-Powered-By`. Sin dependencias nuevas.
- **H-08 privacidad.** El login ya no escribe el correo (el limitador ya lo guardaba solo como hash). Los errores de soporte y contingencia registran tipo, código Prisma y la primera línea del mensaje.

### Aislamiento multi-tenant, roles y Super Admin (verificado, sin defectos)

`test/aislamiento-barrido.postgres.integration.ts` arranca `AppModule` completo con PostgreSQL y enumera **todas** las rutas registradas:
- ADMIN y CAJERO de la empresa B contra cada ruta con identificadores reales de A (todas las tablas con `tenant_id`, números de venta, códigos): ninguna respuesta exitosa contiene datos o ids de A, y la huella de todas las filas de A no cambia, también con POST/PUT/PATCH/DELETE.
- Token de Super Admin (sin `tenantId`): ninguna ruta de negocio lo acepta. Rutas de plataforma: 403 para ADMIN y CAJERO. `@Roles`: 403 para el CAJERO en cada ruta que no lo incluye.
- Solo 7 rutas no declaran roles, revisadas una a una (propia sesión, lecturas de inventario sin costos, fin de soporte); una ruta nueva sin roles hace fallar la prueba.
- Prueba de mutación manual: quitar el filtro `tenantId` de `GET /productos/:id` hace fallar el barrido.
- **Sucursales:** las operaciones no tienen sucursal en el esquema (ver contexto maestro), así que no hay selección de sucursal que autorizar. **Rol Contador:** no existe en `main`; lo introduce el PR #180 (migración `20261020000000_rol_contador`), que no se modificó. Sus permisos deben revisarse en ese PR.
- **Impersonación:** ya restringida y auditada (motivo obligatorio, solo lectura por defecto, escritura con confirmación explícita, trazas y revocación). El barrido confirma que el token de Super Admin no opera directamente en rutas de negocio.

### H-03: por qué no se migra el access token a memoria en este PR

Cambiar a token solo en memoria exige reescribir `authInterceptors`, `sessionValidation`, `TenantContext`, el soporte (token original del Super Admin) y la coordinación entre pestañas, que hoy dependen de `localStorage` síncrono. También la contingencia offline: tras recargar sin red no habría token hasta poder renovar. Un cambio incompleto dejaría usuarios sin acceso, que es lo que se pidió evitar. La CSP aplicada cubre el vector principal (scripts inyectados) y la prueba de control lo demuestra. Queda como diseño posterior con E2E multipestaña, soporte y offline.

### Pruebas de esta continuación (locales; los checks por SHA están en el PR)

| Suite | Resultado |
|---|---|
| Backend unitarias | 57 archivos, **554/554** |
| Backend integración PostgreSQL 16 temporal (completa, con `REAL_SETTINGS_BROWSER=1` como CI) | **63 archivos, 1037/1037** (antes fallaron dos arneses con listas fijas de migraciones y, en CI, dos pruebas con Chromium real por el guard CSRF; ambos corregidos y repetida completa) |
| Backend `test:e2e` (caída y recuperación real de PostgreSQL) | 6/6 |
| Backend scripts, build, lint, `tsc` | 48/48, sin errores |
| Frontend unitarias, `tsc -b`, lint, build | **481/481**, sin errores, 117 avisos = base |
| Navegador simulado completo (Chromium 1194) | **225/225** |
| Sesiones móviles (Pixel 7 emulado) | 16/16 |
| Piloto real (`e2e-real`: API compilada + PostgreSQL + Chromium, sin simulación) | **153 pasan / 10 omitidas preexistentes «PENDIENTE»** |
| CSP con cabeceras de `vercel.json` + cámara con dispositivo falso de Chromium | 6/6 |

**No ejecutado / no certificado:** Safari/WebKit (no descargable por proxy), iPhone físico, PWA instalada en iOS, impresoras físicas y cámara física; despliegue real en Vercel y Render.

### Render y Vercel: comprobaciones que faltan (sin acceso a los proveedores)

1. **Render, antes del merge** (`main` se despliega automáticamente): `NODE_ENV=production`, `JWT_SECRET` privado (H-01 impide arrancar sin él), `TRUST_PROXY=1`, `FRONTEND_URLS` con el dominio real del frontend (ahora también autoriza login/refresh/logout), `CONTINGENCIA_CLAVE_OPERACIONES`, `DATABASE_URL`/`DIRECT_URL` y Health Check `/api/health`. Solo nombres: no se leyeron ni se cambiaron valores.
2. **Orden de migración y backend.** Según el dueño, Render arranca con `npx prisma migrate deploy && node dist/main.js`, no con `start:prod`: al hacer merge, la migración `20261021000000` se aplica sola antes de iniciar el backend nuevo, y si falla el backend nuevo no inicia. Orden seguro: **respaldo de la base → merge → despliegue automático (migración + backend)**. La migración es aditiva y compatible con el backend anterior, que puede seguir atendiendo durante el cambio; un retroceso a código anterior también funciona con las columnas nuevas. **Ensayo local del 2026-10-21:** base con las 26 migraciones de `main` y una sesión abierta por el backend anterior → `migrate deploy` del PR aplica solo `20261021` → backend del PR en `NODE_ENV=production` arranca (`/api/health` 200, cabeceras presentes) → la cookie anterior renueva (200, `Secure; SameSite=None`), vuelve a valer en la gracia y desde otro origen recibe 403. No se ejecutó nada en Render ni en Supabase.
3. **Vercel:** `main` ya incluye la corrección del esquema (#187, la misma de este PR; el conflicto se resolvió conservando su script). Confirmar en el panel que el despliegue de producción de `main` posterior a #187 pasó y que `VITE_API_URL` existe en Production. Tras el merge de este PR, comprobar con `curl -I` que se sirven la CSP y las demás cabeceras.
4. **Límite heredado (no causado por este PR), reproducido por Codex sobre `4456b8a`:** con frontend (Vercel) y API (Render) en **sitios distintos**, si el navegador bloquea las cookies de terceros, el login responde 200, pero la cookie de refresh no se guarda y la siguiente renovación da 401. La sesión dura lo que el access token (15 min). Safari en iPhone bloquea esas cookies por defecto. Con cookies de terceros permitidas, ADMIN, CAJERO y Super Admin completan login → rotación → logout. `refresh-cookie.ts` no cambia en este PR. Soluciones posibles, a decidir por el dueño: servir la API en el mismo sitio que el frontend (p. ej. `app.dominio` y `api.dominio`) o un *rewrite* de Vercel de `/api` hacia Render (mismo origen). Validar en los dominios y navegadores reales antes de certificar el despliegue.
5. Probar en el dominio real: login, POS, descarga del comprobante, escáner en iPhone/Safari y PWA instalada.

## Resumen (revisión inicial, histórico)

| Criticidad | Hallazgos | Estado |
|---|---|---|
| Alta | 1 | Corregido (`H-01`) |
| Media | 1 corregido, 2 pendientes | `H-02` corregido; `H-03` y `H-04` pendientes |
| Baja | 2 pendientes | `H-05` y `H-06` sin cambio |

## Hallazgos

### H-01 · Alta · Secreto JWT público aceptado fuera de producción (corregido)

- **Causa:** `getJwtSecret` usaba el secreto constante `ferresystem-super-secure-dev-secret-key-2026` cuando `JWT_SECRET` no estaba definido, salvo que `NODE_ENV === 'production'`. Un despliegue sin `NODE_ENV` (o con `staging`) firmaba y verificaba con un secreto público: cualquiera podía emitir tokens válidos de cualquier negocio y del Super Admin.
- **Reproducción previa:** prueba con `NODE_ENV` sin definir → `expected [Function] to throw an error` (el código anterior devolvía el secreto público).
- **Corrección final de PR #183:** el secreto local solo se usa con `NODE_ENV` normalizado a `development` o `test`. En cualquier otro caso `JWT_SECRET` es obligatorio: se rechazan ausencia, vacío, espacios, la constante pública de desarrollo y el placeholder de la antigua `.env.example`, incluso configurados explícitamente. Se conservan exactamente los bytes de una clave privada válida para no invalidar sesiones por recorte. La plantilla deja la clave vacía e indica cómo generar una aleatoria. Firma y verificación usan el mismo helper (`AuthModule` y `JwtStrategy`).
- **Regresión adicional:** seis fallos reproducidos sobre el HEAD recibido (cuatro entornos con secreto público explícito y dos claves solo de espacios). Nuevos casos cubren también el placeholder, espacios alrededor del secreto público y mensajes sin valores secretos. No se impone una nueva longitud mínima a claves privadas existentes en este PR.
- **Archivos:** `backend/src/auth/jwt-secret.ts`, `backend/src/auth/jwt-secret.spec.ts` (+1 caso con `NODE_ENV` ausente, `staging`, `Production` y `test`).
- **Riesgo residual:** un despliegue que no defina `JWT_SECRET` ahora falla al arrancar. Antes de desplegar, confirmar en Render que `JWT_SECRET` existe y que `NODE_ENV=production`. No verificado desde aquí.

### H-02 · Media · Frontend sin encabezados de seguridad (corregido)

- **Causa:** `frontend/vercel.json` no definía ningún encabezado.
- **Corrección:** `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(self), microphone=(), geolocation=(), payment=()` y `Strict-Transport-Security: max-age=63072000`.
- **Decisión:** `camera=(self)` se mantiene porque el escáner de código de barras la necesita. **No se añadió `Content-Security-Policy`**: la app usa estilos en línea, fuentes externas, service worker y el API en otro dominio, y no se puede validar una CSP sin ejecutar la aplicación completa en un navegador real. Queda pendiente (ver riesgos).
- **Archivos:** `frontend/vercel.json`, `frontend/test/vercel-security-headers.test.mjs` (7 casos de cabeceras; guard aparte).
- **Compatibilidad revisada:** `camera=(self)` permite `getUserMedia` desde la app en HTTPS; `microphone=()` no afecta al escáner, que solicita solo vídeo y usa `playsInline`. No se restringen `connect-src`, `worker-src`, imágenes, estilos ni fuentes: se mantienen API externa, Google Fonts, manifiesto, iconos y `/sw.js`. `SAMEORIGIN` permite uso directo y PWA; bloquea incrustación desde otro origen. Esto no certifica Safari, cámara física ni PWA instalada en iPhone.
- **Sin despliegue automático:** esta rama queda excluida de previews mediante `git.deploymentEnabled` e `ignoreCommand`, con pruebas de coincidencia exacta. `main` conserva su comportamiento. La exclusión no resuelve ni aprueba el fallo Vercel anterior.

### Protección de salidas de diagnóstico (continuación de PR #183)

- El login registraba errores/stack de Prisma y bcrypt y devolvía un `code` sin validar. Se conservan mensajes fijos y solo códigos Prisma con formato `P` + cuatro dígitos; cualquier otro código se transforma en `N/A`. No cambian estados HTTP, cookies ni reglas de sesión.
- La conexión Prisma y `health/db` dejan de escribir errores crudos. El arranque tolerante ante indisponibilidad de BD y la respuesta de salud se conservan. Pruebas inyectan credenciales sintéticas para verificar logs y respuestas del login y del endpoint de salud.
- No se encontró clave privada versionada ni uso de `JWT_SECRET`/credenciales de BD en el frontend. El access token enviado al cliente es parte del contrato de autenticación; su almacenamiento es H-03. No se inspeccionaron logs ni variables productivos.
- Límite del análisis: quedan otros diagnósticos con errores crudos en contingencia y auditoría de soporte, ajenos a las correcciones de autenticación. Se recomienda revisión posterior de redacción centralizada (P2); no se certifica ausencia absoluta de datos sensibles en todo error futuro ni se modifica POS/inventario/caja.

### H-03 · Media · Token de acceso en `localStorage` (pendiente)

- **Evidencia:** `frontend/src/pages/LoginPage.tsx:35,52` y `frontend/src/context/TenantContext.tsx:184,185,222,243` guardan `ferre_token`; durante una sesión de soporte también `ferre_original_superadmin_token`.
- **Riesgo:** cualquier XSS futuro puede leer el token. Hoy no se encontraron sumideros (`dangerouslySetInnerHTML`, `innerHTML`, `eval`, `document.write` no aparecen en `frontend/src`).
- **Propuesta:** conservar el access token solo en memoria y renovarlo con la cookie `httpOnly` de refresh que ya existe. Cambia el flujo de sesión del frontend: requiere autorización y pruebas E2E reales (`e2e-real`).

### H-04 · Media · Refresh token sin rotación ni detección de reutilización (pendiente)

- **Evidencia:** `docs/AUTENTICACION_FASE3_SESIONES_20261010.md` lo registra como decisión: el refresh no rota para no romper pestañas concurrentes.
- **Riesgo:** una cookie robada sirve hasta 7 días o hasta el cierre de sesión. El logout y el cambio de contraseña sí revocan la sesión.
- **Propuesta:** rotación con ventana de gracia y detección de reutilización. Requiere diseño, no es un cambio mínimo.

### H-05 · Baja · Cierre de sesión forzado desde otro sitio (pendiente)

- **Evidencia:** `POST /auth/logout` revoca la sesión identificada solo por la cookie `refreshToken` (`backend/src/auth/auth.service.ts:331`). En producción la cookie es `SameSite=None`, así que un formulario de otro sitio puede cerrar la sesión de la víctima.
- **Impacto:** cierre de sesión forzado; no expone datos.
- **Propuesta:** exigir un cuerpo JSON (`Content-Type: application/json`), que dispara preflight y CORS lo bloquea desde orígenes no permitidos. Requiere que el frontend envíe ese encabezado en su llamada de cierre.

### H-06 · Baja · Endpoint de salud de base de datos público (sin cambio)

- **Evidencia:** `GET /api/health/db` (`backend/src/app.controller.ts`) no exige autenticación y está marcado como `TEMPORAL`.
- **Impacto:** revela solo si la base responde (`ok`/`error`), sin datos de negocio.
- **Propuesta:** retirarlo tras validar la conexión de Render, o protegerlo.

## Verificado sin hallazgo

- **Autenticación:** `JwtStrategy` revalida en cada petición que el usuario esté activo, la empresa `ACTIVO` y la sesión `sid` vigente. Un refresh (`typ: refresh`) no sirve como token de API. Ante error de infraestructura responde 503 y no revoca nada. Límite de intentos por cuenta e IP con `Retry-After`.
- **Aislamiento multi-tenant:** el `tenantId` sale del token, no del cuerpo. Solo `POST /admin/support/token` acepta `tenantId` del cliente, y ese endpoint exige `SuperAdminGuard`. Se revisaron las escrituras por `id` sin filtro explícito (`super-admin`, `usuarios`, `productos`, `levantamientos`, `proveedores`, `costo-inicial`, `contingencia`, `tenant-logo`): todas van precedidas de una lectura con `tenantId` o de una validación de sesión.
- **Inyección SQL:** las consultas usan parámetros `$n`. Los `$queryRawUnsafe` (`dashboard.service.ts`, `ledger.ts`) reciben valores ligados; las interpolaciones que aparecen son solo índices de parámetro.
- **Roles:** cada handler de los controladores de negocio tiene `@Roles`, `@RequiredPermission` o `SuperAdminGuard`. Las excepciones son login, refresh, logout y salud, que son públicas por diseño. El rol `SUPERADMIN` no existe en el enum `Rol` de la base, así que un usuario de negocio no puede obtenerlo. `GET /operaciones/auditoria` exige `SUPERADMIN`.
- **CORS:** lista exacta de orígenes, sin comodines; `credentials` solo para orígenes listados.
- **Cookies:** `httpOnly`; `Secure` y `SameSite=None` en producción.
- **Validación de entrada:** `ValidationPipe` con `whitelist: true` (sin asignación masiva), límite de profundidad JSON, `solicitudId` obligatorio en ventas (DEF-03).
- **Secretos versionados:** ningún `.env` en Git. Escaneo de patrones de claves y URL de base con contraseña: sin credenciales reales (el único positivo es una URL de prueba `source.invalid`).
- **Dependencias:** `npm audit --omit=dev` en backend y frontend: 0 vulnerabilidades reportadas.

## Pruebas de la revisión inicial (HEAD `541de7cf`, no certifican el HEAD posterior)

| Suite | Resultado |
|---|---|
| Backend unitarias (`vitest run`) | 53 archivos, **530/530** |
| Backend integración PostgreSQL 16 temporal, usuario `nobody`: `autenticacion-fase3` + `seguridad-fase2` | **47/47** |
| Backend `tsc -p tsconfig.build.json --noEmit` | sin errores |
| Frontend unitarias (`npm test`) | **475/475** |
| Frontend `vercel-security-headers` + `vercel-pilot-guard` | 25/25 |
| Reproducción roja de H-01 con el código anterior | falla como se describe |

**No ejecutado:** Playwright simulado, `e2e-real` (backend, PostgreSQL y navegador reales), suite PostgreSQL completa, validación de cabeceras en Vercel, configuración real de Render. Las cabeceras de `vercel.json` no se han comprobado en un despliegue.

## Revalidación del PR #183 y dependencias externas

- Rama existente `claude/revision-seguridad-jowa-20261020`. `main` `c4cadc34a4b67de3052b076cfd646813e5afc6d8` ya es ancestro: no requiere merge ni presenta conflictos. Sin rebase, force push, migraciones, dependencias nuevas, merge del PR ni despliegue manual.
- Se repiten unitarias, builds/lint, autenticación/roles/tenants en PostgreSQL temporal y navegador. La evidencia y los resultados definitivos se registran por SHA en [PR #183](https://github.com/Nelosama/FerreSystem/pull/183); los checks anteriores no validan nuevos commits. Configuración de cabeceras/guard: **29/29** locales; build de frontend con API HTTPS sintética correcto. Sin aceptación física de iPhone.
- Entorno local: Node 24.19, instalación limpia frontend; la primera instalación backend falló descargando motores Prisma (`ECONNRESET`). Se reinstaló desde lock con `--ignore-scripts`, se descargaron los motores oficiales por HTTPS mediante el proxy y se generó Prisma 6.4.1 explícitamente. PostgreSQL 17.11 se extrajo en `/tmp` y se ejecuta sin root, sin usar bases externas. No se desactivó TLS ni se cambiaron dependencias para salvar el entorno.
- **Render pendiente:** sin conexión al proveedor ni credenciales. `api.render.com` rechazado por la política de red (CONNECT 403). No se verificaron presencia de `JWT_SECRET`, su carácter privado ni `NODE_ENV=production` real; el `.env.example` no acredita configuración productiva. Confirmarlos antes del merge/despliegue para evitar caída de arranque. Tampoco se verificó `TRUST_PROXY`.
- **Vercel bloqueado:** GitHub registra `failure` para `541de7cf`, deployment `dpl_8Yx5j2LHrVnmiQWU9Xa7ht7uENWm`, con indicación de consultar `vercel inspect ... --logs`. [Deployment original](https://vercel.com/nelspace/ferre-system/8Yx5j2LHrVnmiQWU9Xa7ht7uENWm). El panel Vercel también está rechazado por red y no hay credencial Vercel. No se dispone de logs de build ni de cabeceras servidas: la causa permanece sin determinar. No se atribuye a las cabeceras ni se modifica una configuración válida por conjetura. Build local y CI no sustituyen el deployment del proveedor.
- **Veredicto condicionado: NO MERGE** mientras Render no esté verificado y el fallo Vercel original no tenga diagnóstico revisable. Una preview excluida/cancelada no cuenta como deployment aprobado. El PR permanece en borrador.

## Priorización residual (revisión inicial, histórico — ver «Estado vigente»)

| Hallazgo | Prioridad | Riesgo y criterio de cierre |
|---|---|---|
| H-03 | P2; subir a P1 ante XSS | Robo de tokens, especialmente el original Super Admin en soporte. Access token en memoria, restauración por refresh y E2E multipestaña/soporte; CSP validada como defensa adicional. |
| H-04 | P2; P1 ante indicio de robo | Reutilización de refresh hasta expiración/revocación. Diseñar familias, rotación, gracia para pestañas concurrentes y detección de reutilización. |
| H-05 | P3 | CSRF de logout: interrupción de sesión, sin lectura de datos. Verificar Origin/CSRF o contrato JSON con rechazo de tipos simples; cubrir tenant y Super Admin antes de cambiar clientes. |
| H-06 | P3 | Estado de BD público y consultas repetibles. Retirar/proteger tras confirmar qué monitor lo usa; conservar un liveness sin BD para no romper disponibilidad. |

P1 = atención inmediata; P2 = siguiente ciclo de seguridad; P3 = mejora planificada. La verificación Render y el diagnóstico Vercel son bloqueos de liberación de este PR, independientes de estos cuatro pendientes.

## Riesgos pendientes y decisiones

1. Antes de desplegar: confirmar `JWT_SECRET` y `NODE_ENV=production` en Render (H-01 cambia el arranque).
2. Decidir H-03 (token de acceso fuera de `localStorage`) y H-04 (rotación de refresh). Son cambios de flujo de sesión.
3. Validar en navegador real una `Content-Security-Policy` antes de añadirla.
4. Decidir H-05 y retirar o proteger H-06.
5. Sin verificar: infraestructura de producción, respaldos, `TRUST_PROXY` en Render y política de cabeceras del backend.
