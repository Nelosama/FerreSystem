-- Validación de solo lectura de la propuesta: cada línea devuelve OK o FALTA.
SELECT CASE WHEN count(*) = 6 THEN 'OK columnas de origen' ELSE 'FALTA columnas de origen' END
  FROM information_schema.columns WHERE table_name = 'contable_asientos' AND column_name IN ('origen_tipo','origen_id','evento','lote_id','regla_version','huella_origen');
SELECT CASE WHEN count(*) = 2 THEN 'OK tablas' ELSE 'FALTA tablas' END FROM pg_tables WHERE tablename IN ('contable_lotes','contable_mapeos');
SELECT CASE WHEN count(*) = 2 THEN 'OK restricciones de origen' ELSE 'FALTA restricciones de origen' END
  FROM pg_constraint WHERE conname IN ('contable_asientos_origen_chk','contable_asientos_automatico_chk') AND convalidated;
SELECT CASE WHEN count(*) = 1 THEN 'OK índice anti-duplicado parcial' ELSE 'FALTA índice anti-duplicado parcial' END
  FROM pg_indexes WHERE indexname = 'contable_asientos_origen_key' AND indexdef LIKE '%WHERE%AUTOMATICO%';
SELECT CASE WHEN count(*) = 4 THEN 'OK disparadores' ELSE 'FALTA disparadores' END
  FROM pg_trigger WHERE tgname IN ('contable_lotes_inmutables_tg','contable_lotes_empresa_tg','contable_mapeos_vigencia_tg','contable_mapeos_cierre_tg') AND NOT tgisinternal;
SELECT CASE WHEN count(*) = 2 THEN 'OK RLS' ELSE 'FALTA RLS' END
  FROM pg_class WHERE relname IN ('contable_lotes','contable_mapeos') AND relrowsecurity;
