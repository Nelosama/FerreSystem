# Evaluación de facilidad de uso — 2026-11-10

Recorrido en navegador (Chromium, escritorio 1366×800 y móvil 390×844) sobre la aplicación completa levantada en local:
API compilada, frontend compilado y PostgreSQL temporal con datos sintéticos (`frontend/e2e-real/seed.cjs` más un vendedor,
un contador y el módulo de contabilidad). Base de código: `main` `10ad328` más la rama de consolidación.

**Límite de esta evaluación:** la hizo un agente, no personas. No participó ningún usuario real, y menos aún usuarios con
primaria o secundaria. Las pruebas automáticas comprueban que la pantalla responde; **no prueban que una persona la
entienda**. Lo que sigue son observaciones de experto y deben confirmarse con las tareas de la última sección.

## Flujos recorridos

| Rol | Flujo | Resultado |
|---|---|---|
| Cajero | Abrir caja, buscar producto, vender en efectivo, error de tarjeta sin autorización, efectivo insuficiente, comprobante | Completado; 2 defectos corregidos |
| Vendedor | Inicio, cotizaciones, intento de abrir Clientes e Inventario, caja | Completado; clientes solo se buscan desde la venta o la cotización |
| Bodeguero | Inicio, entregas pendientes, existencias, conteo de inventario | Completado (con permisos de inventario asignados) |
| Administrador | Inicio, inventario, reportes, cuentas y abonos, usuarios, clientes | Completado; 2 defectos corregidos |
| Contador | Inicio contable, reportes, cuentas por cobrar y pagar, documentos fiscales | Completado; solo lectura |

No se recorrieron: compras y recepción, devoluciones, garantías, precios, contingencia sin conexión, Super Admin,
impresión física, lector de códigos y la aplicación móvil nativa.

## Problemas encontrados

Severidad: **A** impide o hace equivocarse con dinero; **B** confunde o retrasa; **C** pulido.

### Corregidos en esta rama

| # | Sev. | Pantalla | Pasos | Impacto | Corrección |
|---|---|---|---|---|---|
| U1 | A | Punto de venta, pago en efectivo | Agregar un producto de L 230, escribir 100 en «Efectivo recibido», pulsar «Procesar Venta» | La pantalla decía «Falta: L 130.00» y aun así registraba la venta. Un cajero podía cobrar de menos sin darse cuenta | El cobro se detiene con «El efectivo recibido no cubre el total: faltan L …». El campo sigue siendo opcional: vacío no bloquea |
| U2 | B | Punto de venta, buscador | Escribir un nombre con un error («cemnto») | El catálogo quedaba en blanco, sin explicación | Mensaje «No se encontró ningún producto con «…». Revise cómo está escrito o busque por el código» |
| U3 | B | Inicio de cajero, vendedor y bodeguero | Entrar al sistema | Decía «Turno Actual: 08:00 AM - 05:00 PM», un texto fijo que no corresponde a ningún horario real | Sustituido por «Lo más importante de su trabajo de hoy» |
| U4 | B | Clientes (administrador) | Abrir Clientes | El título de la pantalla era «NUEVO CLIENTE», igual que el botón | El título es «Clientes» |
| U5 | C | Reportes | Abrir Reportes | Título «MÓDULO DE REPORTES & KPIS» y «desde la base de datos»: jerga | «REPORTES DEL NEGOCIO», «Ventas, inventario y cuentas por vencer» y «hora local del negocio» |
| U6 | C | Punto de venta | Abrir el punto de venta | Subtítulo «Terminal de Ventas y Cobro Rápido» | «Busque productos, cobre y entregue el comprobante» |
| U7 | B | Inicio del administrador, últimas ventas | Vender escribiendo el nombre del cliente sin registrarlo | La lista mostraba «Consumidor Final» aunque la venta tenía nombre | Muestra el nombre escrito en la venta |

### Pendientes (requieren decisión o más trabajo)

