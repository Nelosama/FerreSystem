# Matriz de decisiones fiscales — Jowa System 1.0 (2026-10-30)

> **Este documento no contiene respuestas del contador ni del dueño.** Lista cada decisión pendiente, el estado real del código con su referencia, las opciones ya documentadas en el repositorio y quién decide. Cualquier columna «Recomendación técnica» es solo un dato de ingeniería: no aprueba, no fija tasas y no activa funciones.

Fuente de las preguntas: [GO_NO_GO_PILOTO_20261029.md](GO_NO_GO_PILOTO_20261029.md) (sección «Bloqueos fiscales»), [CONSOLIDACION_FISCAL.md](CONSOLIDACION_FISCAL.md), [AUDITORIA_COMPRAS_ISV.md](AUDITORIA_COMPRAS_ISV.md) y [AUDITORIA_FUNCIONAL_MODULOS.md](AUDITORIA_FUNCIONAL_MODULOS.md) (AUD-FIS-01).

## Reglas que no cambian con esta matriz

- Ninguna tasa se cambia sin autorización del contador: solo 15 % para cotizaciones y ventas.
- Las exenciones de línea siguen bloqueadas para **todos** los roles (#222; `backend/test/exenciones-politica.postgres.integration.ts`).
- `FISCAL_DESGLOSE_POR_LINEA` sigue apagado por defecto (`backend/src/common/desglose-fiscal.ts:11`).
- Contabilidad sigue siendo opt-in (`backend/src/common/tenant-modules.ts:10`).

## Matriz

Estado del código: **verificado** = comprobado en esta revisión; **doc** = tomado de la documentación del repositorio.

| # | Decisión | Estado actual en el código | Opciones documentadas | Quién decide | Bloquea el piloto |
|---|---|---|---|---|---|
| D1 | ISV de cotizaciones: 15 % o admitir otra tasa (p. ej. 18 %) | Solo `TASA_ISV_PORCIENTO` aceptada; selector en pantalla (`backend/src/common/politica-isv.ts`, `frontend/src/utils/politica-isv.ts`) — **verificado** | Mantener 15 %; o autorizar tasas adicionales (ninguna autorizada hoy) | Contador + dueño | Sí, si se vende con otra tasa. Con 15 % se puede salir |
| D2 | Exonerados (constancia SAR): 0 %, importe exonerado, cotizaciones antiguas al 0 % | Cotizaciones nuevas no admiten 0 %; las antiguas solo las regulariza ADMIN con auditoría (#217, doc) | Definir si existe el régimen exonerado y cómo se documenta; regularizar o no las antiguas | Contador | Sí, si hay clientes exonerados |
| D3 | Qué productos son exentos y dónde se marca (producto, línea o ambos) | No existe marca de exención en `productos` ni en `detalles_venta` (doc, CONSOLIDACION_FISCAL H2) | Marca por producto; marca por línea; ambas | Contador | Sí, si se venden productos exentos |
| D4 | ¿El POS en línea y sin conexión vende líneas exentas? | POS y POS sin conexión gravan todo (doc H2) | Vender exentas en ambos; solo en línea; ninguno | Contador + dueño | Sí, si se vende exento |
| D5 | ¿Quién puede marcar una línea exenta en cotizaciones? | Bloqueado para todos los roles; cada intento se audita — **verificado** (7/7 en `exenciones-politica`) | Rol(es) autorizados + registro de quién solicita y quién autoriza | Contador + dueño | Solo si D3 habilita exentas |
| D6 | Redondeo del ISV: por línea o sobre la base gravada | Cotización: por línea. `calculo-fiscal-propuesta.ts` calcula la propuesta alternativa y **no está conectada** (doc H2) — presencia **verificada** | Por línea; sobre base gravada | Contador | Sí, antes de conectar el cálculo común |
| D7 | ¿`fiscal_tasas` es la fuente de la tasa en ventas? | Solo la usa Contabilidad (tasas, libros, reportes); ventas no la leen (doc H3) | Mantener Contabilidad como única consumidora; o usarla en ventas | Contador + dueño | No, mientras D1 sea 15 % |
| D8 | Reparto base/ISV en devoluciones de ventas con líneas exentas | Sin exentas no hay mixtas; el reparto de devoluciones está probado solo para ventas gravadas (`devoluciones-cxc`, `desglose-fiscal-devoluciones` 8/8) | Regla de reparto proporcional o por línea | Contador | No, mientras no existan exentas |
| D9 | Encender `FISCAL_DESGLOSE_POR_LINEA` en producción | Apagado por defecto (`desglose-fiscal.ts:11`) — **verificado** | Mantener apagado; encender tras D3, D6 y D8 | Dueño, con aprobación del contador | No, si se mantiene apagado |
| D10 | Asiento de devolución, ISV neto y libros con desglose | Contabilidad opt-in; sin asientos automáticos desde operación (doc) | Definir asiento y libro después de D8 | Contador | Solo si se activa Contabilidad |
| D11 | Operaciones de contingencia con ISV incoherente: ¿cerrar sin venta y facturar aparte? | Importes fiscales ausentes o incoherentes quedan como conflicto duro `IMPORTE_FISCAL_INCONSISTENTE`, no se convierten en venta — **verificado** (`contingencia-rechazada` 8/8) | Cerrar sin venta y facturar aparte; otro procedimiento | Contador + dueño | Sí, si el piloto usa contingencia |

### Cuestiones de compras y documento de venta (no son D1–D11)

| Código | Asunto | Estado actual | Qué decide | Bloquea |
|---|---|---|---|---|
| C-01 | ISV de factura de proveedor sin validar | Corregido en parte: rechaza ISV > subtotal y costo ≤ 0 (#221; `compras-isv` 9/9). **No hay tasa máxima autorizada para compras**: cualquier ISV entre 0 y el subtotal se acepta (p. ej. 0 %, 15 %, 100 %) | Tasa máxima autorizada para compras | Contador | Sí, para compras con crédito fiscal |
| C-02 | ISV de `ordenes_compra` no conciliado con `fiscal_documentos` (libros) | **Abierto.** Compras se permite solo con revisión manual del documento del proveedor | Conciliación al cierre de periodo con hallazgo visible en libros (propuesta del doc, sin implementar) | Contador | Sí, para usar compras como fuente del crédito fiscal |
| C-04 | Sin desglose por línea ni marca exenta en compras | **Abierto**; depende de D3 | Desglose por tasa (gravado 15 %, exento, exonerado) con migración aditiva | Contador + dueño | Sí, para exentos de compra |
| AUD-FIS-01 | El comprobante de venta («COMPROBANTE DE VENTA», `frontend/src/components/ReciboPDF.tsx:305,449`) no lleva CAI, rango autorizado ni leyenda de documento no fiscal; la factura fiscal por empresa **no está implementada** | **Verificado** en código | Qué documento emite el negocio: comprobante interno, factura con CAI propia, o factura externa (`referenciaFacturaExterna` existe en el esquema). Texto legal exacto del comprobante | Contador | Sí, antes de vender con datos reales |

## Qué queda aprobado con esta matriz

**Nada.** La matriz no aprueba ninguna decisión. Para la primera salida, el camino que no requiere decisiones nuevas es el documentado en el PR #225: vender solo gravado al 15 %, sin exentas, sin desglose activado, sin Contabilidad, sin compras como fuente de crédito fiscal sin revisión manual, y con un comprobante cuyo texto debe aprobar el contador.

## Preguntas para el contador (texto listo para enviar)

1. ¿El negocio vende solo productos gravados al 15 % ISV? Si hay productos exentos o exonerados, ¿cuáles y con qué constancia? (D1, D2, D3)
2. ¿Qué tasa de ISV aplica a compras de proveedores y cuál es la máxima que debe aceptar el sistema? (C-01)
3. ¿Debe el sistema conciliar el ISV de cada compra con el libro de compras al cerrar el mes? (C-02)
4. ¿Qué documento debe emitir cada venta: comprobante interno, factura con CAI propia o factura externa? ¿Qué leyenda legal lleva? (AUD-FIS-01)
5. Si una venta en contingencia tiene ISV incoherente, ¿se cierra sin venta y se factura aparte? (D11)
6. ¿El redondeo del ISV se hace por línea o sobre la base gravada? (D6)
7. ¿Qué regla aplica al reembolso del ISV en devoluciones? (D8)

Las respuestas del contador se registran en este documento con fecha, nombre y referencia escrita. Hasta entonces, cada decisión figura como **pendiente**.

## Historial

- 2026-10-30: matriz creada desde la documentación del repositorio y la comprobación del código en `origin/main` `a4ab291`. Sin decisiones aprobadas.
