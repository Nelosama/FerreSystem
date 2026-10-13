# Entrega a NEXUS — deriva de esquema y riesgos de migración

**De:** CENTINELA. **Para:** NEXUS (responsable de base de datos). **Estado:** entregado por documento en el repositorio. **No había canal de mensajería activo con NEXUS en esta sesión**: hay que transmitirlo por el canal habitual.

## 1. Qué se entrega

| Documento | Contenido |
|---|---|
| `docs/CENTINELA_INFORME_DBA_DERIVA_20261010.md` | Clasificación de la deriva, riesgos, decisiones D1–D4 y procedimiento propuesto |
| `docs/evidencias/deriva-main-20261010/` | Salidas de `prisma migrate diff` (219 líneas en `main`, 255 antes de #138), `SHA256SUMS` y script de reproducción |
| `docs/CENTINELA_CONTROLES_BASE_DE_DATOS_20261010.md` | Inventario de 14 rutas que pueden operar sobre la base y controles de CI |
| `docs/CENTINELA_POLITICA_APROBACION_DESTRUCTIVA.md` | Cuándo una operación destructiva es válida y qué controles de GitHub deben estar activos |

## 2. Riesgos de migración (resumen)

1. **Deriva de `main`: 219 líneas.** 10 tablas que existen en las migraciones y no en `schema.prisma` (`apartados`, `garantias`, `transferencias`, etc.), 4 enums, 1 columna, 38 claves foráneas y 9 defaults de `id`. **Riesgo alto:** una sincronización del esquema (`db push`, `migrate dev`, `migrate reset`) propondría borrar tablas con datos.
2. **#129 no añade deriva propia** tras la alineación de nombres y relaciones en #138.
3. **Migración con cambio de tipo:** `20260930000000_alter_stock_decimal_and_operational_models` convierte `productos.stock_actual` y `stock_minimo` a `DECIMAL(12,2)`. Confirmar el tipo previo y si hubo redondeo.
4. **Historial de migraciones:** `migration-safe.mjs` valida checksums y orden, pero **no detecta la deriva** entre migraciones y esquema.
5. **Claves foráneas sin declarar en Prisma:** 27 FK existen en la base y no en el esquema (algunas de tablas vigentes). Siguen activas en la base; el riesgo es de mantenimiento.

## 3. Controles que CENTINELA dejó implementados (para su revisión)

- **Guard de CI** `verificar-migraciones.mjs`: bloquea `db push`, `migrate dev/reset`, `db seed` y `--accept-data-loss` en ejecutables; exige `APROBACION-DESTRUCTIVA` en migraciones destructivas nuevas; hace inmutables las migraciones publicadas; prohíbe crear la tabla de marca de entorno desde una migración.
- **Marca de entorno** para el seed: la base debe tener la tabla `entorno_ferresystem` con tipo `DESARROLLO` o `STAGING` e identificador aprobado. Creada a mano, nunca por migración.
- **Auditoría de solo lectura** `auditar-claves-demo.mjs`: para usar en las bases reales con su autorización.

**Lo que NEXUS debe decidir o ejecutar** (CENTINELA no lo hace por duplicado):
- D1: ¿las 10 tablas huérfanas tienen datos en producción? Consulta de solo lectura con su autorización.
- D2: modelarlas con `@@ignore` (sin cambio en la base) o retirarlas con migración destructiva aprobada y respaldo.
- D3: declarar las 27 FK en el esquema.
- D4: confirmar el tipo previo de `productos.stock_*`.
- Aprobar o rechazar cualquier marca `APROBACION-DESTRUCTIVA` como responsable (CODEOWNERS).
- Ejecutar la auditoría de claves demo en cada base real y rotar si hay coincidencias.

## 4. Lo que CENTINELA no hizo

No se ejecutó ninguna consulta, migración ni cambio contra producción. No se resolvió la deriva. No se eliminaron tablas. No se modificó el esquema de forma que cambie la base.
