-- ESTADO DE LA BASE — SOLO LECTURA (preproducción/producción). Contiene únicamente SELECT dentro de una transacción READ ONLY.
-- No modifica datos ni el historial de migraciones. Ejecutar con un usuario de solo lectura (o el normal: la transacción lo impide):
--   psql "$DIRECT_URL" -X -f backend/scripts/estado-base-solo-lectura.sql > estado.txt
-- Compartir estado.txt SIN datos de clientes (solo hay conteos y nombres de migraciones). No contiene contraseñas ni claves.
-- La lista de migraciones y sus SHA-256 se generó desde backend/prisma/migrations; una prueba (estado-base-solo-lectura.test.mjs) falla si se desactualiza.
\pset pager off
\pset null '(nulo)'
BEGIN TRANSACTION READ ONLY;

\echo '== 1. IDENTIDAD'
SELECT current_database() AS base, version() AS postgresql, current_setting('server_encoding') AS codificacion;

\echo '== 2. HISTORIAL DE MIGRACIONES (esperado: ninguna incompleta ni revertida)'
SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS has_migrations,
       to_regclass('public.productos') IS NOT NULL AS has_products,
       to_regclass('public.ventas') IS NOT NULL AS has_sales,
       to_regclass('public.detalles_venta') IS NOT NULL AS has_sale_lines,
       to_regclass('public.detalles_devolucion') IS NOT NULL AS has_returns,
       to_regclass('public.operaciones_contingencia') IS NOT NULL AS has_contingency
\gset
\if :has_migrations
SELECT count(*) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) AS aplicadas_ok,
       count(*) FILTER (WHERE finished_at IS NULL AND rolled_back_at IS NULL) AS INCOMPLETAS_requieren_atencion,
       count(*) FILTER (WHERE rolled_back_at IS NOT NULL) AS revertidas,
       max(migration_name) FILTER (WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) AS ultima_aplicada
  FROM _prisma_migrations;

