# Auditoría Adversarial Integral — FerreSystem

**Fecha:** 12-13 de octubre de 2026
**Entorno probado:** https://ferre-system.vercel.app (producción) + API https://ferresystem.onrender.com/api
**Tenant de pruebas:** Ferretería Alex (ficticio, datos de prueba — autorizado por el dueño del sistema)
**Auditor:** Claude (navegador controlado por Daniel Castillo)
**Metodología:** exploración manual asistida vía Claude in Chrome, sesión real autenticada por el usuario (no se usaron credenciales por fuerza bruta ni se tocó producción real).

> Este documento se construye de forma incremental durante la auditoría. Las secciones "Funciones pendientes" declaradas por el propio sistema no se cuentan como defectos.

---

## 0. Resumen ejecutivo

- **Pruebas ejecutadas:** 38 (detalle completo en la Sección 4)
- **PASS: 31 / FAIL: 6 / BLOQUEADO: 1**
- **Veredicto final: LISTO CON LIMITACIONES**

**Por qué:** el flujo central del negocio — PRODUCTO → INVENTARIO → CLIENTE → VENTA → COBRO → ENTREGA → CIERRE DE CAJA, incluyendo Cotizaciones y Devoluciones — funciona de punta a punta de forma correcta y consistente, con cálculos de ISV (15%) exactos, validaciones de formulario sólidas, protección real contra XSS en todos los campos de texto probados, y (el hallazgo más destacable de esta auditoría) un **patrón de idempotencia ante fallas de red o reintentos implementado de forma sistemática** en prácticamente todos los módulos transaccionales (Compras, Ventas/POS, Apertura/Cierre de Caja, Devoluciones): ninguna de las interrupciones de red probadas —provocadas o reales— produjo una venta, compra, recepción o devolución duplicada. Esto es una base de ingeniería sólida y poco común para un sistema financiero/POS en esta etapa.

Sin embargo, hay defectos que **deben resolverse antes de depender del sistema para operar una ferretería real sin supervisión cercana**:

- **[P0] La importación masiva de productos por CSV pierde el 100% de los precios** (quedan en L.0.00), lo que hace la función inutilizable para su propósito (cargar un catálogo completo de una sola vez) y obliga a editar cada producto manualmente después de importar. Si la ferretería piloto planea usar esta función para dar de alta su catálogo inicial, **esto debe arreglarse primero**.
- **[P1] "Iniciar Soporte Remoto" (impersonar usuario) está completamente roto** (404 en el backend) y además lista usuarios de demostración hardcodeados que no existen en el tenant real — bloquea cualquier soporte remoto del equipo de FerreSystem a sus clientes.
- **[P1] latente:** si se corrige el bug de precios en 0 del importador CSV sin revisar también sus validaciones, quedaría expuesta la posibilidad de cargar precios negativos y códigos de barras duplicados en masa (la UI de alta manual sí los bloquea, el importador CSV no).
- Un puñado de hallazgos **P2/P3** (ver Sección 2) son mejoras de UX o inconsistencias menores (ej. L.0.01 de diferencia en redondeo de decimales .5 exactos, falta de acción "eliminar" en Usuarios/Sucursales, el recibo de ventas a crédito dice "TOTAL PAGADO" sin haberse pagado, productos sin stock se pueden agregar al carrito del POS sin aviso visual) que no bloquean el uso diario pero conviene atender antes o poco después del lanzamiento.
- **1 prueba quedó BLOQUEADA**, no por un problema del sistema sino porque el propio entorno de este auditor impide escribir cualquier contraseña —incluso deliberadamente incorrecta— en el dominio de producción: la verificación de bloqueo de cuenta tras varios intentos fallidos de login queda pendiente de que Daniel la ejecute manualmente (ver Sección 6).
- Quedan además pendientes de ejecución (no bloqueados, sino fuera del alcance que pude cubrir yo mismo por no poder iniciar sesión con otras cuentas): pruebas de restricción de permisos como rol **BODEGUERO/VENDEDOR/CAJERO** desde su propia sesión, y una simulación de **contingencia sin conexión** en un entorno aislado — ambas requieren que Daniel inicie sesión manualmente o defina un entorno de prueba offline (ver Sección 6).

**En síntesis:** el core del negocio está en buen estado para un piloto controlado, pero el sistema **no debería considerarse "listo" sin reservas** hasta resolver el bug P0 de importación CSV y el P1 de soporte remoto, y sin que Daniel complete las pruebas de login lockout y de roles restringidos que yo no pude ejecutar directamente.

---

## 1. Matriz de cobertura detectada

### Panel Super-Admin (SaaS, dueño de la plataforma)
- Dashboard (Ferreterías registradas, Usuarios administradores, Suscripciones activas, Sucursales conectadas)
- Clientes (Empresas) — tenants, provisión, "Iniciar Soporte" (impersonar), "Gestionar empresa"
- Catálogo de Servicios (módulos contratables)
- Usuarios Admin (CRUD de administradores de plataforma)
- Mantenimiento (Respaldos y recuperación)

### Panel Ferretería Alex (tenant), rol ADMIN
- Ventas y caja: Inicio, Punto de Venta POS, Cotizaciones, Devoluciones, Entregas, Arqueo de Caja
- Inventario y compras: Herramientas y Materiales, Precios y Aprobación, Levantamiento de Inventario, Órdenes de Compra
- Clientes y cobros: Cuentas y Abonos, Estado de cuenta, Clientes
- Personal: Usuarios, Comisiones Venta
- Resultados: Auditoría, Conciliación bancaria, Reportes, Resumen móvil
- Configuración: Configuración del negocio

### Funciones marcadas como pendientes por el propio sistema (dashboard ADMIN)
> "Apartados, transferencias entre sucursales, garantías, pedidos especiales y listas de precio todavía no registran operaciones. Su habilitación en una suscripción no los hace operativos."

### Cobertura real alcanzada (probado a fondo, no solo detectado)
Con pruebas funcionales y adversariales ejecutadas de punta a punta: Productos (alta, edición, validaciones, XSS, importación CSV), Inventario (recepción de compras, costo vigente, stock), Clientes (RTN, XSS, eliminar), Punto de Venta/Ventas (ISV, descuentos, resiliencia ante reintentos, crédito, cantidades negativas/decimales), Cobro y Entregas, Cierre de Caja (arqueo, diferencias, reapertura), Cotizaciones (exención de ISV, conversión a venta), Devoluciones (flujo completo de 4 pasos), Órdenes de Compra/Proveedores, Usuarios (alta, permisos por defecto), Dashboard/Resumen Operativo y Reportes, Configuración del negocio, y Super-Admin (soporte remoto, usuarios admin, mantenimiento).

