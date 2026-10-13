-- INSPECCIÓN DE SOLO LECTURA de la migración 20261011150000_precio_aprobacion_producto.
-- Contiene únicamente SELECT. No modifica datos ni el historial de migraciones. Ejecutar en cada entorno con un usuario de solo lectura.
-- Resultado esperado y plan de decisión: docs/PLAN_RECONCILIACION_MIGRACION_20261011150000.md

-- 1) ¿Qué versión aplicó este entorno? Comparar `checksum` con los SHA-256 completos del plan.
SELECT migration_name, checksum, started_at, finished_at, rolled_back_at, applied_steps_count
  FROM _prisma_migrations
 WHERE migration_name = '20261011150000_precio_aprobacion_producto';

-- 2) ¿Existen las columnas que agrega la migración? (si no existen, no se aplicó ninguna versión)
SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'productos'
   AND column_name IN ('precio_aprobado', 'precio_aprobado_por', 'precio_aprobado_at', 'precio_modificado_por', 'precio_modificado_at')
 ORDER BY column_name;

-- 3) Huella de la diferencia entre versiones: productos INACTIVOS marcados como legado aprobado.
--    La versión candidata deja este número en 0; la versión de FORJA y keen-goldberg lo marca para todos los inactivos con precio > 0.
--    (Ejecutar solo si el paso 2 devolvió las cinco columnas.)
SELECT COUNT(*) FILTER (WHERE "activo" = false AND "precio_aprobado" = true AND "precio_aprobado_por" = 'LEGADO_MIGRACION') AS inactivos_legado_aprobado,
       COUNT(*) FILTER (WHERE "activo" = true  AND "precio_aprobado" = true AND "precio_aprobado_por" = 'LEGADO_MIGRACION') AS activos_legado_aprobado,
       COUNT(*) AS productos_total
  FROM "productos";

-- 4) Migraciones posteriores ya aplicadas (para saber si la historia del entorno avanzó sobre esta migración).
SELECT migration_name, finished_at
  FROM _prisma_migrations
 WHERE migration_name > '20261011150000'
 ORDER BY migration_name;
