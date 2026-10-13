import 'reflect-metadata';
import { Body, Controller, INestApplication, Patch, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { IsOptional, IsString } from 'class-validator';
import { ConfigContingenciaDto } from '../src/contingencia/dto/contingencia.dto';
import { PROFUNDIDAD_MAXIMA_JSON, configurarPipesGlobales, profundidadDe } from '../src/common/pipes/profundidad-maxima.pipe';

// H-P (CENTINELA sobre 71ec3a00): un JSON muy anidado tumbaba el ValidationPipe con 500. No requiere base de datos.
class Dto { @IsOptional() @IsString() a?: string }
let escrituras = 0;
@Controller('x') class Probe {
  @Patch('configuracion') configuracion(@Body() dto: ConfigContingenciaDto) { escrituras += 1; return { ok: true, claves: Object.keys(dto) }; }
  @Post() conDto(@Body() _b: Dto) { return { ok: true }; }
  @Post('sin-dto') sinDto(@Body() _b: any) { return { ok: true }; }
}
const arreglos = (n: number) => '['.repeat(n) + ']'.repeat(n);
const objetos = (n: number, hoja = '1') => '{"a":'.repeat(n) + hoja + '}'.repeat(n);

describe('H-P: profundidad máxima del cuerpo JSON', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = (await Test.createTestingModule({ controllers: [Probe] }).compile()).createNestApplication();
    configurarPipesGlobales(app);
    await app.init();
  });
  afterAll(() => app.close());
  const enviar = (ruta: string, cuerpo: string) => request(app.getHttpServer()).post(ruta).set('content-type', 'application/json').send(cuerpo);

  it('profundidadDe mide sin recursión, acota ciclos y no recorre buffers', () => {
    expect(profundidadDe(1)).toBe(0);
    expect(profundidadDe({})).toBe(1);
    expect(profundidadDe({ a: [{ b: [1] }] })).toBe(4);
    const ciclo: any = {}; ciclo.yo = ciclo;
    expect(profundidadDe(ciclo)).toBeGreaterThan(PROFUNDIDAD_MAXIMA_JSON);
    expect(profundidadDe({ archivo: Buffer.alloc(5_000_000) })).toBe(1);
  });

  it('los cuerpos anidados que antes daban 500 responden 400, con y sin DTO', async () => {
    for (const cuerpo of [arreglos(5000), arreglos(3000), arreglos(1500), objetos(5000), objetos(12000), arreglos(PROFUNDIDAD_MAXIMA_JSON + 1)]) {
      for (const ruta of ['/x', '/x/sin-dto']) expect((await enviar(ruta, cuerpo)).status, `${ruta} ${cuerpo.length}`).toBe(400);
    }
  });

  it('un cuerpo legítimo, incluso en el límite, sigue funcionando', async () => {
    expect((await enviar('/x', '{"a":"hola"}')).status).toBe(201);
    expect((await enviar('/x/sin-dto', objetos(PROFUNDIDAD_MAXIMA_JSON - 1))).status).toBe(201);
    expect((await enviar('/x/sin-dto', JSON.stringify({ operaciones: [{ lineas: [{ productoId: 'p', cantidadCentesimas: 1 }] }] }))).status).toBe(201);
  });
});

// D-3 (auditoría sobre 0ac3f741): PATCH configuración con un cuerpo de tipo incorrecto respondía 500.
describe('D-3: cuerpo JSON de tipo incorrecto en PATCH configuración', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = (await Test.createTestingModule({ controllers: [Probe] }).compile()).createNestApplication();
    configurarPipesGlobales(app);
    await app.init();
  });
  afterAll(() => app.close());
  const parchar = (cuerpo: string) => request(app.getHttpServer()).patch('/x/configuracion').set('content-type', 'application/json').send(cuerpo);

  it('arreglos, null, números y textos JSON se rechazan con 400 y no ejecutan el controlador', async () => {
    const antes = escrituras;
    for (const cuerpo of ['[]', '[{}]', '[1,2]', '[null]', '[{"habilitada":true}]', 'null', '7', '"texto"', 'true']) {
      const r = await parchar(cuerpo);
      expect(r.status, cuerpo).toBe(400);
    }
    expect(escrituras, 'ningún cuerpo inválido llega al controlador').toBe(antes);
  });

  it('un objeto válido, incluso vacío o con claves ajenas, sigue funcionando', async () => {
    expect((await parchar('{}')).status).toBe(200);
    const r = await parchar('{"habilitada":true,"ajena":1}');
    expect(r.status).toBe(200);
    expect(r.body.claves).toEqual(['habilitada']);
    expect((await parchar('{"cupoPorcentaje":500}')).status).toBe(400);
  });
});
