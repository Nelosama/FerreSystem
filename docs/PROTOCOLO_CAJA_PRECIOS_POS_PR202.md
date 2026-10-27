# PR #202 — Auditoría y protocolo de prueba en caja real (sincronización automática de precios)

> **Actualización 2026-10-27:** D1 y D2 quedaron corregidos después de esta auditoría (ver `CONTEXTO_MAESTRO.md`); los casos 11 y 12 deben ahora dar OK en la caja real. El resto del documento describe el SHA `42f154f` auditado.

Revisión de `claude/pos-sincronizacion-precios` en el SHA `42f154f`, base `main` `2f6168d`. **Este documento no registra ninguna prueba física: describe cómo hacerla.** El PR sigue en borrador, sin merge ni despliegue.

## 1. Lo demostrado y lo que falta

| Comprobación | Dónde | Estado en `42f154f` |
|---|---|---|
| Unidad: la función de precios conserva cantidades, no reescribe un carrito sin cambios y detecta productos fuera del catálogo | `frontend/test/pos-precios-vigentes.test.mjs` | CI `validate` ✅ |
| Navegador simulado, catálogo de **un** producto: cambio de precio por el Admin y venta sin botón; cambio justo antes de cobrar; reintento y fallo de lectura; producto no disponible; red caída y reconexión | `frontend/e2e/pos-precios-automaticos-simulado.spec.ts` | CI `validate` ✅ |
| Recorridos POS con API compilada y PostgreSQL reales (no incluyen cambios de precio durante la venta) | `e2e-real/*` | CI `test` ✅ |
| El servidor rechaza un precio distinto del vigente para CAJERO y VENDEDOR (409) | `backend/src/ventas/ventas.service.ts:322`, `backend/test/ventas.postgres.integration.ts` | CI `validate` ✅ |
| Catálogo grande, red real de la tienda, equipo de caja real, dos personas (Admin y Cajero) | — | **Pendiente: prueba física** |
| Corrección de una venta pendiente después de un cambio de precio | — | **Defecto D1 (abajo): falla de forma reproducible** |
| Lectura del catálogo iniciada antes del cambio y reutilizada por el cobro | — | **Defecto D2 (abajo)** |

CI no cubre catálogos grandes ni redes reales, y sus casos usan un servidor simulado.

## 2. Defectos encontrados en la auditoría

Se reprodujeron con una prueba de navegador temporal sobre el build de `42f154f`, con un servidor simulado que replica la regla del backend para CAJERO (precio distinto del vigente → 409). Se repitieron 3 de 3 veces con el mismo resultado. Esa prueba no se versiona; sus pasos están abajo. **No se modificó ninguna prueba ni el código.**

### D1 — Una venta pendiente corregida nunca se envía si el precio cambió (bloqueante)

- **Archivo:** `frontend/src/pages/POSPage.tsx`, en `handleCobrar`, bloque `if (!ventaPendiente || corrigiendoPendiente)`. Usa `const carritoAEnviar = ventaPendiente?.cart || cart;`.
- **Causa:** con «Corregir datos de esta venta», las ediciones del carrito se guardan en `localStorage` mediante el efecto del borrador, pero el estado `ventaPendiente` conserva el carrito con el que se creó el pendiente. La validación compara precios contra ese carrito antiguo. Siempre detecta el cambio, llama a `setCart` con las líneas originales y termina sin enviar y sin mensaje. Además, cada clic reemplaza el carrito por las líneas originales del pendiente, con lo que se pierde cualquier corrección de cantidades o productos.
- **Flujo reproducido:**
  1. Cajero con Taladro a L 100 en el ticket. Cobra y la respuesta se corta antes de registrarse; aparece «Había una venta en proceso».
  2. El Admin cambia el precio a L 120.
  3. «Revisar venta y continuar» → «Ya revisé el pago: continuar registro» → el servidor responde «El precio cambió…» (409).
  4. «Revisar venta y continuar» → «Corregir datos de esta venta» → interacción → el ticket pasa a `1 x L 120.00` y el pendiente guardado también.
  5. «Ya revisé el pago: continuar registro», tres veces.
- **Evidencia (salida de la prueba temporal):**

  ```
  R1 carrito sincronizado a 120 en modo corrección
  R1 clic 1: intentos POST=2, registradas=0, lecturasCatalogo=5, alertas=""
  R1 clic 2: intentos POST=2, registradas=0, lecturasCatalogo=6, alertas=""
  R1 clic 3: intentos POST=2, registradas=0, lecturasCatalogo=7, alertas=""
  ```

  Cada clic lee el catálogo y no envía nada ni muestra ningún mensaje. La única salida es descartar la venta.
