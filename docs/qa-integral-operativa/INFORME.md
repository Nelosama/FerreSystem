# Auditoría técnica integral de FerreSystem

Base auditada: `origin/main` **fbf81e69**. Rama exclusiva: `qa/auditoria-integral-operativa`. Solo pruebas y este informe; sin cambios de aplicación, esquema, migraciones, Garantías ni contexto compartido. Sin producción, merge ni despliegue.

## Estado general

El núcleo de venta/reserva/entrega/cobro/caja concilia en los escenarios ejecutados. Eso no acredita preparación integral para producción: hay módulos sin persistencia, una falla de validación en Clientes, restricciones comerciales pendientes de aceptación y falta la fase de aceptación desde navegador/dispositivos.

Git confirma fusionados #108 (a00c53ec), #109 (2398e45f), #112 (5e8e88d5), #114 (df3ae06b), #115 (f9010d30), #119 (fbf81e69). #118 permanece OPEN, rama `feat/garantias-dias`, SHA a1e4b827: no se considera integrado. La pantalla de Garantías de main sigue siendo local; la persistencia que desarrolla Claude no se evalúa ni modifica.

## Módulos y evidencia

| Módulo | Resultado técnico de esta fase | Evidencia y límites |
| --- | --- | --- |
| POS, ventas y cotizaciones | Aprobado en escenarios ejecutados | HTTP y PostgreSQL: efectivo, tarjeta, transferencia, crédito, descuentos/ISV mixto, cotización vencida/renovada/válida hoy, producto inactivo/ajeno, stock insuficiente, bajo pedido, concurrencia, reintentos, respuesta perdida real en Chromium. No aceptación comercial final. |
| Crédito y pagos | Aprobado en escenarios ejecutados | CxC, cupo, pagos parciales, duplicados, conflicto de clave, concurrencia, rollback, devoluciones de crédito. |
| Caja | Aprobado en escenarios ejecutados | Turnos por cajero, métodos de pago, movimientos manuales/permiso, cierre con diferencia y motivo, cierre concurrente/repetido, venta vs cierre. |
| Productos e inventario | Aprobado en escenarios ejecutados | Alta/edición, versión, stock inicial, levantamiento/reconciliación, permisos, aislamiento, reservas/entregas, rollback, inventario y costo tras recepción. Cámara/hardware no aceptados todavía. |
| Compras | Parcialmente aprobado | CxP, factura única, recepción parcial/concurrente/idempotente, último costo incluso cuando baja, proveedores y pagos. Compra al contado inmediata, anulación/corrección y cálculo automático de ISV pendientes por diseño. Pago a proveedor fuera de caja POS: regla vigente, no defecto. |
| Seguridad | Parcialmente aprobado | JWT real, ADMIN/CAJERO, permisos, otro tenant, módulo deshabilitado, soporte auditado/solo lectura, revocación y rollback en suites existentes. No pentest, revisión completa de infraestructura ni matriz exhaustiva de todas las rutas. |
| Clientes | Parcialmente aprobado, falla P2 | Alta, búsqueda y crédito usados en jornada real; edición con null genera 500. |
| Devoluciones | Aprobado en escenarios de integración existentes | Reembolso, crédito, saldos, destinos y rollback en suites de ventas/crédito/caja. Aceptación desde pantalla pendiente. |
| Reportes y Dashboard | Parcialmente aprobado | Reportes por zona/día y Dashboard con PostgreSQL real y esquemas incompletos. Estado de esquema/configuración de producción no comprobado. |
| Apartados y Transferencias entre sucursales | Fallidos para operación persistente | Pantallas guardan registros en localStorage; no son procesos transaccionales PostgreSQL. No confundir TransferenciasPage con pago bancario TRANSFERENCIA, que sí está probado. |
| Garantías | Pendiente / fuera de alcance | Implementación integrada local; Claude desarrolla persistencia. No se aprueba ni corrige. |
| Pedidos especiales | Pendiente para operación persistente | Pantalla localStorage; venta bajo pedido del POS sí probada. |

## Jornada obligatoria — un mismo tenant y turno

`backend/test/ciclo-ventas.postgres.integration.ts`: caso «jornada completa».

