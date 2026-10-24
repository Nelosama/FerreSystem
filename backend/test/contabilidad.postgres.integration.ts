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
import { UsuariosController } from '../src/usuarios/usuarios.controller';
import { UsuariosService } from '../src/usuarios/usuarios.service';
import { EntregasController } from '../src/entregas/entregas.controller';
import { EntregasService } from '../src/entregas/entregas.service';
import { leerZipXlsx, nombresHojas, celda, textosHoja } from './helpers/xlsx-lector';

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
      controllers: [ContabilidadController, VentasController, OperacionesController, ProductosController, ClientesController, UsuariosController, EntregasController],
      providers: [
        ContabilidadService, VentasService, OperacionesService, ProductosService, ClientesService, UsuariosService, EntregasService,
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
    expect(balanza.totales).toEqual({ debe: 2300, haber: 2300, cuadra: true });
    expect(balanza.cuentas.find((k: any) => k.codigo === '1.1').saldo).toBe(0);
    // Otra empresa no puede usar cuentas de A.
    await sql("INSERT INTO tenant_modules (id,tenant_id,module_key,enabled,updated_at) VALUES ($1,$2,'contabilidad',true,NOW()) ON CONFLICT (tenant_id,module_key) DO UPDATE SET enabled=true", randomUUID(), B);
    await como(u.contadorB).post('/contabilidad/asientos', { fecha: '2026-09-30', concepto: 'Ajeno', lineas: [{ cuentaId: efectivo.id, debe: 1 }, { cuentaId: ingresos.id, haber: 1 }] }).expect(404);
  });

  it('libro mayor: saldo inicial, saldo acumulado por naturaleza, reversión, aislamiento y permisos', async () => {
    const cuentas = (await como(u.contadorA).get('/contabilidad/cuentas').expect(200)).body;
    const efectivo = cuentas.find((k: any) => k.codigo === '1.1'), ingresos = cuentas.find((k: any) => k.codigo === '4');
    // Movimiento de octubre: el saldo inicial de octubre debe ser el acumulado de septiembre; septiembre ya quedó en cero por la reversión.
    const oct = (await como(u.contadorA).post('/contabilidad/asientos', { fecha: '2026-10-05', concepto: 'Ventas de octubre', lineas: [{ cuentaId: efectivo.id, debe: 500 }, { cuentaId: ingresos.id, haber: 500 }] }).expect(201)).body;
    expect(oct.numero).toBeGreaterThan(2);
    const sep = (await como(u.contadorA).get(`/contabilidad/mayor?cuentaId=${efectivo.id}&${periodo}`).expect(200)).body;
    expect(sep.cuenta).toMatchObject({ codigo: '1.1', naturaleza: 'DEUDORA' });
    expect(sep.saldoInicial).toBe(0);
    expect(sep.movimientos.map((m: any) => [m.debe, m.haber, m.saldo])).toEqual([[1150, 0, 1150], [0, 1150, 0]]);
    expect(sep.totales).toEqual({ debe: 1150, haber: 1150 });
    expect(sep.saldoFinal).toBe(0);
    const octubre = (await como(u.contadorA).get(`/contabilidad/mayor?cuentaId=${efectivo.id}&anio=2026&mes=10`).expect(200)).body;
    expect(octubre.saldoInicial).toBe(0);
    expect(octubre.movimientos.map((m: any) => m.saldo)).toEqual([500]);
    // Cuenta acreedora: el saldo crece con el haber.
    const ing = (await como(u.contadorA).get(`/contabilidad/mayor?cuentaId=${ingresos.id}&anio=2026&mes=10`).expect(200)).body;
    expect(ing.saldoInicial).toBe(0);
    expect(ing.movimientos.map((m: any) => m.saldo)).toEqual([500]);
    const nov = (await como(u.contadorA).get(`/contabilidad/mayor?cuentaId=${efectivo.id}&anio=2026&mes=11`).expect(200)).body;
    expect(nov).toMatchObject({ saldoInicial: 500, movimientos: [], saldoFinal: 500 });
    // La balanza de noviembre arrastra el mismo saldo inicial.
    const bal = (await como(u.contadorA).get('/contabilidad/balanza?anio=2026&mes=11').expect(200)).body;
    expect(bal.cuentas.find((k: any) => k.codigo === '1.1')).toMatchObject({ saldoInicial: 500, debePeriodo: 0, haberPeriodo: 0, saldo: 500 });
    // Exportación Excel del mayor: exige la cuenta y respeta empresa y permisos.
    await como(u.contadorA).get(`/contabilidad/exportar/mayor?${periodo}&formato=xlsx`).expect(400);
    await descargar(`/contabilidad/exportar/mayor?${periodo}&formato=xlsx&cuentaId=${efectivo.id}`, u.contadorA).expect(200);
    // Aislamiento: ni la cuenta ni el mayor de A son visibles para B; sin módulo o con otro rol, no hay acceso.
    await como(u.contadorB).get(`/contabilidad/mayor?cuentaId=${efectivo.id}&${periodo}`).expect(404);
    await como(u.cajeroA).get(`/contabilidad/mayor?cuentaId=${efectivo.id}&${periodo}`).expect(403);
    await como(u.contadorA).get(`/contabilidad/mayor?cuentaId=${efectivo.id}&anio=2026`).expect(400);
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
    await c.post(`/operaciones/caja/${randomUUID()}/cerrar`, { monto: 0 }).expect(403);
    await c.post(`/operaciones/ventas/${venta.completa}/entregar`, {}).expect(403);
    await c.post(`/entregas/ventas/${venta.completa}/entregas`, {}).expect(403);
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

  // ---------- Excel, rol CONTADOR administrado por ADMIN y aislamiento de exportaciones ----------
  const descargar = (ruta: string, usuario: string) => request(app.getHttpServer()).get(ruta).set('x-prueba-usuario', usuario).buffer(true).parse((res, cb) => {
    const partes: Buffer[] = [];
    res.on('data', (d: Buffer) => partes.push(d));
    res.on('end', () => cb(null, Buffer.concat(partes)));
  });

  it('el ADMIN crea usuarios CONTADOR de su empresa; el CONTADOR no administra usuarios', async () => {
    const nuevo = await como(u.adminA).post('/usuarios', { nombre: 'Contador Nuevo', email: 'contador.nuevo@example.invalid', rol: 'CONTADOR' }).expect(201);
    expect(nuevo.body).toMatchObject({ rol: 'CONTADOR', permisos: ['contabilidad.ver'], permisosConfigurados: true });
    // Mínimo privilegio: el nuevo contador solo consulta; registrar, configurar o cerrar exigen concesión.
    tenantDe[nuevo.body.id] = A; rolDe[nuevo.body.id] = 'CONTADOR';
    permisosDe[nuevo.body.id] = { permisos: ['contabilidad.ver'], permisosConfigurados: true };
    await como(nuevo.body.id).get('/contabilidad/configuracion').expect(200);
    await como(nuevo.body.id).put('/contabilidad/configuracion', { razonSocial: 'X', agenteRetencion: false, motivo: 'intento' }).expect(403);
    await como(nuevo.body.id).post('/contabilidad/periodos/2026/9/cerrar', { motivo: 'intento' }).expect(403);
    await como(u.contadorA).post('/usuarios', { nombre: 'Otro', email: 'otro@example.invalid', rol: 'CONTADOR' }).expect(403);
    await como(u.cajeroA).post('/usuarios', { nombre: 'Otro', email: 'otro2@example.invalid', rol: 'CONTADOR' }).expect(403);
    // Un CONTADOR de la empresa B no aparece en la lista de la empresa A.
    const lista = await como(u.adminA).get('/usuarios').expect(200);
    expect(lista.body.some((x: any) => x.id === u.adminB)).toBe(false);
  });

  it('exportación Excel por defecto con nombre de archivo y cabeceras para navegadores de otro origen', async () => {
    const res = await descargar(`/contabilidad/exportar/ventas?${periodo}`, u.contadorA).expect(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(res.headers['content-disposition']).toContain('ventas-2026-09.xlsx');
    expect(res.headers['access-control-expose-headers']).toBe('Content-Disposition');
    const archivos = leerZipXlsx(res.body as Buffer);
    expect(nombresHojas(archivos)).toEqual(['Ventas']);
    expect(textosHoja(archivos, 1).some(t => t === 'Empresa: Ferretería A')).toBe(true);
    expect(textosHoja(archivos, 1).some(t => t === 'RTN: 08012000000001')).toBe(true);
  });

  it('libro contable del mes: un archivo con hojas separadas, en el orden del contador', async () => {
    const res = await descargar(`/contabilidad/exportar/mensual?${periodo}&formato=xlsx`, u.contadorA).expect(200);
    expect(res.headers['content-disposition']).toContain('libro-contable-2026-09.xlsx');
    const archivos = leerZipXlsx(res.body as Buffer);
    expect(nombresHojas(archivos)).toEqual(['Resumen general', 'Ventas', 'Compras', 'ISV', 'Retenciones', 'Documentos emitidos', 'Documentos recibidos', 'Conciliación', 'Hallazgos', 'Libro diario', 'Balanza de comprobación']);
    // El resumen indica expresamente lo que falta y no inventa valores.
    const resumen = textosHoja(archivos, 1);
    expect(resumen.some(t => t.startsWith('Razón social:'))).toBe(true);
    expect(resumen.some(t => t === 'Reglas de retención registradas')).toBe(true);
    expect(resumen.some(t => t.includes('Lo siguiente falta'))).toBe(true);
  });

  it('las cifras del Excel coinciden con los libros de la pantalla (totales con fórmula)', async () => {
    const libroPantalla = (await como(u.contadorA).get(`/contabilidad/libros/ventas?${periodo}`).expect(200)).body;
    const xlsx = leerZipXlsx((await descargar(`/contabilidad/exportar/ventas?${periodo}`, u.contadorA).expect(200)).body as Buffer);
    const etiqueta = textosHoja(xlsx, 1).findIndex(t => t.startsWith('Total del libro'));
    expect(etiqueta).toBeGreaterThanOrEqual(0);
    // Columna del total con IVA (O) en la fila de totales: fórmula SUMPRODUCT con el valor calculado por el servidor.
    const filaTotales = [...xlsx['xl/worksheets/sheet1.xml'].matchAll(/<row r="(\d+)"><c r="A\1" s="9"/g)].map(m => Number(m[1]))[0];
    const total = celda(xlsx, 1, `O${filaTotales}`);
    expect(total?.formula).toContain('SUMPRODUCT');
    expect(total?.numero).toBeCloseTo(Number(libroPantalla.totales.total), 2);
    const isvCelda = celda(xlsx, 1, `M${filaTotales}`);
    expect(isvCelda?.numero).toBeCloseTo(Number(libroPantalla.totales.isvGeneral) + Number(libroPantalla.totales.isvEspecial), 2);
  });

  it('nota de crédito y anulados: el Excel aplica el signo como la pantalla', async () => {
    const xlsx = leerZipXlsx((await descargar(`/contabilidad/exportar/documentos?${periodo}&direccion=EMITIDO`, u.contadorA).expect(200)).body as Buffer);
    const textos = textosHoja(xlsx, 1);
    expect(textos).toContain('000-001-06-00000001');
    // La fila de la nota de crédito tiene efecto −1 en el libro.
    const filaNota = [...xlsx['xl/worksheets/sheet1.xml'].matchAll(/<row r="(\d+)">(.*?)<\/row>/g)].find(m => m[2].includes('000-001-06-00000001'))!;
    const efecto = /<c r="O\d+"[^>]*><v>(-?\d+)<\/v>/.exec(filaNota[2]);
    expect(efecto?.[1]).toBe('-1');
  });

  it('descarga en CSV y PDF desde los mismos datos; documentos exigen emitidos o recibidos', async () => {
    const csv = await descargar(`/contabilidad/exportar/compras?${periodo}&formato=csv`, u.contadorA).expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.body.toString('utf8')).toContain('RTN: 08012000000001');
    const pdf = await descargar(`/contabilidad/exportar/conciliacion?${periodo}&formato=pdf`, u.adminA).expect(200);
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    await como(u.contadorA).get(`/contabilidad/exportar/documentos?${periodo}&formato=csv`).expect(400);
    await como(u.contadorA).get(`/contabilidad/exportar/mensual?${periodo}&formato=pdf`).expect(400);
    await como(u.contadorA).get(`/contabilidad/exportar/ventas?${periodo}&formato=doc`).expect(400);
    await como(u.contadorA).get(`/contabilidad/exportar/inventado?${periodo}`).expect(400);
  });

  it('datos vacíos y empresa sin configuración fiscal: se indica, sin ceros inventados', async () => {
    // La empresa B no registró datos fiscales ni documentos en el período.
    await sql("INSERT INTO tenant_modules (id,tenant_id,module_key,enabled,updated_at) VALUES ($1,$2,'contabilidad',true,NOW()) ON CONFLICT (tenant_id,module_key) DO UPDATE SET enabled=true", randomUUID(), B);
    const xlsx = leerZipXlsx((await descargar(`/contabilidad/exportar/mensual?anio=2019&mes=3`, u.contadorB).expect(200)).body as Buffer);
    const resumen = textosHoja(xlsx, 1);
    expect(resumen).toContain('RTN: NO REGISTRADO (complete los datos fiscales de la empresa)');
    expect(resumen.some(t => t === 'Tasa general de ISV vigente en el período')).toBe(true);
    expect(resumen).toContain('NO CONFIGURADA');
    expect(resumen).toContain('NO CONFIGURADO');
    expect(resumen).toContain('NO REGISTRADAS');
    expect(resumen.some(t => t.startsWith('No hay registros en el período'))).toBe(false);
    // El RTN ausente no se sustituye por cero ni por texto vacío.
    const filaRtn = [...xlsx['xl/worksheets/sheet1.xml'].matchAll(/<row r="(\d+)">(.*?)<\/row>/g)].find(m => m[2].includes('>RTN de la empresa<'));
    expect(filaRtn).toBeTruthy();
    expect(filaRtn![2]).toContain('NO REGISTRADO');
  });

  it('aislamiento: el libro de una empresa nunca incluye datos de otra', async () => {
    const xlsxA = leerZipXlsx((await descargar(`/contabilidad/exportar/mensual?${periodo}`, u.contadorA).expect(200)).body as Buffer);
    const xlsxB = leerZipXlsx((await descargar(`/contabilidad/exportar/mensual?${periodo}`, u.contadorB).expect(200)).body as Buffer);
    const todoA = Object.values(xlsxA).join('\n');
    const todoB = Object.values(xlsxB).join('\n');
    expect(todoA).toContain('Ferretería A');
    expect(todoA).not.toContain('Ferretería B');
    expect(todoB).toContain('Ferretería B');
    expect(todoB).not.toContain('Ferretería A');
    expect(todoB).not.toContain('08012000000001');
    expect(todoB).not.toContain('000-001-01-00000001');
    expect(todoB).not.toContain('Distribuidora Uno');
  });

  it('las descargas no alteran la información contable', async () => {
    const contar = async () => (await sql(`SELECT
      (SELECT count(*) FROM fiscal_documentos WHERE tenant_id=$1)::int AS documentos,
      (SELECT count(*) FROM fiscal_retenciones WHERE tenant_id=$1)::int AS retenciones,
      (SELECT count(*) FROM fiscal_ajustes WHERE tenant_id=$1)::int AS ajustes,
      (SELECT count(*) FROM contable_asientos WHERE tenant_id=$1)::int AS asientos,
      (SELECT count(*) FROM contable_asiento_lineas WHERE tenant_id=$1)::int AS lineas,
      (SELECT count(*) FROM ventas WHERE tenant_id=$1)::int AS ventas,
      (SELECT COALESCE(sum(total),0)::text FROM ventas WHERE tenant_id=$1) AS total_ventas,
      (SELECT COALESCE(sum(total),0)::text FROM fiscal_documentos WHERE tenant_id=$1) AS total_documentos`, A))[0];
    const antes = await contar();
    for (const r of ['ventas', 'compras', 'isv', 'retenciones', 'documentos', 'conciliacion', 'diario', 'balanza', 'periodos', 'ajustes', 'catalogo', 'mensual']) {
      await descargar(`/contabilidad/exportar/${r}?${periodo}&direccion=EMITIDO`, u.contadorA).expect(200);
    }
    expect(await contar()).toEqual(antes);
    // Cada descarga deja rastro de quién la hizo (bitácora de solo lectura del negocio).
    const rastros = await sql("SELECT count(*)::int AS n FROM auditoria_operaciones WHERE tenant_id=$1 AND operacion='CONTABILIDAD_EXPORTACION'", A);
    expect(rastros[0].n).toBeGreaterThanOrEqual(12);
  });

  it('inyección de fórmulas con datos reales: un nombre que empieza por = queda como texto', async () => {
    const doc = await como(u.contadorA).post('/contabilidad/documentos', { direccion: 'RECIBIDO', tipoDocumento: '01', numero: '002-002-01-00000001', cai: 'PROV-CAI-XYZ', fechaEmision: '2026-09-06', rtnContraparte: '08019000000001', nombreContraparte: '=HYPERLINK("http://malicioso.example")', importeGravadoGeneral: 100, isvGeneral: 15 }).expect(201);
    expect(doc.body.id).toBeTruthy();
    const xlsx = leerZipXlsx((await descargar(`/contabilidad/exportar/documentos?${periodo}&direccion=RECIBIDO`, u.contadorA).expect(200)).body as Buffer);
    const hojaXml = xlsx['xl/worksheets/sheet1.xml'];
    expect(hojaXml).not.toMatch(/<f>HYPERLINK/);
    expect(textosHoja(xlsx, 1)).toContain(`'=HYPERLINK("http://malicioso.example")`);
    const csv = await descargar(`/contabilidad/exportar/documentos?${periodo}&direccion=RECIBIDO&formato=csv`, u.contadorA).expect(200);
    expect(csv.body.toString('utf8')).toContain(`'=HYPERLINK`);
  });

  it('el CONTADOR sin permiso de consulta no descarga información contable', async () => {
    const sinPermiso = 'contador-sin-permiso';
    tenantDe[sinPermiso] = A; rolDe[sinPermiso] = 'CONTADOR'; permisosDe[sinPermiso] = { permisos: [], permisosConfigurados: true };
    await como(sinPermiso).get(`/contabilidad/exportar/ventas?${periodo}`).expect(403);
  });
  describe('Auditoría contable: correcciones y jornada operativa', () => {
    // Cada escenario tiene su propia empresa: no depende de los saldos del recorrido anterior.
    const empresa = async () => {
      const tenant = randomUUID(), contador = randomUUID(), admin = randomUUID();
      await sql('INSERT INTO tenants (id,nombre_comercial,updated_at) VALUES ($1,$2,NOW())', tenant, 'Ferretería auditoría');
      for (const [usuario, rol] of [[contador, 'CONTADOR'], [admin, 'ADMIN']]) {
        tenantDe[usuario] = tenant; rolDe[usuario] = rol;
        await sql('INSERT INTO usuarios (id,tenant_id,nombre,email,password_hash,rol,updated_at) VALUES ($1,$2,$3,$4,$5,$6::"Rol",NOW())', usuario, tenant, rol, `${usuario}@example.invalid`, 'x', rol);
      }
      await sql("INSERT INTO tenant_modules (id,tenant_id,module_key,enabled,updated_at) VALUES ($1,$2,'contabilidad',true,NOW())", randomUUID(), tenant);
      await como(contador).post('/contabilidad/tasas', { categoria: 'GENERAL', porcentaje: 15, vigenteDesde: '2026-01-01', baseLegal: 'Tasa de prueba; no acredita normativa' }).expect(201);
      for (const tipo of ['01', '06']) await como(contador).post('/contabilidad/cai', { cai: `CAI-PRUEBA-${tipo}`, tipoDocumento: tipo, establecimiento: '000', puntoEmision: '001', rangoInicial: 1, rangoFinal: 999, fechaLimiteEmision: '2026-12-31' }).expect(201);
      return { tenant, contador, admin };
    };
    const importes = (base: number) => ({ importeGravadoGeneral: base, isvGeneral: base * 0.15 });

    it.each(['EMITIDO', 'RECIBIDO'])('corregir notas %s respeta el límite acumulado, con rollback y aislamiento', async direccion => {
      const { tenant, contador } = await empresa();
      const documento = async (tipo: string, numero: number, base: number, referencia?: string) =>
        (await como(contador).post('/contabilidad/documentos', { direccion, tipoDocumento: tipo, numero: `000-001-${tipo}-${String(numero).padStart(8, '0')}`, fechaEmision: '2026-09-15', rtnContraparte: '08011990123456', nombreContraparte: 'Contraparte', ...importes(base), documentoReferenciaId: referencia }).expect(201)).body;
      const factura = await documento('01', 1, 1000);
      const nota = await documento('06', 1, 100, factura.id);
      await documento('06', 2, 800, factura.id);
      const antes = await sql('SELECT id,total FROM fiscal_documentos WHERE tenant_id=$1 ORDER BY id', tenant);
      const ajustes = (await sql('SELECT count(*)::int AS n FROM fiscal_ajustes WHERE tenant_id=$1', tenant))[0].n;
      // 800 + 300 excedería la factura de 1000; el alta ya lo rechazaba, la corrección también debe hacerlo.
      await como(contador).post(`/contabilidad/documentos/${nota.id}/correccion`, { ...importes(300), motivo: 'Intento que excede el documento' }).expect(400);
      expect(await sql('SELECT id,total FROM fiscal_documentos WHERE tenant_id=$1 ORDER BY id', tenant)).toEqual(antes);
      expect((await sql('SELECT count(*)::int AS n FROM fiscal_ajustes WHERE tenant_id=$1', tenant))[0].n).toBe(ajustes);
      // Tampoco se puede reducir la factura por debajo de sus notas vigentes.
      await como(contador).post(`/contabilidad/documentos/${factura.id}/correccion`, { ...importes(500), motivo: 'Reducir sin ajustar las notas' }).expect(400);
      await como(u.contadorB).post(`/contabilidad/documentos/${nota.id}/correccion`, { ...importes(200), motivo: 'Intento de otra empresa' }).expect(404);
      // Al excluir la propia nota del acumulado, sí permite completar exactamente el límite.
      await como(contador).post(`/contabilidad/documentos/${nota.id}/correccion`, { ...importes(200), motivo: 'Completar el límite del documento' }).expect(201);
      const [otraNota] = await sql("SELECT id FROM fiscal_documentos WHERE tenant_id=$1 AND tipo_documento='06' AND id<>$2", tenant, nota.id);
      await como(contador).post(`/contabilidad/documentos/${otraNota.id}/anular`, { motivo: 'Anular nota registrada por error' }).expect(201);
      await como(contador).post(`/contabilidad/documentos/${nota.id}/correccion`, { ...importes(1000), motivo: 'Las notas anuladas no consumen el límite' }).expect(201);
    });

    it('una nota parcial no concilia dos devoluciones y una nota del mes siguiente no sanea el cierre anterior', async () => {
      const { tenant, contador, admin } = await empresa();
      const ventaId = randomUUID();
      await sql("INSERT INTO ventas (id,tenant_id,numero_venta,usuario_id,subtotal,isv,total,estado,created_at) VALUES ($1,$2,1,$3,1000,150,1150,'COMPLETADA','2026-09-10 12:00:00')", ventaId, tenant, admin);
      for (const [monto, fecha] of [[115, '2026-09-15'], [230, '2026-09-20']] as const) {
        await sql("INSERT INTO devoluciones (id,tenant_id,venta_id,usuario_id,solicitud_hash,motivo,monto,credito_cancelado,reembolso,metodo,created_at) VALUES ($1,$2,$3,$4,$5,'Prueba de cobertura',$6,0,$6,'EFECTIVO',$7::timestamp)", randomUUID(), tenant, ventaId, admin, randomUUID(), monto, `${fecha} 12:00:00`);
      }
      const factura = (await como(contador).post('/contabilidad/documentos', { direccion: 'EMITIDO', tipoDocumento: '01', numero: '000-001-01-00000001', fechaEmision: '2026-09-10', ventaId }).expect(201)).body;
      const nota = (n: number, base: number, fecha: string) => como(contador).post('/contabilidad/documentos', { direccion: 'EMITIDO', tipoDocumento: '06', numero: `000-001-06-${String(n).padStart(8, '0')}`, fechaEmision: fecha, documentoReferenciaId: factura.id, ...importes(base) }).expect(201);
      await nota(1, 100, '2026-09-15');
      const libro = async () => (await como(contador).get('/contabilidad/libros/ventas?anio=2026&mes=9').expect(200)).body;
      expect((await libro()).devoluciones.every((d: any) => d.hallazgos.includes('DEVOLUCION_SIN_NOTA_CREDITO'))).toBe(true);
      await como(contador).post('/contabilidad/periodos/2026/9/cerrar', { motivo: 'Cierre de trabajo con pendientes' }).expect(201);
      await nota(2, 200, '2026-10-01');
      expect((await libro()).devoluciones.every((d: any) => d.hallazgos.includes('DEVOLUCION_SIN_NOTA_CREDITO'))).toBe(true);
      const conc = (await como(contador).get('/contabilidad/conciliacion?anio=2026&mes=9').expect(200)).body;
      expect(conc.porCodigo.LIBRO_CAMBIO_TRAS_CIERRE).toBeUndefined();
      // Corrección legítima en período abierto: la cobertura total de septiembre queda en 345.
      await como(admin).post('/contabilidad/periodos/2026/9/reabrir', { motivo: 'Corregir fecha de la nota real' }).expect(201);
      const notas = (await como(contador).get('/contabilidad/documentos?anio=2026&mes=10').expect(200)).body;
      await como(contador).post(`/contabilidad/documentos/${notas[0].id}/correccion`, { fechaEmision: '2026-09-20', motivo: 'Corregir fecha de la nota real' }).expect(201);
      expect((await libro()).devoluciones.every((d: any) => d.hallazgos.length === 0)).toBe(true);
    });

    it('rechaza importes fuera de DECIMAL(14,2) y sumas inseguras con 400, sin escrituras parciales', async () => {
      const { tenant, contador } = await empresa();
      const cuenta = async (codigo: string) => (await como(contador).post('/contabilidad/cuentas', { codigo, nombre: `Cuenta ${codigo}`, tipo: 'ACTIVO', naturaleza: 'DEUDORA' }).expect(201)).body.id;
      const debe = await cuenta('1'), haber = await cuenta('2');
      await como(contador).post('/contabilidad/documentos', { direccion: 'RECIBIDO', tipoDocumento: '01', numero: '000-001-01-00000001', fechaEmision: '2026-09-01', rtnContraparte: '08011990123456', importeExento: 1000000000000 }).expect(400);
      await como(contador).post('/contabilidad/documentos', { direccion: 'RECIBIDO', tipoDocumento: '01', numero: '000-001-01-00000001', fechaEmision: '2026-09-01', rtnContraparte: '08011990123456', importeExento: 999999999999.99, importeExonerado: 0.01 }).expect(400);
      for (const monto of [1.005, 1000000000000]) await como(contador).post('/contabilidad/asientos', { fecha: '2026-09-01', concepto: 'Importe inválido', lineas: [{ cuentaId: debe, debe: monto }, { cuentaId: haber, haber: monto }] }).expect(400);
      const lineas = Array.from({ length: 92 }, () => [{ cuentaId: debe, debe: 999999999999.99 }, { cuentaId: haber, haber: 999999999999.99 }]).flat();
      await como(contador).post('/contabilidad/asientos', { fecha: '2026-09-01', concepto: 'Suma fuera del rango exacto', lineas }).expect(400);
      expect((await sql('SELECT count(*)::int AS n FROM contable_asientos WHERE tenant_id=$1', tenant))[0].n).toBe(0);
      expect((await sql('SELECT count(*)::int AS n FROM fiscal_documentos WHERE tenant_id=$1', tenant))[0].n).toBe(0);
    });
    it('jornada real: ventas, compras, abonos y pagos se concilian manualmente sin volver a mover auxiliares', async () => {
      const { tenant, contador, admin } = await empresa();
      const producto = await prisma.producto.create({ data: { tenantId: tenant, codigo: 'AUD-01', nombre: 'Tornillo auditoría', precioCosto: 50, precioVenta: 100, stockActual: 0, precioAprobado: true } });
      const cliente = await prisma.cliente.create({ data: { tenantId: tenant, nombre: 'Cliente con crédito', creditoHabilitado: true, limiteCredito: 1000, saldoPendiente: 0 } });
      const proveedor = await prisma.proveedor.create({ data: { tenantId: tenant, nombre: 'Proveedor auditoría', rtn: '08019000000001' } });
      await como(admin).post('/operaciones/caja/abrir', { solicitudId: randomUUID(), monto: 1000 }).expect(201);
      const compra = (await como(admin).post('/operaciones/compras', { solicitudId: randomUUID(), proveedorId: proveedor.id, numeroFactura: '000-001-01-00000020', isv: 75, items: [{ productoId: producto.id, cantidad: 10, costo: 50 }] }).expect(201)).body;
      const [detalle] = await sql('SELECT id FROM detalles_orden_compra WHERE orden_id=$1', compra.id);
      await como(admin).post(`/operaciones/compras/${compra.id}/recepciones`, { solicitudId: randomUUID(), items: [{ detalleId: detalle.id, cantidad: 10 }] }).expect(201);
      const venta = async (tipoPago: string, cantidad: number, descuento = 0) => (await como(admin).post('/ventas', {
        solicitudId: randomUUID(), tipoPago, metodoPago: tipoPago === 'CREDITO' ? 'CREDITO' : 'EFECTIVO', clienteId: cliente.id, descuento,
        detalles: [{ productoId: producto.id, cantidad, modoEntrega: 'MOSTRADOR' }],
      }).expect(res => expect(res.status, JSON.stringify(res.body)).toBe(201))).body;
      const contado = await venta('CONTADO', 1);
      const credito = await venta('CREDITO', 2, 10);
      const [cxc] = await sql("SELECT id FROM cuentas_operativas WHERE tenant_id=$1 AND documento_id=$2 AND tipo='CXC'", tenant, credito.id);
      const [cxp] = await sql("SELECT id FROM cuentas_operativas WHERE tenant_id=$1 AND documento_id=$2 AND tipo='CXP'", tenant, compra.id);
      const abono = { solicitudId: randomUUID(), monto: 50.01, metodo: 'EFECTIVO' };
      await como(admin).post(`/operaciones/cuentas/${cxc.id}/pagos`, abono).expect(201);
      await como(admin).post(`/operaciones/cuentas/${cxc.id}/pagos`, abono).expect(201); // reintento
      const pago = { solicitudId: randomUUID(), monto: 100.01, metodo: 'TRANSFERENCIA', pagoElectronico: { referencia: 'AUD-TRANSFERENCIA-1' } };
      await como(admin).post(`/operaciones/cuentas/${cxp.id}/pagos`, pago).expect(201);
      await como(admin).post(`/operaciones/cuentas/${cxp.id}/pagos`, pago).expect(201);
      // Compra al contado: liquidada desde el alta, sin recepción ni salida de caja POS.
      const otraCompra = (await como(admin).post('/operaciones/compras', { solicitudId: randomUUID(), proveedorId: proveedor.id, numeroFactura: '000-001-01-00000021', isv: 7.5, pagoContado: { metodo: 'EFECTIVO' }, items: [{ productoId: producto.id, cantidad: 1, costo: 50 }] }).expect(201)).body;
      expect(Number((await sql('SELECT saldo FROM cuentas_operativas WHERE documento_id=$1', otraCompra.id))[0].saldo)).toBe(0);
      expect(Number((await prisma.producto.findUniqueOrThrow({ where: { id: producto.id } })).stockActual)).toBe(7);
      expect(Number((await prisma.cliente.findUniqueOrThrow({ where: { id: cliente.id } })).saldoPendiente)).toBe(168.49);
      expect(Number((await sql('SELECT saldo FROM cuentas_operativas WHERE id=$1', cxp.id))[0].saldo)).toBe(474.99);
      expect((await sql('SELECT count(*)::int AS n FROM contable_asientos WHERE tenant_id=$1', tenant))[0].n).toBe(0); // sin automatismo persistente

      const foto = async () => (await sql(`SELECT
        (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM productos p WHERE p.tenant_id=$1) AS productos,
        (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM clientes c WHERE c.tenant_id=$1) AS clientes,
        (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM proveedores p WHERE p.tenant_id=$1) AS proveedores,
        (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM cuentas_operativas c WHERE c.tenant_id=$1) AS cuentas,
        (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM pagos_cuenta p WHERE p.tenant_id=$1) AS pagos,
        (SELECT jsonb_agg(to_jsonb(v) ORDER BY v.id) FROM ventas v WHERE v.tenant_id=$1) AS ventas,
        (SELECT jsonb_agg(to_jsonb(o) ORDER BY o.id) FROM ordenes_compra o WHERE o.tenant_id=$1) AS compras,
        (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM cajas c WHERE c.tenant_id=$1) AS cajas,
        (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM movimientos_caja m JOIN cajas c ON c.id=m.caja_id WHERE c.tenant_id=$1) AS movimientos_caja,
        (SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM movimientos_inventario m WHERE m.tenant_id=$1) AS inventario`, tenant))[0];
      const antes = await foto();
      // Documentos tomados de la operación: no vuelven a facturar, cobrar ni recibir mercadería.
      const fecha = '2026-10-01';
      for (const [n, v] of [[1, contado], [2, credito]] as const) await como(contador).post('/contabilidad/documentos', { direccion: 'EMITIDO', tipoDocumento: '01', numero: `000-001-01-${String(n).padStart(8, '0')}`, fechaEmision: fecha, ventaId: v.id }).expect(201);
      for (const [n, o] of [[20, compra], [21, otraCompra]] as const) await como(contador).post('/contabilidad/documentos', { direccion: 'RECIBIDO', tipoDocumento: '01', numero: `000-001-01-${String(n).padStart(8, '0')}`, fechaEmision: fecha, ordenCompraId: o.id }).expect(201);
      const cuentas: Record<string, string> = {};
      for (const [codigo, nombre, tipo, naturaleza] of [
        ['1.1', 'Caja', 'ACTIVO', 'DEUDORA'], ['1.2', 'CXC', 'ACTIVO', 'DEUDORA'], ['1.3', 'Inventario', 'ACTIVO', 'DEUDORA'], ['1.4', 'ISV crédito', 'ACTIVO', 'DEUDORA'],
        ['1.5', 'Banco', 'ACTIVO', 'DEUDORA'], ['2.1', 'CXP', 'PASIVO', 'ACREEDORA'], ['2.2', 'ISV débito', 'PASIVO', 'ACREEDORA'], ['4', 'Ventas', 'INGRESO', 'ACREEDORA'],
      ]) cuentas[nombre] = (await como(contador).post('/contabilidad/cuentas', { codigo, nombre, tipo, naturaleza }).expect(201)).body.id;
      const asiento = (concepto: string, lineas: [string, number, number][]) => como(contador).post('/contabilidad/asientos', { fecha, concepto, lineas: lineas.map(([nombre, debe, haber]) => ({ cuentaId: cuentas[nombre], debe, haber })) }).expect(201);
      await asiento('Factura compra a crédito', [['Inventario', 500, 0], ['ISV crédito', 75, 0], ['CXP', 0, 575]]);
      await asiento('Venta contado', [['Caja', 115, 0], ['Ventas', 0, 100], ['ISV débito', 0, 15]]);
      await asiento('Venta crédito neta de descuento', [['CXC', 218.5, 0], ['Ventas', 0, 190], ['ISV débito', 0, 28.5]]);
      await asiento('Cobro parcial', [['Caja', 50.01, 0], ['CXC', 0, 50.01]]);
      await asiento('Pago parcial por transferencia', [['CXP', 100.01, 0], ['Banco', 0, 100.01]]);
      const balance = (await como(contador).get('/contabilidad/balanza?anio=2026&mes=10').expect(200)).body;
      expect(balance.totales.cuadra).toBe(true);
      expect(balance.cuentas.find((c: any) => c.nombre === 'CXC').saldo).toBe(168.49);
      expect(balance.cuentas.find((c: any) => c.nombre === 'CXP').saldo).toBe(474.99);
      const isv = (await como(contador).get('/contabilidad/resumen-isv?anio=2026&mes=10').expect(200)).body;
      expect(isv).toMatchObject({ debitoFiscal: '43.50', creditoFiscal: '82.50', resultado: '39.00', tipoResultado: 'A_FAVOR' });
      const ajuste = (await asiento('Corrección manual reversible', [['Caja', 0.01, 0], ['Banco', 0, 0.01]])).body;
      await como(contador).post(`/contabilidad/asientos/${ajuste.id}/revertir`, { fecha, motivo: 'Reversión de prueba trazable' }).expect(201);
      await como(contador).get(`/contabilidad/mayor?cuentaId=${cuentas.CXC}&anio=2026&mes=10`).expect(200);
      await descargar('/contabilidad/exportar/mensual?anio=2026&mes=10', contador).expect(200);
      expect(await foto()).toEqual(antes);
      const rastros = await sql("SELECT operacion,usuario_id FROM auditoria_operaciones WHERE tenant_id=$1 AND operacion LIKE 'CONTABILIDAD_%'", tenant);
      expect(rastros.filter(r => r.operacion === 'CONTABILIDAD_ASIENTO_CREAR')).toHaveLength(6);
      expect(rastros.every(r => r.usuario_id === contador)).toBe(true);
    });

  });

});
