import { createHash } from 'node:crypto';
import { PrismaService } from '../../src/prisma/prisma.service';
import { OperacionesService } from '../../src/operaciones/operaciones.service';

// Flujo real de dos cuentas para las pruebas de integridad. No suplanta servicios ni permisos.
export async function devolucionAutorizada(prisma: PrismaService, ops: OperacionesService, ...args: Parameters<OperacionesService['devolver']>) {
  const [tenantId, usuarioId, ventaId, dto] = args;
  const adminId = createHash('sha256').update(`test-aprobador:${tenantId}:${usuarioId}`).digest('hex');
  await prisma.usuario.createMany({ skipDuplicates: true, data: {
    id: adminId, tenantId, rol: 'ADMIN', nombre: 'Administrador autorizador sintético', email: `${adminId}@test.invalid`, passwordHash: 'sin-login-en-pruebas',
  } });
  await ops.solicitarDevolucion(tenantId, usuarioId, ventaId, dto);
  await ops.decidirDevolucion(tenantId, adminId, dto.solicitudId, { decision: 'AUTORIZADA', motivo: 'Mercancía y documento revisados en prueba' });
  return ops.ejecutarAutorizada(tenantId, usuarioId, dto.solicitudId);
}
