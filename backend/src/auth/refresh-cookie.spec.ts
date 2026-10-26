import { refreshCookieOptions } from './refresh-cookie';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import * as bcrypt from 'bcrypt';

describe('cookie de renovación: misma política al emitir y borrar', () => {
  for (const admin of [false, true]) {
    it(`cookie ${admin ? 'Super Admin' : 'tenant'} cross-site se elimina con Secure y SameSite=None`, () => {
      expect(refreshCookieOptions({ get: () => 'production' }, admin)).toEqual({ httpOnly: true, secure: true, sameSite: 'none', path: admin ? '/api/admin/auth' : '/' });
    });
  }
  it('NODE_ENV con espacios o mayúsculas (pegado en Render) sigue siendo producción', () => {
    for (const valor of [' production ', 'Production']) {
      expect(refreshCookieOptions({ get: () => valor })).toMatchObject({ secure: true, sameSite: 'none' });
    }
  });
  it('la vida de la cookie sigue JWT_REFRESH_EXPIRES_IN en vez de siete días fijos', async () => {
    const clock = new Date('2026-10-16T08:00:00Z');
    const spy = vi.spyOn(Date, 'now').mockReturnValue(clock.getTime());
    try {
      const jwt = new JwtService({ secret: 'test-cookie-policy-secret' });
      const prisma = {
        superAdmin: { findUnique: vi.fn().mockResolvedValue(null) },
        usuario: { findFirst: vi.fn().mockResolvedValue({ id: 'u', tenantId: 't', activo: true, rol: 'ADMIN', passwordHash: bcrypt.hashSync('Test-Password-123', 4), tenant: { id: 't', estado: 'ACTIVO' } }) },
        sesionAuth: { create: vi.fn().mockResolvedValue({}) },
        authAction: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
        $queryRaw: vi.fn().mockResolvedValue([{ segundos: 0 }]), $executeRaw: vi.fn(),
      } as any;
      const config = { get: (key: string, fallback?: any) => key === 'JWT_REFRESH_EXPIRES_IN' ? '1h' : fallback } as any;
      const service = new AuthService(prisma, jwt, config);
      const response = { cookie: vi.fn(), setHeader: vi.fn() } as any;
      await service.login({ tenantId: 't', email: 'u@example.invalid', password: 'Test-Password-123' }, response);
      const [, value, options] = response.cookie.mock.calls[0];
      expect(options.maxAge).toBe(3_600_000);
      expect(jwt.decode<any>(value).exp * 1000).toBe(clock.getTime() + options.maxAge);
      expect(prisma.sesionAuth.create.mock.calls[0][0].data.expiresAt.getTime()).toBe(clock.getTime() + options.maxAge);
    } finally { spy.mockRestore(); }
  });
});
