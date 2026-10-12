# 07 · Levantamiento, conciliación y primera jornada

Procedimiento para contar la mercancía en `/levantamiento`, conciliar las diferencias y aplicar el resultado. Funciona con **dos personas** y también con **una**. No asume cuántos empleados habrá.

Lo que describe el sistema se verificó en `LevantamientoPage.tsx` y en `backend/src/levantamientos/`. Los rótulos exactos de la pantalla se confirman en preproducción.

## 1. Lo que el sistema hace en el conteo (verificado)

- **Campos de cada conteo:** nombre del contador, descripción, cantidad, unidad (12 valores), código, código de barras, marca, categoría, ubicación, costo, precio, margen y notas. Hay búsqueda del producto por código o código de barras; si existe, el formulario se completa con sus datos.
- **Un contador no puede contar dos veces el mismo producto:** el sistema responde 409 `CONTEO_DUPLICADO`. Para corregirlo, edite el conteo anterior.
- **Dos contadores distintos del mismo producto:** la pantalla avisa que otro contador ya lo contó. Si las cantidades difieren, aparece un **conflicto** que concilia el ADMIN.
- **La unidad contada debe ser la del producto.** Si no coincide, la vista previa lo bloquea. No convierte cantidades.
- **Producto nuevo** (no está en el catálogo): al aplicar exige costo **y** precio. Sin ellos, el aplicar se rechaza.
- **Conteo menor que lo reservado** para ventas pendientes de entrega: el aplicar lo bloquea.
- **Aplicar** es solo del ADMIN, con una clave (token) de la vista previa. Si cualquier conteo cambió después, responde 409 y pide revisar de nuevo.
- **Finalizar** y **aplicar** son pasos separados. Aplicar exige el levantamiento en estado `FINALIZADO` y **sin conflictos pendientes**: si hay alguno, el sistema lo rechaza.
- El aplicar solo cambia los productos que figuran en el levantamiento. Un producto que no se contó no se toca.

## 2. Familias de trabajo

Las familias de `01-inventario.md` §4.1 organizan el conteo. Confirme con el dueño si el catálogo real se agrupa así.

| Familia | Código | Persona A (ejemplo) | Persona B (ejemplo) |
|---|---|---|---|
| Canaletas | CAN | ✓ | |
| Láminas | LAM | ✓ | |
| Varillas | VAR | ✓ | |
| Ángulos | ANG | ✓ | |
| Tornillos | TOR | | ✓ |
| Herramientas | HER | | ✓ |
| Pinturas | PIN | | ✓ |
| Materiales eléctricos | ELE | | ✓ |
| Otros artículos | OTR | | ✓ |

La división es una propuesta. Con una sola persona, cuente en el orden de la lista.

## 3. Procedimiento por producto (ocho pasos)

Se aplica en oficina al preparar el maestro y en la bodega al contar.

1. **Identificar el producto:** buscar en el catálogo por código, código de barras o nombre. Si no está, marcarlo como **nuevo** y no inventar datos.
2. **Revisar el código:** que coincida con el código del estante o de la etiqueta. Si hay dos códigos para lo mismo, anotarlo en discrepancias.
3. **Registrar descripción y atributos:** medida, calibre, color, presentación. Sin abreviar lo que el cliente pide.
4. **Identificar la unidad:** la unidad que se cuenta debe ser la del producto (`01-inventario.md` §3).
5. **Registrar el costo conocido:** solo en productos nuevos o con costo de referencia confirmado por factura. Para productos existentes, dejar el costo vacío en el conteo, para no cambiar el costo de referencia sin decisión.
6. **Registrar el precio de venta:** solo si lo aprobó el dueño. Obligatorio en productos nuevos.
7. **Contar la existencia física:** cantidad real en bodega y estante. Si hay mercancía en dos lugares, sumar ambos y anotar la ubicación.
8. **Verificar antes de confirmar:** la fila del levantamiento coincide con el producto, la unidad y la cantidad escrita en papel. Revisión de la vista previa antes del aplicar.

## 4. Roles

| Rol | Responsabilidad |
|---|---|
| **Administrador** | Validar productos nuevos. Confirmar precios. Revisar costos. Resolver conflictos y discrepancias. **Aplicar** el levantamiento. Autorizar cada corrección |
| **Personal de apoyo** | Contar la mercancía por familia. Identificar productos. Registrar la información en el sistema. Separar y reportar discrepancias |

## 5. Diseño para dos personas

1. **Reparto por familia:** cada persona cuenta sus familias (tabla §2).
2. **Reconteo ciego:** la persona B recuenta una **muestra** de los productos de la persona A, sin mirar la cifra anterior. Muestra mínima propuesta: 20 % de los productos, y **todos** los de mayor valor. El dueño puede subirla.
3. **Dónde aparece la diferencia:** cuando B registra un producto que A ya contó y las cantidades difieren, se genera un conflicto.
4. **Qué hace el ADMIN con un conflicto:** elige la cantidad correcta (o escribe una manual) y deja constancia de la decisión. No se suman conteos.

**Con una sola persona:** cuente todo por familias. Al terminar, recuente en papel la misma muestra. Si difiere, **edite el conteo anterior** (el sistema no permite contar dos veces el mismo producto con el mismo nombre de contador). El reconteo sirve para detectar errores de digitación, no para registrar un segundo contador.

## 6. Conciliación de existencias

### 6.1 Corte

El conteo mide la mercancía **en el momento del corte**. Defina la hora de corte y anótela.

