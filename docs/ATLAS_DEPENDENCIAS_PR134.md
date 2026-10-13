# Dependencias de PR #134 con ATLAS (entregas e inventario) — KARDEX

**Estado:** revisión documental. No se implementó ningún contrato de entrega de ATLAS. No se encontró rama, PR ni documento de ATLAS verificable: `git ls-remote --heads origin` no devuelve ramas con `atlas` (consulta del 2026-10-10). Los posibles conflictos se derivan del código de esta rama, no de una propuesta de ATLAS.

## Base del PR

PR #134 parte de `claude/integracion-pos-offline-p1` (head de #129, `58941e5d`). Cualquier cambio de ATLAS que parta de `main` o de otra rama tendrá que rebasarse sobre esta base o sobre #134 ya fusionado.

## Superficie que ATLAS probablemente toca

| Área | Dónde vive en esta rama | Qué cambia PR #134 | Riesgo de conflicto |
|---|---|---|---|
| Entregas | `operaciones/operaciones.service.ts`: `entregar`, `entregas` | No se modifica | Medio: ATLAS puede cambiar el mismo servicio |
| Venta y reserva | `ventas/ventas.service.ts`, `create` | Guard P0: producto sin precio de venta válido no se vende | Alto si ATLAS cambia `create` (misma función) |
| Productos | `productos/productos.service.ts`: `create`, `update` | Pendientes; solo ADMIN define precios; costo vigente sincronizado | Medio: contratos de alta y edición |
| Respuestas de productos | `productos/producto-response.ts`, `cashier-response.interceptor.ts` | BODEGUERO ya no recibe costo, margen ni costo vigente | Alto si ATLAS muestra costo a BODEGUERO en entregas |
| Levantamiento | `levantamientos/*`, `LevantamientoPage.tsx` | Sin precios; respuestas filtradas para no ADMIN | Medio |
| Frontend inventario | `InventarioPage.tsx`, `ProductoGestion.tsx`, `ImportarProductosModal.tsx` | Columnas y campos de costo solo para ADMIN | Medio si ATLAS reutiliza esas tablas |
| Reserva en entrega | `productos.stock_reservado`, `entregar` | Sin cambios | Confirmar que ATLAS no altere la regla de reserva |

## Dependencias concretas

1. **Contrato de entrega que lea costos:** si ATLAS necesita costo para una entrega, debe pedirlo a ADMIN o a un endpoint de costo dedicado. BODEGUERO ya no lo recibe desde `GET /productos`. Hay que decidir si la entrega lo necesita.
2. **Venta sin inventario (`sinInventario`):** el guard P0 exige precio de venta válido en todas las ventas. Una entrega que cree venta especial debe pasar por ese control.
3. **Estado pendiente:** un producto pendiente no aparece en `GET /productos` por defecto. Si ATLAS consulta productos para entregar, debe usar `incluirInactivos` solo como ADMIN.
4. **Conteo y entrega:** el levantamiento no reserva ni descuenta; la reserva al facturar y el descuento al entregar siguen en `ventas` y `operaciones`, sin cambio en esta rama.

## Recomendación

- Antes de implementar ATLAS, fijar la base (`#134` fusionado o rama de integración) y revisar `ventas.service.ts create` y `operaciones.service.ts entregar`.
- Definir si una entrega necesita costo y, si es así, cómo se entrega sin exponerlo a BODEGUERO.
- No fusionar #134 y el trabajo de ATLAS sin una ronda conjunta de pruebas de `ventas`, `operaciones` e `inventario-ciclo`.
