# 04 · Plan de capacitación (60 minutos)

Capacitación práctica para administrador, bodega y cajeros. Se hace en **preproducción o en una copia de práctica**, con datos ficticios. Nunca con datos reales de la ferretería.

## Antes de empezar

- [ ] Entorno de práctica disponible en el navegador de cada equipo. Si no existe, **no** se usan datos reales como sustituto.
- [ ] Usuarios de práctica creados: un ADMIN del instructor, un CAJERO y un BODEGUERO. Nombres ficticios, claves temporales.
- [ ] Archivo `plantillas/ejemplo_ficticio_capacitacion.csv` a mano (8 productos con prefijo `[EJEMPLO]`, códigos `EJ-*`).
- [ ] Un cliente ficticio con crédito habilitado para el ejercicio de crédito. El instructor lo crea; no se usa un cliente real.
- [ ] Hoja de papel para el cálculo de vuelto y el conteo de caja.
- [ ] Al final, el instructor **borra o desactiva** los productos `EJ-*` del entorno de práctica si se va a reutilizar.

## Agenda

| Min | Bloque | Participantes |
|---|---|---|
| 0–15 | Administrador y productos | ADMIN |
| 15–30 | Inventario | ADMIN, BODEGUERO |
| 30–50 | Ventas y cobros | CAJERO |
| 50–60 | Entrega y cierre | CAJERO, ADMIN |

Si el grupo es mixto, todos siguen toda la sesión. Un solo equipo puede alternar usuarios para el ejercicio.

---

## Bloque 1 · Administrador y productos (15 min)

**Objetivo:** el ADMIN crea usuarios, da de alta un producto sin duplicarlo y sabe qué puede hacer cada rol.

**Demostración (5 min)**
1. En `/usuarios`, crear el usuario de práctica CAJERO. Usar «Generar contraseña segura». Asignar rol CAJERO.
2. Iniciar sesión con ese usuario e intentar abrir `/inventario`. El sistema no lo permite (la ruta es solo para ADMIN y BODEGUERO).

**Ejercicio (10 min)** — con el ADMIN:
1. En `/inventario`, dar de alta: nombre `[EJEMPLO] Tubo PVC 1/2 pulgada 6 m`, código `EJ-PVC-12`, categoría `Plomería`, unidad `unidad`, costo `85.00`, precio de venta `120.00`, existencia `0`.
2. Intentar dar de alta **de nuevo** el mismo código `EJ-PVC-12`.

**Criterio de éxito**
- [ ] El producto aparece una sola vez en `/inventario`.
- [ ] El segundo intento queda rechazado; el participante explica por qué (código único por empresa).
- [ ] El participante sabe que el cajero no ve `/inventario`.

---

## Bloque 2 · Inventario (15 min)

**Objetivo:** importar con seguridad, detectar errores y ajustar existencias con motivo.

**Demostración (4 min)**
- Mostrar el botón «DESCARGAR PLANTILLA CSV» del importador: trae 3 filas de ejemplo (`COD-001` a `COD-003`). **Bórrelas antes de importar.**
- Mostrar el archivo `ejemplo_ficticio_capacitacion.csv` y explicar las columnas.