1. Login ADMIN real y apertura L100.
2. Alta HTTP: producto L40 costo, L100 venta, stock 2; búsqueda comercial confirma producto.
3. Compra HTTP 10 unidades a L60, total CxP L600. Reintento crea una orden. Recepción concurrente con la misma clave aplica una vez: stock 12, costo vigente L60, precio L100.
4. Cotización de una unidad, conversión EFECTIVO L115; venta TARJETA L115 y TRANSFERENCIA L115 con reintentos.
5. Alta de cliente y habilitación de crédito por HTTP, venta CREDITO L115 y abono EFECTIVO L30 concurrente: una obligación/pago, deuda L85.
6. Entrega y reintento de las cuatro ventas: stock 8, reservado 0; cuatro movimientos ENTREGA, uno COMPRA y un registro de costo. SQL suma de movimientos físicos = 8, incluida alta inicial.
7. Ingreso manual L20 con reintento, egreso L10. Efectivo esperado = 100 + 115 + 30 + 20 − 10 = **L255**. Tarjeta L115 y transferencia L115 no inflan efectivo.
8. Cierre contado L255, diferencia 0, una auditoría. Ventas SQL suman L460; CxC y saldo cliente L85, CxP L600.

Las pruebas crean clusters PostgreSQL temporales, aplican migraciones únicamente allí y eliminan sus propios clusters. No usan una DATABASE_URL externa. La suite del ciclo ahora incluye el guard global TenantModuleGuard, además de controllers, JWT, validación y servicios reales. No equivale a desplegar el AppModule completo ni a verificar configuración productiva.

## Hallazgos

### QA-CLI-001 — P2 — Clientes: null produce HTTP 500

- Reproducción: ADMIN crea cliente por POST /api/clientes; PUT /api/clientes/:id con `{ "nombre": null }`.
- Esperado: 400 de validación, sin escritura.
- Real: 500. `@IsOptional()` omite null y `ClientesService.update` llama `dto.nombre.trim()`.
- Evidencia: caso `it.fails` QA-CLI-001 en ciclo PostgreSQL exige 400; el runner lo registra como **falla esperada**, nunca aprobación. Reproducción contra HTTP/Prisma reales.
- Riesgo: error interno ante datos incompletos en edición; no evidencia de alteración de dinero/inventario en este caso.
- Recomendación: validar nombre cuando no sea undefined, rechazar null y nombres vacíos tras trim, mantener contratos de borrado de campos opcionales. Corrección no implementada: esta fase prioriza evidencia y solo autoriza correcciones P0/P1.

### QA-APT-001 — P1 — Apartados sin persistencia financiera

- Reproducción desde código: `ApartadosPage.tsx` loadApartados/handleCrearApartado/abono guardan `ferre_mock_apartados_<tenant>` en localStorage. Usar otro navegador/almacenamiento vacío carga cero registros para tenant real.
- Esperado para operación real: apartado y abonos persistidos por tenant, auditados y conciliados con caja/inventario.
- Real: estado por navegador; no escrituras API para apartado/abono. Solo catálogo proviene de API.
- Evidencia: lectura de fuentes integrada en main; **no se ejecutó todavía la reproducción UI entre dos navegadores**. Brecha de implementación, no regresión de backend reproducida por HTTP.
- Riesgo: considerar registrado un cobro local no conciliado. No usar este módulo para dinero real.
- Recomendación: implementar backend transaccional e idempotente y aceptación de reglas antes de habilitar operación. Fuera del alcance de una corrección mínima; no se implementó.

### QA-TRA-001 — P1 — Transferencias entre sucursales locales

- Reproducción desde código: `TransferenciasPage.tsx` carga/escribe `ferre_mock_transferencias_<tenant>`; almacenamiento vacío no conoce las transferencias registradas.
- Esperado: transferencia persistida y movimientos origen/destino consistentes, con autorización y concurrencia.
- Real: listado local, sin transacción de traslado PostgreSQL; tampoco hay modelo de sucursal integrado según requisitos.
- Evidencia: fuentes integradas; validación UI entre dispositivos pendiente.
- Riesgo: operar como si el stock se hubiera transferido. No se confunde con transferencia bancaria.
- Recomendación: definir sucursales y persistencia transaccional antes de aceptación. No corregido por ser funcionalidad pendiente y requerir reglas de negocio.

