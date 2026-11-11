# Auditoría de facilidad de uso y revisión técnica — 2026-11-11

- **Rama:** `claude/zealous-hypatia-n3fjte`. **Base:** `main` `2e72b43e3ff9d9f878ebdce961371b38c9aeee6a`.
- **PR #241 no se usó:** al iniciar estaba abierto, pero su alcance es la retención de la contingencia PWA (NEXUS) y mezclar usabilidad ahí ampliaría su revisión. El dueño lo fusionó en `main` durante esta sesión (`ba312dda`); la rama integró ese `main` por merge normal, con conflicto solo en `docs/CONTEXTO_MAESTRO.md`. Este trabajo va en una sola rama nueva; no se abrió PR.
- **Sin merge, despliegue, cambios de infraestructura, migraciones ni bases reales.** Sin cambios de esquema Prisma.
- **Relación con #243:** se fusionó en `main` (`389ebcf`) después de esta auditoría e incluye otra evaluación de uso (`docs/EVALUACION_USABILIDAD_20261110.md`). Los hallazgos de aquí se observaron sobre `2e72b43`. Al integrar `main` se conservó su texto para el subtítulo de Inicio (U-07) y la nota de fechas de Reportes (U-12). #243 ya impide cobrar cuando el efectivo escrito no cubre el total, lo que reduce P-02; el campo vacío sigue sin bloquear y no hay confirmación.
- Resultados de pruebas y estado de CI: ver `docs/CONTEXTO_MAESTRO.md` (sección del 2026-11-11).

## Alcance y límites de la evidencia

- La aplicación se ejecutó completa en local: PostgreSQL 16 temporal, backend NestJS compilado y frontend construido, con los datos sintéticos de `frontend/e2e-real/seed.cjs` más un vendedor y un contador sintéticos. Se recorrió en Chromium a 1280×800, 1366×768 y 390×844 (teléfono) con los roles cajero, vendedor, bodeguero, administrador y contador.
- **No se probó con personas.** Lo que sigue es una inspección experta con navegador automatizado. No mide comprensión humana y no permite afirmar que la aplicación sea fácil para todos los usuarios. La sección «Validación con usuarios reales» lista lo que el dueño debe observar.
- No es un inventario completo de errores: es lo que se encontró en los flujos recorridos.
- Los mensajes de «campo obligatorio» que muestra el navegador salieron en inglés porque el navegador de prueba estaba en inglés; en un navegador en español salen en español. No se cuenta como defecto.

## Fase 1 — Facilidad de uso

### Problemas comprobados y corregidos

