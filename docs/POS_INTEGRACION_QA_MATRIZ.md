# Integración y QA del POS offline — matriz de pruebas

**Estado: integración técnica verificada en rama temporal; NO aprobada para producción.**
Rama: `claude/integracion-pos-offline-p1` (desde `origin/main` `7ccfad25`). Incluye:
- `1deb3117` — #127 P1 operaciones (`origin/claude/p1-operaciones`), fusionado sin conflictos. #127 avanzó a `caa5aa15` (`22388edc` mock de proveedores en FS-07, igual al corregido aquí; `caa5aa15` contexto). Integrado en `a4cda7e3`; duplicado retirado en `f2f4b44e`.
- `f281be62` — #128 contingencia POS (`origin/claude/pos-offline-backend`), con conflictos resueltos en `2ab05cd0`.
- `99df299c` — correcciones de costo, timeout y pruebas añadidas durante la integración.
- `5c5df9bb` — asociación producto–proveedor en la prueba de contingencia y mock del panel de proveedores (#127) en la suite simulada de FS-07. Commit validado: contingencia 25/25, unitarias frontend 224/224, simulada 118/118, E2E real 29/29.

Ninguna rama se fusionó a `main`. No se ejecutaron migraciones productivas ni despliegues.

## 1. Archivos compartidos: cómo se resolvieron

| Archivo | Resolución | Verificación |
|---|---|---|
| `backend/prisma/schema.prisma` | Ambos modelos conservados (`ProductoProveedor` de #127 y la contingencia de #128), en ese orden. La resolución añade solo líneas. No se ejecutó `prisma format`: reescribió el archivo entero y se revirtió. | `prisma validate` válido; `prisma generate` correcto; `tsc` build sin errores. |
| `backend/test/ventas.postgres.integration.ts` | Lista única de migraciones en orden: las de `main`, `productos_proveedores`, `coberturas_garantia` y `pos_contingencia_offline`. | Suite de integración completa en verde. |
| `backend/test/reportes-zona-horaria.postgres.integration.ts` | Mismo criterio. Se reconstruyó la lista completa porque el conflicto abarcaba solo parte de ella. | Suite en verde. |
| `docs/CONTEXTO_MAESTRO.md` | Se conservan las dos secciones de estado (P1 y contingencia), separadas. | Revisión manual. |
| `frontend/src/App.tsx` | Fusión automática sin marcadores. Se comprobó por nombre de ruta: `/pos-contingencia`, `/contingencia-admin`, `/estado-cuenta-clientes`, `/admin-movil` y `/cuentas` conviven. Las páginas nuevas de #127 se importan con `React.lazy`. | `tsc -b` sin errores; build correcto; rutas presentes en el build. |

## 2. Migraciones

- Cadena completa en PostgreSQL 16 aislado (clúster temporal, usuario no root): `prisma migrate deploy` aplicado sobre base vacía en `e2e-real/run.sh`, paso 2. Resultado: "All migrations have been successfully applied".
- Deriva de esquema: comprobada solo para `coberturas_garantia`, como en la suite original. No se comprobó la deriva completa del esquema contra la base de producción, que no se tocó.

## 3. Resultados ejecutados

| Suite | Resultado | Notas |
|---|---|---|
| Backend unitarias (`vitest run`) | **345/345** | 36 archivos. |
| Backend `tsc -p tsconfig.build.json` | Sin errores | |
| Backend integración PostgreSQL 16 (`vitest.config.integration.ts`, usuario no root) | **366/366** con `REAL_SETTINGS_BROWSER=1`; 21 archivos | Ver §4 sobre la prueba omitida. |
| Contingencia PostgreSQL | **25/25** | Incluye compra y recepción reales, costo de la ventana y asociación producto–proveedor. |
| Frontend unitarias (`npm test`) | **224/224** | |
| Frontend `tsc -b`, build de producción, lint | Sin errores; lint con avisos previos | |
| E2E real (backend NestJS + PostgreSQL temporal + Chromium) — contingencia | **14/14** | Incluye la prueba de service worker. |
| E2E real — suite completa `e2e-real` (`run.sh`) | **29/29** en `5c5df9bb` | Incluye las 14 de contingencia. |
| E2E con backend simulado (suite completa `playwright test`) | **118/118** en `5c5df9bb` | Antes, 9 fallos de FS-07 por una petición no interceptada; corregido en `5c5df9bb`. Ver §6. |
| E2E simulado contingencia (timeout y cuota) | **2/2** | |

## 4. La prueba omitida: origen

- En la primera ejecución: **363 pasan, 1 omitida**.
- La omitida es `test/ciclo-ventas.postgres.integration.ts` → «Chromium real: conversión por transferencia y POS con tarjeta». Está condicionada con `it.runIf(process.env.REAL_SETTINGS_BROWSER === '1')`. No es un defecto: es una prueba opt-in que lanza Chromium real contra el backend.
- Al activarla con `REAL_SETTINGS_BROWSER=1` **pasa 16/16**. Para que corriera en este entorno hubo que dar permiso de escritura a `frontend/node_modules/.vite` y `.vite-temp` (problema de permisos del sandbox, no del código).
- Conclusión: la suite completa pasa con la prueba opt-in activada. En CI debe activarse la variable para no omitirla en silencio.

## 5. Coexistencia de rutas administrativas y de contingencia

- Comprobado en el archivo fusionado y en el build: ambas familias de rutas existen una sola vez, sin duplicados.
- Pruebas que las ejercitan: `admin-movil-simulado.spec.ts` y `p1-operaciones-simulado.spec.ts` (de #127, con backend simulado) y `contingencia-real.spec.ts` (de #128, con backend real) para el panel de contingencia.
- No hay una prueba que abra todas las rutas nuevas en secuencia desde el menú de navegación. Esa cobertura queda pendiente.

## 6. Sincronización, permisos, conflictos y recuperación

| Escenario | Dónde | Estado |
|---|---|---|
| Venta offline con producto asociado a proveedor, compra y recepción durante el corte | `contingencia.postgres.integration.ts` (PostgreSQL real, `OperacionesService.compra` y `recibir` reales) | **Ejecutado y pasa.** |
| Cambio de costo durante el corte: la venta conserva el costo de la ventana | Mismo archivo | **Ejecutado.** Corregido un defecto: antes registraba el costo del momento de sincronizar. La mutación lo detecta. |
| Asociación producto–proveedor: la recepción actualiza el último costo; la venta offline no la modifica | Mismo archivo | **Ejecutado y pasa.** |
| Sesión vencida: la venta se conserva y se envía al volver a iniciar sesión | `contingencia-real.spec.ts` (test 11) | **Ejecutado y pasa.** |
| Permisos: un cajero no envía operaciones de otro; un usuario desactivado genera conflicto | `contingencia.postgres.integration.ts` | **Ejecutado y pasa.** |
| Conflictos de stock, caja cerrada, precio y secuencia duplicada | `contingencia.postgres.integration.ts` y `contingencia-real.spec.ts` | **Ejecutado y pasa.** |
| Recuperación tras cierre inesperado (operación «enviando») | `contingencia-real.spec.ts` (test 6) | **Ejecutado y pasa.** |
| Timeout de red real (petición colgada) | `contingencia-simulado.spec.ts` | **Ejecutado y pasa.** Corregido: antes no había límite. La mutación la detecta. |
| Almacenamiento lleno | `contingencia-simulado.spec.ts` | **Ejecutado.** Es un **error de cuota simulado** en la escritura de IndexedDB, no un disco lleno real. |
| Actualización del service worker | `contingencia-real.spec.ts` (test 14) | **Ejecutado y pasa.** La mutación con `skipWaiting` la detecta. |

## 7. Lo que NO se ha ejecutado (no declarar aprobado)

Requieren equipo físico o sistema operativo que este entorno no tiene:

| Prueba | Por qué no se ejecutó | Cómo ejecutarla |
|---|---|---|
| Apagón eléctrico con equipo real | Requiere hardware, UPS y corte controlado. | `docs/POS_CONTINGENCIA_PROTOCOLO_APAGON.md`, escenarios E1–E9. |
| Reinicio de Windows con pendientes | El entorno es Linux. | E3 del protocolo, en el equipo de caja. |
| Durabilidad de IndexedDB en Windows (Chrome y Edge) | Sin Windows. | Protocolo E1–E2, con anotación de la versión del navegador. |
| iPhone/Safari: panel administrativo y PWA instalada | Sin dispositivo Apple. | Abrir `/contingencia-admin` y `/admin-movil` en Safari; instalar la PWA; revisar viewport y sesión. |
| Cámara trasera y códigos impresos (LEV-015, de inventario) | Sin hardware. | Fuera de este PR. |
| Cuota de almacenamiento llena real | Requiere llenar el disco o la cuota del perfil. | Protocolo E9, solo en equipo de prueba. |
| Timeouts de red en la conexión real de la tienda | El entorno no tiene una red con latencia real. | Medir con el router y la conexión reales, con prueba de corte parcial. |

## 8. Riesgos y decisiones abiertas

- **D1 fiscal (sin cambios):** la leyenda y el procedimiento del comprobante de contingencia requieren aprobación del responsable fiscal antes de activar en clientes reales.
- **Costo de la ventana:** el costo usado es el vigente al emitir la ventana, no el de cada instante. Una compra durante el corte no altera las ventas ya hechas, y el costo del día se fija al emitir. Confirmar que esto es la regla contable deseada.
- **Caja de contingencia única por empresa (`dispositivosMax=1`):** un equipo nuevo queda bloqueado hasta que un administrador desactive el anterior. Es intencional, pero el flujo de cambio de equipo debe probarse en la tienda.
- **Interfaz en español:** los textos de contingencia no tienen traducción al inglés.
- **Ruta del menú:** las rutas nuevas no aparecen en la navegación lateral; se llega por URL.

## 9. Estado de la rama y de los PR

- Este PR de integración (rama `claude/integracion-pos-offline-p1`) para revisión. No fusionar a `main` sin aprobación.
- #127 y #128 se mantienen como están; esta integración los contiene pero no los reemplaza.
- Si #127 cambia, hay que repetir la integración desde su nuevo commit y volver a ejecutar esta matriz.
