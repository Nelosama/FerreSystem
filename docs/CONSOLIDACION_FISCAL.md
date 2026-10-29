# Consolidación del cálculo fiscal — 2026-10-29

Propuesta de **una** implementación compartida. No se conecta a ninguna operación real en esta fase. Las decisiones tributarias quedan para el contador (D1–D11).

## 1. Implementaciones existentes

| Pieza | Rama y commit | Qué calcula | Estado |
| --- | --- | --- | --- |
| `common/dinero.ts` (`calcularTotales`) | `main` | Subtotales por línea, descuento general, ISV 15 % sobre la base, total. Centavos enteros, mitad hacia arriba | En producción: POS en línea y venta de cotización |
| `frontend/src/offline/money.ts` | `main` | Espejo de `dinero.ts`, comprobado con `test/fixtures/dinero-vectores.json` | En producción: POS sin conexión |
| `contingencia` (`calcularTotales` + `TOTAL_DIFERENTE`) | `main` | El servidor recalcula y compara con el ISV del equipo | En producción |
| `cotizaciones.service.ts` (ISV por línea) | `main` | ISV por línea sobre el subtotal, después prorrateo del descuento general | En producción |
| `common/politica-isv.ts` | `claude/p2-fiscal-20261029` (`da48cb2`) | **Solo valida** tasas: `TASAS_ISV_AUTORIZADAS = [15]` | En #217 |
| `common/calculo-fiscal-propuesta.ts` | `claude/p2-fiscal-20261029` (`da48cb2`) | `calcularTotalesConExencion`: exento y gravado, ISV una vez sobre la base gravada | Propuesta, sin uso |
| `common/desglose-fiscal.ts` | `claude/devoluciones-exenciones-20261029` (`5982c7e`) | Reparto del descuento y del ISV entre líneas (restos mayores); devolución acumulada por línea; escritura de desglose con interruptor | Implementado, apagado |

## 2. Comparación medida

Casos sin líneas exentas, para medir si las políticas de redondeo coinciden. Resultados en centavos (`scratchpad/cmp.json`, ejecutado en la rama de devoluciones):

| Caso | `calcularTotales` ISV | Propuesta ISV | Desglose ISV por línea (suma) |
| --- | --- | --- | --- |
| 3 líneas de 3.33, descuento 0.01 | 150 | 150 | 50 + 50 + 50 = 150 |
| 2 líneas (10.00 y 3.33×3), descuento 0.10 | 298 | 298 | 149 + 149 = 298 |
| 4 líneas, descuento 1.33 | 370 | 370 | 110 + 119 + 141 + 0 = 370 |

**Conclusión medida:** en los tres casos los totales coinciden. Pero la **mecánica** es distinta:

- `calcularTotales` aplica el ISV sobre la **base total** (subtotal − descuento) una sola vez.
- La cotización calcula el ISV **por línea** y lo prorratea después del descuento general. Puede diferir de la base total en un centavo cuando hay muchas líneas. **No medido**: no se ha comprobado una búsqueda sistemática.
- El desglose reparte el ISV **ya calculado** entre las líneas por restos mayores. La suma es exacta, pero el ISV de una línea concreta puede diferir en un centavo de «tasa × base de esa línea». Esto es consecuencia de repartir, no de calcular.

## 3. Diferencias de diseño