| ID | Severidad | Pantalla y pasos | Impacto | Corrección |
|---|---|---|---|---|
| U-01 | Alta | POS en una laptop de 800 px de alto o menos: agregar un producto. | El cliente y las líneas del carrito quedaban en 0 px de alto: no se veía qué se estaba cobrando ni el botón «Cambiar cliente», aunque el error pedía elegir un cliente. | El cuerpo del ticket conserva 170 px como mínimo y el ticket se desplaza si no cabe (`frontend/src/pages/POSPage.css:12-15`). |
| U-02 | Alta | Entrar como contador en escritorio. | El menú lateral salía como enlaces azules sin formato, sobre el contenido: usaba clases CSS que ya no existen. | `ContadorRail` usa el componente compartido `IconRail` (`frontend/src/components/ContadorRail.tsx`). |
| U-03 | Alta | Cotizaciones → Nueva cotización → Guardar borrador sin cliente o sin productos. | El error aparecía detrás del formulario: al usuario no le pasaba nada visible. | El error se muestra dentro del formulario, junto a los botones (`frontend/src/pages/CotizacionesPage.tsx:1241`). |
| U-04 | Media | Inventario con las categorías del rubro ferretería. | El buscador se encogía a unos 50 px y tapaba el filtro «Todas». | Ancho mínimo útil y salto de fila (`frontend/src/pages/InventarioPage.tsx:463-467`); filtros de 44 px de alto. |
| U-05 | Media | Abrir una pantalla sin permiso (por ejemplo, cajero en `/inventario`). | Pantalla sin menú ni botón para volver, con claves internas («inventario.ver», nombre técnico del módulo). | Texto llano, qué hacer después y botón «Volver al inicio» (`frontend/src/components/ProtectedRoute.tsx:45-96`). |
| U-06 | Media | POS: escribir una cantidad mayor que la existencia. | No había aviso; el rechazo llegaba al cobrar. Al agregar con clic sí avisaba. | Mismo aviso al escribir la cantidad o usar «+» (`frontend/src/pages/POSPage.tsx:477-490`). |
| U-07 | Media | Inicio de cualquier rol. | Mostraba «Turno Actual: 08:00 AM - 05:00 PM», un horario fijo que no sale de ningún dato. | Texto neutro «Lo más importante de hoy» (`frontend/src/locales/es.json`, `en.json`). |
| U-08 | Media | Inicio del vendedor. | Decía «consulta tus clientes», pero la pantalla Clientes es solo del administrador y respondía «Acceso denegado». | El texto indica buscar al cliente dentro de la venta o la cotización. La política de acceso no cambió. |
| U-09 | Baja | Editar producto y levantamiento: unidad de medida. | Opciones como `METRO_CUADRADO`, `KG`, `GALON`. | Nombres legibles («Metro cuadrado (m²)»); el valor guardado no cambia (`frontend/src/utils/unidadMedida.ts`). |
| U-10 | Baja | Editar producto: «Se vende por medida» y «Producto activo». | La casilla quedaba lejos de su texto. | Casilla y texto en la misma línea, 44 px de alto (`OperacionesPage.css`). |
| U-11 | Baja | Teléfono y tableta: botón de salir. | Área táctil de 36×28 px. | 44×44 px (`frontend/src/styles/shell.css`). |
| U-12 | Baja | POS: aviso de error; Reportes: nota de fechas. | El error no se anunciaba a lectores de pantalla; la nota decía «America/Tegucigalpa». | `role="alert"`; «hora de Honduras (America/Tegucigalpa)». |

### Problemas observados sin corregir (requieren decisión o más alcance)

| ID | Severidad | Observación | Propuesta |
|---|---|---|---|
| P-01 | Media, comprobado | La misma pantalla se llama «Mi caja» (menú lateral), «Arqueo de caja» (menú del teléfono y buscador), «Caja y arqueo» (título) y «Abrir o revisar mi caja» (POS). «Arqueo» es un término contable. | Elegir un solo nombre, por ejemplo «Mi caja». Cambia textos que usan muchas pruebas; decisión del dueño. |
| P-02 | Media, hipótesis | «Procesar Venta» registra la venta con un solo toque, sin confirmación, y acepta «Efectivo recibido» vacío. | Decidir entre rapidez y prevención de errores; observar con cajeros si cobran por accidente. |
| P-03 | Media, comprobado | El aviso de error del POS siempre trae «Reintentar», que solo recarga el catálogo, también cuando el error es «Seleccione un cliente». | Mostrar el botón solo cuando falla la carga del catálogo (`POSPage.tsx:836`). |
| P-04 | Media, hipótesis | Registrar un movimiento de inventario es cambiar «Nuevas existencias» dentro del formulario largo del producto, que se elige en una lista desplegable. Con cientos de productos puede ser lento. | Acción directa «Ajustar existencias» desde la fila del producto, con búsqueda. |
| P-05 | Baja, comprobado | Varios rechazos del servidor llegan en inglés («motivo should not be empty», «stockActual must not be less than 0»). | Añadir mensajes en español a los DTO restantes. |
| P-06 | Baja, comprobado | Jerga y siglas: «REPORTES & KPIS», «ROL BASE», «DESC. MÁXIMO», «ITEMS», «SUBTOTAL BRUTO», «Venta sin inventario». | Revisar el vocabulario con usuarios reales antes de cambiarlo. |
| P-07 | Baja, comprobado | Enlaces rápidos del POS de 17 px de alto; logotipo y avatar de 32 px en teléfono; «Arqueo de caja» y «Cuentas y abonos» comparten el icono «$» en el menú del teléfono. | Aumentar áreas táctiles y diferenciar iconos. |
| P-08 | Baja, comprobado | Tras U-01, en pantallas bajas el ticket del POS tiene desplazamiento interno. | Revisar el diseño del ticket para 768 px de alto. |
| P-09 | Baja, hipótesis | Contabilidad abre en el mes anterior; una venta de hoy no aparece hasta cambiar el período. | Confirmar con el contador qué período espera ver. |

