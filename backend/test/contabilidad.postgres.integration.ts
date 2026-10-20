import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { TenantModuleGuard } from '../src/common/guards/tenant-module.guard';
import { configurarPipesGlobales } from '../src/common/pipes/profundidad-maxima.pipe';
import { ContabilidadController } from '../src/contabilidad/contabilidad.controller';
import { ContabilidadService } from '../src/contabilidad/contabilidad.service';
import { VentasController } from '../src/ventas/ventas.controller';
import { VentasService } from '../src/ventas/ventas.service';
import { OperacionesController } from '../src/operaciones/operaciones.controller';
import { OperacionesService } from '../src/operaciones/operaciones.service';
import { ProductosController } from '../src/productos/productos.controller';
import { ProductosService } from '../src/productos/productos.service';
import { ClientesController } from '../src/clientes/clientes.controller';
import { ClientesService } from '../src/clientes/clientes.service';

// Contabilidad y Control Tributario contra PostgreSQL real: clúster temporal y cadena completa de migraciones.
// Guards reales (módulo por empresa, empresa, rol y permiso); solo la verificación del JWT se sustituye por la
// identidad de prueba. Nunca lee DATABASE_URL.
const bin = process.env.PG_BIN || '/usr/bin';
const exe = (name: string) => join(bin, name);

