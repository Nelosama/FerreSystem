# Comparación fiscal FerreSystem ↔ SICOFI — 2026-11-02

> **Decisión del dueño (2026-11-02):** la referencia fiscal es SICOFI, el sistema entregado por el contador. Este informe compara las **reglas del código** de ambos sistemas. No se recibieron datos reales de SICOFI (facturas, libros): el paquete entregado es el **código fuente** de la aplicación. La comparación con un mes de datos reales sigue pendiente (§6).

## 1. Material analizado

- Paquete `sicofi.zip` entregado por el dueño: repositorio Git `juanflores0722005/sicofi`, rama `main`, commit `faf200bfb9b277bfdd1d7e2b11d4f07d6799ca1c` (último commit 2026-09-22). Aplicación web estática sobre Firebase/Firestore (`js/*.js`, `index.html`).
- El código de SICOFI **no se copia** a este repositorio (ni su configuración de Firebase). Solo se citan archivo y regla.
- Archivos revisados: `js/invoices.js` (facturas), `js/creditNotes.js` (notas de crédito), `js/registrarCompras.js` y `js/purchases.js` (compras y libro de compras), `js/pdfGenerator.js` (documento impreso), `js/cotizaciones.js`, `js/firebase.js` (correlativos CAI), `js/reports.js` (libros).

## 2. Reglas fiscales de SICOFI

| Tema | Regla en SICOFI | Referencia |
|---|---|---|
| Tasas | Solo **15 %**. Los campos «Gravada 18 %», «ISV 18 %» y «Exonerada» existen en pantalla y PDF pero siempre valen 0 | `invoices.js` `calculateTotals`, envío del formulario |
| Exentos | Cada producto/servicio del catálogo tiene clasificación fiscal **IVA o EXE**; la línea la hereda. No se factura una línea sin clasificación | `invoices.js` (validación «sin clasificación fiscal») |
| Total de línea | cantidad × precio, redondeado a 2 decimales | `invoices.js` `r2(item.qty * item.price)` |
| Descuento | Un monto general por factura, restado **solo de la parte gravada** (mínimo 0) | `gravada15 = max(gravadaBase − discount, 0)` |
| ISV | 15 % sobre la base gravada total, **una sola vez** (no por línea) | `isv15 = r2(gravada15 * 0.15)` |
| Total | exenta + gravada + ISV | — |
| Nota de crédito | Se eligen las líneas devueltas (con su IVA/EXE) y se **recalcula** el ISV sobre la base gravada de la nota; total ≤ saldo de la factura; lote CAI propio de notas | `creditNotes.js`, `firebase.js` (`getActiveLote('notas')`) |
| Compras | Detalle por fila IVA o Exenta; ISV = 15 % del gravado. En el libro de compras el ISV se sugiere al 15 % y **se puede editar a mano**. RTN de 14 dígitos y número de factura `000-000-00-00000000` | `registrarCompras.js`, `purchases.js` |
| Documento | **Factura con CAI**: correlativo del lote activo, CAI, rango autorizado, fecha límite de emisión, bloque «Datos adquirente exonerado» (orden de compra exenta, constancia de exonerados, registro SAG), «Original: Cliente / Copia 1: Contabilidad / Copia 2: Archivo», totales V. Exenta / Exonerada / Gravada 15 % / ISV 15 % / Gravada 18 % / ISV 18 %, cantidad en letras | `pdfGenerator.js` |
| CAI | Lote activo por tipo (facturas, notas); rechaza facturar fuera del rango de fechas o si se agotó el correlativo | `invoices.js`, `firebase.js` |
| Periodos | No se factura ni se emite nota de crédito en un mes cerrado | `invoices.js`, `creditNotes.js` |

## 3. Resultado de la comparación de cálculo

Pruebas ejecutadas en esta sesión con la regla de SICOFI transcrita (sin datos reales):

| Ámbito FerreSystem | Resultado | Clasificación |
|---|---|---|
| **POS en línea y sin conexión** (`backend/src/common/dinero.ts` `calcularTotales`, espejo `frontend/src/offline/money.ts`) | **Idéntico** a la regla de SICOFI en aritmética exacta: 0 diferencias en 200 000 facturas sintéticas (exploración) y en 50 000 de la prueba versionada | Alineado |
| POS frente a SICOFI tal como calcula (coma flotante) | 311 de 20 000 facturas difieren en **1 centavo** de ISV o total. Todas son empates de medio centavo que SICOFI redondea hacia abajo por error de coma flotante (p. ej. base L 2 016.10 → ISV exacto L 302.415: FerreSystem L 302.42, SICOFI L 302.41) | **Defecto de SICOFI** — no se copia |
| **Cotizaciones** (`backend/src/cotizaciones/cotizaciones.service.ts`: ISV por línea y prorrateo del descuento) | 6 878 de 20 000 difieren de SICOFI en 1–2 centavos de ISV | **Regla distinta (D6)** — adoptar ISV sobre la base gravada total, como SICOFI y como el POS |
| **Propuesta con exentas** (`backend/src/common/calculo-fiscal-propuesta.ts`, no conectada) | Difiere en todas las facturas con exentas y descuento: reparte el descuento entre exento y gravado; SICOFI lo resta todo del gravado | **Regla distinta**; no afecta al piloto (exentas bloqueadas). Ver §5 antes de adoptarla |
| Compras (`backend/src/operaciones/compra-totales.ts`) | FerreSystem recibe el ISV como importe y solo exige ISV ≤ subtotal; sin detalle IVA/Exenta por fila | **Diferencia (C-01/C-04)** |
| Comprobante (`frontend/src/components/ReciboPDF.tsx:305`) | «COMPROBANTE DE VENTA» sin CAI, rango, fecha límite, desglose exento/gravado ni cantidad en letras | **Diferencia (AUD-FIS-01)** |