### Flujos revisados

| Rol | Recorrido | Resultado |
|---|---|---|
| Cajero | Inicio, abrir caja, buscar y agregar productos, cantidad, cobro en efectivo, comprobante, crédito sin cliente, cancelar venta; teléfono. | Completo. Hallazgos U-01, U-06, U-12, P-01, P-02, P-03. |
| Vendedor | Inicio, nueva cotización con cliente existente, guardar vacío, Clientes. | Completo hasta guardar. Hallazgos U-03, U-08. La conversión a venta se probó por API. |
| Bodeguero | Inicio, inventario, selección de producto, formulario de existencias. | Formulario revisado; el ajuste con motivo y el control de concurrencia se probaron por API. Hallazgos U-04, U-09, U-10, P-04. |
| Administrador | Inicio, usuarios, reportes, inventario, contabilidad. | Solo lectura de pantallas. No se creó un usuario ni se editó configuración. |
| Contador | Inicio, reportes, cuentas por cobrar y pagar. | Solo lectura; sin datos fiscales sembrados, las tablas salieron vacías. Hallazgo U-02, P-09. |

**No se pudo probar:** impresión de tickets y PDF en impresora, lector de códigos y cámara, instalación como PWA y venta sin conexión en un dispositivo real, iPhone/Safari, MFA y recuperación de contraseña, Super Admin, compras y recepción de mercadería por interfaz, devoluciones, garantías, entregas y cierre de caja por interfaz.

### Validación con usuarios reales (pendiente)

Pedir cada tarea sin explicar cómo se hace. Anotar dónde la persona duda, se equivoca, pide ayuda o abandona, y cuánto tarda. Incluir personas con poca experiencia en computadoras y usar el equipo real de la tienda.

1. **Cajero:** «Abra su caja con L. 500». Luego: «Venda 2 bolsas de cemento y cobre en efectivo con un billete de L. 500».
2. **Cajero:** «Se equivocó: eran 3 bolsas, no 2. Corríjalo antes de cobrar». Después: «El cliente ya no quiere la compra; cancélela».
3. **Cajero:** «Este cliente paga con tarjeta». Observar si entiende qué es la autorización bancaria y la terminal.
4. **Vendedor:** «Haga una cotización para Constructora del Norte por 10 bolsas de cemento y entréguesela».
5. **Bodeguero:** «¿Cuántos taladros hay disponibles?». Luego: «Contó 8 y el sistema dice 10; corríjalo».
6. **Administrador:** «Cree un usuario cajero nuevo». Luego: «¿Cuánto se vendió ayer y quién lo vendió?».
7. **Contador:** «Descargue el libro de ventas del mes pasado». Luego: «¿Qué clientes deben y cuánto?».
8. **Cualquier rol, en teléfono:** «Cierre su sesión». Observar si encuentra el botón, que solo muestra un icono.
9. **Preguntar al final:** qué palabras no entendió («arqueo», «ISV», «KPI», «rol base», «venta sin inventario»).

## Fase 2 — Revisión técnica

Pruebas de caja negra contra la API local con datos sintéticos, más lectura del código señalado.

### Corregido

| ID | Severidad | Hallazgo | Evidencia | Corrección |
|---|---|---|---|---|
| T-01 | P2 | Dependencias con avisos de seguridad: `body-parser`, `multer` y `qs` en el backend; `follow-redirects` en el frontend. | `npm audit --omit=dev`: 5 avisos en backend (3 altos), 1 alto en frontend. | `npm audit fix` sin `--force`; solo cambian los `package-lock.json`. Queda 1 aviso moderado (T-02). |
| T-03 | P3 | Nombre, RTN, teléfono y dirección del cliente sin largo máximo (`backend/src/clientes/dto/create-cliente.dto.ts`); el cuerpo admite hasta 2 MB. | `POST /clientes` aceptaba cualquier largo. | Límites 200/100/50/500 con mensajes en español en alta y edición; prueba `backend/src/clientes/cliente-dto-limites.spec.ts`. |

### Abierto: requiere decisión humana

