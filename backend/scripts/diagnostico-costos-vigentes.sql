-- KARDEX · Diagnóstico de costos históricos (solo lectura, no corrige datos).
-- Uso recomendado (copia restaurada o réplica de lectura, nunca escritura directa):
--   psql "$URL_LECTURA" -v ON_ERROR_STOP=1 -c "SET default_transaction_read_only = on" -f scripts/diagnostico-costos-vigentes.sql
--
-- Lista productos donde precio_costo (costo comercial) y costo_vigente difieren, y muestra la última compra registrada.
-- Clasificación:
--   SIN_COSTO_VIGENTE                          costo_vigente nulo (dato heredado sin recepción)
--   SIN_COMPRA_REGISTRADA                      no hay costo en costos_compra
--   COSTO_VIGENTE_COINCIDE_CON_ULTIMA_COMPRA   costo_vigente = costo de la última recepción
--   COSTO_VIGENTE_DIFERENTE_DE_ULTIMA_COMPRA   costo_vigente distinto de la última recepción (revisar)

SELECT
  p.tenant_id,
  p.id AS producto_id,
  p.codigo,
  p.nombre,
  p.precio_costo,
  p.costo_vigente,
  CASE
    WHEN p.costo_vigente IS NULL THEN 'SIN_COSTO_VIGENTE'
    WHEN ult.costo IS NULL THEN 'SIN_COMPRA_REGISTRADA'
    WHEN ult.costo = p.costo_vigente THEN 'COSTO_VIGENTE_COINCIDE_CON_ULTIMA_COMPRA'
    ELSE 'COSTO_VIGENTE_DIFERENTE_DE_ULTIMA_COMPRA'
  END AS diagnostico,
  ult.orden_id AS ultima_orden_id,
  ult.numero_factura AS ultima_factura,
  ult.proveedor_id AS ultimo_proveedor_id,
  ult.costo AS costo_ultima_compra,
  ult.fecha AS fecha_ultima_compra
FROM productos p
LEFT JOIN LATERAL (
  SELECT c.orden_id, o.numero_factura, c.proveedor_id, c.costo, c.fecha
  FROM costos_compra c
  JOIN ordenes_compra o ON o.id = c.orden_id
  WHERE c.producto_id = p.id
  ORDER BY c.fecha DESC
  LIMIT 1
) ult ON true
WHERE p.precio_costo IS DISTINCT FROM p.costo_vigente
ORDER BY p.tenant_id, p.codigo;
