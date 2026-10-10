# Auditoría QA independiente de Inventario — 2026-10-10

**Veredicto: no declarar Inventario al 100 % para entrega.** Hay **1 P0, 2 P1 y 1 P2 confirmados**; ningún P3 nuevo confirmado. No se corrigió código de producción.

Base: `origin/main` **b314ef0ecf2820c57b525d157918413b2972544f**. Rama local: `audit/inventario-independent-20261010`. Leídos `AGENTS.md` y contexto vigente. Revisados PR #100/#101/#102/#105, todos fusionados. GitHub consultado al inicio y nuevamente al cerrar: sin PR abiertos; main no cambió. No se intervino la rama de Claude, no se hizo push, PR, merge, despliegue ni consulta a producción.

## 1. Matriz de funcionalidades auditadas

| Funcionalidad | Evidencia ejecutada / resultado | Límite |
|---|---|---|
| Alta con código y sin código; código automático | PostgreSQL/HTTP: aprobada, incluido BODEGUERO autorizado | Idempotencia requiere `solicitudId` |
| Duplicados internos/barcode, inactivos y carrera | PostgreSQL: rechazados sin duplicar stock | Identidad mixta en conteo falla: QA-INV-003 |
| Edición parcial y formularios antiguos | PostgreSQL: protege edición vs edición y ajuste vs recepción | Aplicación/recepción no invalidan versión: QA-INV-001 |
| Desactivación/reactivación | PostgreSQL: permisos y versión aprobados | No acredita limpieza de duplicados históricos del cliente |
| Categorías, búsqueda y filtros | HTTP/BD + Chromium: aprobados, categoría real y descripción | Sin medición de latencia sobre catálogo grande |
| Variantes | Productos separados con códigos/stock independientes: aprobados | No existe modelo de variantes relacionadas |
| Unidad, precios, costos, mínimo y decimales | Persistencia, validaciones y protección de unidad con historial: aprobadas | Sin conversiones de unidades; ver costo concurrente |
| Inventario inicial y movimientos | Movimiento INICIAL, cantidades/usuario/motivo y lectura BD: aprobados | No se revisaron datos del cliente |
| Crear, guardar, cerrar/reanudar y modificar conteo | HTTP y Chromium: aprobados; reintentos persistentes | Navegador usa APIs simuladas; no es una prueba UI→BD completa |
| Detectar diferencias y revisar/aplicar | Preview, token obsoleto, reservas, aplicación/reintento: aprobados | Conciliación obsoleta y mixta fallan: QA-INV-002/003 |
| Simultaneidad de empleados | Altas, ediciones, recepción/ajuste y conteos: aprobados en casos existentes | No cumple todos los órdenes: P0 confirmado |
| Reserva al facturar y descuento físico al entregar | Regresiones PostgreSQL de ventas/reservas/entregas aprobadas | No se cambiaron estas reglas |
| Última recepción, costo menor, historial y venta | Compras PostgreSQL: aprobadas, secuencia 45→60→40 | Edición antigua deja dos costos distintos: QA-INV-001B |
| Permisos y multi-tenant | PostgreSQL/HTTP: aislamiento, roles y escrituras ajenas aprobados | No constituye prueba exhaustiva de toda revocación concurrente |
| Escáner EAN-13/EAN-8/UPC-A/CODE-128 | ZXing real sobre imágenes sintéticas: aprobados | No acredita cámara óptica ni etiquetas impresas |
| Repetición, permiso denegado, cierre y manual | Unitarias del lector + Chromium: aprobados | Hardware pendiente; cambio de cámara no implementado |
| Fotografías locales | Revisión estática: solo referencia `imagenUrl`; inventario sin foto aprobado | No existe servidor local que permita auditar acceso/LAN/HTTPS |
| TOPNAV/SIDEBAR y móvil; ES/EN | Chromium: navegación, alta/edición, errores y ancho 390 px aprobados | No demuestra traducción exhaustiva de todos los textos/datos |

## 2. Pruebas ejecutadas y resultados

