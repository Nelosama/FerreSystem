# Retención segura del diario PWA — 2026-11-05 (America/Tegucigalpa)

## Estado y base

Rama única `nexus/retencion-segura-20261105`, desde `main` remoto comprobado
`54db0694c26b6533c5256d2d054c10a7956e25a8`. Se consultaron ramas y PR antes de
editar: únicamente #240 abierto, documental, head `60fc8bfa`; no modificado.
#238 y #239 ya estaban integrados. La retención de #239 carecía de llamadores.

**Retención conectada en código**, al final de `sincronizarPendientes`, después
de persistir confirmaciones y refrescar revisiones correctamente. Sin activar
`POS_OFFLINE_ENABLED`, sin cambios de hosting, esquema o migraciones, sin bases
reales, merge ni despliegue. Se usa `nexus/*`, ya bloqueado por las guardias de
preview existentes; no se modifican configuraciones de Render/Vercel/Supabase.

## Contrato GET /contingencia/operaciones/estados

Se conserva el array de estados por UUID público y el máximo de 100 ids por
petición. JWT, sesión revocable, tenant y roles ADMIN/CAJERO se validan con las
guardias existentes. La ruta emite `Cache-Control: no-store`. Las consultas de
cada respuesta comparten una transacción PostgreSQL `RepeatableRead`, sin
escrituras. No se devuelve payload ni datos de cliente para retención.

Una fila registrada añade:

| Campo | Regla |
| --- | --- |
| `operacionId` | UUID público solicitado; no id interno derivado |
| `tenantId` | Empresa autenticada, debe coincidir exactamente con el diario |
| `estado` | Solo `APLICADA` permite purgar |
| `requiereRevision` | Debe ser explícitamente `false`, en servidor y sin revisión local |
| `numeroVenta` | Entero positivo, idéntico al guardado localmente y a la venta persistida |
| `correlativoDefinitivo` | `V-` + número con al menos 8 dígitos, idéntico al local |
| `payloadHashVersion` | Literal `dto-json-v1` |
| `payloadHash` | Huella histórica persistida, solo si coincide al recalcular desde `payload` JSONB; `null` si no cuadra |
| `cajaId` | Caja original de la operación, idéntica a la local |
| `cajaCerrada` | `true` solo si operación aplicada sin revisión, venta ligada del mismo tenant y número/hash coincidentes, caja original y caja destino de la venta ambas `CERRADA`; `false` si alguna está abierta; `null` sin prueba suficiente |
| `reconfirmadaAt` | ISO UTC emitido por servidor durante esta consulta; el cliente nunca lo sustituye por su hora |

La evidencia vence a los 5 minutos; se tolera hasta 60 s de adelanto del reloj
servidor. Un reloj incompatible conserva datos. Operaciones no registradas o no
visibles conservan la respuesta previa sin evidencia habilitante. El cliente
rechaza ids ajenos, duplicados, formatos inesperados, campos ausentes, HTTP y
timeout (20 s). Una respuesta parcial solo acredita las operaciones presentes.

## Hash: formato existente, sin migración

`operaciones_contingencia.payload` es JSONB; `payload_hash` TEXT. La migración
publicada `20261011000000_pos_contingencia_offline` prohíbe modificar carga/hash
mediante trigger, y prohíbe borrar filas del servidor. No se altera esa migración.

El formato real anterior era `fingerprint(canonico(dto))`: `fingerprint` hace
`SHA256(JSON.stringify(valor))`, y `canonico` ya devuelve una cadena JSON con
claves ordenadas recursivamente mediante `localeCompare`. Por tanto, la entrada
a SHA256 **incluye la segunda serialización**, sus comillas y escapes. Se
conserva exactamente para no cambiar idempotencia ni huellas históricas.

El cliente ahora calcula esa misma huella sobre **todo el DTO que envía**:
UUID/índice, dispositivo, ventana, secuencia, correlativo, instante, cajero,
líneas con cantidades/precios, cinco importes, método EFECTIVO, cliente/RTN si
se envían, versión. Los opcionales `undefined` se omiten como en el transporte
JSON. El orden de líneas se conserva. Etiquetas de producto/cajero, estado,
intentos y `tenantId` local no forman parte del DTO. `cajaId` se prueba por el
campo de evidencia separado porque el servidor deriva la caja desde la ventana.
No se normalizan textos ni se cambia el DTO enviado con este trabajo.

