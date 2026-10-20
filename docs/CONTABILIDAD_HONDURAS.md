# Contabilidad y Control Tributario — Honduras (fase 1)

Rama `feat/contabilidad-honduras`. Estado: implementado y probado localmente; **sin merge, sin despliegue, sin migraciones aplicadas en producción**. Revisión de esquema firmada por **NEXUS** (sección 8).

## 1. Alcance de la fase 1

| Objetivo | Implementado |
|---|---|
| Rol CONTADOR asignable por empresa | Enum `Rol` + migración `20261020000000_rol_contador`. Lo asignan ADMIN (Usuarios) y Super Admin (detalle del negocio). |
| Módulo para ADMIN y CONTADOR con permisos | Módulo opcional `contabilidad` (apagado sin registro explícito). Permisos `contabilidad.ver`, `.registrar`, `.configurar`, `.cerrar_periodo`; reabrir período solo ADMIN. |
| Libros fiscales de ventas y compras sobre operaciones reales | `GET /contabilidad/libros/ventas|compras`: se leen de `ventas`, `devoluciones` y `ordenes_compra`, más los documentos fiscales que las respaldan. Nada se copia. |
| ISV, retenciones, RTN, CAI, documentos fiscales y períodos | Tasas con vigencia, reglas de retención con vigencia y base legal, validación de RTN (14 dígitos), CAI por establecimiento/punto/tipo/rango/fecha límite, documentos emitidos y recibidos, notas de crédito/débito, períodos mensuales con cierre y huella. |
| Conciliaciones, exportaciones y trazabilidad | `GET /contabilidad/conciliacion` (26 hallazgos tipificados), exportación CSV/Excel/PDF generada en el servidor, bitácora `fiscal_ajustes` de solo inserción. |
| Partida doble extensible | Catálogo jerárquico, asientos con cuadre obligatorio (servicio + disparador diferido), reversión en lugar de borrado, libro diario y balanza. |
| Configuración fiscal por tenant con vigencia temporal | `fiscal_configuraciones`, `fiscal_tasas`, `fiscal_reglas_retencion`; sin solapes (servicio + disparador). |
| Evitar duplicar POS, compras, CXC, CXP e inventario | Los libros recalculan desde la operación. Las tablas nuevas guardan solo lo que la operación no tiene (CAI, numeración, desglose del documento, retenciones, cierres, ajustes, asientos). |
| CONTADOR no modifica ventas, cobros, inventario ni caja | Ninguna ruta de escritura fuera de Contabilidad admite su rol (auditoría estática de todas las rutas) y los servicios lo rechazan también (`authorizedActor`). |
| No afectar operación ni producción | Módulo apagado por defecto; migraciones aditivas; ninguna ruta, regla o cálculo existente cambia. |

## 2. Normativa consultada y reglas NO inventadas

El sitio del SAR (`sar.gob.hn`) y la biblioteca del TSC no son accesibles desde este entorno (proxy 403 / DNS). Se consultaron fuentes secundarias que citan el texto oficial; **un contador debe verificar el texto vigente en La Gaceta/SAR antes del uso con clientes reales**.

