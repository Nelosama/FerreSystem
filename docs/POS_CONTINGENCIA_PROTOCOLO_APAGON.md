# Protocolo de prueba de apagón físico — POS de contingencia

**Estado: procedimiento preparado. NO ejecutado.** Este documento no declara que ninguna de estas pruebas se haya realizado. Cada resultado debe anotarse en la sección 7 con fecha, persona, equipo y evidencia.

Objetivo: comprobar, en el equipo real de la caja y con su energía e internet reales, que una venta confirmada al cajero sobrevive a un corte eléctrico, que una venta no confirmada no aparece como cobrada, y que el diario se recupera y concilia sin duplicados.

Alcance: venta de contingencia **en efectivo** únicamente. No cubre tarjetas, transferencias ni crédito, que están bloqueados sin conexión.

---

## 1. Precondiciones (todas obligatorias)

| # | Condición | Cómo se verifica |
|---|---|---|
| P1 | Base de pruebas **separada de producción**. Nunca ejecutar este protocolo contra la base de la ferretería real. | Entorno de staging con datos ficticios, o empresa de prueba. |
| P2 | `POS_OFFLINE_ENABLED=true` solo en el entorno de prueba. Contingencia activada solo para la empresa de prueba. | Panel de administración → Activación. |
| P3 | Aprobación fiscal de la leyenda y procedimiento (decisión D1 del diseño) **o** documento explícito del propietario que autoriza solo la prueba técnica sin venta real. | Documento firmado; sin él, la prueba se hace solo con dinero de prueba. |
| P4 | Equipo de la caja con navegador instalado como PWA, Chrome o Edge en su versión actual. Anotar versión. | Captura de `chrome://version`. |
| P5 | UPS en el equipo de caja y en el router. Anotar marca, modelo y autonomía declarada. | Fotografía de la placa. |
| P6 | Un cajero de prueba, con caja abierta, y un administrador en otro equipo o en iPhone. | Lista de usuarios de prueba. |
| P7 | Catálogo de prueba con 5 productos reales con códigos impresos, stock suficiente y precio de prueba. | Hoja de conteo firmada antes de la prueba. |
| P8 | Anotar la hora del reloj del equipo y la hora del servidor antes de empezar. | Captura o foto del reloj. |
| P9 | Exportación del diario disponible en la pantalla de contingencia (botón «Exportar diario»). | Probar una exportación antes del corte. |

## 2. Equipo y materiales

- Cronómetro y planilla impresa con columnas: nº de prueba, hora de cobro, correlativo CT mostrado, total, hora de corte, hora de regreso, estado tras reinicio, estado final, observaciones.
- Interruptor o regleta con corte controlado (no desconectar a la fuerza el cable del servidor de la base).
- Comprobante impreso de cada venta (botón «Imprimir comprobante»).

## 3. Escenarios

Ejecutar en el orden indicado. Cada escenario se repite **5 veces** salvo que se indique otra cosa.

### E1 — Corte durante la confirmación

1. Con internet activo, preparar la ventana de contingencia (abrir el POS sin conexión y confirmar que el catálogo aparece).
2. Desconectar el router. Confirmar «● Sin conexión».
3. Cobrar una venta de 2 productos en efectivo.
4. **Inmediatamente** después de pulsar «COBRAR», cortar la energía del equipo de caja (corte controlado).
5. Restablecer la energía. Abrir el navegador y la página `/pos-contingencia`.

**Resultado esperado:**
- Si el comprobante «Venta guardada en este equipo» **se mostró** antes del corte: la venta aparece en «Ventas guardadas en este equipo» con su CT. Es correcta.
- Si **no** se mostró: la venta **no** aparece en el diario y el cajero **no** entregó mercancía. Verificar que el cobro no quedó duplicado al volver a intentarlo.
- En ningún caso aparece una venta sin comprobante visible al cajero, ni una venta con dos correlativos.

### E2 — Corte con venta pendiente y sin red al volver

1. Repetir E1 con varias ventas (3 o más) registradas antes del corte.
2. Mantener la red desconectada al volver la energía.
3. Verificar que el contador «Ventas pendientes» muestra el número esperado.
4. Exportar el diario y comparar con la planilla.

**Resultado esperado:** todas las ventas confirmadas siguen presentes; el contador coincide con la planilla.

### E3 — Reinicio de Windows con pendientes

