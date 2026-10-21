# Revisión de claude/upbeat-einstein-ozjvpy frente a main

Base comprobada: `c4cadc34a4b67de3052b076cfd646813e5afc6d8`.
Cabeza recibida: `dda7e27d` (seis commits exclusivos). Misma rama, sin rebase, force push, merge a main ni despliegue manual.

## Revisión de los seis commits

| Commit | Clasificación | Resultado |
|---|---|---|
| `f3e8524b` | Útil | Vuelto informativo en centavos, TRANSFERENCIA correctamente identificada y TOTAL A CRÉDITO en comprobante HTML. Reutiliza el cálculo monetario existente; no crea un segundo cobro. |
| `64df7449` | Útil, con defectos de presentación | Consulta por usuario × método con tenant, estado COMPLETADA y rango de día local. Tabla/CSV agregados en centavos. Corregidos falso «sin ventas» ante backend anterior y encabezados sin traducir. |
| `9225c05a` | Cobertura de comportamiento existente | No añade idempotencia nueva: comprueba la ya implementada. Se conserva la cobertura simulada y se añade transporte con API/PostgreSQL reales. |
| `9dc5dc53` | Útil, optimización parcial | Carga inicial de 200 filas; Mostrar más incrementa 200. Búsqueda y categoría operan sobre todo el catálogo y reinician el límite. Sigue descargando todo el catálogo y finalmente puede renderizarlo completo; no es paginación del servidor ni virtualización. Se retiran dos capturas ajenas de Configuración. |
| `9d22557a` | Documentación | Se conserva como registro de la ejecución original; esta revisión distingue los resultados nuevos de los anteriores. |
| `dda7e27d` | Regresión útil | Comprueba el rótulo de crédito del comprobante. No añade otro flujo de ventas. |

No hay una segunda implementación funcional que deba sustituir a la de main. Se reutilizan dinero, recuperación/idempotencia, permisos, exportación CSV y filtros existentes. PR #180, #182, #183 y #184 estaban abiertos: no se incorporan ni modifican.

## Correcciones de esta revisión

1. **Reportes, datos no disponibles:** antes, ausencia de `cajeros` en una respuesta válida anunciaba que no había ventas aunque el resumen tuviera ventas. Ahora se indica que el servidor no proporcionó el desglose. Un arreglo vacío confirmado conserva «sin ventas». CSV queda deshabilitado en ambos casos sin filas.
2. **Traducciones:** tabla y encabezados CSV por cajero reutilizan las etiquetas ES/EN de los métodos del POS; se añade el mensaje de datos no disponibles en ambos idiomas. Dos regresiones fallan sobre el bundle original y pasan tras corregirlo; también se comprueban contenido e importes del CSV descargado.
3. **Cobertura incompleta:** `pos-cajeros-real.spec.ts` verifica vuelto en pantalla/comprobante, limpieza para la siguiente venta, payload sin efectivo recibido, venta/caja/stock en PostgreSQL, reporte y CSV con API real, y denegación de Reportes al cajero. Dos casos adicionales ejecutan POST real y retienen o descartan su respuesta: un envío, una venta, un movimiento y una salida física; recuperación por solicitud tras pérdida.
4. **Pruebas duplicadas omitidas:** seis placeholders de 1.2/13.3/14.4 en las auditorías heredadas pasan a referencias al spec real activo, conservando las omisiones ajenas. No se presenta la simulación como persistencia real.
5. **Ruido binario:** las dos capturas de Configuración vuelven a su contenido en main; ninguna funcionalidad depende de ellas.

## Contratos y límites conservados

- Efectivo recibido y cambio son informativos y volátiles: no persisten, no se envían al servidor y no bloquean una venta con efectivo insuficiente. Tras recargar no se puede reconstruir lo recibido. No se inventa una regla de cobro ni un cambio de esquema.
- Ventas por cajero muestra ventas brutas COMPLETADAS por quien las registró, incluidos vendedores; no descuenta devoluciones ni equivale al efectivo de caja. La leyenda lo declara. La atribución de devoluciones sigue requiriendo una decisión comercial.
- El endpoint sigue exigiendo ADMIN, permiso `reportes.ver` y módulo `reportes`; la consulta mantiene `tenant_id` y la unión de usuarios exige el mismo tenant. Las pruebas PostgreSQL comparan totales/cantidades con el resumen, límites de día local, anuladas y otro negocio.
- Sin cambios en dependencias, esquema Prisma o migraciones. No se consulta ni modifica producción.
- Cámara, Safari/iPhone, impresoras y datáfono físicos no se certifican con Chromium. Este veredicto se limita a integrar la rama, no a aceptación productiva ni operación multi-sucursal.