| Tema | Lo que se usa | Fuente (secundaria) | Cómo se aplica |
|---|---|---|---|
| Régimen de facturación | Acuerdo 481-2017 (Gaceta 34,413) y reformas 609-2017, 725-2018, 817-2018 | Resumen del reglamento en el proyecto `invoicehn` y guías de facturación CAI | Formato de documentos, CAI, rango y fecha límite. |
| Correlativo | `NNN-NNN-NN-NNNNNNNN` (establecimiento, punto de emisión, tipo, correlativo desde 00000001) | Art. 10 num. 7 según las mismas fuentes | Validado en servidor, base de datos (CHECK) y pantalla. |
| Tipos de documento | 01 Factura, 04 Recibo por honorarios, 05 Comprobante de retención, 06 Nota de crédito, 07 Nota de débito, 09 Ticket, 10 Factura prevalorada, 11 Boleta de compra, 12 Constancia de donación (tabla tras Acuerdo 609-2017) | Ídem | Catálogo cerrado `TIPOS_DOCUMENTO`. 06/07 exigen documento de referencia. |
| CAI | Serie alfanumérica sin longitud oficial publicada | Art. 4 num. 7 según las fuentes | Solo se normaliza (mayúsculas, 6–60 caracteres). No se valida estructura. |
| RTN | 14 dígitos; sin dígito verificador público | Ídem | Solo longitud y dígitos. |
| ISV | General 15 % y 18 % para ciertos bienes (Decreto 278-2013, art. 16) | Avalara, La Prensa, `invoicehn` | **No se precarga.** Cada empresa registra sus tasas con base legal y vigencia; sin tasa vigente se informa `SIN_TASA_*`. |
| Retenciones de ISV/ISR | Agentes designados (p. ej. Acuerdo DEI-215-2010, art. 8 Ley ISV; art. 50 Ley ISR) | Guías del SAR citadas en buscadores | **No se precargan porcentajes ni reglas.** El contador registra código, impuesto, porcentaje, base de cálculo, vigencia y base legal. |
| Declaraciones y plazos | ISV mensual; DMC con plazos que cambiaron en 2024 | EY, Deloitte, Commenda (versiones distintas) | **No se implementan formularios ni calendarios**: el resumen de ISV es un cálculo de trabajo con aviso explícito. |
| Facturación electrónica | Fuentes contradictorias sobre su obligatoriedad | Varias | Fuera de alcance; ver pendientes. |

## 3. Diseño de datos (migración `20261020000100_contabilidad_honduras`)

