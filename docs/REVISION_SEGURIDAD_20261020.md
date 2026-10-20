# Revisión de seguridad — FerreSystem / Jowa System (2026-10-20)

**Rama:** `claude/revision-seguridad-jowa-20261020`, desde `main` `c4cadc3` (igual que `origin/main`).
**PR abiertos al iniciar:** #180 (`feat/contabilidad-honduras`, borrador) y #181 (`claude/impeccable-init`). No se tocaron.
**Alcance:** autenticación y sesiones, aislamiento multi-tenant, roles y permisos, frontend, operaciones críticas e infraestructura en el código versionado.
**Sin:** merge, despliegue, acceso a producción, datos reales ni consultas a Render, Vercel o Supabase (no accesibles desde esta sesión).

## Resumen

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

## Priorización residual (sin ampliar cambios de sesión)

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
