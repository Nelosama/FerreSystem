# 11 · Captura de inventario: instrucciones simples

Reemplaza la captura descrita en `01-inventario.md` y `06-control-previo-importacion.md` para la carga inicial. Esos documentos quedan como referencia técnica.

**Principio:** no invente datos. Lo que no conozca se deja en blanco y se pregunta al dueño. Ningún precio ni costo sale de este documento.

---

## 1. Qué archivo usar

- **Plantilla de carga:** `plantillas/inventario_importable_v2.csv` (seis columnas).
- **Ejemplo para practicar:** `plantillas/ejemplo_ficticio_v2.csv` (productos ficticios, solo para capacitación).
- **Hoja de precios para el administrador:** `plantillas/precios_para_aprobar_administrador.csv` (no se importa).

La plantilla anterior con columnas de precio (`inventario_importable_ferresystem.csv`) **ya no se usa**: el importador ignora esas columnas.

## 2. Las seis columnas

| Columna | Obligatoria | Regla |
|---|---|---|
| `nombre` | Sí | Nombre claro y completo. Sin abreviaturas que solo entienda quien lo escribió. |
| `codigo` | Sí | Único en la empresa. Solo letras mayúsculas, números, guion y guion bajo. Sin `/` ni `.`. Formato lo decide el dueño (I2). |
| `categoria` | Sí | **Exactamente** uno de los 7 nombres de la lista de §3. Cualquier otro texto crea una categoría nueva. |
| `stockActual` | Sí | Existencia real contada. Si la tienda hará conteo físico después, cargue **0** y registre el conteo en el levantamiento. Use punto decimal, máximo dos decimales. |
| `stockMinimo` | Sí | Mínimo para alerta de reposición. Si no lo conoce, pregunte al dueño; el importador usa 5 si la celda está vacía. |
| `unidadMedida` | Sí | Exactamente una de: `unidad`, `caja`, `metro`, `kg`, `galón` (con tilde). |

**Errores que el validador detecta:** código repetido, coma decimal, unidad no admitida (por ejemplo `galon` sin tilde), filas de ejemplo sin borrar, archivo vacío.

## 3. Familias y categorías (las 7 que ya existen en el sistema)

Use estos nombres exactos. Con esto no hace falta crear categorías nuevas.

| Familia para el conteo | Valor en `categoria` |
|---|---|
| Herramientas de mano | Herramientas Manuales |
| Herramientas eléctricas | Herramientas Eléctricas |
| Tornillería y fijación | Tornillería |
| Pintura | Pintura |
| Plomería | Plomería |
| Electricidad | Electricidad |
| Construcción | Construcción |

Si un artículo no encaja en ninguna, **no lo invente**: pregunte al dueño (decisión I1).

## 4. Unidades: qué elegir

| Qué vende | `unidadMedida` |
|---|---|
| Piezas sueltas | `unidad` |
| Por caja o paquete cerrado | `caja` |
| Por metro (cable, tubo, canaleta) | `metro` |
| Por kilo (cemento, clavos a granel) | `kg` |
| Por galón (pintura, químicos) | `galón` |

Otras unidades (pie, litro, libra, paquete, etc.) **no entran por importación**: se crean en el formulario de producto. Confirme con el dueño cuál usará cada familia (decisión I4). La unidad de un producto **no se puede cambiar** después si ya tiene movimientos.

## 5. Procedimiento de carga

1. Llenar la plantilla con productos de **una familia a la vez**.
2. Ejecutar el validador: `python3 herramientas/validar_plantilla.py <archivo.csv>`. No importar si dice «NO importar».
3. En el sistema, en la pantalla de Inventario, abrir la opción de importar (el nombre exacto del botón puede variar en su versión), elegir el archivo y revisar el resumen.
4. Si un código ya existe, el importador lo **omite** salvo que marque «Sobrescribir». **Sobrescribir reemplaza las existencias** del producto existente. Use «Sobrescribir» solo si el archivo es la fuente correcta (decisión D4).
5. Anotar cuántos se importaron, omitieron y fallaron.

## 6. Después de importar: precios (obligatorio)

- Los productos importados **quedan sin precio aprobado**. No se venden hasta que el administrador fije y apruebe el precio.
- Use `precios_para_aprobar_administrador.csv` para preparar los precios con el dueño. No copie precios de otra tienda.
- El administrador fija cada precio en **Precios y aprobación** (un producto a la vez; el sistema no tiene carga masiva de precios).
- Verifique que el listado de productos pendientes quede vacío para los artículos que se venderán el primer día.

## 7. Conteo físico y conciliación (si aplica)

Ver `07-levantamiento-conciliacion-jornada.md`. Resumen:

- Un contador por familia; un reconteo por muestra (propuesta: 20 % y todos los de mayor valor, decisión I9).
- Corte: hora y regla de ventas durante el conteo (decisión I8).
- Solo el administrador aplica el levantamiento. Revise los conflictos antes de aplicar (decisión I11).
- Umbral de diferencia que exige revisión del dueño (decisión I7).

## 8. Lo que este procedimiento NO cubre

- Lotes, series, vencimientos, variantes de medida o color: no existen en el sistema.
- Sucursales: no existe modelo de sucursal; todo el inventario es de una sola tienda.
- Fotografías de productos: no hay servicio de fotos; el campo `imagenUrl` existe pero no se carga por este archivo.
- Etiquetas: el sistema no genera etiquetas de código de barras.
