# Política única de excepciones de precio (POS y cotizaciones) — 2026-10-28

Rama: `claude/jowa-production-audit-integration-mvd8vl-precios`, derivada de #202 (`22d3764`). Propuesta de integración sobre #202; no modifica su rama ni la de #204.
Implementación: `backend/src/ventas/politica-precio.ts`. La usan la venta directa (`ventas.service.ts`) y la conversión de cotización (`cotizaciones.service.ts`).

## Regla

Un precio cobrado distinto del precio vigente del catálogo en el momento de la operación solo se acepta con una excepción explícita en la misma petición:

| Situación | Respuesta | Efectos |
|---|---|---|
| Precio igual al vigente (comparado en centavos) | 200/201 | Ninguno especial |
| Precio distinto, sin `excepcionPrecio` | **409** «El precio cambió; actualice el catálogo o solicite al administrador» | Ninguno (se valida antes de descontar stock) |
| `excepcionPrecio` presente sin motivo válido (10 a 300 caracteres) | **400** | Ninguno |
| Motivo válido, usuario sin rol ADMIN o sin el permiso `pos.excepcion_precio` asignado | **403** | Ninguno |
| Motivo válido, ADMIN con el permiso asignado | 201 | Venta creada y auditoría `VENTA_EXCEPCION_PRECIO` con motivo y, por línea, precio vigente y cobrado |

Principios:
1. **El rol nunca concede la excepción.** La concede solo el permiso asignado explícitamente (`pos.excepcion_precio`). Un ADMIN sin ese permiso recibe 403.
2. **Una sola regla para todas las rutas.** Venta directa y conversión de cotización usan la misma función. Antes, un ADMIN convertía una cotización con precio distinto sin permiso, sin motivo y sin auditoría.
3. **Sin efectos antes del rechazo.** La política se evalúa línea a línea antes de descontar stock, reservar o crear la venta. Con el 409 o el 403 la base queda intacta (verificado por la prueba unitaria `ventas.contingencia-caracterizacion`).
4. **Auditable.** Cada excepción aceptada deja un registro con el motivo, el usuario y las líneas afectadas.

## Lo que la política no cubre

- **ISV distinto del 15 % o líneas exentas al convertir una cotización.** Es un asunto fiscal, no de precio. Hoy solo ADMIN lo puede convertir y sin auditoría específica. Queda pendiente de decisión del propietario (P1): o se aplica el mismo mecanismo (permiso + motivo + auditoría) o se mantiene con una justificación escrita.
- **Interfaz de uso (resuelto el 2026-10-28, rama `claude/stoic-gates-sxbg8u`).** El POS y la conversión de cotizaciones capturan el motivo y envían `excepcionPrecio`; ver «Interfaz» abajo.
- **Concesión del permiso (bloqueado, decisión del propietario).** Un ADMIN nuevo no tiene el permiso (`permisosConfigurados: false`) y la pantalla de Usuarios **no** lo ofrece a propósito; ver «Quién concede el permiso» abajo.

## Interfaz (2026-10-28, rama `claude/stoic-gates-sxbg8u`)

Utilidad común: `frontend/src/utils/excepcionPrecio.ts` (`puedeExcepcionPrecio`, `motivoExcepcionValido`, `esRechazoPorPrecio`). La interfaz solo ofrece la excepción a quien tiene rol ADMIN **y** `pos.excepcion_precio` en `user.permisos`; ser ADMIN no basta (a diferencia del resto de permisos, que el ADMIN tiene por rol). El servidor vuelve a decidir siempre.