## Validación de esta sesión

| Comprobación | Resultado local |
|---|---|
| Frontend unitarias | 472/472 |
| Backend unitarias | 529/529, 53 archivos |
| Scripts backend / inventario Python | 48/48 y 10/10 |
| Backend HTTP real, caída/recuperación de PostgreSQL | 6/6 |
| PostgreSQL real, suite completa con REAL_SETTINGS_BROWSER=1 | 1022/1022, 62 archivos, sin omisiones |
| Tipos/build y lint frontend/backend | Correctos; avisos preexistentes |
| Esquema Prisma y guard de migraciones | Correctos; 0 migraciones nuevas |
| Traducciones añadidas/modificadas | 13 claves ES/EN y parámetros coincidentes |
| Regresiones nuevas con API/PostgreSQL reales | 3/3; repetidas satisfactoriamente dentro del piloto completo |
| Navegador completo con API simulada | 227 aprobadas / 1 falla del emulador independiente (sin aplicación ni API) |
| Sesiones/PWA en emulación móvil Chromium | 15/15 |
| Piloto completo con Chromium 151 | 142 aprobadas, 1 fallida heredada, 13 sin ejecutar por secuencia serial y 4 omisiones ajenas |

La falla del piloto es el caso offline 2 de contingencia; los casos 3–15 de esa secuencia no corren tras él. No se cuenta esa parte como aprobada. La misma falla se reproduce en main (1 aprobada / 1 fallida), véase abajo. El resto de ventas, inventario, reportes, caja, roles y aislamiento ejecutado sí pasa.

Comandos: [evidencias/revision-upbeat-20261021/COMANDOS.md](evidencias/revision-upbeat-20261021/COMANDOS.md). **NEXUS:** clústeres locales efímeros, migraciones reales y usuario sin privilegios; sin base externa. Los checks del SHA publicado y el veredicto final se mantienen en la descripción del PR de esta rama; este informe registra la evidencia local.

## Incidencias del entorno de prueba

- El cliente Prisma y `dist` precargados pertenecían a una versión anterior: primera compilación y primera integración fallaron. Se regeneró el cliente desde el esquema versionado y se recompiló; no hubo cambio de esquema para acomodar el entorno.
- No había PostgreSQL ni privilegios de instalación global. Se preparó PostgreSQL 17.10 desde el paquete binario de pruebas `@embedded-postgres/linux-x64` y herramientas cliente Debian 17.11 en `/tmp`, sin añadir dependencias al repositorio.
- La primera ejecución de scripts usó el dist antiguo; se repitió después de compilar.
- Dos ejecuciones iniciales de Playwright compartieron por error el directorio de artefactos y dos casos fallaron al cerrar sus trazas (ENOENT). Se corrigió el procedimiento y se repite la suite completa; no se relajaron las aserciones.

- **Fallo offline heredado reproducido en main:** una copia exacta de `c4cadc34` obtenida con `git archive` (sin crear rama) reproduce 1 aprobada / 1 fallida en los casos 1 y 2 de contingencia. Mismo error que la rama: no aparece «● Sin conexión» tras recarga. Puertos y bases independientes. Evidencia: `evidencias/revision-upbeat-20261021/main-offline-chromium151.log`. No se modifica el POS offline para acomodar una diferencia del entorno.
- Playwright instalado requiere Chrome for Testing 153.0.8010.12; el único navegador local es Chromium 151. Descargar el navegador previsto responde 403 «Domain forbidden» en `cdn.playwright.dev`. Las comprobaciones de Actions deben comprobar el navegador previsto y el HEAD publicado.

- La suite `frontend/e2e/offline-emulation.spec.ts` de main aísla el mismo fallo sin React ni API del sistema: tras recargar con service worker, la API sigue bloqueada (`NETWORK_ERROR`, contador del servidor sin incremento), pero `navigator.onLine` pasa de false a true. Resultado local de la suite completa: 227 aprobadas / 1 fallo de esa sonda; móvil 15/15. No se alteran `navigator.onLine`, el emulador ni las aserciones para obtener un verde artificial.

## Veredicto de integración

La evidencia local no aprueba la secuencia offline completa por la incompatibilidad del emulador descrita. Para declarar **READY FOR MERGE**, deben pasar `validate`, `guard-base-datos` y el piloto `test` del SHA publicado, con el Chromium previsto por Playwright. Si no pasan, **NO MERGE**. El resultado comprobado y los enlaces de esos checks se publican en la descripción del PR; no se reutilizan los checks de otra rama o SHA. El merge queda a cargo del propietario.