| ID | Severidad | Hallazgo | Evidencia | Propuesta |
|---|---|---|---|---|
| T-02 | P3 | `nodemailer` 10.0.16 conserva un aviso moderado; la versión está fijada de forma exacta. | `npm audit` pide `--force`. | Decidir la actualización y probar el correo de recuperación. |
| T-04 | P2 | Un vendedor puede emitir una cotización con precio unitario arbitrario (L. 1.00 para un producto de L. 200.00) o con un descuento que deja el total en L. 0.00. No hay límite por rol (`backend/src/cotizaciones/cotizaciones.service.ts:692-706`). La conversión a venta sí lo rechaza (409 «El precio cambió»). | `POST /cotizaciones` → 201 con total 1.15; `POST /cotizaciones/:id/convertir` → 409. | Decisión de negocio: límite de descuento o autorización para cotizar bajo el precio de lista. |
| T-05 | P3 | El RTN del cliente acepta cualquier texto («abc»). | `POST /clientes` → 201. | Decisión fiscal o del contador sobre el formato exigido. |
| T-06 | P3 | Mensajes de validación en inglés (ver P-05). | `POST /operaciones/productos/:id/ajuste` sin motivo → «motivo should not be empty». | Mensajes en español en los DTO. |
| T-07 | P3 | `GET /operaciones/productos/:id/historial` con un producto de otra empresa responde 200 con listas vacías en lugar de 404. No hay fuga de datos. | Respuesta `{"movimientos":[],"costos":[]}`. | Responder 404 por coherencia. |

### Comprobado sin defecto en esta revisión

- **Autenticación:** seis rutas sin token responden 401; clave errónea y usuario inexistente dan el mismo mensaje.
- **Separación entre empresas:** el administrador de la empresa B recibe 404 al leer o modificar ventas, productos, clientes, cotizaciones, cuentas y ajustes de la empresa A; un `tenantId` enviado en el cuerpo se ignora.
- **Permisos por rol:** bodeguero y contador no venden (403); cajero no ve usuarios, panel ni cambia precios (403); bodeguero no recibe costos ni márgenes.
- **POS e importes:** precio alterado por el cliente → 409; cantidad negativa, de tres decimales o mayor que la existencia → 400; descuento sobre el límite → 403; tarjeta sin autorización → 400; venta sin caja abierta → 409; reintento con el mismo `solicitudId` devuelve la misma venta y contenido distinto → 409.
- **ISV 15 %:** 2 × L. 200.00 → ISV L. 60.00, total L. 460.00; 0.33 × L. 200.00 → subtotal L. 66.00, ISV L. 9.90, total L. 75.90; una cotización con tasa 0 % se rechaza.
- **Crédito e inventario:** cliente sin crédito o sobre el límite → 400; ajuste con existencia desactualizada → 409.

**No revisado en esta sesión:** PWA sin conexión y sincronización (cubiertas por las suites existentes; siguen en NO-GO propio), MFA y recuperación, Super Admin y soporte remoto, respaldos, contabilidad, devoluciones, y pruebas de carga o concurrencia real.

## Archivos modificados

- Frontend: `components/ContadorRail.tsx`, `IconRail.tsx`, `ProductoGestion.tsx`, `ProtectedRoute.tsx`; `pages/POSPage.tsx`, `POSPage.css`, `CotizacionesPage.tsx`, `InventarioPage.tsx`, `LevantamientoPage.tsx`, `OperacionesPage.css`; `styles/shell.css`; `utils/unidadMedida.ts`; `locales/es.json`, `en.json`; `package-lock.json`.
- Pruebas frontend: `e2e/ux-ronda1-regresion.spec.ts`, `e2e/contabilidad-simulado.spec.ts`, `test/unidades-csv.test.mjs`.
- Backend: `src/clientes/dto/create-cliente.dto.ts`, `src/clientes/cliente-dto-limites.spec.ts`, `package-lock.json`.
- Documentación: este informe y `docs/CONTEXTO_MAESTRO.md`.

## Recomendación

- **GO para revisar e integrar esta rama** cuando el CI de su SHA final esté verde: los cambios son acotados, tienen pruebas y no tocan esquema, migraciones, cálculo fiscal ni contingencia.
- **NO-GO para afirmar que la aplicación es fácil de usar para todos los perfiles:** falta la validación con usuarios reales y quedan abiertos P-01 a P-09.
- **El NO-GO general de producción y el de la contingencia PWA no cambian** con este trabajo.
