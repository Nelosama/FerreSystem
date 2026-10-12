# 05 · Lista de verificación del primer día

Checklist para decidir si la tienda puede vender en el sistema el primer día. Los responsables son del cliente: **no se asignan aquí**. Cada ítem debe tener nombre y evidencia antes de marcarse.

**Criticidad**
- **Crítico:** sin esto no se opera. Si no se cumple, no se vende en el sistema.
- **Importante:** se puede operar con una alternativa temporal, pero debe quedar decidida y anotada.
- **Recomendado:** mejora la operación; no bloquea.

**Cómo usar:** marque `[x]` solo con evidencia (captura, resumen de importación, acta). Los datos de este documento son plantillas, no datos de la ferretería.

---

## A. Equipos y conexión

| ☐ | Ítem | Crit. | Responsable | Evidencia |
|---|---|---|---|---|
| ☐ | Computadora administrativa con navegador actualizado, acceso a la aplicación y pantalla legible | Crítico | | |
| ☐ | Computadora del cajero con navegador actualizado y acceso a la aplicación | Crítico | | |
| ☐ | Conexión a internet estable en cada equipo. **Sin conexión no se vende.** | Crítico | | |
| ☐ | Prueba de cobro en el equipo del cajero (venta de práctica en preproducción o en copia autorizada) | Crítico | | |
| ☐ | Lector de códigos probado: si emula teclado, el código entra en el campo de búsqueda y se agrega con Enter | Importante | | |
| ☐ | Cámara para leer códigos: solo con HTTPS. Probar en el equipo real; **iPhone no validado** | Recomendado | | |
| ☐ | Impresión del comprobante probada (vista imprimible del navegador; no hay ticket térmico) | Importante | | |

## B. Usuarios y permisos

| ☐ | Ítem | Crit. | Responsable | Evidencia |
|---|---|---|---|---|
| ☐ | Un usuario por persona, sin cuentas compartidas | Crítico | | |
| ☐ | Roles asignados: ADMIN, CAJERO, BODEGUERO, VENDEDOR según la función | Crítico | | |
| ☐ | Claves cambiadas: ninguna clave temporal ni de prueba sigue activa. Mínimo 8 caracteres con letras y números | Crítico | | |
| ☐ | No existen usuarios de demostración en la empresa real | Crítico | | |
| ☐ | Permiso `caja.movimientos_manuales` asignado solo a quien lo autorizó el dueño | Importante | | |
| ☐ | Cada cajero abre **su propia** caja | Crítico | | |

## C. Inventario inicial

| ☐ | Ítem | Crit. | Responsable | Evidencia |
|---|---|---|---|---|
| ☐ | Lista base de artículos entregada por el cliente (no inventada) | Crítico | | |
| ☐ | Plantilla llena con `inventario_registro_maestro.csv` y revisada (códigos únicos, precios no en 0, categorías, unidades de las 5 permitidas) | Crítico | | |
| ☐ | Importación de prueba hecha en preproducción o copia, con resumen revisado | Crítico | | |
| ☐ | Importación real **sin** «Sobrescribir», con resumen guardado (importados, omitidos, errores) | Crítico | | |
| ☐ | Precios de venta revisados: ninguno en 0 sin intención | Crítico | | |
| ☐ | Códigos de barras y marcas cargados desde el formulario donde corresponda | Importante | | |
| ☐ | Artículos con unidad no permitida en CSV (pie, libra, litro, paquete, otro, metro cuadrado, metro cúbico) cargados desde el formulario | Importante | | |
| ☐ | Decisión por artículo: canaleta, lámina, varilla y tornillo (metro, pieza o caja) | Crítico | | |
| ☐ | Conteo físico inicial con levantamiento; ADMIN revisa diferencias y aplica | Importante | | |

## D. Métodos de cobro y caja

