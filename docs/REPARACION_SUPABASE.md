# Reparación integral PostgreSQL: ejecución, auditoría y recuperación

Revisión: 2026-10-08. Base de código: `main`, `346a98db2b6721f78671310a491c8fb99b2b8583`. Prisma CLI/client 6.4.1. Esta revisión no se conectó a Supabase, no usó credenciales productivas, no ejecutó despliegues y no modificó las nueve migraciones.

**Veredicto operativo: NOT READY para producción inmediata.** Los archivos están completos y probados en PostgreSQL real 18.3 para un ensayo controlado. Falta ejecutar el ensayo sobre una restauración reciente del destino, verificar los permisos/políticas de Supabase y resolver los resultados bloqueantes de esa copia. El ensayo sintético no certifica datos, volumen, configuración ni versión del servidor productivo. El estado vigente de entrega permanece en `CONTEXTO_MAESTRO.md` (E02/E03); este documento describe el procedimiento técnico.

## Archivos y contrato

- `backend/prisma/repair-production.sql`: una única reparación autocontenida, con dos transacciones explícitas y auditoría al final. No requiere ejecutar fragmentos o parches adicionales.
- `backend/prisma/audit-production.sql`: auditoría autocontenida, utilizable antes y después. Solo lee objetos/datos de `public`; escribe exclusivamente tablas y funciones temporales de sesión. No ejecuta el DDL almacenado como referencia en su contrato JSON.

Se construyeron dos bases de referencia independientes en PostgreSQL: una desde el DDL generado por `prisma migrate diff --from-empty --to-schema-datamodel`, y otra aplicando las nueve migraciones originales en orden. El contrato combina **33 tablas Prisma y 10 históricas**, **450 columnas**, **19 ENUM**, **127 índices (incluidos 43 índices PK)** y **118 restricciones: 43 PK, 65 FK y 10 CHECK**. Incluye 60 comprobaciones adicionales de datos, etiquetas ENUM usadas, contadores y referencias operativas.

Las tablas históricas conservadas son `apartados`, `abonos_apartado`, `transferencias`, `detalles_transferencia`, `listas_precio`, `garantias`, `historial_garantias`, `pedidos_especiales`, `cierres_comisiones` y `auditoria_soporte`. También se conserva `clientes.lista_precio_id`. Su presencia no significa que esos módulos estén integrados en el producto.

Se revisaron las consultas SQL de NestJS, especialmente `operaciones/ledger.ts`, `operaciones/operaciones.service.ts`, ventas, cotizaciones y clientes. Las referencias operativas que no son FKs declaradas se comprueban como datos, sin inventar relaciones nuevas. Todos los modelos actuales se leyeron con Prisma contra la base reparada.

## Errores corregidos respecto al primer script

1. Se aceptaban tablas, columnas, índices, FKs y CHECKs por nombre. Ahora se contrasta el catálogo: clase de objeto, tipo, precisión/escala, nulabilidad, default, identidad/generación, collation, definición de índice, tabla, columnas/orden, predicado, unicidad, validez y disponibilidad; también definición/acciones de FKs y CHECKs.
2. Los índices únicos podían fallar sin diagnóstico previo. Ahora se buscan grupos duplicados respetando su predicado y la semántica de NULL de las claves esperadas, con bloqueo contra escrituras concurrentes. No se muestran valores de clientes en los resultados.
3. Las FKs creadas quedaban `NOT VALID`. Ahora se comprueban huérfanos, CHECKs y cruces de empresa; cualquier `FAIL` revierte la fase estructural. Si los datos son compatibles, las 65 FKs y los 10 CHECKs esperados quedan validados en esa transacción. La auditoría independiente identifica cualquier restricción que siga `NOT VALID`, incluso restricciones adicionales.
4. La conversión de stock entero no comprobaba desbordamiento. Solo se permite convertir `productos.stock_actual/stock_minimo` desde enteros a `numeric(12,2)` si todos sus valores caben exactamente. No se redondean decimales ni se convierten automáticamente texto, UUID, dominios o timestamps incompatibles.
5. Se sustituía la función de numeración sin revisar su fuente, y bastaba que existiera un trigger con ese nombre. Ahora solo se acepta una fuente conocida del repositorio/script anterior; una función desconocida bloquea. Se comprueban evento, momento, columnas, función y habilitación del trigger. La función vigente usa referencias calificadas y `search_path` fijo.
6. Se actualizaba `productos.costo_vigente` desde `precio_costo`. Esa actualización se eliminó: los NULL existentes se conservan y se reportan. No se recalculan saldos de crédito ni se crean compras, abonos, pagos o movimientos.
7. Faltaba comprobar la continuidad de contadores de ventas/cotizaciones y códigos CLI. Se conservan los contadores mayores y únicamente se crean/avanzan los atrasados al máximo visible; no se cambia ningún número ni código de documento/cliente. Se informa la reconstrucción de contadores. El límite de `LPAD(6)` se detecta antes de producir códigos truncados.
8. Faltaba detectar exposición a roles de API en Supabase. `anon`/`authenticated` con permisos de datos sin RLS produce `FAIL`; con RLS produce `WARNING` para revisión de políticas. El script no revoca permisos ni crea políticas implícitamente.