### Cobertura NO alcanzada por este auditor (requiere a Daniel, ver Sección 6)
Pruebas con sesión iniciada como **BODEGUERO**, **VENDEDOR** o **CAJERO** (restricciones de permisos por rol vistas desde adentro), el **bloqueo de cuenta tras intentos fallidos de login**, y la **simulación de contingencia sin conexión** en un entorno aislado — todas bloqueadas porque este auditor no puede escribir contraseñas en el dominio de producción ni tiene un entorno offline disponible.

---

## 2. Defectos encontrados

### [P1] "Iniciar Soporte Remoto" (impersonar usuario) completamente roto
- **Módulo:** Super-Admin → Clientes (Empresas) → Iniciar Soporte
- **Pasos para reproducir:**
  1. Login Super Admin → Clientes (Empresas) → fila "Ferretería Alex" → botón "Iniciar Soporte".
  2. Seleccionar cualquiera de los 4 usuarios listados (Administrador General, Cajero Principal, Bodeguero, Vendedora).
  3. Completar motivo obligatorio → "Iniciar Soporte Remoto".
- **Resultado actual:** Banner rojo "Usuario o ferretería no disponible para soporte". Confirmado con los 4 usuarios, falla 100% de las veces.
- **Evidencia de red:** `POST https://ferresystem.onrender.com/api/admin/support/token` → **404 Not Found** (endpoint inexistente en el backend).
- **Hallazgo adicional:** los 4 "usuarios" que lista ese modal (Carlos Ramos, Jorge Mendoza, Ana Martínez, correos `@lamundial.hn`) **no existen** en el tenant real — el módulo "Usuarios" de Ferretería Alex solo tenía, antes de esta auditoría, a `alex@gmail.com` (ADMIN) y `ana@caja.com` (CAJERO). El placeholder del formulario "Nuevo Usuario" también usa `mario@lamundial.hn`, confirmando que esa lista de soporte es **data de demostración hardcodeada en el frontend**, nunca conectada al backend real. Esto explica por qué el dueño del sistema no reconocía a "Carlos Ramos".
- **Impacto:** la plataforma SaaS no tiene ninguna vía funcional de soporte remoto / impersonación para sus clientes. Bloquea cualquier diagnóstico remoto que el equipo de FerreSystem necesite hacer para un tenant real.
- **Reproducido:** sí, 100% de las veces (4/4 usuarios).

### [P2] No existe función para eliminar usuarios (tenant) ni sucursales
- **Módulo:** Ferretería Alex → Personal → Usuarios; Super-Admin → Clientes (Empresas)
- **Observado:** en la tabla "Equipo de Trabajo" la columna "Acciones" solo ofrece "Editar" (ningún usuario, incluidos los 2 de prueba creados en esta auditoría, tiene opción de eliminar o desactivar vía borrado). En Super-Admin, la tabla de sucursales/clientes tampoco muestra acción de eliminar, solo "Iniciar Soporte" y "Gestionar empresa".
- **Nota:** existe un toggle "Activo / Inactivo (Bloqueado)" al editar un usuario, que cubre la desactivación — pero no el borrado definitivo. Si la decisión de producto es que nunca se deben eliminar registros (solo desactivar), esto no sería un defecto sino comportamiento esperado; queda pendiente de confirmación con el dueño del producto.
- **Confirmación de que el patrón SÍ existe en otros módulos:** se verificó que el módulo **Clientes** (Clientes y cobros → Clientes) sí tiene una acción "ELIMINAR" completa, con modal de confirmación ("¿Seguro que desea eliminar a [cliente]?") y comportamiento de borrado suave ("El cliente dejará de aparecer en el listado y en el punto de venta"). Se probó creando y eliminando un cliente de prueba, funcionando correctamente. Esto refuerza que la ausencia de "Eliminar" en Usuarios y Sucursales es muy probablemente un descuido/inconsistencia de desarrollo (el patrón de UI y backend ya existe y funciona en Clientes) más que una decisión de producto deliberada.
- **Pedido explícito del dueño del producto (Daniel):** habilitar eliminar usuarios y sucursales.
- **Severidad propuesta:** P2 (gap funcional, no un error que rompa datos).

### [P0] Importación masiva CSV: los precios (venta y costo) NUNCA se guardan — se pierden en el 100% de los casos
- **Módulo:** Ferretería Alex → Herramientas y Materiales → Importar Productos (CSV)
- **Pasos para reproducir:**
  1. Preparar un CSV con columnas `codigo,nombre,codigo_barras,categoria,unidad,precio_venta,precio_costo,stock,stock_minimo` y valores de precio válidos (ej. 85.00 / 50.00).
  2. Importar → la vista previa marca la fila como "VÁLIDO" y no advierte nada sobre precios.
  3. Confirmar importación ("Importar N productos válidos").
  4. Buscar el producto recién creado en el catálogo.
- **Resultado actual:** el producto se crea correctamente con nombre, código, categoría, unidad y stock exactos del CSV — **pero Precio Venta y Precio Costo quedan en L. 0.00**, marcados con la etiqueta "PENDIENTE DE PRECIO". Esto ocurrió en los 6 productos importados durante la prueba (3 del primer lote limpio: Clavo, Cinta, Cable; y los del segundo lote), **sin ninguna excepción**, incluyendo filas con precios perfectamente válidos (ej. "Cinta Metrica 5m" con `precio_venta=85.00` quedó en L.0.00) y una actualización de producto existente ("Clavo de Acero 2 pulgadas", código repetido, `precio_venta=4.00` sobre un producto que ya tenía L.3.50) que también terminó en L.0.00 en vez de actualizar el precio.
- **Impacto:** la función de importación masiva, pensada para cargar el catálogo de una ferretería completa de una sola vez, **es inutilizable para ese fin**: obliga a editar manualmente el precio de cada producto importado uno por uno después de la carga, lo que anula la ventaja de usar CSV. Para una ferretería con cientos o miles de artículos esto es un bloqueador operativo real.
- **Reproducido:** sí, 100% de las filas probadas (6/6), tanto en alta nueva como en actualización de producto existente.
- **Severidad:** P0 — rompe el propósito central de la función.

### [P1] La vista previa del importador CSV no valida precio negativo ni código de barras duplicado
- **Módulo:** mismo flujo que el anterior.
- **Observado:** una fila con `precio_venta=-15.00` se marcó "VÁLIDO" en la vista previa (el formulario de alta manual sí bloquea precios negativos). Una fila con un código de barras ya usado por otro producto (`7501234567890`) también se marcó "VÁLIDO" y se importó sin aviso, generando dos productos distintos con el mismo código de barras. Dado el bug de precios de arriba no se pudo confirmar el valor final almacenado para el precio negativo (quedó en 0 como todos los demás), pero el salto del control de código de barras duplicado sí quedó confirmado de forma independiente.
- **Impacto:** si se corrige el bug de precios en 0, este hallazgo se vuelve crítico por sí solo: permitiría cargar precios negativos y códigos de barras duplicados masivamente vía CSV, algo que la UI de alta manual previene correctamente.
- **Severidad:** P1 (latente, se agravará si se arregla el bug de precios sin revisar también estas validaciones).