Prueba versionada: `backend/src/common/paridad-sicofi.spec.ts` (3/3): paridad del POS en 50 000 facturas, ISV con descuento y el empate documentado.

## 4. Matriz fiscal resuelta según SICOFI

| # | Respuesta según SICOFI | Impacto en FerreSystem |
|---|---|---|
| D1 | Solo 15 % | Ya cumple |
| D2 | Exonerados **no implementados** (campo en 0; el bloque del PDF es para llenar a mano) | Sin cambio; no hay régimen exonerado en el piloto |
| D3 | Marca IVA/EXE **por producto**, heredada por la línea | Requiere marca en `productos` (cambio de esquema, NEXUS) si se venden exentos |
| D4 | SICOFI no tiene POS ni contingencia | Decide el dueño |
| D5 | La línea hereda la marca del catálogo; en notas de crédito el usuario puede cambiarla | Recomendación: no permitir cambiarla en la línea |
| D6 | ISV sobre la base gravada total | POS cumple; **cotizaciones por corregir** |
| D7 | Tasa fija en el código, sin tabla de tasas | Sin cambio mientras D1 sea 15 % |
| D8 | Nota de crédito recalcula el ISV sobre las líneas devueltas | Devoluciones de FerreSystem solo gravadas: compatible; con exentas, reparto por línea |
| D9 | Desglose por línea: no aplica en SICOFI | Mantener apagado |
| D10 | Asientos automáticos (CxC, descuento, ingresos por grupo, ISV) | Contabilidad sigue opt-in; **no** copiar el asiento con descuento (§5) |
| D11 | Sin contingencia en SICOFI | Decide el dueño |
| C-01 | ISV de compras 15 % del gravado, editable en el libro | Validar 15 % del gravado declarado, con exento aparte |
| C-02 | Libro de compras mensual con cierre de periodo | Pendiente de diseño (no bloquea si compras no alimenta libros en el piloto) |
| C-04 | Detalle IVA/Exenta por fila de compra | Requiere desglose en compras (esquema, NEXUS) |
| AUD-FIS-01 | **Factura con CAI** (formato de §2) | El comprobante actual no equivale; ver §6 |

## 5. Defectos de SICOFI que no se copian

1. **Redondeo en coma flotante** (§3): empates de medio centavo redondeados hacia abajo.
2. **Asiento de factura con descuento descuadrado**: el ISV del asiento se calcula como `total − ingresos brutos`, que equivale a ISV − descuento, mientras el descuento se carga además en el debe; el asiento queda descuadrado por el importe del descuento (`invoices.js`, bloque «Haber: ISV»). Ya figuraba como defecto en `docs/CONTABILIDAD_HONDURAS.md:132`; FerreSystem lo cubre en `backend/src/contabilidad/motor/reglas.spec.ts`.
3. **Correlativo CAI sin transacción**: el número se lee, se usa y se incrementa en pasos separados (`firebase.js`, `saveInvoice`); dos facturas simultáneas pueden recibir el mismo número.
4. **PDF con el CAI del lote activo al imprimir**, no el del lote con el que se emitió: una reimpresión tras cambiar de lote muestra otro CAI y rango.
5. **Factura editable después de emitida** (`inv-editing-number`), sin nota de crédito.
6. **Descuento general aplicado solo a lo gravado**: con líneas exentas reduce el ISV aunque el descuento corresponda a productos exentos. Si se habilitan exentas, conviene que el contador confirme esta regla antes de adoptarla.

## 6. Pendiente

1. **Comparación con datos reales**: exportar de SICOFI (Firestore) un mes de facturas, notas de crédito, compras y el libro de ventas, recalcularlos con FerreSystem y conciliar con tolerancia 0.00 (las diferencias de 1 centavo del §3 se esperan y se documentan).
2. **Corregir cotizaciones (D6)** para calcular el ISV sobre la base gravada total; incluye pruebas PostgreSQL de cotizaciones y conversión a venta.
3. **Documento de venta**: decidir si FerreSystem sustituye a SICOFI como emisor de factura con CAI (conectar POS a `fiscal_cai`/`fiscal_documentos`, correlativo transaccional, CAI guardado en el documento) o si sigue emitiendo comprobante interno y la factura se hace en SICOFI (`referenciaFacturaExterna`). Decide el dueño.
4. **Compras (C-01/C-04)**: alinear con el detalle IVA/Exenta de SICOFI cuando compras alimente libros.