| ☐ | Ítem | Crit. | Responsable | Evidencia |
|---|---|---|---|---|
| ☐ | Métodos aceptados confirmados por el dueño: **Efectivo, Tarjeta, Transferencia, Crédito** | Crítico | | |
| ☐ | Procedimiento de confirmación de tarjeta (datáfono) y de transferencia, porque el sistema no consulta al banco | Crítico | | |
| ☐ | Fondo inicial de efectivo acordado para cada caja | Crítico | | |
| ☐ | Cajeros sabrán calcular el vuelto a mano (no hay cálculo automático) | Crítico | | |
| ☐ | Clientes de crédito: lista, límite y estado acordados por el dueño. Crédito solo con cliente registrado | Importante | | |
| ☐ | Límites de descuento por usuario definidos por el dueño | Importante | | |
| ☐ | Procedimiento para cierre con diferencia (quién autoriza la explicación) | Importante | | |

## E. Procedimiento fiscal externo

| ☐ | Ítem | Crit. | Responsable | Evidencia |
|---|---|---|---|---|
| ☐ | Procedimiento fiscal definido **fuera** del sistema (comprobantes, numeración, obligaciones) | Crítico | | |
| ☐ | Contador o responsable fiscal confirma por escrito qué comprobante se entrega en cada venta | Crítico | | |
| ☐ | Las ventas de FerreSystem no se usan como comprobante fiscal hasta que el procedimiento lo confirme | Crítico | | |

## F. Soporte y continuidad

| ☐ | Ítem | Crit. | Responsable | Evidencia |
|---|---|---|---|---|
| ☐ | Responsable de soporte con nombre y medio de contacto | Crítico | | |
| ☐ | Canal para reportar incidentes el primer día (horario y forma) | Crítico | | |
| ☐ | **Respaldo:** confirmar quién responde del respaldo y que existe una copia reciente. El proceso de respaldo automático **no está verificado en producción** (ver nota) | Crítico | | |
| ☐ | **Recuperación:** procedimiento de restauración definido. **No está probado** en la empresa | Crítico | | |
| ☐ | Plan si cae la red o el servidor: el cajero **no** vende sin sistema; el dueño define si se anota la operación en papel para registrarla después | Crítico | | |
| ☐ | Si hay más de una tienda, el dueño decidió cómo operar. **Sucursales no implementadas** | Crítico si aplica | | |

> **Nota sobre respaldos.** El código de respaldos existe (copia cifrada, verificación y restauración aislada), pero **no se verificó que esté configurado ni que funcione en producción**. Antes del primer día, el responsable debe confirmar por escrito la fecha de la última copia verificada. Si no puede confirmarla, el primer día se considera **sin respaldo verificado**.

## G. Operación y capacitación

| ☐ | Ítem | Crit. | Responsable | Evidencia |
|---|---|---|---|---|
| ☐ | Capacitación de 60 minutos completada por ADMIN, bodega y cada cajero | Crítico | | Lista de asistencia |
| ☐ | Cada cajero hizo al menos una venta de práctica y un cierre de práctica | Crítico | | |
| ☐ | Manuales (`02-manual-cajero.md`, `03-manual-administrador.md`) entregados en papel o en el equipo | Importante | | |
| ☐ | El dueño aprobó el cambio de fechas en reportes de días pasados (ventas de 18:00 a 23:59 cambian de día) | Importante | | |
| ☐ | Dueño informado de las restricciones de `03-manual-administrador.md` §14 | Crítico | | |

---

## Criterio de decisión

**Go (se opera el primer día)**
- Todos los ítems **Críticos** marcados con evidencia.
- Los **Importantes** marcados o con alternativa decidida por escrito.

**No-Go (no se opera en el sistema el primer día)**
- Algún ítem Crítico sin evidencia.
- La importación real falló o no se revisó su resumen.
- No hay responsable de soporte.
- Respaldo sin confirmar.

**Qué queda sin validar aunque se marque todo**
- Cámara y lectura de códigos en iPhone real del cliente.
- Datáfono y cuentas bancarias reales.
- Procedimiento fiscal (depende de la asesoría del cliente).
- Restauración de respaldo en la empresa.
- Operación con más de una sucursal.
- Aceptación formal del cliente: es una decisión aparte de la operación y del merge.

## Después del primer día

- [ ] Cierre de caja de cada cajero revisado por el ADMIN.
- [ ] Ventas sin entregar revisadas y resueltas.
- [ ] Incidentes registrados con fecha, usuario y acción tomada.
- [ ] Diferencias de caja con explicación revisadas.
- [ ] Problemas nuevos anotados en `CONTEXTO_MAESTRO.md` como pendientes, con fecha.
