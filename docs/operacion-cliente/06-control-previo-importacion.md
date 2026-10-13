> **Superado para carga de inventario (2026-10-13).** Use `11-captura-inventario-simple.md` y la plantilla `inventario_importable_v2.csv`. Este documento describe la plantilla anterior con columnas de precio, que el importador ignora.

# 06 · Control previo a importación

Lista que debe cumplirse **antes de cualquier importación real** del catálogo. Se usa junto con la herramienta `herramientas/validar_plantilla.py`, que revisa el archivo sin conectarse al sistema y sin escribir datos. Este documento no autoriza ninguna importación: la autoriza el dueño por escrito.

## 1. Cómo ejecutar el validador

```
python3 docs/operacion-cliente/herramientas/validar_plantilla.py ARCHIVO.csv --catalogo CODIGOS_EXISTENTES.csv
```

- Requiere Python 3. No usa paquetes externos.
- `ARCHIVO.csv`: el archivo **importable** (encabezados exactos, ver §4). **No** valide directamente la hoja maestra: tiene columnas de trabajo y el validador la rechazará por encabezados. Genere primero el importable.
- `CODIGOS_EXISTENTES.csv` (opcional pero obligatorio si ya hay productos): CSV con una columna `codigo` que lista los códigos ya registrados en la empresa. Si la pantalla de inventario no muestra inactivos, el control no los conoce. En ese caso, pregunte al dueño antes de importar: un código inactivo repetido provoca error en el servidor (`01-inventario.md` §5).
- Resultado: código de salida **0** si no hay errores, **1** si hay errores, **2** si el archivo no se pudo leer.

## 2. Qué revisa y por qué

| Riesgo | Regla del validador | Resultado |
|---|---|---|
| Códigos repetidos en el archivo (sin distinguir mayúsculas) | Código repetido | **Error** |
| Producto que ya existe en la empresa | Código presente en `--catalogo` | **Error** (sin «Sobrescribir» se omitiría; con él cambiaría existencias) |
| Productos duplicados con otro código | Nombre repetido en dos filas | Aviso: revisar a mano |
| Precios vacíos | Campo vacío | **Error** (el importador lo convertiría en 0) |
| Precio con coma (`12,50`) | Coma decimal | **Error** (el importador leería `12`) |
| Precio o existencia no numérico, negativo o con más de dos decimales | Formato | **Error** |
| Precio de costo o venta en 0 | Valor 0 | Aviso: confirmar que es intencional |
| Existencias incorrectas en la carga inicial | `stockActual` distinto de 0 | Aviso: la carga inicial debe llevar 0 |
| Mínimo vacío (el importador usaría 5) | Campo vacío | **Error** |
| Categoría o unidad vacías | Campo vacío | **Error** |
| Filas de ejemplo (`[EJEMPLO]`, `EJ-*`, `COD-001` a `COD-003`, «Producto Ejemplo») | Patrón de ejemplo | **Error** |
| Unidades incompatibles con el CSV | No están entre `unidad`, `caja`, `metro`, `kg`, `galón` | **Error** (con pista si escribió `galon` sin acento) |
| Código con espacios o acentos | Caracteres | **Error** |
| Código con `/`, `.` u otros símbolos | Caracteres | Aviso (la convención no los usa, `01-inventario.md` §4.2) |
| Columna `descripcion` | Alias del importador | Aviso: se usaría como nombre |
| Encabezados faltantes | Comparación | **Error** |
| Archivo que no es UTF-8, pesa más de 5 MB o tiene más de 5000 filas | Lectura | **Error** o salida 2 |

Cada regla se probó con archivos de prueba fuera del repositorio: un archivo correcto pasa; archivos con duplicados, vacíos, coma decimal, unidades incorrectas, filas de ejemplo, encabezados faltantes, UTF-8 inválido y códigos existentes fallan con el mensaje esperado.

## 3. Lo que el validador **no** revisa (revisión manual obligatoria)

- [ ] Cada costo de referencia coincide con la factura o la lista de su `fuente_costo`.
- [ ] Cada precio de venta está aprobado por el dueño.
- [ ] Las unidades de canaletas, láminas, varillas, ángulos y tornillos siguen la decisión de `01-inventario.md` §3.
- [ ] Los nombres incluyen medida, calibre y presentación.
- [ ] Los códigos siguen la nomenclatura aprobada (`01-inventario.md` §4): familia, orden de atributos y abreviaturas aprobadas.
- [ ] Ningún código del fabricante se usó como código interno.
- [ ] Los artículos sin costo conocido fueron resueltos por el dueño (estimar, dejar fuera o excluir).
- [ ] Se borraron las filas de la plantilla del sistema si se usó como base.
- [ ] La primera carga se hará **sin** «Sobrescribir».
- [ ] El archivo tiene nombre con versión y fecha (ej.: `importable_v3_2026-10-14.csv`).

## 4. Del registro maestro al archivo importable

El archivo importable tiene exactamente estas columnas, en este orden:

`nombre,codigo,categoria,precioCosto,precioVenta,stockActual,stockMinimo,unidadMedida`

| Columna del maestro | Columna importable | Regla |
|---|---|---|
| `nombre` | `nombre` | Copiar |
| `codigo_interno` | `codigo` | Copiar |
| `categoria` | `categoria` | Copiar (decisión I3 en `03-manual-administrador.md` §13) |
| `costo_referencia` | `precioCosto` | Obligatorio. Vacío → la fila no entra |
| `precio_venta` | `precioVenta` | Obligatorio |
| — | `stockActual` | **Fijo en 0** |
| `stock_minimo` | `stockMinimo` | Obligatorio |
| `unidad_medida` | `unidadMedida` | Solo si es una de las 5 del CSV. Las demás se cargan en el formulario |

Las columnas que el importador no lee (`codigo_fabricante`, `codigo_barras`, `marca`, `familia`, `descripcion`, `proveedor`, `fuente_costo`, columnas de conteo) se quedan en el maestro. Los productos con unidad fuera de las 5 se cargan en el formulario tras la importación.

## 5. Orden del control

1. Generar el archivo importable desde el maestro (§4).
2. Ejecutar el validador con `--catalogo`.
3. Corregir los **errores en el maestro**, no en el archivo importable. Luego regenerar y validar de nuevo.
4. Revisar cada **aviso** con el dueño y dejar constancia de la decisión.
5. Completar la revisión manual (§3).
6. **Preproducción:** importar una copia sin «Sobrescribir». Comparar el resumen con las filas válidas y revisar cinco fichas al azar: nombre, código, categoría, unidad, costo de referencia, precio, mínimo y existencia 0.
7. **Autorización escrita** del dueño (nombre, fecha, versión del archivo).
8. Importar en producción sin «Sobrescribir». Guardar el resumen (importados, actualizados, omitidos, errores).
9. Si el resumen no coincide con lo esperado, **no reimportar a ciegas**: revisar las filas con error, corregir el maestro y validar de nuevo.

**Nota:** reimportar el mismo archivo sin «Sobrescribir» no duplica productos: los códigos ya existentes se omiten. Aun así, el resumen debe revisarse.

## 6. Criterio de no-go (no importar)

- Existe al menos un **error** del validador.
- Hay avisos sin decisión del dueño.
- Falta la autorización escrita.
- La copia de preproducción no coincidió con el resumen esperado.
- Se pretende usar «Sobrescribir» en la primera carga.
- No se puede responder si hay códigos inactivos repetidos.