### [Nota] Categorías se crean libremente desde el CSV, sin normalizar acentos
- Al importar una fila con `categoria=Tornilleria` (sin tilde) se creó una categoría nueva separada de la ya existente "TORNILLERÍA" (con tilde). Lo mismo con `CategoriaQueNoExiste`, aceptada tal cual sin ninguna validación contra una lista de categorías permitidas.
- No es necesariamente un defecto (podría ser una decisión de flexibilidad de producto), pero genera categorías duplicadas por variaciones de tildes/mayúsculas si no se normaliza, ensuciando los filtros con el tiempo.

### [P2] No se valida nombre de producto duplicado (solo código de barras)
- **Módulo:** Ferretería Alex → Herramientas y Materiales → Nuevo Producto
- **Pasos para reproducir:**
  1. Crear producto "Martillo de prueba A" sin código de barras, precio L.100.
  2. Crear otro producto con el mismo nombre exacto "Martillo de prueba A", sin código de barras, precio L.50.
  3. Ambos se guardan sin advertencia, con códigos internos distintos autogenerados (`MARTILLO-DE-PRUEBA-001` y `MARTILLO-DE-PRUEBA-002`).
- **Impacto:** en el buscador del POS un cajero vería dos resultados idénticos ("Martillo de prueba A") con precios distintos (L.100 vs L.50) y no hay forma visual de diferenciarlos salvo el código interno. Riesgo real de vender al precio equivocado.
- **Contraste:** el código de barras sí valida duplicados correctamente ("Código de barras ya registrado").
- **Severidad:** P2.

### [PASS] Órdenes de Compra: recepción parcial y actualización de costo vigente
- **Módulo:** Ferretería Alex → Inventario y compras → Órdenes de Compra
- **Pasos ejecutados:**
  1. Registrar proveedor "Proveedor QA Prueba".
  2. Registrar factura "FAC-001-TEST" con 10 unidades de "001 · Martillo" a costo L.450.00/unidad (costo vigente previo: L.500.00), sin pago al contado (queda como cuenta por pagar).
  3. Confirmar recepción parcial de 6 unidades → el sistema dejó correctamente la factura en estado "SOLICITADA", con "Recibido: 6" y el campo "Recibir ahora" auto-ajustado al saldo pendiente (4).
  4. Confirmar recepción del resto (4 unidades) → la factura pasó a estado "RECIBIDA", "Pedido 10 / Recibido 10 / Costo L. 450.00".
  5. Verificar en el catálogo "Herramientas y Materiales": el producto "001 · Martillo" ahora muestra **Precio Costo = L. 450.00** (correctamente actualizado desde L.500.00) y **Stock = 10 físicos / 10 disponibles**.
- **Resultado:** la recepción parcial en dos tiempos funcionó correctamente (no duplicó ni perdió unidades), y la regla de negocio "el costo vigente se actualiza con la compra más reciente" se cumplió exactamente.
- **Nota de metodología:** no se capturó el stock de "Martillo" inmediatamente antes de registrar esta compra (solo se confirmó que, tras recibir 10 unidades en total, el catálogo muestra 10 físicos/10 disponibles), por lo que el incremento exacto de stock no quedó verificado contra una línea base explícita, aunque es consistente con un producto que partía de 0.

### [PASS] Órdenes de Compra: número de factura duplicado bloqueado correctamente
- **Pasos:** registrar una segunda factura con el mismo número ya usado por otro proveedor/compra (`FAC-001-TEST`).
- **Resultado:** el backend responde `409 Conflict` (`POST /api/operaciones/compras`) y la UI muestra el banner "Esta factura de proveedor ya está registrada" en la parte superior de la página.
- **Nota UX menor:** el mensaje de error aparece arriba de todo el formulario, no junto al botón "Registrar Factura" ni junto al campo "Número de factura"; si el usuario ya hizo scroll hacia el formulario (como es normal en una pantalla larga), no ve el mensaje sin volver a subir. Sugerencia: mostrar el error también junto al campo o al botón, o hacer scroll automático al mensaje.

### [PASS] Órdenes de Compra: "Pagar al contado al registrar" desacopla pago de recepción de mercancía correctamente
- **Pasos:** registrar una factura nueva (`FAC-002-TEST`) marcando "Pagar al contado al registrar" (método Efectivo).
- **Resultado:** la factura se crea con estado **SOLICITADA** y Recibido=0 (la mercancía NO se marca recibida solo por pagarla), pero en "Cuentas y Abonos → Proveedores · Por Pagar" aparece correctamente como **PAGADA**, Saldo L.0.00, con el abono "EFECTIVO · L.450.00" registrado. Confirma el texto de ayuda del propio formulario: "La compra queda pagada por el total y NO descuenta la caja del turno; los pagos a proveedor no afectan caja (regla FS-09)." El flujo de pago y el flujo de recepción de stock están correctamente desacoplados.

### [PASS] Resiliencia ante fallo de red a mitad de una operación (recepción de compra) — sin duplicar ni perder datos
- **Contexto:** al confirmar la recepción de `FAC-002-TEST`, una falla de red/cliente interrumpió la petición justo después del clic (antes de recibir confirmación visual).
- **Resultado:** al recargar la página, el sistema detectó la operación interrumpida y mostró el banner "Hay una operación pendiente de confirmar. Reintente antes de registrar otra." con un botón "Confirmar operación pendiente" — bloqueando cualquier otra operación de compra hasta resolverla. Al pulsar ese botón, mostró "Operación registrada." y la factura quedó correctamente en estado RECIBIDA, **sin duplicar** la recepción (Pedido 1 / Recibido 1, no 2).
- **Impacto:** buen comportamiento ante el escenario adversarial de "pérdida de conexión a mitad de una operación" solicitado en el alcance de esta auditoría — evita tanto la pérdida de la operación como su duplicación accidental.

### [P2] POS permite agregar al carrito productos sin existencias (0 disp.), sin ninguna advertencia visual
- **Módulo:** Ferretería Alex → Punto de Venta POS
- **Pasos para reproducir:**
  1. Buscar/clicar un producto con "0 disp." en el catálogo del POS (ej. "Chapeadora", 0 disponibles).
  2. El producto se agrega al carrito sin ningún ícono de advertencia, color distinto, ni mensaje.
  3. Se puede incluso subir la cantidad a valores absurdos (se probó 500 unidades) sin que el campo de cantidad, el subtotal ni el botón "Procesar Venta" den ninguna señal de problema.
