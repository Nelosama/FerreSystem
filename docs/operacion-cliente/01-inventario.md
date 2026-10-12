# 01 · Inventario inicial

Referencia de datos, unidades, codificación, reglas del importador y costos para cargar el catálogo y las existencias iniciales. El procedimiento de jornada está en `07-levantamiento-conciliacion-jornada.md` y el control previo a importar en `06-control-previo-importacion.md`.

Lo marcado como **verificado** se comprobó en el código de `main` `7ccfad25`. Los datos reales de la ferretería no se incluyen: deben venir del cliente.

## 1. Vías de carga y cuál usar

| Vía | Quién puede | Qué hace | Uso en este plan |
|---|---|---|---|
| **Importación CSV** (botón de importar en `/inventario`) | ADMIN, BODEGUERO | Crea productos nuevos. Con códigos existentes no hace nada, salvo que se confirme «Sobrescribir» | **Carga del catálogo** (nombre, código, categoría, costo de referencia, precio, mínimo, unidad). Existencia **0** |
| **Levantamiento físico** (`/levantamiento`) | Contar: ADMIN, BODEGUERO. Aplicar: solo ADMIN | Conteo por persona, vista previa, conciliación de conflictos y aplicación con existencia contada | **Conteo físico**. Es el registro de quién contó qué |
| **Alta manual** (`/inventario`) | ADMIN, BODEGUERO | Crea un producto. Con existencia inicial registra un movimiento `INICIAL` | Correcciones y productos sueltos |

**Por qué el conteo va en levantamiento y no en el CSV:** el importador no guarda quién contó, no detecta dos conteos distintos del mismo producto y convierte vacíos en cero sin aviso. El levantamiento sí registra el contador, marca conflictos entre personas, exige que un administrador revise y aplique, y acepta los 12 valores de unidad.

**Alternativa (no recomendada):** importar con existencias ya contadas. Funciona, pero no deja trazabilidad del conteo. Solo si el dueño lo decide por escrito.

## 2. Datos solicitados y dónde se guardan

| Dato | Campo del sistema | Columna del CSV importable | Observaciones |
|---|---|---|---|
| Código interno | `codigo` | `codigo` | Obligatorio. Único por empresa sin distinguir mayúsculas. Se guarda en mayúsculas. Ver §4 |
| Código del fabricante | `codigoFabricante` | — | Solo formulario o levantamiento. Nunca reemplaza el código interno |
| Código de barras | `codigoBarras` | — | Solo formulario, levantamiento o escáner. Único en toda la empresa, incluidos inactivos |
| Familia | — (se usa `categoria`) | — | Ver §4.1 y decisiones I1 e I3 en `03-manual-administrador.md` §13 |
| Nombre | `nombre` | `nombre` | Obligatorio. Incluir medida, calibre y presentación. Es lo que se busca al vender |
| Descripción | `descripcion` | — | El importador **no** la lee: si existe una columna `descripcion` la toma como **nombre**. Use `nombre` |
| Marca | `marca` | — | Solo formulario o levantamiento |
| Categoría | `categoriaId` | `categoria` | Texto libre. Si no existe se crea. Vacío → «Herramientas Manuales» (§5) |
| Unidad de medida | `unidadMedida` | `unidadMedida` | El CSV acepta 5 valores (§3). El levantamiento acepta los 12 |
| Costo de referencia | `precioCosto` | `precioCosto` | Costo conocido al cargar. **No es el costo vigente** (§8) |
| Costo vigente | `costoVigente` | — | Solo lo fija una recepción de compra (§8) |
| Precio de venta | `precioVenta` | `precioVenta` | Vacío → 0 en el CSV (§5). Lo decide el dueño |
| Existencia física | `stockActual` | `stockActual` (usar **0**) | En el CSV: 0. La existencia real la fija el conteo aplicado |
| Existencia mínima | `stockMinimo` | `stockMinimo` | Vacío → 5 en el CSV (§5) |
| Proveedor | No existe en el producto | — | Se asocia en compras (Proveedor → Orden de compra → recepción). El registro maestro lo anota para planear compras |

Las cantidades admiten dos decimales (ej.: 12.75 m).

## 3. Unidades de medida

- **Formulario y levantamiento:** 12 valores: `UNIDAD`, `PIE`, `METRO`, `METRO_CUADRADO`, `METRO_CUBICO`, `LIBRA`, `KG`, `GALON`, `LITRO`, `CAJA`, `PAQUETE`, `OTRO`.
- **CSV:** 5 valores, sin distinguir mayúsculas: `unidad`, `caja`, `metro`, `kg`, `galón`. **Con acento.** Escribir `galon` se rechaza.
- **Levantamiento:** la unidad contada debe coincidir con la unidad del producto. Si no coincide, la vista previa la bloquea y **no convierte cantidades**. Para otra unidad hay que crear otro producto.
- Una unidad no se cambia si el producto tiene existencias o movimientos.

