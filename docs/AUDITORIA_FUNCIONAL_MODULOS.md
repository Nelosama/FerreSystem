> Estado vigente tras sincronizar con `main` `46f7db7`: #226 está integrado y Comisiones está excluido del piloto. AUD-COM-01/02/03 se conservan como hallazgos del código residual, no como fallos de una función accesible. El E2E de esta rama verifica acceso denegado sin `test.fail`; las dos sondas `it.fails` caracterizan los cálculos residuales y no prueban activación. Las cifras de auditoría siguientes pertenecen a su SHA histórico; la nueva validación figura en el PR por SHA. Persisten los bloqueos fiscales, operativos y de aceptación.

# Auditoría funcional de módulos — salida a producción (vigente, 2026-10-30)

> **Estado vigente.** Esta sección sustituye a las matrices del 2026-10-29, que se conservan al final como **antecedente histórico** (revisión principalmente de código). Si difieren, prevalece esta sección. No es una aceptación del cliente, ni una certificación fiscal, ni una verificación del hosting.

## 1. Base auditada y método

- **SHA auditado:** `a4ab291aba1a8574e9c66d59b044e35f938bda38` (`origin/main` tras `git fetch` el 2026-10-30; merge de #224, incluye #223). Todas las pruebas de §2 se ejecutaron sobre este código más los dos archivos de prueba nuevos. Sin PR abiertos al empezar (consultado en GitHub).
- **Rama:** `claude/sharp-fermi-ryjhpl`. PR en borrador. Sin merge, sin despliegue, sin cambios de hosting, sin escrituras en bases reales.
- **Entorno:** contenedor Linux, Node 22.22.0 (el CI usa 24), PostgreSQL 16 temporal (un clúster efímero por archivo de prueba, creado con `initdb` y destruido al terminar), Chromium 1243 de Playwright 1.63.0, `restic` instalado solo en el contenedor. Datos exclusivamente sintéticos.
- **Niveles de evidencia** (se indica en cada módulo):
  - **[C]** lectura de código, con archivo:línea.
  - **[U]** pruebas unitarias o de navegador con red simulada (`page.route`): no tocan PostgreSQL.
  - **[I]** integración con PostgreSQL real (servicios o HTTP NestJS con guards, pipes y DTO reales).
  - **[R]** navegador real contra la API NestJS compilada y PostgreSQL temporal (`frontend/e2e-real/run.sh`), sin mocks.
- **Estados:** VERIFICADO EN ENTORNO AISLADO · PARCIAL · BLOQUEADO · NO IMPLEMENTADO/EXCLUIDO · NO VERIFICADO.
- **Pruebas nuevas de esta auditoría** (no se eliminó ni relajó ninguna existente):
  - `backend/test/auditoria-produccion-20261030.postgres.integration.ts` — AppModule completo con login real: doble envío con **identificadores distintos** en ocho operaciones de dinero/existencias, barrido de roles VENDEDOR/BODEGUERO/CONTADOR, contrato de Comisiones y límites fiscales. Los defectos se expresan con `it.fails` (la aserción describe lo correcto; se aprueba mientras el defecto exista).
  - `frontend/e2e-real/auditoria-comisiones-real.spec.ts` — Comisiones en navegador real (AUD-COM-01), con `test.fail()`.

## 2. Resultados reales de pruebas (SHA auditado)

| Suite | Comando | Aprobadas | Fallidas | Omitidas | Notas |
| --- | --- | --- | --- | --- | --- |
| Backend unitarias | `npm test` (backend) | 836 | 0 | 0 | 76 archivos |
| Backend scripts | `npm run test:scripts` | 52 | 0 | 0 | |
| Validador de inventario (Python) | `python3 scripts/validar-inventario.test.py` | 11 | 0 | 0 | |
| Backend build / lint | `npm run build`, `npm run lint` | OK | — | — | lint: solo avisos existentes |
| **Integración PostgreSQL completa** | `REAL_SETTINGS_BROWSER=1 npm run test:integration` | **1237** | 0 | 0 | 71 archivos; incluye navegador real de configuración |
| Integración — auditoría nueva | `vitest … auditoria-produccion-20261030` | 14 | 0 | 0 | + **2 fallos esperados** (`it.fails`) que confirman AUD-COM-01/02. Contraprueba sin `fails`: `expected 0 to be greater than 0` y `expected [ …(50) ] to have a length of 55` |
| Backend e2e | `npm run test:e2e` | 6 | 0 | 0 | |
| Frontend unitarias | `npm test` (frontend) | 575 | 0 | 0 | build y lint OK |
| Navegador simulado (escritorio) | `npx playwright test --workers=1` | 427 | 0 | 26 | omitidas por diseño (capturas UX y variantes condicionadas) |
| Navegador simulado (móvil) | `playwright.session.mobile.config.ts` | 16 | 0 | 0 | |
| **Piloto real navegador → API → PostgreSQL** | `bash frontend/e2e-real/run.sh` | **182** | 0 | 4 | 30 specs (181 ✓ + 1 fallo esperado `test.fail` de AUD-COM-01, que el reporte `list` marca ✘ pero cuenta como aprobado). `prisma migrate deploy` + deriva cero. Omitidas heredadas. `contingencia-real` n.º 14 (service worker), que fallaba en entornos locales anteriores, **aprobó** aquí |
| Respaldo cifrado y restauración | `FS41_INTEGRATION=1 node scripts/backup-worker.integration.mjs` | PASS | 0 | — | 4 respaldos/restauraciones cifrados, 2 fallos deliberados, snapshot concurrente. Ejecutado como `nobody` (ver ARN-02) |
| Reinicio y restauración | `bash backend/scripts/simulacro-recuperacion.sh` | 14 PASS | 0 | — | `FALLOS=0` |
| Actualización y reversión | `bash backend/scripts/ensayo-actualizacion-preproduccion.sh` | 25 PASS | 0 | — | `FALLOS=0` |

**No ejecutado:** WebKit (`playwright.auth.webkit.config.ts`, `playwright.inventory-webkit.config.ts`) y móvil real (`playwright.real.mobile.config.ts`): fuera del alcance de CI y sin WebKit instalado; **NO VERIFICADO**. Hardware físico: **NO VERIFICADO**. Render, Vercel, Supabase y respaldos productivos: **NO VERIFICADO** (prohibido por el encargo).

## 3. Catálogo frente a rutas y controladores

Cruce de `backend/src/common/tenant-modules.ts:4-11`, `frontend/src/config/modulesCatalog.ts`, `frontend/src/App.tsx:202-426` y los 22 controladores (`@Controller`) del backend [C], más la sonda §4 de la prueba nueva [I].

- 13 claves configurables: 12 por defecto (`pos, cotizaciones, inventario, levantamiento, ordenes_compra, garantias, clientes, usuarios, comisiones_venta, arqueo_caja, reportes, configuracion`) y 1 opt-in (`contabilidad`).
- Funciones sin clave propia que cuelgan de otra: Devoluciones, Entregas y Contingencia (`pos`), Cuentas/abonos y Conciliación bancaria (`arqueo_caja`), Precios (`inventario`), Proveedores (dentro de Compras), Mi cuenta/Recuperación (autenticación), Super Admin (plataforma).
- **Módulo omitido en la auditoría anterior: Comisiones de venta** (`comisiones_venta`, activo por defecto, ruta `/comisiones`, `App.tsx:379-388`). **No tiene controlador ni servicio en el backend**: la pantalla calcula en el navegador. Ver §5.12 (BLOQUEADO).
- Conciliación bancaria (`/conciliacion-bancaria`, `operaciones.controller.ts:45-47`) y Panel móvil (`/admin-movil`) se auditan dentro de Caja y de Super Admin/ADMIN respectivamente.
- Modelos sin uso operativo: `CierreComision` (`schema.prisma:1478`), `Garantia` e `HistorialGarantia` (`schema.prisma:1369,1393`), `Apartado`, `Transferencia`, `PedidoEspecial`, `ListaPrecio`.
- Abonos antiguos `POST /clientes/:id/abonos` responden 410 (`clientes.service.ts:187-189`); el camino vigente es `POST /operaciones/cuentas/:id/pagos` con `solicitudId`.

## 4. Matriz vigente

| # | Módulo | Estado | Evidencia principal | Primera salida |
| --- | --- | --- | --- | --- |
| 1 | POS y cobros | **VERIFICADO EN ENTORNO AISLADO** | [I] ventas 46, cobro-entrega 53, redondeo 7, pagos-bancarios 22, auditoría piloto 43, auditoría nueva; [R] | Incluir (solo gravado 15 %) |
| 2 | Cotizaciones | **VERIFICADO EN ENTORNO AISLADO** con restricciones fiscales | [I] cotizaciones 11, ciclo-ventas 22, exenciones-politica 7; [R] | Incluir sin exentas y solo 15 % |
| 3 | Inventario, importación, precios, costos, kardex | **VERIFICADO EN ENTORNO AISLADO** | [I] productos-edición 33, importación 18, precios-aprobación 12, costo-inicial 23, kardex 12, auditoría-inventario 11, inventario-ciclo 7; [R] | Incluir |
| 4 | Levantamiento | **VERIFICADO EN ENTORNO AISLADO** | [I] levantamientos 35; [U] levantamiento.spec | Incluir |
| 5 | Clientes, crédito, abonos, estado de cuenta | **VERIFICADO EN ENTORNO AISLADO** | [I] crédito 35, clientes-cajero 7, crédito-auditoría 4, estado-cuenta 4, cxc-cxp 11; [R] balance | Incluir |
| 6 | Proveedores | **VERIFICADO EN ENTORNO AISLADO** | [I] proveedores-gestión 5, productos-proveedores 9 | Incluir |
| 7 | Compras, recepciones y CxP | **PARCIAL** | [I] compras 35, compras-cierre 10, contado 7, ISV 9; [R] compras-interfaz | Incluir con revisión manual del documento del proveedor (C-02/C-04) |
| 8 | Caja y arqueo | **VERIFICADO EN ENTORNO AISLADO** | [I] caja 14, pagos-bancarios 22; [R] caja-interfaz, jornada 8 | Incluir |
| 9 | Entregas | **VERIFICADO EN ENTORNO AISLADO** | [I] centinela-entregas 26, cobro-entrega 53; [R] cobro-entrega | Incluir |
| 10 | Devoluciones | **VERIFICADO EN ENTORNO AISLADO** (ventas gravadas) | [I] devoluciones-cxc 14, desglose-devoluciones 8; auditoría nueva | Incluir |
| 11 | Garantías | **PARCIAL** | [I] garantías 37; [R] garantías 11 | Solo coberturas y consulta; sin reclamos |
| 12 | Comisiones | **BLOQUEADO** (AUD-COM-01/02/03) | [C] `ComisionesPage.tsx`; [I] `it.fails`; [R] `test.fail` | **Ocultar** |
| 13 | Contabilidad y documentos fiscales | **PARCIAL**, opt-in apagado | [I] contabilidad 33, asientos-propuesta 14; [R] contabilidad 7 | Excluir (apagado) hasta contador |
| 14 | Reportes | **PARCIAL** (alcance de resumen) | [I] reportes-zona-horaria 24, dashboard 15; [U] reportes-cajero | Incluir con alcance declarado |
| 15 | Usuarios, permisos, autenticación, recuperación | **VERIFICADO EN ENTORNO AISLADO**; correo real NO VERIFICADO | [I] auth-recovery 53, autenticación-fase3 43, seguridad-fase2 16, admin-usuarios 9, barrido 7 + barrido de roles nuevo; [R] auth-recovery, session, permisos | Incluir; SMTP productivo pendiente |
| 16 | Super Admin | **VERIFICADO EN ENTORNO AISLADO** | [I] administración-cloud 21, saas-onboarding 18, soporte 6; [R] administración-cloud 6 | Incluir |
| 17 | Configuración del negocio y comprobantes | **PARCIAL** | [I] configuración-logotipo 24; [U] impresión-formatos; [R] logotipo 4 | Incluir configuración; comprobante sujeto a decisión fiscal (AUD-FIS-01) |
| 18 | Contingencia offline y reconciliación | **PARCIAL** | [I] 14 archivos de contingencia (214 pruebas); [R] contingencia 15 | Incluir con protocolo de apagón y decisión D11 |
| 19 | Apartados, transferencias, pedidos especiales, listas de precio | **NO IMPLEMENTADO/EXCLUIDO** (verificado oculto) | [I] auditoría nueva §4; [U] navegación | Mantener ocultos |

## 5. Detalle por módulo

Para cada módulo: flujos ejecutados, roles y aislamiento, validaciones/errores/rollback, doble envío y concurrencia, efectos exactos, defectos, dependencias y recomendación. El aislamiento entre dos empresas de **todas** las rutas registradas está cubierto por `aislamiento-barrido` (7/7, [I]): ADMIN y CAJERO de la empresa B atacan cada ruta con identificadores reales de A y se comprueba que ninguna respuesta contiene datos de A y que la huella MD5 de todas las tablas con `tenant_id` de A no cambia. Ese barrido verifica además que el CAJERO recibe 403 en toda ruta sin su rol; la prueba nueva amplía la verificación a **VENDEDOR, BODEGUERO y CONTADOR** (todas las rutas con `@Roles` que no los incluyen → 403, con control positivo de cada token; 0 violaciones).

### 5.1 POS y cobros — VERIFICADO EN ENTORNO AISLADO
- **Flujos:** venta contado (efectivo/tarjeta/transferencia con autorización bancaria única), crédito con límite, descuento con permiso, excepción de precio (409/400/403), cancelación y anulación con autorización de otro ADMIN, sincronización de precios, 300 ventas aleatorias conciliadas al centavo contra un cálculo independiente en enteros (`auditoria-piloto-ferreteria`), reinicio abrupto sin duplicar caja ni reservas (`ventas`).
- **Roles:** ADMIN/CAJERO/VENDEDOR venden; BODEGUERO no lee ventas (`ventas.controller.ts:15-17`). Aislamiento: barrido.
- **Doble envío:** mismo `solicitudId` → misma venta (ciclo-ventas, ventas). **Nuevo [I]:** tres ventas simultáneas con identificadores distintos por la última unidad → exactamente 1 × 201, el resto 4xx, `stockActual − stockReservado = 0`, 1 venta en BD.
- **Efectos:** caja esperada, reservas, movimientos de inventario y auditoría comprobados en `ciclo-ventas` y `auditoria-jornada-piloto-real` [R].
- **Defectos:** ninguno nuevo. **Dependencias:** impresora térmica, lector y cajón no probados físicamente; ISV fijo 15 %.
- **Recomendación:** incluir.

### 5.2 Cotizaciones — VERIFICADO EN ENTORNO AISLADO (con restricciones)
- **Flujos:** crear/editar/duplicar/convertir/estado; conversión doble simultánea → `[201, 400]` y una sola venta y reserva (`ciclo-ventas`); cotización contra venta concurrente (`ventas`).
- **Fiscal:** solo 15 % (`politica-isv.ts`); exenciones bloqueadas para todos los roles: la prueba nueva confirma que ni ADMIN ni VENDEDOR crean cotización con `exento: true` (≥400, 0 filas). Regularización de tasas antiguas solo ADMIN auditada (#217).
- **Defectos:** ninguno nuevo. **Decisiones:** D1–D11 del contador.
- **Recomendación:** incluir sin exentas.

### 5.3 Inventario, importación, precios, costos y kardex — VERIFICADO EN ENTORNO AISLADO
- **Flujos:** alta/edición con versión, ajuste con motivo y `stockAnterior`, importación con validación, aprobación de precios, costo inicial, consolidación de kardex, BODEGUERO sin costos (`SinCostosParaBodeguero`).
- **Nuevo [I]:** dos ajustes simultáneos (7 y 13) sobre el mismo stock observado (10) con identificadores distintos → 1 × 201, stock final ∈ {7, 13}, 1 movimiento `AJUSTE`.
- **Recomendación:** incluir.

### 5.4 Levantamiento — VERIFICADO EN ENTORNO AISLADO
- 35/35 [I]: conteo multiusuario, aplicación doble, duplicados y aislamiento. **Recomendación:** incluir; validar el escáner en el equipo real.

### 5.5 Clientes, crédito, abonos y estados de cuenta — VERIFICADO EN ENTORNO AISLADO
- **Nuevo [I]:** dos ventas a crédito simultáneas que juntas exceden el límite (L 150; 2 × L 115) → solo una; saldo L 115; 1 CxC. Dos abonos simultáneos por el saldo completo con identificadores distintos → 1 × 201, saldo de la cuenta y del cliente L 0, caja esperada L 215 (apertura 100 + abono 115 una vez).
- **Recomendación:** incluir.

### 5.6 Proveedores — VERIFICADO EN ENTORNO AISLADO
- CRUD solo ADMIN (`proveedores.controller.ts:16`), desactivación, vínculos producto-proveedor. No monetario. **Recomendación:** incluir.

### 5.7 Compras, recepciones y CxP — PARCIAL
- **Flujos [I]:** orden, recepción parcial/total, costo vigente, CxP, contado, cierre; aritmética de ISV (≤ subtotal, costo > 0) desde #221.
- **Nuevo [I]:** dos recepciones simultáneas del total pendiente (ADMIN y BODEGUERO, identificadores distintos) → 1 × 201, stock 2 → 12, 1 movimiento `COMPRA`. Dos pagos de CxP simultáneos por el saldo completo → 1 × 201, saldo 0.
- **Pendiente (decisión, no defecto de código):** C-02 (ISV sin tasa ni conciliación con el libro) y C-04 (sin desglose por línea) — contador.
- **Recomendación:** incluir con revisión manual del documento del proveedor.

### 5.8 Caja y arqueo — VERIFICADO EN ENTORNO AISLADO
- [I] apertura, movimientos con permiso, cierre con diferencia y nota, cierre concurrente, venta contra cierre simultáneo, conciliación bancaria. [R] arqueo en pantalla con faltante.
- **Nuevo [I]:** tres aperturas simultáneas del mismo CAJERO con identificadores distintos → 1 caja ABIERTA.
- **Recomendación:** incluir.

### 5.9 Entregas — VERIFICADO EN ENTORNO AISLADO
- [I] entregas parciales, cuatro entregas simultáneas, liberación solo ADMIN, BODEGUERO sin precios. **Recomendación:** incluir.

### 5.10 Devoluciones — VERIFICADO EN ENTORNO AISLADO (ventas gravadas)
- [I] solicitud → autorización por otro ADMIN → ejecución; reintentos; devolución contra pago simultáneo; CxC.
- **Nuevo [I]:** dos devoluciones directas parciales simultáneas de la misma línea con identificadores distintos → 1 × 201, 1 devolución, caja L 215 (100 + 230 − 115).
- **Regla confirmada:** anular el total exige solicitud y autorización de otro ADMIN (403 al intentarlo directo).
- **Recomendación:** incluir; las ventas mixtas no pueden originarse mientras las exenciones sigan bloqueadas.

### 5.11 Garantías — PARCIAL
- [I] 37/37 y [R] 11/11: consulta de factura y coberturas (crear/editar, cinco altas simultáneas). **Función ausente:** reclamos e historial (`Garantia`, `HistorialGarantia` sin servicio). **Recomendación:** solo coberturas.

### 5.12 Comisiones — BLOQUEADO
- **Evidencia:** [C] `frontend/src/pages/ComisionesPage.tsx:24-32,88-104`; [I] `auditoria-produccion-20261030` §3; [R] `auditoria-comisiones-real.spec.ts`.
- **AUD-COM-01 (P1, producto).** *Reproducción:* registrar ventas y abrir `/comisiones` con el periodo que las contiene. *Esperado:* total vendido y comisión del vendedor. *Observado:* L 0,00 para todos: la pantalla filtra por `v.fecha` y `v.vendedorNombre`, pero `GET /ventas` devuelve `createdAt` y `usuario.nombre` (`ventas.service.ts:74-107`). *Impacto:* cifras de pago a empleados erróneas en un módulo activo por defecto.
- **AUD-COM-02 (P1, producto).** `GET /ventas` sin parámetros devuelve las 50 más recientes (`ventas.controller.ts:23`); la pantalla no pagina. *Impacto:* aunque se corrija AUD-COM-01, cualquier periodo con más de 50 ventas queda truncado. [I] 55 ventas → la API devuelve 50.
- **AUD-COM-03 (P2, producto) [C].** Periodo fijo `2026-03-01…31` (`:24-25`); porcentaje solo en memoria (no persiste; `CierreComision` sin uso); atribución por coincidencia de primer nombre (`includes`), que confunde vendedores con nombres parecidos; no descuenta devoluciones ni anulaciones; día calculado en UTC, no en zona de negocio.
- **Decisión de negocio:** regla de comisión (base neta o bruta, devoluciones, quién liquida). **Recomendación:** ocultar `comisiones_venta` en la primera salida (desactivarlo por negocio desde Super Admin o retirarlo del catálogo por defecto); no se cambió en esta auditoría.

### 5.13 Contabilidad y documentos fiscales — PARCIAL (opt-in apagado)
- [I] 33 + 14 (propuesta de asientos), [R] 7 (con el módulo activado explícitamente en esa empresa sintética). **Nuevo [I]:** un negocio nuevo recibe 403 en `/contabilidad/cuentas` como ADMIN y como CONTADOR (opt-in respetado).
- **Función ausente:** asientos automáticos desde operación (solo propuesta). **Decisión:** contador. **Recomendación:** excluir de la primera salida.

### 5.14 Reportes — PARCIAL
- [I] resumen por método, cajeros, rotación, alertas CxC/CxP, zona horaria. Sin reporte de ISV neto de devoluciones, de compras ni de inventario valorizado (función ausente). **Recomendación:** incluir con alcance declarado.

### 5.15 Usuarios, permisos, autenticación y recuperación — VERIFICADO EN ENTORNO AISLADO
- [I] política SUPERADMIN para cuentas ADMIN, catálogo de permisos, sesiones revocables, rotación, límites de intentos, recuperación de un solo uso, ambigüedad entre empresas. [R] recuperación CONTADOR 390/1440, sesiones, permisos.
- **Nuevo [I]:** barrido VENDEDOR/BODEGUERO/CONTADOR sin violaciones.
- **NO VERIFICADO:** envío real de correo (Gmail SMTP). En las pruebas la entrega se simula; el registro «Solicitud de recuperación no entregada» es el camino de error esperado. **Recomendación:** incluir; configurar y probar SMTP en preproducción.

### 5.16 Super Admin — VERIFICADO EN ENTORNO AISLADO
- [I] negocios, estado, módulos con dependencias y auditoría, administradores, soporte remoto auditado; [R] administración-cloud 6. **Recomendación:** incluir.

### 5.17 Configuración del negocio y comprobantes — PARCIAL
- [I] configuración solo HNL/ISV 15 %, idioma, formato de impresión, logotipo privado validado (24/24); [R] logotipo 4/4; [U] formatos A4/80/58 mm.
- **AUD-FIS-01 (decisión fiscal, no defecto de código) [C].** El PDF de venta se titula «COMPROBANTE DE VENTA» y no lleva CAI, rango autorizado ni leyenda de documento no fiscal (`ReciboPDF.tsx:305,449`). La factura fiscal configurable por empresa **no está implementada**. Si el comprobante es válido o si debe emitirse factura externa (`referenciaFacturaExterna`) lo decide el contador; esta auditoría no lo dictamina.
- **Recomendación:** incluir la configuración; definir el documento de venta con el contador antes de vender con datos reales.

### 5.18 Contingencia offline y reconciliación — PARCIAL
- [I] 14 archivos (214 pruebas): identidad del dispositivo, texto seguro, importes, concurrencia, rechazo fiscal `IMPORTE_FISCAL_INCONSISTENTE`, cierre de entradas. [R] contingencia-real 15.
- **Decisión pendiente:** D11 (conflictos en revisión). **Recomendación:** incluir con protocolo de apagón ensayado en tienda.

### 5.19 Apartados, transferencias, pedidos especiales y listas de precio — NO IMPLEMENTADO/EXCLUIDO
- **Nuevo [I]:** con registros `enabled=true` sembrados para las cuatro claves, `GET /tenant/settings` no las incluye en `modulosHabilitados`; ningún controlador del backend las expone. `moduleEnabled` las rechaza siempre (`tenant-modules.ts:9,13`); `PENDING_MODULES` del frontend las oculta (`modulesCatalog.ts:137`). No se implementó nada.

## 6. Defectos y hallazgos clasificados

### Defectos de producto
| ID | Sev. | Módulo | Resumen | Prueba |
| --- | --- | --- | --- | --- |
| AUD-COM-01 | P1 | Comisiones | Siempre calcula L 0 (campos inexistentes en la API) | `it.fails` [I] y `test.fail` [R] |
| AUD-COM-02 | P1 | Comisiones | Usa solo las 50 ventas más recientes | `it.fails` [I] |
| AUD-COM-03 | P2 | Comisiones | Periodo fijo, porcentaje sin persistir, atribución por nombre, sin devoluciones, día UTC | [C] |

No se encontró ningún P0 ni defecto nuevo en los módulos 1–11 y 13–18 dentro de lo ejecutado.

### Fallos del arnés (no son defectos del producto)
- **ARN-01:** como root, `initdb` exige ejecutarse con otro usuario. Envolturas locales en `/var/tmp/ferre-pgbin` (`runuser -u nobody`, permiso del directorio padre) y `TMPDIR=/var/tmp/ferre-pg`. Fuera del repositorio.
- **ARN-02:** `backup-worker.integration.mjs` falló como root (`COMMAND_FAILED`: el `--pwfile` de 0600 no es legible por `nobody`); ejecutado completo como `nobody`: PASS.
- **ARN-04:** la primera versión del spec de navegador de Comisiones habría «aprobado» con `test.fail()` por un error propio (zona horaria aplicada a `timestamp` sin zona → suma 0; y el prefijo «L.» rompía el parser del importe). Se detectó ejecutándolo **sin** `test.fail()`; corregido, la contraprueba falla ahora en la aserción correcta: `Expected: 345, Received: 0`.
- **ARN-05 (omisiones desactualizadas, sin tocar):** de las 4 omitidas del piloto real, dos describen como ausente algo que hoy existe: «entrega parcial» (`faro-auditoria-integral.spec.ts:398`; las entregas por línea y cantidad están probadas en `cobro-entrega` [I]) y «referencia de autorización del datáfono» (`qa-ciclo-venta.spec.ts:197`; `pagoElectronico.referencia/terminal` existe y se exige en `pagos-bancarios` [I]). Conviene convertirlas en pruebas reales; no se modificaron. Las otras dos (canal web para cliente final) siguen siendo alcance no confirmado.
- **ARN-03:** la primera versión de la sonda de devoluciones usó destino `INVENTARIO` en una venta no entregada (400) y después una devolución total (403 por la regla de anulación). Se corrigió el arnés (destino `NO_ENTREGADO`, devolución parcial); la aserción de unicidad no se relajó.

### Funciones ausentes (no defectos)
Reclamos de garantía; asientos contables automáticos; reportes de ISV neto, compras e inventario valorizado; factura fiscal con CAI; los cuatro módulos excluidos.

### Decisiones de negocio y fiscales
D1–D11 y aprobación del contador; C-02/C-04 de compras; documento de venta (AUD-FIS-01); regla de comisiones; quién concede `pos.excepcion_precio` fuera de SUPERADMIN; uso o retirada del SDK OpenAI.

## 7. Cierre para producción

**Bloqueos imprescindibles (NO-GO hasta resolverlos):**
1. Dictamen del contador sobre el documento de venta (AUD-FIS-01) y D1–D11. Las exenciones siguen bloqueadas, `FISCAL_DESGLOSE_POR_LINEA` apagado y Contabilidad opt-in; no se activó nada.
2. Ocultar Comisiones (AUD-COM-01/02) o corregirlo con su regla de negocio.
3. Infraestructura: Render (health check, SHA desplegado, variables y secretos), Vercel, respaldo productivo con restauración probada y RPO/RTO, ensayo de la migración `20261029000000_desglose_fiscal_linea` en copia de preproducción con volumen real, SMTP de recuperación. Los ensayos de esta auditoría usan bases efímeras y no sustituyen esa verificación.
4. Equipos físicos: impresora 58/80 mm, lector de código de barras, cajón, cámara iPhone/Android, red de tienda y apagón real.
5. Aceptación del cliente.

**Pueden quedar fuera del alcance inicial:** Comisiones, Contabilidad, reclamos de garantía, reportes ampliados, los cuatro módulos excluidos, exenciones y desglose por línea, SDK OpenAI.

**Requieren contador:** documento de venta y CAI, D1–D11, ISV de compras (C-02/C-04), activación de Contabilidad. **Requieren infraestructura:** Render, Vercel, Supabase, respaldos, SMTP. **Requieren equipos físicos:** impresión, escáner, cajón, PWA instalada, contingencia en tienda.

## 8. Comandos y conteos finales

```bash
# Entorno local de auditoría (fuera del repositorio): envolturas initdb/pg_ctl/postgres con runuser -u nobody
export PG_BIN=/var/tmp/ferre-pgbin TMPDIR=/var/tmp/ferre-pg
cd backend && npm run build && npm run lint && npm test && npm run test:scripts && python3 scripts/validar-inventario.test.py
REAL_SETTINGS_BROWSER=1 npm run test:integration && npm run test:e2e
npx vitest run --config vitest.config.integration.ts test/auditoria-produccion-20261030.postgres.integration.ts
runuser -u nobody -- env TMPDIR=/var/tmp/ferre-pg PG_BIN=/usr/lib/postgresql/16/bin FS41_INTEGRATION=1 node scripts/backup-worker.integration.mjs
cd .. && bash backend/scripts/simulacro-recuperacion.sh && bash backend/scripts/ensayo-actualizacion-preproduccion.sh
cd frontend && VITE_API_URL=https://api.example.test/api npm run build && npm run lint && npm test
npx playwright test --workers=1 && npx playwright test --config playwright.session.mobile.config.ts
bash e2e-real/run.sh
```

**Conteo total en el SHA auditado (según cada ejecutor):**

| Resultado | Cantidad | Composición |
| --- | --- | --- |
| Aprobadas | **3 356** | 836 + 52 + 11 + 1 237 + 14 + 6 + 575 + 427 + 16 + 182 |
| Fallidas | **0** | |
| Omitidas | **30** | 26 navegador simulado + 4 piloto real (heredadas) |
| Fallos esperados (documentan defectos) | **3** | 2 `it.fails` de Vitest (aparte de las 14) + 1 `test.fail` de Playwright (Playwright lo cuenta dentro de las 182) |
| Guiones operativos | 3 PASS | respaldo cifrado, reinicio/restauración (14 PASS), actualización/reversión (25 PASS) |
| No ejecutadas | — | WebKit, `playwright.real.mobile.config.ts`, hardware, hosting, bases reales |



---

# Antecedente histórico — auditoría del 2026-10-29 (sustituida)

> Revisión principalmente de **lectura de código** sobre `main` `3a6c6695`. Sus estados son **históricos**: varias condiciones ya se integraron (#216, #217, #220, #221, #222) y omitía Comisiones. No usar como lista vigente; prevalece la sección superior.

Base: `main` `3a6c6695`. Rama: `claude/auditoria-funcional-20261029`. Lectura de código y comprobación cruzada frontend ↔ backend ↔ esquema ↔ pruebas. **No es una prueba de extremo a extremo en navegador.** Donde afirmo «LISTO» es porque hay endpoints, persistencia, permisos y pruebas de integración en el código; no porque haya recorrido la pantalla.

### Criterio

- **LISTO:** operaciones completas con persistencia, permisos y pruebas de integración en PostgreSQL. Puede habilitarse en el piloto, con las restricciones que indique.
- **PARCIAL:** operaciones reales, pero incompletas o con un defecto que limita su uso.
- **BLOQUEADO:** defecto crítico que impide usarlo, aunque exista la funcionalidad.
- **NO IMPLEMENTADO:** interfaz o estructura sin operaciones reales.

Pantalla ≠ función: un módulo se clasifica por lo que persiste, no por lo que se ve.

### Matriz

| Módulo | Clasificación | Piloto |
| --- | --- | --- |
| POS (venta contado/crédito, cobro) | LISTO | Habilitar |
| Cotizaciones | BLOQUEADO en `main` (ISV 500 % y ADMIN convierte tasa inválida); corregido en #217 pendiente de merge | Ocultar hasta integrar #217 |
| Inventario (productos, ajustes, levantamiento) | LISTO | Habilitar |
| Clientes (CRUD, crédito, abonos, estado de cuenta) | LISTO | Habilitar |
| Proveedores (CRUD) | LISTO | Habilitar |
| Compras (orden, recepción, CxP) | PARCIAL: ISV sin validar (C-01, C-02) | Habilitar solo con revisión manual del documento del proveedor |
| Apartados | NO IMPLEMENTADO | **Ocultar** |
| Transferencias entre sucursales | NO IMPLEMENTADO | **Ocultar** |
| Pedidos especiales | NO IMPLEMENTADO | **Ocultar** |
| Listas de precio | NO IMPLEMENTADO (precio por producto sí existe) | **Ocultar** |
| Garantías | PARCIAL | Habilitar solo consulta y coberturas |
| Devoluciones | LISTO para ventas sin exentas | Habilitar; no permitir devolver ventas convertidas de cotizaciones con exentas |
| Caja y arqueo | LISTO | Habilitar |
| Contabilidad | PARCIAL: asientos automáticos sin implementar; apagado por defecto | Ocultar |
| Usuarios y permisos | LISTO | Habilitar |
| Reportes | PARCIAL: solo resumen por método de pago | Habilitar con alcance declarado |
| Super Admin | LISTO | Habilitar (solo plataforma) |
| Entregas (bodega) | LISTO | Habilitar |
| Contingencia offline (POS sin conexión) | PARCIAL: conflictos en revisión dependen de decisión D11 | Habilitar con protocolo de apagón |
| Levantamiento (conteo multiusuario) | LISTO | Habilitar |

### Detalle por módulo

### POS
1. **Pantallas:** `POSPage.tsx` (1 600 líneas), `PosContingenciaPage.tsx`, `ArqueoCajaPage.tsx`.
2. **Backend:** `ventas.controller.ts` (`POST /ventas`, `GET /ventas/:id`, solicitudes y descarte); `operaciones.controller.ts` (`caja/*`, `clientes/:id/estado-cuenta`).
3. **Modelos:** `Venta`, `DetalleVenta`, `Caja`, `MovimientoCaja`, `AprobacionBancaria`.
4. **CRUD real:** alta de venta, cobro, idempotencia por `solicitudId`, entrega, descarte de solicitud.
5. **Permisos:** roles ADMIN, CAJERO, VENDEDOR; permisos `pos.aplicar_descuento`, `pos.excepcion_precio`; aislamiento por `tenantId` en las consultas revisadas.
6. **Pruebas:** `ventas.postgres.integration.ts`, `ciclo-ventas`, `caja`, `redondeo-cobro`, `cobro-entrega` (decenas de casos).
7. **Dependencias:** inventario (reserva y stock), caja, clientes (crédito), contabilidad (asientos no automáticos).
8. **Riesgos:** ISV fijo al 15 % (correcto para las ventas actuales; no hay líneas exentas en POS, decisión D4).
9. **Recomendación:** habilitar.

### Cotizaciones
1. **Pantallas:** `CotizacionesPage.tsx` (1 896 líneas).
2. **Backend:** `cotizaciones.controller.ts` (8 endpoints: crear, editar, duplicar, convertir, estado, listar, detalle).
3. **Modelos:** `Cotizacion`, `DetalleCotizacion`.
4. **Estado en `main`:** la validación de `porcentajeIsv` acepta cualquier valor ≥ 0 (incluido 500 %) y ADMIN convierte una cotización con tasa inválida. Eso es un defecto fiscal crítico. **Corregido en #217** (`da48cb2`, pendiente de merge): tasas autorizadas y regularización explícita.
5. **Permisos:** crear y editar: ADMIN, VENDEDOR, CAJERO. Convertir: ADMIN y CAJERO, con exentas solo ADMIN. Aislamiento: consultas con `tenantId`.
6. **Pruebas:** `cotizaciones.service.spec.ts` (24), `cotizaciones.postgres.integration.ts` (11), `ciclo-ventas` (JW-04). En `main` no hay prueba del 500 %; se añadieron en #217.
7. **Dependencias:** ventas (conversión), inventario (reserva), clientes (crédito), política de precio.
8. **Riesgos:** T6 (marca de exención sin autorización ni auditoría); ISV de la cotización histórica.
9. **Recomendación:** ocultar hasta integrar #217. Después habilitar sin líneas exentas hasta decidir D5.

### Inventario
1. **Pantallas:** `InventarioPage.tsx` (533 líneas), `LevantamientoPage.tsx`.
2. **Backend:** `productos.controller.ts` (10 endpoints, incluidos importación y precios), `costo-inicial.controller.ts`, `levantamientos.controller.ts` (16), `operaciones.controller.ts` (`productos/:id/ajuste`, `historial`).
3. **Modelos:** `Producto`, `MovimientoInventario`, `Levantamiento`, `LevantamientoItem`, `ProductoProveedor`.
4. **CRUD real:** alta, edición con versión (control de concurrencia), desactivación, ajuste con motivo, importación.
5. **Permisos:** `inventario.ver`, `inventario.editar`; roles ADMIN, BODEGUERO. Aislamiento: revisadas las consultas por `id` sin `tenantId` en `productos.service.ts`, `levantamientos.service.ts`; cada una va precedida de una lectura filtrada por tenant.
6. **Pruebas:** `productos-edicion`, `auditoria-inventario`, `levantamientos` (12 archivos), cientos de casos en el arnés de integración.
7. **Dependencias:** compras (costo), ventas (stock), contingencia.
8. **Riesgos:** bajos.
9. **Recomendación:** habilitar.

### Clientes
1. **Pantallas:** `ClientesPage.tsx` (818 líneas), `EstadoCuentaClientesPage.tsx`.
2. **Backend:** `clientes.controller.ts` (9 endpoints: CRUD, búsqueda, crédito, abonos).
3. **Modelos:** `Cliente`, `AbonoCliente`, `CuentaOperativa` (CxC).
4. **CRUD real:** sí, con abonos y límite de crédito.
5. **Permisos:** ADMIN y CAJERO para estado de cuenta; VENDEDOR sin acceso a estado de cuenta. Aislamiento: `clientes.service.ts` filtra por `tenantId`.
6. **Pruebas:** `clientes-credito-auditoria`, `clientes-cajero`, `credito` (30 archivos que mencionan clientes).
7. **Dependencias:** ventas a crédito, contabilidad (CxC).
8. **Riesgos:** bajos.
9. **Recomendación:** habilitar.

### Proveedores
1. **Pantallas:** `ProveedoresGestion.tsx` (dentro de `OperacionesPage`).
2. **Backend:** `proveedores.controller.ts` (CRUD y desactivación) y `operaciones.controller.ts` (`proveedores`, vínculos producto-proveedor).
3. **Modelos:** `Proveedor`, `ProductoProveedor`.
4. **CRUD real:** sí. El frontend llama a `/proveedores` (listar con inactivos, editar, desactivar).
5. **Permisos:** `proveedores.controller.ts` exige `@Roles(ADMIN)` en todo el controlador. Aislamiento por `tenantId`.
6. **Pruebas:** `proveedores-gestion`, `productos-proveedores`.
7. **Dependencias:** compras.
8. **Riesgos:** bajos.
9. **Recomendación:** habilitar.

### Compras
1. **Pantallas:** `OrdenesCompraPage.tsx` (2 líneas: reutiliza `OperacionesPage modo="compras"`).
2. **Backend:** `operaciones.controller.ts` (`compras`, `compras/:id/recepciones`, pagos CxP).
3. **Modelos:** `OrdenCompra`, `DetalleOrdenCompra`, `RecepcionCompra`, `CuentaOperativa` (CxP), `CostoCompra`.
4. **CRUD real:** orden, recepción parcial, costo, CxP y pago de contado.
5. **Permisos:** ADMIN y BODEGUERO con `inventario.editar`; el costo lo oculta `SinCostosParaBodeguero`.
6. **Pruebas:** `compras`, `compras-cierre`, `compras-contado`, `compras-proveedores.spec.ts`, y `compras-isv` (nueva, en `claude/auditoria-compras-isv-20261029`).
7. **Dependencias:** inventario, CxP, libros de compras (`fiscal_documentos`).
8. **Riesgos:** **C-01 y C-02** (ISV sin validar y sin conciliar con el libro). Ver `AUDITORIA_COMPRAS_ISV.md`.
9. **Recomendación:** habilitar con revisión manual del documento del proveedor hasta resolver C-01 y C-02.

### Apartados
1. **Pantallas:** ruta `/apartados` renderiza `ModuloPendiente` (`App.tsx` ~70). `ApartadosPage.tsx` existe pero **no se importa** en ningún sitio; guarda datos de ejemplo en `localStorage` (`ferre_mock_apartados_*`).
2. **Backend:** ningún endpoint.
3. **Modelos:** `Apartado` y `AbonoApartado` en el esquema; **ningún servicio los usa**.
4. **CRUD real:** no.
5. **Permisos:** la navegación define roles ADMIN, CAJERO, VENDEDOR.
6. **Pruebas:** ninguna.
7. **Riesgos:** el menú lo muestra por defecto (`DEFAULT_TENANT_MODULES` incluye `apartados`). Código muerto con datos de ejemplo.
8. **Recomendación:** ocultar en el piloto; quitar del `DEFAULT_TENANT_MODULES` y eliminar el código muerto en una tarea aparte.

### Transferencias entre sucursales
1. **Pantallas:** `TransferenciasPage.tsx` existe pero no se importa; la ruta muestra `ModuloPendiente`.
2. **Backend:** ninguno para operar. Existe el CRUD de `Sucursal` solo para Super Admin (`super-admin.service.ts`).
3. **Modelos:** `Transferencia`, `DetalleTransferencia` (sin uso); `Sucursal` (solo CRUD de plataforma).
4. **CRUD real:** no.
5. **Permisos:** no aplica.
6. **Pruebas:** ninguna de operación.
7. **Riesgos:** igual que apartados; además, el menú lo muestra a ADMIN y BODEGUERO.
8. **Recomendación:** ocultar.

### Pedidos especiales
1. **Pantallas:** `PedidosEspecialesPage.tsx` no importado; ruta `ModuloPendiente especial`.
2. **Backend:** ninguno. Modelo `PedidoEspecial` sin uso.
3. **CRUD real:** no.
4. **Riesgos:** igual que apartados; el aviso enlaza a POS.
5. **Recomendación:** ocultar.

### Listas de precio
1. **Pantallas:** `ListasPrecioPage.tsx` no importado; ruta `ModuloPendiente`. `PreciosPage.tsx` sí existe y llama a `PATCH /productos/:id/precios` (precio por producto, real).
2. **Backend:** `productos.controller.ts` `PATCH :id/precios` (real, para un producto). Modelo `ListaPrecio` sin uso; `Cliente.listaPrecioId` existe en el esquema sin lógica.
3. **CRUD real:** solo precio individual por producto.
4. **Riesgos:** un cliente con lista asignada no obtiene precios distintos.
5. **Recomendación:** ocultar la entrada «LISTAS DE PRECIO»; mantener el precio por producto.

### Garantías
1. **Pantallas:** `GarantiasPage.tsx` (373 líneas): consulta de factura y coberturas.
2. **Backend:** `garantias.controller.ts` (4 endpoints: factura, listar y crear y editar coberturas).
3. **Modelos:** `CoberturaGarantia` (en uso). `Garantia` e `HistorialGarantia` **sin uso**.
4. **CRUD real:** coberturas sí; reclamos y historial no.
5. **Permisos:** VENDEDOR sin acceso (ver pruebas).
6. **Pruebas:** `garantias.postgres.integration.ts`, `garantias.service.spec.ts`; 3 archivos.
7. **Riesgos:** no hay flujo de reclamo; el historial de garantía no se escribe.
8. **Recomendación:** habilitar solo consulta y registro de coberturas; ocultar el reclamo.

### Devoluciones
1. **Pantallas:** `DevolucionesPage.tsx` (279 líneas).
2. **Backend:** `operaciones.controller.ts`: solicitud, decisión, ejecución y consulta; devolución directa solo ADMIN.
3. **Modelos:** `Devolucion`, `DetalleDevolucion`, `SolicitudDevolucion`.
4. **CRUD real:** solicitar, autorizar (otro administrador), ejecutar, consultar; reembolso y crédito.
5. **Permisos:** solicitar ADMIN, CAJERO, VENDEDOR; autorizar solo ADMIN distinto del solicitante; el ISV de la devolución se reparte por proporción del total.
6. **Pruebas:** 15 archivos (`devoluciones-cxc`, `sec-003-devoluciones.spec.ts`, desglose en la rama de devoluciones).
7. **Riesgo:** en ventas **mixtas** (líneas exentas, solo posibles con cotización convertida) el reembolso del ISV es incorrecto. En ventas gravadas es correcto. Ver `CONSOLIDACION_FISCAL.md`.
8. **Recomendación:** habilitar; bloquear la devolución de ventas convertidas de cotizaciones con exentas hasta la decisión D8.

### Caja
1. **Pantallas:** `ArqueoCajaPage.tsx` (268 líneas).
2. **Backend:** `operaciones.controller.ts` (`caja`, `caja/abrir`, `caja/:id/cerrar`, movimientos, cierres).
3. **Modelos:** `Caja`, `MovimientoCaja`.
4. **CRUD real:** apertura, movimientos, cierre y arqueo.
5. **Permisos:** ADMIN, CAJERO, VENDEDOR; cierres solo ADMIN.
6. **Pruebas:** `caja.postgres.integration.ts` y `resumen-caja-precision.spec.ts`.
7. **Riesgos:** bajos.
8. **Recomendación:** habilitar.

### Contabilidad
1. **Pantallas:** `ContabilidadPage.tsx` (669 líneas) y 9 subrutas.
2. **Backend:** `contabilidad.controller.ts` (32 endpoints): asientos, cuentas, documentos fiscales, retenciones, libros, periodos, CAI, tasas.
3. **Modelos:** `ContableCuenta`, `ContableAsiento`, `FiscalDocumento`, `FiscalTasa`, `FiscalPeriodo`, `FiscalCai`.
4. **Operativo:** libros, periodos, documentos y tasas con vigencia.
5. **Pendiente:** asientos automáticos desde operación (solo propuesta en `prisma/propuestas`, requiere autorización de NEXUS). No hay asientos desde ventas ni compras.
6. **Permisos:** ADMIN y CONTADOR; `contabilidad.*`; apagado por defecto.
7. **Pruebas:** `contabilidad`, `reportes-zona-horaria`, `cartera.spec.ts`, motor.
8. **Recomendación:** ocultar en el piloto hasta asientos automáticos y decisiones del contador.

### Usuarios y permisos
1. **Pantallas:** `UsuariosPage.tsx` (828 líneas).
2. **Backend:** `usuarios.controller.ts` (5 endpoints).
3. **Modelos:** `Usuario`.
4. **Permisos verificados:** las escrituras de `permisos` pasan por un único camino (`usuarios.service.ts`). `PUT /usuarios` exige `@Roles('ADMIN')`: un CAJERO recibe 403. Un ADMIN que no sea de plataforma no gestiona cuentas ADMIN, incluida la suya. No puede concederse `pos.excepcion_precio` a sí mismo.
5. **Pruebas:** `saas-onboarding` (CAJERO no lista ni crea usuarios), `centinela-verificacion-atlas` (CAJERO con todos los permisos personalizados recibe 403), `admin-usuarios-soporte`, `usuarios` (35 archivos que mencionan usuarios y permisos).
6. **Riesgos:** pendiente decidir si cualquier ADMIN puede conceder `pos.excepcion_precio` a terceros (ver #211).
7. **Recomendación:** habilitar.

### Reportes
1. **Pantallas:** `ReportesPage.tsx` (40 líneas): ventas por método de pago, devoluciones y total neto.
2. **Backend:** `operaciones.controller.ts` `GET resumen`; `dashboard.controller.ts`.
3. **Persistencia:** solo lectura de `ventas`, `devoluciones`.
4. **Limitación:** sin reporte de ISV neto de devoluciones (C6 en `AUDITORIA_DEVOLUCIONES_EXENCIONES`), sin reporte de compras ni de inventario valorizado.
5. **Pruebas:** `reportes-zona-horaria`, `dashboard`.
6. **Recomendación:** habilitar con el alcance declarado.

### Super Admin
1. **Pantallas:** `SuperAdminPage.tsx` (1 635 líneas), `NegocioDetallePage.tsx`, `AuditoriaPage.tsx`.
2. **Backend:** `super-admin.controller.ts` (30 endpoints): negocios, estado, módulos, administradores, sucursales (solo lectura en la empresa), auditoría de plataforma.
3. **Modelos:** `Tenant`, `TenantModule`, `SuperAdmin`, `Sucursal`, `AuditoriaSoporte`.
4. **Permisos:** solo SUPERADMIN de plataforma. Aislamiento: el administrador de plataforma opera sobre un negocio por `tenantId` explícito; es el diseño, no una fuga.
5. **Pruebas:** `admin-usuarios-soporte`, `tenant-admin.http.spec.ts`, `administracion-cloud`, `aislamiento-barrido` (7/7).
6. **Riesgo:** `DEFAULT_TENANT_MODULES` activa apartados, transferencias, pedidos y listas de precio para todo negocio nuevo.
7. **Recomendación:** habilitar; corregir `DEFAULT_TENANT_MODULES`.

### Barrido de aislamiento multi-tenant

- Consultas por `id` sin `tenantId` en backend (`findUnique`, `update`, `delete`): revisadas. Las de Super Admin son de plataforma; las de `auth` buscan sesiones o cuentas por identificador con `tenant` derivado del token. Las de módulos operativos (`levantamientos`, `productos`, `usuarios`, `costo-inicial`, `contingencia`, `proveedores`) están precedidas por lectura filtrada por tenant.
- Sin hallazgo de fuga en la muestra revisada. Cobertura global: `aislamiento-barrido` (7 casos) y pruebas por módulo.
- Limitación: no es una auditoría exhaustiva de cada consulta SQL cruda.

### Entregas de esta fase

- Este documento, con la matriz de clasificación.
- Evidencia de archivos: rutas en `App.tsx` (líneas 70–79, 355–429), `config/navigation.ts`, `common/tenant-modules.ts`, controladores y servicios citados.
- Pruebas ejecutadas en esta fase: `compras-isv` (9/9) y las del módulo de devoluciones de la rama de devoluciones (8/8, ver su informe). No se ejecutó la suite completa de cada módulo.

---

### Actualización de la matriz (corrección de bloqueos preproducción, 2026-10-29)

Cada clasificación se basa en evidencia de: persistencia real, seguridad (permisos y aislamiento), pruebas, integración frontend/backend y operaciones completas. Un módulo no es LISTO si tiene un defecto crítico conocido.

| Módulo | Clasificación | Persistencia | Seguridad | Pruebas | Integración F/B | Operaciones completas | Defectos críticos conocidos | Estado en piloto |
|---|---|---|---|---|---|---|---|---|
| POS | LISTO | Sí | Sí (tenant, roles) | Sí | Sí | Sí | No (ISV fijo 15 %; sin exentas) | Habilitar |
| Cotizaciones | LISTO **condicionado** a integrar #217 y #222 | Sí | Sí tras #222 (exenciones bloqueadas) | Sí | Sí | Sí, sin exentas | **Sí en `main`** (ISV 500 %, ADMIN convierte tasa inválida); corregido en #217; exenciones en #222 | Habilitar solo tras integrar #217 y #222 |
| Inventario | LISTO | Sí | Sí | Sí | Sí | Sí | No | Habilitar |
| Clientes | LISTO | Sí | Sí | Sí | Sí | Sí | No | Habilitar |
| Proveedores | LISTO | Sí | Sí (solo ADMIN) | Sí | Sí | Sí | No | Habilitar |
| Compras | PARCIAL | Sí | Sí | Sí | Sí | Parcial | ISV sin tasa ni conciliación con el libro (C-02) y sin desglose (C-04): pendientes de D3 y contador. Aritmética corregida en #221 (ISV ≤ subtotal, costo > 0) | Habilitar solo con revisión manual del documento del proveedor |
| Apartados | NO IMPLEMENTADO | No | — | No | No | No | No aplica: oculto | **Ocultar** (#220) |
| Transferencias | NO IMPLEMENTADO | No | — | No | No | No | No aplica: oculto | **Ocultar** (#220) |
| Pedidos especiales | NO IMPLEMENTADO | No | — | No | No | No | No aplica: oculto | **Ocultar** (#220) |
| Listas de precio | NO IMPLEMENTADO | No | — | No | No | No | No aplica: oculto | **Ocultar** (#220) |
| Garantías | PARCIAL | Parcial (coberturas) | Sí | Parcial | Sí | Parcial (sin reclamos) | No | Solo consulta y coberturas |
| Devoluciones | LISTO para ventas sin exentas | Sí | Sí | Sí | Sí | Sí | Reembolso de ISV incorrecto solo en ventas mixtas; las exentas están bloqueadas (#222) | Habilitar |
| Caja y arqueo | LISTO | Sí | Sí | Sí | Sí | Sí | No | Habilitar |
| Contabilidad | PARCIAL | Sí | Sí | Parcial | Sí | Parcial (sin asientos automáticos) | No | Ocultar (apagada por defecto) |
| Usuarios y permisos | LISTO | Sí | Sí: cajero sin permisos administrativos, probado | Sí | Sí | Sí | No | Habilitar |
| Reportes | PARCIAL | Lectura | Sí | Parcial | Sí | Solo resumen | No | Habilitar con alcance declarado |
| Super Admin | LISTO | Sí | Sí (solo plataforma) | Sí | Sí | Sí | No; módulos sin implementar ya no se pueden encender (#220) | Habilitar |
| Entregas | LISTO | Sí | Sí | Sí | Sí | Sí | No | Habilitar |
| Levantamiento | LISTO | Sí | Sí | Sí | Sí | Sí | No | Habilitar |
| Contingencia offline | PARCIAL | Sí | Sí | Sí | Sí | Sí, con conflictos en revisión | Decisión D11 pendiente | Con protocolo de apagón |

### Alcance mínimo viable para el piloto

Incluye, solo tras integrar #216, #217, #220, #221 y #222 y pasar CI:
- POS (solo ventas gravadas), caja y arqueo, inventario, clientes, proveedores, devoluciones (sin ventas con exentas), usuarios y permisos, Super Admin, entregas y levantamiento.
- Cotizaciones (sin líneas exentas), con la corrección del ISV.
- Compras, solo con revisión manual del documento del proveedor.
- Reportes con el alcance de resumen.

Excluye: apartados, transferencias, pedidos especiales, listas de precio (ocultos), contabilidad (apagada), garantías con reclamos, y cualquier exención de línea hasta D3 y D5.
