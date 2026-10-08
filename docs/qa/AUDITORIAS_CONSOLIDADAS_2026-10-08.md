# FerreSystem — Consolidado de auditorías QA (2026-10-08)

**Repositorio:** Nelosama/FerreSystem  
**Fuente:** informes de tres agentes Jules compartidos por el responsable del proyecto.  
**Estado:** hallazgos **reportados**, pendientes de contraste con el commit actual y pruebas de reproducción. No implica que se hayan reproducido 28 defectos distintos.  
**No aplicar cambios de código ni migraciones basándose únicamente en este documento.**

## Resumen

| Auditoría | Reportados | Alcance |
|---|---:|---|
| QA funcional | 10 | 7 clasificados como confirmados, 2 sospechas, 1 requisito pendiente |
| Seguridad, cajeros y roles | 13 | Autorización, autenticación, sucursales, auditoría |
| Arquitectura y base de datos | 5 | Stock, paginación, índices, build y concurrencia |
| **Total** | **28** | Incluye solapamientos y hallazgos que requieren verificación |

El agente de arquitectura reportó **185/185 tests aprobados en 24 suites**, con compilación exitosa de frontend y backend. El agente funcional declaró que **no pudo ejecutar los tests del backend** en su entorno. Son resultados de ejecuciones distintas; ninguno garantiza cobertura total.

## Auditoría 1 — Funcional

| ID | Severidad reportada | Hallazgo |
|---|---|---|
| FUNC-001 | Crítica | Frontend invoca `POST /api/cotizaciones/:id/convertir-venta` mientras backend expone `POST /api/cotizaciones/:id/convertir`. Revisar `CotizacionesPage.tsx` y `cotizaciones.controller.ts`. |
| FUNC-002 | Crítica | `ClientePicker` en POS aparentemente no establece `clienteId` al elegir cliente para venta a crédito. Revisar `POSPage.tsx` y `ventas.service.ts`. |
| FUNC-003 | Alta | Apartados, garantías, listas de precio, pedidos especiales y posiblemente transferencias usan almacenamiento local como fuente de verdad. |
| FUNC-004 | Alta | Búsqueda de clientes no normaliza adecuadamente ciertos códigos/teléfonos con guiones o minúsculas. |
| FUNC-005 | Media | Filtros de cotizaciones no se recalculan correctamente al limpiar la búsqueda. |
| FUNC-006 | Baja | Fechas con formatos inconsistentes en cotizaciones/PDF. |
| SOS-001 | Riesgo alto | Manejo de error y recuperación al competir dos cajeros por el último stock. No confundir rechazo correcto por stock insuficiente con sobreventa. |
| SOS-002 | Riesgo medio | Posible inconsistencia de saldo de crédito después de devoluciones parciales. |
| REQ-001 | Requisito medio | Aprobación remota de descuentos fuera de límite (WebSocket/SSE propuesto; no necesariamente requisito aprobado). |

**Observación:** el primer informe declara diez hallazgos, pero sus identificadores detallados son seis FUNC, dos SOS y uno REQ (nueve entradas). Revisar esa diferencia antes de generar tickets.

## Auditoría 2 — Seguridad y control de acceso

Roles de tenant identificados: `ADMIN`, `CAJERO`, `BODEGUERO`, `VENDEDOR`. Super Admin es entidad separada. `SUPERVISOR` no se encontró como rol implementado.

| ID | Severidad reportada | Hallazgo |
|---|---|---|
| SEC-001 | Alta | No existe aislamiento relacional de sucursales; operaciones separadas solo por tenant. |
| SEC-002 | Alta | Límite de descuento por usuario aparentemente no se valida en backend en ventas/cotizaciones. |
| SEC-003 | Alta | Revisar autorización de devoluciones/anulaciones por cajeros/vendedores y posible bypass. |
| SEC-004 | Alta | Falta rate limiting de autenticación normal y Super Admin. |
| SEC-005 | Media | `GET /api/productos` expone `precioCosto` y `margen` a roles no administrativos. |
| SEC-006 | Media | Endpoints de operaciones sin `@RequiredPermission` granular. |
| SEC-007 | Media | Logout elimina refresh cookie, pero access JWT continúa válido hasta expiración; evaluar revocación según riesgo. |
| SEC-008 | Media | `TenantModuleGuard` habilita módulos cuando no existe registro de configuración (fail-open). |
| SEC-009 | Media | Creación/edición de sucursales gestionada en frontend sin autorización exclusiva de Super Admin en backend. |
| SEC-010 | Baja | Logs de login contienen identificadores y diagnósticos detallados. |
| SEC-011 | Baja | No existe recuperación de contraseña autoservicio; distinguir requisito de vulnerabilidad. |
| SEC-012 | Baja | Simulación local de impersonación sin auditoría backend equivalente. |
| SEC-013 | Media | Cierre de caja comprueba tenant, pero aparentemente no titular de caja. |