- **Mejor opción:** contar con la tienda cerrada o sin ventas de las familias que se están contando.
- **Si la tienda sigue vendiendo:** anote la hora en que contó cada familia. Después, revise las ventas y entregas de esos productos posteriores a esa hora (número de venta en Devoluciones y reportes). Ajuste la cantidad contada **a mano**, con motivo en las notas. Es el punto de mayor riesgo del procedimiento.

### 6.2 Tipos de diferencia y acción

| Caso | Qué se ve en la vista previa | Acción |
|---|---|---|
| Sin diferencia | Contado = sistema | Ninguna |
| Faltante | Contado < sistema | Revisar: ventas posteriores al corte, mercancía en otro lugar. Reconteo |
| Sobrante | Contado > sistema | Revisar: entregas o compras no registradas, unidad mal contada. Reconteo |
| **Producto no contado** | No aparece en el levantamiento | Contarlo, o confirmar por escrito que está en 0. **Un producto no contado no cambia** al aplicar; con la carga inicial en 0, quedaría en 0 |
| Unidad distinta | Bloqueado | Confirmar la unidad correcta. Si el producto tiene movimientos, no se cambia: decidir con el dueño |
| Código o barras que no corresponden | Conflicto de identidad o producto equivocado | Corregir el código en la fila o en el catálogo, con motivo |
| Producto duplicado (dos fichas del mismo artículo) | Dos productos con nombre parecido | El ADMIN decide cuál queda. El otro se desactiva (no se borra) |
| Conteo menor a lo reservado | Bloqueado al aplicar | Entregar o cancelar la venta pendiente, o contar de nuevo |
| Conflicto entre dos contadores | Conflicto en la conciliación | El ADMIN elige la cantidad y registra el motivo |
| Producto nuevo sin costo o precio | Bloqueado al aplicar | Completar costo y precio con decisión del dueño |

### 6.3 Pasos de conciliación

1. **Cerrar el conteo** (finalizar) cuando todas las familias estén contadas y el reconteo hecho.
2. **Vista previa:** revisar fila por fila. Exportar el conteo en CSV o Excel como evidencia (botones de exportación de la pantalla de levantamiento).
3. **Resolver errores de la vista previa** (unidad, reservado, costo o precio de productos nuevos).
4. **Conciliar conflictos** en la pantalla de conflictos. Cada decisión lleva motivo.
5. **Nueva vista previa.** Cualquier cambio cambia la clave: ese paso es obligatorio.
6. **Aplicar** (solo ADMIN). Verificar cinco fichas aleatorias: existencia, unidad, costo de referencia y precio.
7. **Guardar la evidencia:** vista previa final, lista de decisiones del ADMIN, acta firmada por la persona que contó y el ADMIN.

**No se suman conteos ni se promedian.** Cada decisión elige un valor y lo registra.

## 7. Plan de primera jornada

Las horas no se fijan aquí porque dependen de la tienda. El orden sí es fijo. Hay puntos de control: no se pasa al siguiente sin cumplir el anterior.

### Día −1 · Oficina (ADMIN)

- [ ] Aprobar familias y abreviaturas (`01-inventario.md` §4). Decisiones I1 e I2 de `03-manual-administrador.md` §13.
- [ ] Llenar el maestro con costo de referencia y precio aprobados. Columnas de conteo vacías.
- [ ] Validar el importable (`06`). Sin errores.
- [ ] Imprimir una hoja por familia con: código, nombre, unidad, espacio para cantidad y reconteo.
- [ ] Confirmar el corte: hora y qué pasa con las ventas durante el conteo.
- [ ] Confirmar quién cuenta qué (§2).

**Punto de control:** maestro validado y hojas impresas. Si no, no se empieza.

### Día 0 · Jornada de conteo

- **Bloque 1 · Apertura (15 min):** explicar el corte, los roles, la regla de no sumar conteos y el reconteo ciego. Anotar la hora de inicio de cada familia.
- **Bloque 2 · Conteo por familias:** cada persona cuenta sus familias en el levantamiento, con la hoja impresa al lado.
- **Bloque 3 · Reconteo ciego:** la segunda persona recuenta la muestra (§5). Si no hay segunda persona, reconteo en papel (§5).
- **Bloque 4 · Productos nuevos y no encontrados:** cada uno se anota en una lista aparte con su foto o descripción. Sin costo ni precio no se crea.
- **Bloque 5 · Cierre del conteo:** finalizar el levantamiento. Entregar la lista de discrepancias y productos nuevos al ADMIN.

**Punto de control:** todas las familias contadas, reconteo hecho, lista de discrepancias y lista de productos nuevos entregadas. **No se aplica nada este día.**

### Día +1 · Conciliación (ADMIN)

- [ ] Vista previa completa.
- [ ] Resolver errores bloqueantes y conflictos (§6).
- [ ] Decidir productos nuevos con el dueño (costo y precio).
- [ ] Verificar que las ventas posteriores al corte estén consideradas.
- [ ] Nueva vista previa y **aplicar**.
- [ ] Verificar cinco fichas y guardar la evidencia (§6.3).

**Punto de control final:** el dueño confirma por escrito que la existencia aplicada es la que acepta. Solo después se opera la tienda con ese inventario.

### Condiciones de parada

- Diferencias de un producto de mayor valor sin explicación: no aplicar hasta resolverla.
- Un error que se repite en varias filas: se revisa el procedimiento, no fila por fila.
- Más de una persona cambió el mismo producto: se concilia antes de seguir.
- El dueño no aprueba el resultado.

**Umbral de diferencia que exige revisión del dueño:** decisión pendiente I7 en `03-manual-administrador.md` §13.