- **Alcance:** solo afecta ventas pendientes (respuesta perdida o rechazo 409). No cobra un precio sin validar, pero deja al cajero sin poder completar la venta. D2 lleva justamente a este flujo.
- **Corrección propuesta (no aplicada):** en modo corrección, validar el carrito que realmente se enviará (`readRecovery(...).pending.cart` o el `cart` actual, que el efecto ya guarda) y no `ventaPendiente.cart`. Añadir una regresión de navegador con estos cinco pasos.

### D2 — El cobro puede validar con una lectura que empezó antes del cambio de precio

- **Archivo:** `frontend/src/pages/POSPage.tsx`, función `leerCatalogo`: `if (lecturaCatalogo.current) return lecturaCatalogo.current;`.
- **Causa:** si hay una lectura en segundo plano en curso (disparada por una interacción o por el foco), el cobro reutiliza su resultado en lugar de pedir uno nuevo. Si el Admin cambió el precio mientras esa lectura viajaba, la validación recibe el precio anterior y lo envía.
- **Evidencia:** con la lectura retrasada 6 s y el precio cambiado durante la espera: `lecturas nuevas iniciadas por el cobro: 0; precio enviado=100; vigente=120; respuesta: 409`.
- **Consecuencia real:**
  - **CAJERO y VENDEDOR:** el backend rechaza con 409, no se registra el precio antiguo y la venta queda pendiente. Desde ahí, D1 impide completarla.
  - **ADMIN cobrando en el POS:** el backend **acepta** precios distintos del vigente (`ventas.service.ts:322`, excepción `user.rol !== 'ADMIN'`), así que la venta se registraría con el precio anterior. En ese caso se incumple «nunca cobrar un precio que el sistema no pudo validar».
  - La ventana es la duración de una lectura del catálogo. Con catálogos grandes o redes lentas puede durar segundos.
- **Corrección propuesta (no aplicada):** que el cobro siempre inicie una lectura nueva, o que espere la lectura en curso y lance otra si empezó antes del clic.

### Riesgos sin defecto demostrado

- **R1, cobro silencioso.** Desde `291f3d3`, si el precio cambia al pulsar Cobrar, se actualiza el total y no se envía, **sin mensaje**. El cajero solo ve que «no pasó nada» y que cambió el total. Si ya recibió efectivo por el total anterior, podría cobrar de nuevo sin notarlo. Es una decisión de diseño que el propietario debe confirmar en caja.
- **R2, respuestas fuera de orden.** La lectura automática de 60 s (`useAutoRefresh`) no comparte la lectura en curso. Una respuesta antigua que llegue tarde podría devolver el carrito al precio anterior. No se reprodujo. El cobro vuelve a validar, así que no debería enviarse un precio antiguo salvo por D2.
- **R3, costo con catálogo grande.** Cada interacción puede disparar una lectura completa de `/productos/comercial`, como máximo una cada 3 s, y no existe un endpoint de versión del catálogo. Debe medirse en la caja real.

## 3. Protocolo de prueba en caja real

**Entorno:** solo en el entorno y la empresa de prueba que autorice el propietario, con el build de `42f154f` (vista previa de Vercel de la rama o el entorno de staging que corresponda). No usar ventas de clientes reales. Anular las ventas de prueba por el procedimiento autorizado.

**Preparación:**
1. Dos equipos o pestañas con sesiones distintas: **Admin**, para cambiar precios, y **Cajero**, en el equipo de caja real, con la caja abierta.
2. Un catálogo representativo, igual o mayor que el real. Anotar el número de productos.
3. Tres productos de prueba con precio aprobado y existencias: **P1** y **P2**, que sufrirán cambios de precio, y **P3**, que se desactivará.
4. Reloj visible para anotar horas. Si es posible, Chrome de escritorio con DevTools abierto en «Red» para medir tiempos y tamaños (opcional).

En cada caso, anotar **resultado esperado / observado / OK o FALLO**.