**Ejercicio A · Importación (6 min)** — con el ADMIN, en la base de práctica:
1. Importar `ejemplo_ficticio_capacitacion.csv **sin** confirmar «Sobrescribir».
2. Resultado esperado: **importados 8, actualizados 0, omitidos 0, errores 0.**
3. Importar el mismo archivo otra vez. Resultado esperado: **omitidos 8.** Explicar por qué (los códigos ya existen).

**Ejercicio B · Error controlado (3 min)**
- El instructor cambia en una copia la unidad de una fila a `libra` y vuelve a importar en una base de práctica sin esos códigos.
- Resultado esperado: esa fila aparece como error («Unidad no válida: "libra"»); las demás se importan.
- Lección: la unidad `libra` **no** se puede importar por CSV; hay que cargarla desde el formulario.

**Ejercicio C · Ajuste con motivo (2 min)**
- En `EJ-VAR-38` (existencia 120.5), cambiar la existencia a `118.00` con motivo `Conteo de práctica`.
- Verificar que la existencia baja y que queda el motivo y el usuario en la auditoría.

**Criterio de éxito**
- [ ] El participante reconoce el resumen de importación (importados, omitidos, errores).
- [ ] Sabe que vacíos en precios o existencias se guardan como 0 y debe revisarlos antes de importar.
- [ ] Sabe que un ajuste exige motivo.

---

## Bloque 3 · Ventas y cobros (20 min)

**Objetivo:** vender, calcular el vuelto a mano, cobrar con cada método y entender los bloqueos.

**Demostración (3 min)** — con el CAJERO:
- Escribir el código exacto `EJ-CAN-3M` y pulsar Enter: se agrega al carrito. Un código parcial no agrega; hay que escribirlo completo.
- Mostrar el campo «Cantidad» y el botón «Procesar Venta».

**Ejercicio A · Efectivo con vuelto (6 min)** — esta es la **Venta A**
- Venta: `EJ-CAN-3M` × 2 (L 150.00 c/u) + `EJ-TOR-3X1` × 1 (L 125.00). Total de productos: **L 425.00**.
- Cobrar en **Efectivo**, con L 500.00 recibidos.
- Vuelto a calcular a mano: **L 75.00**.
- Si la pantalla muestra otro total por impuestos, el participante recalcula con ese total. La regla no cambia: vuelto = recibido − total mostrado.

**Ejercicio B · Tarjeta (3 min)**
- Venta: `EJ-MAR-16` × 1 (L 165.00), cobrar en **Tarjeta**.
- Confirmar la aprobación con el comprobante de práctica, no con el sistema. Explicar que el sistema no consulta al banco.

**Ejercicio C · Crédito (4 min)**
- Intentar cobrar en **Crédito** sin cliente. Resultado: «Seleccione un cliente registrado para vender a crédito».
- Seleccionar el cliente ficticio y vender `EJ-PIN-GAL` × 1 (L 575.00). Resultado: se registra como crédito con su vencimiento.

**Ejercicio D · Bloqueos (4 min)**
- Iniciar sesión con el cajero de práctica **sin abrir caja** e intentar cobrar. Resultado: «Abra su caja antes de registrar ventas o pagos».
- Mencionar el límite de descuento: si el usuario lo tiene configurado, aplicar un descuento mayor. Resultado: «El descuento supera su límite. Un administrador debe registrar esta venta».

**Criterio de éxito**
- [ ] El participante calcula el vuelto sin ayuda del sistema y sin error.
- [ ] Sabe que el crédito requiere cliente.
- [ ] Sabe que sin caja abierta no se cobra.
- [ ] Sabe que tras el cobro no debe cobrar otra vez («No vuelva a cobrarla»).

---

## Bloque 4 · Entrega y cierre (10 min)

**Objetivo:** confirmar una entrega y cerrar caja con diferencia explicada.

**Entrega (4 min)**
- Antes de la entrega, `EJ-CAN-3M` debe mostrar **40 físicas** y **38 disponibles** (2 reservadas por la Venta A). Verifique qué muestra la pantalla de inventario: el sistema calcula ambas cifras, pero los rótulos exactos hay que confirmarlos en preproducción.
- En `/entregas`, pulsar **«Confirmar entrega»** de la Venta A.
- Resultado esperado: las físicas bajan a **38**. Disponibles y físicas quedan iguales.
- Explicar la diferencia entre reserva (apartado para una venta) y entrega (salida real del local).

**Cierre con diferencia (6 min)**
- Fondo inicial de práctica: **L 1,000.00**. Cobro en efectivo del turno: **L 425.00** (Venta A; las ventas B y C no son en efectivo).
- Efectivo esperado: **L 1,425.00**. Confirme que la pantalla muestre lo mismo. Si no coincide, anote la diferencia para revisarla con el instructor.
- Contar **L 1,415.00** → la pantalla muestra **Faltante L 10.00**.
- Escribir la explicación (ejemplo: «Vuelto de más en práctica»). Sin explicación, no deja cerrar.
- Confirmar «Cerrar caja». Imprimir el comprobante de cierre.
- Explicar que el cierre no se corrige después.

**Criterio de éxito**
- [ ] El participante distingue **reservado** de **físico**.
- [ ] Sabe que la diferencia exige explicación.
- [ ] Sabe que un cierre confirmado no se edita.

---

## Cierre de la sesión (lista de verificación del instructor)

- [ ] Cada participante completó al menos un ejercicio de su bloque.
- [ ] Se anotaron las dudas que no tienen respuesta en esta documentación. Pasarlas a `05-lista-verificacion-primer-dia.md`.
- [ ] Se registró la asistencia (evidencia).
- [ ] Se eliminaron o desactivaron los datos `EJ-*` del entorno de práctica si se va a reutilizar.

## Lo que la capacitación **no** cubre

- Cámara de códigos en iPhone real. Pendiente de validación.
- Datáfono real y cuentas bancarias.
- Procedimiento fiscal (factura, CAI, numeración). Se trata aparte.
- Operación con más de una sucursal (no implementada).
- Recuperación de respaldo (no verificada).
