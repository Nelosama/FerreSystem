import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

const payload = { sub: 'u', tenantId: 't', type: 'tenant', sid: 's' };
function setup() {
  const prisma = {
    usuario: { findFirst: vi.fn().mockResolvedValue({ rol: 'CAJERO', tenant: { estado: 'ACTIVO' } }) },
    superAdmin: { findUnique: vi.fn().mockResolvedValue({ activo: true }) },
    sesionAuth: { findUnique: vi.fn().mockResolvedValue({ sujetoId: 'u', expiresAt: new Date(Date.now() + 60000), revokedAt: null }) },
  };
  return { prisma, strategy: new JwtStrategy(new ConfigService({ JWT_SECRET: 'isolated-jwt-availability-test-secret-2026' }), prisma as any) };
}
for (const code of ['P1001', 'P1002', 'P1008', 'P1017', 'P2024', 'P2037']) {
  it(`fallo ${code} de BD responde 503 y permite revalidar la misma sesión tras recuperar`, async () => {
    const { prisma, strategy } = setup();
    prisma.usuario.findFirst.mockRejectedValueOnce(Object.assign(new Error('postgresql://private'), { code }));
    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(strategy.validate(payload)).resolves.toMatchObject({ sub: 'u', tenantId: 't', rol: 'CAJERO' });
  });
}
it('fallo al consultar sesión o Super Admin también es recuperable sin autorizar', async () => {
  const { prisma, strategy } = setup();
  prisma.sesionAuth.findUnique.mockRejectedValueOnce({ code: 'P1017' });
  await expect(strategy.validate(payload)).rejects.toThrow('Servicio temporalmente no disponible');
  prisma.superAdmin.findUnique.mockRejectedValueOnce({ errorCode: 'P1001' });
  await expect(strategy.validate({ sub: 'u', sid: 's', type: 'super_admin' })).rejects.toBeInstanceOf(ServiceUnavailableException);
});
it('sesión revocada permanece 401 y fallos de programación no se ocultan como indisponibilidad', async () => {
  const { prisma, strategy } = setup();
  prisma.sesionAuth.findUnique.mockResolvedValueOnce(null);
  await expect(strategy.validate(payload)).rejects.toBeInstanceOf(UnauthorizedException);
  const defect = new Error('unexpected'); prisma.usuario.findFirst.mockRejectedValueOnce(defect);
  await expect(strategy.validate(payload)).rejects.toBe(defect);
});
