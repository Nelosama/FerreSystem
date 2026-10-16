-- =====================================================================
-- FerreSystem: datos ficticios de un mes de operación (15-sep a 14-oct-2026).
--
-- Qué crea: una empresa demo nueva con usuarios, categorías, catálogo de 36
-- productos con precio aprobado, 18 clientes (4 con crédito), 5 proveedores,
-- compras con recepción y pago, ventas de contado y a crédito, entregas
-- inmediatas y entregas desde bodega, abonos de clientes, egresos de caja,
-- cierres diarios (con una diferencia explicada) y cotizaciones.
-- No modifica ninguna empresa existente.
--
-- Cuándo: solo en una base de DESARROLLO o STAGING cuya marca de entorno (backend/prisma/entorno/
-- entorno-marcador.sql) tenga un identificador AUTORIZADO en backend/prisma/entornos-seed.json.
-- Si la lista está vacía, falta la marca o el identificador no coincide, no se inserta nada.
-- Si la empresa demo ya existe, se detiene sin cambiar nada.
--
-- Ejecutar SOLO con el script envoltorio, que usa DEMO_DATABASE_URL (nunca DATABASE_URL):
--   DEMO_DATABASE_URL=postgresql://... backend/scripts/cargar-datos-demo.sh
--
-- Variable interna AUTORIZADOS (la fija el envoltorio, separada por comas): identificadores autorizados.
-- Si no se define, psql aborta antes de cualquier INSERT (falla cerrada).

-- Reglas que reproduce, tomadas del backend:
--   - Venta MOSTRADOR: descuenta existencias al cobrar; genera evento COBRO,
--     evento ENTREGA y movimiento ENTREGA enlazado a la línea.
--   - Venta BODEGA: reserva existencias; la entrega posterior genera evento y
--     movimiento ENTREGA y libera la reserva.
--   - ISV 15% sobre la base; crédito genera CXC y suma al saldo del cliente.
--   - Caja: VENTA_POS, ABONO_CXC y EGRESO_MANUAL (negativo) por método; el
--     cierre registra monto esperado, físico y diferencia.
--   - Compras: orden RECIBIDA, recepción, costo vigente, movimiento COMPRA y CXP.
--
-- Los datos son ficticios. Los correos usan el dominio reservado .example.
-- =====================================================================

BEGIN;

-- 0. Lista de identificadores autorizados (la fija el envoltorio desde entornos-seed.json).
-- Si AUTORIZADOS no está definida, esta sentencia falla y no se carga nada.
CREATE TEMP TABLE entornos_autorizados ON COMMIT DROP AS
  SELECT lower(btrim(x)) AS identificador FROM unnest(string_to_array(:'AUTORIZADOS', ',')) AS x WHERE btrim(x) <> '';

-- 1. Guardia de entorno: marca presente y única, tipo DESARROLLO/STAGING, identificador autorizado,
-- y sin repetir la carga. Una modificación de la marca no basta: el identificador debe estar en la lista.
DO $guardia$
DECLARE
  v_tipo text;
  v_id   text;
  v_n    int;
BEGIN
  IF to_regclass('public.entorno_ferresystem') IS NULL THEN
    RAISE EXCEPTION 'Falta la marca de entorno (backend/prisma/entorno/entorno-marcador.sql). No se carga nada.';
  END IF;
  SELECT count(*) INTO v_n FROM entornos_autorizados WHERE identificador ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  IF v_n = 0 THEN
    RAISE EXCEPTION 'La lista de entornos autorizados está vacía o no tiene identificadores válidos. No se carga nada.';
  END IF;
  SELECT count(*) INTO v_n FROM entorno_ferresystem;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'La marca de entorno es ambigua (% filas). No se carga nada.', v_n;
  END IF;
  SELECT tipo, lower(identificador::text) INTO v_tipo, v_id FROM entorno_ferresystem WHERE id = 1;
  IF v_tipo IS NULL OR v_tipo NOT IN ('DESARROLLO', 'STAGING') THEN
    RAISE EXCEPTION 'La marca de entorno es %. Este script solo carga datos en DESARROLLO o STAGING.', COALESCE(v_tipo, 'ausente');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM entornos_autorizados WHERE identificador = v_id) THEN
    RAISE EXCEPTION 'El identificador de la marca de entorno no está autorizado en backend/prisma/entornos-seed.json. No se carga nada.';
  END IF;
  IF EXISTS (SELECT 1 FROM tenants WHERE nombre_comercial = 'Ferreteria Demo Operacion 1 Mes') THEN
    RAISE EXCEPTION 'La empresa demo ya existe. No se vuelve a cargar.';
  END IF;
END
$guardia$;

-- 2. Funciones temporales de la sesión (se eliminan al final).
-- Hora local de Tegucigalpa a UTC, como guarda la aplicación (columnas timestamp sin zona).
CREATE FUNCTION pg_temp.utc(p_local timestamp) RETURNS timestamp
  LANGUAGE sql IMMUTABLE AS $f$
  SELECT (p_local AT TIME ZONE 'America/Tegucigalpa') AT TIME ZONE 'UTC'
$f$;

-- Huella canónica de un evento de entrega (forma v1 de common/huella-solicitud.ts).
-- p_lineas: objetos JSON ya ordenados por detalleVentaId, separados por comas.
CREATE FUNCTION pg_temp.huella_evento(p_tipo text, p_venta text, p_usuario text, p_lineas text, p_receptor text) RETURNS text
  LANGUAGE sql IMMUTABLE AS $f$
  SELECT encode(sha256(convert_to(
    '{"lineas":[' || p_lineas || '],"motivo":null,"origen":"ONLINE","receptorNombre":' ||
    COALESCE(to_json(p_receptor)::text, 'null') || ',"tipo":"' || p_tipo ||
    '","usuarioId":"' || p_usuario || '","v":1,"ventaId":"' || p_venta || '"}', 'UTF8')), 'hex')
$f$;

