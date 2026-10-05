import { Controller, Get, Post, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { createFrontendCorsOptions, getAllowedFrontendOrigins } from './frontend-cors';

@Controller('probe')
class CorsProbeController {
  @Get()
  ready() { return { status: 'ok' }; }
  @Post()
  submit() { return { status: 'ok' }; }
}

describe('Configuración de orígenes del frontend', () => {
  it('conserva orígenes locales y legacy, normaliza y deduplica la lista exacta', () => {
    expect(getAllowedFrontendOrigins({
      FRONTEND_URL: ' https://legacy.example.test/ ',
      FRONTEND_URLS: 'https://PRODUCTION.example.test:443/, https://preview.example.test:8443, https://production.example.test, ',
    })).toEqual([
      'http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000',
      'https://legacy.example.test', 'https://production.example.test', 'https://preview.example.test:8443',
    ]);
  });

  it.each([
    'javascript:alert(1)', 'file:///example.test', 'https://example.test/path',
    'https://example.test/path/..', 'https://example.test//', 'https://*.example.test',
    'https://%2A.example.test', 'https://example.test?query=value', 'https://example.test?',
    'https://example.test#fragment', 'https://example.test#', 'https://user:private-password@example.test',
    'https://@example.test', 'https:\\example.test', 'https://example.test\\', 'not-a-url',
  ])('rechaza configuraciones que no son orígenes exactos (%s)', origin => {
    expect(() => getAllowedFrontendOrigins({ FRONTEND_URLS: origin })).toThrow('FRONTEND_URLS');
    expect(() => getAllowedFrontendOrigins({ FRONTEND_URL: origin })).toThrow('FRONTEND_URL');
  });

  it('el diagnóstico no imprime un valor configurado con credenciales', () => {
    try {
      createFrontendCorsOptions({ FRONTEND_URLS: 'https://private-user:private-password@example.test' });
      throw new Error('La configuración con credenciales fue aceptada');
    } catch (error) {
      expect(String(error)).toContain('FRONTEND_URLS');
      expect(String(error)).not.toContain('private-user');
      expect(String(error)).not.toContain('private-password');
    }
  });
});

describe('CORS mediante solicitudes HTTP reales en Nest', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [CorsProbeController] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableCors(createFrontendCorsOptions({
      FRONTEND_URL: 'https://legacy.example.test/',
      FRONTEND_URLS: 'https://production.example.test/,https://preview.example.test:8443',
    }));
    await app.init();
  });
  afterAll(async () => { await app.close(); });

  it.each(['https://production.example.test', 'https://preview.example.test:8443', 'https://legacy.example.test', 'http://localhost:5173'])('autoriza el preflight y las credenciales del origen exacto %s', async origin => {
    const response = await request(app.getHttpServer()).options('/api/probe')
      .set('Origin', origin).set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,authorization,x-tenant-id').expect(204);
    expect(response.headers['access-control-allow-origin']).toBe(origin);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(response.headers['access-control-allow-headers']).toBe('Content-Type,Authorization,X-Tenant-Id');
  });

  it.each(['https://unknown.example.test', 'https://production.example.test.attacker.test', 'https://preview.example.test', 'https://production.example.test/'])('no entrega permisos CORS ni credenciales para %s', async origin => {
    const response = await request(app.getHttpServer()).options('/api/probe')
      .set('Origin', origin).set('Access-Control-Request-Method', 'POST').expect(404);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('permite una llamada del servidor sin Origin', async () => {
    const response = await request(app.getHttpServer()).post('/api/probe').expect(201);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
