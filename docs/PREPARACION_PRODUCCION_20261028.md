# Preparación para salida a producción — 2026-10-28

Revisión contra GitHub realizada el 2026-10-28 (UTC) sobre `main` `848758b` (merge del PR #210). Esta revisión no cambia `main`, Render, Vercel, la base de datos ni los backups, y no hace merge. Decisión de salida: **NO-GO** hasta cerrar los bloqueos de la sección 2.

Hora de las observaciones: los datos de GitHub corresponden a consultas del 2026-10-28 entre 14:10 y 15:50 UTC, según los `completed_at` citados.

## 1. Estado verificado

Cada fila indica la fecha y la fuente de la observación. Lo que no aparece aquí figura en la sección 1.2 como no verificado.

| Elemento | Estado verificado | Evidencia (2026-10-28 UTC) |
| --- | --- | --- |
| `main` | `848758b` (merge de PR #210) | API de GitHub; `git ls-remote` |
| PR #210 | **Mergeado** el 15:49:04Z. Checks de su head `1848cfb9` antes del merge: `validate`, `test`, `guard-base-datos`, `Vercel Preview Comments` en **success** | API de GitHub, check-runs de `1848cfb9` (completados 05:55–06:11Z) |
| Run de `main` tras #210 | `Operación de ferretería` (run 40719784187) y `Piloto con API y PostgreSQL reales` (run 40719784665) en **in_progress** en la última consulta | API de Actions, `head_sha` `848758b` |
| Run de `main` previo (#209, `53e2cc95`) | `Operación de ferretería` (run 40639443677) **failure**; `Piloto…` (run 40639443541) **success** | API de Actions |
| PR #211 (borrador) | Head `6f902a69`. `validate`: **failure** (06:29:50Z). `test`: **success** (06:31:52Z). `guard-base-datos` y `Vercel Preview Comments`: **success** | API de check-runs |
| PR #211 — causa del fallo | `validate` falla en el paso «Frontend: arranque y navegación en Chromium» (06:23:11–06:29:47Z). Pasos de backend y PostgreSQL **omitidos**. Artifact `frontend-browser-failure` (ID 12796413581). **No se identificó la prueba concreta que falla** | API de jobs y de logs (job 122666652771) |
| PR #212 | Abierto. Head `366209f4`. `validate`: **failure** (14:17:28Z). `test`, `guard-base-datos`, `Vercel Preview Comments`: **success** | API de check-runs |
| PR #212 — causa del fallo | Mismo patrón: falla en «Frontend: arranque y navegación en Chromium» (14:11:15–14:17:25Z); backend y PostgreSQL **omitidos**. **No se identificó la prueba concreta** | API de jobs (job 122868519690) |
| PR #213 (este documento) | Abierto. Head `e670401` antes de esta actualización | API de GitHub |
| PR #213 — causa del fallo | `validate` **failure** (14:18:18Z) en el paso de Chromium; backend y PostgreSQL **omitidos**. Run 40703332680, artifact ID 12822477847. Pruebas fallidas: `e2e/auth-security.spec.ts:167` («bloqueo por inactividad y cambio de empleado cierran identidad») y `e2e/contabilidad-simulado.spec.ts:279` («libro mayor… descarga su Excel»). Resumen de Playwright: 2 fallidas, 414 aprobadas, 26 omitidas | Log del job 122868717554 |
| Pruebas de `auth-security` tras la fusión con `main` | `main` incluye cambios en `frontend/e2e/auth-security.spec.ts` y `frontend/src/components/AdminTopbar.tsx` (3 líneas en total) que el head de #213 no tenía. **No se ha vuelto a ejecutar la prueba** | `git merge origin/main` en esta revisión (`bb40c2d`) |
| Prueba `contabilidad-simulado` | Falla en las ejecuciones de #213 (14:18Z). **No se ha reproducido localmente** (sin dependencias instaladas en esta sesión) | Log del job 122868717554 |
| Código de la política de excepciones de precio | En `main`: motivo de 10–300 caracteres, rol ADMIN y permiso `pos.excepcion_precio` (`backend/src/ventas/politica-precio.ts`, líneas 7–19 y 43) | Lectura de código en `848758b` |
| Vercel (frontend) | `https://ferre-system.vercel.app/` respondió **200** en la revisión anterior de este documento. **No reconfirmado hoy**: en esta sesión el proxy rechazó la conexión (`connect_rejected`) | Revisión anterior (fecha no registrada en el documento original) |
| Render (API) | `https://ferresystem.onrender.com/api` respondió **404** en la revisión anterior (ruta raíz; no es un health check). **No reconfirmado hoy**: mismo rechazo del proxy | Revisión anterior |

### 1.1 Resumen de los checks por PR

- **#210:** cerrado y mergeado; checks en verde en su head antes del merge. El run de `main` posterior aún estaba en curso en la última consulta.
- **#211:** `validate` en rojo en el paso de Chromium. Pendiente de corregir o de decidir si queda fuera de la salida.
- **#212:** `validate` en rojo, mismo paso. Pendiente.
- **#213:** `validate` en rojo, mismo paso, con dos pruebas e2e fallidas. Este documento no cambia código; el rojo no viene de la documentación sino de las pruebas de navegador del head anterior a la fusión con `main`.
- **`main` (run de 848758b):** en curso. Su resultado final no se conoce todavía.

Ninguna de estas ejecuciones valida el SHA final de la salida. Antes de cualquier GO, hay que repetir los checks sobre el SHA final de cada PR.

### 1.2 No verificado

- **Base de datos, migraciones, respaldos y recuperación:** no se revisaron desde esta sesión (sin acceso a Render ni a la base).
- **Configuración de producción en Render y Vercel** (variables de entorno, orígenes permitidos, secretos): no se revisó.
- **Endpoint de salud de la API:** no hay ruta de salud documentada en esta revisión.
- **Vercel y Render (HTTP):** no reconfirmados hoy (ver sección 1).
- **Causa exacta de los fallos de Chromium en #211, #212 y #213**, salvo las dos pruebas nombradas en #213.
- **Módulos sin operaciones registradas** (apartados, transferencias, pedidos especiales, listas de precio): hay pantallas en `frontend/src/pages`, pero no se verificó si registran operaciones.
- **Regla fiscal de ISV y exenciones:** no verificada en código; depende de confirmación del contador del cliente.
- **Validación física** (Safari/iPhone, impresoras A4/80/58 mm, cámara real): no hecha.
- **Aceptación del cliente:** no hay evidencia.

## 2. Bloqueos que requieren decisión humana o validación

1. **Checks en rojo de #211, #212 y #213** en el paso de navegador. Hay que identificar la prueba que falla en cada PR, corregirla en su SHA y repetir los checks. Mientras estén en rojo, no se puede dar GO.
2. **Excepciones de precio (PR #211).** La política de `main` exige motivo de 10–300 caracteres, rol ADMIN y el permiso `pos.excepcion_precio`. Falta decidir quién otorga ese permiso y cómo se registra el motivo en auditoría. #211 no debe integrarse hasta esa decisión.
3. **Alcance fiscal de ISV y exenciones.** No hay regla confirmada para exenciones ni para productos con tratamiento distinto al 15 %. Requiere confirmación del contador del cliente. No modificar cálculos monetarios sin esa regla.
4. **Respaldos y recuperación.** No se ha verificado la frecuencia de respaldo, el lugar de almacenamiento ni una restauración de prueba. Un respaldo no probado no cuenta como recuperación.
5. **Configuración de producción.** Variables de Render y Vercel no revisadas desde aquí. Revisar sin copiar valores secretos.
6. **Módulos habilitables sin operaciones registradas.** Decidir si se ocultan para la salida o se documentan como pendientes.
7. **Validación física.** Safari/iPhone, impresoras y cámara real no están validadas. No se acreditan con emulación.
8. **Aceptación del cliente.** Pendiente; no se declara sin su confirmación.

## 3. Lo que hay que verificar antes de salir

- Checks completos de #211, #212 y #213 sobre su SHA final, sin reutilizar resultados de SHA anteriores.
- Run de `main` tras #210 (`848758b`) en verde, o causa documentada si queda en rojo.
- Suite de frontend en Windows y Linux (CI). #212 trae la parte de Windows; no se ha comprobado su resultado.
- Build de frontend con `VITE_API_URL` de producción (HTTPS, no localhost). Nota: en CI la variable apunta a `https://api.example.test/api`, que no es la API de producción.
- Migraciones: confirmar que la salida no introduce migraciones nuevas sin plan de reversión.

## 4. Pasos de salida controlada (solo con autorización del dueño)

1. Resolver los bloqueos 1 y 2, o documentar que la salida excluye esos módulos.
2. Confirmar respaldo reciente y una restauración de prueba en entorno temporal.
3. Hacer merge a `main` de los PRs aprobados, uno por uno, esperando los checks de cada uno.
4. Vigilar el despliegue automático de Render y Vercel. Verificar `/api` y el frontend con un usuario de prueba, no con datos de clientes.
5. Prueba de humo: inicio de sesión, venta en efectivo a cuenta de prueba, cotización y consulta de inventario.
6. Plan de reversión: revertir el merge en `main` y redeploy del commit anterior. Si hay migración, no se revierte automáticamente: decidir antes.

## 5. Criterio GO / NO-GO

- **GO** solo si: los bloqueos 1 y 2 están resueltos o excluidos por decisión escrita; hay respaldo verificado; los checks del SHA final pasan; la prueba de humo pasa en producción.
- **NO-GO** si queda cualquier bloqueo crítico abierto, si falta el respaldo verificado, o si algún check falla.

Estado actual: **NO-GO**. Motivos verificados hoy: `validate` en rojo en #211, #212 y #213; respaldo no verificado; aceptación del cliente sin evidencia.
