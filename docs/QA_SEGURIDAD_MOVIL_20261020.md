# Informe de Auditoría de Seguridad SaaS Multi-Tenant y QA Móvil — Jowa System

**Fecha:** 2026-10-20
**Proyecto:** FerreSystem / Jowa System
**Rama:** `jules-6650504171296380351-3c58c742` (PR #184)
**Commit Evaluado:** `c4cadc34a4b67de3052b076cfd646813e5afc6d8`
**Evaluador:** Senior QA & Security Engineer
**Veredicto Final:** **NO MERGE** (Pendiente de alineación de variables Vercel y verificación en hardware físico)

---

## 1. Resumen Ejecutivo y Veredicto Fundamentado

Se ha realizado una revisión crítica e independiente de la seguridad SaaS multi-tenant, aislamiento de datos, control de acceso basado en roles (RBAC), resiliencia de sesiones JWT, PWA y experiencia móvil para **Jowa System**, contrastando los hallazgos con las correcciones y pendientes registrados en el PR #183 y auditorías anteriores (H-01 a H-06).

### Veredicto Técnico: **NO MERGE**
El estado actual del código en la rama incluye parches de seguridad y estabilidad de ingeniería de gran valor (idempotencia transaccional, limites por IP, revocación por `sid`, validación binaria de logotipos). Sin embargo, se emite veredicto **NO MERGE** debido a las siguientes restricciones no resueltas:

1. **Configuración de Despliegue en Vercel:** Los despliegues de vista previa en Vercel fallan o devuelven HTML `200` en peticiones `/api` por falta de la variable de entorno `VITE_API_URL` en tiempo de compilación Vite y reglas de `ignoreCommand` en `frontend/vercel.json`.
2. **Límite de Dispositivos Físicos y Web Push:** La PWA web no garantiza notificaciones push en segundo plano con la aplicación cerrada en iOS Safari / Android sin un canal/wrapper nativo configurado (Expo / FCM). Las pruebas de cámara y escáner en Chromium emulado no sustituyen la prueba de aceptación física en iPhone Safari WebKit ni impresoras térmicas de 80 mm / 58 mm.
3. **Riesgos Pendientes de Producción:** Se identificaron configuraciones de almacenamiento privado (Supabase Storage vs disco local) y variables de entorno productivas (`JWT_SECRET`, `TRUST_PROXY=1`) que requieren verificación previa al despliegue.

---

## 2. Matriz Comparativa de Hallazgos Históricos (H-01 a H-06 / PR #183)

| ID Hallazgo | Severidad | Descripción del Defecto | Evidencia / Endpoint Afectado | Estado de Corrección | PR / Agente Responsable |
|---|---|---|---|---|---|
| **H-01 / P0** | **CRÍTICO** | Pérdida de precios al importar productos por CSV (quedaban en L.0.00). | `POST /api/productos` individual desde frontend sin `precioVenta`/`precioCosto`. | **CORREGIDO** en backend vía `POST /productos/importacion` masivo con `aprobarPrecios` e idempotencia. | PR #161 / #183 (Claude) |
| **H-02 / P1** | **ALTO** | "Iniciar Soporte Remoto" roto con error HTTP 404 y usuarios demo hardcodeados. | `POST /api/admin/support/token` (endpoint faltante en backend). | **CORREGIDO** agregando `GET /admin/tenants/:id/usuarios` y revocación `POST /admin/support/finalizar`. | PR #160 (Codex) |
| **H-03 / P1** | **ALTO** | Salto de validación en CSV (precios negativos y códigos de barras duplicados pasaban la vista previa). | `importacion-productos.ts` en servidor. | **CORREGIDO** mediante validación por fila antes de inserción en BD. | PR #161 / #183 (Claude) |
| **H-04 / P3** | **BAJO** | El recibo impreso de ventas a crédito mostraba la etiqueta "TOTAL PAGADO". | `ReciboPDF.tsx` en módulo de ventas. | **CORREGIDO** mostrando "TOTAL A CRÉDITO" / "SALDO PENDIENTE" cuando `metodoPago === 'CREDITO'`. | PR #166 (Codex) |
| **H-05 / P3** | **BAJO** | Discrepancia de L.0.01 en el subtotal de líneas con fracciones decimales exactas `.5`. | Carrito del POS (coma flotante JavaScript). | **CORREGIDO** usando aritmética estricta en centavos enteros (`common/redondeo-monetario.ts`). | PR #166 (Codex) |
| **H-06 / P3** | **BAJO** | El color primario de marca aceptaba cadenas inválidas (`NOTAHEX`), cayendo a negro. | `PATCH /tenant/settings` y `TenantsService`. | **CORREGIDO** con validación estricta de formato `#RRGGBB` y HTTP 400. | PR #177 (Claude) |

---

## 3. Cobertura de Pruebas Ejecutadas y Entornos de Verificación

Se diferencia estrictamente el alcance de cada suite ejecutada sobre el commit `c4cadc34a4b67de3052b076cfd646813e5afc6d8`:

### 3.1 Pruebas Unitarias Backend (Vitest)
* **Comando:** `npm test --prefix backend`
* **Resultado:** **529/529 pruebas pasadas** (53 archivos).
* **Alcance:** Lógica de negocio en memoria, DTOs, redondeo monetario, cálculo de comisiones, generación de JWT y guards con mocks de Prisma.

### 3.2 Pruebas Unitarias Frontend (Node Native Test Runner)
* **Comando:** `npm test --prefix frontend`
* **Resultado:** **469/469 pruebas pasadas** (4 archivos).
* **Alcance:** Formateadores de fecha, lógica i18n, catálogo del POS, interceptores Axios y utilidades pure de filtrado.

### 3.3 Pruebas de Integración PostgreSQL (Clúster PostgreSQL Temporal)
* **Comando:** Integración automatizada mediante arnés ephemeral PostgreSQL.
* **Resultado:** **PASADO**.
* **Alcance:** Transacciones atómicas, bloqueos `FOR UPDATE`, idempotencia de secuencias comerciales y migraciones aditivas de esquema.

### 3.4 Pruebas de Navegador Simulado (Playwright Chromium)
* **Comandos:** `VITE_API_URL=/api npm run build --prefix frontend && PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run test:browser --prefix frontend`
* **Resultado:** **10/10 suites de prueba pasadas** (`navigation-settings`, `session-lifecycle`, `session-pwa`, `p1-operaciones-simulado`, `productos-edicion`, `pagos-bancarios-simulado`, `pos-tarjeta-simulado`, `pos-catalogo-grande-simulado`, `proveedores-gestion-simulado`, `offline-emulation`).
* **Alcance:** Renderizado UI, flujos de navegación V1/V2/V3, simulación de respuestas de API interceptadas y Service Worker shell precache.

### 3.5 Límite Indispensable: Dispositivos y Hardware Físico Real
* **Estado:** **NO CERTIFICADO EN HARDWARE FÍSICO**.
* **Aviso de QA:** La emulación de API de cámara y navegador en Chromium **no acredita** la velocidad de enfoque óptico en la cámara trasera de un iPhone físico en Safari WebKit PWA, ni el corte de papel o márgenes del driver en impresoras térmicas de tickets (80 mm y 58 mm). El protocolo de prueba física en local (`ESCANER_IPHONE_20261018.md` y `POS_PILOTO_CHECKLIST_FISICO.md`) debe ejecutarse en el sitio con los equipos reales del cliente.

---

## 4. Auditoría Técnica Detallada por Dominio

### 4.1 Autenticación y Revocación de Sesiones
* **Mecanismo:** Access Token JWT (15 min) y Refresh Token (7 días) almacenado en cookie `httpOnly`.
* **Revocación:** Cada token incluye el claim `sid` (Session ID). La tabla `sesiones_auth` valida que la sesión no esté revocada. La llamada a `POST /auth/logout` limpia las cookies y revoca el `sid` en la base de datos.
* **Resiliencia de Infraestructura:** Ante fallos temporales de conexión a PostgreSQL (códigos Prisma `P1001`, `P1002`, `P1017`), `JwtStrategy` responde `503 ServiceUnavailableException` en lugar de `401 UnauthorizedException`, evitando que caídas breves del pool de la base de datos cierren automáticamente la sesión de los cajeros en producción.

### 4.2 Aislamiento Multi-Tenant y Protección IDOR
* **Mecanismo:** Todas las consultas Prisma en los servicios (`ventas`, `cotizaciones`, `productos`, `clientes`, `usuarios`, `proveedores`, `operaciones`, `levantamientos`, `entregas`) filtran explícitamente por `tenantId` (e.g. `where: { id, tenantId }`).
* **Protección Transaccional:** Las mutaciones críticas ejecutan bloqueos de fila (`SELECT ... FOR UPDATE` o `lockTenant(tx, tenantId)`) antes de actualizar o eliminar registros, evitando condiciones de carrera o manipulación de datos entre empresas.

### 4.3 Control de Acceso por Roles (RBAC) y Estado del Rol `Contador`
* **Matriz de Roles Activos:** `ADMIN`, `CAJERO`, `VENDEDOR`, `BODEGUERO` (para usuarios de tenant) y `SUPERADMIN` (plataforma).
* **Rol `Contador`:** **NO INTEGRADO**. La base de datos actual (`enum Rol` en `schema.prisma`) no incluye el valor `CONTADOR`. Las funciones de reportes financieros y estados de cuenta están restringidas al rol `ADMIN` con la función opcional de permiso `reportes.ver`.
* **Protección de Endpoints:** Tentativas de usuarios con rol `CAJERO`, `VENDEDOR` o `BODEGUERO` de consumir endpoints restringidos (`/usuarios`, `/configuracion`, `/tenant/settings`, `/precios`, `/contingencia-admin`) son rechazadas con HTTP `403 ForbiddenException`.

### 4.4 Experiencia Móvil Administrativa (`/admin-movil`) y Restricciones POS
* **Navegación Móvil:** La pantalla `/admin-movil` (`AdminMovilPage.tsx`) está diseñada exclusivamente para administradores (`ADMIN`) en viewports de 320 px a 390 px (iPhone / Android).
* **Restricción Transaccional:** La vista móvil es **estrictamente de consulta gerencial** (resumen de ventas del día, alertas de stock bajo, facturas por vencer, saldos de clientes y solicitudes de autorización de devolución). **No permite** realizar cobranzas, abrir/cerrar caja ni emitir comprobantes de venta desde el celular.

### 4.5 PWA, Conectividad y Web Push
* **Service Worker:** Registrado como `sw.js` (versión `ferresystem-shell-v2`). Precarga el shell estático (`index.html`, `manifest.webmanifest`, CSS/JS).
* **Exclusión API:** Las llamadas a `/api/*` y solicitudes con cabecera `Authorization` **nunca se cachean** en el Service Worker.
* **Limitación Web Push:** La PWA web actual no envía notificaciones push nativas en segundo plano cuando la aplicación está totalmente cerrada en iOS/Android. Requerirá la integración de un canal nativo (Expo Push / Firebase Cloud Messaging) si se exige entrega de alertas fuera del navegador.

### 4.6 Escáner por Cámara y Ciclo de Vida
* **Implementación:** `BarcodeScanner.tsx` utiliza la API nativa del navegador `BarcodeDetector` cuando está presente y conmuta dinámicamente a `@zxing/library` (`zxingDecoder.ts`).
* **Liberación de Recursos:** Los tracks del `MediaStream` de la cámara se liberan explícitamente al plegar la sección, desmontar el componente, presionar la tecla `Escape`, cambiar la visibilidad de la pestaña (`visibilitychange`) o pasar la página a segundo plano (`pagehide`). Se ofrece un botón de entrada manual si el usuario deniega el permiso de cámara.

### 4.7 Carga de Archivos e Insumos
* **Firma Binaria (`Magic Bytes`):** `validarLogotipo` (`logotipo-validacion.ts`) inspecciona los primeros bytes del archivo en buffer (`0x89504E47` para PNG, `0xFFD8FF` para JPEG, `RIFF...WEBP` para WEBP).
* **Límites de Seguridad:** Rechaza archivos de más de 2 MB o dimensiones superiores a 4096 px. Archivos SVG y HTML son bloqueados categóricamente para impedir ataques de Cross-Site Scripting (XSS) mediante imágenes almacenadas.
* **Aislamiento de Almacenamiento:** Las claves de archivo incorporan identificadores aleatorios UUID (`${claveLogotipo(tenantId)}/${randomUUID()}`), impidiendo ataques de escalado de directorio (`path traversal`).

---

## 5. Diagnóstico de Despliegue en Vercel

Se investigó el comportamiento de compilación y servidor en Vercel para la aplicación frontend:

1. **Regla de Cancelación (`ignoreCommand` en `frontend/vercel.json`):**
   ```json
   "ignoreCommand": "case \"$VERCEL_GIT_COMMIT_REF\" in nexus/*|fix/inventario-inicial-seguro|fix/pilot-readiness|codex/auditoria-precision-monetaria|codex/fix-expired-sessions|fix/jowa-operacion-estable|codex/fix-camera-lifecycle-ios|codex/estabilidad-operativa) exit 0;; *) exit 1;; esac"
   ```
   *Diagnóstico:* En Vercel, un valor de retorno `exit 0` indica al motor de despliegue que OMITA la compilación (cancelado), mientras que `exit 1` le indica que PROCEDA con el build. Las ramas listadas en el comando son omitidas a propósito para evitar despliegues innecesarios de ramas de prueba.

2. **Error de Conexión `/api` o Respuesta HTML `200` en Vista Previa Vercel:**
   *Diagnóstico:* Vite inyecta `import.meta.env.VITE_API_URL` durante la compilación (`npm run build`). Si la variable `VITE_API_URL` no está definida en la configuración del proyecto en Vercel (e.g. `https://ferresystem.onrender.com/api`), Vite asume la ruta relativa `/api`. Al no existir un proxy o backend en el servidor estático de Vercel, la regla `rewrites: [{ "source": "/(.*)", "destination": "/index.html" }]` reescribe la petición a `index.html` devolviendo HTML con HTTP 200 en lugar de JSON, lo que provoca errores de parseo en Axios.

---

## 6. Recomendaciones Priorizadas para la Liberación

1. **Configurar `VITE_API_URL` en Vercel:** Definir `VITE_API_URL=https://ferresystem.onrender.com/api` en las variables de entorno de Vercel (Preview y Production) para que el bundle estático apunte correctamente al backend de Render.
2. **Ajuste de Variables en Producción (Render):** Verificar que `NODE_ENV=production`, `JWT_SECRET`, `SUPER_ADMIN_PASSWORD` y `TRUST_PROXY=1` estén configurados en el panel de Render.
3. **Protocolo de Aceptación Física:** Completar la verificación de campo con el lector de código de barras físico, la cámara trasera de iPhone en Safari PWA y la impresora térmica de tickets (80 mm y 58 mm) siguiendo `POS_PILOTO_CHECKLIST_FISICO.md`.

---

## 7. Resumen de Estado y Conclusión

* **SHA del Commit Auditado:** `c4cadc34a4b67de3052b076cfd646813e5afc6d8`
* **Archivos Modificados:** `docs/QA_SEGURIDAD_MOVIL_20261020.md`
* **Pruebas Verificadas:** 529 backend Vitest OK, 469 frontend unitarias OK, 10 Playwright E2E browser suites OK.
* **Veredicto Final:** **NO MERGE** (Pendiente de configuración de variables Vercel y protocolo de aceptación física en dispositivos del cliente).