## Diferencias explícitas entre migraciones y Prisma

No existe igualdad literal entre ambas fuentes:

- Once FKs históricas usan `ON UPDATE NO ACTION`; Prisma espera `CASCADE`. Si ya existen exactamente con la definición histórica conocida, se conservan con `WARNING`. Las nuevas se crean con la definición Prisma. No se eliminan restricciones para ocultar esta diferencia. El backend revisado no modifica los IDs referidos; cambiar esa política exige otra revisión.
- Nueve defaults de IDs `gen_random_uuid()::text` figuran en migraciones, mientras que `@default(uuid())` es generado por Prisma en el cliente. Los defaults históricos existentes se conservan y se informan; los objetos nuevos siguen el DDL Prisma.
- `usuarios.permisos` mantiene el `NOT NULL` de la migración. Se reconocen las dos expresiones equivalentes de array vacío que producen las fuentes (`ARRAY[]::text[]` y `'{}'::text[]`).
- Se conservan etiquetas ENUM adicionales y su orden; cualquier diferencia se informa. Una etiqueta adicional usada por datos y ajena al contrato bloquea por incompatibilidad potencial con Prisma.
- Las tablas/FKs/ENUM históricos ausentes de `schema.prisma` permanecen. El diff Prisma del ensayo solo propuso retirar estructuras históricas: **no se ejecutó ese diff y no debe aplicarse**, porque eliminaría estructuras que aquí se exige conservar.

## Comportamiento ante columnas existentes

Una columna incompatible no se considera reparada porque exista. Se cancela con `FS_REPAIR` y el objeto preciso. Se permite restituir un default ausente y `NOT NULL` ausente únicamente cuando no hay NULL; un default contradictorio, precisión diferente, collation distinta, identidad/generación inesperada o `NOT NULL` adicional bloquean la operación. Una definición equivalente pero expresada de otra manera puede requerir revisión: la comparación es deliberadamente conservadora.

Si una columna obligatoria sin default falta sobre una tabla con filas, se cancela; no se fabrican sus valores. Los nuevos campos con defaults declarados por Prisma toman esos defaults, por ejemplo `costo_unitario=0` y banderas operativas. Esos valores estructurales **no reconstruyen el costo ni el estado operativo histórico**; la auditoría señala costos desconocidos.

Las columnas canónicas de `clientes` deben estar previamente presentes. No se vuelven a agregar `codigo`, `numero_cliente`, `credito_habilitado`, `limite_credito`, `saldo_pendiente`, `activo` ni sus demás campos existentes. La única adición permitida a esa tabla es el campo histórico nullable `lista_precio_id`. Si la reparación manual dejó tipos/defaults incompatibles, se bloquea y se informa.

## Pruebas ejecutadas

