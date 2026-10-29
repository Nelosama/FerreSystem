# Auditoría P2 — fiscalidad: tasa de ISV, exenciones y `FiscalTasa` — 2026-10-29

Base: `origin/main` `3a6c6695`. Rama: `claude/p2-fiscal-20261029`. Sin cambios de esquema, migraciones, datos ni producción. Las reglas tributarias pendientes **no se inventan**: quedan para el contador y el dueño. Datos de prueba sintéticos únicamente.

Esta versión sustituye la del commit `60b924b`, que contenía un error en H3 (decía que `FiscalTasa` no se usa; sí se usa, ver abajo).

## Resumen

| Hallazgo | Estado en esta rama | Depende de regla fiscal |
| --- | --- | --- |
| H1 — ISV arbitrario en cotizaciones (500 % aceptado) | **Corregido** (`0ad9e6b`) con política central | No: solo se admite la tasa que el sistema ya aplica |
| H1b — cotizaciones antiguas al 0 % u otra tasa no autorizada | **P3**: ya no se crean y **ni ADMIN las convierte**; regularización explícita que crea una cotización nueva y deja la original intacta | Exonerados: **sí** — decisión D2 |
| H2 — la exención se pierde fuera de la cotización | Diagnosticado; propuesta de cálculo común **no conectada** (`4184e16`) | **Sí** — decisiones D3–D6 |
| H3 — `FiscalTasa` | Se usa en Contabilidad; no se conecta a ventas | Sí, para activarla en ventas — D7 |

## H1 — porcentaje de ISV arbitrario

### Puntos donde se recibe, calcula o persiste un porcentaje o importe de ISV

| Punto | Entrada del cliente | Cálculo | Persistencia | Riesgo antes |
| --- | --- | --- | --- | --- |
| `cotizaciones` `POST /cotizaciones`, `PUT /cotizaciones/:id` (`create-cotizacion.dto.ts`, `cotizaciones.service.ts` `create`/`update`/`processLineItems`) | `porcentajeIsv` (antes `@Min(0)` sin máximo) y `exento` por línea | Servidor, por línea y prorrateado tras el descuento general | `cotizaciones.porcentaje_isv` `Decimal(5,2)` (admite hasta 999.99, sin CHECK), `isv`, `detalles_cotizacion.isv/exento` | **Alto**: 500 % o 0 % aceptados |
| `POST /cotizaciones/:id/duplicar` | — | Copia literal de la original | Igual que arriba | Copiaba una tasa arbitraria a un documento nuevo |
| `POST /cotizaciones/:id/convertir` | — | Copia `isv`/`total` de la cotización a `ventas` | `ventas.isv` | ADMIN podía facturar una tasa arbitraria |
| Venta en línea `POST /ventas` (`ventas.service.ts` ~382) | No recibe tasa | `calcularTotales` con `TASA_ISV_PORCIENTO` (15) | `ventas.isv` | Ninguno de tasa |
| POS sin conexión `contingencia` (`contingencia.dto.ts` `isvCentavos`) | Importe calculado por el cliente | El servidor recalcula y marca `TOTAL_DIFERENTE` si no coincide | `ventas.isv` del servidor | Ninguno (ya protegido) |
| Configuración del negocio (`tenant-configuration.ts`) | `impuesto.tasa` | Solo admite `{ nombre: 'ISV', tasa: 15 }` | `tenants.configuracion` | Ninguno |
| Compras (`operaciones.dto.ts` `isv`) | Importe de ISV de la factura del proveedor | No se recalcula (pendiente D4 de compras ya registrado) | `ordenes_compra.isv` | Importe libre ≥ 0; fuera de alcance de H1 (no es tasa) |
| Contabilidad `POST /contabilidad/tasas` (`contabilidad.service.ts` `crearTasa`) | `porcentaje` | — | `fiscal_tasas` con CHECK `0 < porcentaje < 100`, vigencias sin solape, base legal, auditoría | Protegido: permiso `contabilidad.configurar` |

### Corrección (sin regla fiscal nueva)