- **Resultado:** el backend sí bloquea la venta al intentar procesarla (`POST /api/ventas` → `400 Bad Request`), con un mensaje correcto: *"No hay existencias disponibles de 'Chapeadora' para entregar ahora (disponible: 0). Si la mercancía está pendiente de entregar, use Cobrar y dejar en bodega."* — pero el cajero solo se entera de esto **después** de intentar cobrar, no al momento de agregar el producto al carrito.
- **Impacto:** en un local con muchos productos sin stock (frecuente en ferreterías), un cajero puede armar una venta completa, cobrar en efectivo al cliente y recién al final descubrir que uno de los artículos no se puede entregar — mala experiencia frente al cliente en caja. Una validación visual temprana (ícono de "sin stock" en la tarjeta del producto, o bloqueo/advertencia al agregar al carrito) evitaría este problema.
- **Severidad:** P2 (no hay pérdida de datos ni se vende sin stock realmente — el backend protege la integridad — pero es un gap de UX relevante para el flujo de caja).

### [Patrón recurrente de UX] Los mensajes de error/estado aparecen solo arriba del todo de la página, fuera de vista en pantallas largas
- **Observado en:** Órdenes de Compra (factura duplicada) y Punto de Venta (stock insuficiente al procesar venta, "venta en proceso" tras una operación interrumpida).
- **Detalle:** en ambos módulos, el formulario es largo y el botón de acción principal ("Registrar Factura", "Procesar Venta") queda varias pantallas por debajo del encabezado. Cuando la operación falla o queda pendiente, el sistema sí muestra un mensaje claro y correcto, pero **siempre en una franja fija arriba de la página**, no cerca del botón que el usuario acaba de presionar. Un cajero/administrador que no vuelva a subir el scroll puede pensar que no pasó nada, reintentar la acción, o quedar confundido.
- **Sugerencia:** mostrar el mensaje también (o únicamente) cerca del botón de acción, o hacer scroll automático hacia el banner de error/estado cuando aparece.
- **Severidad propuesta:** P3 (cosmético/UX, no afecta la integridad de los datos).

### [PASS] Punto de Venta: ISV (15%), descuento y resiliencia ante reintentos/doble envío
- **Cálculo de impuesto:** venta de prueba de 1 × Martillo (L.500.00) → Subtotal L.500.00, ISV (15%) L.75.00, Total L.575.00. Cálculo exacto y consistente con el 15% declarado en el pie de página de login.
- **Descuento por cajero:** el campo "Aplicar descuento (%)" tiene un límite visible ("Límite cajero: 100%"). Al escribir `150`, el sistema lo recortó automáticamente a `100` (descuento máximo, total en L.0.00) sin permitir pasarse. Al escribir un valor negativo (`-20`), el signo fue ignorado y se aplicó como `20` positivo — es decir, **no es posible usar un "descuento negativo" para inflar el precio**, buen control.
- **Resiliencia ante reintentos (hallazgo importante):** durante la prueba, varios clics sobre "Procesar Venta" (incluyendo un reintento tras recargar la página completa) generaron el banner *"Había una venta en proceso... no vuelva a cobrar al cliente si ya pagó"*, con tres opciones explícitas: "Revisar venta y continuar", "Corregir datos de esta venta", "Ya revisé el pago: continuar registro". Se completó el flujo con la última opción y el sistema generó **una sola venta** (folio V-3, comprobante correcto, L.575.00). Se verificó en Arqueo de Caja que "Ingresos en efectivo" subió exactamente L.575.00 (ni más ni menos), confirmando que **no se duplicó la venta** pese a múltiples envíos/recargas — el mismo patrón robusto de manejo de operaciones interrumpidas visto en Órdenes de Compra.
- **Impacto:** cubre directamente el escenario adversarial solicitado de "doble clic / pérdida de conexión a mitad de una operación de cobro", uno de los riesgos más críticos en un sistema de punto de venta (cobrar dos veces al mismo cliente). El comportamiento observado es correcto y debe preservarse.

### [P3] Inconsistencia de L.0.01 entre el total de la línea y el subtotal en cantidades decimales "redondas .5"
- **Módulo:** Punto de Venta POS → Carrito de compras
- **Pasos para reproducir (reproducido 2/2 veces):**
  1. Agregar al carrito "Tornillo Ñandú 1/2" (precio unitario L.25.99, admite cantidades decimales por ser producto fraccionable).
  2. Cambiar la cantidad a `2.5` exactamente.
- **Resultado:** la línea del producto muestra **"L. 64.98"** (2.5 × 25.99 = 64.975, redondeado hacia arriba), pero el campo **"SUBTOTAL BRUTO" inmediatamente debajo muestra "L. 64.97"** (el mismo valor, pero truncado/redondeado hacia abajo). El ISV (15%) y el total final sí son matemáticamente consistentes entre sí (se calculan aparentemente sobre el valor sin redondear 64.975, dando ISV L.9.75 y total L.74.72), pero no coinciden con el monto que ve el cajero en la línea del producto.
- **Nota de control:** con otras cantidades decimales que no caen justo en el límite de redondeo (ej. 2.535 → L.65.88 en ambos campos) el subtotal y la línea sí coinciden: el problema aparece específicamente en los casos "mitad exacta de centavo" (`x.yz5`), un clásico edge case de redondeo de punto flotante.
- **Impacto:** bajo en términos de dinero (1 centavo), pero en un sistema de caja esto puede generar desconfianza del cajero/cliente al cuadrar cuentas manualmente, y si se repite en muchas líneas de una venta grande podría acumular diferencias de varios centavos entre lo mostrado por línea y el subtotal/reporte.
- **Severidad:** P3.

### [PASS] Punto de Venta: cantidades negativas bloqueadas en el campo de cantidad
- Se intentó escribir `-3` y `-5` directamente en el campo de cantidad de un producto en el carrito (incluyendo con `Ctrl+A` para reemplazar el valor completo). En ambos casos el signo `-` fue **ignorado por el campo** (comportamiento nativo de `<input type="number" min="0">`), nunca se permitió una cantidad negativa. Confirmado dos veces de forma reproducible.

### [P3] Venta a crédito: el recibo dice "TOTAL PAGADO" aunque el cliente no pagó nada (quedó como cuenta por cobrar)
- **Módulo:** Punto de Venta POS → Método de pago "Crédito"
- **Pasos:** seleccionar un cliente registrado, método de pago "Crédito", dejar vacío el campo opcional "Vencimiento del crédito", procesar la venta.
- **Resultado:** la venta se registra correctamente como cuenta por cobrar (verificado en Cuentas y Abonos → Clientes · Por Cobrar: "QA-AUDIT Cliente de prueba · Documento 4 · Pendiente · Saldo L.74.72"), pero el comprobante/recibo impreso muestra la línea **"TOTAL PAGADO: L. 74.72"** igual que en una venta en efectivo — cuando en realidad el cliente no pagó nada en ese momento, es una deuda pendiente.
- **Impacto:** riesgo de confusión contable/operativa: un cajero o cliente que lea el comprobante podría interpretar que la venta ya fue pagada. Se sugiere que el comprobante diga algo como "TOTAL A CRÉDITO" o "SALDO PENDIENTE" cuando el método de pago sea Crédito, en vez de reusar la etiqueta "TOTAL PAGADO".
- **Severidad:** P3 (no afecta la integridad de los datos financieros, que sí quedan correctos en Cuentas por Cobrar, pero puede inducir a error humano).

