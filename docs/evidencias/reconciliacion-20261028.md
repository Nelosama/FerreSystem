# Reconciliación de main — 2026-10-28

## Alcance

Verificación de ascendencia e integración de UX y ejecución de `npm test` del frontend. Se conserva la rama `claude/reconciliacion-main-20261028`. Sin restaurar código antiguo, cambiar aserciones, hacer commit, push, merge o despliegue. `docs/CONTEXTO_MAESTRO.md` permanece intacto por instrucción expresa del usuario.

## 1. Base e integración de UX

El árbol estaba limpio al empezar. `HEAD`, `main` y `origin/main` locales apuntan a **`53e2cc9573cd73eb2c162041e87bda1e57f9db4a`**. La consulta del commit `main` mediante el conector GitHub confirmó el mismo SHA remoto (merge de #209).

| Comprobación | Resultado |
| --- | --- |
| `git branch --show-current` | `claude/reconciliacion-main-20261028` |
| `git reflog show --format='%h %gs' claude/reconciliacion-main-20261028 -3` | `53e2cc95 branch: Created from main` |
| `git merge-base main HEAD` | `53e2cc9573cd73eb2c162041e87bda1e57f9db4a` |
| `git rev-list --left-right --count main...HEAD` | `0 0` |
| `git diff --stat main` antes de redactar | Vacío |
| `git merge-base --is-ancestor 86bd1d74 main` | Salida 0: merge de #188 integrado |
| `git merge-base --is-ancestor 99033569 main` | Salida 0: HEAD final de #188 integrado |
| `git merge-base --is-ancestor claude/ux-ronda1-pos-marca main` | Salida 0: referencia local antigua también integrada |

[PR #188](https://github.com/Nelosama/FerreSystem/pull/188), consultado en GitHub: `closed`, `merged=true`, base `main`, origen `claude/ux-ronda1-pos-marca`, HEAD final `990335697173c54abda460716d147cb5d3364ae6`, fusionado el **2026-10-22 a las 21:41:57 UTC** mediante **`86bd1d743acf34bc664b8e2ff1d7616bf1e91f1a`**. El commit local tiene padres `97609ed5` y `99033569` y el mensaje `Merge pull request #188 from Nelosama/claude/ux-ronda1-pos-marca`.

La referencia local de la rama antigua está en `0508542b7a276f0a6f932eb7821a0b8d34db47f2`, anterior al HEAD final del PR; no debe confundirse con su contenido final. La integración se verifica con el HEAD del PR y su merge, no solo con esa referencia local.

Comprobaciones de conservación: `frontend/src/utils/colorMarca.ts` y `frontend/src/components/MarcaJowa.tsx` no tienen diferencias entre `86bd1d74` y HEAD. El POS actual conserva F2/F8 (`frontend/src/pages/POSPage.tsx:87`) y `aria-pressed` en métodos de pago (`:1008`). Esto confirma integración histórica y presencia de elementos concretos; no constituye aceptación visual de toda la UX. Los cambios posteriores de main se conservan.

Consulta de PR abiertos (`repo:Nelosama/FerreSystem is:open`): devuelve [#210, Corregir regresiones de CI en Mi cuenta](https://github.com/Nelosama/FerreSystem/pull/210). No se incorporó su código. `gh` no está instalado y `git ls-remote origin refs/heads/main` no pudo conectar a GitHub:443 desde la terminal; se verificó el remoto con el conector GitHub, sin modificar refs.

**Conclusión:** la rama fue creada desde main y coincide con él; UX #188 ya está integrada. No hay código antiguo que restaurar.

## 2. Suite de frontend

Entorno: Windows, PowerShell, Node **v24.16.0**, npm **11.13.0**. Se ejecutó desde `C:\Users\Nelo\Documents\GitHub\FerreSystem\frontend`, sobre el mismo commit y código de main, manteniendo la rama solicitada.

### Primera ejecución

Comando de pruebas: **`npm test`**, cuyo script es **`node --test test/*.test.mjs`**. Captura y código de salida en PowerShell:

```powershell
npm test *> "$env:TEMP\ferresystem-frontend-20261028.log"
$testExit = $LASTEXITCODE
```

| Métrica del runner | Resultado |
| --- | ---: |
| tests | 548 |
| suites | 4 |
| pass | 519 |
| fail | 6 |
| cancelled | 0 |
| skipped | 23 |
| todo | 0 |
| duration_ms | 13404.5827 |
| Código de salida de npm test | 1 |

Además de los seis casos contabilizados como `fail`, el runner señala **dos suites con error durante su construcción**, `cameraError()` y `startBarcodeCamera()`. No deben sumarse como dos casos adicionales al contador oficial, ni considerar probados sus casos internos no registrados.

### Clasificación individual de fallos

| Archivo y línea | Caso / grupo | Clasificación | Evidencia |
| --- | --- | --- | --- |
| `frontend/test/barcode-scanner.test.mjs:55` | Suite `cameraError()` | Problema del entorno: portabilidad del arnés a Windows | `loadTs`, línea 24, abre `new URL(...).pathname`; resulta `C:\C:\Users\...\barcodeScanner.ts`, error `ENOENT` antes de registrar sus casos. |
| `frontend/test/barcode-scanner.test.mjs:91` | Suite `startBarcodeCamera()` | Problema del entorno: portabilidad del arnés a Windows | Misma ruta inválida; carga en línea 147, sin ejecutar el comportamiento de cámara. |
| `frontend/test/barcode-scanner.test.mjs:324` | `NotFoundException → devuelve null (no lanza)` | Problema del entorno | `loadDecoder`, línea 288, produce ruta `C:\C:\Users\...\zxingDecoder.ts`; `ENOENT`. |
| `frontend/test/barcode-scanner.test.mjs:332` | `ChecksumException → devuelve null (no lanza)` | Problema del entorno | Mismo `ENOENT` en `loadDecoder`, antes de la aserción funcional. |
| `frontend/test/barcode-scanner.test.mjs:340` | `FormatException → devuelve null (no lanza)` | Problema del entorno | Mismo `ENOENT` en `loadDecoder`. |
| `frontend/test/barcode-scanner.test.mjs:348` | `decodificación exitosa → devuelve el texto del código` | Problema del entorno | Mismo `ENOENT` en `loadDecoder`. |
| `frontend/test/barcode-scanner.test.mjs:356` | `createZxingDecoder() devuelve null si video sin dimensiones` | Problema del entorno | Mismo `ENOENT` en `loadDecoder`. |
| `frontend/test/pos-offline-caracterizacion.test.mjs:125` | `el service worker existe, no cachea la API y el POS base sigue sin persistir catálogo (el de contingencia es otra página)` | Problema del entorno: separadores del arnés | La línea 137 compara `['src\\main.tsx']` real con `['src/main.tsx']` esperado; `walk` usa `path.join` en Windows. Es el mismo archivo, sin evidencia de una regresión del service worker. |

Balance de los **6 casos fallidos**: **6 problemas del entorno, 0 expectativas obsoletas identificadas, 0 defectos funcionales demostrados**. Hay defectos de portabilidad en las pruebas; esta clasificación no implica que el producto completo esté libre de defectos. La suite `createImageDecoder() — luminancia` también aparece roja por sus cinco casos fallidos, sin constituir un fallo independiente.

Las **23 omisiones** corresponden a `frontend/test/vercel-pilot-guard.test.mjs:37`, que ya contiene `skip: process.platform === 'win32'`. No se añadió ninguna omisión. No se ejecutaron Playwright, backend, integración de BD ni pruebas físicas.

### Estado de dependencias

Existía `node_modules` y permitió ejecutar la suite. La comprobación posterior `npm ls --depth=0` detectó `UNMET DEPENDENCY sweetalert2@11.26.25` (salida 1). Por ello la primera ejecución se identifica como realizada con dependencias preexistentes incompletas, aunque sus fallos observados tienen las causas concretas de rutas descritas arriba. Se intentó una instalación limpia con `npm ci`; resultado registrado a continuación.

### Instalación limpia y comprobación posterior

Comando: `npm ci --cache "$env:TEMP\ferresystem-npm-cache"`, desde `frontend`, salida **1**. El registro de npm muestra descargas de `registry.npmjs.org` fallidas con **EACCES** (incluidos TypeScript y SweetAlert2), seguidas de `Exit handler never called!`. Clasificación: **problema del entorno de instalación/red**, no defecto funcional ni expectativa obsoleta. No se obtuvo una instalación limpia y `node_modules` quedó incompleto tras el intento.

Se ejecutó nuevamente **`npm test`** después de ese fallo, capturando en `$env:TEMP\ferresystem-frontend-post-ci-20261028.log`. Resultado exacto: **105 tests, 0 suites, 32 pass, 50 fail, 0 cancelled, 23 skipped, 0 todo, 575.6158 ms; salida 1**. Los 50 fallos son de carga de archivos por TypeScript ausente (`ERR_MODULE_NOT_FOUND`, `Cannot find package ...\node_modules\typescript\index.js`); no representan 50 regresiones de producto ni son comparables con los casos internos de la primera pasada. Todos se clasifican individualmente como **problema del entorno: dependencias incompletas tras npm ci fallido**:

| Archivo bajo `frontend/test/` | Clasificación y causa |
| --- | --- |
| `alertas-lifecycle.test.mjs` | Entorno: TypeScript no instalado; falla al importar, antes de las aserciones. |
| `alertas.test.mjs` | Entorno: TypeScript no instalado; falla al importar, antes de las aserciones. |
| `auditoria-devoluciones-zona.test.mjs` | Entorno: TypeScript no instalado; falla al importar, antes de las aserciones. |
| `auth-session.test.mjs` | Entorno: TypeScript no instalado; falla al importar, antes de las aserciones. |
| `auto-refresh.test.mjs` | Entorno: TypeScript no instalado; falla al importar, antes de las aserciones. |
| `barcode-camera-lifecycle.test.mjs` | Entorno: TypeScript no instalado; falla al importar, antes de las aserciones. |
| `barcode-decoder-real.test.mjs` | Entorno: TypeScript no instalado; falla al importar, antes de las aserciones. |
| `barcode-scanner.test.mjs` | Entorno: TypeScript no instalado; falla al importar, antes de las aserciones. |
| `clientes-credito-ui.test.mjs` | Entorno: TypeScript no instalado; falla al importar, antes de las aserciones. |
| `clientes-validation.test.mjs` | Entorno: TypeScript no instalado; falla al importar, antes de las aserciones. |
| `color-hex.test.mjs` | Entorno: TypeScript no instalado; falla al importar, antes de las aserciones. |
| `color-marca.test.mjs` | Entorno: TypeScript no instalado; falla al importar, antes de las aserciones. |
| `compra-costo.test.mjs` | Entorno: TypeScript no instalado; falla al importar, antes de las aserciones. |
| `comprobante-contingencia.test.mjs` | Entorno: TypeScript no instalado; falla al importar, antes de las aserciones. |
| `contabilidad-ui.test.mjs` | Entorno: TypeScript no instalado; falla al importar, antes de las aserciones. |
| `cotizaciones-conversion.test.mjs` | Entorno: TypeScript no instalado; falla al importar, antes de las aserciones. |
| `cotizaciones-filters.test.mjs` | Entorno: TypeScript no instalado; falla al importar, antes de las aserciones. |
| `cuentas-inicio.test.mjs` | Entorno: TypeScript no instalado; falla al importar, antes de las aserciones. |
| `devoluciones-recovery.test.mjs` | Entorno: TypeScript no instalado; falla al importar, antes de las aserciones. |
| `fechas-negocio.test.mjs` | Entorno: TypeScript no instalado; falla al importar, antes de las aserciones. |
| `format-fecha.test.mjs` | Entorno: TypeScript no instalado; falla al importar, antes de las aserciones. |
| `formato-impresion.test.mjs` | Entorno: TypeScript no instalado; falla al importar, antes de las aserciones. |
| `garantias-dias.test.mjs` | Entorno: TypeScript no instalado; falla al importar, antes de las aserciones. |
| `importacion-productos.test.mjs` | Entorno: TypeScript no instalado; falla al importar, antes de las aserciones. |
| `maintenance.test.mjs` | Entorno: TypeScript no instalado; falla al importar, antes de las aserciones. |
| `movil-admin.test.mjs` | Entorno: TypeScript no instalado; falla al importar, antes de las aserciones. |
| `navegacion-hibrida.test.mjs` | Entorno: TypeScript no instalado; falla al importar, antes de las aserciones. |
| `numero-venta.test.mjs` | Entorno: TypeScript no instalado; falla al importar, antes de las aserciones. |
| `offline-logica.test.mjs` | Entorno: TypeScript no instalado; falla al importar, antes de las aserciones. |
| `operaciones.test.mjs` | Entorno: TypeScript no instalado; falla al importar, antes de las aserciones. |
| `pdf-operativo-real.test.mjs` | Entorno: TypeScript no instalado; falla al importar, antes de las aserciones. |
| `pendientes-inicio.test.mjs` | Entorno: TypeScript no instalado; falla al importar, antes de las aserciones. |
| `pos-catalogo.test.mjs` | Entorno: TypeScript no instalado; falla al importar, antes de las aserciones. |
| `pos-client-credit.test.mjs` | Entorno: TypeScript no instalado; falla al importar, antes de las aserciones. |
| `pos-money.test.mjs` | Entorno: TypeScript no instalado; falla al importar, antes de las aserciones. |
| `pos-offline-caracterizacion.test.mjs` | Entorno: TypeScript no instalado; falla al importar, antes de las aserciones. |
| `pos-precios-vigentes.test.mjs` | Entorno: TypeScript no instalado; falla al importar, antes de las aserciones. |
| `precios.test.mjs` | Entorno: TypeScript no instalado; falla al importar, antes de las aserciones. |
| `producto-duplicados.test.mjs` | Entorno: TypeScript no instalado; falla al importar, antes de las aserciones. |
| `producto-edicion.test.mjs` | Entorno: TypeScript no instalado; falla al importar, antes de las aserciones. |
| `proveedor-edicion.test.mjs` | Entorno: TypeScript no instalado; falla al importar, antes de las aserciones. |
| `receipt-fiscal.test.mjs` | Entorno: TypeScript no instalado; falla al importar, antes de las aserciones. |
| `reportes-zona-horaria.test.mjs` | Entorno: TypeScript no instalado; falla al importar, antes de las aserciones. |
| `resumen-movil.test.mjs` | Entorno: TypeScript no instalado; falla al importar, antes de las aserciones. |
| `session-validation.test.mjs` | Entorno: TypeScript no instalado; falla al importar, antes de las aserciones. |
| `taskNavigation.test.mjs` | Entorno: TypeScript no instalado; falla al importar, antes de las aserciones. |
| `tenantSettings.test.mjs` | Entorno: TypeScript no instalado; falla al importar, antes de las aserciones. |
| `texto-minimo.test.mjs` | Entorno: TypeScript no instalado; falla al importar, antes de las aserciones. |
| `unidades-csv.test.mjs` | Entorno: TypeScript no instalado; falla al importar, antes de las aserciones. |
| `ventas-por-cajero.test.mjs` | Entorno: TypeScript no instalado; falla al importar, antes de las aserciones. |

### Cierre y pendiente real

La tarea de verificación y diagnóstico queda documentada; **la suite no está verde**. Para una validación con dependencias limpias es necesario restablecer acceso al registro npm y ejecutar `npm ci` y `npm test`. En Windows permanecen además los problemas de portabilidad del arnés descritos en la primera pasada. No se modificaron pruebas para evitarlos.

Registros locales: `$env:TEMP\ferresystem-frontend-20261028.log`, `$env:TEMP\ferresystem-npm-ci-20261028.log`, `$env:TEMP\ferresystem-npm-cache\_logs\2026-10-28T06_17_05_420Z-debug-0.log` y `$env:TEMP\ferresystem-frontend-post-ci-20261028.log`. Son archivos temporales, no evidencia publicada en GitHub.

Comprobación final: rama y HEAD conservados; ningún archivo rastreado cambiado. Único archivo nuevo: este informe. Sin cambios de código, aserciones, lockfile o contexto maestro; sin commit, push, merge ni despliegue. Las dependencias locales ignoradas por Git sí quedaron incompletas por el intento de instalación indicado arriba.
