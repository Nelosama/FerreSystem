# Preparación del piloto — cuarta rama autorizada

**NEXUS · 2026-10-13 UTC.** Base: `origin/main` `4b650445b35fcd8dc2878b5c94ee60462493d8c1`. Rama exclusiva: `fix/pilot-readiness`. Código probado: `d1d19fea`. El estado y los siguientes pendientes se mantienen en [CONTEXTO_MAESTRO.md](CONTEXTO_MAESTRO.md).

La verificación local del alcance está aprobada, con límites de entorno y de cobertura explícitos. Esto no certifica producción, no habilita la contingencia del cliente ni autoriza merge, despliegue o migraciones productivas.

## Cambios y evidencia

| Problema | Corrección | Evidencia |
|---|---|---|
| Los intentos de respaldo que subían una copia pero fallaban al restaurarla podían consumir la retención y desplazar copias antiguas verificadas. | `backup-worker.mjs` marca `fs41-verified` después de restaurar; lee la metadata del repositorio y conserva el nuevo ID de Restic. La retención exige **ambas** etiquetas `fs41,fs41-verified`. Una marca ausente bloquea la poda. | Regresión falla antes del cambio (`retention-before.log`). Restic real conserva dos copias verificadas tras dos restauraciones fallidas y otro éxito. Se ejecutó con Restic **0.18.0 y 0.16.4**; esta última versión no entrega JSON al etiquetar y puede retornar 0 pese a fallar, por lo que se comprueba la metadata real. |
| Conteos y volcado manual leían momentos distintos si había operaciones concurrentes. | `backup-consistent.mjs` mantiene una transacción `REPEATABLE READ READ ONLY`, exporta su snapshot y lo importa en `pg_dump`. El manifiesto y el volcado corresponden a ese mismo snapshot. El wrapper existente conserva su interfaz. | Una venta concurrente deja 3 ventas en el origen, mientras el manifiesto y la copia restaurada conservan las 2 del snapshot. |
| El verificador continuaba después de detectar un SHA-256 incorrecto. | Sale antes de invocar PostgreSQL o restaurar. Limpia variables PG heredadas, usa los binarios de `PG_BIN`, un puerto libre para la API y scratch privado. Si no puede detener el clúster, lo conserva y termina con error. | Prueba de corrupción comprueba que ninguna herramienta PostgreSQL se ejecuta y que no se genera un manifiesto verificado. Ensayo completo de restauración/actualización 24/24. |
| El simulacro exigía root y no propagaba todas las comprobaciones fallidas. | Admite usuario sin root; usa puertos libres, scratch privado, salida no cero ante fallos y limpieza del clúster propio. | Prueba de fallo de `initdb`: termina inmediatamente con error. Simulacro real: 14/14; venta y entrega dejan físico 17/reservado 0, reinicio conserva los datos y la copia restaurada arranca correctamente. |
| Faltaba una prueba de logout con cola pendiente y otro cajero en el mismo navegador. | Nuevo escenario en `contingencia-real.spec.ts`, sin respuestas simuladas: guarda offline, sale desde la UI con revocación real, entra otro cajero, vuelve el dueño y reconcilia. | Misma identidad/contenido en IndexedDB; ninguna operación enviada por el otro cajero; exactamente una operación aplicada, una venta y un movimiento de caja al volver el dueño. |
| Auditoría sin sesiones reales de todos los roles restringidos. | `pilot-permisos-real.spec.ts` crea cuentas por API, autentica ADMIN/CAJERO/BODEGUERO/VENDEDOR y concede permisos explícitos para comprobar que no eluden restricciones por rol. | Cuatro sesiones; seis rutas por rol, escrituras administrativas rechazadas para no ADMIN y acceso directo a `/usuarios` comprobado desde navegador real. |
| `test:e2e` del backend verificaba un “Hello World” retirado. | Prueba la aplicación completa con su propio PostgreSQL migrado: readiness 200, rutas privadas 401, caída real 503 sin conexión en la respuesta y recuperación 200 sin reiniciar NestJS. | 3/3 con PostgreSQL real. |
| CI ejecutaba los ejemplos externos de Playwright; el harness real ocultaba errores de diff y solo revisaba una tabla. | CI ejecuta respaldos, ciclo completo real y dos ensayos aislados; incluye lint, Python y E2E backend. El harness falla ante cualquier deriva o error del comando Prisma. Directorios de evidencia separados para suites real, móvil y simulada; `forbidOnly` activo en CI. | Deriva completa vacía al ejecutar ambos E2E reales. Sin colisiones de artefactos en la ejecución final. La configuración CI queda para verificación remota. |
| Publicar la rama podía disparar un preview de Vercel. | Se excluye únicamente `fix/pilot-readiness`, conservando las exclusiones anteriores. | 7/7: configuración y ejecución local del `ignoreCommand`; las otras ramas conservan su resultado. |

