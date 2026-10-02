-- Diagnóstico de solo lectura. No modifica datos ni muestra datos personales.
BEGIN TRANSACTION READ ONLY;
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'clientes'
  AND column_name = 'numero_cliente';

SELECT to_regclass('public.secuencias_cliente') AS tabla_contador;

SELECT t.tgname AS trigger_name, t.tgenabled AS enabled,
       pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t
WHERE t.tgrelid = to_regclass('public.clientes')
  AND t.tgname = 'clientes_assign_number' AND NOT t.tgisinternal;

SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = to_regclass('public.clientes');

SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'clientes';
COMMIT;
