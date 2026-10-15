# PR #162 — integración y cierre técnico

Fecha: 2026-10-14, America/Tegucigalpa. Firma: **NEXUS**.

Se incorporó `origin/main` **be1a7fe71cec6c6818826e3158b1549f33095379** a la rama existente `fix/pilot-readiness`. El único conflicto fue `CONTEXTO_MAESTRO.md`; se conservaron las bitácoras de preparación, administración y auditoría backend. El commit de integración es `a3119f578742c0ae15443b5f438f12a53f9aeccc`.

## Cambios y compatibilidad

- Los merges #160 (`be1a7fe7`) y #163 (`6f16df94`) son ancestros del candidato. Se conservan íntegros: el diferencial con main de `backend/src`, `frontend/src` y `backend/prisma` es vacío. Las correcciones funcionales se prueban en conjunto, sin duplicarlas.
- #160: usuarios activos reales, restricciones por rol, protección del último administrador, sesiones revocables, soporte de solo lectura y trazabilidad. Se ejecutan las pruebas HTTP y PostgreSQL existentes de administración/autenticación.
- #163: importación atómica con errores por fila/campo e idempotencia, precios aprobables solo por ADMIN, totales de crédito, redondeo de venta/cotización en centavos y color `#RRGGBB`. Pasan las suites `importacion-productos` y `redondeo-cobro`, incluidas en las 935 pruebas PostgreSQL.
- La prueba de recuperación `backend/test/app.e2e-spec.ts` ahora arranca **AppModule completo** sobre PostgreSQL temporal. Verifica 200→503→200 sin reiniciar la API, la misma sesión antes/después, aislamiento ante una cabecera de otra empresa, 404 al pedir su usuario, escritura auditada, CAJERO 403 y token desactivado 401. Una sesión real de soporte creada antes de la caída sigue en solo lectura, rechaza escritura y acceso cruzado, puede finalizarse, queda revocada/auditada y no invalida la sesión normal del administrador. Código final de esta ampliación: `fea162726b958ce91172cad31446b606a5f5fe09`.
- Se conservan retención exclusiva de snapshots restaurados/verificados, confirmación de metadata tras etiquetar Restic, snapshot consistente para conteos y volcado, TLS/CA y bloqueo previo de archivos con checksum incorrecto. No se cambia ningún esquema ni migración.

## Validación local reproducible

Entorno: Node 24.19.0, Python 3.12.14, PostgreSQL 17.11 temporal como usuario sin privilegios, Restic 0.18.0 y Chromium 138.0.7204.0. Herramientas instaladas en scratch, fuera de las dependencias versionadas. Dependencias del proyecto instaladas con sus lockfiles y cliente Prisma regenerado antes de probar.

| Validación | Resultado | Evidencia |
|---|---|---|
| Backend unitarias, incluidas HTTP de guards/JWT | 446/446, 46 archivos | `backend-unit.log` |
| Frontend unitarias | 280/280 | `frontend-unit.log` |
| Scripts de respaldo y controles | 48/48 | `scripts.log` |
| Validador Python | 10/10 | `python.log` |
| PostgreSQL, con navegador opt-in | 935/935, 58 archivos, 0 omitidas | `postgres.log` |
| HTTP recuperación/autenticación/usuarios/soporte | 6/6 | `http-recovery.log` |
| Playwright, API simulada | 143/143 | `playwright-simulated.log` |
| Playwright con API/PostgreSQL reales, escritorio | 140 aprobadas, 10 omitidas, 0 fallos | `playwright-real-desktop.log` |
| Playwright con configuración móvil | 140 aprobadas, 10 omitidas, 0 fallos | `playwright-real-mobile.log` |
| Restic cifrado y consistencia | 4 respaldos/restauraciones, 2 fallos deliberados; 2 copias verificadas retenidas; integridad completa y clave incorrecta rechazada; venta concurrente fuera del snapshot | `restic.log` |
| Simulacro de reinicio y restauración completa | 14 comprobaciones, 0 fallos | `recovery-rehearsal.log` |
| Ensayo de actualización y reversión aislada | 24 comprobaciones, 0 fallos | `upgrade-rehearsal.log` |
| Builds y lint | Salida 0; avisos existentes | `*-build.log`, `*-lint.log` |
| Control de migraciones | 40 ejecutables; 0 migraciones nuevas; aprobado | `migration-guard.log` |

Logs completos y hashes: [evidencias/pr162-20261014/SHA256SUMS](evidencias/pr162-20261014/SHA256SUMS). Los errores sintéticos de auditoría, conexión o permisos impresos por tests negativos son intencionales; las suites terminan aprobadas.

Los diez skip no se modificaron. Cubren vuelto (2), canal web (2), reporte por cajero (2), latencia controlada (2), datáfono (1) y un caso histórico de entrega parcial (1). La entrega parcial se prueba realmente en `cobro-entrega-real.spec.ts`. La configuración móvil emula Pixel 7 en las fixtures; el spec de contingencia conserva su perfil persistente propio de escritorio y no acredita un teléfono físico.

La descarga del Chromium oficial de Playwright sigue bloqueada por la política de red (403, `browser-install-blocked.log`). Las pruebas locales usan `@sparticuz/chromium@138.0.2` en scratch, como la validación previa del PR. GitHub Actions instala el navegador oficial. No se cambiaron expectativas ni controles para resolver esa limitación.