-- 3. Carga.
DO $carga$
DECLARE
  c_inicio constant date := DATE '2026-09-15';  -- 15-sep es feriado patrio: sin caja ese día
  c_fin    constant date := DATE '2026-10-14';
  c_clave  constant text := '$2b$10$pamxv1MUe9rjxFnc4aUVruhURfhHB7OKE/7d3s/eJ9eggCFyCZnVW';

  v_tenant text := gen_random_uuid()::text;
  v_admin  text := gen_random_uuid()::text;
  v_caj1   text := gen_random_uuid()::text;
  v_caj2   text := gen_random_uuid()::text;
  v_bod    text := gen_random_uuid()::text;
  v_ven    text := gen_random_uuid()::text;

  v_dia    date;
  v_dow    int;
  v_hora   timestamp;
  v_min    int;
  v_i      int;
  v_seq_oc int := 0;
  v_seq_cx int := 0;

  -- Caja del día y cajero de cada venta
  v_cajc1  text;
  v_cajc2  text;
  v_caja   text;
  v_cajero text;

  -- Venta
  v_venta  text;
  v_num    int;
  v_nl     int;
  v_q      numeric;
  v_disp   numeric;
  v_stock  numeric;
  v_res    numeric;
  v_precio numeric;
  v_costo  numeric;
  v_modo   text;
  v_sub    numeric;
  v_isv    numeric;
  v_tot    numeric;
  v_r      numeric;
  v_metodo text;
  v_tipo   text;
  v_credito boolean;
  v_lineas text;
  v_recep  text;
  v_ev     text;
  v_n      int;

  -- Cliente de la venta
  v_cli_id      text;
  v_cli_nombre  text;
  v_cli_credito boolean;
  v_cli_plazo   int;
  v_cli_limite  numeric;
  v_cli_saldo   numeric;

  -- Compras
  v_prov   record;
  v_lc     record;
  v_orden  text;
  v_rec    text;
  v_cuenta text;
  v_fe     timestamp;
  v_fr     timestamp;
  v_factura text;
  v_contado boolean;

  -- Cobros, egresos y cierre
  v_cc     record;
  v_cx     record;
  v_c      record;
  v_pago   text;
  v_monto  numeric;
  v_esp    numeric;
  v_dif    numeric;
  v_conc   text;
  v_p      record;
  v_cot    text;
  v_estado text;
  v_usr    text;
