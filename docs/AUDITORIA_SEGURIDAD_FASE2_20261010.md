# Auditoría de seguridad fase 2 — FerreSystem (2026-10-10)

**Base analizada:** `origin/claude/integracion-pos-offline-p1` (`bc0a0125`), que integra #127 y #128 (#129). Rama de trabajo: `claude/security-audit-fase-2`. No se modificó #127, #128 ni #129; no hay merge a `main`, despliegue ni migraciones productivas.

**Alcance:** backend NestJS + Prisma + PostgreSQL. Autenticación, guards, aislamiento por `tenantId`, matriz de roles, costos, tokens, oráculos de cuenta y pruebas negativas entre empresas. El frontend se revisó solo para confirmar qué roles usan cada ruta.

**Método:** cada hallazgo se reprodujo primero con una prueba que falla contra el código de #129 y después se corrigió. Las pruebas de PostgreSQL usan un clúster temporal y dedicado (initdb/pg_ctl de PostgreSQL 16). Se ejecutaron como usuario no root porque initdb se niega a correr como root.

## 1. Matriz de riesgos

| ID | Severidad | Hallazgo | Evidencia de reproducción (antes) | Estado |
|---|---|---|---|---|
| SEC-01 | HIGH | Costo de línea de venta (`costo_unitario`) visible a VENDEDOR en `GET /api/operaciones/ventas/buscar` y a BODEGUERO sin `inventario.ver` en `GET /api/operaciones/entregas`. La regla de productos ya restringía costos; el interceptor de costos solo ocultaba para CAJERO. | `test/seguridad-fase2.postgres.integration.ts`: 2 fallos por `costo_unitario` presente | Corregido |
| SEC-02 | MEDIUM | BODEGUERO leía el historial de ventas (`GET /api/ventas`, `GET /api/ventas/:id`) y las cotizaciones (`GET /api/cotizaciones`), que incluyen RTN, teléfono, correo y dirección del cliente. Ambos controladores no tenían `@Roles` en los GET. | Respuesta 200 donde se esperaba 403 (3 casos) | Corregido |
| SEC-03 | MEDIUM | El refresh token (7 días, cookie) era aceptado como token de acceso en cualquier endpoint de API, porque tenía la misma forma y firma que el access token. | `GET /api/auth/me` con refresh token → 200 | Corregido (ver riesgo R-01) |
| SEC-04 | MEDIUM | Un Super Admin desactivado conservaba acceso con su token vigente. La estrategia JWT no revalidaba `superAdmin.activo` en las peticiones. | `GET /api/auth/me` tras `activo=false` → 200 | Corregido |
| SEC-05 | LOW | Oráculo de cuenta: el login revelaba «usuario desactivado» o «suscripción suspendida» antes de verificar la contraseña. Cualquiera podía saber si un correo era una cuenta inactiva o de una empresa suspendida. | Prueba unitaria: mensaje distinto con contraseña incorrecta | Corregido |

### Controles verificados sin hallazgo

- **Aislamiento entre empresas (PostgreSQL):** una venta de otra empresa no se lee por id (404) ni por número (404); el historial de otra empresa no incluye ventas ajenas; un token de empresa B no ajusta existencias de la empresa A (rechazado con 4xx, existencias sin cambio).
- **Costo para CAJERO:** sigue oculto (regresión cubierta).
- **Detalle de venta y cotización:** `ventas.findById`, `formatVentaCreada` y `formatCotizacion` remapean `detalles` a campos explícitos. No devuelven `precioCosto` ni `costoVigente`. Esta hipótesis se descartó antes de reclamarla.
- **Contingencia:** el catálogo que se envía al equipo POS no incluye costo (`construirCatalogo` lo retira explícitamente).
- **Usuarios:** `select` excluye `passwordHash`. Las respuestas de usuario no exponen hashes.
- **Auditoría:** `audit()` registra tenant, usuario, operación, entidad, datos y fecha. El endpoint de auditoría limita a 100 filas por página y maneja página inválida.
- **Salud (`/health/db`):** no expone detalle de error.
- **CORS:** lista blanca de orígenes exactos con credenciales; no hay comodines.
- **Interceptor de soporte:** las sesiones de impersonación son de solo lectura salvo `readOnly:false` explícito.
- **Contraseñas:** bcrypt; política de contraseñas en `password-policy.ts`.

## 2. Correcciones aplicadas

