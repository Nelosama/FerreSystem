# CENTINELA — revalidación de las correcciones de ATLAS (D1, R1, D3), 2026-10-11

**Firma:** CENTINELA.
**Commit verificado:** `5be0d6ce` en `claude/atlas-correcciones-centinela` (PR #145).
**Base de comparación:** `e8b75ae6` (integración de NEXUS).
**Rama de verificación:** `claude/centinela-verificacion-atlas`. Solo pruebas y documentación, más un parche de prueba en el script del navegador. No hay cambios en código productivo ni en la rama de ATLAS.
**Sin merges, despliegues ni migraciones productivas.**

## 1. Resultado por hallazgo

| # | Punto de la revalidación | Veredicto | Evidencia principal |
|---|---|---|---|
| 1 | Solo ADMIN y BODEGUERO entregan, incluso con permisos personalizados | **PASS** | Pruebas 1.1 a 1.5. Mutación M1 (CAJERO permitido) → 2 fallos. Una sola escritura de `entregado_at` en `operaciones.service.ts:313`. |
| 2 | CAJERO solo ve sus pendientes; VENDEDOR sin acceso | **PASS** | Pruebas 2.1 a 2.4. Mutación M2 (sin filtro de «sus ventas») → 1 fallo. |
| 3 | Un identificador ajeno no revela existencia por la respuesta | **FAIL parcial** | PASS en ventas, consulta de solicitud, caja, proveedor, movimiento de caja y devolución (respuesta idéntica). **FAIL residual** en contingencia: dispositivo (409 frente a 201) y operación (`RECHAZADA_TECNICA` frente a `REVISION`). P2 bajo. |
| 4 | Idempotencia, reintentos y compatibilidad con registros anteriores | **PASS** | Ventas en paralelo: 5 llamadas, una venta, descuento único. Entrega en paralelo: 4 llamadas, un evento. Venta y caja anteriores al cambio se reconocen. Contenido distinto sigue en 409. |
| 5 | Separación entre ID interno y `solicitudId` | **FAIL (P3)** | `GET /ventas/solicitudes/<id interno>` responde `REGISTRADA` (prueba `it.fails` «HALLAZGO P3»). No hay fuga entre empresas. |
| 6 | Compatibilidad con entregas parciales de #144 | **FAIL** | El merge da 11 archivos en conflicto y regresiones de permisos si se resuelve tomando un solo lado (§4). No verificado después de resolver. |
| 7 | Riesgo residual de `dispositivos_pos` y `operaciones_contingencia` | **PASS** en secuestro, **FAIL residual** en oráculo | Otra empresa no modifica dispositivos ni operaciones (pruebas 7.1 y 7.3). El oráculo de respuesta se mide en el punto 3. |
| 8 | Reproducir la prueba Chromium preexistente | **Reproducida** (fallo preexistente confirmado) | Falla igual en `e8b75ae6` y en `5be0d6ce`. Causa: el script no rellena «Autorización bancaria». Con ese parche de prueba pasa en ambos commits. |

**Conclusión sobre PR #145:** D1 y R1 quedan corregidos y verificados. D3 queda corregido para las seis rutas de negocio, con dos residuos documentados (P2 de contingencia y P3 de ID interno). **Listo para integrarse sobre la base de NEXUS** con las condiciones de §5. **No integrar #144 hasta resolver el punto 6.**

## 2. Pruebas ejecutadas (PostgreSQL 16 temporal, usuario `nobody`)

| Suite | Resultado | Archivo de evidencia |
|---|---|---|
| Unitarias backend | **39 archivos, 366/366** | `unitarias.log` |
| Scripts | **33/33** | `scripts.log` |
| Integración completa (ATLAS) | **35 archivos, 536 pasan, 1 omitida** (la prueba de Chromium, sin `REAL_SETTINGS_BROWSER`) | `integracion.log` |
| Verificación CENTINELA (nueva) | **31 pasan, 1 `it.fails`** (hallazgo P3) | `verificacion.log` |
| Backend `tsc -p tsconfig.build.json --noEmit` | 0 errores | `tsc-backend.log` |
| Frontend `npm test` | **245/245** | `frontend-test.log` |
| Mutación M1: CAJERO puede entregar | 2 fallos, detectada | `mut-d1.log` |
| Mutación M2: sin filtro de «sus ventas» | 1 fallo, detectada | `mut-r1.log` |
| Chromium, sin parche (e8b75ae6 y 5be0d6ce) | Falla idéntica (espera de `/convertir` de 30 s) | `chromium-nexus.log`, `chromium-atlas.log` |
| Chromium, con parche de prueba (e8b75ae6 y 5be0d6ce) | **PASS** en ambos | `chromium-parche-nexus.log`, `chromium-parche.log` |

Nota: ATLAS informa 536/537 con la prueba de Chromium habilitada. Sin esa variable, la prueba aparece como omitida, y así se ejecutó aquí. Con `REAL_SETTINGS_BROWSER=1` falla de la forma descrita en §3.8.

## 3. Detalle por punto

### 3.1 Entrega solo ADMIN y BODEGUERO (PASS)
- Rol del controlador `@Roles('ADMIN','BODEGUERO')` y `authorizedActor(['ADMIN','BODEGUERO'])` dentro de la transacción.
- Un CAJERO o un VENDEDOR con **todos** los permisos personalizados recibe 403 y no cambian stock, reserva, `entregado_at`, movimientos ni auditoría.
- El servicio rechaza la llamada directa de un CAJERO (`ForbiddenException`).
- El único código que escribe `entregado_at` es `operaciones.service.ts:313`. Comprobado con búsqueda en `src/` dentro de la prueba.
- BODEGUERO sin permisos personalizados sí puede entregar. Es coherente con la matriz de `POS_ENTREGA_CONTRATOS.md` §2.1.

### 3.2 Consulta de pendientes (PASS)
- `GET /operaciones/entregas`: CAJERO ve solo las ventas que registró; ADMIN y BODEGUERO ven las de la empresa; VENDEDOR recibe 403 aunque tenga permisos personalizados `entregas.ver`; otra empresa ve lista vacía.
- Al entregarse, la venta sale de todas las listas.
- Un CAJERO recibe 404 al leer por id la venta de otro cajero (control que funciona).

### 3.3 Oráculo de identificadores ajenos (FAIL parcial)
Respuesta idéntica (estado, claves y cuerpo normalizado) para identificador ajeno y libre en:
- creación de venta; consulta de solicitud de venta; apertura de caja; creación de proveedor; movimiento de caja; consulta de solicitud de devolución (404 idéntico).

Residual medido en contingencia (`operaciones_contingencia` y `dispositivos_pos`), usando una ventana real y un lote real:
- Registrar un dispositivo con id ajeno: **409** («no disponible»). Con id libre: **201**.
- Enviar una operación con id ajeno: lote **201** con `RECHAZADA_TECNICA` y mensaje «Identificador de operación no disponible». Con id libre: `REVISION`, un registro válido.

Riesgo: un atacante necesita conocer un UUID v4 ajeno para confirmar que existe. No recibe datos. Severidad P2 bajo, como indica ATLAS. Sin embargo, la afirmación «no revela existencia» no se cumple en estos dos casos.

### 3.4 Idempotencia y compatibilidad (PASS)
- Cinco `POST /ventas` simultáneos con la misma solicitud: una venta, stock descontado una vez.
- Cuatro `POST /ventas/:id/entregar` simultáneos: un solo evento de auditoría `VENTA_ENTREGAR`, stock descontado una vez.
- Venta anterior al cambio (id igual a la solicitud): el reintento devuelve la misma venta y no duplica; el contenido distinto sigue en 409.
- Caja anterior al cambio: la apertura repetida devuelve la misma caja.
- Un registro de otra empresa con el mismo UUID no se reconoce como propio.
- Mismo identificador con otro usuario de la misma empresa: 409.

### 3.5 ID interno frente a `solicitudId` (FAIL P3)
- El id interno devuelto es distinto de la solicitud (PASS).
- **Hallazgo:** `GET /ventas/solicitudes/<id interno>` responde `REGISTRADA` para el mismo usuario. Causa: `candidatosSolicitud` incluye el valor crudo, y para filas nuevas ese valor es el id interno. La consulta sigue filtrada por empresa y usuario, así que no hay fuga entre empresas.
- Usar el id interno como `solicitudId` en un `POST` responde 409 y no duplica (observación).
- Propuesta: aceptar la rama heredada solo si el registro es anterior al cambio (por ejemplo, con una columna `solicitud_id` o comprobando `solicitudHash` frente a la huella de la petición).

### 3.6 Compatibilidad con #144 (FAIL)
Simulación de merge `5be0d6ce` + `origin/claude/atlas-cobro-entrega` (base `c5fe4982`, anterior a NEXUS). Sin tocar ninguna rama. Resultado en `merge-144-conflictos.txt`.

Conflictos de contenido en 11 archivos: `schema.prisma` (1), `operaciones.controller.ts` (2), `operaciones.service.ts` (3), `ventas.service.ts` (3), y en pruebas y frontend (`migrations`, `piloto-flujo-completo`, `reportes-zona-horaria`, `ventas.postgres`, `CONTEXTO_MAESTRO.md`, `App.tsx`, `POSPage.tsx`).

Regresiones que aparecen si se resuelve tomando el lado de #144 sin revisar:
1. **R1 regresa.** En #144, `GET /operaciones/entregas` llama a `entregas(t)` sin usuario, así que CAJERO vuelve a ver las ventas de todos.
2. **VENDEDOR gana acceso.** `GET /entregas/pendientes` de #144 usa `ROLES_CONSULTA = ['ADMIN','CAJERO','VENDEDOR','BODEGUERO']`. VENDEDOR ve sus propias ventas pendientes, contra el punto 2.
3. **Dos superficies de lectura** con reglas distintas (`/operaciones/entregas` y `/entregas/pendientes`). Hay que elegir una.
4. **Dos rutas de escritura de entrega.** #144 añade entrega inmediata en el POS (`MOSTRADOR`) y eventos en `entregas_eventos`. La prueba de «única escritura» (3.1) debe reformularse para incluirlas.
5. **Identificadores de solicitud.** #144 usa el valor crudo en `entregas_eventos` (clave `tenant_id, solicitud_id`). No hay oráculo entre empresas porque la búsqueda filtra por empresa, pero no aplica la derivación de D3.

Lo que sí es compatible: `entregar` de #144 usa `ROLES_ENTREGA = ['ADMIN','BODEGUERO']`, igual que D1. Las dos versiones de idempotencia son compatibles si se mantienen ambas.

No se completó la resolución del merge. Eso es trabajo de ATLAS, y las reglas de §5 indican qué debe conservar.

### 3.7 Riesgo residual de contingencia (PASS en secuestro, FAIL residual en oráculo)
- Otra empresa no puede enviar latido ni desactivar un dispositivo ajeno: 404, y el registro queda intacto (prueba 7.1).
- `GET /contingencia/operaciones/estados` filtra por empresa (`findMany` con `tenantId`).
- `latido`, `desactivar` y la búsqueda de ventana filtran por empresa.
- El oráculo residual está medido en §3.3.

### 3.8 Prueba Chromium (fallo preexistente, reproducido)
- `ciclo-ventas.postgres.integration.ts`, «Chromium real: conversión por transferencia y POS con tarjeta». Falla con `page.waitForResponse: Timeout 30000ms` al esperar `POST /convertir`.
- **Causa:** el formulario de conversión (`CotizacionesPage.tsx:138`) exige «Autorización bancaria» (mínimo 3 caracteres) para cobros electrónicos y deshabilita «Confirmar». El script `real-ciclo-ventas-browser.mjs` nunca la rellena, así que la petición no sale.
- El mismo fallo aparece en `e8b75ae6`. Los archivos de cotizaciones, del script del navegador y del backend de cotizaciones son idénticos entre ambos commits.
- **Parche de prueba:** rellenar «Autorización bancaria» en la conversión y en el POS (tarjeta, con «Terminal POS»). Con ese parche la prueba pasa en `e8b75ae6` y en `5be0d6ce`. Está en la rama de verificación, como cambio solo de prueba.

## 4. Pruebas nuevas (`backend/test/centinela-verificacion-atlas.postgres.integration.ts`)

31 pruebas que pasan y 1 `it.fails` (hallazgo P3). Usan login real, `ValidationPipe` y `TenantModuleGuard`, como en producción. Cada bloque corresponde a un punto de la revalidación.

## 5. Condiciones de integración

1. **#145 sobre `e8b75ae6`:** listo. Aplicar el parche de prueba de Chromium (está en esta rama) para que la suite completa quede en verde con la prueba habilitada.
2. **P3 (ID interno):** decidir si se corrige ahora o se acepta. Corrección sugerida en §3.5.
3. **P2 de contingencia:** aceptar como riesgo residual o derivar identificadores de dispositivo y operación por empresa. Lo segundo requiere cambios en el cliente offline, así que lo decide ATLAS.
4. **#144:** no integrar hasta resolver los puntos 1 a 5 de §3.6 y repetir esta verificación sobre el resultado.

## 6. Límites

- Sin datos de producción. Bases vacías con datos sembrados.
- No se ejecutó la E2E real (`e2e-real/run.sh`) ni Playwright simulado.
- La resolución del merge con #144 no se hizo; las regresiones de §3.6 son de lectura de código y de la simulación de conflictos.
- La contingencia se probó con una operación de un artículo. No se probaron lotes de varias operaciones con conflictos de secuencia.

*Firmado: CENTINELA.*
