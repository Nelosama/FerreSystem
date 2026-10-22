import { Logger } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';

describe('Errores de infraestructura sin credenciales', () => {
  afterEach(() => vi.restoreAllMocks());

  it('no escribe el error de conexión en logs y conserva el arranque tolerante', async () => {
    const marker = 'synthetic-private-connection-marker';
    const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const prisma = new PrismaService();
    vi.spyOn(prisma, '$connect').mockRejectedValue(new Error(marker));
    await expect(prisma.onModuleInit()).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain(marker);
  });

  it('el health check devuelve solo el estado y no escribe detalles de conexión', async () => {
    const marker = 'synthetic-private-health-marker';
    const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const controller = new AppController(new AppService(), { $queryRaw: vi.fn().mockRejectedValue(new Error(marker)) } as any);
    const response = await controller.checkDatabaseHealth();
    expect(response).toMatchObject({ status: 'error', database: 'disconnected' });
    expect(JSON.stringify(response)).not.toContain(marker);
    expect(log).toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain(marker);
  });
});
