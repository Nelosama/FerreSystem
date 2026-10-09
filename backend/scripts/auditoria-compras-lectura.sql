-- Auditoría histórica del ciclo de compras (SOLO LECTURA).
-- Uso: reemplazar $1 por el tenant_id a auditar y ejecutar cada consulta dentro de una transacción
-- READ ONLY. No contiene INSERT, UPDATE, DELETE, ni DDL. Ninguna consulta corrige datos: los
-- hallazgos se concilian con la propuesta de docs/CONTEXTO_MAESTRO.md (sección de auditoría de compras).
-- Cada consulta devuelve SOLO filas anómalas; cero filas significa que no hay hallazgo.

-- @consulta factura_duplicada_ordenes
-- Anomalía: dos órdenes del mismo proveedor con la misma factura ignorando espacios y mayúsculas.
SELECT o.proveedor_id, UPPER(TRIM(o.numero_factura)) AS factura, COUNT(*)::int AS ordenes, ARRAY_AGG(o.id ORDER BY o.created_at) AS ids
FROM ordenes_compra o
WHERE o.tenant_id = $1 AND o.numero_factura IS NOT NULL
GROUP BY o.proveedor_id, UPPER(TRIM(o.numero_factura))
HAVING COUNT(*) > 1;

-- @consulta factura_duplicada_legacy
-- Anomalía: duplicado en el módulo /compras retirado (compras_proveedor), misma regla de normalización.
SELECT cp.proveedor_id, UPPER(TRIM(cp.numero_factura)) AS factura, COUNT(*)::int AS compras, ARRAY_AGG(cp.id ORDER BY cp.created_at) AS ids
FROM compras_proveedor cp
WHERE cp.tenant_id = $1 AND cp.numero_factura IS NOT NULL
GROUP BY cp.proveedor_id, UPPER(TRIM(cp.numero_factura))
HAVING COUNT(*) > 1;

-- @consulta orden_recibida_con_lineas_pendientes
-- Anomalía: estado RECIBIDA pero alguna línea tiene cantidad_recibida menor que cantidad.
SELECT o.id, o.estado, COUNT(d.id)::int AS lineas_pendientes
FROM ordenes_compra o
JOIN detalles_orden_compra d ON d.orden_id = o.id
WHERE o.tenant_id = $1 AND o.estado = 'RECIBIDA' AND d.cantidad_recibida < d.cantidad
GROUP BY o.id, o.estado;

-- @consulta recepcion_no_coincide_con_costos
-- Anomalía: cantidad recibida de una línea distinta de la suma de costos_compra del mismo producto y orden.
SELECT d.id AS detalle_id, d.orden_id, d.producto_id, d.cantidad_recibida,
       COALESCE((SELECT SUM(cc.cantidad) FROM costos_compra cc WHERE cc.orden_id = d.orden_id AND cc.producto_id = d.producto_id), 0) AS cantidad_en_costos
FROM detalles_orden_compra d
JOIN ordenes_compra o ON o.id = d.orden_id
WHERE o.tenant_id = $1
  AND d.cantidad_recibida <> COALESCE((SELECT SUM(cc.cantidad) FROM costos_compra cc WHERE cc.orden_id = d.orden_id AND cc.producto_id = d.producto_id), 0);

-- @consulta cuenta_saldo_no_concilia
-- Anomalía: saldo distinto de monto − pagos registrados, o saldo negativo.
SELECT c.id, c.tipo, c.monto, c.saldo, COALESCE(SUM(p.monto), 0) AS pagado
FROM cuentas_operativas c
LEFT JOIN pagos_cuenta p ON p.cuenta_id = c.id
WHERE c.tenant_id = $1 AND c.tipo = 'CXP'
GROUP BY c.id, c.tipo, c.monto, c.saldo
HAVING c.saldo <> c.monto - COALESCE(SUM(p.monto), 0) OR c.saldo < 0;

-- @consulta cxp_monto_distinto_de_orden
-- Anomalía: la cuenta por pagar no tiene el mismo monto que el total de la orden que la origina.
SELECT c.id AS cuenta_id, o.id AS orden_id, c.monto AS monto_cuenta, o.total AS total_orden
FROM cuentas_operativas c
JOIN ordenes_compra o ON o.id = c.documento_id AND o.tenant_id = c.tenant_id
WHERE c.tenant_id = $1 AND c.tipo = 'CXP' AND c.monto <> o.total;

-- @consulta cxp_sin_orden_de_origen
-- Anomalía: cuenta por pagar cuyo documento no existe como orden de compra del mismo tenant.
SELECT c.id, c.documento_id
FROM cuentas_operativas c
WHERE c.tenant_id = $1 AND c.tipo = 'CXP'
  AND NOT EXISTS (SELECT 1 FROM ordenes_compra o WHERE o.id = c.documento_id AND o.tenant_id = c.tenant_id);

-- @consulta pago_cxp_con_caja
-- Anomalía: pago a proveedor vinculado a una caja POS (regla: las CxP no afectan la caja).
SELECT p.id, p.cuenta_id, p.metodo, p.monto, p.caja_id
FROM pagos_cuenta p
JOIN cuentas_operativas c ON c.id = p.cuenta_id
WHERE p.tenant_id = $1 AND c.tipo = 'CXP' AND p.caja_id IS NOT NULL;

-- @consulta movimiento_caja_con_concepto_cxp
-- Anomalía heurística: movimientos de caja cuyo concepto menciona CXP (el esquema no tipifica el concepto).
SELECT m.id, m.caja_id, m.monto, m.metodo, m.concepto
FROM movimientos_caja m
JOIN cajas cj ON cj.id = m.caja_id
WHERE cj.tenant_id = $1 AND m.concepto ILIKE '%CXP%';

-- @consulta pagos_legacy_superan_compra
-- Anomalía: pagos del módulo retirado (pagos_proveedor) que superan el monto de la compra.
SELECT cp.id, cp.monto AS monto_compra, SUM(pp.monto) AS pagado
FROM compras_proveedor cp
JOIN pagos_proveedor pp ON pp.compra_id = cp.id
WHERE cp.tenant_id = $1
GROUP BY cp.id, cp.monto
HAVING SUM(pp.monto) > cp.monto;

-- @consulta inventario_legacy_informativo
-- Inventario informativo (no es anomalía por sí misma): filas del módulo retirado que siguen en la base.
SELECT 'compras_proveedor' AS tabla, COUNT(*)::int AS filas FROM compras_proveedor WHERE tenant_id = $1
UNION ALL
SELECT 'pagos_proveedor', COUNT(*)::int FROM pagos_proveedor pp JOIN compras_proveedor cp ON cp.id = pp.compra_id WHERE cp.tenant_id = $1;
