-- Diagnóstico de SOLO LECTURA del esquema que usa el resumen del dashboard (DashboardService).
-- Compara las columnas que Prisma selecciona (generadas desde prisma/schema.prisma) con
-- information_schema de la base indicada. No crea, altera ni borra nada. Termina con ROLLBACK.
--
-- Ejecutar en PRODUCCIÓN solo con autorización del responsable y con un usuario de solo lectura:
--   psql "$URL_LECTURA" -X -v ON_ERROR_STOP=1 -f backend/scripts/diagnostico-dashboard-lectura.sql
-- No pegar la URL con contraseña en tickets ni en el repositorio.

BEGIN;
SET TRANSACTION READ ONLY;

-- 1. Columnas que Prisma espera y que faltan en la base (lo que más probablemente produce el 500).
WITH esperadas(tabla, columna) AS (VALUES
  ('ventas', 'reserva_pendiente'),
  ('ventas', 'id'),
  ('ventas', 'tenant_id'),
  ('ventas', 'numero_venta'),
  ('ventas', 'cliente_id'),
  ('ventas', 'usuario_id'),
  ('ventas', 'subtotal'),
  ('ventas', 'isv'),
  ('ventas', 'descuento'),
  ('ventas', 'total'),
  ('ventas', 'metodo_pago'),
  ('ventas', 'tipo_pago'),
  ('ventas', 'saldo_credito'),
  ('ventas', 'caja_id'),
  ('ventas', 'entregado_at'),
  ('ventas', 'entregado_por'),
  ('ventas', 'cliente_nombre'),
  ('ventas', 'cliente_rtn'),
  ('ventas', 'solicitud_hash'),
  ('ventas', 'estado'),
  ('ventas', 'notas'),
  ('ventas', 'created_at'),
  ('productos', 'stock_reservado'),
  ('productos', 'id'),
  ('productos', 'tenant_id'),
  ('productos', 'codigo'),
  ('productos', 'codigo_barras'),
  ('productos', 'codigo_fabricante'),
  ('productos', 'marca'),
  ('productos', 'version'),
  ('productos', 'margen'),
  ('productos', 'ultima_compra_at'),
  ('productos', 'nombre'),
  ('productos', 'descripcion'),
  ('productos', 'categoria_id'),
  ('productos', 'precio_venta'),
  ('productos', 'precio_costo'),
  ('productos', 'costo_vigente'),
  ('productos', 'stock_actual'),
  ('productos', 'stock_minimo'),
  ('productos', 'unidad_medida'),
  ('productos', 'usa_medida'),
  ('productos', 'activo'),
  ('productos', 'imagen_url'),
  ('productos', 'created_at'),
  ('productos', 'updated_at'),
  ('devoluciones', 'id'),
  ('devoluciones', 'tenant_id'),
  ('devoluciones', 'venta_id'),
  ('devoluciones', 'usuario_id'),
  ('devoluciones', 'solicitud_hash'),
  ('devoluciones', 'motivo'),
  ('devoluciones', 'monto'),
  ('devoluciones', 'credito_cancelado'),
  ('devoluciones', 'reembolso'),
  ('devoluciones', 'metodo'),
  ('devoluciones', 'caja_id'),
  ('devoluciones', 'created_at'),
  ('cotizaciones', 'id'),
  ('cotizaciones', 'tenant_id'),
  ('cotizaciones', 'numero_cotizacion'),
  ('cotizaciones', 'cliente_id'),
  ('cotizaciones', 'cliente_nombre'),
  ('cotizaciones', 'cliente_rtn'),
  ('cotizaciones', 'cliente_telefono'),
  ('cotizaciones', 'cliente_email'),
  ('cotizaciones', 'cliente_direccion'),
  ('cotizaciones', 'usuario_id'),
  ('cotizaciones', 'subtotal'),
  ('cotizaciones', 'porcentaje_isv'),
  ('cotizaciones', 'isv'),
  ('cotizaciones', 'descuento'),
  ('cotizaciones', 'descuento_general'),
  ('cotizaciones', 'tipo_descuento_general'),
  ('cotizaciones', 'total'),
  ('cotizaciones', 'estado'),
  ('cotizaciones', 'fecha_validez'),
  ('cotizaciones', 'dias_validez'),
  ('cotizaciones', 'condiciones_pago'),
  ('cotizaciones', 'notas'),
  ('cotizaciones', 'venta_id'),
  ('cotizaciones', 'created_at'),
  ('cotizaciones', 'updated_at'),
  ('usuarios', 'id'),
  ('usuarios', 'tenant_id'),
  ('usuarios', 'nombre'),
  ('usuarios', 'email'),
  ('usuarios', 'password_hash'),
  ('usuarios', 'rol'),
  ('usuarios', 'permisos_configurados'),
  ('usuarios', 'descuento_maximo'),
  ('usuarios', 'activo'),
  ('usuarios', 'created_at'),
  ('usuarios', 'updated_at'),
  ('clientes', 'id'),
  ('clientes', 'tenant_id'),
  ('clientes', 'codigo'),
  ('clientes', 'numero_cliente'),
  ('clientes', 'nombre'),
  ('clientes', 'rtn'),
  ('clientes', 'telefono'),
  ('clientes', 'email'),
  ('clientes', 'direccion'),
  ('clientes', 'tipo'),
  ('clientes', 'credito_habilitado'),
  ('clientes', 'limite_credito'),
  ('clientes', 'saldo_pendiente'),
  ('clientes', 'activo'),
  ('clientes', 'created_at'),
  ('clientes', 'updated_at')
)
SELECT e.tabla, e.columna
FROM esperadas e
LEFT JOIN information_schema.columns c
  ON c.table_schema = 'public' AND c.table_name = e.tabla AND c.column_name = e.columna
WHERE c.column_name IS NULL
ORDER BY e.tabla, e.columna;

-- 2. Tablas esperadas que no existen.
WITH tablas(tabla) AS (VALUES ('ventas'), ('productos'), ('devoluciones'), ('cotizaciones'), ('usuarios'), ('clientes'))
SELECT t.tabla
FROM tablas t
LEFT JOIN pg_tables p ON p.schemaname = 'public' AND p.tablename = t.tabla
WHERE p.tablename IS NULL;

-- 3. Migraciones registradas por Prisma (solo si existe el historial; sin checksums ni logs).
SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS tiene_historial \gset
\if :tiene_historial
SELECT migration_name, finished_at, rolled_back_at
FROM _prisma_migrations
WHERE migration_name >= '20260925'
ORDER BY migration_name;
\else
\echo 'Sin tabla _prisma_migrations: no hay historial de Prisma en esta base.'
\endif

-- 4. Tipos de columnas críticas para el dashboard (fecha de validez debe ser date).
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND ((table_name = 'cotizaciones' AND column_name = 'fecha_validez')
    OR (table_name = 'devoluciones' AND column_name IN ('monto', 'created_at'))
    OR (table_name = 'ventas' AND column_name IN ('created_at', 'total')))
ORDER BY table_name, column_name;

ROLLBACK;