\echo '== 3. COMPARACIÓN CON ESTA VERSIÓN DEL CÓDIGO (estado por migración)'
\echo '   PENDIENTE = falta aplicar | APLICADA_CHECKSUM_DISTINTO = el contenido difiere (el servicio NO arrancará) | DESCONOCIDA_EN_BASE = la base tiene una migración que este código no conoce'
WITH esperado(nombre, sha_lf, sha_crlf) AS (VALUES
  ('20260925000000_initial_core','b78e2c2eb211afd3383a16e4b9e3a07720b171fbe2d2803526e3d1694fa11d8d','0cb0a91610b06457c98cefbc9b0d909336c0e1c4f2929883f918147faf1e27e9'),
  ('20260929000000_add_levantamiento_models','27ff98f00e4db58ff992907f4608140a86634fdcd0f9c49fc573208ec86f5685','74311979d3662cff11e34cc1e0f491aa3a08a968867caef68b6cd9a92ca62ce7'),
  ('20260930000000_alter_stock_decimal_and_operational_models','cd16b0556285700ccb4457621db5616a05611bcfef85a5e7f34cbb224f51e47c','78735749164de7d2747315d72fd91de325dbed36153c4c1f783317643808bb28'),
  ('20261002000000_add_customer_numbers','2eedbb5bcca66c0b937d98fe6866a0b7d1bb8f94604c193667feb09027a74ce8','6d1a4c3f44d500ab84f77596130b7e2557e12ad0bde58b9fbb6327ca11340f42'),
  ('20261004000000_operacion_ferreteria','e6a2d43ec307a97f9c74f722de413c6116e77f1b9289a6256a32a1ba22ced247','85c1be78f1355279d7ef0f95de07ba917d5cfdb1c8edf0363acf1d286437a7a1'),
  ('20261005000000_autorizaciones_devolucion','b1b3dce4e492de50b61d5543371693677fc38f51fbcefbdc1f1acd3f7eea90a7','2133d26a78bb0cdf2383b269ab138e09ff7fe33ac8fd2a3a4ea879a23ee68fb0'),
  ('20261005000000_compras_proveedor_y_costo_vigente','532661a39dab5eca8003fef2e70c8533213f962c8d329203dcb66e01f409a2cc','18135935a84257bb6827d8d6e9e6720d235988fe8cb4bb6a5696182150befc05'),
  ('20261006000000_clientes_credito','017509c2acca30d610d0bf9c0799f02d120081092df38e8caea3b4a522ad647d','4fa749cba967ed19c46a3792d7753d99fa14862dc5225b46d91e738b8d586a1a'),
  ('20261006000100_tenant_configuration','71cbd85ec389f68e0e55a751a636c94f284570d109161d6f637a3eacfe894362','3a7e418744c46f1a99c6c3f9b2ee4d563e64d4f8e8f5341832d01e3d94b76240'),
  ('20261009000000_levantamiento_multiusuario','9ee47644d81035c14bd80b975a9f47267f4b359fa6c35d0048de6a1a0ada3a44','ef1223a606978df5527137143938fe8c2c057a531f018226fe13af3526629257'),
  ('20261009120000_fs06_marca_idempotencia_levantamiento','6d70ee7d644835b0e75d5014563d78ed5c8e507c3a0b774b662b6bf1090425a6','d2b9dcf00b658930244a9e5b47f0fd5d23f82b3ba83ae7f1d4f355e9240082ad'),
  ('20261009130000_fs07_version_producto','e816ddacfb98c47b29febd1163d720a4e2e42e63303a98b94477be8143b5301f','ac42c9a5b878837d2d6ac735468d43e1d03b216f9f5d19101966e90e2615398b'),
  ('20261010120000_coberturas_garantia','45e9908ba2f581f6f7e39a21d2c0ce2b3b14cd70d2a355afc37d21df373bd2e9','4bd78f75935e974a5710f7cdf18abca39e3ef2b0845e46f722c49d2f1538059a'),
  ('20261010140000_productos_proveedores','de80390123696071c520db1b6c288d5ad3dccdfd65b58942c2cc7ed64cd63edf','a750b109438fe9b90904dc1a079968fa2421a87a147c777da8acb08f82e7c998'),
  ('20261011000000_pos_contingencia_offline','b1230adbb23b1ea7639e27f076c72595c61c9e5fb11cc70a3ab1b1b8f22d1c99','280c07a0d22cc2dd3c2a7147b5dabd8a59d6add8eb354da0231c4bbd672f3efc'),
  ('20261011150000_precio_aprobacion_producto','8885a35a928bbd2d0af9c45e82d3cfa2a03e82ff25cc5284ce94ef4416f88ab6','26b954be7a2ca4afcf65eee6c43baed64dbd12e5c7a88f221e7cdb4a35e7d751'),
  ('20261012000000_autenticacion_sesiones_intentos','6c97f030732d53b4444d32bdc8145cb843f87f0c2f1ea36250049c15b10c86be','8c90ddc54ad75870d479549f868f61f2ff8cd2b3cdecbc05c00be3c6b9e3d721'),
  ('20261012000000_conciliacion_pagos_bancarios','a17f827421444ca0f5fa4541338ca93651e5e7793ce349f6cbad8ff24c05cb1b','8d0c5affa655ce2ffcb76a6788c5b47e458594ba6fe0245b77631e78865e11de'),
  ('20261012000000_entrega_eventos_y_cantidades','059137e8a3befe9ad9153bc0ec4662dc8d66e93d10574f133a2ae5662de4d315','7fadf3ceeb4b2e1905505411bb7290c34f1a64316639f745a2a4d3fca3353663'),
  ('20261013000000_balance_referencia_pagos','3490f554a7dcafaa65f011b6bbb6f15fccda70269d622ca5889167103c568963','7fd72f90768dcdb6fc99069a0a544d498619d92197c6785113b514912d61b199'),
  ('20261014000000_cliente_plazo_credito','98dbb693a0f5bb43c5f05e94ac4b4be8059e1e8e0e8800eae82fe52f0b9081a8','922a1d9200e8a47ca206a78294ca1019483b698ac2ab3b3fc80f755ec503e3dc'),
  ('20261015000000_contingencia_revocar_ventanas_anteriores','88b2ac18252f77c35cdc8c3e5035a72a8cf089ff43f6c4221240ab787233a1ae','eb44b9cc2ea06f29f9bea817c28394b268a4b48bd74f172e28b89c71b42e5409'),
  ('20261016000000_contingencia_estado_rechazada','fe54728a8232c3c12ea1ce787ee2bd96cc4eac42ea1587647f67691384c8e23d','9eb6bf0255e3df291618e4940f37593951eeabac4f0e09ea89b8309cc0be59a2'),
  ('20261017000000_contingencia_rechazos_importe_incoherente','d177422a73e5ceab163285c22e3ecdcf353292aa13bbbd79547e63460281f3cf','d6d61a6f9c0e97e4c1f3f6ea87144ddda1e96b8cebb7e82b3d0b1a55e640347d'),
  ('20261018000000_tenant_logotipo_privado','64305c584ed8c8eaf2e4a1ca7dd1f62e4adb3672697e0ec43551877c5bf7faf1','95822f1b6f6af1bc6be5d84c9c12944b68e9560b8309aaab2b8c638137c70c21'),
  ('20261019000000_cloud_branding_sucursales','eb24fb6acdec8a08b6bee9edd0d597609097b479b723f966f49dd7af724d4cc8','1b9df1f791278b71c1bdfdbdd4e748d881e5d4455be7fc175ca97339c26b0ef6'),
  ('20261021000000_sesiones_auth_rotacion_refresh','aa16c2564b5038f8d22fa8dcfa556dd69cc93bcb973094bf22dd66e9a7ba642c','b8deb775549361ffc4178475ba5c986d98f2192978107e04e0d1ba7b56931a32')
), aplicada AS (
  SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations
)
SELECT e.nombre,
       CASE WHEN a.migration_name IS NULL THEN 'PENDIENTE'
            WHEN a.rolled_back_at IS NOT NULL THEN 'REVERTIDA'
            WHEN a.finished_at IS NULL THEN 'INCOMPLETA'
            WHEN a.checksum IN (e.sha_lf, e.sha_crlf) THEN 'APLICADA_OK'
            ELSE 'APLICADA_CHECKSUM_DISTINTO' END AS estado
  FROM esperado e LEFT JOIN aplicada a ON a.migration_name = e.nombre