1. **SEC-01 — `src/common/interceptors/cashier-response.interceptor.ts`.** La regla de costos ahora es la misma que la de productos (`canReadProductFinancials`): quien no tiene lectura financiera no recibe ningún campo de costo. Se añadieron `costoVigente` y `costo_vigente` a la lista de campos ocultos (defensa en profundidad; no se reprodujo fuga por esos campos).
2. **SEC-02 — `src/ventas/ventas.controller.ts` y `src/cotizaciones/cotizaciones.controller.ts`.** `@Roles('ADMIN','CAJERO','VENDEDOR')` a nivel de clase. Los endpoints con `@Roles` propio lo sobrescriben como antes. El frontend solo usa `/ventas` en Comisiones (ADMIN) y `/cotizaciones` en ADMIN, VENDEDOR y CAJERO; ningún flujo de BODEGUERO cambia.
3. **SEC-03 — `src/auth/auth.service.ts`, `src/super-admin/super-admin.service.ts`.** Los refresh tokens se firman con `typ: 'refresh'`. Los endpoints de refresh exigen ese tipo. `src/auth/jwt.strategy.ts` rechaza `typ === 'refresh'` como credencial de API. Los access tokens no cambian de formato.
4. **SEC-04 — `src/auth/jwt.strategy.ts`.** Para `type: 'super_admin'`, se consulta `superAdmin.activo` en cada petición. Si no está activo o no existe, 401.
5. **SEC-05 — `src/auth/auth.service.ts`.** La contraseña se verifica antes de comprobar `activo` y el estado de la empresa. Con contraseña correcta, los mensajes de estado siguen igual (cubierto por las pruebas existentes).

### Ajustes de fixtures en pruebas existentes (no cambian el comportamiento esperado)

- `src/auth/auth.service.spec.ts` («refresca únicamente una sesión tenant activa») y `src/super-admin/super-admin.service.spec.ts` («refreshes only active super-admin sessions»): el fixture de `verify` ahora declara `typ: 'refresh'`, porque un refresh sin tipo ya no se acepta.
- `src/productos/productos-security.http.spec.ts`: el mock de Prisma incluye `superAdmin.findUnique`. La prueba sigue esperando 403 para una identidad de plataforma válida en un endpoint de tenant.

## 3. Pruebas

| Archivo | Tipo | Antes | Después |
|---|---|---|---|
| `test/seguridad-fase2.postgres.integration.ts` (nuevo, 16 pruebas) | Integración PostgreSQL 16, clúster temporal | 6 fallos reproducidos + 10 controles | 16/16 |
| `src/auth/auth.security.spec.ts` (nuevo, 4 pruebas) | Unitaria | 2 fallos reproducidos + 2 controles | 4/4 |

**Suites completas tras los cambios**

- Backend unitarias: 37 archivos, **349/349** (línea base 345/345; +4 nuevas).
- Backend integración PostgreSQL (cadena completa, usuario no root): 22 archivos, **381 aprobadas, 1 omitida**. La línea base previa al cambio fue 21 archivos, 365 aprobadas, 1 omitida; la omitida ya existía.
- `tsc -p tsconfig.build.json`: sin errores.
- `oxlint` sobre los archivos tocados: sin avisos.

**Limitaciones de las pruebas**

- No se probó contra la base de datos de producción ni contra el despliegue en Render/Supabase.
- `tsc` sobre `test/` y sobre specs reporta globales de Vitest (`describe`, `vi`) como no encontrados. Es el mismo estado que ya tiene el repositorio; no se introdujo nada nuevo.
- Playwright y las pruebas de frontend no se ejecutaron en esta fase, porque el cambio es solo de backend.

## 4. Riesgos pendientes (no corregidos)