| Tema | `calcularTotales` | Cotización | Propuesta (#217) | Desglose (devoluciones) |
| --- | --- | --- | --- | --- |
| Dónde se calcula el ISV | Sobre la base total | Por línea, luego prorrateo | Sobre la base gravada | Se recibe; se reparte |
| Descuento general | Se resta de la base | Se resta de cada línea prorrateada | Se reparte: exento por proporción, gravado el resto | Se reparte por restos mayores |
| Exentas | No soportado | Marca por línea | Soportado | Soportado |
| Tasa | 15 fija | Parámetro (15 por defecto) | Parámetro validado por `politica-isv` | Se recibe de la venta (`tasa_isv`) |
| Redondeo | Mitad hacia arriba | Mitad hacia arriba | Mitad hacia arriba en `BigInt` | Restos mayores, desempate por índice |
| Devolución | Proporción del total | Proporción del total | No aplica | Por cantidad, acumulada por línea |

## 4. Propuesta: una sola implementación

**Módulo único** `backend/src/common/fiscal/` con tres funciones puras, todas en centavos enteros:

1. `calcularVenta(lineas, descuentoGeneral, politica)`: totales de venta, con líneas gravadas y exentas.
2. `desglosarVenta(lineas, descuentoGeneral, isv)`: reparto que persiste el desglose.
3. `desgloseDevolucion(linea, devueltoAntes, aDevolver)`: importe devuelto por línea.

Más un espejo de `calcularVenta` en `frontend/src/offline/money.ts`, comprobado con `dinero-vectores.json` ampliado con casos exentos.

**Política de redondeo como parámetro** (`politica`), no como código fijo, porque D6 no está decidida:
- `ISV_SOBRE_BASE` (comportamiento actual de POS y venta en línea);
- `ISV_POR_LINEA` (comportamiento actual de cotizaciones).

Hasta que el contador decida, las rutas actuales siguen usando sus funciones. El módulo nuevo solo se usa en pruebas. Así no cambia ninguna venta.

**Qué se conserva de cada implementación:**
- `calcularTotales` → se mantiene como `calcularVenta(..., ISV_SOBRE_BASE)` sin líneas exentas. Sus vectores siguen siendo la referencia.
- `calculo-fiscal-propuesta.ts` → se elimina después de decidir D6; su prueba de equivalencia pasa al módulo nuevo.
- `desglose-fiscal.ts` → se mantiene como base de `desglosarVenta` y `desgloseDevolucion`, con sus 10 pruebas.
- `politica-isv.ts` → se mantiene: es validación, no cálculo.

## 5. Pruebas requeridas antes de conectar

1. **Equivalencia:** con cero exentas, `calcularVenta` = `calcularTotales` en los vectores compartidos y en un barrido de descuentos.
2. **Suma exacta:** Σ bases + Σ ISV = total, en todos los casos del barrido.
3. **Devolución total = venta:** devolver todas las líneas devuelve exactamente el total y el ISV originales.
4. **Parciales sin deriva:** cualquier partición de la cantidad suma el importe original.
5. **Ejemplo obligatorio:** L 100 gravados + L 50 exentos; devolver la exenta reembolsa L 50.
6. **Espejo POS:** los mismos vectores pasan en backend y en frontend.

## 6. Decisiones que bloquean la conexión

| # | Decisión | Efecto en el cálculo |
| --- | --- | --- |
| D1 | Tasas autorizadas (15 % o más) | Lista de `politica-isv` |
| D3 | Qué productos son exentos y dónde se marcan | Entrada `exento` de cada línea |
| D4 | POS en línea y sin conexión venden exentas | Cambia `money.ts` y el DTO de contingencia |
| D6 | Redondeo: sobre base o por línea | Parámetro `politica` |
| D8 | Reparto base/ISV en devoluciones con exentas | `desgloseDevolucion` |
| D9 | Activar el desglose en producción | Interruptor `FISCAL_DESGLOSE_POR_LINEA` |

D2, D5, D7, D10 y D11 no bloquean el cálculo, pero sí su uso en libros, permisos o contingencia.

## 7. Recomendación

- Mantener un único módulo, con las funciones de `desglose-fiscal.ts` como base.
- No conectar ninguna ruta hasta D3, D6 y D8.
- Eliminar `calculo-fiscal-propuesta.ts` cuando el módulo nuevo esté, para no dejar dos fórmulas.
- Ampliar `dinero-vectores.json` con casos exentos antes de tocar el espejo de POS.
