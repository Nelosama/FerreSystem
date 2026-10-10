# Matriz consolidada de hallazgos QA (2026-10-10)

Fuentes: `docs/qa-integral-operativa/INFORME.md` (auditoría técnica de Codex, PR #121) y la lista de hallazgos QA-NAV-001 a QA-NAV-020 del encargo de corrección. El informe de navegador de Claude (`INFORME_QA_NAVEGADOR_20261009.md`) no está en el repositorio; las descripciones QA-NAV proceden del encargo. Sin duplicados: 3 hallazgos de Codex + 20 QA-NAV = 23.

Un hallazgo solo figura como **corregido** si existe una prueba reproducible que falla con el código anterior y pasa con el corregido. El desaparecer un mensaje de error no basta.

| ID | Prioridad | Estado | Causa raíz | Archivos | Corrección | Prueba de regresión | PR |
|---|---|---|---|---|---|---|---|
| QA-NAV-001 | P1 | Corregido | El selector de clientes del POS llamaba `GET /clientes`, solo ADMIN. | `frontend/src/components/ClientePicker.tsx`, `backend/src/clientes/clientes.service.ts` | Búsqueda comercial `GET /clientes/buscar` para ADMIN y CAJERO, sin saldo, límite, correo ni dirección. | `backend/test/clientes-cajero.postgres.integration.ts`; `frontend/e2e-real/clientes-pos-cajero.spec.ts` (falla con el endpoint anterior) | #122 |
| QA-CLI-001 | P2 | Corregido | `@IsOptional()` aceptaba `null`; el servicio llamaba `trim()` sobre null. | `backend/src/clientes/dto/create-cliente.dto.ts`, `clientes.service.ts` | Nombre validado cuando se envía; null o en blanco responde 400 sin escribir. | `backend/test/ciclo-ventas.postgres.integration.ts` (caso ahora normal), `clientes-cajero` | #122 |
| QA-NAV-003 | P2 | Corregido | El inicio pedía `/dashboard` a todos los roles; el backend solo lo permite a ADMIN, BODEGUERO y VENDEDOR. | `frontend/src/pages/DashboardPage.tsx` | Solo se pide a esos roles; el bloque de métricas no se muestra a otros. | `frontend/e2e-real/inicio-roles.spec.ts` (falla con la versión anterior) | #123 |
| QA-NAV-004 | P2 | Parcial | Clientes para CAJERO: el POS ya selecciona; la pantalla de Clientes sigue siendo solo ADMIN en listado y alta. | `frontend/src/pages/ClientesPage.tsx` | Pendiente: alinear botones y pantalla con el rol. | — | Pendiente |
| QA-NAV-005 | P2 | Corregido en backend; pantalla no verificada | Vigencia de cotizaciones con `setHours` (zona del servidor). | `backend/src/cotizaciones/cotizaciones.service.ts` | Día calendario de `America/Tegucigalpa`. | `cotizaciones.service.spec.ts` (2 de 3 casos fallan con el código anterior) | #110 (fusionado) |
| QA-NAV-006 | P2 | Pendiente de verificación | El POS tiene campo de vencimiento para CRÉDITO; falta comprobar que el backend lo persista como condición. | `backend/src/ventas/*`, `frontend/src/pages/POSPage.tsx` | Por verificar con prueba de integración. | — | Pendiente |
| QA-NAV-007 | P2 | Pendiente (decisión) | Garantías sigue oculta del menú. | `frontend/src/config/modulesCatalog.ts` | Habilitar tras aprobar la migración y las pruebas operativas de #120. | — | #120 (abierto) |
| QA-NAV-008 | P2 | Pendiente | Borradores de venta se reutilizan sin confirmación. | `frontend/src/pages/POSPage.tsx` | Preguntar al usuario, sin mezclar productos de dos ventas. | — | Pendiente |
| QA-NAV-009 | P3 | Pendiente de verificación | Acceso al carrito en POS móvil. | `POSPage.tsx` | Por verificar en 390 px. | — | Pendiente |
| QA-NAV-010 | P3 | Pendiente de verificación | Permisos para crear cotizaciones. | `CotizacionesPage.tsx`, `cotizaciones.controller.ts` | Por verificar con prueba de rol. | — | Pendiente |
| QA-NAV-011 | P3 | Pendiente | Mensajes de reserva y descuento físico del stock. | Textos ES/EN | Redactar y validar. | — | Pendiente |
| QA-NAV-012 | P3 | Pendiente | Subtotales e ISV inconsistentes entre pantallas. | POS, cotizaciones, recibo | Unificar formato. | — | Pendiente |
| QA-NAV-013 | P3 | Pendiente | Etiquetas, títulos y filtros del inventario. | `InventarioPage.tsx` | Revisar con Codex (módulo de Inventario). | — | Pendiente |
| QA-NAV-014 | P3 | Pendiente | Accesibilidad de formularios. | Formularios varios | Auditar etiquetas asociadas. | — | Pendiente |
| QA-NAV-015 | P3 | Pendiente | Comprobante modal con elementos clicables por detrás. | Comprobante | Cerrar foco y capa. | — | Pendiente |
| QA-NAV-016 | P3 | Pendiente | Sucursales y turnos ficticios en la interfaz. | Varias | Eliminar datos simulados. | — | Pendiente |
| QA-NAV-017 | P3 | Pendiente | Redirección incorrecta con sesión válida. | `App.tsx`, `ProtectedRoute` | Reproducir y corregir. | — | Pendiente |
| QA-NAV-018 | P3 | Pendiente | Bundle pesado del POS. | Vite / lazy loading | Medir y dividir. | — | Pendiente |
| QA-NAV-019 | P3 | Pendiente | Avisos de caja abierta mucho tiempo y desglose de efectivo. | `ArqueoCajaPage.tsx` | Diseñar aviso y desglose. | — | Pendiente |
| QA-NAV-020 | P3 | Pendiente (diseño) | Operaciones pendientes sustituidas en silencio. | Cola local del POS | Recuperación explícita, reintentos y conciliación con el servidor. Requiere diseño propio. | — | Pendiente |
| QA-APT-001 | P1 | Pendiente (brecha de implementación) | Apartados guarda en `localStorage`, sin persistencia. | `ApartadosPage.tsx` | Modelo, API transaccional, reservas, abonos y auditoría. Trabajo grande, sin iniciar. | — | Pendiente |
| QA-TRA-001 | P1 | Pendiente (decisión) | No existe modelo de sucursales; la pantalla guarda en `localStorage`. | `TransferenciasPage.tsx` | Requiere definir sucursales. Hasta entonces, deshabilitar la operación. | — | Pendiente |

## Pendientes de decisión y de fiscalidad

- **QA-NAV-002 (facturación SAR):** no se ha implementado. Un comprobante interno no debe presentarse como factura autorizada, y no se declara cumplimiento SAR sin revisión del contador o responsable fiscal. No se inventan CAI, RTN ni rangos.
- **Sincronización automática del POS** (precios, revalidación del carrito): no iniciada. Requiere diseño.

## Riesgos restantes para producción

- Apartados y Transferencias guardan dinero y stock solo en el navegador. No deben usarse para operación real.
- Sin validación en dispositivos ni con datos reales.
- Pendientes P3 sin probar.
