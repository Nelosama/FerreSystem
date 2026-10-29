# Auditoría de devoluciones y exenciones — desglose fiscal histórico por línea — 2026-10-29

Rama `claude/devoluciones-exenciones-20261029` sobre `main` `3a6c6695`, independiente de #216 y #217. Sin datos reales, sin producción, sin merge. La migración se probó solo en clústeres PostgreSQL temporales con datos sintéticos. **No se inventan tasas ni criterios legales**: el código reparte importes que la operación ya calculó y la escritura del desglose queda **apagada** (`FISCAL_DESGLOSE_POR_LINEA`) hasta que el contador apruebe las reglas.

Firma: **NEXUS** (esquema y migración), con impacto en los ámbitos de ATLAS (POS, contingencia) y BALANCE (devoluciones).

## 1. Cómo se almacenan hoy los impuestos de cada línea

| Tabla | Qué guarda | Qué falta |
| --- | --- | --- |
| `ventas` | `subtotal` (bruto), `descuento`, `isv`, `total` de toda la venta | — |
| `detalles_venta` | `cantidad`, `precio_unitario`, `subtotal` (bruto de la línea), costo | **ISV, base gravada, base exenta, marca de exención y tasa por línea** |
| `devoluciones` | `monto` (con ISV incluido), `credito_cancelado`, `reembolso` | Base e ISV de lo devuelto |
| `detalles_devolucion` | `cantidad`, `destino` | Base gravada, base exenta e ISV por línea |
| `detalles_cotizacion` | `exento`, `subtotal`, `isv`, `total_linea` por línea | — (la marca se pierde al convertir) |

## 2. Caminos que recalculan o pierden impuestos

| # | Camino | Código | Defecto | Estado en esta rama |
| --- | --- | --- | --- | --- |
| C1 | Devolución (directa y autorizada) | `operaciones.service.ts` `planDevolucion` | Reembolsa `total × bruto devuelto / bruto vendido`. En una venta mixta, devolver la línea exenta reembolsa ISV que no se cobró. Ejemplo probado: gravado 100 + exento 2 × 50 → total 215; devolver 1 exenta reembolsa **53.75** en vez de **50.00** | Corregido **solo para ventas con desglose**; sin desglose se conserva la regla vigente |
| C2 | Conversión de cotización a venta | `cotizaciones.service.ts` `convertirAVenta` | Copia `isv` y `total`, pero `detalles_venta` no guarda la marca exenta ni el ISV por línea | Desglose por línea con la marca exenta y el ISV histórico de la cotización (con interruptor) |
| C3 | Venta en línea del POS | `ventas.service.ts` `create` | Calcula bien el total (todo gravado al 15 %), pero no guarda el ISV por línea | Desglose gravado por línea (con interruptor). Sin exenciones en el POS (D4) |
| C4 | POS sin conexión al sincronizar | `contingencia.service.ts` `aplicar` | Si un ADMIN acepta `TOTAL_DIFERENTE`, la venta se crea con el **ISV que envió el equipo**, aunque no corresponda a su subtotal (por ejemplo, ISV 0) | **P3 corregido**: `IMPORTE_FISCAL_INCONSISTENTE`, no superable. Desglose solo si los importes coinciden con el servidor |
| C5 | Asiento propuesto de devolución | `contabilidad/motor/reglas.ts` `asientoDevolucion` | ISV de la devolución proporcional al total, el mismo defecto que C1. Hoy solo es una propuesta: no se persiste | Documentado. Cuando haya desglose, debe usar `detalles_devolucion.isv` |
| C6 | Reporte de ventas por método | `operaciones.service.ts` (~345), `ReportesPage.tsx` | Muestra el ISV bruto de las ventas, sin restar el ISV devuelto | Documentado. Con desglose se puede restar `Σ detalles_devolucion.isv` |
| C7 | Libros fiscales | `contabilidad/libros.ts` | Las devoluciones se comparan por monto contra las notas de crédito; no se separan base e ISV | Documentado (D8) |

## 3. Diseño: persistencia histórica por línea

Migración `backend/prisma/migrations/20261029000000_desglose_fiscal_linea/migration.sql`. Es solo aditiva: columnas nulas, sin valores por defecto y sin rellenar filas existentes.

**`detalles_venta`:** se añaden `exento`, `base_gravada`, `base_exenta`, `isv` y `tasa_isv`.
- `NULL` en todas significa «sin desglose»: la venta es anterior a la migración o se registró con el interruptor apagado.
- CHECK `desglose_completo`: las cinco columnas van todas presentes o todas ausentes.
- CHECK `desglose_valores`:
  - importes ≥ 0;
  - `0 ≤ tasa < 100`;
  - base gravada + base exenta ≤ `subtotal`;
  - una línea exenta lleva base gravada 0 e ISV 0;
  - una línea gravada lleva base exenta 0.

**`detalles_devolucion`:** se añaden `base_gravada`, `base_exenta` e `isv`, todas `NULL` o todas ≥ 0.

**Reparto** (`backend/src/common/desglose-fiscal.ts`, funciones puras en centavos):
- `desglosarVenta`:
  - el descuento general se reparte en proporción al importe de cada línea, después de su descuento propio;
  - el ISV **ya calculado** de la venta se reparte solo entre las líneas gravadas;
  - el reparto usa restos mayores, así que las sumas son exactas: Σ bases = subtotal − descuento y Σ ISV = ISV de la venta.
