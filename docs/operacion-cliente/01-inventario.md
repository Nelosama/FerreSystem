# 01 · Inventario inicial

Guía para cargar el catálogo y las existencias iniciales. Todo lo marcado como **verificado** se comprobó en el código de `main` `7ccfad25`. Los datos de la ferretería no se incluyen: deben venir del cliente.

## 1. Tres formas de cargar productos

| Vía | Quién puede | Qué hace | Cuándo usarla |
|---|---|---|---|
| **Alta manual** (`/inventario`, formulario de producto) | ADMIN, BODEGUERO | Crea un producto. Si se indica existencia inicial, registra un movimiento `INICIAL` | Productos sueltos y correcciones de catálogo |
| **Importación CSV** (botón de importar en `/inventario`) | ADMIN, BODEGUERO | Crea productos nuevos desde un archivo. Para códigos existentes solo actualiza si se confirma «Sobrescribir stock y precio» | Carga inicial de varios artículos |
| **Levantamiento físico** (`/levantamiento`) | Contar: ADMIN, BODEGUERO. Aplicar: solo ADMIN | Conteo por empleado, vista previa, conciliación de diferencias y aplicación al inventario | Conteo real de estantes y bodega |

**Secuencia recomendada para el primer día:** (1) importar la lista base con las existencias sin sobrescribir; (2) completar en el formulario lo que el CSV no lleva (código de barras, marca); (3) hacer un conteo físico con levantamiento y que el ADMIN aplique las diferencias.

## 2. Datos solicitados y dónde se guardan

| Dato | Campo del sistema | Columna del CSV importable | Observaciones |
|---|---|---|---|
| Código del producto | `codigo` | `codigo` | Obligatorio. Único por empresa sin distinguir mayúsculas. El importador lo guarda en mayúsculas. |
| Código de barras | `codigoBarras` | — | Solo en formulario o con escáner. Único en toda la empresa, incluidos inactivos. |
| Descripción | `descripcion` | — | El importador **no** lee una columna `descripcion` aparte: la toma como **nombre** si no existe `nombre`. Use `nombre`. |
| Nombre | `nombre` | `nombre` | Obligatorio. Incluya la medida y la presentación (ej.: «Tornillo 3x1 caja 100»). |
| Categoría | `categoriaId` | `categoria` | Texto libre. Si no existe, se crea. Vacío → «Herramientas Manuales» (ver §5). |
| Unidad de medida | `unidadMedida` | `unidadMedida` | El CSV acepta solo 5 valores (ver §3). |
| Costo | `precioCosto` | `precioCosto` | Se guarda como costo al dar de alta. |
| Costo vigente | `costoVigente` | — | **No se escribe al dar de alta** (`productos.service.ts`, línea 51). Lo fija la recepción de compras con la regla «última recepción». |
| Precio de venta | `precioVenta` | `precioVenta` | Vacío → 0 (ver §5). |
| Existencia inicial | `stockActual` + movimiento `INICIAL` | `stockActual` | Vacío → 0. |
| Existencia mínima | `stockMinimo` | `stockMinimo` | Vacío → 5 (ver §5). |
| Proveedor | No existe en el producto | — | Se asocia en compras (Proveedor → Orden de compra → recepción). En la plantilla maestra se anota para planear compras; el importador no lo lee. |
| Marca | `marca` | — | Solo en formulario. |

Las cantidades admiten dos decimales (ej.: 12.75 m).

## 3. Unidades de medida

- **Formulario:** 12 valores: `UNIDAD`, `PIE`, `METRO`, `METRO_CUADRADO`, `METRO_CUBICO`, `LIBRA`, `KG`, `GALON`, `LITRO`, `CAJA`, `PAQUETE`, `OTRO`.
- **CSV:** solo 5 valores, escritos exactamente así (sin distinguir mayúsculas): `unidad`, `caja`, `metro`, `kg`, `galón`. **Con acento.** Escribir `galon` sin acento se rechaza.
- Una unidad no se puede cambiar si el producto ya tiene existencias o movimientos. Para otra unidad hay que crear otro producto: **no hay conversión entre unidades**.

**Decisión del cliente antes de cargar** (no la define esta documentación):

| Artículo | Opción A | Opción B | Qué decidir |
|---|---|---|---|
| Canaleta | `metro`: existencia en metros | `unidad`: tramo de largo fijo (ej.: 3 m) | ¿Se vende por metro o por tramo? |
| Lámina | `METRO_CUADRADO` (formulario) | `unidad`: lámina de medida fija | Si se vende por lámina completa o por metro cuadrado |
| Varilla | `metro` | `unidad`: varilla de 6 m | Una presentación por producto |
| Tornillo | `unidad`: pieza | `caja`: caja de N piezas | Si se vende suelto o en caja |

Cada diámetro, espesor o presentación es **un producto separado** con su propio código. No hay modelo de variantes relacionadas.