Entorno: Windows, Node 24.16.0, PostgreSQL **18.3 nativo**, clúster temporal exclusivo mediante `initdb`, solo `127.0.0.1`, puerto efímero y datos sintéticos. No se utilizó una instalación compartida ni variables de conexión externas. Los helpers de prueba quedaron fuera del repositorio y no son scripts de reparación para producción.

Resultado final: **39 comprobaciones aprobadas**. No se suman como pruebas nuevas las repeticiones realizadas durante las correcciones.

SHA-256 de los archivos exactos probados (UTF-8/LF):

```text
repair-production.sql  d1f2201a625319fa0134e8058e85231acf4761ccfecc9de994e92504745b2f3f
audit-production.sql   08ff49377d8aba246acd4940f0d5ec690da87cdf005ca55c81eda04db6884bbd
schema.prisma         30127ddb9a311a51e5ce1274f11aeb0d3505e25645bfc9a35f91d211a9d7ed3a
```

| Grupo | Evidencia |
| --- | --- |
| Primera ejecución | Base de migración inicial con clientes ya reparados, productos, usuarios, venta, detalle, cotización, movimiento de inventario y nueve entradas simuladas de historial. Reparación completa sin error. |
| Segunda ejecución | Misma base, mismo archivo: éxito. Comparación de todos los valores/filas existentes y contadores después de ambas ejecuciones. |
| Falla parcial real | Tipo incompatible `productos.precio_venta`: ENUM confirmado, fase estructural revertida, sin tablas parciales. Después de corregir únicamente el fixture incompatible, el mismo archivo completa la reparación. |
| Interrupción entre fases | Se ejecutó solo hasta el COMMIT de ENUMs y después el archivo completo: éxito. |
| Catálogo e integridad | Auditoría sin FAIL; 450 columnas presentes; ninguna FK/CHECK esperado quedó sin validar. También se probó una base con las nueve migraciones realmente ejecutadas. |
| Conservación | Proyección de todas las columnas originales, valores y cantidades de filas sin cambios; historial simulado y contadores avanzados conservados. Costos vigentes NULL no rellenados. |
| Prisma | Diff contra servidor reparado sin adiciones o reparaciones de tipos/defaults; lectura real de los 33 modelos actuales con Prisma 6.4.1. No sustituye una prueba HTTP de todos los flujos NestJS. |
| Rechazos seguros | Precisión decimal incorrecta, default contradictorio, nulabilidad incompatible, NULL requerido, índice con columnas en otro orden, predicado parcial incorrecto, duplicados, FK/CHECK alterado, huérfanos, CHECK violado, trigger deshabilitado y función desconocida. |
| ENUM | Dominio ocupando el nombre de un ENUM rechazado; etiqueta adicional sin uso conservada con WARNING; etiqueta adicional usada por datos rechazada; orden distinto conservado e informado. |
| Límites y relaciones | Desbordamiento entero→decimal rechazado, cruces de tenant rechazados, columna reparada de cliente ausente no recreada y ventas históricas CREDITO sin campos de crédito bloqueadas. |
| Numeración | Nuevo cliente sintético obtiene CLI-000003; un código existente con sufijo mayor hace avanzar el contador sin cambiar el código. |
| NOT VALID | FK y CHECK correctos pero no validados producen WARNING; la reparación comprueba sus filas y los valida. |
| Concurrencia y permisos | Lock real competidor provoca cancelación por `lock_timeout=5s`; permiso `anon` sin RLS bloquea sin alterar políticas. |
| Auditoría independiente | Funciona en base incompleta y en base reparada; conserva los metadatos de relaciones de `public`. |

En el fixture principal, los WARNING de datos corresponden a un costo vigente NULL y un costo histórico cero. Son advertencias deliberadas, no saldos reconstruidos. Las pruebas de aceptación HTTP, cliente y Supabase real no se ejecutaron en esta revisión.

## Procedimiento de ensayo y ejecución única

### 1. Preparación obligatoria del operador