- `desgloseDevolucionLinea`: calcula por cantidad y de forma acumulada (lo devuelto incluyendo esta devolución menos lo devuelto antes). Así las devoluciones parciales suman exactamente la línea.
- La devolución usa el desglose solo si **todas** las líneas de la venta lo tienen. La decisión depende de los datos, no del interruptor: una venta registrada sin desglose sigue con la regla vigente aunque después se encienda el interruptor.

**Escritura del desglose:** solo con `FISCAL_DESGLOSE_POR_LINEA=true`. Por defecto está apagado: en producción no cambia ninguna venta, devolución ni importe.

## 4. Compatibilidad

- **Ventas existentes:** quedan `NULL`; las devoluciones siguen exactamente igual (prueba de compatibilidad). No se rellenan desgloses históricos: inferirlos sería inventar un reparto y una exención que no se registraron.
- **POS sin conexión y sincronización:** sin cambios en el DTO, `esquemaVersion` ni `money.ts`. Los equipos antiguos siguen funcionando.
  - Un equipo honesto calcula `isv = 15 % de su subtotal`, igual que el servidor, así que el conflicto nuevo no le afecta.
  - Las operaciones antiguas que siguen en revisión con un ISV incoherente ya no se pueden aceptar; se cierran sin venta (`CERRAR_MANUAL` concilia el efectivo).
- **Prisma:** las consultas de `detalles_venta` y `detalles_devolucion` incluyen las columnas nuevas, así que **el código exige la migración aplicada**. `migration-safe.mjs` impide arrancar sin ella.
- **Pruebas con lista explícita de migraciones** (`ventas`, `reportes-zona-horaria`) y `scripts/estado-base-solo-lectura.sql` (SHA-256): actualizadas.

## 5. Riesgos de la migración

| Riesgo | Mitigación |
| --- | --- |
| `ALTER TABLE` toma un bloqueo exclusivo breve en `detalles_venta` y `detalles_devolucion` | Columnas nulas sin valor por defecto: solo cambia el catálogo, sin reescribir la tabla. Los CHECK se crean `NOT VALID` y se validan aparte; la validación recorre la tabla una vez. Ejecutar en ventana de baja actividad |
| Desplegar el código sin migrar | `migration-safe` detiene el arranque (por diseño). Orden: respaldo verificado → `migrate deploy` → código |
| Revertir | `DROP COLUMN` y `DROP CONSTRAINT` son destructivos y exigen `APROBACION-DESTRUCTIVA`. Con el interruptor apagado, las columnas quedan `NULL` y no se necesita revertir: basta con no encenderlo |
| Encender el interruptor | Cambia el reembolso de las devoluciones de ventas **nuevas** con varias líneas (centavos en ventas gravadas; corrige C1 en mixtas). Requiere D3, D6 y D8 |
| Datos reales | No se ejecutó contra ninguna base real. Antes de producción: ensayo en copia de preproducción con `scripts/estado-base-solo-lectura.sql` |

## 6. Pruebas

- `src/common/desglose-fiscal.spec.ts` (10):
  - interruptor apagado por defecto;
  - reparto exacto y desempate;
  - barrido de ventas gravadas con descuento contra `calcularTotales`;
  - solo exentas; mixta con descuento general; descuento propio;
  - parciales sin deriva (1 + 1 + 1 de 3 y cantidades decimales);
  - rechazos.
- `test/desglose-fiscal-devoluciones.postgres.integration.ts` (6, PostgreSQL real):
  - interruptor apagado: venta sin desglose y regla vigente;
  - venta gravada con descuento: cuatro devoluciones parciales suman exactamente 391.00 y el ISV devuelto es 51.00;
  - venta mixta desde cotización: la línea exenta conserva su condición y devolverla reembolsa 50.00 sin ISV (la regla vigente daría 53.75);
  - venta mixta con descuento general (90 / 45 / 13.50);
  - compatibilidad con una venta registrada sin desglose;
  - restricciones CHECK.
- `test/contingencia-p3-fiscal.postgres.integration.ts` (4, PostgreSQL real):
  - ISV 0 y subtotal + ISV ≠ total: no aceptables; se cierran sin venta;
  - diferencia de precio con importes coherentes: aceptable y sin desglose;
  - operación coherente: desglose gravado.
- Resultados completos: ver `docs/CONTEXTO_MAESTRO.md`.

## 7. Decisiones pendientes (contador y dueño)

| # | Decisión |
| --- | --- |
| D3 | Qué productos son exentos y dónde se marca la exención (producto, línea o ambos). Hoy solo hay casilla por línea en cotizaciones |
| D4 | Si el POS en línea y sin conexión venden líneas exentas (exige cambiar `dinero.ts`, `money.ts` y el DTO de contingencia con una nueva `esquemaVersion`) |
| D6 | Reparto del descuento general y del ISV entre líneas: proporcional por restos mayores (propuesta) u otro criterio |
| D8 | Reembolso de devoluciones: por línea con su desglose (propuesta) o la regla vigente por proporción del total |
| D9 | Encender `FISCAL_DESGLOSE_POR_LINEA` en producción (después de D3, D6 y D8) |
| D10 | Ajustar el asiento de devolución (C5), el reporte de ISV neto (C6) y los libros (C7) con el desglose |
| D11 | Operaciones de contingencia en revisión con ISV incoherente: confirmar que se cierran sin venta y se facturan aparte |