**Decisión por familia (la confirma el dueño antes de cargar):**

| Familia | Opción A | Opción B | Qué decidir |
|---|---|---|---|
| Canaletas | `METRO`: se cuenta en metros | `UNIDAD`: tramo de largo fijo (ej.: 3 m) | ¿Se vende por metro o por tramo? |
| Láminas | `METRO_CUADRADO` | `UNIDAD`: lámina de medida fija | ¿Por lámina completa o por metro cuadrado? |
| Varillas | `METRO` | `UNIDAD`: varilla de 6 m | Una presentación por producto |
| Ángulos | `METRO` | `UNIDAD`: pieza de largo fijo | Igual que varillas |
| Tornillos | `UNIDAD`: pieza | `CAJA`: caja de N piezas | Si se venden sueltos o en caja |

Cada diámetro, calibre, espesor o presentación es **un producto separado** con su propio código. No hay modelo de variantes relacionadas.

**Nota:** el campo «usa medida» del formulario solo lo usan las cotizaciones en el código revisado; el POS no lo usa. No cuente con él para vender por medida sin probarlo en preproducción.

## 4. Codificación

### 4.1 Familias de trabajo (propuesta)

Estas familias organizan el levantamiento. **No coinciden necesariamente con el catálogo real del cliente.** Son un punto de partida para revisar con el dueño.

| Prefijo | Familia | Incluye (ejemplos) |
|---|---|---|
| `CAN` | Canaletas | Canaleta lisa, corrugada, bajante |
| `LAM` | Láminas | Zinc, galvanizada, teja, lámina plástica |
| `VAR` | Varillas | Corrugada, lisa, alambrón |
| `ANG` | Ángulos | Ángulo de hierro, ángulo de aluminio |
| `TOR` | Tornillos | Punta broca, madera, tirafondo, tuerca |
| `HER` | Herramientas | Manuales y eléctricas: martillos, taladros, llaves |
| `PIN` | Pinturas | Látex, esmalte, aerosol, sellador |
| `ELE` | Materiales eléctricos | Cable, breaker, tomacorriente, cinta |
| `OTR` | Otros artículos | Lo que no encaja en las anteriores |

### 4.2 Reglas de código interno

1. **Formato:** `FAMILIA-ATRIBUTO-ATRIBUTO-…`, en MAYÚSCULAS, sin acentos, sin espacios.
2. **Caracteres:** solo `A-Z`, `0-9`, guion `-` y guion bajo `_`. Nada de `/` ni `.` (el control previo los marca).
3. **Largo:** hasta 30 caracteres, para que sea legible en una etiqueta.
4. **Orden fijo por familia:** el mismo orden de atributos en todos los productos de esa familia (ver §4.3). Así se puede buscar y leer sin consultar una lista.
5. **Listas cerradas:** cada abreviatura sale de una tabla aprobada. Una abreviatura nueva requiere aprobación del dueño. Así se evitan variantes como `GALV` y `GALVANIZADA` para el mismo producto.
6. **Un código por producto distinto:** cambian los códigos si cambia la medida, el calibre, el color, el material o la presentación.
7. **Sin reutilizar códigos:** un código dado de baja no se asigna a otro artículo. Las ventas y movimientos quedan ligados al código.
8. **Código del fabricante aparte:** si el artículo trae código o barras del fabricante, va en `codigoFabricante` o `codigoBarras`. El código interno siempre es el nuestro.
9. **Sin código automático:** si el campo de código se deja vacío, el sistema genera uno a partir del nombre (ej.: `CANALETA-GALVANIZADA-5-PULG-001`), truncado a 18 caracteres. Para estas familias **no** se deja vacío: no describe el producto y el número secuencial cambia si el nombre cambia.

### 4.3 Formato por familia