| ID | Severidad | Riesgo | Por qué no se corrigió | Recomendación |
|---|---|---|---|---|
| R-01 | MEDIUM | Los refresh tokens emitidos **antes** del despliegue no llevan `typ` y siguen aceptándose como token de API hasta su vencimiento (≤7 días). | Sin `typ` no hay forma de distinguirlos de un access token sin romper las sesiones activas. | Rotar `JWT_SECRET` en el despliegue (invalida todos los tokens) o esperar 7 días. Los usuarios tendrán que volver a iniciar sesión una vez. |
| R-02 | MEDIUM | **Sin limitación de intentos en `/auth/login`** ni bloqueo por cuenta. Permite fuerza bruta. | Requiere dependencia (`@nestjs/throttler` o un almacén compartido) y decisión de infraestructura; hay varias instancias posibles. | Limitación por IP y por correo, con almacén compartido. Requiere decisión del dueño. |
| R-03 | MEDIUM | **Logout no revoca tokens.** Un access token robado sigue válido hasta vencer (15 min); un refresh, hasta 7 días. | Stateless por diseño. Revocar exige versión de token en BD o lista de revocación. | Campo `tokenVersion` en `usuarios` y `super_admins` (migración aditiva, revisada por DBA). |
| R-04 | MEDIUM (decisión de negocio) | ADMIN y BODEGUERO pueden cambiar `precioCosto` a mano, fuera de la regla de última recepción. Ya está documentado como decisión D1 en `CONTEXTO_MAESTRO.md`. | Decisión de negocio, no de seguridad pura. | Ver D1: bloquear, o permitir solo ADMIN con motivo obligatorio. |
| R-05 | LOW–MEDIUM (decisión de negocio) | VENDEDOR y CAJERO ven ventas y cotizaciones de **toda** la empresa, no solo las propias (CAJERO ya está limitado a las propias en ventas). | Política de visibilidad; no está especificada en los requisitos. | Definir si VENDEDOR también se limita a sus registros. |
| R-06 | LOW | El detalle de venta y de cotización incluye `tenant: true`: plan, estado, correo, teléfono y dirección de la empresa, visibles a los roles operativos. | Cambiar la forma de la respuesta puede afectar impresión o integraciones; no se verificó todo su uso. | Reducir a nombre comercial y datos de impresión. |
| R-07 | LOW | Oráculo de existencia en idempotencia: `solicitudId` de otra empresa responde 409 en vez de crear, lo que revela que el id existe. No revela datos. | Los UUID no son adivinables; el riesgo es solo de existencia. | Consultar siempre con `tenantId` en la búsqueda previa. |
| R-08 | LOW | Logs de login (`LOGIN_DIAGNOSTIC`) registran correo y ids de usuario. | Son útiles para soporte. | Reducir a id y eliminar el correo de los logs de producción. |
| R-09 | LOW | Si `NODE_ENV` no es `production` y no hay `JWT_SECRET`, el API usa un secreto fijo de desarrollo, incluido en el código. | En producción el arranque falla sin `JWT_SECRET` (`jwt-secret.ts`). No se pudo verificar la configuración de Render en esta sesión. | Confirmar en Render que `NODE_ENV=production` y `JWT_SECRET` están definidos. |
| R-10 | No verificado | Respaldos, restauración y configuración real de producción (E03, E05 en `CONTEXTO_MAESTRO.md`). | Fuera del alcance de código de esta fase. | Revisión operativa aparte. |

## 5. Coordinación con otros agentes

- **Archivos modificados:** `cashier-response.interceptor.ts`, `ventas.controller.ts`, `cotizaciones.controller.ts`, `auth.service.ts`, `jwt.strategy.ts`, `super-admin.service.ts`, sus specs y `productos-security.http.spec.ts`, y `docs/CONTEXTO_MAESTRO.md` (solo un bloque nuevo).
- **Solapamientos con PR abiertos:** #130 y #131 no tocan estos archivos. #131 modifica `docs/CONTEXTO_MAESTRO.md`; el bloque de este PR se añadió aparte, pero puede haber conflicto de texto al integrar.
- **No se pudo verificar en tiempo real** qué archivos están editando Claude 1 o Claude 2 fuera de GitHub. La decisión de tocar estos archivos se tomó porque no aparecen en #127–#131.
- **Pendiente antes de merge:** confirmar con el dueño y con los agentes de integración que no hay trabajo en curso sobre `auth` ni sobre los controladores de ventas y cotizaciones.

## 6. Notas de despliegue

- No hay migraciones. Ningún esquema cambió.
- Efecto visible: las sesiones con refresh token anterior al despliegue dejan de renovarse; el usuario inicia sesión de nuevo una vez (R-01).
- BODEGUERO ya no ve ventas ni cotizaciones; VENDEDOR ya no ve costo de línea de venta. Ninguna pantalla del frontend usa esos datos para esos roles.
- Un Super Admin desactivado pierde acceso en la siguiente petición, en vez de al vencer su token.