UNION ALL
SELECT a.migration_name, 'DESCONOCIDA_EN_BASE' FROM aplicada a WHERE a.migration_name NOT IN (SELECT nombre FROM esperado)
ORDER BY 1;
\else
\echo 'No existe _prisma_migrations: base sin historial de Prisma (vacía o creada fuera de Prisma). NO migrar sin revisar con migrate:inspect / baseline.'
\endif

\echo '== 4. CONTEOS (tamaño de lo que tocará la migración)'
\if :has_products
SELECT 'productos' AS tabla, count(*) AS filas FROM productos;
\endif
\if :has_sales
SELECT 'ventas' AS tabla, count(*) AS filas FROM ventas;
\endif
\if :has_sale_lines
SELECT 'detalles_venta (los reescribe 20261012...)' AS tabla, count(*) AS filas FROM detalles_venta;
\endif
\if :has_returns
SELECT 'detalles_devolucion' AS tabla, count(*) AS filas FROM detalles_devolucion;
\endif

\echo '== 5. PRECONDICIONES DE DATOS DE LA MIGRACIÓN DE ENTREGAS (20261012000000_entrega_eventos_y_cantidades). TODAS deben dar 0 antes de migrar'
\if :has_sale_lines
\echo '   5a. líneas de venta sin venta (el CHECK tenant_id NOT NULL falla)'
SELECT count(*) AS lineas_huerfanas FROM detalles_venta d LEFT JOIN ventas v ON v.id = d.venta_id WHERE v.id IS NULL;
\echo '   5b. líneas cuyo producto pertenece a otra empresa (la clave foránea compuesta falla)'
SELECT count(*) AS lineas_producto_de_otra_empresa FROM detalles_venta d JOIN ventas v ON v.id = d.venta_id JOIN productos p ON p.id = d.producto_id WHERE p.tenant_id <> v.tenant_id;
\if :has_returns
\echo '   5c. D-01: devoluciones INVENTARIO sobre reserva pendiente sin entrega (requiere propuestas/entregas-148/00_normalizar_historico_previo.sql con autorización)'
SELECT count(*) AS d01_devoluciones_sobre_reserva_no_entregada FROM detalles_venta d JOIN ventas v ON v.id = d.venta_id
  JOIN detalles_devolucion dd ON dd.detalle_venta_id = d.id
 WHERE dd.destino = 'INVENTARIO' AND d.sin_inventario = false AND v.reserva_pendiente = true AND v.entregado_at IS NULL;
\echo '   5d. devuelto más que lo vendido (la migración abortaría con «Backfill de entregas inconsistente»)'
SELECT count(*) AS lineas_devuelto_mayor_que_vendido FROM detalles_venta d
 WHERE d.sin_inventario = false AND COALESCE((SELECT SUM(dd.cantidad) FROM detalles_devolucion dd WHERE dd.detalle_venta_id = d.id), 0) > d.cantidad;
\endif
\endif

\echo '== 6. 20261011150000 (aprobación de precio): huella de la variante alterna'
SELECT to_regclass('public._prisma_migrations') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='productos' AND column_name='precio_aprobado_por') AS columnas_presentes
\gset
\if :columnas_presentes
SELECT count(*) FILTER (WHERE activo = false AND precio_aprobado AND precio_aprobado_por = 'LEGADO_MIGRACION') AS inactivos_legado_aprobado_variante_alterna,
       count(*) FILTER (WHERE activo = true  AND precio_aprobado AND precio_aprobado_por = 'LEGADO_MIGRACION') AS activos_legado_aprobado,
       count(*) AS productos
  FROM productos;
\else
\echo '   (las columnas aún no existen: ninguna variante se aplicó en esta base)'
\endif

\echo '== 7. 20261017000000 (F5): estado de la restricción del diario de contingencia'
\if :has_contingency
SELECT pg_get_constraintdef(oid) AS montos_check_actual FROM pg_constraint WHERE conname = 'operaciones_contingencia_montos_check';
SELECT estado, count(*) AS filas FROM operaciones_contingencia GROUP BY estado ORDER BY estado;
\else
\echo '   (la tabla del diario no existe: la contingencia nunca se instaló en esta base)'
\endif

ROLLBACK;