**Nota:** el campo «usa medida» existe en el formulario, pero en el código revisado solo lo usan las cotizaciones; el POS no lo usa. No cuente con él para vender por medida hasta probarlo en preproducción.

## 4. Propuesta de códigos (no impuesta por el sistema)

Una convención simple ayuda a no duplicar artículos. Ejemplo: `CAN-GAL-3M`, `VAR-38-6M`, `TOR-3X1-C100`. Reglas sugeridas: sin espacios, sin acentos, con prefijo por familia. El sistema solo exige que el código sea único en la empresa.

## 5. Reglas del importador (verificadas en `ImportarProductosModal.tsx`)

- **Archivo:** CSV en UTF-8. En Excel: «Guardar como → CSV UTF-8». Máximo 5 MB y 5000 filas. Un error de lectura rechaza el archivo completo.
- **Encabezados:** se reconocen sin distinguir mayúsculas, espacios, guiones bajos ni acentos. `precioCosto`, `Precio costo` y `precio_costo` son equivalentes.
- **Obligatorios:** `codigo` y `nombre`. Una fila sin ellos se marca como error y no se importa.
- **Vacíos que se llenan en silencio (riesgo):**

| Campo vacío | El sistema lo guarda como | Aviso |
|---|---|---|
| `precioCosto` / `precioVenta` | 0.00 | Ninguno |
| `stockActual` | 0 | Ninguno |
| `stockMinimo` | 5 | Ninguno |
| `categoria` | «Herramientas Manuales» | Ninguno |
| `unidadMedida` | `unidad` | Ninguno |

  Por eso la plantilla exige llenar todas las columnas, y la revisión previa busca precios en 0.

- **Plantilla del propio sistema:** el botón «DESCARGAR PLANTILLA CSV» incluye **3 filas de ejemplo** (`COD-001` a `COD-003`, «Producto Ejemplo»). Bórrelas antes de importar.
- **Códigos repetidos:**
  - Sin confirmar «Sobrescribir»: el código existente se **omite**.
  - Con «Sobrescribir stock y precio»: actualiza nombre, categoría, precios, **existencias** y mínimo, con el motivo «Importación de inventario revisada». Sobrescribir reemplaza las existencias por las del archivo.
  - Un producto **inactivo** con el mismo código no aparece en la comparación del importador. El servidor lo rechaza y la fila cuenta como error.
- **Columnas que el importador no escribe:** proveedor, marca, código de barras, costo vigente, imagen.
- **Resultado:** al terminar muestra importados, actualizados, omitidos y errores. Guarde ese resumen como evidencia de la carga.

## 6. Procedimiento de carga inicial

1. Pedir al cliente su lista real de artículos y existencias. **No completar datos inventados.**
2. Llenar `plantillas/inventario_registro_maestro.csv` con todo lo que se tenga (incluidos proveedor, marca y código de barras).
3. Revisar antes de importar:
   - [ ] Ningún código repetido (sin distinguir mayúsculas).
   - [ ] Ningún precio en 0, salvo que sea intencional.
   - [ ] Ninguna categoría vacía.
   - [ ] Unidades solo de las 5 permitidas (`unidad`, `caja`, `metro`, `kg`, `galón`).
   - [ ] Nombres sin comas (la coma separa columnas; use guiones o espacios).
   - [ ] Existencias con punto decimal (`12.75`), no coma.
4. Copiar a `plantillas/inventario_importable_ferresystem.csv` (encabezados exactos) y guardar como CSV UTF-8.
5. **Probar primero en preproducción** con una copia. No importar en producción sin autorización del dueño.
6. Importar **sin** sobrescribir. Revisar el resumen: importados, omitidos y errores.
7. Corregir en el archivo maestro las filas con error y volver a importar solo esas.
8. Cargar desde el formulario lo que el CSV no lleva: código de barras, marca y productos con unidad no permitida en CSV (`pie`, `libra`, `litro`, `paquete`, `otro`, `metro cuadrado`, `metro cúbico`).
9. Hacer el conteo físico con levantamiento. Solo el ADMIN aplica después de revisar diferencias.
10. Guardar el CSV usado, el resumen de importación y el acta del conteo.

## 7. Limitaciones reales

- Sin lotes, series, vencimientos ni garantías por producto: no existen en el modelo. No se deben prometer.
- Sin variantes relacionadas, sin conversión de unidades y sin sucursales: el stock es por empresa.
- La ubicación física queda solo en el historial del conteo, no en el catálogo.
- Imágenes: solo se guarda una URL. No hay servicio de fotos en red local.
- Un producto no tiene proveedor propio; el proveedor vive en compras.
- El costo manual puede cambiarse a mano (ADMIN y BODEGUERO), con auditoría, aunque rompe la regla de costo vigente. La restricción es una decisión pendiente del dueño.
