\pset pager off
BEGIN TRANSACTION READ ONLY;
SELECT version() AS version_postgresql;
SHOW fsync;
SHOW synchronous_commit;
SHOW full_page_writes;
SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS has_migrations,
       to_regclass('public.productos') IS NOT NULL AS has_products,
       to_regclass('public.cajas') IS NOT NULL AS has_cash,
       to_regclass('public.ventas') IS NOT NULL AS has_sales,
       to_regclass('public.cuentas_operativas') IS NOT NULL AS has_accounts
\gset
\if :has_migrations
SELECT migration_name, started_at, finished_at, rolled_back_at
FROM public._prisma_migrations ORDER BY started_at;
\else
\echo 'No existe historial Prisma: revisar baseline antes de desplegar migraciones.'
\endif
\if :has_products
SELECT count(*) AS productos, count(*) FILTER (WHERE stock_actual < 0) AS stock_negativo FROM public.productos;
SELECT count(*) AS grupos_codigos_duplicados FROM (
  SELECT tenant_id, codigo FROM public.productos GROUP BY tenant_id, codigo HAVING count(*) > 1
) duplicates;
\endif
\if :has_cash
SELECT count(*) AS grupos_cajas_abiertas_duplicadas FROM (
  SELECT tenant_id, usuario_id FROM public.cajas WHERE estado = 'ABIERTA'
  GROUP BY tenant_id, usuario_id HAVING count(*) > 1
) duplicates;
\endif
\if :has_sales
SELECT count(*) AS ventas, count(*) FILTER (WHERE metodo_pago = 'CREDITO') AS ventas_credito FROM public.ventas;
\endif
\if :has_accounts
SELECT tipo, count(*) AS cuentas, sum(saldo) AS saldo_total FROM public.cuentas_operativas GROUP BY tipo;
\endif
SELECT tgname AS trigger_clientes FROM pg_trigger
WHERE tgrelid = to_regclass('public.clientes') AND NOT tgisinternal;
COMMIT;
