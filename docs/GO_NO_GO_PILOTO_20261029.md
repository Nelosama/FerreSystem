# GO / NO-GO — piloto controlado de Jowa System — 2026-10-29

**Actualización de consolidación (2026-10-29):** las 11 ramas de trabajo se integran en `main` por encargo expreso del dueño. La fotografía vigente, con SHA y CI verificados, está en la primera sección de `CONTEXTO_MAESTRO.md`; los bloques marcados como históricos conservan los estados anteriores. Se incorporan liveness, validación/regularización de ISV, límites aritméticos de compras, ocultación de módulos pendientes y bloqueo auditado de exenciones (incluida duplicación). El desglose por línea continúa apagado. Integrar código no certifica la preparación del piloto ni resuelve las decisiones fiscales y operativas pendientes.

**Decisión vigente: NO-GO para piloto con datos reales.** `main` `0d1b9252` tiene los dos workflows en verde: [Operación de ferretería 40980313884](https://github.com/Nelosama/FerreSystem/actions/runs/40980313884) y [Piloto API/PostgreSQL 40980313889](https://github.com/Nelosama/FerreSystem/actions/runs/40980313889). #223 ya está fusionado (merge `e254db28`) y corrige los dos fallos del SHA anterior `767888ac`. Siguen pendientes el ensayo con volumen en preproducción, Render, respaldos reales, decisiones fiscales, hardware y aceptación del cliente. La auditoría funcional está integrada; sus clasificaciones no equivalen a aceptación operativa.

Este documento no cambia producción ni fusiona ramas. Los SHA de §Estado de ramas se comprobaron el 2026-10-29, antes de la consolidación; la fotografía vigente está en `CONTEXTO_MAESTRO.md`.

## Estado de ramas — fotografía anterior a la consolidación (histórico)

| PR | Rama | SHA | Estado | CI del SHA |
| --- | --- | --- | --- | --- |
| #216 | `claude/p1-liveness-20261029` | `dce922b` | borrador, sin merge | `validate`, `test`, `guard-base-datos` en success |
| #217 | `claude/p2-fiscal-20261029` | `da48cb2` | borrador, sin merge | `validate`, `test`, `guard-base-datos` en success |
| rama | `claude/devoluciones-exenciones-20261029` | `874adc0` | sin PR (decisión del dueño pendiente) | no ejecutado en CI; pruebas locales abajo |

Estado histórico de otros PR antes de la consolidación (ya integrados): #213 docs GO/NO-GO de otra rama, #214 análisis de permisos, #215 SDK OpenAI (**no integrar** sin función que lo justifique).

## Clasificación funcional por módulo (actualización)

Clasificación técnica basada en `docs/AUDITORIA_FUNCIONAL_MODULOS.md`, actualizada con los cambios integrados. «LISTO» en el informe no equivale a autorización de piloto ni aceptación del cliente.

| Clasificación | Módulos |
| --- | --- |
| LISTO | POS, inventario, clientes, proveedores, caja, usuarios y permisos, Super Admin, entregas, levantamiento |
| PARCIAL | compras (límites aritméticos validados; conciliación y desglose pendientes), garantías (sin reclamo), contabilidad (sin asientos automáticos), reportes (solo resumen), contingencia offline (decisión D11) |
| PARCIAL fiscal | cotizaciones (validación de tasa y regularización integradas por #217; exenciones bloqueadas por #222; decisiones fiscales pendientes) |
| NO IMPLEMENTADO | apartados, transferencias entre sucursales, pedidos especiales, listas de precio |

**Módulos pendientes:** apartados, transferencias, pedidos especiales y listas de precio están ocultos por #220 (`62d2ef6c`). No forman parte de `DEFAULT_TENANT_MODULES` ni de los 13 módulos contratables (12 predeterminados y Contabilidad opt-in). Sus cuatro páginas de ejemplo fueron eliminadas. El fallo de CI del conteo de módulos se corrigió con #223 y `main` `0d1b9252` está verde. Reactivar un módulo exige implementar operaciones y persistencia reales.

## Estado de control T6 y compras

- **T6 (exenciones):** #222 bloquea crear, editar y convertir cotizaciones con líneas exentas para todos los roles; `main` también bloquea duplicarlas. Cada intento bloqueado se audita. La cobertura vigente es `test/exenciones-politica.postgres.integration.ts`; la prueba T6 de caracterización antigua se retiró en #219. El registro de autorización para habilitar exenciones sigue pendiente de D3/D5.
- **Compras (ISV):** #221 rechaza costos no positivos e ISV superior al subtotal. El archivo único `test/compras-isv.postgres.integration.ts` contiene las expectativas corregidas. La tasa aplicable, el desglose por línea y la conciliación con el crédito fiscal de libros siguen pendientes. Detalle en `docs/AUDITORIA_COMPRAS_ISV.md`.
- **Permisos:** un cajero no puede concederse permisos administrativos. Verificado en código y con `saas-onboarding` (1/1) y `centinela-verificacion-atlas` (en `main`).

## Bloqueos técnicos

| # | Bloqueo | Estado | Evidencia |
| --- | --- | --- | --- |
| T1 | Auditoría funcional de módulos (POS, cotizaciones, inventario, clientes, proveedores, compras, apartados, transferencias, pedidos especiales, listas de precio, garantías, devoluciones, caja, contabilidad, usuarios, reportes, Super Admin) | Informe integrado; validación operativa pendiente | `docs/AUDITORIA_FUNCIONAL_MODULOS.md` (#219); confirmar alcance y aceptación por módulo |
| T2 | Devoluciones con exención y redondeo | Integrado en `main` (ancestro verificado); sin despliegue verificado | `874adc0`: 8/8 pruebas PostgreSQL del desglose; ejemplo obligatorio L 50 (no L 55) |
| T3 | Migración `20261029000000_desglose_fiscal_linea` | Integrada en `main`, solo aditiva; **no ensayada** en copia de preproducción | Pruebas de ventas y reportes con la lista de migraciones actualizada: 70/70 |
| T4 | Rollback de la migración | Ensayo aislado documentado; pendiente en preproducción | `docs/ENSAYO_MIGRACION_DESGLOSE_20261029.md` y `docs/ROLLBACK_DESGLOSE_FISCAL_20261029.sql`; `DROP` exige `APROBACION-DESTRUCTIVA` |
| T5 | Política común de cálculo y reparto fiscal | Deuda de diseño sujeta a D6 | `calculo-fiscal-propuesta.ts` calcula una propuesta de totales y sigue desconectada; `desglose-fiscal.ts` reparte importes históricos con interruptor apagado. Revisar sus responsabilidades antes de activar el desglose |
| T6 | Auditoría de exenciones (quién marcó exento y por qué) | Política provisional integrada (#222): ninguna exención se concede. **Registro de autorización pendiente** | No existe registro de quién solicita ni de quién autoriza la marca exenta. Depende de D5 |
| T7 | Políticas de tasas de ISV en #217 | Implementada y probada (`politica-isv.ts`) | 500 %, 0 %, 18 % rechazados; cotizaciones antiguas al 0 % regularizables solo por ADMIN con auditoría |
| T8 | Liveness (#216) | Integrado en `main` (`689fe4e`); CI verde en `dce922b` | Sin defectos en la revisión; `/api/health/live` no consulta PostgreSQL; `/api/health` conserva readiness |

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
| D5 | ¿Quién puede marcar una línea exenta en cotizaciones? Hoy: bloqueado para todos los roles, con auditoría de intentos | Permisos y auditoría (T6) |
| D6 | Redondeo del ISV: por línea (cotización actual) o sobre la base gravada | Cálculo común |
| D7 | ¿`fiscal_tasas` pasa a ser la fuente de la tasa en ventas? | H3 |
| D8 | Reparto base/ISV en devoluciones de ventas con líneas exentas | Devoluciones |
| D9 | Encender `FISCAL_DESGLOSE_POR_LINEA` en producción | Después de D3, D6 y D8 |
| D10 | Ajustar asiento de devolución, ISV neto y libros al desglose | Contabilidad |
| D11 | Operaciones de contingencia con ISV incoherente: cerrar sin venta y facturar aparte | Contingencia |

## Qué significa GO

Un piloto controlado requiere, como mínimo: T1 completo con cada módulo clasificado; T3 ensayada en copia de preproducción con rollback; O1 y O2 verificados; D1–D6, D8 aprobadas por el contador; D9 decidida explícitamente. Hasta entonces, el sistema puede usarse en pruebas internas y ensayos, no con datos de clientes reales.

## Recomendación vigente

- CI técnico resuelto en `main` `0d1b9252`; #223 integrado. Revisar #224 como actualización documental.
- Completar los bloqueos operativos y decisiones fiscales antes de declarar GO; conservar el desglose apagado hasta autorización específica.

## Recomendación histórica, antes de la consolidación

- #216: integrado en `main` el 2026-10-29 (ver fotografía vigente).
- #217: integrado en `main` sin la aprobación del contador para H2 (ver fotografía vigente). Las decisiones D1, D2, D5 y D6 siguen pendientes.
- Rama de devoluciones: abrir PR en borrador solo si el dueño lo pide; no conectar el desglose hasta D3, D6 y D8.

---

## Dictamen tras la corrección de bloqueos (2026-10-29) — histórico, superado por la fotografía vigente de `CONTEXTO_MAESTRO.md`

**Dictamen: NO-GO.** Todos los defectos técnicos auditados tienen ya corrección en PR (en borrador). Ninguno está integrado en `main`, y la mayoría de las pruebas de integración de esas ramas están aún en CI o no se han ejecutado en preproducción.

### PR de corrección

| PR | Rama | Contenido | Estado |
|---|---|---|---|
| #216 | `claude/p1-liveness-20261029` | Liveness sin base de datos | Técnicamente listo; CI verde en su SHA |
| #217 | `claude/p2-fiscal-20261029` | Tasas de ISV autorizadas; cotizaciones antiguas regularizables | CI verde en su SHA; mergeable |
| #218 | `claude/auditoria-compras-isv-20261029` | Caracterización de compras (solo pruebas) | Su CI estaba en curso; **se vuelve obsoleto si #221 se integra** |
| #219 | `claude/auditoria-funcional-20261029` | Auditoría, matriz y GO/NO-GO | Documentación |
| #220 | `claude/modulos-no-implementados-20261029` | Ocultar apartados, transferencias, pedidos y listas de precio | Corregido un test e2e (17 → 13); CI en curso |
| #221 | `claude/correccion-compras-isv-20261029` | ISV ≤ subtotal y costo > 0 en compras | CI en curso |
| #222 | `claude/exenciones-politica-provisional-20261029` | Exenciones bloqueadas hasta D3 y D5, con auditoría de intentos | CI en curso |

### Dependencias entre PR

- **#221 y #218**: #218 fija el comportamiento anterior. Al integrar #221, retirar los casos DEFECTO CONOCIDO de #218 o usar solo su documento.
- **#217, #222 y #219** tocan `cotizaciones.service.ts` y las pruebas de ciclo de ventas. Se espera conflicto en la integración; hay que resolverlo a mano, sin cambiar la lógica validada de cada uno.
- **#219** incluye `exenciones-t6` con casos que fijan el comportamiento de exenciones anterior a #222. Retirar o sustituir al integrar #222.

### Bloqueos técnicos restantes

1. Integrar #217, #220, #221 y #222 en `main` tras CI completo y resolver conflictos.
2. Ensayo de la migración del desglose en preproducción (no hecho; solo en clúster aislado).
3. Pruebas de integración de #220 y #221 pendientes de confirmación de CI.
4. Desglose fiscal por línea y conciliación compras-libros: pendientes de decisión (no bloquean la venta gravada, sí la exención y el libro de compras).

### Bloqueos operativos (sin cambio)

- O1: configuración de Render (ruta de health check y SHA desplegado) sin verificar.
- O2: respaldos reales, RPO/RTO y restauración probada: sin verificar.
- O3–O5: hardware, red y aceptación del cliente pendientes.

### Bloqueos fiscales (sin cambio)

D1–D11 pendientes del contador y del dueño. Sin ellas no se habilitan exenciones, no se fija tasa de compras, no se conecta el cálculo fiscal consolidado y no se activa el desglose en producción.

### Condiciones para pasar a GO

Todas las siguientes: #217, #220, #221 y #222 integrados con CI completo; #219 actualizado tras esas integraciones; ensayo de migración en preproducción con rollback verificado; O1 y O2 verificados; decisiones D1, D2, D3, D5 y D6 aprobadas.