- `backend/src/common/politica-isv.ts`: `TASAS_ISV_AUTORIZADAS = [TASA_ISV_PORCIENTO]` (congelada). Es la única tasa que el sistema ya aplica en POS en línea, POS sin conexión y configuración del negocio; **no se introduce ninguna tasa legal**. Funciones `tasaIsvEstructuralmenteValida` (número finito, `0 ≤ t < 100`, dos decimales), `esTasaIsvAutorizada` y `exigirTasaIsvAutorizada` (400).
- DTO: `@IsNumber({ maxDecimalPlaces: 2 })`, `@IsIn(TASAS_ISV_AUTORIZADAS)` y `@ValidateIf` (rechaza `null`, que `@IsOptional` dejaba pasar).
- Servicio (defensa ante llamadas internas que no pasan por `ValidationPipe`): `create`, `update` (si no se envía tasa y la guardada no está autorizada, exige elegir una), `duplicate` (no copia una tasa no autorizada), `convertirAVenta` (límite estructural para todos; la regla existente «tasa distinta de 15 % o líneas exentas solo ADMIN» se conserva para cotizaciones antiguas, decisión D2).
- Pantalla `CotizacionesPage`: el campo numérico libre pasa a selector con las tasas autorizadas (`frontend/src/utils/politica-isv.ts`, espejo); una tasa antigua no autorizada se muestra deshabilitada con aviso.
- Importes históricos: no se modifica ningún registro. Una cotización antigua conserva su tasa e importes hasta que alguien la edite.

### Pruebas

- `backend/src/common/politica-isv.spec.ts` (39): límites (15, 15.00, 14.99, 15.01, 99.99, 100, 100.01, −0.01, 15.001), inválidos (500, NaN, Infinity, `'15'`, `null`, objetos, arreglos, booleanos), lista inmutable, y manipulación del DTO con el mismo `ValidationPipe` global (`whitelist`): tasa, `isv`/`total`/`subtotal`/`totalLinea` inyectados se descartan, `exento` no booleano rechazado.
- `backend/src/cotizaciones/cotizaciones.service.spec.ts` (+16; 24 en total): create rechaza 500/0/18/15.01/−1/NaN/null/'15' sin escribir; update de cotización antigua al 500 %; duplicate; conversión por ADMIN de 500 % rechazada sin reservar stock.
- `backend/test/cotizaciones.postgres.integration.ts` (+1, PostgreSQL 16 real, HTTP): crear con 500/0/18/15.5/−1/'15'/null → 400 sin filas; PUT con 500 → 400 sin cambiar importes; cotización antigua al 500 % → duplicar 400, convertir 400 sin venta; corrección a 15 % → 200.
- `backend/test/ciclo-ventas.postgres.integration.ts` JW-04: la cotización de 0 % ahora se crea como dato heredado (la API devuelve 400) y conserva la verificación «cajero 400, ADMIN convierte».
- `frontend/test/operaciones.test.mjs` (+1): selector sin campo libre, opción antigua deshabilitada, solo 15 habilitado.

## P3 — compatibilidad histórica: cotizaciones antiguas con tasa no autorizada

**Antes:** la conversión de una cotización con tasa distinta de 15 % (0 %, 18 %, 500 %…) solo se restringía al rol: un ADMIN la convertía automáticamente en venta, copiando su ISV histórico.

**Ahora** (`cotizaciones.service.ts` `convertirAVenta`): una tasa no autorizada (`esTasaIsvAutorizada`) es un documento fiscalmente inválido y **nadie** lo convierte, tampoco un ADMIN (400 con instrucción). Las líneas exentas con tasa autorizada siguen exigiendo ADMIN, como antes (no son inválidas por ninguna regla aprobada; D3).

**Procedimiento de revisión y regularización** (sin modificar el historial original):
1. Localizar las afectadas, solo lectura: `SELECT id, numero_cotizacion, estado, porcentaje_isv, isv, total FROM cotizaciones WHERE tenant_id=$1 AND porcentaje_isv <> 15 AND estado <> 'CONVERTIDA';`. No se ejecutó en ningún entorno real.
2. Revisión con el contador: si el cliente estaba exonerado (constancia del SAR), **no** regularizar a 15 %. Queda pendiente de D2 (no hay flujo de exonerados).
3. Si corresponde la tasa general, un ADMIN ejecuta `POST /api/cotizaciones/:id/regularizar-isv` con `{ "motivo": "…" }`. El motivo debe tener entre 10 y 300 caracteres, y `porcentajeIsv` es opcional pero solo admite una tasa autorizada.
   - Crea una cotización **nueva** en BORRADOR. Copia el cliente y las líneas con sus precios unitarios, descuentos (como monto) y marcas exentas, y la recalcula con la tasa autorizada.
   - Sus notas dicen «Regularización de ISV de COT-NNNN (tasa original X %)».
   - Registra `COTIZACION_REGULARIZAR_ISV` en `auditoria_operaciones`, con el vínculo a la original y los importes antes y después.
   - La original **no cambia**: misma tasa, importes, estado y líneas, y sigue sin poder convertirse en venta.
   - No regulariza una cotización ya autorizada (409) ni una convertida (409: su corrección es contable).
