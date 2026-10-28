# Política única de excepciones de precio (POS y cotizaciones) — 2026-10-28

Rama: `claude/jowa-production-audit-integration-mvd8vl-precios`, derivada de #202 (`22d3764`). Propuesta de integración sobre #202; no modifica su rama ni la de #204.
Implementación: `backend/src/ventas/politica-precio.ts`. La usan la venta directa (`ventas.service.ts`) y la conversión de cotización (`cotizaciones.service.ts`).

## Regla

Un precio cobrado distinto del precio vigente del catálogo en el momento de la operación solo se acepta con una excepción explícita en la misma petición:

| Situación | Respuesta | Efectos |
|---|---|---|
| Precio igual al vigente (comparado en centavos) | 200/201 | Ninguno especial |
| Precio distinto, sin `excepcionPrecio` | **409** «El precio cambió; actualice el catálogo o solicite al administrador» | Ninguno (se valida antes de descontar stock) |
| `excepcionPrecio` presente sin motivo válido (10 a 300 caracteres) | **400** | Ninguno |
| Motivo válido, usuario sin rol ADMIN o sin el permiso `pos.excepcion_precio` asignado | **403** | Ninguno |
| Motivo válido, ADMIN con el permiso asignado | 201 | Venta creada y auditoría `VENTA_EXCEPCION_PRECIO` con motivo y, por línea, precio vigente y cobrado |

Principios:
1. **El rol nunca concede la excepción.** La concede solo el permiso asignado explícitamente (`pos.excepcion_precio`). Un ADMIN sin ese permiso recibe 403.
2. **Una sola regla para todas las rutas.** Venta directa y conversión de cotización usan la misma función. Antes, un ADMIN convertía una cotización con precio distinto sin permiso, sin motivo y sin auditoría.
3. **Sin efectos antes del rechazo.** La política se evalúa línea a línea antes de descontar stock, reservar o crear la venta. Con el 409 o el 403 la base queda intacta (verificado por la prueba unitaria `ventas.contingencia-caracterizacion`).
4. **Auditable.** Cada excepción aceptada deja un registro con el motivo, el usuario y las líneas afectadas.

## Lo que la política no cubre

- **ISV distinto del 15 % o líneas exentas al convertir una cotización.** Es un asunto fiscal, no de precio. Hoy solo ADMIN lo puede convertir y sin auditoría específica. Queda pendiente de decisión del propietario (P1): o se aplica el mismo mecanismo (permiso + motivo + auditoría) o se mantiene con una justificación escrita.
- **Interfaz.** El permiso no aparece en la pantalla de Usuarios de #202 y el POS no envía `excepcionPrecio`. Hasta que existan, nadie puede cobrar un precio distinto desde la interfaz; solo por API. Es un bloqueo funcional, no de seguridad (P1).
- **Creación del permiso.** Un ADMIN nuevo no tiene el permiso (`permisosConfigurados: false`). Se concede desde Usuarios una vez que la interfaz lo muestre (P1).

## Pruebas

- Unitarias de la política: `backend/src/ventas/politica-precio.spec.ts` (7 casos: sin cambio, comparación en centavos, 409, 400, 403 por rol, 403 sin permiso, excepción con líneas que cambian).
- Unitarias de POS y cotizaciones: 44/44 (incluye `ventas.contingencia-caracterizacion`).
- Integración PostgreSQL de conversión (`cotizaciones.postgres.integration.ts`): 409 sin excepción, 403 de ADMIN sin permiso, 400 con motivo corto, 201 con permiso y motivo, auditoría por línea y cotización marcada como convertida.
- Suite completa del backend: 609/609 unitarias, lint y `tsc` sin errores.

## Coordinación

- #202 (Sonnet/claude): la política sustituye la comprobación de la conversión por la función común. El POS mantiene su comportamiento y sus fingerprints de reintento.
- #204 (Codex, auditoría de #202, «auditar reintentos de precio»): debe usar la misma función y no reimplementar la regla; sus pruebas de reintento deben seguir pasando sobre esta base.