| Familia | Estructura | Ejemplo de código | Ejemplo de nombre |
|---|---|---|---|
| Canaletas | `CAN-MAT-TAM-CAL-LARGO` | `CAN-GALV-P5-C26-3M` | Canaleta galvanizada 5 pulg calibre 26 x 3 m |
| Láminas | `LAM-TIPO-COLOR-CAL-LARGO` | `LAM-ZINC-NAT-C28-366CM` | Lámina zinc natural calibre 28 de 3.66 m |
| Varillas | `VAR-MAT-DIAM-LARGO` | `VAR-CORR-P3_8-6M` | Varilla corrugada 3/8 pulg de 6 m |
| Ángulos | `ANG-MAT-MED-ESP-LARGO` | `ANG-HIE-1X1-3MM-6M` | Ángulo de hierro 1x1 espesor 3 mm de 6 m |
| Tornillos | `TOR-TIPO-MED-PRES` | `TOR-PBROCA-3X1-C100` | Tornillo punta broca 3x1 caja 100 |
| Herramientas | `HER-TIPO-DETALLE` | `HER-MARTILLO-UNA-16OZ` | Martillo de uña 16 oz |
| Pinturas | `PIN-TIPO-COLOR-PRES` | `PIN-LATEX-BLA-GAL` | Pintura látex blanca galón |
| Eléctricos | `ELE-TIPO-CAL-LARGO` | `ELE-CABLE-AWG12-100M` | Cable eléctrico AWG 12 rollo 100 m |
| Otros | `OTR-NOMBRE-DETALLE` | `OTR-SILICON-TRANS-300ML` | Silicón transparente 300 ml |

### 4.4 Abreviaturas propuestas (a aprobar por el dueño)

| Campo | Valores propuestos |
|---|---|
| Material | `GALV` galvanizado · `ZINC` zinc · `CORR` corrugada · `HIE` hierro · `ALU` aluminio · `PVC` PVC · `LISA` lisa |
| Diámetro o tamaño en pulgadas | `P` + pulgada; fracción con `_`: `P1_2` = 1/2 pulg · `P3_8` = 3/8 pulg · `P5` = 5 pulg · `P1M1_4` = 1 1/4 pulg (`M` = «y») |
| Medida de ángulo o perfil | Ancho x alto: `1X1`, `2X2` |
| Espesor | Milímetros: `3MM` |
| Calibre | `C` + número: `C26`, `C28` (calibre estándar de lámina y canaleta) |
| Color | `NAT` natural · `BLA` blanco · `NEG` negro · `ROJ` rojo · `VER` verde · `AZU` azul |
| Largo | Metros: `3M`, `6M`. Centímetros si es necesario: `366CM` |
| Presentación | `GAL` galón · `CUB` cubeta · `C100` caja de 100 piezas · `400ML` · `1L` · `4L` |
| Tipo de tornillo | `PBROCA` punta broca · `MADERA` madera · `TIRAF` tirafondo |

La tabla es una propuesta: el dueño confirma las abreviaturas reales antes de codificar.

### 4.5 Búsqueda, escáner y colisiones

- **Búsqueda:** el POS busca por parte del nombre, del código, del código de barras, del código del fabricante y de la descripción (coincidencia por subcadena). Escribir `CAN-GALV` encuentra todas las canaletas galvanizadas. Escribir `galvanizada 5` encuentra por nombre. Por eso el nombre incluye las palabras que el cliente usa al pedir.
- **Escáner:** el POS agrega automáticamente un producto cuando un código o barras **coincide exactamente** con uno solo. Un código interno impreso en etiqueta funciona como código de barras **si el lector lo lee**. El sistema no imprime etiquetas: la etiqueta se hace con una herramienta externa. **Probar con el lector real antes de usarlo** (pendiente de validación).
- **Colisiones:** el sistema rechaza un código repetido sin distinguir mayúsculas. Además, el control previo revisa repetidos dentro del archivo y contra el catálogo existente. Antes de crear un código nuevo, búsquelo en el registro maestro. Revise también que no coincida con un código de fabricante ya registrado.

## 5. Reglas del importador (verificadas en `ImportarProductosModal.tsx`)

- **Archivo:** CSV en UTF-8. En Excel: «Guardar como → CSV UTF-8». Máximo 5 MB y 5000 filas. Un error de lectura rechaza el archivo completo.
- **Encabezados:** se reconocen sin distinguir mayúsculas, espacios, guiones bajos ni acentos.
- **Obligatorios:** `codigo` y `nombre`. Una fila sin ellos se marca como error y no se importa.
- **Vacíos que se llenan en silencio (riesgo):**

| Campo vacío | El sistema lo guarda como | Aviso |
|---|---|---|
| `precioCosto` / `precioVenta` | 0.00 | Ninguno |
| `stockActual` | 0 | Ninguno |
| `stockMinimo` | 5 | Ninguno |
| `categoria` | «Herramientas Manuales» | Ninguno |
| `unidadMedida` | `unidad` | Ninguno |

  Por eso el control previo (`06-control-previo-importacion.md`) rechaza cualquier vacío.

- **Coma decimal:** `12,50` se lee como `12`. Use punto.
- **Plantilla del propio sistema:** el botón «DESCARGAR PLANTILLA CSV» incluye **3 filas de ejemplo** (`COD-001` a `COD-003`). Bórrelas antes de importar.
- **Códigos existentes:** sin «Sobrescribir», se omiten. Con «Sobrescribir stock y precio», cambian nombre, categoría, precios, **existencias** y mínimo, con el motivo «Importación de inventario revisada». **En la primera carga no se usa Sobrescribir.**
- **Productos inactivos:** no aparecen en la comparación del importador (que lee solo activos). Si el código pertenece a uno inactivo, el servidor lo rechaza y cuenta como error.
- **Resultado:** importados, actualizados, omitidos y errores. Guarde ese resumen.

