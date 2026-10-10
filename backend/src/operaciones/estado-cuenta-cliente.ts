import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { query, type Tx } from './ledger';
import { ZONA_HORARIA_NEGOCIO } from '../common/zona-horaria';

// Estado de cuenta de un cliente (solo lectura, solo ADMIN): cuentas por cobrar con sus abonos y la
// conciliación contra el saldo que el cliente muestra. Fuente de verdad: cuentas_operativas (ver crédito).
export async function estadoCuentaCliente(prisma: PrismaService, tenantId: string, clienteId: string, verLimite = true) {
  return prisma.$transaction(async tx => {
    const db = tx as unknown as Tx;
    const [cliente] = await query(db,
      'SELECT id, codigo, numero_cliente, nombre, credito_habilitado, limite_credito, saldo_pendiente FROM clientes WHERE id=$1 AND tenant_id=$2',
      clienteId, tenantId);
    if (!cliente) throw new NotFoundException('Cliente no encontrado');
    const cuentas = await query(db,
      `SELECT c.id, c.documento_id, v.numero_venta, c.monto, c.saldo, c.vencimiento, c.created_at,
              (c.saldo > 0 AND c.vencimiento::date < (NOW() AT TIME ZONE $3)::date) AS vencida
         FROM cuentas_operativas c LEFT JOIN ventas v ON v.id = c.documento_id AND v.tenant_id = c.tenant_id
        WHERE c.tenant_id=$1 AND c.cliente_id=$2 AND c.tipo='CXC'
        ORDER BY c.created_at DESC`,
      tenantId, clienteId, ZONA_HORARIA_NEGOCIO);
    const abonos = await query(db,
      `SELECT p.id, p.cuenta_id, p.monto, p.metodo, p.created_at, p.notas, u.nombre AS usuario_nombre, ap.referencia, ap.terminal
         FROM pagos_cuenta p
         LEFT JOIN usuarios u ON u.id=p.usuario_id AND u.tenant_id=p.tenant_id
         LEFT JOIN aprobaciones_bancarias ap ON ap.tenant_id=p.tenant_id AND ap.origen='ABONO' AND ap.origen_id=p.id
        WHERE p.tenant_id=$1 AND p.cuenta_id IN (SELECT id FROM cuentas_operativas WHERE tenant_id=$1 AND cliente_id=$2 AND tipo='CXC')
        ORDER BY p.created_at DESC`,
      tenantId, clienteId);
    const saldoCuentas = cuentas.reduce((suma, c) => suma + Number(c.saldo), 0);
    // Movimientos en orden cronológico: cada factura es un cargo; cada abono reduce el saldo acumulado.
    // El último saldo acumulado es el saldo abierto de las cuentas (ver conciliado).
    const eventos = [
      ...cuentas.map(c => ({ fecha: new Date(c.created_at), tipo: 'CARGO' as const, documento: c.documento_id, numeroDocumento: c.numero_venta === null ? c.documento_id : String(c.numero_venta), monto: Number(c.monto), usuario: null, referencia: null, metodo: null, cuentaId: c.id })),
      ...abonos.map(a => ({ fecha: new Date(a.created_at), tipo: 'ABONO' as const, documento: null, numeroDocumento: null, monto: -Number(a.monto), usuario: a.usuario_nombre ?? null, referencia: a.referencia ?? null, metodo: a.metodo, cuentaId: a.cuenta_id })),
    ].sort((x, y) => x.fecha.getTime() - y.fecha.getTime() || (x.tipo === 'CARGO' ? -1 : 1));
    let acumulado = 0;
    const movimientos = eventos.map(e => {
      acumulado = Math.round((acumulado + e.monto) * 100) / 100;
      return { fecha: e.fecha, tipo: e.tipo, documento: e.numeroDocumento, metodo: e.metodo, monto: e.monto, usuario: e.usuario, referencia: e.referencia, saldoAcumulado: acumulado, cuentaId: e.cuentaId };
    });
    const saldoCliente = Number(cliente.saldo_pendiente);
    return {
      cliente: {
        id: cliente.id, codigo: cliente.codigo, numeroCliente: cliente.numero_cliente, nombre: cliente.nombre,
        creditoHabilitado: cliente.credito_habilitado,
        // El límite es dato administrativo: el cajero consulta saldos y facturas, no el límite.
        limiteCredito: verLimite && cliente.limite_credito !== null ? Number(cliente.limite_credito) : null,
        saldoPendiente: saldoCliente,
      },
      saldoCuentas: Math.round(saldoCuentas * 100) / 100,
      movimientos,
      // Si no concilia, el saldo mostrado al cliente no coincide con sus cuentas: el administrador debe revisarlo.
      conciliado: Math.abs(saldoCuentas - saldoCliente) < 0.005,
      cuentas: cuentas.map(c => ({
        id: c.id, documento: c.numero_venta === null ? c.documento_id : String(c.numero_venta),
        monto: Number(c.monto), saldo: Number(c.saldo), vencimiento: c.vencimiento, vencida: c.vencida,
        creadaEn: c.created_at,
        abonos: abonos.filter(a => a.cuenta_id === c.id).map(a => ({
          id: a.id, monto: Number(a.monto), metodo: a.metodo, fecha: a.created_at, notas: a.notas,
        })),
      })),
    };
  });
}