1. Con 2 ventas pendientes, reiniciar Windows desde el menú (no apagado forzado).
2. Iniciar sesión, abrir el navegador y la página de contingencia.
3. Esperar el envío automático al recuperar internet, o pulsar «Enviar pendientes ahora».

**Resultado esperado:** ambas ventas pasan a «Sincronizada» con número central `V-…`. El administrador ve dos ventas nuevas con origen CONTINGENCIA.

### E4 — Apagón durante el envío

1. Con 3 ventas pendientes y red activa, cortar la energía del equipo **durante** el envío (mientras aparece «Enviando…»).
2. Restablecer la energía y la red.

**Resultado esperado:** ninguna venta queda en «Enviando…» de forma permanente; ninguna se duplica en el servidor (verificar en el panel: un solo registro por CT). Las que no llegaron vuelven a pendiente.

### E5 — Corte de internet mientras el servidor confirma (respuesta perdida)

1. Con una venta pendiente, provocar la pérdida de la respuesta: desconectar el router justo después de pulsar «Enviar».
2. Restablecer la red.

**Resultado esperado:** la venta se envía de nuevo con el mismo identificador; el panel muestra una sola venta central para ese CT.

### E6 — Cambio de precio y de stock durante el corte

1. Con la caja sin conexión, el administrador cambia el precio de un producto y reduce su stock a cero en el sistema central.
2. La caja vende ese producto (dentro del cupo local).
3. Restablecer la red.

**Resultado esperado:**
- Precio: la venta conserva el precio autorizado en la ventana; no genera conflicto de precio.
- Stock: la venta queda en revisión con «Stock insuficiente en la nube»; el administrador la acepta con nota y queda auditada.

### E7 — Caja cerrada durante el corte

1. Con la caja sin conexión, cerrar la caja del cajero desde el sistema central (o con el equipo sin red, según el procedimiento del negocio).
2. Vender un producto.
3. Restablecer la red.

**Resultado esperado:** la venta queda en revisión con «La caja ya cerró». El cierre histórico no cambia. El administrador asigna el efectivo a una caja abierta.

### E8 — Sesión vencida

1. Con una venta pendiente, dejar la sesión expirada (cerrar sesión en el servidor o borrar cookies).
2. Restablecer la red.

**Resultado esperado:** la venta sigue en el diario. La pantalla pide iniciar sesión. Al iniciar sesión, la venta se envía.

### E9 — Almacenamiento lleno (opcional, con cuidado)

Solo en un equipo de prueba. Llenar la cuota del navegador hasta que el cobro falle.

**Resultado esperado:** el cobro muestra «La venta NO se guardó…» y no entrega comprobante. Ninguna venta queda a medias.

---

## 4. Criterios de aceptación

- **Cero** ventas confirmadas al cajero que falten en el diario tras cualquier escenario.
- **Cero** ventas duplicadas en el servidor (un registro central por CT).
- **Cero** cobros sin comprobante visible.
- Todas las ventas tienen estado final conocido: SINCRONIZADA o REVISION con motivo. Ninguna en PENDIENTE o ENVIANDO después de 10 minutos de red estable.
- El contador de pendientes coincide con la planilla en todos los escenarios.
- Las cifras de caja del día coinciden con la suma de ventas registradas.

Si cualquier criterio falla, la prueba **no se acepta**: documentar la causa y repetir tras corregirla.

## 5. Qué NO demuestra esta prueba

- Que el navegador conserve datos en todo apagón eléctrico. Chrome puede confirmar transacciones antes de volcarlas a disco; la durabilidad estricta solo se pide, no se garantiza. Esta prueba es precisamente la evidencia que falta.
- Comportamiento de otros navegadores o de iPhone para la caja (la caja es Windows; el iPhone solo consulta el panel).
- Validez fiscal de los comprobantes internos.
- Recuperación ante daño físico del disco.

## 6. Registro de resultados (plantilla)

| Fecha | Persona | Equipo y navegador | Escenario | Repetición | Resultado (cumple/no cumple) | Diario antes / después | Evidencia (archivo o foto) | Observaciones |
|---|---|---|---|---|---|---|---|---|
| | | | | | | | | |

## 7. Estado de ejecución

| Escenario | Ejecutado | Resultado |
|---|---|---|
| E1–E9 | **No** | Pendiente. Requiere equipo de caja, UPS y corte controlado. |

Hasta que la sección 7 tenga resultados firmados, el POS de contingencia **no** debe usarse con clientes reales.
