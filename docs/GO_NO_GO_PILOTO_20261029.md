# GO / NO-GO — piloto controlado de Jowa System — 2026-10-29

**Decisión vigente: NO-GO.** No hay evidencia suficiente de controles críticos: falta auditoría funcional de todos los módulos, ensayo de migraciones en copia de preproducción, configuración de Render verificada y decisiones fiscales del contador. Esto no bloquea el trabajo técnico, pero sí cualquier piloto con datos de clientes.

Este documento no cambia producción ni fusiona ramas. Todos los SHA se comprobaron en GitHub el 2026-10-29 (ver §Estado de ramas).

## Estado de ramas (GitHub, 2026-10-29)

| PR | Rama | SHA | Estado | CI del SHA |
| --- | --- | --- | --- | --- |
| #216 | `claude/p1-liveness-20261029` | `dce922b` | borrador, sin merge | `validate`, `test`, `guard-base-datos` en success |
| #217 | `claude/p2-fiscal-20261029` | `da48cb2` | borrador, sin merge | `validate`, `test`, `guard-base-datos` en success |
| rama | `claude/devoluciones-exenciones-20261029` | `874adc0` | sin PR (decisión del dueño pendiente) | no ejecutado en CI; pruebas locales abajo |

Otros PR abiertos (no revisados en este bloque): #213 docs GO/NO-GO de otra rama, #214 análisis de permisos, #215 SDK OpenAI (**no integrar** sin función que lo justifique).

## Bloqueos técnicos

| # | Bloqueo | Estado | Evidencia |
| --- | --- | --- | --- |
| T1 | Auditoría funcional de módulos (POS, cotizaciones, inventario, clientes, proveedores, compras, apartados, transferencias, pedidos especiales, listas de precio, garantías, devoluciones, caja, contabilidad, usuarios, reportes, Super Admin) | **Pendiente** | No hecha en este bloque. Requiere su propio informe por módulo |
| T2 | Devoluciones con exención y redondeo | Resuelto en rama, sin desplegar | `874adc0`: 8/8 pruebas PostgreSQL del desglose; ejemplo obligatorio L 50 (no L 55) |
| T3 | Migración `20261029000000_desglose_fiscal_linea` | Solo aditiva y en rama; **no ensayada** en copia de preproducción | Pruebas de ventas y reportes con la lista de migraciones actualizada: 70/70 |
| T4 | Rollback de la migración | Sin ensayo | Procedimiento: con el interruptor apagado no hace falta revertir; `DROP` exige `APROBACION-DESTRUCTIVA` |
| T5 | Dos cálculos fiscales en paralelo | Deuda de diseño | `calculo-fiscal-propuesta.ts` (#217) y `desglose-fiscal.ts` (devoluciones) resuelven lo mismo con fórmulas distintas. Unificar antes de conectar cualquiera |
| T6 | Auditoría de exenciones (quién marcó exento y por qué) | **Pendiente** | No existe registro de autorización de la marca exenta en cotizaciones. Depende de decisión D5 |
| T7 | Políticas de tasas de ISV en #217 | Implementada y probada (`politica-isv.ts`) | 500 %, 0 %, 18 % rechazados; cotizaciones antiguas al 0 % regularizables solo por ADMIN con auditoría |
| T8 | Liveness (#216) | Técnicamente listo para merge | Sin defectos en la revisión; `/api/health/live` no consulta PostgreSQL; `/api/health` conserva readiness |

## Bloqueos operativos (fuera de software)

| # | Bloqueo | Estado |
| --- | --- | --- |
| O1 | Configuración de Render: ruta del health check y SHA desplegado | **No verificado** |
| O2 | Respaldos reales: frecuencia, cifrado, destino independiente, restauración probada | **No verificado** (solo simulacro en PostgreSQL efímero de CI, que no certifica respaldos productivos) |
| O3 | RPO / RTO aceptados por el dueño | **Pendiente** |
| O4 | Hardware y red de los puntos de venta | **Pendiente** |
| O5 | Aceptación del cliente y piloto con usuarios reales | **Pendiente** |

## Bloqueos fiscales (requieren contador y dueño)

| # | Decisión | Afecta |
| --- | --- | --- |
| D1 | ¿El ISV de cotizaciones queda en 15 % o se admite otra tasa (p. ej. 18 %)? | Tasas autorizadas |
| D2 | Exonerados (constancia del SAR): ¿qué pasa con 0 %, importe exonerado y cotizaciones antiguas al 0 %? | Política, conversión, regularización |
| D3 | ¿Qué productos son exentos y dónde se marca la exención (producto, línea o ambos)? | Esquema y reparto |
| D4 | ¿El POS en línea y sin conexión venden líneas exentas? | Dinero en cliente y servidor |
| D5 | ¿Quién puede marcar una línea exenta en cotizaciones? Hoy: cualquiera que cotiza; conversión con exentas solo ADMIN | Permisos y auditoría (T6) |
| D6 | Redondeo del ISV: por línea (cotización actual) o sobre la base gravada | Cálculo común |
| D7 | ¿`fiscal_tasas` pasa a ser la fuente de la tasa en ventas? | H3 |
| D8 | Reparto base/ISV en devoluciones de ventas con líneas exentas | Devoluciones |
| D9 | Encender `FISCAL_DESGLOSE_POR_LINEA` en producción | Después de D3, D6 y D8 |
| D10 | Ajustar asiento de devolución, ISV neto y libros al desglose | Contabilidad |
| D11 | Operaciones de contingencia con ISV incoherente: cerrar sin venta y facturar aparte | Contingencia |

## Qué significa GO

Un piloto controlado requiere, como mínimo: T1 completo con cada módulo clasificado; T3 ensayada en copia de preproducción con rollback; O1 y O2 verificados; D1–D6, D8 aprobadas por el contador; D9 decidida explícitamente. Hasta entonces, el sistema puede usarse en pruebas internas y ensayos, no con datos de clientes reales.

## Recomendación

- #216: técnicamente listo para merge. Espera autorización del dueño.
- #217: mantener en borrador. Las decisiones D1, D2, D5 y D6 son fiscales.
- Rama de devoluciones: abrir PR en borrador solo si el dueño lo pide; no conectar el desglose hasta D3, D6 y D8.