## 6. Procedimiento de carga (orden recomendado)

1. **Oficina:** llenar `plantillas/inventario_registro_maestro.csv` con familia, código interno, nombre, unidad, costo de referencia, precio y mínimo. Las columnas de conteo se dejan vacías.
2. **Validar:** pasar el archivo importable por el control previo (`06-control-previo-importacion.md`). Debe quedar sin errores.
3. **Generar el archivo importable** con la columna `stockActual` en **0** (ver §2 y `06`).
4. **Preproducción:** importar una copia sin «Sobrescribir». Comparar el resumen con las filas válidas y revisar cinco fichas al azar.
5. **Autorización del dueño** y importación real sin «Sobrescribir». Guardar el resumen.
6. **Conteo físico** en `/levantamiento`, por familias (`07-levantamiento-conciliacion-jornada.md`).
7. **Conciliación y aplicación:** solo el ADMIN aplica, después de revisar diferencias y conflictos.
8. **Evidencia:** CSV usado, resúmenes de importación, vista previa aplicada y acta del conteo.

## 7. Limitaciones reales

- Sin lotes, series, vencimientos ni garantías por producto: no existen en el modelo.
- Sin variantes relacionadas, sin conversión de unidades y sin sucursales: el stock es por empresa.
- La ubicación física queda solo en el historial del conteo, no en el catálogo.
- Imágenes: solo se guarda una URL. No hay servicio de fotos en red local.
- Un producto no tiene proveedor propio; el proveedor vive en compras.
- No hay generador de etiquetas en el sistema.
- Costo vigente inicial: no se puede fijar (§8.3).

## 8. Costos y precios

### 8.1 Qué guarda cada campo

| Concepto | Dónde vive | Quién o qué lo fija | Cambia cuando |
|---|---|---|---|
| Costo de referencia del inventario inicial | `precioCosto` | Importación, alta, edición o levantamiento (ADMIN/BODEGUERO, auditado) | Al editarlo a mano (queda auditado). **No cambia el costo vigente** |
| Costo registrado en cada compra | Historial de costos por compra (con proveedor, fecha y cantidad) | Solo la recepción de compra | En cada recepción |
| Costo vigente | `costoVigente` | Solo la recepción de compra, que además suma existencias | En cada recepción, sube o baja |
| Precio de venta | `precioVenta` | Alta, edición o levantamiento | Manual. No cambia con el costo |

### 8.2 Procedimiento

1. Para cada producto, el costo de referencia es el de la **última factura conocida** o, si no existe, el de la **lista vigente del proveedor**. Anote la fuente en `fuente_costo` (`factura 2026-…`, `lista proveedor`).
2. Si no hay costo conocido, la fila **no se importa** hasta que el dueño decida (estimar, dejar sin costo o excluir el artículo). El control previo lo marca como error.
3. El precio de venta lo decide el dueño. El sistema no lo calcula desde el costo.
4. Cada compra posterior se registra por el flujo de compras (Proveedor → Orden → Recepción). Esa recepción actualiza el costo vigente, incluso si el nuevo costo es menor. Esa es la política del cliente y el sistema la aplica así.
5. **No edite `precioCosto` a mano después de que existan recepciones:** el costo de referencia y el costo vigente se separarían. Es una de las decisiones pendientes del dueño (D1).

### 8.3 Impedimento: costo vigente inicial

**No existe un mecanismo seguro para fijar `costoVigente` del inventario inicial sin una compra.**

- `costoVigente` solo se escribe en la recepción de compra (`backend/src/operaciones/operaciones.service.ts`, línea 77).
- La recepción también suma existencias, crea un movimiento `COMPRA` y registra la compra con su cuenta por pagar.
- El importador, el alta y el levantamiento escriben `precioCosto`, pero no `costoVigente`.
- Usar una compra de apertura para fijar el costo duplicaría las existencias contadas y crearía una deuda con el proveedor que no existe. Además la cantidad de una recepción debe ser positiva, así que no puede ser cero.

**Efecto operativo:** al arranque, todos los productos tendrán costo de referencia y **costo vigente vacío**, hasta su primera compra recibida. La política «costo vigente = última compra» se cumple desde esa primera recepción.

**Decisión necesaria del PM** (no se implementa código): aceptar el costo vigente vacío hasta la primera compra, o autorizar una función específica de costo inicial. Esta documentación no la implementa.