1. Confirmar proyecto Supabase, host, base, versión PostgreSQL y rol de conexión. El script usa `public` y exige PostgreSQL >=15; solo se verificó empíricamente 18.3. La auditoría informa servidor/base/rol.
2. Tener un respaldo reciente y comprobar su restauración en una base aislada. Conservar también los contadores y la versión desplegada del backend/frontend. No almacenar dump, credenciales ni logs sensibles en Git.
3. Usar un rol propietario autorizado para DDL, lectura completa y objetos temporales. `row_security=off` obliga a fallar si RLS impide una lectura completa; no ofrece una vía de evasión de permisos. No usar roles `anon` o `authenticated`.
4. Ejecutar primero la auditoría en la copia restaurada. Es normal encontrar `FAIL` de estructuras ausentes antes de reparar. Los conflictos de definición, duplicados, referencias inválidas, visibilidad insuficiente o exposición de API requieren revisión; no se resuelven borrando filas ni saltándose guardas.
5. Ejecutar reparación completa y auditoría posterior en esa copia. Guardar resultado y tiempo de ejecución. Verificar los mismos datos/contadores antes/después. Si hay FAIL, no pasar a producción.
6. Para la ventana productiva posteriormente autorizada, detener API, workers, cron y cualquier escritura/DDL concurrente. Los locks protegen la reparación pero no reemplazan esta coordinación. El ensayo debe justificar una ventana suficiente para índices y validaciones.

### 2. Ejecutar una sola reparación completa

Elegir **una** vía. No ejecutar selecciones parciales, no añadir un BEGIN externo ni usar `psql -1/--single-transaction`.

**Supabase SQL Editor:** en el proyecto/base comprobados, abrir una consulta nueva, pegar íntegro `backend/prisma/repair-production.sql` y pulsar **Run una vez**. Conservar resultados y mensajes. Esperar el COMMIT final; una tabla de resultados no basta si posteriormente la herramienta muestra un error.

**Alternativa psql:** desde la raíz del repositorio, con un servicio libpq definido fuera de Git que apunte al destino expresamente elegido:

```powershell
# El operador configura este servicio y sus credenciales fuera del repositorio.
# Durante el ensayo, el servicio debe apuntar EXCLUSIVAMENTE a la copia aislada.
psql -X --dbname="service=ferresystem_ensayo" --set=ON_ERROR_STOP=1 --file=backend/prisma/repair-production.sql
if ($LASTEXITCODE -ne 0) { throw 'Reparación fallida: mantener mantenimiento y revisar el error' }
```

Solo después de aprobar el ensayo y autorizar la ventana, el operador puede sustituir el servicio por el del destino productivo verificado. Esta documentación no ejecuta ni autoriza esa sustitución automáticamente. Capturar stdout y stderr en una ubicación privada para conservar también los avisos de contadores.

El archivo usa dos transacciones:

- **ENUM:** crea los tipos/valores faltantes y confirma. Los valores recién agregados no pueden usarse hasta el COMMIT, según PostgreSQL.
- **Estructura:** bloquea tablas, contrasta/repara columnas, comprueba duplicados, crea índices y restricciones, restaura la función conocida, sincroniza contadores, audita datos y valida restricciones. Un conflicto cancela toda esta fase.

Ambas usan `lock_timeout=5s`, `statement_timeout=5min`, `idle_in_transaction_session_timeout=1min` y un advisory lock. El bloque estructural completo está sujeto al timeout del statement DO. No aumentar tiempos a ciegas: medir primero la copia restaurada. Las definiciones y consultas auxiliares temporales no quedan como objetos de aplicación.

### 3. Auditoría posterior independiente

Manteniendo detenidas las escrituras, ejecutar íntegro `backend/prisma/audit-production.sql` en una consulta nueva del mismo destino. Alternativa:

```powershell
psql -X --dbname="service=ferresystem_ensayo" --set=ON_ERROR_STOP=1 --file=backend/prisma/audit-production.sql
if ($LASTEXITCODE -ne 0) { throw 'Auditoría no completada: no reabrir el servicio' }
```

La salida tiene `status`, `category`, `object_name` y `detail`. Revisar la fila `SUMMARY` y todos los resultados distintos de PASS:

- **PASS:** la comprobación ejecutada coincide con el contrato.
- **WARNING:** diferencia conocida, información histórica desconocida, restricción pendiente, orden/etiquetas ENUM adicionales, índice redundante o política de acceso que necesita revisión. No significa aceptación automática.
- **FAIL:** objeto ausente/incompatible, duplicados, integridad rota, datos ENUM incompatibles, exposición sin RLS o imposibilidad de comprobar íntegramente los datos. Mantener servicio detenido.

**psql puede salir con código 0 aunque la auditoría contenga FAIL**, porque esta devuelve un informe: revisar obligatoriamente SUMMARY. Un timeout, permiso insuficiente o error SQL también invalida el resultado aunque la herramienta haya mostrado filas parciales. Una consulta de datos omitida por estructura incompleta genera WARNING y no se cuenta como una comprobación aprobada.

Comparar recuentos/valores y contadores con el respaldo, probar los flujos acordados con backend compatible y reabrir solamente cuando los FAIL estén resueltos y cada WARNING tenga una decisión documentada. No usar `prisma db push` o aplicar el diff destructivo para hacer desaparecer las advertencias históricas.

## Recuperación ante fallas

| Momento | Estado persistente y acción |
| --- | --- |
| Falla en fase ENUM | Su transacción no se confirma. Resolver nombre ocupado/permisos/lock; si la sesión sigue abortada, ejecutar `ROLLBACK;` en esa sesión. |
| Falla después del primer COMMIT | Los ENUM añadidos permanecen. La fase estructural se revierte completa. No intentar eliminar/recrear tipos para regresar: es seguro reintentar el mismo archivo tras resolver el conflicto documentado. |
| Desconexión/timeout | No asumir éxito o fracaso por la interfaz. Mantener mantenimiento, consultar auditoría en sesión nueva y verificar si hubo COMMIT. Una transacción no confirmada se revierte al cerrar su sesión. |
| Falla después del COMMIT estructural | La reparación aditiva ya está confirmada. Mantener mantenimiento y diagnosticar. No existe rollback destructivo automático. Si se decide restaurar, hacerlo mediante el respaldo/restauración verificados y un procedimiento DBA autorizado; considerar cualquier escritura posterior antes de sustituir el destino. |

Nunca eliminar el historial de migraciones, marcar migraciones artificialmente como aplicadas, usar `migrate reset`, borrar huérfanos o alterar importes para que pase la auditoría. Un conflicto desconocido requiere una decisión explícita sobre ese objeto/dato y otro ensayo; no una colección de parches improvisados.

## Riesgos y límites que permanecen

- No se conoce desde esta revisión el catálogo completo, volumen, versión exacta, ownership, extensiones, RLS, políticas ni default privileges productivos. En particular, permisos por defecto de Supabase a roles API pueden hacer que la nueva guarda de exposición aborte la reparación. No se deben sortear sin definir el acceso deseado de la aplicación.
- La comparación conservadora puede bloquear definiciones semánticamente equivalentes no incluidas en las dos fuentes. El error mantiene los datos intactos y exige revisión.
- Reconstruir un contador ausente desde el máximo visible no permite conocer números mayores de documentos/clientes eliminados anteriormente. Si existen respaldos o numeraciones externas mayores, deben conciliarse antes de reabrir altas. Ningún contador mayor existente se reduce.
- Costo histórico cero, costo vigente NULL y defaults operativos agregados no prueban hechos comerciales pasados. Los datos faltantes deben conciliarse con fuentes reales; esta reparación no los inventa.
- Validaciones y creación de índices toman locks y hacen lecturas completas. El tiempo del fixture pequeño no estima el tiempo productivo.
- Un PASS estructural no prueba rendimiento, flujos HTTP, políticas RLS correctas ni aceptación del negocio. Los WARNING por FKs históricas no equivalen a igualdad literal de todo el esquema con Prisma.

Referencia de comportamiento transaccional: [PostgreSQL 18, ALTER TYPE](https://www.postgresql.org/docs/18/sql-altertype.html). Referencia de estados y semántica de índices: [catálogo pg_index](https://www.postgresql.org/docs/18/catalog-pg-index.html).