**Atención:** SEC-001/SEC-009 están relacionados; SEC-003 requiere comprobar la ruta de autorización real antes de declarar bypass explotable. Las conclusiones de seguridad provienen de revisión estática y no deben presentarse como ataques reproducidos.

## Auditoría 3 — Arquitectura, API y PostgreSQL

| ID | Severidad reportada | Hallazgo |
|---|---|---|
| TECH-001 | Alta | POS/conversión de cotización incrementan `stockReservado` y posponen decremento de `stockActual` hasta `entregar()`. Validar contra flujo de facturar antes de entregar y evitar doble descuento. |
| TECH-002 | Media | `findMany`/consultas de alto volumen sin paginación en dashboard, cotizaciones, clientes y operaciones. |
| TECH-003 | Media | Posibles índices ausentes en FKs de detalle de ventas, cotizaciones, compras y usuarios. Comprobar índices existentes y `EXPLAIN` antes de migrar. |
| TECH-004 | Baja | `VITE_API_URL` obligatoria en builds; verificar configuración por entorno, no imponer `/api` si la API está en otro dominio. |
| TECH-005 | Baja | `CotizacionesService.create` no usa `lockTenant`; correlativo ya es atómico. No añadir bloqueos sin demostrar una carrera real. |

## Prioridad propuesta para remediación

### P0 — Seguridad operativa y ventas bloqueadas
- Validar/corregir SEC-002, SEC-003, SEC-005 y SEC-013: descuentos, devoluciones, exposición de costos y cierre de caja.
- Validar/corregir FUNC-001 y FUNC-002: conversión de cotizaciones y ventas a crédito.
- Revisar SEC-004 y SEC-008: protección de login y módulos fail-open.

### P1 — Integridad de datos y operación real
- TECH-001: diseñar explícitamente venta con entrega inmediata vs venta con despacho posterior, considerando la regla del negocio de facturar antes de entregar.
- SOS-001, SOS-002: pruebas de concurrencia y devoluciones/crédito.
- FUNC-003: eliminar fuentes de verdad locales en módulos operativos, con backend real.
- SEC-001/SEC-009: diseño de sucursales con permisos Super Admin, stock/caja/ventas por sucursal y migración segura.

### P2 — Calidad, rendimiento y mantenimiento
- FUNC-004, FUNC-005, FUNC-006.
- SEC-006, SEC-007, SEC-010, SEC-011, SEC-012.
- TECH-002, TECH-003, TECH-004, TECH-005.
- REQ-001 solo si el negocio confirma la necesidad.

## Reglas para Kimi, Codex y Jules

1. Trabajar desde `main` actualizado, en ramas independientes y PRs pequeños.
2. Para cada ID, comprobar que sigue vigente; documentar commit, archivo/línea actual, reproducción y prueba de regresión.
3. No interpretar `localStorage` como persistencia compartida ni ocultar campos en frontend como medida suficiente de autorización.
4. Respetar aislamiento multi-tenant y futura segregación por sucursal; nunca confiar en IDs de cliente enviados sin autorización.
5. No tocar producción, no ejecutar seeds ni migraciones destructivas; planificar cambios Prisma como migraciones aditivas revisadas.
6. No fusionar automáticamente a `main`.
7. Actualizar el estado de cada hallazgo: **pendiente de verificar / confirmado / corregido en PR / descartado / requiere decisión de negocio**.

## Requisitos comerciales ya comunicados (no equivalen a defectos confirmados)

- Escáner de código de barras compatible con móvil y escritorio, con entrada manual.
- SKU automático corto, códigos del proveedor, unidades fraccionarias y categorías centralizadas.
- Productos editables, costo vigente de última compra, margen, precio y comisión separados; ajustes individuales de stock auditados.
- Búsqueda/registro de clientes previa a cotización, descuento porcentual predeterminado, vigencia configurable y PDF con logo/RTN/datos empresariales.
- Crédito únicamente para clientes registrados; abonos, límites y cuentas por cobrar auditables.
- Compras por proveedor con facturas, plazos, pagos y prevención de duplicados.
- Cierre por cajero, control de salida física, permisos por rol y autorización de sucursales solo por Super Admin.
- Interfaz sencilla con navegación TOPNAV/SIDEBAR y experiencia consistente móvil/escritorio.

Estos requisitos requieren especificación y aceptación independiente, no deben implementarse todos en un único PR.
