import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';

// Prueba HTTP real de /api/health y /api/health/live con Nest y su prefijo global, sin PostgreSQL.
describe('Disponibilidad por HTTP', () => {
  async function crear(consulta: () => Promise<unknown>) {
    const module = await Test.createTestingModule({ controllers: [HealthController] })
      .useMocker((token) => (token === PrismaService ? { $queryRaw: vi.fn(consulta) } : undefined))
      .compile();
    const app: INestApplication = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    return app;
  }

  it('live responde 200 aunque PostgreSQL esté caído, sin consultar la base', async () => {
    const app = await crear(() => Promise.reject(new Error('caído')));
    await request(app.getHttpServer()).get('/api/health/live').expect(200, { status: 'ok' });
    await app.close();
  });

  it('health responde 503 con mensaje genérico cuando PostgreSQL no está disponible', async () => {
    const app = await crear(() => Promise.reject(new Error('detalle de conexión privado')));
    const response = await request(app.getHttpServer()).get('/api/health').expect(503);
    expect(JSON.stringify(response.body)).not.toContain('detalle de conexión privado');
    await app.close();
  });

  it('health responde 200 con PostgreSQL disponible', async () => {
    const app = await crear(() => Promise.resolve([{ ok: 1 }]));
    await request(app.getHttpServer()).get('/api/health').expect(200, { status: 'ok' });
    await app.close();
  });

  it('el prefijo es obligatorio: la ruta sin /api no existe', async () => {
    const app = await crear(() => Promise.resolve([{ ok: 1 }]));
    await request(app.getHttpServer()).get('/health/live').expect(404);
    await app.close();
  });
});
