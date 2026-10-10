# Venta en línea y entrega física — auditoría y decisión pendiente

_Informes de ATLAS (POS y continuidad operativa)._

**Estado: NO IMPLEMENTADO. Requiere autorización del dueño antes de cambiar el comportamiento del cajero o del bodeguero.**

Este documento describe el flujo actual verificado en código y pruebas, los riesgos y las alternativas. No cambia el flujo.

## 1. Flujo actual (verificado)

| Paso | Quién | Qué ocurre | Dónde |
|---|---|---|---|
| 1. Selecciona productos | Cajero | Carrito en el POS | `POSPage.tsx` |
| 2. Cobra | Cajero | `POST /ventas` crea la venta **COMPLETADA** y **reserva** el stock: `stockReservado += cantidad`; `reserva_pendiente = true` | `backend/src/ventas/ventas.service.ts` (líneas ~213–236, ~275) |
| 3. Venta registrada | Sistema | Comprobante de venta. El stock físico **no** baja | — |
| 4. Cliente recibe la mercancía | Cajero o bodeguero | Debe confirmar la entrega: **Operaciones → Entregas → «Confirmar entrega»** | `frontend/src/pages/OperacionesPage.tsx` (modo `entregas`); `POST /operaciones/ventas/:id/entregar` |
| 5. Inventario descontado | Sistema, al confirmar | `stockActual -= cantidad`; `stockReservado -= cantidad`; movimiento `ENTREGA` | `operaciones.service.ts` `entregar` (líneas ~245–262) |

La confirmación de entrega **no está en el POS**. Hay que cambiar de pantalla y confirmar cada venta.

## 2. Garantías verificadas

- **No hay doble descuento.** `entregar` bloquea la venta (`FOR UPDATE`) y el tenant (`lockTenant`). Si `entregado_at` ya existe, devuelve la venta sin tocar stock. Pruebas: entrega repetida y entregas simultáneas (3 a la vez) → 1 movimiento `ENTREGA`, stock descontado una vez.
- **La devolución no libera stock físico de una reserva no entregada.** Con `destino = NO_ENTREGADO`, `devolver` solo libera `stockReservado`. Prueba: stock físico intacto y 0 movimientos `ENTREGA`.
- **Una venta devuelta por completo no se puede marcar como entregada.** Antes de esta validación, `entregar` la aceptaba y registraba una entrega falsa sin movimiento de stock. Corregido: `ConflictException` «fue devuelta; no hay entrega pendiente». Prueba: `piloto-flujo-completo` (entrega después de devolver).
- **La lista de entregas pendientes no oculta ventas.** `GET /operaciones/entregas` devuelve todas las ventas completadas sin `entregado_at` con mercancía pendiente. Prueba: la venta cobrada aparece como pendiente.

## 3. Riesgos abiertos

| # | Riesgo | Efecto | Severidad |
|---|---|---|---|
| R1 | Dos pasos para una sola venta. Si el cajero no confirma la entrega, el stock queda reservado. | Inventario real sin reflejar la venta. | Alta |
| R2 | **La reserva bloquea ventas posteriores.** `stockDisponible = stockActual − stockReservado`. Una reserva olvidada impide vender mercancía que sí está en la estantería. | Un cliente recibe «Stock insuficiente» aunque el producto exista. | **Alta** |
| R3 | No hay caducidad ni alerta por antigüedad. La reserva no expira. | Reservas olvidadas indefinidamente. | Alta |
| R4 | La venta offline descuenta **al sincronizar** (`ENTREGA` inmediata en la ventana); la venta en línea reserva y descuenta al confirmar. Dos reglas para el mismo mostrador. | Confusión operativa y reportes que difieren entre ambas ventas. | Media |
| R5 | Confirmar entrega exige rol CAJERO, BODEGUERO o ADMIN. No se registra quién recibió la mercancía. | Sin trazabilidad de la persona que recibió. | Baja |

## 4. Alternativas (requieren decisión)

