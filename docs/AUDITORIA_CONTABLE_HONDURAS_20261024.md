# Auditoría contable de Jowa System — Honduras

Fecha: 2026-10-24 UTC. Rama: `feat/contabilidad-honduras`. Base recibida: `c9a2a376a85ed2ad580a9c77ac6071a979e20308`. Continuidad remota detectada: `74f455dee5cae8e68b2ed03400790876debd3807` (reordenación de migraciones y documentación de Planck; se conserva íntegra). Entrega en [PR #180](https://github.com/Nelosama/FerreSystem/pull/180), donde se registra el SHA final publicado.

**Dictamen: NO MERGE para el objetivo de contabilidad completa de una ferretería hondureña.** La fase 1 manual está operativa en los recorridos verificados; faltan estados financieros, contabilización automática persistente y validación fiscal profesional. No se presenta la balanza como estado financiero ni el resumen de ISV como declaración.

## Alcance y coordinación

Se conservó la rama y el PR existentes, sin integrar otras ramas. [Aviso para Planck](https://github.com/Nelosama/FerreSystem/pull/180#issuecomment-6379612180): cambios restringidos al módulo contable y sus pruebas. Esta auditoría no modificó autenticación, recuperación de contraseñas, POS, operaciones de caja/inventario/CxC/CxP, `schema.prisma`, migraciones, dependencias ni configuración de despliegue. El añadido al contexto maestro es solo una sección de estado; Planck debe conservarla junto con las bitácoras de las otras ramas. No se hizo merge, force push, eliminación de ramas, despliegue ni acceso a una base productiva.

Las migraciones existentes se aplicaron exclusivamente a clústeres efímeros PostgreSQL 17.11 en loopback. La propuesta `backend/prisma/propuestas/contabilidad-asientos-automaticos/` permanece sin aplicar. No se convierte en migración durante la consolidación de Planck.

## Funcionalidades operativas verificadas

| Área | Resultado y límites |
|---|---|
| Catálogo de cuentas | Por empresa; códigos únicos, tipo y naturaleza, relación padre/hijo, cuenta con movimientos no puede convertirse en grupo; cuenta de grupo no recibe asientos. El catálogo lo define el contador: no hay plan hondureño oficial precargado. |
| Libro diario | Alta manual con al menos dos líneas, debe/haber excluyentes, importes positivos, cuadre exacto y numeración por empresa. Se rechazan cuentas ajenas, inactivas o de grupo. Los asientos y líneas no se actualizan por la API. |
| Reversiones | Generan un asiento inverso ligado al original, con motivo y usuario. Se rechazan segunda reversión, reversión de una reversión y fecha anterior al original. No borran operaciones comerciales. |
| Libro mayor | Saldo inicial, movimientos y saldo final según naturaleza; incluye el asiento original y su reversión para conservar el efecto por fecha. Aislamiento de cuentas y exportaciones. |
| Balanza de comprobación | Saldo anterior, debe/haber del mes, saldo acumulado y cuadre. Su saldo CxC/CxP concilia en la jornada cuando el contador registra los asientos correspondientes. No verifica automáticamente que todas las operaciones hayan sido contabilizadas. |
| Libros fiscales | Leen ventas/compras reales y documentos registrados por período; operaciones sin factura quedan informadas aparte. Notas de crédito restan; documentos anulados no suman. Fechas de operación en zona del negocio. |
| ISV y retenciones | Tasa/base/vigencia configuradas por empresa; cálculo y alertas en centavos. No se añadió ni cambió ninguna tasa fiscal. Retenciones efectuadas exigen configuración de agente; sufridas y efectuadas respetan la dirección del documento. |
| Cierre y reapertura | Congelan escrituras con fecha en el período; huella de libros fiscales detecta cambios posteriores; reapertura solo ADMIN y con motivo. El cierre puede conservar pendientes de conciliación: no equivale a aprobación profesional. |
| Exportación y trazabilidad | Excel/CSV/PDF autorizados; XLSX y pantalla usan las mismas consultas. Descargas auditadas; correcciones/reversiones guardan motivo, actor y anterior/nuevo. Neutralización de fórmulas en datos exportados. |
| Permisos | Módulo opt-in apagado por defecto. ADMIN y CONTADOR con permisos; CONTADOR nuevo recibe solo `contabilidad.ver`. API y navegador rechazan operaciones de venta, caja, cobros y gestión de usuarios del contador lector. |
| Aislamiento | Pruebas HTTP de empresas A/B, cuentas y documentos cruzados, descargas y restricciones de BD. La empresa sin módulo recibe 403; referencias ajenas reciben 404/rechazo. |
| Estados financieros | **No implementados:** balance general, estado de resultados, flujo de efectivo y cierre anual. No hay endpoint ni pantalla que los entregue. |

Código revisado: `backend/src/contabilidad/{contabilidad.controller.ts,contabilidad.dto.ts,contabilidad.service.ts,libros.ts,fiscal-hn.ts,reportes.ts,motor/}`; interfaz `frontend/src/pages/ContabilidadPage.tsx`; reglas operativas consultadas sin cambios en ventas y operaciones.

## Defectos reproducidos y corregidos

| ID | Antes | Corrección y evidencia |
|---|---|---|
| AC-01 | Alta de notas de crédito controlaba el acumulado; corrección no. Con factura base 1000 y notas 100 + 800, corregir la primera a 300 devolvía 201. También se podía bajar el original por debajo de sus notas. | Misma validación acumulada para alta/corrección, dentro de la transacción y bloqueo por empresa. Excluye la propia nota y las anuladas. 400 con rollback; casos EMITIDO/RECIBIDO, máximo exacto, nota anulada y tenant ajeno en integración. |
| AC-02 | Cualquier nota vigente conciliaba todas las devoluciones de la venta, aun por importe insuficiente o fecha posterior al mes consultado. | Cobertura acumulada hasta el último día del período. Devoluciones 115 + 230 con nota 115 siguen pendientes; nota 230 de octubre no sanea septiembre ni cambia su huella. Al corregir su fecha tras reabrir, la cobertura 345 concilia. El código existente `DEVOLUCION_SIN_NOTA_CREDITO` también expresa cobertura insuficiente; Excel lo aclara. |
| AC-03 | Porcentaje sobre base `99999999999990` centavos al 15 % entregaba `14999999999998`, un centavo menos. El motor de costos también perdía un centavo en productos grandes. | Producto/división en `BigInt`, misma regla de mitad hacia arriba: porcentaje `14999999999999`; costo `99999999999999 × 251 / 100` redondea a `250999999999997`. Regresiones puras de porcentaje, retención y costo/devolución; el ejemplo de costo prueba el motor inactivo, no persistencia fuera del límite de columna. Sin modificar aritmética compartida del POS. |
| AC-04 | El adaptador del motor redondeaba números con `toFixed(2)`; `1.005` podía convertirse silenciosamente en 100 centavos. | Conserva los decimales de entrada, rechaza fracciones significativas de más de dos decimales y convierte decimales a centavos con `BigInt`. |
| AC-05 | La entrada contable no acotaba importes a sus columnas `DECIMAL(14,2)` ni el total del documento a esa capacidad. Un exceso llegaba al error SQL. | Límites en DTO y validación de total antes de escribir; sumas de asiento fuera del rango de enteros seguros se rechazan. Prueba HTTP de importes/totales fuera de rango y 184 líneas, sin documentos/asientos parciales. Es un límite de almacenamiento, no una regla fiscal. |
| AC-06 | El motor podía declarar cuadrado un asiento cuyo debe excedía al haber en un centavo si ambos acumulados perdían precisión. | `validarCuadre` rechaza acumulados fuera del rango exacto; prueba roja/verde con líneas individualmente seguras. El motor sigue sin conexión a operaciones ni rutas. |

Evidencia roja conservada en los resultados de ejecución: dos fallos iniciales de precisión/adaptadores; tres fallos HTTP reales por notas/cobertura; dos fallos adicionales de rango/cuadre y un fallo de costo por cantidad. Las nuevas regresiones pasan tras las correcciones. La primera instalación contenía un cliente Prisma de otra rama: se regeneró desde el esquema existente; frontend requirió `npm ci` con su lockfile existente. No se cambiaron paquetes ni lockfiles. Los errores de preparación de fixtures no se atribuyen al producto.

## Jornada real y conciliaciones

`backend/test/contabilidad.postgres.integration.ts` añade una jornada contra HTTP NestJS, servicios y PostgreSQL reales. Solo la identidad JWT se sustituye en esta suite; los guards de módulo/tenant/rol/permiso y las escrituras son reales. La validación adicional de navegador usa JWT, API compilada y PostgreSQL reales, sin mocks.

1. Compra de 10 unidades a L 50, ISV L 75; recepción de las 10 unidades.
2. Venta al contado de una unidad por L 115; crédito de dos unidades, descuento L 10, base L 190, ISV L 28.50, total L 218.50.
3. Abono CxC de L 50.01 y pago CxP de L 100.01, con reintento de cada solicitud: un solo efecto operativo.
4. Compra al contado adicional de L 57.50: saldo CxP cero, sin recepción automática.
5. Registro fiscal desde las operaciones y asientos manuales de compra, ventas y pagos. Balanza: CxC **L 168.49**, CxP **L 474.99**; existencias **7 unidades**. ISV de trabajo: débito L 43.50, crédito L 82.50, diferencia a favor L 39.00, sin afirmar deducibilidad legal.
6. Asiento de corrección de un centavo y reversión; mayor y Excel. Comparación completa antes/después de productos, clientes, proveedores, ventas, compras, cuentas, pagos, cajas, movimientos de caja e inventario: **idénticos**. Auditoría contable atribuida al contador.

Esta jornada no es una contabilidad completa del negocio: no carga apertura, costo de ventas ni el asiento de la segunda compra, deliberadamente. Comprueba tanto la conciliación de los movimientos registrados como que la API no inventa asientos para las operaciones pendientes.

## Qué es automático y qué requiere trabajo manual

| Operación | Auxiliar operativo existente | Asiento de partida doble persistente |
|---|---|---|
| Venta contado/crédito | Venta, caja según método, CxC/saldo cliente en crédito; inventario/reservas según entrega | **Manual** |
| Compra crédito/contado | Factura y CxP; contado registra su pago; inventario aumenta al recibir | **Manual**, con criterio de reconocimiento por aprobar |
| Cobro y pago parcial | Pago idempotente y disminución de saldo; cobro CxC afecta caja, pago proveedor no afecta caja POS | **Manual** |
| Devolución | Cancelación de crédito/reembolso y tratamiento de inventario según flujo operativo autorizado | **Manual**, más nota de crédito fiscal registrada aparte |
| Costo de ventas, ajustes de existencias y caja | Movimiento operativo correspondiente | **Manual** |
| Documento fiscal / retención | Registro manual; puede tomar importes de venta/compra y calcular retención desde una regla | **No genera asiento** |
| Reversión contable | No modifica auxiliares | Asiento inverso generado al confirmar la acción manual |
| Consultar libros/mayor/balanza/Excel | Recalcula lecturas; registra auditoría de descarga | No contabiliza operaciones |

El motor puro calcula propuestas para ventas/costos/CxC/CxP/compras/recepciones/devoluciones, pero **ninguna de esas propuestas se persiste automáticamente**. El vínculo estructurado de origen, mapeos, lotes y prevención de doble contabilización está en la propuesta de esquema, pendiente de consolidación/autorización con Planck y NEXUS. El concepto y la auditoría de un asiento manual no sustituyen ese vínculo; ante respuesta incierta debe revisarse el diario antes de repetirlo.

## Pruebas ejecutadas

| Verificación local | Resultado |
|---|---|
| Backend unitario completo | **679/679**, 65 archivos; línea base 676/676 |
| Backend build y lint | Correctos, avisos heredados de configuración/otros archivos |
| Contabilidad PostgreSQL dirigida | **31/31**, incluye cinco casos nuevos respecto a la suite de 26 |
| PostgreSQL completo | **1124 aprobadas / 1 omitida opt-in / 0 fallidas**, 66 archivos, tras conservar `74f455de`; pasada anterior: 1123/1/0 |
| E2E backend (servicio, BD y arranque) | **6/6** |
| Scripts backend | **51/51** |
| Frontend unitario completo | **544/544** |
| Frontend tipos, build y lint | Correctos; avisos heredados |
| Playwright contable con backend simulado | **16/16** |
| Playwright real, API compilada y PostgreSQL | **14/14**: Contabilidad 7, CxC/CxP 6, precisión POS 1 (cinco vectores monetarios) |
| Prisma en piloto real, repetido tras `74f455de` | `migrate deploy` y `migrate diff --exit-code`: correctos, sin deriva |
| Guard de migraciones frente a la base recibida | Correcto; cero migraciones nuevas de esta auditoría |

Entorno: Node 24, PostgreSQL 17.11, Chromium 151.0.7922.173 del entorno (distinto del navegador oficial de CI). No se ejecutó el piloto general completo ni toda la suite de navegador: se seleccionaron los recorridos relacionados con contabilidad y sus auxiliares. CI del nuevo SHA se consulta en el PR; no se atribuyen los checks anteriores a esta entrega.

Comandos reproducibles (usar un `PG_BIN` instalado; el arnés siempre crea bases temporales):

```bash
cd backend
npx prisma generate
npm test -- --reporter=dot
npm run build
npm run lint
PG_BIN=/ruta/postgresql/bin npm run test:integration
PG_BIN=/ruta/postgresql/bin npm run test:e2e
npm run test:scripts
cd ../frontend
npm ci
npm test
VITE_API_URL=/api npm run build
npm run lint
CI=true PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/ruta/chromium npm run test:browser -- e2e/contabilidad-simulado.spec.ts --workers=2
PG_BIN=/ruta/postgresql/bin PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/ruta/chromium npm run test:e2e-real -- contabilidad-real.spec.ts balance-real.spec.ts precision-monetaria-real.spec.ts
```

## Limitaciones y revisión del contador hondureño

- Estados financieros y cierre anual faltan; definir clasificación, tratamiento de resultados y aperturas antes de implementarlos. Una balanza cuadrada no acredita integridad ni exactitud fiscal.
- Asientos automáticos persistentes sin implementar. Requieren mapeos, origen e idempotencia, aprobación del criterio contable y esquema consolidado por Planck/NEXUS. No hay pantalla funcional «Por contabilizar».
- Validar profesionalmente las tasas aplicables por producto, exentos/exonerados, tasas especiales, acreditación del ISV de compras, retenciones por actividad/agente, tipos de documento, RTN/CAI, leyendas, redondeo y plazos. Lista normativa previa: [CONTABILIDAD_HONDURAS.md §11](CONTABILIDAD_HONDURAS.md#11-parámetros-fiscales-que-requieren-validación-externa-sin-cambios-de-cálculo). No se ha obtenido una validación oficial nueva.
- El POS sigue con su cálculo general del 15 %; el módulo contable configurable no cambia el POS ni habilita ventas exentas/especiales. No emitir ni certificar facturas fiscales desde el POS con esta entrega.
- El catálogo admite distintos tipos documentales; su efecto en los libros debe revisarse para cada caso. No se certifica que registrar comprobantes de retención/donación como documentos ordinarios tenga el tratamiento fiscal correcto; la retención tiene su registro específico.
- Cobertura de notas por **venta/factura**, no asignación individual a cada devolución. Puede haber notas por otros ajustes; la cobertura monetaria no certifica causalidad, reparto de base/ISV ni aceptación del SAR. No se alteró la devolución operativa.
- La huella de cierre es fiscal, no un cierre anual ni una conciliación automática entre diario y todos los auxiliares. Un pendiente puede coexistir con un período cerrado. Los cierres históricos que antes ocultaban cobertura insuficiente pueden mostrar un cambio de huella al corregirse ese diagnóstico: revisar el caso, no regenerar huellas automáticamente.
- Los límites de escritura se validan, pero los reportes siguen usando números/centavos seguros de JavaScript; no se certifican acumulados que excedan su capacidad exacta.
- No se probaron Safari/iPhone físicos, impresoras, documentos reales de un cliente ni producción. La emulación móvil Chromium no equivale a un dispositivo físico. Esta revisión no certifica la integración futura con las ramas de Planck ni reutiliza CI de un SHA anterior.

## Entrega a Planck y decisión

Conservar las correcciones y nuevas pruebas de Contabilidad del PR #180. La sección añadida al contexto maestro es el único cambio documental compartido; no sustituir las bitácoras de otras ramas. Repetir la matriz contable tras consolidar navegación, permisos y migraciones. El README de la propuesta de asientos aún menciona los nombres anteriores de migración; se deja para la actualización documental de Planck (el SQL de la propuesta ya conserva sus referencias corregidas). No activar las propuestas de esquema por copiar sus archivos.

**NO MERGE para presentar el objetivo como un módulo contable completo listo para operar sin registros manuales.** El PR queda en borrador para revisión técnica y profesional. La fase 1 manual puede revisarse con datos de prueba; su adopción acotada exige decisión expresa del responsable y validación del contador. No se ha fusionado ni publicado en producción.

**NEXUS:** firma la evidencia de integridad y pruebas sobre PostgreSQL temporal; cero cambios de esquema/migraciones en esta auditoría.
