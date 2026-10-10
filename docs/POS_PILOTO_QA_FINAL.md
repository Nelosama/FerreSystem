# POS offline — validación final de integración y preproducción

**Estado: candidato técnicamente validado para piloto controlado. NO desplegado. NO activo para clientes reales.**
PR: [Nelosama/FerreSystem#129](https://github.com/Nelosama/FerreSystem/pull/129) (borrador hacia `main`). Sin merge, sin despliegue, sin migraciones productivas.

## 1. Commits y procedencia

| Origen | SHA integrado | Estado en #129 |
|---|---|---|
| `main` base | `7ccfad25` | Ancestro de la rama |
| #127 P1 operaciones (`claude/p1-operaciones`) | `1deb3117` (primera ronda) | Incluido |
| #127 segunda ronda | `caa5aa15` (`22388edc` simulador de productos; `caa5aa15` contexto) | Incluido (`a4cda7e3`) |
| #128 contingencia POS (`claude/pos-offline-backend`) | `f281be62` (último) | Incluido (ancestro verificado) |
| Integración: conflictos resueltos | `2ab05cd0`, `814f3b46` | |
| Correcciones de integración | `99df299c`, `5c5df9bb`, `6f683331`, `93819d3d`, `f2f4b44e`, `bc0a0125` | |
| Esta validación | `backend/prisma/schema.prisma` (FK `operaciones_contingencia.venta`), `backend/test/piloto-flujo-completo.postgres.integration.ts` | Ver HEAD en §2 |

Comprobación: `git merge-base --is-ancestor` confirma que `caa5aa15` y `f281be62` son ancestros de la rama; `git log HEAD..origin/claude/p1-operaciones` y `HEAD..origin/claude/pos-offline-backend` vacíos.

## 2. Pruebas ejecutadas y evidencia

Entorno: Linux (contenedor). PostgreSQL 16 temporal, usuario no root (`nobody`). Chromium 1194 instalado (`/opt/pw-browsers/chromium`) vía `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

| # | Suite | Comando | Resultado | Sobre commit |
|---|---|---|---|---|
| 1 | Backend unitarias | `npx vitest run` | **345/345** | `bc0a0125` (antes del cambio de esquema; el esquema no afecta la ejecución unitaria, ver nota) |
| 2 | Backend `tsc -p tsconfig.build.json` | `--noEmit` | Sin errores | `bc0a0125` |
| 3 | Backend `oxlint --type-aware src test` | | Sin errores | `bc0a0125` |
| 4 | Frontend unitarias | `npm test` | **224/224** | `bc0a0125` |
| 5 | Frontend build | `VITE_API_URL=/api npm run build` | Correcto (`tsc -b` + `vite build`) | `bc0a0125` |
| 6 | Frontend lint | `oxlint src test e2e` | Sin errores | `bc0a0125` |
| 7 | Integración PostgreSQL (suite completa, 22 archivos) | `vitest run --config vitest.config.integration.ts` con `REAL_SETTINGS_BROWSER=1` | **372/372** | `bc0a0125` (antes del cambio de esquema) |
| 8 | Integración: contingencia + flujo piloto (tras el cambio de esquema) | mismo config, 2 archivos | **31/31** (25 contingencia + 6 piloto) | `93819d3d` + cambio de esquema |
| 9 | E2E real (`frontend/e2e-real/run.sh`: PostgreSQL temporal, API NestJS compilada, Chromium) | | **29/29**, incluidas **14** de contingencia | `bc0a0125` |
| 10 | E2E con backend simulado (`playwright test`) | `VITE_API_URL=/api` | **118/118** | `bc0a0125` |
| 11 | Respaldo: pruebas de programación | `node --test backend/scripts/backup-worker.test.mjs` | **6/6** | `bc0a0125` |

**Nota de procedencia:** la suite de integración completa (372) y la unitaria (345) se ejecutaron antes del cambio de `onDelete` en el esquema. Ese cambio no altera el comportamiento en ejecución (la migración ya define `RESTRICT`; el esquema solo lo declaraba implícitamente como `SetNull`). Se revalidaron las pruebas que tocan esa tabla (fila 8). Si se quiere evidencia completa sobre el commit final, repetir filas 1 y 7 sobre el HEAD que se publique.

Logs en el contenedor de validación: `scratchpad/val/` (no versionados).

## 3. Migraciones sobre PostgreSQL 16 limpio

Comando: `npx prisma migrate deploy` sobre una base vacía (clúster nuevo, usuario `postgres`).

- **15 de 15** migraciones aplicadas, `finished_at` informado, **0 fallidas**, en el orden de carpeta.
- Las dos migraciones del piloto aplicadas al final y en orden:
  1. `20261010140000_productos_proveedores` (#127): tabla `productos_proveedores`.
  2. `20261011000000_pos_contingencia_offline` (#128): columnas aditivas en `ventas`, tablas `dispositivos_pos`, `catalogo_instantaneas`, `contingencia_ventanas`, `operaciones_contingencia`, trigger de inmutabilidad.

**Deriva de esquema** (`prisma migrate diff --from-url … --to-schema-datamodel`):

- Tablas del piloto: solo diferencias de **nombre** de restricciones e índices (9 renombrados). Ningún cambio de columna ni de tipo.
- Una diferencia **de comportamiento** en `operaciones_contingencia.venta_id`: el esquema, sin `onDelete` explícito, aplicaba `SetNull` por defecto de Prisma en relaciones opcionales; la migración usa `RESTRICT`. Corregido: `onDelete: Restrict` declarado en `backend/prisma/schema.prisma`. Razón: `SetNull` rompería el check `estado <> 'APLICADA' OR venta_id IS NOT NULL` si se borrara una venta.
- Deriva **preexistente en `main`** (no introducida por esta integración): unas 170 líneas de diferencias en tablas como `costos_compra`, `cuentas_operativas`, `clientes.lista_precio_id`, `apartados`, `devoluciones`, y `DEFAULT` de IDs. `run.sh` solo comprueba `coberturas_garantia`. **Riesgo:** `prisma migrate dev` generaría una migración grande; usar solo `migrate deploy` tras inspección (ver §8).

## 4. Flujo completo del piloto (prueba nueva)

`backend/test/piloto-flujo-completo.postgres.integration.ts`: 6 pruebas contra PostgreSQL real con servicios reales.

| Paso | Prueba | Verificación |
|---|---|---|
| Registrar proveedor | `operaciones.proveedor` (ADMIN) | Proveedor creado |
| Registrar compra | `operaciones.compra` (10 × 6.00, FAC-PILOTO-1) | Orden creada |
| Recibir inventario | `operaciones.recibir` | Stock 20 → 30 |
| Costo vigente | Recepción | `precioCosto` 4 → 6; `ultimoCosto` del proveedor 6 |
| Venta con conexión | `ventas.create` (2 × 10.00) | **Reserva** (`stockReservado`=2); stock físico 30 |
| Entrega de la venta en línea | `operaciones.entregar` | Reserva 0; stock 28; costo de línea 6 |
| Emitir ventana y vender en contingencia | `contingencia.emitirVentana` + lote | Stock 28 → 26; `origen=CONTINGENCIA`; costo de ventana 6 |
| Recuperar conexión y sincronizar | `recibirLote` | APLICADA, sin revisión |
| Reenvío tras pérdida de respuesta | mismo UUID | Misma venta; sin duplicar venta, stock ni caja |
| Conciliar inventario | 20 + 10 − 2 − 2 | = 26 |
| Conciliar caja | `operaciones.cerrar` con apertura + ventas | Diferencia **0** |
| Consulta administrativa | `contingencia.listar` y `resumen` | Operación `APLICADA`, cajero, origen separado |

**Pruebas negativas** (mismo archivo):

- Un cajero no registra proveedores ni compras (rechazo, sin filas creadas).
- Un cajero no resuelve operaciones en revisión (rechazo).
- Un lote de un cajero no puede registrar operaciones de otro (no se aplica; stock intacto).
- Idempotencia: mismo UUID con otro contenido → no se aplica, queda en revisión; una sola venta.
- Aislamiento: otra empresa no lista ni resuelve operaciones de esta.

Cobertura adicional en `contingencia.postgres.integration.ts` (25 pruebas: conflictos de precio, stock, caja cerrada, usuario desactivado, ventana revocada, límites, inmutabilidad del diario, aislamiento, costo vigente).

## 4b. Regla de negocio confirmada: venta offline = venta normal

Verificación contra el código de `claude/integracion-pos-offline-p1` (PR #129). Sin reimplementación: solo corrección del defecto de la fila 3 y pruebas faltantes.

| Requisito | Dónde se cumple | Evidencia |
|---|---|---|
| 1. Cajero selecciona productos | `PosContingenciaPage.tsx` | E2E real 2 |
| 2. Cobra en efectivo y calcula cambio | `cobrar()` calcula `cambioCentavos = efectivo − total` | E2E real 1 y 4 (efectivo, cambio y total en servidor) |
| 3. Guardado durable antes de confirmar | `registrarOperacion` → `transaccion` resuelve solo en `oncomplete` (durabilidad `strict`) | Simulado: cuota llena → «NO se guardó», sin comprobante, sin operación |
| 4. Comprobante interno | Bloque «Venta guardada en este equipo: CT-NN-NNNN» con total, recibido y cambio | E2E real 1 y 2 |
| 5. Entrega de la mercancía | Mensaje «Entregue el cambio y la mercancía» solo después del guardado | Mismo flujo que 3 |
| 6. Siguiente cliente sin esperar internet | `cobrar()` no espera la sincronización (`void sincronizar()`); el botón «Siguiente cliente» queda disponible | **Nueva** prueba simulada: la venta 2 se guarda con el envío de la venta 1 colgado |
| Conservar UUID, correlativo CT, productos, cantidades, precios, efectivo y cambio | Registro `OperacionLocal` (`NuevaOperacion` + `secuenciaLocal`, `correlativoLocal`) | E2E real 1 y 4; integración PostgreSQL |
| Salida de inventario asociada | Local: la línea reduce el disponible del equipo al instante (`disponibleLocal`). Central: un movimiento `ENTREGA` por operación al sincronizar | **Nuevo** en `piloto-flujo-completo`: una salida con `cantidad=-2`, anterior 28, nuevo 26; el reenvío no añade ninguna |
| Sincronizar al recuperar conexión | Evento `online` y cada 30 s; `sincronizarPendientes` | E2E real 3 |
| Idempotencia y sin doble descuento | UUID de operación; `ventas`, `movimientos_caja` y `movimientos_inventario` no se duplican tras reenvío | Integración contingencia 167 y piloto; E2E real 7 |
| Conflictos retenidos para revisión | Estados `REVISION` con motivo; el administrador resuelve con nota de 10 caracteres | E2E real 9 y 12; integración de conflictos |

**Defecto corregido en esta verificación** (`PosContingenciaPage.tsx`): `recargarDiario()` estaba dentro del `try` del guardado. Si releer la lista fallaba **después** de guardar, el `catch` mostraba «La venta NO se guardó… No entregue la mercancía», aunque la venta sí estuviera en el diario. Riesgo: el cajero no entrega una mercancía ya cobrada, o la vuelve a cobrar. Corrección: la relectura ya no afecta al resultado del guardado; si falla, el aviso dice que la venta está guardada y que hay que recargar la página. Prueba que lo reproduce: `contingencia-simulado.spec.ts` «si la lista del diario falla después de guardar…» (fallaba antes de la corrección; pasa después).

**Brechas abiertas (no corregidas, decisión del dueño):**

- **Comprobante sin detalle de productos.** El comprobante muestra correlativo, total, recibido y cambio, pero no las líneas. «Imprimir comprobante» imprime la página completa, no un comprobante. La regla pide «comprobante interno»; el detalle de líneas debe confirmarse con el dueño antes de cambiar la pantalla.
- **Stock central desfasado mientras la venta no se sincroniza.** Es inherente al modo offline: el movimiento `ENTREGA` se registra al sincronizar, no al cobrar. Los reportes de inventario del servidor no reflejan la venta hasta entonces; el equipo sí la refleja. Documentar para el administrador.
- **Venta en línea reserva; venta offline descuenta de inmediato.** Ver §7 (riesgo alto). La regla «venta normal» exige decidir si la venta en línea de efectivo también debe entregar automáticamente.

**Ejecución de esta verificación:** simulada 120/120; E2E real 29/29 (14 de contingencia); frontend unitarias 224/224; build con `VITE_API_URL=/api`; integración de contingencia y piloto 31/31 (con las dos nuevas aserciones de inventario).

## 5. Service worker, almacenamiento lleno y pérdida de respuesta

| Riesgo | Cobertura | Resultado | Límite |
|---|---|---|---|
| Actualización del service worker | `contingencia-real.spec.ts` (14): una versión nueva espera y no se activa mientras se cobra | ✅ real | Chromium en Linux. Sin Windows ni Safari |
| Almacenamiento lleno | `contingencia-simulado.spec.ts`: `QuotaExceededError` inyectado en la escritura del diario | ✅ simulado: el cobro no se confirma, no hay comprobante ni operación a medias | No es un disco lleno real |
| Pérdida de respuesta HTTP | `contingencia-real.spec.ts` (7) y `contingencia.postgres.integration.ts` (reenvío idempotente) | ✅ una sola venta | Pérdida simulada por la red del navegador |
| Timeout de red | `contingencia-simulado.spec.ts` (petición colgada) | ✅ la venta vuelve a pendiente y se envía una vez | Timeout de 20 s del cliente; latencia real de la tienda no medida |

**Inspección del código del service worker** (`frontend/public/sw.js`):

- No llama a `skipWaiting`: una versión nueva espera a que se cierren las pestañas. Correcto para no interrumpir un cobro.
- `/api` nunca se cachea ni se responde desde caché.
- Navegación: red primero, `index.html` cacheado como respaldo.
- **Riesgo residual:** `VERSION` es fijo (`ferresystem-shell-v1`). El caché no elimina los archivos de builds anteriores (los nombres hash se acumulan). Crecimiento de almacenamiento no acotado a lo largo de varios despliegues. Pendiente decidir: cambiar `VERSION` por release o purgar por lista de recursos del build.

## 6. Defectos corregidos en esta validación y en la integración

| # | Defecto | Dónde | Corrección | Commit |
|---|---|---|---|---|
| 1 | Costo de una venta offline tomado al sincronizar en lugar del de la ventana | `contingencia.service.ts` | Costo de la instantánea | `99df299c` |
| 2 | Sincronización sin timeout (cola bloqueada ante red colgada) | `frontend/src/offline/sync.ts` | `TIMEOUT_CONTINGENCIA_MS = 20 000` en las cuatro llamadas | `99df299c` |
| 3 | La caja no veía la decisión del administrador sobre una revisión | `sync.ts` | `refrescarRevisiones` al terminar el envío | integración |
| 4 | Refresh de sesión sin respuesta de la API borraba la sesión del cajero | `frontend/src/utils/authInterceptors.ts` | Solo se borra con respuesta de rechazo | `cd1dfaf9` |
| 5 | Suite simulada FS-07: 9 fallos por petición de proveedores por producto no interceptada (#127) | `frontend/e2e/productos-edicion.spec.ts` | Mock de `GET …/proveedores` (dos commits idénticos; duplicado retirado) | `5c5df9bb`, `22388edc`, `f2f4b44e` |
| 6 | Prueba de contingencia sin asociación producto–proveedor | `contingencia.postgres.integration.ts` | Aserción de último costo | `5c5df9bb` |
| 7 | FK de `operaciones_contingencia.venta` con `SetNull` implícito frente a `RESTRICT` en la migración | `backend/prisma/schema.prisma` | `onDelete: Restrict` explícito | **esta validación** |
| 8 | Prueba opt-in de Chromium real sin ruta de navegador en este entorno | entorno | `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` (no es defecto del código) | — |

Falsos fallos del entorno, no del producto:

- `frontend` `npm run build` sin `VITE_API_URL` falla **a propósito** (guarda de build de producción). Usar `VITE_API_URL=/api` en el build del piloto.
- Playwright 1.63 busca `chromium_headless_shell-1243` no instalado; apuntar al ejecutable instalado.

## 7. Riesgos residuales

| Riesgo | Severidad | Mitigación para el piloto |
|---|---|---|
| **Semántica de inventario distinta:** la venta en línea reserva y el stock baja al entregar; la venta offline entrega de inmediato. | **Alta (decisión de negocio)** | Procedimiento: en el piloto, entregar cada venta en línea en el mismo mostrador (`/operaciones/ventas/:id/entregar`) y revisar reservas al cierre. Decidir si la venta en línea de efectivo debe entregar automáticamente. |
| D1 fiscal: el comprobante de contingencia no tiene aprobación del responsable fiscal | **Bloqueante para clientes reales** | No activar fuera de piloto interno |
| Límites por defecto (L 5 000 por venta, L 25 000 acumulado, cupo 50 %, 36 h) sin decisión comercial | Alta | Usar los valores por defecto solo en piloto; el propietario debe confirmarlos |
| Caja de contingencia única por empresa (`dispositivosMax=1`) | Media | Un equipo registrado; cambio de equipo requiere que un administrador desactive el anterior. Probarlo en la tienda |
| Deriva de esquema preexistente en `main` (~170 líneas) | Alta para futuras migraciones | Solo `migrate deploy`; nunca `migrate dev` ni `db push` en producción |
| Caché del service worker sin purga por versión | Media | Pedir a los cajeros cerrar pestañas tras actualizar; revisar tamaño de caché en Windows |
| Rutas `/pos-contingencia`, `/contingencia-admin` y `/admin-movil` sin entrada en el menú | Media | Acceso por URL documentado en el runbook |
| Textos de contingencia solo en español | Baja | Aceptable para el piloto; confirmar con el usuario final |
| Durabilidad de IndexedDB ante corte eléctrico no demostrada | **Alta** | Protocolo físico §10 de este documento y `POS_CONTINGENCIA_PROTOCOLO_APAGON.md`; no ejecutado |
| Latencia y cortes reales de la tienda no medidos | Media | Medir durante la prueba física |

## 8. Respaldo y restauración antes de cualquier migración

Revisado `docs/FS-41-RESPALDOS.md`, `docs/INSTALACION_Y_ACTUALIZACION_SEGURA.md`, `backend/scripts/migration-safe.mjs`, `backup-preflight.mjs`, `restore-verify.mjs`, `backup-verify-isolated.mjs`.

Verificado: pruebas del worker de respaldo 6/6. **No ejecutado en esta sesión:** la prueba de integración con restic y `pg_dump` (`FS41_INTEGRATION=1`), ni restauración contra una copia real.

Procedimiento mínimo antes de aplicar #127 + #128 sobre una base existente (nunca sobre producción sin autorización):

1. `npm run migrate:inspect` sobre una **copia** de la base. Si devuelve BLOQUEADA, detener y revisar historial, baseline y checksums.
2. Respaldo cifrado: `PGSERVICE=… node scripts/backup-preflight.mjs <carpeta privada>`; registrar hora, origen y pausa operativa.
3. Restaurar el respaldo en base aislada: `npm run backup:verify-restore -- <manifest.json>` y revisar conciliación por empresa.
4. `npm run migrate:deploy` sobre la copia restaurada. Revisar `_prisma_migrations`: 15 filas, 0 fallidas.
5. Pruebas de humo en la copia: login, venta en línea, compra, cierre de caja, panel `/contingencia-admin`.
6. Solo entonces, decisión del responsable para producción. `--through` debe ser la última migración cuyo efecto ya está en la base (no la última del repositorio).

Nota: `migration-safe.mjs` refuerza el arranque productivo; la política del repositorio es que los datos de clientes solo se restauren en base aislada con revisión del dueño de datos.

## 9. Bloqueos fiscales y decisiones comerciales pendientes

No sustituyen la aprobación del responsable fiscal ni la del propietario.

| Ítem | Qué falta | Quién decide |
|---|---|---|
| D1 fiscal: leyenda y procedimiento del comprobante de contingencia | Revisión y aprobación escrita | Responsable fiscal de la empresa |
| Numeración: `CT-NN-NNNN` (local) y `V-NNNNNNNN` (definitiva) no son factura SAR/CAI | Confirmar que el documento de contingencia no se presenta como fiscal | Responsable fiscal |
| Límites: L 5 000 por venta, L 25 000 acumulado, cupo 50 %, 36 h | Confirmar valores | Propietario |
| Caja única por empresa | Confirmar si es suficiente | Propietario |
| Semántica de entrega de ventas en línea (§7) | Decidir entrega automática o manual | Propietario y operación |
| Costo de la ventana: el costo se fija al emitir la ventana, no en cada venta | Confirmar la regla contable | Contador |

## 10. Checklist físico (no ejecutado)

Ver `docs/POS_PILOTO_CHECKLIST_FISICO.md`. Ninguna prueba física se declara ejecutada en este documento.

## 11. Instrucciones para ejecutar el piloto controlado

Precondiciones (todas):

1. Decisión de D1 fiscal documentada **o** piloto con cliente interno sin ventas reales.
2. Migraciones aplicadas en una copia según §8, con respaldo verificado.
3. Build del frontend con `VITE_API_URL=/api` (o HTTPS del API).
4. `POS_OFFLINE_ENABLED=true` **solo** en el servidor del piloto. Por defecto está apagado.

Activación (en la empresa piloto, por ADMIN):

1. Activar `configuracion.contingenciaOffline.habilitada` (endpoint `/contingencia/configuracion`).
2. Registrar un único equipo (`dispositivosMax=1`) desde `/pos-contingencia`.
3. Abrir caja con el cajero.
4. Emitir ventana (se hace desde el equipo con caja abierta).

Operación de prueba:

1. Vender con conexión y entregar la venta en línea.
2. Desconectar la red del equipo; vender en contingencia; comprobar la leyenda y el correlativo `CT-01-NNNN`.
3. Reconectar; esperar la sincronización; verificar en `/contingencia-admin`.
4. Resolver cualquier revisión con nota de al menos 10 caracteres.
5. Cerrar caja con el efectivo contado; la diferencia debe ser cero o explicada.
6. Exportar el diario (`exportarDiario`) y verificar que no contiene tokens.

Criterios para detener el piloto:

- Cualquier venta que falte en el servidor tras sincronizar.
- Cualquier duplicado de venta o de stock.
- Cualquier diferencia de caja no explicada.
- Pérdida de un diario local al reiniciar el equipo.

## 12. Recomendación técnica

**NO-GO para clientes reales y para activar la función en producción.**

**GO técnico para un piloto controlado interno** (empresa de prueba o tienda con supervisión), con la función apagada por defecto y activada solo en el equipo piloto, bajo las precondiciones de §11.

Razones:

- La cadena de migraciones se aplica limpia y en orden; la deriva de las tablas nuevas es solo de nombres salvo un defecto corregido.
- Todas las suites ejecutables en este entorno pasan.
- Faltan pruebas que solo un equipo físico puede dar: durabilidad de IndexedDB ante corte, Windows, Safari/iPhone.
- Faltan decisiones fiscales y comerciales que no puede tomar la técnica.
- La semántica de entrega de ventas en línea debe decidirse antes de un piloto con ventas reales.

Este documento no sustituye la aprobación fiscal ni las pruebas físicas.