BEGIN
  -- Semilla fija: los mismos datos en cada carga en una base vacía.
  PERFORM setseed(0.2026);

  -- 3.1 Empresa, módulos y secuencias
  INSERT INTO tenants (id, nombre_comercial, direccion, telefono, email, color_primario, modo_navegacion, plan, estado, configuracion, created_at, updated_at)
  VALUES (v_tenant, 'Ferreteria Demo Operacion 1 Mes', 'Dato ficticio, Tegucigalpa', '2200-0000', 'contacto@ferreteria-demo.example', '#EA580C', 'SIDEBAR', 'Plan Pro', 'ACTIVO', '{}', now(), now());

  INSERT INTO tenant_modules (id, tenant_id, module_key, enabled, created_at, updated_at)
  SELECT gen_random_uuid()::text, v_tenant, k, true, now(), now()
  FROM unnest(ARRAY['pos','cotizaciones','pedidos_especiales','apartados','inventario','ordenes_compra','transferencias_sucursal',
                    'garantias','listas_precio','usuarios','comisiones_venta','arqueo_caja','reportes','configuracion','levantamiento']) AS k;

  INSERT INTO secuencias_tenant (id, tenant_id, tipo, ultimo_numero) VALUES
    (gen_random_uuid()::text, v_tenant, 'VENTA', 0),
    (gen_random_uuid()::text, v_tenant, 'COTIZACION', 0);

  -- 3.2 Usuarios (correos ficticios; la contraseña no se guarda, solo su hash)
  INSERT INTO usuarios (id, tenant_id, nombre, email, password_hash, rol, descuento_maximo, activo, created_at, updated_at) VALUES
    (v_admin, v_tenant, 'Administrador Demo', 'admin@ferreteria-demo.example', c_clave, 'ADMIN', 0, true, now(), now()),
    (v_caj1,  v_tenant, 'Cajero Uno Demo',    'cajero1@ferreteria-demo.example', c_clave, 'CAJERO', 0, true, now(), now()),
    (v_caj2,  v_tenant, 'Cajera Dos Demo',    'cajero2@ferreteria-demo.example', c_clave, 'CAJERO', 0, true, now(), now()),
    (v_bod,   v_tenant, 'Bodeguero Demo',     'bodega@ferreteria-demo.example',  c_clave, 'BODEGUERO', 0, true, now(), now()),
    (v_ven,   v_tenant, 'Vendedor Demo',      'vendedor@ferreteria-demo.example', c_clave, 'VENDEDOR', 0, true, now(), now());

  -- 3.3 Categorías
  INSERT INTO categorias (id, tenant_id, nombre, descripcion, created_at, updated_at)
  SELECT gen_random_uuid()::text, v_tenant, n, d, now(), now() FROM (VALUES
    ('Herramientas Manuales', 'Martillos, destornilladores, llaves'),
    ('Materiales de Construccion', 'Cemento, varilla, block, arena'),
    ('Plomeria y Tuberias', 'Tubos PVC, accesorios, llaves de paso'),
    ('Electricidad e Iluminacion', 'Cables, tomacorrientes, focos LED'),
    ('Pintura y Acabados', 'Pinturas, rodillos, brochas, lijas')) AS c(n, d);

  -- 3.4 Proveedores
  CREATE TEMP TABLE tmp_prov (n int PRIMARY KEY, id text, nombre text) ON COMMIT DROP;
  INSERT INTO tmp_prov (n, id, nombre)
  SELECT n, gen_random_uuid()::text, nombre FROM (VALUES
    (1, 'Distribuidora Herramientas Demo'),
    (2, 'Materiales Construccion Demo'),
    (3, 'Tuberias y Accesorios Demo'),
    (4, 'Electricos del Sur Demo'),
    (5, 'Pinturas y Acabados Demo')) AS p(n, nombre);

  INSERT INTO proveedores (id, tenant_id, nombre, rtn, contacto, telefono, email, direccion, activo, created_at, updated_at)
  SELECT id, v_tenant, nombre, NULL, 'Contacto ficticio', '2200-10' || lpad(n::text, 2, '0'),
         'ventas' || n || '@proveedor-demo.example', 'Dato ficticio', true, now(), now()
  FROM tmp_prov;

  -- 3.5 Catálogo: 36 productos con precio aprobado y existencia inicial
  -- Columnas: codigo, nombre, categoría, unidad, es_decimal, costo, precio, mínimo, existencia inicial, proveedor (n), peso de rotación
  CREATE TEMP TABLE tmp_prod (
    id text PRIMARY KEY, codigo text, nombre text, categoria text, unidad text, es_decimal boolean,
    costo numeric, precio numeric, minimo numeric, stock numeric, prov int, peso numeric
  ) ON COMMIT DROP;
  INSERT INTO tmp_prod
  SELECT gen_random_uuid()::text, c.* FROM (VALUES
    ('HER-001', 'Martillo de una 16 oz', 'Herramientas Manuales', 'UNIDAD', false, 95, 145, 6, 18, 1, 3),
    ('HER-002', 'Destornillador plano 6 pulg', 'Herramientas Manuales', 'UNIDAD', false, 28, 45, 12, 40, 1, 4),
    ('HER-003', 'Destornillador Phillips 6 pulg', 'Herramientas Manuales', 'UNIDAD', false, 30, 48, 12, 36, 1, 4),
    ('HER-004', 'Juego de llaves combinadas 8 pzas', 'Herramientas Manuales', 'UNIDAD', false, 390, 590, 3, 8, 1, 1),
    ('HER-005', 'Cinta metrica 5 m', 'Herramientas Manuales', 'UNIDAD', false, 60, 95, 6, 15, 1, 3),
    ('HER-006', 'Nivel de burbuja 12 pulg', 'Herramientas Manuales', 'UNIDAD', false, 110, 175, 4, 9, 1, 2),
    ('HER-007', 'Serrucho para madera 20 pulg', 'Herramientas Manuales', 'UNIDAD', false, 135, 210, 4, 7, 1, 2),
    ('HER-008', 'Alicate de presion 10 pulg', 'Herramientas Manuales', 'UNIDAD', false, 115, 180, 4, 8, 1, 2),
    ('CON-001', 'Cemento gris 42.5 kg', 'Materiales de Construccion', 'UNIDAD', false, 165, 225, 60, 180, 2, 5),
    ('CON-002', 'Varilla corrugada 3/8 pulg x 6 m', 'Materiales de Construccion', 'UNIDAD', false, 115, 165, 40, 120, 2, 4),
    ('CON-003', 'Block de concreto 15x20x40', 'Materiales de Construccion', 'UNIDAD', false, 14, 20, 300, 900, 2, 5),
    ('CON-004', 'Arena de rio (metro cubico)', 'Materiales de Construccion', 'METRO_CUBICO', true, 650, 890, 4, 12, 2, 2),
    ('CON-005', 'Piedrin (metro cubico)', 'Materiales de Construccion', 'METRO_CUBICO', true, 700, 950, 4, 10, 2, 2),
    ('CON-006', 'Alambre de amarre (libra)', 'Materiales de Construccion', 'LIBRA', true, 38, 58, 50, 140, 2, 3),
    ('CON-007', 'Lamina de zinc 12 pie', 'Materiales de Construccion', 'UNIDAD', false, 260, 365, 10, 30, 2, 1),
    ('PLO-001', 'Tubo PVC 1/2 pulg x 3 m', 'Plomeria y Tuberias', 'UNIDAD', false, 62, 92, 30, 90, 3, 4),
    ('PLO-002', 'Tubo PVC 3/4 pulg x 3 m', 'Plomeria y Tuberias', 'UNIDAD', false, 78, 115, 20, 60, 3, 3),
    ('PLO-003', 'Codo PVC 1/2 pulg', 'Plomeria y Tuberias', 'UNIDAD', false, 4.5, 8, 80, 240, 3, 4),
    ('PLO-004', 'Union PVC 1/2 pulg', 'Plomeria y Tuberias', 'UNIDAD', false, 5, 9, 80, 200, 3, 3),
    ('PLO-005', 'Llave de paso de bola 1/2 pulg', 'Plomeria y Tuberias', 'UNIDAD', false, 65, 105, 12, 36, 3, 3),
    ('PLO-006', 'Cinta teflon', 'Plomeria y Tuberias', 'UNIDAD', false, 6, 12, 60, 180, 3, 4),
    ('PLO-007', 'Pegamento PVC 237 ml', 'Plomeria y Tuberias', 'UNIDAD', false, 75, 118, 12, 30, 3, 2),
    ('PLO-008', 'Lavamanos blanco completo', 'Plomeria y Tuberias', 'UNIDAD', false, 1450, 2290, 1, 3, 3, 1),
    ('ELE-001', 'Cable THHN 12 AWG (metro)', 'Electricidad e Iluminacion', 'METRO', true, 14, 22, 150, 500, 4, 4),
    ('ELE-002', 'Tomacorriente doble con placa', 'Electricidad e Iluminacion', 'UNIDAD', false, 45, 75, 15, 50, 4, 3),
    ('ELE-003', 'Interruptor sencillo', 'Electricidad e Iluminacion', 'UNIDAD', false, 38, 62, 15, 40, 4, 2),
    ('ELE-004', 'Foco LED 9 W luz blanca', 'Electricidad e Iluminacion', 'UNIDAD', false, 42, 70, 30, 90, 4, 5),
    ('ELE-005', 'Cinta aislante negra', 'Electricidad e Iluminacion', 'UNIDAD', false, 12, 20, 40, 120, 4, 3),
    ('ELE-006', 'Breaker 20 A monofasico', 'Electricidad e Iluminacion', 'UNIDAD', false, 85, 135, 10, 24, 4, 2),
    ('ELE-007', 'Caja plastica para breaker', 'Electricidad e Iluminacion', 'UNIDAD', false, 28, 45, 10, 30, 4, 1),
    ('PIN-001', 'Pintura latex interior blanca', 'Pintura y Acabados', 'GALON', false, 285, 420, 15, 45, 5, 4),
    ('PIN-002', 'Pintura esmalte negro', 'Pintura y Acabados', 'GALON', false, 350, 520, 8, 24, 5, 2),
    ('PIN-003', 'Rodillo para pintura 9 pulg', 'Pintura y Acabados', 'UNIDAD', false, 58, 95, 10, 30, 5, 3),
    ('PIN-004', 'Brocha 2 pulg', 'Pintura y Acabados', 'UNIDAD', false, 22, 38, 15, 45, 5, 3),
    ('PIN-005', 'Thinner (litro)', 'Pintura y Acabados', 'LITRO', true, 55, 85, 20, 60, 5, 2),
    ('PIN-006', 'Lija para madera grano 120', 'Pintura y Acabados', 'UNIDAD', false, 9, 15, 40, 150, 5, 3)
  ) AS c(codigo, nombre, categoria, unidad, es_decimal, costo, precio, minimo, stock, prov, peso);

  INSERT INTO productos (id, tenant_id, codigo, nombre, categoria_id, unidad_medida, precio_venta, precio_costo, costo_vigente,
                         stock_actual, stock_reservado, stock_minimo, usa_medida, activo, precio_aprobado, precio_aprobado_por,
                         precio_aprobado_at, margen, version, created_at, updated_at)
  SELECT p.id, v_tenant, p.codigo, p.nombre, cat.id, p.unidad::"UnidadMedida", p.precio, p.costo, NULL,
         p.stock, 0, p.minimo, false, true, true, v_admin,
         pg_temp.utc(DATE '2026-09-14' + TIME '17:00'), round((p.precio - p.costo) / p.precio * 100, 2), 1, now(), now()
  FROM tmp_prod p
  JOIN categorias cat ON cat.tenant_id = v_tenant AND cat.nombre = p.categoria;

  INSERT INTO movimientos_inventario (id, tenant_id, producto_id, usuario_id, tipo, cantidad, anterior, nuevo, documento_id, motivo, created_at)
  SELECT gen_random_uuid()::text, v_tenant, p.id, v_admin, 'INICIAL', p.stock, 0, p.stock, p.id,
         'Alta inicial de producto', pg_temp.utc(DATE '2026-09-14' + TIME '17:00')
  FROM tmp_prod p;

  -- 3.6 Clientes: 4 con crédito habilitado (mayoristas y contratistas) y 14 de mostrador.
  -- El número y el código los asigna el trigger clientes_assign_number.
  CREATE TEMP TABLE tmp_cli (n int PRIMARY KEY, id text, nombre text, credito boolean, plazo int, limite numeric) ON COMMIT DROP;
  INSERT INTO tmp_cli (n, id, nombre, credito, plazo, limite)
  SELECT n, gen_random_uuid()::text, nombre, credito, plazo, limite FROM (VALUES
    (1, 'Constructora Alfa Demo', true, 30, 80000),
    (2, 'Carpinteria Delta Demo', true, 15, 40000),
    (3, 'Taller Beta Demo', true, 30, 50000),
    (4, 'Ferreteria Gamma Demo', true, 15, 60000)) AS c(n, nombre, credito, plazo, limite);
  INSERT INTO tmp_cli (n, id, nombre, credito, plazo, limite)
  SELECT g, gen_random_uuid()::text, 'Cliente Demo ' || lpad(g::text, 2, '0'), false, NULL, NULL
  FROM generate_series(5, 18) AS g;

  INSERT INTO clientes (id, tenant_id, nombre, telefono, tipo, credito_habilitado, plazo_credito_dias, limite_credito,
                        saldo_pendiente, activo, created_at, updated_at)
  SELECT id, v_tenant, nombre, '9999-' || lpad(n::text, 4, '0'),
         CASE WHEN n IN (1, 3) THEN 'CONTRATISTA' WHEN n IN (2, 4) THEN 'MAYORISTA' ELSE 'CONSUMIDOR_FINAL' END::"TipoCliente",
         credito, plazo, limite, 0, true, now(), now()
  FROM tmp_cli;

  -- Tablas temporales de trabajo de la simulación
  CREATE TEMP TABLE tmp_lineas (det text PRIMARY KEY, prod text, cant numeric, precio numeric, costo numeric,
                                modo text, stock_antes numeric, subtotal numeric) ON COMMIT DROP;
  CREATE TEMP TABLE tmp_pend (det text PRIMARY KEY, venta text, prod text, cant numeric, dia date, cajero text) ON COMMIT DROP;
  CREATE TEMP TABLE tmp_oc (prod text PRIMARY KEY, cant numeric, costo numeric) ON COMMIT DROP;

  -- 3.7 Días de operación: lunes a sábado, con caja por cajero
  FOR v_dia IN SELECT d::date FROM generate_series(c_inicio::timestamp, c_fin::timestamp, interval '1 day') AS d LOOP
    v_dow := EXTRACT(DOW FROM v_dia)::int;
    CONTINUE WHEN v_dow = 0 OR v_dia = c_inicio;

    -- Apertura de cajas
    v_cajc1 := gen_random_uuid()::text;
    v_cajc2 := gen_random_uuid()::text;
    INSERT INTO cajas (id, tenant_id, codigo, usuario_id, monto_apertura, estado, fecha_apertura) VALUES
      (v_cajc1, v_tenant, 'CJ-' || to_char(v_dia, 'YYYYMMDD') || '-1', v_caj1, 1500, 'ABIERTA', pg_temp.utc(v_dia::timestamp + TIME '07:50')),
      (v_cajc2, v_tenant, 'CJ-' || to_char(v_dia, 'YYYYMMDD') || '-2', v_caj2, 1500, 'ABIERTA', pg_temp.utc(v_dia::timestamp + TIME '07:50'));

    -- 3.7.a Entregas pendientes de bodega cuya fecha llegó (10:00 a 15:00)
    FOR v_p IN SELECT * FROM tmp_pend WHERE dia <= v_dia ORDER BY venta, det LOOP
      SELECT stock_actual INTO v_stock FROM productos WHERE id = v_p.prod;
      v_hora := v_dia::timestamp + make_interval(mins => 600 + floor(random() * 300)::int);
      v_lineas := format('{"cantidadCentesimas":%s,"detalleVentaId":"%s"}', round(v_p.cant * 100)::int, v_p.det);
      -- La entrega desde bodega exige nombre del receptor (entregas-core: "nombre del receptor obligatorio").
      SELECT COALESCE(NULLIF(btrim(regexp_replace(cliente_nombre, '\s+', ' ', 'g')), ''), 'Cliente demo')
        INTO v_recep FROM ventas WHERE id = v_p.venta;
      v_ev := gen_random_uuid()::text;

      INSERT INTO entregas_eventos (id, tenant_id, solicitud_id, huella, tipo, venta_id, usuario_id, receptor_nombre, motivo, origen, created_at)
      VALUES (v_ev, v_tenant, gen_random_uuid()::text, pg_temp.huella_evento('ENTREGA', v_p.venta, v_bod, v_lineas, v_recep),
              'ENTREGA', v_p.venta, v_bod, v_recep, NULL, 'ONLINE', pg_temp.utc(v_hora));
      INSERT INTO entregas_eventos_lineas (tenant_id, evento_id, detalle_venta_id, cantidad) VALUES (v_tenant, v_ev, v_p.det, v_p.cant);
      INSERT INTO movimientos_inventario (id, tenant_id, producto_id, usuario_id, tipo, cantidad, anterior, nuevo, documento_id, motivo, evento_id, detalle_venta_id, created_at)
      VALUES (gen_random_uuid()::text, v_tenant, v_p.prod, v_bod, 'ENTREGA', -v_p.cant, v_stock, v_stock - v_p.cant, v_p.venta,
              'Entrega desde bodega', v_ev, v_p.det, pg_temp.utc(v_hora));
      UPDATE productos SET stock_actual = stock_actual - v_p.cant, stock_reservado = stock_reservado - v_p.cant, updated_at = now() WHERE id = v_p.prod;
      UPDATE detalles_venta SET cantidad_entregada = cantidad_entregada + v_p.cant WHERE id = v_p.det;
      UPDATE ventas SET reserva_pendiente = EXISTS (
        SELECT 1 FROM detalles_venta d WHERE d.venta_id = v_p.venta AND d.modo_entrega = 'BODEGA'
          AND d.cantidad - d.cantidad_entregada - d.cantidad_cancelada > 0)
      WHERE id = v_p.venta;
    END LOOP;
    DELETE FROM tmp_pend WHERE dia <= v_dia;

    -- 3.7.b Compras de reposición (lunes y jueves): una orden por proveedor con los productos bajo mínimo
    IF v_dow IN (1, 4) THEN
      FOR v_prov IN SELECT * FROM tmp_prov ORDER BY n LOOP
        DELETE FROM tmp_oc;
        INSERT INTO tmp_oc (prod, cant, costo)
        SELECT p.id,
               CASE WHEN p.es_decimal THEN ceil((p.minimo * 3 - (pd.stock_actual - pd.stock_reservado)) * 2) / 2
                    ELSE ceil(p.minimo * 3 - (pd.stock_actual - pd.stock_reservado)) END,
               p.costo
        FROM tmp_prod p JOIN productos pd ON pd.id = p.id
        WHERE p.prov = v_prov.n AND (pd.stock_actual - pd.stock_reservado) < p.minimo * 1.5;
        SELECT COUNT(*) INTO v_n FROM tmp_oc;
        CONTINUE WHEN v_n = 0;

        v_seq_oc := v_seq_oc + 1;
        v_orden := gen_random_uuid()::text;
        v_rec := gen_random_uuid()::text;
        v_fe := pg_temp.utc(v_dia::timestamp + TIME '08:10');
        v_fr := pg_temp.utc(v_dia::timestamp + TIME '09:30');
        v_factura := 'FAC-P' || v_prov.n || '-' || lpad(v_seq_oc::text, 4, '0');
        SELECT ROUND(SUM(cant * costo), 2) INTO v_sub FROM tmp_oc;
        v_isv := ROUND(v_sub * 0.15, 2);
        v_tot := v_sub + v_isv;
        v_contado := random() < 0.4;

        INSERT INTO ordenes_compra (id, tenant_id, codigo, proveedor_id, usuario_id, subtotal, isv, total, estado,
                                    fecha_emision, fecha_entrega, numero_factura, vencimiento, notas, created_at, updated_at)
        VALUES (v_orden, v_tenant, 'COMP-' || lpad(v_seq_oc::text, 4, '0'), v_prov.id, v_admin, v_sub, v_isv, v_tot, 'RECIBIDA',
                v_fe, v_fr, v_factura, (v_dia + 30)::timestamp, NULL, v_fe, v_fr);

        INSERT INTO detalles_orden_compra (id, orden_id, producto_id, cantidad, cantidad_recibida, precio_costo, subtotal)
        SELECT gen_random_uuid()::text, v_orden, prod, cant, cant, costo, ROUND(cant * costo, 2) FROM tmp_oc;

        INSERT INTO recepciones_compra (id, tenant_id, orden_id, solicitud_id, solicitud_hash, usuario_id, fecha)
        VALUES (v_rec, v_tenant, v_orden, gen_random_uuid()::text, md5(random()::text), v_bod, v_fr);

        FOR v_lc IN SELECT t.prod, t.cant, t.costo, pd.stock_actual AS antes FROM tmp_oc t JOIN productos pd ON pd.id = t.prod LOOP
          UPDATE productos SET stock_actual = stock_actual + v_lc.cant, precio_costo = v_lc.costo, costo_vigente = v_lc.costo,
                               ultima_compra_at = v_fr, version = version + 1, updated_at = now()
          WHERE id = v_lc.prod;
          INSERT INTO movimientos_inventario (id, tenant_id, producto_id, usuario_id, tipo, cantidad, anterior, nuevo, documento_id, motivo, created_at)
          VALUES (gen_random_uuid()::text, v_tenant, v_lc.prod, v_bod, 'COMPRA', v_lc.cant, v_lc.antes, v_lc.antes + v_lc.cant,
                  v_rec, 'Factura ' || v_factura, v_fr);
          INSERT INTO costos_compra (id, tenant_id, producto_id, proveedor_id, orden_id, recepcion_id, cantidad, costo, fecha)
          VALUES (gen_random_uuid()::text, v_tenant, v_lc.prod, v_prov.id, v_orden, v_rec, v_lc.cant, v_lc.costo, v_fr);
          INSERT INTO productos_proveedores (id, tenant_id, producto_id, proveedor_id, es_preferido, ultimo_costo, ultima_compra_at, creado_por, actualizado_por, updated_at)
          VALUES (gen_random_uuid()::text, v_tenant, v_lc.prod, v_prov.id, false, v_lc.costo, v_fr, v_admin, v_admin, now())
          ON CONFLICT (tenant_id, producto_id, proveedor_id) DO UPDATE SET
            ultimo_costo = EXCLUDED.ultimo_costo, ultima_compra_at = EXCLUDED.ultima_compra_at,
            actualizado_por = EXCLUDED.actualizado_por, updated_at = now();
        END LOOP;

        INSERT INTO cuentas_operativas (id, tenant_id, tipo, proveedor_id, documento_id, monto, saldo, vencimiento, usuario_id, created_at)
        VALUES (gen_random_uuid()::text, v_tenant, 'CXP', v_prov.id, v_orden, v_tot, v_tot, (v_dia + 30)::timestamp, v_admin, v_fe)
        RETURNING id INTO v_cuenta;

        IF v_contado THEN
          INSERT INTO pagos_cuenta (id, tenant_id, cuenta_id, solicitud_id, solicitud_hash, monto, metodo, usuario_id, caja_id, notas, referencia, created_at)
          VALUES (gen_random_uuid()::text, v_tenant, v_cuenta, gen_random_uuid()::text, md5(random()::text), v_tot, 'TRANSFERENCIA',
                  v_admin, NULL, 'Compra al contado', 'TRF-' || v_factura, v_fr);
          UPDATE cuentas_operativas SET saldo = 0 WHERE id = v_cuenta;
        END IF;
      END LOOP;
    END IF;

    -- 3.7.c Ventas del día, en orden de hora
    v_n := CASE v_dow WHEN 6 THEN 24 WHEN 5 THEN 20 WHEN 1 THEN 14 ELSE 16 END + floor(random() * 8)::int;

    FOR v_min IN SELECT m FROM (SELECT floor(random() * 570)::int AS m FROM generate_series(1, v_n)) s ORDER BY m LOOP
      v_hora := v_dia::timestamp + make_interval(mins => 480 + v_min);
      v_venta := gen_random_uuid()::text;
      IF random() < 0.55 THEN
        v_cajero := v_caj1; v_caja := v_cajc1;
      ELSE
        v_cajero := v_caj2; v_caja := v_cajc2;
      END IF;

      -- Líneas: productos distintos, elegidos con peso de rotación (muestreo ponderado)
      DELETE FROM tmp_lineas;
      v_nl := 1 + CASE WHEN random() < 0.45 THEN 0 WHEN random() < 0.65 THEN 1 WHEN random() < 0.85 THEN 2 ELSE 3 END;
      FOR v_p IN SELECT * FROM tmp_prod ORDER BY -ln(random()) / peso LIMIT v_nl LOOP
        SELECT stock_actual, stock_reservado, precio_venta, precio_costo INTO v_stock, v_res, v_precio, v_costo
        FROM productos WHERE id = v_p.id;
        v_q := CASE WHEN v_p.es_decimal THEN (floor(random() * 8) + 1) * 0.5 ELSE (floor(random() * 4) + 1)::numeric END;
        v_disp := v_stock - v_res;
        IF v_disp < v_q THEN
          v_q := CASE WHEN v_p.es_decimal THEN floor(v_disp * 2) / 2 ELSE floor(v_disp) END;
        END IF;
        CONTINUE WHEN v_q <= 0;
        v_modo := CASE WHEN random() < 0.25 THEN 'BODEGA' ELSE 'MOSTRADOR' END;
        INSERT INTO tmp_lineas (det, prod, cant, precio, costo, modo, stock_antes, subtotal)
        VALUES (gen_random_uuid()::text, v_p.id, v_q, v_precio, v_costo, v_modo, v_stock, ROUND(v_precio * v_q, 2));
      END LOOP;

      SELECT COUNT(*), COALESCE(SUM(subtotal), 0) INTO v_n, v_sub FROM tmp_lineas;
      CONTINUE WHEN v_n = 0;
      v_isv := ROUND(v_sub * 0.15, 2);
      v_tot := v_sub + v_isv;

      -- Cliente: 12% crédito, 30% mostrador con nombre, resto sin cliente
      v_cli_id := NULL; v_cli_nombre := NULL; v_cli_credito := false; v_cli_plazo := NULL; v_cli_limite := NULL;
      v_r := random();
      IF v_r < 0.12 THEN
        SELECT id, nombre, credito, plazo, limite INTO v_cli_id, v_cli_nombre, v_cli_credito, v_cli_plazo, v_cli_limite
        FROM tmp_cli WHERE credito ORDER BY random() LIMIT 1;
      ELSIF v_r < 0.42 THEN
        SELECT id, nombre, credito, plazo, limite INTO v_cli_id, v_cli_nombre, v_cli_credito, v_cli_plazo, v_cli_limite
        FROM tmp_cli WHERE NOT credito ORDER BY random() LIMIT 1;
      END IF;

      v_cli_saldo := NULL;
      IF v_cli_id IS NOT NULL THEN
        SELECT saldo_pendiente INTO v_cli_saldo FROM clientes WHERE id = v_cli_id;
      END IF;
      v_credito := v_cli_id IS NOT NULL AND COALESCE(v_cli_credito, false) AND random() < 0.7
                   AND (v_cli_limite IS NULL OR v_cli_saldo + v_tot <= v_cli_limite);

      IF v_credito THEN
        v_metodo := 'CREDITO'; v_tipo := 'CREDITO';
      ELSE
        v_r := random();
        v_metodo := CASE WHEN v_r < 0.6 THEN 'EFECTIVO' WHEN v_r < 0.85 THEN 'TARJETA' ELSE 'TRANSFERENCIA' END;
        v_tipo := 'CONTADO';
      END IF;

      UPDATE secuencias_tenant SET ultimo_numero = ultimo_numero + 1
      WHERE tenant_id = v_tenant AND tipo = 'VENTA' RETURNING ultimo_numero INTO v_num;

      INSERT INTO ventas (id, tenant_id, numero_venta, cliente_id, usuario_id, subtotal, isv, descuento, total, metodo_pago, tipo_pago,
                          saldo_credito, caja_id, cliente_nombre, estado, reserva_pendiente, origen, created_at)
      VALUES (v_venta, v_tenant, v_num, v_cli_id, v_cajero, v_sub, v_isv, 0, v_tot, v_metodo::"MetodoPago", v_tipo::"TipoPago",
              CASE WHEN v_credito THEN v_tot END, v_caja, v_cli_nombre, 'COMPLETADA',
              EXISTS (SELECT 1 FROM tmp_lineas WHERE modo = 'BODEGA'), 'ONLINE', pg_temp.utc(v_hora));

      INSERT INTO detalles_venta (id, venta_id, producto_id, cantidad, precio_unitario, subtotal, costo_unitario, sin_inventario,
                                  tenant_id, modo_entrega, cantidad_entregada)
      SELECT det, v_venta, prod, cant, precio, subtotal, costo, false, v_tenant, modo,
             CASE WHEN modo = 'MOSTRADOR' THEN cant ELSE 0 END
      FROM tmp_lineas;

      -- Cobro: evento COBRO con todas las líneas, como registrarEventosCobro
      SELECT string_agg(format('{"cantidadCentesimas":%s,"detalleVentaId":"%s"}', round(cant * 100)::int, det), ','
                        ORDER BY det COLLATE "C")
        INTO v_lineas FROM tmp_lineas;
      v_ev := gen_random_uuid()::text;
      INSERT INTO entregas_eventos (id, tenant_id, solicitud_id, huella, tipo, venta_id, usuario_id, receptor_nombre, motivo, origen, created_at)
      VALUES (v_ev, v_tenant, gen_random_uuid()::text, pg_temp.huella_evento('COBRO', v_venta, v_cajero, v_lineas, NULL),
              'COBRO', v_venta, v_cajero, NULL, NULL, 'ONLINE', pg_temp.utc(v_hora));
      INSERT INTO entregas_eventos_lineas (tenant_id, evento_id, detalle_venta_id, cantidad)
      SELECT v_tenant, v_ev, det, cant FROM tmp_lineas;

      -- Entrega inmediata (MOSTRADOR): evento ENTREGA y movimiento por línea
      IF EXISTS (SELECT 1 FROM tmp_lineas WHERE modo = 'MOSTRADOR') THEN
        SELECT string_agg(format('{"cantidadCentesimas":%s,"detalleVentaId":"%s"}', round(cant * 100)::int, det), ','
                          ORDER BY det COLLATE "C")
          INTO v_lineas FROM tmp_lineas WHERE modo = 'MOSTRADOR';
        v_ev := gen_random_uuid()::text;
        INSERT INTO entregas_eventos (id, tenant_id, solicitud_id, huella, tipo, venta_id, usuario_id, receptor_nombre, motivo, origen, created_at)
        VALUES (v_ev, v_tenant, gen_random_uuid()::text, pg_temp.huella_evento('ENTREGA', v_venta, v_cajero, v_lineas, NULL),
                'ENTREGA', v_venta, v_cajero, NULL, NULL, 'ONLINE', pg_temp.utc(v_hora));
        INSERT INTO entregas_eventos_lineas (tenant_id, evento_id, detalle_venta_id, cantidad)
        SELECT v_tenant, v_ev, det, cant FROM tmp_lineas WHERE modo = 'MOSTRADOR';
        INSERT INTO movimientos_inventario (id, tenant_id, producto_id, usuario_id, tipo, cantidad, anterior, nuevo, documento_id, motivo, evento_id, detalle_venta_id, created_at)
        SELECT gen_random_uuid()::text, v_tenant, prod, v_cajero, 'ENTREGA', -cant, stock_antes, stock_antes - cant, v_venta,
               'Entrega en el cobro', v_ev, det, pg_temp.utc(v_hora)
        FROM tmp_lineas WHERE modo = 'MOSTRADOR';
        UPDATE productos p SET stock_actual = p.stock_actual - t.cant, updated_at = now()
        FROM tmp_lineas t WHERE t.modo = 'MOSTRADOR' AND p.id = t.prod;
      END IF;

      -- Reserva (BODEGA): la existencia queda reservada hasta la entrega posterior
      UPDATE productos p SET stock_reservado = p.stock_reservado + t.cant, updated_at = now()
      FROM tmp_lineas t WHERE t.modo = 'BODEGA' AND p.id = t.prod;
      INSERT INTO tmp_pend (det, venta, prod, cant, dia, cajero)
      SELECT det, v_venta, prod, cant, v_dia + 1 + (random() < 0.4)::int, v_cajero FROM tmp_lineas WHERE modo = 'BODEGA';

      -- Autorización bancaria para tarjeta o transferencia
      IF v_metodo = 'TARJETA' THEN
        INSERT INTO aprobaciones_bancarias (id, tenant_id, metodo, terminal, referencia, monto, origen, origen_id, usuario_id, created_at)
        VALUES (gen_random_uuid()::text, v_tenant, 'TARJETA', CASE WHEN v_cajero = v_caj1 THEN 'POS-01' ELSE 'POS-02' END,
                'AUT-' || lpad(v_num::text, 6, '0'), v_tot, 'VENTA', v_venta, v_cajero, pg_temp.utc(v_hora));
      ELSIF v_metodo = 'TRANSFERENCIA' THEN
        INSERT INTO aprobaciones_bancarias (id, tenant_id, metodo, terminal, referencia, monto, origen, origen_id, usuario_id, created_at)
        VALUES (gen_random_uuid()::text, v_tenant, 'TRANSFERENCIA', '', 'TRF-' || lpad(v_num::text, 6, '0'), v_tot, 'VENTA', v_venta, v_cajero, pg_temp.utc(v_hora));
      END IF;

      -- Crédito: cuenta por cobrar y saldo del cliente
      IF v_credito THEN
        UPDATE clientes SET saldo_pendiente = saldo_pendiente + v_tot, updated_at = now() WHERE id = v_cli_id;
        INSERT INTO cuentas_operativas (id, tenant_id, tipo, cliente_id, documento_id, monto, saldo, vencimiento, usuario_id, created_at)
        VALUES (gen_random_uuid()::text, v_tenant, 'CXC', v_cli_id, v_venta, v_tot, v_tot, (v_dia + v_cli_plazo)::timestamp, v_cajero, pg_temp.utc(v_hora));
      END IF;

      -- Movimiento de caja de la venta (el crédito se registra con método CREDITO, como en la aplicación)
      INSERT INTO movimientos_caja (id, caja_id, tipo, monto, metodo, usuario_id, concepto, referencia, created_at)
      VALUES (gen_random_uuid()::text, v_caja, 'VENTA_POS', v_tot, v_metodo, v_cajero, 'Venta ' || v_num, v_venta, pg_temp.utc(v_hora));
    END LOOP;

    -- 3.7.d Abonos de clientes con crédito (en caja del cajero 1, 16:30)
    FOR v_cc IN
      SELECT co.id, co.saldo, co.documento_id, co.cliente_id FROM cuentas_operativas co
      WHERE co.tenant_id = v_tenant AND co.tipo = 'CXC' AND co.saldo > 0
        AND co.created_at < pg_temp.utc(v_dia::timestamp + TIME '16:00') AND random() < 0.3
    LOOP
      v_monto := LEAST(v_cc.saldo, ROUND(v_cc.saldo * (0.3 + random() * 0.7)::numeric, 2));
      CONTINUE WHEN v_monto <= 0;
      v_hora := v_dia::timestamp + TIME '16:30';
      v_pago := gen_random_uuid()::text;
      INSERT INTO pagos_cuenta (id, tenant_id, cuenta_id, solicitud_id, solicitud_hash, monto, metodo, usuario_id, caja_id, notas, referencia, created_at)
      VALUES (v_pago, v_tenant, v_cc.id, gen_random_uuid()::text, md5(random()::text), v_monto, 'EFECTIVO', v_caj1, v_cajc1,
              'Abono de cliente', NULL, pg_temp.utc(v_hora));
      UPDATE cuentas_operativas SET saldo = saldo - v_monto WHERE id = v_cc.id;
      UPDATE clientes SET saldo_pendiente = saldo_pendiente - v_monto, updated_at = now() WHERE id = v_cc.cliente_id;
      UPDATE ventas SET saldo_credito = GREATEST(COALESCE(saldo_credito, total) - v_monto, 0) WHERE id = v_cc.documento_id;
      INSERT INTO movimientos_caja (id, caja_id, tipo, monto, metodo, usuario_id, concepto, referencia, created_at)
      VALUES (gen_random_uuid()::text, v_cajc1, 'ABONO_CXC', v_monto, 'EFECTIVO', v_caj1, 'Abono de cliente', v_pago, pg_temp.utc(v_hora));
    END LOOP;

    -- 3.7.e Egreso de efectivo de vez en cuando (15:00), sin dejar la caja en negativo
    IF random() < 0.35 THEN
      v_monto := ROUND((100 + random() * 400)::numeric, 0);
      SELECT c.monto_apertura + COALESCE((SELECT SUM(m.monto) FROM movimientos_caja m WHERE m.caja_id = c.id AND m.metodo = 'EFECTIVO'), 0)
        INTO v_esp FROM cajas c WHERE c.id = v_cajc1;
      IF v_monto <= v_esp THEN
        v_conc := (ARRAY['Compra de utiles de limpieza', 'Pago de mensajeria', 'Combustible de reparto', 'Refrigerio del personal'])[1 + floor(random() * 4)::int];
        INSERT INTO movimientos_caja (id, caja_id, tipo, monto, metodo, usuario_id, concepto, referencia, created_at)
        VALUES (gen_random_uuid()::text, v_cajc1, 'EGRESO_MANUAL', -v_monto, 'EFECTIVO', v_caj1, v_conc, NULL,
                pg_temp.utc(v_dia::timestamp + TIME '15:00'));
      END IF;
    END IF;

    -- 3.7.f Cierre de caja (18:00). Una diferencia de -25 con explicación, el 22-sep en la caja 2.
    FOR v_c IN SELECT * FROM (VALUES (v_cajc1, v_caj1, 1), (v_cajc2, v_caj2, 2)) AS t(caja, usr, k) LOOP
      SELECT c.monto_apertura + COALESCE((SELECT SUM(m.monto) FROM movimientos_caja m WHERE m.caja_id = c.id AND m.metodo = 'EFECTIVO'), 0)
        INTO v_esp FROM cajas c WHERE c.id = v_c.caja;
      v_dif := CASE WHEN v_dia = DATE '2026-09-22' AND v_c.k = 2 THEN -25 ELSE 0 END;
      UPDATE cajas SET monto_esperado = v_esp, monto_cierre_fisico = v_esp + v_dif, diferencia = v_dif, estado = 'CERRADA',
                       fecha_cierre = pg_temp.utc(v_dia::timestamp + TIME '18:00'),
                       notas = CASE WHEN v_dif <> 0 THEN 'Faltante de vuelto en efectivo; se explico al administrador' END
      WHERE id = v_c.caja;
    END LOOP;

    -- 3.7.g Pago parcial o total de cuentas por pagar el 1 de octubre (transferencia)
    IF v_dia = DATE '2026-10-01' THEN
      FOR v_cx IN SELECT id, saldo FROM cuentas_operativas WHERE tenant_id = v_tenant AND tipo = 'CXP' AND saldo > 0 AND random() < 0.5 LOOP
        v_monto := CASE WHEN random() < 0.5 THEN v_cx.saldo ELSE ROUND(v_cx.saldo / 2, 2) END;
        CONTINUE WHEN v_monto <= 0;
        INSERT INTO pagos_cuenta (id, tenant_id, cuenta_id, solicitud_id, solicitud_hash, monto, metodo, usuario_id, caja_id, notas, referencia, created_at)
        VALUES (gen_random_uuid()::text, v_tenant, v_cx.id, gen_random_uuid()::text, md5(random()::text), v_monto, 'TRANSFERENCIA',
                v_admin, NULL, 'Pago a proveedor', 'TRF-' || upper(left(v_cx.id, 8)), pg_temp.utc(v_dia::timestamp + TIME '11:00'));
        UPDATE cuentas_operativas SET saldo = saldo - v_monto WHERE id = v_cx.id;
      END LOOP;
    END IF;
  END LOOP;

  -- 4. Cotizaciones: 12 repartidas en el mes (algunas vencidas)
  CREATE TEMP TABLE tmp_cot (prod text, codigo text, nombre text, unidad text, cant numeric, precio numeric, subtotal numeric) ON COMMIT DROP;
  FOR v_i IN 1..12 LOOP
    v_dia := c_inicio + (v_i * 2);
    DELETE FROM tmp_cot;
    INSERT INTO tmp_cot (prod, codigo, nombre, unidad, cant, precio, subtotal)
    SELECT p.id, p.codigo, p.nombre, p.unidad,
           CASE WHEN p.es_decimal THEN (floor(random() * 6) + 1) * 0.5 ELSE (floor(random() * 5) + 1)::numeric END,
           p.precio, 0
    FROM (SELECT * FROM tmp_prod ORDER BY -ln(random()) / peso LIMIT 2 + (v_i % 2)) p;
    UPDATE tmp_cot SET subtotal = ROUND(cant * precio, 2);
    SELECT ROUND(SUM(subtotal), 2) INTO v_sub FROM tmp_cot;
    v_isv := ROUND(v_sub * 0.15, 2);
    v_tot := v_sub + v_isv;

    UPDATE secuencias_tenant SET ultimo_numero = ultimo_numero + 1
    WHERE tenant_id = v_tenant AND tipo = 'COTIZACION' RETURNING ultimo_numero INTO v_num;

    v_cli_id := NULL; v_cli_nombre := NULL;
    SELECT id, nombre INTO v_cli_id, v_cli_nombre FROM tmp_cli WHERE n = 1 + (v_i % 18) AND random() < 0.6;
    v_usr := CASE WHEN v_i % 2 = 0 THEN v_ven ELSE v_admin END;
    v_estado := CASE WHEN v_dia + 15 < c_fin THEN 'VENCIDA' WHEN v_i % 3 = 0 THEN 'APROBADA'
                     WHEN v_i % 4 = 0 THEN 'RECHAZADA' ELSE 'ENVIADA' END;
    v_cot := gen_random_uuid()::text;

    INSERT INTO cotizaciones (id, tenant_id, numero_cotizacion, cliente_id, cliente_nombre, usuario_id, subtotal, porcentaje_isv,
                              isv, descuento, descuento_general, tipo_descuento_general, total, estado, fecha_validez, dias_validez,
                              condiciones_pago, notas, created_at, updated_at)
    VALUES (v_cot, v_tenant, v_num, v_cli_id, COALESCE(v_cli_nombre, 'Cliente de mostrador'), v_usr, v_sub, 15, v_isv, 0, 0,
            'MONTO', v_tot, v_estado::"EstadoCotizacion", v_dia + 15, 15, 'CONTADO', NULL,
            pg_temp.utc(v_dia::timestamp + TIME '10:00'), now());

    INSERT INTO detalles_cotizacion (id, cotizacion_id, producto_id, codigo_producto, descripcion_producto, unidad_medida, usa_medida,
                                     cantidad, precio_lista, precio_unitario, descuento, tipo_descuento, exento, subtotal, isv, total_linea)
    SELECT gen_random_uuid()::text, v_cot, prod, codigo, nombre, unidad, false, cant, precio, precio, 0, 'MONTO', false,
           subtotal, ROUND(subtotal * 0.15, 2), subtotal + ROUND(subtotal * 0.15, 2)
    FROM tmp_cot;
  END LOOP;

  -- 5. Resumen de la carga
  RAISE NOTICE 'Empresa demo creada: %', v_tenant;
  RAISE NOTICE 'Ventas: %, líneas: %', (SELECT COUNT(*) FROM ventas WHERE tenant_id = v_tenant),
                                        (SELECT COUNT(*) FROM detalles_venta WHERE tenant_id = v_tenant);
  RAISE NOTICE 'Compras recibidas: %, cuentas por pagar: %', (SELECT COUNT(*) FROM ordenes_compra WHERE tenant_id = v_tenant),
                                                              (SELECT COUNT(*) FROM cuentas_operativas WHERE tenant_id = v_tenant AND tipo = 'CXP');
  RAISE NOTICE 'Cuentas por cobrar: %, cajas cerradas: %', (SELECT COUNT(*) FROM cuentas_operativas WHERE tenant_id = v_tenant AND tipo = 'CXC'),
                                                              (SELECT COUNT(*) FROM cajas WHERE tenant_id = v_tenant AND estado = 'CERRADA');
END
$carga$;

DROP FUNCTION pg_temp.huella_evento(text, text, text, text, text);
DROP FUNCTION pg_temp.utc(timestamp);

COMMIT;