P0 reproducidos abiertos en el alcance ejecutado: **0**. P1: **2 brechas de implementación**; P2: **1 defecto HTTP confirmado**; P3: **0**. Garantías se registra como dependencia de Claude, no como defecto a corregir aquí. Estos números no prueban ausencia de otros riesgos.

## Repetición

Desde backend:

```sh
PG_BIN=/ruta/postgresql/bin REAL_SETTINGS_BROWSER=1 \
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/ruta/chromium \
npm run test:integration
npm test
npm run test:scripts
npm run build
npm run lint
```

Desde frontend: `npm test`, `VITE_API_URL=/api npm run build`, `npm run lint`. No se ejecutó auditoría visual/UX ni suite completa de capturas. Chromium funcional contra API real está dentro de integración: login, recarga, conversión, POS y recuperación tras commit sin duplicar. Las unitarias y pruebas HTTP de guards con mocks se contabilizan como unitarias, nunca sustituyen PostgreSQL.

## Riesgos y segunda fase

Probar desde navegador, en este orden: jornada con ADMIN y CAJERO en dos sesiones; recuperación de respuesta perdida; renovar cotización vencida; entrega parcial/completa y reserva; abonos y arqueo con diferencia; compras/recepción/costos; levantamiento con cámara real. Verificar permisos y búsqueda de clientes con cajero. No aceptar Apartados/Transferencias/Garantías/Pedidos Especiales como persistentes hasta integrar sus backends y probar desde dos dispositivos.

Producción permanece sin inspección: esquema/migraciones, timezone, secretos, respaldos/restauración y hardware requieren validación autorizada. El diagnóstico readonly del Dashboard sigue disponible; no se ejecutó en producción. La aceptación del responsable debe cubrir reglas pendientes de sucursal, compras, anulación y corrección auditada; no se cambian aquí.

## PR y CI

CI del PR #119 fusionado: checks públicos «validate» (Operación de ferretería) y «test» (Playwright Tests) succeeded; runs 38025019468 y 38025019556. Esto acredita #119, **no esta nueva rama**.

La API GitHub sigue respondiendo Forbidden al acceso `gh api`; Git HTTPS funciona. No es evidencia de caída de GitHub. PR nuevo y CI de esta rama pendientes mientras esa API no sea accesible. No se atribuye un PR inexistente a la publicación de una rama.

## Resultado final de pruebas

| Suite | Ejecutadas | Aprobadas | Falla esperada | Falla inesperada |
| --- | ---: | ---: | ---: | ---: |
| Integración PostgreSQL, 14 archivos | 275 | 274 | 1 (QA-CLI-001) | 0 |
| Unitarias backend, 34 archivos | 329 | 329 | 0 | 0 |
| Scripts backend | 13 | 13 | 0 | 0 |
| Unitarias frontend | 178 | 178 | 0 | 0 |
| **Total de casos finales únicos** | **795** | **794** | **1** | **0** |

Sin omisiones en la suite final de integración con REAL_SETTINGS_BROWSER=1. La falla esperada de Clientes no se cuenta aprobada. Una ejecución aparte sin `it.fails` deja la reproducción roja: «expected 400 Bad Request, got 500 Internal Server Error». Los intentos iniciales de preparación del escenario de seguridad (tenant ajeno sin caja abierta) se corrigieron abriendo caja antes de comprobar producto ajeno; no son defectos de aplicación. Las repeticiones no se suman como casos nuevos.

Builds backend/frontend y lint terminaron sin errores; avisos existentes de strictNullChecks/hooks/configuración Vite y tamaño de bundle. Evidencia conservada en esta carpeta: logs finales de cada runner, builds y lint, más reproducción roja. Los errores sintéticos de triggers en logs prueban rollback y no son fallos inesperados de suite.

Rama publicada por Git HTTPS; commit de pruebas/evidencia `b98fb576`. Creación efectiva intentada con `gh pr create --base main --head qa/auditoria-integral-operativa --body-file /workspace/qa-integral-pr-body.md`: `Post "https://api.github.com/graphql": Forbidden`. **PR nuevo no creado; CI nuevo no ejecutado/verificado**. No hay PR de correcciones porque no se implementó corrección de aplicación; los P1 son brechas que requieren diseño y el defecto confirmado es P2. Crear el PR de evidencia en https://github.com/Nelosama/FerreSystem/pull/new/qa/auditoria-integral-operativa permite revisar los cambios y activar su CI. No hacer merge sin revisión.