| Grupo | Casos únicos | Resultado |
|---|---:|---|
| Unitarias backend | 326 | 326 aprobados |
| Scripts backend | 13 | 13 aprobados |
| PostgreSQL existente | 221 | 221 aprobados |
| Reproducciones PostgreSQL nuevas | 4 | 4 reproducen el defecto esperado |
| Frontend unitarias | 163 | 163 aprobados |
| Chromium existente, APIs simuladas | 93 | 93 aprobados |
| Chromium nueva, evidencia UX | 1 | 1 reproduce UUID visible |
| WebKit, iPhone emulado, APIs simuladas | 23 | 23 aprobados; no cámara física |

**839 casos de regresión aprobados + 5 reproducciones confirmadas = 844 casos únicos con aserciones completadas.** Las cinco reproducciones afirman el comportamiento defectuoso actual; que pasen no significa que los defectos estén corregidos. No se suman las repeticiones de los mismos casos.

El log de integración completa contiene **224/224, 11 archivos**: 221 existentes + 3 reproducciones iniciales. La ejecución final específica contiene **4/4**, incluyendo las mismas tres y el caso adicional de recepción/costo. Por eso la cobertura PostgreSQL única es 225, no 228.

Backend Nest build y frontend TypeScript/Vite build: aprobados. Primer intento de build frontend con URL HTTP local fue rechazado por la configuración de build; se corrigió la configuración de prueba a `https://api.example.test/api` y pasó. Ese dominio ficticio se intercepta en Playwright: no se consultó un backend externo. No se ejecutó lint en esta auditoría.

PostgreSQL **17.11**, binarios Debian extraídos en `/workspace/qa-tools`, usuario `agent` sin root. Cada suite crea su propio clúster temporal en loopback y elimina los datos. No utiliza una DATABASE_URL externa. Suites de migraciones/ventas/crédito ejecutan migraciones; el arnés de las nuevas reproducciones genera DDL desde el esquema Prisma, igual que la suite HTTP existente. No acredita migraciones sobre una copia con datos históricos.

WebKit inicialmente no inició por bibliotecas ausentes. Se extrajeron paquetes Debian en una carpeta local y se enlazaron sus bibliotecas en el directorio del navegador. El comprobador automático siguió sin reconocer libGLES local; con `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1` el navegador realmente inició y terminó **23/23 en 53 segundos**. Se conserva tanto el fallo de entorno como la ejecución final. No se alteró código del navegador ni del producto; solo se resolvieron dependencias locales. APIs y cámara simuladas; ninguna afirmación sobre iPhone físico.

Evidencia completa en [qa-inventario-20261010](qa-inventario-20261010/), logs y captura. No se reutilizan como propios los resultados declarados por PR anteriores.

## 3. Defectos confirmados

### QA-INV-002 — P0: conciliación obsoleta elimina una corrección reciente y permite aplicar un stock no revisado

**Endpoint:** `POST /api/levantamientos/:id/conciliar`.
**Archivo:** `backend/src/levantamientos/levantamientos.service.ts:216`; DTO `ConciliarItemDto`; frontend `LevantamientoPage.tsx:75`.

**Reproducción:**
1. En un levantamiento, ADMIN registra el producto con cantidad 3 y BODEGUERO registra el mismo con 4; ambos quedan en conflicto.
2. ADMIN consulta conflictos y ve 3 y 4.
3. BODEGUERO modifica su conteo de 4 a 12 mediante PATCH con versión válida.
4. ADMIN envía la conciliación desde su pantalla antigua: `{mantenerItemId: <conteo de 3>}`.
5. Finalizar, generar preview y aplicar.

**Esperado:** rechazar con 409 porque cambió un conteo implicado; recargar y pedir revisar 3 contra 12 antes de eliminar/aplicar.
**Real:** HTTP 201; elimina la fila actual de 12 y permite aplicar 3 a `productos.stock_actual`. No exige versiones del grupo. La auditoría de eliminación registra motivo e ID conservado, pero no el snapshot eliminado. El valor 12 puede rastrearse en auditorías previas de edición; ello no evita la aceptación silenciosa de una decisión obsoleta.