### [Mejora sugerida] "Vencimiento del crédito" es opcional y no se exige al vender a crédito
- Al procesar una venta a crédito sin llenar la fecha de "Vencimiento del crédito", el sistema la aceptó igual, y la cuenta por cobrar resultante quedó con "Vencimiento —" (sin fecha). Sin fecha de vencimiento, los reportes de cartera vencida/por vencer no podrían calcularse para esa venta. Se sugiere hacer obligatorio este campo (o aplicar un plazo por defecto configurable, ej. 30 días) cuando el método de pago sea Crédito.

### [PASS] Flujo completo VENTA → COBRO → ENTREGA ("Cobrar y dejar en bodega") funciona correctamente de punta a punta
- **Pasos:** en POS, agregar 1 × Martillo y usar el botón "Cobrar y dejar en bodega (entrega después)" en vez de "Procesar Venta" — cobra el efectivo pero no marca la mercancía como entregada.
- **Resultado:** la venta (V-5) quedó correctamente listada en el módulo **Entregas** como "Entregas Pendientes" ("Martillo · Vendido 1 · Entregado 0 · Pendiente 1"). Al presionar "Entregar" sin llenar el campo obligatorio "Quien recibe", el sistema bloqueó correctamente con el mensaje "Escriba el nombre de quien recibe los productos." Al completarlo y confirmar, mostró "Entrega registrada de la venta 5." y la venta desapareció de la lista de pendientes.
- **Hallazgo adicional positivo:** una entrega pendiente pre-existente de más de 3 días ("Venta 2") se marca automáticamente con la alerta **"Pendiente más de 3 días: avise al administrador"** — buen mecanismo de control para mercancía cobrada pero nunca retirada por el cliente.
- **Cobertura:** confirma el flujo completo PRODUCTO → INVENTARIO → VENTA → COBRO → ENTREGA solicitado en el alcance de esta auditoría, funcionando correctamente de punta a punta.

### [PASS] Cierre de Caja (arqueo): diferencia calculada correctamente, exige justificación, y reapertura funciona
- **Apertura:** el campo "Fondo inicial" rechaza valores negativos (`-200` → "El valor debe ser mayor o igual a 0"), igual que en otros formularios de montos del sistema.
- **Cierre con faltante:** se cerró la caja escribiendo un "Efectivo contado" de L.1,500.00 contra un "Efectivo esperado" de L.1,550.00 (Fondo inicial L.500 + Ingresos en efectivo L.1,150 − Egresos L.100). El sistema calculó automáticamente **"Diferencia: Faltante L.50.00"** y exigió llenar "Explique la diferencia" antes de permitir el cierre (bloqueado con "Completa este campo" si se deja vacío). El comprobante de cierre final mostró el desglose completo por método de pago (Efectivo, Tarjeta, Transferencia, Crédito) y quedó visible en la tabla "Cierres de la empresa" con Estado "Cerrada".
- **Bloqueo de venta sin caja abierta:** tras cerrar, el POS mostró correctamente "Abra su caja antes de cobrar." en vez de permitir seguir vendiendo.
- **Reapertura y resiliencia:** al reabrir una nueva caja, una interrupción produjo nuevamente el patrón de "operación pendiente" ya visto en Compras y Ventas — esta vez con el texto explícito *"Hay una operación pendiente. Se reenviará con la misma solicitud para no duplicarla."* Al reintentar, la caja se abrió correctamente una sola vez (sin duplicar el turno).
- **Conclusión:** el patrón de manejo idempotente de operaciones interrumpidas (compras, ventas, apertura/cierre de caja) es consistente en todo el sistema — un acierto de diseño importante para un sistema financiero/POS, que vale la pena preservar explícitamente en futuras features.

### [PASS] Cotizaciones: creación, línea exenta de ISV y conversión a venta funcionan correctamente
- **Creación:** se creó la cotización COT-0002 para un cliente registrado, con 1 línea (Martillo). Al marcar la casilla **"EXENTO"** en la línea, el ISV de esa línea se recalculó correctamente a L.0.00 (de L.75.00 a L.0.00, total de L.575.00 a L.500.00) — buen soporte para productos/clientes exentos de impuesto.
- **Conversión a venta:** el botón "A Venta" abre un modal de confirmación claro: *"¿Desea convertir la Cotización #COT-0002 en una factura de venta oficial?"*, mostrando cliente y total, y advirtiendo correctamente: *"La venta reserva los productos. Las existencias físicas se descuentan al registrar la entrega."* Tras confirmar, la cotización cambió su estado a **"CONVERTIDA A VENTA"** y sus acciones se redujeron a solo "Descargar PDF" (ya no se puede volver a convertir, evitando doble facturación de la misma cotización).
- **Verificación cruzada:** la venta resultante (Venta 6) apareció correctamente en el módulo **Entregas** como pendiente de entrega ("Martillo · Vendido 1 · Entregado 0 · Pendiente 1"), confirmando la integración COTIZACIÓN → VENTA → ENTREGA de punta a punta.
- **Nota:** el selector de productos para cotizaciones reconfirma el bug [P0] de precios en L.0.00 de los productos importados por CSV (aparecen en la lista con "L. 0.00"), evidencia adicional independiente del mismo defecto ya reportado en la sección 2.