## Resultados locales reproducibles

Todas las cifras siguientes son de esta sesión, no de informes anteriores. [Logs y SHA-256](evidencias/pilot-readiness-20261013/SHA256SUMS).

| Suite | Resultado | Registro |
|---|---|---|
| Backend unitarias | 377/377 | `backend-unit.log` |
| Frontend unitarias | 279/279 | `frontend-unit-final.log` |
| Scripts Node | 47/47 | `scripts-final.log` |
| Validador Python | 10/10 | `python.log` |
| Integración PostgreSQL, con navegador opt-in | **905/905, 55 archivos, 0 omitidas** | `postgres-final.log` |
| Readiness/caída/recuperación HTTP backend | 3/3 | `backend-e2e-final.log` |
| Interfaz con API simulada | **143/143** | `browser-simulated-final.log` |
| Ciclo completo con API/PostgreSQL/Chromium reales | **140 aprobadas, 10 omitidas, 0 fallos** | `e2e-real-final.log` |
| Misma suite con emulación Pixel 7 | **140 aprobadas, 10 omitidas, 0 fallos** | `e2e-mobile-final.log` |
| Restic cifrado real, lectura de vuelta, restauraciones y retención | Aprobado en 0.18.0 y 0.16.4: cuatro respaldos/restauraciones, dos fallos deliberados, integridad completa, clave errónea rechazada y snapshot concurrente consistente | `restic-final.log`, `restic-0.16-final.log` |
| Ensayo de actualización y reversión | 24 PASS, 0 FAIL | `ensayo-final.log` |
| Simulacro de reinicio y recuperación | 14 PASS, 0 FAIL | `simulacro-final.log` |
| Compilaciones backend/frontend | Correctas | `backend-build.log`, `frontend-build.log` |
| Lint backend/frontend | Salida 0; advertencias existentes | `backend-lint-final.log`, `frontend-lint-final.log` |
| Guard de migraciones | Correcto; 0 migraciones nuevas | `migration-guard.log` |
| Protección de previews de la rama | 7/7 (incluidas en las 279 de frontend) | `vercel-guard.log` |

Los diez `skip` de cada E2E corresponden a casos ya pendientes en las suites: vuelto del POS en línea, canal web, reporte por cajero, latencia controlada y una prueba histórica de entrega parcial. **La entrega parcial sí se ejecuta en `cobro-entrega-real.spec.ts`**; ese skip histórico no describe ausencia actual de la función. No se eliminan ni cambian expectativas de pruebas ajenas para convertir pendientes en aprobadas.

Entorno: Node 24.19.0, Python 3.12.14, PostgreSQL 17.11, Restic 0.18.0/0.16.4, Chromium 138.0.7204.0. PostgreSQL y Restic se extrajeron a `/tmp/pilot-tools` sin instalar servicios del sistema. Chromium compatible se obtuvo de `@sparticuz/chromium@138.0.2` en un prefijo temporal; no se añadió al proyecto. El SHA-256 de Restic 0.16.4 se comprobó contra el manifiesto de su release.

### Ejecuciones bloqueadas e incidencias del entorno

- **WebKit/iPhone emulado:** 24 casos intentados; no se ejecutó su lógica porque falta el binario WebKit. La descarga normal de navegadores de Playwright recibe HTTP 403 por política del entorno (`browser-install.log`). No se acredita Safari físico.
- **Ejemplos de la raíz (`tests/example.spec.ts`):** seis casos intentados. Dos requieren `https://playwright.dev`, inaccesible mediante la red del entorno; cuatro requieren Firefox/WebKit ausentes. Son ejemplos externos, no pruebas de FerreSystem. El workflow se dirige ahora a la suite real de la aplicación; se conserva el scaffold en el repositorio.
- Chromium del sistema, versión 151, pierde el estado offline tras recargar una página controlada por service worker. Se reprodujo con una página mínima ajena a FerreSystem. Se ejecutó la contingencia con Chromium 138, sin simular `navigator.onLine` ni relajar las aserciones.
- La primera integración utilizó un cliente Prisma anterior al esquema actual; tras `prisma generate` se repitió toda la suite y pasó 905/905. El test backend “Hello World” también se reprodujo como fallo antes de sustituirlo.
- Una ejecución concurrente de Playwright compartió `test-results` y falló al cerrar traces borrados por la otra suite. Las carpetas ahora son independientes; la repetición final pasa 143/143.
- La prueba nueva de logout falló inicialmente por consultar el UUID local en vez del ID derivado por tenant. Se corrigió la prueba; la ejecución final verifica el registro central y los efectos reales.

