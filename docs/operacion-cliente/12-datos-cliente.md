# 12 · Datos que necesitamos del cliente antes de instalar

Pedir estos datos antes de la visita de instalación. Lo que el cliente no sepa se deja en blanco y se decide con el dueño. **No inventar datos.** Las decisiones de negocio están en `00` §3 y la lista de equipos en `09`.

Marque cada grupo cuando esté completo.

---

## 1. Inventario

- [ ] Lista base de artículos entregada por el cliente (factura, lista de proveedor o conteo del estante), no reconstruida por nosotros.
- [ ] Cantidad aproximada de artículos y cuántos se venden de verdad.
- [ ] Por artículo, para la plantilla `inventario_importable_ferresystem.csv`:
  - `nombre`, `codigo` (existente del cliente o el formato que decida el dueño, decisión I2), `categoria` (una de las 7 de `11` §3), `stockActual` (0 si habrá conteo en levantamiento), `stockMinimo`, `unidadMedida` (una de las 12 de `11` §2).
- [ ] Códigos de barras existentes (sí/no) y si las etiquetas ya están impresas.
- [ ] Fecha y hora de corte del conteo y regla para ventas durante el conteo (decisión I8).
- [ ] Costo de referencia y precio de venta por artículo, **aprobados por el dueño**. Sin precio aprobado no se vende (`08` §0.3).
- [ ] Si existe un sistema o archivo anterior de donde se tomarán datos, y quién lo entrega.

## 2. Usuarios

- [ ] Por persona: nombre completo, correo, rol (**ADMIN**, **CAJERO**, **BODEGUERO** o **VENDEDOR**) y si es titular de caja.
- [ ] Cuántas cajas se abren y quién las usa (una caja por usuario).
- [ ] Quién registra entradas y salidas de efectivo (permiso `caja.movimientos_manuales`).
- [ ] Quién registra la entrega de mercancía (bodega o administración; el cajero no entrega, `08` §7).
- [ ] Quién solicita y quién autoriza devoluciones (solo ADMIN decide, `03` §13).
- [ ] Confirmar que el primer administrador lo crea el superadministrador, no el cliente.

## 3. Sucursal

- [ ] Confirmar que es **una sola tienda**. El sistema no tiene modelo de sucursal: el stock es por empresa, y multi-sede no se soporta en este piloto (`00` §8).
- [ ] Nombre comercial, dirección y teléfono que deben aparecer en comprobantes.
- [ ] Horario de apertura del primer día.
- [ ] Si el cliente opera otra sede en paralelo, se queda fuera del piloto y se decide por separado.

## 4. Métodos de pago

- [ ] Métodos que se aceptan: **efectivo**, **tarjeta**, **transferencia**, **crédito** (confirmar cada uno).
- [ ] Tarjeta: banco del datáfono y procedimiento de confirmación. El sistema **no consulta al banco**: el cajero anota la referencia (`08` §6).
- [ ] Transferencia: cuenta bancaria y procedimiento de verificación antes de entregar la mercancía.
- [ ] Crédito: lista de clientes, límite por cliente y quién lo aprueba. Solo se vende a crédito a clientes registrados con crédito habilitado.
- [ ] Fondo inicial de efectivo por caja y cómo se calcula el vuelto (el sistema no lo calcula).
- [ ] Procedimiento fiscal de comprobantes, confirmado por escrito por el contador. La venta de FerreSystem no es comprobante fiscal hasta que el procedimiento lo confirme (`05` §E).

## 5. Responsables

- [ ] **Administrador principal:** nombre, correo y teléfono.
- [ ] **Responsable de soporte** y medio de contacto el primer día (`05` §F).
- [ ] **Responsable de bodega:** quién prepara y entrega mercancía.
- [ ] **Responsable de precios:** quién aprueba los precios de venta (decisión D-A, `00` §3).
- [ ] **Responsable del respaldo:** quién confirma que existe una copia reciente y quién la restaura si hace falta.
- [ ] **Responsable de decisiones de negocio:** dueño que confirma las decisiones de `00` §3.
- [ ] **Contador o responsable fiscal**, si existe.

---

## Cuando todo esté marcado

Pasar a `09-equipos-y-accesos.md` para preparar los equipos, y a `05-lista-verificacion-primer-dia.md` para la instalación.