- `fiscal_configuraciones` (1 por empresa: RTN, razón social, agente de retención, zona horaria).
- `fiscal_tasas`, `fiscal_reglas_retencion`: vigencia `[desde, hasta]` sin solape (disparador `fiscal_vigencia_sin_solape`).
- `fiscal_cai`: autorización por tipo/establecimiento/punto con rango; no se solapan rangos del mismo punto y tipo.
- `fiscal_documentos`: emitidos/recibidos; FK a `ventas`, `ordenes_compra`, `fiscal_cai` y al documento de referencia; CHECK de formato, total = suma de importes, una factura vigente por venta/compra (índices parciales), numeración emitida irrepetible y recibida única por RTN del emisor; sin borrado.
- `fiscal_retenciones`: solo pueden pasar de VIGENTE a ANULADA.
- `fiscal_periodos`: sin fila = abierto; el cierre guarda totales y huella SHA-256 de los libros.
- `fiscal_ajustes`: bitácora de solo inserción con `anterior`/`nuevo`, motivo y usuario.
- `contable_cuentas`, `contable_asientos`, `contable_asiento_lineas`: cuadre por disparador diferido; líneas inmutables; asientos solo pasan a REVERTIDO.
- Aislamiento: todas las tablas llevan `tenant_id`; referencias a datos fiscales con FK compuestas `(tenant_id, id)`; referencias a `usuarios` y `ventas` por `id` más el disparador `fiscal_misma_empresa` (así la reversión de emergencia de la migración de entregas #148, que elimina las claves compuestas de esas tablas, sigue siendo ejecutable). RLS habilitado sin políticas, como el resto de tablas privadas.
- Índice aditivo `ordenes_compra_tenant_id_id_key` para la FK compuesta de compras.

## 4. Reglas de negocio aplicadas

- **Fecha fiscal de una venta:** `ocurrido_at` (contingencia) o `created_at`, en la zona del negocio (`America/Tegucigalpa` por defecto). Una venta de las 21:00 del día 30 pertenece a ese mes.
- **Libro de ventas:** documentos emitidos con fecha en el período + ventas del período sin factura vigente (se informan con `SIN_DOCUMENTO_FISCAL` y no suman). Notas de crédito restan. Ventas anuladas se muestran sin sumar.
- **Libro de compras:** documentos recibidos del período + compras registradas sin factura vigente (`SIN_DOCUMENTO_FISCAL`: su ISV no se acredita hasta registrar la factura).
- **Documento emitido:** exige un CAI activo que cubra tipo/punto/correlativo con fecha de emisión ≤ fecha límite, y que el ISV corresponda a la tasa vigente (±1 centavo). Si no, 400 con la lista de hallazgos.
- **Documento recibido:** factura exige RTN del proveedor; diferencias de ISV o total contra la compra quedan como hallazgo (no se rechaza un documento real del proveedor).
- **Importes desde la operación:** con venta/compra asociada y sin importes, se toman de la operación (no se digitan de nuevo).
- **Retenciones:** sufrida sobre documento emitido; efectuada sobre documento recibido y solo si la empresa es agente de retención; base IMPUESTO, BASE_GRAVABLE o TOTAL; porcentaje de la regla vigente; centavos con mitad hacia arriba.
- **Períodos:** solo se cierra un mes terminado; cerrado, no admite documentos, correcciones, retenciones ni asientos con fecha en él; un cambio posterior en la operación se detecta por la huella (`LIBRO_CAMBIO_TRAS_CIERRE`). Reabrir: solo ADMIN, con motivo.
- **Correcciones y anulaciones:** siempre con motivo, en `fiscal_ajustes` y en `auditoria_operaciones`.

## 5. API (`/contabilidad`, módulo `contabilidad`, roles ADMIN y CONTADOR)

Lectura (`contabilidad.ver`): `GET configuracion`, `documentos`, `retenciones`, `libros/ventas`, `libros/compras`, `resumen-isv`, `conciliacion`, `ajustes`, `periodos`, `cuentas`, `asientos`, `balanza`, `exportar/:reporte?formato=csv|xlsx|pdf` (reportes `ventas`, `compras`, `conciliacion`, `balanza`).
Configuración (`contabilidad.configurar`): `PUT configuracion`, `POST tasas`, `POST tasas/:id/cerrar-vigencia`, `POST reglas-retencion`, `POST reglas-retencion/:id/cerrar-vigencia`, `POST cai`, `POST cai/:id/desactivar`.
Registro (`contabilidad.registrar`): `POST documentos`, `documentos/:id/correccion`, `documentos/:id/anular`, `documentos/:id/retenciones`, `retenciones/:id/anular`, `cuentas`, `asientos`, `asientos/:id/revertir`.
Períodos: `POST periodos/:anio/:mes/cerrar` (`contabilidad.cerrar_periodo`), `POST periodos/:anio/:mes/reabrir` (solo ADMIN).

## 6. Pruebas

| Suite | Resultado | Archivo |
|---|---|---|
| Backend unitarias | 540/540 (19 nuevas) | `src/contabilidad/*.spec.ts` |
| Auditoría estática de rutas | Ninguna escritura fuera de Contabilidad admite CONTADOR; rutas sin `@Roles` solo de autenticación/Super Admin | `src/contabilidad/autorizacion-rutas.spec.ts` |
| PostgreSQL 16 real (contabilidad) | 14/14 | `test/contabilidad.postgres.integration.ts` |
| PostgreSQL 16 real (suite completa) | 63 archivos, 1031 pasan, 1 omitida preexistente; `test:e2e` 6/6 | `npm run test:integration` |
| Mutaciones de control | Habilitar el módulo por defecto o dar CONTADOR a «abrir caja» hace fallar 2 pruebas de integración y 2 de la auditoría de rutas | — |
| Exportaciones | XLSX abierto con openpyxl; PDF leído con pdftotext; CSV con BOM y fórmulas neutralizadas | `exportacion.spec.ts` |
| Frontend unitarias | 459/459 (9 nuevas + 2 de Vercel) | `test/contabilidad-ui.test.mjs` |
| Navegador simulado | 216/216 (5 nuevas) | `e2e/contabilidad-simulado.spec.ts` |

Cobertura de integración: módulo opcional por empresa; CAJERO sin acceso; CONTADOR con solo «ver»; solapes de tasas (servicio y disparador); CAI con rango/fecha/tipo; venta con una sola factura vigente; aislamiento multi-tenant por API, por FK y por disparador; libro de ventas con zona horaria, anuladas y sin documento; libro de compras con conciliación; retenciones y resumen de ISV; notas de crédito y devoluciones; saltos de correlativo; corrección/anulación con bitácora inmutable; partida doble (cuadre, cuenta de grupo, disparador diferido, reversión, balanza, cuentas de otra empresa); exportaciones; cierre/reapertura con huella; CONTADOR rechazado en ventas, caja, cobros, inventario, compras, productos y clientes (rutas y servicios).

## 7. Despliegue (no ejecutado; requiere autorización)

1. Respaldo verificado de la base.
2. `npm run migrate:deploy` aplica `20261020000000_rol_contador` y `20261020000100_contabilidad_honduras` (aditivas). Sin ellas, `start:prod` **no arranca** (control existente de `migration-safe.mjs`): desplegar el código antes de migrar detiene el servicio, no corrompe datos.
3. El módulo queda apagado en todas las empresas. El Super Admin lo habilita por empresa en «Servicios».
4. El contador configura RTN, tasas, reglas y CAI con su base legal antes de registrar documentos.
5. `scripts/estado-base-solo-lectura.sql` ya incluye ambas migraciones con sus checksums.

## 8. Revisión de esquema — NEXUS

- Cambios aditivos: un valor de enum, once tablas nuevas, un índice único en `ordenes_compra (tenant_id, id)`; ningún dato existente se modifica ni se elimina.
- `prisma migrate diff` entre la base reconstruida y `schema.prisma`: vacío. `esquema-deriva` y `migrations` en verde.
- La reversión de emergencia de #148 (`prisma/propuestas/entregas-148/03_rollback_con_respaldo.sql`) sigue siendo ejecutable: se reemplazaron las FK compuestas hacia `usuarios`/`ventas` por FK simples + disparador de misma empresa tras detectar el conflicto en la prueba `centinela-migracion-148`.
- Riesgo residual: `ALTER TYPE ... ADD VALUE` no se revierte con un `ROLLBACK` de la migración; un retorno al código anterior con usuarios CONTADOR ya creados los dejaría sin rutas (no rompe a los demás roles).

Firma: **NEXUS**.

## 9. Pendientes (fases siguientes)

1. **Validación normativa** por un contador con acceso a La Gaceta/SAR: tasas, tipos de documento, plazos, reglas de retención aplicables a cada cliente.
2. **Emisión de facturas con CAI desde el POS** (numeración automática, impresión con leyendas y rango). Hoy el POS no emite numeración fiscal (decisión D1 previa); la fase 1 registra los documentos emitidos fuera del sistema y los concilia.
3. **Asientos automáticos** desde ventas, cobros, compras, pagos, inventario y caja (reglas de contabilización configurables por empresa), con el mismo período y huella.
4. **Estados financieros** (balance general, estado de resultados, flujo) y cierre anual con traslado de resultados.
5. **Formatos de declaración del SAR** (ISV mensual, DMC, retenciones) y su calendario, una vez verificados los formularios vigentes.
6. **Facturación electrónica** si el SAR la hace obligatoria para el cliente.
7. **Importes exentos/exonerados y tasa especial en el POS**: hoy toda venta del POS es gravada al 15 % por diseño; la conciliación lo reflejará como diferencia si el documento declara otra cosa.
8. **Constancia de exoneración** del adquirente (Art. 10 num. 8) y registro de exonerados.
9. **Retenciones con comprobante emitido por el sistema** (tipo 05 con CAI propio).
10. **Moneda extranjera** (tasa de cambio a la fecha de emisión).
11. Cálculo de costos/valuación de inventario para contabilidad (el rol CONTADOR no recibe costos por la regla existente `canReadProductFinancials`).
12. Sucursal en documentos (el esquema operativo no asigna operaciones a sucursales).
