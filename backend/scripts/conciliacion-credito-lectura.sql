-- Conciliación histórica del crédito de clientes (SOLO LECTURA).
-- Uso: reemplazar $1 por el tenant_id a revisar y ejecutar cada consulta dentro de una transacción
-- READ ONLY. No contiene INSERT, UPDATE, DELETE ni DDL. Ninguna consulta corrige datos.
-- Cada consulta devuelve SOLO filas anómalas; cero filas significa que no hay hallazgo.
-- Antes de cualquier corrección, revisar cada hallazgo con su venta, su cliente y su cierre de caja.

-- @consulta cxc_sin_cliente
-- Anomalía: cuenta por cobrar sin cliente, imposible para una venta a crédito válida.
SELECT c.id, c.documento_id, c.monto, c.saldo
FROM cuentas_operativas c
WHERE c.tenant_id = $1 AND c.tipo = 'CXC' AND c.cliente_id IS NULL;

-- @consulta saldo_cliente_no_concilia
-- Anomalía: clientes.saldo_pendiente distinto de la suma de sus CxC abiertas.
-- Causa conocida (antes de la corrección de conversión a crédito y del bloqueo del abono heredado): saldo no actualizado.
SELECT cl.id, cl.saldo_pendiente, COALESCE(SUM(c.saldo), 0) AS suma_cxc
FROM clientes cl
LEFT JOIN cuentas_operativas c ON c.cliente_id = cl.id AND c.tipo = 'CXC'
WHERE cl.tenant_id = $1
GROUP BY cl.id, cl.saldo_pendiente
HAVING cl.saldo_pendiente <> COALESCE(SUM(c.saldo), 0);

-- @consulta venta_credito_sin_cxc
-- Anomalía: venta a crédito sin cuenta por cobrar del mismo tenant.
SELECT v.id, v.total
FROM ventas v
WHERE v.tenant_id = $1 AND v.tipo_pago = 'CREDITO'
  AND NOT EXISTS (SELECT 1 FROM cuentas_operativas c WHERE c.documento_id = v.id AND c.tipo = 'CXC' AND c.tenant_id = $1);

-- @consulta venta_metodo_credito_tipo_contado
-- Anomalía: venta registrada con método CREDITO pero tipo CONTADO (firma de las conversiones de cotización anteriores a la corrección).
SELECT v.id, v.metodo_pago, v.tipo_pago, v.saldo_credito, v.total
FROM ventas v
WHERE v.tenant_id = $1 AND v.metodo_pago = 'CREDITO' AND v.tipo_pago = 'CONTADO';

-- @consulta saldo_credito_venta_no_concilia
-- Anomalía: ventas.saldo_credito distinto del saldo de su CxC.
SELECT v.id, v.saldo_credito, c.saldo
FROM ventas v
JOIN cuentas_operativas c ON c.documento_id = v.id AND c.tipo = 'CXC' AND c.tenant_id = v.tenant_id
WHERE v.tenant_id = $1 AND v.tipo_pago = 'CREDITO' AND COALESCE(v.saldo_credito, 0) <> c.saldo;

-- @consulta cxc_no_concilia_con_pagos_y_devoluciones
-- Anomalía: saldo de CxC distinto de monto − pagos aplicados − crédito cancelado por devoluciones.
SELECT c.id, c.monto, c.saldo,
       COALESCE((SELECT SUM(p.monto) FROM pagos_cuenta p WHERE p.cuenta_id = c.id), 0) AS pagado,
       COALESCE((SELECT SUM(d.credito_cancelado) FROM devoluciones d WHERE d.venta_id = c.documento_id AND d.tenant_id = c.tenant_id), 0) AS credito_cancelado
FROM cuentas_operativas c
WHERE c.tenant_id = $1 AND c.tipo = 'CXC'
  AND c.saldo <> c.monto
      - COALESCE((SELECT SUM(p.monto) FROM pagos_cuenta p WHERE p.cuenta_id = c.id), 0)
      - COALESCE((SELECT SUM(d.credito_cancelado) FROM devoluciones d WHERE d.venta_id = c.documento_id AND d.tenant_id = c.tenant_id), 0);

-- @consulta reembolso_sin_movimiento_de_caja
-- Anomalía: devolución con reembolso mayor que cero sin movimiento de caja por ese importe y referencia.
SELECT d.id, d.venta_id, d.reembolso, d.metodo, d.caja_id
FROM devoluciones d
WHERE d.tenant_id = $1 AND d.reembolso > 0
  AND NOT EXISTS (
    SELECT 1 FROM movimientos_caja m
    WHERE m.referencia = d.id AND m.monto = -d.reembolso AND m.caja_id = d.caja_id
  );

-- @consulta abono_cliente_heredado
-- Informativo: abonos de la ruta heredada (abonos_cliente). No tienen pago en pagos_cuenta ni movimiento de caja.
-- Cada fila debe revisarse antes de conciliar: su importe ya redujo CxC y saldo del cliente en su momento.
SELECT a.id, a.cliente_id, a.venta_id, a.monto, a.created_at
FROM abonos_cliente a
WHERE a.tenant_id = $1;
