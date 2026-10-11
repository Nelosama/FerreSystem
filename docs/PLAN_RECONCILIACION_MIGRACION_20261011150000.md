# Plan de reconciliación — migración `20261011150000_precio_aprobacion_producto`

Estado: **plan para decisión del propietario. No se ha ejecutado ningún cambio.** Fecha: 2026-10-11.

## 1. Hechos verificados

- `origin/main` **no contiene** esta migración (su última migración es `20261010120000_coberturas_garantia`).
- Hay **dos contenidos** con el mismo nombre. SHA-256 completos (el `checksum` de Prisma es el SHA-256 del `migration.sql`):

| Versión | SHA-256 | Ramas | Efecto sobre datos |
|---|---|---|---|
| Candidata | `8885a35a928bbd2d0af9c45e82d3cfa2a03e82ff25cc5284ce94ef4416f88ab6` | `claude/vigilant-feynman-6p6jt2` (#152), `claude/h5-identidad-operacion-a` (#153), `claude/kardex-consolidacion-134-140` | Marca legado aprobado solo productos **activos** con precio de venta > 0 |
| FORJA / keen-goldberg | `d84f7934cb433c7beac94d71ae9e629f02793b7711fdd26a0352100468a56eda` | `claude/forja-compras-proveedores`, `claude/keen-goldberg-62o7f1` (idénticas entre sí) | Marca legado aprobado **todos** los productos con precio de venta > 0, incluidos inactivos |

- Diferencia de fondo: con la versión FORJA/keen, un producto **inactivo** con precio queda aprobado y puede venderse sin revisión si se reactiva. La candidata lo deja pendiente.
- Las columnas, el índice y la reversión manual son idénticos en ambas versiones.

## 2. Inspección de solo lectura de entornos

El propietario autorizó inspeccionar en solo lectura los entornos accesibles. **Desde la sesión de desarrollo no hay acceso a ningún entorno** (no existe ninguna cadena de conexión ni credencial; no se ha inventado ningún resultado). Para completarla, quien tenga acceso ejecuta, en cada entorno y con un usuario de solo lectura:

`backend/scripts/inspeccion-solo-lectura-migracion-20261011150000.sql` (solo `SELECT`).

Interpretación del resultado del paso 1:

| `checksum` en `_prisma_migrations` | Escenario |
|---|---|
| Sin fila | **S0**: el entorno no aplicó ninguna versión |
| `8885a35a…` | **S1**: aplicó la candidata |
| `d84f7934…` | **S2**: aplicó la versión FORJA/keen |
| Otro valor | **S3**: contenido desconocido; detener y escalar |

Registro de resultados (a completar por el operador, sin credenciales):

| Entorno | Fecha | Escenario (S0/S1/S2/S3) | `inactivos_legado_aprobado` | Operador |
|---|---|---|---|---|
| _desarrollo_ | | | | |
| _pruebas / staging_ | | | | |
| _producción_ | | | | |

## 3. Resolución por escenario

Regla común: **no se modifica ninguna migración ya aplicada** y no se renombra una migración que algún entorno haya aplicado.

- **S0 en todos los entornos (caso esperado, nada se ha desplegado).** Conservar la candidata como única migración. FORJA y keen-goldberg retiran su versión de sus ramas **antes** de integrarlas (ninguna está en `main`). No hay cambio de datos. Verificación: reconstrucción de la base desde cero aplicando todas las migraciones en orden y la prueba de deriva del esquema, ambas ya cubiertas por la suite de integración (que aplica el SQL con `psql`; `prisma migrate deploy` no se ejecuta en la suite).
- **S1 en algún entorno.** Sin acción en ese entorno: el repositorio y la base coinciden. FORJA y keen-goldberg retiran su versión.
- **S2 en algún entorno (versión FORJA aplicada).** `prisma migrate deploy` fallaría por checksum distinto si el archivo del repositorio es la candidata. Opciones, solo con aprobación del propietario y respaldo previo:
  1. **Recomendada:** adoptar la versión FORJA como contenido canónico para ese linaje y añadir una **migración nueva** (otro timestamp, p. ej. `20261018000000`) que devuelva a pendiente los productos inactivos marcados `LEGADO_MIGRACION` (`UPDATE ... SET precio_aprobado=false, precio_aprobado_por=NULL, precio_aprobado_at=NULL WHERE activo=false AND precio_aprobado_por='LEGADO_MIGRACION'`). Es un cambio de datos: requiere NEXUS, respaldo y marca de aprobación.
  2. Dejar la base como está y documentar el riesgo de los inactivos aprobados, con un informe de esos productos para revisión comercial.
  3. **No recomendada:** alinear el historial con `prisma migrate resolve` para registrar el checksum de la candidata. Reescribe el historial de migraciones.
- **S3.** Detener. No tocar nada hasta identificar el contenido aplicado.

## 4. Precondiciones para cualquier cambio en un entorno con datos

1. Respaldo verificado y procedimiento de restauración probado.
2. Revisión de NEXUS de la migración nueva (impacto en productos, reportes y ventas offline que dependen de `precio_aprobado`).
3. Marca `APROBACION-DESTRUCTIVA` si la migración contiene `UPDATE` masivo o `DROP`, y revisión de CODEOWNERS.
4. Aprobación expresa del propietario. Sin ella no se ejecuta nada, y nunca en producción desde una sesión de desarrollo.

## 5. Decisión de producto pendiente

¿Un producto **inactivo** con precio debe quedar aprobado al migrar? Propuesta y criterio de la candidata: **no**. Un producto reactivado pasa por la revisión de precio como cualquier otro.

## 6. Coordinación

FORJA no es accesible desde la sesión de desarrollo. La retirada de su versión en su rama y la confirmación de su entorno quedan **solicitadas** en el Issue #151; no se da por hecha hasta recibir confirmación.