### [PASS] Devoluciones: flujo completo Solicitar → Revisar → Autorizar → Confirmar, con validaciones correctas
- **Validaciones de cantidad:** al solicitar devolver 0 unidades, el sistema bloqueó con "Selecciona al menos un producto y la cantidad a devolver."; al intentar devolver 5 unidades de un producto del que solo se vendió 1, bloqueó con "El valor debe ser menor o igual a 1" (tope dinámico según lo realmente vendido). El campo "Motivo de la devolución" es obligatorio.
- **Flujo de 4 pasos probado de punta a punta** sobre la Venta 3 (Martillo, L.575.00, efectivo): solicitud de devolución → quedó "Esperando al administrador" sin mover dinero ni inventario (mensaje explícito: *"todavía no se movió dinero ni inventario"*) → autorización con motivo de decisión → confirmación final → **"Devolución registrada. Importe: L.575.00 · Crédito cancelado: L.0.00 · Reembolso: L.575.00 (EFECTIVO)"**.
- **Patrón de resiliencia (tercera confirmación independiente):** durante este flujo aparecieron dos veces más los banners de "operación pendiente de confirmar", ahora con el texto *"Consultaremos su estado y usaremos la misma identidad para evitar duplicados"* — y en ambos casos se resolvieron sin crear solicitudes ni devoluciones duplicadas (solo existe una solicitud para la Venta 3 al final). Esto confirma que el mecanismo de idempotencia ante reintentos/fallas de red está implementado **de forma sistemática** en prácticamente todos los módulos transaccionales probados en esta auditoría (Compras, Ventas/POS, Apertura y Cierre de Caja, y ahora Devoluciones) — una fortaleza de ingeniería que vale la pena destacar en el resumen ejecutivo.
- **Nota de usabilidad menor:** el campo "Número del comprobante de venta" en Devoluciones espera solo el número (`3`), no el formato mostrado en el recibo impreso ("Factura N°: V-3"). Escribir "V-3" produce un error de validación numérica confuso ("El valor debe ser mayor de o igual a 1"). Sugerencia: aceptar también el formato "V-3" o aclarar en el placeholder que solo se espera el número.

### [PASS] Clientes: validación de RTN hondureño, XSS seguro y eliminar con confirmación
- **RTN:** al escribir un RTN inválido (letras: `ABCDEFGHIJ`), el sistema bloqueó con un mensaje específico y correcto para el contexto hondureño: *"El RTN de Honduras debe contener exactamente 14 dígitos numéricos."*
- **XSS/Unicode:** se creó un cliente con nombre `Cliente QA Ñandú <script>alert(1)</script>`. Se guardó y se mostró en toda la interfaz (mensaje de confirmación, tabla) como **texto plano**, sin ejecutar el script — mismo comportamiento seguro ya confirmado en productos.
- **Eliminar cliente:** existe una acción "ELIMINAR" completa con modal de confirmación (*"¿Seguro que desea eliminar a [cliente]? El cliente dejará de aparecer en el listado y en el punto de venta."*). Se probó creando y eliminando un cliente de prueba sin problemas.

### [P3] Durante una falla de conexión temporal, el POS puede mostrar "Abra su caja antes de cobrar" aunque la caja SÍ esté abierta
- **Contexto:** durante la auditoría ocurrió una falla de conectividad real y no provocada hacia el backend (probablemente un "cold start" del hosting gratuito de Render, que suspende el servidor tras inactividad). El POS mostró correctamente *"No se pudo conectar con la API de productos. Revisa la conexión e intenta nuevamente."* (con botón "Reintentar") y *"No se pudieron consultar los clientes."* (con su propio "Reintentar") — buen manejo para esas dos llamadas.
- **Problema:** al mismo tiempo, el aviso superior del POS cambió a **"Abra su caja antes de cobrar."**, dando a entender que no había ningún turno de caja abierto. Al verificar directamente en "Arqueo de Caja", la caja **sí estaba abierta** (turno iniciado minutos antes, con movimientos registrados correctamente). Tras recuperarse la conexión (recargando la página), el POS volvió a mostrar el estado correcto sin la advertencia.
- **Impacto:** a diferencia de las llamadas a productos/clientes (que distinguen claramente "error de conexión" de "no hay datos"), la verificación de caja abierta no distingue "no se pudo consultar el estado" de "no hay caja abierta", y por defecto asume lo segundo. En un escenario real de conexión inestable, esto podría hacer que un cajero piense erróneamente que debe abrir una nueva caja (duplicando turnos) cuando en realidad ya tiene una abierta.
- **Severidad:** P3 (no se reprodujo con una caída de conexión provocada deliberadamente, sino que ocurrió naturalmente durante la prueba; impacto bajo-medio si coincide con un cajero inexperto).

### [PASS] Dashboard (Resumen Operativo) y Reportes: cifras consistentes y netas de devoluciones entre módulos
- **Dashboard (Inicio/Resumen Operativo):** "Ventas del día: L. 1,224.72" — verificado manualmente contra las ventas de prueba registradas ese día (575 + 74.72 + 575 + 575 − 575 de devolución = 1,224.72 exacto), confirmando que el dashboard **sí neta correctamente las devoluciones** del total mostrado.
- **"Cotizaciones pendientes: 1"** — correcto, ya que de las 2 cotizaciones de prueba (COT-0001 y COT-0002) solo una seguía sin convertir a venta.
- **Reportes & KPIs:** el bloque "Total cobrado neto de devoluciones (incluye ISV)" para el rango 01/10–12/10/2026 mostró L. 1,799.72, y más abajo desglosa explícitamente "Ventas brutas: L. 2,374.72 · Devoluciones del período: L. 575.00" (2,374.72 − 575.00 = 1,799.72, exacto). El desglose por método de pago (TARJETA, CREDITO, EFECTIVO) también sumó correctamente contra el total.
- **"Funciones pendientes" del dashboard:** se expandió el enlace y el texto coincide exactamente con lo ya documentado en la Sección 1/5 de este informe (Apartados, transferencias entre sucursales, garantías, pedidos especiales, listas de precio).
- **Conclusión:** no se encontraron inconsistencias numéricas entre Dashboard, Reportes y Arqueo de Caja — las cifras financieras cuadran de forma consistente en todos los puntos de la aplicación donde se mostraron durante esta auditoría.

### [P3] Configuración del negocio: el campo "Código hexadecimal" no valida el formato ingresado
- **Módulo:** Ferretería Alex → Configuración → Configuración y Marca → Color de marca
- **Pasos para reproducir:** seleccionar el campo "CÓDIGO HEXADECIMAL" (normalmente `#EA580C`), borrar su contenido y escribir texto no-hexadecimal (`NOTAHEX`), luego quitar el foco del campo.
- **Resultado:** el campo acepta el texto libremente, sin ningún mensaje de error ni bloqueo. El cuadro de vista previa del color cambia silenciosamente a **negro sólido** (valor por defecto ante un hex inválido), sin indicar al usuario que el valor ingresado no es un color válido.
- **Nota:** el cambio no se probó hasta guardar (se recargó la página para descartarlo sin persistirlo), por lo que no se confirmó si un valor inválido llegaría a guardarse en la base de datos o si el backend lo rechazaría al intentar guardar; solo se confirmó la falta de validación en el campo del frontend.
- **Impacto:** bajo — es un campo de personalización de marca, no afecta operación ni datos financieros — pero un usuario no técnico podría terminar con un color de marca inesperado (negro) sin entender por qué, al no recibir ningún mensaje explicando que escribió un valor inválido.
- **Severidad:** P3.