`payload.ts` centraliza la proyección del envío y la de retención en cliente.
`huellaPayloadContingencia` centraliza el cálculo histórico del backend. La prueba
cruzada importa código de ambos lados, atraviesa `plainToInstance`, validación y
serialización, prueba Unicode/escapes/opcionales/orden de claves y muta todos los
campos variables. La prueba PostgreSQL compara también DTO, JSONB y huella del
cliente. La proyección parcial anterior **no se acepta**. Si un dato histórico
no coincide, se conserva localmente; no se rellena ni reescribe su hash.

## Sesión, atomicidad y UUID

Antes de retener se captura token con `sid`, usuario, empresa y rol. Cada lote se
consulta con ese token; cambios de token, empresa, usuario, rol o pérdida de red
invalidan el ciclo. El servidor confirma la validez real de la sesión por GET.
Solo ADMIN de la empresa o CAJERO propietario pueden presentar candidatas;
históricos sin `tenantId` explícito se conservan, sin inferirlos para borrar.

La transacción local relee operación, empresa, propietario, estado, revisión,
carga canónica y edad efectiva de la evidencia antes de eliminar. Escribe el
testigo en `meta` en la misma transacción. Un error aborta borrado y testigo.
El testigo conserva empresa/operación/ventana/caja, correlativos/número, total,
fechas, hash/version, estado confirmado y cierre; no nombres, RTN, cajero,
productos ni token. Los testigos no se purgan automáticamente.

El diario asignaba el próximo UUID como máximo índice aún almacenado + 1.
Borrar el último habría reutilizado un UUID emitido: la retención preserva el
máximo consumido por ventana en `meta` (`indice-retenido:<ventanaId>`), atómico
con borrado/testigo. `registrarOperacion` lo lee en su propia transacción; conserva
secuencia y rechaza agotamiento sin guardar. Pruebas cubren último índice y
lotes desordenados. No cambia la versión de IndexedDB ni sus almacenes. Además, se conserva toda
operación de la ventana local activa hasta que sea reemplazada: el POS usa sus
ventas para calcular cupos, y purgarlas podría liberar cupo por accidente. Esta
condición se comprueba bajo bloqueo de `ventana` en la misma transacción local.

## Protección de main (solo consulta)

GitHub devuelve `protected: false` para main y `GET /rulesets` devuelve `[]`.
La consulta del detalle `/branches/main/protection` recibe 403
`Resource not accessible by integration`: esta conexión no tiene administración;
no se presenta ese detalle como inspeccionado. Recomendación al propietario:
regla/ruleset activo dirigido a main, exigir PR y revisión, checks requeridos
`validate`, `test` y `guard-base-datos`, rama actualizada antes de integrar,
bloquear force push/borrado y aplicar a administradores con bypass mínimo
explícito. Los tres nombres corresponden a jobs existentes. No se cambia ninguna
regla desde esta tarea.

## Validación y límites

Los resultados de esta sesión y los checks del SHA final se registran en
`CONTEXTO_MAESTRO.md` y en el PR independiente. PostgreSQL usa binarios 17.11
extraídos en `work/pg`, clústeres efímeros en loopback y datos sintéticos. Los
interruptores que los arneses existentes habilitan dentro del proceso de prueba
no cambian configuración de una instancia ni una base real.

No certifica producción: siguen pendientes separación física de almacenamiento
por empresa, validación en equipos reales (Safari/iOS, expulsión, apagón,
impresoras) y política de purga de testigos. El hash asegura igualdad de carga;
no es firma criptográfica de un dispositivo local comprometido. La evidencia
representa el snapshot reciente del servidor, no un bloqueo distribuido entre
PostgreSQL e IndexedDB. Reapertura futura de cajas o nuevos cambios de negocio
requerirán revisar esta política. Sin cambios de Prisma/migraciones, no se activa
el bloqueo de revisión previa de NEXUS solicitado para esos cambios.
