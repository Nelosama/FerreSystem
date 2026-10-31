# FerreSystem — contexto maestro y continuidad entre agentes

## Integración autorizada y bloqueo de despliegues — 2026-10-30 (America/Tegucigalpa)

- El dueño confirmó «Yes» para integrar por merge los PR #230, #231, #227, #228, #225 y #229, verificando CI por SHA. Esta autorización sustituye la prohibición anterior de merge; siguen prohibidos despliegues, cambios en bases reales y eliminación de ramas.
- Base remota comprobada: `main` `46f7db7d74c04ce9c9fd3dbbe6e0eaa9e8810412`. Los seis heads publicados mantienen ambos workflows en success. No se ha hecho todavía ningún merge de esta etapa.
- Vercel: confirmado despliegue de producción de `main` `46f7db7`; antes de fusionar se bloquean despliegues automáticos para main y las seis ramas en `frontend/vercel.json` y `frontend/scripts/vercel-ignore.sh`. El sitio existente no se suspende. Reactivar despliegues requiere otra autorización y retirar deliberadamente este bloqueo.
- Render (consulta autorizada en My Workspace): servicio FerreSystem `srv-datjl3ek1f9s738hmh6g`, rama main, `autoDeploy=yes`, trigger commit. Comando de arranque observado: `npx prisma migrate deploy && node dist/main.js`; healthCheckPath vacío. **No se puede fusionar mientras Auto-Deploy siga activo**, porque iniciaría un despliegue con posibilidad de migración de la base real. El conector disponible no permite cambiar ese ajuste; se pidió al dueño poner Auto-Deploy en Off, sin suspender el servicio. Debe confirmarse con una lectura nueva antes del primer merge.
- Bloqueo de Vercel comprobado localmente: 45/45 pruebas de guardia y cabeceras; sin invocar despliegues. El CI del nuevo commit se verifica por su propio SHA.
- NEXUS: no se añaden cambios de esquema ni migraciones. Persisten el NO-GO para datos reales, decisiones fiscales, respaldos, hardware y aceptación. Las fotografías siguientes conservan evidencia histórica; la autorización y el bloqueo de esta sección prevalecen.

## Sincronización de PR — 2026-10-30 (America/Tegucigalpa)

- Base remota confirmada: `main` `46f7db7d74c04ce9c9fd3dbbe6e0eaa9e8810412`; incluye el merge de #226 y su head `ba41159ff416f495fb0dc18eaf44ac0648308bcf`.
- Comisiones está excluido del piloto: no contratable ni navegable, también con permisos históricos. No se implementó su cálculo; AUD-COM-01/02/03 describen código residual que requiere especificación e implementación antes de reactivarse. La exclusión ya está integrada; no requiere otro merge de #226.
- #225, #227, #228, #229, #230 y #231 siguen separados de `main`. Esta actualización incorpora `origin/main` conservando historial; no integra los PR entre sí. La evidencia y el CI deben consultarse en cada PR por su SHA publicado, sin heredar resultados de heads anteriores.
- NEXUS: no se añaden cambios de esquema ni migraciones. Integración y E2E usan exclusivamente PostgreSQL temporal y datos sintéticos. Sin bases reales, merge a main, despliegues ni eliminación de ramas.
- Persisten decisiones fiscales D1–D11/CAI, infraestructura y respaldos reales, hardware y aceptación del cliente. Preparar un PR para integración no concede GO para producción.

## PR #226 — bloqueo de Comisiones auditado — 2026-10-30 UTC

- Encargo vigente: auditar y corregir #226 sin merge, despliegues ni bases reales; fiscalidad, SMTP e infraestructura quedan en Claude. Head remoto inicial comprobado: `a9113213ff8c4f3e247a6f6944a65770668f2f03`; base `main` `a4ab291aba1a8574e9c66d59b044e35f938bda38`.
- Backend: `moduleEnabled` rechaza Comisiones incluso con `enabled=true`; no está en defaults ni catálogo configurable y el seed no lo crea. Frontend: guardia de URL y navegación rechazan el módulo incluso con sesiones antiguas. No se implementan cálculos ni se eliminan datos.
- Correcciones de auditoría: indicadores del Super Admin cuentan solo módulos contratables; controles ignoran dependencias de módulos pendientes. Pruebas de navegador conservan todos los 12 controles operativos y excluyen Comisiones. Prueba HTTP real crea un registro histórico sintético, exige rechazo 400 al configurar Comisiones y comprueba POS/entregas/devoluciones/caja/cuentas. Regresión de navegación verifica ADMIN con lista antigua y sin lista; alta de tenant verifica ausencia de Comisiones.
- Evidencia local inicial: backend 76 archivos / 835 pruebas aprobadas; frontend 575/575; scripts 52/52; builds backend/frontend y lint sin errores (avisos existentes). Regresión backend tras cambios: 49/49. Las pruebas PostgreSQL y navegador definitivas y CI se registran en la descripción del PR con su SHA y enlaces; no se heredan verdes de otro SHA.
- Seguimiento de CI: el piloto de `63f0f820` detectó dos contratos antiguos adicionales en `frontend/e2e-real/guide-real.spec.ts` (control Comisiones y 13 contratables). Se conservan los escenarios operativos y se exige ausencia de Comisiones con 12 contratables. Se añade prueba real de registro histórico `enabled=true`, rechazo API 400, menú/URL en escritorio y móvil, preservación del registro y acceso a ventas/usuarios/caja. Resultados y SHA definitivo se publican en la descripción del PR.
- Sin conflictos con `main` comprobado mediante `git merge-tree --write-tree HEAD origin/main`. Dictamen definitivo y resultados remotos: descripción de https://github.com/Nelosama/FerreSystem/pull/226. El GO de piloto sigue pendiente de decisiones fiscales, infraestructura, hardware y aceptación; la validación de este PR no concede GO.


## Fotografía vigente — 2026-10-29 (America/Tegucigalpa; verificada en GitHub)

Esta fotografía describe `main` en el SHA indicado. Las secciones posteriores conservan su valor de bitácora histórica; cuando difieran, prevalece esta fotografía. Los resultados de CI se vinculan a su propio SHA.

**Dictamen: NO-GO para piloto con datos reales.** El CI de `main` está verde; siguen pendientes las verificaciones operativas y las decisiones fiscales de abajo.

### `main` y CI

- **SHA verificado:** `0d1b925275e73ea012bb5454a2c9c67a56db668f` (`0d1b9252`).
- **Operación de ferretería:** [run 40980313884](https://github.com/Nelosama/FerreSystem/actions/runs/40980313884), evento `push`, SHA `0d1b9252`: **success**. Jobs `validate` y `guard-base-datos` aprobados; incluye navegador, backend e integración PostgreSQL.
- **Piloto con API y PostgreSQL reales:** [run 40980313889](https://github.com/Nelosama/FerreSystem/actions/runs/40980313889), mismo SHA: **success**. El nombre del workflow no certifica aceptación de un piloto en el negocio.
- **Antecedente resuelto:** `767888ac` tenía `validate` en rojo ([run 40828624758](https://github.com/Nelosama/FerreSystem/actions/runs/40828624758)): conteo desactualizado de módulos en `saas-onboarding` y `RangeError` de importes ausentes en `contingencia-rechazada`. #223 corrige ambos y ya está integrado. Ese rojo pertenece al SHA anterior.
- **Vercel:** check de GitHub **success** en `0d1b9252`. No equivale a una prueba funcional del sitio ni acredita la configuración de Render.
- **Referencias remotas comprobadas:** `main` y `docs/estado-real-20261029` (#224). La rama integrada de #223 fue retirada. Esta fotografía no incorpora #224 a `main`: #224 sigue en borrador.

### Integraciones comprobadas por ancestría Git

| PR / trabajo | SHA integrado | Situación vigente |
| --- | --- | --- |
| #213 | `a5050c6f` | Documentación de preparación; no se atribuyen workflows propios a ese SHA |
| #214 | `210e0091` | Análisis histórico de permisos; prevalece la política SUPERADMIN de #211 |
| #215 | `aec2262e` | SDK OpenAI instalado; sin consumidor funcional y desactivado sin clave. Decisión sobre utilidad o retirada pendiente |
| #216 | `dce922b8` | Liveness independiente de PostgreSQL; readiness permanece separado |
| #217 | `da48cb21` | Cotizaciones nuevas solo admiten 15 %; las antiguas con tasa no autorizada requieren regularización ADMIN auditada. La aprobación fiscal de D1–D11 no queda concedida por el merge |
| #218 y #221 | `afab804e`, `d03aefc8` | Auditoría y corrección aritmética de compras: costo positivo e ISV no superior al subtotal; no resuelve conciliación con libros ni desglose por línea |
| #219 | `3f76b2f3` | Auditoría funcional y fiscal integrada; se retiró la prueba T6 anterior a la política provisional |
| #220 | `62d2ef6c` | Cuatro módulos pendientes ocultos y excluidos de servicios contratables. El fallo de conteo de `saas-onboarding` en esta rama quedó corregido por #223 |
| #222 | `73a9721d` | Exenciones de línea bloqueadas para todos los roles; intentos auditados. `main` extiende el bloqueo a duplicar cotizaciones exentas |
| Devoluciones / desglose | `84f9b14`, `874adc0`, `5982c7ea` | Migración aditiva integrada; escritura de desglose apagada por defecto. Propuesta sujeta a decisiones fiscales |
| #223 | `21d2b427`; merge `e254db28` | Fusionado y rama retirada tras revisión autorizada. Corrige los dos fallos de `main`, el validador de inventario y la guía del cliente |

**#223 revisado:** sus dos workflows estaban verdes en `21d2b427`; se repitieron localmente 30/30 pruebas PostgreSQL de SaaS/contingencia y 11/11 Python del validador. El código de `0d1b9252` coincide con ese head; solo se añadió la bitácora del merge. Además, los dos workflows del `main` publicado terminaron en verde en su SHA propio, como se enlaza arriba.

### Bloqueos abiertos y alcance de la evidencia

| Área | Estado vigente |
| --- | --- |
| CI de `main` | **Resuelto en `0d1b9252`**; comprobar de nuevo ante cualquier SHA posterior |
| Render: health check, SHA desplegado y variables | **No verificado** |
| Respaldos productivos, restauración probada y RPO/RTO | **No verificado**; los ensayos de CI usan bases efímeras |
| Migración `20261029000000_desglose_fiscal_linea` y rollback | Ensayo aislado documentado; **pendiente en copia de preproducción con volumen representativo** |
| D1–D11 y aprobación fiscal del contador/dueño | **Pendientes**; el merge no las sustituye y no activa `FISCAL_DESGLOSE_POR_LINEA` |
| Factura fiscal configurable por empresa | **No implementada**; pendiente alcance de CAI e interruptor |
| Auditoría funcional | Informe integrado en `AUDITORIA_FUNCIONAL_MODULOS.md`; quedan validación del alcance y aceptación del piloto |
| Hardware de caja, impresora, lector y red física | **No probado** |
| Aceptación del cliente | **Pendiente** |
| SDK OpenAI | Presente, sin uso funcional; decisión de alcance pendiente |

**Bitácora de #224:** sincronización por merge normal con `main` `0d1b9252`, conservación del registro de #223, actualización de esta fotografía y del GO/NO-GO, revisión de SHA citados y diff limitado a dos Markdown. Los checks propios del nuevo head de #224 se consultan por ese head; el verde de `main` no se les atribuye. Sin cambios de código, esquema o configuración operativa en este PR.

---

## PR #223 integrado — 2026-10-29 (America/Tegucigalpa)

- **Autorización:** el dueño aprobó revisar e integrar #223, comprobar CI del resultado y retirar su rama integrada. #224 permanece separado, en borrador; no se modifica su rama ni se fusiona su fotografía documental.
- **Revisión:** head `21d2b4271825410a84a4f4432f2633de127e8d16`, basado exactamente en `main` `767888ac`. Ocho archivos: guardia de importes fiscales ausentes en contingencia, expectativa de módulos SaaS, validador de inventario y documentación. Sin cambios de tasas, exenciones, esquema ni migraciones. Los importes ausentes quedan como conflicto DURO `IMPORTE_FISCAL_INCONSISTENTE`; no se convierten en venta.
- **Evidencia previa al merge:** workflows de ese head aprobados: Operación de ferretería [40830962357](https://github.com/Nelosama/FerreSystem/actions/runs/40830962357) (validate y guard-base-datos success) y Piloto con API/PostgreSQL [40830962352](https://github.com/Nelosama/FerreSystem/actions/runs/40830962352) success. Repetición local: 30/30 PostgreSQL (`saas-onboarding`, `contingencia-rechazada`, `contingencia-p3-fiscal`) y 11/11 Python del validador, en base temporal.
- **Merge:** #223 pasa de borrador a revisado y se fusiona mediante merge normal `e254db281b8560e5f825150b8f0ed9e3e433eb7c`, con comprobación del head esperado. Esta bitácora se publica después del merge; los workflows del `main` resultante deben comprobarse por su SHA propio, sin heredar los verdes del PR.
- **Pendientes vigentes:** NO-GO de piloto. OpenAI/ISV y decisiones fiscales, ensayo en preproducción, Render, respaldos/restauración, hardware y aceptación del cliente conservan sus pendientes. No se ejecutaron comandos sobre bases reales ni cambios de hosting; el push puede activar las automatizaciones existentes.

## Consolidación autorizada de las 12 ramas — 2026-10-29 (America/Tegucigalpa)

- **Encargo del dueño:** unificar y fusionar las ramas para conservar únicamente `main`. Este encargo autoriza los merges y la retirada de las ramas integradas; sustituye los bloqueos históricos de merge que siguen como bitácora debajo. No concede decisiones fiscales pendientes ni activa funciones opcionales.
- **Base comprobada:** `origin/main` `3a6c6695`. Se integran mediante merges normales, conservando sus commits: #213 preparación de producción (`a5050c6f`), #214 análisis histórico (`210e0091`), #215 SDK OpenAI (`aec2262e`), #216 liveness (`dce922b8`), #217 fiscal (`da48cb21`), #218 auditoría compras (`afab804e`), #221 corrección compras (`d03aefc8`), desglose y devoluciones (`5982c7ea`), #219 auditoría funcional (`3f76b2f3`), #220 módulos (`62d2ef6c`, incluye ajuste concurrente del payload de servicios) y #222 exenciones (`73a9721d`).
- **Conflictos resueltos:** se conservan la política SUPERADMIN de #211, la regularización de tasas antiguas de #217 y el bloqueo auditado de exenciones de #222. Se extiende el bloqueo a duplicar cotizaciones exentas; la regularización tampoco puede conceder exenciones. Se retiran los enlaces `backend/node_modules` introducidos por ramas de auditoría. Las recomendaciones anteriores de #214 quedan identificadas como históricas.
- **Pruebas compatibles:** compras mantiene un único archivo de integración actualizado. Las pruebas P2 ahora rechazan exenciones según T6; las devoluciones mixtas se prueban con ventas históricas sintéticas, sin desactivar el bloqueo del servicio. El desglose fiscal sigue apagado por defecto; no se cambian tasas, secretos ni configuración de hosting.
- **NEXUS — revisión de esquema:** una migración aditiva `20261029000000_desglose_fiscal_linea`, columnas opcionales y CHECK; sin relleno de ventas históricas ni borrado de datos. `prisma validate` y `generate` correctos; control de migraciones correcto (1 nueva). Bases de prueba exclusivamente temporales, PostgreSQL 17.11 extraído en `work/pg` sin privilegios de instalación. El código nuevo requiere aplicar esa migración antes de arrancar; no se ejecutan comandos contra una base productiva.
- **Validación local:** backend 76 archivos / **836 pruebas aprobadas**; frontend **575/575**. Builds de ambos paquetes y lint sin errores (avisos existentes); `prisma validate` y `generate`, 52 pruebas de scripts, 10 Python y control de migraciones correctos. Integración dirigida de seis archivos: **60 aprobadas / 1 omitida**, contando la repetición final de Cotizaciones 11/11 tras corregir el fixture. Incluye compras ISV, P2+T6, ciclo de ventas, devoluciones y protección fiscal offline. Navegador dirigido: **37/37** (guía, excepción de precio de cotizaciones y POS). La pasada general de navegador se interrumpió voluntariamente tras 54 aprobadas para centrar la verificación en el cambio; no se declara aprobada toda la suite de navegador.
- **Ajuste concurrente:** #220 avanzó a `62d2ef6c` durante la revisión. Incorporado mediante merge normal: se usa `MODULOS_CONTRATABLES` al guardar servicios para no enviar claves que el backend rechaza. Build y lint frontend repetidos; 16 pruebas de módulos/móvil/fechas aprobadas después del ajuste.
- **Validación final adicional:** esquema/deriva, migraciones, arranque controlado, ventas, reportes y barrido de aislamiento: 6 archivos / **111 aprobadas, 1 omitida**. Total PostgreSQL dirigido de la integración: **171 aprobadas / 2 omitidas** en 12 archivos; no es la suite PostgreSQL completa. Repetición del navegador tras el ajuste concurrente: **3/3** (guardar interruptores de Super Admin y 13 controles en escritorio/móvil). Build backend final correcto. Sin pruebas físicas ni certificación de despliegues.
- **Publicación y limpieza:** `main` contiene los commits de las 11 ramas; publicación mediante push normal, sin rebase ni force push de `main`. La retirada de cada rama usa su SHA esperado y exige que sea ancestro de `main`, para conservar cualquier cambio concurrente. Respaldo local previo de todas las referencias en `work/pre-consolidation.bundle`; los commits integrados también permanecen en el historial de `main`. Los workflows remotos corresponden al SHA publicado y se comprueban después del push; los verdes de las ramas no certifican el `main` combinado. No se modifican servicios ni variables de hosting desde esta tarea; el push puede activar las automatizaciones existentes.
- **Pendientes de negocio/operación:** la consolidación no acredita GO de piloto: decisiones fiscales D1–D11, ensayo con volumen en preproducción, respaldos/restauración y configuración real de hosting, dispositivos físicos y aceptación del cliente siguen pendientes. OpenAI sigue desactivado si falta clave; `FISCAL_DESGLOSE_POR_LINEA` no se activa.

Última revisión: **2026-10-29 UTC** — P1 (#216, liveness) con CI final de `264655e5` y corrección del barrido; P2 fiscal (ISV de cotizaciones, exenciones, `FiscalTasa`) en `claude/p2-fiscal-20261029`. Ver la primera sección. Sin merge ni despliegue.
Última revisión: **2026-10-29 UTC** — consolidación fiscal en `claude/devoluciones-exenciones-20261029` (`874adc0`, sobre `main` `3a6c669`): desglose por línea apagado por defecto y ejemplo obligatorio de devolución exenta (L 50). Estado GO/NO-GO en [GO_NO_GO_PILOTO_20261029.md](GO_NO_GO_PILOTO_20261029.md): **NO-GO**. Sin merge, sin despliegue, sin datos reales.

## Consolidación fiscal y GO/NO-GO — 2026-10-29 UTC

- **Estado remoto comprobado en GitHub:** #216 `dce922b` (validate, test, guard-base-datos en success; borrador); #217 `da48cb2` (validate, test, guard-base-datos en success; borrador). Sin merge.
- **Hallazgo de diseño:** `desglose-fiscal.ts` existe solo en esta rama (`84f9b14`). #217 tiene `calculo-fiscal-propuesta.ts`, con otra fórmula para lo mismo. Unificar antes de conectar cualquiera (T5 en el informe).
- **Cambios:** `874adc0` añade la prueba obligatoria (L 100 gravado + L 50 exento; devolver la exenta reembolsa L 50; reintento idempotente) y redondeo con descuento de 0.01.
- **Pruebas:** `test/desglose-fiscal-devoluciones.postgres.integration.ts` 8/8 en PostgreSQL 16 temporal; `ventas` y `reportes-zona-horaria` 70/70 con la lista de migraciones actualizada.
- **Pendiente real:** auditoría funcional de módulos (T1), auditoría de exenciones (T6), ensayo de la migración en preproducción (T3), verificación de Render y respaldos (O1, O2). No declarado completo en esta ronda.
- **NEXUS:** migración solo aditiva, probada en clúster temporal; no ejecutada contra datos reales.
Última revisión: **2026-10-29 UTC** — auditoría funcional y fiscal (rama `claude/auditoria-funcional-20261029`, sobre `main` `3a6c669`). Módulos: [AUDITORIA_FUNCIONAL_MODULOS.md](AUDITORIA_FUNCIONAL_MODULOS.md); fiscal: [CONSOLIDACION_FISCAL.md](CONSOLIDACION_FISCAL.md); exenciones T6: [AUDITORIA_EXENCIONES_T6.md](AUDITORIA_EXENCIONES_T6.md); GO/NO-GO: [GO_NO_GO_PILOTO_20261029.md](GO_NO_GO_PILOTO_20261029.md) (**NO-GO**). Compras ISV en PR #218 (borrador). Sin merge, sin despliegue, sin datos reales.

## Auditoría funcional y fiscal — 2026-10-29 UTC

- **Módulos:** LISTO: POS, inventario, clientes, proveedores, caja, usuarios, Super Admin, entregas, levantamiento. PARCIAL: compras, garantías, contabilidad, reportes, contingencia. BLOQUEADO en `main`: cotizaciones (corregido en #217). NO IMPLEMENTADO: apartados, transferencias, pedidos especiales, listas de precio: ocultar en el piloto; hoy están activos por defecto (`DEFAULT_TENANT_MODULES`).
- **Hallazgo:** `ApartadosPage`, `TransferenciasPage`, `PedidosEspecialesPage` y `ListasPrecioPage` no se importan y guardan datos de ejemplo en `localStorage`. No reactivar sin rehacer.
- **Fiscal:** comparación medida de `calcularTotales`, propuesta #217 y desglose: mismos totales en los casos medidos; mecánica distinta. Propuesta de módulo único con política de redondeo como parámetro (D6). Sin conexión a operaciones.
- **T6:** cualquier VENDEDOR o CAJERO marca líneas exentas sin autorización ni auditoría. Pruebas en `exenciones-t6.postgres.integration.ts` (5/5). Recomendación: no permitir exentas en el piloto.
- **Compras:** ISV sin validar (acepta 10× el subtotal); sin conciliar con `fiscal_documentos`. Caracterizado en PR #218 (9/9).
- **Pendiente:** ensayo de migración en preproducción; verificación de Render y respaldos (O1, O2); decisiones D1–D11.

Última revisión: **2026-10-28 UTC** — interfaz de excepción de precio (POS y conversión de cotizaciones) en `claude/stoic-gates-sxbg8u` sobre `main` `53e2cc9` (#209); concesión del permiso bloqueada por decisión pendiente. Ver la primera sección. Sin merge ni despliegue.

Última revisión: **2026-10-28 UTC** — consolidación #207 + #200 sobre `main` `a436584` (#203) en `claude/laughing-euler-tplk31`; ver la primera sección. Sin merge ni despliegue.
Última revisión: **2026-10-28 UTC** — revisión de preparación de producción contra GitHub en `claude/preparacion-produccion-20261028` (PR #213, base `main` `848758b` tras el merge de #210); ver la primera sección. Sin merge ni despliegue. Anterior: **2026-10-28 UTC** — consolidación #207 + #200 sobre `main` `a436584` (#203) en `claude/laughing-euler-tplk31`. Sin merge ni despliegue.
Última revisión: **2026-10-28 UTC** — PR #211 incorporado sobre `main` `848758b` (#210) en `claude/pr-211-permissions-analysis-6nwjcg`; fallos de navegador de `validate` corregidos por #210; decisiones de `pos.excepcion_precio` documentadas, no implementadas; ver la primera sección. Sin merge ni despliegue.

Anterior: **2026-10-28 UTC** — consolidación #207 + #200 sobre `main` `a436584` (#203) en `claude/laughing-euler-tplk31`. Sin merge ni despliegue.

Última revisión: **2026-10-26 UTC** — consolidación de autenticación #200 + #201 en `claude/consolidate-auth-pr200-201-xz1q5m` (sin merge ni despliegue); ver la primera sección.

Última revisión: **2026-10-24 UTC** — auditoría de preparación para piloto (solo pruebas, sin cambios de producto) en `claude/kind-pasteur-ilo43m`; ver la primera sección. Anterior: **2026-10-23 UTC** — rediseño de navegación del Super Admin y del cajero (layout híbrido) en la rama `claude/amazing-bohr-9e5bpj`, sincronizada con `main` `ba201465` (PR #190, SweetAlert2); ver las secciones siguientes, sin merge ni despliegue. PR #189 sincronizado mediante merge normal con `main` `86bd1d74`, que ya incorpora #185 y #188. Sin cambios en producción.

Última revisión: **2026-10-23 America/Tegucigalpa** — revisión PR #195 con TOPNAV/SIDEBAR restaurado (ver sección vigente abajo); antecedentes:  rama `claude/sweet-davinci-vh7br4` sincronizada con `main` `01f9110` (PR #194) mediante merge normal; ver «Sincronización con main» abajo; **navegación híbrida única y mejoras UX/UI de Stitch** en la rama `claude/sweet-davinci-vh7br4` (base `main` `b60b49b`, con #193 ya fusionado; ver la primera sección); antes, rediseño de navegación del Super Admin y del cajero (layout híbrido) en la rama `claude/amazing-bohr-9e5bpj`, sincronizada con `main` `ba201465` (PR #190, SweetAlert2); ver las secciones siguientes, sin merge ni despliegue. PR #189 sincronizado mediante merge normal con `main` `86bd1d74`, que ya incorpora #185 y #188. Sin cambios en producción.

Última revisión: **2026-10-25 UTC** — rama `feat/contabilidad-honduras` (PR #180) actualizada con `main` `2f6168d` (PR #198: autenticación, MFA y recuperación; navegación híbrida; control de módulos). Contabilidad sigue opt-in y apagada por defecto. Sin merge ni despliegue.

Antecedentes: #185 integró las mejoras operativas y seguridad #183; #188 incorporó la ronda de UX, marca y navegación. Se conservan sus bitácoras y evidencias a continuación. Detalle de seguridad: [REVISION_SEGURIDAD_20261020.md](REVISION_SEGURIDAD_20261020.md).

**PR #180 (Contabilidad, Honduras):** actualizado con `main` `24ae784` por merge normal; motor contable, navegación del CONTADOR y libro mayor añadidos; persistencia de asientos automáticos bloqueada por autorización de esquema (propuesta NEXUS); ver su sección más abajo. Contabilidad permanece **apagada por defecto**; sin merge, despliegue ni migraciones en producción.

**Lectura económica:** leer desde el inicio hasta `FIN DEL CONTEXTO VIGENTE`. No cargar todo el archivo por defecto: después hay un anexo con los 20 documentos originales completos. Consultar únicamente la sección histórica relevante. La longitud del anexo no obliga a consumirlo en cada sesión.

## P1 #216 y P2 fiscal — 2026-10-29 UTC (sin merge, sin despliegue, sin producción ni datos reales)

- **P1 — PR #216 (`claude/p1-liveness-20261029`, borrador):** resultado final de CI del SHA `264655e5`: `test` (piloto API + PostgreSQL, run `40812744200`) **verde**; `guard-base-datos` **verde**; `validate` (run `40812744202`, job `123246724551`) **rojo**: integración 1204/1206, 2 fallos en `test/aislamiento-barrido.postgres.integration.ts` porque `GET /api/health/live` (pública por diseño, como `/api/health`) no estaba en `PUBLICAS`. Corregido en `dce922b` (solo el inventario de la prueba + evidencia en `docs/EVIDENCIA_P0_P1_20261029.md`); local con PostgreSQL 16 real: barrido 7/7. **CI de `dce922b` pendiente**: el PR sigue en borrador hasta verlo verde. Render (ruta de health check, SHA desplegado) sigue sin verificar.
- **P2 — rama `claude/p2-fiscal-20261029`** (sobre `main` `3a6c6695`; diagnóstico completo en [AUDITORIA_P2_FISCAL_20261029.md](AUDITORIA_P2_FISCAL_20261029.md), que corrige el error de H3 de `60b924b`):
  - **H1 corregido** (`0ad9e6b`): `backend/src/common/politica-isv.ts` centraliza las tasas autorizadas = solo `TASA_ISV_PORCIENTO` (la que ya aplican POS y configuración; ninguna tasa nueva). DTO de cotización (`@IsIn`, dos decimales, sin `null`) y servicio (create, update de cotización antigua, duplicate, límite estructural `0 ≤ t < 100` al convertir, también para ADMIN). Pantalla: selector en lugar de campo libre (`frontend/src/utils/politica-isv.ts`). **Cambio de comportamiento:** la API ya no crea cotizaciones al 0 %; las antiguas siguen convirtiéndose solo por ADMIN (JW-04 adaptado como dato heredado).
  - **H2 diagnosticado, no conectado:** la exención solo existe como casilla por línea en cotizaciones; no hay marca en `productos` ni en `detalles_venta`; venta en línea y POS sin conexión gravan todo; la venta convertida conserva importes históricos pero pierde la marca por línea (Contabilidad la reconstruye desde la cotización); las devoluciones de ventas con líneas exentas reparten mal el ISV. Propuesta pura `backend/src/common/calculo-fiscal-propuesta.ts` (`4184e16`), idéntica a `calcularTotales` sin exentas; sin uso en rutas.
  - **H3:** `fiscal_tasas` **sí se usa** en Contabilidad (tasas, libros, reportes; permisos `contabilidad.ver/configurar`). Conservar; no activarla en ventas sin D7.
  - **Pruebas locales:** backend unitarias **72 archivos / 811** (`main`: 70 / 750; +39 política, +6 propuesta, +16 servicio), build y lint sin errores; frontend **573/573**, `tsc -b`, build (`VITE_API_URL=/api`) y lint sin errores; PostgreSQL 16 real: `cotizaciones` 10/10, `ciclo-ventas` 21/21 + 1 omitida (navegador); integración completa local **67 archivos / 1207 aprobadas, 1 omitida** (Chromium real sin `REAL_SETTINGS_BROWSER`); CI de la rama pendiente.
  - **Pendientes reales:** decisiones D1–D8 del contador/dueño (tabla en el informe); CHECK en `cotizaciones.porcentaje_isv` solo tras auditar datos (consulta de solo lectura propuesta, no ejecutada); conexión del cálculo común (esquema NEXUS + espejo `money.ts`); PR P2 en borrador; aceptación del cliente, merge y despliegue no realizados.
- **Entorno:** PostgreSQL como root con envolturas `runuser -u nobody` en `/var/tmp/ferre-pgbin` y `TMPDIR=/var/tmp/ferre-pg` (1777), según la nota de entorno existente.
- **NEXUS:** sin cambios de esquema ni migraciones en P1 ni P2.

## PR #211 — corrección de expectativas de integración tras política ADMIN (2026-10-28 UTC)

- Head remoto/PR comprobado antes de empezar: `171de34c`. Integrado `origin/main` `4c9ec9bc` (#212) mediante merge normal `963641fd`; sin force push. Revisión de código: no se encontró un defecto de producción asociado a estos fallos; no se cambian servicios ni lógica de precios.
- Leídos los logs completos de jobs `123013361254` (workflow Operación de ferretería, run `40744094950`) y `123013270192` (Piloto con API y PostgreSQL reales, run `40744094946`), y artefacto `piloto-real-evidence` `12841716140` (contexto y traza). Fallos distintos: (1) preparación de `pilot-permisos-real.spec.ts` creaba ADMIN por `/usuarios`, esperaba 201 y recibía 403; 177 pasaban, 1 fallaba, 4 omitidas, 3 sin ejecutar. (2) `ventas.postgres.integration.ts` esperaba un mensaje de último ADMIN/autocuenta en vez de ForbiddenException. (3) cuatro roles en `administracion-cloud.postgres.integration.ts` esperaban 4 eventos y ahora reciben 5 por la concesión auditada. PostgreSQL: 1200 aprobadas / 5 fallidas; no todos los fallos eran expectativas de autorización.
- Corrección: piloto crea ADMIN con SUPERADMIN por ruta de plataforma, mantiene creación de no ADMIN por ADMIN y añade rechazos 403 de alta/edición/permisos/baja propia y de otro ADMIN. PostgreSQL comprueba conjuntos exactos de eventos y actor/beneficiario/permiso; añade concesión/revocación de excepción y revocación al cambiar rol aunque se reenvíe. La prueba de ventas conserva alta y baja de empleado y valida también la concesión auditada inicial.
- Local: suite backend **70 archivos / 750 aprobadas**; build, lint backend y validación Prisma correctos (URLs ficticias locales, sin conexión a BD); lint del spec de piloto y descubrimiento Playwright `--list` correctos (4 tests registrados, **no ejecutados**). `git diff --check` correcto. **No se ejecutó PostgreSQL ni piloto real localmente**, por falta de PostgreSQL; deben verificarse en los nuevos workflows del SHA publicado, sin reutilizar checks anteriores.
- Bitácora: Git/head/CI actuales, logs y artefacto, revisión de pruebas/servicio/DTO/rutas, merge de main, corrección sin debilitar aserciones, validación local y revisión del diff. Política aprobada intacta. Resultados finales de CI vinculados al SHA en el PR y en el informe de entrega; sin merge del PR ni despliegue. **NEXUS:** sin schema/migraciones ni operaciones productivas.

## PR #211 — política de gestión ADMIN aprobada (2026-10-28 UTC)

- **Base real:** checkout inicial limpio `work` `848758b7` (#210). La rama solicitada no existía localmente ni en remoto; recuperada la fuente de #211 `claude/stoic-gates-sxbg8u` `6f902a69`, confirmada mediante `refs/pull/211/head`, y creada `codex/pr211-superadmin-policy`. Merge normal de `origin/main` `848758b7`: `e2ced9a3`; sin rebase ni force push.
- **Implementado:** solo SUPERADMIN activo gestiona ADMIN (creación, edición, promoción y baja lógica); ADMIN no gestiona otros ADMIN ni su propia cuenta desde Usuarios. Se conservan Mi cuenta y la protección del último administrador activo. `remove` ahora autoriza dentro del bloqueo/transacción incluso si la cuenta ya estaba inactiva; la ruta exclusiva de superadmin usa ese mismo camino idempotente.
- **Permisos:** catálogo backend de los 17 permisos existentes (incluidos Contabilidad y el histórico `pos.anular_venta`), validado por DTO y servicio. Nadie se concede `pos.excepcion_precio`; cambiar rol lo elimina incluso si llega en el cuerpo. Concesiones/revocaciones generan eventos diferenciados con actor, beneficiario, permiso y acción dentro de la transacción; repetición sin cambio no duplica eventos.
- **Evidencia:** `npm test -- --maxWorkers=2`: **70 archivos / 750 pruebas aprobadas**, incluidos JWT/guards/servicios reales por HTTP con persistencia simulada, superadmin, auditoría, cambio de rol y regresiones de precios. La primera pasada previa a adaptar expectativas antiguas tuvo 5 fallos; corregidas las expectativas a la política aprobada. El primer arnés HTTP omitía `bloqueadoAt:null`, corregido sin cambiar autenticación. `npm run build` correcto; lint sin errores (avisos existentes); `prisma validate` correcto con DATABASE_URL/DIRECT_URL ficticias locales (primer intento sin DIRECT_URL rechazado, sin conexión a BD).
- **Límites:** adaptada `test/admin-usuarios-soporte.postgres.integration.ts` a la política nueva, **no ejecutada**: faltan `initdb`, `pg_ctl` y `psql`. Sin pruebas de navegador nuevas ni producción. `git diff --check` correcto; ningún cambio propio en frontend, servicios de ventas/cotizaciones, política de precio, schema o migraciones. **NEXUS:** sin cambios de esquema; integración real pendiente.
- **Publicación:** consulta de #211 mediante `gh pr view` rechazada con `Post https://api.github.com/graphql: Forbidden`; referencia Git remota de #211 comprobada en `6f902a69`. Push normal **correcto** de `848f7d38` a `claude/stoic-gates-sxbg8u` (fuente de #211); este registro documental se publica después con otro commit. No se atribuyen checks ni revisiones remotas al nuevo SHA: API no disponible. Sin merge del PR ni despliegue.
- **Bitácora:** inspección Git/AGENTS/contexto, usuarios/DTO/controladores/superadmin, catálogo real de permisos y tests; recuperación de fuente y merge de main; implementación y pruebas; revisión del diff y documentación. La decisión del dueño sustituye el bloqueo histórico de concesión descrito en la sección siguiente; interfaz de asignación no incluida en este encargo.

## Excepción de precio en la interfaz (POS y conversión de cotizaciones) — 2026-10-28 UTC (rama `claude/stoic-gates-sxbg8u`, base `main` `53e2cc9`, sin merge ni despliegue)

- **Alcance:** atiende el pendiente (1) de la consolidación siguiente en lo que se puede hacer sin decidir quién concede el permiso. Solo frontend y documentación; sin cambios de backend, esquema, migraciones ni reglas de ISV. Detalle: [POLITICA_EXCEPCIONES_PRECIO.md](POLITICA_EXCEPCIONES_PRECIO.md) («Interfaz» y «Quién concede el permiso»).
- **Implementado:** `frontend/src/utils/excepcionPrecio.ts` (permiso explícito: rol ADMIN **y** `pos.excepcion_precio`; motivo 10–300 recortado; reconocimiento del 409 de precio por su mensaje). POS (`POSPage.tsx`): en una venta pendiente rechazada por precio, el ADMIN con permiso mantiene el precio con motivo en un diálogo; el motivo se guarda en el pendiente (`posRecovery.ts`, `PendingSale.excepcionPrecio`) y viaja en los reintentos de la misma `solicitudId`; 400/403 lo quitan del pendiente; «Corregir» lo descarta; el resto ve un aviso y corrige. Cotizaciones (`CotizacionesPage.tsx`): el diálogo de conversión lista las líneas con precio distinto (o reacciona al 409), exige motivo al ADMIN con permiso y envía `excepcionPrecio`; el resto ve un aviso. `Permiso` incluye `pos.excepcion_precio` (`types/index.ts`); **no** se añadió a Usuarios.
- **Bloqueo (decisión del propietario):** cualquier ADMIN puede asignar cualquier permiso a cualquier cuenta, incluida la suya (`usuarios.service.ts` `create`/`update`, DTO sin lista cerrada; `authorizedActor` no exige `usuarios.gestionar` al ADMIN). Un interruptor en Usuarios convertiría el permiso en equivalente al rol. Hoy solo se concede por API/BD y la excepción queda inactiva en la interfaz para todos. Falta decidir quién lo concede, si se permite la autoconcesión y si se audita la concesión. El mismo hueco ya existe por API; no se corrigió.
- **Pruebas locales (Node 22; el CI usa 24):** `tsc -b`, `vite build` (con `VITE_API_URL` de CI) y `oxlint` sin errores nuevos. `npm test` frontend **572/572** (antes 562) (nuevas: `test/excepcion-precio.test.mjs` 4; `test/cotizaciones-conversion.test.mjs` +6; arneses `operaciones`/`pos-client-credit` registran el módulo nuevo; `pos-offline-caracterizacion` amplía la lista de escrituras de `localStorage`, todas al pendiente). Navegador simulado: `e2e/pos-excepcion-precio-simulado.spec.ts` 7/7 (control negativo: sin enviar `excepcionPrecio`, 4 fallan) y `e2e/cotizaciones-excepcion-precio-simulado.spec.ts` 4/4. Suite completa `test:browser` (incluye las 11 nuevas): 425 pasan, 26 omitidas, **2 fallan también en `main` sin estos cambios** (`auth-security.spec.ts:167` por tiempo de espera y `contabilidad-simulado.spec.ts:279` por `getByLabel('Cuenta')` ambiguo; no relacionadas, posiblemente de entorno local). Sesión móvil 16/16. **No ejecutado:** backend (sin cambios), PostgreSQL, `e2e-real`, dispositivo físico.
- **Pendientes reales:** (1) decisión sobre la concesión del permiso (arriba) y, después, su pantalla. (2) ISV distinto de 15 %/exentas al convertir: sin cambio, sigue pendiente del dueño. (3) El reconocimiento del 409 de cotizaciones depende del texto del servidor (`politica-precio.ts`); una prueba (`excepcion-precio.test.mjs`) falla si el texto cambia. (4) Aceptación del cliente, merge y despliegue: no realizados.
- **Bitácora:** lectura de AGENTS/contexto/política; comprobación de rama y `main`; revisión de `politica-precio.ts`, `ventas.service.ts`, `cotizaciones.service.ts`, `usuarios.service.ts`, `ledger.ts`, POS y Cotizaciones; implementación; pruebas unitarias, de navegador con control negativo y suite completa comparada con `main`; documentación. **NEXUS:** sin cambios de esquema ni migraciones.
## Mantenimiento de ramas #211 / #212 / #213 — 2026-10-28 UTC

- Referencias remotas actualizadas antes de actuar. #212 ya fusionado por otra sesión (head `96965076`, merge `4c9ec9bc`); ambos workflows success. Revisado diff: dos pruebas de portabilidad y documentación, sin lógica de producto ni aserciones debilitadas.
- #213 `e79f29eb`: ambos workflows success, abierto/no borrador/mergeable. Se integra `main` `4c9ec9bc` por merge normal en su rama y se añade actualización al informe: distingue historial de CI rojo frente a consultas actuales, registra política ya aprobada y conserva NO-GO. **El nuevo head requiere sus propios checks antes del merge.** Sin verificación de respaldos/restauración productivos, configuración/salud de servicios, fiscalidad, dispositivos ni aceptación del cliente. Detalle: `PREPARACION_PRODUCCION_20261028.md`.
- #211 `171de34c`: abierto, borrador, mergeable; ambos workflows en curso al consultar. No se declara listo ni se fusiona hasta CI verde y revisión final. Política aprobada sin cambios; revisión local previa de backend no equivale a CI.
- Auxiliar `claude/pr-211-permissions-analysis-6nwjcg` `210e0091` conservada: contiene recomendaciones históricas D1–D6 no íntegramente incorporadas; no cumple la condición de duplicación total para borrarla. No se adopta su recomendación de otro ADMIN: prevalece SUPERADMIN aprobado por el dueño.
- `claude/optimistic-lamport-88ljko` `4f3f0483` eliminada remotamente con push normal de borrado; head comprobado antes y ausencia después. No se instaló ni ejecutó la skill. SDK `claude/zen-johnson-xwrqlv` `a5c78773` intacto/aparcado, sin llamadas externas habilitadas.
- Bitácora: Git/fetch y heads reales; conector GitHub para estados/CI tras bloqueo de gh; revisión de diffs; borrado autorizado comprobado; informe actualizado. Sin force push ni acciones de despliegue. **NEXUS:** sin cambios de esquema/migraciones ni escrituras productivas.

## Preparación de producción — revisión contra GitHub (2026-10-28 UTC, rama `claude/preparacion-produccion-20261028`, PR #213, sin merge ni despliegue)

- **Estado vigente:** decisión **NO-GO**. Detalle y fuentes en [docs/PREPARACION_PRODUCCION_20261028.md](PREPARACION_PRODUCCION_20261028.md).
- **Corregido:** PR #210 **mergeado** el 15:49:04Z (`848758b`); el documento anterior lo daba abierto. #211 y #212 ya no están «en curso»: su `validate` está en **failure** en el paso de Chromium (backend y PostgreSQL omitidos). #213 tiene el mismo fallo, con dos pruebas e2e nombradas (`auth-security.spec.ts:167`, `contabilidad-simulado.spec.ts:279`).
- **Verificado:** estados de PR y checks por API de GitHub (14:10–15:50 UTC); logs de los jobs de #211, #212 y #213; `main` `848758b` fusionado en la rama sin conflictos (`bb40c2d`); política de excepciones de precio en código de `main`.
- **Pendiente de evidencia:** resultado final del run de `main` tras #210 (en curso en la última consulta); causa concreta de los fallos de Chromium en #211 y #212; reproducción local de `contabilidad-simulado` (no hecha: sin dependencias instaladas); respuesta de Vercel y Render (el proxy rechazó la conexión hoy; el documento conserva las observaciones de la revisión anterior, marcadas como no reconfirmadas).
- **No verificado:** respaldos, base de datos, migraciones en producción, configuración de Render y Vercel, endpoint de salud, validación física y aceptación del cliente.

## PR #211 (`claude/stoic-gates-sxbg8u`) sobre `main` 848758b (#210) — 2026-10-28 UTC (rama `claude/pr-211-permissions-analysis-6nwjcg`, borrador, sin merge ni despliegue)

- **Base y estado:** `main` = `848758b` (#210 fusionado: quita el `aria-label` duplicado del enlace de perfil y actualiza `auth-security.spec.ts` a `/mi-cuenta`). PR #211 es borrador, con base `53e2cc9` (#209) y cabeza `6f902a6`. El job `validate` de `6f902a6` falló por **dos pruebas de navegador ajenas a la lógica de precios**: `auth-security.spec.ts:170` (no encuentra «Seguridad de mi cuenta» en `/usuarios`) y `contabilidad-simulado.spec.ts:285` (`getByLabel('Cuenta')` resuelve a dos elementos: el enlace de perfil y el `<select>`). Ambas causas están corregidas en `main` por #210.
- **Incorporación:** `git merge origin/claude/stoic-gates-sxbg8u` sobre `main` 848758b, sin conflictos (commit `608f1b9`, 14 archivos de POS, cotizaciones y docs). La rama `claude/stoic-gates-sxbg8u` no se modificó.
- **Pruebas locales sobre `608f1b9`:** `prisma validate` y `generate` correctos; backend build, lint y pruebas **731/731** (69 archivos), scripts **10/10**, `validar-inventario.test.py` OK; frontend build, lint y pruebas **572/572**; navegador de escritorio **427 pasan / 26 omitidas / 0 fallos**; navegador móvil (`playwright.session.mobile.config.ts`) **16/16**; guard de migraciones contra `origin/main`: 0 migraciones nuevas. Focalizadas: `auth-security`, `contabilidad-simulado` y los dos specs de excepción de precio, **49/49**.
- **No ejecutado localmente:** pruebas de integración PostgreSQL (`test:integration`, `test:e2e` del backend, `auth-recovery`, `test:e2e-real`). No hubo PostgreSQL utilizable en este entorno (el intento de iniciar un clúster local falló por permisos del directorio de trabajo). El PR no toca backend; quedan para el CI.
- **Entorno local:** Node 22.22.0; el CI usa Node 24.
- **Decisiones pendientes (sin implementar):** en `docs/POLITICA_EXCEPCIONES_PRECIO.md`, sección «Decisiones pendientes y recomendación». Hallazgos verificados en código: (a) `UsuariosService.update` permite a cualquier ADMIN fijar `permisos` de cualquier usuario, incluido él mismo, sin guarda; (b) `UpdateUsuarioDto.permisos` acepta cualquier cadena; (c) la auditoría de la excepción registra quién la usó, no quién la concedió. Recomendación: D2 (prohibir la autoconcesión) y D3 (acción de auditoría propia para conceder y revocar) antes de cualquier interfaz; D4 (lista blanca) en la misma tanda; D1 (quién concede: otro ADMIN activo) y D6 (interruptor en Usuarios) solo con decisión del propietario.
- **Pendientes reales:** (1) decisión del propietario sobre D1, D5 y D6; (2) PostgreSQL de integración en CI sobre el SHA final; (3) el PR sigue en borrador. No hay merge ni despliegue; el merge a `main` dispara el despliegue del backend en Render según los runbooks.

## Consolidación #207 · #206 · #200 sobre `main` `a436584` — 2026-10-28 UTC (rama `claude/laughing-euler-tplk31`, sin merge ni despliegue)

- **Base verificada:** `main` = `a436584` (#203 fusionado). Sus workflows `Operación de ferretería` y `Piloto con API y PostgreSQL reales` terminaron en verde en push (2026-10-28). Las ramas de #206, #207 y #200 parten de `main` anterior (`2f6168d`/`22d37643`): sus diffs de dos puntos contra `main` actual mezclan cambios de #203; solo el diff de tres puntos es el trabajo real de cada PR.
- **#207 (política única de precio):** portada el commit `82c24ae` mediante `git apply --3way` sobre `main` sin conflictos (`backend/src/ventas/politica-precio.ts` y su spec, `ventas.service.ts`, `cotizaciones.controller/service.ts`, `cotizaciones.postgres.integration.ts`, `docs/POLITICA_EXCEPCIONES_PRECIO.md`). Se **excluye** el commit `0b94c31` (symlink `backend/node_modules` añadido por error). Regla fail-closed: 409 sin excepción, 400 con motivo inválido (10–300), 403 sin rol ADMIN **y** permiso `pos.excepcion_precio`; auditoría `VENTA_EXCEPCION_PRECIO`. El ISV distinto de 15 % o las líneas exentas al convertir cotización no cambian (asunto fiscal, pendiente del dueño).
- **#206 (retiro de MFA, CI roto):** el contenido útil ya estaba en `main` por #203: no hay `mfa.ts`, `requireMfa`, rutas de enrolamiento ni UI de código MFA; el login de dos campos y la recuperación no piden segundo factor; la búsqueda de correo sin distinguir mayúsculas (`lower(trim(...))`) y la ambigüedad entre empresas son más completas en `main` (`identidad-login.ts`, prueba PostgreSQL en `auth-recovery.postgres.integration.ts:222`). **No se fusionó la rama:** sobrescribiría código nuevo con el de la base antigua. Columnas `mfa_secret`/`mfa_last_step` y tabla `auth_recovery_codes` se conservan sin uso; no hay migración.
  - **Diagnóstico de `validate` (log de run 40632821274):** el fallo es `test/ventas.postgres.integration.ts` › «la API compilada arranca en producción…» → `real-settings-browser.mjs` sale con código 1. La salida del hijo no aparece en el log (`stdout/stderr: null`), así que la causa se infiere del código: el script de #206 espera `#login-mfa` tras la contraseña, pero el frontend de #206 aún lo muestra mientras su backend ya no emite `MFA_REQUERIDO`. Incoherencia entre capas, no un fallo de PostgreSQL. `main` ya no tiene ese campo ni ese paso. Pendiente de confirmar con el CI de esta rama.
  - **Diagnóstico de `test` / piloto (run 40632821213):** `Cannot find module …/e2e-real/mfa.fixture` desde varios specs; #206 borró el fixture y dejó importadores. En `main` no hay importadores (`grep` vacío).
- **#200 (autenticación de login único):** su prueba exclusiva de dos usos simultáneos de la clave temporal ya existe en `main` (`backend/src/auth/login-unico.spec.ts`, «dos usos simultáneos de la misma temporal»). Se añadió la aserción que faltaba: el segundo intento se **rechaza** (`rejected` = 1). No se restauró ninguna dependencia de MFA (`./mfa` no existe en `main`).
- **Pruebas locales (rama de trabajo):** `prisma validate` y `generate` correctos; `npm run build` y `npm run lint` del backend sin errores; `npm test` backend 69 archivos / 731 pruebas; `npm run test:scripts` y `scripts/validar-inventario.test.py` correctos; `verificar-migraciones.mjs --base origin/main` correcto (0 migraciones nuevas). **No ejecutado localmente:** integración PostgreSQL y navegador (requieren PostgreSQL y CI); se validan en el PR.
- **Pendientes reales:** (1) el frontend no envía `excepcionPrecio` ni en POS ni en la conversión de cotizaciones: con la política nueva, un precio distinto responde 409 y no hay pantalla para pedir el motivo ni asignar el permiso; requiere decisión del propietario sobre quién lo concede. **Actualización 2026-10-28:** captura y envío del motivo implementados en `claude/stoic-gates-sxbg8u`; la concesión sigue bloqueada (ver la sección anterior). (2) Merge bloqueado hasta confirmar el despliegue (ver PR). (3) Render y Vercel no verificados desde esta sesión; no se tocaron variables ni secretos.
- **Deployment al hacer merge a `main` (verificación previa):** los runbooks del repositorio describen auto-despliegue del backend en Render desde `main` (`prisma migrate deploy && node dist/main.js`), por lo que el merge **dispararía** un despliegue de producción del backend. Para Vercel, el repositorio solo muestra `vercel-ignore.sh` y `frontend/vercel.json`; no se confirmó desde aquí si `main` despliega a producción. No se pudo verificar en los paneles; el merge queda detenido hasta decisión explícita del propietario.

## Auditoría contable e integración #180 · #202 · #203 — 2026-10-27 UTC (rama `claude/jowa-production-audit-integration-mvd8vl`, sin merge ni despliegue)

- **Ramas:** trabajo derivado de #180 `3c84a7a` → `claude/jowa-production-audit-integration-mvd8vl`; ensayo #180 + correcciones + #203 `6d23eec` + #202 `59e739d` → `claude/jowa-production-audit-integration-mvd8vl-ensayo`. No se modificaron las ramas de #180, #202 ni #203. Informe completo, matriz de conflictos y P0/P1/P2: [AUDITORIA_INTEGRACION_JOWA_20261027.md](AUDITORIA_INTEGRACION_JOWA_20261027.md).
- **Corregido:** AI-01 (P0) migraciones de Contabilidad ordenadas antes de `20261023000000_auth_recovery` de `main` → base actualizada con `main` quedaba `BLOQUEADA`; renombradas a `20261027000100/200` (mismo checksum). AI-02 guard de CI con regla de orden (`verificar-migraciones.mjs`). AI-03 cartera CxC/CxP de solo lectura para el CONTADOR (`contabilidad/cartera.ts`, `GET /contabilidad/cartera`, Excel «cartera», ruta `/contabilidad/cartera`) con integridad frente a `cuentas_operativas` y `clientes.saldo_pendiente`. AI-04 exento/gravado al documentar ventas convertidas de cotización.
- **Conflictos:** #203 → 8 textuales resueltos en el ensayo y AI-05 semántico (#180 exige Resend en producción; #203 usa Gmail SMTP): resuelto en el ensayo con las variables Gmail; política pendiente del dueño. #202 → sin conflictos; P1 de política de precios (permiso `pos.excepcion_precio` sin interfaz; cotizaciones con precio distinto).
- **Pruebas:** rama de trabajo: backend 689/689, scripts 52/52, frontend 559/559, PostgreSQL 1165 + 1 fallo de entorno repetido en verde, contabilidad 33/33, navegador contabilidad 17/17. Ensayo: backend 725/725, frontend 562/562, PostgreSQL 1198/0 (1 omitida), navegador simulado 416/0 (26 omitidas). Actualización desde base en estado `main`: LISTA, sin deriva. No ejecutado: `e2e-real` local, dispositivos físicos.
- **Orden recomendado:** #203 → #202 → #180 (+ esta rama, sincronizada con `main` y con AI-05). **Dictamen:** producción NO APTA hasta cerrar los P0 de configuración, identificadores duplicados, MFA del Super Admin, respaldo restaurable y AI-05.
- **NEXUS:** renombrado de migraciones sin cambio de contenido; verificado con `migration-safe` y `migrate diff` en clústeres efímeros. Confirmar en producción (solo lectura) que no existen los nombres antiguos antes de desplegar.
- **Entorno (no código):** como root, `initdb` necesita envolturas `runuser -u nobody` y un `TMPDIR` recorrible por `nobody` (p. ej. `/var/tmp/...`); `PG_BIN` debe incluir también `pg_restore`/`pg_dump`/`createdb`.



## Validación del HEAD `03ef20aa` de PR #180 — 2026-10-26 UTC (rama `feat/contabilidad-honduras`, draft, sin merge, despliegue ni migraciones en producción)

- **Estado Git:** local y remoto en `03ef20aa` (merge de `origin/main` `2f6168d`, PR #198). Árbol limpio tras las pruebas; `frontend/artifacts` restaurado.
- **CI en GitHub para `03ef20aa`:** `Operación de ferretería` run 40276085240 — éxito; `Piloto con API y PostgreSQL reales` run 40276085305 — éxito (incluye E2E real del piloto).
- **Local, mismo HEAD:**
  - Backend: build correcto; lint correcto; unitarias 66 ficheros, 682/682.
  - Frontend: build correcto con `VITE_API_URL=/api` (sin esa variable la guarda de build falla, esperado; CI usa `https://api.example.test/api`); lint correcto; `node --test` 558/558.
  - Integración PostgreSQL: 67 ficheros, 1164 aprobados, 1 omitido. Requirió `PG_BIN=/usr/lib/postgresql/16/bin` y ejecución con usuario sin privilegios, porque `initdb` se niega a correr como root. Sin fallos.
  - Navegador simulado: 392 aprobados, 26 omitidos, 0 fallos. Requirió `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium`; la configuración por defecto espera Chromium 1243 (el de CI), no el 1194 instalado en el sandbox. Incluye los specs de sesión/PWA, emulación offline y ventas sin conexión.
  - E2E real con backend: no ejecutado en local; queda cubierto por el CI de este SHA.
- **Navegación:** TOPNAV y SIDEBAR siguen presentes según `tenant.modoNavegacion` (`App.tsx`, `data-navigation-mode`).
- **Bloqueos fuera del alcance del asistente:** configurar variables de auth en Render sin exponer secretos; autorizar y ejecutar el correo real de Resend con destinatario confirmado (no ejecutado); enrolamiento MFA del Super Admin; validación contable externa de los parámetros fiscales (§11 de `docs/CONTABILIDAD_HONDURAS.md`); confirmar que los nombres de migración antiguos no están aplicados en ningún entorno; prueba física en Safari/iPhone.
- **Dictamen:** **NO MERGE.** El HEAD está validado técnicamente, pero los bloqueos anteriores siguen abiertos. PR #192 no se cierra; PR #180 sigue en draft.

## Autenticación consolidada #200 + #201 — 2026-10-26 UTC (rama `claude/consolidate-auth-pr200-201-xz1q5m`, base `main` `2f6168d`; sin merge ni despliegue)

- **Estado vigente de autenticación** (sustituye a las descripciones de #200 y #201, que siguen abiertos solo como referencia): diseño, comparación, vulnerabilidades, migración, detección de duplicados, corrección y reversión en [AUTH_CONSOLIDACION_20261026.md](AUTH_CONSOLIDACION_20261026.md). Resultados por SHA y dictamen en el PR de la rama.
- **Login:** solo «Usuario» y «Contraseña»; empresa y rol por el identificador (`backend/src/auth/identidad-login.ts`); identificador repetido = 401 genérico; `?empresa=` oculto para cuentas heredadas. **MFA del Super Admin obligatorio** (ambos PR lo habían retirado): login, recuperación, refresh y JWT; el código aparece tras la contraseña correcta (`MFA_REQUERIDO`).
- **Bloqueo:** roles operativos (no ADMIN, incluido CONTADOR de #180) se bloquean en el 6.º fallo con SQL atómico (`bloqueo-cuenta.ts`); revoca sesiones y enlaces; sin oráculo ni enumeración; la JWT y el refresh rechazan cuentas bloqueadas. Límite por identificador e IP uniforme. Reactivación `POST /auth/security/unlock` (Admin: su empresa; Super Admin: global, auditado); listados `GET /auth/security/locked` (Admin) y `GET /admin/seguridad/bloqueos` (Super Admin).
- **Recuperación:** Admin/Super Admin tras 3 fallos y con correo verificado: temporal de un uso, 10 min, SHA-256 en `auth_actions`, MFA obligatorio para el Super Admin, revoca sesiones y obliga a cambiarla sin sesión (`forced-change`). Roles operativos: enlace privado del Admin. Cambio propio con la contraseña actual.
- **NEXUS:** migración única aditiva `20261026000000_auth_login_unico_bloqueo` (columnas de contador/bloqueo, CHECK ≥ 0, índices no únicos; sin tabla nueva). Script de solo lectura `backend/scripts/auth-identificadores-duplicados.sql`. Reversión y compatibilidad con las migraciones de #180 verificadas en PostgreSQL 16 efímero. Nunca producción.
- **Coordinación:** #180 sin modificar; ensayo local de merge con 5 conflictos textuales resueltos (unitarias 708/708, contabilidad + autenticación PostgreSQL 93/93 con CONTADOR). Se portó a esta rama la corrección de `RecoveryForm` de #180 (segundo enlace en la misma pestaña). #202 se fusiona sin conflictos. Rama excluida de previews de Vercel.
- **Pruebas locales sobre el código `5443672`:** backend unitarias 621/621, scripts 51/51, e2e 6/6, build/lint/guard correctos; integración PostgreSQL 16 completa 65 archivos 1141/0/1 (omitida opt-in heredada); frontend 542/542, tsc/build/lint correctos; Playwright escritorio 390/0/26, sesión móvil 16/16, `auth-security` móvil 48/48; piloto real 171/0/4 (heredadas). Primeras pasadas no verdes (entorno `pg_dump`, aislamiento de fixtures, inventario de rutas con un hallazgo real, fixture MFA del piloto) documentadas en el PR. Sin WebKit/dispositivos físicos ni correo real.
- **CI de `c7628bf` (2026-10-27):** `validate` falló en `ventas.postgres.integration.ts` (1141 aprobadas / 1 fallida): `backend/test/real-settings-browser.mjs` (solo con `REAL_SETTINGS_BROWSER=1`, activo en CI y no en las pasadas locales) se había restaurado desde `main` con la casilla «Acceso de Super Admin», ya inexistente; `locator.check` agotaba 30 s. Corregido en `16a12dc` al flujo de dos pasos (contraseña → `MFA_REQUERIDO` → código), mismas aserciones y MFA real. Local con `REAL_SETTINGS_BROWSER=1`: rojo reproducido (45/46) y verde: integración completa 65 archivos 1142/1142 sin omisiones, e2e 6/6. Checks del SHA nuevo: ver el PR.
- **Correo por Gmail SMTP (2026-10-27, decisión del propietario):** Resend retirado de `RecoveryMailService` sin respaldo. Ahora usa `smtp.gmail.com:465` con TLS ≥ 1.2, contraseña de aplicación de una cuenta dedicada y `nodemailer` 10.0.16 exacta. Validación al arrancar: configuración parcial o mal escrita impide iniciar. Si un envío falla, se borran temporal y enlaces. Requisitos y límites de Google en [AUTH_CONSOLIDACION_20261026.md](AUTH_CONSOLIDACION_20261026.md) §6. Pruebas con transporte SMTP simulado; sin envío real.
- **Revisión de estabilización (2026-10-27, rama del PR #203):** (1) El piloto real de `6d23eec` (run 414) falló en `pos-cancelacion-real.spec.ts:137`; el **rerun (intento 2) pasó**. Causa raíz: ese `expect.poll` del `serviceWorker.controller` usaba el plazo por defecto de 5 s mientras `contingencia-real` usa 30 s para el mismo evento; temporización de activación/`clients.claim()` en runner frío, sin relación con auth ni Gmail (spec no tocado por este PR). Corregido con `{ timeout: 30_000 }` (una línea, sin debilitar aserciones). (2) **MFA:** la instrucción de retirarlo **no figura en la documentación vigente**, que lo exige (§ arriba y `AUTH_CONSOLIDACION_20261026.md`); no se tocó código. Plan, riesgos y alternativas en [MFA_RETIRO_PLAN_20261027.md](MFA_RETIRO_PLAN_20261027.md); requiere confirmación escrita del propietario. (3) Gmail SMTP revisado (TLS≥1.2 verificado, errores genéricos, sin logs, validación al arrancar, temporal de un uso/10 min/hash); añadido `backend/scripts/smtp-staging-check.mjs` (opt-in `SMTP_STAGING_CONFIRMAR=ENVIAR`, rechaza `NODE_ENV=production`, no imprime credenciales); **no se envió correo real**. (4) Pruebas locales sobre este código: backend build/`tsc`/lint OK, unitarias 635/635, scripts 51/51; frontend tsc/build/lint OK, unitarias 542/542; integración PostgreSQL 16 completa 65 archivos 1144/1144 (7 fallos de `pg_dump` iniciales eran permisos de mi envoltura `nobody`, repetidos en verde); `auth-recovery` 50/50; Playwright escritorio 390/0/26; piloto real 168/1/4 (+2 sin ejecutar): la única fallida es `contingencia-real` n.º 14 (service worker), **determinista en este entorno y ya documentada como idéntica en `main`**, verde en CI (171/0/4); un plazo de 30 s no la cambia, por lo que no se modificó.
- **CI de `1c04e76` (2026-10-27):** verde al primer intento: `validate` (unitarias 635/635, integración 1144/1144 con navegador real, e2e 6/6, Playwright 389 + 1 flaky / 26 omitidas, móvil 16/16), `guard-base-datos`, piloto real (171/0/4, `auth-recovery` 50/50) y Vercel. Flaky ajeno al PR: `e2e/ux-ronda1-regresion.spec.ts:128` lee `getComputedStyle` durante la transición de 120 ms de `.pos-metodo`; parche propuesto en el PR (`expect.poll`), no aplicado. Conflicto conocido: #180 aún exige `AUTH_MAIL_RESEND_API_KEY` y llama a `api.resend.com`; al integrarlo, conservar Gmail.
- **Retiro del segundo factor del Super Admin (2026-10-27, decisión del propietario) — rama del PR #203:** se elimina TOTP, códigos de emergencia, enrolamiento inicial y `AUTH_MFA_ENCRYPTION_KEY`. Login y recuperación siguen con contraseña temporal de un uso por correo verificado. Un Admin ya no restablece a otro Admin (solo el Super Admin). Multi-tenant: el identificador se compara normalizado en la base (como el script de duplicados); un dato heredado con mayúsculas o espacios que colisiona es ambiguo y responde 401 genérico; el enlace `?empresa=` revalida la empresa. Sin cambios de esquema Prisma: `mfa_secret`, `mfa_last_step` y `auth_recovery_codes` quedan sin uso hasta una migración destructiva autorizada. Detalle en [MFA_RETIRO_PLAN_20261027.md](MFA_RETIRO_PLAN_20261027.md).
- **Coordinación con #180 y #205 (2026-10-27):** #180 (`feat/contabilidad-honduras`, sin modificar) exige hoy en producción `AUTH_MFA_ENCRYPTION_KEY`, `AUTH_MAIL_RESEND_API_KEY` y `AUTH_MAIL_FROM` (`backend/src/auth/config-auth.ts`), y sus pruebas importan los fixtures MFA retirados. Su integración debe: quitar esas variables y exigir `AUTH_MAIL_GMAIL_USER`, `AUTH_MAIL_GMAIL_APP_PASSWORD`, `AUTH_PUBLIC_URL`; conservar la versión Gmail de `recovery-mail.service.ts`. #205 ya incluye AI-05 con esa idea. Las migraciones de #203 no cambian en esta ronda. Comentarios publicados en #180 y #205.
- **Flaky POS (`e2e/ux-ronda1-regresion.spec.ts:128`):** la aserción de color compara `getComputedStyle` tras el clic, durante la transición de 120 ms; ahora espera a que el color se asiente (`expect.poll`), mismo predicado. Causa inferida de la traza: no reproducida en local ni con transición forzada de 400 ms. Passed 3/3 tras el cambio.
- **Estado de pruebas (2026-10-28, local):** backend build OK, lint 0 errores, unitarias 627/627; integración PostgreSQL 16 completa 65 archivos 1142/1142; frontend `tsc` OK, unitarias 542/542, lint 0 errores (solo avisos existentes), build OK con `VITE_API_URL=/api`; Playwright `auth-security` + `ux-ronda1` 42/42 en chromium. e2e-real y piloto real: ejecutan en CI.
- **CI de `2b9e2a2` (2026-10-28):** `validate` verde (unitarias 627/627; integración 65 archivos 1142/1142 con navegador real; e2e 6/6; Playwright escritorio 386 aprobadas, 1 inestable, 26 omitidas; móvil 16/16); `guard-base-datos` verde; piloto real verde (`auth-recovery` 48/48, 171 aprobadas, 4 omitidas, `FALLOS=0`); Vercel verde. Inestable sin reproducir: `e2e/session-lifecycle.spec.ts:121` (logout y «Atrás»), pasó en el reintento y 8/8 en local; no modificado. **Dictamen en el PR #203: NO MERGE** (falta la prueba real de Gmail en staging; #180 necesita adaptar `config-auth.ts`; decisiones del propietario pendientes).
- **Residual no resuelto:** la comparación `lower(trim(...))` de identificadores no usa índice (`usuarios_username_idx` no es funcional). Para escalar hace falta un índice funcional aditivo en una migración propia.
- **Pendientes reales:** ejecutar el script de duplicados en producción y corregir; índice único global posterior; configurar `AUTH_MFA_ENCRYPTION_KEY`, Gmail SMTP (`AUTH_MAIL_GMAIL_USER`, `AUTH_MAIL_GMAIL_APP_PASSWORD` de una cuenta dedicada) y `AUTH_PUBLIC_URL`; enrolar el MFA del propietario; entrega real de correo, WebKit/Safari/iPhone físicos y CI del SHA final no verificados aquí; aceptación del cliente.
- **Bitácora:** lectura de AGENTS/contexto/NEXUS; auditoría de #200/#201/#180/#202; base #201 por fast-forward; consolidación backend/frontend/pruebas; integración PostgreSQL completa, Playwright escritorio/móvil, piloto real; correcciones de arnés documentadas en el PR. Firma de esquema: **NEXUS**.

---

## Revisión del PR #195 — TOPNAV/SIDEBAR restaurado (2026-10-23, America/Tegucigalpa)

- **Estado vigente:** se conserva el trabajo de Claude y se corrige la eliminación de la preferencia por negocio. Esta sección sustituye la decisión de «navegación única sin selector» documentada en los bloques anteriores de la implementación original.
- **Configuración:** Super Admin → Empresas → Configurar negocio carga/guarda `modoNavegacion` por el endpoint existente. SIDEBAR coloca el rail a la izquierda; TOPNAV coloca el mismo menú autorizado arriba. Ambos conservan barra contextual y navegación móvil. La plataforma no cambia al editar un negocio; soporte conserva el modo de destino.
- **Alcance:** misma rama y PR #195, sin backend, reglas de negocio, rutas/permisos, dependencias nuevas, Tailwind, merge ni despliegue. Rama excluida de previews automáticas mediante el mecanismo existente.
- **Compatibilidad y pruebas:** [REVISION_PR195_20261023.md](REVISION_PR195_20261023.md). Main `01f9110` incluye #194 y es ancestro; áreas de POS/backend sin diferencias. Ensayo aislado con catálogo real de #180: 12/12 combinaciones de CONTADOR/módulo/permiso/modo; la integración completa futura requiere resolver conflictos y conservar AccountSecurity/MFA/recuperación y el menú contable especializado. #180 no se modifica.
- **Evidencia:** frontend inicial 538/538; build y lint sin errores; guard correcto (0 migraciones). Pruebas adicionales de exclusión de despliegue, Playwright simulado y piloto real por negocio incluidas. **Resultados finales y checks del SHA publicado: ver PR #195**; no atribuir al nuevo HEAD los checks del recibido. Chromium local 151; descarga de Chromium 153 bloqueada por política de red. Sin certificación de dispositivos físicos.
- **Bitácora:** inspección de AGENTS/contexto, Git y PR #195/#194/#180; checkout de la rama indicada; revisión del contrato existente; restauración del selector/lectura y modo de soporte; regresiones de roles/persistencia/error/móvil; ensayo de compatibilidad; pruebas y actualización del mismo PR. El dictamen definitivo corresponde a los resultados del HEAD final publicados en el PR.

---

## POS: sincronización automática de precios — 2026-10-26 UTC (rama `claude/pos-sincronizacion-precios`, base `main` `2f6168d`, PR en borrador, sin merge ni despliegue)

- **Cambio (solo frontend):** se elimina el botón «Actualizar catálogo y precios del carrito». El catálogo y los precios del carrito se sincronizan en segundo plano cada 60 s y en la siguiente interacción del cajero (clic, tecla o volver a la ventana; mínimo 3 s entre lecturas), con un reintento. Un precio cambiado por el Admin actualiza la línea y el total **sin aviso, modal ni botón** (sincronización imperceptible). Antes de enviar, el cobro vuelve a leer el catálogo: si no puede confirmar el precio vigente no cobra; si el precio cambió, actualiza la línea y el total en silencio y no envía hasta que el cajero vuelva a cobrar con el total visible; un producto que salió del catálogo bloquea el cobro. Una venta pendiente sin corregir se reenvía idéntica (el servidor sigue rechazando precios antiguos con 409). Código: `frontend/src/pages/POSPage.tsx`, `frontend/src/utils/preciosCarrito.ts`.
- **Pruebas:** `test/pos-precios-vigentes.test.mjs` (utilidad), caracterización actualizada a propósito en `pos-offline-caracterizacion.test.mjs`, regresión de navegador `e2e/pos-precios-automaticos-simulado.spec.ts` (Admin cambia precio → cajero vende sin botón ni paso adicional; cambio justo antes de cobrar; reintento, desconexión y producto no disponible; todos comprueban que no aparece ningún aviso). Comprobado que la regresión falla si se quita el disparador por interacción. Resultados por SHA en el PR.
- **Auditoría 2026-10-27 (SHA `42f154f`, CI verde):** dos defectos reproducidos 3 de 3 con navegador y servidor simulado. **D1 (bloqueante):** una venta pendiente corregida tras un cambio de precio nunca se envía, porque la validación usa `ventaPendiente.cart`, que no se actualiza al corregir. **D2:** el cobro reutiliza una lectura del catálogo iniciada antes del cambio; para CAJERO y VENDEDOR el servidor responde 409, pero un ADMIN registraría el precio anterior. Riesgos: cobro silencioso sin mensaje y respuestas fuera de orden. No se corrigieron ni se cambiaron pruebas. Protocolo de caja real y datos a registrar: [PROTOCOLO_CAJA_PRECIOS_POS_PR202.md](PROTOCOLO_CAJA_PRECIOS_POS_PR202.md).
- **Corrección 2026-10-27:** dos sesiones corrigieron D1 y D2 en paralelo (`fd11240` y `7eced23`) y se integraron con un merge normal. En el código prevalece `7eced23`, que cubre lo mismo que `fd11240` y añade lo siguiente.
  - **D1:** al corregir un pendiente se valida y envía el carrito corregido.
  - **D2:** el cobro lanza su propia lectura del catálogo, y una secuencia por lectura impide que una respuesta antigua revierta precios.
  - **Backend:** el ADMIN ya no está exento de la validación del precio vigente. La única excepción exige rol ADMIN, el permiso explícito `pos.excepcion_precio` y un motivo, y queda auditada como `VENTA_EXCEPCION_PRECIO`.
  - **Sin aviso visible (requisito vigente del propietario, 2026-10-27):** se retiró el aviso de cobro (`role="alert"`) introducido en `7eced23`. Un cambio de precio durante el intento de cobro actualiza la línea y el total **en silencio** y no envía la venta; el cajero vuelve a pulsar Cobrar con el total nuevo ya visible y entonces se envía el precio vigente. No hay alerta, modal, botón ni mensaje con precio anterior y nuevo. Se conservan D1, D2 y la validación del precio vigente para ADMIN.
  - **Pruebas:** se conservan las dos regresiones de `fd11240`. Las de cobro verifican que el primer clic actualiza el total sin enviar ni mostrar aviso y que el segundo envía el precio vigente; la de venta pendiente corregida con sincronización silenciosa no cambió. Se añaden regresiones en navegador, PostgreSQL y unitarias, verificadas por mutación. Resultados por SHA en el PR.
- **Pendientes:** prueba en caja real con catálogo grande según el protocolo (no realizada), quién puede conceder `pos.excepcion_precio` y si se quiere una pantalla para ello, y aceptación del propietario.

## Preparación de producción: infraestructura, BD y despliegue — 2026-10-24 UTC (rama `claude/gallant-knuth-c68iv1`, sin merge ni despliegue)

- **Alcance:** solo infraestructura, base de datos y confiabilidad del despliegue (Vercel, Render, Supabase). Sin cambios en POS, interfaz, contabilidad ni lógica comercial. No se tocó #180 ni #194.
- **Corregido:** `NODE_ENV` se comparaba sin normalizar en las cookies de renovación (`auth/refresh-cookie.ts`) y en las cabeceras de seguridad, mientras `jwt-secret.ts` y `auth-config.ts` sí normalizan. Un valor pegado con espacios o en mayúsculas dejaba las cookies sin `Secure`/`SameSite=None` y el login desde Vercel fallaba. Ahora todo usa `common/entorno.ts` (`esProduccion`). Pruebas: `auth/refresh-cookie.spec.ts` (nueva: `" production "` y `"Production"`) y `common/entorno.spec.ts`.
- **Documentación corregida:** el runbook afirmaba que sin `NODE_ENV` `JWT_SECRET` caía a un secreto público; el código actual lo rechaza fuera de development/test. Añadida la sección 5b de reversión por capa (frontend, backend, base) con su orden y sus límites.
- **Verificado sin cambios:** migraciones de `backend/prisma/migrations` son aditivas (sin `DROP TABLE/COLUMN`, `TRUNCATE` ni `DELETE`; solo recrean CHECK constraints). `migration-safe.mjs` no migra al arrancar y bloquea con historial o checksum incompatibles. CORS exige orígenes exactos. `TRUST_PROXY`, `FRONTEND_URLS` y el arranque sin `JWT_SECRET` se validan al iniciar.
- **Pruebas:** backend `npm ci` + `npm run build` OK; `tsc -p tsconfig.build.json` OK; `vitest run` 584/584 en 58 archivos tras la corrección (581 antes, incluido el spec nuevo); `node --test scripts/*.test.mjs` 48/48 tras compilar `dist/` (sin `dist/` fallaban 5 por entorno, no por código). Lint: sin errores; avisos preexistentes en specs.
- **Pendientes reales (no verificables desde el entorno):** panel de Render (Start Command, Pre-Deploy vacío, variables), Supabase (planes de respaldo y restauración real), Vercel (variables de Preview/Production). Destino remoto del respaldo FS-41 sin configurar: no declarar respaldo de producción activo. Backend anterior contra base ya migrada: sigue sin verificar y la reversión de código requiere restaurar si hay migraciones nuevas. Sin ensayo de restauración en Supabase real.
- **Bitácora:** lectura de AGENTS, contexto, NEXUS y runbook; revisión de migraciones, CORS, cookies, JWT y respaldos; ejecución de pruebas; corrección de `NODE_ENV`; documentación de reversión. **NEXUS:** sin cambios de esquema ni migraciones.

## Auditoría de preparación para piloto de ferretería — 2026-10-24 UTC

- **Rama y alcance:** `claude/kind-pasteur-ilo43m` desde `main` `01f9110a` (incluye #194). Solo pruebas e informe: sin cambios de código de producto, interfaz, infraestructura, esquema ni reglas comerciales. #180 y Codex sin tocar. Sin merge ni despliegue. Informe completo: [AUDITORIA_PILOTO_PRODUCCION_20261024.md](AUDITORIA_PILOTO_PRODUCCION_20261024.md).
- **Pruebas nuevas:** `backend/test/auditoria-piloto-ferreteria.postgres.integration.ts` (40) y `frontend/e2e-real/auditoria-jornada-piloto-real.spec.ts` (8).
- **Resultados:** integración PostgreSQL 64 archivos, 1093 aprobadas / 0 fallidas / 1 omitida (línea base de `main`: 1053/0/1); unitarias backend 581/581; piloto real 162 aprobadas / 0 fallidas / 4 omitidas heredadas. No se ejecutaron suites de frontend/navegador simulado (sin cambios de frontend) ni hardware físico.
- **Defectos del producto:** ninguno confirmado. Observaciones: sucursales son solo catálogo (sin aislamiento operativo por sucursal); compras con costo 0 permitidas por DTO; el cierre de caja solo lo hace su titular (caja huérfana si el cajero se desactiva).
- **Dictamen:** APTO CON CONDICIONES para piloto acotado (una sucursal, cierre diario por titular, revisión de cierres por ADMIN, respaldo previo a desplegar). No certifica producción general: hardware/Safari, variables de Render/Vercel, fiscalidad de #180 y aceptación del cliente siguen pendientes.
- **Entorno (no código):** como root, `initdb`/`pg_ctl` exigen envolturas con `runuser -u nobody` y `TMPDIR` 1777; `e2e-real/run.sh` ya usa `runuser` y necesita `PG_BIN` real (no las envolturas) y un `mktemp` fuera de `/tmp` si `chown` falla.
- **Bitácora:** lectura de AGENTS/contexto/NEXUS; línea base completa; revisión de ventas, caja, compras y controladores; escritura de escenarios con conciliación en enteros; corrección de nueve errores de la propia prueba; ejecución completa final; informe.

## Sincronización con main (PR #194) — 2026-10-23 UTC (rama `claude/sweet-davinci-vh7br4`)
- **Merge normal** de `origin/main` `01f9110` (seis commits: #193 Figma admin y #194 cancelación POS autorizada); sin force push, sin rebase. **Único conflicto:** `docs/CONTEXTO_MAESTRO.md` (ambas secciones conservadas). Ningún archivo de código cambió en ambos lados: `main` toca POS/Devoluciones/backend; la rama toca navegación, dashboard, Super Admin y estilos; el POS y la cancelación autorizada quedan intactos.
- **Pruebas tras el merge:** unitarias frontend 541/541; backend vitest 581/581; `tsc -b` limpio; build con `VITE_API_URL=/api` correcto; oxlint solo avisos (sin errores); Playwright simulado 364 aprobadas / 0 fallidas / 26 omitidas; piloto real NestJS+PostgreSQL 159 aprobadas / 1 fallida / 2 sin ejecutar / 4 omitidas. La fallida (`contingencia-real` n.º 14, service worker) **falla igual en `origin/main` `01f9110`** con la suite completa (159/1/2/4) y pasa aislada en ambas ramas: dependencia de orden preexistente, no introducida aquí. Incluye `pos-cancelacion-real` de #194.
- **No ejecutado:** integración PostgreSQL del backend (`npm run test:integration`; sin cambios de backend en esta rama; cubierta por #194), Safari/iPhone/tableta físicos, CI de GitHub.
- **Conflicto funcional documentado:** la instrucción de integración pedía conservar «TOPNAV/SIDEBAR configurable», pero esta rama retira esa opción por decisión de producto (layout único rail + barra superior; `modoNavegacion` sigue en API/Prisma sin leerse). Los negocios con TOPNAV configurado verán el layout único; no se pierde ninguna ruta ni permiso. Requiere confirmación de producto antes del merge.

## Navegación híbrida única y mejoras UX/UI de Stitch — 2026-10-23 UTC (rama `claude/sweet-davinci-vh7br4`, base `main` `b60b49b`, sin PR, merge ni despliegue)
- **Estado Git:** el PR #193 ya estaba **fusionado** en `main` (`b60b49b`) y la rama `codex/figma-admin-integration` ya no existe en el remoto; el trabajo continúa sobre la rama designada de esta sesión (que ya coincidía con `main`) sin crear ramas ni abrir PR. No hubo force push.
- **Detalle completo, diferencias con Stitch y pendientes:** [NAVEGACION_HIBRIDA_20261023.md](NAVEGACION_HIBRIDA_20261023.md); capturas en `docs/evidencias/navegacion-hibrida/`.
- **Decisión de producto aplicada:** TOPNAV/SIDEBAR dejan de ser opciones. `AppLayout` (`frontend/src/App.tsx`) usa siempre rail de 84 px + barra superior contextual (`AdminRail`/`CajeroRail` + `AdminTopbar`; Super Admin: `PlatformRail` + `PlatformTopbar`). `Sidebar.tsx` y `TopNavigation.tsx` se eliminaron; el valor histórico `modoNavegacion` se conserva en Prisma/API/`TenantInfo` como compatibilidad, **no se lee** para decidir el layout y los guardados ya no lo envían. Selectores y textos eliminados de Configuración, Marca, resumen de negocio y panel del Super Admin (ES/EN).
- **Por rol:** Super Admin (Inicio, Empresas, Módulos, Usuarios y soporte, Auditoría; sin «Configuración global» porque no existe a nivel plataforma), Admin, Cajero (Inicio, Caja, Mi caja, Más), Vendedor y Bodeguero (rail por módulos autorizados; entregas como «Logística»). **CONTADOR no existe en `main`** (llega con #180): el rail es genérico por `availableTasks`. RBAC, módulos y `ProtectedRoute` sin cambios.
- **Componentes nuevos:** `SoporteBanner` (aviso y salida del soporte remoto, extraído de `TopBar`), `MenuDesplegable` + `utils/posicionMenu.ts` (menú en portal, reposicionable, con teclado), `hooks/useFondoLogotipo` + `utils/fondoLogotipo.ts` (marco neutro claro/oscuro del logotipo), `styles/hybrid.css`. `TopBar` quedó solo como encabezado de página; `TaskFinder` pasó a la barra superior (Ctrl+K).
- **Pantallas:** Dashboard ADMIN fluido (4 indicadores en fila, columnas principal/lateral, contenedor hasta 1920 px); logotipo en rail con `object-fit: contain` y marco 56 px; empresas del Super Admin como tarjetas compactas con menú «Gestionar empresa» que no se recorta.
- **Fuera de este PR (documentado):** POS del cajero, contabilidad, inventario/auditoría/reportes móviles de Stitch; datos del prototipo que no existen en Jowa (MRR, cupos, RTN/subdominio, estaciones de cobro).
- **Pruebas (Chromium del entorno):** unitarias 536/536; `tsc -b` y build limpios; lint 111 avisos (= `main`); Playwright simulado completo 359 aprobadas / 0 fallidas / 26 omitidas; piloto real NestJS+PostgreSQL 155 aprobadas / 1 fallida / 2 sin ejecutar / 4 omitidas — la fallida (`contingencia-real` n.º 14, service worker) **falla igual en `origin/main` `b60b49b`**. Intermitente una vez: `session-lifecycle` logout (pasa al repetir). Sin prueba en Safari/iPhone/tableta física; CI de GitHub no consultado (sin PR). Detalle en el documento enlazado.
- **Pendientes reales:** rol Contador y su rail (PR #180); POS/contabilidad/inventario móvil de Stitch fuera de alcance; aceptación del cliente, merge y despliegue no realizados.

## Contabilidad (#180) actualizada con main #198 — 2026-10-25 UTC (rama `feat/contabilidad-honduras`, SHA `03ef20a`, borrador, sin merge ni despliegue)

- **Origen:** merge normal de `origin/main` `2f6168d` (PR #198) en la rama de #180. Sin rebase ni force push.
- **Conflictos resueltos:** `App.tsx` (shell híbrido de main + `ContadorRail` para CONTADOR; se retiran `TopNavigation`, `Sidebar` y `ShellTopbarContext`, ya eliminados en main), `SuperAdminPage.tsx` (tabla de empresas de main; módulos por defecto con `modulosPorDefecto()`, sin contabilidad), `guide.spec.ts` (17 controles: 16 + contabilidad apagada), `main.tsx` (`contador.css` + `hybrid.css`), `vercel-ignore.sh` (unión de exclusiones), `ventas.postgres.integration.ts` (ambos imports) y este documento (ambas bitácoras).
- **Sin duplicar migraciones:** `rol_contador` y `contabilidad_honduras` de #180 y `auth_recovery` de #198 conviven en orden cronológico. Contabilidad sigue opt-in y apagada por defecto.
- **Pruebas en `03ef20a`:** backend unitarias 682/682; scripts 51/51; frontend unitarias 558/558; `tsc -b` y build (`VITE_API_URL=/api`) correctos; guard de migraciones correcto (43 archivos, 2 nuevas); PostgreSQL integración completa 67 archivos, 1164 aprobadas, 1 omitida, 0 fallos; Playwright navegación/auth/sesiones/contabilidad 200 aprobadas, 4 omitidas; e2e-real completo local 180 aprobadas, 4 omitidas, 0 fallos. CI: «Piloto con API y PostgreSQL reales» success (job `test`); «Operación de ferretería» success (jobs `validate` y `guard-base-datos`).
- **Pendientes contables (sin implementar, requieren revisión del contador):** asientos automáticos persistentes (ventas, compras, cobros, pagos, costos, devoluciones); estados financieros y cierre anual; ISV por producto, exentos y tasas especiales; acreditación de compras; retenciones; tipos documentales; CAI/RTN; redondeo; criterios contables. Sin reglas fiscales nuevas ni certificación SAR.
- **Otros pendientes:** entrega real de correo (Resend) y variables de #198 antes de desplegar; validación física de Safari/iPhone/PWA; dictamen del propietario.

---

## Consolidación general — 2026-10-25 UTC (rama `consolidacion/jowa-20261025`, base `main` `01f9110a`, sin merge ni despliegue)

- **Detalle, matriz y pendientes:** [CONSOLIDACION_GENERAL.md](CONSOLIDACION_GENERAL.md).
- **Integrado:** #192 (autenticación por empresa, MFA y recuperación; cerrada sin merge y recuperada desde `15f63571`), #196 (`NODE_ENV`), #197 (pruebas del piloto) y #195 (navegación híbrida). Conflictos resueltos uniendo ambos lados.
- **No integrado:** #180 contabilidad Honduras (7 conflictos con el shell híbrido; dictamen propio NO MERGE). `claude/charming-planck-vmn1y4` está contenida en #180.
- **Pruebas locales:** backend 595/595; scripts 51/51; frontend 542/542; `tsc` y builds correctos; Playwright de navegación 159 aprobadas / 0 fallos / 4 omitidas; PostgreSQL 16 integración completa 1112 aprobadas / 1 omitida / 0 fallos (65 archivos).
- **Pendientes:** configurar #192 antes de cualquier despliegue (`AUTH_MFA_ENCRYPTION_KEY`, Resend, `AUTH_PUBLIC_URL`, enrolamiento MFA del propietario); reconciliar #180; validación en dispositivos físicos. No listo para producción.

---

## Consolidación `claude/charming-planck-vmn1y4` + `feat/contabilidad-honduras` — 2026-10-24 UTC (sin merge, despliegue ni migraciones en producción)

- **Comparación real:** `claude/charming-planck-vmn1y4` contiene `main` `01f9110a` (#194) y `feat/contabilidad-honduras` `c9a2a376` como ascendientes; 0 commits exclusivos de `main` y 0 de `feat`. Solo aporta dos commits: `a332d33` (renombra `20261020000000_rol_contador` y `20261020000100_contabilidad_honduras` a `20261022000100` y `20261022000200`, ordenándolas tras `main`; documentación de despliegue/rollback) y `10761e7` (verificación en CONTEXTO). No hay implementaciones duplicadas entre ramas: no se eliminó código.
- **Migraciones frente a `main`:** tres nuevas, todas posteriores a `20261022000000_guia_progreso`: `20261022000100_rol_contador` (`ALTER TYPE "Rol" ADD VALUE`, en migración propia), `20261022000200_contabilidad_honduras` (tablas fiscales y contables, triggers de vigencia, cuadre y solo-inserción, RLS) y `20261023000000_auth_recovery` (MFA, enlaces de acción, eventos de auth; `usuarios.email` pasa a opcional con restricción de identificador). Sin migraciones duplicadas.
- **Pruebas locales** (PostgreSQL 16 efímero en Linux, usuario no root; no es producción):
  - Backend: `prisma validate` válido (requiere `DIRECT_URL` en el entorno); `prisma generate`, build, lint sin errores (solo avisos previos), unitarias 676/676, scripts 51/51.
  - Integración PostgreSQL completa: 66 archivos, 1119 aprobadas, 1 omitida opt-in, 0 fallos. Incluye `migraciones-control-arranque` 16/16, `migrations` 10/10, `esquema-deriva` 3/3, `migracion-autenticacion` 2/2, `auth-recovery` y cancelación/ventas/caja/CXC/CXP.
  - Frontend: build con `VITE_API_URL` de prueba (la guarda exige HTTPS fuera de localhost; valor igual al del CI), lint sin errores (solo avisos previos), unitarias 544/544, Playwright simulado de autenticación y Contabilidad 26/26.
- **Revisión de seguridad:** endpoints de Contabilidad protegidos por `JwtAuthGuard`, `TenantGuard`, `RolesGuard` (ADMIN/CONTADOR) y permisos por ruta; recuperación con correo verificado, MFA, propósito y tenant comprobados, consumo transaccional por cuenta y revocación de sesiones al restablecer.
- **No ejecutado aquí:** `frontend/e2e-real` (harness completo con navegador oficial), Playwright completo, PWA/Safari/iPhone físicos, y CI del SHA publicado.
- **Pendientes reales (sin cambios):** Resend y variables de Render, enrolamiento MFA del Super Admin, `/api/health`, validación fiscal del contador, y bases preview con nombres antiguos de migración.
- **PR #180:** su head `feat/contabilidad-honduras` (`c9a2a376`) **no** incluía `a332d33`; sin esa corrección el PR no es desplegable. Se actualiza por avance rápido (sin force) al SHA `10761e7`. Sigue en borrador y **NO MERGE** hasta aprobación del propietario.

## PR #180 — preparación técnica para producción — 2026-10-24 UTC (sin merge, despliegue ni migraciones en producción)

- **Base:** `feat/contabilidad-honduras` `c9a2a376` ya contenía `main` `01f9110a` (0 commits de retraso). CI de ese SHA verde (test, validate, guard-base-datos).
- **Defecto corregido:** las migraciones `20261020000000_rol_contador` y `20261020000100_contabilidad_honduras` se ordenaban antes de `20261021…/20261022…` de `main`: una base con `main` quedaba `BLOQUEADA` (`HISTORIAL_CON_HUECOS`). Renombradas a `20261022000100_rol_contador` y `20261022000200_contabilidad_honduras` (mismo contenido/checksum, nunca aplicadas en producción); prueba de regresión en `migraciones-control-arranque.postgres.integration.ts`. Guardia sin relajar.
- **Corrección documental:** revertir solo el código hacia `main` tras migrar NO arranca (`MIGRACION_DESCONOCIDA`, reproducido); el rollback real requiere respaldo previo/reversión revisada.
- **Detalle:** `docs/PREPARACION_PRODUCCION_PR180.md` (disponibilidad, cuatro variables de Render, orden de despliegue, rollback, checklist del contador, no aprobado).
- **Verificado localmente:** backend 676/676, frontend 544/544, scripts 51/51, builds y lint sin errores; migraciones main→PR sobre PostgreSQL 16 efímero. PostgreSQL completo 1119 aprobadas/1 omitida opt-in/0 fallos (66 archivos, PG 16 efímero); Playwright auth-security + contabilidad-simulado 26/26. Piloto real y navegador completo: solo en CI del SHA publicado.
- **Pendientes del propietario:** Resend/variables, envío real autorizado, enrolamiento MFA, health check `/api/health`, validación fiscal del contador, bases preview con nombres antiguos de migración.

## Cancelación POS y anulación administrativa — 2026-10-23 UTC

- **Rama única y PR:** `codex/pos-cancelacion-autorizada`, [#194](https://github.com/Nelosama/FerreSystem/pull/194), base `main` `b60b49b3`. #180 y #192 inspeccionados y no modificados. Sin merge, despliegue, producción, dependencias nuevas ni migraciones.
- **Estado:** borradores con cancelar/continuar/descartar; solicitudes enviadas con descarte durable y auditable bajo los mismos bloqueos del cobro. Una venta confirmada se recupera, no se elimina. Anulación total por solicitud/devolución compensatoria existente y otro ADMIN autenticado; autoautorización y bypass directo total rechazados por backend.
- **Evidencia:** backend 581/581; frontend 523/523; PostgreSQL dirigido 194 aprobadas y una omitida opt-in; POS simulado 12/12; navegador/API/PostgreSQL reales 5/5; FARO real 28 aprobadas/2 omitidas heredadas. Builds/lint/guard correctos y deriva vacía en base temporal. PostgreSQL general: 1050 aprobadas/1 fallo (fixture histórico de reversión total directa); corregido a dos cuentas y repetición final 65/65 en entregas/crédito/auditoría de crédito. No se presenta la primera pasada como limpia. Checks del SHA final en #194; **NO MERGE** hasta su aprobación y revisión técnica.
- **Revisión técnica posterior del mismo PR:** SHA recibido `6df31a91`: piloto 160 aprobadas/4 omitidas y guard verdes; validate rojo por reapertura de confirmación. Reproducidos y corregidos el cierre prematuro de SweetAlert y la autorización de una petición en cola tras revocación de sesión (antes 201, ahora exige 401). La ruta de decisión revalida y bloquea la sesión del Admin dentro de su transacción; no acepta transición sin sid ni soporte. Pruebas rojas/verdes y matriz de los diez requisitos en [REVISION_PR194_20261023.md](REVISION_PR194_20261023.md). La regresión PostgreSQL completa pasó 1054/1054 sin omisiones. El ensayo de reinicio con perfil persistente y SW detectó además reescrituras de borradores idénticos entre ventanas; `saveDraft` ahora evita ese bucle conservando la protección frente a cambios reales. Pruebas de varias ventanas y reinicio completo incorporadas. Reproducido y corregido además el callback de una confirmación global que actuaba después de desmontar el POS/cambiar de cuenta: el ámbito se invalida al desmontar. Frontend 527/527 y navegador/API/PG 7/7, con cambio de cuenta entre tenants y preservación de la recuperación. Resultados de navegador/CI y dictamen sobre el último SHA se mantienen en #194. Sin merge ni despliegue.
- **Pendientes reales:** conexión necesaria para resolver un cobro incierto; PWA física/Safari no certificados; recuperación local corrupta requiere conciliación; fiscalidad de #180 separada. Preservar marcas `VENTA_DESCARTAR` y evitar convivencia con backend antiguo. Detalle de archivos, reglas, pruebas y límites en [POS_CANCELACION_AUTORIZADA_20261023.md](POS_CANCELACION_AUTORIZADA_20261023.md).
- **Bitácora:** inspección de POS, commit de venta, permisos/auditoría y PR actuales; rama desde main; cancelación transaccional sin esquema; flujo de anulación con dos cuentas; pruebas de carrera, idempotencia, rechazo, aislamiento, reservas, crédito y caja; adaptación de fixtures históricos; verificación de navegador real y documentación. **NEXUS** firma la evidencia PostgreSQL temporal.


## ADMIN — integración del prototipo Figma — 2026-10-23 UTC (rama `codex/figma-admin-integration`, base `main` `24ae784`, sin merge ni despliegue)
- **Alcance:** rail 84 px, barra superior e Inicio del ADMIN (solo SIDEBAR, sin impersonación). Detalle, fuentes de datos, diferencias con Figma y riesgos en `docs/ADMIN_FIGMA_20261023.md`; evidencia en `docs/evidencias/admin-figma/`.
- **Código:** `frontend/src/components/{IconRail,AdminRail,AdminTopbar}.tsx`, `pages/admin/AdminHomePage.tsx`, `utils/movilAdmin.ts`, `App.tsx` (AppLayout). Pruebas: `frontend/e2e/admin-shell-simulado.spec.ts` y especificaciones actualizadas.
- **Pendientes reales:** endpoint agregado para CxC/CxP; selector de sucursal informativo; decisión de tema global del tenant; TOPNAV e impersonación sin el nuevo shell; aceptación del cliente y merge/despliegue no realizados.

## Cierre de preparación a producción — PR #180 (2026-10-23 UTC, rama `feat/contabilidad-honduras`, sin merge ni despliegue)

- **Dictamen: NO MERGE.** El código y las pruebas automáticas están en verde en local; falta lo que solo puede cerrar el propietario o un contador (ver pendientes).
- **Configuración de producción (punto 1):** `AUTH_MFA_ENCRYPTION_KEY`, `AUTH_MAIL_RESEND_API_KEY`, `AUTH_MAIL_FROM` y `AUTH_PUBLIC_URL` son obligatorias con `NODE_ENV=production`; el arranque falla si faltan (`config-auth.ts`, comprobado con `dist/main.js`). No se generó ni publicó ningún secreto.
- **MFA del Super Admin (punto 2):** enrolamiento y bootstrap, login con TOTP y código de emergencia de un solo uso, expiración de tokens e inactividad, revocación de sesiones. Pruebas: integración PostgreSQL de recuperación 19/19; unitarias de MFA y seguridad 14/14; navegador de seguridad de cuenta 9/9.
- **Envío real de correo (punto 3):** no ejecutado. `backend/scripts/prueba-correo-resend.mjs` envía un solo mensaje de configuración solo con confirmación explícita del destinatario; comprobado que rechaza sin enviar. Pendiente: dominio verificado en Resend y autorización del propietario.
- **POS 14.1 (punto 4):** la causa era una carrera, no una regresión. El POS indexa el catálogo al cargarlo; la prueba buscaba antes. Reproducido con retraso de 5 s: el código anterior falla y el nuevo pasa. Se sustituyó la espera por tiempo por la espera del evento de carga. No se ocultó ningún fallo.
- **TOPNAV y SIDEBAR (punto 5):** conservados; `Sidebar.tsx` y `TopNavigation.tsx` no cambian frente a `main`. La rama `claude/sweet-davinci-vh7br4` no se integra.
- **PR #192 (punto 6):** todos sus commits son ancestros de #180. Los archivos de auth son idénticos entre ambos. Las diferencias restantes vienen de `main` posterior a su base y de resoluciones intencionadas (Contabilidad, Super Admin). **Superado.** No cerrado: decisión del propietario.
- **Fiscal (punto 7):** ningún cálculo modificado. Parámetros pendientes de validación externa en `docs/CONTABILIDAD_HONDURAS.md` §11.
- **Pruebas (punto 8), sobre `ea8967c` en local:** backend build, lint, unitarias 676/676, scripts 51/51; frontend tsc, build, lint, unitarias 539/539; PostgreSQL completo 1103/1103; navegador CI 346/346; E2E real 160/161.
- **Riesgos pendientes:** (1) correo real sin probar; (2) enrolamiento MFA del Super Admin antes de liberar, las sesiones antiguas se rechazan; (3) normativa fiscal sin verificación profesional; (4) el E2E real falla localmente en el service worker 14 y no ejecuta 13 y 15 por el bloque serial: en CI pasaban en el head anterior y debe confirmarse en el head final; (5) el arranque en producción ahora exige variables nuevas: un despliegue sin ellas no inicia; (6) Safari, PWA e iPhone sin prueba física.
- **Bitácora:** inspección de PR y ramas; configuración y arranque; MFA y recuperación; reproducción de la carrera; comparación #192/#180; revisión fiscal; pruebas completas. Sin merge, sin despliegue, sin migraciones productivas, sin secretos reales, PR #180 en borrador y #192 abierto.

## Integración PR #180 con auth y recuperación (PR #192) — 2026-10-23 UTC (rama `feat/contabilidad-honduras`, sin merge ni despliegue)

- **Base elegida:** `feat/contabilidad-honduras` (contiene `main` `b60b49b` completo, PR #180 en borrador). `codex/auth-recovery-security` se integra por merge normal; `claude/sweet-davinci-vh7br4` **no** se integra (ver pendientes).
- **Conflictos resueltos (7):** `usuarios.service.ts` (username + permisos de CONTADOR), `NegocioDetallePage.tsx` y `UsuariosPage.tsx` (alta general sin contraseña; CONTADOR en el rol), locales es/en (fusión por claves; `shell.login.email` = «Usuario, código o correo»), `vercel-ignore.sh` (unión), `CONTEXTO_MAESTRO.md` (ambas secciones).
- **Correcciones:** `autorizacion-rutas.spec.ts` admite `RecoveryController` en rutas sin `@Roles` (seguridad de cuenta propia; no tocan negocio); prueba de contabilidad sin contraseña en el alta (la política de auth la rechaza con 400); E2E de CONTADOR fija su contraseña con el enlace privado del Super Admin.
- **Pruebas locales (sobre `65c7ba3`):** backend build, lint, unitarias 669/669; scripts 51/51; PostgreSQL temporal suite completa 1102/1103 antes de la última corrección y 26/26 contabilidad después; frontend tsc, build, lint, unitarias 539/539; navegador simulado en modo CI 346/346. E2E real 160/161: falla solo el test 14 del service worker, que en CI pasa y falla en local con Chromium 1194 (también falla en `main` local). El 13 falla localmente por una promesa de IndexedDB recogida; en CI pasa.
- **Pendientes reales:** verificación normativa de contador; variables de producción de auth (`AUTH_MFA_ENCRYPTION_KEY`, correo Resend y `AUTH_PUBLIC_URL`) sin probar con proveedor real; enrolamiento MFA del Super Admin antes de liberar; decidir `claude/sweet-davinci-vh7br4` (rediseño que elimina TOPNAV/SIDEBAR, contrario a la regla de distribución única de #177/#193: requiere decisión del dueño); PR #192 queda superado por este merge (cerrar o no es decisión del dueño); Safari/PWA/iPhone sin prueba física.
- **Bitácora:** inspección de ramas y PR; base y merge de auth; resolución de conflictos con reglas de auth; pruebas en rojo y verde; test de rutas actualizado con justificación; sin force push, sin merge a `main`, sin migraciones productivas.

## PR #180 — continuación: compatibilidad, motor contable y navegación del CONTADOR — 2026-10-23 UTC (rama `feat/contabilidad-honduras`, sin merge ni despliegue)

- **Alcance:** continuación sobre el mismo PR (sin rama ni PR nuevos, sin rebase ni force push). Detalle técnico en [CONTABILIDAD_HONDURAS.md](CONTABILIDAD_HONDURAS.md) §10.
- **Etapa A — compatibilidad:** merge normal de `main` `24ae784` (#185, #188, #189, #190, #191). Quince conflictos resueltos conservando ambos lados. **Riesgo crítico verificado:** Contabilidad sigue apagada sin registro habilitado (`OPT_IN_TENANT_MODULES`/`moduleEnabled` en `common/tenant-modules.ts`, usado por `TenantModuleGuard`). Defecto real hallado y corregido: la validación de #189 en `SuperAdminService.updateTenantModules` solo aceptaba los 16 módulos predeterminados, por lo que el Super Admin no podía encender Contabilidad; ahora valida contra `CONFIGURABLE_TENANT_MODULES`. «Activar todos» del Super Admin no enciende Contabilidad. Pruebas de regresión en `tenant-modules.spec.ts`, `tenant-module.guard.spec.ts` y `super-admin.service.spec.ts`.
- **Etapa B — motor puro** (`backend/src/contabilidad/motor/`): conceptos (no cuentas), reglas en centavos enteros para venta (contado/crédito), costo de venta, cobro CxC, pago CxP, compra (+recepción) y devolución (ISV proporcional, reverso de descuento), `validarCuadre` sin ajuste de centavos, resolución concepto→cuenta con vigencia, clave/huella de origen, adaptadores fila→entrada y `proponer()` (LISTA / FALTA_MAPEO / SIN_ASIENTO / ERROR). Las políticas sin aprobar (descuento BRUTO/NETO, momento del inventario de compras) son parámetros obligatorios. No está conectado a ninguna ruta ni escribe datos.
- **Etapa C — bloqueada por autorización de esquema:** persistencia de lotes, origen de asientos y mapeo de cuentas quedó como **propuesta NEXUS** en `backend/prisma/propuestas/contabilidad-asientos-automaticos/` (validada con 14 casos en PostgreSQL efímero; la validación halló y corrigió un CHECK que aceptaba NULL). **No es migración**: falta autorización del dueño y firma de NEXUS. Sin ella no hay pendientes persistentes, lotes ni contabilización; por eso no existe la pantalla «Por contabilizar».
- **Etapa D — interfaz:** `ContadorRail` (Inicio, Asientos, Reportes, Cierre, Más) con el diseño del rail del cajero; píldoras de sección en móvil y para el ADMIN; Inicio con estado del período, balanza, alertas, ISV de trabajo y acciones frecuentes (solo lectura); reversión de asientos con motivo y confirmación; cierre/reapertura con confirmación y validaciones previas; centro de descargas Excel. ES/EN. Los permisos de Contabilidad solo se ofrecen en Usuarios si el módulo está contratado.
- **Etapa E — reportes:** libro mayor (`GET /contabilidad/mayor`, reporte `mayor` en Excel/CSV/PDF) y balanza con saldo inicial (también en Excel). Estados financieros e importación Excel **no** se implementaron: requieren clasificación de cuentas y detección de duplicados (esquema) definidas por el contador.
- **Pruebas (local, Chromium 1194 y PostgreSQL 16 efímero):** ver resultados definitivos en el PR; esta sesión: backend unitarias 658/658, build y lint sin errores; frontend unitarias 529/529, `tsc -b` y lint sin errores; integración contabilidad 26/26 (mayor, saldo inicial entre períodos, aislamiento, permisos); propuesta de esquema 14/14; e2e simulado de Contabilidad 16/16; `guide` y `ux-ronda1` actualizados a 17 controles. No ejecutado: piloto `e2e-real`, Safari/iPhone, dispositivo físico, producción.
- **Pendientes reales:** (1) autorización de esquema (NEXUS) para la Etapa C; (2) decisiones del contador: política de descuentos, momento del inventario en compras, valuación de costos, cuentas de tarjeta/banco, reparto base/ISV en devoluciones, cierre en período cerrado, estados financieros; (3) verificación normativa por un contador (SAR inaccesible); (4) compatibilidad con #192 (toca `tenant-module.guard.ts`, `tenant.guard.ts` y usuarios) y #193 (rail ADMIN): resolver al integrar el segundo.
- **Bitácora:** lectura de AGENTS/contexto/NEXUS; merge de `main` con 15 conflictos; pruebas de módulo por defecto; motor y propuesta de esquema; UI del CONTADOR; mayor; actualización de e2e. Un `npm run build` del backend falló por un narrowing en `motor/propuesta.ts` (strictNullChecks desactivado) en un commit intermedio; corregido en `a0c5185`.


## Super Admin — layout híbrido (rail, topbar y pestañas) — 2026-10-23 UTC (rama `claude/amazing-bohr-9e5bpj`, sin PR, merge ni despliegue)

- **Origen y alcance:** brief «Rediseño de navegación del Super Admin» (rail de iconos + topbar + pestañas contextuales). Solo reorganiza navegación y aplica el tema visual; no cambia rutas, permisos, consultas de negocio ni backend. Sin dependencias nuevas (React + CSS tradicional + lucide-react).
- **Tema:** `frontend/src/styles/tema.css` define una sola vez los tokens del brief en `:root` (`--bg`, `--surface`, `--accent`, `--plat`…), `color-scheme: light`, `body` y `:focus-visible`. `frontend/src/styles/plataforma.css` aplica el shell; sus alias de neutros (`--color-bg`, `--color-text-main`…) y de marca se declaran solo dentro de `.platform-shell`, de modo que el teal no depende del negocio.
- **Estructura implementada:**
  - Rail de 84 px con cuatro áreas (Inicio, Clientes, Servicios, Seguridad) en `components/PlatformRail.tsx`; `<nav aria-label="Áreas de la plataforma">`, `aria-current`, etiquetas visibles de 11 px.
  - Topbar de 56 px en `components/PlatformTopbar.tsx` con el área y la pill «Super Admin»; a la derecha, idioma, usuario y cierre de sesión existentes.
  - Pestañas del área en `components/PlatformTabs.tsx` (`role="tablist"`/`tab`, `aria-selected`, flechas), solo si el área tiene más de una sección: Clientes → Negocios · Administradores; Seguridad → Auditoría · Soporte remoto · Respaldos.
  - Detalle de negocio: breadcrumb «Negocios › Nombre», cabecera con insignia de 44 px y métricas, y cinco pestañas tipo píldora en `components/NegocioNavigation.tsx`, que también usan Configuración y Auditoría.
  - `App.tsx`: el SUPERADMIN usa siempre el shell de plataforma, sin depender de `modoNavegacion`. `PlatformSidebar.tsx` se elimina.
- **Rutas y datos:** `?seccion=` y todas las rutas `/admin/negocios/:id/...` se conservan. `config/platformNavigation.ts` añade áreas y etiquetas. La cabecera del negocio pide sucursales y usuarios con los listados que ya existen (si falla, muestra «—»).
- **Responsive:** tableta (≤1024 px) con padding de 22 px, etiquetas cortas («Resumen», «Configuración», «Soporte») y métricas secundarias ocultas. Móvil (≤640 px) con el rail como barra inferior fija de cuatro iconos con etiqueta, topbar compacta y pestañas con desplazamiento horizontal sin barra visible.
- **Pruebas:**
  - Unitarias frontend **502/502**; `tsc -b` sin errores; lint con 117 avisos, igual que `main`.
  - Playwright con Chromium 1194 del entorno: menu-jowa-v3, diseno-unico, navigation-settings, ux-ronda1-regresion, guide, arranque y admin-home. Resultado: la suite de cuatro archivos clave pasa **80/80** tras corregir la regresión de contraste del POS (ver abajo), y el conjunto ampliado **119/119** antes del último ajuste de test; la suite completa queda registrada en el PR cuando exista, no en este documento.
  - Regresión detectada y corregida: aplicar `--color-bg` a todo el sistema bajaba el contraste del aviso de caja del POS (4.35:1 < 4.5:1). Los alias de neutros se limitaron a `.platform-shell`; los negocios mantienen sus colores actuales.
  - Actualizados selectores y expectativas de navegación del SUPERADMIN en cuatro e2e (estructura nueva; las aserciones de acceso, idioma y formularios se mantienen).
- **Evidencia visual local:** capturas de escritorio 1280, tableta 1024 y móvil 390 revisadas; no se guardan en el repositorio.
- **Pendientes reales:**
  - **Decisión del dueño:** el brief pide el mismo tema para todos los usuarios, pero `TenantContext` sigue aplicando el color del negocio a `--color-primary` en la app de los negocios. Hasta confirmar, no se ha cambiado ese comportamiento.
  - La topbar de página (`TopBar`) queda oculta en el shell del Super Admin, así que Configuración y Auditoría ya no muestran su título visible. Hace falta un título de página en el shell.
  - «Configuración y marca» enlaza a `/configuracion`; `/marca` sigue siendo una página aparte. La fusión de contenido no se hizo porque cambia lógica de formularios.
  - La tabla de negocios no se convirtió en filas con chevron ni en dos líneas en móvil; conserva su estructura de tabla.
  - Sin prueba en Safari, iPhone ni tableta física.
- **Bitácora:** lectura de AGENTS y del contexto; revisión del brief y del código del Super Admin; implementación por capas (tema, shell, pestañas, negocio); corrección de TopBar con `!important` por estilo en línea; regresión de contraste en POS corregida; ajuste de e2e y capturas.

## PR #191 — fallos del piloto real y duplicados de navegación — 2026-10-23 UTC (rama `claude/amazing-bohr-9e5bpj`, sin merge ni despliegue)

- **Origen:** el piloto con API y PostgreSQL reales del CI (run 39883743640, job 120186955723) dio 154 aprobadas, 4 fallidas y 4 omitidas, todas en `e2e-real/administracion-cloud-real.spec.ts`.
- **Diagnóstico (log del job):** tres fallos eran un **control duplicado real**: `getByTitle('Cerrar Sesión')` resolvía a `platform-topbar-logout` y al botón de cierre de la `TopBar` de la página, que solo estaba oculta con CSS pero seguía en el DOM (con idioma, usuario y campana también duplicados). El cuarto era un **selector desactualizado**: buscaba el menú lateral antiguo («Menú de plataforma», lista «Administración del negocio»).
- **Corrección de la causa (sin `.first()`):** `context/PlatformShellContext.ts` marca que la página está dentro del shell del Super Admin; ahí `TopBar` solo pinta el encabezado de página (título y subtítulo, 22 px) y no renderiza idioma, usuario, caja ni cierre de sesión. La campana de notificaciones se extrajo de `TopBar` a `components/NotificacionesBell.tsx` (misma lógica y JSX) y la usan ambas barras, así que el Super Admin la conserva. `NegocioDetallePage` ya no repite su título (la cabecera del negocio lo ofrece). Resultado: un solo cierre de sesión por contexto.
- **Pruebas reales actualizadas:** la prueba de sucursales usa el rail (áreas), las pestañas del área y las del negocio con `useInnerText`; la de visita inicial comprueba `toHaveCount(1)` del cierre de sesión antes de usarlo. Las otras dos no necesitaron cambios de selector.
- **Cajero:** etiquetas cortas del rail «Caja» y «Mi caja» (`navigation.rail_pos`/`rail_cash`, ES/EN; el nombre completo queda como ayuda). Contraste del estado activo cubierto con contorno de 1 px (`box-shadow` inset con el color del negocio aclarado) y prueba con #F5C400, #FDE68A, #FFFFFF, #EA580C, #0F172A y #000000: icono 3:1 sobre su pastilla, etiqueta 4.5:1 sobre el rail y contorno 3:1 sobre el rail. La prueba falla sin el contorno (comprobado).
- **Nueva `e2e/cajero-rail-simulado.spec.ts` (13 casos):** 1366×768, 1920×1080 y 1920×1080 al 125 % y 150 % (rail de 84 px, etiquetas ≥ 12 px, sin desborde, «Más» dentro de pantalla); «Más» solo con accesos existentes; un único cierre de sesión que funciona en CAJERO y SUPERADMIN; contraste con seis colores de negocio.
- **Cerrado respecto a la sección anterior:** título de página visible en Configuración y Auditoría (encabezado del shell). Siguen pendientes los demás puntos de ese PR.
- **Pruebas y SHA:** los resultados de cada ejecución y el SHA final se registran en el PR #191.

## Cajero — rail de iconos (Inicio, Caja, Mi caja, Más) — 2026-10-23 UTC (rama `claude/amazing-bohr-9e5bpj`, sin merge ni despliegue)

- **Origen:** referencia de Lovable (capturas y estructura del menú del cajero, no accesible desde el entorno) y contexto del dueño: interfaz sencilla, opciones visibles que funcionen y respeten permisos, PWA en 1366×768 y 1920×1080, texto legible, colores y logotipo del negocio. React y CSS tradicional; sin alertas nuevas (el rail no usa `confirm` ni SweetAlert2).
- **Implementado:** `components/CajeroRail.tsx` y `styles/cajero.css`. Rail de 84 px con el logotipo del negocio, tres accesos fijos (Inicio, Caja, Mi caja, según los módulos y permisos del rol) y «Más», que abre el resto de accesos autorizados agrupados. Etiquetas de 12 px. El estado activo usa el color configurado por el negocio (`--color-primary`, aclarado para leerse sobre el fondo oscuro). Conserva el indicador de conexión con las ventas de contingencia pendientes y la atenuación «en línea» de los módulos que necesitan red, que no formaban parte de la referencia. `App.tsx` lo usa solo para CAJERO en modo barra lateral; modo barra superior, móvil (barra inferior existente), rutas y permisos sin cambios. «Más» se omite si no queda ningún acceso.
- **Sincronización:** merge normal de `main` `ba201465` (PR #190, SweetAlert2) sobre la rama; único conflicto en este documento, resuelto conservando ambas bitácoras. Sin rebase ni force push.
- **Pruebas:** unitarias 513/513; `tsc -b` sin errores; lint 117 avisos (= `main`). E2E de navegación y POS ajustados a la estructura nueva del cajero (resultado en el PR). Sin prueba en Windows con escalado ni en equipo físico.
- **Pendientes reales:** la topbar de página sigue siendo la existente (no se rediseñó); el catálogo a la izquierda y carrito a la derecha del POS no se tocaron porque cambian la pantalla de cobro y sus reglas; verificar contraste del estado activo con marcas muy claras; `ADMIN`, `VENDEDOR` y `BODEGUERO` conservan el menú lateral actual.

## Notificaciones y confirmaciones con SweetAlert2 — 2026-10-23 UTC (rama `claude/admiring-albattani-n1ruvp`, sin merge ni despliegue)

- **Auditoría previa:** 13 llamadas a `window.confirm` (ProductoGestion, ProveedoresProductoPanel, ProveedoresGestion, LogotipoNegocioEditor, OperacionesPage ×2, LevantamientoPage ×3, ArqueoCajaPage, NegocioDetallePage ×2, SuperAdminPage) y 3 `alert` (TopBar, csvExport, excelExport). Los mensajes inline `role="alert"/"status"` de POS, Inventario, Devoluciones, Garantías y similares se conservan: son estados de operación, no interrupciones.
- **Servicio:** `frontend/src/utils/alertasOpciones.ts` (lógica pura: textos con respaldo, opciones de confirmación, control de duplicados) y `frontend/src/utils/alertas.ts` (SweetAlert2: `alertas.exito/error/advertencia/toast` como toast no bloqueante; `alertas.confirmar` como modal solo cuando hay que decidir). Estilos en `frontend/src/utils/alertas.css` con tokens de marca (`--color-primary`, `--color-on-primary`, `--color-danger`). El traductor activo se registra desde `I18nContext`; claves `alerts.*` en ES y EN.
- **Reglas de uso:** acciones peligrosas (desactivar, quitar, eliminar conteo, desactivar módulos, cerrar caja con cambio) abren con foco en Cancelar; las demás, con foco en Confirmar. Una confirmación abierta bloquea otra y devuelve `false`, así que nunca se ejecuta sin confirmación. Un toast que llega con el modal abierto se encola y se muestra al cerrarlo. Mensajes idénticos en 2 s se filtran.
- **Dependencia:** `sweetalert2@11.26.25` (versión exacta, publicada el 2026-05-23) en `frontend/package.json` y `frontend/package-lock.json`.
- **Migrados:** las 13 confirmaciones y los 3 `alert` anteriores. Ningún `window.confirm`/`alert` queda en `frontend/src` (guard en `frontend/test/alertas-guard.test.mjs`).
- **Fuera de alcance, sin cambios de negocio:** autenticación, sesiones, permisos, cálculos, POS y operaciones monetarias. No se añadió confirmación nueva a ventas ni anulaciones: no existían confirmaciones nativas en esos flujos y el requisito pide evitarlas en operaciones frecuentes.
- **Pruebas:** `npm test` 513/513 (11 nuevas: `test/alertas.test.mjs` 8, `test/alertas-guard.test.mjs` 3); `npx tsc -b` sin errores; `npm run lint` con 117 avisos, igual que la base (sin avisos nuevos); `VITE_API_URL=/api npm run build` correcto. e2e simulados: se actualizaron los 13 archivos que aceptaban diálogos nativos (`e2e/` y `e2e-real/`); los 78 casos de los archivos afectados pasan con Chromium local. e2e-real no se ejecutó: requiere backend y PostgreSQL temporal.
- **Límites:** no validado en dispositivo físico, PWA instalada, ni con lectores de pantalla (VoiceOver/NVDA). El contraste se apoya en los tokens existentes (`--color-on-primary`, `AvisoColorMarca`); no se midió con todos los colores de marca posibles.
- **Pendientes reales:** textos de ProveedoresGestion, LogotipoNegocioEditor y del gestor de sucursales/usuarios de NegocioDetallePage siguen en español fijo (sus componentes no tienen i18n); el confirm de Super Admin para módulos ya usa `modules.confirm`. El modal propio de activación de modo edición en TopBar no se migró (requiere motivo escrito). Los mensajes inline no se convirtieron en toast para evitar duplicados.
- **Riesgo de conflicto con otros PR:** tocan `OperacionesPage.tsx`, `LevantamientoPage.tsx`, `SuperAdminPage.tsx`, `NegocioDetallePage.tsx`, `ProductoGestion.tsx`, `I18nContext.tsx`, `locales/es.json` y `locales/en.json`, `frontend/package.json` y `package-lock.json`, y los e2e de compras, caja, levantamiento, productos, proveedores, guía y balance.

---

## Seguimiento del piloto PR #192 — 2026-10-23 UTC

- Misma rama `codex/auth-recovery-security`, PR en borrador. Los siete fallos de [run 39884731901](https://github.com/Nelosama/FerreSystem/actions/runs/39884731901) son regresiones nuevas del arnés por asignación administrativa directa de contraseñas; no fallos heredados ni razón para relajar el backend. Los siete fixtures usan ahora enlaces privados y verifican consumo único; acceso latente de Super Admin actualizado con MFA sintético.
- Matriz PostgreSQL 18 local: **19/19**, incluida conservación del hash previo, deploy repetido, ausencia de deriva, MFA/recuperación/sesiones/tenants y límites compartidos por cuenta/IP. **NEXUS**: sin cambios nuevos de esquema ni de migraciones en esta corrección. CI del piloto ejecuta esta matriz explícitamente. El piloto masivo usa umbrales finitos mayores solo en su clúster efímero; la matriz conserva y prueba los umbrales productivos.
- Pasadas iniciales locales no verdes se separan de los siete 400 originales: arnés Windows con argumentos SQL ANSI, zona horaria de PostgreSQL y build de React en modo test (doble montaje y bloqueo de pestaña). Se repite el piloto íntegro con build de producción, PostgreSQL UTC y codificación nativa correcta; contingencia ya supera logout/cambio de cajero. No se modifica lógica del POS. El paso nuevo de matriz en CI reveló un defecto del arnés Linux: socket predeterminado sin permisos; corregido con socket dentro del directorio efímero y diagnóstico de arranque. Resultados completos, clasificación de cualquier fallo restante y enlaces por SHA se mantienen en [PR #192](https://github.com/Nelosama/FerreSystem/pull/192). Ninguna pasada parcial se presenta como verde.
- El simulacro de actualización también contenía un acceso de Super Admin sin MFA, antes oculto por el fallo temprano del piloto. Se adapta humo-preproduccion.mjs a SUPERADMIN_MFA_CODE; el ensayo aislado genera un código sintético distinto por login mediante test/synthetic-upgrade-mfa.cjs, sin modificar la contraseña. Se comprueba el hash histórico antes de inicializar MFA. Esta es otra incompatibilidad nueva del arnés con MFA obligatorio, no un fallo heredado del backend.
- La validación general cf8f4550 descubrió además 5 suites de integración incompatibles (72 fallos / 989 aprobadas / 2 omitidas): ventas y reportes omitían auth_recovery; migracion-autenticacion la aplicaba antes de sesiones_auth; la foto de Modo Guía incluía columnas nuevas; real-ciclo-ventas-browser conservaba input[type=email]. Se corrigen exclusivamente fixtures: orden/listas de migración, proyección de TODOS los campos históricos (hash incluido), MFA sintético para un login adicional de plataforma y selector estable. Primeras tres suites locales: 72/72; se repiten las restantes y CI. Son regresiones nuevas del arnés de esta rama, no fallos heredados del negocio.
- Sin merge ni despliegue. Continúan pendientes CI final y revisión de seguridad.

## Autenticación, MFA y recuperación privada — 2026-10-22 (America/Tegucigalpa)

> **Actualizado el 2026-10-26** por «Autenticación consolidada #200 + #201» (arriba): MFA, cifrado TOTP y enrolamiento siguen vigentes; cambian el login (sin empresa), la recuperación de Admin/Super Admin (contraseña temporal en lugar de `RESET_EMAIL`) y el bloqueo de cuentas operativas.

- **Rama y PR únicos:** `codex/auth-recovery-security`, [PR #192](https://github.com/Nelosama/FerreSystem/pull/192) en borrador, base inicial `ed720baf` (#189), sincronizada mediante merge normal con `ba201465` (#190). Conflictos exclusivamente en los dos JSON de idioma: se conservaron `alerts.*` de main y `security.*`/identificador del login de esta rama. Se mantienen notificaciones/confirmaciones de #190. Sin cambios funcionales en POS, inventario, caja ni contabilidad; selectores de login de sus pruebas se adaptan al identificador de texto. Sin merge a main ni deploy. La rama se excluye de preview Vercel.
- **Auditoría y decisión:** se elimina la elección de empresa comparando contraseñas entre tenants. Usuario/código y correo compartido requieren empresa; correo globalmente único conserva compatibilidad y resuelve empresa antes del password. `username` normalizado único por tenant; correo opcional en empleados. Super Admin conserva tabla y acceso independientes, con MFA obligatorio en ambas entradas y refresh/validación. No se atribuye una pérdida real de contraseña a producción: no se consultó esa base. Seed actual ya conserva hashes y está bloqueado en producción. El comando explícito de reemplazo sí borraba/recreaba Super Admin; se retira y sustituye por recuperación de mantenimiento sobre la misma identidad, sin bypass de MFA.
- **Recuperación:** correo verificado + TOTP/código de emergencia para Super Admin/Admin; empleados sin correo automático, enlace privado de diez minutos emitido por Admin del mismo tenant o Super Admin, con reautenticación del emisor. Otro ADMIN requiere MFA para restablecer a un ADMIN; nunca la cuenta propia. No se asignan contraseñas de empleados desde gestión. Todos cambian su propia clave con la actual. Hash de tokens, consumo transaccional serializado, vinculación a correo/hash/tipo/empresa, expiración/replay, auditoría propia `auth_events` y revocación de sesiones. TOTP cifrado AES-GCM por cuenta, pasos anti-replay y diez códigos de emergencia de un uso. No se marcan correos antiguos verificados de oficio.
- **NEXUS:** migración nueva `20261023000000_auth_recovery`, sin modificar las publicadas ni escribir hashes/usuarios existentes. Añade campos/acciones/códigos/auditoría y unicidad del identificador. Sesiones nuevas ligadas al hash para cerrar la carrera login/reset; inactividad backend de quince minutos. Prueba real de upgrade desde todas las migraciones previas conserva el hash anterior, repite deploy y comprueba deriva nula. Guard y catálogo SHA LF/CRLF actualizados. Solo clústeres PostgreSQL 18 efímeros de loopback, nunca producción.
- **Web/PWA:** ES/EN, empresa preseleccionada en enlaces de empleados, identificador/código/correo, recuperación privada y códigos solo en memoria; fragmento retirado antes de pintar. Panel de cuenta, cambio privado y bloqueo a cinco minutos/cambio de empleado mediante nuevo login online. Se conservan diario y autorización existente del POS de contingencia, sin login offline nuevo. Passkeys quedan como contrato seguro documentado, sin activar PIN, biometría simulada ni acceso desde dispositivos desconocidos. El rol CONTADOR aún depende del PR #180; cualquier rol no ADMIN sigue política de empleado.
- **Evidencia local:** backend unitario **589 aprobadas / 3 omitidas**; nuevas PostgreSQL **18/18**, incluidas HTTP NestJS/DTO/CSRF, verificación/enrolamiento de Admin, carreras, expiración/replay, aislamiento, MFA y persistencia; regresión autenticación/gestión de usuarios **67/67** en una pasada anterior que incluía 16 de las nuevas; administración cloud/logotipo/seguridad/onboarding **73/74** inicialmente por alta de empleado con contraseña antigua del arnés, corregido al flujo privado; onboarding + barrido exhaustivo de rutas **25/25** después. E2E de caída/reinicio/lecturas/escrituras/soporte **6/6** después de adaptar el alta privada y usar PG_BIN local. Builds backend/frontend, Prisma y guard correctos; lint sin errores, avisos existentes.
- **Navegador tras integrar #190:** suite completa Chromium **290 aprobadas / 2 fallidas / 15 omitidas**; las dos de Inventario («alta sencilla» SIDEBAR/TOPNAV, barra móvil intercepta guardar) se reprodujeron en copia intacta de `ed720baf`. No se arregla Inventario en este PR. Nuevas de autenticación finales **9/9 Chromium y 9/9 WebKit**, a 320/390/1440, y sesiones móvil/PWA **16/16**. WebKit detectó dos aserciones nuevas del arnés: ancho menor al viewport se consideraba error y no se esperaba al retiro del fragmento; corregidas manteniendo ausencia de desborde/token. Motor WebKit no equivale a iPhone físico.
- **Límites reales:** frontend unitario **475 aprobadas / 6 fallidas / 19 omitidas de 500**; scripts backend **35 aprobadas / 4 fallidas / 12 omitidas de 51**. Las seis fallas frontend y cuatro de arranque reproducidas en copia de main inicial: rutas `C:\C:\...`/separadores POSIX y URL.pathname de Windows. No se presentan suites completas como verdes. npm audit informa backend 5 avisos (2 altos, 3 moderados) y frontend 3 altos en dependencias heredadas; no hay cambios propios de dependencias/lockfiles frente a main actual.
- **Antes de liberar:** cuenta/remitente/DNS de Resend, entrega real, secreto dedicado AUTH_MFA_ENCRYPTION_KEY con respaldo, origen HTTPS y cookies reales, NTP y enrolamiento del propietario coordinado (sesiones anteriores de Super Admin no acreditan MFA). Prohibir solapamiento de código antiguo en el cambio de política. iPhone/Safari/PWA instalada físicos y CI del commit final pendientes. Tokens de acceso en localStorage y aceptación de contingencia siguen su contrato previo; no se certifican como resueltos. Passkeys requieren una implementación WebAuthn posterior y dominio/RP ID definitivos. Procedimiento de emergencia con doble aprobación de infraestructura; el comando no salta MFA perdido.
- **Configuración e informe:** [AUTH_RECOVERY_SECURITY.md](AUTH_RECOVERY_SECURITY.md), DTO/servicios en `backend/src/auth`, matriz PostgreSQL `backend/test/auth-recovery.postgres.integration.ts`, navegador `frontend/e2e/auth-security.spec.ts`. Resultados y dictamen definitivos por SHA se mantienen en el PR dedicado. Firma de esquema y persistencia: **NEXUS**.

---

---


## PR #189 — sincronización tras integrar #188 (2026-10-22 UTC)

- **Diagnóstico comprobado:** `main` avanzó de `97609ed5` a `86bd1d74` al integrar #188. GitHub aún mostraba la base anterior en su snapshot de #189, pero el merge real confirmó conflictos en `docs/CONTEXTO_MAESTRO.md` y `frontend/src/pages/NegocioDetallePage.tsx`; los checks verdes de `dd3170b0` no validaban esta combinación. No se atribuye el bloqueo a protecciones o pruebas pendientes.
- **Resolución:** merge normal de origin/main sobre la misma rama, sin rebase, force push ni ramas nuevas. ModuleControls, confirmación, recarga y auditoría permanecen; marca conserva AvisoColorMarca y estiloMarcaNegocio de #188. Contexto conserva ambas bitácoras. Revisados TenantContext (refresco de módulos y contraste), Configuración (modoGuia y marca), SuperAdminPage (controles y marca), locales y operaciones.test. POSPage, InventarioPage, servicio de ventas, AuthService y estrategia JWT son idénticos a main. #185 y #188 quedan en la ascendencia; #180 continúa separado.
- **Pruebas antes de publicar:** frontend 502/502; backend 581/581; scripts 48/48; Python 10/10; build/tipos/lint sin errores, avisos heredados; Prisma válido y guard de migraciones correcto. Dos regresiones nuevas 1280/390 verifican marca, TOPNAV, guía y los 16 estados apagados tras guardar/recargar. La primera ejecución del arnés esperaba mayúsculas en el valor nativo del selector de color; corregida a su valor minúsculo sin modificar código funcional. PostgreSQL completo, navegador y piloto real se vuelven a ejecutar; sus resultados definitivos y los checks del SHA final se registran en el PR, sin reutilizar los del SHA anterior.
- **NEXUS:** esta sincronización no cambia schema ni migraciones. La migración de progreso conserva su checksum y sigue verificándose sobre PostgreSQL efímero, nunca producción. Sin merge a main ni despliegue.

## Modo Guía y control de módulos — preparación inicial del PR #189 (2026-10-22 UTC)

- **Rama y PR únicos:** `codex/guia-control-modulos`, [#189](https://github.com/Nelosama/FerreSystem/pull/189). Merge normal `947067f3` de `main` `97609ed5`, con #185 íntegro y #183. Único conflicto documental resuelto conservando ambas bitácoras. Sin rebase, force push, integración en main, despliegue ni producción. La exclusión de previews se conserva.
- **Módulos y seguridad:** 16 claves configurables individualmente por Super Admin, con dependencias validadas en transacción por tenant y auditoría anterior/nueva con actor y fecha. Menús, URL y guards backend respetan la desactivación; datos y cuentas se conservan. ADMIN y roles operativos no administran disponibilidad. Configuración y Usuarios de plataforma conservan recuperación administrativa aunque el negocio los apague. Autenticación, CSRF, JWT y sesiones no se cambian. No se altera ISV, crédito, descuentos ni cálculos de POS/Caja.
- **Correcciones de esta revisión:** la guía flotante interceptaba «Desactivar» en Sucursales, también en el piloto fallido de Actions del SHA anterior `b544c6cc`; ahora ocupa espacio en el flujo normal de contenido. Tres regresiones (1280/768/390) y recorrido real. Reportes deja de consultar Inventario apagado y conserva las ventas históricas. Garantías tenía API/pantalla operativas pero seguía oculta por la lista heredada de pendientes: se restaura su navegación autorizada y se corrige la descripción ES/EN. Permanecen **cuatro** funciones pendientes, sin presentarlas como implementadas: apartados, transferencias, pedidos especiales y listas de precio.
- **Guía:** ES/EN según rol, permisos y módulos; invitación, omitir, avanzar, retroceder, salir, finalizar y reiniciar. Desactivada por defecto en negocios, preferencia exclusiva de Super Admin, progreso por cuenta validada en JWT y separado por tenant/plataforma. Soporte no participa. Solo escribe progreso. Escritorio, tablet y móvil emulados; no acredita dispositivo físico.
- **NEXUS:** `20261022000000_guia_progreso` es aditiva, dos JSONB no nulos con `{}` inicial, sin cambiar operaciones ni FK. Nueva prueba de actualización desde todas las migraciones anteriores sobre cuentas/productos existentes: conserva sus instantáneas, defaults, progreso persistido y separación de cuentas; `migrate deploy` repetido es inocuo. Deriva PostgreSQL/Prisma y migraciones verificadas en bases efímeras PostgreSQL 17.11. Nunca producción. Reversión manual inactiva documentada; código anterior puede ignorar las columnas. Antes de liberar se mantiene el procedimiento de respaldo y migración previo al backend.
- **Evidencia local de esta revisión:** backend 581/581 y scripts 48/48; frontend 494/494; guía 24/24 (incluidos cinco roles en tablet/inglés), Reportes 5/5; Python 10/10; builds, TypeScript con configuración de build y lint sin errores (avisos existentes). Actualización de guía sobre base existente 1/1. PostgreSQL completo: **1043 aprobadas / 1 fallida de 1044**, timeout del recorrido de cobro con Chromium; repetición de su suite **19/19** sin cambiar aserciones. No se presenta la primera pasada como limpia. Recuperación HTTP: primera ejecución 2/6, repetición 6/6; copia exacta de main también 6/6. Matriz real NestJS/PostgreSQL de los 16 módulos y persistencia de guía: **2/2**, incluidas URL, navegación, API, dependencias, históricos y recuperación. En sus dos primeras ejecuciones fallaron aserciones nuevas del arnés (subtítulo oculto en móvil y rango obligatorio ausente en la petición de Reportes); corregidas sin relajar las comprobaciones de acceso. Resultados definitivos por SHA en el PR.
- **Límites del entorno:** Chromium local 151, frente al 153 esperado por Playwright. Descarga oficial bloqueada con 403. La sonda independiente de emulación offline falla igual en copia exacta de main; no se altera navigator ni se omiten aserciones. El recorrido E2E real local con la guía corregida obtuvo 143 aprobadas, 1 falla offline, 4 omitidas heredadas y 13 sin ejecutar por secuencia serial. La pasada inicial con guía flotante se interrumpió tras 10 aprobadas y 1 falla de superposición. No usar esos recorridos como aprobación integral. `tsc --noEmit` genérico incluye tests sin tipos Vitest; el contrato de compilación es `tsconfig.build.json` y sí pasa.
- **Coordinación:** #188 `67844c66` y #180 `b9edf6c0` siguen abiertos y separados. Simulación `merge-tree` con #188: contexto, NegocioDetallePage y POSPage (conflicto #185/#188). Revisar además merges automáticos de TenantContext, Configuración, Inventario y locales. Se conserva el POS de #185, sin editar POSPage. Con #180 conciliar esquema, catálogo/guard, rutas, locales y controles compartidos; Contabilidad será opcional/opt-in y CONTADOR tendrá guía y permisos explícitos propios. Contrato en [MODULOS_Y_GUIA_20261022.md](MODULOS_Y_GUIA_20261022.md).
- **Entrega y bitácora:** lectura de AGENTS/contexto/NEXUS, comprobación de PR/refs y ascendencia, merge normal, revisión de guards/dependencias, reproducción roja de superposición y Reportes, correcciones acotadas y regresiones PostgreSQL/HTTP/navegador. Las cifras definitivas, checks y dictamen **MERGE/NO MERGE se mantienen en [#189](https://github.com/Nelosama/FerreSystem/pull/189)** para vincularlos al SHA publicado, sin atribuir al commit nuevo los checks anteriores. No se modifica otra rama ni se ejecuta merge/despliegue. Firma de esquema y PostgreSQL: **NEXUS**.
- **Presupuesto de CI:** el primer `validate` de `7fd93344` agotó el límite global de 20 min: instalar dependencias de Chromium desde Azure Ubuntu consumió unos 11 min. Antes de la cancelación pasaron 260/260 de navegador, 16/16 móviles y 581/581 backend; PostgreSQL quedó interrumpido, sin aprobarse integralmente en ese intento. El piloto real del mismo SHA pasó 158 casos con 4 omisiones heredadas, incluidos respaldos, restauración, reinicio y actualización/reversión. Se amplía exclusivamente el presupuesto global de `validate` a **30 min**, sin retirar pruebas ni cambiar sus límites individuales. El SHA nuevo requiere sus propios checks completos. #188 avanzó a `99033569` (ya con #185); nueva simulación: solo contexto y NegocioDetallePage en conflicto, POSPage deja de tener conflicto.

## QA Jules #184 — matriz de resultados y acciones (2026-10-21)

**Fuente:** [informe Jules](https://github.com/Nelosama/FerreSystem/blob/jules-6650504171296380351-3c58c742/docs/QA_SEGURIDAD_MOVIL_20261020.md), auditó `main` SHA `c4cadc34`. El PR #184 contiene únicamente documentación, no parches. Guardar conclusiones en este contexto; no fusionar #184 solo por el informe. GitHub Actions de #184 exitosas, check Vercel fallido.

**Bien según el informe (alcance acotado, no certificación productiva):** 529 pruebas backend y 469 frontend; 10 suites de navegador Chromium; integración PostgreSQL temporal; aislamiento multi-tenant por `tenantId`, controles RBAC, revocación de sesión, idempotencia, validación binaria de logotipos, liberación de recursos de cámara y ausencia de transacciones desde `/admin-movil`. La auditoría no sustituye pruebas de intrusión ni pruebas físicas.

**Pendientes por prioridad:**
1. **P0 despliegue Vercel — por verificar/corregir:** check fallido; validar error real del log, longitud de `ignoreCommand`, `VITE_API_URL` en Preview/Production y respuesta JSON de `/api`. #183 contiene propuesta de arreglo del comando; no duplicar. Responsable: Claude (#183) y dueño (panel Vercel).
2. **P0 seguridad de Render — por verificar:** `NODE_ENV`, `JWT_SECRET` privado, `TRUST_PROXY`, `FRONTEND_URLS` y secretos de Super Admin. #183 introduce rotación de refresh y migración; respaldo y `migrate:deploy` antes de desplegar. Responsable: Claude y dueño.
3. **P1 aceptación física — pendiente:** iPhone Safari/PWA instalada, permisos y enfoque del escáner, lector físico, impresoras 58/80 mm. Responsable: QA en sitio; Codex para defectos reproducidos.
4. **P1 push — verificar requisitos:** el informe cuestiona notificaciones con PWA cerrada. No dar por obligatorio un wrapper nativo: evaluar Web Push en PWA instalada en iOS/Android y requisitos del negocio. Responsable: Claude/Codex tras decisión.
5. **P1 almacenamiento de imágenes — verificar:** persistencia privada en nube y autorización multi-tenant; no depender de disco local efímero. Responsable: Codex.

**Históricos marcados corregidos por Jules, sin reabrir sin reproducción:** importación de precios y CSV (#161), soporte remoto (#160), crédito y redondeo (#166), color de marca (#177). Los IDs H-01…H-06 de este informe **no son los mismos** que los H-01…H-06 de la auditoría de seguridad #183; no cruzarlos por número. Algunas afirmaciones del informe (por ejemplo la necesidad de wrapper nativo para push) requieren comprobación independiente.

**Proceso:** usar este registro para asignar correcciones a Claude/Codex, adjuntar evidencias por hallazgo y marcar verificado solo tras pruebas apropiadas. No hacer merge de ramas de auditoría ni desplegar automáticamente.

## PROTOCOLO OBLIGATORIO PARA AGENTES

Antes de comenzar cualquier trabajo en FerreSystem:

1. **Leer `docs/CONTEXTO_MAESTRO.md`** hasta `FIN DEL CONTEXTO VIGENTE`.
2. **Verificar el estado actual de GitHub**: `git fetch --all --prune` + `git log main --oneline -10` + ramas remotas.
3. **No duplicar funcionalidades** ya implementadas ni ramas ya abiertas.
4. **Trabajar en ramas independientes** desde `main` actualizado; nunca directamente sobre `main`.
5. **Actualizar este documento** cuando cambie el estado de una funcionalidad, PR o hallazgo.
6. **Registrar pruebas con sus limitaciones**: distinguir entre pruebas unitarias, integración con PostgreSQL real y validación en dispositivo físico.
7. **No hacer merge automático** ni desplegar a producción sin autorización explícita del dueño del proyecto.

Prompt corto para cualquier IA: **"Lee `docs/CONTEXTO_MAESTRO.md` hasta FIN DEL CONTEXTO VIGENTE. Comprueba Git/PR actuales, continúa el pendiente autorizado y actualiza ese mismo documento con evidencia al terminar. Consulta solo el anexo necesario. No hagas merge ni despliegue sin autorización."**

---

## SDK de OpenAI (ChatGPT) en el backend — 2026-10-28 UTC (rama `claude/zen-johnson-xwrqlv`, sin merge ni despliegue)

- **Base:** `53e2cc9` (merge de #209). Pedido del dueño: «instalar ChatGPT» → instalar el SDK de OpenAI en el backend.
- **Hecho:** dependencia `openai@^6.49.0` (`backend/package.json` y lock). `backend/src/ia/openai.service.ts` (`OpenAIService.responder(mensaje, instrucciones?)`, Responses API) y `ia.module.ts` registrado en `app.module.ts`. Clave solo en `OPENAI_API_KEY` del entorno; modelo opcional `OPENAI_MODEL` (por defecto `gpt-4o-mini`). Sin clave responde 503 sin llamar a la API; plazo 20 s, sin reintentos; los errores del proveedor no se reenvían ni registran. `main.ts` avisa al arrancar en producción si falta la clave. `.env.example` documentado.
- **Aún no hay ningún endpoint ni pantalla que use el servicio**: solo queda disponible para inyectar en otros módulos. Sin cambios de esquema, migraciones, autenticación ni frontend.
- **Pruebas:** `src/ia/openai.service.spec.ts` 5/5 (cliente simulado, sin llamadas reales); backend unitarias 736/736; build OK; lint sin errores nuevos.
- **Pendientes reales:** definir qué función de negocio usará ChatGPT (endpoint, permisos por rol/tenant, límites de costo); cargar `OPENAI_API_KEY` en Render si se usa; no se probó contra la API real.
## Reconciliación con main y PR #212 (portabilidad de pruebas) — 2026-10-28 UTC (rama `claude/reconciliacion-main-20261028`, PR [#212](https://github.com/Nelosama/FerreSystem/pull/212), sin merge ni despliegue)

- **Base:** `main` = `848758b` (merge de #210). La rama se incorporó con un merge normal de `main` (sin force push). El PR contiene solo cambios de pruebas: `frontend/test/barcode-scanner.test.mjs` (`fileURLToPath` en lugar de `URL.pathname`, que producía `C:\C:\...` en Windows) y `frontend/test/pos-offline-caracterizacion.test.mjs` (normaliza separadores). Sin cambios en aserciones ni en código de producto; `git diff origin/main -- frontend/src` vacío.
- **Fallos de CI del head anterior (`366209f`, sobre `53e2cc9`):** el check `validate` fallaba en dos pruebas e2e del navegador, ya resueltas por #210 y que no dependen de este PR: (1) `auth-security.spec.ts` buscaba «Seguridad de mi cuenta» en `/usuarios`; #210 la mueve a `/mi-cuenta`. (2) `contabilidad-simulado.spec.ts` (libro mayor) fallaba por `getByLabel('Cuenta')` ambiguo con el enlace del topbar; #210 quita el `aria-label` que colisionaba (`AdminTopbar.tsx`). Se reprodujeron en el head anterior y pasan tras el merge con `main`.
- **Pruebas locales (Linux, Node 22.22.0, tras `main` `848758b`):** `npm test` en `frontend` → 562 tests, 562 pass, 0 fail, 0 skip. `npm run build` (con `VITE_API_URL=https://api.example.test/api`) correcto. `npx oxlint src test e2e` sin errores (solo warnings preexistentes en `ArqueoCajaPage.tsx`). Playwright completo con Chromium preinstalado → 416 pass, 26 skip, 0 fail; los dos archivos de la regresión: 38/38.
- **Límites:** no se ejecutó en Windows/win32 (el informe previo declaraba 539 pass / 23 skip en win32; esa cifra no se ha vuelto a comprobar aquí). No se ejecutó PostgreSQL ni integración backend en esta sesión; `validate` del CI sí las cubre. Sin validación en dispositivo físico.
- **Pendientes:** (1) confirmar en CI del push los checks `test`, `validate` y `guard-base-datos` sobre el nuevo head. (2) El informe `docs/evidencias/reconciliacion-20261028.md` afirma que este documento quedó intacto; no es correcto desde el commit `366209f`. (3) La tarea 3 del plan nocturno (cobro del POS F2/F8/Enter, crédito y transferencia) no se ha iniciado. (4) Merge pendiente de autorización del dueño.

## UX ronda 1 (P0+P1) — PR #188 terminado, 2026-10-22 UTC (rama `claude/ux-ronda1-pos-marca`, sin merge ni despliegue)

- **Origen y alcance:** crítica Impeccable (`.impeccable/critique/2026-10-20T02-15-53Z__frontend-src.md`, 25/40), P0+P1, más dos defectos confirmados por el dueño (login y permisos). P2 y la auditoría integral del resto de módulos quedan para otra ronda. Sin cambios en cálculos monetarios, ISV, descuentos, crédito, caja, permisos efectivos, autenticación, backend ni migraciones (`git diff origin/main -- backend frontend/src/utils/posMoney.ts frontend/src/offline` vacío).
- **Integración con `main`:** merge (sin rebase ni force push) de `7914d1b` (#183). Único conflicto en este documento; ningún archivo de código lo modificaron ambas ramas, así que JWT, rotación de refresh, CSRF, cookies, CSP y aislamiento de #183 quedan intactos. El fallo de Vercel del PR (`ignoreCommand` > 256) lo resuelve el script que trajo #183.
- **Causa raíz común:** `--color-sidebar-bg` pasó a `#FFFFFF` con el diseño único (#177) y varias pantallas lo usaban como «tinta»: «Jowa» invisible en el login, método de pago seleccionado y filtro «TODAS» a 1.0–1.09:1, claves de permiso 1.09:1. Además, el color de marca se usaba sin protección de contraste (blanco sobre #EA580C = 3.56:1; sobre #F5C400 = 1.64:1).
- **Hecho:**
  - Colores de marca: `utils/colorMarca.ts` deriva `--color-on-primary` (texto sobre la marca) y `--color-primary-text` (marca como texto sobre blanco, fondo gris y el tinte de marca sobre ambos). Defecto corregido: un negocio sin `colorPrimario` rompía la pantalla de marca del Super Admin (`undefined.trim`). **Decisión visible a confirmar por el dueño:** con el naranja predeterminado #EA580C los botones principales llevan texto oscuro (el blanco no alcanza 4.5:1).
  - POS: métodos de pago con `aria-pressed`, icono y etiqueta traducida; cliente plegado («Cambiar cliente», crédito lo abre); pie del ticket fijo con total, método y «Procesar Venta»; barra «Ir a cobrar» en teléfono; F2 buscar, F8 enfoca cobrar (Enter confirma); desvincular cliente desde el resumen. Valores enviados al servidor sin cambios.
  - Login: «Jowa System» completo, sin «Honduras • SAR Compliance ISV 15% • Multi-Tenant» ni sustituto; marca `MarcaJowa` en lugar del cubo genérico; etiquetas asociadas, `autocomplete`, textos `shell.login.*` ES/EN; la sesión expirada es aviso informativo (`role=status`), los errores `role=alert`. Flujo de autenticación sin cambios.
  - Usuarios: «Personalización fina de permisos» como casillas reales con `<label>`, nombre legible y clave secundaria, contador, estados disponible/activo/bloqueado distinguibles también sin color. Con rol ADMIN se muestran incluidos y bloqueados porque `RolesGuard` no aplica la lista a ADMIN; la carga útil no cambia. Modal con `role=dialog`, foco inicial, Escape, pantalla completa y acciones fijas en móvil, por encima de la navegación inferior.
  - Navegación: TOPNAV con indicador de conexión, nombre accesible propio («Navegación principal»), desplegables con nombre traducido y modo compacto < 1200 px con `useMediaQuery` (cada enlace existe una sola vez). Inicio móvil: reglas heredadas de `.admin-home__pendientes` retiradas (causa del recorte), cabecera compacta, botón flotante legible. Navegación inferior a 12 px sin «…», nombre corto del catálogo y área segura del iPhone. Super Admin y aviso de soporte sin naranja fijo. Negocio sin logotipo: iniciales sobre su color en lugar del cubo.
- **Pruebas (local, Chromium 1194 del entorno):** frontend unitarias **489/489** (`main` 481/481); `tsc -b`, build y lint sin errores (117 avisos = `main`); Playwright simulado completo **246 pasan / 0 fallan / 15 omitidas** (las 15 son `ux-capturas`, solo con `UX_CAPTURAS`); `ux-ronda1-regresion.spec.ts` 21/21 (login a 1440/390/320, SAR ausente, sesión expirada, permisos AA y teclado, ADMIN bloqueado, modal a 390/320, contraste con 5 marcas, método seleccionado, F2/F8/Enter y cobro completo con payload, crédito exige cliente, barra móvil, TOPNAV 1440/1024, inicio móvil, «Más», Super Admin sin color); sesiones móvil emulado 16/16. Selectores actualizados por cambios intencionales: `pos-tarjeta` (ahora además comprueba `aria-pressed`), `arranque`, unitarias del POS y la guardia de marca; e2e-real `clientes-pos-cajero` y `qa-ciclo-venta`. **Piloto real** (`e2e-real/run.sh`: NestJS + PostgreSQL 16 temporal con `runuser nobody`): **150 pasan / 1 falla / 10 omitidas / 2 sin ejecutar**. La falla es `contingencia-real` «14. actualización del service worker» y es **preexistente**: falla igual en `main` `7914d1b` (archivo aislado: 12 pasan / 1 falla / 2 sin ejecutar, las dos siguientes dependen en serie); no la toca este PR. El piloto detectó una regresión del WIP ya corregida: TOPNAV había tomado el nombre accesible del menú lateral («Menú principal»); ahora usa `navigation.main_top` («Navegación principal»), como en `main`.
- **Evidencia:** [docs/evidencias/ux-ronda1-20261022](evidencias/ux-ronda1-20261022/README.md): 15 pantallas antes/después con contraste medido (de 3–22 textos bajo el mínimo por pantalla a 0) y 0 px de desborde horizontal.
- **Pendientes reales:** prueba preexistente del service worker (`contingencia-real` 14) roja también en `main`; decisión del dueño sobre el texto oscuro en el naranja predeterminado; P2 de la crítica (fuentes DM Sans/Manrope no cargadas en el inicio, estilos en línea, mayúsculas mixtas, gráfico semanal, copy); bordes con `--color-sidebar-text` en Configuración/Super Admin/Cotizaciones (legibles, pero el token es semántico de menú); el icono PWA (`public/logo.jpg`) es el logotipo J&J de un cliente y el favicon es el de Vite: decidir la marca del producto; Safari/iPhone, tableta física y revisión con usuarios reales no hechas.
- **Bitácora:** lectura de contexto y PR; merge de `main`; diagnóstico de las 23 unitarias rojas (arnés sin `colorMarca`, selectores del POS, guardia de marca) y corrección; capturas «antes» desde `main` con medición; correcciones; regresión nueva; suite completa; evidencia.
---

## Integración de #188 con main — 2026-10-22 UTC (rama `claude/ux-ronda1-pos-marca`, sin merge ni despliegue)

- **Git:** PR #188 en `67844c6`; `main` en `97609ed` (#185 integrado, base `7914d1b` de #183). Merge normal de `origin/main` en `46a66f8`, sin rebase ni force push. Código final y SHA del documento: ver encabezado.
- **Conflictos reales (2):** `frontend/src/pages/POSPage.tsx` (etiqueta del método de pago en el comprobante: se conserva `etiquetaMetodo` de #185, ambos lados daban la misma salida) y `docs/CONTEXTO_MAESTRO.md` (encabezado y bitácora: se conservan ambas secciones, #188 y #185).
- **Fusionados sin conflicto y revisados:** `InventarioPage.tsx` (carga gradual de #185 `FILAS_POR_PAGINA`/`limiteFilas` y `aria-pressed`/colores de #188 presentes), `es.json` y `en.json` (JSON válido, sin claves duplicadas), `e2e/pos-tarjeta-simulado.spec.ts`, `e2e-real/qa-ciclo-venta.spec.ts`.
- **Regresiones de la integración corregidas (en pruebas, no en reglas):**
  1. `pos-tarjeta-simulado.spec.ts` «transferencia»: buscaba el botón `TRANSFERENCIA`; #188 lo muestra como «Transferencia». Selector traducido.
  2. «venta a crédito»: el test de #185 elegía el cliente antes del método; con el cliente plegado de #188, el selector aparece al elegir «Crédito». Orden del test ajustado. La regla (crédito exige cliente) y el payload no cambian.
  Antes de la corrección, el escritorio daba 254 pasan / 2 fallan (solo esos dos).
- **Entorno (no código):** Playwright del backend espera Chromium `1243`; el contenedor solo trae `1194`. Se enlazó localmente en `/opt/pw-browsers` (fuera del repositorio). La integración PostgreSQL necesita usuario no root porque sus tests invocan `initdb`; se ejecutó como `nobody`. `frontend/node_modules` necesitó permisos de escritura para el Vite del navegador real. `navigation-settings.spec.ts` sobrescribe `frontend/artifacts/ux-settings-*.png` en cada ejecución: se restauraron y no forman parte del cambio.
- **Validación (local, PostgreSQL 16 temporal, Chromium 1194 del contenedor):**
  - Frontend: unitarias 492/492; `tsc -b` + build OK; lint 0 errores (117 avisos, igual que `main`).
  - Backend: Prisma validate/generate OK; build OK; lint 0 errores; unitarias 554/554 (57 archivos); scripts 48/48; Python OK; `verificar-migraciones.mjs` correcto (41 archivos, 0 nuevas).
  - Integración PostgreSQL real: 1041/1041 (63 archivos). E2E backend 6/6.
  - Navegador simulado, escritorio: 256 pasan / 0 fallan / 15 omitidas (`ux-capturas`, solo con `UX_CAPTURAS`). Móvil: 16/16.
  - E2E real (backend compilado + PostgreSQL temporal + frontend real): 153 pasan / 1 falla / 4 omitidas. La falla es `contingencia-real` «14. actualización del service worker». **Preexistente:** la misma suite completa sobre `origin/main` da 153 / 1 / 4 con la misma falla; aislada pasa en ambas ramas. No la introduce la integración; falla dependiente del orden.
  - Pruebas POS (unitarias, simulado y real): verdes, incluidas vuelto, ventas por cajero, comprobantes, protección contra duplicados y carga gradual.
- **GitHub Actions sobre `46a66f8`:** `Operación de ferretería` (39849161111) y `Piloto con API y PostgreSQL reales` (39849159663) en cola al redactar esta bitácora. Resultado: ver la revisión final del encabezado.
- **Atribución:** el commit de merge no incluye identificador de modelo (regla del entorno); se mantiene la línea `Claude-Session`.
- **Pendientes sin cambio:** falla del service worker en la suite completa (preexistente en `main`); decisión del dueño sobre texto oscuro en el naranja predeterminado; P2 de la crítica; icono PWA (logotipo de un cliente); Safari/iPhone y tableta física; variables de Render y respaldo antes de desplegar (Render ejecuta `prisma migrate deploy` al iniciar). Aceptación del cliente no realizada.

## Sincronización del PR #185 con main y validación final — 2026-10-22 UTC (sin merge ni despliegue)

- **Estado Git:** `main` `7914d1b` (incluye #183 y #178). Rama `claude/upbeat-einstein-ozjvpy` tenía 20 commits de atraso y 8 propios al iniciar (`c4cadc3` como base común). Integración por **merge normal** (`6310f31`), sin rebase ni force push. Sin ramas ni PR nuevos; #180, #182, #183 y #184 no modificados.
- **Conflicto resuelto:** único, en `docs/CONTEXTO_MAESTRO.md` (encabezado y bloque de bitácoras). Se conservaron las secciones de #183 y de #185. Código: sin conflictos.
- **Cambios de #183 integrados:** rotación de refresh, CSRF, CSP y cabeceras de Vercel, migración aditiva `20261021000000_sesiones_auth_rotacion_refresh`. Ningún cambio del PR sobre esas áreas. Migraciones: `verificar-migraciones.mjs` correcto (41 archivos, 0 nuevas respecto a `main`).
- **Validación (entorno local, PostgreSQL 16 temporal, Chromium del contenedor):**
  - Backend unitarias 554/554 (57 archivos); scripts 48/48; Python OK; build, `tsc` y lint sin errores (avisos preexistentes).
  - Frontend unitarias 484/484; build con `VITE_API_URL` de CI; lint sin errores.
  - Integración PostgreSQL completa 1041/1041 (63 archivos). Dos fallos del primer intento eran de entorno: binario Chromium `1243` no instalado. Se reproducen igual en `origin/main` (`c4cadc3`). Con un enlace local del binario `1194` que ya existe en el contenedor pasan 65/65. Ningún test cambiado.
  - E2E backend `test:e2e` 6/6. Navegador simulado 235/235. Móvil 16/16.
  - E2E real (backend compilado + PostgreSQL temporal + frontend real): 156 aprobadas, 4 omitidas (`test.skip` de funciones no implementadas: entrega parcial, canal web, datáfono, pendiente de decisión). Incluye `pos-cajeros-real` 3/3 (vuelto, comprobante, caja, reporte por cajero, respuesta tardía/perdida).
  - Guard de base de datos: correcto.
- **Entorno (no código):** `/opt/pw-browsers` no contiene la revisión que espera Playwright del backend; se usó un enlace simbólico local. `run.sh` escribe en `/tmp`, donde `chown` no está permitido; se ejecutó una copia en el scratchpad con `/var/tmp` (mismos pasos). Los binarios de PostgreSQL se ejecutan con `runuser` del propio script.
- **Atribución:** los commits nuevos no llevan identificador de modelo (regla del entorno). El merge `6310f31` lleva «Co-Authored-By: Claude Opus 5.5» por un recordatorio anterior; no se reescribió por ser una rama ya publicada.
- **Pendientes sin cambio:** Safari/iPhone/PWA, impresoras físicas, lector físico, variables de Render, respaldo antes de desplegar (la migración se aplica al iniciar en Render), Vercel real. Aceptación del cliente no realizada.

## Revisión de seis commits frente a main — 2026-10-21 UTC

- **Rama única:** `claude/upbeat-einstein-ozjvpy`; recibida en `dda7e27db1a508243a33ed2be32087865f51ddc9`, seis commits exclusivos desde `main` `c4cadc34a4b67de3052b076cfd646813e5afc6d8`. Sin otra rama, rebase, force push, merge ni despliegue manual. PR #180, #182, #183 y #184 comprobados y no modificados.
- **Conservado:** vuelto informativo y etiquetas de transferencia/crédito del comprobante, desglose por cajero y CSV, carga gradual del inventario y pruebas de idempotencia existente. No se duplican ventas, cobros ni motores monetarios. La optimización del inventario solo reduce el render inicial; sigue descargando todo el catálogo. Efectivo recibido no se guarda ni bloquea el cobro; devoluciones no se atribuyen por cajero.
- **Corregido:** desglose ausente del backend ya no anuncia «sin ventas»; encabezados de métodos de pago en tabla y CSV por cajero traducidos ES/EN. Dos regresiones rojas sobre el bundle recibido y verdes tras corregir. Restauradas a main dos capturas ajenas de Configuración.
- **Cobertura real nueva:** `frontend/e2e-real/pos-cajeros-real.spec.ts` (3/3): vuelto, comprobante, limpieza para siguiente venta, reporte y CSV con API real; PostgreSQL verifica venta, caja y salida física; reporte denegado al cajero; respuesta real retenida/perdida no duplica. Seis placeholders omitidos de las auditorías remiten al caso real activo.
- **Validación local:** frontend 472/472; backend 529/529; scripts 48/48; Python 10/10; HTTP real 6/6; builds/lint correctos (avisos existentes); 13 claves ES/EN con parámetros idénticos; guard correcto, 0 migraciones nuevas. **NEXUS:** PostgreSQL 17.10 temporal, migraciones reales, suite completa `REAL_SETTINGS_BROWSER=1`: **1022/1022, 62 archivos, sin omisiones**; esquema sin deriva. Sin base externa ni datos productivos.
- **Navegador local:** 227 aprobadas / 1 falla en la sonda independiente `offline-emulation.spec.ts` (sin aplicación/API); móvil 15/15. Piloto real: 142 aprobadas / 1 falla de recarga offline / 13 sin ejecutar por secuencia serial / 4 omitidas ajenas. Reproducción sobre copia exacta de main, sin crear rama: 1 aprobada / la misma falla offline. Chromium 151 bloquea la API pero cambia `navigator.onLine` a true al recargar con SW; Playwright requiere Chromium 153, cuya descarga local responde 403 por política de red. No se alteran emulador, navigator ni aserciones.
- **Estado de integración:** correcciones y pruebas locales completadas; el veredicto final y los checks del SHA publicado se mantienen en el [PR #185](https://github.com/Nelosama/FerreSystem/pull/185). Requiere `validate`, `guard-base-datos` y piloto `test` satisfactorios con el navegador previsto. Hardware, Safari/iPhone e impresoras físicos siguen sin acreditar; no se certifica producción.
- **Informe, clasificación de cada commit y evidencia:** [REVISION_UPBEAT_EINSTEIN_20261021.md](REVISION_UPBEAT_EINSTEIN_20261021.md).
- **Bitácora:** AGENTS/contexto/NEXUS; fetch y comprobación de main/rama/PR; comparación de seis commits; correcciones acotadas con regresiones; cliente Prisma precargado regenerado y backend recompilado; PostgreSQL preparado fuera del repositorio; suites completas; reproducción offline en main; publicación en la misma rama y PR hacia main, sin merge.

## Pendientes de QA cerrados: vuelto, ventas por cajero, latencia del POS e Inventario — 2026-10-21 UTC (rama `claude/upbeat-einstein-ozjvpy`, sin merge ni despliegue)

- **Base:** `main` `c4cadc3` (#178 integrado). PR abiertos al iniciar y no tocados: #180 (contabilidad), #182 (impeccable), #183 (seguridad JWT/cabeceras), #184 (informe QA). Sin cambios de esquema, migraciones, dependencias, autenticación ni reglas de cobro.
- **Vuelto en el POS en línea** (caso 1.2): campo «Efectivo recibido» con «Cambio» o «Falta» en centavos (`calcularVuelto` en `frontend/src/utils/posMoney.ts`, misma lectura `aCentavos` que contingencia). **Solo informativo:** no se envía al servidor, no se guarda ni bloquea el cobro (no se inventó una regla). El comprobante en pantalla muestra recibido/cambio cuando aplica.
- **Defectos corregidos en el comprobante en pantalla del POS:** TRANSFERENCIA se mostraba como «Crédito»; las ventas a crédito decían «TOTAL PAGADO» (ahora «TOTAL A CRÉDITO», como el PDF de H-04).
- **Ventas por cajero** (caso 13.3): `GET /operaciones/resumen` añade `cajeros` (usuario que registró × método, COMPLETADAS, mismo día local y `tenant_id` que `metodos`). Reportes muestra la tabla con totales por método en centavos y CSV (`utils/ventasPorCajero.ts`); si el servidor no envía la dimensión, la página sigue funcionando. Las devoluciones no se descuentan por cajero (no hay regla de atribución).
- **Respuesta tardía/perdida del POS** (caso 14.4): solo pruebas. Con `POST /ventas` retrasado, clics y Enter repetidos envían una venta y el carrito no cambia; con la respuesta perdida, la venta queda pendiente y se confirma por `solicitudId` sin segundo envío. Sin cambios de código: el comportamiento ya era correcto.
- **Inventario:** la tabla pinta 200 filas con «Mostrar más»; buscar o cambiar categoría filtra todo el catálogo y vuelve a la primera página (pendiente de #171).
- **Validación local:** backend unitarias 529/529, build y lint sin errores; frontend unitarias 472/472, `tsc -b`, lint sin errores (117 avisos = base) y build; navegador simulado completo **224/224** antes de la paginación, luego afectados 21/21 (inventario) y 6/6 ×3 repeticiones (POS); **integración PostgreSQL 16 temporal completa: 1021 pasan / 1 omitida preexistente, 62 archivos** (incluye por primera vez en local los 5 casos de `dashboard.postgres.integration.ts` y el nuevo de ventas por cajero en `reportes-zona-horaria.postgres.integration.ts`). NEXUS: sin cambios de esquema; solo consultas de lectura validadas contra base temporal.
- **Cómo ejecutar PostgreSQL en este contenedor (root):** `initdb` rechaza root. Envolver `initdb`/`pg_ctl` con `runuser -u nobody -- /usr/lib/postgresql/16/bin/<bin>` (haciendo `chown nobody` del directorio padre de `-D`), enlazar `psql`, y lanzar `PG_BIN=<dir-envoltorios> TMPDIR=/var/tmp/ferre-pg npm run test:integration` con `/var/tmp/ferre-pg` en modo 1777. El scratchpad de `/tmp/claude-0` no sirve: el entorno restablece sus permisos.
- **No ejecutado:** piloto `e2e-real` (los `test.skip` 1.2, 13.3 y 14.4 ahora citan la prueba que los cubre, pero no tienen caso con API real), Safari/iPhone, impresoras físicas.
- **Pendientes y decisiones del dueño:** si el vuelto debe guardarse en la venta o bloquear el cobro cuando falta efectivo (requiere esquema); si las devoluciones se atribuyen al cajero de la venta o al que devuelve; modal HTML heredado de cotizaciones sin acceso desde la interfaz; páginas sin ruta (`ApartadosPage`, `TransferenciasPage`, `PedidosEspecialesPage`, `ListasPrecioPage`).
- **Bitácora:** lectura de AGENTS/contexto y PR abiertos; selección de pendientes marcados `PENDIENTE` en el piloto; implementación con pruebas unitarias, integración real y navegador simulado; corrección de una aserción propia frágil (UUID); cuatro commits en la misma rama.

## Seguridad integral PR #183, continuación — 2026-10-21 UTC (misma rama, sin merge ni despliegue)

- **Base:** `main` `c4cadc3` incluido, sin conflictos. Sin cambios en #180, #182 ni #184 (solo se leyeron sus comentarios de Vercel y el informe de Jules). Estado vigente, tabla de hallazgos y pruebas: «Estado vigente» de [REVISION_SEGURIDAD_20261020.md](REVISION_SEGURIDAD_20261020.md).
- **Causa del fallo de Vercel (H-07, alta):** `vercel.json` no pasa la validación del esquema porque `ignoreCommand` supera 256 caracteres (266 en `main` desde #178; 306 en #183). Lo publica el bot de Vercel en #184 y afecta también a #182. Probablemente el despliegue de producción de `main` posterior a #178 también falla: **confirmar en el panel**. Corregido con `frontend/scripts/vercel-ignore.sh` y prueba del límite. **Regla para agentes:** no volver a alargar `ignoreCommand`; añadir ramas en el script.
- **H-04 corregido:** rotación de refresh con `jti`, bloqueo de fila, gracia `AUTH_REFRESH_GRACIA_SEGUNDOS` (120 s, tope 600), revocación de la sesión ante reutilización, sesiones antiguas sin `jti` aceptadas una vez. **NEXUS:** migración aditiva `20261021000000_sesiones_auth_rotacion_refresh` + reversión manual; `estado-base-solo-lectura.sql` actualizado. Render arranca con `npx prisma migrate deploy && node dist/main.js` (dato del dueño): la migración se aplica sola al desplegar el merge; hacer respaldo antes. Ensayo local de actualización desde `main` con una sesión abierta: correcto. El código anterior es compatible con las columnas nuevas.
- **H-05 corregido:** `OrigenPermitidoGuard` en login/refresh/logout (negocio y Super Admin), con los orígenes de CORS. **H-08 corregido:** sin correos en registros del login ni argumentos de Prisma en errores (`diagnosticoSeguro`). **H-09:** cabeceras de seguridad del API sin dependencias. **CSP del frontend** validada en Chromium con las cabeceras exactas de `vercel.json` (POS, PDF con WASM, escáner nativo y ZXing, cámara del navegador, service worker, offline, control negativo de XSS).
- **Aislamiento/roles:** `test/aislamiento-barrido.postgres.integration.ts` recorre todas las rutas de `AppModule` (empresa B y Super Admin contra datos reales de A, `@Roles`, `SuperAdminGuard`, inventario de rutas sin roles) sin hallazgos; la prueba de mutación lo valida. El rol Contador no existe en `main` (llega con #180).
- **Pendientes:** H-03 (token en `localStorage`; Baja con la CSP; migración a memoria requiere rediseño de sesiones, soporte y offline), H-06 (`/api/health/db` público, equivalente a `/api/health`). Externos: variables de Render (`NODE_ENV`, `JWT_SECRET`, `TRUST_PROXY`, `FRONTEND_URLS`), respaldo previo al merge, despliegue real de Vercel con cabeceras, iPhone/Safari/PWA e impresoras físicas.
- **Límite heredado de cookies (Codex, sobre `4456b8a`):** con frontend y API en sitios distintos y las cookies de terceros bloqueadas (Safari/iPhone por defecto), la cookie de refresh no se guarda y la sesión cae a los 15 min. No es una regresión de #183. Decisión del dueño: API en el mismo sitio o *rewrite* `/api` en Vercel. Validar en los dominios reales.
- **PostgreSQL en este contenedor (root):** `runuser -u nobody` en envoltorios de `initdb`/`pg_ctl` (`PG_BIN`) y `TMPDIR=/var/tmp/ferre-pg` (1777). `e2e-real/run.sh` ya lo hace solo.
- **Validación:** ver la tabla de pruebas del informe (unitarias, PostgreSQL completa, `test:e2e`, navegador simulado completo, móvil, piloto real y CSP). Checks de GitHub Actions por SHA en el PR.
- **Bitácora:** lectura del contexto/informe/#184; diagnóstico Vercel por comentarios del bot; correcciones con pruebas rojas→verdes; barrido con prueba de mutación; dos arneses de migraciones ajustados a la nueva migración; suites completas locales; informe y PR actualizados. Sin ramas ni PR nuevos, sin rebase/force push, sin merge ni despliegue. NEXUS firma la migración aditiva y la evidencia PostgreSQL temporal; producción intacta.

## Revisión de seguridad integral — 2026-10-20 UTC (rama `claude/revision-seguridad-jowa-20261020`, sin merge ni despliegue)

- **Base y estado Git:** rama existente del PR #183, HEAD recibido `541de7cf`; `origin/main` `c4cadc34` ya incluido (sin merge necesario ni conflictos). PR ajenos #180/#181 sin cambios. Sin acceso a producción, Render, Vercel ni Supabase.
- **Corregido (H-01, alta):** `getJwtSecret` exige una clave no vacía fuera de `development`/`test` y rechaza los dos valores públicos conocidos (constante local y placeholder anterior), incluso configurados explícitamente o rodeados de espacios. No recorta claves privadas válidas. `.env.example` deja el campo vacío e indica generación aleatoria. Seis regresiones adicionales fallaron sobre el HEAD recibido; casos en `jwt-secret.spec.ts`. Render debe confirmar la configuración antes de integrar.
- **Corregido (H-02, media):** `frontend/vercel.json` sin encabezados de seguridad. Añadidos `nosniff`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, `Permissions-Policy` (cámara solo `self` para el escáner) y HSTS. Prueba `frontend/test/vercel-security-headers.test.mjs`. **Sin CSP**: requiere validación en navegador de la app completa.
- **Pendientes priorizados:** H-03 tokens en `localStorage`, incluido original Super Admin durante soporte (P2; P1 ante XSS); H-04 refresh sin rotación/reutilización (P2; P1 ante robo); H-05 CSRF de logout (P3); H-06 estado de BD público (P3). Riesgos, mitigaciones y criterios de cierre en el informe. Sin cambio de flujo de sesión ni de reglas de negocio.
- **Verificado sin hallazgo:** revalidación de usuario, empresa y sesión en cada petición; refresh no válido como Bearer; tenant solo desde el token; escrituras por `id` precedidas de lectura con `tenantId`; SQL parametrizado; todo handler de negocio con `@Roles`/permiso/`SuperAdminGuard`; el rol `SUPERADMIN` no existe en el enum `Rol`; CORS con lista exacta; cookies `httpOnly`/`Secure`; `ValidationPipe` con `whitelist`; sin secretos ni `.env` versionados; `npm audit` sin vulnerabilidades en backend y frontend.
- **Diagnóstico sin secretos:** login restringe códigos de errores a Prisma `Pdddd` y elimina stack/mensaje crudos de Prisma/bcrypt. Conexión Prisma y health registran solo texto fijo, conservando el comportamiento ante caída de BD. Regresiones con credenciales sintéticas en `auth.service.spec.ts` e `infrastructure-errors.spec.ts`. No se certifican logs productivos; quedan diagnósticos crudos en otros módulos para revisión posterior, sin modificar POS/inventario/caja.
- **Validación de continuación:** instalación limpia frontend, build HTTPS correcto y cabeceras/guard **29/29** locales. Se reejecutan unitarias, build/lint, PostgreSQL temporal 17.11 sin root, autenticación/tenants y navegador; consultar resultados definitivos y checks del HEAD publicado en [PR #183](https://github.com/Nelosama/FerreSystem/pull/183). Los 530/475/47 casos de la revisión inicial son históricos y no aprueban el nuevo commit. Prisma requirió recuperación de motores oficiales por HTTPS tras un `ECONNRESET`, sin desactivar TLS ni cambiar dependencias.
- **Bloqueos externos / NO MERGE:** Render sin acceso: presencia/caracter privado de `JWT_SECRET`, `NODE_ENV=production` y `TRUST_PROXY` pendientes. Vercel inicial fallido (`dpl_8Yx5j2LHrVnmiQWU9Xa7ht7uENWm`), sin logs accesibles para determinar causa. Ambos paneles rechazados por política de red (CONNECT 403). La rama se excluye de previews para respetar la prohibición de despliegue automático; esto no corrige ni aprueba aquel fallo. Cabeceras reales y dispositivo iPhone/PWA física no verificados.
- **Bitácora:** diff completo, comentarios, workflows y ascendencia revisados; regresión roja de secreto público explícito y espacios; correcciones mínimas de claves/salidas de diagnóstico; pruebas locales y comprobación de Actions por SHA en el mismo PR. Sin ramas/PR adicionales, rebase, force push, migraciones ni operaciones productivas. NEXUS firma la evidencia PostgreSQL temporal, nunca producción.

## Contabilidad y Control Tributario (Honduras, fase 1) — 2026-10-20 UTC (rama `feat/contabilidad-honduras`, sin merge ni despliegue)

### Integración PR #180 con `main` — 2026-10-22 UTC (misma rama, sin merge ni despliegue)

- **Base:** `main` `7914d1b` (incluye PR #183). Merge normal, sin rebase ni force push. Conflictos y resolución: `backend/scripts/estado-base-solo-lectura.sql` (se conservan las dos migraciones de Contabilidad y la de sesiones de #183, en orden); `frontend/vercel.json` (ignoreCommand sustituido por `sh scripts/vercel-ignore.sh`, ruta `feat/contabilidad-honduras` añadida al script para respetar el límite de 256 caracteres); `docs/CONTEXTO_MAESTRO.md` (ambos registros conservados).
- **Pruebas tras el merge (HEAD de la integración):** backend build, lint sin errores, unitarias 585/585, scripts 48/48; frontend `tsc`/build, lint sin errores, unitarias 494/494; navegador simulado 232/232 y móvil 16/16; PostgreSQL 16 temporal (`npm run test:integration`) 64 archivos, 1062/1062 con Chromium; `test:e2e` 6/6. Lo añadido: `test/contabilidad.postgres.integration.ts` ahora comprueba que CONTADOR recibe 403 en cierre de caja y en entregas, con `EntregasController` registrado.
- **Migraciones:** en una base PostgreSQL 16 temporal desde el esquema de `main` con datos previos, `prisma migrate deploy` aplicó `20261020000000_rol_contador`, `20261020000100_contabilidad_honduras` y `20261021000000_sesiones_auth_rotacion_refresh` sin errores; `migrate status` al día y `migrate diff` vacío. `scripts/estado-base-solo-lectura.sql` sin incompletas ni revertidas. NEXUS firma la evidencia; producción no tocada.
- **Mutación:** CONTADOR en «abrir caja» hace fallar la auditoría de rutas. CONTADOR en «cerrar caja» sin tocar el servicio: la integración no lo detecta porque `OperacionesService` también rechaza el rol (defensa en profundidad); solo lo detecta la auditoría estática.
- **Excel:** verificado con openpyxl: fechas `dd/mm/yyyy` reales, importes numéricos con formato «L.», RTN/CAI/correlativos como texto, totales como `SUM`/`SUMPRODUCT`, encabezado congelado y filtros.
- **Normativa:** `sar.gob.hn` y portales asociados devuelven 403/ENOTFOUND desde el entorno; no se pudo contrastar con fuente oficial. Sin cambios de tasas ni reglas.
- **Bloqueos y pendientes:** PR #180 sigue en borrador (GitHub: `mergeable_state` dirty antes del merge). Pendiente: verificación normativa por contador; piloto `e2e-real` del PR, Safari/WebKit y dispositivo físico no ejecutados en esta sesión; aceptación del dueño. No se desplegó ni se tocó Supabase/Render/Vercel.

- **Base:** `main` `aae1546` (PR #179 integrado). Rama única pedida por el dueño; detalle completo, normativa, API y pendientes en [CONTABILIDAD_HONDURAS.md](CONTABILIDAD_HONDURAS.md).
- **Rol CONTADOR** (migración `20261020000000_rol_contador`, `ALTER TYPE "Rol" ADD VALUE`): asignable por ADMIN en Usuarios y por Super Admin en el detalle del negocio; permisos por defecto `contabilidad.ver/registrar/configurar/cerrar_periodo`, sin descuento. Su inicio redirige a `/contabilidad` (`ProtectedRoute`). Ninguna ruta de escritura fuera de Contabilidad incluye su rol: lo verifica `backend/src/contabilidad/autorizacion-rutas.spec.ts` sobre todos los controladores y la integración PostgreSQL (rutas y servicios de ventas, caja, cobros, inventario, compras, productos y clientes). Puede leer `GET /productos` (ruta sin `@Roles` preexistente) **sin costos** (regla `canReadProductFinancials`).
- **Módulo `contabilidad` opcional:** `OPT_IN_TENANT_MODULES` en `backend/src/common/tenant-modules.ts`; sin registro habilitado queda apagado (a diferencia de los módulos heredados), así que ninguna empresa existente lo ve hasta que el Super Admin lo active. Mismo criterio en `TenantModuleGuard`, `enabledTenantModules`, `pendientes.ts` y en el frontend (`OPT_IN_MODULES`, `modulosPorDefecto`).
- **Backend** `backend/src/contabilidad/`: `fiscal-hn.ts` (reglas puras: RTN, numeración `NNN-NNN-NN-NNNNNNNN`, CAI, tasas por vigencia, ISV y retenciones en centavos, conciliación), `libros.ts` (libros de ventas/compras desde `ventas`, `devoluciones`, `ordenes_compra` + documentos; resumen de ISV de trabajo; conciliación con 26 hallazgos; huella SHA-256), `contabilidad.service.ts` (configuración, tasas, reglas, CAI, documentos, correcciones, anulaciones, retenciones, períodos, partida doble, exportación), `exportacion.ts` (CSV con BOM y fórmulas neutralizadas, XLSX y PDF sin dependencias nuevas).
- **NEXUS — esquema** (`20261020000100_contabilidad_honduras`, aditiva): 11 tablas `fiscal_*`/`contable_*` con `tenant_id`, FK compuestas entre tablas fiscales, FK simples a `usuarios`/`ventas` + disparador `fiscal_misma_empresa`, índice `ordenes_compra (tenant_id,id)`, CHECK de formatos y totales, índices parciales (una factura vigente por venta/compra), disparadores de no solape de vigencias, cuadre diferido de asientos, inmutabilidad de ajustes/líneas, retenciones y asientos solo anulables/revertibles, documentos sin borrado, RLS sin políticas. `migrate diff` vacío. **Conflicto detectado y corregido:** las FK compuestas a `usuarios`/`ventas` impedían ejecutar la reversión de emergencia de #148 (`prisma/propuestas/entregas-148/03_rollback_con_respaldo.sql`, prueba `centinela-migracion-148`); se reemplazaron sin tocar ese script. `scripts/estado-base-solo-lectura.sql` incluye las dos migraciones con checksums.
- **Normativa:** `sar.gob.hn`, `tsc.gob.hn` y `rsm.global` no accesibles desde el entorno (proxy 403/DNS). Se usaron fuentes secundarias (Acuerdo 481-2017 y reformas 609-2017/725-2018/817-2018; Decreto 278-2013 art. 16; guías del SAR citadas). **No se precargan tasas, reglas, formularios ni plazos**: cada empresa registra tasas y reglas con base legal y vigencia; el resumen de ISV se marca como cálculo de trabajo. Requiere verificación de un contador antes de usarlo con clientes reales.
- **Frontend:** `pages/ContabilidadPage.tsx` (resumen, libros, documentos, retenciones, configuración fiscal, períodos, partida doble, bitácora; exportar CSV/Excel/PDF), `utils/contabilidad.ts`, menú `contabilidad` (ADMIN/CONTADOR, módulo, permiso), catálogo de módulos, rol y permisos en Usuarios y en el detalle del negocio, textos ES/EN (`accounting.*`). Defectos encontrados por la prueba de navegador y corregidos antes de publicar: `/` mostraba «Acceso denegado» al CONTADOR; un error al guardar ocultaba el formulario y se perdía lo escrito. `frontend/vercel.json` excluye la rama de previews.
- **Validación local:** backend unitarias **540/540** (19 nuevas), build, lint sin errores; scripts **48/48**; **PostgreSQL 16 real** (clúster temporal ejecutado como usuario `postgres` con `runuser`, que resuelve el bloqueo de `initdb` como root de sesiones anteriores): contabilidad **14/14**; suite completa **63 archivos, 1031 pasan, 1 omitida** (navegador opt-in preexistente) y `test:e2e` 6/6. La primera pasada completa dio 1 fallo propio (conflicto con la reversión #148, corregido). Mutaciones de control (módulo encendido por defecto, CONTADOR en «abrir caja») hacen fallar las pruebas esperadas. Frontend unitarias **459/459**, `tsc -b`, build, lint 0 errores (118 avisos; +1 del mismo patrón `set-state-in-effect` de otras páginas); navegador simulado **216/216** con Chromium 1194 del entorno (5 nuevas en `e2e/contabilidad-simulado.spec.ts`, incluida 390 px). XLSX verificado con openpyxl y PDF con pdftotext.
- **No ejecutado:** piloto `e2e-real`, Safari/WebKit, dispositivo físico, Supabase/producción. Sin aceptación del cliente ni del contador.
- **Riesgos:** (1) desplegar el código sin migrar detiene el arranque (`migration-safe.mjs`), por diseño; (2) `ADD VALUE` de enum no se revierte con la migración; (3) normativa verificada solo con fuentes secundarias; (4) el POS sigue sin emitir numeración fiscal (D1): los documentos emitidos se registran y concilian, no se generan; (5) ventas del POS siempre gravadas 15 % (sin exentos/18 %).
- **Pendientes reales (fase 2+):** verificación normativa; emisión con CAI desde el POS; asientos automáticos desde operación; estados financieros y cierre anual; formatos/calendario de declaraciones del SAR; facturación electrónica; exentos/exonerados/18 % en el POS; constancias de exoneración; comprobante de retención emitido con CAI propio; moneda extranjera; valuación de inventario para contabilidad; sucursal en documentos.
- **Bitácora:** lectura de AGENTS/contexto/NEXUS; revisión de esquema, guards, permisos y rutas; consulta normativa (SAR inaccesible, fuentes secundarias); diseño sin duplicar operación; migración + modelos con `migrate diff` vacío; servicio, controlador y pantalla; pruebas unitarias, de rutas, PostgreSQL real y navegador; mutaciones de control; corrección del conflicto con la reversión #148 y de dos defectos de interfaz; documentación; PR único hacia `main`. **NEXUS** firma la revisión de esquema.

---
## Auditoría final acotada PR #178 — 2026-10-19, America/Tegucigalpa

- Mismo PR/rama; `main` sigue en `aae1546d` e incluido, sin conflictos nuevos ni Contabilidad. Se conservan el inicio administrativo, navegación y configuración de Claude.
- Corrección: `ReciboPDF` prioriza el formato del negocio frente a un parámetro alternativo. Seis regresiones de PDF real (VENTA/COTIZACION × A4/80/58) fallaron antes y pasan después. Se mantienen las seis pruebas originales de documento/ancho. Sin cálculos monetarios ni cambios fiscales.
- Corrección: contingencia elimina la lectura/escritura de `pos-contingencia-papel` y la selección operativa del papel. El formato viene del negocio, con A4 predeterminado. Se conserva el control visible como solo lectura. Las regresiones existentes cubren una preferencia local incompatible, los tres formatos, reimpresión y aviso de fallo que sobrevive a la sincronización.
- Cotizaciones: el modal HTML heredado no es accesible desde la interfaz (`setModalPdf` solo se usa para cerrar). La acción vigente descarga `ReciboPDF` con el tenant; no se activa ni modifica ese modal.
- Revisados: timeout de perfil de 10 s, distinción 401/503 y errores de red, identidad antes de aplicar respuestas, guards de tenant/sesiones, tracks y permisos/reintentos de cámara, diario/sincronización/idempotencia. Sin otro defecto demostrado que requiera ampliar el alcance. Caída de Render/Supabase productivos no provocada ni certificada: se prueba el contrato de indisponibilidad y PostgreSQL temporal real.
- Validación: seis regresiones rojas y doce PDF verdes; suites relevantes locales y Actions completas del HEAD definitivo, con resultados/enlaces finales en [PR #178](https://github.com/Nelosama/FerreSystem/pull/178). No reutilizar checks de HEAD anteriores como aprobación del nuevo commit.
- Límites conservados: Safari/iPhone/PWA físicos, cámaras e impresoras reales sin validar; no bloquear el merge por hardware no disponible ni confundir simulación con aceptación física. Sin merge, despliegue, migraciones ni dependencias nuevas. NEXUS firma la evidencia PostgreSQL.

## Cierre técnico PR #178 — 2026-10-19, America/Tegucigalpa

- Rama exclusiva `codex/estabilidad-operativa`; `main` actualizado a `aae1546d` (#179). Único conflicto documental en este contexto, resuelto conservando íntegros ambos registros. Sin cambios en otras ramas/PR ni en el trabajo de Claude.
- Regresión heredada adaptada a la regla solicitada: el comprobante sin formato explícito espera A4 (normalización existente); la persistencia de 58 mm se prueba con configuración del negocio y selector bloqueado, sin permitir que una preferencia local sustituya A4.
- Contingencia: A4, 80 mm y 58 mm configurados por Super Admin prevalecen sobre la preferencia local; página CSS y ancho del comprobante usan el mismo formato. Regresión de navegador con una preferencia local incompatible para cada formato. El selector es de solo lectura; sin configuración se usa A4 y no se lee ni escribe la preferencia local.
- Sesiones: errores temporales de Prisma devuelven 503 sin autorizar ni revocar; sesiones revocadas siguen devolviendo 401. `backend/test/app.e2e-spec.ts` verifica caída/reinicio de PostgreSQL real, recuperación con el mismo token y revocación posterior. `session-lifecycle.spec.ts` verifica conservación de credenciales ante 502/503/504.
- Cámara: limpieza antes de adquirir otro dispositivo, descarte de streams tardíos y entrada manual conservada; pruebas unitarias de ciclo y prueba de navegador en `levantamiento.spec.ts`. APIs de cámara simuladas: no acreditan hardware.
- Validación de esta continuación: frontend `npm test`, build con `VITE_API_URL=/api`, lint y Playwright; backend unitarias, build, lint, scripts, integración PostgreSQL temporal 17.11 y recuperación HTTP. Guard de migraciones correcto: cero migraciones nuevas. Resultados definitivos y checks vinculados al SHA final se registran en [PR #178](https://github.com/Nelosama/FerreSystem/pull/178); no usar checks de SHA anteriores para aprobarlo.
- Límites: sin iPhone físico, Safari/PWA iOS instalada ni impresoras físicas A4/80/58. PDFs y Chromium no validan enfoque, permisos reales, liberación del hardware iOS, márgenes del driver, avance/corte ni legibilidad del papel. Pendiente ejecutar el protocolo físico de `ESCANER_IPHONE_20261018.md` y comprobantes en los tres equipos/papeles del cliente. Sin validación productiva ni certificación de aislamiento transaccional entre sucursales.
- Bitácora: inspección de PR/refs y árbol limpio, actualización de la misma rama, corrección acotada de A4 y regresión de formatos, ejecución de suites y consulta de Actions sobre HEAD definitivo. Sin dependencias, migraciones, merge ni despliegue. Retirar Draft solo con comprobaciones satisfactorias; el merge queda reservado a autorización del propietario. NEXUS firma la evidencia de PostgreSQL.

## Inicio del administrador con pendientes reales — 2026-10-18 UTC (rama `claude/admin-pendientes-ux`, sin merge ni despliegue)

- **Base:** `main` `8bab63d` (PR #177 integrado). Rama única desde ese `main`; sin cambios de esquema, migraciones, dependencias, núcleo monetario del POS, escáner ni sincronización offline.
- **Endpoint nuevo `GET /dashboard/pendientes`** (`backend/src/dashboard/pendientes.ts`, `dashboard.service.ts#getPendientes`, `dashboard.controller.ts`). Roles ADMIN, BODEGUERO, VENDEDOR y CAJERO; cada indicador replica la autorización de la pantalla a la que conduce (rol, módulo con el criterio de `TenantModuleGuard`, permiso con el de `RolesGuard`). Lo no autorizado no se consulta ni se devuelve. Cinco `COUNT` en PostgreSQL filtrados por `tenant_id`, en paralelo:
  - `contingencia_revision` → `/contingencia-admin` (ADMIN, módulo `pos`): `requiere_revision = true`, igual que el filtro «Requieren revisión».
  - `precios_pendientes` → `/precios` (ADMIN, módulo `inventario`): productos activos con `precio_aprobado = false`, igual que la pestaña «Pendientes».
  - `entregas_pendientes` → `/entregas` (ADMIN y BODEGUERO todas; CAJERO solo las suyas, `alcance: PROPIAS`): misma condición que `GET /entregas/pendientes` (venta COMPLETADA, `reserva_pendiente`, línea BODEGA con `cantidad − entregada − cancelada > 0`), en un solo COUNT en lugar del recorrido por venta.
  - `cotizaciones_vencen_hoy` → `/cotizaciones` (ADMIN, CAJERO, VENDEDOR; módulo `cotizaciones`): BORRADOR/ENVIADA/APROBADA con `fecha_validez` = día de Tegucigalpa.
  - `stock_bajo_minimo` → `/inventario` (ADMIN, BODEGUERO; módulo `inventario`): activos con `stock_actual − stock_reservado ≤ stock_minimo`.
- **Sucursal:** no se puede filtrar. Ventas, productos, cotizaciones y operaciones no tienen sucursal en el esquema; `sucursales` es un catálogo administrativo que no reasigna operaciones. El alcance es el negocio (o las ventas propias). Filtrar por sucursal exige primero una regla y un cambio de esquema que decida el dueño.
- **Inicio del administrador** (`pages/admin/AdminHomePage.tsx`, `utils/pendientesInicio.ts`): «Pendientes de hoy» primero, con filas enlazadas a cada pantalla y cifra del servidor; lo que está en cero se resume en «Al día: …». Estados distintos: consultando (sin cifras), error (aviso, sin ceros), respuesta malformada = error, «Todo al día» solo con confirmación del servidor, y rol sin indicadores. Cuatro acciones principales como máximo (Nueva venta, Nueva cotización y los accesos de `TaskShortcuts` sin repetirlas; `TaskShortcuts` acepta `exclude`/`limit`). Se retiró la tarjeta duplicada de cotizaciones (su enlace pasa a la métrica); el botón flotante solo aparece si el rol puede vender. Textos del inicio traducidos ES/EN (`shell.home.*`). Métricas en 3 columnas (2 en tableta, 1 en móvil estrecho).
- **Ventas sin conexión en revisión:** se reutiliza `/contingencia-admin` (ya existía y aplica la autorización del servidor en cada acción); ahora aparece en SIDEBAR y TOPNAV (`contingencia_admin`, ADMIN + módulo `pos`, desplegable del POS en TOPNAV). **Defecto corregido:** «Marcar como revisada» exigía `estado === 'SINCRONIZADA'`, estado que solo existe en el diario local del equipo; el servidor devuelve `APLICADA`, de modo que una venta aplicada con observación nunca podía marcarse revisada desde la interfaz. Ahora usa `APLICADA && requiereRevision` (regla existente de `resolver`). La lista distingue carga, error y «sin operaciones». **Reglas no inventadas (decisión del dueño):** no hay botón para operaciones `RECIBIDA` ni para la acción `REINTENTAR` que el servidor admite; no se añadió hasta que se defina cuándo debe usarse.
- **Configuración del negocio (solo Super Admin, sin cambios de datos):** cuatro secciones numeradas — 1. Mi negocio (nombre, rubro, contacto, idioma, logotipo y color), 2. Venta e impresión (formato y moneda/ISV de solo lectura), 3. Equipo y permisos (enlaces a las pestañas Usuarios y Servicios; no concede facultades), 4. Navegación (SIDEBAR/TOPNAV). Mismos campos, ids y carga útil de guardado. `LogotipoNegocioEditor` admite `nivelTitulo`.
- **Validación local:** backend unitarias **521/521** (incluye `pendientes.spec.ts`, 12), build y lint sin errores; frontend unitarias **448/448** (incluye `pendientes-inicio.test.mjs`), `tsc -b`, lint sin errores ni avisos nuevos (117 = base) y build; navegador simulado **211/211** con Chromium 1194 del entorno (incluye `e2e/admin-pendientes-simulado.spec.ts`, 16: cifras y rutas, cuatro acciones, carga/error/malformada/al día, EN, tableta 820 px y móvil 390 px sin desbordamiento, acceso desde SIDEBAR y TOPNAV, sin módulo POS y CAJERO sin acceso, «Marcar como revisada», Configuración con claves visuales antiguas y ADMIN sin acceso). Seis simuladores estrictos existentes ahora responden `/dashboard/pendientes` (antes lo marcaban como petición inesperada).
- **No ejecutado aquí:** integración PostgreSQL (`backend/test/dashboard.postgres.integration.ts`, 5 casos nuevos: cifras por regla, igualdad con `GET /entregas/pendientes`, aislamiento por tenant, roles y módulo deshabilitado). Bloqueo: el contenedor corre como root e `initdb` lo rechaza; crear un usuario sin privilegios fue denegado. Se valida en el workflow `operacion-ferreteria.yml` (`npm run test:integration`). Sin piloto `e2e-real`, tablet ni dispositivo físico, Safari no probado.
- **Bitácora:** lectura de AGENTS/contexto; rama desde `main` `8bab63d`; diseño del endpoint replicando las reglas de cada pantalla; unitarias rojas/verdes; inicio y configuración reorganizados; detección y corrección del estado `SINCRONIZADA`; E2E nuevas y regresión completa; PR único hacia `main`.

## Diseño único de Jowa System — consolidación PR #177 (2026-10-18, rama `claude/gifted-dirac-fqc2u5`, sin merge ni despliegue)

- **Decisión:** un solo diseño visual oficial (base V3: superficies claras, bordes suaves, tipografía fija Archivo/Inter). Solo color de marca por negocio. Única elección de distribución: SIDEBAR o TOPNAV.
- **Eliminado:** plantillas V1/V2/V3 y su selector; modos oscuro/híbrido; estilos INDUSTRIAL/MINIMALISTA/MODERNO; selectores de tipografía; `data-template`; `v2-theme.css` y `v3-theme.css`; clases `v2-*` renombradas a `app-*`; claves de traducción huérfanas (plantilla, estilo, tipografía).
- **Conservado:** logo, color de marca, idioma, formato de impresión, módulos habilitados, permisos y modo de navegación (`modoNavegacion` en columna propia; no se tocó el esquema de PostgreSQL).
- **Compatibilidad:** `configuracion` guardada con claves visuales antiguas no falla al leer ni al escribir: las claves retiradas (`CLAVES_VISUALES_RETIRADAS`) se descartan en `tenant-configuration.ts` y no se vuelven a guardar. Sin migración de datos ni cambios de esquema.
- **Caja (PR #177):** `CajaProvider` en `AppLayout`, una sola consulta a `/operaciones/caja` por pantalla compartida por la barra superior y el POS. Estado inicial «sin verificar»; «abierta» o «cerrada» solo tras respuesta válida; la lectura se descarta si cambia usuario, negocio o sucursal.
- **i18n:** textos nuevos en `shell.*` y `topbar.caja_*` (ES/EN).
- **Super Admin:** pestañas del negocio solo en TOPNAV (en SIDEBAR el menú de plataforma las muestra); pestañas superiores del panel solo en TOPNAV.
- **Validación local:** backend 509/509 pruebas unitarias; frontend 380/380 unitarias; lint sin errores; build de frontend y `tsc` de backend sin errores; navegador 186/186 (incluye `diseno-unico.spec.ts`: configuración antigua, mismos módulos en ambos modos, caja, EN y secciones del Super Admin).
- **Límites:** pruebas de integración con PostgreSQL y de persistencia en servidor no ejecutadas en este entorno; sin prueba en tablet ni dispositivo físico; Safari no probado.

## Escáner de cámara iPhone — 2026-10-18 UTC

- **Base y rama única:** `main` `174cce19`; rama `codex/fix-camera-lifecycle-ios`. Árbol limpio al inicio; solo `main` remoto y ningún PR abierto. PR #76 ya integrado, revisado junto al historial posterior de inventario. Sin cambios en ramas ajenas.
- **Demostrado:** siete fallos en nueve pruebas nuevas de ciclo sobre el código anterior (doble limpieza, solicitudes duplicadas mientras el permiso no responde, esperas ilimitadas e interrupciones sin salida). UPC-E omitido y lector experimental de ZXing 0.23.0 defectuoso incluso habilitado. Plegar la sección de cámara ocultaba sin detener el vídeo.
- **Implementado:** limpieza idempotente/cancelable y propiedad de stream tardío; espera limitada en permiso/vídeo/carga/detección; vigilancia de pistas/fotogramas; cierre al plegar, navegar o pasar a segundo plano y reapertura explícita. Enfoque opcional por capacidad, canvas acotado y lectores reutilizados; marco, confirmación y acceso al campo manual existente.
- **Biblioteca:** ZXing conservado; adaptador acotado a UPC-E reutiliza sus primitivas, valida checksum expandido y devuelve el código compacto. Sin dependencias nuevas, cambios de inventario, esquema, autenticación ni lógica de ventas/cobros/caja. El componente compartido existente sigue siendo usado por POS; se amplía la regresión del frontend sin cambiar esa página.
- **Evidencia:** frontend 443/443; escáner focalizado 90/90 (20 ciclo, 46 lector real y 24 previas); backend inventario 81/81. TypeScript/build correctos y lint con 0 errores (116 avisos previos). Protocolo, comandos y logs en [ESCANER_IPHONE_20261018.md](ESCANER_IPHONE_20261018.md). Cierre de navegador y checks por SHA en [#176](https://github.com/Nelosama/FerreSystem/pull/176); se conserva una pasada amplia interrumpida bajo carga (102 pasan, 3 fallan, 2 interrumpidas, 78 sin ejecutar) sin declararla aprobada. WebKit no descargable (proxy 403); **sin iPhone físico ni PWA iOS instalada**, por lo que LEV-015 sigue pendiente.
- **Publicación:** [PR único #176](https://github.com/Nelosama/FerreSystem/pull/176); rama excluida de previews Vercel antes del push. Sin merge ni despliegue.
- **Bitácora:** lectura de AGENTS/contexto y estado Git/PR; reproducción roja; corrección conservando biblioteca y reglas; pruebas de lector real en memoria, APIs simuladas, canvas de navegador y regresión de inventario; informe con protocolo de aceptación física. PR único publicado en borrador; resultado final del navegador y checks por SHA se informan allí. Se añadió y verificó la recuperación con petición nueva tras agotar permiso y la comprobación UPC-E central, manteniendo búsqueda completa.

### Cierre de aceptación #176 — 2026-10-17, America/Tegucigalpa

- Revisión de permisos, límites, limpieza, selección trasera, enfoque por capacidad, fallback ZXing, Inventario/Levantamiento y consumidor POS completada; sin nuevos defectos de producción demostrados. Sin dependencias ni cambios de autenticación/reglas comerciales.
- Se amplían exclusivamente E2E: diez ciclos exactos y liberación por ciclo; permiso denegado/manual/recuperación; códigos con ceros iniciales/desconocidos sin escrituras; expiración con cámara activa y lecturas tardías descartadas; POS compartido con una lectura por apertura y carrito/total correctos sin enviar venta. Un fallo inicial del nuevo test de expiración correspondía al patrón de ruta sin query; se corrigió el test, no autenticación.
- El protocolo de [aceptación física](ESCANER_IPHONE_20261018.md#comprobación-obligatoria-en-iphone-real) exige HTTPS autorizado con el SHA del PR, Safari y PWA instalada; se añade sesión revocada. Los previews de esta rama siguen deshabilitados. Sin acceso a iPhone ni WebKit descargable; no se presenta emulación como aceptación física.
- Bitácora: HEAD anterior `ccb55e15` con ambos workflows aprobados (443 frontend, 185 navegador, 15 sesiones móviles; piloto real 153/10 omisiones previas). Cierre local: frontend completo 443/443, navegador afectado 49/49 sin reintentos, lint 0 errores/116 avisos previos y TypeScript/build correctos. Logs de cierre en `docs/evidencias/scanner-20261018/acceptance-*.log`. El SHA definitivo, resultados y checks se mantienen en [#176](https://github.com/Nelosama/FerreSystem/pull/176) para no confundir checks anteriores con el nuevo HEAD. Sin merge ni despliegue.

## Rediseño de navegación Jowa — fase 1 (2026-10-17, rama `claude/gifted-dirac-fqc2u5`, sin PR, merge ni despliegue)

- **Origen:** propuesta Figma Make «Rediseño de Jowa System» evaluada y adaptada en chat con el propietario: formatos actuales (L., ISV 15 %, RTN, `V-…`), módulos reales, modo sin conexión y color por negocio. El propietario aprobó el orden de las maquetas y pidió grupos del menú lateral desplegables, conservando SIDEBAR y TOPNAV.
- **Orden del menú:** `NAVIGATION_ORDER` en `frontend/src/config/navigation.ts`, aplicado por `availableTasks`. Grupos: Inicio, luego Ventas y caja, Clientes y cobros, Inventario y compras, y Administración. Dentro de cada grupo, por uso: el POS antes de Arqueo, Cotizaciones y demás. Rutas, roles, permisos, módulos y `PENDING_MODULES` sin cambios. Etiquetas del menú en es/en pasan a mayúscula inicial.
- **Menú lateral** (`components/Sidebar.tsx`, estilos `.jowa-*` en `App.css`):
  - Grupos desplegables con `aria-expanded`. El grupo cerrado se recuerda en `localStorage` (`jowa_menu_grupos_cerrados`) y se abre solo si contiene la ruta activa.
  - Marca del negocio y sucursal arriba.
  - Pie con «En línea» / «Sin conexión» y las ventas de contingencia por enviar (`useConexion` + `contarVentasPorEnviar` en `offline/journal.ts`, que no crea la base local si el equipo nunca vendió sin red).
  - Sin red, los módulos distintos del POS se atenúan con la marca «en línea». Solo informa: no cambia sincronización, contingencia ni autorización.
  - TOPNAV sin cambios estructurales.
- **Super Admin:**
  - `PlatformSidebar` con color fijo de plataforma (no adopta el del negocio). Grupos: Clientes (Negocios, Usuarios administradores) y Plataforma (Catálogo de servicios, Soporte remoto, Auditoría, Mantenimiento y respaldos).
  - `SuperAdminPage` lee y escribe la sección en `?seccion=` (`config/platformNavigation.ts`).
  - En `/admin/negocios/:id` se despliega el menú del negocio (las seis pestañas de `NegocioNavigation`) con su color.
- **Plantilla V3 «Jowa claro»:** `templateVersion: 'v3'` admitido en el backend (`tenant-configuration.ts`, sin esquema ni migración: es la configuración JSON existente), en `TenantContext` y en el selector de Configuración. `v3-theme.css` redefine superficies, bordes, radios y tablas; el color y las fuentes siguen siendo los del negocio. V1/V2 sin cambios y V1 sigue siendo el valor por defecto.
- **Pruebas locales:**
  - Frontend: unitarias 380/380 (incluye una nueva de orden), `tsc -b`, lint sin errores nuevos y build (`VITE_API_URL=/api`).
  - Navegador simulado: `navigation-settings` + `template-v2` 47/47. `e2e/menu-jowa-v3.spec.ts` es nueva (orden, grupos desplegables persistentes, color del negocio, sin conexión, TOPNAV, Super Admin por URL y menú anidado). Suite simulada completa **178/178** con Chromium 1194 del entorno. La primera pasada dio 171/3: el indicador de conexión usaba `role="status"` y competía con los mensajes de Entregas y Conciliación; ahora es solo `aria-live`. También se corrigió que los grupos plegados seguían visibles por CSS.
  - Backend: unitarias 510/510 (V3 admitida y `v4` rechazada) y build.
  - No ejecutados: PostgreSQL real, piloto `e2e-real`, dispositivo físico ni Safari.
- **Páginas rediseñadas en la misma rama (2026-10-17):** Panel del Super Admin con lista de negocios que muestra logotipo, color, plan, servicios y estado (`SuperAdminPage.tsx`); Marca y navegación con vista previa del color (`NegocioDetallePage.tsx`); Inicio del administrador con «Pendientes de hoy» primero, acciones «Nueva cotización» y «Nueva venta», y solo tareas del rol con datos reales (`pages/admin/AdminHomePage.tsx`). Corregido el contraste de la pestaña activa del Super Admin en plantilla V3.
- **Validación:** unitarias 380/380; navegador 63/63 en páginas afectadas (admin home, navegación, Super Admin, plantilla V2, móvil admin, entregas y conciliación). Suite completa previa 178/178.
- **Fase 2 (2026-10-18):** encabezados de paso en el ticket del POS (`PasoTicket` en `POSPage.tsx`, sin mover lógica); píldora de estado de caja en la barra superior para ADMIN, CAJERO y VENDEDOR (`hooks/useEstadoCaja.ts`, lee `/operaciones/caja`; «sin verificar» cuando no hay red, nunca «cerrada»); el Super Admin en modo lateral ya no repite las pestañas superiores (TOPNAV las conserva).
- **Validación final:** unitarias 380/380; build y lint sin errores; navegador 181/181 (incluye 3 pruebas nuevas en `menu-jowa-v3.spec.ts`). Una corrida previa tuvo un fallo intermitente de cierre de sesión que no se reprodujo: 14/14 en aislado y la suite completa siguiente pasó.
- **Límites:** no probado contra base de datos real, dispositivo físico ni Safari. Los datos de la captura del POS fueron de prueba. Sin PR, merge ni despliegue. El sidebar de plataforma solo aplica a SIDEBAR; en TOPNAV el Super Admin conserva las pestañas del panel.

## Correcciones operativas Jowa — 2026-10-16, America/Tegucigalpa

- Rama única `fix/jowa-operacion-estable`, creada desde main `1e8afd617d8b215ba7063f0e2aeb72db1f18c2f5` con #172 integrado. Sin PR abiertos al iniciar. `git merge --no-ff origin/main` confirma que main ya está incluido; no se ha fusionado el PR ni desplegado.
- Aviso de sesión vencida limitado a la redirección de la sesión actual; una marca antigua de sessionStorage no contamina el acceso inicial. Se conserva íntegra la validación preventiva de #172 y su tratamiento de conectividad/contingencia.
- NEXUS: almacén PostgreSQL privado predeterminado para logotipos (2 MB), sin credenciales adicionales ni disco efímero. Proveedores local y Supabase explícitos conservados; claves versionadas y referencia/auditoría transaccionales, bytes en la misma transacción con PostgreSQL. No se sobrescribe el logotipo previo ante fallos. Migración aditiva `20261019000000_cloud_branding_sucursales`, RLS sin políticas públicas y FK restrictivas; diagnóstico SQL actualizado con checksums. Solo bases temporales; producción intacta.
- Idioma por negocio en configuración validada, edición exclusiva de SUPERADMIN y aplicación automática a sus usuarios. ES/EN eliminado de las interfaces de tenant (escritorio y móvil); preferencia personal de la plataforma reservada al Super Admin. Guardados parciales preservan preferencias y `{}` conserva su restablecimiento explícito.
- Referencias de navegación recibidas del propietario en este chat: TOPNAV con dos filas y nueve accesos principales; SIDEBAR con Ventas (incluye Inicio), Clientes, Inventario y Administración. Accesos secundarios conservados, catálogo único por rol/módulo/permiso y marca completa enlazada a Inicio.
- Panel de plataforma con cinco áreas y detalle de negocio con seis pestañas. Auditoría global leída de PostgreSQL en lugar de registros ficticios/locales. Soporte, impersonación, módulos y mantenimiento conservados.
- Gestión real de sucursales y de todos los roles de usuario por Super Admin. Reutiliza UsuariosService; desactivación, auditoría y revocación, protección concurrente del último administrador y filtro tenant+id. Sin borrado físico ni reasignación de ventas/cajas/existencias a sucursales.
- Validación local final: backend 508/508, frontend 379/379, scripts 48/48, PostgreSQL completo 1012 pasan/1 omitida preexistente en 62 archivos, HTTP/recuperación 6/6; build y lint sin errores. Navegador 173 pasan/1 falla conocida del emulador offline; móvil de sesiones 15/15; piloto real 139 pasan/1 fallo offline/10 omisiones preexistentes/13 sin ejecutar por serialidad; logotipos reales en móvil 4/4. Los cinco escenarios nuevos pasan contra API/PostgreSQL reales. Se corrigieron `{}`, registro SQL de migraciones, buscador TOPNAV móvil, etiquetas accesibles y el arnés de base antigua que omitía aplicar la nueva migración (sin cambiar expectativas).
- Límite del entorno: Chromium 151 reproduce la incoherencia de navigator.onLine conocida; descarga de Chromium 153 rechazada por proxy 403 Domain forbidden. No se fuerza navigator ni se omite la prueba. Servicio Supabase, datos productivos y aceptación física no verificados.
- CI del primer commit `7aeb9411`: piloto real **153 pasan/10 omisiones preexistentes**, respaldo, restauración y actualización/reversión aprobados; guard y navegador simulado/móvil aprobados. La validación de integración del primer commit conserva el fallo del arnés de base antigua; se incorpora la migración faltante y se repite en el HEAD final. Estado, SHA y checks definitivos: [PR único #173](https://github.com/Nelosama/FerreSystem/pull/173). El SHA del informe no se autocita para evitar referencias circulares; el HEAD publicado es verificable en el PR.
- Informe y 55 archivos modificados: [CORRECCIONES_OPERACION_JOWA_20261016.md](CORRECCIONES_OPERACION_JOWA_20261016.md). Bitácora: main/PR/componentes revisados, reproducción y corrección incremental, pruebas reales y simuladas distinguidas, recepción de capturas, publicación del borrador y cierre en la misma rama. Sin rebase, amend, force push, merge del PR ni despliegue. **NEXUS** firma la integridad de la migración y persistencia temporal; producción intacta.

## PR #172 — cierre de integración (2026-10-16, America/Tegucigalpa)

- Rama única `codex/fix-expired-sessions`. Merge normal de main `735fbb9c` (#170 y #171), commit `93f4a727`. Solo conflicto documental: se conservaron sesiones y ambas secciones de optimización. Sin rebase, amend, force push, despliegue ni migraciones productivas.
- Causa confirmada en Actions `38958353754`, job `117166809049`: la aserción de worker en espera pasó, pero la siguiente exigía `ferresystem-shell-v1`, aunque el worker de sesiones usa `v2`. La caché nueva instalada coexiste correctamente mientras espera; no demuestra activación prematura.
- Corrección en `frontend/e2e-real/contingencia-real.spec.ts`: versión obtenida del build, espera explícita de instalación; identidad del controlador y ausencia de controllerchange; carrito y efectivo intactos; diario intacto; nueva venta offline persistida al recargar, conservada al cerrar la última pestaña y activar el nuevo worker, y sincronizada una sola vez. Sin modificar el worker ni el comportamiento offline.
- La ampliación reprodujo otro defecto del arnés: la nueva caché tenía JS/CSS precargados sin Origin, pero Vite Preview agregaba `Vary: Origin`; al cerrar la última pestaña y reabrir offline, las peticiones de módulos no coincidían y la página quedaba blanca. Traza de `aab01d4f` (piloto CI: 145 pasan/1 falla/10 omitidas/2 sin ejecutar) y reproducción local confirman que el worker sí espera y sí se activa, pero el servidor de pruebas introduce variantes CORS. `e2e-real/vite.preview.mjs` ahora desactiva CORS para esta topología exclusivamente del mismo origen, donde `/api` ya usa proxy. No se modificó `sw.js`, su caché ni su política offline. Se espera también la UI al reabrir antes de reconectar.
- La comparación del diario conserva todas las propiedades salvo los tres diagnósticos de reintento (`intentos`, `proximoIntentoAt`, `ultimoError`); exige que las operaciones vuelvan a PENDIENTE con identidad y contenido exactos, sin ignorar pérdidas, cambios de líneas/importes ni estado final. Chromium 151 puede intentar red tras recargar offline, de ahí esos diagnósticos permitidos.
- Validación local de la integración: backend 506/506 unitarias, scripts 48/48, HTTP/recuperación PostgreSQL 6/6; frontend 43 archivos de pruebas sin fallos, build y lint sin errores; navegador afectado 33/33 (sesiones/PWA/POS/catálogo/contingencia). Sesiones con API/PostgreSQL reales 3/3. Escenario focalizado del worker + venta inicial real: **2/2**, incluida reapertura offline con nueva caché, diario conservado y reconciliación automática única (36,5 s para el caso del worker). PostgreSQL completo final: **996 pasan/1 omitida preexistente**, en 61 archivos. Resultados de los checks del HEAD definitivo en #172. `validate` y guard de `aab01d4f` aprobados, pero no sustituyen los checks posteriores.
- El piloto de `6d9a6a53` llegó al final: 147 pasan/1 falla/10 omitidas; actualización del worker aprobada. El caso 15 antes bloqueado por serialidad esperaba SALIR en arqueo offline, aunque solo el POS admite la excepción offline. Corregido el orden del propio test: abandonar el componente de sincronización, verificar que nada llegó al servidor, reconectar y validar arqueo mediante recarga antes del logout HTTP/UI real. Se mantienen revocación 200, diario del dueño, aislamiento del otro cajero y exactamente una operación/venta/movimiento de caja. Pasada local conjunta final de venta inicial + worker + logout: **3/3** (50,5 s), sin modificar aplicación ni autorización offline.
- Límite local conservado: secuencia completa de contingencia con Chromium 151 falla en `:192` por `navigator.onLine` (4 pasan/1 falla/13 sin ejecutar junto a sesiones); no se cambió ni omitió esa aserción. Chromium 153 sigue no descargable (`cdn.playwright.dev`, 403), CI usa el correcto. Sin aceptación física/Safari.
- NEXUS: solo pruebas de integridad en PostgreSQL 17 temporal; ningún cambio de esquema o acceso productivo. Estado conservador: NO MERGE hasta completar checks del nuevo HEAD. Sin autorización para ejecutar el merge del PR.

## Sesiones expiradas y navegación protegida (2026-10-16)

- **Rama única:** `codex/fix-expired-sessions`, desde `main` `d5fec352`. Se consultaron PR abiertos #170/#171 y ramas Codex remotas; no había una rama apropiada reutilizable. Sin cambios de esquema, migraciones, dependencias, reglas comerciales, merge ni despliegue.
- **Causas reproducidas antes de corregir:** usuario persistido habilitaba módulos antes de `/auth/me`; Axios sin timeout; errores 403/502/503/504 del refresh borraban credenciales; 401 tardíos fallaban después de renovar; NestJS convertía errores de BD del refresh en 401. No hay HAR del incidente: la duración exacta de 60 s no se atribuye a una solicitud confirmada.
- **Código:** controlador único `sessionValidation.ts` sustituye `sessionSync.ts`; `TenantContext`, `ProtectedRoute`, interceptor HTTP, login y SW. Verificación inicial/restauración sin montar módulos; formularios conservados durante renovación; sesión irrecuperable limpia identidad y pide login con el texto solicitado. Foco, visibilidad, BFCache, almacenamiento entre pestañas y expiración JWT; backend sigue autorizando cada solicitud. Refresh compartido y reintento único; errores de conexión no cierran sesión. Cookies siguen la política configurada y se borran con sus opciones de seguridad. API no-store y SW limitado al shell estático.
- **Contingencia:** conserva solo la ventana existente vigente del mismo tenant/cajero, incluso con red conectada sin acceso real. No habilita otros módulos ni evita 401/403. No se añaden borradores persistentes ni sincronización offline; permanecen las identidades de comandos inciertos existentes para evitar duplicados.
- **Pruebas:** frontend 368/368; backend 498/498; scripts 48/48; PostgreSQL temporal 17.11, 979 pasan/1 omitida preexistente en 60 archivos. Escenarios nuevos de navegador: escritorio 15/15, emulación Pixel 7 15/15 (SW real), y NestJS/PostgreSQL reales 3/3. Builds/lint y control de migraciones correctos (0 nuevas). NEXUS firma la validación de persistencia.
- **Regresión amplia y bloqueo real:** navegador simulado, repetición final: 169 pasan/1 falla (170 casos); piloto real completo 131 pasan/1 falla/10 omitidas preexistentes/13 no ejecutadas por serialidad. Chromium 151 restablece `navigator.onLine=true` al recargar offline con SW, aunque la API está bloqueada; lo reproduce una prueba independiente sin código de Jowa. La repetición final restaura el catálogo de contingencia, pero sigue fallando «● Sin conexión». No se cambia esa aserción ni el valor de navigator. Chromium 153 de Playwright no se pudo descargar: proxy HTTP 403 para `cdn.playwright.dev`. CI incluye los casos móviles nuevos.
- **Publicación sin despliegue:** `frontend/vercel.json` excluye esta rama de previews automáticas antes del primer push; guard probado (sin afectar otras ramas).
- **Estado al publicar:** NO LISTO PARA MERGE hasta comprobar la regresión offline con el Chromium correspondiente y los checks del commit. Sin Safari/WebKit ni PWA instalada en dispositivos físicos. Informe, comandos, archivos y límites: [CORRECCION_SESIONES_20261016.md](CORRECCION_SESIONES_20261016.md).
- **Bitácora:** lectura de instrucciones y contexto; verificación Git/PR; reproducciones rojas de frontend/backend/navegador; corrección centralizada, sesiones por rol/soporte y cookies; pruebas con relojes simulados, API simulada y PostgreSQL temporal real; revisión de caché y preservación del diario de contingencia; publicación de una rama/PR en borrador para revisión. Sin aceptación física ni acceso a producción.

## PR #171 — revisión técnica final (2026-10-16 UTC, rama `claude/optimizacion-limpieza-jowa`)

- **Estado Git:** `main` sigue en `d5fec352`; la rama no tiene conflictos con `main`. No había comentarios ni revisiones pendientes.
- **Simulación de merge con #170** (HEAD `af73e67`): el único conflicto es `backend/pnpm-lock.yaml` (modificado en #170, eliminado en #171). Se resuelve eliminándolo.
- **Defecto propio de #170, ajeno a #171:** su `backend/package-lock.json` ya falla `npm ci` por sí solo («Missing: typescript@5.9.3 from lock file»). No se tocó #170.
- **Defecto corregido en #171:** la paginación del catálogo del POS conservaba el límite ampliado con «Mostrar más» al volver a la búsqueda vacía. Ahora cualquier cambio de búsqueda reinicia a 120. Prueba de regresión `frontend/e2e/pos-catalogo-grande-simulado.spec.ts` (300 productos): falló antes de la corrección y pasa después. Cubre búsqueda fuera de lo visible, código de barras y código interno con Enter, cantidades, quitar renglón y totales con ISV.
- **`.vs/` en el historial:** no se detectaron patrones de credenciales (URL de BD con contraseña, JWT, claves de Supabase, GitHub u OpenAI, llaves privadas, variables de entorno, correos). La sesión de Copilot y el índice contienen bloques binarios o base64 que no se pueden clasificar con certeza. Si preocupa, el dueño decide si rota secretos o purga el historial. No se publicó contenido.
- **Pruebas locales sobre `ab25ace`:**
  - `npm ci` limpio en frontend y backend; `prisma validate` y `generate`.
  - Frontend: build con `tsc -b`, lint (0 errores), unitarias 340/340 y Playwright simulado 155/155 (antes de la corrección). Después de la corrección: e2e de POS, caja, contingencia y offline 22/22, más la nueva prueba.
  - Backend: build, lint (0 errores), unitarias 494/494, scripts 48/48 y Python OK.
  - PostgreSQL 16 con `REAL_SETTINGS_BROWSER=1`: 977 + 65 en una repetición aislada de los dos archivos que habían fallado por interferencia del entorno (recompilación de `dist` en paralelo y permisos de `.vite-temp`). Backend `test:e2e` 6/6 en ejecución aislada.
  - Piloto real en escritorio (`e2e-real`): 145 aprobadas y 10 omitidas preexistentes, incluida la contingencia offline completa 5/5.
  - Piloto real en móvil: 142 aprobadas, 10 omitidas y 1 fallo preexistente: `logotipo-real.spec.ts:61` falla igual en `main` (SIDEBAR no visible en 390 px; la configuración móvil no corre en CI).
  - Safari/WebKit: no ejecutado, porque no está instalado en el entorno.

## Optimización y limpieza — PR #171 (2026-10-16 UTC, rama `claude/optimizacion-limpieza-jowa`, borrador, sin merge ni despliegue)

- **Base:** `main` `d5fec352`. No había rama ni PR de Codex abiertos al empezar. Apareció #170 (Jules): toca `backend/pnpm-lock.yaml` (que #171 elimina) y agrega `multer` sin actualizar `package-lock.json`. Coordinación publicada en #170. Sin cambios de esquema, migraciones, autenticación, permisos, reglas de negocio ni archivos de PWA/móvil.
- **Frontend:**
  1. `@react-pdf/renderer` se importa dinámicamente en `components/descargarRecibo.ts`. Se precarga al acercar el puntero o enfocar el botón de descarga. Abrir el POS bajó de 1,25 MB a 45 KB de JS.
  2. **POS:** índice del catálogo en `utils/posCatalogo.ts`, con pruebas de equivalencia contra el filtro anterior (`test/pos-catalogo.test.mjs`); tarjetas memorizadas; 120 tarjetas visibles con «Mostrar más».
  3. **Inventario:** filtro, filas y `ProductoGestion` memorizados.
  4. `en.json` se carga bajo demanda.
  5. `GarantiasPage` pasa a carga diferida. Las páginas de contingencia siguen en el bundle inicial a propósito (offline).
- **Backend:**
  - `GET /productos/comercial`: filtra en SQL y lee solo las columnas expuestas, sin la consulta de autores. Respuesta idéntica por SHA-256.
  - `GET /dashboard`: consultas en paralelo; sumas con `aggregate` sobre NUMERIC. Los totales quedan exactos al centavo: antes, p. ej., 34500.530000000006. Prueba nueva en `test/dashboard.postgres.integration.ts`.
  - Índices: `EXPLAIN ANALYZE` muestra que los existentes ya cubren estas consultas; no se agregó ninguno.
- **Limpieza:**
  - Archivos retirados: `.vs/` (estado local de Visual Studio/Copilot, 1,9 MB; queda en el historial de Git); `tests/example.spec.ts` y `playwright.config.ts` de la raíz (plantilla) con sus devDependencies; los tres `pnpm-lock.yaml` (npm es el gestor en CI, Render y Vercel); `test-results/.last-run.json`; `public/icons.svg`; `WeeklyTrend.tsx`; `SuperAdminLoginPage.tsx`.
  - Dependencias y scripts: script `deploy` + `@nestjs/mau` (recomendación R3 de CENTINELA), `pg-gateway` y `source-map-support`; imports sin uso.
  - `logo.jpg` re-codificado de 1,88 MB a 269 KB, con las mismas dimensiones y ruta.
- **Métricas:** Chromium con backend simulado y 5.000 productos; API con PostgreSQL 16 temporal, 5.000 productos y 2.100 ventas. Scripts y resultados en [evidencias/optimizacion-20261016/](evidencias/optimizacion-20261016/).

  | Medida | Antes | Después |
  |---|---|---|
  | JS inicial (index.html) | 597 KB / 193 KB gzip | 531 KB / 171 KB gzip |
  | JS en /login | 585 KB | 518 KB |
  | JS adicional al abrir POS | 1,25 MB | 45 KB |
  | POS: agregar al carrito | 208–348 ms | 31–32 ms |
  | POS: tecla en nombre de cliente | 189–251 ms | 31–32 ms |
  | POS: nodos DOM | 30.368 | 1.092 |
  | Inventario: tecla en el alta | 191–212 ms | 15–31 ms |
  | `/productos/comercial` (mediana) | 182 ms, 3 consultas | 98 ms, 2 consultas |
  | `/dashboard` con +3 ms/sentido | 456 ms | 51 ms |
  | `public/` | 1,90 MB | 283 KB |

- **Pruebas locales:**
  - Frontend: unitarias 340/340; `tsc -b`; lint sin errores (avisos 116 → 115); Playwright simulado 155/155 (Chromium 1194 del entorno).
  - Backend: build; unitarias 494/494; scripts 48/48; Python OK; lint sin errores (avisos 396 → 390).
  - PostgreSQL 16 real: suite de integración completa, 978 aprobadas y 1 omitida (navegador opt-in preexistente).
- **CI de #171:** `guard-base-datos` aprobado. «Piloto con API y PostgreSQL reales» aprobado: 145 pasan, 10 omitidas preexistentes, junto con respaldo, recuperación y actualización. El resultado de `validate` se informa en el PR.
- **Pendientes y decisiones del dueño:**
  - Páginas sin ruta que usan localStorage (`ApartadosPage`, `TransferenciasPage`, `PedidosEspecialesPage`, `ListasPrecioPage`): ya no se empaquetan; decidir si retirarlas.
  - `deploy/local/` (servidor local): se conserva porque lo cubren pruebas de scripts; con la arquitectura web definitiva, el dueño debe decidir si se retira.
  - `.vercel/project.json` versionado: no es secreto, pero Vercel recomienda no commitearlo.
  - Revisar el historial de `.vs/` (sesión de Copilot) por si contiene datos sensibles.
  - Compresión HTTP de la API: no se agregó porque requiere una dependencia o middleware propio. El catálogo comercial pesa unos 2,4 MB sin comprimir con 4.000 productos; verificar si Render comprime.
  - Las capturas de `frontend/artifacts/` se regeneran en cada corrida de Playwright.
  - La tabla de Inventario sigue pintando todas las filas: solo se memorizó.
  - No hubo prueba en dispositivo físico, Safari ni con datos reales.

---

## Precisión monetaria — continuación de PR #166 (2026-10-15 UTC)

- **Sincronización (2026-10-15, tarde):** `main` `34dd1feb` (PR #165 integrado) incorporado con merge normal. Único conflicto: este documento; se conservaron ambas secciones. Sin force push ni rebase.
- **JW-07 corregido (compras):** el total de compra se calculaba en coma flotante (2.5 × L 25.99 daba L 64.97; correcto L 64.98). Ahora `operaciones/compra-totales.ts` usa centavos enteros con mitad hacia arriba (`common/dinero.ts`). Pruebas nuevas `compra-totales.spec.ts` (8). Devoluciones y CxP ya usaban centavos; no se cambió su regla.
- **Validación de esta tarde:** backend unitarias 466/466 (49 de 50 archivos; `productos-security.http.spec.ts` no carga por cliente Prisma sin regenerar); frontend 330/330; `tsc -b` y build correctos.
- **NO ejecutado en este entorno:** PostgreSQL real y Playwright. Bloqueo: `binaries.prisma.sh` responde 403 por política del proxy, así que no se puede generar el cliente Prisma ni arrancar la API; tampoco hay navegador Playwright instalado. **Decisión:** el PR sigue en borrador y la recomendación es NO MERGE hasta ejecutar esas suites.

- **Estado:** [PR único #166](https://github.com/Nelosama/FerreSystem/pull/166), rama `codex/auditoria-precision-monetaria`, sigue en borrador. Conserva `463efae8` y sus cuatro correcciones. #165 comprobado antes de tocar archivos compartidos y al cierre: abierto, no integrado (`cc29135a`); `main` sigue en `74ba4dcc`, ya incluido. Sin nuevas ramas/PR, merge, despliegue ni cambios de esquema/migraciones.
- **Corregido:** POS reutiliza cálculo monetario offline para líneas, subtotal, ISV, descuento mostrado/enviado y total; descuento con cociente entero y porcentaje sin redondeo previo. Comprobante/PDF usan líneas redondeadas y subtotal bruto coherente con API. Devoluciones conservan el reparto proporcional acumulado, calculado con `BigInt`: 9 de 12 unidades a L 0.21 devuelve L 2.18 (antes 2.17), remanente L 0.72; con abono L 1.01 cancela crédito L 1.89 y reembolsa L 0.29 + L 0.72. Sin cambios comerciales.
- **Evidencia:** backend 458/458; frontend 321/321, selección final POS/recuperación/dinero 51/51 solapada; diferencial de 10.000 carritos frontend/backend/offline; PostgreSQL real 241/241 en nueve suites; builds, lint sin errores, diff y guard (0 migraciones nuevas) correctos. Navegador contra API/PostgreSQL reales: 10 aprobadas, 1 fallida, 13 no ejecutadas. Pasan los cinco casos monetarios de POS, crédito/abonos, caja y cobro/entrega.
- **Pendiente de navegador:** `contingencia-real.spec.ts:192`, recarga offline no muestra «● Sin conexión»; reproducido también sobre `463efae8` con Chromium 151 (base: 1 pasa/1 falla). No se cambió ni debilitó la prueba. No se certifica la secuencia offline restante.
- **CI de `4979d8a7`:** guard aprobado; piloto real completo aprobado (141 pasan/10 omitidas, respaldo, recuperación y actualización/reversión). La secuencia offline sí pasa allí: la discrepancia local sigue sin explicación. `validate` falló en aviso de éxito de cierre manual simulado (145 pasan/1 falla). Causa preexistente: `cargar()` borraba el mensaje que `resolver` acababa de mostrar. Corregido el orden de confirmación tras recarga satisfactoria; test reforzado espera recarga y render: rojo en `463efae8`, verde 1/1 en corrección. Build/lint y pruebas de texto 21/21 correctos. Sin cambios monetarios posteriores a `4979d8a7`; falta comprobar los workflows del nuevo HEAD publicados en #166.
- **Siguiente paso:** cuando el responsable integre #165, actualizar esta misma rama desde `main` y repetir validación conjunta; checks del HEAD publicado se consultan y reportan en #166. **NO listo para producción** mientras siga pendiente esa integración y la validación offline. Sin aceptación física ni revisión de datos productivos.
- **Bitácora/informe reproducible:** [AUDITORIA_PRECISION_MONETARIA_20261015.md](AUDITORIA_PRECISION_MONETARIA_20261015.md), pruebas rojas/verdes y evidencia de PostgreSQL/navegador. Cliente Prisma regenerado desde el esquema existente. PostgreSQL 17.11 temporal sin privilegios. NEXUS firma la validación de integridad monetaria.

---
## Jowa System — PR #165: validación final y cierre (2026-10-15, rama `claude/festive-thompson-25nx9m`, sin merge ni despliegue)

- **Alcance:** solo verificación y correcciones de defectos del propio PR. Sin funcionalidades nuevas. `main` (`74ba4dcc`) integrado; sin conflictos.
- **Migraciones (Fase 1):**
  - `20261017000000` ya está en `main` (introducida en `8fa7582e`, fusionada con #159 el 2026-10-13). #159 lo fusionó su propio responsable (`merged_by: Nelosama`) **sin revisiones registradas**. La marca `APROBACION-DESTRUCTIVA: CONT-1017 @Nelosama` es texto del archivo: no sustituye una revisión de CODEOWNERS. Pendiente de confirmación explícita del responsable.
  - `20261018000000_tenant_logotipo_privado` (aditiva): se aplicó a PostgreSQL 16 temporal **vacía** y **con datos** (3 negocios, dos con `logo_url` legado). Columnas previas idénticas (md5), nuevas nulas, restricciones CHECK verificadas (4 inválidos rechazados, 1 válido aceptado), reaplicar falla, reversión manual probada en base temporal con datos previos intactos.
  - `prisma migrate deploy` + comprobación de deriva completa del esquema: sin deriva (arnés `e2e-real/run.sh`).
  - Respaldo `pg_dump -Fc` + `pg_restore` con datos y logotipos: datos idénticos y restricciones presentes.
  - Guard de CI `verificar-migraciones.mjs`: correcto. Scripts de backend: 48/48.
  - Reversión manual documentada en `backend/prisma/rollback-manual/20261018000000_tenant_logotipo_privado.sql` (sin sentencias activas, según la convención del repositorio).
- **Supabase Storage (Fase 2): BLOQUEADO.** No hay credenciales, URL ni proyecto autorizado en el entorno; no se creó infraestructura alternativa. Verificado solo el contrato HTTP con un servidor local (no demuestra el servicio real). Pendiente: crear el bucket **privado** (`public = false`), definir `LOGOTIPO_ALMACEN=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (solo backend, nunca en frontend), `SUPABASE_LOGOTIPO_BUCKET`, y repetir las pruebas de carga, lectura, reemplazo, eliminación, persistencia y aislamiento contra el proyecto real.
- **Flujo real de logotipo (Fase 3):** `e2e-real/logotipo-real.spec.ts` con backend NestJS compilado, PostgreSQL temporal y almacenamiento local persistente, sin mocks: **4/4**. Cubre carga por SUPERADMIN, persistencia tras recargar, visualización en SIDEBAR y TOPNAV del negocio, reemplazo WEBP, eliminación y vuelta al ícono predeterminado, y autorización directa por API (403 para ADMIN/CAJERO/otro negocio; 404 de lectura cruzada; 415 y 413 con el logotipo intacto).
- **Formato de impresión (Fase 4):** PDF de recibo generados con `@react-pdf/renderer` en los tres formatos. Tamaño de página leído del archivo: A4 595.28×841.89 pt; rollo 80 mm 226.77 pt de ancho; rollo 58 mm 164.41 pt. Persistencia por negocio verificada en integración y en navegador. **Pendiente:** impresión física en impresora térmica y hoja (no bloquea el merge; continúa pendiente para el piloto).
- **Defectos encontrados y corregidos en esta fase:**
  1. Subida del logotipo fallaba en el navegador: el cliente HTTP compartido fija `Content-Type: application/json` y el archivo nunca llegaba al servidor (detectado por la prueba real; la de integración usaba `fetch` nativo y no lo reproducía). Corregido en `LogotipoNegocioEditor.tsx`.
  2. El menú del Super Admin mostraba «Configuración del negocio» y «Auditoría» como entradas globales que solo redirigían. Retiradas del catálogo; se accede por negocio desde el panel.
  3. Pruebas reales que codificaban la regla anterior (ADMIN leía la auditoría): actualizadas para verificar 403 explícito y la auditoría por negocio con el SUPERADMIN, sin relajar aserciones.
  4. Ruta de API en Playwright (`baseURL` descartaba `/api`): corregida en la prueba nueva.
- **Pruebas (evidencia de esta fase):**
  - Playwright **real** (backend + PostgreSQL temporal, sin mocks): **144 OK, 0 fallidas, 10 omitidas**. Las 10 son `test.skip` preexistentes en `main` con motivo «PENDIENTE» (funcionalidad no implementada).
  - Playwright **simulado**: **149/149**.
  - Frontend unitarias **321/321**; `tsc -b`, lint y build de producción correctos.
  - Backend: sin cambios de código desde `2fc4907c`. Evidencia de integración PostgreSQL (958 OK, 1 omitida preexistente) y unitarias (474/474) de ese commit siguen vigentes.
  - Aislamiento multi-tenant y autorización: cubiertos por la integración PostgreSQL (`configuracion-logotipo`, 24/24) y por la prueba real de API.
- **Limpieza:** eliminado un script temporal de verificación de PDF; capturas regeneradas por Playwright restauradas.
- **Riesgos pendientes:**
  - Supabase no verificado contra servicio real.
  - `20261017000000`: confirmar la aprobación del responsable como revisión formal.
  - Migración `20261018000000` no aplicada a producción.
  - Impresión física pendiente.
  - UX: revisión visual en 390 px y dispositivo físico no realizada.
  - Sin protección general de cambios sin guardar en configuración.
- **Recomendación:** integrar código a `main` **cuando** el responsable apruebe el PR (CODEOWNERS de `backend/prisma/`). **No activar en producción** hasta verificar el almacenamiento elegido y aplicar la migración con su respaldo previo.

## Jowa System — PR #165: permisos reales, logotipo privado y formato de impresión (2026-10-15, rama `claude/festive-thompson-25nx9m`, PR [#165](https://github.com/Nelosama/FerreSystem/pull/165), sin merge)

- **Sincronización:** `main` `74ba4dcc` integrado en la rama con merge normal (sin reescritura). Único cambio de `main` desde la base: una línea de `CONTEXTO_MAESTRO.md`.
- **Permisos en backend (no solo interfaz):**
  - `PUT /tenant/settings` → `@Roles('SUPERADMIN')`: ADMIN, CAJERO, VENDEDOR y BODEGUERO reciben 403.
  - `GET /operaciones/auditoria` → `@Roles('SUPERADMIN')`: ADMIN recibe 403 (verificado en HTTP real).
  - Nuevos endpoints del SUPERADMIN, con `SuperAdminGuard` y reutilizando servicios existentes: `GET/PUT /admin/tenants/:id/settings` (usa `TenantsService`), `GET /admin/tenants/:id/auditoria` (misma consulta que el tenant, extraída a `operaciones/auditoria-consulta.ts`), y `GET/POST/DELETE /admin/tenants/:id/logo`.
  - Un token de negocio recibe 403 en todas las rutas `/admin/...`, incluso con su propio identificador.
  - `PATCH /admin/tenants/:id` ya no acepta `logoUrl` externo (400). El cambio de rubro solo lo permite la ruta del SUPERADMIN.
  - Auditoría: cada cambio de configuración, de marca y de logotipo registra `CONFIGURACION_NEGOCIO_ACTUALIZAR`, `NEGOCIO_ACTUALIZAR`, `LOGOTIPO_GUARDAR` o `LOGOTIPO_ELIMINAR` con la identidad real del SUPERADMIN.
- **Logotipo privado:**
  - Validación por contenido real: firma binaria PNG/JPEG/WEBP, MIME declarado coherente, tamaño máximo 2 MB, dimensiones ≤ 4096 px. SVG, HTML y archivos dañados se rechazan (415/413/422).
  - Almacenamiento detrás de una interfaz: driver `local` (volumen persistente, p. ej. disco de Render) y driver `supabase` (Storage con bucket privado, solo en el servidor). Sin configuración los endpoints responden 503: no hay simulación.
  - PostgreSQL guarda solo `logo_storage_key`, `logo_mime`, `logo_bytes` y `logo_actualizado_at` (migración aditiva `20261018000000_tenant_logotipo_privado`, con restricciones CHECK). No hay binarios en la base.
  - Lectura autenticada para el negocio: `GET /tenant/logo` solo devuelve el logotipo del negocio del token.
  - El frontend pide los bytes con el token y los muestra como data URL (las URL firmadas o externas no se usan).
  - Sin logotipo se muestra el ícono predeterminado.
- **Formato de impresión (solicitado en esta sesión):** `configuracion.formatoImpresion` ∈ {`A4`, `ROLLO_80MM`, `ROLLO_58MM`}, por defecto `A4` (los negocios existentes pasan a A4; antes el PDF usaba carta). Lo configura el SUPERADMIN desde «Configurar negocio». Aplica a recibos y cotizaciones en PDF (tamaño de página de react-pdf: A4 o ancho de rollo con alto según contenido), al ticket de POS (ancho CSS y `@page`) y al comprobante de contingencia (`@page`; si el negocio es de rollo, ese formato sustituye la preferencia local del equipo).
- **Navegación y marca:** Sidebar y TopNav muestran el logotipo y el nombre comercial del negocio como protagonista; «Jowa System» es el enlace a Inicio según el rol. `TenantBrand` y `TopBar` (v2) usan el mismo componente.
- **Pantallas del SUPERADMIN:** `/admin/negocios/:id/configuracion` (formulario completo + editor de logotipo) y `/admin/negocios/:id/auditoria`. Las rutas `/configuracion` y `/auditoria` redirigen a `/admin`. Desde cada negocio del panel: «Configurar negocio» y «Auditoría».
- **Pruebas recuperadas:** las pruebas bloqueadas de Configuración y V2 (`test.fixme`) quedaron **activas** y verifican el flujo nuevo. Cero pruebas omitidas en el diff. Dos ajustes son intencionales y se explican aquí: (1) la navegación de la plataforma del Super Admin no cambia con la configuración del negocio editado, así que la prueba de caché verifica el formulario y no la barra lateral; (2) la prueba V2 verifica lo guardado en el servidor y el logotipo en el editor, no el tema de la plataforma.
- **Evidencia (verificada en este entorno):**
  - Backend unitarias **474/474**; lint sin errores; build (`nest build`) y `tsc -p tsconfig.build.json` correctos.
  - Backend integración PostgreSQL 16 real con migraciones del repositorio, HTTP real y servicios reales: `configuracion-logotipo.postgres.integration.ts` **24/24** (autorización 403, aislamiento entre negocios, auditoría por negocio, carga/reemplazo/eliminación, persistencia tras nueva sesión, rechazos de formato y tamaño, formato de impresión). Subconjunto afectado (ventas, reportes, autenticación fase 3, control de migraciones y la nueva): **133/133**. Suite completa: ver resultado en el informe del PR.
  - Frontend unitarias **321/321**; lint sin errores; `tsc -b` y build de producción (`VITE_API_URL=/api`) correctos.
  - Playwright (Chromium del entorno) suite completa **149/149**, sin omitidas. Nota: las pruebas Playwright usan backend **simulado**; la autorización real se verifica en la integración con PostgreSQL.
- **Configuración externa requerida (no verificada contra servicios reales):**
  - Migración: aplicar `20261018000000_tenant_logotipo_privado` con `npm run migrate:deploy` solo tras revisión; no se ejecutó contra producción. Depende de que `20261017000000` siga pendiente de aprobación CODEOWNERS según la bitácora previa.
  - Almacenamiento `local` (recomendado en Render con disco persistente): `LOGOTIPO_ALMACEN=local` y `LOGOTIPO_DIRECTORIO=/ruta/absoluta/en/el/disco/persistente`.
  - Almacenamiento `supabase`: `LOGOTIPO_ALMACEN=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (solo en el backend, nunca en el frontend) y `SUPABASE_LOGOTIPO_BUCKET` (por defecto `logotipos-privados`). **Crear el bucket como privado** (`public = false`). No se ha comprobado la conexión real con Supabase: el driver está probado contra un servidor HTTP local que replica el contrato.
  - Vercel solo sirve el frontend; no almacena logotipos.
- **Riesgos y pendientes:**
  - Sin verificación en impresoras térmicas ni en hoja física; el alto del rollo es una estimación por contenido.
  - La validación de imagen comprueba firma y cabeceras; no decodifica píxeles (no hay librería de imagen en el backend). Los metadatos EXIF no se eliminan.
  - Sin protección general de cambios sin guardar en la configuración (no existía mecanismo previo).
  - Revisión visual en 390 px y en dispositivo físico pendiente; la UX se revisó solo por pruebas automatizadas.
  - La prueba `inicio-roles` de `e2e-real` (backend real) no se ejecutó en esta sesión.
  - Sin merge ni despliegue a producción.

## Jowa System — marca, Inicio, panel del negocio y permisos (2026-10-15, rama `claude/festive-thompson-25nx9m` desde `main` `94d052e2`, sin PR ni merge)

- **Estado Git verificado:** `main` = `94d052e2`. La rama de frontend `claude/modest-galileo-693672` (#161, cabeza `a97f9792`) ya es ascendente de `main`; #160, #161, #162 y #163 aparecen cerrados sin merge en GitHub, aunque los merges de #161 y #162 están en el historial de `main`. La rama designada `claude/festive-thompson-25nx9m` ya no existía en origen: se recreó desde `main` con el mismo nombre. No hay PR abierto para esta rama; no se creó ninguno.
- **Marca:** «Jowa System» en `index.html` (título), `manifest.webmanifest`, login y portal Super Admin, Sidebar, TopNav, POS (cabecera y pie), recibo PDF (pie), tenant por defecto, mensaje del escáner y `README.md` del frontend. Identificadores internos (claves `ferre_*` de `localStorage`, rutas, paquetes, variables de entorno) sin cambios; nombre del repositorio sin cambios.
- **Inicio:** el logotipo de Sidebar y TopNav enlaza a `/` (ADMIN → panel; resto → resumen; SUPERADMIN → `/admin`). El elemento «Inicio» ya existía en Sidebar, TopNav y barra móvil (`menu.dashboard`); no se creó una segunda navegación. Protección de cambios sin guardar: no existe un mecanismo general (solo `window.confirm` puntuales y el borrador del POS); no se añadió ninguno.
- **Panel del negocio (ADMIN, `pages/admin/AdminHomePage.tsx`):** eliminadas la sección «En preparación», la tarjeta «Indicadores en preparación» y la línea «Próximamente» del inventario. Cifras reales y accesos rápidos sin cambio.
- **Permisos en frontend:** `/configuracion` y `/auditoria` solo `SUPERADMIN` (`App.tsx` y `config/navigation.ts`). ADMIN, CAJERO, VENDEDOR y BODEGUERO ven «Acceso Denegado» por navegación directa y no ven el ítem en menús. `GET /operaciones/auditoria` no se invoca desde esas vistas.
- **Terminología:** en `locales/es.json` y `OperacionesPage` «ferretería» pasó a «negocio» donde era texto de administración. Se conservan el rubro `FERRETERIA`, el catálogo de ferretería y los ejemplos o datos de prueba.
- **Logotipo por negocio — NO IMPLEMENTADO (dependencia de backend):** el backend no tiene almacenamiento persistente de archivos. `SUPABASE_URL` y `SUPABASE_SERVICE_KEY` están en `backend/.env.example`, pero el backend solo usa PostgreSQL. No se crearon subidas simuladas ni se guardan binarios en PostgreSQL. Contrato necesario:
  - `POST /tenant/logo`: multipart, un archivo PNG, JPG, JPEG o WEBP de hasta 2 MB; validar firma binaria y re-codificar para eliminar metadatos; SVG rechazado. Solo SUPERADMIN. Registrar evento de auditoría.
  - `GET /tenant/logo`: devuelve los bytes solo para el tenant activo; 404 si no hay logo.
  - `DELETE /tenant/logo`: solo SUPERADMIN; evento de auditoría.
  - Almacén: objeto privado `tenants/{tenantId}/logo.{ext}`. En `Tenant` solo metadatos (clave, MIME, tamaño, fecha de actualización).
  - Frontend: `<img>` no envía el token Bearer, así que Sidebar, TopNav y `TenantBrand` deberán pedir el logo con autorización y mostrar un blob URL.
  - **Decisión pendiente del dueño:** proveedor de almacenamiento (Supabase Storage privado o disco del servidor con respaldo).
- **Bloqueos de backend detectados (no modificados en esta tarea de frontend):**
  1. `PUT /tenant/settings` (`tenants/tenants.controller.ts`) exige `@Roles('ADMIN')`: ADMIN puede cambiar identidad, logotipo y configuración del negocio; SUPERADMIN recibiría 403. Corrección propuesta: `@Roles('SUPERADMIN')` con flujo de administración por tenant (p. ej. `/admin/tenants/:id/settings`) y prueba de autorización.
  2. `GET /operaciones/auditoria` (`operaciones/operaciones.controller.ts:71`) exige `@Roles('ADMIN')`: ADMIN puede consultar la auditoría por API aunque la UI la oculte. Corrección propuesta: `@Roles('SUPERADMIN')` o endpoint administrativo dedicado. Los eventos de auditoría no se tocaron.
  3. `TenantContext` (línea 85) no carga `/tenant/settings` cuando el usuario es `SUPERADMIN`. La pantalla `/configuracion` no puede funcionar para ese rol hasta resolver este punto junto con el 1. Mientras tanto, la marca del negocio se edita desde `/admin` (modal «Configurar marca y datos de empresa», `PATCH /admin/tenants/:id`).
- **Pruebas actualizadas por la regla nueva (no se ocultan fallos):**
  - `test/taskNavigation.test.mjs`: el SUPERADMIN ve además Auditoría y Configuración; nueva prueba de exclusividad.
  - `e2e/arranque.spec.ts`: ADMIN y CAJERO ven «Acceso Denegado» en `/auditoria` y `/configuracion`.
  - `e2e/admin-home-simulado.spec.ts`: sin «En preparación» ni «Próximamente».
  - `e2e/navigation-settings.spec.ts`: el SUPERADMIN ve Configuración en la navegación; nueva prueba de denegación para ADMIN con pendientes traducidos.
  - **Bloqueadas con `test.fixme` (4 casos):** los flujos de Configuración del negocio y el de plantilla V2 (`template-v2.spec.ts`) quedan con su rol original. No se cambió el rol para que pasaran: fallan por el bloqueo 3 y el 1.
- **Pruebas nuevas:** `frontend/test/marca-jowa-guard.test.mjs` (4 casos: título y manifiesto, sin «FerreSystem» en la interfaz, sin «En preparación» en el panel, enlace de marca a Inicio).
- **Evidencia (`frontend/`):**
  - `npm ci` correcto. Línea base previa al cambio: `tsc -b` 0 errores; lint 0 errores; unitarias 312/312.
  - Después del cambio: `tsc -b` 0 errores; lint 0 errores; unitarias **317/317**.
  - `VITE_API_URL=/api npm run build` correcto.
  - Playwright (Chromium del entorno), suite completa: base `main` **146/146**; cambio **143 OK + 5 omitidas**. Las 5 omitidas son las 4 bloqueadas y la de V2. Las 2 pruebas nuevas de ADMIN explican la diferencia: 146 − 5 + 2 = 143.
- **Pendientes y riesgos:**
  - Logotipo por negocio: contrato, almacenamiento y UI sin implementar.
  - Bloqueos de backend 1, 2 y 3.
  - Revisión visual en 390 px y en dispositivo físico; rediseño visual amplio no realizado (solo ajustes de texto y navegación).
  - Quedan textos funcionales de ferretería: rubro, catálogo, «Partida General de Materiales de Construcción» en cotizaciones y nombres de ejemplo.
  - Sin PR, sin merge a `main` y sin despliegue.

## Frontend UX/UI — sincronización automática y panel administrativo (2026-10-13, rama `claude/modest-galileo-693672`, sin merge)

- **Alcance real:** la misión pedía `feat/frontend-uxui`; esa rama no existe y la directiva prohíbe crear ramas, así que el trabajo está en `claude/modest-galileo-693672`. Referencias obligatorias **no disponibles en el repositorio**: `docs/figma-make-admin-reference/` y `docs/PLAN_REDISENO_FRONTEND_UXUI_20261012.md` no existen en ninguna rama ni en disco. Sin ellas no hay comparación pixel a pixel con Figma: **no se declara pixel-perfect**.
- **Sincronización (Bloque C):** motor puro `frontend/src/utils/autoRefresh.ts` + hook `frontend/src/hooks/useAutoRefresh.ts` + indicador `components/SyncStatus.tsx`. Carga al entrar, sondeo, regreso a la pestaña, recuperación de red, sin duplicados, descarte de respuestas obsoletas, cancelación al desmontar. Solo lecturas; no ejecuta escrituras.
- **Botones «Actualizar» eliminados:** Admin móvil (`AdminMovilPage`), Operaciones/cuentas/compras/entregas (`OperacionesPage`), Devoluciones («Actualizar estados»), Contingencia admin (`ContingenciaAdminPage`). **Conservado a propósito:** POS «Actualizar catálogo y precios del carrito» (cambia precios del carrito: requiere acción explícita del cajero).
- **Matriz de sincronización:** Panel ADMIN 30 s · Dashboard otros roles 30 s · Admin móvil 30 s · Operaciones 60 s compras / 30 s cuentas y entregas · Devoluciones 30 s · Contingencia admin 30 s · POS caja 30 s y catálogo 60 s (catálogo no cambia precios del carrito). Operaciones y devoluciones no vacían formularios ni recepciones en curso; no leen mientras una operación escribe.
- **Panel ADMIN (Bloques A/B):** `frontend/src/pages/admin/AdminHomePage.tsx` + `admin-dashboard.css`, usado por `HomeRoute` solo para rol ADMIN. Datos reales de `/dashboard` (ventas del día, variación, tendencia SVG, alertas, últimas ventas, cotizaciones). Sin datos: «Próximamente» (ganancia, ticket promedio, por cobrar, entregas, estado de inventario, apertura de caja). Respuestas parciales se normalizan con ceros. Conserva `TaskShortcuts`. Fuentes Manrope y DM Sans añadidas una vez en `index.html`. Sidebar, TopNavigation y BottomNavigation no se modificaron.
- **Correcciones UX (Bloque D) hechas:** POS — la caja no comprobable ya no se muestra como «cerrada» (error de conexión visible); advertencia no bloqueante de existencia insuficiente en venta normal (pedidos especiales no se bloquean). Comprobante de venta — «Total facturado / Pagado / Saldo pendiente» (crédito = saldo completo; otros métodos = pagado al emitir). Marca — validación `#RRGGBB` (`utils/colorHex.ts`) con bloqueo de guardado. Productos — advertencia de nombre duplicado no bloqueante (`utils/productoDuplicados.ts`). Devoluciones — búsqueda por «V-3», «V-00000003» o «3» (`utils/numeroVenta.ts`; el backend sigue recibiendo el número). Compras — errores de agregar producto junto al campo.
- **Pendientes del Bloque D (no hechos):** (5) CSV con errores por fila y campo: depende del contrato backend de Codex; no se inventó respuesta. (6) errores de factura por campo: solo se resolvió la línea. (9) mensajes de formularios generales y (10) tablas: revisión parcial. (1) bloqueo o no de pedidos especiales se mantiene como estaba: solo se añadió advertencia.
- **Pruebas ejecutadas (evidencia):** `tsc -b` 0 errores; `oxlint` 0 errores (advertencias 121 → 115, sin nuevas en archivos tocados); pruebas unitarias **288/288** (incluye `auto-refresh` 8, `color-hex` 3, `producto-duplicados` 3, `numero-venta` 2); `VITE_API_URL=/api npm run build` correcto; Playwright con Chromium del entorno: **146/146** en toda la suite `e2e/`, incluida `admin-home-simulado` (3 casos: escritorio, móvil sin desbordamiento, fallo sin cifras falsas). Los datos son simulados.
- **Capturas:** `frontend/test-results/admin-home-escritorio.png` y `admin-home-movil.png` (generadas por la prueba, no versionadas). Revisión visual manual: correcta en escritorio. En móvil, la barra superior de `TopBar` (componente no modificado) queda ajustada y el botón «SALIR» se corta a la derecha: pendiente de revisar en `TopBar`.
- **Dependencias del PR de Codex:** contrato de errores CSV por fila/campo (Bloque D.5); contrato de errores de factura por campo (D.6). Ninguno consumido todavía.
- **Pendientes y riesgos:** comparación visual con Figma (bloqueada por falta de referencia); validación en dispositivo físico; pruebas con datos reales; rama `feat/frontend-uxui` no creada (ver alcance); PR a `main` pendiente de decisión del dueño; no hay merge ni despliegue.
- **Bitácora:** lectura de contexto y Git; instalación `npm ci`; línea base (tsc, lint, 272 pruebas); implementación en commits `1b260262`, `16d38565`, `f93787af`, `46a6c93a`, `ee905f01`; ajuste de arneses de prueba existentes (devoluciones, operaciones, POS) para el nuevo hook sin debilitar sus aserciones.
- **Sesión 2026-10-15 (PR #161, rama `claude/modest-galileo-693672`):**
  - **Fase 1 (sincronización con `main`):** fusión de `origin/main` (`899ed36e`) con #160 y #163. Único conflicto: este documento, resuelto conservando ambas secciones. Código sin conflictos.
  - **Fase 2 (importación de inventario):** `ImportarProductosModal.tsx` reescrito sobre `POST /productos/importacion` (`2cf8c1ca`). Lógica pura en `frontend/src/utils/importacionProductos.ts`. Envío único del archivo completo; `solicitudId` UUID v4 reutilizado en reintentos mientras el archivo y las opciones no cambian; celda de precio vacía = no informado (nunca 0); BODEGUERO no envía precios (aviso); casilla de aprobación solo ADMIN; vista previa por fila, errores de campo y nombres parecidos como aviso; confirmación explícita; manejo de 400, 403 y 409. Retirado el bucle `POST`/`PUT` por fila.
  - **Fase 6 (parcial):** botón SALIR de `TopBar` ya no se corta en 390 px (fila con wrap, nombre con elipsis). Verificado solo por la suite Playwright existente; falta revisión visual en dispositivo.
  - **Pruebas (evidencia):** `tsc -b` sin errores; oxlint sin errores (solo avisos previos); frontend unitarias **305/305** (incluye `importacion-productos.test.mjs` 16 casos nuevos y flujos del modal en `operaciones.test.mjs` y `unidades-csv.test.mjs` actualizados al contrato nuevo, justificado por el cambio de contrato); backend build correcto; backend unitarias **446/446**; **integración PostgreSQL 16 real** `importacion-productos.postgres.integration.ts` **18/18** (ejecutada como usuario `ubuntu` con `PG_BIN=/usr/lib/postgresql/16/bin`, clúster desechable); Playwright **146/146** con `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome` (el proyecto pide Chromium 1243, no instalado en el entorno).
  - **Límites de esta sesión:** la pantalla de importación no se probó contra backend en navegador real (solo arnés VM y pruebas HTTP del backend); la vista previa de BODEGUERO no ve productos inactivos (`GET /productos` solo devuelve activos a no ADMIN; el servidor decide y lo informa en la respuesta); los mensajes de error de `importacionProductos.ts` están en español fijo, sin i18n; no hubo comparación con Figma (referencia inexistente).
  - **Integración con `main` a00b18d1 (PR #162) — commit `a97f9792`:** único conflicto documental resuelto conservando las tres secciones; código sin conflictos; sin cambios de lockfiles, esquema ni migraciones. Verificado: `tsc` 0; lint sin errores; frontend unitarias 312/312; backend build y unitarias 446/446; integración PostgreSQL 16 completa 934/935 (1 omitida, prueba de navegador opt-in); Playwright simulado 146/146.
  - **Pendientes reales:** revisión visual en 390 px y dispositivo físico; mensajes de error i18n; errores CSV por fila/campo y errores de factura por campo (contratos de Codex, D.5/D.6); decisión de negocio sobre `aprobarPrecios` y vencimiento de crédito (auditoría backend §7); productos ya importados con L.0.00 (requieren aprobación de ADMIN); PR no fusionado: merge pendiente de autorización.

## Preparación del piloto — actualización exclusiva de PR #162 (NEXUS, 2026-10-14, America/Tegucigalpa)

- **Base y rama:** `fix/pilot-readiness` integra main `be1a7fe7` en `a3119f57`; conserva por ascendencia los merges #160 y #163. [PR único #162](https://github.com/Nelosama/FerreSystem/pull/162). No se cambian main, PR #161, esquema ni migraciones. Diferencial funcional de `backend/src`/`frontend/src` frente a main vacío.
- **Implementado/conservado:** retención Restic solo de copias restauradas/verificadas, confirmación de metadata al etiquetar, snapshot común para conteos y dump, TLS/CA, rechazo de checksum inválido y limpieza de clústeres aislados. `54805260` y `fea16272` amplían recuperación HTTP real con sesión anterior a la caída, aislamiento de empresa, escritura auditada, permisos y revocación de usuario, soporte real de solo lectura/finalización/auditoría después de recuperar PostgreSQL.
- **Resultados de esta actualización:** backend 446/446; frontend 280/280; scripts 48/48; Python 10/10; PostgreSQL 935/935 (58 archivos, navegador opt-in, 0 omitidas); HTTP recuperación 6/6; Playwright simulado 143/143; reales escritorio y configuración móvil 140 aprobadas/10 omitidas/0 fallos cada uno. Restic 0.18: cuatro respaldos/restauraciones y dos fallos deliberados, dos copias verificadas retenidas, snapshot consistente. Simulacro 14/14 y actualización/reversión 24/24; builds/lint/guard aprobados.
- **Evidencia vigente:** [PILOT_READINESS_PR162_20261014.md](PILOT_READINESS_PR162_20261014.md), [logs completos con SHA-256](evidencias/pr162-20261014/SHA256SUMS). La evidencia de 2026-10-13 se conserva como histórica. SHA final, checks del HEAD y recomendación definitiva se publican en #162 tras el commit documental; marcar listo solo con ambos workflows aprobados, sin fusionarlo.
- **Pendientes concretos:** destino Restic externo/custodia/alertas; importador CSV y contrato de crédito para Claude (#161), rutas lazy garantizadas offline en App/service worker; auditoría real y FK compuestas propuestas (la prueba reproduce referencias SQL cruzadas en productos_proveedores); aceptación física/Safari/UPS/impresión y respaldo de datos reales. Contingencia operativa sigue apagada. Ver evidencias y contratos exactos en el informe; no se certifica producción ni el candidato conjunto con #161.
- **Bitácora:** integración con único conflicto documental, conservando ambas bitácoras; dependencias por lockfiles y Prisma regenerado; suites completas, restauraciones y recuperaciones reales en bases temporales; ampliación de pruebas de autenticación/soporte con AppModule; frontend funcional e imágenes de #161 intactos. Sin merge del PR, despliegue, datos reales ni migraciones productivas.

---

## Administración — soporte remoto, usuarios y sucursales (2026-10-13, rama `fix/auditoria-admin`, [PR #160](https://github.com/Nelosama/FerreSystem/pull/160), integrado en main el 2026-10-14)

- **Informe completo:** [ADMIN_AUDITORIA_CORRECCIONES_20261013.md](ADMIN_AUDITORIA_CORRECCIONES_20261013.md) (hallazgos, causas raíz, matriz de permisos, riesgos).
- **Soporte remoto:** la ruta `POST /api/admin/support/token` sí existía. El 404 venía de IDs ficticios enviados por el modal, con usuarios hardcodeados. Corregido: `GET /admin/tenants/:id/usuarios` (solo SUPER_ADMIN, solo activos); `POST /admin/support/finalizar` revoca el `sid` y audita `SOPORTE_FINALIZAR`; `GET /admin/soporte/trazas` da trazabilidad por empresa. `JwtStrategy` expone `sid` (antes no llegaba, así que la revocación no funcionaba). Historial y fin de sesión ya no usan `localStorage`. Código: `super-admin/super-admin.service.ts`, `super-admin.controller.ts`, `common/decorators/soporte-solo-lectura.decorator.ts`, `common/interceptors/support-audit.interceptor.ts`, `frontend/src/pages/SuperAdminPage.tsx`, `frontend/src/context/TenantContext.tsx`.
- **Usuarios:** sin borrado físico. `DELETE /usuarios/:id` desactiva (idempotente); reactivar con `PUT {activo:true}`. Auditoría `USUARIO_DESACTIVAR`/`USUARIO_REACTIVAR` con responsable. Un administrador no puede desactivarse a sí mismo. Último administrador protegido (probado con concurrencia en PostgreSQL). Código: `usuarios/usuarios.service.ts`, `frontend/src/pages/UsuariosPage.tsx`.
- **Sucursales:** **no existe modelo de sucursal** en `schema.prisma`. No se implementó activación, desactivación ni eliminación (bloqueado por producto y por migración NEXUS). Se retiraron datos inventados: selector fijo en Usuarios, "sucursales conectadas" (`sucursalesCount || 1`) y badges por empresa. Pendiente: `TopBar.tsx` muestra "Sucursal Centro (Principal)" como respaldo y `TransferenciasPage.tsx` tiene sucursales fijas (módulo oculto); ambos fuera del alcance permitido.
- **Migraciones:** ninguna. No se tocó `schema.prisma`.
- **Pruebas (ejecutadas):** backend unitarias **407/407** (43 archivos); integración PostgreSQL 16 temporal como usuario sin privilegios: `admin-usuarios-soporte.postgres.integration.ts` **8/8** (tres ejecuciones), `suite completa de integración PostgreSQL 56 archivos, **912 aprobadas, 1 omitida** (prueba de navegador condicionada ya existente), tras la última corrección; `ventas` 46/46 tras ajustar una aserción (la autoprotección se evalúa antes que el último administrador; ambas rechazan); frontend **273/273**; `tsc -b` y lint sin errores (avisos previos). Nuevas: `super-admin/soporte-sesiones.http.spec.ts` (12), `usuarios/usuarios.service.spec.ts` (9), `usuarios/usuarios.http.spec.ts` (matriz de roles, 9).
- **Límites:** sin pruebas E2E de navegador para estas pantallas; sin despliegue ni verificación de Render/Vercel/Supabase; el riesgo de token de soporte es de ≤15 min si falla la red al finalizar.
- **Pendientes de decisión:** modelo de sucursales (producto + NEXUS); eliminación lógica distinta de la desactivación (`eliminado_en`, migración aditiva, NEXUS); revisión humana del PR antes de cualquier merge.
- **Estado actual:** #160 fusionado en main `be1a7fe7` y conservado en #162; las cifras siguientes son la evidencia de su sesión original.
- **Bitácora:** revisión del informe y de las instrucciones; hallazgo del 404 y de los datos hardcodeados; cambios de backend y frontend en tres commits; pruebas HTTP y PostgreSQL; una aserción existente ajustada con evidencia; PR #160 abierto sin merge.

---

## Candidato del cliente — integración autorizada de #153/#155/#156/#157 (2026-10-12)

- **Rama:** `nexus/candidato-cliente-integrado`; [PR #158 en borrador](https://github.com/Nelosama/FerreSystem/pull/158); código `89a70ccf`. Integra por ascendencia #153 `95144a17`, #155 `85e4ff88`, #156 `406c57e2` y #157 `21b1eea5`. Esas ramas y `main` no fueron modificadas. Limpieza de ramas fuera de alcance. Informe vigente: [CANDIDATO_CLIENTE_INTEGRADO.md](CANDIDATO_CLIENTE_INTEGRADO.md).
- **Funcionando:** importador y plantillas de seis columnas, doce unidades sin convertir cantidades, validador estricto único (entrada documental reutiliza el del backend), protecciones Vercel combinadas. ADMIN fija costo y venta en la pantalla existente; la primera aprobación inicializa vigente ausente/cero con el mismo núcleo seguro y auditoría, en una transacción, sin stock/CxP. Costo inicial positivo obligatorio; no se añade módulo ni carga masiva de precios.
- **Pruebas de esta sesión:** PostgreSQL real 12 archivos: 245 aprobadas/1 omitida/0 fallos; E2E piloto y precios con backend/PostgreSQL/Chromium reales 12/12; backend 377/377, frontend 272/272, scripts 42/42, Python 10/10, entrada documental 3/3, Vercel 5/5; compilaciones correctas; guard 0 migraciones nuevas. Ensayo de liberación/restauración 24/24 y respaldo simulado conservado. Una prueba PostgreSQL de navegador condicionada se omitió; el E2E real del piloto sí se ejecutó.
- **Pendientes concretos de producción:** acceso/configuración de Render/Supabase/Vercel ausente en este ejecutor; comprobación de base real solo lectura y respaldo nuevo verificado preservando los anteriores; autorización del dueño para merge del candidato a main y migraciones pendientes. Publicación del candidato no autoriza esas acciones. Contingencia apagada en el piloto; no se afirma restauración de un respaldo real ni aceptación en equipos del cliente.
- **Bitácora:** integración local de ramas en rama nueva; conflictos de contexto, plantilla CSV y protecciones resueltos conservando aportes; inicialización conectada a la aprobación ADMIN existente; dos regresiones nuevas de precios; wrapper de validación único; comprobaciones focalizadas; E2E real; ensayo con histórico, copia/restauración y reversión. Ruta absoluta de bcrypt y soporte de usuario sin root corregidos en herramientas de ensayo; scripts repetidos tras una compilación concurrente que limpiaba dist. No hubo auditoría general, eliminación de ramas, merge de GitHub, despliegue ni migraciones productivas.

---

## Inventario inicial seguro — implementación y compatibilidad del candidato (2026-10-12)

- **Base/rama:** `origin/main` `7ccfad25`, `fix/inventario-inicial-seguro`, código `8b47eb80`; [PR #157](https://github.com/Nelosama/FerreSystem/pull/157) independiente en borrador. #153 `95144a17` y #155 `85e4ff88` conservados; #156 revisado en `59de0589` avanzó externamente a `406c57e2` al cierre (CSV v2 sin precios). No se escribió en ninguna de esas ramas. Sin merge, despliegue, migraciones productivas ni carga real. Informe y procedimiento: [INVENTARIO_INICIAL_SEGURO.md](INVENTARIO_INICIAL_SEGURO.md).
- **Implementado:** `POST /api/productos/:id/costo-inicial`, solo ADMIN por guard y servicio; costo positivo, motivo, UUID de reintento y versión obligatorios; solo vigente nulo/cero y sin recepción/historial de compra. Escribe costo comercial/vigente y versión, con auditoría atómica `COSTO_INICIALIZAR`; no mueve inventario ni crea CxP. No altera precio de venta/aprobación. La compra posterior vuelve a fijar el costo.
- **CSV:** importador alineado con las doce unidades del inventario, sin conversiones; plantilla descargable vacía. Validador `backend/scripts/validar-inventario.py --estricto` bloquea existencias no cero y precios cero salvo excepciones independientes con motivo declarado de ADMIN. Perfil `maestro` (ocho columnas) y `preproduccion` (seis, rechaza precios que el candidato ignoraría); la herramienta offline no autentica a ADMIN. No usar el validador original de #156 para certificar el candidato.
- **Revisión de #156:** el candidato ya inicializa el vigente en el alta y lo cambia en Precios y aprobación antes de recibir; sus CSV no importan precios. #156 describe otra base y sus instrucciones requieren el complemento del informe. La orden crea CxP y la recepción suma stock; no simular ninguna de ellas para fijar costo.
- **Pruebas nuevas:** costo inicial HTTP/JWT + PostgreSQL real 23/23, con permisos, aislamiento, auditoría/rollback, reintentos, concurrencia y recepción posterior; Python 10/10; frontend cinco casos nuevos, con handlers del modal y transporte simulado.
- **Regresión de esta sesión (PostgreSQL 17.11 local):** independiente 5 archivos, 140 aprobadas/1 omitida/0 fallos; integración local #155 + código en `ebc9fdeb`, 12 archivos, 243 aprobadas/1 omitida/0 fallos. La omitida es Chromium condicionado en ciclo-ventas. No se ejecutó navegador. Backend unitarias 329/329 (independiente), 377/377 (integración), scripts de integración 42/42; frontend 190/190 (independiente), 272/272 (integración); compilaciones correctas. Guard de integración: 0 migraciones nuevas. Sin cambios en operaciones/ventas/entregas/POS/esquema.
- **Publicación:** exclusión de Vercel limitada a `fix/inventario-inicial-seguro` para impedir previews Git de esta rama. Al integrar, conservar además la exclusión `nexus/*` del candidato; ver el informe.
- **Integración:** una rama nueva desde #155; conflicto de plantilla resuelto conservando los seis encabezados del candidato y solo `headers.join(',') + '\n'`. #156 permanece documental e independiente. Repetir pruebas sobre el SHA final; reconciliar este contexto sin eliminar otras bitácoras.
- **Pendientes reales:** revisiones y bloqueos de liberación de #153/#155, respaldo y estado de bases reales, claves por entorno, validación en equipo físico y aceptación del cliente. API de inicialización por producto sin UI ni carga masiva nueva; revisión previa de costos/unidades por ADMIN. No hay autorización de producción ni certificación de CI remota.
- **Bitácora:** fetch y revisión de los SHA por Git/connector; comparación de importadores, costo y aprobación; implementación en rama desde main; PostgreSQL local sin privilegios; pruebas de la rama y copia aislada de #155; conflicto de plantilla resuelto solo en esa copia; documentación, riesgos y procedimiento de integración. Fallos de preparación Prisma/API URL y harness documentados y corregidos.

---

## Esquema Prisma / PostgreSQL — conciliación de deriva (NEXUS, 2026-10-10)

- **Identidad y límites:** [docs/agentes/NEXUS.md](agentes/NEXUS.md). Informe completo, causa raíz, riesgos y GO/NO-GO: [DIAGNOSTICO_ESQUEMA_NEXUS_20261010.md](DIAGNOSTICO_ESQUEMA_NEXUS_20261010.md).
- **Base comprobada:** `origin/main` `7ccfad25`. Rama de trabajo `claude/focused-franklin-avfmae`, borrador de PR hacia `main`. Sin merge, sin despliegue, sin conexión a producción.
- **Deriva medida** (`prisma migrate diff` entre base reconstruida solo con migraciones y `schema.prisma`): **219 líneas en `main`**, la cifra de la misión. Contiene 10 tablas con datos sin modelo (`garantias`, `apartados`, `transferencias`, `listas_precio`, `auditoria_soporte`, etc.), 4 enums, la columna `clientes.lista_precio_id`, 9 FK sin relación Prisma, 11 FK con acción `ON UPDATE` distinta y 9 `id` con default de base. #129 y #137 tienen 255 líneas; #138 tiene 219.
- **Corrección de esta rama (solo modelo):** modelos y relaciones que faltaban en `backend/prisma/schema.prisma`, acciones y defaults alineados con la base, sin migraciones nuevas. Diff resultante: **vacío**. No se elimina ninguna tabla, columna ni dato.
- **Pruebas:** `prisma validate` y `generate` correctos; `tsc` build sin errores; unitarias **329/329**; integración PostgreSQL **17 archivos, 319/319 pasan, 1 omitida** (prueba de navegador condicionada por `REAL_SETTINGS_BROWSER`, no relacionada). Nueva `backend/test/esquema-deriva.postgres.integration.ts` (3/3): falla con el esquema de `main` (mutación verificada, esquema restaurado).
- **Límites de la evidencia:** PostgreSQL 16 temporal con base vacía. No hay datos reales ni se consultó producción; el conteo de filas 0 en tablas históricas no describe producción.
- **Riesgos abiertos:** (R1) comprobación de deriva de solo lectura contra producción, pendiente del responsable; (R2) conflicto de texto con #138 y con #129 (2 bloques en `schema.prisma` en cada caso, validado por simulación): integrar #138 primero y rebasar esta rama; (R3) `auditoria_soporte` (SEC-012) requiere decisión de conservación con CENTINELA; (R4) `listas_precio` y `clientes.lista_precio_id` sin uso en backend, decisión de negocio pendiente; (R5) sin prueba de aislamiento multi-tenant para las tablas históricas.
- **Integración entre PR (NEXUS, segunda fase):** [INTEGRACION_ESQUEMA_NEXUS_20261010.md](INTEGRACION_ESQUEMA_NEXUS_20261010.md). Rama local temporal `nexus/integracion-temp` (no publicada) con #139, #129, #130, #131, #134, #135, #136, #141 y, de #140, solo esquema y migración. Esquema combinado de 18 migraciones: `migrate deploy`, `validate`, `generate` y `tsc` correctos y `migrate diff` **vacío**; #141 solo: 13 migraciones, diff vacío. Backend unitarias 357/357, integración 468 pasan / 2 fallan / 1 omitida, frontend 236/236. Los 2 fallos (`seguridad-fase2`) se deben a #134 (KARDEX), que quita `costo_unitario` de la búsqueda de ventas para todos los roles; sin #134 la prueba pasa 16/16. Conflicto de código #140↔#134 (10 archivos) sin resolver: es de KARDEX.
- **Rama experimental (tercera fase):** `nexus/integracion-temp`, documentada en [INTEGRACION_EXPERIMENTAL_NEXUS_20261010.md](INTEGRACION_EXPERIMENTAL_NEXUS_20261010.md) (commits exactos por agente, cadena de 20 migraciones, conflictos, protección de despliegue). No se fusiona, no se despliega, no ejecuta migraciones contra Supabase. Incorpora #142 (BALANCE; trae `20261013000000_balance_referencia_pagos` y también `20261014000000_cliente_plazo_credito`). #143 (FORJA) no se incorpora: depende del código de #140. Esquema combinado: `migrate deploy`, `validate`, `generate`, `tsc` correctos y `migrate diff` vacío. Fallos conocidos y ajenos al esquema: 2 de `seguridad-fase2` (#134) y 3 unitarias + 4 de integración de `compras` (regla de referencia de #142).
- **Rama experimental, actualización 2:** incorpora la consolidación de KARDEX (`f44ec886`, sustituye la combinación parcial de #134/#140), la cabeza nueva de BALANCE (`3ee6f4e4`) y, de FORJA #143, solo su commit propio `db807c2d`. 20 migraciones, `migrate diff` vacío. Fallos de integración: 24 → 0 con 517 pasan y 1 omitida; E2E reales 69/0/5; unitarias 366 y 245. Tres commits de NEXUS en código ajeno quedan **pendientes de confirmación** y son reversibles: `55735b24` (guarda de costo manual por `ultimaCompraAt`, FORJA+KARDEX), `429ab117` (búsqueda de ventas con costo solo para ADMIN, KARDEX) y `a7b7d012` (solo pruebas). Detalle en [INTEGRACION_EXPERIMENTAL_NEXUS_20261010.md](INTEGRACION_EXPERIMENTAL_NEXUS_20261010.md). Matriz para CENTINELA: [MATRIZ_TENANT_TABLAS_CRITICAS_NEXUS_20261010.md](MATRIZ_TENANT_TABLAS_CRITICAS_NEXUS_20261010.md).
- **Propuesta multi-tenant:** [PROPUESTA_FK_COMPUESTAS_TENANT_NEXUS_20261010.md](PROPUESTA_FK_COMPUESTAS_TENANT_NEXUS_20261010.md). Piloto en `backend/prisma/propuestas/tenant-fk-compuestas/` (fuera de `prisma/migrations`), validado con `tenant-fk-propuesta.postgres.integration.ts`. Sin migración real.
- **Producción solo lectura:** [VERIFICACION_PRODUCCION_SOLO_LECTURA_NEXUS.md](VERIFICACION_PRODUCCION_SOLO_LECTURA_NEXUS.md). No ejecutada. El diff vacío en PostgreSQL temporal no valida producción.
- **Tenant en base de datos:** no existe ninguna FK compuesta con `tenant_id`; la base acepta referencias entre empresas (reproducido en `productos_proveedores`). Auditoría de solo lectura de 48 comprobaciones: `backend/scripts/auditoria-tenant-cruzado-lectura.sql`. Lista de CENTINELA en `CENTINELA_FK_COMPUESTAS_PARA_NEXUS_20261010.md` (rama #139). Sin migración escrita: requiere auditoría de producción y aprobación.
- **Pendientes antes de integrar:** diff de solo lectura en producción; revisión de CENTINELA; orden de integración con #138; decisión sobre tablas históricas. Sin migración que aplicar.
- **Bitácora:** replicación de `main` con 13 migraciones en PostgreSQL 16 temporal; diff de `main`, #129, #137 y #138; clasificación; modelos y relaciones; prueba nueva con mutación; simulación de merge con #138 y #129; informe y docs de agente. Pruebas con `nobody` (sin root) como el resto de integración.
## Fase funcional de módulos administrativos (2026-10-10, PR #130 y #131, sin merge)

- **Base:** `claude/integracion-pos-offline-p1` (integra #127 y #128, según #129). No se modificó #129 ni `main`. El POS offline no se tocó.
- **Terminado:** garantías alineadas con el backend (VENDEDOR 403) y responsables por nombre en el listado (#130); proveedor preferido sugerido en compras, reportes con base e ISV separados, guardia de módulos pendientes y matriz QA (#131).
- **Pruebas:** integración PostgreSQL 21 archivos, 367 aprobadas, 1 omitida; backend unitarias 345/345; frontend unitarias 227/227; Playwright 119/119.
- **Bloqueado por decisión del dueño:** reclamos de garantía y comprobantes; comprobante de devolución; corrección auditada de cierres; precedencia de listas de precio; apartados; pedidos especiales; comisiones; idioma por empresa (diseño en la matriz).
- **Bloqueado por dependencia:** transferencias y existencias por sucursal, sin modelo de sucursal.
- **Detalle y decisiones:** `docs/FASE_FUNCIONAL_MODULOS_ADMIN_20261010.md`.
## Auditoría QA independiente del ciclo de venta (2026-10-10)

- **Base y rama:** `origin/claude/integracion-pos-offline-p1` `58941e5d` (head de PR #129). Trabajo en `claude/hopeful-franklin-hb3n48` creado desde esa base; PR independiente hacia la misma base. Sin merge, despliegue ni migraciones productivas.
- **Informe completo:** [QA_CICLO_VENTA_20261010.md](QA_CICLO_VENTA_20261010.md), con matriz PASS/FAIL/PENDIENTE, defectos por severidad y evidencia.
- **Suite:** `frontend/e2e-real/qa-ciclo-venta.spec.ts` sobre backend NestJS real y PostgreSQL 16 temporal (`e2e-real/run.sh`), sin mocks. 38 pruebas: 32 PASS, 1 defecto confirmado DEF-02 (`test.fail`, fallo esperado) y 5 PENDIENTE (`test.skip`).
- **Resultados:** suite E2E real completa `62 PASS · 5 PENDIENTE · 0 FAIL no esperado`; línea base previa 29/29; `tsc --noEmit` del archivo nuevo sin errores.
- **Defecto DEF-02 (media):** `POST /ventas` acepta venta sin `solicitudId` (`backend/src/ventas/dto/create-venta.dto.ts:31-34`, `@IsOptional`). Un reintento sin clave crea otra venta. La interfaz sí envía la clave. Corrección propuesta, no implementada: hacerla obligatoria tras verificar a los llamadores.
- **Prueba inestable PR-01 (baja, de prueba):** `contingencia-real.spec.ts` prueba 11 falló una vez de cuatro (`PENDIENTE` esperado, `ENVIANDO` recibido); aislada pasa 14/14 dos veces. Se ejecuta antes que la auditoría. Corrección propuesta: `expect.poll`.
- **Pendientes de producto (no son fallos):** cálculo de vuelto en POS de contado (anunciado en `modulesCatalog.ts`, no en los requisitos); referencia de autorización de datáfono; canal web para cliente final (alcance sin confirmar); semántica de entrega de ventas en línea, automática o manual (decisión abierta en `POS_PILOTO_QA_FINAL.md` §7); reporte por cajero; respuesta tardía del servidor en POS; venta offline de tarjeta o crédito (bloqueada por diseño).
- **Verificado por prueba:** ISV 15 %; reserva y entrega de venta en línea; abonos idempotentes con tope de saldo; descuento con tope y permiso; precio, total e ISV del cliente rechazados o ignorados; aislamiento entre empresas por API; sesión vencida y revocada; dos cajeros por el último producto; doble clic y pérdida de respuesta en el POS; abono con doble clic; cierre de caja con sobrante, nota obligatoria e idempotencia; resumen por método y día solo para administrador.
- **Parciales:** faltante de caja como caso independiente; rango de varios días en reportes; cobro a crédito, cotización convertida y tarjeta desde la interfaz.
- **Límites:** sandbox con Node 22.22.0 (el frontend declara `>= 24`); sin CI de GitHub verificada; sin datáfono físico ni corte de red real; concurrencia con dos sesiones HTTP, no dos navegadores; descuento de stock offline no cubierto.
- **Bitácora:** lectura de este documento y del protocolo; comprobación de rama y PR #129; rama creada desde la base; dependencias instaladas desde lockfile; línea base E2E real 29/29; suite creada y ajustada (preparación idempotente tras reinicio de worker, flujo código+Enter del POS, selector del abono, aserciones de pérdida de respuesta); ejecuciones aisladas y completa; informe y actualización de este documento.

---

## Correcciones CENTINELA D1/D3/R1 (ATLAS, 2026-10-10, rama `claude/atlas-correcciones-centinela`, base `nexus/integracion-temp` @ `e8b75ae6`)
Detalle y pruebas en `docs/CENTINELA_CORRECCIONES_D1_D3_R1_ATLAS.md`. D1: entregar solo ADMIN/BODEGUERO (HTTP y servicio). R1: `GET /operaciones/entregas` filtra por rol (CAJERO solo lo suyo). D3: identificador interno de solicitudes derivado por empresa (`idSolicitud` en `operaciones/ledger.ts`); contingencia (`dispositivos_pos`, `operaciones_contingencia`) queda fuera a propósito (riesgo residual documentado). Sin merge, despliegue ni migración. Falla preexistente en la base: prueba «Chromium real: conversión por transferencia…» de `ciclo-ventas`.

## Correcciones finales #148 (ATLAS, 2026-10-11, rama `claude/atlas-correcciones-finales-148`)
Detalle en `docs/ATLAS_CORRECCIONES_FINALES_148.md`: D-01 (normalización previa `propuestas/entregas-148/00_normalizar_historico_previo.sql`; la migración 20261012 queda inmutable), D-02 (reversión con respaldo `03_rollback_con_respaldo.sql`), DEF-04 (propiedad de la ventana offline), DEF-01 integrado (GUARDIAN), R-01 (migración solo-datos `20261015000000_contingencia_revocar_ventanas_anteriores`; rechazo = `REVISION` + conflicto DURO), R-02 (conciliación de efectivo al cerrar), DEF-03 (`solicitudId` obligatorio), D-03 evaluado sin cambio. Corrección de CI del PR #150: control de migraciones (migración publicada restaurada, sin DROP) y selector Playwright de «Tornillo 2 pulgadas». Pendiente: nueva validación independiente de FARO y CENTINELA; sin merge ni despliegue; no se pudo verificar ninguna base persistente.

## Integración temporal #144 + #145 (ATLAS, 2026-10-11, rama `claude/atlas-integracion-144-145`)
Detalle en `docs/ATLAS_INTEGRACION_144_145.md`: 11 conflictos resueltos a mano, reglas de entrega y consulta unificadas (ADMIN/BODEGUERO entregan; CAJERO solo ve lo suyo; VENDEDOR sin acceso; entrega inmediata del POS solo ADMIN/BODEGUERO), P3 (ids internos etiquetados) y P2 (contingencia por empresa) corregidos, claves compuestas modeladas en Prisma, parche de Chromium de CENTINELA. Pendiente: revalidación independiente de CENTINELA y revisión de NEXUS; sin merge ni despliegue.

## Cobro y entrega — implementación (ATLAS, 2026-10-10, rama `claude/atlas-cobro-entrega`, base `claude/integracion-pos-offline-p1`)

**Estado:** código funcionando y probado en PostgreSQL 16 real; **sin merge, sin despliegue, sin migración productiva**. Diseño base: `docs/POS_ENTREGA_DISENO_TECNICO.md` (rev. 3, `c5fe4982`).

- **Migración aditiva** `backend/prisma/migrations/20261012000000_entrega_eventos_y_cantidades`: contadores por línea (`cantidad_preparada/entregada/devuelta_reingresada/devuelta_sin_reingreso/cancelada`), `modo_entrega` (`MOSTRADOR|BODEGA|SIN_INVENTARIO`), `tenant_id` en `detalles_venta`, tablas `entregas_eventos` y `entregas_eventos_lineas` (solo inserción, `UNIQUE(tenant_id, solicitud_id)`, huella SHA-256), FK compuestas por tenant, CHECK de invariantes. Backfill probado con ventas legadas (`test/migrations.postgres.integration.ts`).
- **Cobro:** `ventas.service.ts` acepta `modoEntrega` por línea. MOSTRADOR entrega y descuenta al cobrar; BODEGA reserva (por defecto, como antes); sin inventario no mueve stock. Huella canónica en `common/huella-solicitud.ts`: la misma `solicitudId` con contenido distinto devuelve `SOLICITUD_REUTILIZADA`.
- **Entregas:** módulo `backend/src/entregas/` (`GET /entregas/pendientes`, `GET /entregas/ventas/:id`, `POST …/entregas|preparacion|liberaciones`). Entrega parcial con receptor obligatorio, actor ADMIN/BODEGUERO, descuento exactamente una vez (UPDATE condicionado + evento idempotente). `POST /operaciones/ventas/:id/entregar` ahora exige `solicitudId` y `receptorNombre` y delega al mismo núcleo; sobre venta sin entrega pendiente responde 409.
- **Devoluciones:** por línea sobre lo realmente entregado; INVENTARIO reingresa, DAÑADO/PROVEEDOR no reingresan, NO_ENTREGADO libera reserva. Motivo no vacío (el mínimo de 10 caracteres solo rige en liberación explícita).
- **Contingencia:** el catálogo solo incluye productos activos con precio de venta > 0 (contrato `precioAprobado` con KARDEX); al sincronizar se revalida precio y se rechaza de forma permanente (`IMPORTE_INVALIDO`, `PRODUCTO_SIN_PRECIO_APROBADO`) sin crear ventas de importe cero; la venta local queda en revisión.
- **Interfaz:** POS con «Procesar Venta» (entrega en mostrador) y «Cobrar y dejar en bodega»; nueva `EntregasPage` en `/entregas` (cantidades vendidas/entregadas/pendientes, entrega parcial, receptor, solicitud estable en reintentos); el catálogo offline del cliente descarta precios ≤ 0.
- **Pruebas (2026-10-10):** backend unitarias 356/356; integración PostgreSQL 429/429 (incluye `cobro-entrega.postgres.integration.ts` 51 casos, backfill y Chromium real); frontend `npm test` 232/232; Playwright simulado 131/131 (incluye `e2e/entregas-simulado.spec.ts`).
- **Desviaciones del diseño:** `DEFAULT 'BODEGA'` conservado en `modo_entrega`; devoluciones unificadas en el endpoint existente; sin endpoints de devolución nuevos.
- **Pendiente real:** prueba de navegador contra backend real del botón «Cobrar y dejar en bodega» y de `EntregasPage` (solo simulado); `OperacionesPage` modo `entregas` queda sin ruta (código heredado); validación de KARDEX (movimientos), CENTINELA (permisos), BALANCE (efectos financieros) y NEXUS (FK compuestas fuera de Prisma) aún no recibida; P12 no implementado; no se probó contra producción.


## P1 operaciones — implementación (2026-10-10, rama `claude/p1-operaciones`)

- **Base:** `main` `7ccfad25`. Rama nueva; sin merge, sin despliegue, sin migraciones productivas. No se tocaron `POSPage.tsx`, contingencia, sincronización, service worker ni IndexedDB (trabajo del agente POS en `claude/pos-offline-*`).
- **Migración nueva (aditiva):** `backend/prisma/migrations/20261010140000_productos_proveedores` (tabla `productos_proveedores`). Modelo Prisma añadido en `schema.prisma` con relaciones inversas en `Producto` y `Proveedor`; no se reformateó el archivo. Aplicar con `prisma migrate deploy` tras copia de seguridad y autorización; **no** usar `prisma migrate dev` contra producción (drift de tablas heredadas). Las listas explícitas de migraciones de `ventas.postgres.integration.ts` y `reportes-zona-horaria.postgres.integration.ts` incluyen esta migración.

| Ítem | Estado | Commit | Evidencia |
|---|---|---|---|
| FS-14 Menú y ruta de Clientes vs. 403 | Corregido | `b5657475`, `73da8cbe` | Clientes solo ADMIN en menú y ruta; `GET /clientes/buscar` admite VENDEDOR (sin saldos ni límites). `taskNavigation.test.mjs` y `navigation-settings.spec.ts` 41/41 |
| FS-18 Auditoría de crédito de clientes | Corregido | `c4566f91` | `CLIENTE_CREDITO_EDITAR` con antes/después en la misma transacción; fallo forzado de auditoría revierte el cambio. `clientes-credito-auditoria.postgres.integration.ts` 4/4 |
| FS-10 Rubro del negocio solo Super Admin | Parcial | `f54b7542` | ADMIN recibe 403 al cambiar `configuracion.rubro`; reenviar el valor vigente sigue permitido. **Pendiente:** idioma por empresa y ocultar selector en ADMIN/CAJERO |
| Proveedores asociados a producto (alta, código, preferido, último costo) | Implementado | `6b5ae8c4`, `9c53c524` | `GET/PUT/DELETE /operaciones/productos/:id/proveedores/:proveedorId`; la recepción asocia el proveedor y guarda último costo (sube y baja) sin cambiar costo vigente ni historial. `productos-proveedores.postgres.integration.ts` 9/9; mutación (sin hook) hace fallar 4 pruebas |
| Compra al contado (D1) | Implementado | `8fab4105` | `pagoContado` en `POST /operaciones/compras`; pago en la misma transacción, sin caja (FS-09), solo ADMIN, reintento sin doble pago. `compras-contado.postgres.integration.ts` 7/7 |
| Estado de cuenta de cliente | API implementada, sin pantalla | `cb41e8dd` | `GET /operaciones/clientes/:id/estado-cuenta` (solo ADMIN): cuentas CXC, abonos, vencimiento por día de negocio y conciliación con el saldo del cliente. `estado-cuenta-cliente.postgres.integration.ts` 3/3 |
| Resumen administrativo para iPhone | Implementado | `024f4f45` | Ruta `/admin-movil` (solo ADMIN): ventas del día, cajas abiertas, existencias bajo mínimo, clientes con saldo, CxP a 7 días, solicitudes pendientes, reportes. `resumen-movil.test.mjs` 6/6; `admin-movil-simulado.spec.ts` 3/3 a 390 px (backend simulado) |
| Restricción de módulo en rutas de inventario | Corregido | `9c53c524` | Un commit anterior había desplazado `@RequiredModule('inventario')` del historial; regresión detectada por `operation-modules.http.spec.ts` |

**Segunda ronda (2026-10-10, PR #127, sin merge):**

| Ítem | Estado | Evidencia |
|---|---|---|
| Pantalla de proveedores por producto | Terminado | `frontend/src/components/ProveedoresProductoPanel.tsx`, dentro de la ficha de producto. E2E `p1-operaciones-simulado.spec.ts` (alta con código y preferido; error de inactivo) |
| Compra al contado y fuente del pago | Terminado (ADMIN) | Selector en Órdenes de compra. Fuente declarada en pantalla: fondos administrativos, **no caja**. El backend nunca descuenta caja (FS-09). E2E: payload con `pagoContado`; BODEGUERO sin selector |
| Estado de cuenta de clientes | Terminado (ADMIN) | `/estado-cuenta-clientes` + ítem de menú. Saldo, límite, conciliación, vencidas y abonos. E2E ADMIN; CAJERO y VENDEDOR sin acceso |
| Permisos del estado de cuenta y buscador | Revisado | Estado de cuenta solo ADMIN (403 a CAJERO, BODEGUERO, VENDEDOR). Buscador a VENDEDOR: conjunto exacto `codigo, creditoHabilitado, id, nombre, numeroCliente, rtn, telefono`; sin saldo, límite, correo ni dirección. Prueba PG negativa |
| Admin móvil (sin POS offline) | Terminado en su alcance | Accesos a estados de cuenta, inventario, cuentas y arqueo. Sigue sin prueba en iPhone físico |
| Compatibilidad con `claude/pos-offline-backend` | Analizada, **no integrada** | Ver bloque siguiente |

**Compatibilidad con `claude/pos-offline-backend` (no fusionada):**
- Su migración `20261011000000_pos_contingencia_offline` crea 4 tablas nuevas y hace `ALTER TABLE ventas`. No toca tablas que cambia esta rama, y su nombre no choca con `20261010140000_productos_proveedores`.
- El esquema choca **textualmente** al fusionar: ambos añaden modelos al final de `schema.prisma`. Resolución: conservar los dos bloques. Verificado en un worktree desechable; no se incorporó nada.
- Las listas explícitas de migraciones de `ventas.postgres.integration.ts` y `reportes-zona-horaria.postgres.integration.ts` también chocan. Al integrar, deben incluir **las dos** migraciones nuevas.
- `CONTEXTO_MAESTRO.md` choca al fusionar. Resolver a mano, sin borrar bloques de ninguno.
- Su migración altera `ventas`; su DBA debe revisar ambas en orden antes de `migrate deploy`.

**Regresión encontrada y corregida:** el panel nuevo llamaba `GET /operaciones/productos/:id/proveedores`, que el simulador de edición de productos no conocía. Fallaban 9 pruebas E2E. Corregido en `productos-edicion.spec.ts`.

**Pruebas ejecutadas (2026-10-10, entorno local):**
- Backend unitarias: **330/330** (`npx vitest run`).
- Integración PostgreSQL 16, cadena completa de migraciones, usuario no root: suite completa **19 archivos, 336 aprobadas, 1 omitida**, sin fallos. Ejecutada antes del último commit (`cb41e8dd`); ese archivo se verificó aparte (3/3).
- Frontend unitarias: **191/191** (`node --test test/*.test.mjs`); `tsc -b` correcto; `oxlint` sin errores en archivos tocados (avisos `set-state-in-effect` del patrón existente).
- Segunda ronda: integración PostgreSQL **20 archivos, 340 aprobadas, 1 omitida**; backend unitarias **330/330**; frontend unitarias **191/191**; Playwright Chromium **116/116** (incluye 7 E2E nuevas).
- Playwright Chromium: **109/109** tras ajustar `navigation-settings.spec.ts` (con FS-14, el grupo "Clientes y cobros" del cajero ya no aparece con un solo ítem). Las E2E usan backend simulado: validan interfaz y contrato, no persistencia.

**Clasificación de módulos (Fase 6):**
- Garantías: **parcialmente funcional** (flujo real verificado en `main` según sección de garantías; oculto en menú por `PENDING_MODULES`).
- Devoluciones y crédito: **funcional y verificado** en PostgreSQL (suites de crédito y devoluciones).
- Reportes administrativos: **funcional y verificado** en PostgreSQL (zona horaria de negocio).
- Comisiones: **bloqueado por decisión de negocio**. La pantalla usa estado en memoria, periodo fijo de marzo 2026 y no hay backend ni modelo; falta definir la base de cálculo.
- Apartados, transferencias (sin modelo de sucursal), pedidos especiales y listas de precio: **pendientes**, ocultos en menú. Transferencias además **bloqueada por sucursales**.

**Pendientes y dependencias (no tocados por no ser ámbito de este trabajo o por requerir decisión):**
1. **FS-15** venta sin vencimiento por defecto y **FS-20** límite de descuento inconsistente: dependen del POS (`POSPage.tsx`, ventas). Propuesta de integración separada para el agente POS.
2. **FS-13** recibo sin datos fiscales y rótulo de crédito: POS/recibo; mismo bloqueo.
3. **FS-16** comisiones: decisión de negocio sobre base y periodo; luego modelo y API.
4. **FS-17** sucursales ficticias en Usuarios: no hay modelo de sucursal; quitar las opciones falsas es corrección pendiente de autorización.
5. **FS-10** idioma por empresa y selector solo en configuración del Super Admin.
6. Pantalla de estado de cuenta de cliente (existe API).
7. Pantalla de proveedores por producto dentro de la ficha de producto (existe API). Sin UI.
8. Compra al contado sin selector en la pantalla de compras (existe API).
9. Hallazgos antiguos que siguen abiertos fuera de este alcance: `coberturas_garantia` no figura en las listas explícitas de migraciones de ventas y reportes.

**Riesgos:** pruebas E2E con backend simulado; el resumen móvil no se ha probado en iPhone físico; la migración requiere revisión de DBA antes de aplicarse.

---

## POS offline de contingencia (efectivo) — implementación y pruebas (2026-10-10)

- **Ramas/commits:** `claude/pos-offline-contingencia` (diseño y caracterización, `e30e9a1c`); `claude/pos-offline-backend` (esquema, migración aditiva, servicio, controlador, pruebas PostgreSQL y frontend offline: `4eacd14c` y `cd1dfaf9`). Sin merge, migración en producción ni despliegue.
- **Activación:** apagada por defecto. Requiere `POS_OFFLINE_ENABLED=true` en el entorno **y** `configuracion.contingenciaOffline.habilitada` por empresa (la activa un ADMIN). Sin ambas, el backend responde 403/409.
- **Alcance implementado (solo efectivo):** ventana de contingencia con instantánea de precios y cupo conservador (50 % de lo libre por defecto); una caja de contingencia por empresa (`dispositivosMax=1`); diario local en IndexedDB con confirmación solo tras transacción completa; correlativo local `CT-NN-NNNN` y definitivo `V-NNNNNNNN`; sincronización idempotente por UUID; conflictos en revisión sin rechazo silencioso; referencia de factura externa (no es numeración fiscal).
- **Backend:** `backend/src/contingencia/` (controlador `/contingencia/*`, servicio, DTOs). Migración `20261011000000_pos_contingencia_offline`: 4 tablas nuevas, columnas aditivas en `ventas`, trigger que impide UPDATE y DELETE de la carga recibida. `backend/src/common/dinero.ts` comparte vectores con el frontend.
- **Frontend:** `src/offline/` (db, journal, sync, ventana, money), `pages/PosContingenciaPage.tsx` (ruta `/pos-contingencia`), `pages/ContingenciaAdminPage.tsx` (ruta `/contingencia-admin`, ADMIN), `public/sw.js` (shell y recursos del build; la API nunca se cachea; sin `skipWaiting`). Se corrigió `utils/authInterceptors.ts`: un refresh sin respuesta de la API ya no borra la sesión.
- **Decisión de diseño:** la secuencia y el correlativo duplicados no se rechazan: se conservan y quedan en revisión (`SECUENCIA_DUPLICADA`).
- **Pruebas ejecutadas (2026-10-10):**
  - Backend unitarias: **344/344** (36 archivos). `tsc -p tsconfig.build.json` sin errores.
  - Backend integración PostgreSQL 16 como usuario no root, cadena completa de migraciones: `test/contingencia.postgres.integration.ts` **23/23**; suite completa **17 archivos, 339 pasan y 1 omitida** (origen de la omisión no identificado en esta sesión). Se corrigieron las listas explícitas de migraciones de `ventas` y `reportes-zona-horaria`, que ya no incluían las migraciones nuevas.
  - Frontend unitarias: **218/218** (incluye `offline-logica.test.mjs` y la caracterización). `tsc -b` y build de producción correctos. Lint sin errores (avisos del mismo tipo que ya existían).
  - E2E real con backend NestJS, PostgreSQL temporal y navegador Chromium con IndexedDB y service worker reales: `frontend/e2e-real/contingencia-real.spec.ts` **13/13** (en línea, sin conexión, reconexión, reinicio con pendientes en perfil persistente, dos pestañas, recuperación de operación "enviando", pérdida de respuesta, cambio de precio durante la desconexión, conflicto de stock aceptado por el administrador, caja cerrada, sesión vencida, panel, exportación sin credenciales). Suite `e2e-real` completa: **28/28**.
  - Suite de navegador con backend simulado: **106/106**.
- **Pruebas no realizadas (límites declarados):**
  1. Timeouts de red reales: no se simularon; solo cortes de red del navegador.
  2. Apagón eléctrico y reinicio de Windows: no ejecutados. La durabilidad de IndexedDB ante corte de energía **no está demostrada**. El protocolo está en `docs/POS_CONTINGENCIA_PROTOCOLO_APAGON.md` (estado: no ejecutado).
  3. iPhone/Safari y PWA instalada: no probados en dispositivo. El panel móvil se probó solo en viewport de escritorio.
  4. Actualización del service worker tras una versión nueva: no probada.
  5. Límite de cuota de almacenamiento lleno: no probado en navegador real.
- **Bloqueos y decisiones pendientes (no resueltos por mí):**
  - **D1 fiscal:** la leyenda y el procedimiento de comprobante de contingencia requieren aprobación del responsable fiscal antes de activar en clientes reales. El sistema no emite numeración fiscal ni CAI.
  - Límites por defecto (cupo 50 %, L 5 000 por venta, L 25 000 acumulado, vigencia 36 h) pendientes de decisión del propietario.
  - Una caja de contingencia por empresa (`dispositivosMax=1`): ampliar requiere decisión.
  - Prueba física con UPS, corte controlado y firma de resultados (sección 7 del protocolo).
- **Pendientes técnicos:** PR de revisión (borrador); coordinación con las ramas de Claude en `POSPage.tsx` (no modificado) y `ventas.service.ts` (no modificado); interfaz en inglés pendiente (textos en español).

---

## Integración QA P1 + contingencia POS (2026-10-10, rama `claude/integracion-pos-offline-p1`)

- **Estado:** integración técnicamente verificada en rama temporal; **NO aprobada para producción**. Sin merge a `main`, sin despliegue, sin migraciones productivas.
- **Base y commits:** `main` `7ccfad25`; `1deb3117` (#127 P1 operaciones, `claude/p1-operaciones`); `f281be62` (#128 contingencia, `claude/pos-offline-backend`); resolución de conflictos `2ab05cd0`; `99df299c` (costo de la ventana, timeout de sincronización, pruebas); `5c5df9bb` (asociación producto–proveedor en contingencia; mock del panel de proveedores en FS-07); `6f683331` (matriz de QA); #127 avanzó a `caa5aa15` y se integró en `a4cda7e3` (sin conflictos; mock duplicado retirado en `f2f4b44e`; `productos-edicion` 16/16 y frontend 224/224 tras la integración).
- **Conflictos resueltos:** `schema.prisma` (ambos modelos conservados, sin `prisma format`), `App.tsx` (rutas `/pos-contingencia`, `/contingencia-admin`, `/estado-cuenta-clientes`, `/admin-movil`, `/cuentas` conviven), listas de migraciones en `ventas` y `reportes-zona-horaria`, `CONTEXTO_MAESTRO.md` (dos secciones conservadas).
- **Defectos corregidos en la integración:** el costo de una venta offline se tomaba al sincronizar (ahora, el de la ventana); sincronización sin timeout (ahora 20 s por llamada); la caja no veía la decisión del administrador (`refrescarRevisiones`); 9 fallos de FS-07 por una petición del panel P1 no interceptada en la suite simulada.
- **Pruebas ejecutadas sobre `5c5df9bb`:**
  - Backend unitarias 345/345; integración PostgreSQL 16 como `nobody` 366/366 con `REAL_SETTINGS_BROWSER=1` (la prueba opt-in de Chromium real pasa 16/16). Contingencia 25/25 sobre el commit final.
  - Frontend unitarias 224/224; `tsc -b`, build y lint sin errores.
  - E2E real (`frontend/e2e-real/run.sh`, PostgreSQL temporal, API real, Chromium): 29/29; contingencia 14/14.
  - E2E con backend simulado: 118/118.
- **Lo que no se ejecutó (no declarar aprobado):** Windows (Chrome/Edge, durabilidad IndexedDB, reinicio), iPhone/Safari y PWA instalada, apagón eléctrico real (`docs/POS_CONTINGENCIA_PROTOCOLO_APAGON.md`, sin ejecutar), cuota de almacenamiento real (la prueba simulada inyecta `QuotaExceededError`), timeouts de red reales en la tienda, cámara y códigos impresos. Detalle en `docs/POS_INTEGRACION_QA_MATRIZ.md` §7.
- **Riesgos abiertos:** D1 fiscal (sin aprobación del responsable); límites por defecto (L 5 000 / L 25 000 / cupo 50 % / 36 h) pendientes de decisión; caja única por empresa (`dispositivosMax=1`); rutas nuevas sin entrada en el menú (solo por URL); textos de contingencia solo en español.
- **Pendientes:** PR de integración en borrador hacia `main` (no fusionar sin aprobación); si #127 o #128 cambian, repetir la integración desde su nuevo commit.

## CENTINELA — cierre de seguridad y protección de producción (2026-10-10, rama `claude/centinela-cierre-produccion`, sin merge)

- **Veredicto:** GO para integrar; **NO-GO para producción**.
- **Hallazgo CRITICAL:** `backend/prisma/seed.ts` tenía una credencial fija de Super Admin (presente también en el historial de git y en `main`), y el README afirmaba una guardia de producción que no existía. Corregido en código: sin claves por defecto, sin escritura en producción ni en hosts remotos sin confirmación, sin sobrescribir Super Admins. **Pendiente del dueño:** confirmar y rotar si la clave estuvo activa en algún entorno.
- **Controles de CI:** `backend/scripts/verificar-migraciones.mjs` (job `guard-base-datos`): bloquea `db push`, `migrate dev/reset`, `db seed` y `--accept-data-loss` en ejecutables; exige aprobación explícita para SQL destructivo en migraciones nuevas; hace inmutables las migraciones publicadas. Pruebas 8/8. `.github/CODEOWNERS` protege base de datos, despliegue y seguridad.
- **Deriva:** #129 no añade deriva propia tras #138; la de `main` (219 líneas) sigue abierta. Informe para el responsable de base de datos: `docs/CENTINELA_INFORME_DBA_DERIVA_20261010.md`. Evidencia regenerada y verificada por hash en `docs/evidencias/deriva-main-20261010/`.
- **TRUST_PROXY:** pendiente de prueba real en staging autorizado. Se revirtió la cabecera añadida sin verificación en `deploy/local/compose.yaml`.
- **Cierre de sesión con IndexedDB:** escenarios E1–E9 documentados (`docs/agentes/ESCENARIOS_CIERRE_SESION_INDEXEDDB.md`), no implementados. Coordinación con ATLAS y FARO pendiente: no había agentes activos. Decisión de producto pendiente sobre la propiedad de la cola (E5).
- **Identidades:** propuesta de registro en `AGENTS.md` sin reemplazar texto existente (`docs/agentes/REGISTRO_IDENTIDADES_AGENTS_PROPUESTA.md`); no aplicada.
- **Pruebas:** unitarias 357/357; scripts 21/21; build de producción sin errores. Integración PostgreSQL y E2E no repetidos en esta fase tras los cambios de seed (no afectan a los tests).
- **P0 — CI en PR de integración (2026-10-10):** el check `guard-base-datos` fallaba en #137 y #138 con `MODULE_NOT_FOUND`: el workflow se portó pero no el script. Corregido con `f7623e17` (#137) y `dd19439c` (#138), que añaden `verificar-migraciones.mjs` y su prueba sin cambios. Guard probado en local con ambas bases: correcto. **Pendiente:** confirmar el run nuevo en GitHub. La rama de ATLAS `claude/integracion-pos-offline-p1` sigue con el workflow antiguo; sin coordinación no se toca.
- **P0 — protección de ramas y checklist:** `docs/CENTINELA_PROTECCION_RAMAS_Y_CHECKLIST_20261010.md` (ruleset, checks requeridos `validate` y `guard-base-datos`, verificación con `gh api` de solo lectura, lista para Render, Vercel y Supabase). Configuración real en GitHub, Render, Vercel y Supabase **no verificada**: requiere acceso del propietario (B1–B6 del documento).
- **P0 — PR #141 (NEXUS), revisión de relaciones entre tenants:** solo cambia `schema.prisma` y añade una prueba; no añade migraciones. Las relaciones nuevas son FK de una sola columna (`apartados.cliente_id`, `garantias.venta_id`, `transferencias.usuario_id`, `cierres_comisiones.vendedor_id`, `clientes.lista_precio_id`, etc.): la base ya las tiene así, por lo que #141 **no introduce** el riesgo, pero lo deja declarado. Una FK de una columna no garantiza que ambas filas pertenezcan al mismo `tenant_id`. Riesgo real: un identificador de otra empresa aceptado por la base. Mitigación propuesta a NEXUS: FK compuestas `(tenant_id, id)` en una migración futura con revisión. No se modificó #141.
- **Pendientes P0 sin cerrar:** endpoints financieros de BALANCE (p. ej. #135) y de ATLAS (#140) respecto a roles y aislamiento, no revisados en esta fase.
- **P0 — estado final de CI (2026-10-10):** #138 `validate` y `guard-base-datos` **success**. #137 `guard-base-datos` **success**, `validate` **failure** por `frontend/e2e/contingencia-simulado.spec.ts:295`, test añadido por `1efe6146` (ATLAS) que falla también en su base `c5fe4982` sin cambios de #137 (reproducido en local). #137 y #138 pasados a **borrador**; no fusionar. Lo registrado en `mergeable_state: unstable` sugiere que `validate` no es requerido en la regla: pendiente de confirmar por el propietario.
- **P0 — contratos de ATLAS (`operaciones`, solo lectura):** `POST ventas/:id/entregar` acepta CAJERO, el contrato no; `GET entregas` muestra pedidos de todo el tenant a CAJERO, el contrato pide «sus ventas»; idempotencia de `movimientos_caja` global por id (409 confirma existencia entre empresas, P2). Comunicado a ATLAS en #129; no modificado. Sin sesión de ATLAS accesible.
- **P0 — FK compuestas para NEXUS:** lista priorizada P1/P2 en `docs/CENTINELA_FK_COMPUESTAS_PARA_NEXUS_20261010.md`. No se crean migraciones.
- **P0 — cuentas demo:** procedimiento de auditoría, rotación e invalidación de sesiones, sin ejecución, en `docs/CENTINELA_CUENTAS_DEMO_Y_SESIONES_PROCEDIMIENTO_20261010.md`.
- **Contratos de KARDEX, FORJA y BALANCE:** no encontrados en el repositorio en las ramas revisadas. Solo aparecen en `docs/POS_ENTREGA_CONTRATOS.md`, de ATLAS. Pendiente de los agentes responsables.

---

## Autenticación fase 3 — límites de intentos, sesiones revocables y rotación (2026-10-10, rama `claude/security-audit-fase-3`, [PR #133](https://github.com/Nelosama/FerreSystem/pull/133) sin merge)

- **Base:** `claude/security-audit-fase-2` (PR #132) + merge de `origin/claude/integracion-pos-offline-p1` `58941e5d`. No se modificaron PR existentes; no hay merge, despliegue ni migraciones productivas. Detalle y procedimientos: [AUTENTICACION_FASE3_SESIONES_20261010.md](AUTENTICACION_FASE3_SESIONES_20261010.md).
- **Límite de intentos:** por cuenta (5 fallos / 15 min → bloqueo 15 min) y por IP (100 / 15 min), en `intentos_login` con clave hasheada y contadores atómicos. Respuesta 429 con `Retry-After`, igual para correos existentes e inexistentes. Aplica a login de tenants y de Super Admin (`auth/login-rate-limit.ts`).
- **Proxy:** `TRUST_PROXY=1` en Render es obligatorio; sin él todos los usuarios comparten la IP del proxy y el límite por IP puede bloquear a toda la tienda.
- **Sesiones revocables:** tabla `sesiones_auth`; `sid` en access y refresh; la estrategia JWT revalida sesión, sujeto, revocación y vencimiento en cada petición. Logout revoca la sesión del cookie y del Bearer (incluye soporte). Cambio de contraseña y desactivación revocan todas las sesiones del usuario. El refresh no rota (evita romper pestañas concurrentes).
- **Transición de tokens:** en producción se rechazan por defecto; aceptarlos exige `AUTH_ACEPTAR_TOKENS_SIN_SESION=true` y `AUTH_TOKENS_SIN_SESION_HASTA` (máximo 24 h, evaluado en cada petición). Refresh previos a #132 y de #132 se rechazan: un inicio de sesión por usuario.
- **Rotación de `JWT_SECRET`:** sin doble clave; cierre planificado de sesiones (SQL en el documento) y cambio del secreto.
- **Contingencia offline:** verificado en frontend (`offline/sync.ts`) y backend: el 401 deja la operación `PENDIENTE` en IndexedDB, el logout no la borra y el UUID es idempotente. Prueba PostgreSQL del lote tras cerrar y reabrir sesión.
- **Migración nueva (requiere DBA):** `20261012000000_autenticacion_sesiones_intentos`. Aditiva: dos tablas nuevas, sin cambio de filas. Reversión: DROP de ambas tablas. Añadida también a la lista de migraciones de `test/ventas.postgres.integration.ts`, que usa una lista fija.
- **Pruebas:** `test/autenticacion-fase3.postgres.integration.ts` 25/25; unitarias 349/349 (specs de auth y super admin con mocks actualizados); integración PostgreSQL completa 24 archivos, 412 aprobadas, 1 omitida (ejecutada como usuario no root).
- **Pendientes:** limpieza de `sesiones_auth` e `intentos_login` (job); rotación de refresh con detección de reutilización (requiere ventana de gracia); logs de login con correo (R-08); confirmar `NODE_ENV=production`, `JWT_SECRET` y `TRUST_PROXY` en Render antes del despliegue.
- **Validación final de integración (2026-10-10, rama `claude/integracion-seguridad-fase3`, SHA `6fd97849`):** sobre la integración `6373692f` de #129. Unitarias backend 357/357; integración PostgreSQL 418 aprobadas (1 omitida); E2E real 29/29; E2E simulado 120/120; frontend unitarias 224/224. Transición de tokens sin sesión con fecha límite obligatoria en producción (máximo 24 h). Veredicto: **GO para integrar en la rama de integración; NO-GO para producción** hasta verificar `TRUST_PROXY` en Render y revisar la deriva de esquema preexistente de #129. Detalle: [VALIDACION_FINAL_SEGURIDAD_INTEGRACION_20261010.md](VALIDACION_FINAL_SEGURIDAD_INTEGRACION_20261010.md).
- **Coordinación:** archivos compartidos tocados: `main.ts` (trust proxy y validación), `usuarios.service.ts` (revocación), `schema.prisma` (dos modelos al final), `ventas.postgres.integration.ts` (lista de migraciones). No aparecen en #130 ni #131 al revisar sus archivos; no hubo agentes activos con los que coordinar en vivo.

---

## Auditoría de seguridad fase 2 (2026-10-10, rama `claude/security-audit-fase-2`, [PR #132](https://github.com/Nelosama/FerreSystem/pull/132) sin merge)

- **Base:** `origin/claude/integracion-pos-offline-p1` `bc0a0125` (PR #129). No se modificó #127, #128 ni #129; no hay merge, despliegue ni migraciones. Informe completo y matriz: [AUDITORIA_SEGURIDAD_FASE2_20261010.md](AUDITORIA_SEGURIDAD_FASE2_20261010.md).
- **Corregido (reproducido antes con PostgreSQL real o prueba unitaria):**
  - SEC-01 HIGH: `costo_unitario` llegaba a VENDEDOR (`GET /operaciones/ventas/buscar`) y a BODEGUERO sin `inventario.ver` (`GET /operaciones/entregas`). `common/interceptors/cashier-response.interceptor.ts` aplica ahora la regla de `canReadProductFinancials`.
  - SEC-02 MEDIUM: BODEGUERO leía `/ventas` y `/cotizaciones` (datos de clientes). `ventas.controller.ts` y `cotizaciones.controller.ts` restringen a ADMIN, CAJERO y VENDEDOR.
  - SEC-03 MEDIUM: refresh token aceptado como token de API. Refresh con `typ: 'refresh'` (`auth.service.ts`, `super-admin.service.ts`); `jwt.strategy.ts` lo rechaza.
  - SEC-04 MEDIUM: Super Admin desactivado conservaba acceso. `jwt.strategy.ts` revalida `superAdmin.activo`.
  - SEC-05 LOW: login revelaba cuenta inactiva o empresa suspendida sin contraseña correcta. `auth.service.ts` verifica la contraseña primero.
- **Verificado sin hallazgo:** aislamiento entre empresas en ventas, historial, cotizaciones y ajustes de existencias (404 o rechazo); la hipótesis de costo en `ventas.findById` y `formatCotizacion` se descartó porque remapean detalles.
- **Pruebas:** `test/seguridad-fase2.postgres.integration.ts` 16/16 (era 6 fallos reproducidos); `src/auth/auth.security.spec.ts` 4/4 (era 2 fallos). Backend unitarias 349/349. Integración PostgreSQL 22 archivos, 381 aprobadas, 1 omitida (línea base 365 aprobadas, 1 omitida). `tsc -p tsconfig.build.json` y `oxlint` limpios en archivos tocados. Ejecutar integración como usuario no root (`runuser -u nobody`) porque initdb no corre como root.
- **Ajustes de fixtures existentes:** `auth.service.spec.ts`, `super-admin.service.spec.ts` (refresh con `typ`) y `productos-security.http.spec.ts` (mock de `superAdmin`).
- **Pendientes y riesgos:** R-01 refresh tokens previos al despliegue válidos como bearer hasta 7 días (rotar `JWT_SECRET` o esperar); R-02 sin limitación de intentos en `/auth/login`; R-03 logout sin revocación (requiere `tokenVersion`); R-04 costo manual ADMIN/BODEGUERO (decisión D1); R-05 VENDEDOR ve ventas y cotizaciones de toda la empresa (decisión de negocio). Detalle en el informe.
- **Coordinación:** los archivos tocados no aparecen en #127 a #131. #131 también modifica este documento; posible conflicto de texto al integrar. Confirmar con el dueño antes de merge.
- **No verificado:** producción (Render/Supabase), respaldos y configuración real de `NODE_ENV` y `JWT_SECRET` en Render (R-09, R-10).

---
## Validación final de preproducción POS offline — PR #129 (2026-10-10)

- **Estado:** candidato técnicamente validado para **piloto controlado interno**. **NO-GO** para clientes reales hasta D1 fiscal, decisiones comerciales y pruebas físicas. Sin merge, despliegue ni migración productiva. Detalle: `docs/POS_PILOTO_QA_FINAL.md`; checklist físico no ejecutado: `docs/POS_PILOTO_CHECKLIST_FISICO.md`.
- **Procedencia:** #127 integrado hasta `caa5aa15` y #128 hasta `f281be62` (ancestros verificados en `HEAD`). Commit de esquema y prueba de flujo: ver `git log` de la rama tras esta sección.
- **Migraciones:** 15/15 aplicadas en orden sobre PostgreSQL 16 limpio, 0 fallidas. Deriva de las tablas nuevas: solo nombres de restricciones, salvo una diferencia de comportamiento corregida (`onDelete: Restrict` en `operaciones_contingencia.venta`). La deriva de `main` (~170 líneas, preexistente) obliga a usar solo `migrate deploy` tras `migrate:inspect` y respaldo.
- **Defecto corregido en esta validación:** FK `operaciones_contingencia.venta` con `SetNull` implícito frente a `RESTRICT` en la migración; detectado por `prisma migrate diff`, no por las pruebas.
- **Pruebas nuevas:** `backend/test/piloto-flujo-completo.postgres.integration.ts` (6): flujo completo proveedor → compra → recepción → costo → venta en línea y entrega → contingencia → sincronización → conciliación de inventario y caja → consulta administrativa; y pruebas negativas (permisos, revisión, otro cajero, idempotencia, aislamiento).
- **Resultados (sobre `bc0a0125` salvo indicación):** backend unitarias 345/345; integración PostgreSQL 372/372 (22 archivos, con `REAL_SETTINGS_BROWSER=1`); contingencia + piloto 31/31 tras el cambio de esquema; frontend unitarias 224/224; build con `VITE_API_URL=/api`; lint sin errores; E2E real 29/29 (14 de contingencia); simulada 118/118; respaldo worker 6/6.
- **Riesgo de negocio abierto:** la venta en línea **reserva** stock y se descuenta al entregar (`/operaciones/ventas/:id/entregar`); la venta offline descuenta **de inmediato**. Decidir el procedimiento antes del piloto.
- **No ejecutado:** Windows, Safari/iPhone, apagón real, cuota de disco real, latencia real de la tienda, restauración de respaldo con restic/pg_dump (`FS41_INTEGRATION`). No declarar aprobados.
- **Diseño de cobro y entrega, revisión 3 (ATLAS, lista para revisión cruzada, sin implementar):** huella canónica de solicitud con conflicto explícito (§3.6); regla `P' = min(P, Rr')` con demostración por inducción (§2.5–2.7); FK compuestas por tenant y tabla de eventos con `tenant_id` (§3.7, §7); devoluciones con reingreso frente a sin reingreso (§2.4, §4.3). P12 no aprobada ni implementada. Contratos KARDEX, CENTINELA, BALANCE y NEXUS **sin validar**.
- **Diseño de cobro y entrega, revisión 2 (ATLAS, sin implementar):** corrige índice único por línea (ahora identificadores de evento, idempotencia por solicitud y tope acumulado con CHECK), añade modelo de contadores e invariantes, y elimina el lenguaje de ubicación física (inventario único, P2). Contratos KARDEX, CENTINELA y BALANCE actualizados y **sin validar**.
- **Diseño de cobro y entrega (ATLAS, sin implementar):** variante B aprobada conceptualmente. Diseño técnico en `docs/POS_ENTREGA_DISENO_TECNICO.md` (flujos, estados por línea, garantías, alertas, cambios por capa, pruebas T01–T34 para FARO, decisiones P1–P11). Contratos para KARDEX, CENTINELA y BALANCE en `docs/POS_ENTREGA_CONTRATOS.md`, pendientes de validación. No se modifican ventas abiertas ni se ejecutan migraciones.
- **Identidad:** ATLAS (POS y continuidad operativa). Coordinación: KARDEX (inventario), CENTINELA (seguridad y sesiones), FARO (auditoría y QA), BALANCE (conciliaciones). Recomendación de entrega en `docs/POS_VENTA_ENTREGA_DECISION.md` §4b; sin cambio de flujo hasta decisión del dueño.
- **Ronda ATLAS (comprobante, impresión y entrega):** comprobante interno completo desde el registro local (`frontend/src/offline/comprobante.ts`), reimpresión desde el diario, papel 58/80 mm e impresión que nunca revierte la venta. Corregido: `entregar` aceptaba ventas totalmente devueltas. Pendiente de decisión del dueño sobre la entrega de la venta en línea: `docs/POS_VENTA_ENTREGA_DECISION.md` (opciones A–D; sin cambio de flujo). Impresión física (C1–C8) no ejecutada. Resultados en `docs/POS_PILOTO_QA_FINAL.md` §4c.
- **Regla confirmada por el dueño (venta offline = venta normal):** verificada en `docs/POS_PILOTO_QA_FINAL.md` §4b. Corregido: si releer la lista fallaba tras guardar, la UI mostraba «NO se guardó» (`PosContingenciaPage.tsx`). Añadidas pruebas: relectura fallida tras guardar, siguiente cliente con sincronización colgada y salida de inventario `ENTREGA` por operación. Brechas abiertas: comprobante sin líneas de producto y stock central desfasado hasta sincronizar.

## Levantamiento inicial y administración de precios (2026-10-11)

- **Rama/PR:** `claude/keen-goldberg-62o7f1`, desde la rama de integración `claude/integracion-pos-offline-p1` ([#129](https://github.com/Nelosama/FerreSystem/pull/129), HEAD verificado `6373692f`). PR de borrador [#140](https://github.com/Nelosama/FerreSystem/pull/140) hacia esa base. Sin merge, despliegue ni migraciones productivas. No se modifica la contingencia offline (ver bloqueo 1).
- **Reglas implementadas:**
  1. **Personal** (ADMIN/BODEGUERO con `inventario.editar`) captura productos sin precio. `POST /productos` sin `precioVenta`/`precioCosto` deja `precio_aprobado=false` (pendiente). Con precio responde 403; `margen` responde 400 (se calcula, no se captura).
  2. **Ficha de producto** (`PUT /productos/:id`): ningún rol cambia precio ni margen (403 / 400). Nombre, códigos, categoría, unidad y existencias siguen igual.
  3. **Pantalla `/precios`** (solo ADMIN, menú «Precios y aprobación»): fija costo y precio, muestra margen calculado en vivo y aprueba para venta (exige precio > 0). `PATCH /productos/:id/precios` exige `version`. Registra `precio_aprobado_por/at` y `precio_modificado_por/at`; auditoría `PRECIO_APROBAR` / `PRECIO_MODIFICAR` con antes, después y motivo. Modificar un precio ya aprobado conserva la aprobación.
  4. **Venta y cotización** (`ventas.service.ts`, `cotizaciones.service.ts` → `processLineItems`): producto sin precio aprobado responde 400 dentro de la transacción; no se crea venta, ni reserva, ni cotización.
  5. **Conteo** (`levantamientos.service.ts`): no lee ni escribe costo, precio ni margen. Aplicar solo cambia existencias y, si estaban vacíos, marca y código de barras. Un producto nuevo del conteo se crea con precio 0 y pendiente.
  6. **Compras:** sin cambios de código. La recepción no toca `precio_venta` (`compras.postgres.integration.ts`, costo vigente = última recepción).
  7. **Importador de productos:** ya no lee ni envía precios; sobrescribir afecta existencias.
  8. **Estados en pantalla:** «Pendiente de aprobación» (precio) y «Completo / Incompleto» (descripción y categoría presentes; propuesta por confirmar con el dueño).
- **Migración** `backend/prisma/migrations/20261011150000_precio_aprobacion_producto`: solo agrega columnas e índice. Productos existentes quedan aprobados con `precio_aprobado_por = 'LEGADO_MIGRACION'` para que no dejen de venderse. Requiere revisión de DBA y confirmación del dueño.
- **Pruebas ejecutadas (2026-10-11, entorno local):**
  - Backend unitarias **345/345**. `tsc -p tsconfig.build.json` sin errores.
  - Integración PostgreSQL 16, usuario no root, cadena completa de migraciones: **23 archivos, 381 aprobadas, 1 omitida** (la misma omitida que ya tenía la base). Incluye `test/precios-aprobacion.postgres.integration.ts` (nueva, 10 casos: personal sin precio, alta del dueño, ficha sin precio, conteo sin precio, producto nuevo pendiente, venta bloqueada, validaciones de aprobación, aprobación auditada, modificación con antes y después, ajuste de existencias sin tocar precio).
  - Frontend unitarias **233/233** (`test/precios.test.mjs` 8/8, `producto-edicion.test.mjs` 15/15).
  - Playwright con backend simulado **120/120** (Chromium 1194 instalado en el entorno; el binario por defecto no está).
  - E2E con backend real (`frontend/e2e-real/precios-real.spec.ts`, vía `e2e-real/run.sh`): **1/1**. El personal captura sin precio y ve «pendiente»; el dueño filtra, ve margen 33.33 %, aprueba; la base de datos guarda precio, aprobador y auditoría; el personal recibe 403 al cambiar precio. Capturas en `scratchpad` de la sesión (no se publican en el repo).
  - `tsc -b`, `vite build`, oxlint sin errores (solo avisos de patrón existente).
- **Bloqueos y decisiones pendientes:**
  1. **Contingencia offline (no modificada por restricción):** `contingencia.service.ts`, `construirCatalogo` (~línea 157), incluye productos sin precio aprobado (precio 0) y `tx.venta.create` (~línea 450) crea ventas sin pasar por `ventas.service`. Con la contingencia activa, un producto pendiente podría venderse offline a precio 0. Falta: filtrar `precioAprobado: true` en el catálogo de la ventana y validar al sincronizar. La contingencia está apagada por defecto (`POS_OFFLINE_ENABLED` y configuración por empresa). Requiere autorización explícita.
  2. **Productos existentes aprobados por migración:** es una decisión de negocio. Si el dueño quiere revisar precios antes de vender, debe marcarse pendiente en una migración aparte; no se hizo.
  3. **Conflicto de criterio con #134 (LEV-004):** #134 deja sin corregir que aplicar un conteo sobrescriba costo, precio y margen, porque la prueba `QA-INV-001` exige aplicar el precio revisado. Esta rama implementa la regla del encargo («los ajustes nunca sobrescriben costo, precio ni margen») y ajusta esa prueba en `auditoria-inventario.postgres.integration.ts`. #134 no implementa esta corrección, así que no hay duplicado; sí hay que decidir el criterio antes de integrar ambas.
  4. **Costo manual de BODEGUERO** (decisión D1 de FS-07): queda cerrada por el encargo; solo ADMIN fija precios.
  5. Columnas `margen`, `precio_*` de `levantamiento_items` quedan sin uso (no se borran). `margen` almacenado en `productos` tampoco se escribe; el margen mostrado es calculado.
  6. No validado en iPhone/Safari, Windows ni con datos reales de la ferretería. Sin prueba de hardware.
- **Bitácora:** lectura del contexto vigente y de PRs abiertos (#129–#135); implementación backend, frontend, migración y pruebas; corrección de fixtures y contratos de pruebas que cambian por diseño (no se relajó ninguna aserción salvo las que describían el comportamiento anterior); PR en borrador pendiente de revisión humana. Sin aceptación del cliente.

---

## Compras, proveedores y costos vigentes — cierre funcional (2026-10-11, FORJA)

- **Rama:** `claude/forja-compras-proveedores`, apilada sobre `claude/keen-goldberg-62o7f1` (#140), porque reutiliza su control de costos. Sin merge, despliegue ni migraciones productivas.
- **Ya existía y se verificó (no se duplicó):** proveedores; orden/factura con número, fecha y vencimiento; recepción parcial por línea con bloqueo `FOR UPDATE`; idempotencia por `solicitud_id` (con hash de contenido); existencias solo por cantidad recibida; costo vigente = costo de la última recepción, también si baja; historial `costos_compra` por proveedor; una sola cuenta por pagar por factura (`account()`, la recepción no crea deuda); factura repetida rechazada sin distinguir mayúsculas ni espacios; compra al contado; pagos sin tocar inventario ni costos.
- **Implementado en esta misión:**
  1. Auditoría `COMPRA_RECIBIR` con costo anterior, costo nuevo, cantidad, proveedor, factura y responsable por producto (`operaciones.service.ts`, `recibir`).
  2. Un ADMIN ya no edita a mano un costo originado por compra (`productos.service.ts`, `cambiarPrecios`): responde 400. Antes de la primera recepción sí puede fijar el costo inicial.
  3. La tabla de recepción del administrador oculta la columna de costo a los demás roles (`OperacionesPage.tsx`).
- **Decisión que se mantiene:** recibir más de lo autorizado se rechaza para todos los roles, sin override. Un proceso de aprobación de excedentes requiere decisión del dueño.
- **Pruebas (PostgreSQL 16 real, usuario no root):** `test/compras-cierre.postgres.integration.ts`, 10 casos nuevos: auditoría con costos, costo que sube y baja sin tocar precio ni aprobación, proveedores con costos distintos, recepción duplicada, sobre-recepción también para ADMIN, crédito con recepciones parciales (una deuda), factura repetida, pago que no altera inventario ni costo, edición manual de costo bloqueada, acceso no autorizado y separación entre empresas. Integración completa: 25 archivos, 401 aprobadas, 1 omitida. Unitarias backend 345/345; frontend 233/233; Playwright simulado 120/120.
- **Pendientes:** la UI de compras sigue en un componente compartido (`OperacionesPage.tsx`) con textos en español fijo; falta la traducción completa y un flujo guiado en móvil. Integración con #142 (BALANCE) no probada en conjunto: BALANCE modifica `cuentas` y `pagar`, que este cambio no toca.

---

## Estado vigente PR #152 (2026-10-11, actualiza el bloque siguiente)

### Candidato PR #153 — H-5/H-6, F4, concurrencia, F5 y R-02 (2026-10-11, rama `claude/h5-identidad-operacion-a`, sin merge)

- **Decisiones del propietario ejecutadas:** opción A de H-5; F4 (clave dedicada); serialización de la concurrencia; **F5 opción B**; **R-02 opción B**; inspección de solo lectura de la migración `20261011150000` (sin acceso a entornos, ver abajo).
- **H-5 / H-6:** los identificadores de operación los emite el servidor (`operaciones-emitidas.ts`), la ventana debe ser del usuario autenticado y un rechazo solo crea fila si la ventana es del remitente y el UUID es el emitido (`ventanaDelRemitente`). Sin tabla nueva. Hallazgos F1, F2, F3 y F6 de CENTINELA sobre `bc9ae482` corregidos en `771ad591`.
- **F4:** `CONTINGENCIA_CLAVE_OPERACIONES` es obligatoria (≥32 caracteres), sin fallback a `JWT_SECRET` ni constante pública; `CONTINGENCIA_CLAVE_OPERACIONES_ANTERIOR` verifica (nunca emite) ventanas anteriores durante la transición (las ventanas duran como máximo 36 h). Rotar `JWT_SECRET` ya no afecta a las ventanas. Un rechazo por identidad o clave no bloquea un reenvío legítimo posterior. Ver `backend/.env.example`.
- **Concurrencia (`serializada`):** la decisión por UUID corre en una transacción con bloqueo de empresa y de operación; el primer payload que obtiene el bloqueo determina el resultado; una alteración posterior solo añade conflicto y auditoría con lectura fresca y nunca cambia `APLICADA`; ante fallo se revierte todo. Antes: 7/25 sin venta y 5/25 con el contenido de la segunda versión. Ahora: 25/25 una venta aplicada. `backend/test/contingencia-concurrencia.postgres.integration.ts`.
- **F5 opción B:** migración `20261017000000_contingencia_rechazos_importe_incoherente` (reemplaza `montos_check`; admite importes no negativos solo en `RECHAZADA` y `RESUELTA_MANUAL`; marca `CONT-1017`, **requiere CODEOWNERS y revisión de NEXUS**; **no ejecutada en ningún entorno**). El rechazo por importe incoherente queda en el diario sin venta ni movimiento. `conciliarEfectivo` ingresa solo el efectivo recibido. Informes: `faltanteCentavos` y `efectivoCentavos`. Expediente: `docs/NEXUS_SOLICITUD_REVISION_F5_20261017.md`.
- **R-02 opción B:** el efectivo del cierre sin venta va solo a la caja del cajero que cobró; otra caja se rechaza (`CAJA_NO_ES_DEL_COBRO`); caja cerrada exige regularización excepcional con motivo (≥20 caracteres) que actualiza esperado y diferencia del arqueo y audita `CONTINGENCIA_REGULARIZAR_CAJA_CERRADA`. La pantalla de administración ya no elige caja para el cierre sin venta.
- **Migración `20261011150000`:** dos contenidos (candidata `8885a35a…`, FORJA/keen `d84f7934…`); `main` no la tiene. **No hay acceso a ningún entorno desde la sesión de desarrollo**, así que la inspección de solo lectura no pudo ejecutarse: queda la consulta `backend/scripts/inspeccion-solo-lectura-migracion-20261011150000.sql` y el plan `docs/PLAN_RECONCILIACION_MIGRACION_20261011150000.md` para el operador.
- **Cambios de expectativa deliberados (por decisión del propietario):** H5-1 pasa de «sin fila» a «fila RECHAZADA»; R-02 sustituye «ingreso a la caja del administrador» y el mensaje «Abra una caja» por el rechazo y la regularización; DEF-04/H4/H5 como en el bloque anterior.
- **Defecto crítico hallado al ejecutar e2e-real (corregido):** `aOperacionDto` no enviaba `indiceOperacion`; **toda venta offline hecha desde el navegador contra el backend real se rechazaba** (`OPERACION_NO_EMITIDA`, quedaba en `REVISION`). Las auditorías sobre `bc9ae482`, `771ad591` y `92982427` no lo vieron: la prueba simulada aceptaba cualquier identificador y e2e-real no se había ejecutado. Corregido en `sync.ts`; el servidor simulado ahora valida el índice como el real (con el campo omitido la prueba falla). **Lección:** e2e-real contra el backend real es obligatoria antes de cualquier GO.
- **Hallazgos H-1 a H-4 de CENTINELA sobre `92982427` (corregidos):** H-1 (medio, regresión de F5: importe fuera del entero de 32 bits tumbaba el lote) con importes acotados a 2 000 000 000 centavos y degradación a `ERROR_TEMPORAL`; H-2 (los rechazos no cuentan en acumulados ni cupo); H-3 (motivo de regularización medido recortado); H-4 (un administrador no declara un cajero ajeno a la empresa, `CAJERO_DESCONOCIDO`). Residual: un ADMIN que declara un cajero distinto del dueño de la caja produce una fila que `CERRAR_MANUAL` con efectivo no puede cerrar (`CAJA_DEL_COBRO_NO_ENCONTRADA`); se cierra con efectivo cero o se documenta el procedimiento.
- **Hallazgos H-A a H-E de CENTINELA sobre `632daed0` (PASS condicionado, corregidos):** H-A (medio: un carácter nulo en un texto se reintentaba sin fin y el error 5xx devolvía rutas y código de Prisma; además la evidencia de formato inválido fallaba al guardar el payload con el carácter nulo, lo detectó la prueba de regresión), H-B (cliente: `RESUELTA_MANUAL` dejaba la operación `PENDIENTE` en bucle), H-C (nota/referencia/motivo sin recorte ni caracteres de ancho cero), H-D (línea de importe gigante daba 500 al aceptar), H-E (tope de efectivo en el cliente y 413 como rechazo de lote). Prueba de lote rechazado con 400 en navegador (con control negativo válido). `contingencia-hallazgos-632daed0` (6; 5 fallan contra la versión anterior).
- **Hallazgos H-F a H-I de CENTINELA sobre `826a6e16` (FAIL condicionado, corregidos en `391b9ab7`):** la clase «texto que PostgreSQL rechaza» seguía abierta tras cada parche puntual, y dos de los defectos (H-G, H-H) eran de mis propias correcciones anteriores. Cierre sistemático: `TextoSeguro` (sin nulo ni pares sustitutos sueltos) en todos los textos de los DTO; longitud medida en caracteres visibles descartando invisibles por categoría Unicode (84 combinaciones se aceptaban antes); saneador de evidencia que recorre el objeto (conserva la secuencia literal `\u0000`); y entradas sin DTO (`latido`, `estados`, filtros de `listar`, fecha del resumen, motivo de desactivación) con respuesta controlada. `contingencia-texto-seguro` (9; 8 fallan contra la versión anterior) incluye una invariante exhaustiva: todo carácter aceptado del plano básico completo y una muestra de los demás planos se guarda en PostgreSQL como `text` y `jsonb`.
- **Auditoría funcional sobre `826a6e16`: PASS** (`e2e-real` 3 de 3 ejecuciones 119/0, PostgreSQL 14 archivos/256, frontend 246/246, simulados 14/14, mutación de `esRechazoDeLote` detectada). Salvedad del propio auditor: 3 ejecuciones verdes no refutan una intermitencia de 1 de 6 bajo carga.
- **Auditoría sobre `71ec3a00` (2026-10-11):** adversarial **FAIL** (misma clase, entradas fuera de los DTO de texto): H-J (truncar el motivo a 300 partía un emoji → 500), H-K (`:id` con carácter nulo → 500), H-L (marcas de combinación y ignorables contaban como visibles), H-M (`IsDateString` aceptaba fechas ISO semanal/ordinal → reintento sin fin), H-N (`ids` repetido → 500), H-O (`page`/años extremos → 500). Funcional **PASS** (e2e-real 2×119/10/0; PostgreSQL 15 archivos/265; frontend 246/246; sin expectativas debilitadas). Salvedad: solo 2 ejecuciones, no descarta la carrera de la prueba 11. Observación: el mínimo de la nota ahora cuenta caracteres visibles sin espacios; el contador de la interfaz no se verificó. Corrección en la rama `claude/cierre-clase-entradas-fuera-dto` (`ContingenciaController` pipe `IdSeguro`, `esFechaHoraIso`, `INVISIBLES` + `\p{M}`/`Default_Ignorable_Code_Point`, años 1900-2100, `page` ≤ 100000); pruebas `backend/test/contingencia-cierre-entradas.postgres.integration.ts` (7, fallan sin la corrección); suite PostgreSQL completa 50 archivos / 792 aprobadas / 1 omitida. **El nuevo SHA exige nueva auditoría; `71ec3a00` no lo certifica.** H-P (anidación de 5000 niveles, `stripProtoKeys` de Nest) es de framework y global: pendiente de decisión, sin cambio.
- **Validación de `0ac3f741` (2026-10-11; el HEAD del PR puede llevar commits posteriores solo de documentación):** auditoría delta adversarial por subagente nuevo (NO es CENTINELA/FARO; sigue PENDIENTE su revisión independiente): H-J a H-O **PASS** (28 ids hostiles sin 5xx, fuzz de 400 000 cadenas de fecha, barrido de 1 114 112 puntos de código, aislamiento multiempresa 404); suite PostgreSQL de contingencia 11 archivos / 142 de 142. Residuos sin corregir: D-1 (baja: `Cn`/`Co`/U+FFFC cuentan como visibles), D-2 (muy baja: `\p{M}` descontado rechaza hindi corto), D-3 (baja, preexistente: `PATCH configuracion` con cuerpo arreglo → 500, sin alterar datos). **e2e-real sobre `0ac3f741`:** suite completa 3 de 3 (119 aprobadas / 10 omitidas / 0 fallos, 146-154 s). **Prueba 11: 2 fallos en 23 ejecuciones (1 de 10 aisladas en reposo, 1 de 10 aisladas bajo carga, 0 de 3 completas), siempre en la aserción de `contingencia-real.spec.ts:382` (`ENVIANDO` en lugar de `PENDIENTE` tras 15 s)**; causa: `authInterceptors.ts:51` redirige a `/login` y descarga la página antes de que termine la escritura local; la venta se restaura al reabrir (`recuperarEnvios`), sin pérdida ni duplicado. Prueba 3: ~3 s en reposo (10 de 10) y ~34 s en 5 de 10 ejecuciones bajo carga (hipótesis sin probar: el primer envío al reconectar falla y espera el intervalo de 30 s de `PosContingenciaPage.tsx:22`); margen de 26 s frente al tope de 60 s. **No se declara estabilidad.** H-P: rama `claude/hp-profundidad-json` (`aa1b14db`, NO integrada; pipe global de profundidad ≤ 64, 3 pruebas), pendiente de decisión del propietario. Regla del mínimo: el servidor cuenta caracteres visibles **sin espacios** (nota 10, motivo 20); la interfaz cuenta longitud recortada **con espacios** (`ContingenciaAdminPage.tsx:98,104`): discrepancia abierta, sin cambiar la política. `CONTINGENCIA_CLAVE_OPERACIONES` no está en `deploy/local` ni en CI: el compose actual no arrancaría el backend.
- **Cierre de residuos sobre `0ac3f741` (2026-10-11; rama `claude/cierre-final`, código final `6ab557e5`; el HEAD del PR puede añadir solo documentación). Autorizado por el propietario:** (1) **Prueba 11, opción A** (`frontend/e2e-real/contingencia-real.spec.ts`): acepta `ENVIANDO` o `PENDIENTE` tras el 401 y exige persistencia local antes/después de reiniciar sesión, misma identidad de idempotencia (`operacionId`, `indiceOperacion`, `ventanaId`, `dispositivoId`, `secuenciaLocal`), mismo contenido, cero llegadas al servidor con la sesión vencida, recuperación efectiva a `SINCRONIZADA` con correlativo definitivo y exactamente una fila en `operaciones_contingencia`, una venta y un movimiento de caja; sin esperas nuevas ni aserciones eliminadas. **30 de 30 ejecuciones aprobadas (15 en reposo, tiempo de la prueba 11 2,8-3,2 s; 15 con carga de 4 procesos, 4,0-4,9 s)**; antes 2 fallos en 23. La anotación `estado-tras-401` registra qué rama ocurrió pero el reporter `list` no la muestra: no se sabe cuántas veces apareció `ENVIANDO`. La prueba 3 sigue siendo lenta bajo carga (4 de 15 ejecuciones ~34 s, 11 de 15 ~3,5 s; en reposo 15 de 15 ~3 s); causa sin probar. (2) **H-P integrado** (PR #154, código `aa1b14db`): `ProfundidadMaximaPipe` (≤ 64 niveles, iterativo, buffers no se recorren) cableado por `configurarPipesGlobales` en `main.ts`; verificado antes de integrar: unitaria 40/377, PostgreSQL 51/795/1 omitida, `e2e-real` 119/10/0. (3) **D-3:** `CuerpoDeTipoCorrectoPipe` (global): un arreglo donde se espera un DTO responde 400 y no ejecuta el controlador (prueba con control negativo; ningún endpoint ni el frontend envían arreglos a DTO). (4) **Política de longitud mínima (decisión del propietario), D-1 y D-2:** `backend/src/contingencia/texto-minimo.ts` y `frontend/src/utils/textoMinimo.ts` son el MISMO archivo (una prueba falla si difieren) con vectores compartidos (`frontend/test/fixtures/texto-minimo-vectores.json`): mínimo de negocio (nota 10, motivo 20) **contando espacios**, más **al menos 3 caracteres visibles** (letras, números, puntuación o símbolos; las marcas de combinación cuentan en la longitud pero no como visibles; no cuentan ignorables, controles, uso privado, sin asignar ni sustitutos; excluye U+FFFC/U+FFFD). Hindi, árabe, japonés, coreano, tailandés y NFD pasan; privados/sin asignar no satisfacen el mínimo. La interfaz (`ContingenciaAdminPage.tsx`) usa la misma función y el mismo mensaje y muestra el recuento en vivo; deja de enviar un motivo que no cumple. Cambio de expectativa deliberado: `contingencia-admin-simulado` paso 2 (antes enviaba la petición sin regularización; ahora muestra el mensaje y no envía). (5) **`CONTINGENCIA_CLAVE_OPERACIONES`** preparada sin valores reales: `clave-operaciones.ts` (validación de arranque en `main.ts` antes de crear la app; mensaje de una línea; rechaza clave igual a `JWT_SECRET`; la anterior opcional y distinta), `deploy/local` (`prepare.mjs`, `compose.yaml`, `container-entry.mjs`, `agregar-clave-contingencia.mjs` para instalaciones existentes), CI (clave efímera enmascarada) y `docs/CONTINGENCIA_CLAVE_OPERACIONES.md`. Nada se provisiona en entornos reales: pendiente de cada responsable.
- **Preparación de entrega al cliente (2026-10-11; rama `claude/liberacion-evidencia`, parte de `95144a17` SIN cambiar el candidato; solo prueba, utilidades y documentación):** informe, clasificación P0/P1/P2, validación de negocio de 10 pasos, plan de liberación controlada y decisiones del propietario en `docs/LIBERACION_CLIENTE_20261011.md`. **Estado: NO-GO.** Sin respuesta de CENTINELA, FARO, NEXUS ni de un responsable de entorno sobre ninguno de los cuatro pendientes (Issue #151 y PR #153 revisados). Nuevo: `frontend/e2e-real/historial-auditoria-real.spec.ts` (paso 10: historial de ventas y auditoría del administrador; escritorio y 390 px; el cajero no entra; 5/5; `e2e-real` completa 124/10/0), `frontend/playwright.real.mobile.config.ts` + `PW_CONFIG` en `e2e-real/run.sh` (emulación móvil Pixel 7 en Chromium: 58/5 omitidas/0 fallos sobre caja, inventario, compras, auditoría, clientes, inicio, cobro/entrega, precios, garantías y ciclo de venta; NO es Safari/iPhone), `backend/scripts/simulacro-recuperacion.sh` (aislado, 14/14: migración con `migration-safe deploy` de 24 migraciones, operación, reinicio, `pg_dump`/`pg_restore` en base vacía con datos idénticos). Hallazgos para decisión: `main` tiene 13 migraciones y no contiene contingencia/entregas/caja (24 en el candidato); `npm run start:prod` migra al arrancar, así que desplegar = migrar producción; la migración `20261012000000_entrega_eventos_y_cantidades` reescribe `detalles_venta` histórico (cubierta por `centinela-migracion-148` en la suite PostgreSQL); el backend anterior contra la base ya migrada NO está verificado; respaldos de producción sin configurar; entrega parcial y vuelto en el POS en línea sin implementar; solo hay Chromium (Safari/WebKit BLOQUEADO). El CODEOWNER de `/backend/prisma/` es el propietario: la aprobación de CODEOWNERS de `20261017000000` la puede dar él en el PR.
- **Preparación de preproducción y entrega piloto (2026-10-12; rama `claude/preproduccion-entrega`, parte de `708c5511`; CERO cambios de código de aplicación respecto de `95144a17`: `git diff 95144a17 -- backend/src frontend/src` vacío):** informe y respuestas en `docs/INFORME_PREPRODUCCION_20261012.md`; runbook Render/Supabase/Vercel en `docs/RUNBOOK_PREPRODUCCION_Y_PRODUCCION.md`; análisis de `20261011150000` y `20261017000000` en `docs/MIGRACIONES_20261011150000_Y_20261017000000.md` (no aprueba ninguna); checklist de equipos en `docs/CHECKLIST_EQUIPOS_REALES.md` (todo SIN PROBAR). **Cambio de comportamiento:** `npm run start:prod` ya NO migra: `migration-safe startup` solo verifica y se niega (código 1, sin escribir) si hay migraciones pendientes, historial incompleto o checksum distinto; migrar exige `npm run migrate:deploy`; las instalaciones locales conservan el comportamiento con `FERRE_MIGRAR_AL_ARRANCAR=SI` (`deploy/local/compose.yaml`); nuevo `npm run migrate:verify`. Nuevos: `backend/scripts/{respaldo-previo-migracion.sh,verificar-respaldo.sh,estado-base-solo-lectura.sql,humo-preproduccion.mjs,ensayo-actualizacion-preproduccion.sh}` y `backend/test/migraciones-control-arranque.postgres.integration.ts` (14 pruebas, con control negativo). **Evidencia (aislada, PostgreSQL 16 local):** ensayo de actualización desde el esquema de `main` (13 migraciones) con datos históricos **24/24 PASS**; PostgreSQL completa **54 archivos / 879 aprobadas / 1 omitida**; unitarias 40/377; scripts 42/42; guard de migraciones correcto. **Hallazgos:** el backend no lee `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` (Supabase es solo PostgreSQL); con `NODE_ENV` ≠ `production`, `JWT_SECRET` cae en un valor de desarrollo público; la migración `20261012000000` reescribe `detalles_venta` histórico (precondiciones de datos en `estado-base-solo-lectura.sql` §5); el backend anterior contra la base ya migrada NO está verificado. **Pendiente (sin acceso o sin autoridad de esta sesión):** panel de Render, Supabase, Vercel, respaldos de producción, aprobación de CODEOWNERS de `20261017000000`, auditoría de CENTINELA/FARO, equipos reales. Sin merge, despliegue ni migraciones productivas.
- **Puesta en marcha del piloto (2026-10-12; PR #155, rama `claude/preproduccion-entrega`; sin cambios de código de aplicación):** estado real recuperado (#151 = Issue; #153 y #155 = PR en borrador; `main` `7ccfad25` NO contiene entregas/caja/contingencia: el candidato lleva ~196 commits y 11 migraciones por encima). Nueva prueba `frontend/e2e-real/piloto-ciclo-completo-real.spec.ts` (**11/11**, backend y PostgreSQL reales, sin mocks): producto con código/descripción/costo/precio/existencias; el cajero ve precio y existencias pero NO costo; apertura de caja; ventas de contado en efectivo, tarjeta y TRANSFERENCIA (esta no tenía prueba real; exige referencia, 400 sin ella, 409 si se reutiliza); reintento y doble envío sin duplicados; entrega única; consulta de ventas y auditoría con usuario; cierre de caja que suma solo efectivo; aislamiento entre empresas. `e2e-real` completa **135 / 10 omitidas / 0 fallos**. **Hallazgo de negocio:** el rol CAJERO no puede cobrar con entrega inmediata (`MOSTRADOR`): 403 «Use Cobrar y dejar en bodega» (regla D1); el administrador sí; decisión del propietario. Lista ejecutable, P0-P3, responsables, marcha atrás y tiempo estimado en `docs/LISTA_VERIFICACION_PILOTO_20261012.md`. Esta sesión no alcanza Vercel/Render/Supabase por red (túnel 403): infraestructura NO verificada. Sin respuesta de CENTINELA/FARO/NEXUS. Sin merge, despliegue ni migraciones productivas.
- **Pruebas sobre el árbol final `391b9ab7`:** suite PostgreSQL completa **49 archivos, 785 aprobadas, 1 omitida, EXIT=0**; **e2e-real (backend, PostgreSQL y navegador reales, `migrate deploy` incluido): 119 aprobadas, 10 omitidas, 0 fallos**; frontend sin cambios desde `826a6e16` (246/246, simulados 14/14).
- **Inestabilidad conocida de e2e-real (NO resuelta, decisión pendiente):** en 12 ejecuciones aisladas de `contingencia-real` sobre base nueva, 0 fallos; con carga en paralelo, 1 de 6. El fallo reproducido es la prueba 11 («sesión vencida»): la venta queda `ENVIANDO` en lugar de `PENDIENTE` y el registro del servidor no muestra errores. **Causa:** al fallar el refresco de sesión, `authInterceptors.ts` redirige a `/login` y esa navegación puede ganar a la escritura local que devuelve la venta a `PENDIENTE`; queda `ENVIANDO` hasta que se reabre el POS, donde `recuperarEnvios` la corrige (no se pierde ni se duplica). Otros fallos vistos por los auditores y **no reproducidos**: prueba 3 («reconexión», página atascada en «Preparando la contingencia…») y `qa-ciclo-venta` 14.3 (búsqueda de producto en el POS normal), ambos durante ejecuciones en paralelo. Opciones: (A) aceptar `ENVIANDO` o `PENDIENTE` en la espera de la prueba 11 (relaja una aserción; el invariante de no pérdida se mantiene en las siguientes); (B) retrasar la redirección del interceptor hasta que terminen las escrituras locales (toca la autenticación global: requiere autorización); (C) no persistir `ENVIANDO`. La prueba **no se ha modificado**.
- **Pendiente antes de cualquier GO:** auditoría independiente sobre el SHA final (las de `826a6e16` y anteriores no lo certifican); decisión sobre la inestabilidad de la prueba 11; revisión de NEXUS y de CODEOWNERS de la migración F5; confirmación de versión de la migración `20261011150000` por entorno; configuración de `CONTINGENCIA_CLAVE_OPERACIONES` por entorno (independiente, persistente, no reutilizada). **Sin GO.**

## Estado vigente PR #152 (2026-10-11, actualiza el bloque siguiente)

### H-5 corregido con opción A / H-6 protegido (2026-10-11, rama `claude/h5-identidad-operacion-a`, base `4d78abc1`, SHA final `a041ba07`, PR [#153](https://github.com/Nelosama/FerreSystem/pull/153) en borrador, sin merge)

- **Decisión del propietario:** opción A aprobada. Los identificadores de operación los emite el servidor al emitir la ventana (`operacionesEmitidas`, 500 por ventana) y se derivan con HMAC de `ventanaId` e índice (`backend/src/contingencia/operaciones-emitidas.ts`). Clave: `JWT_SECRET` con dominio propio (`contingencia-operacion:v1`). Sin tabla nueva y sin migración.
- **Causa raíz (H-5):** el cliente fijaba el UUID y el servidor confiaba en el `cajeroId` declarado. Un segundo cajero del equipo que enviaba primero el UUID del dueño con su ventana creaba la venta a su nombre, y su rechazo con fila `RECHAZADA` bloqueaba después al dueño. Un rechazo sin fila de un remitente también bloqueaba a todos (`respuestaSinRegistroPara`).
- **Corrección:** `procesarOperacion` valida (1) que la ventana pertenezca al usuario autenticado (salvo ADMIN), (2) que el UUID coincida con la emisión de esa ventana e índice. Ambos rechazos (`CAJERO_NO_AUTORIZADO`, `OPERACION_NO_EMITIDA`) quedan solo como evidencia para el remitente, nunca como fila. La evidencia sin fila ya no bloquea a otros. La caja y la ventana salen de la ventana emitida, no del cliente.
- **Frontend:** el equipo ya no genera UUID de operación; `registrarOperacion` asigna el siguiente identificador emitido dentro de la misma transacción de IndexedDB (`frontend/src/offline/journal.ts`). Sin identificadores disponibles la venta no se guarda.
- **Pruebas:** `backend/test/contingencia-identidad.postgres.integration.ts` (H-5: intentos con UUID ajeno y con ventana ajena, dueño completa el cobro; H-6: UUID de otra empresa no aplica ni altera nada, identificadores sin colisión, estados aislado). Suites `contingencia`, `cobro-entrega`, `piloto-flujo`, `autenticacion-fase3` y `centinela-verificacion-atlas` ajustadas a identificadores emitidos. **Suite PostgreSQL completa sobre `a041ba07`: 44 archivos, 738/738 aprobadas, 1 omitida, EXIT=0.** E2E simulado de contingencia: 12/12 (tras `VITE_API_URL=/api npm run build` y configuración local de Playwright con Chromium 1194 fuera del repo).
- **Cambios deliberados de expectativa (revisar en auditoría):** DEF-04 y H4 ya no esperan fila `RECHAZADA` ni `VENTANA_DE_OTRO_CAJERO` para un remitente ajeno, sino `CAJERO_NO_AUTORIZADO` sin fila; H5 espera `CAJERO_NO_AUTORIZADO` en lugar de `RECHAZADA` genérica. La privacidad (no revelar importe ni ventana ajena) se mantiene.
- **Riesgos residuales:** (a) operaciones offline anteriores a este cambio (UUID del cliente, sin índice) se rechazan con `OPERACION_NO_EMITIDA` y quedan para el administrador; (b) rotar `JWT_SECRET` invalida la derivación de las ventanas emitidas: las ventas offline pendientes se rechazan; (c) dos pestañas que cobran a la vez se serializan por IndexedDB, pero una ventana sin pestaña única no está cubierta; (d) pruebas `e2e-real/faro-validacion-def01` ajustadas solo en el origen del identificador (no en expectativas) y pendientes de ejecución contra el stack real.
- **Pendiente antes de cualquier GO:** auditoría independiente CENTINELA y FARO sobre el SHA final del PR; compras en navegador; colisión de migración `20261011150000`; decisiones F5 y R-02. **Sin GO.**

## Estado vigente PR #152 (2026-10-11, actualiza el bloque siguiente)

### Identidad de operaciones H-5 / H-6 (2026-10-11, base `af1d8230`, rama `claude/vigilant-feynman-6p6jt2`)

- **Pruebas nuevas:** `backend/test/contingencia-identidad.postgres.integration.ts` (4/4, PostgreSQL temporal, ejecutadas como `nobody`). Suite `test/contingencia` completa: 5 archivos, 85/85.
- **H-5 (vulnerabilidad conocida, NO corregida):** el UUID de la operación lo fija el cliente. Un segundo cajero del mismo equipo que envía primero el UUID del dueño, con su propia ventana y caja, crea la venta a su nombre; el dueño recibe `CAJERO_NO_AUTORIZADO` y su cobro no se aplica. La prueba fija ese comportamiento para que cualquier cambio sea deliberado. No se corrige en servidor: la ventana ajena es indistinguible de un rechazo legítimo (ver regla B revertida en el historial). Requiere decisión del propietario: **A** (UUID emitidos por el servidor y ligados a ventana/cajero/dispositivo; exige cambio en el cliente; recomendada), **B** (equipo ligado a un único cajero; provisional), **C** (aceptar el riesgo; no recomendada).
- **H-6 (verificado, sin fuga):** el mismo UUID en dos empresas son dos operaciones independientes; una alteración de otra empresa no toca la fila original; `estados` no revela operaciones ajenas.
- **Pendiente:** purchases en navegador (`/ordenes-compra`), prueba de cliente offline 400 en navegador, auditorías CENTINELA/FARO sobre el SHA final, colisión de migración `20261011150000`, decisiones F5 (`montos_check`), R-02 y la opción de H-5. **Sin GO:** H-5 sigue abierto y es crítico para la entrega.

- **Código candidato:** `37642787` (rama `claude/vigilant-feynman-6p6jt2`). Después: prueba HTTP `backend/test/contingencia-http.postgres.integration.ts` (3/3) y este documento.
- **R-01:** el rechazo definitivo es estado `RECHAZADA` (migración aditiva `20261016000000`, CHECK ampliado y `rechazada_sin_venta_check`). El texto de más abajo que dice `REVISION` por CHECK es histórico: se resolvió con esa migración.
- **FARO (informe sobre `376427875b` = `37642787`):** 28/28 `faro-qa-pr150`; 31/31 grupo DEF-01/contingencia/cobro/precios; negocio 3/3; integración 118/118. Veredicto **PENDIENTE** hasta la prueba HTTP de 4xx (añadida aquí). Observación abierta: la regex de F-02 acepta el texto de respaldo «Código no encontrado» (propuesta: acotar a «no tiene precio aprobado»).
- **Suite PostgreSQL completa** sobre `37642787`: 42 archivos, 715 pruebas aprobadas, 1 omitida, EXIT=0.
- **CENTINELA:** auditoría de `37642787` en curso (sin veredicto). Auditorías de SHA anteriores no certifican este código.
- **Limitaciones sin resolver:** importes incoherentes sin fila en el diario (`montos_check`, decisión del propietario); cierre sin venta de rechazos con movimiento de caja (R-02, pendiente de confirmar como regla de negocio).

## PR #150 — correcciones F-01, F-02, O-02 y O-04 sobre `8cc02a57` (2026-10-11, ATLAS)

- **Rama de trabajo:** `claude/vigilant-feynman-6p6jt2`, creada desde `origin/claude/atlas-correcciones-finales-148` (`8cc02a57`). PR #150 sigue en borrador; sin merge, despliegue ni migraciones.
- **Reproducción previa en HEAD `8cc02a57`:** F-01 presente (`ContingenciaAdminPage` no mostraba mercancía pendiente); F-02 presente (la búsqueda de un código no vendible no informaba); O-02 presente (la consulta posterior devolvía `REVISION` genérico); O-04 presente (la prueba asumía qué operación gana).
- **Correcciones:**
  - F-01: `contingencia.service.ts` (`inventarioPendiente`) devuelve código, nombre, unidad y cantidad en el cierre sin venta y en `listar`; audita `CONTINGENCIA_INVENTARIO_PENDIENTE` con `existenciasModificadas: false`. `ContingenciaAdminPage.tsx` muestra la advertencia. No crea ventas ni ajusta stock.
  - F-02: `GET /productos/comercial/estado?codigo=` (`productos.service.ts` `estadoParaVenta`, sin costos; ruta marcada `@RespuestaSinProducto`). `POSPage.tsx` muestra «no existe» o «no tiene precio aprobado» al buscar o escanear.
  - O-02: `resumenCliente` y `respuestaRechazo` devuelven el mismo estado, código, mensaje e `instruccion` en la primera respuesta y en `estados()`, mientras la operación siga en `REVISION`.
  - O-04: `faro-validacion-def01.spec.ts` acepta cualquier orden de llegada; mantiene exactamente una `APLICADA` y una `REVISION` con `STOCK_INSUFICIENTE`.
- **Pruebas (esta sesión, PostgreSQL 16 temporal como usuario no root, Chromium 1194):**
  - Backend unitarias **377/377**; integración `contingencia` + `productos*` **93/93**; unitarias productos **28/28**.
  - Frontend: `tsc -b` sin errores; `npm test` **245/245**.
  - E2E real `faro-validacion-def01` + `contingencia-real`: **29/29**.
  - Suite FARO (`origin/nexus/faro-qa-pr150`, copiada solo para ejecutar, no confirmada): **26 PASS, 2 FAIL**. F-01 y F-02 pasan; los dos fallos son R-01 (DEF-04 y ventana anterior) porque esperan `estado = RECHAZADA` y el HEAD guarda `REVISION` + conflicto `DURO` (ver pendiente 1).
- **Pendientes reales:**
  1. **Decisión sobre R-01:** `87c72fdb` cambió el rechazo a `REVISION` porque el CHECK de la migración publicada `20261011000000` no admite `RECHAZADA`. La descripción del PR #150 y las aserciones de FARO siguen diciendo `RECHAZADA`. Hay que elegir: mantener `REVISION` y actualizar PR y auditoría, o crear una migración aditiva que amplíe el CHECK. No se ha cambiado ninguna de las dos cosas.
  2. FARO debe revalidar sobre el SHA final; no se afirma su aprobación.
  3. La prueba de F-02 usa una regex amplia; conviene afinarla.
  4. No probado: Safari/iPhone, corte de red real, pantalla de entregas en navegador.

---

## Continuidad POS y sincronización — auditoría y propuesta (2026-10-10)

- **Base comprobada:** `main` y `origin/main` `5eae989dfab0ea04cc6861406ec30df459ae16c2`, checkout principal limpio; fetch realizado. Al iniciar, PR #122 abierto (`fix/qa-clientes-cajero`). Trabajo de Claude en Clientes/POS/permisos protegido; no se cambian esos archivos ni se abren PRs de implementación.
- **Rama/PR:** `codex/docs-alta-disponibilidad`, worktree independiente; [PR #125](https://github.com/Nelosama/FerreSystem/pull/125) abierto, sin merge. Propuesta en commit `67d7bcf6`. Solo documentación. Informe: [ARQUITECTURA_CONTINUIDAD_POS_20261010.md](ARQUITECTURA_CONTINUIDAD_POS_20261010.md), con auditoría de las ocho preguntas, diagrama Mermaid, matriz de fallas, riesgos, sincronización, respaldos, fases, archivos y pruebas futuras.
- **Hallazgos vigentes comprobados en código:** POS guarda borrador y pendiente en localStorage; no catálogo persistente ni service worker. Recuperación por UUID y transacción central ya existen; idempotencia exige `solicitudId`, opcional en DTO. No hay sincronización automática de catálogo. Precio distinto se rechaza para no-ADMIN; ADMIN puede conservar otro precio. Venta reserva stock; entrega reduce físico. `productos.version` no cambia en todos los escritores de existencias. TARJETA/TRANSFERENCIA no acreditan autorización bancaria. Fotos: solo URL, sin servicio LAN implementado.
- **Respaldos:** worker FS-41 sí está en la base auditada: dump, Restic cifrado, readback, restore aislado, retención. No se verificó que esté configurado o funcionando en producción. `deploy/local/compose.yaml` es instalación alternativa sin sincronización con cloud; no usarla como failover automático.
- **Propuesta, no implementación:** nube como autoridad única; fotos opcionales; validación/aceptación explícita de importes; recuperación automática por identidad; polling inicial y luego cursor/outbox transaccional; PWA de consulta/borradores. Ventas offline de efectivo requieren fase separada con cuotas exclusivas, diario durable, conciliación y aprobación fiscal; tarjeta/crédito/numeración fiscal offline bloqueados en el alcance inicial.
- **Pruebas ejecutadas en esta sesión, base sin cambios:** frontend `node --test test/pos-client-credit.test.mjs test/receipt-fiscal.test.mjs` **9/9**; selección por nombre en `test/operaciones.test.mjs` **19/19** (POS/recuperación/devoluciones); backend `node --test scripts/backup-worker.test.mjs` **6/6**. Total seleccionado **34/34**. Handlers, transporte y comandos simulados; no prueban PostgreSQL real, datáfono, apagón físico ni backup externo. No se reutilizan cifras históricas como resultados de esta sesión.
- **Pendientes reales:** revisión de arquitectura y política de precio aceptado; plan/RPO/RTO/presupuesto de infraestructura; responsable de incidentes; inventario de hardware y red; decisión offline solo borrador frente a piloto condicionado. Toda implementación requiere autorización por fase y revisar las ramas de Claude antes de tocar archivos compartidos. Sin migraciones, merge, despliegue ni aceptación del cliente.
- **Bitácora:** lectura del contexto vigente, inspección Git/PR/código y documentación oficial, ejecución de pruebas seleccionadas, propuesta, publicación del PR #125 y actualización de este estado. Verificación documental: enlaces locales y `git diff --check`; diff limitado a los dos documentos. No se afirma CI aprobada ni aceptación de arquitectura.

---

## Fechas de negocio en Apartados, Transferencias, Garantías y Pedidos Especiales (2026-10-10 UTC)

- **Rama:** `fix/fechas-zona-negocio-modulos` (PR #112), desde `origin/main` `2398e45f`. Sin merge ni despliegue.
- **Problema original:** las cuatro pantallas guardaban fechas de negocio con `toISOString()` (día UTC). Entre 18:00 y 23:59 de Tegucigalpa el registro caía en el día siguiente.
- **Corrección de zona:** "hoy" y abonos con `diaCalendarioEnZona()` (`frontend/src/utils/format.ts`). Aritmética de calendario en `frontend/src/utils/fechasNegocio.ts`.
- **Formato visible (nuevo):** `formatearFechaNegocio(dia, locale)` muestra `YYYY-MM-DD` como `9 oct 2026` (es-HN) o `Oct 9, 2026` (en). Formatea con UTC sobre el propio día y no desplaza la fecha. Las cuatro pantallas lo usan con el `locale` de `useI18n`. Los datos guardados no cambian.
- **Garantías en días (decisión funcional definitiva, 2026-10-10):** la vigencia es solo en días calendario. El vencimiento es fecha de venta + días (`vencimientoGarantia` en `frontend/src/utils/garantias.ts`). Se retiró la regla de meses (`sumarMesesCalendario` eliminada de `fechasNegocio.ts`). Se valida un entero entre 1 y 3650; el límite es técnico, no comercial. Registros anteriores con `mesesGarantia` se muestran como meses y **no** se convierten a días.
- **Pruebas:** `frontend/test/fechas-negocio.test.mjs` 11/11 con `TZ=UTC`, `Asia/Tokyo` y `America/Tegucigalpa`. Incluye meses cortos, años bisiestos, fin de año, formato es/en y entradas no válidas. Con la expresión anterior, las pruebas de zona fallan.
- **Frontend completo:** `npm test` 174/174; `tsc -b` sin errores; `vite build` con `VITE_API_URL=/api` correcto; `oxlint` sin errores (avisos `set-state-in-effect` preexistentes).
- **Playwright:** 98/98 con backend simulado, usando `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. El binario por defecto de Playwright (`…-1243`) no está instalado; no se descargó nada.
- **Limitaciones:** datos de ejemplo en `localStorage`; las fechas ya guardadas conservan el día UTC anterior y no se migraron. `AuditoriaPage` y `DevolucionesPage` quedan fuera de alcance. Node local v22; el proyecto declara 24.x.
- **Pendientes:** (1) la página de garantías no está montada en las rutas (`/garantias` sigue como módulo pendiente), por lo que no es operativa; (2) no hay modelo Prisma ni API de garantías; la tabla `garantias` de la migración `20260930000000` tiene otro significado (reclamos) y no se usa; (3) el registro se guarda en `localStorage` de demostración; (4) revisión del PR por el director.

---

## Dashboard — HTTP 500 del resumen (PROD-QA-20261007-01), diagnóstico (2026-10-10 UTC)

- **Ramas/PR:** `fix/dashboard-resumen-500` (PR #111), desde `origin/main` `2398e45f`. Sin merge, despliegue ni acceso a producción.
- **Reproducción:** `backend/test/dashboard.postgres.integration.ts` (2 casos) ejecuta `DashboardService.getDashboardData` contra PostgreSQL 16 aislado con todas las migraciones: negocio vacío, y negocio con ventas de hoy y de ayer, devolución, producto bajo stock y cotización que vence hoy. **Ambos pasan**: el 500 no se reproduce con el código de `main`.
- **Hipótesis principal (no confirmada):** el resumen lee todas las columnas de `Venta`, `Producto`, `Devolucion`, `Cotizacion`, `Usuario` y `Cliente`. Si la base de producción no tiene alguna columna de las migraciones posteriores a la inicial, un `SELECT` falla y el resumen responde 500.
- **Consulta de solo lectura preparada:** `backend/scripts/diagnostico-dashboard-lectura.sql`. Lista las columnas que Prisma selecciona (110) que faltan en `information_schema.columns`, las tablas ausentes y las migraciones de `_prisma_migrations` si existe. Termina con `ROLLBACK`. Validado en un clúster temporal con todas las migraciones: 0 faltantes; con `devoluciones.reembolso` eliminada, la detecta. No se ha ejecutado en producción.
- **Pendiente:** ejecutarla en producción con un usuario de solo lectura y autorización del responsable. Si faltan columnas, la corrección es aplicar la migración que falta, no ocultar el error con un `try/catch`.

---

## Auditoría y Devoluciones — instantes en zona de negocio (2026-10-10 UTC)

- **Rama:** `fix/fechas-negocio-auditoria-devoluciones`, desde `origin/main` `2398e45f`. Independiente de PR #112. Sin merge ni despliegue.
- **Defecto:** `AuditoriaPage` y `DevolucionesPage` mostraban `created_at` con `toLocaleString('es-HN')` sin zona. La hora dependía del navegador: una venta a las 20:30 de Tegucigalpa se veía a las 02:30 del día siguiente en un equipo configurado en UTC.
- **Corrección:** `formatInstanteNegocio(value)` en `frontend/src/utils/format.ts` fija `America/Tegucigalpa`. Lo usan ambas pantallas.
- **Pruebas:** `frontend/test/auditoria-devoluciones-zona.test.mjs` (3 casos, varias zonas de navegador). Con la zona eliminada, la prueba falla (`TZ=UTC`). `devoluciones-recovery.test.mjs` mockea `../utils/format`; se añadió el nuevo helper al mock.
- **Verificación:** `npm test` 166/166; `tsc -b` y `vite build` correctos; `oxlint` sin errores; Playwright 98/98 (con `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` del Chromium instalado).
- **Limitaciones:** el backend de auditoría y de devoluciones no se cambió; no se verificó con PostgreSQL en este PR. Las pantallas que usan fechas de calendario (`YYYY-MM-DD`) no se tocan aquí.

---

## Garantías — módulo operativo por factura (2026-10-10 UTC)

- **Rama/PR:** `feat/garantias-produccion`, dependiente de PR #118 (`feat/garantias-dias`). Sin merge ni despliegue.
- **Decisión funcional:** garantías solo en días calendario, de 1 a 3650. El vencimiento es fecha de la factura (día de negocio `America/Tegucigalpa`) más días. Se retiró la regla de meses.
- **Entidad nueva:** `coberturas_garantia` (modelo `CoberturaGarantia`), una fila por línea de factura. **No se reutiliza `garantias`**: esa tabla registra reclamos (`RECIBIDO → … → RECHAZADO`, con `motivo_falla` obligatorio y `cliente_nombre` como texto) y no tiene modelo Prisma. Sus datos no se modifican.
- **Migración:** `backend/prisma/migrations/20261010120000_coberturas_garantia/migration.sql`. Solo crea tabla, índices, FK, CHECKs y un trigger de integridad. No altera tablas existentes.
- **Integridad en PostgreSQL:** `dias_garantia` entre 1 y 3650; `fecha_vencimiento = fecha_venta + dias_garantia`; `UNIQUE(tenant, línea)` y `UNIQUE(tenant, solicitud)`; trigger que rechaza una línea que no pertenece a la factura, un producto distinto del de la línea o una factura de otra empresa.
- **Backend:** módulo `backend/src/garantias/` (`GET /garantias/facturas/:numero`, `GET|POST /garantias/coberturas`, `PATCH /garantias/coberturas/:id`). Crear y editar: solo ADMIN. Consultar: ADMIN y CAJERO. Módulo `garantias`. Registrado en `app.module.ts`.
- **Auditoría:** `GARANTIA_CREAR` y `GARANTIA_EDITAR` con antes/después. Campos `creado_por` y `actualizado_por`.
- **Frontend:** `GarantiasPage.tsx` usa solo la API. Sin `localStorage` ni datos de demostración. Flujo: buscar factura, elegir línea, días, vista previa, guardar. El vencimiento de la vista previa se calcula con la fecha de la factura. El servidor guarda el valor definitivo. Montada en `/garantias`; sigue oculta en el menú (`PENDING_MODULES`).
- **Pruebas:**
  - `backend/test/garantias.postgres.integration.ts`: 35 casos con PostgreSQL 16 y cadena completa de migraciones. Cubre 30/90/180/365 días, cambios de mes y año, bisiesto, factura inexistente, línea ajena, trigger, duplicados, 5 solicitudes concurrentes, permisos por rol, aislamiento entre tenants, auditoría e histórico de `garantias`.
  - Suite de integración completa: 294/294 en 14 archivos. Unitarias backend: 329/329.
  - Frontend: 184/184 unitarias, `tsc`, build y lint sin errores nuevos. Playwright: 106/106. Las 6 pruebas nuevas usan **backend simulado**.
- **Aplicación futura (no ejecutada en producción):** tras copia de seguridad y autorización, `npx prisma migrate deploy` en la base de destino. **No usar `prisma migrate dev` contra producción**: el esquema no mapea tablas existentes (`garantias`, `historial_garantias`, `pedidos_especiales`, etc.), y su diff propondría eliminarlas.
- **Limitaciones:** Playwright con backend real no se ejecutó. No hay verificación en navegador de la app completa con sesión real. Sin modelo de sucursal. Límite de 3650 días técnico. Módulo oculto del menú hasta decisión de habilitación.
- **E2E con backend real (2026-10-10, autorizado):** `npm run test:e2e-real` (`frontend/e2e-real/run.sh`). Levanta PostgreSQL 16 temporal como usuario sin privilegios, aplica `prisma migrate deploy`, comprueba deriva de esquema solo para `coberturas_garantia`, siembra dos empresas, compila y arranca el backend NestJS, construye el frontend y ejecuta Playwright sin `page.route`. Resultado: **11/11**. Cubre creación, persistencia tras recargar, auditoría `GARANTIA_CREAR`/`GARANTIA_EDITAR`, vencimiento, búsqueda por factura, duplicados, 5 solicitudes concurrentes, permisos ADMIN/CAJERO/BODEGUERO, aislamiento entre empresas y vista móvil 390 px.
- **Mutación verificada:** con la escritura del cajero habilitada en controlador y servicio, la prueba real falla (`Expected: 403, Received: 201`).
- **Esquema:** las FK se declaran como relaciones Prisma con los mismos nombres de la migración, para que `prisma migrate dev` no proponga eliminarlas. Se añadieron campos de relación inversa en `Tenant`, `Usuario`, `Venta`, `DetalleVenta` y `Producto` (solo líneas nuevas, sin lógica). Sin reformateo del archivo.
- **Incidente de prueba corregido:** un proceso de la API sobrevivió a una ejecución y respondió en el puerto de la siguiente, con código antiguo. Las pruebas de mutación no llegaron a ejecutarse contra el código alterado. Ahora `run.sh` falla si el puerto está ocupado y lanza la API con `exec`.
- **Pendiente antes de operar:** decidir habilitación en `PENDING_MODULES`; revisar la migración con DBA; aplicar en staging; validar con personal de la ferretería.

---

## Caja y arqueo — implementación para entrega (2026-10-10 UTC)

- **Rama:** `claude/intelligent-cerf-b3ldo0` (designada para esta sesión; partió de `origin/main` `605cb941`, sin cambios de inventario). PR publicado hacia `main` sin merge ni despliegue. Sin producción ni datos reales en las pruebas.
- **Reutilizado sin reescribir:** modelos `Caja`/`MovimientoCaja` (tablas `cajas`, `movimientos_caja`), `openCash`/`cashMovement` de `operaciones/ledger.ts`, ventas (`VENTA_POS`), abonos CxC (`ABONO_CXC` vía `pagar`), devoluciones con reembolso (`DEVOLUCION`), auditoría `auditoria_operaciones`. Pagos a proveedor siguen fuera de caja (FS-09).
- **Implementado** (`backend/src/operaciones/operaciones.service.ts`, bloque `caja`): resumen del turno (fondo, ingresos/egresos en efectivo, efectivo esperado, totales por método con `EFECTIVO`/`TARJETA`/`TRANSFERENCIA`/`CREDITO` informativos); `GET /operaciones/caja` (propio); `GET /operaciones/caja/cierres` (solo ADMIN, filtro por estado); `GET /operaciones/caja/:id` (propio o ADMIN); `POST /operaciones/caja/:id/movimientos` para `INGRESO_MANUAL`/`EGRESO_MANUAL` con permiso `caja.movimientos_manuales` o rol ADMIN, idempotente por `solicitudId` (el id del movimiento), sin salida mayor al efectivo esperado, auditoría `CAJA_MOVIMIENTO_MANUAL` con `autorizacion` (`ROL_ADMIN`/`PERMISO_CAJA`); cierre que exige `notas` cuando hay diferencia, con reintento idéntico idempotente y segundo cierre distinto rechazado.
- **Frontend:** `frontend/src/pages/ArqueoCajaPage.tsx` (+ `.css`), pantalla única: abrir caja, resumen, movimiento autorizado, cierre con diferencia en vivo, comprobante imprimible, historial propio (cajero) o de la empresa (ADMIN). Reintento explícito de la operación pendiente con la misma solicitud. Textos ES/EN en `cash_drawer.*`. Se retiró el modo `caja` de `OperacionesPage` (código muerto). Permiso nuevo `caja.movimientos_manuales` en `UsuariosPage` y `types/index.ts`.
- **Pruebas ejecutadas (2026-10-10, entorno local):**
  - Integración PostgreSQL 16 real, usuario no root (`runuser -u nobody`), cadena completa de migraciones: `backend/test/caja.postgres.integration.ts` **14/14** (apertura, venta efectivo/tarjeta/transferencia, abono de cliente, devolución, entrada/salida con permiso y sin permiso, diferencia, cierre con sobrante, doble cierre, concurrencia de cierres, venta vs. cierre simultáneos, movimientos concurrentes con la misma solicitud, idempotencia de venta, permisos, aislamiento). Suite completa de integración: **238/238 en 12 archivos**; `ventas.postgres.integration.ts` ajustado a la regla de explicación de diferencia.
  - Backend unitarias: **326/326**. Compilación de fuentes sin errores de tipos.
  - Frontend: unitarias **163/163**; `tsc -b` sin errores; `vite build` con `VITE_API_URL=/api`; lint sin errores (avisos de hooks en `ArqueoCajaPage.tsx`, mismo patrón que `OperacionesPage`).
  - Playwright Chromium: **98/98** en suite completa, incluidas **4 E2E nuevas** `frontend/e2e/caja-simulado.spec.ts`. **Son E2E con backend simulado**: validan interfaz, bloqueo de diferencia, reintento con la misma solicitud y vista de administrador; no sustituyen la persistencia.
- **Limitaciones reales:**
  1. **Sucursal / punto de venta: NO IMPLEMENTADO.** No hay modelo de sucursal; la caja identifica empresa, código y cajero.
  2. Cajero sin permiso configurado no puede registrar entradas/salidas (el permiso debe asignarse en Usuarios).
  3. Entradas/salidas: autorizadas por permiso o rol ADMIN; no hay doble aprobación por segundo administrador.
  4. No existe corrección posterior de un cierre confirmado; el cierre no se edita y tampoco hay anulación de movimientos.
  5. Regla nueva: cerrar con diferencia exige explicación (`Explique la diferencia de caja antes de cerrar`).
  6. Comprobante = vista imprimible del navegador; no hay ticket térmico ni PDF.
  7. Pantalla no verificada en iPhone/Safari físico ni con backend real en navegador; la traducción EN no tiene prueba visual dedicada.
- **Pendientes antes de aceptación del cliente:** decidir sucursal/punto de venta; definir si la salida de efectivo requiere segundo administrador y umbral; flujo de corrección auditada de cierres; revisión en dispositivo del cliente. Merge y aceptación del cliente son decisiones separadas.

---

## Inventario — auditoría del ciclo compra→recepción→ajuste→venta y correcciones (2026-10-10 UTC)

- **Base:** `origin/claude/integracion-pos-offline-p1` `58941e5d` (head de PR #129, draft). **Rama de trabajo:** `claude/brave-carson-v2g7q5`, PR nuevo hacia esa base. No se tocó el POS offline, contingencia ni archivos de otros agentes. No hay cambios de esquema ni migraciones; no hubo merge, despliegue ni consultas a producción.
- **Reproducción:** `backend/test/inventario-ciclo.postgres.integration.ts` (PostgreSQL 16 desechable, usuario no root). Las tres pruebas del archivo fallaron antes de corregir. LEV-004 se reprodujo en una ejecución previa; su prueba se retiró porque el comportamiento depende de una decisión pendiente.

| Hallazgo | Severidad | Estado |
|---|---|---|
| **QA-AJ-001:** `POST /operaciones/productos/:id/ajuste` fijaba el stock absoluto sin comparar existencias anteriores. Recepción de 5 sobre 10 y ajuste a 12 dejó 12 (se perdieron 3). | P1 | Corregido: `stockAnterior` obligatorio (`operaciones.dto.ts`), comparación bajo bloqueo con `409 PRODUCTO_STOCK`, `version+1`. |
| **QA-AJ-002:** el mismo endpoint aceptaba ajustes sin cantidad anterior. | P2 | Corregido: `400` antes de escribir. El frontend no llama este endpoint (verificado con búsqueda en el repositorio); la edición de producto ya enviaba `stockAnterior`. |
| **QA-COS-001:** `GET /operaciones/ventas/buscar` (roles incl. VENDEDOR) devolvía `costo_unitario` de cada línea por `SELECT d.*`. CAJERO estaba cubierto por `CashierResponseInterceptor`; VENDEDOR no. | P1 | Corregido: se quita `costo_unitario` de las líneas de búsqueda. |
| **LEV-004:** aplicar un conteo sobrescribía `precioCosto`, `precioVenta` y `margen` del catálogo (costo 2→7 observado en PostgreSQL). | P1 | **Corregido en PR #134 según la regla definitiva del dueño** (ver bloque siguiente). |

**Pruebas (2026-10-10):** unitarias backend 345/345; integración PostgreSQL 374 pasan y 1 omitida (ya omitida antes) de 375, incluidas las 3 nuevas; `tsc -p tsconfig.build.json` sin errores. No se ejecutaron pruebas de frontend (no se modificó). Tests de tipo de `test/*.ts` reportan globals faltantes (`describe`/`expect`) desde antes de este cambio; no bloquean el build.

**Verificado sin defecto:** costo y margen fuera de productos para CAJERO/VENDEDOR (`publicProduct`); levantamientos solo ADMIN/BODEGUERO; cotizaciones mapean líneas sin costo; `entregas` solo ADMIN/CAJERO/BODEGUERO (CAJERO filtrado por interceptor); recepción conserva costo de la línea de compra y actualiza costo vigente incluso si baja.

**Riesgos restantes (no corregidos):**
1. Conflictos de diseño abiertos (reportados, no resueltos; ver bloque "Regla definitiva de precios").
2. Venta sin inventario (`sinInventario`) se acepta para productos con existencias: no hay validación de faltante ni reserva. Requiere regla de negocio antes de endurecer.
3. Costo manual de producto (ADMIN/BODEGUERO) sigue permitido y auditado, pendiente de decisión (ya registrado).
4. `cotizaciones.findById` devuelve `tenant: true` completo (no revisado en esta ronda; no es costo).
5. Compatibilidad: API externa que llame `/ajuste` debe enviar `stockAnterior`.
6. Sin acreditar: hardware, iPhone, sucursales y aceptación del cliente (sin cambios en esos puntos).

---

## Regla definitiva de precios e inventario — implementación en PR #134 (2026-10-10 UTC)

Regla del dueño: el levantamiento y la auditoría solo cuentan unidades; costo, precio y margen los define el dueño o ADMIN en administración de precios; la recepción de compra actualiza el costo vigente sin tocar el precio de venta.

- **Auditoría (`levantamientos.service.ts`, `aplicar`):** solo cambia `stockActual` y `version` de productos existentes, más movimiento `LEVANTAMIENTO` con responsable. No escribe `precioCosto`, `precioVenta`, `margen`, `marca` ni `codigoBarras`. Diferencias de costo, precio o margen aparecen como `advertencias` en la vista previa.
- **Producto nuevo por conteo:** se crea con identidad y existencias del conteo, `precioCosto=0`, `precioVenta=0`, `activo=false`, sin margen. Pendiente de precio y fuera de venta (las ventas solo leen productos activos).
- **Edición de precios (`productos.service.ts`, `update`):** costo, precio o margen solo los cambia ADMIN; repetir el valor vigente no cuenta como cambio (importación). Habilitar un producto exige precio de venta mayor que cero. Cambios siguen auditados en `PRODUCTO_EDITAR`.
- **Token de vista previa:** incluye precios del catálogo; un cambio de precio entre vista previa y aplicación responde 409.
- **QA-INV-001 adaptado:** la aplicación ya no reemplaza el precio vigente; versión sí incrementa.
- **Pruebas:** `inventario-ciclo.postgres.integration.ts` 9/9 (4 de regla fallan con el código anterior y pasan ahora). Se adaptaron tres pruebas unitarias del spec de levantamientos y cuatro de integración (QA-INV-001, dos de `levantamientos` y SEC-005 de `productos`). Cada una conserva su comprobación con la nueva expectativa.
- **Resultados:** unitarias 345/345; integración PostgreSQL 380 pasan y 1 omitida (preexistente) de 381; `tsc -p tsconfig.build.json` sin errores.

**Conflictos de diseño reportados (sin cambiar flujos ajenos):**
1. **Módulo de administración de precios no existe.** La edición de producto es hoy la única vía para fijar precios; el dueño debe confirmar si se construye módulo separado antes de esta regla.
2. **Estado "pendiente de precio" no tiene campo propio.** Hoy se representa con `activo=false` y precio 0. Un campo `precio_aprobado_at` requiere migración: no se creó.
3. **BODEGUERO puede dar de alta productos con precio** (`POST /productos`, alta directa). Contradice la regla; cambiarlo afecta la alta directa de BODEGUERO que el contexto ya define como vigente.
4. **Frontend de levantamiento** sigue capturando costo, precio y margen; deben ocultarse o quitarse. No se modificó.
5. **Recepción de compra** escribe `precio_costo` y `costo_vigente`. La regla habla de costo vigente; el campo `precioCosto` del producto también se actualiza. Confirmar que es el comportamiento esperado.
6. **Marca y código de barras** ya no se completan desde el conteo en productos existentes (antes sí, si el catálogo estaba vacío). Es una consecuencia de "únicamente cantidades"; confirmar.

### Decisiones de KARDEX (agente de inventario y trazabilidad) sobre PR #134 — 2026-10-10 UTC

Decisiones del dueño aplicadas en el PR: (1) edición de producto por ADMIN como vía única de precios, sin módulo nuevo; (2) pendientes con `activo=false` y precio 0, sin migración; (3) BODEGUERO no define costo, precio ni margen en alta ni edición; (4) el levantamiento no modifica costo, precio ni margen; (5) recepción actualiza costo vigente y precio de venta no cambia; (6) el levantamiento no cambia marca ni código de barras de productos existentes.

- **Identificar pendientes:** `GET /productos?pendientes=true` (solo ADMIN, mismo control que `incluirInactivos`). Cada producto devuelve `pendienteConfiguracion` = precio de venta cero. Sin campo nuevo ni migración.
- **Alta de BODEGUERO (`productos.service.ts`, `create`):** con costo, precio o margen distintos de cero responde 403. Sin precios, el producto queda `activo=false`, precios en cero, sin margen y `pendienteConfiguracion=true`. ADMIN conserva el alta anterior.
- **Edición (`update`):** solo ADMIN cambia costo, precio o margen (un valor sin cambio real no aplica). Habilitar un producto exige precio de venta mayor que cero.
- **Costo vigente y costo comercial sincronizados:** `costo_vigente` y `precio_costo` representan el mismo costo comercial vigente. Su único escritor previo era la recepción, y ningún reporte del backend lee `costo_vigente`. Se sincronizan en alta, en edición de costo por ADMIN, en recepción (ya era así) y en el producto pendiente creado desde conteo (cero).
- **Recepción de compra:** actualiza costo vigente con el costo de la compra más reciente, aunque baje; conserva un registro por recepción con proveedor en `costos_compra`; no cambia el precio de venta. Probado en PostgreSQL.
- **Frontend:** levantamiento sin captura ni columna de costo, precio o margen; la vista previa muestra advertencias informativas sin aplicarlas; captura de códigos y fotografías conservada. Alta de inventario: BODEGUERO ve nota de pendiente en lugar de precios. Edición de producto: campos de precio bloqueados para no ADMIN. Importador: BODEGUERO no envía precios; las altas quedan en cero.

**Pruebas (2026-10-10, PR #134):** unitarias backend 345/345; integración PostgreSQL 385 pasan y 1 omitida (preexistente) de 386; `tsc` backend y frontend sin errores; frontend unitarias 224/224; Playwright 118/118 con Chromium preinstalado y `VITE_API_URL=/api` local; build de producción compila; lint sin errores en ambos paquetes.

**Pruebas actualizadas por la decisión (no debilitadas):** las pruebas de alta concurrente e idempotente de BODEGUERO envían precios en cero y comprueban que el producto queda pendiente; la prueba de códigos duplicados usa ADMIN para la escritura que debe ganar; SEC-005 comprueba que BODEGUERO recibe 403 al cambiar precio y que su alta queda pendiente.

**Conflictos y riesgos abiertos (revisar antes de merge):**
1. Módulo de precios separado: no construido (decisión 1).
2. Pendiente sin campo propio: representado con `activo=false` y precio cero. Un campo `precio_aprobado_at` requeriría migración; no se creó.
3. Productos legados: `costo_vigente` puede diferir de `precio_costo` en productos creados antes de este cambio; no hay migración de datos. Requiere decisión del dueño o un script de conciliación autorizado.
4. Importador: la vista previa del archivo todavía muestra costo y precio del archivo a BODEGUERO aunque no se apliquen.
5. Sucursales: no existe modelo de sucursal; el stock es por empresa.
6. Sin prueba e2e dedicada para el levantamiento sin precios; la cobertura proviene de la suite existente, la compilación y las pruebas de integración.
7. Sin acreditar: hardware, iPhone, sucursales y aceptación del cliente.

### Cierre técnico PR #134 — KARDEX (2026-10-10 UTC)

- **P0 (corregido):** ADMIN ya no crea ni habilita productos sin precio de venta válido; fijar precio cero a un producto activo responde 400; ninguna venta usa un producto sin precio aprobado (`ventas.service.ts`).
- **P1 privacidad (corregido en servidor):** BODEGUERO no recibe costo, margen ni costo vigente en productos (`canReadProductFinancials` solo ADMIN). Levantamiento: respuestas sin costos ni margen para no ADMIN; advertencias reducidas a un conteo (`levantamiento-response.interceptor.ts`). CAJERO conserva precio de venta. Frontend: importador, inventario, edición de producto y exportación del conteo ocultan costos y márgenes a no ADMIN.
- **P1 conciliación de costos:** diagnóstico de solo lectura en `backend/scripts/diagnostico-costos-vigentes.sql`; propuesta con respaldo CSV, simulacro y rollback en `docs/CONCILIACION_COSTOS_PROPUESTA.md`. No se ejecutó ninguna corrección.
- **P2 e2e:** prueba del levantamiento: sin campos de costo, precio ni margen; el alta no envía precios; el responsable y las existencias quedan registrados; las advertencias se muestran y la aplicación envía solo el token.
- **ATLAS:** no existe rama ni PR de ATLAS en el remoto. Dependencias y superficies de conflicto en `docs/ATLAS_DEPENDENCIAS_PR134.md`; no se implementó contrato alguno.
- **Evidencia:** `docs/kardex-evidencia-pr134/RESULTADOS.md`.

### Consolidación #134 + #140 — rama temporal `claude/kardex-consolidacion-134-140` (KARDEX, 2026-10-10 UTC)

- **Base:** `claude/integracion-pos-offline-p1` (PR #129, `c5fe4982`) + PR #140 (`1d3971be`) + PR #134 (`57c64962`). Integración sin merge, despliegue ni migraciones productivas.
- **Regla de venta:** `activo AND precio_aprobado AND precio_venta > 0`. `activo` no equivale a aprobado. Solo ADMIN aprueba por `PATCH /productos/:id/precios`. Cambiar el precio de venta de un aprobado lo revoca; un cambio solo de costo lo conserva.
- **Privacidad:** BODEGUERO sin costos, márgenes ni totales de compra en productos, levantamiento, compras, historial, proveedores del producto y entregas (`SinCostosParaBodeguero`, probado por HTTP). CAJERO conserva el precio de venta autorizado.
- **Migración:** solo los productos legados con precio > 0 quedan aprobados; los de precio cero quedan pendientes.
- **Pruebas:** backend unitarias 353/353; integración PostgreSQL 402 pasan y 1 omitida (preexistente); build, lint y `tsc` sin errores. Frontend unitarias 241/241, lint, build; Playwright 128/129; e2e real 30/30 con migraciones completas. El único fallo (`contingencia-simulado`, "existencia local baja") es **preexistente en la base de #129**: en cinco repeticiones falla 3 veces sobre `c5fe4982`. No se corrigió: pertenece al POS offline de ATLAS.
- **Pendiente antes de merge:** filtro de aprobación en el catálogo offline (ATLAS); decisión del dueño sobre `POST /operaciones/compras` con costo para BODEGUERO; aprobación automática de legados con precio > 0 (NEXUS y dueño); conciliación de costos sobre datos reales (solo sintético hasta ahora).
- **Coordinación:** `docs/COORDINACION_ATLAS_NEXUS_CONSOLIDACION.md`. No hubo canal en vivo con ATLAS ni NEXUS en esta sesión.

**Riesgos abiertos antes de merge:**
1. Conciliación de costos históricos: requiere decisión del dueño (reglas A, 2 y 3 de la propuesta).
2. El historial de compras (`GET /operaciones/productos/:id/historial`) y la lista de compras siguen mostrando costos a BODEGUERO, por diseño existente de compras; decidir si se restringe.
3. Catálogo del POS offline (`contingencia.service.ts`, sincronización) puede incluir productos activos heredados con precio cero. No se modificó por regla de no tocar POS offline; coordinar con su responsable antes de merge.
4. ATLAS: sin base verificable; revisar `ventas.create` y `operaciones.entregar` antes de implementar.


---

## Inventario — estado vigente de las correcciones QA-INV (verificado en main, 2026-10-10 UTC)

Esta sección describe el estado actual. Las secciones de auditoría y reproducción siguientes son históricas: registran defectos **antes** de la corrección y no describen el código vigente.

- **PR #108 fusionado** en `main` (merge por `Nelosama`, 2026-10-10 03:57 UTC). Su rama `fix/qa-inv-estabilizacion-inventario` (head `87d7eaaf`) es ancestro de `main` `df3ae06b`; el commit `10f2590b` también está en `main`.
- **Correcciones comprobadas en el código de `main`** (no solo en la descripción del PR):
  - **QA-INV-001:** al aplicar un levantamiento, `productos.version` se incrementa (`levantamientos.service.ts`, `version:{increment:1}`). Un formulario con versión anterior recibe 409.
  - **QA-INV-001B:** al recibir mercancía, `productos.version=version+1` (`operaciones.service.ts`, recepción de compra).
  - **QA-INV-002 (P0):** la conciliación exige el `token` del grupo en conflicto (`tokenConflicto`). Si los conteos cambiaron, responde 409 `CONTEO_CONFLICTO_VERSION`. El frontend envía ese token (`LevantamientoPage.tsx`, `conciliar`).
  - **QA-INV-003:** los conflictos se agrupan con una clave única (`claveGrupo`) y se limpian los huérfanos (`limpiarConflictosHuerfanos`).
  - **QA-INV-004:** el nombre del contador se expone como `contador.nombre`, con estado `ACTIVO`, `DESACTIVADO` o `NO_DISPONIBLE`, dentro de la misma empresa. **No es `contadorNombre`**, como decía la descripción original del PR #108.
- **Pruebas:** backend unitarias ejecutadas sobre `main` `df3ae06b`: **329/329** en 34 archivos (`TZ=UTC`). Las cifras de Codex (326 backend, 250 integración PostgreSQL, 163 frontend, 13 scripts, 100 Chromium) se citan como reportadas; no se han vuelto a ejecutar en esta sesión.
- **Compatibilidad:** frontend y backend deben desplegarse juntos. Un frontend en caché que no envíe `token` no puede conciliar.
- **No validado todavía:**
  1. Hardware físico: Safari en iPhone, cámara trasera, códigos impresos reales, permiso denegado.
  2. Sucursales reales: no existe modelo de sucursal; el stock es por empresa.
  3. Aceptación del cliente.
  4. Datos productivos: no se ha ejecutado ninguna comprobación contra producción.
- **Conclusión:** las cuatro correcciones QA-INV están integradas en `main`. Eso no equivale a Inventario listo para producción.

---

## Inventario — auditoría QA independiente (2026-10-10 UTC)

- Base comprobada `origin/main` `b314ef0e` (PR #100/#101/#102/#105 fusionados); rama local `audit/inventario-independent-20261010`. Sin PR abiertos al consultar inicio/cierre; sin cambios en ramas de Claude, push, merge, despliegue ni producción.
- Informe: [AUDITORIA_INVENTARIO_INDEPENDIENTE_20261010.md](AUDITORIA_INVENTARIO_INDEPENDIENTE_20261010.md); evidencia en `docs/qa-inventario-20261010/`. Reproducciones: `backend/test/auditoria-inventario.postgres.integration.ts` y `frontend/e2e/auditoria-inventario.spec.ts`. Solo pruebas/documentación; no corregido código de producción.
- Confirmados: **QA-INV-002 P0** conciliación obsoleta elimina un conteo corregido 4→12 y permite aplicar 3; **QA-INV-001 P1** aplicar/recibir no invalidan versión del producto y aceptan formulario antiguo (precio o costo); **QA-INV-003 P1** identidad mixta ID/barcode rompe agrupación y limpia conflictos pendientes; **QA-INV-004 P2** conciliación muestra UUID en lugar de nombre del empleado.
- Ejecutadas: backend 326/326; scripts 13/13; PostgreSQL 17.11 local, usuario no root: 221 regresiones + 4 reproducciones únicas (suite inicial 224/224 incluye 3, ejecución final específica 4/4); frontend 163/163; Chromium 93/93 + 1 reproducción visual. Builds backend/frontend aprobados. Reproducciones pasan afirmando el defecto actual; no equivalen a corrección. WebKit 23/23 con APIs/cámara simuladas tras resolver bibliotecas locales y omitir el comprobador automático de dependencias; navegador real ejecutado, no iPhone físico.
- **Verificación para publicación autorizada:** reproducciones copiadas a worktree detached `b314ef0ecf2820c57b525d157918413b2972544f`, sin cambios de fuentes de producción: PostgreSQL 4/4 y Chromium 1/1. Comandos individuales/resultados en `docs/qa-inventario-20261010/REPRODUCCIONES.md`; logs de esta repetición en esa carpeta. El usuario autorizó publicar la rama de evidencia; no autoriza merge, despliegue ni correcciones. Claude implementará y QA validará después.
- Inventario **no aceptable al 100 %** con P0 abierto. Pendientes: hardware físico, fotografías locales cuando exista arquitectura, integración conjunta de conteo/reserva/entrega y aceptación de cliente. Autorizar hallazgos específicos antes de corregir; mantener reglas de reserva/entrega y costos.

---

## Inventario — corrección prioritaria para entrega al cliente (2026-10-09/10 UTC)

**Estado de esta revisión:** rama `fix/inventario-entrega-cliente` desde `origin/main` `00f72c02` (PR #103 ya fusionado). PR [#105](https://github.com/Nelosama/FerreSystem/pull/105) hacia main; sin merge, comandos de despliegue ni consultas a producción. Este bloque describe la revisión más reciente de inventario; las bitácoras fechadas de abajo se conservan como evidencia histórica.

**Continuidad y aislamiento:** revisados los PR #37/#39/#43/#44/#51/#73/#76/#79/#100/#101/#102/#103. Se reutilizan CRUD, generación de códigos internos, conteo persistente, idempotencia del conteo, conciliación multiusuario, preview/aplicar, versión de producto, auditoría y recepción con costo de última compra. Claude trabaja en PR #104 (`fix/p0-credit-integrity`): esta rama no modifica sus archivos de clientes, cotizaciones, operaciones, crédito ni sus pruebas. El único archivo compartido es este contexto, donde la sección de inventario se agrega al principio y su sección de crédito se conserva en su rama. No se modifica el esquema Prisma ni se añaden migraciones.

### Defectos confirmados y correcciones

| Hallazgo | Causa raíz | Corrección / evidencia |
|---|---|---|
| Alta directa repetida genera otro producto y otro stock inicial si no lleva código. | `POST /productos` sin identidad de solicitud; la UI no bloqueaba envíos. | `solicitudId` UUID v4 + hash estable del contenido en `PRODUCTO_CREAR`, misma transacción y bloqueo de empresa. Reintento devuelve el producto existente; clave usada con otros datos o por otro empleado responde 409. Frontend persiste clave y contenido por empresa/usuario, muestra Guardando/Guardado, y bloquea doble envío. |
| Buscar una categoría no encuentra sus productos; filtros solo incluyen categorías predeterminadas. | API busca solo campos de producto; frontend ignora categorías de catálogo. | Búsqueda por nombre de categoría y trim del término; filtros incluyen las categorías reales. Lookup del conteo anuncia búsqueda por código, descripción o categoría; captura de categoría conserva texto libre y agrega sugerencias. |
| `null` en edición puede convertir cantidades o precios a 0; códigos null pueden provocar error interno. | `@IsOptional()` omite validación de null; `Number(null)` produce cero. | Campos opcionales validan si no son undefined: null inválido responde 400 antes de escribir. `imagenUrl: null` y `margen: null` conservan sus contratos de borrado explícito. |
| Baja lógica no invalida formularios antiguos; se puede reactivar con una versión obsoleta. | DELETE no incrementa `productos.version`. | Baja incrementa versión; edición con versión anterior responde 409. |
| Un ajuste abierto antes de una recepción borra las existencias recibidas. | Recepciones/entregas cambian cantidades mediante SQL sin incrementar `productos.version`; la versión sola no detecta el cambio. | Un ajuste que cambia stock exige `stockAnterior` y lo compara dentro de la transacción. Si cambió responde `409 PRODUCTO_STOCK`; la UI recarga. Importador también envía la cantidad leída. Reproducción SQL del contrato vigente y prueba con recepción efectiva/ajuste concurrentes. |
| Alta no permite guardar descripción ni indicar venta por medida; captura datos sin persistencia y el modal resulta difícil en móvil. | `usaMedida: false` fijo; descripción omitida; controles de lote/serie/vencimiento sin campo en BD; modal sin límite vertical. | Nombre y variante primero; códigos internos automáticos; descripción y datos opcionales plegados; usaMedida editable; cantidades a dos decimales; modal desplazable y columnas adaptables. Se retiran los controles que simulaban persistencia de lote/serie/vencimiento/garantía. |
| Mensajes de cámara no reconocen errores de otro contexto; pruebas existentes no ejecutaban esa lógica. | Dependencia de `instanceof Error`; cinco pruebas comprobaban una copia de la condición. | Mapeo por nombre del error, válido para DOMException/otro realm; esas pruebas ahora llaman a `cameraError` real. Permisos, cámara ocupada/no disponible y alternativa manual en ES/EN. Seis pruebas fallaban antes del cambio. |
| Captura manual puede fallar cuando no existe `crypto.randomUUID` (LAN sin HTTPS). | randomUUID exige contexto seguro; la captura manual lo llamaba incondicionalmente. | UUID v4 con `crypto.getRandomValues` como alternativa, sin Math.random. E2E con randomUUID ausente y cámara denegada guarda manualmente una sola solicitud. Cámara sigue exigiendo HTTPS. |

**Reproducción:** en PostgreSQL 17 aislado, cuatro pruebas nuevas fallaron sobre main (alta duplicada, categoría, null, baja/version). Una quinta reprodujo pérdida de recepción al ajustar. Tras los cambios pasan. El fallo sintético de auditoría mediante trigger PostgreSQL prueba rollback después de escribir producto/categoría/movimiento, y luego se retira para reintentar la misma solicitud. No es un mock de transacción.

### Operación y cobertura

- BODEGUERO con `inventario.editar` crea directamente canaletas, láminas, varillas, tornillos y aerosoles, con cantidades enteras o decimales persistidas en PostgreSQL, sin aprobación de ADMIN para cada alta. Las variantes de medida/color/espesor son productos separados con nombre descriptivo y códigos independientes; no hay modelo de variantes relacionadas.
- El flujo de levantamiento conserva la regla previa: finalizar no aplica; solo ADMIN aplica un conteo revisado. No cambia reserva al facturar, descuento físico al entregar ni permisos de ajuste/costo manual.
- Recepciones conservan costo de la última recepción efectiva (incluso menor), histórico por compra y precio de venta sin cambio. La prueba de recepción/ajuste concurrentes usa el servicio vigente sin modificar sus archivos. La regresión de compras cubre 45 → 60 → 40, recepción parcial, reintentos y concurrencia.
- UI de alta, lookup, cámara y levantamiento traducida ES/EN. Datos de usuario y mensajes del backend conservan su idioma original. Inventario se monta con clave de tenant/usuario: no conserva formulario de otra sesión.

**Matriz de pruebas obligatorias con PostgreSQL real:**

| Criterio | Evidencia |
|---|---|
| 1. Crear producto | Altas HTTP ADMIN/BODEGUERO; cinco ejemplos de ferretería con lectura posterior de BD. |
| 2. Evitar códigos duplicados | Códigos internos/barras, activos/inactivos, carrera entre empleados: una alta y un movimiento. |
| 3. Existencias iniciales | Movimiento INICIAL, cantidad exacta, usuario, motivo y fecha. |
| 4. Actualizar cantidades | AJUSTE con motivo y stock anterior; ajuste obsoleto rechazado. |
| 5. Decimales | 12.75 → 14.25 → 13.50; movimientos +1.50 y -0.75; tercer decimal rechazado. |
| 6. Movimientos auditables | Lectura real de movimientos/auditoría con usuario, fecha, motivo y antes/después. |
| 7. Reintentos | Alta concurrente/idempotente y conteo/aplicación existentes; ajuste repetido rechazado sin segundo movimiento. |
| 8. Concurrencia | Altas/ediciones entre empleados y recepción efectiva simultánea con ajuste: ninguna recepción se pierde. |
| 9. Aislamiento tenants | Lecturas, códigos, solicitudes y escrituras ajenas; mismos códigos válidos en otra empresa. |
| 10. Atomicidad | Trigger que falla al auditar el alta revierte categoría/producto/movimiento; recepción fallida en suite de compras. |

**Resultados locales finales y límites:**

- Backend unitarias: 326/326. Scripts: 13/13. TypeScript de compilación, Nest build y lint ejecutados sin errores; avisos existentes.
- PostgreSQL real: **186/186 en 9 archivos**; `productos-edicion.postgres.integration.ts` 32/32. Clústeres temporales PostgreSQL 17.11 como usuario no root; nunca se usa DATABASE_URL de producción. DDL del esquema actual para las suites HTTP y migraciones reales en la suite de migraciones.
- Frontend: 163/163, incluidos cinco casos con ZXing real e imágenes sintéticas EAN-13/EAN-8/UPC-A/CODE-128/checksum inválido. TypeScript (`tsc -b`), Vite build y lint sin errores. Avisos previos de React y tamaño del bundle.
- Playwright Chromium: **93/93**. APIs simuladas: verifica interfaz y payloads; no acredita persistencia.
- Playwright WebKit 26.6 con emulación iPhone 13: 23/23; archivo `frontend/playwright.inventory-webkit.config.ts`. APIs y permiso de cámara simulados. **No es Safari instalado en un iPhone físico y no acredita cámara real.** El decodificador con imágenes sintéticas tampoco valida iluminación/enfoque/etiquetas del cliente.
- Comandos: `npm test`, `npm run test:scripts`, `npm run test:integration` con PG_BIN local temporal; `npm run build`/`npm run lint` en ambos paquetes; `npm run test:browser -- --workers=2`; `npx playwright test --config playwright.inventory-webkit.config.ts`.
- GitHub Actions: consultar el último head y enlaces de ejecución en la descripción del único PR. APTO PARA MERGE solo con checks aprobados y sin conflictos; no equivale a aceptación en dispositivo/infraestructura del cliente.

### Pendientes y riesgos para la primera entrega

1. **Sucursales: NO IMPLEMENTADO.** El stock es por empresa/producto, no por sucursal. No existe modelo real de sucursal. No se agregó un selector ficticio ni se reinterpretó un tenant como sucursal. Multi-sede exige definir pertenencia, existencias y permisos e integrar recepción/venta/entrega en archivos donde trabaja Claude. Se separa ese trabajo; esta revisión no acredita operación multi-sucursal. Una entrega a varias sucursales queda bloqueada.
2. **Fotografías locales: PENDIENTE de infraestructura.** Solo hay referencia textual `imagenUrl`; no hay servicio de captura/almacenamiento local compartido por Wi-Fi. No se suben imágenes a Supabase ni a otro servicio cloud. Falta definir PC principal, ubicación/retención de archivos, URL de servicio LAN, autenticación, HTTPS/certificados confiables en iPhone y acceso de las cajas por la misma Wi-Fi. Después: captura escritorio/móvil, referencia en BD, consulta en otra PC y pruebas con foto ausente/servidor desconectado. El inventario actual funciona sin foto (probado); no se afirma funcionamiento de un servidor de fotos inexistente.
3. **iPhone físico / LEV-015:** validar Safari, permiso aceptado/denegado, cámara trasera, códigos impresos reales, iluminación, cierre y regreso a la app, HTTPS de LAN y captura manual. Emulación e imágenes sintéticas dejan este punto abierto.
4. **Costo manual:** ADMIN/BODEGUERO pueden modificar costo manualmente, auditado pero fuera de la regla de última recepción. Se conserva el permiso por instrucción; pendiente decisión sobre restricción y motivo obligatorio. Precio de venta no se actualiza automáticamente.
5. **Compatibilidad de clientes antiguos:** ajustes que cambian cantidades sin `stockAnterior` ahora reciben 400; null inválido recibe 400. Frontend, importador y backend deben actualizarse juntos cuando se autorice. Reintentos de alta solo son idempotentes si se envía solicitudId; la UI lo hace. La auditoría usada para idempotencia debe conservarse; consulta sin índice de expresión específico, a medir para empresas con historial muy grande.
6. **Funciones no implementadas:** variantes relacionadas, lotes, series, vencimientos, conversión de unidades. Ubicación queda en historial del conteo. No se ofrecen controles que prometan guardar esos datos en el catálogo.
7. **Importador:** conserva la decisión vigente de sobrescribir cantidades/precios con confirmación; ahora protege la cantidad anterior. Un archivo no reemplaza la revisión del empleado. No se cambia esa regla de negocio.

**Veredicto de alcance:** las correcciones permiten alta y administración persistentes para una tienda con empleado autorizado. Merge y aceptación del cliente son decisiones separadas: multi-sucursal y cámara/fotos en red física no están acreditadas. Sin merge ni despliegue.

---

## 1. Estado comprobado — 2026-10-09

- Repositorio: `Nelosama/FerreSystem`; checkout local: `C:\Users\Nelo\Documents\GitHub\FerreSystem`.
- **HEAD de `main` verificado:** `600486a9` — Merge PR #76 codex/fix-iphone-barcode-scanner (2026-10-09). PR #77 (docs) también fusionado (`26fad5ac`).
- Rama activa de auditoría: `fix/levantamiento-barcode-audit` — rebased sobre `origin/main` (`f06b2bfb`). PR #76 está en main; nuestros fixes P1 re-aplicados correctamente sobre sus cambios.
- PR #76 `codex/fix-iphone-barcode-scanner`: **FUSIONADO** a main (`600486a9`). Introduce `LevantamientoProductLookup` en lugar de `BarcodeScanner`.

### Siguiente paso autorizado
- **Daniel** hace push de la rama de auditoría desde su máquina:
  ```bash
  git push origin fix/levantamiento-barcode-audit   # PR de auditoría P1 (rebased)
  git push origin wip/incompleto-codex              # aísla trabajo incompleto
  ```
- Abrir PR de `fix/levantamiento-barcode-audit` → revisión antes de merge.
- PR #76 ya está en main; no requiere acción adicional.
- Para continuar levantamiento: ver §4 y tabla de pendientes; priorizar los estrictamente necesarios para un conteo real (ítems 2 y 5 de PENDIENTES).

---

## 2. Objetivo y reglas de negocio

Sistema SaaS multi-tenant para ferreterías: POS, inventario, levantamiento físico, cotizaciones, devoluciones, app móvil y respaldos. Un solo backend NestJS + Prisma + PostgreSQL; frontend React + Vite. Multi-tenant por `tenantId` con `TenantGuard` en cada controlador.

**Reglas críticas confirmadas:**
- `FINALIZADO` ≠ `APLICADO AL INVENTARIO`. Son etapas separadas con autorización explícita.
- Solo `ADMIN` puede ejecutar `POST /levantamientos/:id/aplicar`.
- El barcode del catálogo no se sobreescribe salvo que el conteo haya coincidido por barcode (`matchedByBarcode=true`) o el catálogo no tuviera barcode previo.
- `seed-alex.spec.ts` solo se ejecuta manualmente con variables de entorno; está excluido de CI (`testIgnore: ['**/unsafe/**']`).
- No desplegar ni hacer merge sin verificar `GET /api/health` y tests en copia aislada.

---

## 3. Arquitectura actual del sistema

| Capa | Tecnología | Estado |
|---|---|---|
| Backend | NestJS + Prisma ORM + PostgreSQL | IMPLEMENTADO |
| Frontend | React + Vite + TypeScript | IMPLEMENTADO |
| Auth | JWT + refresh token | IMPLEMENTADO |
| Multi-tenancy | TenantGuard + tenantId en cada query | IMPLEMENTADO |
| POS / Ventas | Módulo completo con crédito | IMPLEMENTADO |
| Cotizaciones | Conversión a venta (FUNC-001 corregido) | IMPLEMENTADO |
| Devoluciones | Solicitud + autorización ADMIN | IMPLEMENTADO |
| Inventario / Productos | CRUD + filtros + datos financieros protegidos | IMPLEMENTADO |
| Levantamiento de inventario | Flujo BORRADOR→EN_PROGRESO→FINALIZADO→aplicar | IMPLEMENTADO (ver tabla §4) |
| Escáner de código de barras | BarcodeDetector API nativa + fallback ZXing | PARCIAL — sin validar en dispositivo real |
| App móvil | PWA + React Native en evaluación | EN DESARROLLO |
| Notificaciones push | Diseño pendiente | PENDIENTE |
| Compras / Proveedores | Rama `feat/compras-proveedores` | EN DESARROLLO |
| Sucursales / Multi-sede | Propuesta documentada | PENDIENTE |
| Respaldos automáticos | Sin configurar en producción | BLOQUEADO — requiere acción en Render/Supabase |

---

## 4. Estado real del módulo de levantamiento de inventario

### Lo que está IMPLEMENTADO (confirmado en código, main `bbdaec3f`)

| # | Funcionalidad | PR / commit | Notas |
|---|---|---|---|
| LEV-001 | Normalización de `codigoBarras` en captura, corrección y `preview()` | PR #73 `fcc17492` | Trim + null si vacío; evita duplicados por espacios |
| LEV-001b | `preview()` detecta barcode duplicado dentro del conteo | PR #73 | Error en `errores[]` |
| LEV-002 | Idempotencia de conteo con `solicitudId` + `fingerprint` | PR #73 | Parcial: solo en createItem |
| LEV-008 | Auditoría: `audit()` en crear/editar/eliminar item y al aplicar | PR #73 | vía `ledger.ts` |
| LEV-010 | Exportación CSV y Excel desde `LevantamientoPage` | PR #73 | Incluye `codigoBarras` en export |
| LEV-011 | Vista previa transaccional antes de aplicar (`preview()` + `token`) | PR #73 | Token de fingerprint impide aplicar con datos obsoletos |
| LEV-012 | Aplicación transaccional al inventario (`aplicar()` + `movement()`) | PR #73 | Solo ADMIN; `lockTenant` por TX |

### Correcciones de auditoría aplicadas (rama `fix/levantamiento-barcode-audit`, commit `c9a92352` — **pendiente de PR y merge**)

| Hallazgo | Severidad | Corrección |
|---|---|---|
| `aplicar()` sobreescribía barcode del catálogo silenciosamente con el del conteo | **P1** | Solo actualiza si `matchedByBarcode=true` o `catalogBarcode=null`; `preview()` ahora emite error cuando difieren |
| Non-null assertions `precioCosto!` / `precioVenta!` en `aplicar()` — crash potencial | **P1** | Reemplazados por `?? 0` |
| `@MaxLength` faltante en `codigoBarras` de `CreateLevantamientoItemDto` y `UpdateLevantamientoItemDto` | **P1** | `@MaxLength(100)` añadido |
| Columna de código de barras invisible en tabla de ítems (`codigo\|\|codigoBarras` en una celda) | **P2** | Dos columnas separadas: **Código** y **Código de barras** |
| `@MaxLength` faltante en `codigoBarras` de DTOs de Producto | **P3** | `@MaxLength(100)` añadido |
| 4 tests de regresión para los P1 | — | Suite `Auditoría P1 — protección de código de barras del catálogo` |

### Lo que está PENDIENTE (de `PENDIENTES_LEVANTAMIENTO_INVENTARIO.md`)

| # | Funcionalidad | Prioridad | Estado |
|---|---|---|---|
| LEV-002 completo | Idempotencia de alta para operaciones simultáneas desde múltiples dispositivos | P0 | PENDIENTE |
| LEV-003 | Código fabricante en conciliación de catálogo | P0 | PENDIENTE |
| LEV-004 | Divergencia de costo entre conteo y catálogo | P1 | PENDIENTE |
| LEV-005 | Validación de fracciones y unidades en conteo | P1 | PENDIENTE |
| LEV-006 | Selector de categorías en captura | P2 | PENDIENTE |
| LEV-007 | Validación de CSV importado | P2 | PENDIENTE |
| LEV-013 | Zonas y reconteos | P2 | PENDIENTE |
| LEV-014 | Modo offline / cola local / idempotencia de sincronización | P2 | PENDIENTE |
| LEV-015 | Cámara para captura de código de barras validada en iPhone real | P1 | PARCIAL |
| LEV-016 / ítem 11 | Exportación con plantillas de columnas configurables | P2 | PARCIAL (CSV/Excel sin plantillas) |
| Ítem 2 | Levantamiento multiusuario simultáneo + conciliación por usuario | P1 | PENDIENTE |
| Ítem 3 | Modo offline con IndexedDB + service worker | P2 | PENDIENTE |
| Ítem 7 | Zonas, progreso por zona y asignación de usuarios | P2 | PENDIENTE |
| Ítem 9 | Reconteo y validación de diferencias | P2 | PENDIENTE |

---

## 5. Integración del escáner de código de barras (PR #76)

**Rama:** `codex/fix-iphone-barcode-scanner` | **PR #76** — **FUSIONADO** a main (`600486a9`, 2026-10-09). Revisado por Jules.

**Lo que hace el PR:**
- `frontend/src/utils/barcodeScanner.ts`: detección por feature-flag — usa `BarcodeDetector` API nativa si existe, cae a ZXing si no.
- `frontend/src/utils/zxingDecoder.ts`: decodificador software (EAN-13, EAN-8, UPC-A, CODE-128) usando canvas.
- `frontend/src/components/BarcodeScanner.tsx`: componente React con video, start/stop, errores en español, manejo de visibilidad.
- Mensajes de error mapeados a español (`NotAllowedError`, `NotFoundError`, `NotReadableError`, etc.).

**Estado de seguridad (E15 — verificado):**
- `seed-alex.spec.ts` usa solo `process.env.SEED_*` — sin credenciales hardcodeadas ✅
- `assertSafeEnvironment()` bloquea ejecución contra dominios de producción ✅
- `playwright.config.ts` excluye `**/unsafe/**` del CI ✅
- Merge con `origin/main` realizado localmente (`eb0aadb2`), integra correcciones E15 del PR #75.

**Lo que NO está validado:**
- Prueba real en iPhone físico del cliente.
- Prueba con etiquetas impresas de la ferretería.
- Comportamiento con cámara frontal vs trasera.

**Bloqueo previo de Jules (QA FAIL):** credenciales hardcodeadas en versión anterior de `seed-alex.spec.ts`. Resuelto en PR #75 y verificado en rama #76.

---

## 6. Historial de PRs — estado real verificado

| PR | Rama | Estado | Merge commit | Fecha | Descripción |
|---|---|---|---|---|---|
| #73 | `codex/fix-levantamiento-inventario` | **FUSIONADO** | `fcc17492` | 2026-10-08 | Normalización barcode LEV-001, preview, aplicar al inventario |
| #74 | `docs/bitacora-ux-fotos-20261008` | **FUSIONADO** | `66496008` | 2026-10-08 | Documentación UX/fotografías/topología WiFi |
| #75 | `fix/e15-seed-alex-isolation` | **FUSIONADO** | `f7822c1f` | 2026-10-08 | Aislamiento seed-alex (E15), guard producción, testIgnore |
| #76 | `codex/fix-iphone-barcode-scanner` | **FUSIONADO** | `600486a9` | 2026-10-09 | Escáner de barras iPhone; `LevantamientoProductLookup` reemplaza `BarcodeScanner` |
| — | `fix/levantamiento-barcode-audit` | **EN REVISIÓN** (local, rebased) | `f06b2bfb` | 2026-10-09 | Correcciones P1 auditoría + rebase sobre main post-PR#76; push y PR pendientes |
| — | `wip/incompleto-codex` | **LOCAL** | — | — | Aísla trabajo incompleto `907b33db`; push pendiente |

**Nota sobre `907b33db` (Incompleto Codex):** este commit se subió directamente a `main` en una rama ya mergeada. Fue revertido en `bbdaec3f` (HEAD actual de main). El trabajo original queda preservado en la rama local `wip/incompleto-codex`.

---

## 7. Pruebas ejecutadas y sus limitaciones

| Suite | Cobertura | Entorno | Limitación |
|---|---|---|---|
| Backend unit (Vitest) — PR #73 | 10/10 levantamiento + suites anteriores | Mocks en memoria | `@rolldown/binding-wasm32-wasi` falla en Linux cloud (binario Windows); ejecutar solo desde máquina local con `cd backend && npm test` |
| Integración PostgreSQL — PR #73 | 9/9 barcode + tenant isolation | PostgreSQL real (contenedor temporal) | No usa la base cloud; no valida migración de historial Prisma |
| Frontend unit — PR #76 | 120/120 + 23 barcode | Vitest + jsdom | Mismo problema rolldown en cloud; ejecutar local |
| E2E Playwright — excluidos unsafe | `**/unsafe/**` excluido de CI | — | `seed-alex.spec.ts` solo manual con `.env` configurado |
| Auditoría P1 (nueva suite) | 4 tests `levantamientos.service.spec.ts` | Mocks en memoria | Misma limitación rolldown; pendiente de ejecutar en local |

**No se ha validado nada en producción (Render/Supabase cloud).** El error HTTP 500 al cargar resumen del dashboard reportado el 2026-10-07 sigue sin diagnóstico cerrado (`PROD-QA-20261007-01`).

---

## 8. Pendientes críticos y riesgos de producción

| ID | Descripción | Riesgo | Estado |
|---|---|---|---|
| PROD-QA-20261007-01 | HTTP 500 en resumen dashboard — posible desajuste de esquema Supabase | 🔴 ALTO | Sin diagnóstico cerrado |
| E03 | Respaldo del cliente no configurado; sin restauración verificada | 🔴 ALTO | BLOQUEADO |
| E05 | Acceso web 2026-10-07: panel visible pero errores en resumen y sin respaldos automáticos | 🔴 ALTO | Diagnóstico pendiente |
| E07 | App instalable (PWA) del dueño — push independiente no funciona desde navegador | 🟡 MEDIO | Confirmado 2026-10-05; sin solución |
| LEV-015 | BarcodeScanner no validado en iPhone físico del cliente | 🟡 MEDIO | PARCIAL |
| `c9a92352` | Correcciones P1 auditoría barcode — código listo, sin PR ni merge | 🟡 MEDIO | Push pendiente |
| SEC-012 | Impersonación local sin auditoría durable | 🟡 MEDIO | PENDIENTE |
| wip/incompleto-codex | Trabajo incompleto de Codex revertido de main; sin revisar ni descartar | 🟡 MEDIO | Aislado en rama local |

---

## 9. Bitácora 2026-10-09 (esta sesión)

| Operación | Resultado |
|---|---|
| **Task A** — Revert `907b33db` ("Incompleto Codex") | Commit `bbdaec3f` en main; rama `wip/incompleto-codex` creada. Push pendiente (Daniel). |
| **Task B** — Desbloquear PR #76 (Jules QA FAIL E15) | Verificado: no hay credenciales hardcodeadas, `testIgnore` correcto, merge con main `eb0aadb2`. PR #76 fusionado por Daniel. |
| **Task C** — Auditoría PR #73, fase 1 | Último PR Codex en main = PR #73 (`fcc17492`). No hay solapamiento con PR #76. |
| **Task C** — Auditoría PR #73, fase 2 | Clasificación: 3 defectos P1, 1 P2, 1 P3. Ver tabla §4. |
| **Task C** — Auditoría PR #73, fase 3 | Correcciones aplicadas en `fix/levantamiento-barcode-audit` (`c9a92352`). 5 archivos, 81 líneas. |
| **PR #77** — Docs actualización | Fusionado a main (`26fad5ac`). CONTEXTO_MAESTRO vigente en main. |
| **PR #76 fusionado** — Diagnóstico de conflicto | PR #76 revirtió todos los P1 fixes de `c9a92352`. Diagnóstico completo registrado. |
| **Rebase** — `fix/levantamiento-barcode-audit` | Rebased sobre `origin/main` (nuevo hash `f06b2bfb`). P1 fixes re-aplicados correctamente sobre código de `LevantamientoProductLookup`. Sin conflictos. |
| **Análisis `??0`** — `precioCosto??0`/`precioVenta??0` | Verificado seguro: `preview()` bloquea nuevos productos sin precio; existentes obtienen precio del catálogo. `??0` evita crash de non-null assertion sin introducir precios incorrectos. |
| **Diagnóstico pendientes** — ítems 2,3,5-11 PENDIENTES | Item 5 (barcode cámara): PARCIAL vía PR #76. Exportación CSV/Excel: PARCIAL (sin plantillas). Ítem 2 (multiusuario), 3 (offline), 7 (zonas), 9 (reconteo): NO implementados. |
| **Documentación** | Este archivo actualizado. Rama `docs/contexto-levantamiento-post-rebase`. |
| **PR #79 — Auditoría P1/P2 completada** | Dos defectos confirmados y corregidos. Commit `bac89b1b` en rama `docs/contexto-levantamiento-post-rebase`. **Pendiente: push y merge manual.** |
**FS-03 (2026-10-09)** — rama `fix/fs-03-password-predeterminada`, PR abierto, sin merge/despliegue. Se eliminan `Ferre2026!`/`FerreAdmin2026!` precargadas en `UsuariosPage.tsx` y `SuperAdminPage.tsx`; botón «Generar contraseña segura» (`frontend/src/utils/generatePassword.ts`, CSPRNG). Backend: `backend/src/common/password-policy.ts` (≥8, letras+números, lista bloqueada) en crear/editar usuario y admin de tenant; test `common/password-policy.spec.ts`. Backend 119/119, frontend 122/122, tsc OK. **Pendiente:** `backend/prisma/seed.ts` aún usa `Ferre2026!` (solo desarrollo; no ejecutar en producción); usuarios existentes con esa clave deben cambiarla.

**SEC-012 (2026-10-09)** — rama `fix/sec-012-auditoria-impersonacion`, PR #94, sin merge/despliegue. Trazabilidad extremo a extremo de sesiones de soporte:
- Emisión (`SuperAdminService.supportToken`): solo lectura por defecto; exige `motivo` (≥10); escritura exige `confirmarEscritura` y dura 10 min (lectura 15); genera `soporteSesionId`; registra `SOPORTE_IMPERSONAR` (superadmin, motivo, sesión, expiración; nunca el token) antes de firmar, y si falla no se emite.
- Validación (`jwt.strategy.ts`): un token con `impersonatedBy` requiere `soporteSesionId` y que el Super Admin siga activo (revocación inmediata).
- Bloqueo: `TenantGuard` (403 en no-GET con `readOnly`, registra `SOPORTE_ESCRITURA_DENEGADA`) + defensa en profundidad en `SupportAuditInterceptor`.
- Auditoría: `common/support-context.ts` (AsyncLocalStorage alimentado solo por el JWT validado); `ledger.audit()` añade `datos._soporte {superAdminId, soporteSesionId, readOnly, resultado}` a las 27 auditorías existentes (misma transacción que la operación); `SupportAuditInterceptor` registra `SOPORTE_ESCRITURA_INICIO` ANTES de cualquier escritura (si falla, no se ejecuta) y `SOPORTE_ESCRITURA_RESULTADO` (OK/ERROR). No se guarda cuerpo, query, cabeceras ni tokens.
- Frontend: `SuperAdminPage`/`TenantContext`/`TopBar` envían el motivo y piden justificación para activar edición.
- Pruebas: backend unit/HTTP 285/285 (`common/support-impersonation.http.spec.ts` 14 casos, `super-admin.service.spec.ts`); frontend 122/122, tsc OK; **PostgreSQL 16 aislado** `test/soporte-auditoria.postgres.integration.ts` 6/6 (pago atribuido, solo lectura, rollback si falla la auditoría, fail-closed, aislamiento de tenant, Super Admin desactivado). Ejecutado con `PG_BIN=/usr/lib/postgresql/16/bin` como usuario no root.
- **Limitaciones pendientes (no declarar resuelto del todo):** (1) columnas de negocio como `usuario_id`/`entregado_por` siguen mostrando al usuario representado; la identidad real vive en `auditoria_operaciones.datos._soporte`. (2) Escrituras sin llamada a `audit()` (p. ej. clientes, configuración del tenant) quedan cubiertas solo por los registros INICIO/RESULTADO del interceptor (sin before/after de datos y no en la misma transacción). (3) El resultado de `SOPORTE_ESCRITURA_RESULTADO` es best-effort. (4) No se probó en navegador ni contra la base real.

### Auditoría PR #79 (2026-10-09)

**Hallazgo P1 — `??0` silencia precios null del catálogo:**
- En `preview()`, `rows.push` calculaba `precioCosto: p ? Number(p.precioCosto) : null`. Cuando `p.precioCosto` es null en el catálogo, `Number(null) = 0`. El row llegaba a `aplicar()` con `precioCosto: 0`, no `null`, así que el guard `??0` nunca disparaba. Se escribía 0 en el catálogo silenciosamente.
- **Corrección**: `rows.push` ahora preserva null: `p ? (p.precioCosto == null ? null : Number(p.precioCosto)) : null`.
- **Guard en `aplicar()`**: reemplazado `??0` por throw `BadRequestException` explícito si precio es null.

**Hallazgo P2 — tests solo cubrían `previsualizar()`, no `aplicar()`:**
- La suite existente ("Auditoría P1 — protección de código de barras del catálogo") tenía 4 tests, todos terminaban en `previsualizar()`. Ninguno inspeccionaba `producto.update.mock.calls`.
- **Corrección**: nueva suite "Auditoría P1/P2 — aplicar() protege barcode y precios" con 5 tests:
  1. barcode mismatch bloquea `aplicar()` — `producto.update` nunca se llama
  2. barcode persiste cuando `matchedByBarcode=true`
  3. barcode se asigna cuando `catalogBarcode` era null
  4. `precioCosto`/`precioVenta` del catálogo se preservan (nunca 0)
  5. precio null en catálogo lanza error explícito (no escribe 0)

**Resultado de tests:** 19/19 ✅ (`npx vitest run src/levantamientos/levantamientos.service.spec.ts`)

**Estado del commit:** `bac89b1b` en rama `docs/contexto-levantamiento-post-rebase` — **pendiente push manual** (credenciales GitHub no disponibles en sesión cloud).

**Acción requerida por Daniel:** `git push origin docs/contexto-levantamiento-post-rebase`


### Bitácora FS (sesión autónoma 2026-10-09)

| FS | Estado | Rama | Evidencia |
|---|---|---|---|
| FS-01 | Corregido, PR abierto (sin merge/despliegue) | `fix/fs-01-pos-vencimiento-iso` | Causa: `@IsOptional()` no omite `''`; el pendiente corregido del POS guardaba `vencimiento: ''` y el backend respondía "must be a valid ISO 8601 date string", dejando la venta pendiente bloqueada. Fix: `backend/src/common/empty-to-undefined.ts` aplicado a `vencimiento` en ventas/operaciones/compras + POS envía `pending.vencimiento \|\| undefined`. Test: `backend/src/ventas/create-venta-vencimiento.spec.ts` (11/11 en `src/ventas`). No validado en navegador ni producción. |

### Bitácoras anteriores (resumen)

- **2026-10-08** — Jules PR #67: FUNC-002/004; Codex SEC-005 PR #70; Codex FUNC-001 rama `fix/func-001-cotizacion-venta`; Codex LEV-001 PR #73; docs UX PR #74; E15 PR #75.
- **2026-10-05** — Auditorías Jules (funcional, seguridad, arquitectura); diagnósticos QA; recuperación usabilidad admin/caja.
- **2026-10-04** — Diagnóstico main; operación piloto; validación integración y sesiones.
- **Histórico completo:** ver §9 Anexo y `docs/AUDITORIA_RAMA_20261005.md`.

---


### FS-41 — actualización de continuidad (2026-10-09)

- Auditoría, garantías, configuración de infraestructura, evidencia y pendientes de esta rama: `docs/FS-41-RESPALDOS.md`.
- Código en revisión: `feat/fs-41-automatizacion-tecnica`, base `origin/main` `64291e76`; ver PR enlazado en Bitácora de continuidad de FS-41.
- Worker Restic cifrado con verificación de checksum/restauración aislada previo a retención. Prueba PostgreSQL 18 + restic local temporal pasa, pero NO configura ni acredita destino remoto de producción. Backup operativo permanece BLOQUEADO hasta despliegue a staging y prueba externa satisfactoria.
- Consola movida del dashboard ADMIN a Super Admin; rutas con `SuperAdminGuard`. Tests backend/frontend y limitaciones en documento FS-41.
- Sin cambios a base/producción, sin merge ni despliegue. Pendiente infraestructura de cliente, credenciales externas fuera del repo, webhook/monitor, restauración staging y revisión PR.
### FS-06 — auditoría e integridad del levantamiento inicial de inventario (2026-10-09)

- **Rama:** `fix/fs-06-levantamiento-inventario` desde `origin/main` `4c104a24`. PR abierto hacia `main`. Sin merge ni despliegue.
- **Ya resuelto en `main` antes de este trabajo (verificado en código, no reabierto):** normalización y protección de barcode (PR #73/#76, LEV-001); guard de precio null en `aplicar()` (`levantamientos.service.ts`, auditoría P1 de PR #79); `@MaxLength(100)` en `codigoBarras` de DTOs de levantamiento y producto; idempotencia de alta por `solicitudId` con hash de contenido; bloqueo de doble envío en frontend (`inFlight`) y `solicitudId` persistido en `localStorage` para reintentos; `lockTenant` en alta y edición de productos (no hay duplicado por concurrencia en `productos.create`).
- **Defectos confirmados con pruebas en PostgreSQL real (HTTP) que fallaban antes del cambio y ahora pasan:**
  1. `productoId` de otra empresa se guardaba sin validar en el conteo → ahora `400` (`createItem`).
  2. `heartbeat` creaba presencia en levantamientos de otra empresa → ahora `404`.
  3. Producto heredado con código en minúsculas no se identificaba en preview/aplicar → se creaba un producto duplicado que solo difería en mayúsculas. Corregido con comparación sin distinguir mayúsculas.
  4. Editar un conteo para que coincida con el de otro usuario no marcaba conflicto → alta y edición usan ahora la misma regla (`conflictingItems`) y limpian conflictos huérfanos.
- **Protecciones verificadas que ya pasan (regresión añadida):** dos solicitudes simultáneas con el mismo `solicitudId` crean un solo ítem y una sola auditoría `CONTEO_CREAR`; reintento tras pérdida de respuesta no duplica existencias; editar solo el nombre de un producto conserva código, barcode, costo, precio, existencias y unidad.
- **Pruebas:** integración PostgreSQL 16 (`levantamientos.postgres.integration.ts`): antes del cambio 4 de 16 fallaban (defectos 1–4); tras la corrección 16/16. Suite de integración completa **6 archivos, 86/86**. Unitarias backend **316/316** (en `main`; 3 mocks de la unitaria se ajustaron para el nuevo comportamiento sin relajar aserciones). `tsc -p tsconfig.build.json` y oxlint sin errores. Todo ejecutado como `nobody` (`runuser`).
- **Permisos y tenant:** cubiertos por pruebas existentes: CAJERO `403` en alta de productos, levantamientos y conteo; BODEGUERO sin permiso `403` y no puede aplicar; aislamiento de levantamientos, ítems y productos entre empresas.
- **No implementado (fuera de lo verificable o requiere decisión):**
  - **Fase 3 UX** (búsqueda por categoría, flujo de escáner en móvil, confirmaciones visibles): no modificada en este PR. Requiere validación en navegador y dispositivo real, no hecha aquí.
  - **Fase 4 fotografías:** no implementada. La bitácora `BITACORA_UI_UX_FOTOGRAFIAS_20261008.md` deja pendiente topología Wi‑Fi, HTTPS LAN y servicio local. Solo existe el campo `imagenUrl` (texto). No se simula.
  - **Lotes, series, vencimientos y garantías:** `Producto` no tiene esos campos en el esquema. No se inventó modelo. Garantías existe en frontend, sin verificar persistencia en backend.
- **Decisiones pendientes (requieren autorización, no implementadas):**
  1. `marca`, `categoría`, `ubicación` y `notas` se capturan en el conteo, pero al crear un producto nuevo solo se usan `categoría` y `descripción`. `marca`, `ubicación` y `notas` no se persisten en el catálogo porque `Producto` no tiene esos campos. Opciones: ampliar `Producto` (cambio de esquema) o documentar que quedan solo en el historial del conteo.
  2. Mismo usuario captura el mismo producto dos veces: no se marca conflicto al capturar; el bloqueo ocurre al previsualizar ("Conteo duplicado"). Regla de negocio: ¿sumar, reemplazar o advertir al capturar?
  3. `POST /levantamientos` no tiene idempotencia (sin `solicitudId`). Un reintento tras pérdida de respuesta puede crear dos levantamientos. El frontend lo evita con bloqueo de doble clic, pero no ante reintento de red.
- **Riesgos residuales:** Playwright y navegador real no ejecutados; iPhone y cámara sin validar (LEV-015); `ubicacion` solo en historial; búsqueda de preview sin índice para códigos muy numerosos (`OR` con una cláusula por código); mocks de la unitaria dependen de la forma de la consulta.

### FS-06 fase 2 — levantamiento de inventario listo para operación (2026-10-09)

- **Base:** `main` `318802ab` (PR #100, FS-06 fase 1, **ya fusionado** por `Nelosama` el 2026-10-09 19:31 UTC). Esta fase no duplica correcciones de fase 1. Rama `fix/fs-06-fase-2-levantamiento-operacion`. PR abierto hacia `main`. Sin merge ni despliegue.
- **Estado de decisiones de fase 1:** (1) marca → **resuelta** en esta fase. Ubicación → **bloqueada** (ver pendientes). (2) mismo empleado repetido → **resuelta**: se rechaza con `409 CONTEO_DUPLICADO`; el empleado debe editar el conteo anterior. (3) idempotencia de `POST /levantamientos` → **resuelta** con clave persistida y unicidad en PostgreSQL.

**Hallazgos de la auditoría (antes de cambiar código)**

- La **marca** se captura en el formulario y en el conteo, pero `Producto` no tenía campo: se perdía al aplicar. Tampoco se podía editar en el catálogo (`ProductoGestion` y alta en `InventarioPage`).
- La **categoría** sí se conservaba al crear y editar productos (`productos.service`). En el conteo solo se usaba al crear un producto nuevo al aplicar; no se modifica en productos existentes.
- Un empleado que repetía un artículo **no** recibía conflicto: el duplicado solo se detectaba al previsualizar (`Conteo duplicado`).
- `POST /levantamientos` no tenía idempotencia: un reintento tras perder la respuesta podía crear dos levantamientos.
- **Ubicación** y **notas**: la ubicación no existe a nivel de sucursal (no hay modelo de sucursal). Las notas se guardan en el ítem y en la auditoría `CONTEO_CREAR`/`CONTEO_EDITAR`, pero no se copian al catálogo (correcto).
- Frontend: sin advertencia antes de guardar; sin confirmación visible al confirmar un conteo pendiente tras un fallo de red; `ConflictosPanel` llamaba `useState` dentro de un `map` (incumple reglas de hooks, `oxlint` lo marcaba como error).
- **Lotes, series, vencimientos y garantías:** `Producto` no tiene esos campos; no se inventó modelo.

**Cambios implementados**

- **Catálogo / marca:** `marca` en alta y edición (DTO máx. 100); se devuelve en la respuesta pública; una actualización parcial o vacía **no borra** la marca existente. `ProductoGestion` e `InventarioPage` la muestran.
- **Aplicar:** productos nuevos reciben la marca del conteo; productos existentes solo la reciben **si el catálogo no tiene marca**. Nunca se sobrescribe. Vista previa expone `catalogMarca`.
- **Duplicados:** `coincidencias()` devuelve todos los ítems que coinciden por producto, código o código de barras. Si el mismo empleado ya lo contó → `409 CONTEO_DUPLICADO` con `itemId` (alta y edición). Si lo contó otro empleado → se registra con `conflicto=true` para conciliación del administrador (sin cambio de regla). Nunca se suman cantidades. La protección se apoya en `lockTenant`, por lo que dos solicitudes simultáneas no la evaden.
- **Idempotencia de `POST /levantamientos`:** `solicitudId` (UUID v4, opcional). Misma clave y mismos datos → devuelve el levantamiento original. Misma clave con otros datos → `409` controlado. Concurrencia serializada por `lockTenant` y respaldada por índice único `(tenant_id, solicitud_id)`. Alta ahora genera auditoría `LEVANTAMIENTO_CREAR`.
- **Frontend (levantamiento):** clave de creación persistida en `localStorage` (un fallo de red la conserva; 400/409/422 la descartan); advertencia **bloqueante** del propio duplicado con botón «Editar conteo anterior» y botón de guardar deshabilitado; advertencia **informativa** cuando otro empleado ya contó el artículo; confirmación visible «Guardado: …» también al confirmar un conteo pendiente; `ConflictoFila` extraída (corrige la regla de hooks).

**Migraciones**

- `backend/prisma/migrations/20261009120000_fs06_marca_idempotencia_levantamiento/migration.sql`: `productos.marca TEXT NULL`; `levantamientos.solicitud_id TEXT NULL`, `levantamientos.solicitud_hash TEXT NULL`; índice único `levantamientos_tenant_id_solicitud_id_key`. Solo agrega columnas nullables e índice; **no modifica filas existentes ni inventarios**. Los levantamientos históricos quedan con `solicitud_id` NULL, que el índice no compara. Reversión manual si hiciera falta: `DROP INDEX`, luego `DROP COLUMN` (sin pérdida de datos previos).
- Las listas explícitas de migraciones de `ventas.postgres.integration.ts` y `reportes-zona-horaria.postgres.integration.ts` se actualizaron con la nueva migración.

**Pruebas**

- Unitarias backend: **331/331** (`levantamientos.service.spec.ts`: 31/31; la prueba de «mismo usuario sin conflicto» pasó a verificar `CONTEO_DUPLICADO` y que no se crea ítem).
- Integración PostgreSQL (`levantamientos.postgres.integration.ts`): **30/30**. Nuevas: marca persistida y actualizaciones parciales; categoría; aplicar con/sin sobrescribir marca; campos opcionales; notas solo en auditoría; duplicado propio por código, producto y edición; simultáneas con claves distintas; conflicto entre empleados; reintento tras pérdida de respuesta; creación simultánea con la misma clave; clave reutilizada con datos distintos; aislamiento entre empresas; flujo completo con reintento de aplicación sin movimientos duplicados.
- La prueba «bloquea dos barcodes equivalentes» se reescribió: la captura por API ahora responde `409`, y la red de seguridad del preview se prueba con un duplicado insertado directamente.
- Suite de integración completa: **7 archivos, 120/120** (incluye migraciones desde cero con `migrate deploy`).
- Frontend `npm test`: **143/143**. `tsc -b`, `vite build` y oxlint de archivos tocados: sin errores.
- Playwright (`frontend`, suite de la CI): **71/71** (64 previas + **7 nuevas** de `e2e/levantamiento.spec.ts`: fallo de red al crear, reintento de conteo pendiente, duplicado propio con edición, aviso de otro empleado, 409 de carrera entre dispositivos, flujo completo hasta aplicar, y móvil 390 px sin desbordamiento). Las E2E usan un servidor simulado en memoria por prueba: validan la interfaz, no el backend real.
- Todo ejecutado como `nobody` (PostgreSQL 16).

**Riesgos residuales**

- Interpretación de reglas a revisar: (a) el duplicado propio se **rechaza**, no se puede forzar; (b) la marca vacía en una edición **no borra** la marca; (c) la marca del conteo **no reemplaza** la del catálogo.
- `ubicación` solo se guarda en el historial del conteo.
- Playwright con servidor simulado: no prueba el backend real ni el flujo de cámara.
- Búsqueda de candidatos del preview con una cláusula `OR` por código: sin índice dedicado para catálogos muy grandes.
- Idempotencia de `POST /levantamientos` solo aplica si el cliente envía `solicitudId`; la UI siempre lo envía.

**Funcionalidades pendientes**

- **Ubicación física por sucursal:** bloqueada. No existe modelo de sucursal en el esquema (multi-sede está en propuesta). Requiere autorización: modelo de sucursal y ubicación por producto y sucursal. Sin tocar existencias por sede.
- **Validación en iPhone real (Safari):** permisos de cámara, inicio/cierre, lectura de códigos, permiso denegado, sin cámara y entrada manual. **No validado en dispositivo.** LEV-015 sigue abierto.
- **Fase 3 UX completa:** búsqueda por categoría en el conteo, revisión de diferencias más clara y prueba de navegación SIDEBAR/TOPNAV en móvil con levantamiento. Solo se cubrieron advertencias, confirmaciones, mensajes y el E2E de móvil.
- **Fase 4 fotografías:** no implementada (fase separada).
- Lotes, series, vencimientos y garantías: sin modelo en el esquema.

### Ciclo de compras — auditoría e integridad (2026-10-09)

- **Base:** `main` `d24b420e` (PR #102, FS-07, **ya fusionado** por `Nelosama` el 2026-10-09 22:02 UTC). No hay PRs abiertos. Rama `fix/fs-compras-ciclo`. PR abierto hacia `main`. Sin merge ni despliegue.
- **Implementaciones previas verificadas, no reimplementadas:** FS-09 (pagos a proveedor independientes de la caja: ningún método exige caja ni genera `movimientos_caja`; `caja_id` NULL) y FS-04 (fechas de calendario en CxP), FS-08 (validación de costos en captura). Se añadieron pruebas PostgreSQL reales que las comprueban.
- **Documentos no encontrados:** `FS-08` y `FS-09` no tenían sección propia en este documento; su contexto está en el historial de commits (`a4857722`, `4da064f8`, `bf0b73ba`, PRs #92 y #93) y en `docs/BITACORA_PENDIENTES_2026-10-09.md`.

**Flujo real verificado** (`operaciones.service.ts`; módulo legado retirado): Proveedor (`ProveedorDto`) → Orden/factura `compra()` (estado `SOLICITADA`, CxP en el saldo del proveedor) → `recibir()` (recepción parcial o completa, exactamente una vez por `solicitudId`) → `productos.stock_actual`, `precio_costo`, `costo_vigente`, `costos_compra`, `movimientos_inventario` (tipo `COMPRA`) → `pagar()` (CxP sin caja; saldo con `FOR UPDATE`) → `cuentas()` (solo ADMIN para CxP) → auditoría `COMPRA_CREAR`, `COMPRA_RECIBIR`, `CUENTA_PAGAR`.

**Matriz de hallazgos**

| # | Hallazgo | Gravedad | Causa raíz | Corrección |
|---|---|---|---|---|
| H1 | Módulo legado `/compras` (ADMIN) registraba compras que **cambiaban `costo_vigente` y `precio_costo` sin recepción y sin aumentar existencias**; además creaba pagos a proveedor en tablas separadas (`compras_proveedor`/`pagos_proveedor`) fuera de la CxP real. | **P0** | Segunda implementación paralela del ciclo de compras, sin uso desde la interfaz, que violaba la regla de costo vigente. | Módulo `ComprasModule` retirado de `AppModule`; código eliminado de `src/compras/`. Las tablas y datos históricos **se conservan** (sin migración). Ver conciliación propuesta. |
| H2 | `costo_vigente` nunca se actualizaba en la recepción activa (solo `precio_costo`); quedaba `NULL`. | **P1** | El flujo activo no escribía la segunda columna de costo. | `recibir()` escribe `costo_vigente = precio_costo = costo de línea`. Prueba: baja 50→45 y sube 45→60; historial `[45, 60]`. |
| H3 | Factura repetida del mismo proveedor se aceptaba si cambiaban mayúsculas o espacios (`FAC-200` vs ` fac-200 `). | **P1** | Comparación exacta de `numero_factura`. | Comparación `UPPER(TRIM(...))` en `compra()`. Prueba PostgreSQL y mock unitario actualizado al mismo criterio. |
| H4 | Una cuenta CxP que vence **hoy** (Tegucigalpa) aparecía como `VENCIDA` desde las 18:00 locales del día anterior. | **P1** | `vencimiento < NOW()` compara un día calendario naive con un instante UTC. | `vencimiento::date < (NOW() AT TIME ZONE 'America/Tegucigalpa')::date`. Prueba con fecha de hoy (no vencida) y de ayer (vencida). |
| H5 | Compra sin pruebas de **costo que baja**, de **recepción parcial con pendiente**, de **concurrencia de recepciones** y de **rollback** con datos reales. | P2 (cobertura) | Pruebas existentes con mocks. | Nueva suite PostgreSQL `compras.postgres.integration.ts` (24 casos). |
| H6 | Pantalla: recepción y pago se enviaban **sin confirmación**; una cuenta pagada no se distinguía; la nota de caja no aparecía. | P2 (UX) | Flujos sin paso de confirmación. | Confirmación antes de recibir y pagar; nota «Los pagos a proveedores no afectan la caja POS»; etiqueta «PAGADA». Textos ES/EN en `purchases.*`. |

**Lo que ya funcionaba y se verificó con PostgreSQL real**

- Recepción completa e idempotente: una recepción confirmada suma existencias **una vez**; reintento con la misma solicitud devuelve la recepción original sin volver a sumar.
- Recepción parcial: suma solo lo recibido; la orden queda `SOLICITADA`; exceder el pendiente se rechaza.
- Dos recepciones simultáneas que juntas exceden el pendiente: solo una aplica (`FOR UPDATE` sobre orden, línea y producto).
- Atomicidad: un producto inactivo en la recepción revierte todo (sin recepción, sin existencias, sin costos).
- Pagos: parcial, sobrepago rechazado, dos pagos concurrentes que juntos superan el saldo (solo uno aplica; saldo nunca negativo), reintento no descuenta dos veces.
- Caja: un pago a proveedor en efectivo, tarjeta o transferencia no exige caja abierta, `caja_id` queda NULL y no crea `movimientos_caja`.
- Permisos: CAJERO no compra ni recibe; BODEGUERO no paga; CxP solo ADMIN. Aislamiento: otra empresa no recibe, paga ni compra con entidades ajenas.
- Costo histórico: `costos_compra` conserva costo, proveedor y recepción de cada recepción.

**Reglas de negocio aplicadas**

- Costo vigente = costo unitario de la **última recepción que actualizó inventario**, suba o baje. No hay promedio ponderado. El precio de venta no cambia.
- Cada compra conserva proveedor, factura, fecha, monto (subtotal calculado en servidor) y vencimiento.
- Un pago no puede superar el saldo; un pago a proveedor no afecta la caja POS, con ningún método.
- Factura repetida: mismo proveedor, sin distinguir mayúsculas ni espacios, en la misma empresa.

**Pruebas ejecutadas**

- Unitarias backend: **326/326** (331 previas; 5 casos menos por la retirada de las rutas legadas). `tsc -p tsconfig.build.json`, `nest build` y oxlint sin errores.
- Integración PostgreSQL 16 (usuario `nobody`): **9 archivos, 159/159**. Nuevo `test/compras.postgres.integration.ts`: **24/24**, con 5 casos que fallaban antes de corregir (costo vigente en dos escenarios, factura duplicada sin distinguir mayúsculas, vencimiento por calendario, y la consulta de movimientos de caja de la prueba, que fallaba por un error propio de la prueba y se corrigió).
- Frontend `npm test`: **157/157**. `tsc -b`, `vite build` y oxlint de archivos tocados sin errores.
- Playwright: **84/84**, incluidas **5 E2E nuevas** en `e2e/compras-simulado.spec.ts`. **Son E2E con backend simulado** (identificadas en el nombre del archivo y en el propio spec): validan confirmaciones, doble envío, reintento con la misma solicitud, nota de caja y estado pagada. No sustituyen la validación de persistencia.

**Decisiones pendientes (no implementadas; requieren autorización)**

- **D1 · Compra al contado.** No existe: toda compra genera CxP y se paga después con `pagar()`. Alternativa: registrar compra ya pagada (sin caja, misma regla).
- **D2 · Momento de reconocer la CxP.** Hoy se reconoce al registrar la factura, antes de recibir la mercancía. Alternativa: reconocer al recibir. Es un criterio contable: no cambiado.
- **D3 · Anulación y corrección.** No hay endpoint para anular compras, recepciones ni pagos. Revertir una recepción plantea una pregunta de costo vigente (¿qué recepción queda vigente?). Requiere diseño y autorización.
- **D4 · ISV de la factura.** Se captura manualmente y no se valida contra las líneas. Alternativa: calcular el impuesto desde las líneas gravadas. Regla fiscal: no cambiado.
- **D5 · Costo editado manualmente.** Un ADMIN o BODEGUERO puede cambiar `precioCosto` en el catálogo (FS-07, decisión D1), lo que rompe la regla «costo vigente = última recepción». Decidir si se bloquea o se audita como excepción.
- **D6 · Alertas de vencimiento a 7 días.** **Resuelta en la revisión final del PR #103:** `resumen()` compara `vencimiento::date <= día de Tegucigalpa + 7` (antes comparaba instante UTC y en 18:00–23:59 locales incluía el día +8). Pruebas en `compras.postgres.integration.ts`. Sin cambio de reglas de reconocimiento de deuda.

**Conciliación propuesta para datos históricos (solo lectura; consultas completas en `backend/scripts/auditoria-compras-lectura.sql`, ejecutadas en PostgreSQL temporal por la prueba de auditoría)**

Antes de decidir qué hacer con H1, conviene medir si existen registros en el módulo legado y si algún pago CxP histórico quedó en caja. Consultas de solo lectura para ejecutar en una réplica o copia:

```sql
-- Compras registradas por el módulo legado (no afectan CxP real).
SELECT COUNT(*) AS compras_legado, COALESCE(SUM(monto),0) AS monto FROM compras_proveedor WHERE tenant_id = '<tenant>';
-- Pagos a proveedor del módulo legado.
SELECT COUNT(*) AS pagos_legado FROM pagos_proveedor p JOIN compras_proveedor c ON c.id = p.compra_id WHERE c.tenant_id = '<tenant>';
-- Pagos CxP históricos que sí quedaron ligados a una caja (incorrecto según FS-09).
SELECT p.id, p.monto, p.metodo, p.caja_id, p.created_at FROM pagos_cuenta p JOIN cuentas_operativas c ON c.id = p.cuenta_id WHERE c.tipo = 'CXP' AND p.caja_id IS NOT NULL;
-- Movimientos de caja generados por pagos CxP históricos.
SELECT m.* FROM movimientos_caja m JOIN cajas c ON c.id = m.caja_id WHERE c.tenant_id = '<tenant>' AND m.concepto ILIKE '%CXP%';  -- corregido: movimientos_caja no tiene columna tipo; el concepto no está tipificado
```

Si aparecen filas en la última consulta, la propuesta es **no modificar** `movimientos_caja` ni `cierres`: documentar cada caso con su cierre histórico y proponer un asiento de conciliación auditable, aprobado por el dueño.

**Riesgos residuales**

- **Despliegue:** retirar `/compras` puede romper integraciones externas que lo usen; la interfaz no lo usa.
- **Datos legados:** `compras_proveedor` y `pagos_proveedor` pueden contener deuda que no aparece en CxP (ejecutar la consulta de conciliación).
- Playwright con backend simulado: no prueba persistencia.
- Alertas de vencimiento (D6) y ISV manual (D4).

#### Revisión final de PR #103 (2026-10-09)

**Alcance de esta revisión:** no se modifica producción, datos reales, ni permisos. No se implementan compras al contado, cambio del momento de reconocer CxP, anulación de recepciones, automatización de ISV ni cambio de permisos de costo manual (D1–D5 quedan pendientes). La rama no toca ningún archivo de caja ni de cierres (`git diff --name-only origin/main...HEAD`).

**Hallazgo adicional H7 (P2, corregido):** la alerta de vencimiento a 7 días de `resumen()` comparaba contra `NOW() + 7 días` en instante UTC. Reproducido con una prueba exploratoria de un solo uso (a las 18:00 y 23:59 de Tegucigalpa la cuenta con vencimiento el día +8 entraba en la alerta; a las 00:00 no). Corrección: límite calendario `sumarDias(diaCalendario(ahora, zona), 7)` y comparación `vencimiento::date <= $2::date`. `cuentas()` recibe el mismo instante de referencia (`ahora`) para que la marca `vencida` sea verificable a cualquier hora; la regla no cambia.

**Matriz de rutas: legado frente a actual** (`backend/src/operaciones/operaciones.controller.ts`; el módulo `/compras` ya no está registrado en `app.module.ts`)

| Ruta legada | Estado | Ruta vigente | Diferencias de permiso |
|---|---|---|---|
| `GET /compras` | retirada | `GET /operaciones/compras` | `inventario.ver`; ADMIN y BODEGUERO. Incluye las líneas (no hay ruta de detalle aparte). |
| `POST /compras` | retirada | `POST /operaciones/compras` (registra factura y CxP, sin recibir) | `inventario.editar`; ADMIN y BODEGUERO. Ya no escribe costos ni existencias. |
| `GET /compras/:id` | retirada | sin equivalente de detalle; usar `GET /operaciones/compras` | — |
| `POST /compras/:id/pagos` | retirada | `POST /operaciones/cuentas/:id/pagos` | Guard ADMIN y CAJERO; el servicio rechaza no-ADMIN para CxP («requieren administrador»). Probado en PostgreSQL. |
| `GET /productos/:id/historial-compras` | retirada | `GET /operaciones/productos/:id/historial` | `inventario.ver`; ADMIN y BODEGUERO. |
| — (nuevo) | — | `POST /operaciones/compras/:id/recepciones` | Única vía que aumenta existencias y actualiza `costo_vigente`. |

Verificación: la ausencia de las rutas legadas se deduce de que el controlador y el módulo ya no existen; no hay prueba HTTP que lo afirme. Las pruebas HTTP de `operation-modules.http.spec.ts` ya no contienen esos casos.

**Pruebas añadidas en esta revisión** (todas contra PostgreSQL real salvo que se indique)
- Alerta de 7 días y vencida: 00:00, 18:00 y 23:59 locales, cambio de día a las 00:00, cuenta pagada que sale de la alerta, límites día +7 incluido y día +8 excluido.
- Secuencia de costos 45 → 60 → 40: costo vigente 40, costo histórico por compra `[45, 60, 40]`, precio de venta sin cambio.
- Recepción rechazada: costo vigente, existencias y líneas sin cambio.
- Factura reenviada con la misma solicitud: misma orden y una sola CxP.
- Auditoría histórica: `backend/scripts/auditoria-compras-lectura.sql` (11 consultas, solo `SELECT`). La prueba las ejecuta dentro de `SET TRANSACTION READ ONLY` sobre datos con anomalías sembradas por SQL (factura duplicada con espacios y mayúsculas, orden RECIBIDA con líneas pendientes, saldo que no concilia) y verifica que se detectan, que no cambian los datos, y que una escritura en modo lectura falla.
- Frontend simulado (`compras-simulado.spec.ts`): registrar factura con doble clic envía una sola solicitud.

**Resultados locales de esta revisión** (ejecutados, no declarados)
- Backend unitarias: 326/326. Integración PostgreSQL como usuario sin privilegios: 169/169 en 9 archivos (línea base 159; +6 vencimiento, +3 costos/recepción/idempotencia, +1 auditoría).
- `tsc -p tsconfig.build.json`, `nest build`, `oxlint`: sin errores. Avisos existentes en archivos no tocados y en `operaciones.service.ts` (`no-useless-default-assignment`, por parámetros por defecto que ya existían). `test:scripts`: 13/13.
- Prettier: `operaciones.service.ts` y `compras.postgres.integration.ts` ya no cumplían Prettier en `HEAD`; no se reformatearon para no ensuciar el diff.
- Frontend: `npm test` 157/157; `tsc -b` sin errores; build con `VITE_API_URL=https://api.example.test/api` correcto; `npm run lint` sin errores (avisos `react(set-state-in-effect)` en páginas no tocadas); Playwright completo 85/85 (línea base 84; +1 doble clic de factura).
- Migraciones: sin cambios en `backend/prisma` en la rama.

**Qué no cubre esta revisión (riesgo residual declarado)**
- No hay prueba automatizada de que los cierres de caja históricos queden intactos tras pagos CxP. La rama no toca código de caja ni de cierres, pero la comprobación explícita sigue pendiente.
- Playwright usa backend simulado: valida la interfaz, no la persistencia.
- Sidebar y topnav no se validaron visualmente.
- No se ejecutó la consulta de conciliación contra datos históricos reales: no hay acceso a la base de producción desde este entorno. Es el primer paso antes de decidir sobre H1.
- Los datos del módulo legado (`compras_proveedor`, `pagos_proveedor`) pueden contener deuda que no aparece en CxP.

**Decisiones pendientes** (sin implementar; ver D1–D6 arriba)
- D1 compra al contado, D2 momento de reconocer la CxP, D3 anulación de recepciones, D4 ISV automatizado: sin cambio.
- D5 costo editado a mano: **recomendación** restringir el cambio de `precioCosto` a ADMIN, exigir motivo y registrar auditoría con valor anterior y nuevo. No implementado por instrucción: requiere autorización de negocio.

**Riesgos residuales:** datos históricos del módulo legado (ejecutar la auditoría antes de decidir), costo editable a mano hasta decidir D5, prueba de cierres pendiente, UI validada solo con backend simulado.

**Veredicto de esta revisión:** APTO PARA MERGE, condicionado a que el commit nuevo tenga los workflows de GitHub Actions en verde y que la rama siga sin conflictos con `main` en el momento de fusionar. La fusión no se ha hecho.

### Crédito de clientes — blindaje P0 (2026-10-09, rama `fix/p0-credit-integrity`)

**Base:** `main` `00f72c02` (PR #103 ya fusionado). Rama nueva desde `main`. Sin merge ni despliegue. Sin migraciones: `backend/prisma` no cambia.

**Evidencia de la auditoría de Codex:** no encontrada en el repositorio ni en los artefactos de la sesión. Las menciones de Codex en el repositorio son de otros temas (escáner de código de barras, `907b33db` revertido). No se usaron resultados de Codex. Todos los defectos se reprodujeron directamente con PostgreSQL real.

**Reproducción inicial** (`backend/test/credito.postgres.integration.ts`, 15 casos, antes de corregir): **8 fallaban y 7 pasaban**.
- Fallaban: conversión de cotización a crédito por encima del límite (C1), conversión a crédito de cliente sin crédito habilitado (C1), venta de cotización guardada como `CONTADO` sin saldo de crédito (C2), reintento de abono heredado aplicado dos veces (C3), abono heredado sin `pagos_cuenta`, caja ni auditoría (C3), devolución de venta a crédito que deja la deuda del cliente en 115 (C4), y la invariante CxC = monto − pagos rota por el abono heredado (C3).
- Pasaban (protecciones existentes): dos ventas que compiten por el mismo cupo (serializadas por `lockTenant`), dos pagos simultáneos sobre la misma CxC, reintento de `pagar` con la misma solicitud, abonos sucesivos hasta saldar, aislamiento entre empresas y consistencia cliente = suma de CxC.
- Nota del arnés: la primera versión aplicaba DDL generado desde el esquema y no incluía los triggers de numeración de clientes de las migraciones. Se cambió a la cadena completa de migraciones, en orden, sobre base vacía (verificada sin errores).

**Causas raíz**
- **C1 · Cotización a crédito sin validación de crédito.** `convertirAVenta` creaba la CxC sin revisar `creditoHabilitado`, `activo` ni el límite.
- **C2 · Cotización a crédito incompleta.** No guardaba `tipo_pago = CREDITO` ni `saldo_credito`, y no incrementaba `clientes.saldo_pendiente`. Ventas, abonos y devoluciones tratan esos campos como la fuente de verdad.
- **C3 · Ruta paralela de abonos.** `POST /clientes/:id/abonos` (`ClientesService.addPayment`) no tenía idempotencia, no registraba caja, `pagos_cuenta` ni auditoría, y sí reducía la CxC y el saldo del cliente. No tenía llamadas desde el frontend.
- **C4 · Cancelación incompleta.** `ejecutarDevolucion` reducía la CxC pero no `clientes.saldo_pendiente` ni `ventas.saldo_credito`: deuda ficticia.

**P0 corregidos**
- **P0-A (conversión a crédito):** la conversión desde cotización aplica las mismas reglas que una venta directa: cliente activo, crédito habilitado, límite con saldo actual. Guarda `tipo_pago`, `saldo_credito` e incrementa el saldo del cliente, todo en la misma transacción. Una cotización no puede convertirse dos veces. Una venta con solicitud repetida no duplica venta, CxC ni saldo.
- **P0-B (abonos):** el único camino de abono es `POST /operaciones/cuentas/:id/pagos` (`operaciones.pagar`): idempotente por `solicitud_id` con hash, bloqueo `FOR UPDATE` de la CxC, actualización condicional del cliente, caja (`ABONO_CXC`), `pagos_cuenta` y auditoría. La ruta heredada `POST /clientes/:id/abonos` queda **bloqueada con HTTP 410** (`GoneException`) y no modifica saldos. No se inventó una regla nueva para ella.
- **P0-C (cancelaciones):** la devolución de venta a crédito cancela en la misma transacción la CxC, el saldo del cliente y `saldo_credito`. Con abonos previos se mantiene la **regla vigente** documentada en `CONTEXTO_MAESTRO` (sección de devoluciones): primero se cancela el crédito pendiente y el excedente pagado es reembolso. Nota: en un primer intento se bloqueó este caso, pero contradecía la regla documentada y se revirtió antes de cerrar la fase.

**Matriz de invariantes y pruebas** (todas contra PostgreSQL real salvo indicación)
| Invariante | Prueba |
|---|---|
| Saldo de CxC = monto − pagos − crédito cancelado por devolución | `invariante: el saldo de cada CxC…` |
| Saldo del cliente = suma de sus CxC abiertas | `invariante: el saldo del cliente…` |
| Ninguna operación consume más crédito que el autorizado | `P0-A dos ventas…` (cupo de 150, una de 115) y `P0-A una venta… supera el límite` |
| Solicitud repetida no duplica obligaciones ni pagos | `P0-B un reintento de la misma solicitud…`, `una misma solicitud de venta…`, `una cotización convertida… no puede convertirse de nuevo` |
| Transacción fallida sin cambios parciales | `caso 7…` (inconsistencia previa; el abono falla tras escribir CxC y pago) |
| Operaciones de un tenant no afectan a otro | `multi-tenant…` |
| Cancelaciones sin deuda ficticia | `P0-C devolver… sin abonos…` y `con abonos…` |
| Trazabilidad por operación | `P0-B un abono de CxC (ruta canónica)…` (pago, caja y auditoría `CUENTA_PAGAR`) |
| Abonos parciales hasta saldar exactamente | `P0-B abonos parciales sucesivos…` |
| Revocación de permisos antes de ejecutar | `caso 6…` (el autorizador pierde el rol; `ejecutarAutorizada` rechaza) |

**Casos de estrés solicitados**
- Caso 1 (dos ventas por el mismo crédito): cubierto, PostgreSQL real.
- Caso 2 (doble clic en abonar) y caso 3 (reintento tras perder la respuesta): cubiertos a nivel backend con la misma solicitud. La prueba usa el mismo usuario.
- Caso 4 (dos cajeros sobre la misma CxC): cubierto con concurrencia real, pero **ambas operaciones usan el mismo ADMIN**. No se simularon dos usuarios distintos.
- Caso 5 (devolución y abono simultáneos sobre la misma venta): cubierto. Se verifica que exactamente una prospera y que los saldos coinciden.
- Caso 6 (ADMIN que pierde autorización antes de ejecutar): cubierto como **revocación secuencial**, no concurrente.
- Caso 7 (fallo intencional entre escrituras): cubierto con una inconsistencia previa que provoca el fallo tras escribir CxC y pago.
- Caso 8 (cliente o CxC de otro tenant): cubierto.
- Caso 9 (abonos sucesivos hasta exacto): cubierto.
- Caso 10 (cancelación con pagos previos): cubierto con la regla vigente.

**Resultados locales** (ejecutados)
- Backend unitarias: 326/326. Se actualizaron dos pruebas unitarias por cambio de comportamiento intencional (abono heredado bloqueado) y por fixture incompleto (CxC sin cliente).
- Integración PostgreSQL (usuario no root): 190/190 en 10 archivos (línea base 169 + 21 de crédito).
- `tsc -p tsconfig.build.json`, `nest build`, `oxlint`: sin errores.
- Frontend: `npm test` 157/157, `tsc -b`, build correctos. Playwright 85/85. **Las E2E usan backend simulado.** No se cambió el frontend: la interfaz ya muestra los mensajes del backend (`POSPage`, `OperacionesPage`).

**Decisiones de negocio pendientes (no implementadas)**
- Ruta heredada `POST /clientes/:id/abonos`: se bloquea (410). Si algún integrador la usa, debe migrar a `/operaciones/cuentas/:id/pagos`. Decidir si se elimina por completo.
- Reembolso con abonos: se conserva la regla vigente, pero el importe mostrado es estimado y puede cambiar con pagos o devoluciones posteriores. Necesita confirmación del propietario sobre el comportamiento final.
- Conversiones a crédito hechas antes de esta corrección: si la cotización se convirtió a crédito, la venta tiene CxC pero `clientes.saldo_pendiente` no incluye ese saldo. Hace falta una conciliación de solo lectura antes de corregir datos.

**Riesgos residuales**
- La conciliación de datos históricos no se ha ejecutado sobre producción.
- Caso 4 y caso 6 no se probaron con usuarios concurrentes distintos.
- Playwright usa backend simulado; no demuestra persistencia.
- Sidebar y topnav no se validaron visualmente.
- Esta fase no añade prueba automatizada de cierres de caja históricos (pendiente desde la revisión de PR #103).

#### Validación financiera final de devoluciones con abonos (2026-10-10, PR #104)

**Veredicto sobre reembolsos:** el flujo actual **no genera reembolsos pendientes**. Cada devolución ejecuta en la misma transacción: (1) cancela primero el crédito pendiente de la CxC, (2) reduce el saldo del cliente y `saldo_credito` por ese importe, (3) calcula el reembolso como `monto − crédito cancelado` (el excedente pagado), (4) si hay reembolso, registra un movimiento de caja negativo en la **caja abierta del solicitante**, verificando efectivo suficiente cuando el método es EFECTIVO, y (5) guarda devolución, método, caja, responsable y auditoría. Es lo que documenta la regla de devoluciones: el reembolso sale de la caja del solicitante. No existe un estado "reembolso pendiente". Si el negocio quiere reembolsos diferidos, es una decisión nueva (ver pendientes).

**Fuente de verdad de los saldos:** la CxC (`cuentas_operativas.saldo`). `clientes.saldo_pendiente` y `ventas.saldo_credito` son derivados que se actualizan en la misma transacción. Invariante verificada: `saldo CxC = monto − pagos aplicados − crédito cancelado por devoluciones`.

**Escenarios probados** (PostgreSQL real; venta de 1 unidad a 100 + ISV = 115.00; abono de 30 % = 34.50):
| Escenario | Resultado verificado |
|---|---|
| A. Sin abonos | Crédito cancelado 115.00, reembolso 0.00, sin movimiento de caja, crédito disponible vuelve a 250 (límite), 1 auditoría |
| B. Abono 34.50 | Crédito cancelado 80.50 + reembolso 34.50 = 115.00. Caja −34.50 (un movimiento, usuario y método). Abono conservado en `pagos_cuenta` |
| C. Pagada 115.00 | Crédito cancelado 0.00, reembolso 115.00, caja −115.00, devolución trazable (caja, usuario, método) |
| D. Reintentos | Misma solicitud devuelve el mismo registro sin nuevos efectos. Segunda solicitud sobre venta cancelada se rechaza. Una devolución, un movimiento, una auditoría |
| E. Concurrencia (orden 1 y 2 secuenciales, y concurrente en sesiones independientes) | Orden abono→cancelación: reembolso 34.50. Orden cancelación→abono: abono rechazado (saldo 0), caja sin cambio. En concurrencia, solo son válidos esos dos resultados; la CxC, el cliente y la venta cuadran en ambos |
| F. Fallo intermedio (trigger de error tras escribir CxC, cliente, venta y devolución) | Estado idéntico al previo (CxC, cliente, venta, caja, devoluciones, auditoría, stock). Después, la misma solicitud se ejecuta una sola vez |
| Devoluciones parciales sucesivas (2 unidades, abono 69.00) | Primera: crédito 115.00, reembolso 0. Segunda: crédito 46.00, reembolso 69.00. Total reembolsos 69.00 = pagado; crédito + reembolsos = 230.00 |
| Ruta 410 `POST /clientes/:id/abonos` | Sin pagos, sin saldos alterados, sin movimientos de caja ni abonos creados |
| Permisos | CAJERO no puede cancelar directamente; otra empresa no puede cancelar; autorizador que pierde el rol impide la ejecución |
| Caja cerrada | Sus movimientos no cambian al cancelar una venta con abonos |

**Estado de caja** (efectivo, variación por operación): A 0.00 · B −34.50 · C −115.00 · D −34.50 (una sola vez) · E orden 1: −34.50 respecto a la caja tras el abono; concurrente: 0.00 si ambas se confirman; si solo se confirma la cancelación, la caja no cambia · F 0.00 tras el fallo y −34.50 al reintentar.

**Defecto confirmado y corregido en esta revisión:** ninguno en el flujo de reembolsos. Se corrigió la **aserción** de la prueba de caso 5 (concurrencia): asumía que solo prosperaba una de las dos operaciones, lo que venía del bloqueo que se revirtió. Ahora acepta los dos órdenes válidos y verifica cada uno. Las pruebas de orden secuencial lo fijan explícitamente.

**Tratamiento de caja:** registra reembolso automático en la caja abierta del solicitante y no en cierres históricos (la caja debe estar `ABIERTA`). Exige autorización de otro administrador cuando la solicitud la hace un cajero. El administrador que cancela directamente se autoriza a sí mismo (diseño existente, no modificado). Guarda método y responsable.

**Conciliación histórica (solo lectura):** `backend/scripts/conciliacion-credito-lectura.sql` (8 consultas): CxC sin cliente, saldo de cliente que no concilia con sus CxC, venta a crédito sin CxC, firma de conversión antigua (método CREDITO con tipo CONTADO), `ventas.saldo_credito` que no concilia, CxC que no concilia con pagos y devoluciones, reembolsos sin movimiento de caja, y abonos de la ruta heredada (informativo). La prueba verifica cero falsos positivos sobre flujos válidos, detección de anomalías sembradas y que la consulta no modifica datos. **No se ejecutó sobre producción.**

**Antes de una eventual conciliación real hay que verificar:** (1) cuántas conversiones de cotización a crédito se hicieron antes de la corrección y cuáles aún no reflejan saldo del cliente; (2) si hubo abonos por la ruta heredada (`abonos_cliente`) y en qué caja se registraron, porque no tienen pago ni movimiento de caja; (3) qué cierres de caja contienen efectivo de devoluciones o abonos; (4) si algún cliente tiene saldo distinto de la suma de sus CxC; (5) decisión del propietario sobre cada hallazgo antes de corregir.

**Pruebas (ejecutadas):** integración PostgreSQL 16, usuario no root, cadena completa de migraciones: 203/203 en 10 archivos (la suite de crédito tiene 34 casos). Unitarias 326/326. `tsc`, `nest build` y `oxlint` sin errores. Frontend: 157/157, `tsc -b` y build correctos. Playwright 85/85 con backend simulado.

**Frontend:** Cuentas usa `POST /operaciones/cuentas/:id/pagos` con solicitud idempotente. No hay llamadas a `/clientes/:id/abonos`.

**Riesgos residuales**
- Caso 4 (dos cajeros) y caso 6 (revocación) siguen sin probarse con usuarios concurrentes distintos.
- La conciliación no se ha ejecutado sobre datos reales.
- Playwright usa backend simulado.
- El importe mostrado al administrador es estimado.

**Decisiones de negocio pendientes**
1. ¿El reembolso debe ser inmediato desde la caja (como está documentado) o diferido como obligación? Hoy no hay estado diferido.
2. ¿El administrador puede cancelar directamente su propia venta a crédito sin segunda autorización? Hoy sí.
3. Eliminar o mantener bloqueada `POST /clientes/:id/abonos` (decisión de la fase anterior).

### FS-07 — edición integral y segura de productos (2026-10-09)

- **Base:** `main` `52703309` (PR #101, FS-06 fase 2, **ya fusionado** por `Nelosama` el 2026-10-09 20:43 UTC; CI de `59e39313` en success). Rama `fix/fs-07-edicion-productos`. PR abierto hacia `main`. Sin merge ni despliegue.

**Matriz de campos (auditoría antes del cambio)**

| Campo | En BD | En formulario | Editable | Persistencia real antes → después |
|---|---|---|---|---|
| Nombre, descripción, código interno, código de barras, código fabricante | sí | sí | sí | sí, sin control de versión → con versión |
| Marca | sí (FS-06) | sí | sí | sí; vacío no borra (FS-06) |
| Categoría | sí (`categoriaId`) | **no** | solo API | sí; `''` **borraba** la categoría → vacío no cambia |
| Unidad de medida | sí | **no** | solo API | sí, sin protección con historial → protegida |
| Precio de venta | sí | sí | sí | sí, auditado; ventas históricas intactas (probado) |
| Costo vigente | sí | sí | sí (ADMIN/BODEGUERO) | sí, auditado; ver decisión D1 |
| Margen propio | sí | sí | sí | sí |
| Stock mínimo | sí | sí | sí | sí |
| Existencias | sí | sí, **siempre enviado** | sí, con motivo | sí, con AJUSTE; **un formulario viejo podía revertirlas** → ahora protegido |
| Estado activo | sí | **no** | solo baja lógica (ADMIN) | **sin reactivación desde la UI** → reactivable |
| Imagen (URL) | sí | sí | sí | sí (fotografías: fase separada) |
| Usa medida | sí | no | solo API | sí |
| Lotes, series, vencimientos | **no** existen en el esquema | — | — | no se inventó modelo |

**Hallazgos**

- `PUT /productos/:id` sin control de concurrencia: una edición simultánea o un formulario abierto sobrescribía en silencio.
- El formulario enviaba `stockActual` en cada guardado: un valor leído antes podía revertir existencias.
- `InventarioPage` reducía cada producto a una lista blanca de campos **sin `version`**: con el control de versión, ninguna edición se habría podido guardar. Corregido junto con el control de versión.
- `categoria: ''` en actualización parcial borraba la categoría.
- Desactivar era irreversible desde la interfaz (la lista solo muestra activos).
- Cambiar la unidad de medida reinterpretaba cantidades históricas.
- Código de barras repetido solo se validaba contra productos activos.
- Auditoría `PRODUCTO_EDITAR` guardaba solo costo, precio y stock anteriores: cambios de nombre, código o barras no tenían valor anterior.
- Importador masivo (`ImportarProductosModal`) llama a `PUT /productos/:id` y sobrescribe existencias al elegir «sobrescribir» (comportamiento existente, ver D4).

**Cambios implementados**

- **Versión (control optimista):** columna `productos.version` (default 1). Cada edición exitosa la incrementa. Una versión obsoleta responde `409` con `code: PRODUCTO_VERSION` y no escribe nada. La validación ocurre dentro de la transacción con `lockTenant`.
- **Edición parcial:** `UpdateProductoDto` exige `version`; sin ella, `400`. El backend escribe solo los campos enviados. Frontend: `construirCambiosProducto` envía solo lo que cambió, la versión, y las existencias únicamente si cambiaron (con motivo).
- **Estado:** `activo` editable solo por ADMIN (`403` para BODEGUERO y CAJERO). `GET /productos?incluirInactivos=true` permite reactivar.
- **Unidad de medida:** cambia solo si no hay existencias, reservas ni movimientos distintos del alta `INICIAL`; si no, `409` con mensaje.
- **Códigos:** código interno único por empresa sin distinguir mayúsculas; código de barras único entre **todos** los productos de la empresa (activos o inactivos), en alta y edición y al reactivar. Empresas distintas pueden usar los mismos códigos.
- **Categoría:** vacía no cambia la categoría (igual que la marca).
- **Auditoría `PRODUCTO_EDITAR`:** `datos.cambios` con `{anterior, nuevo}` de cada campo modificado, `motivo`, `version` anterior y nueva; el usuario queda en `usuario_id`.
- **Frontend:** `ProductoGestion` reescrito en grupos (Identificación, Clasificación, Precios y costo, Existencias, Estado, Imagen), con validación antes de guardar, advertencia de confirmación para cambios sensibles (códigos, unidad, precios, existencias, estado), prevención de doble envío, mensaje de éxito, error de conexión sin perder datos, y conflicto de versión que recarga la lista. Textos en ES y EN (`product_edit.*`). Categoría, unidad y estado ahora son editables en la interfaz.
- **Importador:** envía la versión que leyó del listado; un producto cambiado después se cuenta como error, no se sobrescribe.
- **Corrección de regresión detectada por E2E:** `InventarioPage` ahora conserva `version`, `marca`, `categoriaId` y nombre real de categoría. `'General'` (texto de visualización) ya no se convierte en categoría.

**Migración**

- `backend/prisma/migrations/20261009130000_fs07_version_producto/migration.sql`: `ALTER TABLE productos ADD COLUMN version INTEGER NOT NULL DEFAULT 1`. Solo agrega columna con valor por defecto; no modifica existencias, precios ni filas existentes. Reversión manual: `ALTER TABLE productos DROP COLUMN version`.
- Listas explícitas de migraciones de `ventas.postgres.integration.ts` y `reportes-zona-horaria.postgres.integration.ts` actualizadas.

**Pruebas**

- Unitarias backend: **331/331** (`npx vitest run`). `tsc -p tsconfig.build.json` y `nest build` sin errores. Lint de `src/productos` y `src/levantamientos` sin errores.
- Integración PostgreSQL 16 (usuario `nobody`): suite completa **8 archivos, 135/135**. Nuevo `test/productos-edicion.postgres.integration.ts`: **15/15** (edición parcial sin pérdida; versión obsoleta sin revertir existencias; edición simultánea; reintento; código y barras con auditoría; duplicados activos e inactivos; otra empresa; permisos ADMIN/BODEGUERO/CAJERO; reactivación; existencias sin cambio por nombre/marca/categoría; AJUSTE con motivo auditado; precio y costo sin tocar ventas históricas; unidad protegida; marca y categoría que persisten; edición sin versión rechazada).
- **Mutación de control:** al desactivar la comprobación de versión, fallan 3 pruebas de concurrencia (versión obsoleta, simultáneas, reintento). Archivo restaurado.
- Pruebas existentes actualizadas por el nuevo contrato (enviar versión): `productos.postgres.integration.ts` (SEC-005 y BODEGUERO) y 6 pruebas de `levantamientos.postgres.integration.ts`. Ninguna aserción se relajó.
- Frontend `npm test`: **157/157** (incluye `producto-edicion.test.mjs`, 14 casos, con regresión del mapeo de inventario). `tsc -b` y `vite build` (con `VITE_API_URL=https://api.example.test/api`) correctos. Lint de archivos tocados sin errores.
- Playwright (suite de la CI): **79/79** (71 previas + **8 nuevas** de `e2e/productos-edicion.spec.ts`: edición parcial, confirmación de costo con cancelación, conflicto de versión, doble clic, fallo de red y reintento, motivo de existencias, reactivación, móvil 390 px). Usa servidor simulado en memoria con la misma regla de versión; **valida la interfaz y el contrato del payload, no el backend real**.

**Decisiones pendientes (no implementadas; requieren autorización)**

- **D1 · Costo vigente manual (financiero).** Hoy ADMIN y BODEGUERO pueden cambiar el costo a mano; queda auditado. Alternativas: (a) mantener así; (b) bloquear el cambio manual y que el costo solo cambie por recepción de compra o ajuste con motivo; (c) manual solo ADMIN con motivo obligatorio. Impacta reglas de compras: no cambiado.
- **D2 · Código de barras y productos inactivos.** Implementado como único en toda la empresa (más estricto). Alternativa: solo activos. Riesgo: duplicados heredados entre inactivos impedirán crear o reactivar ese código hasta corregirlos. Conviene consultar primero los datos reales.
- **D3 · Unidad de medida.** Implementado: cambio solo sin historial. Alternativa: factores de conversión (no implementados; requieren definición de negocio).
- **D4 · Importador «sobrescribir».** Mantiene que el archivo sustituya existencias de productos existentes (auditado con motivo «Importación de inventario revisada»). Decidir si debe confirmarse por separado o solo sobrescribir precios.
- **D5 · Borrar marca o categoría.** En actualización parcial vacío no borra. Para borrar hace falta un indicador explícito (p. ej. `null` o acción dedicada). No implementado.
- **D6 · Visibilidad de inactivos.** `incluirInactivos` lo puede pedir cualquiera con acceso al listado de productos. Alternativa: solo ADMIN.

**Riesgos residuales**

- **Despliegue acoplado:** las versiones antiguas del frontend (en caché) envían `PUT` sin `version` y recibirán `400`. Desplegar backend y frontend juntos y refrescar el navegador.
- **Datos de producción:** antes de activar, consultar duplicados de código de barras entre productos inactivos (D2).
- **Interfaz no validada visualmente** en SIDEBAR y TOPNAV: no hubo cambios de navegación, pero no se capturaron capturas en ambos modos.
- Playwright con servidor simulado: no prueba el backend real ni el importador.
- Importador masivo sin prueba automatizada propia (cambios de versión verificados solo por compilación).
- Textos de ayuda de `ProductoGestion` nuevos en ES y EN; otras pantallas del catálogo siguen con textos existentes.

**Pendientes de otras fases**

- Ubicación física por sucursal: bloqueada (sin modelo de sucursal).
- Validación en iPhone real: pendiente.
- Lotes, series, vencimientos y garantías: sin modelo en el esquema.

### FS-05 — fechas y horarios de reportes (2026-10-09)

- **Causa raíz:** `created_at` es `TIMESTAMP(3)` sin zona que guarda UTC. El resumen de `/operaciones/resumen` filtraba con `created_at >= $2::date`, es decir, medianoche UTC; el dashboard calculaba "hoy", "ayer" y la tendencia con `setHours`, que usa la zona del servidor (UTC en el despliegue). Resultado: ventas de 18:00–23:59 hora de Tegucigalpa caían en el día siguiente. La página de Reportes además armaba su rango por defecto con `toISOString()` y mostraba el aviso «Fechas del reporte en UTC».
- **Corrección** (rama `fix/fs-05-reportes-zona-horaria`): `backend/src/common/zona-horaria.ts` (zona por defecto `America/Tegucigalpa` como constante, configurable por parámetro; sin zona fija global); `operaciones.service.ts` `resumen()` consulta con instantes UTC del día local (`::timestamptz AT TIME ZONE 'UTC'`, independiente de la zona de la sesión de PostgreSQL); `dashboard.service.ts` usa día calendario local para hoy/ayer/tendencia/cotizaciones por vencer/hora; `ReportesPage` usa `diaCalendarioEnZona()` y el aviso se traduce con la zona; recibo de POS y cierres (`OperacionesPage`) muestran hora en la zona del negocio. No se modificaron datos ni instantes almacenados.
- **Reproducción previa:** con `TZ=UTC`, 5 pruebas nuevas fallaban (`dashboard.zona-horaria.spec.ts`, `resumen-zona-horaria.spec.ts`). Tras el cambio pasan con `TZ=UTC`, `America/Tegucigalpa` y `Asia/Tokyo`.
- **Pruebas:** backend unitarias 331/331 (antes 316); `zona-horaria.spec.ts` cubre medianoche, cambio de día/mes/año y horario de verano de Nueva York; `tsc` backend y `tsc -b` frontend sin errores; frontend `npm test` 143/143 (incluye `reportes-zona-horaria.test.mjs`, 5 casos); `vite build` OK (con `VITE_API_URL=/api`, salida fuera del repo); oxlint sin errores en archivos tocados.
- **Validación PostgreSQL real (2026-10-09, sesión posterior):** `test/reportes-zona-horaria.postgres.integration.ts` (PostgreSQL 16.15, migraciones reales, clúster temporal). Ejecutado como usuario existente `nobody` (`runuser`), porque `initdb` no corre como root; no se crearon cuentas ni se cambiaron permisos del repositorio.
  - Suite de integración completa: **7 archivos, 99/99** (79 previas + 20 nuevas).
  - Nueva prueba: **20/20** = 5 casos × 4 zonas de sesión (`UTC`, `Asia/Tokyo`, `America/Tegucigalpa`, `Pacific/Pago_Pago`), verificando `current_setting('TimeZone')` en cada sesión. Cubre primer y último milisegundo del día local, venta de las 20:30 locales, anuladas, rangos inclusivos (8–10), particiones diarias sin duplicar ni omitir (5 ventas, L 3,060) y coincidencia POS/reporte/dashboard en el neto del 9 (L 45).
  - **Mutación 1** (quitar `AT TIME ZONE 'UTC'`): 12/20 fallan, solo en zonas no UTC. Confirma que la conversión vuelve el resultado independiente de la zona de sesión.
  - **Mutación 2** (código de `origin/main`, previo al fix): 16/20 fallan en todas las zonas. Confirma la regresión. Código restaurado; `git status` limpio.
  - Unitarias backend 331/331; `tsc -p tsconfig.build.json` sin errores. `tsc -p tsconfig.json` reporta 1366 errores de tipos globales de Vitest en specs y pruebas de integración existentes (pre-existente, no introducido por este PR).
  - Frontend: 143/143 (`npm test`), `tsc -b` y `vite build` correctos, oxlint sin errores.
  - GitHub Actions sobre el head `157b3732`: `Operación de ferretería` run [37970951477](https://github.com/Nelosama/FerreSystem/actions/runs/37970951477) = **success** (incluye «Backend: compilación y pruebas» e «Integración con persistencia PostgreSQL real», `npm run test:integration`); `Playwright Tests` run [37970951163](https://github.com/Nelosama/FerreSystem/actions/runs/37970951163) = **success**. Ejecuciones previas sobre `7f31a24f` (37966166005) y `18b5adfc` (37970924872) también en success.
  - **Cambio histórico en reportes:** las ventas de 18:00–23:59 locales se asignan al día local correcto. Los totales diarios de días pasados cambian en esa franja; en rangos solo cambian los bordes. Los datos almacenados no se modifican. Impacto documentado en el cuerpo del PR #99. **Aprobación del responsable funcional: PENDIENTE** (no identificado en el repositorio). No fusionar hasta registrarla.
- **Pendientes / riesgos:** (1) `cotizaciones.service.ts` (≈7 bloques `setHours`) sigue usando la zona del servidor para vencimientos; mismo patrón, fuera de alcance de FS-05, decidir si se corrige. (2) `ApartadosPage`, `TransferenciasPage`, `GarantiasPage` y `PedidosEspecialesPage` corregidos en la rama `fix/fechas-zona-negocio-modulos` (bloque siguiente); `AuditoriaPage`/`DevolucionesPage` siguen pendientes. (3) El supuesto de que la sesión de PostgreSQL y `NOW()` usan UTC para columnas `TIMESTAMP` no está verificado en producción (`SHOW timezone`). (4) Los datos históricos no se tocaron, pero los reportes de días pasados **cambiarán** al desplegar: ventas de 18:00–23:59 locales se moverán al día correcto. Avisar al cliente antes de desplegar. (5) Sin validación en navegador ni en producción.
- PR [#99](https://github.com/Nelosama/FerreSystem/pull/99), rama `fix/fs-05-reportes-zona-horaria`: **fusionado en `main`** (`ef6b9fa1`). Se fusionó **antes** de registrar la aprobación funcional del cambio histórico, que sigue **PENDIENTE**: registrarla o evaluar su reversión/comunicación. Sin despliegue.

## BALANCE — cuentas por cobrar y por pagar: cierre funcional y pruebas reales (2026-10-10 UTC)

- **Agente:** BALANCE — Desarrollo Financiero FerreSystem. **Rama:** `claude/balance-cxc-cxp` (base PR #135, `claude/conciliacion-pagos-cxc`). **HEAD:** `5f974f76`. **Sin merge, sin migraciones productivas, sin despliegue.** PR #142 se mantiene en draft.
- **Estado:** listo para integración tras #135; **NO-GO para producción** hasta que NEXUS aplique migraciones y se cierren los bloqueos de la sección de decisiones de `docs/BALANCE_CXC_CXP_20261010.md`.
- **Implementado en esta fase:** vencimiento de factura a crédito según plazo del cliente (`clientes.plazo_credito_dias`, migración `20261014000000_cliente_plazo_credito`); referencia de pago a proveedor única por factura (`20261013000000_balance_referencia_pagos`), obligatoria en pagos electrónicos CXP; aislamiento por empresa en uniones de cuentas, pagos, estado de cuenta; CAJERO consulta estado de cuenta sin límite de crédito; historial de pagos muestra referencia y responsable (`OperacionesPage.tsx`).
- **Devoluciones CXC (`backend/test/devoluciones-cxc.postgres.integration.ts`, 4/4):** devolución parcial con deuda pendiente reduce saldo sin movimiento de caja; devolución de factura abonada registra crédito cancelado y reembolso; reintento con la misma solicitud no duplica; dos devoluciones simultáneas aplican una sola. **No cubiertos aún:** saldo a favor y reembolso parcial diferido (bloqueados por decisión de modelo, ver docs).
- **Pruebas reales (`frontend/e2e-real/balance-real.spec.ts`, 6/6):** backend NestJS y PostgreSQL temporal, frontend real, sin mocks. Cubre deuda y abono con saldo actualizado en pantalla y base, pago a proveedor con referencia e historial, referencia repetida 409, cajero sin CXP (403), bodeguero sin cuentas, separación entre empresas (404 y saldo intacto). Harness completo `frontend/e2e-real/run.sh`: 35/35 con `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.
- **Pruebas ejecutadas (2026-10-10):** backend unitarias 345/345; integración PostgreSQL 25 archivos, 409 aprobadas y 1 omitida previa; frontend unitarias 225/225; `tsc --noEmit` sin errores; Playwright simulado 126/126.
- **Hallazgos corregidos en esta fase:** pagos electrónicos a proveedor sin referencia fallaban en pruebas antiguas (actualizadas, la regla es aprobada); el E2E real encontró que el historial no mostraba referencia ni responsable.
- **Hallazgo abierto fuera de BALANCE:** `frontend/e2e-real/contingencia-real.spec.ts` (caso 9) falla si corre después de ventas que reservan stock del Taladro compartido, por `stock_reservado_check`. Mitigado en el spec de BALANCE usando producto propio; el spec de contingencia debe aislar su fixture.
- **Pendiente para NEXUS:** aplicar `20261013000000_balance_referencia_pagos` y `20261014000000_cliente_plazo_credito` tras `20261012000000_conciliacion_pagos_bancarios`; revisar restricciones compuestas por empresa. **Pendiente para ATLAS:** revisar la línea de vencimiento por plazo en `ventas.service.ts` y la conversión de cotizaciones (vencimiento null).
- **Pendiente para CENTINELA:** revisión multi-tenant de `aprobaciones_bancarias`, `conciliaciones` y uniones de `pagos_cuenta`; sin migraciones de seguridad implementadas por BALANCE.

## DEF-01 cerrado en rama (GUARDIAN, 2026-10-11)

- **Rama:** `claude/guardian-def01-offline` desde `nexus/integracion-temp` `e8b75ae6`; PR en borrador hacia esa rama. Sin merge ni despliegue. Informe: [DEF01_CIERRE_GUARDIAN_20261011.md](DEF01_CIERRE_GUARDIAN_20261011.md).
- **Codex:** su trabajo no existe en el repositorio (sin rama, commit ni `CORRECCION_DEF01_*`); se implementó desde la base.
- **Corrección:** `contingencia.service.ts` (`construirCatalogo`, `aplicar`): catálogo solo aprobado y positivo; la instantánea guarda la aprobación; sin prueba en la instantánea, conflicto DURO no superable (`PRODUCTO_FUERA_DE_VENTANA`, `PRECIO_SIN_APROBACION`).
- **Pruebas:** contingencia PG 34/34 (9 nuevas), integración PG 526 + 1 omitida, backend 366, frontend 245, E2E real 90 aprobadas; las dos pruebas FARO de DEF-01 pasan. Abiertos fuera de alcance: DEF-03 y `balance-real` (desfase horario, falla también en la base).
- **Pendiente:** validación independiente de FARO; reemitir ventanas antes de activar la contingencia.

## Validación independiente de DEF-01 — PR #146 (FARO, 2026-10-11)

- **Rama:** `nexus/faro-validacion-def01` = PR #146 (`d62dd4a2`) + suite de validación + corrección de `balance-real`. Informe: [FARO_VALIDACION_DEF01_20261011.md](FARO_VALIDACION_DEF01_20261011.md). Sin merge, despliegue ni migraciones.
- **Recomendación:** NO MERGE todavía. DEF-01 cumple: los escenarios de producto no aprobado, precio cero y aprobación posterior pasan de FAIL en la base a PASS en el PR.
- **Pruebas:** `frontend/e2e-real/faro-validacion-def01.spec.ts` 13 PASS / 2 FAIL en el PR; 7 PASS / 8 FAIL en la base (los escenarios de DEF-01 fallan allí). Integración PG del PR 526 PASS, 1 omitida (34/34). E2E real del PR 108 PASS, 2 FAIL (DEF-03), 10 omitidas (antes de DEF-04 e I-01).
- **Riesgos abiertos:** R-01 (P0 activación): ventanas emitidas antes del despliegue quedan bloqueadas sin salida (`PRECIO_SIN_APROBACION` no superable); R-02 (P1): cierre manual deja efectivo fuera de caja; **DEF-04 (P1, preexistente)**: un cajero cobra en la caja de otro con la ventana ajena (`contingencia.service.ts:275-290`); R-03 (P2): revocación offline se aplica con revisión.
- **Preexistentes:** DEF-03 (falla en la base). `balance-real`: causa raíz en la prueba, no en producción (comparación de fechas UTC frente a día de negocio, desde las 18:00 de Tegucigalpa); corregida en la rama de validación (6/6).
- **Pendiente:** mitigar R-01 y DEF-04 en código; decidir R-02, R-03 y la semántica de entrega offline; confirmar Vercel y Render.

## Preparación operativa del cliente — documentación (2026-10-12)

- **Rama:** `docs/preparacion-operativa-cliente`, desde `origin/main` `7ccfad25`. Independiente de `claude/modest-archimedes-ae64x0`. PR en borrador, sin merge ni despliegue. Sin cambios de código, esquema, migraciones ni configuración.
- **Materiales:** `docs/operacion-cliente/` con índice y límites (`README.md`), inventario (`01-inventario.md`), manual de cajero (`02-manual-cajero.md`), manual de administrador (`03-manual-administrador.md`), capacitación de 60 min con datos ficticios (`04-plan-capacitacion.md`) y lista del primer día (`05-lista-verificacion-primer-dia.md`). Plantillas CSV en `plantillas/`.
- **Verificado en código:**
  - Importador CSV (`ImportarProductosModal.tsx`): solo 5 unidades (`unidad`, `caja`, `metro`, `kg`, `galón`); vacíos en precios o existencias pasan a 0 sin aviso, mínimo a 5, categoría a «Herramientas Manuales» y unidad a `unidad`; «Sobrescribir» reemplaza existencias. El botón «DESCARGAR PLANTILLA CSV» incluye 3 filas de ejemplo.
  - Alta (`productos.service.ts`): no escribe `costoVigente`, que queda para la recepción de compras; la existencia inicial genera movimiento `INICIAL`.
  - Venta (`ventas.service.ts`, `openCash`): exige caja abierta para cualquier método. El POS no tiene campo de efectivo recibido: el vuelto es manual. Métodos: EFECTIVO, TARJETA, TRANSFERENCIA, CREDITO.
  - Entregas (`/entregas`; ADMIN, CAJERO, BODEGUERO): confirmar entrega baja la existencia física y libera la reserva.
  - Cierre: diferencia obliga a explicación; cierre confirmado no se edita; historial completo de cierres solo ADMIN.
  - El cajero no tiene listado general de ventas; solo busca por número en Devoluciones.
- **Pruebas:** no hubo cambios de código, así que no se ejecutaron suites. Verificación documental: rutas y archivos citados existen; las plantillas tienen columnas consistentes; el ejemplo tiene códigos únicos `EJ-*`, unidades válidas y precios no nulos.
- **Límites:** sin validación en navegador con datos reales, en iPhone (cámara), con datáfono, ni de respaldo y restauración en producción. Roles de órdenes de compra sin confirmar.
- **Pendientes:** decisiones del dueño listadas en `03-manual-administrador.md` §13 (costo manual D1, importación que sobrescribe D4, marca/categoría D5, reembolso de devoluciones con abonos, sucursal, aprobación del cambio de fechas en reportes, salida de efectivo con segundo administrador, procedimiento fiscal). Nombres y contactos del responsable de soporte y canal de incidentes. Respaldo y restauración verificados. Capacitación realizada con evidencia. Validación en equipo del cliente. Aceptación del cliente: no concedida.
- **Bitácora:** lectura de este contexto y de Git; revisión de importador, alta, modelo, caja, POS, entregas, rutas y roles; rama creada desde `origin/main`; redacción de materiales y plantillas; verificación documental y de CSV; actualización de este documento.

### Preparación del inventario real (2026-10-12, rama `docs/preparacion-operativa-cliente`, PR #156)

- **Alcance:** fases 1–6 de la misión de inventario real. Solo documentación, plantillas y una herramienta que lee archivos. Sin cambios en código, backend, frontend, migraciones ni infraestructura. Codex no tiene archivos tocados en esta fase.
- **Entregables:** `docs/operacion-cliente/01-inventario.md` (reescrito: vías de carga, codificación, costos y precios); `03-manual-administrador.md` §13 (decisiones I1–I12 y permanentes); `05-lista-verificacion-primer-dia.md` (sección C ampliada); `06-control-previo-importacion.md` (nuevo); `07-levantamiento-conciliacion-jornada.md` (nuevo: conteo, dos personas, conciliación, plan de jornada); `plantillas/inventario_registro_maestro.csv` (ampliado con familia, códigos, costo de referencia, conteo, reconteo, diferencia); `herramientas/validar_plantilla.py` (nuevo).
- **Verificado en código:**
  - `costo_vigente` solo lo escribe la recepción de compra (`operaciones.service.ts`, línea 77), que además suma existencias y crea la cuenta por pagar. La cantidad de la recepción debe ser positiva (`ledger.ts`, `decimal`).
  - El alta, el importador y el aplicar del levantamiento escriben `precioCosto`, pero no `costoVigente`.
  - Levantamiento: el aplicar exige estado `FINALIZADO` y sin conflictos; valida la unidad contra los 12 valores del enum y no convierte cantidades; exige costo y precio para productos nuevos; bloquea si el conteo es menor que lo reservado; solo cambia las filas del levantamiento.
  - Código automático: prefijo del nombre en mayúsculas, máximo 18 caracteres, sufijo `-001`.
- **Impedimento para el PM (no implementado):** no existe un mecanismo seguro para fijar `costoVigente` del inventario inicial. Una compra de apertura duplicaría existencias y crearía deuda con el proveedor. Al arranque el costo vigente quedará vacío hasta la primera recepción. Decisión I12.
- **Pruebas:** el validador se probó con 11 casos fuera del repositorio: archivo correcto (pasa), duplicados, precios vacíos, coma decimal, unidades incorrectas incluido `galon`, filas de ejemplo, encabezados faltantes, UTF-8 inválido, código existente en catálogo, existencia distinta de 0, y archivo sin filas. No hubo cambios de código, así que no se ejecutaron suites.
- **Límites:** no validado en navegador con datos reales, lector de códigos ni cámara; el sistema no genera etiquetas; abreviaturas de codificación y familias pendientes de aprobación; no hay confirmación de si la pantalla de inventario lista productos inactivos (el control previo no los conoce sin esa lista).
- **Pendientes:** decisiones I1–I12, D1, D4 y D5; umbral de diferencia (I7); corte y ventas durante el conteo (I8); responsable de soporte y respaldo verificado (sin cambio); aceptación del cliente (no concedida).
- **Bitácora:** lectura del contexto y del estado de la rama; verificación de costos, codificación, conteo y aplicación en código; redacción de los entregables; prueba del validador; actualización de este documento.

## Preparación operativa para el cliente (2026-10-13 UTC)

- **Rama/PR:** `docs/preparacion-operativa-cliente` (PR #156), avanzada sobre `59de0589`. Solo documentación y plantillas. Sin cambios en backend, frontend ni migraciones; sin merge, despliegue ni operaciones en producción.
- **Materiales:** `docs/operacion-cliente/00-ENTREGA-PREPARACION.md` (estado, decisiones del dueño, dependencias de Codex), `08-primer-dia.md`, `09-equipos-y-accesos.md`, `10-capacitacion-30-min.md`, `11-captura-inventario-simple.md`.
- **Hallazgos verificados en código (candidato `85e4ff88`):** el importador ignora precios; un producto sin precio aprobado no se vende; no hay carga masiva de precios; el cajero no entrega (solo ADMIN y BODEGUERO); toda venta exige caja abierta; crear productos es ADMIN y BODEGUERO; las categorías se crean con cualquier texto; el importador acepta solo `unidad`, `caja`, `metro`, `kg` y `galón`.
- **Corrección de herramienta:** `herramientas/validar_plantilla.py` ya no exige columnas de precio. Plantillas v2: `inventario_importable_v2.csv` (vacía), `ejemplo_ficticio_v2.csv`, `precios_para_aprobar_administrador.csv` (no se importa). Las v1 quedan marcadas como superadas.
- **Pruebas:** validador verificado (plantilla vacía bloquea; ejemplo ficticio bloqueado; «galon» rechazado; «galón» aceptado). No se probó ningún dispositivo físico ni la interfaz real.
- **Pendientes:** decisiones D-A a D-P del dueño (precios, costo de referencia, costo vigente inicial, unidades, entrega, devoluciones, corte de inventario, soporte); dependencias C1 a C8 de Codex (candidato desplegado, preproducción, URL, variables, respaldo, CODEOWNER, funciones para verificación final).
- **Bitácora:** lectura de refs y PR; revisión de permisos y reglas en código; creación de documentos y plantillas; ajuste del validador; commit y push a la rama del PR #156; resumen en Issue #151.

---

## Auditoría 12/10 — correcciones backend (2026-10-13; PR #163 integrado en main el 2026-10-14, sin despliegue)

- **Estado:** backend corregido para P0/P1 de importación CSV, P1 de crédito (cobrado y saldo), P3 de redondeo en ventas y cotizaciones, y color de marca. **Pendiente en frontend** (Claude): el importador aún no envía precios; ver contrato en el informe. Decisiones pendientes del dueño: semántica de `aprobarPrecios` y vencimiento de crédito.
- **Integración comprobada:** merge #163 `6f16df94`, conservado en #162 y probado junto a #160; las cifras originales siguientes se conservan como evidencia de aquella sesión.
- **Commits:** `af13c754` (importación `POST /productos/importacion`), `beb317b6` (centavos en ventas y cotizaciones; `totalFacturado`, `totalCobrado`, `saldoPendiente`), `649ccb91` (color `#RRGGBB`).
- **Informe completo, contratos API y riesgos:** [AUDITORIA_BACKEND_CORRECCIONES_20261013.md](AUDITORIA_BACKEND_CORRECCIONES_20261013.md).
- **Pruebas (evidencia de ejecución local):** unitarias 43 archivos / 416 pasan; integración con PostgreSQL 16 desechable 57 archivos / 926 pasan (1 omitida, previa). Build, `test:scripts` (42/42) y control de migraciones correctos. Antes: 377 unitarias y 904 integración.
- **Esquema y migraciones:** sin cambios. No aplica informe NEXUS en esta entrega.
- **Bitácora:** lectura de AGENTS.md y del contexto; verificación de rama y commit base `4b650445`; línea base de pruebas; diagnóstico de P0 en `ImportarProductosModal.tsx` y `productos.service.ts`; implementación y pruebas de importación; redondeo en centavos con prueba de regresión contra la fórmula anterior; color de marca; informe y actualización de este documento.
- **Pendientes reales:** (1) adaptar importador frontend a `POST /productos/importacion`; (2) decidir `aprobarPrecios` y vencimiento de crédito; (3) redondeo en compras, devoluciones, abonos, dashboard y estado de cuenta; (4) medir importación de 5000 filas; (5) aprobar precios de productos ya importados con L.0.00 desde Precios y aprobación.
- **Entorno de pruebas:** `initdb` no corre como root. Para ejecutar las pruebas de integración se usó un envoltorio externo al repositorio que lo ejecuta como `ubuntu` (`PG_BIN`). No cambia el código ni las pruebas.

## Datos ficticios de un mes de operación (2026-10-15, rama `claude/laughing-lamport-phd4os`)

- **Alcance:** `backend/scripts/datos-ficticios-un-mes.sql` crea una empresa demo nueva («Ferreteria Demo Operacion 1 Mes») con operación del 16-sep al 14-oct-2026. Solo inserta datos: sin cambios de esquema, migraciones ni código de la aplicación. No toca otras empresas. Es una sola transacción.
- **Protección de entorno (corregida):** ejecutar únicamente con `backend/scripts/cargar-datos-demo.sh` y `DEMO_DATABASE_URL` (nunca `DATABASE_URL`). El envoltorio rechaza si `DEMO_DATABASE_URL` es igual a `DATABASE_URL`, si la lista `backend/prisma/entornos-seed.json` está vacía o tiene identificadores no válidos. El SQL exige: marca `entorno_ferresystem` única, tipo DESARROLLO o STAGING, e identificador de la marca presente en la lista autorizada (variable `AUTORIZADOS`). Cambiar solo el tipo de la marca no basta. Si falta la variable, psql aborta antes de insertar.
- **Corrección de compatibilidad:** las entregas desde bodega ahora llevan nombre de receptor (nombre del cliente de la venta), porque `entregas-core` lo exige. La huella se calcula con ese receptor.
- **Contenido (verificado en la última carga):** 522 ventas (911 líneas), 29 compras recibidas con CXP, 45 cuentas por cobrar, 50 cajas cerradas. Operación de lunes a sábado; el 15-sep se omite por feriado patrio.
- **Pruebas en base temporal desechable (PostgreSQL 16 con las migraciones de `main`, datos sintéticos):**
  - Rechazos antes de insertar nada (0 filas creadas en todos): marca ausente; marca PRODUCCION con identificador autorizado; identificador no autorizado; lista vacía; variable `AUTORIZADOS` sin definir; cambio de PRODUCCION a DESARROLLO sin autorización; empresa demo ya existente (segunda carga).
  - Envoltorio: sin `DEMO_DATABASE_URL`, `DEMO_DATABASE_URL` igual a `DATABASE_URL`, lista vacía del repositorio, identificador inválido: rechazados. Carga completa con lista de prueba en una copia desechable (el repositorio no cambió).
  - Integridad: 100 claves foráneas validadas; sin huérfanos en detalles, líneas de evento ni movimientos. Cálculos: líneas, subtotales, ISV, totales, compras, saldos CXC/CXP y diferencias de caja correctos (0 incumplimientos). Existencias sin negativos y reservas ≤ existencias. Ninguna entrega de bodega sin receptor.
  - Huellas: las 1.178 huellas almacenadas (522 COBRO, 656 ENTREGA) se recalcularon con `huellaAccionVenta` de `backend/src/common/huella-solicitud.ts` y coinciden todas.
- **Límites:** no ejecutado en Supabase ni en STAGING; no validado en navegador ni en la interfaz real. `conciliacion-credito-lectura.sql` exige un parámetro de empresa y no se ejecutó. No incluye devoluciones, apartados, pedidos especiales, garantías ni transferencias. En la carga de prueba quedaron 10 líneas de bodega (19 unidades) pendientes al 14-oct; el script usa aleatoriedad controlada (`random()`), así que estas cifras pueden variar entre cargas. Los datos son ficticios; los correos usan el dominio `.example`.
- **Pendientes:** registrar en `backend/prisma/entornos-seed.json` (revisión CODEOWNERS) solo los identificadores de bases de DESARROLLO o STAGING que deban recibir la demo; validar la carga en una base de desarrollo con la aplicación levantada. No requiere informe de NEXUS porque no cambia el esquema.
- **Bitácora:** lectura de AGENTS.md y del contexto; revisión del esquema Prisma, de los servicios de ventas, compras, caja, entregas y de la huella de eventos; creación del script; pruebas en base local con migraciones; actualización de este documento.

---

## Revisión de PR #170 — 2026-10-16 UTC (NEXUS para PostgreSQL)

- **Estado: WAITING FOR #171.** Rama exclusiva `qa/jules-03-saas-administracion-4258687846587708011`. Base `main` `d5fec352598cb6ef8933c27d9f1af4601e2c32c4`; #170 recibido en `af73e671e4406e0b976940b64e75219292770184`; #171 abierto en `220435fa015d7a3f597e562ef6708734f3cdc575` al investigar y `70179f51b72d55992c6f49a0e4983a8fcdac6041` al repetir la simulación; main sigue sin incluirlo. Sin ramas/PR nuevos, merge, despliegues manuales ni cambios en #171.
- **Seguridad corregida:** alta de negocio omitía la política existente de contraseñas y aceptaba vacía, corta, bloqueada, sin números y demasiado larga (cinco casos HTTP: esperado 400, recibido 201). `SuperAdminService.createTenant` ahora llama `isPasswordAllowed` antes de la transacción. No cambia la política ni cuentas existentes. Ocho regresiones unitarias incluyen nulos/tipos incorrectos; el fixture válido sigue comprobando el hash.
- **Pruebas engañosas sustituidas:** `saas-onboarding-audit.spec.ts` asignaba formatos/planes en mocks, ignoraba selects, no tenía rollback y devolvía JWT constante. Nueva `test/saas-onboarding.postgres.integration.ts`: 16 casos con HTTP/JWT y PostgreSQL temporal reales, migraciones, defaults, secuencias, módulos, hash, aislamiento, roles, sesiones, soporte y persistencia A4/80/58 mm. Mutación en copia aislada (nombre comercial forzado incorrectamente): las 6 pruebas originales pasan y las 3 nuevas de alta fallan. El mutante no se publica.
- **Defecto móvil:** la clase `negocio-settings-grid` dejó de activar el CSS de `tenant-settings-grid`. Regresión: 390 px pasa; 320 px deja controles hasta x=390. Se conserva la clase nueva y se añade la clase CSS existente. Dos pruebas verifican límites reales de los controles sin ocultar overflow.
- **Dependencias:** las entradas directas package.json/package-lock.json del HEAD recibido coincidían y npm 11.9 instalaba (398 paquetes), pero npm 10.9.4 falla en copia vacía: Missing typescript@5.9.3. La actualización de lock de Jules había eliminado el peer opcional anidado que tsconfck necesita con TypeScript 6 raíz. Regenerado con npm 10 mediante install --package-lock-only --ignore-scripts: solo recupera esa entrada previa (sin cambiar package.json ni versiones). Instalaciones limpias finales con npm 10.9.4 y 11.9: ambas correctas, 399 paquetes; frontend npm ci correcto (131 paquetes). Se conservan `multer` (import directo de `memoryStorage` en `super-admin.controller.ts`, logotipos privados) y `@types/multer` (tipos de desarrollo de ese import); sin paquetes nuevos. Se revierte solo el cambio incidental del pnpm-lock de backend al contenido de main para permitir su eliminación por #171; no se usa pnpm ni se pretende reparar ese lock histórico.
- **Render:** comando documentado comprobado en copia limpia con Node 24, NODE_ENV=production y URL PostgreSQL sintética: `npm ci --include=dev`, Prisma generate y build. Resultado: correcto primero con npm 11 (398 paquetes); tras reparar el peer, repetido con npm 10 (399 paquetes), Prisma 6.4.1 y build sin errores. No se accede al panel Render ni a producción.
- **Evidencia:** integración afectada (SaaS, configuración/logotipo, administración/soporte, autenticación fase 3, seguridad fase 2, auditoría de soporte) **99/99**, PostgreSQL 17.11 temporal sin root. Frontend unitarias **337/337**, scripts backend **48/48**, Python **10/10**; builds, lint sin errores (avisos existentes), guard correcto con 0 migraciones nuevas. Backend unitarias **502/502**. Tras regenerar el lock: nueva integración **16/16** y unitarias SuperAdmin **24/24** repetidas en copia instalada con npm 10. El rollback exige un trigger PostgreSQL que comprueba negocio/secuencias/módulos ya escritos antes del fallo sintético: un rechazo previo no pasa la prueba. Navegador afectado: **9/10** (las seis de configuración/móvil pasan; timeout de 30 s en movimiento de Caja, fuera de los archivos funcionales modificados). Se repite la suite de navegador sin carga paralela de compilaciones/pruebas backend; resultado final en #170.
- **Impresión:** PDFs reales de ReciboPDF/@react-pdf/renderer: A4 595.280029×841.890015 pt; 80 mm 226.770004 pt de ancho; 58 mm 164.410004 pt (altura 668 pt con el fixture). Sin impresoras físicas; no se toca la carga diferida de PDF que implementa #171.
- **CI/revisiones:** HEAD recibido con validate, guard y piloto real aprobados; sin reviews ni comentarios inline. Leídos comentarios generales y respuesta posterior de sincronización del lock. Consultar checks del nuevo HEAD en #170: los antiguos no certifican los commits nuevos.
- **Coordinación:** simulación inicial con `git merge-tree --write-tree HEAD origin/pr171`: solo conflicto modify/delete de backend/pnpm-lock.yaml; package.json y lock npm combinaban textualmente. #171 elimina @nestjs/mau, pg-gateway y source-map-support: las pruebas nuevas no los usan y se deben conservar esas eliminaciones. Simulación repetida contra #171 `70179f51`: sin conflictos textuales, dependencias directas/raíz del lock coinciden y las tres eliminaciones se conservan. Coincidencia textual del lock no sustituye regeneración npm tras la integración real. Este bloque se añade lejos del de #171 para evitar conflicto documental.
- **Tras integrar #171:** fetch y comprobar ascendencia en main; actualizar esta misma rama; conservar eliminaciones y multer/tipos; regenerar lockfiles npm afectados usando npm; npm ci, build Render, pruebas afectadas/integración y Actions en el nuevo HEAD. Resolver documentación conservando ambos registros. No se declara integración definitiva ni se sondea indefinidamente.
- **Límites:** sin validación de datos/configuración productivos, Supabase real, Safari/iPhone ni impresoras. Primera ejecución amplia local de navegador interrumpida: 36 aprobadas, 2 fallos en Caja y 2 interrumpidas bajo carga concurrente; se repiten Caja y configuración aisladamente sin modificar aserciones. No presentar esa ejecución como aprobada. Integración con #171 y checks del nuevo HEAD pendientes de consulta.
- **Bitácora:** lectura de AGENTS/contexto/límites NEXUS; fetch; diff completo incluidas capturas, comentarios y workflows; npm ci limpio; regresiones rojas; correcciones mínimas; HTTP/PostgreSQL real; mutación de control; PDFs; validación y publicación en la misma rama. Sin esquema/migraciones ni operaciones productivas.

---

## Auditoría adicional POS #202 — 2026-10-27 UTC (rama propia `codex/pr202-auditoria-precios`)

- **Publicación:** [#204](https://github.com/Nelosama/FerreSystem/pull/204), PR de correcciones dirigido a la rama de #202. [#202 actualizado](https://github.com/Nelosama/FerreSystem/pull/202#issuecomment-6445129453). Sus ramas y la de #180 no se modificaron; sin merge, despliegue ni producción. Informe: [AUDITORIA_POS_PR202_20261027.md](AUDITORIA_POS_PR202_20261027.md). Base `main` `2f6168dc`, #202 `59e739da`, #180 `3c84a7a`.
- **Cambio concurrente de base:** #202 avanzó a `cf194ee7` (retiro del aviso de cobro). Incorporado como ancestro mediante rebase solo de la rama propia, con respaldo y `--force-with-lease`, sin merge ni escritura en rama ajena. Contenido antes/después del rebase idéntico. Total silencioso/segundo clic conservados: builds/lint, 545 unitarias y 11 regresiones POS repetidas y aprobadas. CI por SHA en #204.
- **Corregido:** respuesta de cobro antigua consumida pese a existir un catálogo posterior; borrador externo sustituido durante la lectura; motivos vacíos/espacios o sin validar desde el servicio; reintentos que cambiaban/omitían el motivo auditado. Lecturas compartidas ligadas a empresa/usuario. Se conservan huellas v2 e idempotencia, permisos explícitos, transacciones y documentos históricos.
- **Evidencia terminada al preparar el informe:** backend 602 unitarias, 51 scripts, 6 E2E, Python 10; frontend 545 unitarias; builds/lint correctos; POS simulado 11/11; dos cajas/API/PG reales 1/1; devolución histórica PG 1/1. Combinación temporal de código con #180: 105 PG + 70 unitarias contables, builds de ambos paquetes correctos. **Resultados extensivos finales y CI por SHA, con fallos/omisiones/reintentos: #204**. Los verdes anteriores de #202 no acreditan estos cambios.
- **Validación extensa y sesión:** PostgreSQL local completo 65 archivos / **1117/1117**; navegador local 384 aprobadas, 2 fallidas y 26 omitidas. Además de la emulación offline, la prueba de recuperación leía el índice de la llamada al módulo antes de que existiera. Corregida solo la espera de la prueba, conservando orden y renovación única: escritorio **3/3**; móvil **16/16**. CI de `d99dab0f` completo verde (386 navegador + 26 omisiones, 16 móvil, 172 piloto real + 4 omisiones, backend/PG/E2E/scripts). La revisión posterior repite CI; **checks definitivos por SHA en #204**, no heredar los del SHA anterior.
- **Piloto, espera de catálogo:** run 419 de `33c8c36c` falló en la preparación del doble clic (171 aprobadas, 1 fallida, 4 omitidas): Enter salió ~110 ms antes de recibir el catálogo, según la traza. Se espera la tarjeta antes de Enter en los tests reales de ciclo/cajeros/cancelación/precios; el doble clic introduce latencia contra la API real y conserva venta/reserva únicas. Regresión dirigida **11/11** API/PG/navegador. Sin cambios del producto ni timeouts mayores. Nuevos checks por SHA en #204.
- **Límite de entorno demostrado:** Chromium 151 al recargar desde SW cambia `navigator.onLine` a true aunque fetch falle por red; reproducido en sonda sin Jowa. No se elimina/relaja la prueba ni se cambia la contingencia para ocultarlo. Incidencias de preparación, pasada roja e integración inicial bajo carga documentadas en el informe.
- **Dictamen:** #202 **NO MERGE** hasta incorporar las correcciones y validar el SHA resultante. Pendientes físicos: protocolo en caja/catálogo grande, dispositivos/impresora y aceptación del propietario. Offline mantiene la instantánea aprobada y revisión de revocación posterior; #180 conserva sus límites contables/fiscales. **NEXUS:** sin esquema/migraciones propias; pruebas sobre bases efímeras.
- **Bitácora:** inspección remota y CI; reproducción de carreras; correcciones; regresiones PostgreSQL/navegador; compatibilidad temporal #180; diagnóstico de emulación offline; commit/push solo en rama propia, PR #204, seguimiento en #202 y actualización de este contexto.

---

## Consolidación autorizada POS #202 + #204 — 2026-10-27 UTC

- El usuario autorizó expresamente el merge normal de #204 en la rama de #202, sin rebase/force push, ni merge a main o despliegue. #204 `ca54c775` no era ancestro de #202 `cf194ee7`; merge normal `8a3d07b8`, sin conflictos y árbol idéntico al validado.
- Se conservan catálogo/borradores/excepción/idempotencia y total silencioso/segundo clic. Se bloquean previews de la rama principal del POS antes de publicar.
- Compatibilidad revisada contra #180 `3c84a7a`, #203 `5269b99` y #205 `2e20f9f`. #180/#205 comparten una espera de catálogo: combinación temporal resuelta conservando espera HTTP, tarjeta visible y latencia de la regresión; no se integran sus funcionalidades en #202 ni se modifican sus ramas. Resultados de builds, unitarias, PostgreSQL y E2E de las combinaciones, CI del HEAD final y dictamen actualizado: #202.
- NEXUS: cero migraciones/esquema propios y bases de prueba efímeras. Las condiciones físicas y fiscales del informe anterior no certifican producción; el dictamen técnico de esta consolidación corresponde a los checks del nuevo HEAD de #202.

**FIN DEL CONTEXTO VIGENTE**


## 9. Anexo histórico íntegro — consultar selectivamente

Snapshot de los 20 Markdown de `docs/` existentes antes de esta consolidación. Se conservan completos para no perder requisitos, procedimientos ni pruebas. Sus afirmaciones reflejan fechas/ramas diferentes; las instrucciones internas de “actualizar este archivo” quedan reemplazadas por el protocolo del contexto maestro. Los enlaces relativos históricos pueden apuntar a los originales conservados. Este anexo es evidencia histórica, no una lista automática de tareas ni autorización para ejecutar comandos.


### H1 — APP_MOVIL_Y_NOTIFICACIONES.md

# App instalada y notificaciones del dueño

Requisito confirmado el 5 de octubre de 2026: el dueño debe instalar una app y recibir notificaciones con la app cerrada, independientemente de la sesión del navegador. La web móvil y su manifiesto no completan este requisito. Este documento define el siguiente bloque de trabajo; aún no hay app ni entrega push implementadas.

## Primera versión propuesta

App React Native con Expo, reutilizando la API y las reglas de empresa/ADMIN existentes. Confirmar Android/iPhone y distribución antes de preparar builds firmados.

- Inicio de sesión propio del dispositivo, con renovación segura; cerrar el navegador no cierra la sesión de la app.
- Registro del dispositivo y permiso de notificaciones push.
- Bandeja de solicitudes pendientes y detalle actualizado desde el servidor.
- Aprobar/rechazar devoluciones desde la cuenta ADMIN, con motivo y auditoría existentes.
- Al tocar una notificación, abrir la solicitud y comprobar su estado vigente. Con dos ADMIN, una solicitud ya atendida se muestra como tal; un aviso antiguo no permite repetir la decisión.
- Consultas básicas del negocio y avisos de stock/vencimientos en una etapa posterior según prioridad del dueño.

La aprobación de la devolución sigue separada de su ejecución en caja. La app no crea una segunda autorización ni ejecuta ajustes financieros desde el aviso recibido.

## Sesión, cierre y recepción

Cerrar o dejar en segundo plano la app conserva el registro del dispositivo y permite recibir push mediante el sistema operativo, si hay permiso y conectividad. No depende de que una pantalla web permanezca abierta. El comportamiento debe probarse en builds instalables de los dispositivos reales, incluyendo restricciones del sistema operativo; no basta Expo Go o una prueba de navegador.

Cerrar sesión explícitamente en la app, revocar su dispositivo o desactivar/cambiar el rol de la cuenta debe cancelar su registro de avisos administrativos y su acceso. Cerrar sesión en la web no revoca automáticamente la sesión independiente de la app; una revocación global sí debe abarcar todos los dispositivos.

La expiración del access token no elimina por sí sola el registro push de una sesión móvil vigente. Para ver detalles y decidir, la app renueva su sesión o pide login. Un aviso en pantalla bloqueada muestra un mensaje genérico, sin credenciales ni información financiera sensible.

El refresh actual del backend usa cookie del navegador; el logout web borra esa cookie y no hay sesiones revocables por dispositivo. Access y refresh tampoco tienen propósito diferenciado en sus payloads. Antes de extenderlo a móvil, distinguir ambos propósitos y añadir sesiones por dispositivo con refresh rotatorio/revocable y comprobación de revocación en backend. Usar almacenamiento seguro del sistema; no asumir que copiar localStorage o una cookie web proporciona ese circuito.

## Base local y entrega de avisos

Conservar PostgreSQL local como fuente de ventas, caja, inventario y autorizaciones. Propuesta de menor alcance: registrar un evento pendiente en la misma transacción que crea la solicitud y usar un proceso local que lo entregue a Expo Push o FCM/APNs mediante HTTPS saliente. Así no se necesita alojar la base operativa en nube. Si se necesita un puente para acceso remoto sin VPN, puede manejar eventos/comandos limitados sin alojar toda la base operativa.

Los eventos deben conservarse ante reinicio o pérdida de Internet, con identidad, reintentos y control de duplicados. Aceptación por el proveedor no equivale a que el dueño lo haya leído; la bandeja del servidor sigue mostrando las solicitudes pendientes. El dispositivo se verifica contra usuario, empresa, rol y estado activo antes de cada envío administrativo.

El acceso remoto a los detalles y decisiones necesita una ruta segura al servidor: VPN o puente autenticado con alcance limitado. Push por sí solo no resuelve ese acceso ni debe conceder autorización. No publicar PostgreSQL ni aceptar decisiones anónimas desde la notificación.

Si el local pierde Internet, caja continúa con servidor/LAN encendidos y los avisos se entregan al reconectar. Mientras tanto no hay autorización remota inmediata; un ADMIN local puede decidir usando su propia cuenta. Si se apaga el servidor, la app informa falta de acceso y no presenta una aprobación como confirmada.

## Orden de implementación y aceptación

1. Confirmar plataforma, forma de distribución y conexión remota.
2. Preparar app con login seguro, bandeja y lectura del detalle usando la API existente.
3. Agregar sesiones/registro/revocación de dispositivos y cola persistente de eventos en backend.
4. Configurar proveedor/credenciales push y probar avisos con app cerrada en builds instalados.
5. Conectar decisión autorizada, comprobación del estado actual y auditoría; probar dos ADMIN simultáneos.
6. Probar logout/revocación, access token vencido, Internet interrumpido, reintentos y reconexión sin duplicar operaciones.

Las credenciales/cuentas de publicación y de push deben configurarse fuera del repositorio. La plataforma y el acceso a esos servicios aún no están confirmados. La entrega de esta app es un requisito del cliente; no debe marcarse completada por disponer de web adaptable o manifiesto.


### H2 — AUDITORIA_RAMA_20261005.md

# Auditoría de codex/recuperacion-ventas

Revisión del PR #59 y del paquete de instalación local preparado el 5 de octubre de 2026. Alcance: recuperación de ventas/devoluciones, autorización e integridad económica, migraciones, respaldo/restauración, sesión entre pestañas y despliegue Docker. Se utilizaron datos sintéticos y bases aisladas; no datos de la ferretería.

## Hallazgos y correcciones

| Prioridad | Hallazgo confirmado | Corrección y evidencia |
|---|---|---|
| P1 | Respuestas tardías del POS podían sustituir el comprobante vigente y borrar la recuperación de una operación posterior. | Validar empresa, usuario e identidad de solicitud al procesar respuestas; cerrar únicamente la recuperación correspondiente al comprobante. Regresiones del flujo con respuestas demoradas. |
| P1 | Revocar rol/permisos mientras una operación esperaba el bloqueo no impedía algunos mutadores económicos. | Releer usuario activo, empresa, rol y permiso dentro del mismo bloqueo que gestión de usuarios, antes de ventas, caja, pagos, compras, entrega, productos, aplicación de conteos y conversión de cotizaciones. |
| P1 | Cerrar el comprobante de una devolución anterior podía eliminar otra solicitud pendiente. | Comparar identidad del comando antes de limpiar recuperación; conservar la solicitud posterior. |
| P1 | Un cambio de login en otra pestaña podía refrescar solo el usuario y mantener la empresa anterior en el contexto. | Vincular la sincronización a la identidad del contexto y resolver cambios completos de sesión sin mezclar empresas. |
| P2 | Un rechazo definitivo al decidir/ejecutar una devolución podía dejar el flujo bloqueado indefinidamente. | Reconciliar el estado con lectura del servidor y conservar identidad en resultados inciertos; habilitar la siguiente acción únicamente con resultado confirmado. |
| P1 | Caddy enviaba las solicitudes a la API interna al proxy externo del entorno y recibía HTTP 403. | Excluir los hosts internos mediante NO_PROXY, conservando el proxy externo. HTTPS con CA/SNI válidos aprobado para Inicio, salud y manifiesto. |
| P2 | El comando de respaldo manual omitía la preparación privada de PG* y fallaba. | Envolver comandos ejecutados con exec en container-entry.mjs; el comando corregido generó un respaldo real del ensayo. |
| P2 | El usuario de respaldos no podía leer package.json al verificar una restauración. | Declarar permisos de lectura de código/configuración pública en la imagen, conservando permisos privados de secretos y copias. |
| P2 | Una ruta externa enlazada al repositorio permitía crear secretos/copias dentro de él. | Canonicalizar proyecto y ancestro existente antes de crear directorios; regresiones con symlinks y enlaces rotos. |
| P2 | La configuración alteraba barras POSIX/nombres comerciales y podía interpolar dólares. | Conservar valores y codificar dólares literales; validar el modelo real de Compose con fixtures temporales. |
| P2 | El panel seguía diciendo que faltaba comprobar restauración después de verificarla. | Vincular el intento programado a su manifiesto y SHA mediante IPC; derivar el estado de la evidencia actualizada por restore-verify. Se rechazan rutas/manifiestos inválidos. |
| P1 | Había archivos de entorno y artefactos generados bajo seguimiento de Git. | Retirarlos del índice en commit separado y conservar copias locales. El historial anterior requiere revisión de credenciales por su propietario. |
| P1 | La lectura de Excel dependía de XLSX con vulnerabilidades conocidas sin actualización correctiva disponible. | Retirar XLSX; mantener importación CSV UTF-8 con límites de tamaño/filas y pruebas. Auditoría npm productiva sin vulnerabilidades conocidas reportadas. |

## Evidencia técnica

El despliegue de ensayo creó empresa/ADMIN sin seed, agregó un cajero, abrió caja, vendió, entregó, solicitó y autorizó una devolución parcial, la ejecutó y repitió sin duplicar el reintegro. El stock final fue 9 a partir de 10, venta de 2 y devolución de 1.

Se generó un respaldo mediante pg_dump y se restauró en otra base vacía con el usuario no privilegiado de respaldos. El endpoint administrativo informó restauración comprobada y rechazó al cajero con HTTP 403. Se mantuvieron los volúmenes al recrear servicios y se verificaron venta, devolución y stock en una red Docker interna sin salida a Internet. Después de SIGKILL a PostgreSQL/backend, el sistema recuperó la venta confirmada, la devolución y el stock esperado. La suite PostgreSQL también comprueba rollback de transacción incompleta y reintento sin duplicar dinero/reservas. La validación HTTPS usa la CA pública del ensayo y comprueba nombre/cadena; no desactiva TLS.

Resultado final: **208 pruebas aprobadas** (58 frontend, 88 backend, 55 PostgreSQL real aislado y 7 scripts). Builds frontend con `/api`, backend y las imágenes Docker aprobados; `git diff --check` limpio. Auditoría npm `--omit=dev`: cero vulnerabilidades conocidas reportadas en ambos paquetes. Las pruebas de scripts quedan incluidas en CI.

Los avisos de Vite sobre fragmentos grandes y configuración CommonJS siguen siendo deuda de rendimiento/mantenimiento; no impidieron compilar. La retirada de XLSX hace que Excel requiera guardar como CSV UTF-8 antes de importar. El ensayo Linux/Docker no verifica dispositivos móviles reales ni arranque desatendido de Docker Desktop en Windows.

## Pendientes que impiden declarar lista la instalación real

1. Copia reciente de la base real y ensayo de actualización/restauración con conciliación del negocio.
2. Si los archivos de entorno históricos contenían credenciales reales, rotarlas y evaluar limpieza del historial. No se leyeron sus valores ni se reescribió historial durante esta auditoría.
3. Hardware/OS, arranque automático, router/DNS, confianza HTTPS en caja/celulares, UPS y prueba física de corte.
4. Respaldo externo al servidor, retención/espacio y responsable de restauraciones periódicas. Seis horas entre copias implican posible pérdida de operaciones desde la última copia si se pierde el disco completo.
5. Piloto con cajero y ambos administradores; impresora/lector, reglas fiscales y política de devoluciones/garantías.
6. Acceso remoto seguro y notificaciones móviles; segunda sucursal/sincronización requieren implementación adicional.

La auditoría cubre los flujos indicados y sus regresiones; no certifica todos los módulos preexistentes. No se habilita cobro simultáneo desde varias pestañas ni operación independiente de caja cuando cae el servidor/LAN. Los bloqueos económicos conservan un orden por empresa; no convierten la instalación en un sistema distribuido.


### H3 — AVANCE_DEVOLUCIONES_AUTORIZADAS.md

# Devoluciones con autorización administrativa

Rama: `codex/recuperacion-ventas`. PR: #59.

## Recorrido

1. Caja, vendedor o administrador busca el número de venta y selecciona cantidades, destino de cada producto, motivo y método de reembolso.
2. La solicitud se guarda en la base como **PENDIENTE**. No cambia caja, cuenta ni existencias. Conserva una identidad estable y el comando exacto.
3. Un administrador autenticado, de la misma empresa, revisa productos, cantidades, importe estimado, pago original y motivo. **Autoriza o rechaza** e indica el motivo de su decisión. Tampoco se realizan ajustes en este paso.
4. El solicitante confirma una solicitud **AUTORIZADA** desde su sesión. Si hay dinero a reembolsar, necesita su propia caja abierta; el efectivo debe alcanzar.
5. Una sola transacción registra devolución, detalles, movimientos de inventario/caja, reducción de crédito, auditoría y estado **EJECUTADA**. La venta original se conserva.

La ferretería puede tener dos o más administradores con cuentas individuales. Todos ven las solicitudes de su empresa y cualquiera puede decidir; basta la autorización de uno. Si deciden simultáneamente, se conserva la primera decisión confirmada y su autor; la otra recibe un conflicto y debe actualizar el estado. No se exige una doble aprobación.

El administrador autoriza usando su cuenta: no se comparte su contraseña con el cajero ni se confía en aprobaciones almacenadas en el navegador. El solicitante no puede cambiar cantidades, motivo o método de una solicitud ya registrada. Un reintento de una decisión idéntica recupera esa decisión; otra decisión sobre la misma solicitud se rechaza.

## Controles

- Solicitudes y comprobantes están aislados por empresa. El personal consulta solo sus solicitudes; el administrador revisa las de su empresa. Solo el solicitante ejecuta la devolución contra su caja.
- El servidor valida el administrador al decidir y vuelve a comprobar que siga activo y sea ADMIN antes de la primera ejecución. Cambiar un botón o el almacenamiento local no concede autorización.
- Antes de ejecutar se recalculan cantidades disponibles y destino. Si hubo otra devolución o una entrega después de la autorización, una solicitud incompatible no produce ajustes.
- La devolución parcial distribuye el total original, incluidos descuentos e impuestos, conservando los controles existentes para no devolver de más.
- Se reduce primero el crédito pendiente. El excedente es reembolso. Solo INVENTARIO incrementa stock vendible de mercadería entregada; DAÑADO/PROVEEDOR mantienen trazabilidad; NO_ENTREGADO libera la reserva.
- El importe mostrado al administrador es estimado: los pagos y devoluciones posteriores pueden cambiar la distribución entre crédito cancelado y reembolso. El comprobante muestra los valores definitivos.
- Tarjeta y transferencia registran el movimiento contable; no procesan automáticamente pagos en el banco.
- Auditoría guarda quién solicitó, quién decidió, el motivo, quién ejecutó y la relación con la venta/devolución. Una solicitud pendiente o rechazada no equivale a una devolución registrada.

## Interrupciones y recuperación

El navegador guarda la operación pendiente por usuario/empresa antes de enviarla. Una consulta recupera solicitudes y devoluciones confirmadas; ante desconexión o sesión vencida no se genera otra identidad. Repetir ejecución consulta el resultado ya registrado o ejecuta el mismo comando una sola vez.

El comprobante permanece recuperable hasta que el usuario lo cierra. Si falla el almacenamiento antes de enviar, se bloquea la operación. JSON corrupto se conserva para revisión. Los pendientes del flujo administrativo anterior siguen consultándose como devoluciones directas, con la misma identidad.

Una solicitud no registrada puede corregirse después de consultar su ausencia, manteniendo el mismo identificador. Se consulta otra vez antes del envío: una confirmación tardía no se sustituye por otra solicitud. Si la original se confirmó con otros datos, se recupera lo registrado y se informa que las correcciones no se aplicaron; el usuario revisa la solicitud original antes de continuar.

La base conserva las solicitudes registradas aunque se reinicie el navegador o se use otro equipo. El cuerpo todavía no confirmado y el comprobante pendiente dependen del navegador original. La pérdida física del disco requiere respaldo; esto no implementa operación offline.

## Instalación y límites

Se añadió `20261005000000_autorizaciones_devolucion`; las migraciones anteriores no cambian. Aplicar el procedimiento de `INSTALACION_Y_ACTUALIZACION_SEGURA.md` sobre copia comprobada antes de producción.

El flujo cubre devoluciones/cancelaciones totales o parciales de ventas. No revierte todavía compras, recepciones, pagos, aperturas/cierres de caja ni transferencias. No incluye aplicación móvil, notificaciones push ni autorización por PIN. La revisión administrativa requiere acceso al mismo servidor. Autorizar no caduca automáticamente; una solicitud incompatible requiere nueva solicitud y revisión, y la anterior no podrá ejecutarse mientras siga siendo incompatible.

## Validación

- Build frontend/backend y validación Prisma.
- 36 pruebas frontend: recuperación de respuesta perdida sin POST, bloqueo de doble clic/almacenamiento, sesión que cambia durante consulta, pendiente antiguo/corrupto y corrección con identidad conservada.
- 52 pruebas unitarias backend.
- 50 pruebas PostgreSQL aislado, incluyendo migraciones y diez casos nuevos del flujo autorizado: permisos, aislamiento, inmutabilidad, aprobación/rechazo, rollback, reintentos concurrentes, crédito, administrador desactivado, entrega posterior, devolución parcial, cantidades consumidas y dos administradores consultando/decidiendo simultáneamente.

Pendiente: aceptación con cajero/administrador reales, corte físico de energía y actualización sobre copia real de producción. No se modificaron datos productivos.


### H4 — AVANCE_P0_RECUPERACION_Y_RESPALDOS.md

# Avance P0: recuperación de ventas y respaldo

Fecha: 5 de octubre de 2026. Cambios preparados en codex/recuperacion-ventas.

Actualización: la instalación desde cero y la adopción controlada de bases históricas están preparadas en [Instalación y actualización segura](INSTALACION_Y_ACTUALIZACION_SEGURA.md). El bloqueo de baseline descrito abajo corresponde al diagnóstico inicial; su resolución productiva sigue pendiente de inspección real.

## Recuperación implementada en esta etapa

- Borrador automático de carrito, cantidades, cliente, descuento y método de pago, separado por empresa y usuario.
- Al regresar al POS con el mismo navegador/equipo/usuario se recupera el borrador o la solicitud pendiente. No se envía ninguna venta automáticamente.
- “Revisar venta y continuar” consulta un endpoint autenticado y limitado a empresa/usuario. La consulta espera la transacción de venta en curso y no registra ni cobra.
- Una venta ya registrada muestra su comprobante con datos del servidor. El pendiente solo se elimina al cerrar el comprobante o iniciar otra venta desde él, cubriendo la interrupción entre confirmación y visualización.
- Una venta no registrada permite continuar con su mismo identificador, después de verificar el pago físico. Puede corregirse sin perder ese identificador; cada reintento consulta otra vez antes de enviar.
- Datos corruptos, almacenamiento inaccesible o falta de conexión muestran mensajes y no se convierten silenciosamente en otra venta.
- Sesión vencida, permisos o conflicto no borran la identidad pendiente.

Esto no crea operación offline completa. Borradores no descuentan ni reservan inventario. No usar navegación privada, borrar datos del navegador ni cambiar el origen/URL del frontend para una recuperación pendiente. La escritura del navegador no garantiza supervivencia ante daño de disco; comprobar el equipo y usar UPS. El efecto guarda cambios después del render de React: no garantiza el último carácter justo antes de un corte físico.

La prueba de cambios de usuario impide mostrar el resultado de una consulta anterior en otra cuenta. Las notificaciones de cambios de almacenamiento actualizan otras pestañas, pero no se garantiza una sesión de cobro concurrente entre pestañas; usar una sola pestaña POS por puesto. La recuperación está en POS, no en un centro general para todas las operaciones al iniciar sesión.

Los mensajes de pago no verifican efectivo ni terminal bancaria automáticamente. Comprobar el cobro físico antes de continuar. No se implementaron reversos autorizados en esta etapa.

## Respaldo y diagnóstico preparados

Herramientas: backend/scripts/backup-preflight.mjs y backend/scripts/preflight.sql.

El diagnóstico usa una transacción READ ONLY y consulta configuración de durabilidad, historial Prisma, cantidades y anomalías básicas. No aplica migraciones ni cambia saldos. El respaldo usa pg_dump custom, comprueba que el archivo sea legible y genera checksum SHA-256. No copia credenciales en el manifiesto ni muestra errores que puedan contenerlas.

La restauración completa sigue siendo necesaria: leer un archivo no prueba que pueda restaurarse. La prueba automatizada restaura datos ficticios en otra base del clúster aislado y compara ventas, productos y movimientos de caja. Esto no certifica el respaldo de producción.

Requisitos: Node, herramientas PostgreSQL compatibles con la versión del origen, acceso de lectura suficiente y almacenamiento privado. Para POSIX se crean directorios privados y archivos con permisos limitados; en Windows revisar ACL del directorio. Usar una cuenta explícita y el almacén de credenciales del administrador, PGPASSFILE/PGSERVICE o configuración equivalente. No incluir contraseñas en comandos ni en Git. No se utiliza DATABASE_URL ni se lee .env automáticamente.

Ejemplo con servicio de conexión previamente configurado por el administrador:

```sh
PGSERVICE=ferresystem_backup node backend/scripts/backup-preflight.mjs /ruta/privada/respaldos
```

Con PGHOST/PGPORT/PGDATABASE/PGUSER también es posible; para conexión remota configurar TLS verificable según proveedor. PG_BIN permite seleccionar el directorio de binarios. El reporte y el dump se toman en momentos distintos: usar una ventana operativa controlada para conciliación final. Proteger y copiar el respaldo fuera del equipo, definir retención y probar restauración; la herramienta no configura programación ni cifrado del destino.

## Hallazgos que siguen bloqueando puesta en operación

1. Este entorno no tiene credenciales productivas configuradas: no se hizo respaldo ni consulta de producción y no se aplicaron migraciones.
2. La primera migración del repositorio presupone que tenants y otras tablas base ya existen. No basta ejecutar migrate deploy sobre una base vacía para instalar en una PC nueva. Comprobar historial real, resolver baseline y ensayar sobre copia antes de cualquier cambio productivo. No usar reset ni db push para forzar coincidencia.
3. Hay archivos .env.local y .env.vercel versionados. Revisar si contienen secretos; retirarlos del versionado y rotar cualquier secreto expuesto si corresponde. No se leyeron sus valores ni se confirmó exposición de credenciales en esta revisión.
4. Falta decidir arquitectura/equipo/UPS, comprobar dispositivos y probar usabilidad con cajero y administrador.
5. Falta automatizar respaldo externo y probar restauración de datos reales en entorno aislado.
6. Frontend y backend deben desplegarse juntos para habilitar el nuevo endpoint. Recompilar desde fuentes; no usar dist antiguos versionados.

## Verificación y límites

La suite ampliada verifica borrador previo a Cobrar, respuesta perdida, comprobante tras recarga, consulta sin POST, sesión vencida, aislamiento de usuario/empresa, datos corruptos, fallos de almacenamiento y corrección con confirmación tardía. PostgreSQL aislado verifica consulta sin escrituras, espera de transacciones, reinicio abrupto, rollback de una venta incompleta, persistencia de una confirmada y reintento sin duplicados; también respaldo/restauración y HTTP autenticado con UUID válido.

Un stop inmediato del proceso PostgreSQL modela recuperación tras caída del servidor; no es una prueba de corte eléctrico físico ni daño de disco. Pendientes: prueba real con UPS/equipos, impresión y aceptación del usuario.


### H5 — AVANCE_USABILIDAD_ADMIN_Y_CAJA.md

# Inicio por tareas y buscador de navegación

Implementado en `codex/recuperacion-ventas`, dentro del PR #59.

- Buscador en todas las pantallas autenticadas, con navegación lateral, superior y móvil. Encuentra pantallas por palabras de trabajo cotidiano: comprar, personal, cobrar, caja, crédito o cotizar; admite mayúsculas, acentos y varias palabras.
- Inicio del administrador con compras, productos, usuarios, reportes, cuentas, caja, devoluciones y auditoría. Inicio de caja con apertura, venta, cotización, clientes, abonos y entregas. Bodega tiene sus propios accesos.
- Descripciones breves explican para qué sirve cada acceso. Caja muestra el orden recomendado: abrir, vender, contar y cerrar.
- Los accesos respetan el rol y los módulos habilitados. Menús y buscador comparten la comprobación de acceso. El administrador vuelve a ver reportes aunque no reciba una lista explícita de permisos, como ya permiten las rutas protegidas.
- Las pantallas todavía pendientes no aparecen como tareas disponibles en el buscador ni como accesos del inicio.
- Se corrigieron dos rutas que estaban fuera de `Routes` y podían impedir el arranque de la aplicación.
- El resumen informa si está cargando o falló, permite reintentar y mantiene disponibles las tareas. Se retiraron del inicio los enlaces que no respetaban el rol, el porcentaje de crecimiento ficticio y la tendencia semanal de ejemplo. La cabecera ya no inventa un horario de turno.

## Alcance y próximos pasos

Este buscador encuentra **pantallas y tareas**, no registros de todas las tablas. Los productos y clientes se buscan dentro de sus módulos. No ejecuta operaciones ni concede autorizaciones.

Sigue pendiente validar estos recorridos con el cajero y el administrador de la ferretería: abrir caja, completar una venta, recibir una compra, registrar un abono y revisar un reporte. Medir los pasos que les cuestan y simplificar esos formularios será la siguiente mejora de usabilidad. Las notificaciones y autorizaciones remotas requieren una implementación real aparte.

## Validación

Compilación de producción y 29 pruebas frontend aprobadas. Las seis pruebas nuevas cubren búsqueda, acentos, permisos, módulos deshabilitados, tareas pendientes, renderizado real de React con enlaces del router y ubicación de rutas. No se validó todavía con usuarios de la ferretería ni con una base productiva.


### H6 — DIAGNOSTICO_MAIN_20261004.md

# Diagnóstico de FerreSystem frente a requisitos del cliente
Fecha de auditoría: 2026-10-04.
Fuente de verdad: main, commit 84e61ec161455d46c2786791e6422178477ac886, confirmado también al terminar la inspección.
Último commit: 2026-10-03, “docs: registrar requisitos validados con dueño del negocio”.

## 1. Resumen ejecutivo
FerreSystem dispone de persistencia real para productos, usuarios, clientes, ventas, cotizaciones y capturas básicas de levantamiento. El registro de ventas y conversión de cotizaciones usan transacciones y descuentos condicionales de stock; el POS conserva una identidad para reintentar cobros.

El núcleo completo del piloto todavía no está cerrado: compras/proveedores, recepción, historial de costos, cuentas por pagar/cobrar, cierre de caja, Kardex, entrega y venta sin inventario no forman un circuito persistente y auditable. Compras, garantías, pedidos especiales y arqueos son interfaces con almacenamiento local. No se contabilizan como implementación real del requisito.

Los riesgos inmediatos son crédito sin cliente ni deuda, descuentos/precios aceptados sin autorización backend, cierres calculados con ventas vacías, modificación de existencias sin movimientos, y operaciones de levantamiento accesibles al cajero por API.

### Alcance y límites de la verificación
Se inventarió el árbol completo mediante GitHub, se obtuvieron 163 archivos propios de código/configuración/documentación/pruebas y se contrastaron rutas, servicios, DTOs, esquema y las tres migraciones versionadas. No se consideraron dependencias node_modules evidencia de funcionalidades. Se inspeccionaron además artefactos dist relevantes para detectar diferencias con src.

La clonación no pudo ejecutarse porque el proxy del shell no aceptó la conexión; la revisión continuó con el conector GitHub sobre el SHA fijado. Los archivos descargados son una copia de lectura en /workspace/FerreSystem-audit. No se modificó código del repositorio ni se hizo commit, push, despliegue o migración.

La clasificación IMPLEMENTADO significa que el circuito está conectado y persiste mediante Prisma/PostgreSQL en el código revisado. No significa validación del despliegue actual ni ejecución de operaciones sobre una base real en esta sesión. No hay credenciales de base de datos configuradas en este entorno. La ejecución de los tests frontend se bloqueó antes de ejecutar casos por ausencia de typescript; tampoco están instalados initdb/psql para la suite de PostgreSQL. Los tests existentes se inspeccionaron, pero no se presentan como pruebas aprobadas. No se usaron mocks como prueba de persistencia.

## 2. Requerimientos encontrados en las anotaciones
Fuente primaria: docs/REQUISITOS_NEGOCIO_VALIDADO.md, fecha 2026-10-02, conversación con el dueño.
1. Inventario prioritario; levantamiento inicial; registrar venta antes de entregar; trazabilidad y faltantes; reposición por rotación.
2. Historial compra/proveedor y costo vigente separado; reposición actualiza costo tanto al subir como al bajar; margen y precio por producto; capturarlos en levantamiento.
3. Múltiples proveedores, factura de compra, cantidades/costos/fechas; vencimientos/plazos, saldos y pagos propios; recepción física incrementa stock; alertas.
4. Contado: efectivo, transferencia, tarjeta/POS; venta atribuida al cajero y cierre por empleado. Integración bancaria posterior.
5. Crédito exclusivamente a clientes registrados, identificador, documento contado/crédito, deuda automática, abonos, saldo e historial.
6. Administrador/Cajero; cajero vende y consulta sin modificar información sensible; auditoría de usuario, operación, fecha, importe, método y cierre; autor/modificador administrativo.
7. Código fabricante/proveedor, código interno, escáner/cámara, búsqueda descriptiva y variantes distinguibles.
8. Foto opcional de identificación, optimizada para evitar imágenes pesadas directamente en BD.
9. Venta especial que nunca entra físicamente: ingreso/venta/documento/cierre/historial sin salida física, vinculada a compra/proveedor; no resolverla con stock negativo. Si llega al local, sí entra al inventario.
10. Devolución ligada al documento original e impacto en stock, factura, reembolso, crédito y garantía; motivo, usuario, fecha y destino.
11. Garantías vinculadas a producto/venta, condiciones/vigencia/responsable. Reglas exactas pendientes del cliente.
12. Alertas operativas, uso web desde PC/celular, offline con sincronización y prevención de duplicidad.
13. Vidriería/ventanas y estructura empresarial/permisos posteriores al piloto.
14. Investigación de integración bancaria/POS posterior, sin bloquear piloto.

Fuentes complementarias de backlog, sin atribuir todos sus detalles a la reunión:
- docs/PENDIENTES_LEVANTAMIENTO_INVENTARIO.md: aplicar explícitamente después de revisión/conciliación; multiusuario, concurrencia, zonas, offline/idempotencia; escaneo barcode/QR; foto para artículo aún no identificado y revisión posterior; decimales/presentaciones; auditoría, reconteos; exportación independiente CSV/Excel con columnas/plantillas.
- docs/ROADMAP_FERRESYSTEM.md: Kardex, cartera, alertas, resumen diario y permisos persistentes. Su P2 para costos/múltiples proveedores entra en conflicto con el P0 validado posteriormente: para esta propuesta prevalece la nota del dueño.

### Requerimiento completo de fotografías
La fuente primaria pide una fotografía opcional como ayuda de identificación y optimización para no almacenar imágenes pesadas directamente en BD. El documento de levantamiento añade tomarla durante el conteo, usarla si aún no se identifica completamente el artículo y dejarlo pendiente de completar en revisión.
No se documentan cantidad de fotos, resolución exacta, proveedor de almacenamiento, IA, reconocimiento automático o fotos obligatorias. Las decisiones técnicas de almacenamiento/compresión son propuestas de implementación, no requisitos atribuidos al cliente.

## 3. Matriz de cumplimiento
En “Base de datos”, SQL aislado significa tabla declarada en una migración, sin modelo Prisma actual ni circuito de escritura conectado; no demuestra despliegue ni persistencia funcional.
Evidencias E01–E15 se detallan después.

| Requerimiento | Estado | Frontend | Backend | Base de datos | Evidencia | Qué falta |
|---|---|---|---|---|---|---|
| Catálogo con costo y precio vigentes persistentes | IMPLEMENTADO | Consulta/alta real | CRUD validado y aislado por tenant | Producto.precioCosto/precioVenta | E01 | Verificar despliegue; ampliaciones se evalúan abajo |
| Costos históricos por compra/proveedor, fecha/cantidad/documento | NO IMPLEMENTADO | Orden local no satisface historial real | No servicio de compras/recepciones | SQL de orden/detalle aislado; sin modelos actuales | E02 | Historial inmutable y vínculo de documentos |
| Costo vigente actualizado por compra más reciente incluso menor | NO IMPLEMENTADO | Recepción solo cambia estado local | Ninguna operación de recepción actualiza Producto | Solo campo vigente | E01/E02 | Recepción transaccional y regla temporal clara |
| Múltiples proveedores de un producto | NO IMPLEMENTADO | Selección local en órdenes | Sin relación/servicio operativo | Sin relación Prisma producto-proveedor | E02 | Relaciones y trazabilidad por compras |
| Margen y precio propios por producto | PARCIAL | Precio por artículo; margen calculado en reportes | Persiste costo/precio, no política de margen | Sin margen configurado | E01/E10 | Persistir/aplicar margen si se configura; definir relación precio-margen |
| Costo, margen y precio en levantamiento inicial | IMPLEMENTADO CON ERROR | Precio estimado visible, no enviado | DTO carece de estos campos | LevantamientoItem carece de ellos | E04 | Contrato y persistencia completos |
| Proveedores y órdenes de compra reales | PARCIAL | CRUD localStorage | No controladores/servicios | Tablas SQL aisladas | E02/E12 | Conectar almacenamiento real y permisos |
| Facturas proveedor, plazos, saldo, pagos y estado | NO IMPLEMENTADO | Órdenes no son libro de cuentas | Sin cuentas por pagar/pagos | Sin modelos actuales de factura/saldo/pago | E02/E03 | Circuito de CxP y saldo propio |
| Recepción física incrementa stock y registra movimiento | IMPLEMENTADO CON ERROR | “Recepción total” confirma solo local | Sin operación de recepción | Stock de Producto no cambia | E02 | Recepción parcial/total atómica e idempotente |
| Roles mínimos Administrador/Cajero | IMPLEMENTADO | Login/rutas por rol | JWT y RolesGuard donde se declara | Usuario.rol; enum Rol | E05 | Completar cobertura de operaciones sensibles |
| Cajero no cambia costo/producto por API | IMPLEMENTADO | Inventario restringido | POST/PUT ADMIN/BODEGUERO; DELETE ADMIN | Solo rutas autorizadas del CRUD | E01/E05 | Separar política de BODEGUERO si se decide |
| Cajero sin acceso a operaciones administrativas sensibles | IMPLEMENTADO CON ERROR | Oculta levantamiento | No @Roles en levantamientos; clientes sin RolesGuard | Puede editar/borrar capturas/clientes | E04/E05 | Matriz de permisos backend por operación |
| Permisos individuales, descuento y sucursal persistentes | IMPLEMENTADO CON ERROR | Selección y aparente guardado en estado | Payload/DTO no contienen configuración | Usuario sin estos campos/relaciones | E05 | Persistencia y enforcement real |
| Cajero consulta precio vigente desde POS | IMPLEMENTADO | GET productos y precio en tarjeta | Devuelve precioVenta real | Producto.precioVenta | E01/E06 | Refresco/validación al cobro se evalúa en bugs |
| Búsqueda textual sin memorizar códigos | PARCIAL | POS filtra nombre/código | API busca nombre/código/barcode | Nombre y descripción disponibles | E01/E06 | Incluir descripción/variantes en búsqueda completa |
| Barcode persistente y búsqueda backend | IMPLEMENTADO | Pantalla normal no lo captura | DTO/CRUD y search sí admiten barcode | Producto.codigoBarras; índice | E01 | Conectar alta/POS; unicidad/ambigüedad |
| Escáner de barcode funcional en POS | NO IMPLEMENTADO | Descarta codigoBarras al mapear; filtra nombre/codigo | Búsqueda disponible pero POS no la usa | Campo existe | E06 | Resolver lectura exacta y seleccionar artículo |
| Código fabricante/proveedor identificado separadamente | PARCIAL | Campo genérico codigo sirve manualmente | Un único codigo y barcode | Sin código fabricante ni SKU por proveedor | E01/E02 | Identidades diferenciadas y búsqueda |
| Código interno manual para producto sin barcode | IMPLEMENTADO | Alta exige codigo, barcode opcional | Conflicto por código duplicado | Unique tenantId/codigo | E01 | Generación automática evaluada aparte |
| Código interno reconocible autogenerado, sin colisiones | NO IMPLEMENTADO | Usuario escribe código | Sin generador/reserva | Solo unicidad del código manual | E01 | Propuesta basada en descripción/tipo y reserva atómica |
| Descripciones para distinguir variantes | PARCIAL | Nombre libre; levantamiento descripción/marca | Texto libre persistente | Nombre/descripcion/marca parcial | E01/E04 | Criterios operativos y visibilidad de medida/espesor/color |
| Foto opcional de producto optimizada | PARCIAL | No flujo persistente de foto de catálogo | DTO/CRUD no escriben imagenUrl | Producto.imagenUrl sin uso en escritura | E01/E07 | Carga optimizada y persistencia de referencia |
| Foto de levantamiento para identificación pendiente | IMPLEMENTADO CON ERROR | Captura cámara/file y preview base64 | Foto omitida en payload y DTO | Sin foto ni estado de identificación por item | E04/E07 | Conservar foto y pendiente hasta revisión |
| Captura básica de levantamiento, sin exigir código | IMPLEMENTADO | Alta/edición/cantidad/unidad/descripcion | CRUD real con tenant | Levantamiento y Item | E04 | Auditoría/concurrencia en filas siguientes |
| Finalizar separado de aplicar stock | PARCIAL | Marca FINALIZADO; sin Aplicar | Solo cambia estado; permite editar después | Sin aplicación ni registro aplicado | E04 | Cierre inmutable/reapertura autorizada y Aplicar |
| Revisión/conciliación/preview/aplicación transaccional | NO IMPLEMENTADO | Sin flujo de resolución/aplicación | Sin endpoint aplicar | Sin vínculo item-producto/resoluciones/movimientos | E04 | Circuito explícito completo |
| Multiusuario con conflictos y autor por conteo | PARCIAL | Varios equipos pueden usar API, sin sincronización viva | CRUD sin versión ni conflicto | Timestamps y creador de sesión; sin autor de item | E04 | Control de concurrencia y conciliación |
| Zonas/asignación/progreso por usuario/zona | IMPLEMENTADO CON ERROR | Campo ubicación no enviado; contador básico | Sin zona/asignación | Sin ubicación/zona/usuarios asignados | E04 | Persistencia y progreso real |
| Reconteo preservando original y resolución | NO IMPLEMENTADO | Solo edición del conteo actual | Update sobrescribe | Sin reconteo/versiones | E04 | Segundo conteo y resolución auditable |
| Unidades y cantidades decimales | PARCIAL | Formularios básicos; importación trunca | Prisma/ventas aceptan decimales | Decimal(12,2); enum unidades/texto en conteo | E01/E04/E11 | Corregir importación y definir presentaciones/equivalencias |
| Escáner cámara/QR y recuperación desde levantamiento | NO IMPLEMENTADO | Campo manual barcode no enviado; sin lector | Sin flujo de resolución/alta desde escaneo | Barcode de catálogo, no en item | E04/E07 | Scanner y lookup con alternativa manual |
| Exportación independiente CSV/Excel y plantillas | PARCIAL | Exporta CSV de columnas fijas | Conteos recuperables por API | Se conserva conteo salvo borrado | E04/E11 | Excel en levantamiento, columnas/plantillas y campos faltantes |
| Venta contado efectiva/tarjeta persistente | IMPLEMENTADO | POST ventas y recibo | Transacción, validación, stock condicional | Venta/DetalleVenta con método, actor, fecha | E06/E08 | Cierre/entrega se evalúan aparte |
| Transferencia como método de pago | NO IMPLEMENTADO | Solo efectivo/tarjeta/crédito | DTO y enum no la admiten | MetodoPago sin TRANSFERENCIA | E08 | Añadir método y reflejar en recibo/cierre/reportes |
| Identificador y registro de cliente | IMPLEMENTADO | Clientes CRUD y CLI-...; picker cotización | API/búsqueda/alta | Cliente.numeroCliente + secuencia/trigger migrado | E09 | Verificar historial de migraciones en despliegue |
| Crédito solo a cliente registrado y documento vinculado | IMPLEMENTADO CON ERROR | POS manda nombre/RTN, nunca clienteId | Acepta CREDITO sin exigir clienteId | Venta.clienteId opcional | E06/E08/E09 | Selección obligatoria y validación backend |
| Crédito genera deuda, abonos/saldo/historial | NO IMPLEMENTADO | Etiqueta crédito no es cartera | Sin servicios CxC/pagos | No CuentaPorCobrar/Pago | E08/E03 | Cuenta/deuda automática y aplicación de abonos |
| Registrar venta antes de entregar, seguimiento entrega | PARCIAL | Venta real; sin entrega controlada | Stock baja al registrar, sin estado de entrega | Sin Entrega/fecha/responsable | E08 | Definir reserva/salida y control de despacho |
| Movimientos, faltantes y Kardex completo | NO IMPLEMENTADO | Stock/alerta; sin historia física integral | Cambia stock directo; venta tiene documento | Sin MovimientoInventario | E01/E08/E03 | Movimientos por origen y conciliación |
| Reporte de mayor rotación/reposición confiable | IMPLEMENTADO CON ERROR | Top vendidos calculado con GET ventas | Devuelve 50 ventas por defecto | Historial real disponible, consulta incompleta | E10/E08 | Agregación backend por rango/tenant |
| Cierre por cajero/empleado y dinero esperado | IMPLEMENTADO CON ERROR | ventas=[] fija; fondo 1000; cierre local | Sin servicio de turnos/cierre | cajas/movimientos en SQL aislado | E13/E12 | Apertura, sesión, ventas/pagos y cierre persistentes |
| Auditoría venta: actor/fecha/monto/método | IMPLEMENTADO | Recibo e historial | Usuario del JWT, cálculo, fecha | Venta.usuarioId/createdAt/total/metodoPago | E08 | Auditoría de otros eventos en siguiente fila |
| Auditoría integral y autor/modificador administrativo | PARCIAL | Soporte/auditoría local; conteos editables | Sin registro integral de cambios; soporte token real | Timestamps básicos; sin eventos operativos Prisma | E04/E05/E14 | Eventos persistentes con antes/después y atribución |
| Venta especial sin inventario ligada a proveedor/compra | NO IMPLEMENTADO | Pedido especial local es flujo diferente | Toda venta exige producto y descuenta stock | DetalleVenta siempre producto; sin tipo físico/especial | E08/E15 | Flujo comercial sin salida y trazabilidad |
| Devolución ligada a original con efectos completos | NO IMPLEMENTADO | No módulo/flujo real encontrado | Sin devolución/reembolso | Sin modelos; ANULADA no implementa devolución | E03/E08 | Política y circuito transaccional |
| Garantía: venta/producto, condiciones/vigencia/responsable | PARCIAL | Reclamos locales con factura textual | Sin servicio de garantías | SQL aislado; sin modelos actuales | E12/E15 | Reglas pendientes + circuito persistente |
| Alertas de stock bajo | IMPLEMENTADO | Dashboard/listado real | GET alertas y dashboard | Consulta stockActual/stockMinimo | E01/E10 | Ninguna brecha estructural del alerta básico |
| Alertas de facturas proveedor/deudas vencidas | NO IMPLEMENTADO | Sin cartera operativa | Sin consultas/servicios | Sin documentos/vencimientos operativos | E03 | CxP/CxC y alertas |
| Otras alertas/centro operativo | PARCIAL | Cotizaciones/stock; avisos locales | Dashboard para stock/cotización | Parte real y parte local | E10/E14 | Centro persistente sobre datos reales |
| Uso web desde otra PC/celular | PARCIAL | SPA y API compartida; limitaciones móviles documentadas | Catálogo/ventas/captura accesibles por web | Solo módulos reales compartidos | E16 | Responsive POS y persistencia de módulos locales |
| Offline: captura, cola, sincronización/conflictos | PARCIAL | POS conserva un cobro pendiente y reintento manual | Idempotencia de ventas por solicitudId | Venta real; sin cola/versión de conteos | E04/E06/E08 | IndexedDB/PWA si procede, sync y resolución |
| Resumen diario completo del negocio | PARCIAL | Dashboard ventas/stock real; caja local | Totales por día; sin caja/abonos/utilidad histórica | Sin costo histórico en detalle venta ni cartera | E10/E13 | Caja, pagos, devoluciones y costo vendido |
| Vidriería/ventanas y separación empresarial posterior | NO IMPLEMENTADO | Multi-rubro genérico no concreta decisión | Multi-tenant existente, sin flujo específico validado | Tenant genérico | E03/E16 | Definir después del piloto |
| Integración bancaria/POS automática posterior | NO IMPLEMENTADO | Método TARJETA manual | Sin integración externa | Sin conciliación/transacción bancaria | E03/E08 | Investigación posterior; no bloqueante |

### Índice de evidencias
Todos los paths son relativos al repositorio y corresponden al SHA auditado. Rutas API incluyen el prefijo /api definido en main.ts.
- E01: backend/prisma/schema.prisma:188 (Producto); backend/src/productos/productos.controller.ts:36; productos.service.ts:8, 96, 154; dto/create-producto.dto.ts:6; frontend/src/pages/InventarioPage.tsx:27, 86. GET/POST /api/productos, PUT/DELETE /api/productos/:id.
- E02: frontend/src/pages/OrdenesCompraPage.tsx:64, 73, 110, 184. handleRecepcionTotal modifica solo setOrdenes. backend/src/app.module.ts enumera los módulos realmente registrados.
- E03: backend/prisma/schema.prisma completo y backend/src/app.module.ts:16; ausencia de módulos/modelos operativos contrastada con todas las rutas.
- E04: frontend/src/pages/LevantamientoPage.tsx:240, 263, 302, 396, 415; backend/src/levantamientos/levantamientos.controller.ts:21; levantamientos.service.ts:99, 164, 196; dto/create-levantamiento-item.dto.ts:3; modelos Levantamiento/LevantamientoItem. /api/levantamientos/:id/items.
- E05: backend/src/common/guards/roles.guard.ts:14; auth/jwt.strategy.ts:34; usuarios/usuarios.controller.ts:29; usuarios.service.ts:72; DTOs de usuarios; frontend/src/pages/UsuariosPage.tsx:185; componentes ProtectedRoute y navegación.
- E06: frontend/src/pages/POSPage.tsx:103, 239, 245, 341. Mapeo pierde barcode; cobro manda nombre/RTN sin ID; localStorage aquí preserva un reintento, no sustituye el guardado real.
- E07: frontend/src/pages/LevantamientoPage.tsx:240, 263, 798; Producto.imagenUrl; DTOs de productos/levantamiento sin foto. Captura con input image/capture=environment, FileReader.readAsDataURL; no upload/compresión.
- E08: backend/src/ventas/ventas.service.ts:101, 122, 177, 191, 196, 221; ventas.controller.ts:18, 29; dto/create-venta.dto.ts:4; schema Venta/DetalleVenta/MetodoPago. CotizacionesService.convertirAVenta:415. POST /api/ventas; POST /api/cotizaciones/:id/convertir.
- E09: backend/src/clientes/clientes.service.ts:10, 76; clientes.controller.ts:42; frontend ClientesPage y ClientePicker; prisma/migrations/20261002000000_add_customer_numbers/migration.sql; docs/customer-number-deployment.md.
- E10: frontend/src/pages/ReportesPage.tsx:46, 308, 322, 429; backend/src/dashboard/dashboard.service.ts:9; productos.service.ts:70; ventas.service.ts:8. GET /api/dashboard, /api/productos/alertas/stock-bajo, /api/ventas.
- E11: frontend/src/components/ImportarProductosModal.tsx:140, 145, 271; frontend/src/pages/LevantamientoPage.tsx:415; utils/csvExport.ts y excelExport.ts. La presencia de exportToExcel en reportes no lo conecta al levantamiento.
- E12: backend/prisma/migrations/20260930000000_alter_stock_decimal_and_operational_models/migration.sql:27, 58, 74, 177; no modelos correspondientes en schema.prisma.
- E13: frontend/src/pages/ArqueoCajaPage.tsx:58, 89, 108, 119. Sin consulta API de ventas ni entidad turno real.
- E14: frontend/src/context/NotificationContext.tsx:47, 125; frontend/src/pages/SuperAdminPage.tsx:165, 389; backend/src/super-admin/super-admin.service.ts:130; support-token.dto.ts; TenantGuard. readOnly sí existe en backend; motivo/historial no están persistidos por el endpoint.
- E15: frontend/src/pages/GarantiasPage.tsx:56, 105 y PedidosEspecialesPage.tsx:54, 76; backend/src/app.module.ts; schema y migración operativa.
- E16: backend/docs/production-ui-check-2026-10-02.md; frontend App.tsx/config/rubros.ts; docs/REQUISITOS_NEGOCIO_VALIDADO.md y ROADMAP.

## 4. Bugs e inconsistencias
### B01 — HIGH: crédito sin cliente y sin deuda
Trigger: POST /api/ventas con metodoPago=CREDITO y sin clienteId. DTO acepta cliente opcional y servicio solo valida su pertenencia si se suministra. La venta se guarda, stock baja y no hay cartera.
POS envía clienteNombre y clienteRtn, campos ausentes del DTO; ValidationPipe whitelist los elimina. El nombre mostrado en el ticket no acredita vínculo con Cliente.
La conversión de cotización también puede generar crédito sin cliente: no exige clienteId para ese método.
Archivos/modelos/endpoints: E06, E08, E09; Venta.clienteId, MetodoPago.

### B02 — HIGH: autorización de descuentos y precios eludible
POST /api/ventas acepta precioUnitario y descuento del solicitante. El servicio usa ese precio sin contrastarlo con política/rol y limita a cero una base negativa mediante Math.max, sin rechazar descuento mayor al subtotal.
Un request válido puede usar precioUnitario=0 para mercancía con precio vigente mayor; puede descontar todo o más del subtotal. La aprobación local de NotificationContext no tiene evidencia de autorización backend.
Cotizaciones también permite precio manual sin límite por usuario.
Archivos: ventas.service.ts:196, 213; DTO; POSPage; NotificationContext; UsuariosPage; cotizaciones.service.ts:535.
Además, POS mantiene precios en el carrito y los vuelve a enviar; un cambio de precio vigente después de cargar catálogo no fuerza actualización al cobrar. Debe definirse explícitamente política de precio congelado/autorizado.

### B03 — HIGH: cierre de caja independiente de ventas
ArqueoCajaPage declara const [ventas] = useState<any[]>([]) y jamás carga ventas. Totales por método son cero; efectivo esperado es siempre el fondo fijo 1000. handleCerrarTurno registra localmente un éxito sin persistencia ni vinculación al cajero/turno por ID.
E13; tablas SQL cajas/movimientos_caja desconectadas.

### B04 — HIGH: recepción ficticia
OrdenesCompraPage.handleRecepcionTotal marca RECIBIDA y copia cantidades pedidas en recibidas. No POST de recepción, incremento de existencias ni modificación de costo.
Ejemplo: recibir 100 unidades a costo 80 después de costo vigente 100 no aumenta stock ni baja el costo a 80.
E02; Producto; migración operativa.

### B05 — HIGH: pérdida silenciosa de datos capturados
Foto, barcode, precio estimado y ubicación existen como estados de formulario de levantamiento, pero payload, DTO, servicio y modelo no los conservan. Tras “guardar y siguiente”, se limpian; recargar no puede recuperarlos.
El estado EN_PROGRESO se cambia localmente al guardar item, sin actualizar la sesión en servidor.
E04/E07; LevantamientoItem.

### B06 — HIGH: cajero puede administrar levantamientos por API
RolesGuard autoriza si no hay metadatos @Roles. LevantamientosController no declara ninguno, aunque frontend exige ADMIN/BODEGUERO. Un cajero autenticado de tenant con módulo habilitado puede crear, editar, finalizar y borrar levantamientos e items. ClientesController permite también eliminación sin rol; eliminar un cliente deja Venta.clienteId en null por onDelete:SetNull.
E04/E05/E09. La política precisa de altas/edición de clientes debe decidirse; el borrado y pérdida de vínculo sí requieren control administrativo.

### B07 — HIGH: permisos finos “guardados” solo en interfaz
UsuariosPage omite permisos, descuentoMaximo y sucursalActual del payload; actualiza estado local con lo seleccionado. Los DTOs y Usuario tampoco lo soportan. Al volver a cargar se reconstruyen defaults. Las restricciones backend son roles base, no esa configuración.
E05.

### B08 — HIGH: cambios de existencias sin movimiento ni autor
ProductosService.create/update escriben stockActual directamente, incluido sobreescribirlo con importación. No crean movimiento, motivo o identidad de modificador. Ventas tienen documento origen, pero no existe registro de movimientos integral ni saldo anterior/nuevo por operación.
Un PUT stock absoluto concurrente puede sobrescribir un decremento de venta que ya ocurrió.
E01/E08/E11; Producto y Venta.

### B09 — HIGH: migraciones y esquema divergentes
SQL de 20260930 crea proveedores, órdenes, cajas, garantías, apartados, transferencias, listas y auditoría soporte, pero schema.prisma no los representa y app.module no registra servicios. No deben duplicarse esas tablas sin inspeccionar la BD.
La primera migración versionada presupone tenants existente; la segunda presupone productos existente. El historial no crea un esquema base completo desde cero.
Documentación de producción informa numeración ejecutada manualmente y necesidad de reconciliar historial. start:prod ejecuta migrate deploy: sin baseline/reconciliación puede fallar.
E12; backend/package.json; backend/README.md; docs de customer-number y producción. No se confirmó qué migraciones están aplicadas hoy.

### B10 — HIGH: reportes de rotación incompletos
ReportesPage obtiene GET /ventas sin rango ni paginación; VentasService devuelve 50 registros por defecto. Con más ventas, “más vendidos”, ausencia de movimiento, resúmenes de método/cajero/cliente pueden ser incorrectos.
E10/E08. Corregir mediante agregaciones por rango en servidor, no simplemente aumentando el límite.

### B11 — HIGH: importación trunca existencias fraccionarias
ImportarProductosModal usa parseInt en stock y mínimo. 2.75 pasa a 2 y 0.5 a 0 antes de POST/PUT. Esto contradice Decimal(12,2) y afecta materiales por medida/peso.
E11; líneas 140/145. Los tests existentes no verifican que el parsing conserve ese stock fraccionario.

### B12 — MEDIUM: cierre de levantamiento no congela datos
Servicio createItem/updateItem/removeItem/update no condiciona por estado FINALIZADO ni versión. Puede alterarse o borrarse después de finalizar. Tampoco hay revisión/aprobación con historia.
E04. Ocultar un botón de finalizar no preserva inmutabilidad.

### B13 — MEDIUM: barcode y código ambiguos
codigoBarras tiene índice pero no unicidad por tenant; varios productos pueden compartirlo sin regla. codigo tiene unicidad sensible a mayúsculas; UI convierte a mayúsculas pero API solo trim. Una cadena de espacios puede pasar IsNotEmpty y volverse vacía después del trim. No hay reserva automática de códigos reconocibles.
E01. Deben definirse normalización y excepciones legítimas de múltiples presentaciones.

### B14 — HIGH: artefactos compilados desactualizados
backend/dist/ventas/ventas.service.js no contiene solicitudId, mientras src sí. start:prod ejecuta node dist/main después de migrar y no compila. Si el deploy no hace build previo, se ejecuta un servicio sin la idempotencia auditada en src.
Se inspeccionaron archivos dist remotos; no se infiere que producción actual los esté usando. Debe comprobarse pipeline y build del SHA.

### B15 — MEDIUM: requisitos móviles y QA antiguo
La nota de producción del 2 de octubre documenta carrito POS cortado en móvil y problemas de modales. No se reprodujeron en navegador en esta auditoría; deben validarse.
QA_REPORT y SYSTEM_ANALYSIS son históricos: varias conclusiones ya no describen main (sí hay DTO/guard; conversión descuenta totalMedida; soporte comienza readOnly). No deben reutilizarse como evidencia actual ni tomar cierres/mock como validados.

## 5. Riesgos de arquitectura y seguridad
- HIGH: autorización financiera incompleta y escrituras administrativas por endpoints con rol ausente, detalladas en B02/B06.
- HIGH: cuentas desactivadas, cambio de rol o suspensión del tenant no se revalidan por request en JwtStrategy; se confía en claims hasta expiración. Login/refresh sí comprueban estado. Política de revocación requiere definición e implementación.
- HIGH: UsuariosService usa una contraseña predeterminada fija cuando no se envía password. Debe sustituirse por alta/invitación segura, sin credencial compartida.
- HIGH: datos operativos en localStorage editables por el usuario y no compartidos entre dispositivos; no hay respaldo central ni autenticidad de aprobación/cierre.
- HIGH: divergencia schema/migraciones/dist; los tests de PostgreSQL construyen esquema desde Prisma y aplican numeración, no prueban toda la cadena histórica de migrate deploy.
- HIGH: ausencia de auditoría física/financiera integral; eventos administrativos y soporte no quedan durables. El token readOnly sí bloquea mutaciones en TenantGuard, pero logs/motivo viven en frontend.
- MEDIUM: dinero calculado con Number/Math.round y precisión fija de cantidades en Decimal(12,2), sin MaxDecimalPlaces equivalente en entradas. Definir política de redondeo y precisión por unidad.
- MEDIUM: modelo de autorización de módulos permite acceso si no existe TenantModule; frontend puede considerar módulo ausente deshabilitado. POS depende de módulo inventario para obtener precios. Conviene un contrato explícito de consulta comercial para cajero.
- MEDIUM: campos sensibles como precioCosto se devuelven en GET productos a cualquier usuario tenant autorizado al módulo; restringir la proyección si su consulta debe ser reservada al administrador.
- MEDIUM: metadata del árbol muestra .env.local y .env.vercel versionados. No se abrieron ni se reprodujeron valores; no se afirma que contengan secretos válidos. Verificar exposición y rotar solo si se confirma.
- MEDIUM: autenticación sin limitación de intentos visible; logs de login incluyen correo/identidad/tenant. Revisar rate limiting y política de logging.
- MEDIUM: auditoría no puede depender solo de current Producto.precioCosto; DetalleVenta no conserva costo vendido y cambios posteriores impiden utilidad histórica fiable.
- MEDIUM: varias relaciones llevan tenant solo en el padre; mantener validación de pertenencia de cada entidad vinculada y considerar invariantes relacionales para nuevas tablas. Las rutas principales revisadas sí validan productos/clientes/categorías antes de vincular.

## 6. Requerimientos documentados sin circuito contemplado
En la nota primaria: CxP, CxC/abonos, costos históricos y actualización desde reposición, entrega controlada, venta sin inventario, devoluciones integrales, alertas de deuda/facturas y operación offline completa.
En documentos complementarios: conciliación/aplicación de conteos, autor por item, control de concurrencia, zonas, reconteos, generación de SKU, fotos pendientes persistentes, presentaciones/equivalencias y exportación Excel/plantillas.
Garantías tienen prototipo local y tablas SQL aisladas: requieren conexión y definiciones de negocio. Integraciones bancarias y vidriería siguen deliberadamente fuera del piloto; no son bloqueos P0.

## 7. Lista priorizada de cambios necesarios
### CRITICAL
1. Convertir CRITICAL en criterio de salida antes de usar el sistema para el piloto: verificar baseline/historial/schema/build con una BD aislada, proteger respaldo y demostrar despliegue reproducible sin pérdida de datos. B09/B14.
2. Para piloto con inventario y caja reales, impedir confirmaciones exitosas de recepción/cierre que no afectan datos centrales; cerrar los circuitos de B03/B04/B08 antes de confiar en sus saldos.

No se confirmó un incidente de pérdida de producción ni una explotación; CRITICAL aquí clasifica el trabajo bloqueante de preparación del piloto, no un incidente demostrado.

### HIGH
3. Resolver permisos backend, clientes/levantamientos y política de descuento/precio; altas de usuario seguras y revocación de acceso. B02/B06/B07.
4. Kardex transaccional, ajustes con motivo/autor y precisión decimal; corregir importación. B08/B11.
5. Levantamiento inicial revisado, conciliado y aplicado explícitamente con idempotencia, sin perder campos. B05/B12.
6. Proveedores/compras/recepción e historial de costo; reposición reciente actualiza costo incluso a la baja; CxP y pagos.
7. Crédito exige cliente; CxC automática y abonos; transferencia manual como método inicial. B01.
8. Turnos/apertura/cierre real y entrega vinculada a venta. B03.
9. Venta sin inventario física explícita y ligada a compra/proveedor.
10. Rotación y reportes agregados por período/tenant; separar utilidad histórica de margen actual. B10.

### MEDIUM
11. Barcode/fabricante/código interno reconocible con normalización y resolución de ambigüedades; cámara en dispositivos compatibles. B13.
12. Fotos optimizadas y referencia persistente; revisión de artículos incompletos.
13. Devoluciones, garantías con reglas confirmadas y alertas operativas.
14. Multiusuario, zonas, reconteos, control de conflictos y offline idempotente.
15. Exportación independiente CSV/Excel, columnas y plantillas.
16. Responsive POS/formularios, observabilidad, limitación de intentos y validación de decimales.

### LOW
17. Investigación bancaria/POS automatizada y definición de vidriería después del piloto.
18. Mejoras de lenguaje/etiquetas y ergonomía posteriores a los bloqueos operativos.

## 8. Plan de implementación por fases (propuesta, sin ejecutar)
### Fase 0 — Base reproducible y contratos
Revisar esquema real e historial con consultas de lectura, fijar baseline y migraciones aditivas revisables; reproducir despliegue en BD aislada desde cero y desde base existente; compilar dist desde src del mismo SHA.
Definir matriz ADMIN/CAJERO/BODEGUERO, precio/costo/margen, temporalidad de “compra más reciente” (fecha efectiva vs registro y retroactividad), entrega/reserva, redondeo y tipos físico/especial.
Salida: respaldo/restauración probados, inventario de tablas existentes y pipeline coherente. Reutilizar SQL existente cuando corresponda, sin duplicar modelos.

### Fase 1 — Seguridad y evitar datos incorrectos
Enforce permisos y descuentos en API, proteger mutaciones de clientes/conteos, corregir importación decimal, revocación y alta de usuarios. Corregir campos omitidos y cierre del conteo. Evitar presentar como registrada una operación local.
Salida: pruebas HTTP con ADMIN/CAJERO, bypass directo denegado, precios/descuentos autorizados, 2.75 conservado e intento de tenant ajeno rechazado.

### Fase 2 — Inventario y levantamiento inicial
Crear libro de movimientos reutilizable por venta, conteo, compra, ajuste y devolución. Revisión/conciliación/preview y aplicar conteo explícitamente; no cambiar stock al finalizar; autor y registro anterior/nuevo. Vincular item-producto y resolver conflictos; proteger aplicación idempotente.
Salida: fallar una línea revierte todo; aplicar dos veces no duplica stock; ventas/conteos concurrentes no pierden movimientos; conservar conteo original y exportación.

### Fase 3 — Compras, proveedores, costos y CxP
Conectar proveedores/órdenes/facturas y recepciones parciales/totales. Registrar historial costo-proveedor-documento-fecha-cantidad. Incrementar stock y actualizar costo vigente en la misma transacción al costo de compra elegible más reciente, con bajas incluidas. Separar costo vigente de valoración de inventario; no inferir precio de venta de lotes históricos. Implementar saldo de proveedor/pagos/vencimientos.
Salida: compra 100 seguida de 80 deja vigente 80 y conserva ambas historias; reintento de recepción/pago no duplica; devolución/cancelación usa reversa auditable. El precio de venta sigue la política de margen/manual que se acuerde.

### Fase 4 — Venta, crédito, entrega y caja
Cliente elegido en POS, transferencia como método, documento contado/crédito, CxC y abonos; turnos/cierre vinculados a actor; entrega/control físico y venta especial sin inventario con vínculo comercial. Mantener idempotencia y transacciones existentes.
Salida: rechazar crédito anónimo; pago reduce saldo una sola vez; contado/transferencia/tarjeta cuadran por turno; especial suma ingresos sin tocar stock; física requiere venta registrada para despacho.

### Fase 5 — Identificación y uso móvil
Códigos internos legibles reservados sin colisiones, fabricante/SKU proveedor, lookup barcode exacto y búsqueda descriptiva. Scanner por teclado y cámara compatible con alternativa manual. Foto opcional comprimida en almacenamiento de objetos con referencia en BD e identificación pendiente; revisar POS responsive.
Salida: foto visible tras recarga y en otro dispositivo, barcode encuentra producto correcto, producto sin código externo puede contarse y venderse.

### Fase 6 — Control operativo y reportes
Devoluciones vinculadas al original con efectos trazables; garantías con condiciones definidas; alertas CxP/CxC/stock; reportes agregados backend, resumen diario y costos históricos de venta.
Salida: reintegro/daño/reembolso/deuda consistentes; más de 50 ventas reflejadas correctamente; reglas de garantía aprobadas.

### Fase 7 — Colaboración, offline y portabilidad
Versiones/concurrencia por item, zonas/progreso, reconteos preservados. IndexedDB/cola con estado online/offline, sincronización idempotente y resolución explícita; definir operaciones permitidas offline antes de habilitarlas. Excel y CSV con columnas/plantillas reutilizables.
Salida: dos dispositivos/reintentos/red intermitente no sobrescriben ni duplican; conflictos bloquean aplicación; exportar no elimina ni aplica el conteo.

### Fase 8 — Evolución posterior
Investigación bancaria/POS automatizada y decisión de vidriería/tenant/permisos una vez estabilizado el piloto.

### Estrategia para preservar funcionalidades existentes
Migraciones aditivas y backfill verificable; no ejecutar db push destructivo. Compatibilidad temporal de contratos al conectar módulos; lectura legacy revisada y exportación explícita de datos locales, sin mezclar demostraciones con operaciones reales. Flags por tenant para puesta en marcha gradual. Probar núcleo de ventas/cotizaciones existente, numeración clientes, aislamiento, concurrencia, reintentos y precisión en PostgreSQL aislado, además de flujos HTTP/frontend completos. Registrar cambios con actor/origen desde el inicio, sin duplicar servicios de stock o numeración.

La implementación queda pendiente de autorización del usuario.



### H7 — IDEAS_ARQUITECTURA_CONTINUIDAD_Y_SUCURSALES.md

# Lluvia de ideas: continuidad operativa, costos, celular y sucursales

Fecha: 5 de octubre de 2026.
Estado: PROPUESTA PARA ANALIZAR. No constituye una decisión de arquitectura ni una autorización para implementar o desplegar estas opciones.

## Necesidad del negocio

La ferretería es pequeña y cuenta con una computadora para caja y otra para administración. Actualmente se conectan por Wi-Fi a Internet. El negocio necesita seguir operando cuando falle Internet, mientras los equipos necesarios tengan energía. El dueño tiene interés en una aplicación en el celular para recibir notificaciones y atender autorizaciones importantes.

Se busca reducir pagos recurrentes por alojamiento y base de datos, evitar comprar otra máquina si los equipos actuales son suficientes y prever una futura sucursal.

## Punto de partida

Se conserva el sistema web existente, su backend y PostgreSQL. Una aplicación web también puede servirse dentro de una red local sin Internet: no requiere convertirse en aplicación de escritorio.

El PR #58 se integró en main mediante el commit 9704f5df9fbf74fb4fe0ba101e527f14a2b8cd4a. Contiene persistencia y mecanismos para evitar duplicación en reintentos. Eso no equivale a una operación offline completa ni a sincronización entre bases locales y nube.

Las pruebas técnicas aprobadas no sustituyen la aceptación del dueño con datos reales. La aplicación de migraciones y verificación productiva deben comprobarse por separado. Consultar también OPERACION_PILOTO_20261004.md y REQUISITOS_NEGOCIO_VALIDADO.md.

## Opciones de alojamiento

| Opción | Costo y ventajas | Continuidad | Limitaciones |
|---|---|---|---|
| Todo en la nube | Pago recurrente; acceso remoto sencillo | Sin Internet requiere desarrollar almacenamiento y sincronización offline | Dependencia del proveedor y conectividad |
| PC del administrador como servidor | Aprovecha equipo existente; PostgreSQL sin costo de licencia | Admin y caja operan mediante red local sin Internet | PC encendida, sin suspensión; reinicios y fallas afectan a ambos |
| PC del cajero como servidor | Aprovecha equipo existente | Caja local y admin por red interna | Fallos o reinicios del cajero afectan a ambos; compite con su trabajo |
| Mini PC dedicada | Compra inicial; separa servidor de equipos de uso diario | Operación por red local | Mantenimiento, respaldo y energía; capacidad por dimensionar |
| Servidor local con servicio pequeño en nube | Datos operativos locales; nube para funciones remotas | Operación local durante cortes; comunicación remota se reanuda al volver Internet | Sincronización adicional y costo recurrente por cotizar |

Orientación preliminar: evaluar primero la PC del administrador como servidor. No elegirla sin revisar capacidad, sistema operativo, horario y confiabilidad. Una mini PC puede incorporarse más adelante si la disponibilidad lo exige.

No colocar una base independiente en cada computadora sin diseñar previamente sincronización y resolución de conflictos. Para el primer local, una base compartida evita inventarios y saldos divergentes.

## Red y cortes de energía

- La red Wi-Fi local puede seguir funcionando sin Internet si el router continúa encendido y permite comunicación entre dispositivos. Verificar aislamiento de clientes, cobertura y estabilidad.
- Preferir cable para servidor y cajero cuando sea viable; Wi-Fi para dispositivos móviles.
- Mantener encendidos servidor, router y terminal de trabajo. Que una sola computadora siga encendida no garantiza el funcionamiento del conjunto.
- Evaluar UPS para servidor/router y caja. La autonomía es limitada y debe calcularse según consumo y duración de cortes.
- Para cortes largos, evaluar batería/inversor y apagado seguro.
- Configurar inicio automático, recuperación tras reinicio, suspensión deshabilitada durante operación y actualizaciones fuera de horario.
- Una UPS no sustituye los respaldos.

## Celular del dueño

Primera alternativa: PWA instalable para consultar información y atender autorizaciones. Evaluar app nativa si las funciones o dispositivos lo requieren; verificar soporte real de notificaciones en los celulares previstos.

Dos caminos posibles:

1. Acceso privado al servidor local mediante VPN, por ejemplo Tailscale. Evita exponer directamente PostgreSQL y puede reducir gasto recurrente. Revisar condiciones y precio del plan para uso comercial. Depende de Internet y servidor encendido; las notificaciones automáticas requieren diseño adicional.
2. Servicio pequeño en nube para resúmenes, solicitudes de autorización y notificaciones. Mantener local la base operativa completa. Cotizar alojamiento, almacenamiento y mensajería según uso; no asumir costo cero.

Durante un corte de Internet el dueño no puede recibir nuevas solicitudes ni autorizar remotamente. Definir qué operaciones se bloquean, cuáles admite un administrador presente y los límites de contingencia. Registrar autor, fecha, operación y resultado de cada autorización. Considerar vencimiento y evitar ejecutar dos veces una autorización.

Si el dueño quiere consultar fuera de horario, decidir entre mantener el servidor encendido o disponer de una copia de consulta en nube, mostrando cuándo se sincronizó por última vez.

## Preparación para futuras sucursales

Propuesta a estudiar:

- Una empresa puede contener varias sucursales; no confundir sucursal con tenant/empresa.
- Asociar inventario, cajas, ventas, compras y movimientos con la sucursal correspondiente.
- Cada sucursal debe poder operar localmente sin depender de la computadora de otra sucursal.
- Usar identificadores únicos, eventos o solicitudes persistentes y reintentos idempotentes para sincronización.
- Definir propiedad de datos, cambios de catálogo/precios, orden de eventos, conflictos y permisos antes de sincronizar bases.
- Registrar transferencias como envío y recepción, con existencias en tránsito y trazabilidad.
- No prometer stock consolidado actualizado durante desconexiones; mostrar fecha de sincronización.
- Evaluar un servicio central para consulta consolidada y autorizaciones al incorporar otra sucursal.

Preparar el modelo ahora puede reducir cambios posteriores. Implementar toda la sincronización multisucursal desde el inicio añade costo y complejidad; debe priorizarse según necesidad real.

## Respaldos y seguridad operativa

La base local elimina una cuota de base administrada, pero transfiere responsabilidades de mantenimiento al negocio.

Definir respaldos automáticos fuera del equipo servidor, retención, protección de datos y pruebas de restauración. Establecer cuántos datos se tolera perder y cuánto tiempo puede estar detenido el negocio. La sincronización por sí sola no es un respaldo: también puede propagar errores o borrados.

No exponer PostgreSQL directamente a Internet. Evaluar acceso remoto privado, HTTPS, autenticación, permisos, actualizaciones y custodia de credenciales según la alternativa elegida.

## Preguntas pendientes para decidir

- Especificaciones y sistema operativo de ambas computadoras.
- Disponibilidad de la PC del administrador durante y fuera de la jornada.
- Frecuencia y duración de cortes de Internet y luz.
- Modelo del router, comunicación local entre equipos y posibilidad de cableado.
- Presupuesto inicial y mensual; costo de UPS, respaldo, soporte y equipo dedicado.
- Celulares del dueño, necesidad de consulta fuera de horario y autorizaciones concretas.
- Reglas de contingencia cuando el dueño no responde.
- Plazo probable para segunda sucursal y necesidad de compartir catálogo, clientes y precios.
- Requisitos fiscales, impresión y comportamiento de la terminal de tarjetas sin Internet.

## Secuencia sugerida, pendiente de análisis

1. Revisar equipo, red, presupuesto y reglas del negocio.
2. Elegir arquitectura y documentar la decisión con sus costos y limitaciones.
3. Si se elige operación local: desplegar frontend/backend/PostgreSQL, configurar inicio y respaldos.
4. Probar desconexión de Internet, reinicios, recuperación de solicitudes y restauración de respaldo.
5. Validar con el cliente venta, compra, entrega, crédito, abono, devolución y cierre de caja.
6. Incorporar acceso del celular y luego notificaciones/autorizaciones según prioridad.
7. Diseñar e implementar sincronización multisucursal cuando se confirme el alcance.

Este documento registra la conversación para retomarla después. No se modificó la arquitectura, no se instalaron servidores y no se aplicaron cambios a producción como parte de esta documentación.
# Actualización del requisito móvil — 5 de octubre de 2026

El cliente confirmó app instalada con notificaciones push aunque esté cerrada, independiente de la sesión del navegador. Las alternativas web/PWA de esta lluvia de ideas se conservan como antecedentes; no completan ese requisito. Propuesta y límites actuales en `APP_MOVIL_Y_NOTIFICACIONES.md`. La base operativa puede seguir local.


### H8 — IDEAS_REVERSOS_Y_AUTORIZACIONES.md

# Idea: reversos con autorización administrativa

Fecha: 5 de octubre de 2026.
Estado: propuesta pendiente de definición e implementación.
Complementa RECUPERACION_USABILIDAD_Y_PRIORIDADES_20261005.md y las ideas de acceso móvil y continuidad.

## Necesidad expresada

Permitir reversar transacciones por error u otra causa válida con autorización del administrador, mediante clave local o solicitud remota. Presentar un flujo sencillo para personas con poca experiencia en computación.

## Flujo propuesto

1. Buscar la operación y seleccionar “Solicitar reverso”.
2. Mostrar documento, importe, efectos previstos y motivo obligatorio.
3. Un administrador autoriza localmente con su propia credencial/PIN de autorización, o recibe una solicitud remota vinculada a esa operación.
4. El servidor vuelve a validar permisos, vigencia y estado de la operación, y aplica el reverso una sola vez.
5. Mostrar comprobante del reverso y conservar relación con el documento original.

La autorización remota debería mostrar documento, sucursal, solicitante, motivo, importe y consecuencias. Debe permitir aprobar o rechazar, tener vencimiento y quedar vinculada a un alcance concreto. Si los datos relevantes cambian, revisar o renovar autorización.

## Reglas por definir

- Diferenciar borrador cancelado, venta registrada anulada, devolución y corrección administrativa. No son necesariamente la misma operación.
- Conservar el original y registrar una operación compensatoria; no borrar historial.
- Registrar solicitante, administrador autorizante, fecha, motivo y documento original.
- Validar en backend; ocultar un botón no constituye autorización.
- Evitar clave administrativa compartida. Evaluar credencial individual o PIN individual con protección contra intentos, almacenamiento seguro y reautenticación.
- Un cajero no debería adquirir una sesión administrativa general por obtener autorización para un reverso.
- Impedir uso repetido de autorización y duplicación tras respuesta perdida o apagón.
- Tratar venta, reservas/stock, caja, crédito y auditoría de manera coherente y transaccional.
- No devolver stock si la mercancía no regresó o no es vendible.
- Diferenciar reverso de registro y devolución física de dinero: una terminal bancaria puede requerir su propio procedimiento; no afirmar que reversar aquí revierte automáticamente un cobro bancario.
- Definir restricciones para caja ya cerrada, documentos fiscales emitidos, ventas históricas y operaciones con movimientos posteriores.
- Compras recibidas, pagos, abonos y aplicaciones de inventario requieren reglas específicas; no implementar un botón universal que ignore operaciones dependientes.
- Definir reversos parciales/totales, límites de importe y qué roles pueden solicitarlos.
- Mostrar claramente cuándo falta autorización o no se pudo comprobar el resultado.

## Sin Internet y recuperación

Si se elige servidor local y la red interna funciona, un administrador presente podría autorizar localmente. La autorización remota necesita conexión; si no existe, la solicitud queda pendiente y no se interpreta como aprobada.

Después de una interrupción, consultar el estado del reverso/autorización y recuperar la misma operación. No ejecutar otra compensación con identificador nuevo sin verificar la anterior.

## Estado conocido y prioridad

El sistema ya tiene devoluciones con efectos en inventario, caja/crédito e idempotencia según OPERACION_PILOTO_20261004.md. Esto no acredita un flujo genérico de reversos con autorización local o remota; debe revisarse el alcance existente antes de reutilizarlo.

Prioridad sugerida:
- Antes del piloto: definir y cubrir correcciones esenciales de ventas/cobros, con autorización administrativa local y auditoría, según necesidades del negocio.
- Después, o antes si el dueño lo exige: autorización remota integrada con el celular y reglas de contingencia.
- Ampliar a compras, pagos y otras operaciones solo con dependencias y políticas definidas.

## Preguntas y criterios de aceptación

Confirmar con el dueño qué operaciones pueden reversarse, plazo, motivo, tratamiento de efectivo/tarjeta/crédito, cajas cerradas y documentos fiscales.

Probar permisos, rechazo/vencimiento, credencial incorrecta, doble clic, concurrencia, cambios después de autorización, respuesta perdida y reinicio. Verificar que original y reverso sigan visibles, que dinero/stock/saldos cuadren y que no se ejecuten compensaciones duplicadas.

Esta incorporación documenta la idea; no implementa reversos ni modifica datos productivos.


### H9 — INSTALACION_LOCAL_Y_CONTINUIDAD.md

# Instalación local y continuidad sin Internet

Paquete preparado en `deploy/local/compose.yaml`, para revisión antes de instalar en la ferretería. No se ejecutó en equipos ni datos reales del cliente.

## Arquitectura inicial de menor costo

Una PC existente puede alojar PostgreSQL, backend y frontend mediante Docker Compose. La caja, los dos administradores y el teléfono acceden al mismo servidor por HTTPS en la red local. No se necesita una base de datos de pago en nube para operar dentro del local.

El servidor y el router deben permanecer encendidos. Sin Internet, las ventas siguen funcionando si esa PC y la red local funcionan. El Wi-Fi local normalmente puede seguir conectando equipos aunque falle la conexión del proveedor; comprobarlo con el router real. Si se apaga el servidor, los otros equipos deben esperar su recuperación. No se implementa cola offline independiente en cada caja.

Recomendación para revisar: PC del administrador con capacidad suficiente, SSD y al menos 8 GB RAM, IP reservada en router y UPS para servidor/router. Confirmar sistema operativo, virtualización/Docker, recursos y licencias antes de instalar. En Windows, Docker Desktop debe iniciar automáticamente y ejecutarse antes de usar caja; no se verificó arranque desatendido sin login en Windows. Linux con Docker habilitado al arrancar es otra opción. Evitar suspensión automática durante operación.

## Servicios y almacenamiento

- PostgreSQL 17 persistente en un volumen. La aplicación usa un usuario propietario sin privilegios de superusuario; el administrador del clúster tiene otra contraseña.
- Backend compila desde fuentes, genera Prisma y aplica el despliegue con comprobación de historial. Reinicia tras fallos; no ejecuta seed demo.
- Frontend sirve archivos locales y la API bajo el mismo origen `/api`. Caddy emite certificados de su CA interna, conserva esa CA en volumen y publica solo 80/443. PostgreSQL/backend no publican puertos al host.
- Respaldo cada seis horas mediante `pg_dump`, checksum y manifiesto. No borra respaldos automáticamente. Se guarda fuera del repositorio y el administrador ve estado/fallo/antigüedad desde Inicio. El estado identifica la copia exacta del programador y consulta su evidencia de restauración; un archivo generado no equivale a restauración comprobada.

La descarga de imágenes/dependencias necesita Internet durante la instalación/actualización. La operación posterior usa los servicios locales. Si el servidor tiene proxy HTTP, NO_PROXY excluye los servicios internos; las conexiones externas conservan su configuración de proxy. Tipografías web externas pueden no cargar sin Internet; hay fuentes de reserva. No se añade caché offline de transacciones ni de respuestas privadas.

## Preparar configuración privada

Con Node instalado, desde el repositorio:

```sh
node deploy/local/prepare.mjs /ruta/privada/ferresystem ferresystem.lan correo-admin@ejemplo.com "Nombre de la ferretería"
```

El destino debe ser nuevo y estar fuera del repositorio. Se generan contraseñas aleatorias, JWT y `local.env`; no se imprimen secretos ni se sobrescriben archivos existentes. Guardar la contraseña inicial de `secrets/initial_admin_password` en un gestor de contraseñas por un canal privado. En Windows usar una ruta externa privada y configurar sus ACL: los permisos POSIX no sustituyen los permisos de Windows.

Configurar resolución del nombre `ferresystem.lan` a la IP fija del servidor en el router o archivos hosts de cada equipo. El nombre debe coincidir con FERRE_HOST. Confirmar reglas de firewall solo para la red del local; no reenviar esos puertos desde Internet.

## Arranque e instalación inicial

```sh
docker compose --env-file /ruta/privada/ferresystem/local.env -f deploy/local/compose.yaml build
docker compose --env-file /ruta/privada/ferresystem/local.env -f deploy/local/compose.yaml up -d --wait
docker compose --env-file /ruta/privada/ferresystem/local.env -f deploy/local/compose.yaml run --rm --no-deps backend node scripts/provision-local.mjs
```

El alta inicial crea una empresa y un ADMIN, sin productos/clientes ficticios. Si ya hay empresa/usuarios, se bloquea y no cambia contraseñas ni datos. Crear el segundo administrador y cajero desde Usuarios; no compartir la cuenta inicial. Hacer el primer respaldo después de completar esa configuración:

```sh
docker compose --env-file /ruta/privada/ferresystem/local.env -f deploy/local/compose.yaml exec backups node scripts/container-entry.mjs node scripts/backup-preflight.mjs /backups
```

El servicio programado sigue su intervalo. Una ejecución manual genera su propio manifiesto; el estado de Inicio corresponde al último intento del programador. `exec` inicia un proceso nuevo y necesita el envoltorio `container-entry.mjs` para cargar la conexión privada; `run` lo aplica automáticamente. Respaldos concurrentes usan carpetas distintas. Revisar espacio libre/retención y programar copia fuera de ese disco; el paquete no protege frente a pérdida física del servidor si todas las copias quedan ahí.

## HTTPS y acceso de caja/celular

Extraer el certificado **público** de la CA local (nunca su clave privada):

```sh
docker compose --env-file /ruta/privada/ferresystem/local.env -f deploy/local/compose.yaml cp web:/data/caddy/pki/authorities/local/root.crt /ruta/privada/ferresystem/ca-publica.crt
```

Instalar confianza en esa CA en caja, administración y teléfonos autorizados según su sistema operativo. Acceder a `https://ferresystem.lan`. Verificar cadena/nombre; no desactivar validación TLS ni acostumbrar al usuario a ignorar alertas del certificado. Cámara/instalación móvil requieren contexto seguro.

La web incluye manifiesto para acceso desde la pantalla de inicio. Todavía no hay app nativa ni notificaciones push. Fuera de la red local, considerar VPN administrada; no abrir PostgreSQL ni cambiar la protección de autorizaciones.

## Copia existente, actualización y recuperación

El alta inicial no importa ni adopta datos de otra instalación. Seguir `INSTALACION_Y_ACTUALIZACION_SEGURA.md`: respaldo/restauración aislada, inspección de historial y adopción explícita si corresponde. No arrancar sobre un volumen productivo desconocido ni usar reset/db push.

No usar `docker compose down -v` en operación: elimina los volúmenes de base/certificados. Los secretos originales deben conservarse junto con la documentación privada; reemplazar una contraseña en el archivo no actualiza automáticamente el usuario de una base ya creada.

Ante corte: recuperar energía/red, dejar que el servidor arranque y PostgreSQL termine su recuperación; verificar `/api/health`; ingresar con la misma cuenta y consultar pendientes del POS/devoluciones antes de repetir cobros o entregar. Confirmar físicamente los pagos. Probar restauración a una base distinta y conciliar datos antes de ponerla en servicio.

## Pendientes de instalación real

Copia real de la base, hardware/OS, router/DNS/firewall, UPS, certificados en dispositivos reales, lector/impresora, respaldo en otro disco/equipo, política de retención y responsable de mantenimiento. La configuración sola no garantiza continuidad eléctrica ni aceptación de los usuarios.


### H10 — INSTALACION_Y_ACTUALIZACION_SEGURA.md

# Instalación nueva, actualización y adopción de una base existente

Fecha: 5 de octubre de 2026. Preparado en codex/recuperacion-ventas / PR #59.

## Cambio realizado

Se agregó 20260925000000_initial_core antes de las cuatro migraciones históricas. El snapshot prisma/baseline.prisma reconstruye el núcleo a partir del esquema histórico de pruebas, excluyendo levantamientos y numeración posterior. No genera el cliente actual. Las migraciones ya existentes se conservan sin cambiar sus archivos ni checksums.

migrate:deploy y start:prod usan ahora migration-safe.mjs. En una base nueva ejecutan toda la cadena. En una base existente sin baseline, con migraciones fallidas/desconocidas, checksums cambiados, huecos, tablas históricas ausentes o trigger de numeración ausente, bloquean el despliegue. No intentan arreglar datos, borrar tablas ni adivinar qué SQL se ejecutó.

**Antes de desplegar este cambio en un servidor existente, realizar la inspección y la adopción si corresponde.** El inicio productivo se detendrá ante un historial incompatible en lugar de aplicar la migración inicial sobre tablas existentes. La adopción se ejecuta aparte, nunca automáticamente durante el inicio.

## Conexiones y requisitos

Node 24, dependencias backend y herramientas PostgreSQL compatibles. Prisma usa DIRECT_URL, o DATABASE_URL si DIRECT_URL no está definida. Configurarlas explícitamente con el gestor de secretos del entorno; el procedimiento no imprime sus valores. Se admite PostgreSQL en el esquema public. Conexión directa, permisos adecuados y TLS verificable según proveedor.

El respaldo usa PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSFILE o PGSERVICE. La restauración usa FERRE_RESTORE_DATABASE_URL, y la comparación histórica FERRE_REFERENCE_DATABASE_URL. Son destinos distintos con propósitos distintos; no reutilizar producción como destino de restauración ni como referencia. No poner contraseñas en Git ni en argumentos del shell.

## 1. Base nueva y vacía

Desde backend, con una base nueva creada por el administrador:

```sh
npm ci
npx prisma generate
npm run migrate:inspect
npm run migrate:deploy
npm run build
```

La inspección debe indicar VACIA y el despliegue terminar en LISTA con pending vacío. La segunda ejecución no debe volver a crear tablas ni numerar clientes. No se ejecuta seed de demostración automáticamente. Configurar la cuenta inicial y el tenant mediante el procedimiento administrativo correspondiente; no usar usuarios/contraseñas ficticios para operación real.

## 2. Base existente: inspección antes de actualización

```sh
npm run migrate:inspect
```

La inspección es de solo lectura. Resultados:

| Estado | Acción |
|---|---|
| VACIA | Instalar toda la cadena en esa base nueva |
| LISTA | Historial comprobado; revisar respaldo, ensayo en copia y migraciones pendientes antes de deploy |
| REQUIERE_BASELINE | No desplegar todavía; comprobar qué etapa representa el esquema y adoptar explícitamente |
| BLOQUEADA | Resolver la causa con revisión técnica; no usar reset/db push ni marcar migraciones a ciegas |

LISTA comprueba historial y algunas estructuras críticas; no certifica ausencia de todo drift, datos correctos ni aceptación del negocio. El diagnóstico del respaldo revisa stock negativo, códigos duplicados, cajas abiertas y saldos. Conciliar con el dueño antes del piloto.

## 3. Respaldo y restauración verificada

En una ventana de mantenimiento, suspender operaciones y cambios de esquema; conservar también una copia fuera del equipo:

```sh
PGSERVICE=ferresystem_backup node scripts/backup-preflight.mjs /ruta/privada/respaldos
```

Obtener la carpeta creada con database.dump, preflight.txt y manifest.json. El manifiesto empieza con restoreTested false.

Crear otra base vacía y configurar FERRE_RESTORE_DATABASE_URL para ella; después:

```sh
npm run backup:verify-restore -- /ruta/privada/respaldos/CARPETA/manifest.json
```

La herramienta verifica checksum, rechaza destino ocupado y ejecuta pg_restore con parada ante error. Comprueba lectura y cantidades de tablas del núcleo y actualiza el manifiesto únicamente tras completar esa restauración. Una restauración parcial requiere otra base vacía; no reintentar sobre datos existentes. Revisar en esa copia ventas, inventario, caja, crédito y usuarios con la aplicación. La restauración no ejecuta lógica del negocio ni notificaciones, pero la copia debe permanecer aislada.

La evidencia técnica de restauración no prueba que el respaldo sea el más reciente ni que corresponda al destino seleccionado. El operador debe verificar origen, hora, pausa operativa y conciliación. No modificar restoreTested manualmente. Mantener manifiesto y dump privados juntos; la herramienta no reemplaza programación de respaldos, retención ni cifrado externo.

## 4. Adopción histórica explícita

Aplicar primero sobre una copia restaurada, no sobre producción. Seleccionar --through como la última migración cuyo efecto ya está en la base. No seleccionar automáticamente la última del repositorio.

Crear una tercera base vacía, desechable, y configurar FERRE_REFERENCE_DATABASE_URL para ella. El comando construye ahí la cadena desde la inicial hasta --through, compara ambos esquemas con Prisma y compara por separado funciones, triggers, restricciones CHECK/FK/PK y políticas RLS. Si difieren, no marca ninguna migración en el destino.

Ejemplo de una base que ya contiene todos los cambios hasta operaciones del 4 de octubre:

```sh
npm run migrate:adopt -- --through 20261004000000_operacion_ferreteria --backup-manifest /ruta/privada/respaldos/CARPETA/manifest.json
npm run migrate:inspect
```

Para una base anterior, elegir su etapa real. La herramienta exige respaldo con checksum coincidente y restauración probada; únicamente registra con migrate resolve las migraciones del prefijo que faltan en el historial. No vuelve a ejecutar su SQL sobre datos existentes. Si ya había historial de las cuatro migraciones, conserva sus checksums y registra solo la inicial.

Si la adopción se interrumpe después de registrar parte del prefijo, el historial puede necesitar revisión: inspeccionar y retomar con otra referencia vacía; no forzar deploy. La referencia queda poblada para inspección; el comando no elimina bases. Una comparación bloqueada requiere revisión de diferencias y ensayo dirigido, no ignorarlas. Extensiones, cambios propios del proveedor o SQL fuera de la cadena pueden exigir un plan específico.

## 5. Actualización y salida del mantenimiento

Después del ensayo sobre copia y la conciliación, repetir el procedimiento aplicable en el destino real, con respaldo actualizado y sin operaciones concurrentes. Después de la adopción:

```sh
npm run migrate:deploy
npm run build
npm run start:prod
```

Verificar pending vacío, API iniciada, permisos, apertura de caja, compra/recepción, contado/crédito, entrega, abono, devolución y cierre. Desplegar frontend compatible con backend. Conservar el respaldo previo; no asumir que volver a una versión antigua de código revierte una migración. Si hay una falla, no resetear: diagnosticar y decidir corrección o recuperación desde respaldo según el estado observado.

## Pruebas y pendientes reales

Pruebas PostgreSQL aisladas cubren instalación completa, segunda ejecución, cliente previo conservado y numerado, adopción de SQL sin historial, historial con baseline faltante, rechazo de drift, trigger ausente, checksum distinto, migración incompleta, huecos y restauración a destino ocupado.

No se consultó ni modificó producción: el entorno sigue sin credenciales productivas configuradas. La arquitectura local/nube, el equipo, las UPS, el alta productiva inicial y la aceptación del cajero siguen pendientes. Estas herramientas preparan ambos alojamientos; no cambian tenant ni introducen sucursales o sincronización.


### H11 — OPERACION_PILOTO_20261004.md

# Operación de FerreSystem — 4 de octubre de 2026

Fuente de negocio: `REQUISITOS_NEGOCIO_VALIDADO.md` y las anotaciones de levantamiento de main. Base revisada: `84e61ec161455d46c2786791e6422178477ac886`. El diagnóstico anterior a cambios está en `DIAGNOSTICO_MAIN_20261004.md`.

## Resultado y alcance

Se priorizó inventario, compras, venta, entrega, caja y crédito. Las operaciones nuevas se persisten en PostgreSQL. El almacenamiento del navegador conserva únicamente solicitudes pendientes para recuperar respuestas perdidas; no sustituye la persistencia del negocio. Los comprobantes de venta solo se muestran después de confirmación del servidor.

Trabajo disponible en `codex/operacion-ferreteria`, PR #58. No se ejecutaron migraciones en producción, no se modificaron sus datos y main conserva la base original. El entorno de esta tarea no dispone de credenciales de Render ni de la base productiva.

## Matriz posterior a los cambios

| Requerimiento | Estado | Frontend | Backend | Base de datos | Evidencia | Qué falta |
|---|---|---|---|---|---|---|
| Inventario inicial: conteo, revisión y aplicación separada | IMPLEMENTADO | LevantamientoPage, captura completa, CSV/Excel, vista previa y aplicación administrativa | LevantamientosService: finalización no modifica stock; versión y token contra cambios concurrentes | Levantamiento/Item: costos, precio, margen, barcode, zona, versión, responsable y aplicación | Integración PostgreSQL: conservar datos y aplicar una sola vez; unitarias: cierre y conflictos | Validación con el conteo real del local |
| Venta registrada antes de entrega física | IMPLEMENTADO | POS y Entregas | Venta reserva; entrega descuenta físico y libera reserva; reintentos no duplican salida | Producto.stockReservado; Venta.reservaPendiente; MovimientoInventario | Integración de sobreventa, entregas concurrentes y cancelación parcial | Entregas parciales, si posteriormente las pide el dueño |
| Costo vigente según última reposición, incluso inferior | IMPLEMENTADO | Compras e historial en Inventario | Recepción actualiza costo vigente, conserva proveedor/factura/cantidad/fecha; no usa valoración de lotes | RecepcionCompra, CostoCompra, Producto.ultimaCompraAt | Integración: costos 12 y después 3 de dos proveedores; recepción repetida no duplica | Revisar datos históricos antes del piloto |
| Margen y precio propios de cada producto | IMPLEMENTADO | Administración de producto y levantamiento | Validación de valores y auditoría de cambios | Producto.margen/precioVenta/precioCosto | Esquema validado y compilación; captura aplicada en PostgreSQL | No se inventó una fórmula automática de precio; costo nuevo no cambia por sí solo el precio de venta |
| Proveedores, facturas, vencimientos, saldo y pagos | IMPLEMENTADO | Compras, Cuentas y reportes | Compra crea CXP; recepción parcial valida pendientes; pago reduce saldo; efectivo insuficiente se rechaza | Proveedor, OrdenCompra/Detalle, CuentaOperativa, PagoCuenta | Integración de compras, CXP, recepciones y aislamiento | Conciliar saldos anteriores; no importar saldos ficticios desde demostraciones |
| Efectivo, transferencia y tarjeta; cierre por usuario | IMPLEMENTADO | Caja real; selección de métodos en POS | Caja obligatoria para cobros/pagos; apertura única, cierre y diferencia; transferencia no aumenta efectivo | Caja, MovimientoCaja, Venta.cajaId, MetodoPago | Integración: transferencia, cierre, reintentos y bloqueo de nueva venta tras cerrar | Prueba operativa con el cajero y terminal física; sin integración bancaria |
| Crédito solo a cliente registrado, con abonos e historial | IMPLEMENTADO | Selector de clientes, vencimiento, Cuentas | Cliente del tenant obligatorio; crédito crea CXC; pagos idempotentes y límite de saldo | Cliente, Venta, CuentaOperativa, PagoCuenta | Integración: crédito sin cliente rechazado; abono repetido único y saldo correcto | Conciliación de ventas a crédito anteriores sin cuenta real |
| Administrador/Cajero y permisos en backend | IMPLEMENTADO | Permisos y límite de descuento persistidos; controles de acceso | JWT consulta usuario activo y rol vigente; RolesGuard; cajero no modifica costos, ajustes ni CXP; descuento y precio verificados al vender | Usuario.permisos, permisosConfigurados, descuentoMaximo | HTTP contra API compilada: costos/ajustes/usuarios/CXP rechazados; permisos revocados y usuario inactivo efectivos con token anterior | Revisar permisos de las cuentas reales antes de abrir el piloto |
| Auditoría de dinero, stock y usuarios | IMPLEMENTADO | Auditoría y movimientos por producto | Escrituras y auditoría en la misma transacción; desactivación conserva usuario/historial; último administrador protegido | AuditoriaOperacion, MovimientoInventario, MovimientoCaja | Integración de movimientos, caja y reversiones; endpoint administrativo paginado | Exportación y filtros avanzados posteriores |
| Barcode, fabricante, código interno y búsqueda textual | IMPLEMENTADO | POS busca nombre, descripción y códigos; Enter de lector agrega coincidencia única; variante visible | Búsqueda real y comprobación de colisiones; códigos internos generados bajo bloqueo por empresa | Producto.codigo/codigoBarras/codigoFabricante | Backend compilado; integración de productos y frontend POS | Prueba con el lector físico del cliente |
| Cámara para leer códigos | PARCIAL | BarcodeScanner en POS y conteo; libera cámara al cerrar o cambiar estado | Usa catálogo/guardado reales del sistema | Persistencia del producto/conteo existente | Compilación y flujo de código; API nativa del navegador | Validación en el celular real; navegadores sin BarcodeDetector requieren lector o búsqueda |
| Fotografías opcionales optimizadas y fuera de la base de datos | PARCIAL | Edición de URL HTTPS; imagen opcional en POS | URL validada; no guarda base64 ni binarios | Solo Producto.imagenUrl | Código y esquema; no se simula un servicio de archivos | Subida/captura, compresión y almacenamiento externo duradero configurado; no se afirmó tenerlos |
| Venta sin inventario físico | IMPLEMENTADO | Opción explícita en POS, proveedor obligatorio | No reserva ni descuenta físico; registra ingreso/caja/cliente; valida vínculo opcional de compra | DetalleVenta.sinInventario/proveedorId/ordenCompraId; Venta y caja | Integración: vender más que stock físico no lo cambia ni crea salida | Selector de compra en POS; API ya permite el vínculo |
| Devolución con efectos en venta, físico, caja y crédito | PARCIAL | Devoluciones busca documento, cantidades y destino | Máximo vendido pendiente; reembolso proporcional; cancela crédito primero; devuelve solo mercancía vendible o libera reserva; idempotencia | Devolucion, DetalleDevolucion, cuenta, caja y movimientos | Integración: devolución entregada, cancelación no entregada y crédito con abonos | Política exacta y efecto en garantías; comprobante fiscal de devolución |
| Garantía: condiciones, vigencia y responsable | NO IMPLEMENTADO | El prototipo está señalado como pendiente | No se inventaron reglas pendientes de levantar con el dueño | Tabla histórica no equivale a flujo implementado | Notas del cliente, sección 10 | Levantar política y conectar garantía con venta/producto/devolución |
| Alertas de stock y vencimientos | IMPLEMENTADO | Reportes de datos reales y cuentas vencidas | Consulta sin límite oculto de 50 ventas; considera disponible físico menos reservado y devoluciones | Cuentas, productos, ventas y devoluciones | Consultas del módulo Operaciones y build | Avisos automáticos fuera de la pantalla y canales, si se requieren |
| Operación desde otra PC/celular y continuidad sin Internet | PARCIAL | Web y recuperación de solicitudes pendientes de POS, conteo, compra y pago | UUID/hash y transacciones evitan duplicidad al confirmar reintentos | La confirmación se realiza siempre en PostgreSQL | Prueba frontend de respuesta perdida/reload; integración de operaciones concurrentes | Cola offline completa, catálogo offline y sincronización; no se autoriza entregar una solicitud sin venta confirmada |
| Vidriería/ventanas e integración bancaria/POS | NO IMPLEMENTADO | Sin cambios de alcance | El cliente las dejó posteriores al piloto | Sin nuevas integraciones inventadas | Notas P2 | Investigación después de estabilizar ferretería |

## Reglas operativas concretas

1. Abrir la caja propia con el efectivo inicial real.
2. Administrador registra proveedores y facturas. Registrar la factura crea deuda; recibir mercancía registra ingreso físico y cambia el costo vigente, aunque baje. Los pagos se realizan desde Cuentas.
3. Cajero consulta el catálogo del POS. Puede actualizar catálogo y precios del carrito, y debe revisar el total antes de cobrar. Si el precio cambió, el servidor rechaza el precio anterior.
4. Registrar venta y obtener confirmación del servidor. Para crédito, seleccionar un cliente registrado. Las mercancías físicas quedan reservadas y no pueden venderse otra vez.
5. Confirmar entrega desde Entregas. Solo entonces se reduce el inventario físico. Las ventas históricas no se vuelven a descontar: `reservaPendiente` es falso por defecto.
6. “Venta sin inventario” se usa para mercancía que nunca entra al local. Si llega físicamente, debe recibirse como compra.
7. Administrador registra devolución sobre la venta original. NO_ENTREGADO libera reserva; INVENTARIO reintegra mercancía entregada vendible; DAÑADO/PROVEEDOR conservan destino sin aumentar existencias vendibles. Crédito se cancela primero; dinero pagado se reembolsa. Una venta histórica a crédito sin cuenta debe conciliarse antes.
8. Cerrar la caja con efectivo contado; el sistema conserva esperado, contado y diferencia. La caja es parte del núcleo operativo del POS.
9. Ante respuesta perdida, usar “Confirmar pendiente”. No registrar de nuevo con otra identidad ni entregar mientras la venta no esté confirmada.

Los módulos de apartados, garantías, listas de precio, transferencias y pedidos especiales que antes escribían demostraciones locales no se presentan como operaciones reales. Sus fuentes y datos locales previos se conservan. La venta especial operativa está en POS. No se migraron esos datos locales a saldos o inventario.

## Verificación

GitHub Actions valida Prisma y genera cliente; ejecuta compilación frontend/backend, 15 pruebas frontend, 52 pruebas unitarias/HTTP backend y 28 pruebas con PostgreSQL real aislado. La integración parte del esquema de main, reproduce migración histórica operativa y numeración, y aplica la migración nueva. Inicia además la API compilada en modo producción contra esa base aislada y prueba permisos con JWT real. No usa DATABASE_URL productiva.

Ejecución completada para `0a08ea07adb0f89c6e09e807050548fb8bbcab91`: https://github.com/Nelosama/FerreSystem/actions/runs/37215414257 . Los ajustes finales se vuelven a comprobar en el último commit del PR. No se ha probado físicamente cámara/lector/impresora ni se ha ejecutado un piloto con datos reales.

## Pendientes priorizados y fases

### Fase 1 — Activación del piloto

**CRITICAL**: respaldo y comprobación del estado real de migraciones en Render/PostgreSQL; resolver baseline existente antes de `prisma migrate deploy`. El repositorio tiene historia SQL adicional a Prisma; no usar `db push`, reset o migraciones destructivas para hacerla coincidir. Revisar cajas abiertas duplicadas por usuario, códigos/barcodes repetidos, stock histórico negativo, ventas a crédito y saldos reales anteriores. Conciliar con el dueño, sin inventar que una deuda sigue pendiente.

**CRITICAL**: aplicar `20261004000000_operacion_ferreteria` primero sobre copia del dato real, validar permisos de administrador/cajero y desplegar frontend/backend juntos. Recompilar desde fuentes; no ejecutar los directorios dist antiguos versionados. Abrir turno, comprar y recibir un producto a costo mayor y menor, vender de contado/crédito, entregar, abonar, devolver y cerrar. Validar reservas físicas y diferencia de caja antes de usar el sistema para todo el local. No se ejecutó esta fase sobre producción por falta de acceso productivo en esta sesión.

### Fase 2 — Completar control operativo

**HIGH**: garantías y su efecto con devoluciones, usando condiciones confirmadas por el dueño. **HIGH**: fotos con compresión y almacenamiento externo duradero; validar lector/cámara e impresión reales. **HIGH**: offline con cola persistente, catálogo y conciliación de conflictos, conservando prohibición de entregar ventas no confirmadas.

**MEDIUM**: selector de compra para venta especial, filtros por documento/usuario/fecha en auditoría, exportaciones financieras y entrega parcial si se solicita. **MEDIUM**: unificar fechas de negocio según zona horaria del local; reportes actuales identifican su rango en UTC. **MEDIUM**: revisar y actualizar dependencias con vulnerabilidades detectadas por npm audit, sin aplicar cambios mayores a ciegas. La instalación actual reporta vulnerabilidades preexistentes; el pase de pruebas no las elimina.

### Fase 3 — Extensiones posteriores

**LOW**: explorar integraciones bancarias/POS y unidad de vidriería. Reimplementar módulos de demostración solo cuando se confirme su alcance y su persistencia real. Medir desempeño antes de sustituir el bloqueo transaccional por empresa con una estrategia más granular.

No se requiere una nueva autorización rutinaria para seguir trabajando: el usuario autorizó este trabajo y sus siguientes pasos. El acceso al entorno productivo y las reglas de garantía pendientes son información que aún no está disponible, no una autorización repetida.


### H12 — PENDIENTES_LEVANTAMIENTO_INVENTARIO.md

# Pendientes — Levantamiento de Inventario

## Objetivo

Convertir el módulo de levantamiento de inventario en una herramienta práctica para digitalizar desde cero el inventario físico de una ferretería, incluyendo trabajo colaborativo, operación sin conexión y aplicación controlada al inventario real.

## 1. Aplicar levantamiento al inventario real

### Estado actual
Al finalizar un levantamiento, el sistema cambia su estado a `FINALIZADO`, pero no convierte automáticamente los registros capturados en productos ni actualiza las existencias del inventario.

### Pendiente
Implementar un flujo separado y explícito:

**Levantamiento → Revisión → Conciliación → Aplicar al inventario**

- Agregar una acción independiente: **Aplicar al inventario**.
- No modificar existencias reales únicamente por marcar un levantamiento como `FINALIZADO`.
- Mostrar una vista previa antes de aplicar cambios.
- Si el producto ya existe, permitir conciliar/actualizar su existencia.
- Si no existe, permitir crear el producto completando los datos faltantes.
- Identificar registros incompletos o con conflictos antes de aplicar.
- Ejecutar la aplicación al inventario de forma transaccional para evitar cargas parciales.
- Registrar quién aplicó el levantamiento y cuándo.

## 2. Levantamiento multiusuario simultáneo

Permitir que varias personas trabajen sobre un mismo levantamiento desde diferentes dispositivos.

### Requisitos
- Registrar el usuario que capturó o modificó cada artículo.
- Registrar fecha/hora de captura y última modificación.
- Permitir organizar el levantamiento por zonas, pasillos, bodegas o secciones.
- Detectar registros potencialmente duplicados.
- Evitar que dos usuarios sobrescriban silenciosamente el trabajo del otro.
- Cuando dos personas registren el mismo producto, enviarlo a conciliación.
- Permitir decidir durante la conciliación si corresponde sumar cantidades, sustituir un conteo, mantener registros separados o corregirlos.
- Diseñar el backend considerando concurrencia real.

## 3. Modo offline y sincronización

El levantamiento debe continuar funcionando si se pierde temporalmente la conexión a Internet.

### Requisitos
- Guardar localmente los registros pendientes, preferiblemente usando IndexedDB.
- Permitir crear y editar conteos mientras el dispositivo está offline.
- Mostrar claramente el estado **Online / Offline**.
- Mostrar cuántos registros están pendientes de sincronización.
- Sincronizar automáticamente cuando vuelva la conexión.
- Permitir reintentar manualmente una sincronización fallida.
- Usar identificadores/idempotencia para evitar duplicados al reintentar.
- Detectar conflictos producidos por otros usuarios mientras un dispositivo estuvo offline.
- No sobrescribir automáticamente información del servidor ante un conflicto.
- Evaluar PWA/service worker para mejorar el uso desde teléfonos.

## 4. Conciliación

Crear una etapa de revisión antes de afectar el inventario definitivo.

Debe permitir identificar:
- Productos nuevos.
- Productos ya existentes.
- Posibles duplicados.
- Conteos realizados por diferentes usuarios.
- Conflictos de cantidades.
- Registros incompletos.
- Registros pendientes de sincronización.

Ningún levantamiento con conflictos críticos o registros pendientes de sincronización debería poder aplicarse al inventario sin resolverlos.

## Criterios de seguridad funcional

- `FINALIZADO` no significa `APLICADO AL INVENTARIO`.
- El levantamiento debe conservar trazabilidad.
- La sincronización offline debe ser idempotente.
- Las operaciones concurrentes no deben causar pérdida silenciosa de datos.
- Aplicar al inventario debe ser una operación explícita, autorizada y transaccional.

## Contexto

Este trabajo está pensado especialmente para el caso de una ferretería que ya opera físicamente pero todavía no posee un inventario digital confiable. El objetivo es permitir que varias personas hagan el conteo físico desde celulares, incluso con conectividad intermitente, y posteriormente convertir ese levantamiento revisado en el inventario inicial real de FerreSystem.


## 5. Captura práctica desde celular

### Código de barras y QR
- Permitir escanear códigos de barras usando la cámara del teléfono.
- Evaluar lectura de QR cuando aplique al tipo de producto o etiquetado utilizado.
- Si el código corresponde a un producto existente, recuperarlo inmediatamente para registrar el conteo.
- Si el código no existe, permitir iniciar el alta del producto desde el levantamiento.
- Mantener captura manual como alternativa cuando la cámara o el código no estén disponibles.

### Fotografías
- Permitir tomar una foto del producto durante el levantamiento.
- Usarla como referencia cuando el producto todavía no pueda identificarse completamente.
- Permitir dejar el registro pendiente de completar durante la etapa de revisión.

### Productos sin código
- No exigir código de barras o QR para poder contar un producto.
- Soportar artículos vendidos o almacenados sin etiquetado individual.

## 6. Unidades, presentaciones y cantidades fraccionarias

El levantamiento debe adaptarse a productos típicos de ferretería.

- Soportar unidad, caja, paquete, metro, pie, libra, galón y otras unidades configurables.
- Permitir cantidades decimales cuando corresponda.
- Contemplar que un mismo artículo pueda manejar presentaciones distintas.
- Evitar conversiones automáticas ambiguas; cualquier equivalencia entre presentaciones debe estar configurada explícitamente.

## 7. Zonas y progreso del levantamiento

- Permitir dividir la tienda en zonas, pasillos, bodegas o secciones.
- Asignar zonas a usuarios cuando sea útil.
- Mostrar qué zonas están pendientes, en proceso y terminadas.
- Mostrar avance general del levantamiento.
- Mostrar avance por usuario o zona sin utilizarlo para sobrescribir conteos de otros participantes.

## 8. Auditoría y trazabilidad

Conservar evidencia completa del proceso.

- Registrar quién creó cada conteo.
- Registrar quién lo modificó y cuándo.
- Registrar valor anterior y valor nuevo en correcciones relevantes.
- Registrar quién resolvió un conflicto.
- Registrar quién aprobó y aplicó el levantamiento al inventario.
- Conservar el levantamiento original aun después de aplicarlo.

## 9. Reconteo y validación

- Permitir marcar artículos para un segundo conteo.
- Permitir solicitar reconteo cuando exista una diferencia o cantidad sospechosa.
- Conservar tanto el conteo original como el reconteo para auditoría.
- Resolver la cantidad definitiva durante la conciliación; no reemplazar silenciosamente el primer conteo.

## 10. Orden sugerido de implementación

Para reducir riesgo, implementar y probar por etapas:

1. Aplicación controlada del levantamiento al inventario.
2. Multiusuario, zonas, concurrencia y conciliación.
3. Modo offline, cola local e idempotencia de sincronización.
4. Código de barras/QR y captura con cámara.
5. Fotografías y registros pendientes de identificación.
6. Progreso, reconteo y mejoras adicionales de auditoría.

Antes de implementar cada etapa, revisar la arquitectura existente y reutilizar modelos, servicios y mecanismos de auditoría que ya existan en FerreSystem. Evitar duplicar funcionalidades o introducir cambios destructivos innecesarios.


## 11. Levantamiento independiente y migración a otros sistemas — P0

El módulo de levantamiento debe poder utilizarse aunque la empresa decida no adoptar FerreSystem como su sistema operativo final.

### Flujo de cierre
- **Finalizar levantamiento** debe consolidar/cerrar el conteo; no debe aplicar automáticamente los datos al inventario de FerreSystem.
- Después de finalizar, ofrecer acciones separadas:
  - **Aplicar a FerreSystem**.
  - **Exportar para otro sistema**.
  - Permitir ambas cuando corresponda.

### Exportación y portabilidad
- Exportar como mínimo a CSV y Excel.
- Permitir seleccionar y ordenar columnas.
- Contemplar campos como código/SKU, código de barras, descripción, cantidad, unidad, categoría, costo, precio y ubicación/zona.
- Permitir plantillas de exportación reutilizables para adaptar nombres y orden de columnas al sistema destino.
- Mantener el levantamiento original y su trazabilidad aun después de exportar.

### Enfoque comercial
El levantamiento puede convertirse en una funcionalidad utilizable de forma independiente: realizar inventario físico, revisar/conciliar la información y entregar datos preparados para migración hacia otro ERP/POS, sin obligar al cliente a adoptar FerreSystem completo.

### Principio de diseño
La captura y consolidación del inventario debe estar desacoplada del destino final de los datos. FerreSystem puede ser uno de los destinos, no el único.


### H13 — RECUPERACION_USABILIDAD_Y_PRIORIDADES_20261005.md

# Recuperación, facilidad de uso y pendientes priorizados

Fecha: 5 de octubre de 2026.
Estado: ideas y planificación para revisar. Este documento no implementa funcionalidades ni confirma su disponibilidad en producción.

Complementa [las opciones de arquitectura](IDEAS_ARQUITECTURA_CONTINUIDAD_Y_SUCURSALES.md), [el plan del piloto](OPERACION_PILOTO_20261004.md) y [los requisitos del negocio](REQUISITOS_NEGOCIO_VALIDADO.md).
El PR #58 ya se integró en main; las referencias del plan anterior a un PR aún en borrador describen su estado histórico.

## Contexto de adopción

El usuario indica que el negocio ya tiene un sistema, descrito como uno de Microsoft Dynamics para ferreterías, pero no lo utilizan porque lo consideran difícil. La identificación exacta del producto y las causas concretas no se han comprobado.

Quienes usarán FerreSystem pueden tener poca experiencia con computadoras. La facilidad de uso debe ser criterio de aceptación del piloto, junto con integridad de inventario, caja y ventas.

## Ideas de interfaz

- Pantalla inicial del cajero centrada en Vender, Buscar venta y Mi caja; mostrar administración según permisos.
- Venta con recorrido corto: buscar/escanear, cantidad, revisión del total y cobro.
- Botones grandes, texto legible y términos del negocio.
- Pedir solo información necesaria; explicar errores con una acción para resolverlos.
- Ejemplo: “Abra su caja para cobrar”, acompañado de acceso directo.
- Confirmaciones en acciones delicadas, sin interrumpir cada paso.
- Conservar borradores y facilitar correcciones.
- Recuperación guiada al volver: “Había una venta en proceso. Revisar venta y continuar”.
- El sistema debe comprobar el estado real antes de ofrecer reintento, cobro o comprobante; no trasladar al cajero decisiones técnicas sobre sincronización.
- Distinguir claramente Guardado como borrador, Pendiente de confirmar y Venta registrada.

Probar con cajero y administrador reales, observando dónde se traban al buscar, vender, corregir, consultar y cerrar caja. Observar también las tareas difíciles del sistema actual. No atribuir la dificultad únicamente a la marca.

## Qué existe y qué falta ante un apagón

Revisión de fuentes de main realizada durante esta conversación:

- frontend/src/pages/POSPage.tsx guarda la solicitud de venta en localStorage antes de enviarla, con identificador único y clave por empresa/usuario.
- Al abrir POS con el mismo equipo, navegador, empresa y usuario puede recuperar el pendiente y reintentar.
- backend/src/ventas/ventas.service.ts usa una transacción PostgreSQL y reconoce una solicitud repetida: devuelve la venta existente en lugar de duplicar venta, caja y reservas.
- frontend/test/operaciones.test.mjs prueba respuesta perdida, recarga y conservación de identidad.
- El carrito previo a pulsar Cobrar todavía no tiene guardado automático como borrador.
- Si el navegador recibió la confirmación y eliminó el pendiente antes del corte, la venta se consulta en el historial; no se recupera como pendiente.
- La recuperación actual no equivale a un centro de recuperación después del login ni a recuperación desde otra computadora.
- No se ha validado en esta conversación un corte físico de energía. Las pruebas de respuesta perdida no prueban apagado real, escritura durable del navegador ni restauración de una base local.

PostgreSQL permite confirmar o revertir el conjunto de cambios de una transacción. Si se instala localmente, verificar configuración de durabilidad, almacenamiento y recuperación; no prometer ausencia absoluta de pérdida ante daño físico.

El pago físico está fuera de la transacción de base de datos: el sistema no sabe por sí solo si ya se recibió efectivo o si una terminal bancaria cobró. Diseñar conciliación y evitar volver a cobrar sin comprobarlo.

## Comportamiento deseado de recuperación

1. Guardar automáticamente borradores, con versión, usuario/empresa y datos mínimos necesarios.
2. Al volver al POS, identificar borradores y operaciones pendientes.
3. Consultar al servidor si la solicitud ya se confirmó, sin crear una nueva venta por consultar.
4. Si está registrada, mostrar documento y facilitar consulta/reimpresión.
5. Si no se registró, permitir continuar la operación original con las validaciones vigentes.
6. Si no hay conexión al servidor, indicar que no puede comprobarse todavía; no presentar éxito ni autorizar entrega basada solo en un pendiente.
7. Separar recuperación del registro de la conciliación del pago físico.
8. Probar cambios de usuario, sesión vencida, datos corruptos, precios cambiados, caja cerrada, permisos revocados y respuesta perdida.
9. Definir retención y limpieza de borradores y cómo evitar restaurar datos de otra empresa o usuario.

## Prioridades consolidadas

La prioridad considera impacto en dinero/datos, continuidad y adopción. No implica que todas las funciones secundarias deban terminarse antes de un piloto limitado.

### P0 — Antes de usarlo como sistema principal

1. **Respaldo y datos reales.** Comprobar entorno actual, respaldo restaurable e historial de migraciones. Conciliar stock, códigos duplicados, cajas y saldos anteriores con el dueño.
2. **Arquitectura y continuidad.** Elegir nube/local según equipos, presupuesto y cortes. Evaluar PC del administrador como servidor, red local, UPS, inicio automático y mantenimiento. No construir dos arquitecturas a la vez.
3. **Recuperación de venta interrumpida.** Autoguardado de carrito, consulta de estado, recuperación guiada y conciliación de pagos. Probar apagones/reinicios en entorno controlado.
4. **Facilidad de uso y aceptación.** Simplificar flujo de caja según observación de usuarios reales. Deben completar tareas esenciales con ayuda mínima después de una breve capacitación.
5. **Migración y piloto controlado.** Ensayar sobre copia de datos reales y desplegar frontend/backend compatibles. Validar apertura, compra/recepción, contado/crédito, entrega, abono, devolución y cierre; probar lector e impresión usados por el negocio.
6. **Seguridad necesaria para el piloto.** Revisar permisos reales y credenciales/despliegue. Clasificar vulnerabilidades existentes por exposición e impacto; corregir las críticas aplicables antes de operación. El pase de pruebas no elimina vulnerabilidades.

La garantía, impresión fiscal u otra regla puede convertirse en P0 si es necesaria para las operaciones elegidas en el piloto.

### P1 — Después de estabilizar el núcleo o antes, si el negocio lo exige

7. **App instalada del dueño (requisito confirmado).** Recibir notificaciones push con app cerrada, independientes de sesión del navegador; revisar y decidir solicitudes con sesión móvil propia. Web/PWA no completa este requisito. Propuesta React Native/Expo, registro/revocación de dispositivos y cola persistente de eventos; VPN o puente limitado para acceso remoto, manteniendo base local. Ver `APP_MOVIL_Y_NOTIFICACIONES.md`.
8. **Garantías y política de devoluciones.** Confirmar vigencia, responsable, mercancía dañada y comprobantes; no inventar reglas.
9. **Continuidad adicional según arquitectura.** Con servidor local se puede operar sin Internet mientras funciona la red; una cola offline completa en cada terminal es una necesidad distinta y debe justificarse. Si se elige nube, la operación offline exige catálogo, cola, conflictos y sincronización.
10. **Dispositivos y fotos.** Validar cámara en móviles reales y, si se requieren fotografías, configurar captura, compresión y almacenamiento duradero. La URL de imagen actual no equivale a un servicio de subida.

### P2 — Mejoras y preparación de expansión

11. **Reportes y operación.** Zona horaria del local, filtros/exportaciones de auditoría y finanzas, selector de compra para venta especial; entregas parciales si se solicitan.
12. **Sucursales.** Diseñar relación empresa/sucursal, propiedad de datos y transferencias antes de cambios que dificulten expansión. Implementar sincronización y consolidación cuando se confirme plazo y alcance.
13. **Mantenimiento.** Dependencias no críticas, limpieza de artefactos versionados y desempeño según mediciones; separar esta tarea de correcciones de seguridad urgentes.

### P3 — Ampliaciones posteriores

14. Integraciones bancarias/terminales, vidriería y módulos hoy señalados como pendientes, según alcance confirmado y persistencia real.

## Información faltante para avanzar

- Capacidad y sistema operativo de PCs, disponibilidad fuera de horario y router/cableado.
- Frecuencia/duración de cortes, presupuesto y tolerancia a interrupción/pérdida de datos.
- Acceso al entorno productivo y estado observado de despliegue/migraciones.
- Disponibilidad del cajero y administrador para prueba de uso; tareas que evitan en su sistema actual.
- Política de garantías, requisitos fiscales, dispositivos y autorizaciones del dueño.
- Plazo y reglas de una segunda sucursal.

## Evidencia de cierre sugerida

No declarar continuidad, sencillez ni aceptación solo por compilación. Conservar resultados de restauración de respaldo, recuperación tras interrupción, conciliación de caja/inventario y observación de tareas reales. Registrar limitaciones del piloto y cuáles funciones siguen pendientes.


### H14 — REQUISITOS_NEGOCIO_VALIDADO.md

# Requisitos de negocio validados — FerreSystem

Fecha: 2026-10-02
Fuente: conversación con el dueño de la ferretería.

## Objetivo de negocio
FerreSystem debe permitir que el negocio deje de depender de la memoria y presencia permanente del dueño. El sistema debe convertirse en la fuente de control operativo y permitir delegar con auditoría: quién hizo qué, cuándo, por cuánto y con qué impacto.

## P0 — Núcleo para piloto real

### 1. Inventario y entrega controlada
- Inventario es la máxima prioridad.
- Flujo objetivo: Cliente solicita → Caja registra/factura → venta registrada → entrega → inventario disminuye.
- Regla operativa: no entregar mercancía antes de registrar la venta.
- Detectar faltantes y mantener trazabilidad de movimientos.
- Reportar productos de mayor movimiento para reposición.
- El levantamiento inicial sigue siendo la primera implementación.

### 2. Costos y precio vigente
- Conservar historial de costos por compra/proveedor.
- Mantener además un costo vigente del producto.
- Al registrar una nueva reposición, permitir actualizar el costo vigente al costo de la compra más reciente, incluso si sube o baja.
- No confundir costo vigente comercial con valoración histórica de lotes.
- Cada producto puede tener su propio margen y precio de venta.
- Durante el levantamiento inicial contemplar costo, margen y precio de venta.

### 3. Compras, proveedores y cuentas por pagar
Trazabilidad mínima:
Producto → proveedor → factura de compra → cantidad → costo → fecha.
- Un producto puede tener múltiples proveedores.
- Registrar facturas de proveedor, vencimiento/plazo, monto, saldo, estado y pagos.
- Alertar facturas próximas a vencer.
- El negocio debe mantener su propio saldo por proveedor y no depender del estado de cuenta del proveedor.
- Recepción de compra física debe incrementar inventario y generar movimiento trazable.

### 4. Venta de contado y caja
- Métodos iniciales: efectivo, transferencia y tarjeta/POS.
- Toda venta asociada al usuario/cajero.
- Permitir cierre por cajero/empleado.
- Integraciones bancarias/POS quedan para investigación posterior y no bloquean el piloto.

### 5. Crédito y cuentas por cobrar
- Solo clientes previamente registrados pueden comprar a crédito.
- Cliente con código/identificador.
- Factura marcada como contado o crédito.
- Venta a crédito crea/aumenta cuenta por cobrar.
- Registrar abonos/pagos y reducir saldo.
- Mantener historial y trazabilidad de deuda.

### 6. Roles, permisos y auditoría
Roles mínimos validados: Administrador y Cajero.
- Cajero vende y consulta la información necesaria.
- Cajero no modifica libremente costos ni información sensible.
- Auditar usuario, operación, fecha/hora, monto, método de pago y cierre.
- Operaciones administrativas sensibles también deben registrar autor/modificador.

### 7. Identificación de productos
- Aprovechar código de fabricante/proveedor cuando sea útil.
- Productos sin código útil reciben código interno.
- Soportar escáner/cámara.
- Mantener búsqueda por descripción.
- Descripciones operativas deben distinguir variantes: tipo, medida, espesor, color/identificador cuando corresponda.
- Fotografía opcional como ayuda de identificación, optimizada para no almacenar imágenes pesadas directamente en la base de datos.

### 8. Venta especial / mercancía que nunca entra físicamente
Crear un flujo explícito de “Venta especial” o “Venta sin inventario”.
- Cuenta como ingreso, venta del cajero, factura, cierre e historial del cliente.
- No genera salida de inventario físico si la mercancía nunca estuvo almacenada.
- Debe poder vincularse al proveedor/compra correspondiente.
- No usar stock negativo como mecanismo normal para este caso.
- Si mercancía comprada por error sí llega físicamente al local, entonces sí entra al inventario.

## P1 — Control operativo

### 9. Devoluciones
Definir devolución vinculada a venta/documento original y su efecto en:
- inventario;
- factura;
- caja/reembolso;
- crédito/cuenta por cobrar;
- garantía.
Registrar motivo, usuario, fecha y destino físico del artículo.

### 10. Garantías
- Asociar garantía a producto/venta.
- Conservar condiciones, vigencia y responsable.
- Reglas exactas pendientes de levantar con el dueño.

### 11. Alertas
- Facturas de proveedor próximas a vencer.
- Cuentas por cobrar vencidas.
- Stock bajo/reposición y otras alertas operativas relevantes.

### 12. Operación offline
- Sistema web accesible desde otra PC/celular si falla un equipo.
- Ante caída de Internet, guardar temporalmente operaciones compatibles y sincronizar al volver la conexión.
- Definir cuidadosamente qué operaciones pueden ejecutarse offline para evitar duplicidad de ventas, pagos o stock.

## P2 — Posterior al piloto

### 13. Vidriería / ventanas
Analizar después de estabilizar la ferretería:
- misma empresa/unidad de negocio;
- otra empresa/tenant;
- usuarios/permisos separados;
- o ventanas como productos/servicios.
No debe ampliar el alcance del piloto inicial.

### 14. Integraciones externas
- Investigar integración bancaria/POS.
- No bloquear el desarrollo actual por estas integraciones.

## Reglas conceptuales críticas
1. Diferenciar inventario físico de mercancía vendida que nunca entra al local.
2. Diferenciar costo histórico de compra de costo vigente comercial.
3. No modificar existencias sin un movimiento trazable.
4. No permitir que permisos de frontend sustituyan validación en backend.
5. Ventas, compras, pagos, devoluciones y ajustes deben ser auditables.
6. FerreSystem debe permitir delegar la operación sin perder control.

## Flujo núcleo validado
Compras/Proveedores → Inventario/Costos → Venta/Crédito → Entrega → Caja/Cierre → Auditoría.

Alrededor de este núcleo: cuentas por cobrar, cuentas por pagar, garantías, devoluciones, ventas especiales y alertas.

## Próximo paso recomendado
Auditar el repositorio contra estos requisitos y clasificar cada punto como:
- IMPLEMENTADO Y VALIDADO;
- IMPLEMENTADO PARCIAL;
- EXISTE PERO REQUIERE ADAPTACIÓN;
- NO IMPLEMENTADO;
- REQUIERE DEFINICIÓN DE NEGOCIO.

No implementar funciones nuevas antes de comprobar qué existe actualmente en frontend, backend, esquema Prisma, persistencia y pruebas.

## Ampliación confirmada — 5 de octubre de 2026

El dueño requiere una app instalada para recibir notificaciones push y revisar autorizaciones importantes, incluso con la app cerrada y sin depender de la sesión del navegador. La sesión de la app será independiente; cerrar sesión explícitamente o revocar el dispositivo debe cancelar sus envíos futuros y acceso. Web adaptable/manifiesto no completa esta entrega. La base operativa puede seguir local; sin Internet del local, los avisos quedan pendientes hasta reconectar. Alcance y propuesta en `APP_MOVIL_Y_NOTIFICACIONES.md`; plataforma y distribución por confirmar.


### H15 — REVISION_PENDIENTES_20261005.md

# Revisión preparada para mañana

Rama `codex/recuperacion-ventas`, PR #59. Esta lista reemplaza la interpretación de que gestión de roles seguía por implementar; los documentos iniciales mantienen el contexto histórico.

| Prioridad | Trabajo | Estado |
|---|---|---|
| P0 | Borradores de venta y recuperación sin duplicar cobro | Implementado y probado; falta prueba física de energía/equipo |
| P0 | Roles, permisos, último ADMIN y dos administradores | Implementado; sesión/menús se sincronizan mientras la ventana está visible |
| P0 | Devoluciones totales/parciales autorizadas, caja, crédito y auditoría | Implementado y probado; falta aceptación del negocio |
| P0 | Migraciones iniciales, adopción histórica y respaldo/restauración | Ensayo aislado aprobado; bloqueada la prueba con copia real por falta de acceso/respaldo |
| P0 | Instalación local, HTTPS, persistencia y arranque de servicios | Ensayo Docker aprobado, incluso sin salida a Internet y tras reinicio abrupto de procesos; faltan equipos/corte físicos |
| P0 | Respaldo automático y estado visible para ADMIN | Programador cada seis horas y panel de estado; falta copia externa/retención y restauraciones periódicas |
| P0 | Importación y dependencias | CSV limitado a 5 MB/5000 filas; retirada lectura Excel vulnerable |
| P0 | Archivos de entorno versionados | Retirados del seguimiento sin leer valores; el historial aún los contiene, revisar/rotar credenciales reales si las hubo |
| P0 | Uso sencillo y piloto | Inicio por tareas/buscador y mensajes de estado implementados; falta observación de cajero/admin y lector/impresora |
| P1 | App instalada y push (requisito del cliente) | Pendiente; web/manifiesto no lo completan. Propuesta en APP_MOVIL_Y_NOTIFICACIONES.md; confirmar plataforma/distribución, sesión móvil y canal push |
| P1 | Autorización fuera del local | Flujo backend real listo; requiere VPN/puente remoto y configuración de red |
| P1 | Garantías y política comercial | Falta vigencia/reglas/responsables y requisitos fiscales del cliente |
| P1 | Fotografías | URL de imagen existente; no captura/subida/almacenamiento durable implementados |
| P2 | Sucursales | Propuesta empresa/sucursal/outbox documentada; selector ficticio retirado; sincronización no implementada |
| P2 | Reportes/entregas adicionales | Núcleo actual operativo; zona horaria, filtros/exportaciones y entregas parciales requieren revisar alcance |
| P2 | Limpieza de artefactos | node_modules y dist retirados de Git; CI/instalación generan dependencias y bundles |
| P3 | Bancos, módulos pendientes y ampliaciones | No implementados; alcance/reglas/proveedores aún por definir |

## Cambios a revisar

- `INSTALACION_LOCAL_Y_CONTINUIDAD.md`: servidor en PC existente, LAN, HTTPS, alta inicial sin demo, respaldos y recuperación.
- `VALIDACION_INTEGRACION_Y_SESIONES.md`: evidencia del ensayo aislado y procedimiento sobre copia real.
- `AVANCE_DEVOLUCIONES_AUTORIZADAS.md`: solicitud, decisión, ejecución y auditoría.
- `SUCURSALES_Y_ACCESO_REMOTO_PROPUESTA.md`: propuesta para expansión sin sustituir el aislamiento de empresa.
- `AUDITORIA_RAMA_20261005.md`: fallos confirmados, correcciones y límites de la revisión.
- `APP_MOVIL_Y_NOTIFICACIONES.md`: app instalada con avisos independientes del navegador, sesión propia, cola de eventos y base operativa local.
- Commit separado de limpieza: elimina artefactos/entornos del seguimiento, conserva las copias locales y no elimina su historial. La cantidad grande de archivos eliminados corresponde a dependencias/bundles, no a módulos de negocio.

## Para cerrar los pendientes externos

Copia reciente de la base y conexiones aisladas; sistema operativo/recursos de las PCs; router/DNS y UPS; lector/impresora; política de respaldo externo/retención; teléfono Android/iOS y acceso remoto; prueba con el cajero y ambos administradores; reglas fiscales, garantías y segunda sucursal.

No se instaló en la ferretería ni se fusionó a main. No se cambiaron datos productivos ni se activaron pagos/servicios remotos. Estas dependencias no se consideran cerradas por compilar o pasar pruebas.

## Pruebas de código de esta etapa

58 pruebas frontend, 88 backend, 55 PostgreSQL real aislado y 7 scripts aprobadas (208) tras la auditoría. Builds de producción con `/api`, backend e imágenes Docker aprobados. Login ADMIN/cajero, recuperación de venta, devolución autorizada/reintento, respaldo y restauración aprobados en el ensayo; HTTPS e inicio sin salida a Internet comprobados. Auditoría npm de dependencias productivas: cero vulnerabilidades conocidas reportadas en ambos paquetes después de retirar XLSX; no es una certificación de seguridad de la instalación del cliente.


### H16 — ROADMAP_FERRESYSTEM.md

# Roadmap general — FerreSystem

Este documento centraliza ideas y mejoras generales que pueden convertirse en futuras implementaciones. Los detalles específicos de cada módulo pueden mantenerse en documentos separados dentro de `docs/`.

## Prioridad alta

### 1. Cuentas por cobrar y ventas al crédito
- Permitir ventas al crédito asociadas a un cliente.
- Crear automáticamente una cuenta por cobrar desde la venta.
- Registrar monto original, abonos, saldo pendiente y fecha de vencimiento.
- Mantener historial completo de pagos y ajustes.
- Identificar cuentas vigentes y vencidas.
- Mostrar claramente quién debe, cuánto debe y desde cuándo.
- Incluir resumen de cartera total por cobrar.
- Conservar trazabilidad entre factura/venta, cliente y cuenta por cobrar.

### 2. Trazabilidad de movimientos de inventario
- No limitar el inventario al valor actual de stock.
- Registrar entradas y salidas con su origen.
- Distinguir inventario inicial, ventas, compras, devoluciones, ajustes y transferencias.
- Permitir consultar el historial de movimientos por producto.
- Registrar usuario, fecha, cantidad anterior/nueva y documento relacionado cuando corresponda.
- Facilitar investigación de diferencias de inventario.

### 3. Levantamiento de inventario
El diseño detallado se mantiene en:
`docs/PENDIENTES_LEVANTAMIENTO_INVENTARIO.md`

Incluye, entre otros:
- aplicación controlada al inventario;
- trabajo multiusuario;
- modo offline y sincronización;
- conciliación;
- código de barras/QR;
- fotografías;
- zonas, auditoría y reconteos.

## Prioridad media

### 4. Centro de alertas
Centralizar alertas operativas relevantes:
- stock bajo;
- cuentas por cobrar vencidas;
- productos próximos a agotarse;
- cotizaciones pendientes;
- apartados próximos a vencer;
- diferencias de caja;
- otros eventos que requieran atención.

Inicialmente puede implementarse dentro del sistema antes de incorporar notificaciones push.

### 5. Cierre/resumen diario del negocio
Crear una vista sencilla para el propietario o administrador con:
- ventas del día;
- efectivo esperado;
- ventas por medio de pago;
- ventas al crédito otorgadas;
- abonos recibidos;
- utilidad aproximada cuando la información de costos lo permita;
- diferencias de caja;
- otros indicadores operativos relevantes.

## Criterios generales para nuevas funcionalidades

- Priorizar problemas reales del negocio sobre agregar pantallas sin uso validado.
- Mantener compatibilidad multi-tenant.
- Mantener trazabilidad de operaciones sensibles.
- Diseñar pensando en uso desde celular.
- Evitar pérdida silenciosa de datos.
- Reutilizar servicios, modelos y componentes existentes antes de crear duplicados.
- Implementar por etapas y probar cada etapa antes de ampliar alcance.
- Validar las funcionalidades principales en una operación real de ferretería antes de sofisticarlas.

## Uso de este documento

Cuando surja una idea nueva para FerreSystem:
1. Registrarla aquí si afecta al producto en general.
2. Crear o ampliar un documento específico en `docs/` si requiere diseño detallado.
3. Revisar el código existente antes de asumir que la funcionalidad no existe.
4. Convertir la idea en una tarea concreta únicamente cuando se vaya a implementar.


## Hallazgos técnicos pendientes de corrección

### Órdenes de compra y proveedores — implementación parcial
Revisión del código actual:
- Existe interfaz para órdenes de compra y catálogo de proveedores.
- Proveedores y órdenes todavía se persisten mediante `localStorage` en el frontend.
- La acción **Confirmar recepción total** actualiza el estado de la orden y `cantidadRecibida` en el estado local.
- La recepción no debe considerarse completa hasta verificar/implementar persistencia real en backend y movimiento real de existencias.
- Pendiente conectar recepción parcial/total con inventario, trazabilidad de movimientos y costos.
- Al implementar, evitar duplicar modelos o endpoints existentes: auditar backend/Prisma primero.

### Permisos individuales — revisar persistencia y enforcement
Revisión del código actual:
- Existen roles base: `ADMIN`, `CAJERO`, `BODEGUERO` y `VENDEDOR`.
- Existe `RolesGuard` en backend para autorización basada en rol.
- La pantalla de usuarios permite seleccionar permisos individuales y límite máximo de descuento.
- El payload observado al crear/editar usuario envía nombre, email, rol, estado y contraseña cuando corresponde, pero no incluye los permisos individuales ni el límite de descuento seleccionados en la interfaz.
- Pendiente verificar modelo/DTO/backend y hacer persistentes los permisos finos.
- Pendiente asegurar que los permisos se validen en backend y no únicamente oculten o habiliten controles en frontend.
- Pendiente verificar persistencia/asignación real de sucursal mostrada en la interfaz.

### Devoluciones — auditar antes de implementar
- En la revisión inicial no se encontró una implementación clara de devolución de ventas o devolución a proveedor.
- Antes de crear el módulo, realizar una búsqueda completa de modelos, endpoints, servicios y componentes existentes.
- Si no existe, diseñar devoluciones vinculadas al documento original y con impacto trazable en inventario/caja/cuentas según corresponda.
- Una devolución no debe modificar stock sin registrar motivo, usuario, fecha y destino del artículo (reintegrado, dañado, devolución a proveedor, etc.).

### Regla para estos hallazgos
Estos puntos representan funcionalidad existente incompleta o áreas que requieren auditoría. No tratarlos automáticamente como módulos nuevos. Antes de implementar, confirmar el estado actual del backend, esquema Prisma, DTOs, endpoints y pruebas para evitar duplicar lógica.


## Backlog priorizado para implementación con Codex

Las prioridades pueden ajustarse conforme avance la auditoría. La regla es cerrar primero los flujos que afectan datos reales, dinero e inventario antes de añadir sofisticación.

### P0 — Piloto / operación básica confiable
- Levantamiento de inventario con aplicación controlada al inventario real.
- Persistencia real de proveedores y órdenes de compra en backend/PostgreSQL.
- Recepción de compras conectada con movimientos y existencias reales.
- Cuentas por cobrar y ventas al crédito con saldos, abonos, vencimientos y trazabilidad.
- Corregir persistencia y enforcement backend de permisos individuales.
- Trazabilidad/Kardex de movimientos de inventario.
- Verificar y cerrar flujos críticos antes de depender del sistema en operación real.

### P1 — Control operativo
- Devoluciones de clientes y a proveedores con impacto trazable.
- Centro de alertas operativas.
- Cierre/resumen diario.
- Reconciliación y auditoría avanzada del levantamiento.
- Fortalecer controles por sucursal y usuario.

### P2 — Optimización
- Relación producto–múltiples proveedores.
- Código/SKU utilizado por cada proveedor para el producto.
- Historial de costos por producto y proveedor.
- Último costo de compra.
- Proveedor preferido.
- Plazo/tiempo habitual de entrega.
- Comparación de proveedores y condiciones de compra.
- Analítica y automatizaciones derivadas de datos históricos confiables.

### Regla de mantenimiento del roadmap
Cuando durante auditorías o conversaciones aparezca una mejora concreta:
- registrarla en este documento;
- clasificarla como P0, P1 o P2 según impacto y dependencia;
- indicar si es funcionalidad nueva, parcial o corrección;
- evitar duplicarla si ya existe en otro documento;
- mover los detalles técnicos extensos a un documento específico cuando sea necesario.


### H17 — SUCURSALES_Y_ACCESO_REMOTO_PROPUESTA.md

# Propuesta para expansión y acceso remoto

Diseño para revisión, no funcionalidad desplegada. La instalación local y las autorizaciones actuales pueden usarse como núcleo inicial; no confundir una etiqueta de sucursal en el navegador con separación real de existencias o caja.

## Empresa y sucursal

Mantener Tenant como empresa/cliente del sistema; no usar una nueva sucursal como sustituto automático de Tenant. Proponer entidad Sucursal asociada a una empresa y acceso de usuario por sucursal. Migrar instalaciones existentes a una sucursal inicial mediante migración comprobada sobre copia.

La sucursal controla existencias, reservas, caja, ventas, entregas y movimientos. La empresa puede compartir catálogo/clientes según política confirmada. Registrar sucursal origen en cada documento y autorización; toda consulta comprueba empresa y sucursales permitidas en el servidor. Un administrador puede tener alcance de una sucursal o varias; nunca se concede alcance cambiando localStorage.

## Continuidad y sincronización

Si cada sucursal debe operar sin Internet, cada una necesita servidor/instancia local y datos suficientes para sus operaciones. El servidor de sucursal conserva la autoridad sobre su caja y existencias; un servicio central consolida, sin bloquear la venta local cuando se corta Internet.

Usar UUID de documento/solicitud, secuencias comerciales por sucursal y eventos persistentes (outbox/inbox) en la misma transacción del negocio. Reintentos idempotentes, acuse, versión y auditoría. No resolver saldos ni inventario con "último cambio gana". Transferir mercadería exige documentos de salida/recepción y reglas de tránsito, cancelación y recepción parcial.

Pedidos remotos y autorizaciones requieren estado PENDIENTE/AUTORIZADA/RECHAZADA/EJECUTADA y dueño claro del documento. Sin conectividad no se inventa una autorización remota; un administrador local puede autorizar con su cuenta si la política lo permite. La fase actual de devoluciones es servidor único: no incluye outbox/inbox ni autorización por puente remoto.

## Celular y costos

El cliente confirmó que necesita una app instalada que reciba avisos con la app cerrada, independiente de la sesión del navegador. Propuesta: React Native/Expo y un canal push, conservando la base operativa local. Un servicio pequeño puede manejar eventos sin convertir toda la base operativa en una base de pago externa. Confirmar Android/iOS, distribución, proveedor y presupuesto. Alcance en `APP_MOVIL_Y_NOTIFICACIONES.md`.

Nunca publicar PostgreSQL al Internet. La app deberá reutilizar aislamiento y autorizaciones del backend con una sesión segura propia del dispositivo. VPN o puente autenticado limitado habilitará consultas/decisiones fuera del local. La web móvil sigue sirviendo para acceso en LAN, pero no completa el requisito de app instalada/push. Probar app cerrada, logout/revocación y pérdida de Internet en teléfonos reales.

## Decisiones que faltan

Fecha de apertura de la segunda sucursal; catálogos/precios/clientes compartidos; usuario por sucursal; crédito y cobro entre sucursales; responsable de transferencias; continuidad esperada; tiempo de sincronización aceptable; requerimientos fiscales; dispositivo móvil y presupuesto del puente remoto. Implementar estos cambios sin esas reglas puede mover saldos o existencias al ámbito incorrecto.


### H18 — UX_UI_AUDIT_2026-10-05.md

# FerreSystem: auditoría y mejoras de experiencia

## Cierre posterior al PR #63 — 2026-10-06

Esta sección sustituye los pendientes históricos de validación que aparecen más abajo; no elimina su registro. Base comprobada: `0331cb5937d7aeea5c2d50ca53d7762c096693cd` (merge de #63 y main remoto al iniciar). Rama de continuación: `feat/close-pending-delivery`. Se conserva el parche local anterior; no se aplicaron stashes ni se reinició el trabajo. El espacio ajeno en `backend/nest-cli.json` queda fuera del cierre.

El HEAD de #63, `0b7d8af7ea4c29afaabe38ec883e2ee1e1a27cab`, aprobó **55/55 pruebas PostgreSQL** en [CI 37494401707](https://github.com/Nelosama/FerreSystem/actions/runs/37494401707). Los cuatro fixtures de crédito ya estaban corregidos allí. La falta histórica de PostgreSQL en otro entorno no es un fallo actual de esos fixtures.

| Hallazgo / pendiente | Estado del cierre | Evidencia |
| --- | --- | --- |
| Entregas/Devoluciones visibles sin POS | Corregido | Ambas entradas declaran `moduleKey: 'pos'`; menús, prioridades y buscador comparten el filtro. |
| URL con mayúsculas o barra final omite comparación literal | Corregido | `ProtectedRoute` usa `matchPath` con las mismas reglas de React Router. |
| TOPNAV/SIDEBAR, móvil, roles y funciones base | Comprobación automatizada | 16 casos nuevos de navegador cubren POS activo/inactivo y cuatro roles; unitarias incluyen SUPERADMIN. Caja/cuentas conservan disponibilidad. |
| Persistencia de configuración y autorización sin mocks | Cobertura implementada | `settings-http-checks.ts`: login real, PUT ADMIN, PATCH Super Admin, lectura SQL/HTTP, nueva autenticación, dos tenants, Cajero rechazado, payload con tenant ajeno y limpieza de opcionales/configuración vacía. |
| Navegador con backend real | Cobertura implementada | `real-settings-browser.mjs`: Chrome/Chromium, Vite de desarrollo con proxy hacia API compilada, guardar/recargar/nuevo contexto y login. Sin interceptar peticiones ni precargar autenticación. CI activa `REAL_SETTINGS_BROWSER=1`. |
| PostgreSQL de pruebas se bloquea con pipes en Windows | Corregido en fixtures | `pg_ctl` escribe su log a archivo y no conserva pipes de captura; binarios Windows con ventana oculta. No cambia esquema ni migraciones. |
| ADMIN administra otros ADMIN del tenant | Decisión de negocio pendiente | Se conserva la política heredada; no se amplían ni reducen permisos en este cierre. |
| Funciones aún no integradas | Fuera del cierre | Multisucursal, apartados, transferencias, garantías, pedidos especiales y listas de precios requieren su propio alcance y aceptación. No se presentan como funcionalidad entregada. |

Validación local de esta continuación (Windows, 2026-10-06), código publicado `efd8c169dfb68ac5002dd041068c4b10213aeaa6` en [PR #64](https://github.com/Nelosama/FerreSystem/pull/64):

| Comando / ejecución | Resultado | Evidencia y límites |
| --- | --- | --- |
| `npm test --prefix frontend` | 78/78 | Unitarias/componentes; no prueba persistencia real. |
| `npm test --prefix backend` | 182 aprobadas, 3 omitidas | Omisiones por Windows en programador de respaldos. |
| `npm run test:scripts --prefix backend` | 7 omitidas | Requieren POSIX; no se consideran aprobadas localmente. |
| `npm run build --prefix frontend` con `VITE_API_URL=/api`; build backend | Ambos salida 0 | Advertencia de tamaño del bundle. |
| Lint frontend y backend | Ambos salida 0, sin errores | Advertencias existentes de hooks/TypeScript. |
| `npm run test:browser -- --workers=2` desde frontend | 54/54, 58.5 s | Chrome, API simulada. Incluye 16 regresiones POS. |
| `npm run test:integration` desde backend | 55/55, 2 suites, 191.31 s | PostgreSQL 18 temporal; inicio 19:37:54 America/Tegucigalpa. `PG_BIN=C:/Program Files/PostgreSQL/18/bin`, `REAL_SETTINGS_BROWSER=1`, `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=C:/Program Files/Google/Chrome/Application/chrome.exe`. Incluye login/API reales y navegador real sin mocks de endpoints. |
| `git diff --check` | Salida 0 | Formato. |

El total PostgreSQL permanece en 55 porque se amplió el escenario HTTP existente, sin contar cada aserción como un test nuevo. El navegador real usa Vite de desarrollo y API compilada; no equivale a aceptación del despliegue de producción. Los logs locales de esta ejecución se guardaron en `%TEMP%/ferre-close-*.log`, fuera del repositorio. CI Linux se inició en [ejecución 37558322184](https://github.com/Nelosama/FerreSystem/actions/runs/37558322184) sobre el SHA de código; su resultado y el del HEAD documental final se registran en el PR una vez concluidos. No se declaran aprobados por haberse iniciado.

No se añade una migración. La funcionalidad requiere la existente `20261006000100_tenant_configuration`, que añade JSONB con default `{}`. Orden de despliegue: respaldo y restauración ensayada; revisión de baseline; migraciones requeridas antes de arrancar el backend nuevo; cliente Prisma/backend compatibles; frontend después de la API; aceptación funcional por rol. Conservar la columna aditiva al revertir aplicación. El lock y la duración con volúmenes representativos requieren ensayo operativo; no se aplicaron migraciones a bases existentes.

Pendientes de entrega: confirmar versiones efectivamente desplegadas (un merge no prueba despliegue), aceptación del cliente de ventas/comprobantes/crédito/abonos/devoluciones/entregas/caja y definición de módulos comprometidos. No se hizo merge ni despliegue manual durante este cierre.

El trabajo comenzó sobre `main`, con el estado inicial de Git limpio. Los cambios se conservaron íntegros al crear `feat/ux-ui-restructure` para su revisión y publicación. No se encontraron archivos AGENTS.md en el repositorio ni en sus directorios ascendentes. No se hizo merge, despliegue ni migración contra una base de datos de una empresa.

La revisión del diff no identificó cambios ajenos a esta tarea. `ux-update.cjs` y `ux-navigation.cjs` fueron herramientas temporales de edición y ya no existen; no forman parte del commit. Los logs locales de lint también quedan fuera del commit; se incluyen las capturas de validación.

## Hallazgos verificados y decisiones

| Hallazgo previo | Evidencia en el estado inicial | Cambio |
| --- | --- | --- |
| Sidebar plano frente a TopNavigation agrupado | Sidebar recorría NAVIGATION_ITEMS directamente; TopNavigation agrupaba por categoría. | Categorías y orden comunes; lateral y móvil muestran secciones; superior conserva desplegables. |
| Hasta 12 tarjetas y buscador permanente | TaskShortcuts tenía doce prioridades ADMIN; AppLayout siempre renderizaba el formulario del buscador. | Hasta cuatro tareas frecuentes por rol; buscador desplegable fuera del inicio. |
| Guardado incompleto en Configuración | PUT enviaba seis campos; updateTenantConfig incorporaba navegación, rubro, estilos, fuentes, moneda e impuesto sin persistencia. | PUT guarda modoNavegacion y configuración validada en SQL; el contexto adopta la respuesta del servidor. |
| Marca del Super Admin guardada en memoria | El submit solo ejecutaba setTenants y setMensajeExito. | PATCH real; conservar formulario y mostrar error ante fallo. |
| Catálogo local sobrescribe servidor | El efecto buscaba por id **o nombre** en ferre_saas_tenants y aplicaba color, navegación y módulos al montar o cambiar color/nombre. | Retirado ese origen de configuración; GET por sesión autorizada al iniciar y recuperar foco. Regresiones para catálogo antiguo, otra empresa y respuesta anterior a un guardado. |
| Clientes y Caja configurables solo en catálogo | No exigían módulo en rutas ni en sus API actuales. | Funciones base, junto con Configuración. Se conservan los roles existentes; no pueden deshabilitarse por catálogo. |
| Módulos pendientes ofrecidos como operativos | Solo availableTasks los excluía. Las cinco páginas antiguas usaban ferre_mock_* y App dirigía a ModuloPendiente. | Estado pendiente centralizado; no aparece en menús ni tareas; URL autorizada conserva aviso de pendiente. No se reactivaron páginas antiguas. |
| Textos de tareas/categorías sin traducciones | TASK_DETAILS y CATEGORY_CONFIG tenían textos españoles literales. | Traducciones ES/EN de tareas, nuevas categorías, buscador y nuevas etiquetas de configuración. |

También se corrigieron tres defectos encontrados durante la implementación:

- ProtectedRoute aceptaba permisos ausentes en algunos casos; ahora los rechaza igual que los menús y consulta la entrada canónica para acceso por URL.
- Template V2 claro mostraba botones de idioma/navegación y parte de la vista previa con texto blanco sobre blanco. Se corrigió el contraste y se revisó en capturas.
- Super Admin simulaba alta, edición, activación y cambio de contraseña de administradores. Ahora usa endpoints de plataforma con guards, ámbito de empresa, hashing de contraseña y conservación del último administrador activo. Los usuarios de otros roles siguen disponibles para soporte, pero no se presentan como administradores.

La creación/eliminación de sucursales también era local y no tiene modelo ni contrato de API. El acceso está marcado como pendiente y deshabilitado; se eliminaron confirmaciones ficticias y la dirección inventada del registro de demostración. La selección de sucursal existente y su ámbito no se modificaron.

## Responsabilidades

| Configuración o tarea | Responsable | Persistencia y alcance |
| --- | --- | --- |
| Empresas, estado de suscripción, plan y módulos opcionales | Super Admin | API de plataforma, por empresa. |
| Administradores de cada empresa | Super Admin y ADMIN del mismo tenant | Plataforma usa su API de administradores. La API heredada de Usuarios también permite al ADMIN crear/editar otros ADMIN de su empresa y protege al último activo; no permite trasladarlos entre tenants. |
| Soporte | Super Admin | Flujo existente de token de soporte; se conservan modo lectura y activación de edición. |
| Nombre, logo, color y navegación inicial de una empresa | Super Admin y Administrador | Mismos datos de empresa en servidor. El guardado más reciente se sincroniza al cargar o recuperar foco. |
| Rubro, apariencia y fuentes | Administrador | Configuración de empresa guardada en SQL. La configuración general fiscal queda restringida a HNL (L.) e ISV 15%; las tasas transaccionales de cotizaciones se conservan. |
| Personal del negocio y permisos de cajeros/vendedores/bodega | Administrador | Flujo existente de Usuarios; no se ampliaron permisos operativos. |
| Ventas, caja, cobros, entregas, compras y conteo | Roles ya autorizados | Reglas e integraciones operativas existentes. Los accesos contextuales respetan el catálogo de navegación. |
| Idioma ES/EN | Usuario | Preferencia local del navegador; no forma parte del guardado de empresa. |
| Sucursal seleccionada | Usuario autorizado por el flujo actual | Conserva la selección existente; una etiqueta no crea una nueva empresa ni modifica el ámbito autorizado. |

TOPNAV/SIDEBAR sigue siendo una elección de **empresa**, como en el contrato actual de Super Admin. Ambos presentan la misma organización y reglas. No se añadió una preferencia personal de navegación que pudiera contradecir la configuración de empresa. El cambio se prepara en el formulario y se aplica al guardar.

El catálogo local ferre_saas_tenants ya no decide marca, módulos ni navegación. ferre_tenant sigue siendo una caché de sesión; el servidor la actualiza. Una lectura iniciada antes de un guardado o de otro login no debe revertir los datos actuales. Los borradores de Configuración no se borran por una actualización al recuperar foco.

## Organización

- Plataforma: administrar empresas y soporte, sin acceso directo a Configuración del negocio desde la sesión independiente de Super Admin.
- Ventas y caja: inicio, venta, cotizaciones, devoluciones, entregas y caja, respetando módulos y roles.
- Inventario y compras: productos, conteo y recepción/compras; se conserva la asignación existente de otras entradas.
- Clientes y cobros: clientes y cuentas.
- Personal: usuarios y comisiones habilitadas.
- Resultados: reportes y auditoría.
- Configuración del negocio: identidad, contacto, moneda/impuesto, apariencia, navegación y tipografía secundaria.

Prioridades: ADMIN compras/inventario/personal/reportes; CAJERO caja/venta/cobros/clientes; VENDEDOR venta/cotizaciones/clientes/caja; BODEGUERO entregas/inventario/compras/conteo. Se omiten tareas cuyo módulo no está habilitado. No se concedió acceso a inventario al cajero o vendedor: los productos y precios se buscan en su pantalla de venta.

El buscador encuentra **pantallas y tareas**; su ayuda indica que productos y clientes se buscan dentro de sus respectivas pantallas. Búsqueda por acentos y palabras, títulos ES/EN, estado sin resultados y limpieza conservan accesibilidad.

## Persistencia y preparación de entrega

Migración nueva: `backend/prisma/migrations/20261006000100_tenant_configuration/migration.sql`. Añade `tenants.configuracion JSONB NOT NULL DEFAULT '{}'`; navegación permanece en su columna actual. El cliente Prisma local se regeneró para compilar. La migración debe aplicarse mediante el flujo de migración existente **antes** de usar el backend actualizado en un entorno compartido. No se ejecutó contra una base de datos existente en esta tarea.

GET `/tenant/settings` permite a los roles de tenant leer la apariencia compartida; PUT sigue limitado a ADMIN. No se abrió ningún permiso de operación. En suscripciones heredadas, la ausencia de un registro de módulo conserva el comportamiento del backend: permitido por defecto; un registro deshabilitado controla módulos opcionales. Los módulos base permanecen disponibles para sus roles.

La revisión del 6 de octubre confirmó que permitir editar moneda/tasa y utilizarlas al generar el PDF podía relabelar importes guardados. Ahora los campos generales son de solo lectura y la API rechaza valores distintos de HNL (L.) e ISV 15%. Los comprobantes usan los importes e ISV transaccionales; las cotizaciones suministran su tasa histórica, incluidas tasas cero y líneas exentas. Las ventas sin tasa histórica no muestran un porcentaje supuesto. No se agregó conversión ni se cambió ninguna fórmula de venta.

## Validación declarada en el informe inicial

Estos resultados son históricos; la evidencia reproducida para el código corregido está en la revisión del 6 de octubre al final de este documento.

Resultados finales: **64 pruebas de frontend**, **60 pruebas pertinentes de backend** (10 archivos en tres ejecuciones) y **35 pruebas de navegador** aprobadas. Compilaciones y lint de frontend y backend con código de salida 0; permanecen advertencias. `git diff --check` sin defectos de formato. La evidencia se divide así:

- Pruebas de frontend: permisos, roles y módulos; tareas limitadas; búsqueda ES/EN; catálogo local antiguo; respuestas tardías; ventas/devoluciones y recuperación existentes.
- Pruebas de backend: persistencia en servicio, tasa cero, configuración inválida, ámbito de empresa, hashing de contraseña, último administrador, guards y disponibilidad de módulos heredados.
- Prueba SQL: migración aplicada a PGlite temporal con dos empresas; lectura posterior demuestra independencia y conservación del registro previo.
- Navegador: bundle local con API interceptada para ambos modos, cinco roles, ES/EN, móvil, URL denegada, guardado, recarga, nuevo login y errores. **Estas pruebas no son una sesión contra la API de una empresa real.**
- Revisión visual: capturas del formulario de Configuración en escritorio y móvil, con datos de prueba y sin contacto con producción.

Capturas locales: `frontend/artifacts/ux-settings-desktop.png` y `frontend/artifacts/ux-settings-mobile.png`.

Comandos de verificación:

```powershell
npm test --prefix frontend
npm run build --prefix backend
# Frontend: VITE_API_URL=/api, exclusivamente para el bundle local de pruebas.
npm run build --prefix frontend
npm run lint --prefix frontend
# Backend: src/tenants, super-admin.service, auth.service, tenant-modules,
# tenant-module.guard, auth-kind-guards, roles-access.http y tenant-admin.http.
npm test --prefix backend -- src/tenants src/super-admin/super-admin.service.spec.ts src/auth/auth.service.spec.ts src/common/tenant-modules.spec.ts src/common/guards/tenant-module.guard.spec.ts src/common/guards/auth-kind-guards.spec.ts
npm test --prefix backend -- src/common/roles-access.http.spec.ts
npm test --prefix backend -- src/super-admin/tenant-admin.http.spec.ts
# Chrome instalado mediante PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.
npm run test:browser --prefix frontend -- --workers=2
git diff --check
```

El navegador verifica también cierre por Escape y retorno del foco del menú móvil, los tres modos de Template V2 y vuelta a variantes clásicas, persistencia de marca de Super Admin con API interceptada y fallo sin éxito ficticio. El permiso HTTP para GET de apariencia compartida y la prohibición de PUT del cajero están comprobados; la API de administradores rechaza los cuatro roles de tenant y descarta cambios de rol/empresa enviados en el body.

## Pendientes y límites

1. Aplicar la migración y ejecutar una aceptación con backend/base reales de pruebas, especialmente login, soporte y administración de usuarios. No se usaron credenciales de empresas.
2. Integrar un modelo real de sucursales y su autorización antes de habilitar administración multisucursal.
3. Apartados, transferencias, garantías, pedidos especiales y listas de precio siguen pendientes de implementación operativa real.
4. Traducir textos heredados en pantallas operativas ajenas a esta corrección. Configuración, Super Admin, el encabezado compartido y la explicación de funciones pendientes se completaron en ES/EN en la revisión del 6 de octubre. Los identificadores técnicos, nombres introducidos por usuarios y registros históricos mantienen sus valores.
5. El historial local de soporte/auditoría de plataforma existente requiere un contrato durable independiente; el token de soporte sí usa la API actual.
6. El build mantiene un aviso de tamaño de bundle en ClientePicker/PDF; el lint mantiene advertencias de hooks y código heredado. No se alteraron cálculos ni código operativo para resolverlas.


## Revisión y corrección del 6 de octubre de 2026

Se leyeron completos este informe y `docs/AUDITORIA_RAMA_20261005.md` antes de editar, y se comprobaron los problemas en su implementación. Rama: `feat/ux-ui-restructure`. Punto de partida: `bba7a4647730e289e952af487313faf1f95f0bb9`. **HEAD de código y capturas publicado: `b533dbd86a9a0cc67a29e46900b927f0dcab7770`**. El siguiente commit actualiza únicamente este informe; su padre identifica exactamente el código de esta evidencia (`git rev-parse HEAD^` tras ese commit). No hubo merge ni despliegue.

### Tabla de hallazgos

| Hallazgo | Estado | Verificación previa y evidencia final |
| --- | --- | --- |
| Moneda/tasa visual relabelaba comprobantes | Corregido | `ReciboPDF` leía `tenant.moneda` y `tenant.impuesto`. Ahora usa HNL y los importes/ISV guardados. La tasa opcional procede únicamente del documento de cotización, nunca de apariencia. `receipt-fiscal.test.mjs`: venta anterior, impuesto mixto y tasa transaccional cero/15. |
| Opciones fiscales sin soporte monetario real | Corregido | Ventas calcula ISV 15% y no tiene moneda histórica/conversión. Formulario de solo lectura, ayuda ES/EN vinculada mediante `aria-describedby`; validador de servidor rechaza USD y tasas generales distintas de 15%. Lectura normaliza configuraciones fiscales heredadas sin escribir ni recalcular ventas. |
| Comprobantes anteriores | Comprobado | Venta sintética de enero de 2026: 100 + 15 = 115 permanece en L. aunque la configuración visual antigua diga USD/VAT 18%. También se generaron y extrajeron tres PDFs con el renderizador real, sin API ni base de empresa. |
| `configuracion: {}` heredaba datos del navegador | Corregido | La lectura hacía `{ ...previous, ...data }`. Ahora reconstruye identidad/contacto, módulos, navegación y apariencia desde la respuesta y defaults explícitos. Únicamente conserva selección local de sucursal; idioma permanece fuera del tenant. Regresiones de helper, proveedor React y navegador. |
| Lecturas concurrentes/tardías podían revertir datos | Corregido | La revisión local solo cambiaba al guardar; dos GET podían aceptarse al revés. Ahora hay secuencia por lectura, invalidación por guardado/login/logout/soporte/sucursal, identidad de usuario/tenant/token, limpieza del efecto y comparación de `updatedAt` del servidor. Una versión ausente no reemplaza una versión conocida. Regresiones de lecturas invertidas, réplica atrasada, guardado y cambio de sesión. |
| Endpoints operativos sin módulo | Corregido | Se verificaron los controllers de Operaciones, Compras, Proveedores y conversión de Cotizaciones. Añadidos guards de módulos, sin retirar guards de rol, permisos, soporte o tenant. `operation-modules.http.spec.ts`: 31 casos HTTP con servicios/base simulados. |
| Dependencias de varios módulos | Comprobado | Recepción y compra que modifica stock exigen Compras **e** Inventario; conversión exige Cotizaciones **y** POS. Consulta compartida de proveedores permite Compras **o** POS, pues POS la usa en ventas sin inventario. Matriz y justificación debajo. |
| Expectativa de `super-admin.service.spec.ts` | Corregido | `listTenants` selecciona intencionalmente `rol` para distinguir ADMIN de personal. Se añadió `rol` a la expectativa y se mantuvo la aserción de que `passwordHash` no está en el select. Suite completa de backend aprobada. |
| Preparación incompleta de ventas PostgreSQL | Corregido | El fixture llegaba hasta devoluciones, pero el cliente actual también requiere costo vigente/compras, crédito de clientes y configuración. Se agregaron las tres migraciones faltantes en orden. Su ejecución PostgreSQL continúa pendiente por entorno, no se declara aprobada. |
| Compatibilidad y despliegue de `tenant_configuration` | Comprobado | Migración aditiva, último paso del orden lexicográfico actual. Dos pruebas PGlite efímeras validan preservación de filas sintéticas, default `{}`, independencia y cadena completa desde cero. Proyección antigua de tenant sigue leyendo después de agregar la columna. No se modificó ni ejecutó la migración en bases existentes. |
| Exclusividad de Super Admin sobre ADMIN de tenant | Comprobado | El informe no coincidía con `UsuariosService.create/update`, sus DTO de rol y controllers: un ADMIN activo puede crear/editar ADMIN del mismo tenant; se conserva el último ADMIN activo y el ámbito. Se corrigieron tabla de responsabilidades y ayuda de plataforma. No cambió esta política. |
| Reservar creación/edición de ADMIN solo a plataforma | Pendiente | Requiere decisión explícita de producto/permisos y revisión de usuarios existentes. Esta corrección no la implementa ni la presenta como contrato actual. |
| Escape del buscador perdía el foco | Corregido | Se ocultaba el panel sin volver al disparador. Ahora devuelve el foco al botón en modo compacto; en inicio conserva el foco del input. Verificado en Chromium ES/EN. |
| Traducciones de pantallas modificadas | Corregido | Configuración, formulario fiscal, apariencia y navegación, paletas/rubros, Super Admin y sus modales/mensajes, catálogos, encabezado/soporte y funciones pendientes disponen de ES/EN. Pruebas de navegación incluyen cinco roles, ambos idiomas y ambos modos. Datos de usuario y registros anteriores no se traducen ni reescriben. |
| Funciones pendientes poco explicadas | Corregido | Explicación visible mediante `details/summary` accesible en inicio; URL de módulo pendiente tiene ayuda ES/EN y el enlace POS solo aparece si el rol/módulo permite usarlo. No se agregaron enlaces de módulos inoperantes al menú. |
| Formulario de sucursales inalcanzable | Corregido | Único disparador estaba deshabilitado; no existe modelo Prisma ni contrato API vigente. Retirados modal, handlers y estados; se mantiene explicación accesible de la limitación. La selección de sucursal existente se conserva. |
| Conservación de UX y TOPNAV/SIDEBAR | Comprobado | Sigue siendo configuración de empresa, preparada en formulario y aplicada al guardar. Chromium verifica ambos modos, móvil, permisos y variantes V1/V2. No se hizo otro rediseño. Capturas actualizadas en `frontend/artifacts/ux-settings-desktop.png` y `ux-settings-mobile.png`. |
| Integración real PostgreSQL/Prisma | Pendiente | Dos suites fallaron en `beforeAll`: no existe `initdb`; 55 casos no se ejecutaron. La instalación de paquetes fue rechazada por permisos del entorno. No se tocó producción ni una base compartida. |

### Dependencias de operaciones

`RequiredModule(a, b)` exige todos; `RequiredAnyModule(a, b)` permite cualquiera. El guard continúa autenticando antes de consultar módulos, usa exclusivamente el tenant del JWT y conserva la disponibilidad heredada para registros ausentes. Un registro opcional explícitamente deshabilitado es autoritativo.

| Operación/ruta | Módulos | Motivo |
| --- | --- | --- |
| GET `/operaciones/proveedores` | `ordenes_compra` o `pos` | Lookup compartido por compras y venta sin inventario; no obliga a contratar Compras para vender. |
| POST `/operaciones/proveedores`; API `/proveedores` | `ordenes_compra` | Administración de proveedores de compras. Roles existentes se conservan. |
| GET/POST `/operaciones/compras`; lecturas, pagos e historial de `/compras` | `ordenes_compra` | Pedido/factura y seguimiento de compras; el pedido operativo no modifica stock hasta recepción. |
| POST `/operaciones/compras/:id/recepciones`; POST `/compras` | `ordenes_compra` e `inventario` | La recepción y la compra directa cambian existencias/costo. |
| Historial y ajustes de `/operaciones/productos/:id` | `inventario` | Movimiento y ajuste de existencias, conservando permiso de lectura/edición. |
| Entregas, búsqueda de venta, devoluciones y sus solicitudes/decisiones/ejecuciones | `pos` | Ciclo posterior a una venta. No se exige Inventario para entregar/devolver una venta sin inventario. |
| GET `/operaciones/resumen` | `reportes` | Consulta de resultados gerenciales; conserva `reportes.ver` y rol ADMIN. |
| POST `/cotizaciones/:id/convertir` | `cotizaciones` y `pos` | Consume la cotización y crea una venta; conserva permiso de conversión y roles. |
| Caja, cuentas/abonos y auditoría de operaciones | Sin módulo opcional adicional | Caja y atención de obligaciones existentes son funciones base. La auditoría conserva trazabilidad para ADMIN y no posee una clave propia en catálogo; no se le asigna arbitrariamente Reportes. |
| Dashboard | Sin módulo opcional adicional | Inicio/resumen existente por rol; no se convierte el inicio en una función dependiente de Reportes. |

### Orden de despliegue y compatibilidad

Revisión documental, **sin ejecución de despliegue**: preparar respaldo y ensayo de restauración; comprobar/adoptar baseline mediante el procedimiento existente cuando corresponda; aplicar migraciones en el orden actual hasta `20261006000100_tenant_configuration`; generar cliente Prisma y arrancar backend actualizado; publicar frontend después de que la API nueva esté disponible. El backend nuevo consulta `configuracion`, por lo que no es compatible con una base que aún carezca de esa columna. La migración añade JSONB `NOT NULL DEFAULT '{}'`, conserva navegación en su columna y no elimina ni transforma importes.

El backend anterior puede seguir usando sus columnas después de la ampliación. Una reversión de aplicación debe conservar la columna aditiva y los datos; no se propone ejecutar `DROP COLUMN`. El default constante puede evitar reescritura de tabla en PostgreSQL moderno, pero el `ALTER TABLE` sigue requiriendo lock: duración, concurrencia y recuperación deben comprobarse en PostgreSQL aislado antes de una actualización real. No se aplicó `migrate deploy`, `db push`, seed ni adopción contra producción o bases existentes.

### Validación reproducida

| Comando desde raíz, salvo indicación | Resultado exacto | Tipo de evidencia |
| --- | --- | --- |
| `npm ci --prefix frontend`; `npm ci --prefix backend` | Salida 0 en ambos | Dependencias del lockfile; sin cambios a locks. |
| `npm exec --prefix backend -- prisma generate --schema backend/prisma/schema.prisma` | Salida 0, cliente Prisma 6.4.1 | Generación local, no migración. |
| `npm test --prefix frontend` | **73/73**, 0 fallos, salida 0 | Hooks/transporte controlados, lógica de sesión, permisos, navegación y regresiones fiscales. Las aserciones de PDF de esta suite simulan componentes del renderer. |
| `npm test --prefix backend` | **185/185 en 24 archivos**, salida 0 | **183 casos con servicios/Prisma simulados y 2 casos SQL PGlite efímeros**. No equivale a backend conectado a PostgreSQL real. |
| `npm run test:scripts --prefix backend` | **7/7**, salida 0 | Fixtures temporales de scripts. |
| `npm run build --prefix backend` | Salida 0 | Build con cliente actual. |
| `VITE_API_URL=/api npm run build --prefix frontend` | Salida 0; aviso de chunk >500 kB | Bundle exclusivamente local para navegador, no despliegue. |
| `npm run lint --prefix frontend` | Salida 0, sin errores; advertencias de hooks/código existente | Lint. |
| `npm run lint --prefix backend` | Salida 0, sin errores; advertencias de código/opciones de TypeScript | Lint. |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:browser --prefix frontend -- --workers=2` | **38/38**, salida 0 | Chromium con API interceptada. Incluye cinco roles, ES/EN, móvil y TOPNAV/SIDEBAR. |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:browser --prefix frontend -- --workers=2 --grep 'settings:|buscador Escape|configuración vacía|V2 preserves'` | **5/5**, salida 0 | Reejecución sobre el bundle final tras ajustar la etiqueta fiscal y consumir la tasa transaccional del PDF. Los casos ya están incluidos en los 38; no se suman como pruebas nuevas. Capturas finales revisadas visualmente. |
| `git diff --check` | Salida 0 | Formato del diff. |
| `npm run test:integration --prefix backend` | Salida **1** del runner; **2 suites fallidas, 55 casos no ejecutados** | PostgreSQL real pendiente: `PostgreSQL no instalado en /usr/bin` y `Falta PostgreSQL para estas pruebas`. El wrapper inicial imprimió el tail con salida 0; esa salida no representa aprobación del runner. |
| `apt-get update` | Salida **100**, `Permission denied` en `/etc/apt/apt.conf.d/80-applied-apt-retries` y `/var/lib/apt/lists/partial` | Preparación de PostgreSQL bloqueada por permisos del entorno. No se intentó eludir el rechazo ni usar otra base. |

La primera compilación frontend sin `VITE_API_URL` terminó en salida 1 por la validación prevista de configuración de producción; se ejecutó correctamente con `/api`. La primera ejecución de navegador produjo 37 aprobados/1 fallo porque la expectativa conservaba «guardadas» tras cambiar el mensaje a «guardada»; se corrigió la expectativa y luego pasaron los 38 casos. El primer run frontend detectó que el harness no cargaba el nuevo helper real de sincronización; se actualizó el loader y se añadieron las regresiones, sin sustituir el helper por un mock.

Ensayo adicional de PDF: desde `frontend`, `node --input-type=module` transpila el componente actual con TypeScript, lo carga, llama al renderer real `pdf(React.createElement(ReciboPDF, props)).toBlob()` y escribe únicamente PDFs sintéticos en `/tmp/audit-*.pdf`; `pdftotext <archivo> -` extrae el texto. **Tres de tres verificaciones aprobadas**: venta anterior (`subtotal=100, isv=15, total=115`); cotización tasa cero (`porcentajeIsv=0, isv=0, total=100`); cotización con línea exenta y gravada (`porcentajeIsv=15, isv=7.5, total=107.5`). En las tres, el tenant visual de prueba contiene USD/$ y VAT 18%; se confirma salida en L., ISV transaccional y ausencia de USD/$/VAT/18%. Este ensayo usa renderizador y extractor reales con props sintéticas: **no constituye integración con API/base real**.

Quedan pendientes únicamente la integración PostgreSQL/Prisma en un entorno aislado con los binarios autorizados, la aceptación de despliegue/migración en ese entorno y cualquier decisión de cambiar la política heredada de ADMIN. Los módulos operativos pendientes y la administración multisucursal requieren implementación separada, como ya indicaba el alcance inicial.


### Publicación de la rama

La validación se ejecutó sobre el commit local `7300cabdc6c995d7a8a71dfbdbe2143caa5cd232`. El intento `git push origin feat/ux-ui-restructure` terminó con salida 1: `could not read Username for https://github.com: No such device or address`. El entorno no tiene credenciales Git HTTPS de escritura. Se utilizó la conexión GitHub autorizada para crear blobs, árbol y commits, y actualizar la misma rama mediante avance directo con comprobación de HEAD esperado; no se usó force, merge ni despliegue.

El commit de código publicado tiene exactamente el árbol Git `3bd39259f59b24672dd951fcae2100ef97176a78`, idéntico al commit local validado, incluidos tests y capturas. El commit final solo agrega este informe actualizado, cuyo padre es el SHA de código publicado indicado arriba. Las diferencias de SHA de commit corresponden a metadatos de autor/fecha de la API de GitHub; el contenido validado no cambió.


### H19 — VALIDACION_INTEGRACION_Y_SESIONES.md

# Ensayo de integración y actualización de permisos

Trabajo en `codex/recuperacion-ventas`, PR #59. Fecha: 5 de octubre de 2026.

## Alcance comprobado

La validación utiliza PostgreSQL temporal, bases independientes y datos sintéticos. El entorno no tiene credenciales, conexión ni respaldo suministrado de la base real de la ferretería. No se modificó producción y **todavía no está validada la actualización sobre una copia real**.

Se añadió un ensayo que instala toda la cadena de migraciones, crea cajero/administrador/producto, abre caja, registra una venta, entrega productos, solicita/autoriza/ejecuta una devolución parcial y realiza respaldo con `backup-preflight.mjs`. Restaura mediante `restore-verify.mjs` a otra base vacía y comprueba:

- Venta original conservada y solicitud ejecutada con su administrador.
- Documento e importe de reembolso iguales a los originales.
- Existencias finales, efectivo esperado, movimientos de caja y auditoría conservados.
- Inspección/despliegue de la copia restaurada sin nuevas migraciones pendientes.
- Repetir la ejecución después de restaurar no duplica devolución, movimientos ni auditoría.

Se mantienen los ensayos de adopción/actualización histórica y recuperación tras parada abrupta de PostgreSQL. Una parada de proceso no prueba daño físico de disco ni comportamiento de los equipos ante un corte de energía.

## Sesiones y cambios de rol

El servidor ya consulta el usuario activo y sus permisos en cada petición. La interfaz ahora consulta `/auth/me` al iniciar una sesión, al recuperar foco/visibilidad y cada 30 segundos mientras la ventana es visible. Actualiza rol, permisos y límite de descuento en el contexto y almacenamiento del usuario; los menús y rutas protegidas usan esos valores.

No promete cambio instantáneo de todos los menús: el servidor deniega inmediatamente las operaciones sin permiso y la pantalla se actualiza en la siguiente consulta. Sin conexión se conserva la sesión; no se inventan permisos. Respuestas de otra identidad, empresa, token o de un efecto cancelado se descartan. La sesión Superadmin usa su flujo separado y no consulta el perfil del tenant.

Pruebas nuevas: actualización de rol/descuento, respuesta antigua tras otro login, consultas simultáneas, desconexión/reintento, limpieza del efecto e identidad de otra empresa.

## Ensayo pendiente con datos reales

Usar el procedimiento de `INSTALACION_Y_ACTUALIZACION_SEGURA.md`. Requisitos que aún no están disponibles: respaldo reciente de la ferretería, destino aislado vacío para restaurarlo y, si requiere adopción histórica, otra base vacía de referencia. Configurar conexiones mediante secretos del entorno o servicios PostgreSQL; no enviar contraseñas al repositorio.

1. Identificar origen, fecha del respaldo y versión operativa; suspender cambios durante la captura.
2. Verificar checksum y restaurar en el destino aislado. Nunca usar producción como destino.
3. Inspeccionar historial, tablas, numeración de clientes y diagnóstico de caja/stock/cuentas. Resolver discrepancias antes de actualizar.
4. Adoptar solo la etapa histórica comprobada, si corresponde, y desplegar las migraciones pendientes en esa copia.
5. Con cajero y administradores, probar venta, entrega, abono, devolución parcial/total, apertura/cierre y cambio de rol con sesión abierta. Conciliar importes y existencias contra la situación inicial.
6. Ensayar reinicio, recuperación de pendientes y restauración usando los equipos previstos. Validar impresión y respaldo externo.
7. Registrar resultados e incidencias antes de planificar la puesta en producción.

## Próxima prioridad

Con el ensayo real todavía pendiente de acceso, se puede preparar la instalación local: PC del administrador como servidor inicial si tiene capacidad, PostgreSQL local, red de caja/admin independiente de Internet, arranque automático, UPS y respaldos externos programados. Esto requiere verificar sistema operativo, equipos y router de la ferretería antes de definir la instalación definitiva.

## Resultado técnico de esta etapa

Build frontend/backend aprobados. 40 pruebas frontend, 52 backend y 51 PostgreSQL aislado aprobadas (143 en total). El caso nuevo de respaldo/restauración se ejecutó junto con toda la suite de integración. No se realizó prueba visual en navegador ni aceptación del cliente; las pruebas de interfaz verifican lógica de sincronización y las pruebas existentes de renderizado/handlers.


### H20 — VERIFICACION_WEB_ANTES_DEL_MERGE_20261005.md

# Verificación web antes del merge

Fecha: 5 de octubre de 2026. Rama: `codex/recuperacion-ventas`; PR #59.

## Fallo confirmado y correcciones

El sitio `https://ferre-system.vercel.app` devuelve HTML y assets con HTTP 200, pero el navegador queda en blanco con el error de React Router: `A <Route> is only ever to be used as the child of <Routes>`. La versión de `main` coloca las rutas de devoluciones y auditoría fuera de `Routes`. La rama ya contiene esa corrección. El despliegue Ready de la vista previa no actualiza el dominio productivo.

El frontend de la rama agrega pruebas de Chromium sobre el bundle compilado: arranque desde rutas públicas/protegidas, ingreso y navegación ADMIN/CAJERO con API simulada y manejo de caché de notificaciones corrupta. Las pruebas interceptan la API y no contactan ni modifican datos de Render. La regresión de `main` se reprodujo contra el mismo test de arranque. También se corrigió el JSON de notificaciones inválido que impedía abrir el login.

Vercel instala con `npm ci`, usa Node 24 y `package-lock.json`. La vista previa requiere autenticación de Vercel. No se cambió esa protección.

## Estado del backend publicado

La URL pública incorporada en el bundle productivo es `https://ferresystem.onrender.com/api`. Se verificaron únicamente solicitudes de lectura y preflight, sin sesión ni datos de negocio:

- Desde el origen productivo, `OPTIONS /api/auth/login` devuelve 204 con el origen exacto permitido y credenciales.
- Desde `https://ferre-system-git-codex-recuperacion-ventas-nelspace.vercel.app`, el mismo preflight devuelve 404 y no autoriza CORS.
- `GET /api/health` devuelve 404: la API responde, pero no tiene registrado el controlador de salud de la rama.

El backend de la rama admite `FRONTEND_URLS` (lista de orígenes exactos separados por comas), conservando `FRONTEND_URL` y los orígenes locales. Rechaza rutas, comodines y credenciales en la configuración. Incluye el encabezado `X-Tenant-Id` usado por login y pruebas HTTP reales aisladas de los preflights.

## Pasos necesarios en Vercel y Render

1. Vercel: Root Directory `frontend`; API HTTPS real en `VITE_API_URL` para Preview/Production. Recompilar después de cambiar esa variable. La configuración actual de Vercel solo publica el frontend: `/api` corresponde a la instalación local con proxy.
2. Render: revisar commit/rama desplegados, Root Directory `backend`, comandos de build/start y estado de autodeploy. Configurar `NODE_ENV=production` y los orígenes autorizados; desplegar el backend compatible con el frontend. Ejemplo para los dominios conocidos:

```text
FRONTEND_URL=https://ferre-system.vercel.app
FRONTEND_URLS=https://ferre-system.vercel.app,https://ferre-system-git-codex-recuperacion-ventas-nelspace.vercel.app
```

Editar `.env.example` no configura Render. La API debe usar la implementación nueva para leer `FRONTEND_URLS`; cambiar solo la variable en una versión anterior no habilita esa lista.

3. Antes de actualizar la API, comprobar el historial y esquema de la base existente con el código y herramientas de la rama: `npm run migrate:inspect` es de solo lectura. Verificar que el script exista en la copia usada. No asumir que estará disponible en un despliegue antiguo de Render.
4. Si requiere baseline o está bloqueada, seguir [instalación y actualización segura](INSTALACION_Y_ACTUALIZACION_SEGURA.md), primero con respaldo y copia restaurada. Hay evidencia de numeración de clientes aplicada manualmente en Supabase; que Clientes abra no certifica el historial de Prisma. La rama añade la tabla `solicitudes_devolucion` y una migración inicial; `start:prod` protege el despliegue y puede detenerse ante un historial incompatible. No cambiar automáticamente el Start Command ni aplicar migraciones a ciegas.
5. Coordinar esquema, API y frontend. Publicar solo el frontend nuevo con API antigua deja sin funcionar recuperación POS, solicitudes de devolución y estado de respaldos. `node dist/main.js` permite arrancar código sin aplicar migraciones, pero no soluciona una tabla faltante.
6. Comprobar `GET /api/health` 200 (conexión a la base), ambos preflights autorizados, login/recarga/renovación de sesión y navegación con la API desplegada. El health no verifica todas las tablas ni sustituye el ensayo de recuperación/devoluciones en una copia de datos.

## Validaciones de la rama

Instalaciones npm limpias sin copiar `node_modules`, builds frontend/backend y validación/generación de Prisma aprobados con Node 24.

| Suite | Resultado |
| --- | --- |
| Frontend | 58/58 |
| Chromium: arranque y navegación con API simulada | 12/12 |
| Backend, incluyendo CORS HTTP | 115/115 |
| Instalación y respaldos | 7/7 |
| Integración PostgreSQL real aislado | 55/55 |
| Total | 247/247 |

Chromium usa el bundle compilado. La prueba de login falla al sustituir únicamente `App.tsx` por el de `main`, reproduciendo el error observado en producción, y pasa con la rama. Las pruebas PostgreSQL usan clústeres temporales; no la base cloud.

## Límite de esta revisión

Se pueden verificar el código y la compilación en este entorno. No hay acceso autenticado configurado a Render ni a la base cloud; no se inspeccionó ni modificó esa base, no se cambió el servicio de Render y no se hizo merge a `main`. Las pruebas simuladas de navegador no certifican el login de producción. La aceptación del despliegue completo depende de ejecutar y comprobar los pasos anteriores.


---

## Levantamiento multiusuario — feat/levantamiento-multiusuario (2026-10-08)

**Rama:** `feat/levantamiento-multiusuario` · **Commit:** `ab03fca7`
**Estado:** implementación completa pendiente de PR y revisión. No se hizo merge a `main`.

### Objetivo

Implementar el pendiente n.º 2 del levantamiento de inventario: conteo multiusuario seguro.

### Cambios implementados

#### Base de datos (Prisma + migración)
- `LevantamientoItem`: nuevos campos `contadorId` (quién contó) y `conflicto` (boolean, default false)
- Nuevo modelo `LevantamientoSesion`: presencia por heartbeat (TTL 5 min, unique por levantamiento+usuario)
- Migración: `backend/prisma/migrations/20261009000000_levantamiento_multiusuario/migration.sql`

#### Backend — levantamientos.service.ts (353 líneas)
- **Detección de conflicto** en `createItem()`: si otro usuario ya contó el mismo producto (por `productoId`, código o barcode), ambos ítems quedan con `conflicto=true`. El mismo usuario editando su propio conteo nunca genera conflicto.
- **Regla de conciliación documentada**: nunca suma ni elige automáticamente. El ADMIN debe llamar `POST /conciliar` eligiendo `mantenerItemId` y opcionalmente `cantidadManual`.
- **`aplicar()` bloqueado** mientras haya ítems con `conflicto=true`.
- **`previsualizar()`** incluye el error "Conteo en conflicto: conciliar antes de aplicar" en `row.errores`.
- **Heartbeat / presencia**: `heartbeat()`, `findParticipantes()`, `salirSesion()`.
- **Huérfanos**: `limpiarConflictosHuerfanos()` limpia la bandera si uno de los dos ítems en conflicto se elimina.

#### Backend — controller (5 nuevos endpoints)
```
GET    /levantamientos/:id/participantes   — lista usuarios activos (< 5 min)
POST   /levantamientos/:id/heartbeat       — registrar presencia (todos los roles)
DELETE /levantamientos/:id/heartbeat       — salir sesión
GET    /levantamientos/:id/conflictos      — lista ítems en conflicto (ADMIN)
POST   /levantamientos/:id/conciliar       — elegir conteo a conservar (ADMIN)
```

#### Frontend — LevantamientoPage.tsx (465 líneas)
- `useEffect` de heartbeat: POST cada 60 s, DELETE al salir/desmontar.
- `ParticipantesBanner`: badge de usuarios activos, se actualiza cada 30 s.
- `ConflictosPanel`: solo ADMIN; tabla con botones "Conservar este" y entrada de cantidad manual.
- Tabla de ítems: columna "Contador", filas en amarillo si hay conflicto, badge ⚠️.
- Botón "Revisar impacto" deshabilitado con tooltip mientras haya conflictos pendientes.
- Mensaje de aviso para no-ADMIN cuando hay conflictos activos.

### Pruebas — 31/31 ✅

| Suite | Tests | Resultado |
|---|---|---|
| Conteo protegido y aplicación explícita | 6 | ✅ |
| Identidad de productos durante el levantamiento | 4 | ✅ |
| Auditoría P1/P2 — aplicar() protege barcode y precios | 5 | ✅ |
| Multiusuario — detección de conflictos | 6 | ✅ |
| Multiusuario — conciliación de conflictos | 4 | ✅ |
| Multiusuario — heartbeat y participantes | 3 | ✅ |
| Aislamiento por tenant | 3 | ✅ |
| **Total** | **31** | **31/31** |

TypeScript (`tsc --noEmit`): 0 errores. Lint (oxlint): 0 errores, 128 advertencias preexistentes.

### Regla de conciliación — documentación explícita

> **Nunca se suman ni se auto-eligen conteos simultáneos.**
>
> Cuando dos usuarios registran el mismo producto en el mismo levantamiento, ambos ítems quedan marcados como `conflicto=true`. El levantamiento no se puede aplicar al inventario mientras existan conflictos. El ADMIN debe llamar `POST /conciliar` con `mantenerItemId` (el ítem a conservar) y, opcionalmente, `cantidadManual` (si ninguno de los dos conteos es correcto). El ítem elegido queda con `conflicto=false`; los hermanos se eliminan con registro de auditoría.

### Limitaciones y pendientes

- La migración SQL requiere ejecutar `prisma migrate deploy` en el entorno de staging/producción. No se ejecutó contra la base cloud.
- Pruebas de integración con PostgreSQL real no incluidas en esta rama (requieren base de pruebas aislada).
- Las pruebas de frontend (Vitest/JSDOM) no cubren el componente multiusuario aún — los componentes `ParticipantesBanner` y `ConflictosPanel` son funciones puras testeables si se agrega un suite de componentes.
- La validación `prisma validate` falló en el entorno cloud por bloqueo de red al CDN de Prisma; el schema fue validado manualmente con script Python.

### Para crear el PR

```bash
git push origin feat/levantamiento-multiusuario
gh pr create --base main --title "feat(levantamientos): conteo multiusuario seguro" \
  --body "Ver docs/CONTEXTO_MAESTRO.md sección 2026-10-08"
```



## 2026-10-21 — Cierre documental de Impeccable (PR #182)

**Decisión:** conservar en este contexto las recomendaciones relevantes del PR #182, sin integrar sus archivos de configuración, agentes, referencias ni motor a `main`. El PR #182 se cierra sin merge. Las afirmaciones del documento `PRODUCT.md` son hallazgos de la rama, no certificación adicional de producción.

### Recomendaciones y pendientes recuperados

- Mantener **Jowa System** como identidad comercial y la arquitectura React/Vite + NestJS/Prisma/PostgreSQL con Vercel, Render y Supabase. La estrategia objetivo es **nube**; revisar y retirar o justificar el despliegue local heredado `deploy/local` antes de declarar completada la transición.
- Logotipos: el documento indica almacenamiento privado en PostgreSQL por defecto y alternativas bajo `LOGOTIPO_ALMACEN`. Validar el almacenamiento elegido, los permisos y la recuperación en servicios reales; no asumir que Supabase Storage está probado.
- Móvil: una sola PWA administrativa para consulta, supervisión, reportes e inventario; **sin POS, cobros ni caja móvil**. Verificar y bloquear la ruta `/pos` en móvil donde aún sea accesible. Completar las funciones administrativas y validar cámara/escáner en Safari e iPhone reales.
- Fotografías opcionales de productos: definir e implementar almacenamiento en nube seguro; el campo `imagenUrl` señalado por la auditoría acepta referencias HTTPS, pero eso no equivale a un flujo completo de subida.
- Notificaciones push con la PWA cerrada: requisito planificado, pendiente de implementación y pruebas reales.
- Contabilidad hondureña y rol CONTADOR: siguen en rama separada, no integrados; evaluar permisos y migraciones antes de incorporar. Exportaciones `.xlsx` reales pendientes; no confundir CSV o XML `.xls` con XLSX.
- Diseño: conservar navegación SIDEBAR/TOPNAV, personalización de marca, traducciones ES/EN y simplicidad operativa. Evaluar la facilidad de uso con usuarios reales; no declarar esa cualidad demostrada solo por la existencia de estilos.
- Infraestructura/operación: validar PWA instalada, contingencia offline, impresoras A4/80/58 mm, cámaras físicas y sincronización; distinguir pruebas automatizadas de certificación en producción.
- Sucursales: el documento señala ausencia de filtrado operativo por sucursal en ventas/productos; confirmar alcance y modelado antes de prometer soporte multi-sucursal.
- Impeccable: el PR #182 contiene documentación y cuatro descripciones de agentes, pero **no incluye motor ejecutable**. El antiguo binario de 19,8 MB no debe introducirse en `main` sin validación de procedencia y hash. `buildPath: "code"` es una preferencia pendiente de confirmar, no una ruta funcional verificada.
- Evitar incorporar documentación de terceros que no se utilizará en producción; conservar los hallazgos accionables en este contexto y reabrir el tema solo si se decide instalar Impeccable.

**Fuente:** PR #182 y `PRODUCT.md` de la rama (`aeddc71`). **Estado:** recomendaciones documentadas; no implica que los pendientes estén corregidos.