### [PASS] Validaciones de formulario de producto que funcionan bien
- Campo "Nombre y variante" requerido → bloquea guardar vacío (validación HTML5 nativa, mensaje "Completa este campo").
- Precio de venta negativo (`-50`) → bloqueado ("Debe ser mayor o igual a 0").
- Precio con 3 decimales (`25.999`) → bloqueado (step mismatch, exige 2 decimales).
- Stock inicial decimal (`10.5`) → **permitido correctamente** (correcto para ferretería que vende por metro/fracción).
- Nombre con HTML/caracteres especiales/unicode (`Tornillo Ñandú 1/2" <b>test</b> & "citas"`) → se guarda y se muestra como texto plano, **sin ejecutar HTML/XSS**. Código interno autogenerado correctamente a partir del nombre (`TORNILLO-NANDU-1-2-001`), manejando tildes y símbolos sin colisión.
- Mensaje de protección ante reintento: "Alta pendiente de confirmar... Reintentar no duplica el producto ni sus existencias" — buena práctica de idempotencia visible al usuario.

---

## 3. Datos de prueba creados en esta auditoría (tenant Ferretería Alex)

| Nombre | Correo | Rol | Sucursal | Notas |
|---|---|---|---|---|
| QA Bodeguero Prueba | qa.bodeguero@ferreteriaalex.test | BODEGUERO | Sucursal Centro (Principal) | Contraseña generada por el propio sistema ("Generar contraseña segura"); se la compartí a Daniel por chat para que inicie sesión y yo pueda probar las restricciones del rol. |
| QA Vendedor Prueba | qa.vendedor@ferreteriaalex.test | VENDEDOR | Sucursal Centro (Principal) | Igual que arriba. |

- Permisos por defecto observados al crear:
  - BODEGUERO → `inventario.ver`, `inventario.editar` (2 permisos).
  - VENDEDOR → `pos.vender`, `cotizaciones.crear` (2 permisos), 10% descuento máximo por defecto.
- Nota UI menor (no concluyente como defecto): al seleccionar el rol con clic directo sobre el `<select>` nativo "ROL BASE", la primera vez no se registraba el cambio (quedaba en CAJERO); al setear el valor mediante el API del formulario sí funcionó correctamente y los permisos por defecto se recalcularon bien. Podría ser una limitación de la automatización del navegador y no un bug real; no se reporta como defecto confirmado.

### Otros datos de prueba creados (Ferretería Alex)
- Cliente "Cliente QA Ñandú `<script>alert(1)</script>`" — creado para probar XSS y luego eliminado.
- Proveedor "Proveedor QA Prueba", facturas de compra "FAC-001-TEST" y "FAC-002-TEST".
- Ventas de prueba V-3 a V-6 (efectivo, crédito, "cobrar y dejar en bodega", y una generada por conversión de cotización).
- Cotización COT-0002 (creada y convertida a Venta 6); COT-0001 "Tio Donaldo" ya existía previamente en el tenant.
- Una solicitud de devolución sobre la Venta 3 (flujo completo hasta reembolso confirmado).
- Productos de prueba: "Martillo de prueba A" (duplicado x2), "Tornillo Ñandú 1/2\" `<b>test</b>` & \"citas\"", y los 6 productos importados por CSV (3 válidos + 4 de edge cases de validación, ver [P0]/[P1] en Sección 2).

### Observación menor: 3 sucursales configuradas vs. "1 sucursal conectada" en Super-Admin
- El selector "Sucursal de Trabajo" en el formulario de usuarios muestra 3 sucursales: Centro (Principal), San Pedro (Norte), Choluteca (Sur).
- El dashboard de Super-Admin reporta "1 TOTAL SUCURSALES CONECTADAS".
- Pendiente de revisar si es una discrepancia real (sucursales configuradas pero no "conectadas"/activadas) o solo una diferencia de nomenclatura. Se investigará en el módulo de Sucursales/Configuración.

---

## 4. Pruebas ejecutadas (PASS/FAIL/BLOQUEADO)

_(se completa en cada sección conforme se ejecuta)_

