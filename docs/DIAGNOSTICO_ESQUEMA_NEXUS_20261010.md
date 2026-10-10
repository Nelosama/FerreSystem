# Diagnóstico y conciliación de esquema — NEXUS (2026-10-10)

**Firma:** NEXUS, Senior Database Architect y especialista PostgreSQL / Prisma.
**Base comprobada:** `origin/main` `7ccfad25`. Ramas de PR analizadas: `claude/integracion-pos-offline-p1` (#129, borrador), `claude/integracion-seguridad-fase3` (#137), `claude/centinela-validacion-produccion` (#138).
**Alcance:** solo esquema y pruebas en PostgreSQL 16 temporal. **No se conectó a producción ni a Supabase.** No se ejecutó ningún comando sobre datos productivos. No hay merge ni despliegue.

---

## 1. Método (repetible)

Todo se ejecutó en un clúster PostgreSQL 16.15 local, como usuario sin privilegios, con base vacía:

1. Crear worktrees de `origin/main` y de cada rama de PR (sin tocar la rama de trabajo).
2. Aplicar en orden lexicográfico **solo** `backend/prisma/migrations/*/migration.sql` sobre una base vacía (`ON_ERROR_STOP=1`).
3. Comparar la base con el esquema: `prisma migrate diff --from-url <base> --to-schema-datamodel <schema.prisma> --script`. Esta comparación solo lee la base.
4. Introspección `prisma db pull` **sobre una copia temporal** del esquema, fuera del repositorio, para obtener columnas exactas de las tablas que faltaban.

Resultado de la cadena de migraciones de `main`: 13 migraciones aplicadas sin error. Ninguna migración se modificó.

## 2. Diagnóstico de la deriva

| Métrica | `main` | PR #129 | PR #137 | PR #138 | **Esta rama** |
|---|---|---|---|---|---|
| Líneas de diff (`migrate diff`) | **219** | 255 | 255 | 219 | **1 (vacío)** |
| `DROP TABLE` | 10 | 10 | 10 | 10 | 0 |
| `DROP TYPE` | 4 | 4 | 4 | 4 | 0 |
| `DROP COLUMN` | 1 | 1 | 1 | 1 | 0 |
| FK que Prisma quitaría | 38 | 41 | 41 | 38 | 0 |
| FK que Prisma añadiría (ya existen en base con otra acción) | 11 | 11 | 11 | 11 | 0 |
| `RENAME CONSTRAINT/INDEX` | 0 | 9 | 9 | 0 | 0 |
| `DROP DEFAULT` en `id` | 9 | 9 | 9 | 9 | 0 |

Las 219 líneas de `main` coinciden con la cifra indicada en la misión.

**Ningún PR cambia la base de datos más allá de sus migraciones.** #129 y #137 añaden 2 y 3 migraciones respectivamente; #137 y #138 comparten las mismas migraciones (verificado con `diff -r`). Las diferencias entre ramas están solo en `schema.prisma`.

### Tablas con datos fuera del modelo Prisma (la deriva más grave)

Creadas por la migración `20260930000000_alter_stock_decimal_and_operational_models`. Prisma no las conoce:

`abonos_apartado`, `apartados`, `auditoria_soporte`, `cierres_comisiones`, `detalles_transferencia`, `garantias`, `historial_garantias`, `listas_precio`, `pedidos_especiales`, `transferencias`, más los enums `EstadoApartado`, `EstadoGarantia`, `EstadoPedidoEspecial`, `EstadoTransferencia`.

Además, la columna `clientes.lista_precio_id` (FK a `listas_precio`) tampoco está en el esquema.

Un `prisma migrate dev` sobre cualquier base real generaría `DROP TABLE` y `DROP COLUMN` para estos objetos: pérdida de datos.

Comprobación en la base reconstruida: `garantias`, `apartados`, `transferencias` y `listas_precio` tienen 0 filas. **Esto no dice nada sobre producción**, que no se consultó.

### Uso de esas tablas en el código

- `backend/src/common/tenant-modules.ts` menciona los nombres `apartados`, `listas_precio`, `pedidos_especiales` y `transferencias` como claves de módulo (no como tablas).
- `backend/test/garantias.postgres.integration.ts` comprueba que la tabla `garantias` (reclamos) no se modifica al operar `coberturas_garantia`.
- Ningún otro código lee ni escribe las 10 tablas, ni por Prisma ni por SQL.

## 3. Clasificación

| # | Severidad | Inconsistencia | Riesgo | Estado en esta rama |
|---|---|---|---|---|
| 1 | **CRÍTICA** | 10 tablas con posibles datos sin modelo Prisma | `migrate dev` / `db push` las eliminaría | Modeladas (sin cambiar la base) |
| 2 | **CRÍTICA** | `clientes.lista_precio_id` y su FK sin modelo | `DROP COLUMN` sobre dato de cliente | Campo y relación añadidos |
| 3 | **MEDIA** | 9 FK presentes en base sin relación Prisma: `cajas` (2), `movimientos_caja` (1), `ordenes_compra` (3), `proveedores` (1), `detalles_orden_compra` (2) | Prisma eliminaría la FK; se pierde integridad referencial | Relaciones declaradas con los mismos nombres |
| 4 | **MEDIA** | `auditoria_soporte` (SEC-012) sin modelo | Trazabilidad de soporte invisible al ORM | Modelada; aviso a CENTINELA (ver §8) |
| 5 | **BAJA** | 11 FK con `ON UPDATE NO ACTION` en base y `CASCADE` implícito en Prisma | Ninguno práctico (las PK son UUID y no se actualizan) | `onUpdate: NoAction` en el esquema |
| 6 | **BAJA** | 9 `id` con `DEFAULT gen_random_uuid()::text` en base; Prisma usa `uuid()` en cliente | Ninguno: ambos producen UUID v4 | `dbgenerated` equivalente |
| 7 | **BAJA** | Nombres de FK e índices distintos en #129/#137 (9 renombres, 2 índices) | Deriva propia de esas ramas | Ya corregido en #138; no se duplica aquí |

No se encontró ninguna **ALTA** de incompatibilidad con el backend: el código compila y sus pruebas pasan con el esquema de `main` y con el corregido.

## 4. Causa raíz

1. **Tablas huérfanas (1, 2, 4).** La migración `20260930000000` creó tablas de apartados, garantías (reclamos), transferencias, listas de precio y soporte. El `schema.prisma` de `main` nunca recibió los modelos correspondientes. No hay una migración que las elimine: la deriva es entre el modelo y la historia SQL, no un borrado. El nombre `garantias` de esa tabla coincide con el módulo nuevo `coberturas_garantia`, y la documentación del proyecto ya advertía que el modelo no mapeaba tablas existentes.
2. **Relaciones ausentes (3).** Las FK de `cajas`, `ordenes_compra`, `proveedores`, `movimientos_caja` y `detalles_orden_compra` se crearon en SQL. Sus columnas existen en `schema.prisma`, pero nunca se declaró la relación.
3. **Acciones referenciales (5).** Las migraciones dejan la acción por defecto de PostgreSQL (`NO ACTION`) en varias FK. Prisma, si no se indica, asume `ON UPDATE CASCADE`. Ninguno de los dos valores se había declarado explícitamente.
4. **Defaults de `id` (6).** Las migraciones `20261004000000` y `20261005000000` definen `DEFAULT gen_random_uuid()::text`; el esquema usa `@default(uuid())` (generación en cliente).
5. **Nombres de FK en #129/#137 (7).** Las migraciones de `productos_proveedores` y `contingencia` nombran las FK con `_tenant_fkey`, mientras que Prisma genera `_tenant_id_fkey`. #138 lo resolvió en el esquema con `map:`.

No hay indicio de que alguna migración haya sido editada tras aplicarse: los checksums de `_prisma_migrations` no se tocan en esta rama.

## 5. Estrategia de corrección

Principios: **cero cambios en la base, cero migraciones nuevas, cero eliminaciones**. La base real ya tiene la estructura correcta; el problema está en el modelo.

1. **Modelar** las 10 tablas y 4 enums con los nombres exactos de tabla y columna (`@@map`, `@map`). Prisma deja de proponer eliminaciones.
2. **Declarar** las 9 relaciones que faltaban, con los nombres que Prisma genera (`tabla_campo_fkey`), que coinciden con los de la base.
3. **Alinear** la acción `ON UPDATE` de 11 FK con `NO ACTION`, tal como están en la base.
4. **Alinear** los 9 `id` con `dbgenerated("(gen_random_uuid())::text")`. Es neutro para la aplicación: ambos métodos generan UUID v4.
5. **Verificar**: la diferencia entre migraciones y esquema debe ser vacía; la prueba debe fallar si se regresa al esquema de `main`.

Por qué no se hace `ALTER TABLE ... DROP DEFAULT` ni se añaden FK nuevas: ninguna FK falta en la base, y cualquier cambio de base tendría que pasar por autorización, copia de seguridad y revisión de datos (ver §7).

## 6. Cambios implementados (esta rama)

| Archivo | Cambio |
|---|---|
| `backend/prisma/schema.prisma` | +10 modelos, +4 enums, +1 campo y relación en `Cliente`, +relaciones inversas en `Tenant`, `Usuario`, `Producto`, `Venta`, `Proveedor`, `OrdenCompra`, `RecepcionCompra`, `Caja`, `DetalleOrdenCompra`, `MovimientoCaja`. `onUpdate: NoAction` en 7 modelos. `dbgenerated` en 9 `id`. Sin reformateo del resto del archivo. |
| `backend/test/esquema-deriva.postgres.integration.ts` | Nuevo. Crea un clúster temporal, aplica `prisma migrate deploy` sobre base vacía y exige `prisma migrate diff --exit-code` sin diferencias. Comprueba que las 10 tablas históricas existen y que el modelo las declara. |
| `docs/agentes/NEXUS.md` | Identidad persistente, especialidad, responsabilidades y coordinación. |
| `docs/DIAGNOSTICO_ESQUEMA_NEXUS_20261010.md` | Este informe. |
| `AGENTS.md` | Referencia a la identidad NEXUS. Instrucciones existentes sin cambios. |
| `docs/CONTEXTO_MAESTRO.md` | Estado y bitácora de esta conciliación, dentro de la sección vigente. |

**No se modifica ninguna migración ni se añade ninguna.** Por tanto `prisma migrate deploy` no tiene nada que aplicar: es un cambio de solo modelo.

## 7. Evidencia de pruebas (PostgreSQL 16.15 temporal, usuario `nobody`)

| Prueba | Resultado |
|---|---|
| Migraciones de `main` sobre base vacía | 13/13 aplicadas, sin error |
| `prisma validate` del esquema corregido | Válido |
| `prisma generate` | Correcto |
| `tsc -p tsconfig.build.json --noEmit` | 0 errores |
| `migrate diff` `main`-base vs esquema `main` | 219 líneas (igual a la misión) |
| `migrate diff` base vs esquema corregido | **Vacío** |
| `migrate diff` base #129 / #137 / #138 vs sus esquemas | 255 / 255 / 219 líneas (ver §2) |
| Prueba nueva `esquema-deriva` con esquema corregido | **3/3 pasan** |
| Mutación: esquema de `main` en lugar del corregido | **2 fallos**: diff no vacío y modelo sin tablas históricas. Esquema restaurado y verificado byte a byte |
| Unitarias backend (`vitest run`) | **329/329** en 34 archivos |
| Integración PostgreSQL (`test:integration`, sin la prueba nueva) | **316/316 pasan, 1 omitida** (`it.runIf(REAL_SETTINGS_BROWSER=1)` en `ciclo-ventas`, prueba de navegador ya condicionada; no relacionada) |

**Integración completa final (con la prueba nueva incluida): 17 archivos, 319/319 pasan, 1 omitida** (la misma omitida de arriba). Es la cifra vigente de esta rama.

**Qué no cubren estas pruebas:**

- No hay datos reales de producción. Las comprobaciones de filas son sobre bases vacías.
- No se probó aislamiento multi-tenant específico de las 10 tablas históricas. Son tablas sin código de aplicación, así que el riesgo de fuga es bajo, pero no está acreditado.
- No hay pruebas de Playwright: no cambió el frontend.

## 8. Procedimiento de respaldo y recuperación (para ejecutar por el responsable, no ejecutado aquí)

**Antes de cualquier cambio de base en producción** (no aplica a esta rama, que no cambia la base):

1. Copia completa en formato custom, sin propietarios ni ACL:
   `pg_dump --format=custom --no-owner --no-acl -f respaldo_pre_nexus_AAAAMMDD.dump "$PRODUCCION_URL_LECTURA"`
2. Restaurar en una base temporal aislada y verificar conteos de las 10 tablas históricas y de `clientes`, `ventas` y `productos`.
3. Comprobar la deriva en la copia: `npx prisma migrate diff --from-url "$COPIA_URL" --to-schema-datamodel prisma/schema.prisma --script`. Debe quedar vacío.
4. Solo con autorización del responsable: aplicar, verificar y conservar el respaldo.

**Recuperación:** restaurar el `.dump` en una base nueva con `pg_restore --clean --if-exists --no-owner -d <base>`, y revalidar conteos. El worker FS-41 del repositorio cubre respaldos cifrados, pero **no está acreditado en producción** (ver `docs/FS-41-RESPALDOS.md`).

**Verificación de deriva en producción (solo lectura):** es el primer paso necesario antes de integrar esta rama. Debe ejecutarlo el responsable con un usuario de solo lectura. Si el resultado no es vacío, la base de producción difiere de las migraciones y **no** se integra hasta analizarlo.

## 9. Riesgos pendientes

| # | Riesgo | Severidad | Mitigación / dueño |
|---|---|---|---|
| R1 | La base de producción puede diferir de la reconstruida (cambios manuales, migraciones aplicadas a mano). | ALTA | Diff de solo lectura en producción antes de integrar. Dueño: responsable técnico. |
| R2 | Conflicto de texto en `schema.prisma` al integrar con #138 y con #129: `git merge-tree` simulado da **2 bloques en conflicto** en cada caso (zona de relaciones y final del archivo, donde ambas ramas añaden modelos). Un merge textual limpio no garantiza un esquema válido: hay que validar el resultado. | ALTA | Integrar primero #138 (base de nombres de contingencia y productos_proveedores), luego rebasar esta rama y resolver los 2 bloques manteniendo ambos conjuntos. Validar con `prisma validate` y con la prueba de deriva. Coordinar con CENTINELA. |
| R3 | `auditoria_soporte` contiene trazabilidad de soporte (SEC-012). Su ciclo de vida no está definido. | MEDIA | Decisión de conservación con CENTINELA. No se elimina. |
| R4 | `listas_precio` y `clientes.lista_precio_id` no tienen uso en el backend. Hay una FK activa y posibles datos. | MEDIA | Decisión de negocio: conservar o retirar con migración futura y respaldo previo. |
| R5 | Las 10 tablas históricas no tienen pruebas de aislamiento multi-tenant. | MEDIA | Añadir prueba de aislamiento cuando se decida su uso. |
| R6 | `dbgenerated` en 9 `id`: el cliente Prisma deja de generar el UUID y lo delega a la base. | BAJA | Equivalente en la práctica. Revisar en QA que ninguna creación dependa de `id` en cliente. Coordinar con FARO. |
| R7 | La prueba nueva requiere `initdb` y un usuario no root (igual que el resto de pruebas de integración). | BAJA | Documentado en el propio archivo. |
| R8 | Las acciones referenciales de 11 FK quedan como `NO ACTION` en base. Un futuro cambio a `CASCADE` requerirá migración explícita. | BAJA | Cualquier cambio de acción pasa por revisión de NEXUS. |

## 10. Recomendación

**Esta rama (solo modelo, sin cambio de base): GO condicionado** a:

1. Ejecutar la comprobación de deriva de solo lectura contra producción (§8, paso 3) y obtener resultado vacío o explicado.
2. Revisión de CENTINELA sobre `auditoria_soporte` y las tablas de garantías/apartados.
3. Resolver el orden de integración con #138 (R2).

**Ningún paso que modifique la base de producción: NO-GO** hasta que el responsable autorice respaldo y aplicación. Esta rama no requiere migración.

**PR #129 y #137 tal como están: NO-GO** para integración: su esquema difiere de sus migraciones en 36 líneas adicionales (nombres de FK, §2). #138 ya resuelve esa parte.

---

*Firmado: NEXUS.*
