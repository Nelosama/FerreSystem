import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import { INestApplication, RequestMethod } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA, GUARDS_METADATA } from '@nestjs/common/constants';
import { DiscoveryModule, DiscoveryService } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import * as cookieParserImport from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { ROLES_KEY } from '../src/common/decorators/roles.decorator';
import { SuperAdminGuard } from '../src/common/guards/super-admin.guard';
import { configurarPipesGlobales } from '../src/common/pipes/profundidad-maxima.pipe';
import { noStore } from '../src/common/no-store.middleware';

// Auditoría de salida a producción (2026-10-30). Sondas sobre la aplicación completa (AppModule, guards, pipes y DTO reales)
// y PostgreSQL temporal con todas las migraciones. Completa lo que las suites existentes no cubren:
//  1. Doble envío con identificadores DISTINTOS (doble clic que genera otra solicitud, dos cajas o dos pestañas) en
//     operaciones monetarias y de existencias: solo una operación puede consumir el mismo saldo/existencia.
//  2. Barrido de roles para VENDEDOR, BODEGUERO y CONTADOR (el barrido existente cubre CAJERO).
//  3. Contrato residual de Comisiones (inaccesible tras #226): el cálculo usa campos que la API no devuelve.
//  4. Límites fiscales vigentes: desglose apagado, contabilidad opt-in y módulos pendientes ocultos.
// Los defectos conocidos se expresan con `it.fails`: la aserción describe el comportamiento CORRECTO y la prueba
// solo se aprueba mientras el defecto exista. Al corregirlo, la prueba falla y debe pasar a `it`.
// Nunca usa DATABASE_URL del entorno: crea y destruye su propio clúster.
describe('Auditoría de producción 2026-10-30 / AppModule y PostgreSQL aislado', () => {
  const bin = process.env.PG_BIN || '/usr/lib/postgresql/16/bin';
  const exe = (name: string) => join(bin, name);
  const cookieParser = (cookieParserImport as any).default || cookieParserImport;
  const claves = ['DATABASE_URL', 'DIRECT_URL', 'JWT_SECRET', 'CONTINGENCIA_CLAVE_OPERACIONES', 'POS_OFFLINE_ENABLED', 'FISCAL_DESGLOSE_POR_LINEA'];
  const anteriores = new Map(claves.map(k => [k, process.env[k]]));
  const password = `Auditoria-${randomBytes(8).toString('hex')}!`;
  let directory = '', started = false, port = 0;
  let app: INestApplication;
  let prisma: PrismaService;
  let passwordHash = '';

  const psql = (args: string[]) => execFileSync(exe('psql'), ['-X', '-q', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', ...args], { stdio: 'pipe', timeout: 60000 });

  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-auditoria-prod-'));
    const listener = createServer();
    await new Promise<void>((ok, ko) => { listener.once('error', ko); listener.listen(0, '127.0.0.1', ok); });
    port = (listener.address() as { port: number }).port;
    await new Promise<void>(ok => listener.close(() => ok()));
    execFileSync(exe('initdb'), ['-D', join(directory, 'data'), '-U', 'postgres', '-A', 'trust', '--locale=C', '-E', 'UTF8', '--no-sync'], { stdio: 'pipe', timeout: 60000 });
    execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-l', join(directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -k ${directory}`, '-w', 'start'], { stdio: 'ignore', timeout: 60000 });
    started = true;
    for (const m of readdirSync(resolve('prisma/migrations')).sort()) {
      const archivo = resolve('prisma/migrations', m, 'migration.sql');
      if (existsSync(archivo)) psql(['-f', archivo]);
    }
    const url = `postgresql://postgres@127.0.0.1:${port}/postgres?connection_limit=12`;
    Object.assign(process.env, { DATABASE_URL: url, DIRECT_URL: url, JWT_SECRET: randomBytes(32).toString('hex'), CONTINGENCIA_CLAVE_OPERACIONES: randomBytes(32).toString('hex'), POS_OFFLINE_ENABLED: 'true' });
    delete process.env.FISCAL_DESGLOSE_POR_LINEA;
    const modulo = await Test.createTestingModule({ imports: [AppModule, DiscoveryModule] }).compile();
    app = modulo.createNestApplication({ logger: false });
    app.use(noStore);
    app.use(cookieParser());
    configurarPipesGlobales(app);
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);
    passwordHash = await bcrypt.hash(password, 4);
  }, 240000);

  afterAll(async () => {
    try { await app?.close(); }
    finally {
      if (started) execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { stdio: 'ignore', timeout: 30000 });
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-auditoria-prod-')) rmSync(directory, { recursive: true, force: true });
      for (const [k, v] of anteriores) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    }
  });

  const http = (token: string, metodo: 'get' | 'post' | 'put' | 'patch' | 'delete', ruta: string, cuerpo?: unknown) =>
    (request(app.getHttpServer()) as any)[metodo](`/api${ruta}`).auth(token, { type: 'bearer' }).send(cuerpo);
  const estados = (rs: { status: number }[]) => rs.map(r => r.status).sort((a, b) => a - b);

  type Empresa = { tenantId: string; ids: Record<string, string>; tokens: Record<string, string> };
  /** Empresa sintética con un usuario por rol, login real y caja abierta para el ADMIN. */
  async function empresa(roles = ['ADMIN', 'CAJERO', 'VENDEDOR', 'BODEGUERO', 'CONTADOR']): Promise<Empresa> {
    const tenantId = randomUUID();
    await prisma.tenant.create({ data: { id: tenantId, nombreComercial: `Ferretería auditoría ${tenantId.slice(0, 6)}` } });
    const ids: Record<string, string> = {}, tokens: Record<string, string> = {};
    for (const rol of roles) {
      ids[rol] = randomUUID();
      const email = `${rol.toLowerCase()}-${ids[rol].slice(0, 8)}@auditoria.invalid`;
      await prisma.usuario.create({ data: { id: ids[rol], tenantId, rol: rol as any, nombre: `${rol} auditoría`, email, passwordHash } });
      tokens[rol] = (await request(app.getHttpServer()).post('/api/auth/login').send({ email, password, tenantId }).expect(200)).body.accessToken;
    }
    if (tokens.ADMIN) await http(tokens.ADMIN, 'post', '/operaciones/caja/abrir', { solicitudId: randomUUID(), monto: 100 }).expect(201);
    return { tenantId, ids, tokens };
  }
  async function producto(e: Empresa, stockActual: number, precioVenta = 100) {
    const r = await http(e.tokens.ADMIN, 'post', '/productos', { solicitudId: randomUUID(), codigo: `AUD-${randomBytes(3).toString('hex')}`, nombre: 'Producto auditoría', precioCosto: 40, precioVenta, stockActual, stockMinimo: 0 }).expect(201);
    return r.body as { id: string };
  }
  const stock = async (id: string) => {
    const p = await prisma.producto.findUniqueOrThrow({ where: { id } });
    return { actual: Number(p.stockActual), reservado: Number(p.stockReservado) };
  };

  describe('1. Doble envío con solicitudes distintas (dinero y existencias)', () => {
    it('POS: dos ventas simultáneas por la última unidad → una sola venta y existencias no negativas', async () => {
      const e = await empresa(['ADMIN']);
      const p = await producto(e, 1);
      const venta = () => http(e.tokens.ADMIN, 'post', '/ventas', { solicitudId: randomUUID(), metodoPago: 'EFECTIVO', detalles: [{ productoId: p.id, cantidad: 1 }] });
      const rs = await Promise.all([venta(), venta(), venta()]);
      expect(rs.filter(r => r.status === 201)).toHaveLength(1);
      expect(rs.filter(r => r.status !== 201).every(r => r.status >= 400 && r.status < 500)).toBe(true);
      expect(await prisma.venta.count({ where: { tenantId: e.tenantId } })).toBe(1);
      const s = await stock(p.id);
      expect(s.actual - s.reservado).toBe(0);
      expect(s.reservado).toBe(1);
    });

    it('Crédito: dos ventas simultáneas que juntas exceden el límite → solo una queda a crédito', async () => {
      const e = await empresa(['ADMIN']);
      const p = await producto(e, 10);
      const cliente = await prisma.cliente.create({ data: { tenantId: e.tenantId, nombre: 'Cliente crédito auditoría', creditoHabilitado: true, limiteCredito: 150 } });
      const venta = () => http(e.tokens.ADMIN, 'post', '/ventas', { solicitudId: randomUUID(), clienteId: cliente.id, metodoPago: 'CREDITO', detalles: [{ productoId: p.id, cantidad: 1 }] });
      const rs = await Promise.all([venta(), venta()]);
      expect(estados(rs)[0]).toBe(201);
      expect(rs.filter(r => r.status === 201)).toHaveLength(1);
      const c = await prisma.cliente.findUniqueOrThrow({ where: { id: cliente.id } });
      expect(Number(c.saldoPendiente)).toBe(115);
      expect(await prisma.cuentaOperativa.count({ where: { tenantId: e.tenantId, tipo: 'CXC' } })).toBe(1);
    });

    it('CxC: dos abonos simultáneos por el saldo completo con solicitudes distintas → un pago, saldo 0 y una entrada de caja', async () => {
      const e = await empresa(['ADMIN']);
      const p = await producto(e, 10);
      const cliente = await prisma.cliente.create({ data: { tenantId: e.tenantId, nombre: 'Cliente abono auditoría', creditoHabilitado: true, limiteCredito: 1000 } });
      const v = await http(e.tokens.ADMIN, 'post', '/ventas', { solicitudId: randomUUID(), clienteId: cliente.id, metodoPago: 'CREDITO', detalles: [{ productoId: p.id, cantidad: 1 }] }).expect(201);
      const cuenta = await prisma.cuentaOperativa.findFirstOrThrow({ where: { tenantId: e.tenantId, tipo: 'CXC', documentoId: v.body.id } });
      const pago = () => http(e.tokens.ADMIN, 'post', `/operaciones/cuentas/${cuenta.id}/pagos`, { solicitudId: randomUUID(), monto: 115, metodo: 'EFECTIVO' });
      const rs = await Promise.all([pago(), pago()]);
      expect(rs.filter(r => r.status === 201)).toHaveLength(1);
      expect(Number((await prisma.cuentaOperativa.findUniqueOrThrow({ where: { id: cuenta.id } })).saldo)).toBe(0);
      expect(Number((await prisma.cliente.findUniqueOrThrow({ where: { id: cliente.id } })).saldoPendiente)).toBe(0);
      const caja = (await http(e.tokens.ADMIN, 'get', '/operaciones/caja').expect(200)).body[0];
      expect(caja.efectivoEsperado).toBe(215); // 100 apertura + 115 abono, una sola vez.
    });

    it('CxP: dos pagos simultáneos por el saldo completo con solicitudes distintas → un pago y saldo 0', async () => {
      const e = await empresa(['ADMIN']);
      const p = await producto(e, 0);
      const prov = await http(e.tokens.ADMIN, 'post', '/operaciones/proveedores', { solicitudId: randomUUID(), nombre: 'Proveedor auditoría' }).expect(201);
      const compra = await http(e.tokens.ADMIN, 'post', '/operaciones/compras', { solicitudId: randomUUID(), proveedorId: prov.body.id, numeroFactura: 'AUD-CXP-1', isv: 0, items: [{ productoId: p.id, cantidad: 5, costo: 20 }] }).expect(201);
      const cuenta = await prisma.cuentaOperativa.findFirstOrThrow({ where: { tenantId: e.tenantId, tipo: 'CXP', documentoId: compra.body.id } });
      expect(Number(cuenta.saldo)).toBe(100);
      const pago = () => http(e.tokens.ADMIN, 'post', `/operaciones/cuentas/${cuenta.id}/pagos`, { solicitudId: randomUUID(), monto: 100, metodo: 'TRANSFERENCIA', pagoElectronico: { referencia: `TR-${randomBytes(4).toString('hex')}` } });
      const rs = await Promise.all([pago(), pago()]);
      expect(rs.filter(r => r.status === 201)).toHaveLength(1);
      expect(Number((await prisma.cuentaOperativa.findUniqueOrThrow({ where: { id: cuenta.id } })).saldo)).toBe(0);
    });

    it('Compras: dos recepciones simultáneas del total pendiente con solicitudes distintas → existencias suben una vez', async () => {
      const e = await empresa(['ADMIN', 'BODEGUERO']);
      const p = await producto(e, 2);
      const prov = await http(e.tokens.ADMIN, 'post', '/operaciones/proveedores', { solicitudId: randomUUID(), nombre: 'Proveedor recepción auditoría' }).expect(201);
      const compra = await http(e.tokens.ADMIN, 'post', '/operaciones/compras', { solicitudId: randomUUID(), proveedorId: prov.body.id, numeroFactura: 'AUD-REC-1', isv: 0, items: [{ productoId: p.id, cantidad: 10, costo: 30 }] }).expect(201);
      const [linea] = await prisma.$queryRawUnsafe<any[]>('SELECT id FROM detalles_orden_compra WHERE orden_id=$1', compra.body.id);
      const recibir = (token: string) => http(token, 'post', `/operaciones/compras/${compra.body.id}/recepciones`, { solicitudId: randomUUID(), items: [{ detalleId: linea.id, cantidad: 10 }] });
      const rs = await Promise.all([recibir(e.tokens.ADMIN), recibir(e.tokens.BODEGUERO)]);
      expect(rs.filter(r => r.status === 201)).toHaveLength(1);
      expect((await stock(p.id)).actual).toBe(12);
      expect(await prisma.movimientoInventario.count({ where: { tenantId: e.tenantId, productoId: p.id, tipo: 'COMPRA' } })).toBe(1);
    });

    it('Devoluciones: dos devoluciones directas simultáneas de la misma línea con solicitudes distintas → un reembolso', async () => {
      const e = await empresa(['ADMIN']);
      // Devolución parcial (una de dos líneas): anular el total exige la autorización de otro ADMIN (regla vigente).
      const p = await producto(e, 5), otro = await producto(e, 5);
      const v = await http(e.tokens.ADMIN, 'post', '/ventas', { solicitudId: randomUUID(), metodoPago: 'EFECTIVO', detalles: [{ productoId: p.id, cantidad: 1 }, { productoId: otro.id, cantidad: 1 }] }).expect(201);
      const [det] = await prisma.$queryRawUnsafe<any[]>('SELECT id FROM detalles_venta WHERE venta_id=$1 AND producto_id=$2', v.body.id, p.id);
      const devolver = () => http(e.tokens.ADMIN, 'post', `/operaciones/ventas/${v.body.id}/devoluciones`, { solicitudId: randomUUID(), motivo: 'Cliente desistió (auditoría)', metodo: 'EFECTIVO', items: [{ detalleId: det.id, cantidad: 1, destino: 'NO_ENTREGADO' }] });
      const rs = await Promise.all([devolver(), devolver()]);
      expect(rs.filter(r => r.status === 201)).toHaveLength(1);
      expect(await prisma.devolucion.count({ where: { tenantId: e.tenantId } })).toBe(1);
      const caja = (await http(e.tokens.ADMIN, 'get', '/operaciones/caja').expect(200)).body[0];
      expect(caja.efectivoEsperado).toBe(215); // 100 apertura + 230 venta − 115 reembolso, una sola vez.
    });

    it('Caja: dos aperturas simultáneas del mismo usuario con solicitudes distintas → una sola caja abierta', async () => {
      const e = await empresa(['ADMIN', 'CAJERO']);
      const abrir = () => http(e.tokens.CAJERO, 'post', '/operaciones/caja/abrir', { solicitudId: randomUUID(), monto: 50 });
      const rs = await Promise.all([abrir(), abrir(), abrir()]);
      expect(rs.filter(r => r.status === 201).length).toBeGreaterThanOrEqual(1);
      expect(await prisma.caja.count({ where: { tenantId: e.tenantId, usuarioId: e.ids.CAJERO, estado: 'ABIERTA' } })).toBe(1);
    });

    it('Inventario: dos ajustes simultáneos sobre el mismo stock observado con solicitudes distintas → solo uno se aplica', async () => {
      const e = await empresa(['ADMIN']);
      const p = await producto(e, 10);
      const ajustar = (n: number) => http(e.tokens.ADMIN, 'post', `/operaciones/productos/${p.id}/ajuste`, { solicitudId: randomUUID(), stock: n, stockAnterior: 10, motivo: 'Conteo físico auditoría' });
      const rs = await Promise.all([ajustar(7), ajustar(13)]);
      expect(rs.filter(r => r.status === 201)).toHaveLength(1);
      expect([7, 13]).toContain((await stock(p.id)).actual);
      expect(await prisma.movimientoInventario.count({ where: { tenantId: e.tenantId, productoId: p.id, tipo: 'AJUSTE' } })).toBe(1);
    });
  });

  describe('2. Barrido de roles VENDEDOR, BODEGUERO y CONTADOR', () => {
    it('cada ruta con @Roles que no incluye al rol responde 403 y ninguna responde 2xx', async () => {
      const e = await empresa();
      const discovery = app.get(DiscoveryService);
      const verbos: Record<number, string> = { [RequestMethod.GET]: 'get', [RequestMethod.POST]: 'post', [RequestMethod.PUT]: 'put', [RequestMethod.PATCH]: 'patch', [RequestMethod.DELETE]: 'delete' };
      const rutas: { metodo: string; ruta: string; roles: string[] }[] = [];
      for (const wrapper of discovery.getControllers()) {
        const clase = wrapper.metatype as any;
        if (!clase?.prototype) continue;
        const bases = [Reflect.getMetadata(PATH_METADATA, clase)].flat().filter((b): b is string => typeof b === 'string');
        const guardsClase = Reflect.getMetadata(GUARDS_METADATA, clase) ?? [];
        for (const nombre of Object.getOwnPropertyNames(clase.prototype)) {
          const handler = clase.prototype[nombre];
          if (nombre === 'constructor' || typeof handler !== 'function' || Reflect.getMetadata(METHOD_METADATA, handler) === undefined) continue;
          const metodo = verbos[Reflect.getMetadata(METHOD_METADATA, handler)];
          const roles = Reflect.getMetadata(ROLES_KEY, handler) ?? Reflect.getMetadata(ROLES_KEY, clase);
          const guards = [...guardsClase, ...(Reflect.getMetadata(GUARDS_METADATA, handler) ?? [])];
          if (!metodo || !roles || guards.includes(SuperAdminGuard)) continue;
          for (const base of bases) for (const sub of [Reflect.getMetadata(PATH_METADATA, handler)].flat()) {
            rutas.push({ metodo, ruta: ('/' + [base, sub].filter(x => x && x !== '/').join('/')).replace(/\/+/g, '/').replace(/:[A-Za-z_]+/g, randomUUID()), roles });
          }
        }
      }
      expect(rutas.length).toBeGreaterThan(100);
      // Control positivo: los tokens son válidos y el rol sí entra donde está autorizado.
      expect((await http(e.tokens.VENDEDOR, 'get', '/cotizaciones')).status).toBe(200);
      expect((await http(e.tokens.BODEGUERO, 'get', '/entregas/pendientes')).status).toBe(200);
      expect((await http(e.tokens.CONTADOR, 'get', '/tenant/settings')).status).toBe(200);
      let evaluadas = 0;
      const violaciones: string[] = [];
      for (const rol of ['VENDEDOR', 'BODEGUERO', 'CONTADOR']) {
        for (const r of rutas.filter(x => !x.roles.includes(rol))) {
          const res = await http(e.tokens[rol], r.metodo as any, r.ruta, r.metodo === 'get' || r.metodo === 'delete' ? undefined : {});
          evaluadas++;
          if (res.status !== 403) violaciones.push(`${rol} ${r.metodo.toUpperCase()} ${r.ruta} → ${res.status}`);
        }
      }
      expect(violaciones).toEqual([]);
      expect(evaluadas).toBeGreaterThan(150);
    }, 120000);
  });

  describe('3. Comisiones: caracterización del cálculo residual, módulo excluido por #226)', () => {
    // Réplica literal del cálculo de frontend/src/pages/ComisionesPage.tsx (líneas 88–104): filtra por `v.fecha` y por
    // `v.vendedorNombre` con coincidencia de primer nombre, y suma `v.total`. Comisiones no tiene endpoint propio.
    const calculoDePantalla = (ventas: any[], usuario: { nombre: string }, pct: number, desde: string, hasta: string) => {
      const propias = ventas.filter(v => {
        if (!v.fecha) return false;
        const dia = v.fecha.split('T')[0];
        return dia >= desde && dia <= hasta && v.vendedorNombre && v.vendedorNombre.toLowerCase().includes(usuario.nombre.toLowerCase().split(' ')[0]);
      });
      return propias.reduce((a, v) => a + v.total, 0) * pct / 100;
    };

    it('la API de ventas no devuelve `fecha` ni `vendedorNombre`, los campos que usa la pantalla (contrato observado)', async () => {
      const e = await empresa(['ADMIN']);
      const p = await producto(e, 5);
      await http(e.tokens.ADMIN, 'post', '/ventas', { solicitudId: randomUUID(), metodoPago: 'EFECTIVO', detalles: [{ productoId: p.id, cantidad: 1 }] }).expect(201);
      const [v] = (await http(e.tokens.ADMIN, 'get', '/ventas').expect(200)).body;
      expect(v).toHaveProperty('createdAt');
      expect(v).toHaveProperty('usuario.nombre');
      expect(v.fecha).toBeUndefined();
      expect(v.vendedorNombre).toBeUndefined();
    });

    it.fails('DEFECTO AUD-COM-01: con ventas reales del periodo, la comisión calculada por la pantalla es mayor que cero', async () => {
      const e = await empresa(['ADMIN']);
      const p = await producto(e, 5);
      await http(e.tokens.ADMIN, 'post', '/ventas', { solicitudId: randomUUID(), metodoPago: 'EFECTIVO', detalles: [{ productoId: p.id, cantidad: 2 }] }).expect(201);
      const ventas = (await http(e.tokens.ADMIN, 'get', '/ventas').expect(200)).body;
      const hoy = new Date().toISOString().slice(0, 10);
      expect(calculoDePantalla(ventas, { nombre: 'ADMIN auditoría' }, 5, '2000-01-01', hoy)).toBeGreaterThan(0);
    });

    it.fails('DEFECTO AUD-COM-02: la lista de ventas que consume la pantalla incluye todas las ventas del periodo (sin truncar a 50)', async () => {
      const e = await empresa(['ADMIN']);
      const p = await producto(e, 100, 10);
      for (let i = 0; i < 55; i++) await http(e.tokens.ADMIN, 'post', '/ventas', { solicitudId: randomUUID(), metodoPago: 'EFECTIVO', detalles: [{ productoId: p.id, cantidad: 1 }] }).expect(201);
      const ventas = (await http(e.tokens.ADMIN, 'get', '/ventas').expect(200)).body; // Misma llamada sin parámetros que ComisionesPage.tsx:32.
      expect(ventas).toHaveLength(55);
    }, 60000);
  });

  describe('4. Límites fiscales y de alcance vigentes', () => {
    it('desglose fiscal por línea apagado por defecto: una venta no escribe columnas de desglose', async () => {
      const e = await empresa(['ADMIN']);
      const p = await producto(e, 5);
      const v = await http(e.tokens.ADMIN, 'post', '/ventas', { solicitudId: randomUUID(), metodoPago: 'EFECTIVO', detalles: [{ productoId: p.id, cantidad: 1 }] }).expect(201);
      const columnas = await prisma.$queryRawUnsafe<{ c: string }[]>(
        `SELECT column_name AS c FROM information_schema.columns WHERE table_name='detalles_venta' AND column_name IN ('base_gravada','base_exenta','isv_linea','tasa_isv','gravado','exento','isv')`);
      expect(columnas.length).toBeGreaterThan(0);
      const [fila] = await prisma.$queryRawUnsafe<any[]>(`SELECT ${columnas.map(c => `"${c.c}"`).join(',')} FROM detalles_venta WHERE venta_id=$1`, v.body.id);
      expect(Object.values(fila).every(x => x === null)).toBe(true);
    });

    it('contabilidad opt-in: un negocio nuevo recibe 403 en Contabilidad aunque sea ADMIN o CONTADOR', async () => {
      const e = await empresa(['ADMIN', 'CONTADOR']);
      for (const rol of ['ADMIN', 'CONTADOR']) {
        const r = await http(e.tokens[rol], 'get', '/contabilidad/cuentas');
        expect(r.status).toBe(403);
      }
    });

    it('exenciones bloqueadas: ni ADMIN ni VENDEDOR crean una cotización con línea exenta', async () => {
      const e = await empresa(['ADMIN', 'VENDEDOR']);
      const p = await producto(e, 5);
      for (const rol of ['ADMIN', 'VENDEDOR']) {
        const r = await http(e.tokens[rol], 'post', '/cotizaciones', { detalles: [{ productoId: p.id, cantidad: 1, exento: true }] });
        expect(r.status, `${rol}: ${JSON.stringify(r.body)}`).toBeGreaterThanOrEqual(400);
      }
      expect(await prisma.cotizacion.count({ where: { tenantId: e.tenantId } })).toBe(0);
    });

    it('módulos pendientes: apartados, transferencias, pedidos especiales y listas de precio no aparecen ni se pueden encender', async () => {
      const e = await empresa(['ADMIN']);
      await prisma.tenantModule.createMany({ data: ['apartados', 'transferencias_sucursal', 'pedidos_especiales', 'listas_precio'].map(moduleKey => ({ tenantId: e.tenantId, moduleKey, enabled: true })) as any });
      const settings = (await http(e.tokens.ADMIN, 'get', '/tenant/settings').expect(200)).body;
      const activos: string[] = settings.modulosHabilitados ?? [];
      expect(Array.isArray(activos) && activos.length > 0, JSON.stringify(Object.keys(settings))).toBe(true);
      for (const m of ['apartados', 'transferencias_sucursal', 'pedidos_especiales', 'listas_precio']) expect(activos).not.toContain(m);
      const controladores = app.get(DiscoveryService).getControllers().map(w => String(Reflect.getMetadata(PATH_METADATA, w.metatype as any) ?? '')).join(' ');
      expect(controladores).not.toMatch(/apartado|transferencia|pedido|listas?-?precio/i);
    });
  });
});