## Repetición y operación segura

Instalar las dependencias con los lockfiles y generar Prisma antes de probar. Configurar `PG_BIN` con herramientas PostgreSQL locales. Para navegador local compatible, `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` admite una ruta explícita; en CI se instala el Chromium de Playwright.

```bash
npm ci --prefix backend
npm ci --prefix frontend
# Generar Prisma con URLs de una base local de prueba, nunca con conexión productiva.
npm --prefix backend run build
npm --prefix backend test
npm --prefix backend run test:scripts
python3 backend/scripts/validar-inventario.test.py
npm --prefix backend run test:integration
npm --prefix backend run test:e2e
npm --prefix frontend test
VITE_API_URL=/api npm --prefix frontend run build
npm --prefix frontend run test:browser -- --workers=2
npm --prefix frontend run test:e2e-real
PW_CONFIG=playwright.real.mobile.config.ts npm --prefix frontend run test:e2e-real
FS41_INTEGRATION=1 node backend/scripts/backup-worker.integration.mjs
bash backend/scripts/simulacro-recuperacion.sh
bash backend/scripts/ensayo-actualizacion-preproduccion.sh
node backend/scripts/verificar-migraciones.mjs --base origin/main
```

`test:integration`, `test:e2e`, el harness de navegador y los dos ensayos crean clústeres efímeros propios en loopback. `FS41_INTEGRATION=1` usa un repositorio Restic **local temporal únicamente para la prueba**, que no certifica destino externo de recuperación. Las pruebas interactivas `watch/debug` y `test:cov` reutilizan casos ya ejecutados; no son suites adicionales de negocio. Los scripts `unsafe` de siembra de clientes no se ejecutan.

Para el respaldo manual autorizado por el responsable de infraestructura:

```bash
# FERRE_ORIGEN_URL se configura por canal privado en el entorno.
# No poner la URL en argumentos, historial, commits o logs.
bash backend/scripts/respaldo-previo-migracion.sh /ruta/privada/copia-nueva
bash backend/scripts/verificar-respaldo.sh /ruta/privada/copia-nueva --ensayo-migracion
```

El destino debe ser externo al repositorio y vacío; no sobrescribe una copia anterior. El origen solo se lee. El volcado manual mantiene el alcance anterior, esquema `public`, sin propietarios/ACL; no sustituye un respaldo del clúster completo o PITR. Solo el ensayo sobre la **copia temporal** aplica migraciones. Un checksum/restore fallido no produce una certificación nueva. Se conserva el manifiesto original y se genera `manifest.json.verificado` únicamente al pasar la verificación.

En el worker, las copias anteriores sin `fs41-verified` y los intentos fallidos **no se podan automáticamente**. Esto protege puntos de recuperación existentes, pero exige revisión de capacidad y gestión técnica del repositorio. No etiquetar copias antiguas como verificadas sin restaurarlas; no purgar puntos de recuperación por conteo de intentos. Ante `VERIFIED_TAG`, comprobar el repositorio y su metadata: la copia no se declara exitosa ni se ejecuta retención.

## Límites de alcance y preparación del cliente

No hay cambios en `backend/src`, `frontend/src`, Prisma o migraciones. No se modificaron las ramas de Claude. Se revisaron por lectura `fix/auditoria-admin` y `claude/modest-galileo-693672`, aparecidas durante la sesión; sus módulos y pruebas existentes permanecen fuera de este diff. No se importan sus correcciones a esta cuarta rama. La asignación exacta de las tres sesiones no estaba disponible; el trabajo se limitó conservadoramente a herramientas, pruebas propias, CI y documentación.

Los defectos de importación CSV, soporte/usuarios y UX descritos en `auditoria_ferresystem.md` pertenecen a los módulos funcionales de las otras sesiones y requieren validación sobre sus PR finales. Esta rama aporta evidencia de permisos y continuidad sobre **main**, sin declarar reparados esos hallazgos de otras ramas ni corregirlos otra vez. La prueba de producto con precios iniciales y el ciclo de negocio pasan; eso no certifica la importación masiva de precios.

No se consultó ni modificó la base real, no se hizo merge ni despliegue, y no se activó contingencia en el cliente. El respaldo externo real, las alertas y el monitor operativo, las pruebas de apagón/UPS, Safari y cámara físicos, decisiones fiscales de contingencia y aceptación del cliente siguen fuera de esta evidencia. Las cifras locales no acreditan CI remota ni preparación de producción.