4. Se envía al cliente la cotización nueva, que puede tener un total distinto. Se convierte en venta con las reglas normales, incluida la política de precio vigente.
5. Pendiente de interfaz: hoy el procedimiento es solo por API. La pantalla muestra el rechazo del servidor, pero no tiene botón de regularización.

Pruebas:
- Servicio (+3): conversión de una cotización al 0 % rechazada aunque sea ADMIN; regularización correcta con auditoría; permisos, motivo, tasa, «no requiere» y «ya convertida».
- HTTP con PostgreSQL real (+1): la original queda idéntica campo por campo, se audita el vínculo, la cotización nueva es convertible y la original no.
- JW-04 adaptado: el cajero sigue recibiendo 400; el ADMIN también recibe 400, regulariza y convierte la cotización nueva.

## H2 — exenciones

### Dónde se pierde la condición de exento

1. **No existe en el producto.** `productos` no tiene marca de exención. En cotizaciones, `exento` es una casilla por línea que marca el usuario (`detalles_cotizacion.exento`); el mismo producto puede ir gravado en una cotización y exento en otra. Prueba: «sin marca por línea, el producto "exento" se grava».
2. **Venta en línea y POS sin conexión.** `calcularTotales` (`common/dinero.ts` y `frontend/src/offline/money.ts`) grava toda la base al 15 %. No hay forma de vender una línea exenta.
3. **Conversión de cotización a venta.** `ventas.isv/total` se copian de la cotización (importe histórico correcto, prueba HTTP con 148.50), pero `detalles_venta` **no tiene columna de exención**: la condición solo sobrevive en `detalles_cotizacion`, y Contabilidad la reconstruye con `importesDeVenta` vía `cotizaciones.venta_id` (`contabilidad.service.ts` ~231).
4. **Devoluciones** (`operaciones.service.ts` `planDevolucion`): el reembolso es `total × (bruto devuelto / bruto vendido)`. En una venta convertida con líneas exentas, devolver la línea exenta reembolsa una parte del ISV que no se cobró por ella, y devolver la gravada reembolsa menos ISV del cobrado. Ejemplo: gravado 100 + exento 50, total 165.00; devolver la exenta reembolsa 55.00 en vez de 50.00. **No se corrige aquí**: el reparto base/ISV en devoluciones ya figura como decisión pendiente del contador y requiere la marca por línea en la venta.
5. **Riesgo de manipulación.** Igual que la tasa, la casilla `exento` la decide quien cotiza (VENDEDOR/CAJERO/ADMIN). La mitigación existente es que solo ADMIN convierte cotizaciones con líneas exentas. Restringir quién marca una línea exenta es una decisión de permisos (D5).

### Cálculo común propuesto (no conectado)

`backend/src/common/calculo-fiscal-propuesta.ts` — `calcularTotalesConExencion(lineas, descuentoCentavos, tasa)`:
- centavos enteros, mitad hacia arriba, tasa validada con `exigirTasaIsvAutorizada`;
- el descuento general se reparte entre exento y gravado en proporción al bruto, con el mismo redondeo que `importesDeVenta` de Contabilidad (se redondea la parte exenta; la gravada es el resto);
- ISV una sola vez sobre la base gravada.

Pruebas (`calculo-fiscal-propuesta.spec.ts`, 6): sin exentas es **idéntica** a `calcularTotales` en los vectores compartidos POS/servidor y en un barrido con descuentos, por lo que conectarla no cambiaría ninguna venta actual; solo exentas → ISV 0; combinada con descuento → 148.50 igual que la cotización; reparto idéntico al de Contabilidad; rechaza 500 % y 0 %.

Diferencia conocida con la cotización actual: la cotización redondea el ISV por línea y luego lo prorratea; la propuesta redondea una vez sobre la base gravada. Pueden diferir en un centavo con varias líneas gravadas y descuento general. Elegir una de las dos es regla del contador (D6).

Para conectarla (fuera de esta rama): aprobación del contador; marca de exención en `productos` y en `detalles_venta` con valor histórico (migración NEXUS, expandir → contraer, sin reescribir ventas existentes); espejo idéntico en `frontend/src/offline/money.ts` con vectores compartidos que incluyan exentas; uso en `ventas.service.ts`, contingencia, cotizaciones y devoluciones.