Comandos principales, con `PG_BIN` apuntando a herramientas locales y `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` al binario compatible local:

```sh
npm ci --prefix backend
npm ci --prefix frontend
(cd backend && npx prisma generate && npm run build && npm test && npm run test:scripts)
(cd backend && python3 scripts/validar-inventario.test.py && npm run lint)
(cd frontend && VITE_API_URL=/api npm run build && npm test && npm run lint && npm run test:browser)
(cd backend && REAL_SETTINGS_BROWSER=1 npm run test:integration && npm run test:e2e)
(cd backend && FS41_INTEGRATION=1 node scripts/backup-worker.integration.mjs)
npm --prefix frontend run test:e2e-real
PW_CONFIG=playwright.real.mobile.config.ts npm --prefix frontend run test:e2e-real
bash backend/scripts/simulacro-recuperacion.sh
bash backend/scripts/ensayo-actualizacion-preproduccion.sh
node backend/scripts/verificar-migraciones.mjs --base origin/main
(cd docs/evidencias/pr162-20261014 && sha256sum -c SHA256SUMS)
```

Todas las migraciones de estos comandos se ejecutan exclusivamente en clústeres que los harness crean en `/tmp`; no se consultó una base productiva.

## Contratos pendientes de Claude (#161)

El frontend funcional queda en su PR. Entrega mínima para `ImportarProductosModal.tsx`, basada en el contrato ya integrado de #163:

1. Sustituir el bucle `POST`/`PUT` por una única llamada `POST /api/productos/importacion`: `{ solicitudId, filas, sobrescribir, aprobarPrecios, motivo }`, UUID estable para el reintento y nuevo para otra importación; hasta 5000 filas/2 MB.
2. Leer `precioVenta` y `precioCosto` sin convertir celda vacía en cero. Solo ADMIN envía precios o `aprobarPrecios`; BODEGUERO recibe 403 si lo hace. `aprobarPrecios` exige decisión del dueño antes del uso operativo.
3. En 400 con `code: IMPORTACION_INVALIDA`, mostrar `errores: [{ fila, codigo, campo, mensaje }]` por fila/campo. Consumir `advertencias` y acciones `CREADO|ACTUALIZADO|SIN_CAMBIOS|OMITIDO`. En 409 por solicitud reutilizada con otros datos o `PRODUCTO_VERSION`, pedir recargar y revisar.
4. Mostrar `estadoPrecio: APROBADO|PENDIENTE_APROBACION|SIN_PRECIO`. En comprobantes de crédito, usar `totalFacturado`, `totalCobrado`, `saldoPendiente`; no tratar el total facturado como cobrado.

Contrato íntegro: [AUDITORIA_BACKEND_CORRECCIONES_20261013.md, sección 4](AUDITORIA_BACKEND_CORRECCIONES_20261013.md#4-contratos-api-que-debe-consumir-claude-frontend). No se agregó un contrato nuevo de errores de factura por campo: la validación DTO sigue devolviendo `message` según los validadores; Claude debe consumir esa respuesta existente hasta que se defina otro requisito.

## Riesgos y pendientes concretos

1. **Operación de respaldos externos:** solo se verificaron repositorios cifrados locales temporales y ensayos. Faltan configurar/comprobar destino externo, custodia de claves y entrega de alertas con el responsable de infraestructura. El éxito técnico del PR no certifica ese destino.
2. **UI/PWA:** una ruta lazy no visitada en línea puede carecer de su chunk al abrirse offline. Claude debe definir las rutas garantizadas y preparar/verificar esos chunks en `App.tsx`/service worker. La prueba de logout prepara `/arqueo-caja`; no garantiza todas las rutas offline. La adaptación del importador permanece pendiente en #161; no se acreditó su integración conjunta.
3. **Integridad en base:** `tenant-fk-propuesta.postgres.integration.ts` confirma que `productos_proveedores` acepta referencias cruzadas mediante SQL directo antes de la propuesta de FK compuestas. La API mantiene aislamiento en los casos probados; esas FK siguen propuestas fuera de `prisma/migrations`. NEXUS necesita auditoría de solo lectura de la base real y una migración revisada/autorizada para cerrar esa defensa. No se ejecutó aquí.
4. **Aceptación del piloto:** siguen sin comprobarse respaldo de datos reales, Safari/WebKit, equipos/UPS, impresión y apagón físicos. La contingencia operativa permanece deshabilitada hasta las decisiones/pruebas del cliente. También siguen las decisiones existentes de #163 sobre aprobación CSV y vencimiento de crédito; el redondeo de otros módulos no se unificó en este PR.

## Criterio de entrega

**MERGE para el alcance técnico de #162 cuando los workflows `Operación de ferretería` (validate y guard-base-datos) y `Piloto con API y PostgreSQL reales` aprueben el HEAD publicado.** El SHA final, las ejecuciones exactas y la recomendación definitiva se registran en la descripción/comentario del [PR #162](https://github.com/Nelosama/FerreSystem/pull/162), después de publicar esta evidencia. Un check de un HEAD anterior no sustituye ese control.

Esto no autoriza producción. No se crearon ramas de trabajo adicionales ni PR, no se modificó main, no se ejecutaron migraciones productivas, no se desplegó ni se fusionó el PR. La exclusión de previews de `fix/pilot-readiness` sigue vigente. Los archivos funcionales del #161 y sus imágenes versionadas permanecen intactos.
