# Auditoría del ISV de compras — 2026-10-29

Base: `main` `3a6c6695`. Rama: `claude/auditoria-compras-isv-20261029`. Pruebas en PostgreSQL 16 temporal con datos sintéticos. Sin cambios de comportamiento: la auditoría fija el estado actual con pruebas de caracterización. Ninguna regla fiscal nueva.

**Principio:** el ISV de una compra no se calcula igual que el de una venta. Una factura de proveedor trae el ISV que el proveedor declara; puede incluir líneas exentas, exoneradas o tasas distintas. Por eso este informe evalúa si el sistema **guarda y valida** el importe declarado, no si lo recalcula.

## 1. Cómo se almacena hoy

| Dato | Dónde | Origen | Validación |
| --- | --- | --- | --- |
| `isv` de la factura | `ordenes_compra.isv` | Formulario (`CompraDto.isv`) | `@IsNumber({maxDecimalPlaces:2}) @Min(0)` y `decimal()` (≤ 9 999 999 999.99, no negativo) |
| Subtotal y total | `ordenes_compra.subtotal/total` | Servidor, `calcularTotalesCompra` | Calculados de las líneas; `total = subtotal + isv` |
| Costo por línea | `detalles_orden_compra.precio_costo/subtotal` | Formulario | `@Min(0)` en DTO; `aCentavos` sin signo |
| Impuesto por línea | **No existe** | — | — |
| Crédito fiscal en libros | `fiscal_documentos.isv_general` (Contabilidad) | Documento del proveedor | `verificarIsv` contra la tasa vigente |

Fuentes: `backend/src/operaciones/operaciones.dto.ts` (`CompraDto`, `CompraItemDto`), `compra-totales.ts`, `operaciones.service.ts` (~61–66), `contabilidad/libros.ts` (~190–244).

## 2. Preguntas de la auditoría

| Pregunta | Respuesta | Evidencia |
| --- | --- | --- |
| ¿Acepta importes negativos? | **No.** HTTP y servicio responden 400 | `ISV_NEGATIVO` y `COSTO_NEGATIVO`: `BadRequestException` («use un valor no negativo…») |
| ¿Acepta ISV superior al importe de la compra? | **Sí (DEFECTO CONOCIDO)**: ISV 4 500 sobre subtotal 450 queda guardado | `DEFECTO CONOCIDO: acepta un ISV diez veces mayor…` |
| ¿Hay tope máximo? | Solo el de `decimal()`: 9 999 999 999.99 | `decimal()` en `ledger.ts` |
| ¿Puede el cliente manipular totales? | **No.** Un `total` o `subtotal` enviados se ignoran; el servidor calcula de las líneas | `el total y el subtotal enviados por el cliente se ignoran` |
| ¿Inconsistencia entre líneas y encabezado? | **Sí**: el ISV es independiente de las líneas. Una compra con costo 0 puede llevar ISV 15 | `DEFECTO CONOCIDO: acepta un costo de cero…` |
| ¿Impuesto por línea? | **No existe**. `detalles_orden_compra` no tiene `isv` ni `exento` | `el ISV del encabezado no tiene desglose por línea` |
| ¿Impuestos incorrectos en productos exentos? | **No se puede controlar**: no hay marca exento en compras ni en productos (decisión D3) | Consecuencia de la ausencia de desglose |
| ¿Se valida la tasa? | **No.** 0 %, 15 % y 500 % se aceptan igual | `ISV no se valida contra la tasa autorizada` |
| ¿Aislamiento entre empresas? | **Sí.** Un ADMIN de otra empresa no registra compras contra el proveedor de esta | `aislamiento: un ADMIN de otra empresa…` |

## 3. Hallazgos

| ID | Severidad | Hallazgo | Riesgo |
| --- | --- | --- | --- |
| C-01 | **Alta** | El ISV del encabezado no se valida contra las líneas ni contra una tasa | Un error de captura o una manipulación del formulario crea crédito fiscal falso en las compras. `ordenes_compra.isv` no alimenta directamente los libros, pero no hay contraste |
| C-02 | **Alta** | Dos fuentes de ISV de compra sin conciliar: `ordenes_compra.isv` (formulario) y `fiscal_documentos` (libros). El crédito fiscal sale de la segunda | Divergencia silenciosa entre el registro operativo y el libro fiscal |
| C-03 | Media | Costo 0 aceptado | Compras sin valor que mueven inventario y costo promedio |
| C-04 | Media | No hay desglose por línea ni marca exento en compras | Imposible reconstruir el crédito fiscal de productos exentos |
| C-05 | Baja | El error de costo negativo llega como 400 por la validación HTTP; el servicio también responde 400 | Sin riesgo: ambos caminos rechazan |

## 4. Cobertura de pruebas

Existentes (antes de esta auditoría): compras con `isv: 0` en todas las pruebas (`compras.postgres.integration.ts`, `compras-cierre`, `compras-contado`, `compras-proveedores.spec.ts`). **Ninguna prueba ejercitaba un ISV distinto de cero.**

Nuevas (`test/compras-isv.postgres.integration.ts`, 9/9, PostgreSQL 16 temporal):
- negativos rechazados sin orden ni CxP;
- más de dos decimales y fuera de rango rechazados;
- total y subtotal del cliente ignorados;
- caracterización de C-01 (ISV 10× el subtotal aceptado);
- caracterización de C-03 (costo 0 aceptado);
- ausencia de desglose por línea (C-04);
- ISV 0 %, 15 % y 500 % aceptados (C-01);
- aislamiento entre empresas.

Las pruebas marcadas **DEFECTO CONOCIDO** documentan el comportamiento actual. Al corregir C-01 o C-03 fallarán a propósito y deberán actualizarse junto con la corrección.

## 5. Propuesta de corrección (no implementada: requiere decisión)

1. **C-01:** validar el ISV de la factura contra la configuración fiscal del negocio y la compra. No aplicar la regla de venta: el proveedor puede tener líneas exentas. Propuesta: `isv ≤ subtotal × tasa_máxima_autorizada` solo como alerta, y el desglose por tasa como dato del documento.
2. **C-02:** conciliar `ordenes_compra.isv` con `fiscal_documentos` al cerrar el período, con hallazgo visible en libros. No recalcular.
3. **C-03:** exigir costo > 0 o registrar una razón de costo cero.
4. **C-04:** desglose de la factura de compra por tasa (gravado 15 %, exento, exonerado): migración aditiva igual que la de ventas, sin rellenar históricos. Depende de D3.

Decisiones para el contador: si el crédito fiscal de compras se reconstruye del documento del proveedor o de las líneas; si existe un tope de alerta; cómo tratar compras con costo cero.

## 6. Riesgos para el piloto

- Mientras C-01 y C-02 estén abiertos, la compra no debe usarse como fuente del crédito fiscal sin revisión manual del documento del proveedor.
- Recomendación: en el piloto, la captura de compras queda habilitada solo para ADMIN con revisión del documento; el libro de compras se toma de `fiscal_documentos`.

## 7. Evidencia

- Rama: `claude/auditoria-compras-isv-20261029`, desde `main` `3a6c6695`.
- Prueba: `backend/test/compras-isv.postgres.integration.ts` (9/9).
- Archivos revisados: `operaciones.dto.ts`, `compra-totales.ts`, `operaciones.service.ts`, `ledger.ts` (`decimal`), `redondeo-monetario.ts` (`aCentavos`), `contabilidad/libros.ts`, `prisma/schema.prisma` (`DetalleOrdenCompra`).