describe('Contabilidad Honduras / PostgreSQL aislado', () => {
  let directory = '';
  let started = false;
  let prisma: PrismaService;
  let app: INestApplication;
  const A = randomUUID(), B = randomUUID();
  const u = {
    adminA: randomUUID(), contadorA: randomUUID(), cajeroA: randomUUID(), contadorLectorA: randomUUID(),
    adminB: randomUUID(), contadorB: randomUUID(),
  };
  const tenantDe: Record<string, string> = { [u.adminA]: A, [u.contadorA]: A, [u.cajeroA]: A, [u.contadorLectorA]: A, [u.adminB]: B, [u.contadorB]: B };
  const rolDe: Record<string, string> = { [u.adminA]: 'ADMIN', [u.contadorA]: 'CONTADOR', [u.cajeroA]: 'CAJERO', [u.contadorLectorA]: 'CONTADOR', [u.adminB]: 'ADMIN', [u.contadorB]: 'CONTADOR' };
  const permisosDe: Record<string, { permisos: string[]; permisosConfigurados: boolean }> = { [u.contadorLectorA]: { permisos: ['contabilidad.ver'], permisosConfigurados: true } };
  const venta = { completa: randomUUID(), sinDoc: randomUUID(), anulada: randomUUID(), borde: randomUUID(), octubre: randomUUID(), deB: randomUUID() };
  const proveedorA = randomUUID(), compra1 = randomUUID(), compra2 = randomUUID();
  const sql = (texto: string, ...args: unknown[]) => prisma.$queryRawUnsafe<any[]>(texto, ...args);
  const como = (usuario: string) => ({
    get: (ruta: string) => request(app.getHttpServer()).get(ruta).set('x-prueba-usuario', usuario),
    post: (ruta: string, body: object = {}) => request(app.getHttpServer()).post(ruta).set('x-prueba-usuario', usuario).send(body),
    put: (ruta: string, body: object = {}) => request(app.getHttpServer()).put(ruta).set('x-prueba-usuario', usuario).send(body),
  });

  beforeAll(async () => {
    if (!existsSync(exe('initdb'))) throw new Error(`PostgreSQL not installed at ${bin}`);
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-contabilidad-'));
    const listener = createServer();
    await new Promise<void>((done, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', done); });
    const port = (listener.address() as { port: number }).port;
    await new Promise<void>(done => listener.close(() => done()));
    const url = `postgresql://postgres@127.0.0.1:${port}/postgres`;
    const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG'))), PGHOST: '127.0.0.1', PGPORT: String(port), PGDATABASE: 'postgres', PGUSER: 'postgres' };
    const options = { windowsHide: true, timeout: 30000, env, stdio: 'pipe' as const };
    execFileSync(exe('initdb'), ['-D', join(directory, 'data'), '-U', 'postgres', '-A', 'trust', '--locale=C', '-E', 'UTF8', '--no-sync'], { ...options, timeout: 60000 });
    execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-l', join(directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -k ${directory}`, '-w', 'start'], { ...options, stdio: 'ignore' });
    started = true;
    for (const migracion of readdirSync(resolve('prisma/migrations')).sort()) {
      const archivo = resolve('prisma/migrations', migracion, 'migration.sql');
      if (!existsSync(archivo)) continue;
      execFileSync(exe('psql'), ['-X', '-q', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', archivo], options);
    }
    prisma = new PrismaService({ datasources: { db: { url } } });
    await prisma.$connect();

    for (const [t, nombre] of [[A, 'Ferretería A'], [B, 'Ferretería B']]) await sql('INSERT INTO tenants (id,nombre_comercial,updated_at) VALUES ($1,$2,NOW())', t, nombre);
    for (const [id, t] of Object.entries(tenantDe)) {
      await sql('INSERT INTO usuarios (id,tenant_id,nombre,email,password_hash,rol,permisos,permisos_configurados,updated_at) VALUES ($1,$2,$3,$4,$5,$6::"Rol",$7,$8,NOW())',
        id, t, `Usuario ${rolDe[id]}`, `${id}@example.invalid`, 'x', rolDe[id], permisosDe[id]?.permisos ?? [], permisosDe[id]?.permisosConfigurados ?? false);
    }
    // Solo la empresa A contrata el módulo. B no tiene registro: el módulo opcional queda apagado.
    await sql("INSERT INTO tenant_modules (id,tenant_id,module_key,enabled,updated_at) VALUES ($1,$2,'contabilidad',true,NOW())", randomUUID(), A);
    const v = (id: string, t: string, n: number, base: number, estado: string, creada: string, rtn: string | null) => sql(
      'INSERT INTO ventas (id,tenant_id,numero_venta,usuario_id,subtotal,descuento,isv,total,estado,created_at,cliente_nombre,cliente_rtn) VALUES ($1,$2,$3,$4,$5,0,$6,$7,$8::"EstadoVenta",$9::timestamp,$10,$11)',
      id, t, n, t === A ? u.cajeroA : u.adminB, base, Math.round(base * 15) / 100, Math.round(base * 115) / 100, estado, creada, 'Cliente de prueba', rtn);
    await v(venta.completa, A, 1, 1000, 'COMPLETADA', '2026-09-10 18:00:00', '08011990123456');
    await v(venta.sinDoc, A, 2, 200, 'COMPLETADA', '2026-09-11 18:00:00', null);
    await v(venta.anulada, A, 3, 300, 'ANULADA', '2026-09-12 18:00:00', null);
    // 03:00 UTC del 1 de octubre = 21:00 del 30 de septiembre en Tegucigalpa: pertenece a septiembre.
    await v(venta.borde, A, 4, 100, 'COMPLETADA', '2026-10-01 03:00:00', null);
    await v(venta.octubre, A, 5, 100, 'COMPLETADA', '2026-10-01 07:00:00', null);
    await v(venta.deB, B, 1, 500, 'COMPLETADA', '2026-09-10 18:00:00', null);
    await sql('INSERT INTO devoluciones (id,tenant_id,venta_id,usuario_id,solicitud_hash,motivo,monto,credito_cancelado,reembolso,metodo,created_at) VALUES ($1,$2,$3,$4,$5,$6,115,0,115,$7,$8::timestamp)',
      randomUUID(), A, venta.completa, u.cajeroA, 'h', 'Producto dañado', 'EFECTIVO', '2026-09-15 18:00:00');
    await sql('INSERT INTO proveedores (id,tenant_id,nombre,rtn,updated_at) VALUES ($1,$2,$3,$4,NOW())', proveedorA, A, 'Distribuidora Uno', '08019000000001');
    for (const [id, codigo, sub] of [[compra1, 'COMP-1', 200], [compra2, 'COMP-2', 400]] as const) {
      await sql("INSERT INTO ordenes_compra (id,tenant_id,codigo,proveedor_id,usuario_id,subtotal,isv,total,estado,numero_factura,fecha_emision,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'RECIBIDA',$9,'2026-09-05 15:00:00',NOW())",
        id, A, codigo, proveedorA, u.adminA, sub, sub * 0.15, sub * 1.15, `F-${codigo}`);
    }

    const module = await Test.createTestingModule({
      controllers: [ContabilidadController, VentasController, OperacionesController, ProductosController, ClientesController],
      providers: [
        ContabilidadService, VentasService, OperacionesService, ProductosService, ClientesService,
        { provide: PrismaService, useValue: prisma },
        { provide: APP_GUARD, useClass: TenantModuleGuard },
      ],
    }).overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true }).compile();
    app = module.createNestApplication({ logger: false });
    app.use((req: any, _res: unknown, next: () => void) => {
      const id = req.headers['x-prueba-usuario'];
      if (id) req.user = { sub: id, type: 'tenant', tenantId: tenantDe[id], rol: rolDe[id], ...(permisosDe[id] ?? { permisos: [], permisosConfigurados: false }) };
      next();
    });
    configurarPipesGlobales(app);
    await app.init();
  }, 180000);

  afterAll(async () => {
    try { await app?.close(); await prisma?.$disconnect(); }
    finally {
      if (started) execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { windowsHide: true, timeout: 15000, stdio: 'ignore' });
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-contabilidad-')) rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  });

  const periodo = 'anio=2026&mes=9';
  let caiId = '';
  let facturaId = '';

  it('el módulo es opcional: sin registro habilitado la empresa B no lo ve, aunque tenga ADMIN y CONTADOR', async () => {
    await como(u.adminB).get(`/contabilidad/libros/ventas?${periodo}`).expect(403);
    await como(u.contadorB).get(`/contabilidad/configuracion`).expect(403);
    await como(u.contadorA).get(`/contabilidad/configuracion`).expect(200);
  });

  it('roles: CAJERO no entra; CONTADOR con solo «ver» lee pero no registra', async () => {
    await como(u.cajeroA).get(`/contabilidad/libros/ventas?${periodo}`).expect(403);
    await como(u.cajeroA).post('/contabilidad/tasas', {}).expect(403);
    await como(u.contadorLectorA).get(`/contabilidad/libros/ventas?${periodo}`).expect(200);
    await como(u.contadorLectorA).put('/contabilidad/configuracion', { razonSocial: 'X', agenteRetencion: false, motivo: 'prueba' }).expect(403);
  });

  it('configuración fiscal y tasas con vigencia: sin solapes, con base legal y trazadas', async () => {
    await como(u.contadorA).put('/contabilidad/configuracion', { rtn: '0801-2000-000001', razonSocial: 'Ferretería A S. de R.L.', agenteRetencion: false, motivo: 'Alta inicial' }).expect(200);
    await como(u.contadorA).post('/contabilidad/tasas', { categoria: 'GENERAL', porcentaje: 15, vigenteDesde: '2014-01-01', baseLegal: 'Decreto 278-2013, art. 16 (verificar en La Gaceta)' }).expect(201);
    const solape = await como(u.adminA).post('/contabilidad/tasas', { categoria: 'GENERAL', porcentaje: 16, vigenteDesde: '2026-01-01', baseLegal: 'Prueba de solape' });
    expect(solape.status).toBe(409);
    await como(u.contadorA).post('/contabilidad/tasas', { categoria: 'GENERAL', porcentaje: 15, vigenteDesde: '2014-01-01' }).expect(400); // sin base legal
    // El disparador también impide el solape aunque se salte el servicio.
    await expect(sql("INSERT INTO fiscal_tasas (id,tenant_id,impuesto,categoria,porcentaje,vigente_desde,base_legal,creado_por) VALUES ($1,$2,'ISV','GENERAL',16,'2020-01-01','x x x',$3)", randomUUID(), A, u.adminA)).rejects.toThrow(/solapa/);
    const cfg = (await como(u.contadorA).get('/contabilidad/configuracion').expect(200)).body;
    expect(cfg.configuracion.rtn).toBe('08012000000001');
    expect(cfg.tasas).toHaveLength(1);
    const ajustes = await sql("SELECT entidad, accion FROM fiscal_ajustes WHERE tenant_id=$1 ORDER BY created_at", A);
    expect(ajustes.map(a => `${a.entidad}:${a.accion}`)).toEqual(['CONFIGURACION:CREAR', 'TASA:CREAR']);
  });

  it('CAI y documento emitido: importes tomados de la venta, rango y fecha límite controlados', async () => {
    const cai = await como(u.contadorA).post('/contabilidad/cai', { cai: 'ab12cd-34ef56-7890ab', tipoDocumento: '01', establecimiento: '000', puntoEmision: '001', rangoInicial: 1, rangoFinal: 50, fechaLimiteEmision: '2026-12-31' }).expect(201);
    caiId = cai.body.id;
    expect(cai.body.cai).toBe('AB12CD-34EF56-7890AB');
    await como(u.contadorA).post('/contabilidad/cai', { cai: 'OTRO-CAI-01', tipoDocumento: '01', establecimiento: '000', puntoEmision: '001', rangoInicial: 40, rangoFinal: 90, fechaLimiteEmision: '2026-12-31' }).expect(409);
    await como(u.contadorA).post('/contabilidad/cai', { cai: 'CAI-NC-0001', tipoDocumento: '06', establecimiento: '000', puntoEmision: '001', rangoInicial: 1, rangoFinal: 50, fechaLimiteEmision: '2026-12-31' }).expect(201);
    const doc = await como(u.contadorA).post('/contabilidad/documentos', { direccion: 'EMITIDO', tipoDocumento: '01', numero: '000-001-01-00000001', fechaEmision: '2026-09-10', ventaId: venta.completa }).expect(201);
    facturaId = doc.body.id;
    expect(doc.body).toMatchObject({ importeGravadoGeneral: '1000.00', isvGeneral: '150.00', total: '1150.00', rtnContraparte: '08011990123456', cai: 'AB12CD-34EF56-7890AB' });
    const fuera = await como(u.contadorA).post('/contabilidad/documentos', { direccion: 'EMITIDO', tipoDocumento: '01', numero: '000-001-01-00000051', fechaEmision: '2026-09-11', importeGravadoGeneral: 10, isvGeneral: 1.5 });
    expect(fuera.status).toBe(400);
    expect(fuera.body.hallazgos).toEqual(['SIN_CAI']);
    const isvMal = await como(u.contadorA).post('/contabilidad/documentos', { direccion: 'EMITIDO', tipoDocumento: '01', numero: '000-001-01-00000002', fechaEmision: '2026-09-11', importeGravadoGeneral: 10, isvGeneral: 1 });
    expect(isvMal.body.hallazgos).toEqual(['ISV_GENERAL_INCORRECTO']);
    // Una venta solo tiene una factura vigente.
    await como(u.contadorA).post('/contabilidad/documentos', { direccion: 'EMITIDO', tipoDocumento: '01', numero: '000-001-01-00000004', fechaEmision: '2026-09-10', ventaId: venta.completa }).expect(409);
    // Correlativo 3 deja un salto en el 2.
    await como(u.contadorA).post('/contabilidad/documentos', { direccion: 'EMITIDO', tipoDocumento: '01', numero: '000-001-01-00000003', fechaEmision: '2026-09-20', nombreContraparte: 'Cliente mostrador', importeGravadoGeneral: 100, isvGeneral: 15 }).expect(201);
  });

  it('aislamiento: otra empresa no ve ni referencia datos de A, ni por API ni por clave foránea', async () => {
    await sql("INSERT INTO tenant_modules (id,tenant_id,module_key,enabled,updated_at) VALUES ($1,$2,'contabilidad',true,NOW())", randomUUID(), B);
    const docsB = await como(u.contadorB).get(`/contabilidad/documentos?${periodo}`).expect(200);
    expect(docsB.body).toEqual([]);
    const libroB = (await como(u.contadorB).get(`/contabilidad/libros/ventas?${periodo}`).expect(200)).body;
    expect(libroB.filas.map((f: any) => f.operacionId)).toEqual([venta.deB]);
    await como(u.contadorB).post('/contabilidad/documentos', { direccion: 'EMITIDO', tipoDocumento: '01', numero: '000-001-01-00000001', fechaEmision: '2026-09-10', ventaId: venta.completa }).expect(404);
    await como(u.contadorB).post(`/contabilidad/documentos/${facturaId}/anular`, { motivo: 'intento ajeno' }).expect(404);
    await como(u.adminB).post(`/contabilidad/cai/${caiId}/desactivar`, { motivo: 'intento ajeno' }).expect(404);
    await expect(sql("INSERT INTO fiscal_documentos (id,tenant_id,direccion,tipo_documento,numero,fecha_emision,nombre_contraparte,venta_id,total,importe_gravado_general,creado_por) VALUES ($1,$2,'EMITIDO','01','000-001-01-00000009','2026-09-10','x',$3,1,1,$4)", randomUUID(), B, venta.completa, u.adminB)).rejects.toThrow(/otra empresa/);
    await expect(sql("INSERT INTO fiscal_documentos (id,tenant_id,direccion,tipo_documento,numero,fecha_emision,nombre_contraparte,cai_id,total,importe_gravado_general,creado_por) VALUES ($1,$2,'EMITIDO','01','000-001-01-00000009','2026-09-10','x',$3,1,1,$4)", randomUUID(), B, caiId, u.adminB)).rejects.toThrow(/fiscal_documentos_cai_fkey/);
    await sql("UPDATE tenant_modules SET enabled=false WHERE tenant_id=$1 AND module_key='contabilidad' RETURNING id", B);
    await como(u.contadorB).get(`/contabilidad/documentos?${periodo}`).expect(403);
  });

  it('libro de ventas: documentos + ventas sin documento, zona horaria del negocio y totales exactos', async () => {
    const libro = (await como(u.contadorA).get(`/contabilidad/libros/ventas?${periodo}`).expect(200)).body;
    const porRef = Object.fromEntries(libro.filas.map((f: any) => [f.numero ?? f.referenciaInterna, f]));
    expect(porRef['000-001-01-00000001']).toMatchObject({ origen: 'DOCUMENTO', referenciaInterna: 'V-1', hallazgos: [] });
    expect(porRef['V-2']).toMatchObject({ origen: 'VENTA', hallazgos: ['SIN_DOCUMENTO_FISCAL'], total: '230.00' });
    expect(porRef['V-3']).toMatchObject({ estado: 'ANULADA', hallazgos: [] });
    expect(porRef['V-4']).toMatchObject({ fecha: '2026-09-30' });
    expect(porRef['V-5']).toBeUndefined();
    expect(porRef['000-001-01-00000003'].hallazgos).toEqual(['SIN_OPERACION']);
    expect(libro.totales).toMatchObject({ documentos: 2, importeGravadoGeneral: '1100.00', isvGeneral: '165.00', total: '1265.00' });
    expect(libro.totales.sinDocumento).toEqual({ cantidad: 2, base: '300.00', isv: '45.00', total: '345.00' });
    expect(libro.devoluciones).toEqual([expect.objectContaining({ referenciaInterna: 'V-1', monto: '115.00', hallazgos: ['DEVOLUCION_SIN_NOTA_CREDITO'] })]);
  });

  it('libro de compras y conciliación contra la compra registrada', async () => {
    await como(u.contadorA).post('/contabilidad/documentos', { direccion: 'RECIBIDO', tipoDocumento: '01', numero: '001-002-01-00004567', cai: 'PROV-CAI-123', fechaEmision: '2026-09-05', ordenCompraId: compra1 }).expect(201);
    // El proveedor facturó otro ISV del que se registró en la compra: queda como hallazgo, no se rechaza.
    await como(u.contadorA).post('/contabilidad/documentos', { direccion: 'RECIBIDO', tipoDocumento: '01', numero: '001-002-01-00004568', cai: 'PROV-CAI-123', fechaEmision: '2026-09-06', ordenCompraId: compra2, importeGravadoGeneral: 400, isvGeneral: 59 }).expect(201);
    // Sin RTN del proveedor no hay factura recibida.
    await como(u.contadorA).post('/contabilidad/documentos', { direccion: 'RECIBIDO', tipoDocumento: '01', numero: '009-001-01-00000001', fechaEmision: '2026-09-06', nombreContraparte: 'Sin RTN', importeGravadoGeneral: 10, isvGeneral: 1.5 }).expect(400);
    const libro = (await como(u.contadorA).get(`/contabilidad/libros/compras?${periodo}`).expect(200)).body;
    const porNumero = Object.fromEntries(libro.filas.map((f: any) => [f.numero, f]));
    expect(porNumero['001-002-01-00004567'].hallazgos).toEqual([]);
    expect(porNumero['001-002-01-00004568'].hallazgos).toEqual(expect.arrayContaining(['ISV_GENERAL_INCORRECTO', 'TOTAL_DISTINTO', 'ISV_DISTINTO']));
    expect(libro.totales).toMatchObject({ documentos: 2, isvGeneral: '89.00', total: '689.00' });
    expect(libro.totales.sinDocumento.cantidad).toBe(0);
  });

  it('retenciones: reglas de la empresa, agente de retención y resumen de ISV', async () => {
    const regla = await como(u.contadorA).post('/contabilidad/reglas-retencion', { codigo: 'RET-ISV-PRUEBA', impuesto: 'ISV', descripcion: 'Regla de prueba configurada por el contador', porcentaje: 10, baseCalculo: 'IMPUESTO', vigenteDesde: '2026-01-01', baseLegal: 'Base legal indicada por el contador (prueba)' }).expect(201);
    const compraDoc = (await sql("SELECT id FROM fiscal_documentos WHERE tenant_id=$1 AND numero='001-002-01-00004567'", A))[0].id;
    await como(u.contadorA).post(`/contabilidad/documentos/${compraDoc}/retenciones`, { reglaId: regla.body.id, tipo: 'EFECTUADA', fecha: '2026-09-07' }).expect(403);
    const sufrida = await como(u.contadorA).post(`/contabilidad/documentos/${facturaId}/retenciones`, { reglaId: regla.body.id, tipo: 'SUFRIDA', fecha: '2026-09-12' }).expect(201);
    expect(sufrida.body).toMatchObject({ base: '150.00', monto: '15.00' });
    await como(u.contadorA).post(`/contabilidad/documentos/${facturaId}/retenciones`, { reglaId: regla.body.id, tipo: 'SUFRIDA', fecha: '2026-09-12' }).expect(409);
    await como(u.contadorA).post(`/contabilidad/documentos/${facturaId}/retenciones`, { reglaId: regla.body.id, tipo: 'SUFRIDA', fecha: '2025-12-31' }).expect(400);
    const resumen = (await como(u.contadorA).get(`/contabilidad/resumen-isv?${periodo}`).expect(200)).body;
    expect(resumen).toMatchObject({ debitoFiscal: '165.00', creditoFiscal: '89.00', retencionesIsvSufridas: '15.00', resultado: '61.00', tipoResultado: 'A_PAGAR' });
    await expect(sql("DELETE FROM fiscal_retenciones WHERE id=$1", sufrida.body.id)).rejects.toThrow(/no se eliminan/);
  });

  it('nota de crédito: referencia obligatoria, no excede el original y resuelve la devolución', async () => {
    await como(u.contadorA).post('/contabilidad/documentos', { direccion: 'EMITIDO', tipoDocumento: '06', numero: '000-001-06-00000001', fechaEmision: '2026-09-15', nombreContraparte: 'Cliente', importeGravadoGeneral: 100, isvGeneral: 15 }).expect(400);
    await como(u.contadorA).post('/contabilidad/documentos', { direccion: 'EMITIDO', tipoDocumento: '06', numero: '000-001-06-00000001', fechaEmision: '2026-09-15', documentoReferenciaId: facturaId, nombreContraparte: 'Cliente', importeGravadoGeneral: 2000, isvGeneral: 300 }).expect(400);
    await como(u.contadorA).post('/contabilidad/documentos', { direccion: 'EMITIDO', tipoDocumento: '06', numero: '000-001-06-00000001', fechaEmision: '2026-09-15', documentoReferenciaId: facturaId, nombreContraparte: 'Cliente', importeGravadoGeneral: 100, isvGeneral: 15 }).expect(201);
    const libro = (await como(u.contadorA).get(`/contabilidad/libros/ventas?${periodo}`).expect(200)).body;
    expect(libro.devoluciones[0].hallazgos).toEqual([]);
    expect(libro.totales).toMatchObject({ documentos: 3, isvGeneral: '150.00', total: '1150.00' });
    const conc = (await como(u.contadorA).get(`/contabilidad/conciliacion?${periodo}`).expect(200)).body;
    expect(conc.porCodigo).toMatchObject({ SALTO_CORRELATIVO: 1, SIN_DOCUMENTO_FISCAL: 2, SIN_OPERACION: 1 });
    expect(conc.hallazgos.find((h: any) => h.codigo === 'SALTO_CORRELATIVO')).toMatchObject({ referencia: '000-001-01', detalle: '2–2' });
    expect(conc.porCodigo.DEVOLUCION_SIN_NOTA_CREDITO).toBeUndefined();
  });

  it('corrección y anulación con motivo, en la bitácora de solo inserción', async () => {
    const doc = (await sql("SELECT id FROM fiscal_documentos WHERE tenant_id=$1 AND numero='001-002-01-00004568'", A))[0].id;
    await como(u.contadorA).post(`/contabilidad/documentos/${doc}/correccion`, { importeGravadoGeneral: 400, isvGeneral: 60 }).expect(400); // sin motivo
    const corregido = await como(u.contadorA).post(`/contabilidad/documentos/${doc}/correccion`, { isvGeneral: 60, motivo: 'ISV mal digitado' }).expect(201);
    expect(corregido.body).toMatchObject({ isvGeneral: '60.00', total: '460.00' });
    const [ajuste] = await sql("SELECT anterior, nuevo, motivo FROM fiscal_ajustes WHERE tenant_id=$1 AND entidad='DOCUMENTO' AND accion='CORREGIR'", A);
    expect(ajuste).toMatchObject({ motivo: 'ISV mal digitado', anterior: expect.objectContaining({ isvGeneral: '59.00' }), nuevo: expect.objectContaining({ isvGeneral: '60.00' }) });
    await expect(sql("UPDATE fiscal_ajustes SET motivo='borrado' WHERE tenant_id=$1", A)).rejects.toThrow(/solo inserción/);
    await expect(sql("DELETE FROM fiscal_documentos WHERE id=$1", doc)).rejects.toThrow(/no se eliminan/);
    // La factura con retención vigente no se anula hasta anular la retención.
    await como(u.contadorA).post(`/contabilidad/documentos/${facturaId}/anular`, { motivo: 'Error de emisión' }).expect(409);
    const historial = (await como(u.contadorA).get(`/contabilidad/ajustes?${periodo}`).expect(200)).body;
    expect(historial.some((a: any) => a.accion === 'CORREGIR' && a.usuario === 'Usuario CONTADOR')).toBe(true);
  });

  it('partida doble: cuadre obligatorio (servicio y base de datos), reversión y balanza', async () => {
    const caja = (await como(u.contadorA).post('/contabilidad/cuentas', { codigo: '1', nombre: 'Activo', tipo: 'ACTIVO', naturaleza: 'DEUDORA' }).expect(201)).body;
    const efectivo = (await como(u.contadorA).post('/contabilidad/cuentas', { codigo: '1.1', nombre: 'Efectivo', tipo: 'ACTIVO', naturaleza: 'DEUDORA', padreId: caja.id }).expect(201)).body;
    const ingresos = (await como(u.contadorA).post('/contabilidad/cuentas', { codigo: '4', nombre: 'Ingresos', tipo: 'INGRESO', naturaleza: 'ACREEDORA' }).expect(201)).body;
    await como(u.contadorA).post('/contabilidad/cuentas', { codigo: '2.1', nombre: 'Mal', tipo: 'PASIVO', naturaleza: 'ACREEDORA', padreId: caja.id }).expect(400);
    await como(u.contadorA).post('/contabilidad/asientos', { fecha: '2026-09-30', concepto: 'Descuadrado', lineas: [{ cuentaId: efectivo.id, debe: 100 }, { cuentaId: ingresos.id, haber: 99.99 }] }).expect(400);
    await como(u.contadorA).post('/contabilidad/asientos', { fecha: '2026-09-30', concepto: 'Cuenta de grupo', lineas: [{ cuentaId: caja.id, debe: 100 }, { cuentaId: ingresos.id, haber: 100 }] }).expect(400);
    const asiento = (await como(u.contadorA).post('/contabilidad/asientos', { fecha: '2026-09-30', concepto: 'Ventas de contado', lineas: [{ cuentaId: efectivo.id, debe: 1150 }, { cuentaId: ingresos.id, haber: 1150 }] }).expect(201)).body;
    expect(asiento.numero).toBe(1);
    // El disparador diferido rechaza un asiento de una sola línea aunque se escriba por SQL.
    await expect(prisma.$transaction(async tx => {
      const id = randomUUID();
      await tx.$executeRawUnsafe("INSERT INTO contable_asientos (id,tenant_id,numero,fecha,concepto,creado_por) VALUES ($1,$2,99,'2026-09-30','Directo',$3)", id, A, u.adminA);
      await tx.$executeRawUnsafe('INSERT INTO contable_asiento_lineas (id,tenant_id,asiento_id,cuenta_id,debe,haber) VALUES ($1,$2,$3,$4,10,0)', randomUUID(), A, id, efectivo.id);
    })).rejects.toThrow(/no cuadra/);
    await expect(sql('UPDATE contable_asiento_lineas SET debe=1 WHERE tenant_id=$1', A)).rejects.toThrow(/solo inserción/);
    const rev = (await como(u.contadorA).post(`/contabilidad/asientos/${asiento.id}/revertir`, { fecha: '2026-09-30', motivo: 'Registrado en cuenta equivocada' }).expect(201)).body;
    expect(rev.reversion.numero).toBe(2);
    await como(u.contadorA).post(`/contabilidad/asientos/${asiento.id}/revertir`, { fecha: '2026-09-30', motivo: 'De nuevo' }).expect(409);
    const balanza = (await como(u.contadorA).get(`/contabilidad/balanza?${periodo}`).expect(200)).body;
    expect(balanza.totales).toEqual({ debe: '2300.00', haber: '2300.00', cuadra: true });
    expect(balanza.cuentas.find((k: any) => k.codigo === '1.1').saldo).toBe('0.00');
    // Otra empresa no puede usar cuentas de A.
    await sql("INSERT INTO tenant_modules (id,tenant_id,module_key,enabled,updated_at) VALUES ($1,$2,'contabilidad',true,NOW()) ON CONFLICT (tenant_id,module_key) DO UPDATE SET enabled=true", randomUUID(), B);
    await como(u.contadorB).post('/contabilidad/asientos', { fecha: '2026-09-30', concepto: 'Ajeno', lineas: [{ cuentaId: efectivo.id, debe: 1 }, { cuentaId: ingresos.id, haber: 1 }] }).expect(404);
  });

  it('exportaciones CSV, Excel y PDF autorizadas en el servidor', async () => {
    const csv = await como(u.contadorA).get(`/contabilidad/exportar/ventas?${periodo}&formato=csv`).expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.headers['content-disposition']).toContain('ventas-2026-09.csv');
    expect(csv.text).toContain('000-001-01-00000001');
    const xlsx = await como(u.contadorA).get(`/contabilidad/exportar/compras?${periodo}&formato=xlsx`).buffer(true).parse((res, cb) => { const p: Buffer[] = []; res.on('data', (d: Buffer) => p.push(d)); res.on('end', () => cb(null, Buffer.concat(p))); }).expect(200);
    expect((xlsx.body as Buffer).subarray(0, 2).toString()).toBe('PK');
    const pdf = await como(u.adminA).get(`/contabilidad/exportar/conciliacion?${periodo}&formato=pdf`).buffer(true).parse((res, cb) => { const p: Buffer[] = []; res.on('data', (d: Buffer) => p.push(d)); res.on('end', () => cb(null, Buffer.concat(p))); }).expect(200);
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    await como(u.contadorA).get(`/contabilidad/exportar/ventas?${periodo}&formato=doc`).expect(400);
    await como(u.cajeroA).get(`/contabilidad/exportar/ventas?${periodo}&formato=csv`).expect(403);
  });

  it('cierre de período: congela registros, detecta cambios posteriores y solo ADMIN reabre', async () => {
    await como(u.contadorA).post('/contabilidad/periodos/2026/10/cerrar', { motivo: 'Mes en curso' }).expect(409);
    const cierre = (await como(u.contadorA).post('/contabilidad/periodos/2026/9/cerrar', { motivo: 'Cierre mensual' }).expect(201)).body;
    expect(cierre.huella).toMatch(/^[0-9a-f]{64}$/);
    await como(u.contadorA).post('/contabilidad/documentos', { direccion: 'EMITIDO', tipoDocumento: '01', numero: '000-001-01-00000010', fechaEmision: '2026-09-25', nombreContraparte: 'Tarde', importeGravadoGeneral: 10, isvGeneral: 1.5 }).expect(409);
    await como(u.contadorA).post('/contabilidad/asientos', { fecha: '2026-09-15', concepto: 'Tarde', lineas: [] }).expect(400);
    expect((await como(u.contadorA).get(`/contabilidad/conciliacion?${periodo}`).expect(200)).body.porCodigo.LIBRO_CAMBIO_TRAS_CIERRE).toBeUndefined();
    // Un cambio en la operación (anulación de una venta) después del cierre se detecta por la huella.
    await sql("UPDATE ventas SET estado='ANULADA' WHERE id=$1", venta.sinDoc);
    const conc = (await como(u.contadorA).get(`/contabilidad/conciliacion?${periodo}`).expect(200)).body;
    expect(conc.porCodigo.LIBRO_CAMBIO_TRAS_CIERRE).toBe(1);
    await como(u.contadorA).post('/contabilidad/periodos/2026/9/reabrir', { motivo: 'Corrección' }).expect(403);
    await como(u.adminA).post('/contabilidad/periodos/2026/9/reabrir', { motivo: 'Venta anulada tras el cierre' }).expect(201);
    const periodos = (await como(u.contadorA).get('/contabilidad/periodos?anio=2026').expect(200)).body;
    expect(periodos[8].estado).toBe('ABIERTO');
    const acciones = await sql("SELECT accion FROM fiscal_ajustes WHERE tenant_id=$1 AND entidad='PERIODO' ORDER BY created_at", A);
    expect(acciones.map(a => a.accion)).toEqual(['CERRAR', 'REABRIR']);
  });

  it('el CONTADOR no modifica ventas, cobros, inventario ni caja (rutas y servicios)', async () => {
    const c = como(u.contadorA);
    await c.post('/ventas', {}).expect(403);
    await c.post('/operaciones/caja/abrir', { montoApertura: 0 }).expect(403);
    await c.post(`/operaciones/caja/${randomUUID()}/movimientos`, {}).expect(403);
    await c.post(`/operaciones/cuentas/${randomUUID()}/pagos`, {}).expect(403);
    await c.post(`/operaciones/productos/${randomUUID()}/ajuste`, {}).expect(403);
    await c.post(`/operaciones/ventas/${venta.completa}/devoluciones`, {}).expect(403);
    await c.post('/operaciones/compras', {}).expect(403);
    await c.post('/productos', {}).expect(403);
    await c.put(`/productos/${randomUUID()}`, {}).expect(403);
    await c.post(`/clientes/${randomUUID()}/abonos`, {}).expect(403);
    await c.get('/operaciones/caja').expect(403);
    await c.get('/ventas').expect(403);
    // Defensa en profundidad: el servicio también rechaza el rol aunque se invoque sin pasar por la ruta.
    const ops = app.get(OperacionesService);
    await expect(ops.abrir(A, u.contadorA, { montoApertura: 0 } as any)).rejects.toThrow(/rol/i);
    await expect(ops.pagar(A, u.contadorA, randomUUID(), { solicitudId: randomUUID(), monto: 1, metodo: 'EFECTIVO' } as any)).rejects.toThrow(/rol/i);
    await expect(ops.ajustar(A, u.contadorA, randomUUID(), { cantidad: 1, motivo: 'x' } as any)).rejects.toThrow(/rol|permiso/i);
    const [{ n }] = await sql('SELECT count(*)::int AS n FROM cajas WHERE tenant_id=$1', A);
    expect(n).toBe(0);
  });
});
