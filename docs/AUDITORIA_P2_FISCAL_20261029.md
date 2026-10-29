# Auditoría P2 — fiscalidad y precisión monetaria — 2026-10-29

Base: `origin/main` `3a6c6695`. Rama: `claude/p2-fiscal-20261029`. Solo auditoría documental y de pruebas: no cambia cálculos, reglas, esquema ni datos. Las reglas tributarias pendientes **no se inventan**: quedan para validación del contador hondureño.

## Verificado

| Área | Hecho | Evidencia |
| --- | --- | --- |
| Aritmética | Importes en centavos enteros; subtotal de línea = precio × cantidad, redondeo mitad hacia arriba; ISV sobre la base (subtotal − descuento) | `backend/src/common/dinero.ts` |
| Coherencia POS offline / servidor | Misma aritmética y vectores compartidos | `dinero.ts` y `frontend/src/offline/money.ts`; `test/fixtures/dinero-vectores.json` |
| Pruebas existentes | `src/common` y `src/contabilidad/fiscal*`: **237 aprobadas, 1 omitida**, 0 fallos | `npx vitest run src/common src/contabilidad/fiscal` |
| Venta en línea | ISV 15 % sobre todas las líneas (`ventas.service.ts` ~385–390) | Código |
| Cotización | `porcentajeIsv` por defecto 15; el servidor calcula el ISV de cada línea (`processLineItems`) | `cotizaciones.service.ts` ~110–111 |

## Hallazgos

**H1 — El porcentaje de ISV de una cotización no tiene límite superior (crítico, requiere decisión).**
- `backend/src/cotizaciones/dto/create-cotizacion.dto.ts` ~85–89: `porcentajeIsv` tiene `@Min(0)` y ningún `@Max`.
- Demostrado: la validación del DTO acepta `porcentajeIsv` = 0, 15 y 500 sin errores (prueba de validación ejecutada en esta rama; no se incluye porque su resultado sería aceptar el defecto).
- Efecto: un cliente con permiso para crear cotizaciones puede fijar un ISV arbitrario o eliminarlo.
- Corrección sugerida: decidir si el ISV de cotizaciones es fijo al 15 % o viene de la configuración fiscal del negocio. Mientras tanto, acotar el valor al tope decidido. **No se cambia aquí** porque el valor permitido es una regla fiscal.

**H2 — Las exenciones no llegan a la venta en línea (requiere decisión).**
- `exento` existe en `detalles_cotizacion` y en el modelo de detalle, y se usa en el cálculo de conversión de cotizaciones. La venta en línea (`ventas.service.ts`) aplica el 15 % a todas las líneas e ignora cualquier marca de exención.
- Efecto: una línea exenta vendida en el POS en línea se gravaría. Si el negocio vende productos exentos, el total es incorrecto.
- Decisión pendiente del contador: qué productos son exentos y cómo se marcan.

**H3 — Tabla `FiscalTasa` sin uso (no bloqueante).**
- Existe en el esquema (`prisma/schema.prisma` ~1617) pero ningún código de `src` la lee ni la escribe. Es un modelo sin función.
- Recomendación: no eliminarla ahora (cambio de esquema). Documentarla como sin uso hasta decidir H1–H2.

**H4 — Pruebas de paridad.** Presentes y en verde. Cubren redondeo mitad hacia arriba y descuentos; no cubren exenciones (no hay regla implementada).

## Decisiones humanas (contador y dueño)

1. ¿El ISV de cotizaciones es 15 % fijo o configurable por negocio? (H1)
2. ¿Qué productos son exentos y cómo se marcan? ¿Se aplican en venta en línea? (H2)
3. ¿Se eliminan o se usan las tasas de `FiscalTasa`? (H3)
4. Validación del contador de los casos de prueba de importes antes de facturar comercialmente.

## Recomendación de integración

Esta rama contiene solo este documento. No hay cambios de código que integrar. H1 debe resolverse antes de salida: es un defecto de integridad, no solo una decisión de presentación.
