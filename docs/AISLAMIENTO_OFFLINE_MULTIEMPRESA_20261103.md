# Aislamiento del diario offline por empresa y usuario

Base comprobada: `main` `8a43b06dfe85c80435fab7ac90f710803cc56bb6` (merge #236). Fecha: 2026-11-03, America/Tegucigalpa. Responsable: Codex. Sin despliegue, merge, bases reales ni cambios fiscales.

## Contrato de datos y acceso

`OperacionLocal.tenantId` es opcional exclusivamente para leer registros históricos. `NuevaOperacion` lo exige y `registrarOperacion` rechaza una empresa vacía antes de escribir. La empresa se persiste junto con la operación y la secuencia, en la transacción existente; nunca se agrega al DTO enviado al servidor. La empresa efectiva del servidor sigue dependiendo del token.

Se reutiliza `puedeVerOperacion` de #236 para el envío, los contadores, recuperación de ENVIANDO y refresco de revisiones. ADMIN accede a su empresa; CAJERO a sus propias operaciones, dentro de esa empresa. Otros roles o sesiones sin empresa no obtienen acceso. La empresa explícita del registro prevalece sobre cualquier inferencia.

Históricos sin tenantId:

- La ventana local coincidente por `ventanaId` permite conocer su empresa, sin depender de que siga vigente (vigencia fiscal/de venta y pertenencia histórica son conceptos distintos).
- Si falta esa evidencia, el propietario puede recuperar su operación por su identificador de usuario, que es globalmente único en el servidor. Esto presupone una sesión válida; no autoriza a cambiar arbitrariamente de empresa un mismo usuario.
- Un ADMIN distinto del propietario no sincroniza históricos de empresa desconocida. Se conservan íntegros hasta que acceda su cajero o exista evidencia verificable. No se reasignan a la empresa que esté abierta en el navegador, ni se modifican UUID, importes o secuencia.

El contador global del shell pasa a ser de la sesión. Al cambiar empresa, usuario, rol o estado de autenticación, `useConexion` oculta inmediatamente el resultado anterior; sus respuestas tardías se descartan. Un error de lectura sigue siendo un error, no cero pendientes. Los campos de ResultadoSync y los tamaños de cola enviados al servidor se calculan dentro del alcance permitido.

Los ciclos de sincronización capturan sus credenciales. Antes de cada POST/GET se comprueba la identidad actual; no se usa el token de un nuevo login para enviar un lote anterior. Un resultado confirmado que ya se persistió se conserva si cambia la sesión. Las operaciones que no terminaron siguen recuperables con el mismo UUID. No se alteran la idempotencia, el protocolo HTTP ni los límites comerciales/fiscales.

## Evaluación de bases físicas por tenant

**Decisión de implementación en este PR:** conservar la base `ferresystem-contingencia`, versión 1 y los cuatro almacenes actuales. No se realiza una migración de datos. El aislamiento implementado es de aplicación; no impide a quien controle el perfil del navegador leer la base mediante DevTools. Bases distintas dentro del mismo origen tampoco son una frontera de seguridad ni cifran los datos.

Separar solo operaciones sería incompleto: `db.ts`, `ventana.ts`, el borrador, el dispositivo, el contador de secuencia y los lectores/exportadores deben adoptar el mismo contrato. La ventana actual es única y los históricos pueden no tener empresa identificable. Cambiar de nombre de base con la sesión podría crear un dispositivo nuevo, reiniciar secuencias o dejar operaciones inaccesibles. IndexedDB no ofrece una transacción atómica entre dos bases. Por ello no se convierte una evaluación en una migración parcial sin garantías.

### Protocolo propuesto para una futura migración sin borrado

1. Introducir una versión de aplicación que sepa leer tanto el origen v1 como el destino por tenant y tenga un coordinador de escrituras con Web Locks. No permitir que una pestaña de una versión antigua siga escribiendo sin reconciliación.
2. Mantener el origen íntegro; copiar únicamente registros cuya pertenencia esté probada. Los desconocidos permanecen en el origen accesibles para su propietario. No asignar empresa por la sesión actual ni por nombres de productos/clientes.
3. Copiar cada operación bajo su UUID original, junto con estado, secuencia, importes y todos los demás campos. Si el destino ya contiene el UUID, comparar la carga original y detener/revisar discrepancias, nunca sobrescribirlas. Conservar un contador/secuencia monotónico compartido mientras existan ambos formatos.
4. Persistir y verificar el commit de destino antes de registrar en origen el avance. La marca de avance incluye origen, UUID, destino y versión de migrador. Un reinicio entre esos commits vuelve a comparar/reintentar la misma copia: no genera identificadores nuevos.
5. Mientras haya coexistencia, los lectores y la cola combinan origen/destino por UUID y comprueban consistencia. Coordinar también las transiciones de sincronización para impedir que una copia antigua reactive una operación confirmada. El servidor continúa siendo idempotente por UUID.
6. Migrar ventana, dispositivo y borrador solo tras definir su pertenencia y su relación con el contador; no duplicar el registro del equipo por abrir otra empresa. Conservar salida de recuperación/exportación acotada a la sesión.
7. Verificar conteos, carga y estados, cerrar y reabrir el navegador, interrumpir cada fase, simular cuota/abortos y dos pestañas/empresas. El origen no se elimina: su eventual retención/depuración exige un alcance separado y confirmación del servidor.

Este protocolo es una propuesta evaluada, **no código implementado ni migración certificada**. No deja una prueba automática de la corrección actual pendiente: la separación física no forma parte del cambio realizado.

## Coordinación y evidencia

Responsabilidad exclusiva de Codex sobre `journal.ts`, `sync.ts`, `useConexion.ts` registrada en [#236](https://github.com/Nelosama/FerreSystem/pull/236#issuecomment-6620835598); adaptación del consumidor y evaluación física en [seguimiento](https://github.com/Nelosama/FerreSystem/pull/236#issuecomment-6620901202). Publicar estos mensajes no acredita revisión ni aprobación de Claude. `acceso.ts` permanece sin cambios.

Pruebas dirigidas: `frontend/test/offline-multiempresa.test.mjs`, regresión `offline-integridad`, `offline-logica`, `contingencia-acceso`; E2E `contingencia-aislamiento-simulado` y `contingencia-red-simulado`. Los resultados finales y el SHA de CI se registran en el único PR y en la página existente de Notion, para no atribuir al commit un resultado anterior.

Riesgos residuales: lectura del perfil del navegador por DevTools, históricos ajenos de empresa desconocida sin sincronización administrativa, pérdida física/expulsión del almacenamiento y apagón real no certificados. Persistencia/cuota y retención corresponden al siguiente alcance de Claude; no se implementa borrado de operaciones en este PR.
