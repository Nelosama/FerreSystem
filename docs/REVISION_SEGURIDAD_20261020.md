# Revisión de seguridad — FerreSystem / Jowa System (2026-10-20)

**Rama:** `claude/revision-seguridad-jowa-20261020`, desde `main` `c4cadc3` (igual que `origin/main`).
**PR abiertos al iniciar:** #180 (`feat/contabilidad-honduras`, borrador) y #181 (`claude/impeccable-init`). No se tocaron.
**Alcance:** autenticación y sesiones, aislamiento multi-tenant, roles y permisos, frontend, operaciones críticas e infraestructura en el código versionado.
**Sin:** merge, despliegue, acceso a producción, datos reales ni consultas a Render, Vercel o Supabase (no accesibles desde esta sesión).

## Resumen

| Criticidad | Hallazgos | Estado |
|---|---|---|
| Alta | 1 | Corregido (`H-01`) |
| Media | 2 corregidos, 2 pendientes | `H-02` corregido; `H-03` y `H-04` pendientes de decisión |
| Baja | 2 pendientes, 1 informativo | Sin cambio |

## Hallazgos

### H-01 · Alta · Secreto JWT público aceptado fuera de producción (corregido)

- **Causa:** `getJwtSecret` usaba el secreto constante `ferresystem-super-secure-dev-secret-key-2026` cuando `JWT_SECRET` no estaba definido, salvo que `NODE_ENV === 'production'`. Un despliegue sin `NODE_ENV` (o con `staging`) firmaba y verificaba con un secreto público: cualquiera podía emitir tokens válidos de cualquier negocio y del Super Admin.
- **Reproducción previa:** prueba con `NODE_ENV` sin definir → `expected [Function] to throw an error` (el código anterior devolvía el secreto público).
- **Corrección:** el secreto local solo se usa con `NODE_ENV` igual a `development` o `test`. En cualquier otro caso `JWT_SECRET` es obligatorio y la API no arranca.
- **Archivos:** `backend/src/auth/jwt-secret.ts`, `backend/src/auth/jwt-secret.spec.ts` (+1 caso con `NODE_ENV` ausente, `staging`, `Production` y `test`).
- **Riesgo residual:** un despliegue que no defina `JWT_SECRET` ahora falla al arrancar. Antes de desplegar, confirmar en Render que `JWT_SECRET` existe y que `NODE_ENV=production`. No verificado desde aquí.

### H-02 · Media · Frontend sin encabezados de seguridad (corregido)

- **Causa:** `frontend/vercel.json` no definía ningún encabezado.
- **Corrección:** `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(self), microphone=(), geolocation=(), payment=()` y `Strict-Transport-Security: max-age=63072000`.
- **Decisión:** `camera=(self)` se mantiene porque el escáner de código de barras la necesita. **No se añadió `Content-Security-Policy`**: la app usa estilos en línea, fuentes externas, service worker y el API en otro dominio, y no se puede validar una CSP sin ejecutar la aplicación completa en un navegador real. Queda pendiente (ver riesgos).
- **Archivos:** `frontend/vercel.json`, `frontend/test/vercel-security-headers.test.mjs` (6 casos).

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

## Pruebas ejecutadas

| Suite | Resultado |
|---|---|
| Backend unitarias (`vitest run`) | 53 archivos, **530/530** |
| Backend integración PostgreSQL 16 temporal, usuario `nobody`: `autenticacion-fase3` + `seguridad-fase2` | **47/47** |
| Backend `tsc -p tsconfig.build.json --noEmit` | sin errores |
| Frontend unitarias (`npm test`) | **475/475** |
| Frontend `vercel-security-headers` + `vercel-pilot-guard` | 25/25 |
| Reproducción roja de H-01 con el código anterior | falla como se describe |

**No ejecutado:** Playwright simulado, `e2e-real` (backend, PostgreSQL y navegador reales), suite PostgreSQL completa, validación de cabeceras en Vercel, configuración real de Render. Las cabeceras de `vercel.json` no se han comprobado en un despliegue.

## Riesgos pendientes y decisiones

1. Antes de desplegar: confirmar `JWT_SECRET` y `NODE_ENV=production` en Render (H-01 cambia el arranque).
2. Decidir H-03 (token de acceso fuera de `localStorage`) y H-04 (rotación de refresh). Son cambios de flujo de sesión.
3. Validar en navegador real una `Content-Security-Policy` antes de añadirla.
4. Decidir H-05 y retirar o proteger H-06.
5. Sin verificar: infraestructura de producción, respaldos, `TRUST_PROXY` en Render y política de cabeceras del backend.
