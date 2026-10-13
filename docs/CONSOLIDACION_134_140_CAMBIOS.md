# Consolidación #134 + #140 — qué se conserva y qué se reemplaza (KARDEX)

Rama: `claude/kardex-consolidacion-134-140`. Base: PR #129 (`c5fe4982`). Integra #140 (`1d3971be`) y #134 (`57c64962`). Commit de referencia para NEXUS: `94675812` (cierre anterior); los cambios de la ronda siguiente se listan en el reporte de cierre.

## Conservado de #140 (fuente de verdad de la aprobación)
- Aprobación formal: `precio_aprobado`, `precio_aprobado_por`, `precio_aprobado_at`, `precio_modificado_*`.
- `PATCH /productos/:id/precios`, solo ADMIN, con `version` y auditoría `PRECIO_APROBAR` / `PRECIO_MODIFICAR`.
- Ficha de producto sin cambio de precio ni margen para ningún rol.
- Alta del personal sin precio: queda pendiente; con precio o margen responde 403/400.
- Conteo que no lee ni escribe costo, precio ni margen; sin advertencias comerciales.
- Venta que exige producto aprobado (`ventas.service.ts`).
- Importador sin manejo de precios.
- Pantalla de Precios y aprobación (`PreciosPage`) y prueba e2e real `precios-real`.

## Conservado de #134
- Privacidad de BODEGUERO en el backend: productos (`canReadProductFinancials` solo ADMIN), levantamiento (`LevantamientoResponseInterceptor`), operaciones (`SinCostosParaBodeguero`: compras, historial, proveedores del producto, entregas).
- Revocación de la aprobación al cambiar el precio de venta, y conservación al cambiar solo el costo (`cambiarPrecios`).
- Costo vigente sincronizado con el costo comercial al cambiarlo.
- Recepción de compra: costo vigente y comercial con el último costo recibido, aunque baje; sin cambio de precio de venta ni de aprobación.
- Venta: aprobación **y** precio positivo (defensa en profundidad).
- Diagnóstico de costos de solo lectura y propuesta de conciliación con respaldo y rollback.
- Protecciones de inventario de #129/#134: ajuste con existencias anteriores (`stockAnterior`, 409 si cambió), búsqueda de venta sin `costo_unitario`, etc.
- Pruebas de regresión de #134 adaptadas al modelo de aprobación (sin debilitar comprobaciones).

## Reemplazado (con motivo)
| Elemento de #134 | Reemplazo | Motivo |
|---|---|---|
| Edición de precio por ficha (`PUT /productos/:id` con precio, ADMIN) | `PATCH /productos/:id/precios` | Mecanismo formal de #140 |
| Pendiente = `activo=false` y precio 0 | Pendiente = `precio_aprobado=false` (activo puede ser `true`) | Activo no equivale a aprobado |
| Filtro `?pendientes=true` sobre precio cero | Filtro sobre `precioAprobado=false` | Mismo criterio que la aprobación |
| `activo` como condición de habilitar | Habilitar no autoriza venta; la aprobación sí | Regla definitiva |
| Advertencias de precio en la vista previa del conteo | Sin advertencias | #140 no lee precios al contar |
| Margen aceptado en alta (0) | Margen rechazado en alta | #140 calcula margen; no se captura |
| Migración que aprueba todos los existentes | Aprueba solo `activo = true AND precio_venta > 0` | Decisión confirmada; no vende productos sin precio |
| Alta de compra por BODEGUERO | Solo ADMIN (controlador y servicio) | Costos de compra son de ADMIN |
| Formulario de compra visible a todos | Solo ADMIN | Consistencia con la regla de costos |

## Resultado de la integración
- Backend: build sin errores, lint sin errores, unitarias 353/353, integración PostgreSQL 402 pasan y 1 omitida (preexistente).
- Frontend: tsc, lint y build sin errores, unitarias 241/241, Playwright 128/129 (el fallo es preexistente en la base de #129).
- E2E real: 30/30, con PostgreSQL temporal y `migrate deploy` completo.