| Opción | Descripción | Cambia el comportamiento de | Efecto en R1–R4 | Recomendación |
|---|---|---|---|---|
| **A. Mantener y alertar** | Sin cambio de flujo. Añadir en Operaciones un contador de entregas pendientes con antigüedad (p. ej. > 2 h) y un aviso al cajero al iniciar turno. | Nada en el flujo; solo visibilidad. | Reduce R3; no resuelve R1 ni R2 por sí solo. | Mínimo aceptable para pedidos y apartados. |
| **B. Entrega al cobrar en mostrador** | Venta de mostrador (cliente se lleva la mercancía): la entrega se registra al cobrar, sin reserva. Pedidos a entregar más tarde conservan la reserva. | **Cajero**: el cobro ya es la entrega. | Elimina R1 y R2 para mostrador. | **Recomendada para mostrador.** Requiere autorización. |
| **C. Botón «Entregar ahora» en el POS** | Opción por venta al cobrar: marcar «ya se llevó» y entregar en la misma transacción. Sin la opción, la venta queda reservada. | **Cajero**: un clic adicional. | Elimina R1 para la mayoría de ventas. | Alternativa si el dueño quiere distinguir mostrador y pedido. Requiere autorización. |
| **D. Caducidad de reservas** | Liberar automáticamente reservas no entregadas tras N horas, con aviso. | Reglas de inventario. | Mitiga R2 y R3; riesgo de liberar mercancía que sí va a entregarse. | Solo con política de negocio definida. Requiere autorización. |

**Propuesta para decidir:** B para mostrador (la venta de contingencia ya funciona así), A para pedidos y apartados, y D solo si el dueño define el plazo. Confirmar también si la venta en línea de efectivo debe seguir reservando por defecto.

## 4b. Recomendación de ATLAS (POS y continuidad operativa)

Informe de **ATLAS**. Es una recomendación; no hay cambio de flujo hasta decisión explícita del dueño.

### Qué exige el negocio y qué garantiza hoy el sistema

| Necesidad | Hoy (A/actual) | Observación |
|---|---|---|
| Cobrar antes de entregar | Cumple: la venta se crea al cobrar (`POST /ventas`). | La entrega es un evento posterior separado. |
| Evitar pérdidas y entregas no autorizadas | **No cumple del todo.** Cualquier CAJERO, BODEGUERO o ADMIN del tenant puede confirmar la entrega de cualquier venta (`/operaciones/ventas/:id/entregar`). No se registra quién recibió. | Riesgo de entregar a alguien sin cobro verificado o de confirmar una venta ajena. |
| Reducir pasos del cajero | **No cumple.** Vender en línea exige dos pantallas: POS y Operaciones → Entregas. | Offline ya entrega en el mostrador en un solo paso. |
| Controlar reservas | **No cumple.** La reserva bloquea ventas posteriores (`stockDisponible = stockActual − stockReservado`) y no caduca. | Afecta a clientes que sí tienen la mercancía en estantería. |
| Auditoría por empleado | **Parcial.** `ventas.usuario_id` (cobro) y `entregado_por` (confirmación) existen. No hay receptor. | Basta añadir el receptor, con autorización por migración. |
| Operar sin internet | **Parcial.** La venta en línea no funciona sin internet; la contingencia sí, y entrega al cobrar. | Dos reglas de entrega para el mismo mostrador. |

### Recomendación

**Adoptar B como regla de mostrador, conservando la reserva solo para pedidos explícitos.** Es decir: en venta de mostrador la entrega ocurre al cobrar; la reserva queda para pedidos que el cliente recoge después. El mecanismo de pedido es el de C, pero con **reserva como excepción marcada**, no como flujo por defecto.

Controles que acompañan la recomendación:

1. **Entrega al cobrar en mostrador.** Descuenta stock en la misma transacción del cobro (movimiento `ENTREGA`, como hoy en contingencia). Sin reserva.
2. **Pedidos con reserva.** Marcados al cobrar. Solo el cajero que cobró o un ADMIN confirma su entrega. Caducidad configurable (D) con aviso previo (A). Liberar la reserva requiere registro.
3. **Entrega solo por quien cobró o ADMIN.** Cierra el riesgo de entregas no autorizadas. Coincide con la regla que ya aplica el sincronizador offline (`puedeEnviar`).
4. **Receptor de la mercancía.** Campo obligatorio para pedidos, opcional para mostrador. Requiere migración aditiva: **pendiente de autorización** y de revisión por FARO.
5. **Reporte diario por cajero.** Ventas cobradas contra entregas registradas. Permite a BALANCE y al dueño detectar diferencias.

