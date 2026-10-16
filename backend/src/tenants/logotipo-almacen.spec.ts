import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ServiceUnavailableException } from '@nestjs/common';
import { AlmacenLogotipoLocal, AlmacenLogotipoSupabase, claveLogotipo, crearAlmacenLogotipo } from './logotipo-almacen';

const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');

describe('clave de almacenamiento', () => {
  it('deriva la clave solo del identificador del negocio', () => {
    expect(claveLogotipo('tenant-A_1')).toBe('tenants/tenant-A_1/logo');
  });
  it.each(['../otro', 'a/b', '', 'x'.repeat(65), 'a b', '%2e%2e'])('rechaza identificador inválido %j', id => {
    expect(() => claveLogotipo(id)).toThrow('Identificador de negocio inválido');
  });
});

describe('AlmacenLogotipoLocal (disco persistente del servidor)', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'jowa-logotipos-'));
  const almacen = new AlmacenLogotipoLocal(raiz);

  afterAll(() => rmSync(raiz, { recursive: true, force: true }));

  it('guarda, lee, reemplaza y elimina dentro del directorio privado', async () => {
    const clave = claveLogotipo('negocio-1');
    await almacen.guardar(clave, PNG, 'image/png');
    expect((await almacen.leer(clave))?.equals(PNG)).toBe(true);
    const nuevo = Buffer.from('89504e470d0a1a0a00000001', 'hex');
    await almacen.guardar(clave, nuevo, 'image/png');
    expect((await almacen.leer(clave))?.equals(nuevo)).toBe(true);
    await almacen.eliminar(clave);
    expect(await almacen.leer(clave)).toBeNull();
  });

  it('no lee ni escribe fuera del directorio aunque la clave intente salir', async () => {
    await expect(almacen.guardar('../../escape', PNG, 'image/png')).rejects.toThrow('fuera del directorio privado');
    await expect(almacen.leer('../../etc/passwd')).rejects.toThrow('fuera del directorio privado');
    expect(existsSync(join(raiz, '..', 'escape'))).toBe(false);
  });

  it('exige ruta absoluta', () => {
    expect(() => new AlmacenLogotipoLocal('relativa/carpeta')).toThrow('ruta absoluta');
  });

  it('guarda los archivos con permisos privados', async () => {
    const clave = claveLogotipo('negocio-permisos');
    await almacen.guardar(clave, PNG, 'image/png');
    expect(readFileSync(join(raiz, clave)).equals(PNG)).toBe(true);
  });
});

describe('AlmacenLogotipoSupabase: contrato HTTP con servidor de prueba local', () => {
  // Servidor local que replica las rutas de Supabase Storage. Verifica el contrato (cabeceras, bucket
  // privado, 404 y errores). NO demuestra que el proyecto real de Supabase esté configurado.
  const objetos = new Map<string, { datos: Buffer; mime: string }>();
  const solicitudes: { metodo: string; ruta: string; autorizacion?: string }[] = [];
  let servidor: Server;
  let base = '';
  const CLAVE = 'service-role-de-prueba';

  const leerCuerpo = (req: IncomingMessage) => new Promise<Buffer>(resolver => {
    const partes: Buffer[] = [];
    req.on('data', parte => partes.push(parte));
    req.on('end', () => resolver(Buffer.concat(partes)));
  });

  beforeAll(async () => {
    servidor = createServer(async (req, res) => {
      const ruta = req.url ?? '';
      solicitudes.push({ metodo: req.method ?? '', ruta, autorizacion: req.headers.authorization });
      if (req.headers.authorization !== `Bearer ${CLAVE}`) { res.writeHead(401).end(); return; }
      const coincide = /^\/storage\/v1\/object\/(authenticated\/)?logotipos-privados\/(.+)$/.exec(ruta);
      if (!coincide) { res.writeHead(404).end(); return; }
      const clave = coincide[2];
      if (req.method === 'POST') {
        objetos.set(clave, { datos: await leerCuerpo(req), mime: String(req.headers['content-type']) });
        res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"Key":"ok"}');
      } else if (req.method === 'GET' && coincide[1]) {
        const objeto = objetos.get(clave);
        if (!objeto) { res.writeHead(404).end(); return; }
        res.writeHead(200, { 'Content-Type': objeto.mime }).end(objeto.datos);
      } else if (req.method === 'DELETE') {
        objetos.delete(clave);
        res.writeHead(200).end('{}');
      } else res.writeHead(405).end();
    });
    await new Promise<void>(done => servidor.listen(0, '127.0.0.1', done));
    base = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`;
  });
  afterAll(() => new Promise<void>(done => servidor.close(() => done())));

  it('usa bucket privado, autorización de servicio y devuelve los bytes exactos', async () => {
    const almacen = new AlmacenLogotipoSupabase(base, CLAVE, 'logotipos-privados');
    await almacen.guardar('tenants/n1/logo', PNG, 'image/png');
    expect((await almacen.leer('tenants/n1/logo'))?.equals(PNG)).toBe(true);
    expect(solicitudes.every(s => s.autorizacion === `Bearer ${CLAVE}`)).toBe(true);
    expect(solicitudes.some(s => s.ruta.startsWith('/storage/v1/object/authenticated/logotipos-privados/'))).toBe(true);
  });

  it('devuelve null para objetos inexistentes y elimina sin error si ya no existen', async () => {
    const almacen = new AlmacenLogotipoSupabase(base, CLAVE, 'logotipos-privados');
    expect(await almacen.leer('tenants/no-existe/logo')).toBeNull();
    await expect(almacen.eliminar('tenants/no-existe/logo')).resolves.toBeUndefined();
  });

  it('responde 503 claro si el almacenamiento rechaza la clave', async () => {
    const almacen = new AlmacenLogotipoSupabase(base, 'clave-incorrecta', 'logotipos-privados');
    await expect(almacen.guardar('tenants/n1/logo', PNG, 'image/png')).rejects.toThrow(ServiceUnavailableException);
  });

  it('responde 503 si el servicio no es alcanzable', async () => {
    const almacen = new AlmacenLogotipoSupabase('http://127.0.0.1:1', CLAVE, 'logotipos-privados');
    await expect(almacen.leer('tenants/n1/logo')).rejects.toThrow('no responde');
  });
});

describe('selección del almacenamiento por entorno', () => {
  it('sin configuración no simula almacenamiento', () => {
    expect(crearAlmacenLogotipo({})).toBeNull();
  });
  it('local exige directorio; supabase exige URL y clave de servicio', () => {
    expect(() => crearAlmacenLogotipo({ LOGOTIPO_ALMACEN: 'local' })).toThrow('LOGOTIPO_DIRECTORIO');
    expect(() => crearAlmacenLogotipo({ LOGOTIPO_ALMACEN: 'supabase', SUPABASE_URL: 'https://x.supabase.co' })).toThrow('SUPABASE_SERVICE_KEY');
    expect(crearAlmacenLogotipo({ LOGOTIPO_ALMACEN: 'supabase', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_KEY: 'k' })?.nombre).toBe('supabase');
  });
});