| # | Caso | Pasos | Resultado esperado |
|---|---|---|---|
| 1 | Carga inicial con catálogo grande | Abrir el POS como Cajero. Medir cuánto tarda en aparecer el catálogo y si la pantalla responde al escribir y pulsar | Catálogo completo sin bloqueos perceptibles; no hay botón «Actualizar catálogo y precios del carrito» |
| 2 | Sincronización automática | Cajero añade P1 (anotar precio y total). Admin cambia el precio de P1 y lo aprueba. Esperar ≥ 3 s. Cajero hace **una** interacción normal (clic en el buscador o tecla) | La línea de P1 y el total pasan al precio nuevo **sin botón, aviso ni paso adicional** |
| 3 | Conservación de cantidades y total | Con P1 ×3 y P2 ×2 en el ticket, cambiar solo el precio de P1. Repetir la interacción del caso 2 | P1 sigue ×3 y P2 ×2; solo cambia el precio de P1; total = Σ(precio vigente × cantidad) menos descuento, más ISV, igual al cálculo manual |
| 4 | Sin interacción (60 s) | Cambiar el precio de P2 y no tocar la caja durante 70 s | Pasados unos 60 s, el ticket muestra el precio nuevo |
| 5 | Venta tras el cambio | Después del caso 2 o 3, cobrar en efectivo | Venta registrada con el precio nuevo: comprobar en el comprobante y en Reportes |
| 6 | Cambio justo antes de cobrar | Con P1 en el ticket, pedir al Admin que cambie su precio y pulsar **Procesar venta** antes de 3 s | **No se registra la venta.** El total cambia al precio nuevo. Anotar si aparece algún mensaje (por diseño actual no aparece, ver R1). Un segundo clic registra la venta al precio nuevo |
| 7 | Producto que deja de estar disponible | Con P3 en el ticket, el Admin lo desactiva (o retira su precio aprobado). Pulsar Procesar venta | Mensaje «Ya no se puede vender: P3…»; no se registra la venta; el resto del ticket se conserva |
| 8 | Desconexión | Con un ticket preparado, desconectar la red de la caja (Wi-Fi o cable). Pulsar Procesar venta | Mensaje «No se pudo confirmar el precio vigente…»; **no se registra la venta** (comprobar en Reportes al reconectar) |
| 9 | Reconexión | Volver a conectar. Esperar unos segundos e interactuar. Cambiar un precio en el Admin y repetir el caso 2. Cobrar | El catálogo se recupera solo; la venta se registra con el precio vigente; no hay ventas duplicadas |
| 10 | Error al consultar precios | Solo si el equipo técnico puede provocar un error del servidor en el entorno de prueba (no en producción). Si no es posible, marcar «cubierto solo por CI» | Igual que el caso 8 |
| 11 | Venta pendiente corregida (D1) | Provocar una venta pendiente (cortar la red justo al pulsar Procesar venta), cambiar el precio en el Admin, reconectar, «Revisar venta y continuar» → «Corregir datos de esta venta» → «Ya revisé el pago: continuar registro» | **Con `42f154f` se espera FALLO** (D1): la venta no se envía. Registrar para confirmar la corrección cuando exista |
| 12 | Admin cobrando en el POS (D2) | Solo si el Admin cobra en caja: con catálogo grande o red lenta, cambiar el precio desde otro equipo mientras la caja interactúa y cobrar enseguida | Riesgo de registrar el precio anterior (D2). Si ocurre, es FALLO y debe reportarse |
| 13 | Nunca un precio sin validar | Al terminar, revisar en Reportes las ventas de prueba | Ninguna venta tiene un precio unitario distinto del vigente en el momento del cobro, salvo lo que confirme D2 en el caso 12 |

## 4. Datos que se deben registrar ante cualquier fallo

- Fecha y hora con zona horaria (America/Tegucigalpa) del cambio de precio y del clic en cobrar.
- Empresa de prueba, usuario y rol (Admin o Cajero) de cada equipo.
- Equipo, sistema operativo, navegador y versión; si es PWA instalada o pestaña.
- URL del entorno y SHA o despliegue probado (`42f154f`, o el que indique la vista previa).
- Tamaño del catálogo (número de productos) y tipo de red (Wi-Fi o cable; tienda o datos móviles).
- Código y nombre del producto, precio anterior, precio nuevo y cantidad.
- Total mostrado antes y después, y total del comprobante.
- Número de venta, si se registró, y lo que muestra Reportes para esa venta.
- Texto exacto de cualquier mensaje en pantalla y del botón pulsado.
- Capturas de pantalla del ticket antes y después, o un video corto si es posible.
- Opcional, si hay DevTools: en «Red», tiempo y tamaño de `/productos/comercial`, y estado y respuesta de `POST /ventas`.
- **No** registrar contraseñas, tokens ni datos personales de clientes.

## 5. Criterio para quitar el borrador

1. D1 corregido, con una regresión de navegador que reproduzca el flujo de la sección 2.
2. D2 corregido o aceptado expresamente por el propietario para el caso Admin.
3. Decisión del propietario sobre R1 (cobro sin mensaje).
4. Casos 1 a 9 y 13 en OK en caja real, con los datos de la sección 4.