### Ventajas y riesgos por alternativa

| Opción | Ventajas | Riesgos | Cumple (de 6 necesidades) |
|---|---|---|---|
| **A. Mantener y alertar** | Sin cambio de flujo. Bajo costo. | Dos pasos siguen. R1 y R2 persisten. No cierra entregas no autorizadas. | 2 de 6 |
| **B. Entrega al cobrar (mostrador)** | Un paso. Misma regla que offline. Elimina R1 y R2 en mostrador. Trazabilidad: cajero que cobra = que entrega. | El cajero puede marcar "entregado" sin entregar: mitigar con reporte diario (control 5). Requiere decidir qué hacer con ventas pendientes actuales. Cambia el momento del descuento de stock: KARDEX debe confirmarlo. | 5 de 6 (falta receptor) |
| **C. Botón «Entregar ahora» en el POS** | Control explícito por venta. Pedidos y mostrador en un solo flujo. | Si el valor por defecto es "reservar", el cajero olvida marcarlo y repite R1. Un clic adicional. Si el defecto es "entregar", equivale a B con excepción. | 4 de 6 con defecto «entregar»; 2 con defecto «reservar» |
| **D. Caducidad de reservas** | Mitiga R2 y R3 sin tocar el mostrador. | Libera mercancía que el cliente sí va a recoger (conflicto y pérdida de venta). No resuelve entregas no autorizadas ni trazabilidad. Es una política, no un control. | 2 de 6 |

**Conclusión:** B con las excepciones de pedido (C con defecto «entregar» y reserva explícita) y los controles 1 a 5. A sola es insuficiente. D es complemento, no solución.

### Requisitos antes de implementar (por agente)

- **KARDEX:** confirmar que el movimiento `ENTREGA` en el cobro es coherente con existencias y reservas, y la fórmula de disponible. Revisar también los movimientos de ventas en línea ya reservadas que sigan abiertas.
- **CENTINELA:** definir quién puede confirmar entregas de pedidos (cajero que cobró o ADMIN) y revisar que la regla quede en backend, no solo en pantalla.
- **FARO:** matriz de pruebas: entrega en cobro, pedido con reserva, caducidad, entregas no autorizadas, reportes por cajero, y mutación de la regla de propietario.
- **BALANCE:** efecto en caja, ingresos y reportes cuando el stock baja al cobrar en lugar de al entregar.
- **ATLAS:** cambios en `POSPage.tsx` y en el flujo de Operaciones → Entregas; comportamiento offline ya coincide con B.

Estos agentes no han sido consultados en esta ronda. Son solicitudes pendientes, no decisiones tomadas.

### Decisiones que necesito del dueño

1. ¿Aprobar B como regla de mostrador?
2. ¿Qué hacer con las ventas en línea abiertas hoy (reservadas y sin entregar)? Opciones: entregarlas en bloque con el responsable, o cancelarlas con devolución `NO_ENTREGADO`. No lo haré sin instrucción.
3. ¿Quién puede confirmar la entrega de un pedido? Propuesta: cajero que cobró o ADMIN.
4. ¿Caducidad de reservas? ¿Cuántas horas?
5. ¿Autorizar la migración aditiva del receptor?

---

## 5. Lo que no se cambió en esta validación

- No se eliminó la reserva ni se cambió el comportamiento del cajero o del bodeguero.
- No se cambió `POSPage.tsx`.
- La única modificación en el backend es el rechazo de entregas sobre ventas totalmente devueltas (sección 2).

## 6. Autorización necesaria

| Decisión | Quién |
|---|---|
| ¿Mostrador entrega al cobrar (opción B)? | Dueño |
| ¿Se añade «Entregar ahora» en el POS (opción C)? | Dueño |
| ¿Plazo de caducidad de reservas y liberación (opción D)? | Dueño |
| ¿Alerta de entregas pendientes y su umbral (opción A)? | Dueño |
| ¿La entrega debe registrar quién recibe la mercancía (R5)? | Dueño |