**Evidencia:** reproducción PostgreSQL `QA-INV-002`, aserciones sobre GET de conflictos, PATCH, POST, fila eliminada y stock final 3. Se reportó inmediatamente durante la auditoría.
**Prueba:** `backend/test/auditoria-inventario.postgres.integration.ts:113`.
**Recomendación:** token o versiones de todos los conteos del conflicto; validarlos bajo el bloqueo antes de eliminar. Registrar snapshot completo de los descartados. Mantener el flujo explícito de elección del administrador.

### QA-INV-001 — P1: escrituras de levantamiento/recepción no invalidan formularios antiguos del catálogo

**Endpoints:** `POST /levantamientos/:id/aplicar`, recepción de compra y `PUT /productos/:id`.
**Archivos:** `levantamientos.service.ts:388`, `operaciones.service.ts:76`, `productos.service.ts:61`.

**Reproducción A:**
1. Leer producto con versión 1 y precio de venta 4.
2. Aplicar un levantamiento del mismo producto, con stock 8 y precio de venta 9.
3. Enviar desde un formulario abierto antes `{version:1, precioVenta:5}`.

**Esperado:** versión obsoleta, 409; conservar el precio recién aplicado hasta revisión.
**Real:** aplicar deja versión 1; PUT antiguo responde 200 y reemplaza 9 por 5 sin detectar el cambio concurrente.

**Reproducción B:**
1. Leer producto con costo 2 y versión 1.
2. Registrar y recibir compra de 5 unidades a costo 6 mediante el servicio real.
3. Enviar el cambio de costo preparado antes `{version:1, precioCosto:3}`.

**Real:** HTTP 200; `precioCosto=3`, `costoVigente=6`, stock 13 e historial de una compra conservado. La recepción dejó la versión en 1. No es una denuncia del permiso manual existente: el defecto es que el formulario anterior sigue siendo válido frente a un cambio que no vio. La divergencia entre columnas de costo ya estaba documentada como riesgo de negocio; aquí se confirma además la carrera por versión ausente.

**Evidencia/pruebas:** `QA-INV-001` y `QA-INV-001B`, líneas 102 y 140 de la reproducción PostgreSQL.
**Recomendación:** definir qué escrituras invalidan el formulario e incrementar versión al aplicar y al cambiar costo por recepción; preservar `stockAnterior`. Resolver explícitamente cómo se representan las excepciones manuales de costo, sin restringir permisos ni cambiar reglas sin autorización.

### QA-INV-003 — P1: identidad mixta rompe agrupación/limpieza de conflictos

**Endpoints:** GET conflictos, PATCH item y POST conciliar.
**Archivo:** `levantamientos.service.ts:198`, `:262`; detección inicial `coincidencias()`.

**Reproducción:**
1. ADMIN cuenta el producto existente con `productoId` y barcode `001234`.
2. BODEGUERO cuenta el mismo barcode sin `productoId`.
3. Consultar conflictos: aparecen dos grupos de una sola fila.
4. BODEGUERO edita solo su cantidad con versión válida.
5. Intentar conciliar y consultar preview.

**Esperado:** ambos registros mantienen un único conflicto conciliable del mismo producto, también después de editar.
**Real:** la detección usa coincidencia por cualquiera de ID/código/barcode, pero agrupación y limpieza usan una clave preferente distinta. Tras editar, limpia `conflicto` en ambos. Conciliar responde 404 «Ítem en conflicto no encontrado»; preview sigue detectando conteo duplicado. La operación exige recuperación manual eliminando/corrigiendo filas.

**Evidencia/prueba:** `QA-INV-003`, PostgreSQL, línea 127: dos grupos, banderas falsas, 404 y duplicado en preview.
**Recomendación:** usar la misma identidad canónica o grafo de coincidencias para detección, agrupación, conciliación y limpieza. No limpiar conflictos basándose únicamente en el tamaño de grupos con claves incompatibles.

### QA-INV-004 — P2: conciliación muestra UUID en lugar del nombre del empleado