| # | Sev. | Pantalla | Problema | Propuesta |
|---|---|---|---|---|
| P1 | B | Menú lateral del cajero (escritorio) | «Caja» abre el punto de venta y «Mi caja» abre el arqueo; en el móvil los mismos destinos se llaman «Punto de venta» y «Arqueo de caja» | Un solo par de nombres en todas partes, por ejemplo «Vender» y «Mi caja». Varias pruebas dependen de los nombres actuales |
| P2 | B | Toda la aplicación | Se mezcla «tú» y «usted» («No tienes acceso…» frente a «No tiene una caja abierta») | Elegir una forma y aplicarla en todo `es.json` |
| P3 | B | Punto de venta, tarjeta | «Autorización bancaria» y «Terminal POS» sin ayuda; el error aparece arriba, lejos del campo | Texto de ayuda («número de aprobación del voucher», «número del aparato») y error junto al campo |
| P4 | B | Móvil, barra superior | El botón de salir es solo un icono de 36×28 px; hay enlaces de 17 px de alto y una casilla de 13 px | Mínimo 44×44 px y texto «Salir» |
| P5 | B | Móvil, punto de venta | El carrito y el cobro quedan debajo de todo el catálogo; hay que desplazarse mucho | Barra fija con el total y un botón «Cobrar» |
| P6 | C | Inicio de vendedor y bodeguero | «ALERTAS DE STOCK … items» mezcla inglés; el bodeguero ve «Cotizaciones pendientes», que no usa | «productos» y ocultar tarjetas ajenas al rol |
| P7 | C | Cotizaciones e inventario | Títulos y columnas en mayúsculas sostenidas, «ITEMS», «Proforma», «Valor bruto en cartera», «Rubro», «Levantamiento» | Lenguaje llano: «Productos», «Presupuestos», «Conteo de inventario» |
| P8 | B | Conteo de inventario | A un bodeguero sin permiso se le muestra el error y, debajo, el formulario para crear el conteo | Ocultar el formulario cuando no hay permiso y decir a quién pedirlo |
| P9 | C | Punto de venta, escritorio 1366×800 | Al elegir el pago, las líneas del carrito quedan fuera de la vista | Mantener visible el resumen de productos junto al botón de cobro |
| P10 | C | Tamaño de letra | El texto más pequeño medido es de 11 px (etiquetas del catálogo) | Mínimo 13–14 px en etiquetas operativas |

## Tareas para validar con usuarios reales

Cinco a ocho personas por rol, con al menos dos que hayan completado solo primaria o secundaria. Una persona observa y
no ayuda. Se anota si termina, cuánto tarda, dónde se detiene y qué palabras no entiende.

**Cajero**
1. «Empiece su turno con L 500 en la gaveta.» (Meta: abrir caja sin ayuda en menos de 1 minuto.)
2. «Un cliente lleva una bolsa de cemento y paga con un billete de L 500. Cóbrele y dígame cuánto le devuelve.»
3. «Otro cliente paga con tarjeta. Cóbrele.» (Observar si entiende «Autorización bancaria» y «Terminal POS».)
4. «Se equivocó de producto antes de cobrar. Corríjalo.»
5. «Termine su turno: en la gaveta hay L 720.» (Observar si entiende «Diferencia» y por qué pide explicación.)

**Vendedor**
6. «El señor de Taller San José quiere precio por dos taladros. Prepárele una cotización.»
7. «El cliente aceptó. Conviértala en venta.»

**Bodeguero**
8. «¿Cuántas bolsas de cemento quedan disponibles para vender?» (Observar si distingue «físicos», «reservados» y «disponibles».)
9. «Vinieron a recoger la venta 2. Entréguela.»
10. «Llegó un conteo: hay 8 inversores, no 10. Regístrelo.»

**Administrador**
11. «¿Cuánto se vendió ayer y con qué forma de pago?»
12. «Dé de alta a una cajera nueva que no pueda dar descuentos.»
13. «La Constructora del Norte quiere crédito hasta L 10 000. Actívelo.»

**Contador**
14. «¿Cuánto ISV generaron las ventas de octubre?»
15. «¿Qué clientes deben dinero y desde cuándo?»

Criterio sugerido: una tarea se considera clara si al menos 4 de cada 5 personas la terminan sin ayuda. Las palabras
que dos o más personas no entiendan se cambian.