### Pruebas añadidas

- Servicio: solo gravadas, solo exentas, combinada con descuento general (13.50 de ISV, total 148.50), duplicado conserva importes y marca por línea.
- HTTP + PostgreSQL: solo exenta (ISV 0); combinada guarda `exento` por línea y la venta convertida conserva 150 / 15 / 13.50 / 148.50; `detalles_venta` sin marca de exención (evidencia del punto 3).

## H3 — `FiscalTasa`

- **Sí se usa** (corrige la versión anterior). Migración `20261027000200_contabilidad_honduras`: tabla `fiscal_tasas` con CHECK `impuesto = 'ISV'`, `categoria IN ('GENERAL','ESPECIAL')`, `0 < porcentaje < 100`, base legal de 3–500 caracteres, disparador contra solape de vigencias, FK a `tenants` y `usuarios` con `RESTRICT`. Prisma `FiscalTasa` (`schema.prisma` ~1617).
- Lectores y escritores (SQL directo, por eso no aparece como `prisma.fiscalTasa`): `contabilidad.service.ts` (`tasas`, `crearTasa`, `cerrarVigenciaTasa`, tasa vigente para documentos), `libros.ts` (verificación de ISV en libros y hallazgo `SIN_TASA_GENERAL_VIGENTE`), `reportes.ts` (tasa general del período). Permisos: `contabilidad.ver` para leer, `contabilidad.configurar` para escribir, rol ADMIN/CONTADOR, módulo Contabilidad activable por negocio.
- **Recomendación:** conservarla, no eliminarla. Es el lugar correcto para tasas con vigencia y base legal. **No activarla en ventas ahora**: (a) puede estar vacía en un negocio, y el POS no puede quedar sin tasa; (b) el módulo Contabilidad puede estar desactivado; (c) el POS sin conexión necesita la tasa en caché con versión; (d) cambiaría una regla fiscal sin aprobación. Paso seguro propuesto para después de D7: comprobación cruzada de solo lectura (alerta si la tasa general vigente de `fiscal_tasas` difiere de `TASAS_ISV_AUTORIZADAS`), sin cambiar cálculos.

## Decisiones pendientes (contador y dueño)

| # | Decisión | Afecta |
| --- | --- | --- |
| D1 | ¿El ISV de cotizaciones queda fijo en la tasa general o se admite otra (18 %)? Hoy solo 15 %. | `TASAS_ISV_AUTORIZADAS` |
| D2 | Clientes exonerados (constancia del SAR): ¿se admiten cotizaciones al 0 % o con importe exonerado? ¿Qué pasa con las cotizaciones antiguas al 0 % u otra tasa? | Política, conversión, `importe_exonerado` |
| D3 | ¿Qué productos son exentos y quién los marca? ¿Marca en el producto, en la línea o ambas? | Esquema (NEXUS) |
| D4 | ¿Se venden líneas exentas en el POS en línea y sin conexión? | `dinero.ts`/`money.ts` |
| D5 | ¿Quién puede marcar una línea exenta en una cotización? | Permisos |
| D6 | Redondeo del ISV: por línea (cotización actual) o sobre la base gravada (propuesta) | Cálculo común |
| D7 | ¿`fiscal_tasas` pasa a ser la fuente de la tasa en ventas? | H3 |
| D8 | Reparto base/ISV en devoluciones de ventas con líneas exentas | Devoluciones |

Propuesta de auditoría de datos (solo lectura, antes de cualquier CHECK en `cotizaciones.porcentaje_isv`): `SELECT tenant_id, porcentaje_isv, count(*) FROM cotizaciones WHERE porcentaje_isv <> 15 GROUP BY 1, 2;`. No se ejecutó en ningún entorno real.

## Validación local

- Backend unitarias **72 archivos / 814** (`main`: 70 / 750); build y lint sin errores (solo avisos existentes). Incluye P3.
- Frontend **573/573**; `tsc -b`, `vite build` con `VITE_API_URL=/api` y lint sin errores.
- Integración con PostgreSQL 16 real (clúster temporal, datos sintéticos): **67 archivos / 1208 aprobadas, 1 omitida** (incluye P3) (caso de navegador sin `REAL_SETTINGS_BROWSER`).
- CI de `67abc39` (antes de P3): `validate`, `test` y `guard-base-datos` en verde. CI del commit de P3: pendiente al escribir. Sin merge, sin despliegue, sin acceso a producción ni datos reales.