**Pantalla:** Levantamiento → Conflictos pendientes de conciliar; columnas «Usuario» y «Contador».
**Archivo:** `frontend/src/pages/LevantamientoPage.tsx:120`; respuesta de conflictos no resuelve nombre.

**Reproducción:** abrir un levantamiento con conflicto; leer columna Usuario.
**Esperado:** identificar a los empleados por nombre para revisar con ellos qué conteo conservar; mantener ID para trazabilidad interna.
**Real:** muestra `ce4833d4-b09c-4eb3-a233-271a10211640`. Un empleado nuevo no puede relacionarlo con su compañero desde esa pantalla.
**Evidencia:** [captura Chromium](qa-inventario-20261010/qa-conflictos-uuid.png), inspeccionada visualmente; prueba `frontend/e2e/auditoria-inventario.spec.ts:154`. API simulada, render real del bundle; el uso del UUID se confirma también en código y en la forma de la respuesta real PostgreSQL.
**Recomendación:** resolver nombre del contador dentro del tenant y mostrarlo junto al ID cuando sea necesario. No requiere un rediseño general.

## 4. Reproducciones PostgreSQL y comandos

Desde `backend`, tras `npm ci` y `npx prisma generate`:

```bash
PG_BIN=/workspace/qa-tools/pg-deb/usr/lib/postgresql/17/bin npm run test:integration
PG_BIN=/workspace/qa-tools/pg-deb/usr/lib/postgresql/17/bin npx vitest run --config vitest.config.integration.ts test/auditoria-inventario.postgres.integration.ts
npm test
npm run test:scripts
npm run build
```

Usar otro `PG_BIN` donde PostgreSQL esté instalado. Ejecutar como usuario no root. El test crea la base temporal; no proporcionar una URL de producción.

Desde `frontend`:

```bash
npm ci
npm test
VITE_API_URL=https://api.example.test/api npm run build
npx playwright install chromium webkit
npm run test:browser -- --workers=2
npx playwright test e2e/auditoria-inventario.spec.ts --workers=1
PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 npx playwright test --config playwright.inventory-webkit.config.ts
```

El último comando presupone las bibliotecas WebKit disponibles; en este entorno se proporcionaron localmente como se describe arriba. Las pruebas nuevas son reproducciones observacionales del defecto actual: después de autorizar corrección deben cambiar a aserciones del contrato esperado (409 o agrupación/nombre correctos).

## 5. Concurrencia, seguridad y permisos

`lockTenant` serializa operaciones principales; versiones detectan ediciones simultáneas y `stockAnterior` protege ajustes frente a cambios físicos. Reintentos de alta/conteo/recepción/aplicación existentes, sobreventa decimal y rollback tras fallo de auditoría pasan. Estas protecciones no solucionan decisiones basadas en snapshots obsoletos si el endpoint no los valida: QA-INV-002 es el caso crítico.

No se confirmó acceso entre empresas en los casos ejecutados. Categoría/producto ajenos y escrituras fuera del tenant son rechazados. ADMIN aplica y concilia; CAJERO no registra productos/conteos y BODEGUERO requiere permiso. Costo manual ADMIN/BODEGUERO se conserva y queda auditado; no se recomienda modificarlo como parte de una corrección técnica sin decisión de negocio.

Pendiente: prueba dedicada de venta que reserve durante conteo y entrega que ocurra con **ese formulario UI** abierto, con dos empleados distintos y todos los órdenes. Existen regresiones de venta/reserva/entrega y token/stock obsoleto, pero no se ejecutó una nueva prueba que reúna ese escenario completo. Tampoco se probó revocación durante espera para cada endpoint del levantamiento.

## 6. Observaciones UX/UI concretas

