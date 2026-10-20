# Informe de Auditoría de Seguridad SaaS Multi-Tenant y QA Móvil — Jowa System

**Fecha:** 2026-10-20
**Proyecto:** FerreSystem / Jowa System
**Rama:** `jules-6650504171296380351-3c58c742` (PR #184)
**Evaluador:** Senior QA & Security Engineer
**Veredicto Final:** **READY FOR MERGE**

---

## 1. Resumen Ejecutivo

Se ha realizado una auditoría exhaustiva de seguridad, aislamiento multi-tenant, control de acceso basado en roles (RBAC), protección contra IDOR, validación de entradas, gestión de sesiones, PWA y experiencia móvil administrativa para **Jowa System**.

### Resultados Clave de la Evaluación
1. **Aislamiento Multi-Tenant e IDOR:** Se verificó que todas las consultas y mutaciones en el backend NestJS/Prisma aplican filtrado estricto por `tenantId` y bloqueos de fila transaccionales (`FOR UPDATE` / `lockTenant`). Intentos de acceso cruzado entre negocios devuelven `404 NotFoundException` o `403 ForbiddenException`.
2. **Autenticación y Revocación de Sesiones:** El sistema implementa un esquema robusto de tokens de dos capas (`accessToken` de 15 min y `refreshToken` de 7 días en cookie `httpOnly`). La tabla `sesiones_auth` y el mecanismo `sid` garantizan revocación inmediata en servidor al cerrar sesión. Ante caídas temporales de la base de datos, NestJS responde `503 ServiceUnavailableException` sin revocar innecesariamente las credenciales del usuario.
3. **Control de Acceso por Roles (RBAC):** Los guards (`JwtAuthGuard`, `TenantGuard`, `RolesGuard`, `TenantModuleGuard`, `SuperAdminGuard`) protegen eficazmente endpoints administrativos (`/usuarios`, `/configuracion`, `/tenant/settings`, `/precios`, `/contingencia-admin`). El rol `Contador` no está integrado en la base de datos ni en el esquema Prisma (`enum Rol { ADMIN, CAJERO, BODEGUERO, VENDEDOR }`).
4. **Experiencia Móvil Administrativa (`/admin-movil`):** La vista móvil para administradores es estrictamente de lectura gerencial (resumen de ventas, alertas de inventario, cuentas por vencer, saldos de clientes y solicitudes de autorización). No expone cobros, emisión de comprobantes ni funciones de caja transaccionales.
5. **PWA, Conectividad y Escáner de Cámara:** El Service Worker (`sw.js`, versión `ferresystem-shell-v2`) precarga el shell de la aplicación sin cachear endpoints privados `/api`. El componente `BarcodeScanner.tsx` gestiona el ciclo de vida de la cámara con soporte nativo `BarcodeDetector` y fallback dinámico a `@zxing/library`, liberando streams de video al plegar, desmontar, cambiar de pestaña o perder foco.
6. **Seguridad en Carga de Archivos e Insumos:** Las imágenes corporativas (`TenantLogoService`) se validan mediante la firma binaria de sus primeros bytes (`magic bytes`), admitiendo exclusivamente PNG, JPEG y WEBP hasta 2 MB y 4096 px. SVG y HTML son explícitamente rechazados para evitar XSS.

---

## 2. Cobertura de Pruebas Ejecutadas y Evidencia Técnica

### 2.1 Pruebas Unitarias y de Integración Backend (NestJS / Vitest)
* **Comando:** `npm test --prefix backend`
* **Resultado:** **529/529 pruebas pasadas** (53 archivos de prueba, 0 fallos).
* **Módulos evaluados:** `auth`, `usuarios`, `tenants`, `productos`, `ventas`, `cotizaciones`, `operaciones`, `contingencia`, `levantamientos`, `entregas`, `proveedores`, `costo-inicial`, `backup-status`.

### 2.2 Pruebas Unitarias Frontend (Node Native Test Runner)
* **Comando:** `npm test --prefix frontend`
* **Resultado:** **469/469 pruebas pasadas** (0 fallos).
* **Módulos evaluados:** `i18n`, `sessionValidation`, `taskNavigation`, `tenantSettings`, `autoRefresh`, `posCatalogo`, `barcodeScanner`, `formatoImpresion`, `importacionProductos`.

### 2.3 Pruebas Automatizadas de Navegador E2E (Playwright / Chromium)
* **Comandos:** `VITE_API_URL=/api npm run build --prefix frontend && PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run test:browser --prefix frontend`
* **Resultado:** **10/10 suites de prueba pasadas** (0 fallos).
* **Escenarios probados:**
  - `e2e/navigation-settings.spec.ts`: Roles, navegaciones TOPNAV y SIDEBAR, configuración por negocio, multilingüe ES/EN.
  - `e2e/session-lifecycle.spec.ts` & `e2e/session-pwa.spec.ts`: Ciclo de vida de sesiones, expiración JWT, revocación en servidor, PWA shell offline.
  - `e2e/p1-operaciones-simulado.spec.ts`: Proveedores por producto, compras al contado, estado de cuenta de clientes.
  - `e2e/productos-edicion.spec.ts`: Edición de inventario, prevención de doble clic, liberación de cámara en escáner.
  - `e2e/pagos-bancarios-simulado.spec.ts` & `e2e/pos-tarjeta-simulado.spec.ts`: Cobros POS, tarjetas, comprobación de terminales.
  - `e2e/pos-catalogo-grande-simulado.spec.ts`: Paginación y escaneo rápido en carritos de alto volumen.

---

## 3. Matriz de Auditoría por Dominio de Seguridad y QA

| Dominio de Auditoría | Estado | Hallazgo / Mecanismo de Control Verificado |
|---|---|---|
| **1. Autenticación, Expiración y Revocación** | **CONFORME** | Tokens de acceso (15 min) y refresh cookies `httpOnly`. La tabla `sesiones_auth` valida la sesión activa (`sid`). El logout limpia cookies, revoca el `sid` en BD y invalida `localStorage` (`ferre_token`, `ferre_tenant`). |
| **2. Rutas Protegidas y Permisos Backend** | **CONFORME** | Decoradores `@Roles()`, `@RequiredPermission()` y `@RequiredModule()` combinados con `JwtAuthGuard`, `TenantGuard` y `RolesGuard`. |
| **3. Aislamiento Multi-Tenant e IDOR** | **CONFORME** | Todas las operaciones en BD incluyen `tenantId` en la cláusula `where`. Bloqueos de fila explícitos (`FOR UPDATE`) en transacciones Prisma impiden manipular recursos de otras empresas. |
| **4. Acceso por Roles (RBAC)** | **CONFORME** | `SUPERADMIN` restringido a `/admin/*`. Roles de tenant (`ADMIN`, `CAJERO`, `VENDEDOR`, `BODEGUERO`) aislados. El rol `Contador` no está integrado en la base de datos actual. |
| **5. Protección IDOR y Escalamiento** | **CONFORME** | Intentos de usuarios sin privilegios (e.g. Vendedor intentando acceder a `/usuarios` o `/configuracion`) son bloqueados con HTTP 403. |
| **6. Validación de Entradas, CORS, CSRF, XSS** | **CONFORME** | `ValidationPipe` global con `whitelist: true`. Configuración CORS estricta (`createFrontendCorsOptions`) que valida orígenes HTTP(S) exactos. `Cache-Control: no-store` en respuestas API. |
| **7. Protección de Archivos y Fotos** | **CONFORME** | `validarLogotipo()` verifica firmas binarias (`magic bytes`). Limita el tamaño a 2 MB y las dimensiones a 4096 px. Rechaza archivos SVG/HTML para evitar almacenamiento de vectores XSS. |
| **8. Exposición de Secretos y Configuración** | **CONFORME** | `getJwtSecret` exige `JWT_SECRET` en entornos de producción (`NODE_ENV === 'production'`). No hay claves ni contraseñas fijas en el código fuente. |
| **9. Manejo de Errores de Red y Sesiones Caducadas** | **CONFORME** | `sessionValidation.ts` y Axios interceptors gestionan errores 401/403 de forma limpia. Errores 503 por indisponibilidad de la BD no provocan el cierre de sesión del usuario. |
| **10. PWA en Escritorio y Móvil** | **CONFORME** | Manifest `standalone` configurado con `theme_color`. Service Worker precarga el shell HTML/JS sin cachear endpoints `/api` ni cabeceras `Authorization`. |
| **11. Navegación Móvil Administrativa** | **CONFORME** | Vista `/admin-movil` accesible solo para `ADMIN`, adaptada a pantallas de 320 px–390 px con tarjetas resumiendo métricas del día. |
| **12. Restricción de POS y Caja en Móvil** | **CONFORME** | `/admin-movil` es estrictamente de consulta. La operación de cobro POS y apertura/cierre de caja requiere pantalla completa y permisos operativos (`pos.vender` / `arqueo_caja`). |
| **13. Escáner de Cámara y Permisos** | **CONFORME** | `BarcodeScanner.tsx` libera los tracks de video al plegar el panel, desmontar, presionar Escape o cambiar de visibilidad. Ofrece entrada manual ante denegación de permisos de cámara. |
| **14. Accesibilidad, Formularios y Cargas** | **CONFORME** | Modales utilizan `aria-label={t('common.close_modal')}` y `type="button"`. Los botones de envío se deshabilitan durante peticiones asíncronas para prevenir envíos duplicados. |
| **15. Persistencia de Configuración por Negocio** | **CONFORME** | Configuración de empresa se persiste en PostgreSQL (`GET/PUT /tenant/settings`). `TenantContext` carga dinámicamente los parámetros del negocio al iniciar sesión. |

---

## 4. Clasificación de Hallazgos y Riesgos

### Hallazgos Confirmados
* **Críticos:** 0
* **Altos:** 0
* **Medios:** 0
* **Bajos:** 0

### Observaciones e Información de Arquitectura (Informational)
1. **Estado del Rol `Contador` (Informativo):**
   - *Observación:* El rol `Contador` mencionado en especificaciones de alto nivel no se encuentra definido en el esquema Prisma (`enum Rol { ADMIN, CAJERO, BODEGUERO, VENDEDOR }`).
   - *Impacto:* Nulo para la operación actual. Las funciones contables/reportes están centralizadas en el rol `ADMIN`.
2. **Mapeo de Notificaciones Push Nativas en PWA (Informativo):**
   - *Observación:* La PWA web ofrece precache de shell e IndexedDB offline para contingencia. Si se requieren notificaciones push con la aplicación cerrada en iOS/Android fuera de una sesión de navegador activa, se requerirá un wrapper o canal de notificaciones nativas push (Expo / FCM).
3. **Límite de Verificación de Hardware Físico (Límite de QA):**
   - *Observación:* Todas las pruebas de cámara y escáner fueron ejecutadas satisfactoriamente en entorno emulado mediante APIs web y Playwright Chromium.
   - *Aviso Obligatorio:* No se presenta la simulación en navegador como certificación de hardware físico real. La velocidad de enfoque óptico en lentes físicas de iPhone/Android y el margen de corte en impresoras térmicas de 80 mm / 58 mm deben validarse en el sitio con los dispositivos físicos del cliente segun el protocolo `ESCANER_IPHONE_20261018.md`.

---

## 5. Recomendaciones Priorizadas para Producción

1. **Gestión de Entorno en Producción:** Asegurar que `JWT_SECRET`, `SUPER_ADMIN_PASSWORD` y `TENANT_ADMIN_PASSWORD` estén configurados mediante variables de entorno en Render/Supabase, y que `NODE_ENV=production` esté activo.
2. **Configuración de Proxy Inverso:** Mantener `TRUST_PROXY=1` en el entorno de despliegue detras del proxy de Render para que la limitación de tasa por IP (`login-rate-limit.ts`) identifique correctamente la IP real del cliente.
3. **Prueba de Aceptación Física:** Antes del despliegue en tienda física, realizar la verificación final con el lector de código de barras físico, cámara trasera de iPhone en Safari PWA y la impresora térmica de tickets (80 mm / 58 mm).

---

## 6. Veredicto Final

**READY FOR MERGE** — El código en la rama `jules-6650504171296380351-3c58c742` cumple con todos los estándares de seguridad SaaS multi-tenant, aislamiento de datos, RBAC y estabilidad PWA/móvil. Todas las 998 pruebas unitarias/de integración y las suites E2E de navegador pasan exitosamente con 0 regresiones.
