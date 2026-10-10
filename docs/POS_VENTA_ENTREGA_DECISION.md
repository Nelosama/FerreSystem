# Venta en línea y entrega física — auditoría y decisión pendiente

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
