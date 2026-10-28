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
- **Concesión del permiso (política aprobada, 2026-10-28).** Solo SUPERADMIN de plataforma gestiona cuentas ADMIN y sus permisos. La interfaz de Usuarios aún no ofrece el interruptor; la API exclusiva sí admite el permiso.

## Interfaz (2026-10-28, rama `claude/stoic-gates-sxbg8u`)

Utilidad común: `frontend/src/utils/excepcionPrecio.ts` (`puedeExcepcionPrecio`, `motivoExcepcionValido`, `esRechazoPorPrecio`). La interfaz solo ofrece la excepción a quien tiene rol ADMIN **y** `pos.excepcion_precio` en `user.permisos`; ser ADMIN no basta (a diferencia del resto de permisos, que el ADMIN tiene por rol). El servidor vuelve a decidir siempre.

- **POS (`POSPage.tsx`).** Un cobro nuevo nunca envía un precio distinto: se valida antes (sincronización de #202). La diferencia aparece en una **venta pendiente** (respuesta perdida o carrera) que el servidor rechaza con 409. Tras «Revisar venta y continuar», si el carrito pendiente difiere del catálogo:
  - ADMIN con el permiso: botón «Mantener el precio de esta venta (excepción)» → diálogo con las líneas (precio en la venta y vigente), motivo con contador y mínimo 10 / máximo 300 tras recortar. El motivo se guarda **en el pendiente** (`PendingSale.excepcionPrecio`, `posRecovery.ts`) y viaja en cada reintento de la misma `solicitudId`: el servidor rechaza un reintento que cambie u omita el motivo auditado.
  - Resto: aviso de que solo un administrador con el permiso puede mantener el precio; la salida es «Corregir datos de esta venta» (precio vigente).
  - 400 o 403 de la excepción: se muestra el mensaje del servidor, no se registra nada y el motivo se quita del pendiente para que un reintento no repita el rechazo. «Corregir» también descarta el motivo.
- **Cotizaciones (`CotizacionesPage.tsx`).** En el diálogo de conversión se listan las líneas cuyo precio cotizado difiere del catálogo cargado, o se muestra la sección tras un 409 de precio (reconocido por su mensaje: el servidor también responde 409 por caja cerrada). ADMIN con el permiso: motivo obligatorio (el botón se habilita con 10–300 caracteres) y se envía `excepcionPrecio: { motivo }`. Resto: aviso; el servidor decide y su 409 se muestra. 400/403 se muestran y la cotización sigue sin convertir.
- **Fuera de alcance:** el ISV distinto de 15 % y las líneas exentas no cambian (asunto fiscal, pendiente del propietario). Ningún flujo de supervisor ni de autorización a distancia: la excepción la usa quien hace la operación con su propia sesión.

## Quién concede el permiso (política aprobada, 2026-10-28)

- Solo el SUPERADMIN de plataforma puede crear, editar, desactivar, promover a ADMIN o modificar sus permisos. Un ADMIN de tenant gestiona cuentas no ADMIN y no modifica su propia cuenta mediante gestión de usuarios; el perfil privado de Mi cuenta conserva su flujo independiente.
- La ruta exclusiva `POST/PATCH/DELETE /admin/tenants/:id/usuarios[/:userId]` usa el mismo servicio y exige un SUPERADMIN activo. Se conserva la protección existente del último ADMIN activo.
- Nadie puede concederse `pos.excepcion_precio`. El backend valida contra los 17 permisos existentes en `usuarios/permisos.ts`, incluidos Contabilidad y el histórico `pos.anular_venta` (conservarlo no habilita operaciones nuevas).
- Cada cambio de pertenencia a la lista de permisos genera, en la misma transacción, `USUARIO_PERMISO_CONCEDER` o `USUARIO_PERMISO_REVOCAR`, con actor, beneficiario, permiso y acción. Se conservan los eventos generales de usuario.
- Todo cambio real de rol elimina `pos.excepcion_precio`, aunque el cuerpo lo reenvíe, y audita la revocación. Editar sin cambiar el rol conserva el permiso.
- Sin cambios de cálculos, ISV, precios, motivos, autorización de la venta o reintentos de #211; sin esquema ni migraciones.

## Pruebas

- Unitarias de la política: `backend/src/ventas/politica-precio.spec.ts` (7 casos: sin cambio, comparación en centavos, 409, 400, 403 por rol, 403 sin permiso, excepción con líneas que cambian).
- Unitarias de POS y cotizaciones: 44/44 (incluye `ventas.contingencia-caracterizacion`).
- Integración PostgreSQL de conversión (`cotizaciones.postgres.integration.ts`): 409 sin excepción, 403 de ADMIN sin permiso, 400 con motivo corto, 201 con permiso y motivo, auditoría por línea y cotización marcada como convertida.
- Suite completa del backend: 609/609 unitarias, lint y `tsc` sin errores.
- Interfaz (2026-10-28): `frontend/test/excepcion-precio.test.mjs` (constantes y mensaje 409 alineados con `politica-precio.ts`, permiso explícito, motivo 10–300, 409 de precio frente a otros 409); `frontend/test/cotizaciones-conversion.test.mjs` (409 de precio, otro 409, envío del motivo recortado, motivo corto no enviado, 403 y 400); navegador simulado `frontend/e2e/pos-excepcion-precio-simulado.spec.ts` (7: éxito con motivo, reintento tras corte con el mismo motivo y recarga, ADMIN sin permiso, CAJERO con el permiso en su lista, 403, 400, corrección que descarta el motivo; con control negativo: sin enviar `excepcionPrecio` fallan 4) y `frontend/e2e/cotizaciones-excepcion-precio-simulado.spec.ts` (4: éxito con motivo, ADMIN sin permiso con 409, 409 con catálogo cargado desactualizado y reintento, 403).

## Coordinación

- #202 (Sonnet/claude): la política sustituye la comprobación de la conversión por la función común. El POS mantiene su comportamiento y sus fingerprints de reintento.
- #204 (Codex, auditoría de #202, «auditar reintentos de precio»): debe usar la misma función y no reimplementar la regla; sus pruebas de reintento deben seguir pasando sobre esta base.