- Alta/edición: Chromium confirma doble clic bloqueado, conservación tras error de red, reintento después de recarga, error de barcode, motivo de ajuste y móvil 390 px. Mensajes de versión/stock conducen a recarga.
- Conciliación: defecto UUID confirmado; los grupos individuales de QA-INV-003 impiden entender qué filas pertenecen al mismo conflicto.
- Conciliación abierta: el botón conserva una cantidad que puede haber cambiado; QA-INV-002 acredita el impacto real en BD. Falta validación al confirmar, no solo refresco visual.
- SIDEBAR/TOPNAV y ES/EN: navegación y alta pasaron en Chromium. No hay fundamento para un rediseño general. Estados técnicos como `EN_PROGRESO` y datos/mensajes del backend no equivalen a traducción exhaustiva.
- Cámara: pide cámara trasera mediante `facingMode: ideal environment`; no hay selector ni `deviceId`/`enumerateDevices` para cambiar cámara. Se registra como capacidad no implementada/verificada, sin fingir que pasó una prueba de cambio.

## 7. Fotografías y funcionalidades no verificadas

No hay arquitectura de servidor de fotos locales implementada que auditar. Se inspeccionaron referencia `imagenUrl`, formulario y rutas relevantes; no se encontró carga binaria a Supabase, Vercel o Render en ese flujo. Eso no certifica infraestructura futura ni impide que un usuario escriba una URL de imagen externa. Las fotos son opcionales y la operación sin foto pasa.

No verificables todavía: acceso autenticado al servidor de PC principal, denegación de rutas arbitrarias/path traversal, visualización desde otra caja en LAN, servidor desconectado, captura/retención/borrado y HTTPS confiable desde iPhone. No se implementó servidor paralelo.

Pendientes adicionales: rendimiento con catálogo/historial grande, importador masivo como flujo propio completo, migración sobre copia de datos históricos, variantes relacionadas/conversiones/lotes/series/vencimientos, sucursales reales (stock actual por empresa/producto), aceptación del empleado cliente. Sin pruebas sobre producción.

## 8. Hardware físico pendiente

En iPhone real del cliente: Safari/versión iOS, HTTPS y certificado confiable de LAN, permisos aceptados/denegados/revocados, cámara trasera/frontal y eventual selección, etiquetas impresas EAN-13/EAN-8/UPC-A/CODE-128, brillo/enfoque/reflejos, lecturas repetidas, cámara ocupada/no disponible, cierre/regreso y captura manual. En PC principal y caja: acceso compartido a fotos y operación con servicio apagado, cuando exista arquitectura. Las imágenes sintéticas y la emulación no sustituyen estas pruebas.

## 9. Prioridades recomendadas

1. Corregir QA-INV-002 y verificar que una conciliación antigua nunca elimina/aplica conteos actualizados sin revisión.
2. Corregir identidad de conflictos QA-INV-003.
3. Corregir invalidación de versiones QA-INV-001/A/B y probar recepción/aplicación contra formulario antiguo, conservando reglas de costo y stock.
4. Mostrar nombre del contador QA-INV-004.
5. Completar la integración conjunta de conteo/reserva/entrega, pruebas físicas del cliente.
6. Auditar fotografías locales cuando Claude publique implementación; definir aceptación y alcance de sucursales/variantes sin inventar funcionalidades.

## ¿QUÉ IMPIDE DECLARAR INVENTARIO AL 100 %?

**Implementación:** existen defectos confirmados en conciliación y concurrencia del catálogo. Fotografías locales y cambio de cámara no tienen implementación verificable; variantes relacionadas y sucursales no están implementadas. Deben aceptarse explícitamente como fuera de alcance o completarse antes de prometerlas.

**Cobertura de pruebas:** las regresiones actuales pasan pero omiten los escenarios que reprodujeron los defectos. WebKit pasó con APIs simuladas y no acredita cámara real. Falta recorrido completo UI→backend→PostgreSQL con varios empleados y reserva/entrega durante el conteo; faltan volumen y datos históricos aislados.

**Aceptación real del cliente:** no hay prueba de cámara/iPhone, fotografías/LAN/HTTPS ni operación supervisada por empleados con etiquetas y unidades del negocio. Tests aprobados no equivalen a esa aceptación.

Se entrega evidencia para autorizar correcciones específicas. No se implementó ninguna corrección.