- **POS (`POSPage.tsx`).** Un cobro nuevo nunca envía un precio distinto: se valida antes (sincronización de #202). La diferencia aparece en una **venta pendiente** (respuesta perdida o carrera) que el servidor rechaza con 409. Tras «Revisar venta y continuar», si el carrito pendiente difiere del catálogo:
  - ADMIN con el permiso: botón «Mantener el precio de esta venta (excepción)» → diálogo con las líneas (precio en la venta y vigente), motivo con contador y mínimo 10 / máximo 300 tras recortar. El motivo se guarda **en el pendiente** (`PendingSale.excepcionPrecio`, `posRecovery.ts`) y viaja en cada reintento de la misma `solicitudId`: el servidor rechaza un reintento que cambie u omita el motivo auditado.
  - Resto: aviso de que solo un administrador con el permiso puede mantener el precio; la salida es «Corregir datos de esta venta» (precio vigente).
  - 400 o 403 de la excepción: se muestra el mensaje del servidor, no se registra nada y el motivo se quita del pendiente para que un reintento no repita el rechazo. «Corregir» también descarta el motivo.
- **Cotizaciones (`CotizacionesPage.tsx`).** En el diálogo de conversión se listan las líneas cuyo precio cotizado difiere del catálogo cargado, o se muestra la sección tras un 409 de precio (reconocido por su mensaje: el servidor también responde 409 por caja cerrada). ADMIN con el permiso: motivo obligatorio (el botón se habilita con 10–300 caracteres) y se envía `excepcionPrecio: { motivo }`. Resto: aviso; el servidor decide y su 409 se muestra. 400/403 se muestran y la cotización sigue sin convertir.
- **Fuera de alcance:** el ISV distinto de 15 % y las líneas exentas no cambian (asunto fiscal, pendiente del propietario). Ningún flujo de supervisor ni de autorización a distancia: la excepción la usa quien hace la operación con su propia sesión.

## Quién concede el permiso (bloqueo documentado, sin cambio)

No se añadió el permiso a la pantalla de Usuarios porque hoy no se puede conceder de forma segura:

1. `PUT /usuarios/:id` y `POST /usuarios` (`backend/src/usuarios/usuarios.service.ts`, `update`/`create`) aceptan cualquier lista de cadenas en `permisos` (`UpdateUsuarioDto`: `@IsString({each:true})`, sin lista cerrada) de cualquier ADMIN, **incluido sobre su propia cuenta**. `authorizedActor` deja pasar al ADMIN sin comprobar `usuarios.gestionar`.
2. Por tanto, un interruptor en Usuarios permitiría a cualquier ADMIN concedérselo a sí mismo con un clic, y el permiso explícito equivaldría al rol: se perdería la separación que la política pretende. El mismo riesgo existe ya por API (un ADMIN puede enviar el permiso en su propio `PUT`); no se corrigió porque cambia reglas de usuarios y requiere decisión.
3. La pantalla de Usuarios muestra los permisos del ADMIN como «por rol» y bloqueados; al cambiar el rol de una cuenta se restablecen los permisos por defecto (el permiso se pierde). Editar un ADMIN sin cambiar su rol conserva la lista, así que un permiso concedido fuera de la pantalla sobrevive a esas ediciones.

Decisión pendiente del propietario: quién lo concede (¿solo el Super Admin de la plataforma, un ADMIN distinto del beneficiario, el dueño de la empresa?), si se permite la autoconcesión y si la concesión se audita aparte. Hasta entonces el permiso solo puede asignarse por API o base de datos y la interfaz de uso queda inactiva para todos.

### Decisiones pendientes y recomendación (2026-10-28, sin implementar)

Ninguna de estas decisiones está tomada. El código no cambia quién puede conceder el permiso, ni la autoconcesión, ni su auditoría.

| # | Decisión | Estado actual en el código | Recomendación |
|---|---|---|---|
| D1 | ¿Quién concede `pos.excepcion_precio`? | Cualquier ADMIN con acceso a `PUT /usuarios/:id` (`usuarios.service.ts` `update`, `@Roles('ADMIN')`). | **Otro ADMIN activo distinto del beneficiario** (separación de funciones). El Super Admin de plataforma no interviene en la operación diaria del negocio; el dueño de la empresa, si no es ADMIN, no tiene cuenta con el permiso. |
| D2 | ¿Se permite la autoconcesión? | Sí, sin ninguna guarda: un ADMIN puede enviar el permiso sobre su propia cuenta. | **No.** El servidor debe rechazar cualquier cambio de `permisos` sobre el propio `sub` cuando agrega o quita `pos.excepcion_precio` (403). Sin esta guarda, el permiso equivale al rol. |
| D3 | ¿Cómo se audita la concesión? | Solo `USUARIO_EDITAR` con `anterior`/`nuevo` completos (`audit(...)` en `update`). `VENTA_EXCEPCION_PRECIO` registra quién **usó** la excepción, no quién la concedió. | Acción propia `USUARIO_PERMISO_EXCEPCION_CONCEDIDO` y `..._REVOCADO`, con `actorId`, beneficiario, motivo obligatorio (10–300) y fecha. Así una venta con excepción puede rastrearse hasta su concesión. |
| D4 | ¿Se cierra la lista de permisos? | No: `UpdateUsuarioDto.permisos` acepta cualquier cadena (`@IsString({each:true})`, máximo 30). | **Sí**, contra la lista de `Permiso` de `frontend/src/types/index.ts` en backend (lista blanca). Es una corrección de integridad, independiente de D1–D3, pero cambia el contrato de la API: confirmar antes. |
| D5 | ¿Se revoca al cambiar de rol o desactivar? | Cambiar el rol restablece permisos por defecto (se pierde). Desactivar revoca sesiones, no el permiso. | Mantener la pérdida al cambiar de rol. Desactivar no necesita tocar el permiso: la cuenta ya no entra. |
| D6 | ¿Dónde aparece el interruptor? | No aparece en Usuarios. | Solo tras D1–D3. Mostrarlo al ADMIN beneficiario o a su propia cuenta queda prohibido por D2. |

Orden propuesto: D2 y D3 (guarda y auditoría) antes que cualquier interfaz; D4 en la misma tanda porque la lista blanca protege la guarda de D2; D1 y D6 solo cuando el propietario decida.

Qué no cambia con esta recomendación: la regla de la venta y de la cotización, el 409/400/403 y la auditoría `VENTA_EXCEPCION_PRECIO` siguen igual.

## Pruebas

- Unitarias de la política: `backend/src/ventas/politica-precio.spec.ts` (7 casos: sin cambio, comparación en centavos, 409, 400, 403 por rol, 403 sin permiso, excepción con líneas que cambian).
- Unitarias de POS y cotizaciones: 44/44 (incluye `ventas.contingencia-caracterizacion`).
- Integración PostgreSQL de conversión (`cotizaciones.postgres.integration.ts`): 409 sin excepción, 403 de ADMIN sin permiso, 400 con motivo corto, 201 con permiso y motivo, auditoría por línea y cotización marcada como convertida.
- Suite completa del backend: 609/609 unitarias, lint y `tsc` sin errores.
- Interfaz (2026-10-28): `frontend/test/excepcion-precio.test.mjs` (constantes y mensaje 409 alineados con `politica-precio.ts`, permiso explícito, motivo 10–300, 409 de precio frente a otros 409); `frontend/test/cotizaciones-conversion.test.mjs` (409 de precio, otro 409, envío del motivo recortado, motivo corto no enviado, 403 y 400); navegador simulado `frontend/e2e/pos-excepcion-precio-simulado.spec.ts` (7: éxito con motivo, reintento tras corte con el mismo motivo y recarga, ADMIN sin permiso, CAJERO con el permiso en su lista, 403, 400, corrección que descarta el motivo; con control negativo: sin enviar `excepcionPrecio` fallan 4) y `frontend/e2e/cotizaciones-excepcion-precio-simulado.spec.ts` (4: éxito con motivo, ADMIN sin permiso con 409, 409 con catálogo cargado desactualizado y reintento, 403).

## Coordinación

- #202 (Sonnet/claude): la política sustituye la comprobación de la conversión por la función común. El POS mantiene su comportamiento y sus fingerprints de reintento.
- #204 (Codex, auditoría de #202, «auditar reintentos de precio»): debe usar la misma función y no reimplementar la regla; sus pruebas de reintento deben seguir pasando sobre esta base.