| # | Módulo | Prueba | Resultado | Notas |
|---|---|---|---|---|
| 1 | Super-Admin / Soporte | Impersonar Administrador General | FAIL | 404 en /api/admin/support/token |
| 2 | Super-Admin / Soporte | Impersonar Cajero Principal | FAIL | 404 en /api/admin/support/token |
| 3 | Super-Admin / Usuarios Admin | Ver lista de administradores de plataforma | PASS | Muestra 1 admin (Ferretería Alex) |
| 4 | Super-Admin / Mantenimiento | Ver estado de respaldos | PASS (informativo) | "Respaldo automático sin configurar. Requiere instalación técnica y prueba de restauración." |
| 5 | Ferretería Alex / Usuarios | Crear usuario rol BODEGUERO | PASS | Guardado correctamente, permisos por defecto correctos |
| 6 | Ferretería Alex / Usuarios | Crear usuario rol VENDEDOR | PASS | Guardado correctamente, permisos y descuento por defecto correctos |
| 7 | Ferretería Alex / Usuarios | Buscar acción "eliminar" en tabla de usuarios | FAIL (gap) | No existe, solo "Editar" |
| 8 | Ferretería Alex / Órdenes de Compra | Registrar factura + recepción parcial (6) + recepción resto (4) | PASS | Costo vigente actualizado L.500→L.450, stock final 10 |
| 9 | Ferretería Alex / Órdenes de Compra | Registrar factura con número duplicado | PASS | Bloqueado con 409 y mensaje "ya está registrada" |
| 10 | Ferretería Alex / Órdenes de Compra | "Pagar al contado al registrar" | PASS | Marca factura PAGADA sin afectar recepción de stock |
| 11 | Ferretería Alex / Órdenes de Compra | Recuperación tras interrupción de red en "Confirmar recepción" | PASS | Sistema detectó operación pendiente, la confirmó sin duplicar |
| 12 | Ferretería Alex / POS | Agregar producto con 0 disponibles al carrito | FAIL (gap UX) | Se agrega sin aviso; se bloquea recién al cobrar |
| 13 | Ferretería Alex / POS | Intentar vender 500 unidades de producto sin stock | PASS (backend) | 400 Bad Request con mensaje claro, sin venta creada |
| 14 | Ferretería Alex / POS | Descuento 150% (inválido) | PASS | Recortado automáticamente a 100% |
| 15 | Ferretería Alex / POS | Descuento negativo -20% | PASS | Signo ignorado, aplicado como 20% positivo |
| 16 | Ferretería Alex / POS | Cálculo ISV 15% sobre venta de L.500.00 | PASS | L.75.00 de ISV, total L.575.00 exacto |
| 17 | Ferretería Alex / POS | Venta con múltiples reintentos/recarga a mitad de "Procesar Venta" | PASS | Una sola venta registrada (V-3), sin duplicar cobro |
| 18 | Ferretería Alex / POS | Cantidad decimal "redonda" 2.5 en producto fraccionable | FAIL (P3) | Línea L.64.98 vs Subtotal L.64.97 (descuadre de L.0.01) |
| 19 | Ferretería Alex / POS | Cantidad negativa (-3, -5) en campo cantidad | PASS | Signo rechazado por el campo, nunca negativo |
| 20 | Ferretería Alex / POS | Venta a crédito sin fecha de vencimiento | PASS (con nota) | Se registra en Cuentas por Cobrar; recibo dice "TOTAL PAGADO" |
| 21 | Ferretería Alex / Entregas | "Cobrar y dejar en bodega" + confirmar entrega sin "Quien recibe" | PASS | Bloqueado con mensaje claro; al completarlo, entrega OK |
| 22 | Ferretería Alex / Arqueo de Caja | Fondo inicial negativo al abrir caja | PASS | Bloqueado: "El valor debe ser mayor o igual a 0" |
| 23 | Ferretería Alex / Arqueo de Caja | Cierre con faltante de efectivo sin justificar | PASS | Diferencia calculada bien; exige "Explique la diferencia" |
| 24 | Ferretería Alex / Arqueo de Caja | Reapertura de caja tras operación interrumpida | PASS | Mensaje de reintento idempotente; no duplicó el turno |
| 25 | Ferretería Alex / POS | Intentar vender con la caja cerrada | PASS | Bloqueado: "Abra su caja antes de cobrar." |
| 26 | Ferretería Alex / Cotizaciones | Crear cotización y marcar línea como EXENTO | PASS | ISV recalculado a L.0.00 correctamente |
| 27 | Ferretería Alex / Cotizaciones | Convertir cotización a venta ("A Venta") | PASS | Modal claro; venta creada; cotización bloqueada para reconversión |
| 28 | Ferretería Alex / Devoluciones | Solicitar devolver 0 unidades | PASS | Bloqueado: "Selecciona al menos un producto y la cantidad..." |
| 29 | Ferretería Alex / Devoluciones | Solicitar devolver 5 de 1 unidad vendida | PASS | Bloqueado: "El valor debe ser menor o igual a 1" |
| 30 | Ferretería Alex / Devoluciones | Flujo completo Solicitar→Revisar→Autorizar→Confirmar | PASS | Devolución y reembolso registrados correctamente, sin duplicar |
| 31 | Ferretería Alex / Clientes | RTN inválido (letras) al crear cliente | PASS | Bloqueado: "debe contener exactamente 14 dígitos numéricos" |
| 32 | Ferretería Alex / Clientes | Nombre con script/Unicode | PASS | Guardado y mostrado como texto plano, sin ejecutar HTML |
| 33 | Ferretería Alex / Clientes | Eliminar cliente de prueba | PASS | Modal de confirmación, borrado suave, funcionó correctamente |
| 34 | Login | Bloqueo tras intentos fallidos (sin fuerza bruta) | BLOQUEADO | El propio entorno de pruebas de Claude impide escribir cualquier contraseña (incluso incorrecta a propósito) en el dominio de producción; requiere que Daniel lo pruebe manualmente |
| 35 | Ferretería Alex / POS | Falla de conexión real al backend a mitad de uso | PASS (con nota) | Productos/clientes manejan bien el error; el estado de "caja abierta" no — ver [P3] |
| 36 | Ferretería Alex / Dashboard | Consistencia de "Ventas del día" neto de devoluciones | PASS | L.1,224.72 verificado manualmente contra las ventas y devolución de prueba |
| 37 | Ferretería Alex / Reportes | Consistencia de "Total cobrado neto de devoluciones" vs. ventas brutas − devoluciones | PASS | 2,374.72 − 575.00 = 1,799.72 exacto; desglose por método cuadra |
| 38 | Ferretería Alex / Configuración | Código hexadecimal de marca con valor inválido (`NOTAHEX`) | FAIL (P3) | Sin mensaje de error; vista previa cae a negro silenciosamente |

---

## 5. Funcionalidades pendientes de implementar (declaradas por el sistema)

- Apartados
- Transferencias entre sucursales
- Garantías
- Pedidos especiales
- Listas de precio

## 6. Pendiente de solicitar al dueño del producto / pruebas que Daniel debe completar

### Preguntas de producto
- Confirmación de si "eliminar" debe existir para usuarios/sucursales o si el diseño intencional es solo desactivar.
- Aclarar el origen de los datos demo "Carlos Ramos / Jorge Mendoza / Ana Martínez / @lamundial.hn" en el modal de soporte (parece código placeholder nunca reemplazado).
- ¿Debería "Vencimiento del crédito" ser obligatorio al vender a crédito, o aplicarse un plazo por defecto (ej. 30 días)?
- ¿El recibo de una venta a crédito debería decir algo distinto a "TOTAL PAGADO" (ej. "SALDO PENDIENTE")?
- ¿El campo "Número del comprobante de venta" en Devoluciones debería aceptar el formato "V-3" tal como aparece en el recibo impreso, en vez de solo el número suelto?
- Confirmar si las 3 sucursales configuradas (Centro, San Pedro, Choluteca) deberían reflejarse como "3 sucursales conectadas" en el dashboard de Super-Admin, o si "conectada" significa algo distinto a "configurada".

### Pruebas que quedaron fuera de mi alcance y requieren que Daniel las ejecute
- **Bloqueo de cuenta tras intentos fallidos de login (fila #34, BLOQUEADO):** mi entorno impide escribir cualquier contraseña, incluso deliberadamente incorrecta, en el dominio de producción. Pido a Daniel que intente iniciar sesión 4-5 veces seguidas con una contraseña incorrecta en una cuenta de prueba y me reporte qué ocurre (¿se bloquea la cuenta? ¿hay CAPTCHA? ¿límite de intentos visible?).
- **Pruebas de permisos por rol (BODEGUERO, VENDEDOR, CAJERO):** se crearon las cuentas de prueba `qa.bodeguero@ferreteriaalex.test` y `qa.vendedor@ferreteriaalex.test` (Sección 3), pero no pude iniciar sesión con ellas por la misma razón. Si Daniel inicia sesión con alguna de ellas (o con `ana@caja.com`, CAJERO ya existente) y comparte lo que ve, puedo seguir guiando qué validar (que el menú solo muestre las pantallas permitidas, que las acciones restringidas estén realmente bloqueadas y no solo ocultas en el menú, etc.).
- **Simulación de contingencia sin conexión:** el alcance original pedía probar un escenario de "modo offline" en un entorno aislado (no producción). Todavía no se definió cómo montar ese entorno; si Daniel tiene una instancia local o de staging, puedo diseñar y ejecutar ese caso de prueba ahí.

---

## 7. Capturas de pantalla

(se adjuntan por separado en la conversación conforme se generan)
