import { idSolicitud } from '../src/operaciones/ledger';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { ContingenciaService } from '../src/contingencia/contingencia.service';
import { OperacionesService } from '../src/operaciones/operaciones.service';
import { emitirRegistrada, siguienteOperacion } from './helpers/operaciones-emitidas';

// POS offline de contingencia contra PostgreSQL real: cadena completa de migraciones, clúster temporal exclusivo.
// Nunca lee DATABASE_URL. Ejecutar como usuario no root (initdb lo exige).
describe('Contingencia offline / PostgreSQL aislado', () => {
  const bin = process.env.PG_BIN || '/usr/lib/postgresql/16/bin';
  const exe = (name: string) => join(bin, name);
  let directory = '';
  let started = false;
  let prisma: PrismaService;
  let svc: ContingenciaService;
  let operaciones: OperacionesService;

  beforeAll(async () => {
    if (!existsSync(exe('initdb'))) throw new Error(`PostgreSQL no instalado en ${bin}`);
    process.env.POS_OFFLINE_ENABLED = 'true';
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-contingencia-'));
    const listener = createServer();
    await new Promise<void>((done, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', done); });
    const port = (listener.address() as { port: number }).port;
    await new Promise<void>((done) => listener.close(() => done()));
    const url = `postgresql://postgres@127.0.0.1:${port}/postgres`;
    const options = { windowsHide: true, timeout: 60000, stdio: 'pipe' as const };
    execFileSync(exe('initdb'), ['-D', join(directory, 'data'), '-U', 'postgres', '-A', 'trust', '--locale=C', '-E', 'UTF8', '--no-sync'], options);
    execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-l', join(directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -k ${directory}`, '-w', 'start'], { ...options, stdio: 'ignore' });
    started = true;
    for (const migracion of readdirSync(resolve('prisma/migrations')).sort()) {
      const archivo = resolve('prisma/migrations', migracion, 'migration.sql');
      if (!existsSync(archivo)) continue;
      execFileSync(exe('psql'), ['-X', '-q', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', archivo], options);
    }
    prisma = new PrismaService({ datasources: { db: { url } } });
    await prisma.$connect();
    svc = new ContingenciaService(prisma);
    operaciones = new OperacionesService(prisma);
  }, 180000);

  afterAll(async () => {
    try { await prisma?.$disconnect(); }
    finally {
      if (started) execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-m', 'immediate', '-w', 'stop'], { windowsHide: true, timeout: 15000, stdio: 'ignore' });
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-contingencia-')) {
        rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  });

  let contador = 0;
  /** Empresa nueva con un administrador, un cajero con caja abierta, dos productos y un dispositivo registrado. */
  async function empresa(opciones: { habilitada?: boolean } = {}) {
    const tenantId = randomUUID();
    const admin = randomUUID();
    const cajero = randomUUID();
    const hab = opciones.habilitada ?? true;
    await prisma.tenant.create({ data: { id: tenantId, nombreComercial: `Ferretería ${++contador}`, estado: 'ACTIVO', configuracion: { contingenciaOffline: { habilitada: hab } } as any } });
    for (const [id, rol] of [[admin, 'ADMIN'], [cajero, 'CAJERO']] as const) {
      await prisma.usuario.create({ data: { id, tenantId, nombre: rol, email: `${id}@test.invalid`, passwordHash: 'x', rol, permisosConfigurados: false, permisos: [] } as any });
    }
    await prisma.caja.create({ data: { tenantId, codigo: 'CAJA-1', usuarioId: cajero, montoApertura: 100, estado: 'ABIERTA' } as any });
    const p1 = await prisma.producto.create({ data: {precioAprobado:true, tenantId, codigo: 'TOR-1', nombre: 'Tornillo', precioVenta: 10, precioCosto: 4, stockActual: 20 } as any });
    const p2 = await prisma.producto.create({ data: {precioAprobado:true, tenantId, codigo: 'BIS-1', nombre: 'Bisagra', precioVenta: 25.5, precioCosto: 10, stockActual: 8 } as any });
    const dispositivoId = randomUUID();
    if (hab) await svc.registrarDispositivo(tenantId, cajero, { dispositivoId, nombre: 'Caja principal' });
    else await prisma.dispositivoPos.create({ data: { id: dispositivoId, tenantId, codigo: '01', nombre: 'Caja principal', registradoPor: admin } });
    return { tenantId, admin, cajero, p1: p1.id, p2: p2.id, dispositivoId };
  }

  /** Emite la ventana y devuelve la instantánea. */
  async function ventana(e: Awaited<ReturnType<typeof empresa>>) {
    const r = await emitirRegistrada(svc, e.tenantId, e.cajero, { dispositivoId: e.dispositivoId });
    return r.ventana;
  }

  /** Operación de un TOR-1 × 2 (20.00) + ISV 3.00 = 23.00, recibe 25.00, cambio 2.00. */
  function operacion(e: Awaited<ReturnType<typeof empresa>>, ventanaId: string, extra: Partial<Record<string, any>> = {}) {
    const n = ++contador;
    return {
      ...siguienteOperacion(ventanaId), dispositivoId: e.dispositivoId, ventanaId, secuenciaLocal: n,
      correlativoLocal: `CT-01-${String(n).padStart(4, '0')}`, ocurridoAtLocal: new Date().toISOString(), cajeroId: e.cajero,
      lineas: [{ productoId: e.p1, cantidadCentesimas: 200, precioCentavos: 1000 }],
      subtotalCentavos: 2000, isvCentavos: 300, totalCentavos: 2300, efectivoRecibidoCentavos: 2500, cambioCentavos: 200,
      esquemaVersion: 1, ...extra,
    };
  }
  const enviar = (e: Awaited<ReturnType<typeof empresa>>, ops: any[]) => svc.recibirLote(e.tenantId, e.cajero, 'CAJERO', { dispositivoId: e.dispositivoId, pendientesRestantes: 0, operaciones: ops } as any);
  const stock = async (id: string) => Number((await prisma.producto.findUniqueOrThrow({ where: { id } })).stockActual);
  const ventas = (tenantId: string) => prisma.venta.count({ where: { tenantId } });

  describe('activación', () => {
    it('apagada por defecto: sin bandera por empresa no se emite ventana ni se recibe nada', async () => {
      const e = await empresa({ habilitada: false });
      await expect(emitirRegistrada(svc, e.tenantId, e.cajero, { dispositivoId: e.dispositivoId })).rejects.toBeInstanceOf(ForbiddenException);
      expect(await prisma.contingenciaVentana.count({ where: { tenantId: e.tenantId } })).toBe(0);
    });

    it('la empresa no puede activarla si el entorno no lo permite', async () => {
      const previo = process.env.POS_OFFLINE_ENABLED;
      process.env.POS_OFFLINE_ENABLED = 'false';
      try {
        const e = await empresa({ habilitada: false });
        await expect(svc.actualizarConfiguracion(e.tenantId, e.admin, { habilitada: true })).rejects.toMatchObject({ status: 409 });
      } finally { process.env.POS_OFFLINE_ENABLED = previo; }
    });
  });

  describe('ventana y catálogo', () => {
    it('emite ventana con cupo conservador (50 % de lo libre) y catálogo con precios en centavos', async () => {
      const e = await empresa();
      const r = await emitirRegistrada(svc, e.tenantId, e.cajero, { dispositivoId: e.dispositivoId });
      const tor = r.catalogo!.productos.find((p: any) => p.id === e.p1);
      expect(tor).toMatchObject({ precioCentavos: 1000, libreCentesimas: 2000, cupoCentesimas: 1000 });
      expect(r.ventana.vigenteHasta.getTime()).toBeGreaterThan(Date.now() + 35 * 3_600_000);
    });

    it('si el dispositivo ya tiene el catálogo, no se reenvía', async () => {
      const e = await empresa();
      const primera = await emitirRegistrada(svc, e.tenantId, e.cajero, { dispositivoId: e.dispositivoId });
      const segunda = await emitirRegistrada(svc, e.tenantId, e.cajero, { dispositivoId: e.dispositivoId, catalogoHashActual: primera.ventana.catalogoHash });
      expect(segunda.catalogo).toBeNull();
    });

    it('sin caja abierta no hay ventana', async () => {
      const e = await empresa();
      await prisma.caja.updateMany({ where: { tenantId: e.tenantId }, data: { estado: 'CERRADA' } });
      await expect(emitirRegistrada(svc, e.tenantId, e.cajero, { dispositivoId: e.dispositivoId })).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('venta offline en efectivo', () => {
    it('se aplica: venta COMPLETADA con correlativo central y local, caja, entrega y auditoría', async () => {
      const e = await empresa();
      const v = await ventana(e);
      const op = operacion(e, v.id);
      const [res] = (await enviar(e, [op])).resultados;
      expect(res).toMatchObject({ estado: 'APLICADA', correlativoLocal: op.correlativoLocal, correlativoDefinitivo: expect.stringMatching(/^V-\d{8}$/) });
      expect(res.requiereRevision).toBe(false);
      const venta = await prisma.venta.findUniqueOrThrow({ where: { id: idSolicitud(e.tenantId, op.operacionId) } });
      expect(venta).toMatchObject({ origen: 'CONTINGENCIA', estado: 'COMPLETADA', metodoPago: 'EFECTIVO', correlativoLocal: op.correlativoLocal });
      expect(Number(venta.total)).toBe(23);
      expect(Number(venta.efectivoRecibido)).toBe(25);
      expect(Number(venta.cambio)).toBe(2);
      expect(await stock(e.p1)).toBe(18);
      const mov = await prisma.movimientoCaja.findMany({ where: { referencia: idSolicitud(e.tenantId, op.operacionId) } });
      expect(mov).toHaveLength(1);
      expect(mov[0]).toMatchObject({ tipo: 'VENTA_POS', metodo: 'EFECTIVO' });
      expect(Number(mov[0].monto)).toBe(23);
      expect(await prisma.auditoriaOperacion.count({ where: { tenantId: e.tenantId, operacion: 'CONTINGENCIA_APLICAR', entidadId: idSolicitud(e.tenantId, op.operacionId) } })).toBe(1);
    });

    it('numeración definitiva secuencial: dos ventas consecutivas reciben números correlativos sin saltos', async () => {
      const e = await empresa();
      const v = await ventana(e);
      const [a] = (await enviar(e, [operacion(e, v.id)])).resultados;
      const [b] = (await enviar(e, [operacion(e, v.id)])).resultados;
      expect(b.numeroVenta).toBe(a.numeroVenta + 1);
    });

    it('reenvío de la misma operación: no duplica venta, caja, stock ni numeración', async () => {
      const e = await empresa();
      const v = await ventana(e);
      const op = operacion(e, v.id);
      const [primera] = (await enviar(e, [op])).resultados;
      const [segunda] = (await enviar(e, [op])).resultados;
      expect(segunda).toEqual(primera);
      expect(await ventas(e.tenantId)).toBe(1);
      expect(await stock(e.p1)).toBe(18);
      expect(await prisma.movimientoCaja.count({ where: { referencia: idSolicitud(e.tenantId, op.operacionId) } })).toBe(1);
    });

    it('el mismo UUID con otro contenido NO se aplica ni sobrescribe: queda en revisión con conflicto OPERACION_ALTERADA', async () => {
      const e = await empresa();
      const v = await ventana(e);
      const op = operacion(e, v.id);
      await enviar(e, [op]);
      const [alterada] = (await enviar(e, [{ ...op, efectivoRecibidoCentavos: 9999, cambioCentavos: 7699 }])).resultados;
      expect(alterada.requiereRevision).toBe(true);
      expect(alterada.conflictos.map((c: any) => c.codigo)).toContain('OPERACION_ALTERADA');
      expect(await ventas(e.tenantId)).toBe(1);
      const fila = await prisma.operacionContingencia.findUniqueOrThrow({ where: { id: idSolicitud(e.tenantId, op.operacionId) } });
      expect(Number(fila.efectivoRecibidoCentavos)).toBe(2500);
    });

    it('envíos simultáneos del mismo UUID: una sola venta', async () => {
      const e = await empresa();
      const v = await ventana(e);
      const op = operacion(e, v.id);
      const resultados = await Promise.all([enviar(e, [op]), enviar(e, [op]), enviar(e, [op])]);
      const estados = resultados.map((r) => r.resultados[0].estado);
      expect(estados.every((s) => s === 'APLICADA')).toBe(true);
      expect(await ventas(e.tenantId)).toBe(1);
      expect(await stock(e.p1)).toBe(18);
    });

    it('dos operaciones con la misma secuencia local (UUID distintos) se conservan y quedan en revisión', async () => {
      const e = await empresa();
      const v = await ventana(e);
      const a = operacion(e, v.id);
      const b = { ...operacion(e, v.id), secuenciaLocal: a.secuenciaLocal, correlativoLocal: a.correlativoLocal };
      await enviar(e, [a]);
      const [resB] = (await enviar(e, [b])).resultados;
      expect(resB.conflictos.map((c: any) => c.codigo)).toContain('SECUENCIA_DUPLICADA');
      expect(resB.requiereRevision).toBe(true);
      expect(await prisma.operacionContingencia.count({ where: { tenantId: e.tenantId } })).toBe(2);
    });

    it('la operación con cuadre incorrecto (efectivo − cambio ≠ total) se revisa y no se aplica sola', async () => {
      const e = await empresa();
      const v = await ventana(e);
      const [res] = (await enviar(e, [operacion(e, v.id, { cambioCentavos: 100 })])).resultados;
      expect(res.estado).toBe('REVISION');
      expect(res.conflictos.map((c: any) => c.codigo)).toContain('EFECTIVO_INCONSISTENTE');
      expect(await ventas(e.tenantId)).toBe(0);
    });
  });

  describe('conflictos: precio, inventario, caja, usuario, reloj y límites', () => {
    it('el cajero cobra distinto al precio autorizado en la ventana: se aplica (el dinero es real) con revisión PRECIO_NO_AUTORIZADO', async () => {
      const e = await empresa();
      const v = await ventana(e);
      // Autorizado 10.00; cobrado 9.00 (2 × 9.00 = 18.00 + ISV 2.70 = 20.70; recibe 21.00, cambio 0.30).
      const op = operacion(e, v.id, { lineas: [{ productoId: e.p1, cantidadCentesimas: 200, precioCentavos: 900 }], subtotalCentavos: 1800, isvCentavos: 270, totalCentavos: 2070, efectivoRecibidoCentavos: 2100, cambioCentavos: 30 });
      const [res] = (await enviar(e, [op])).resultados;
      expect(res.estado).toBe('APLICADA');
      expect(res.requiereRevision).toBe(true);
      expect(res.conflictos.map((c: any) => c.codigo)).toContain('PRECIO_NO_AUTORIZADO');
      expect(await ventas(e.tenantId)).toBe(1);
    });

    it('cambiar el precio del catálogo después de emitir la ventana NO genera conflicto: vale el precio autorizado', async () => {
      const e = await empresa();
      const v = await ventana(e);
      await prisma.producto.update({ where: { id: e.p1 }, data: { precioVenta: 12 } });
      const [res] = (await enviar(e, [operacion(e, v.id)])).resultados;
      expect(res.estado).toBe('APLICADA');
      expect(res.requiereRevision).toBe(false);
      expect(res.conflictos).toEqual([]);
    });

    it('stock insuficiente en la nube: queda en revisión; no hay inventario negativo silencioso', async () => {
      const e = await empresa();
      const v = await ventana(e);
      await prisma.producto.update({ where: { id: e.p1 }, data: { stockActual: 1 } });
      const [res] = (await enviar(e, [operacion(e, v.id)])).resultados;
      expect(res.estado).toBe('REVISION');
      expect(res.conflictos.map((c: any) => c.codigo)).toContain('STOCK_INSUFICIENTE');
      expect(await stock(e.p1)).toBe(1);
      expect(await ventas(e.tenantId)).toBe(0);
    });

    it('caja cerrada durante la contingencia: no se toca el cierre; revisión y resolución con caja abierta', async () => {
      const e = await empresa();
      const v = await ventana(e);
      const cajaCerrada = await prisma.caja.findFirstOrThrow({ where: { tenantId: e.tenantId } });
      const cierreAntes = await prisma.caja.update({ where: { id: cajaCerrada.id }, data: { estado: 'CERRADA', montoCierreFisico: 100, fechaCierre: new Date() } });
      const op = operacion(e, v.id);
      const [res] = (await enviar(e, [op])).resultados;
      expect(res.conflictos.map((c: any) => c.codigo)).toContain('CAJA_CERRADA');
      expect(res.estado).toBe('REVISION');
      const otra = await prisma.caja.create({ data: { tenantId: e.tenantId, codigo: 'CAJA-2', usuarioId: e.admin, montoApertura: 0, estado: 'ABIERTA' } as any });
      const resuelta = await svc.resolver(e.tenantId, e.admin, op.operacionId, { accion: 'ACEPTAR', nota: 'Caja cerrada; efectivo se asigna a caja de conciliación', cajaId: otra.id } as any);
      expect(resuelta.estado).toBe('APLICADA');
      const movs = await prisma.movimientoCaja.findMany({ where: { referencia: idSolicitud(e.tenantId, op.operacionId) } });
      expect(movs[0].cajaId).toBe(otra.id);
      const cierreDespues = await prisma.caja.findUniqueOrThrow({ where: { id: cajaCerrada.id } });
      expect(cierreDespues.montoCierreFisico?.toString()).toBe(cierreAntes.montoCierreFisico?.toString());
      expect(await prisma.movimientoCaja.count({ where: { cajaId: cajaCerrada.id, referencia: idSolicitud(e.tenantId, op.operacionId) } })).toBe(0);
    });

    it('cajero desactivado durante la contingencia: se registra y queda en revisión; un administrador la acepta con auditoría', async () => {
      const e = await empresa();
      const v = await ventana(e);
      await prisma.usuario.update({ where: { id: e.cajero }, data: { activo: false } });
      const op = operacion(e, v.id);
      const [res] = (await enviar(e, [op])).resultados;
      expect(res.estado).toBe('REVISION');
      expect(res.conflictos.map((c: any) => c.codigo)).toContain('USUARIO_NO_AUTORIZADO');
      expect(await ventas(e.tenantId)).toBe(0);
      const final = await svc.resolver(e.tenantId, e.admin, op.operacionId, { accion: 'ACEPTAR', nota: 'Cajero desactivado; venta confirmada por administrador' } as any);
      expect(final.estado).toBe('APLICADA');
      expect(await prisma.auditoriaOperacion.count({ where: { tenantId: e.tenantId, operacion: 'CONTINGENCIA_RESOLVER', entidadId: idSolicitud(e.tenantId, op.operacionId) } })).toBe(1);
    });

    it('un cajero no puede enviar operaciones de otro cajero', async () => {
      const e = await empresa();
      const v = await ventana(e);
      const otro = randomUUID();
      await prisma.usuario.create({ data: { id: otro, tenantId: e.tenantId, nombre: 'otro', email: `${otro}@test.invalid`, passwordHash: 'x', rol: 'CAJERO', permisosConfigurados: false, permisos: [] } as any });
      await expect(svc.recibirLote(e.tenantId, otro, 'CAJERO', { dispositivoId: e.dispositivoId, pendientesRestantes: 0, operaciones: [operacion(e, v.id)] } as any))
        .resolves.toMatchObject({ resultados: [{ estado: 'RECHAZADA_TECNICA' }] });
      expect(await ventas(e.tenantId)).toBe(0);
    });

    it('venta fuera de la ventana revocada: se revisa con VENTANA_REVOCADA y se conserva', async () => {
      const e = await empresa();
      const v = await ventana(e);
      await svc.desactivarDispositivo(e.tenantId, e.admin, e.dispositivoId, 'Equipo retirado');
      // La venta ocurre después de la revocación: debe revisarse. Una venta anterior a la revocación sería válida.
      await prisma.contingenciaVentana.update({ where: { id: v.id }, data: { revocadaAt: new Date(Date.now() - 60_000) } });
      const [res] = (await enviar(e, [operacion(e, v.id)])).resultados;
      expect(res.conflictos.map((c: any) => c.codigo)).toContain('VENTANA_REVOCADA');
    });

    it('límite de venta excedido: conflicto blando, no rechazo', async () => {
      const e = await empresa();
      const v = await ventana(e);
      await prisma.tenant.update({ where: { id: e.tenantId }, data: { configuracion: { contingenciaOffline: { habilitada: true, montoMaxVentaCentavos: 1000 } } as any } });
      const v2 = await ventana(e);
      const [res] = (await enviar(e, [operacion(e, v2.id)])).resultados;
      expect(res.conflictos.map((c: any) => c.codigo)).toContain('LIMITE_VENTA_EXCEDIDO');
      expect(res.estado).toBe('APLICADA');
      expect(v.id).toBeTruthy();
    });
  });

  describe('DEF-01: precio aprobado como condición de la venta offline', () => {
    /** Producto adicional de la empresa con el estado de aprobación indicado. */
    const producto = (e: Awaited<ReturnType<typeof empresa>>, codigo: string, extra: Record<string, any> = {}) =>
      prisma.producto.create({ data: { tenantId: e.tenantId, codigo, nombre: codigo, precioVenta: 10, precioCosto: 4, stockActual: 20, precioAprobado: false, ...extra } as any });
    const opDe = (e: Awaited<ReturnType<typeof empresa>>, ventanaId: string, productoId: string) =>
      operacion(e, ventanaId, { lineas: [{ productoId, cantidadCentesimas: 200, precioCentavos: 1000 }] });
    /** Nada financiero ni de inventario cambió para la empresa. */
    async function sinEfectos(e: Awaited<ReturnType<typeof empresa>>, productoId: string, stockInicial = 20) {
      expect(await ventas(e.tenantId)).toBe(0);
      expect(await prisma.detalleVenta.count({ where: { productoId } })).toBe(0);
      expect(await stock(productoId)).toBe(stockInicial);
      expect(await prisma.movimientoInventario.count({ where: { tenantId: e.tenantId, productoId } })).toBe(0);
      const caja = await prisma.caja.findFirstOrThrow({ where: { tenantId: e.tenantId } });
      expect(await prisma.movimientoCaja.count({ where: { cajaId: caja.id, tipo: 'VENTA_POS' } })).toBe(0);
    }

    it('el catálogo solo incluye productos activos, aprobados y con precio positivo', async () => {
      const e = await empresa();
      const pendiente = await producto(e, 'PEN-1');
      const cero = await producto(e, 'CER-1', { precioAprobado: true, precioVenta: 0 });
      const inactivo = await producto(e, 'INA-1', { precioAprobado: true, activo: false });
      const r = await emitirRegistrada(svc, e.tenantId, e.cajero, { dispositivoId: e.dispositivoId });
      const ids = r.catalogo!.productos.map((p: any) => p.id);
      expect(ids).toEqual(expect.arrayContaining([e.p1, e.p2]));
      for (const id of [pendiente.id, cero.id, inactivo.id]) expect(ids).not.toContain(id);
      // El equipo no recibe la marca interna de aprobación ni el costo.
      expect(r.catalogo!.productos[0]).not.toHaveProperty('precioAprobado');
      expect(r.catalogo!.productos[0]).not.toHaveProperty('costoCentavos');
    });

    it('venta de un producto no aprobado al emitir la ventana: revisión DURA, sin venta, stock, caja ni documentos', async () => {
      const e = await empresa();
      const p = await producto(e, 'PEN-2');
      const v = await ventana(e);
      const [res] = (await enviar(e, [opDe(e, v.id, p.id)])).resultados;
      expect(res.estado).toBe('REVISION');
      expect(res.requiereRevision).toBe(true);
      expect(res.conflictos.map((c: any) => c.codigo)).toContain('PRODUCTO_FUERA_DE_VENTANA');
      await sinEfectos(e, p.id);
    });

    it('una aprobación posterior NO legitima la venta: reenvío, REINTENTAR y ACEPTAR siguen sin aplicarla', async () => {
      const e = await empresa();
      const p = await producto(e, 'PEN-3');
      const v = await ventana(e);
      const op = opDe(e, v.id, p.id);
      await enviar(e, [op]);
      await prisma.producto.update({ where: { id: p.id }, data: { precioAprobado: true, precioAprobadoAt: new Date() } });
      const [reenvio] = (await enviar(e, [op])).resultados;
      expect(reenvio.estado).toBe('REVISION');
      for (const accion of ['REINTENTAR', 'ACEPTAR'] as const) {
        const r = await svc.resolver(e.tenantId, e.admin, op.operacionId, { accion, nota: `intento ${accion} tras aprobar` } as any);
        expect(r.estado).toBe('REVISION');
        expect(r.conflictos.map((c: any) => c.codigo)).toContain('PRODUCTO_FUERA_DE_VENTANA');
      }
      await sinEfectos(e, p.id);
      // Cerrar manualmente solo cierra el caso: tampoco crea venta.
      const cerrada = await svc.resolver(e.tenantId, e.admin, op.operacionId, { accion: 'CERRAR_MANUAL', nota: 'descartada' } as any);
      expect(cerrada.estado).toBe('RESUELTA_MANUAL');
      await sinEfectos(e, p.id);
    });

    it('instantánea sin prueba de aprobación (formato anterior): se rechaza de forma explícita (R-01), queda como evidencia y no se puede forzar', async () => {
      const e = await empresa();
      const v = await ventana(e);
      const datos = { productos: [{ id: e.p1, codigo: 'TOR-1', nombre: 'Tornillo', precioCentavos: 1000, libreCentesimas: 2000, cupoCentesimas: 1000, usaMedida: false, unidadMedida: 'UNIDAD', costoCentavos: 400 }] };
      await prisma.catalogoInstantanea.create({ data: { tenantId: e.tenantId, hash: 'legado', datos: datos as any } });
      await prisma.contingenciaVentana.update({ where: { id: v.id }, data: { catalogoHash: 'legado' } });
      const op = operacion(e, v.id);
      const [res] = (await enviar(e, [op])).resultados;
      expect(res).toMatchObject({ estado: 'RECHAZADA_TECNICA', codigo: 'VENTANA_OBSOLETA' });
      await expect(svc.resolver(e.tenantId, e.admin, op.operacionId, { accion: 'ACEPTAR', nota: 'forzar' } as any)).rejects.toThrow(/rechazada nunca se aplica/);
      await sinEfectos(e, e.p1);
    });

    it('instantánea con la marca de aprobación pero precio no positivo (alterada): PRECIO_SIN_APROBACION no superable', async () => {
      const e = await empresa();
      const v = await ventana(e);
      const datos = { productos: [{ id: e.p1, codigo: 'TOR-1', nombre: 'Tornillo', precioAprobado: true, precioCentavos: 0, libreCentesimas: 2000, cupoCentesimas: 1000, usaMedida: false, unidadMedida: 'UNIDAD', costoCentavos: 400 }] };
      await prisma.catalogoInstantanea.create({ data: { tenantId: e.tenantId, hash: 'alterada', datos: datos as any } });
      await prisma.contingenciaVentana.update({ where: { id: v.id }, data: { catalogoHash: 'alterada' } });
      const op = operacion(e, v.id);
      const [res] = (await enviar(e, [op])).resultados;
      expect(res.estado).toBe('REVISION');
      expect(res.conflictos.map((c: any) => c.codigo)).toContain('PRECIO_SIN_APROBACION');
      const forzada = await svc.resolver(e.tenantId, e.admin, op.operacionId, { accion: 'ACEPTAR', nota: 'forzar' } as any);
      expect(forzada.estado).toBe('REVISION');
      await sinEfectos(e, e.p1);
    });

    it('una línea no aprobada rechaza toda la operación: la línea aprobada tampoco descuenta stock', async () => {
      const e = await empresa();
      const p = await producto(e, 'PEN-4');
      const v = await ventana(e);
      const op = operacion(e, v.id, {
        lineas: [{ productoId: e.p1, cantidadCentesimas: 100, precioCentavos: 1000 }, { productoId: p.id, cantidadCentesimas: 100, precioCentavos: 1000 }],
        subtotalCentavos: 2000, isvCentavos: 300, totalCentavos: 2300,
      });
      const [res] = (await enviar(e, [op])).resultados;
      expect(res.estado).toBe('REVISION');
      await sinEfectos(e, p.id);
      await sinEfectos(e, e.p1);
    });

    it('envíos simultáneos de una venta rechazada: una sola fila de diario y ningún efecto', async () => {
      const e = await empresa();
      const p = await producto(e, 'PEN-5');
      const v = await ventana(e);
      const op = opDe(e, v.id, p.id);
      await Promise.all([enviar(e, [op]), enviar(e, [op]), enviar(e, [op])]);
      expect(await prisma.operacionContingencia.count({ where: { id: idSolicitud(e.tenantId, op.operacionId) } })).toBe(1);
      await sinEfectos(e, p.id);
    });

    it('aprobación vigente al emitir y precio cambiado después: conserva el tratamiento acordado (se aplica sin conflicto)', async () => {
      const e = await empresa();
      const v = await ventana(e);
      await prisma.producto.update({ where: { id: e.p1 }, data: { precioVenta: 12, version: { increment: 1 } } });
      const [res] = (await enviar(e, [operacion(e, v.id)])).resultados;
      expect(res).toMatchObject({ estado: 'APLICADA', requiereRevision: false });
    });

    it('aprobación revocada después de emitir la ventana: se aplica con revisión APROBACION_REVOCADA_POSTERIOR', async () => {
      const e = await empresa();
      const v = await ventana(e);
      await prisma.producto.update({ where: { id: e.p1 }, data: { precioAprobado: false } });
      const [res] = (await enviar(e, [operacion(e, v.id)])).resultados;
      expect(res.estado).toBe('APLICADA');
      expect(res.requiereRevision).toBe(true);
      expect(res.conflictos.map((c: any) => c.codigo)).toContain('APROBACION_REVOCADA_POSTERIOR');
    });

    it('aislamiento: un producto aprobado de otra empresa no se vende por la ventana de esta', async () => {
      const a = await empresa();
      const b = await empresa();
      const va = await ventana(a);
      const [res] = (await enviar(a, [opDe(a, va.id, b.p1)])).resultados;
      expect(res.estado).toBe('REVISION');
      expect(res.conflictos.map((c: any) => c.codigo)).toContain('PRODUCTO_NO_ENCONTRADO');
      expect(await stock(b.p1)).toBe(20);
      expect(await ventas(b.tenantId)).toBe(0);
    });
  });

  describe('diario inmutable y aislamiento', () => {
    it('la carga recibida no puede modificarse ni borrarse en PostgreSQL', async () => {
      const e = await empresa();
      const v = await ventana(e);
      const op = operacion(e, v.id);
      await enviar(e, [op]);
      await expect(prisma.$executeRawUnsafe(`UPDATE operaciones_contingencia SET total_centavos=1 WHERE id=$1`, idSolicitud(e.tenantId, op.operacionId))).rejects.toThrow(/inmutable/);
      await expect(prisma.$executeRawUnsafe(`DELETE FROM operaciones_contingencia WHERE id=$1`, idSolicitud(e.tenantId, op.operacionId))).rejects.toThrow(/no admite borrados/);
      const fila = await prisma.operacionContingencia.findUniqueOrThrow({ where: { id: idSolicitud(e.tenantId, op.operacionId) } });
      expect(fila.totalCentavos).toBe(2300);
    });

    it('otra empresa no ve ni puede resolver las operaciones', async () => {
      const a = await empresa();
      const b = await empresa();
      const v = await ventana(a);
      const op = operacion(a, v.id);
      await enviar(a, [op]);
      const estados = await svc.estados(b.tenantId, b.admin, 'ADMIN', [op.operacionId]);
      expect(estados[0]).toEqual({ operacionId: op.operacionId, estado: 'NO_REGISTRADA' });
      await expect(svc.resolver(b.tenantId, b.admin, op.operacionId, { accion: 'ACEPTAR', nota: 'intento de otra empresa' } as any)).rejects.toMatchObject({ status: 404 });
    });

    it('el resumen indica que la información puede estar desactualizada si la caja no reporta', async () => {
      const e = await empresa();
      await prisma.dispositivoPos.update({ where: { id: idSolicitud(e.tenantId, e.dispositivoId) }, data: { ultimoContactoAt: new Date(Date.now() - 3600_000) } });
      const r = await svc.resumen(e.tenantId);
      expect(r.aviso).toMatch(/desactualizad/);
    });
  });

  describe('proveedores, compras y costos durante la contingencia', () => {
    it('la venta offline conserva el costo vigente al emitir la ventana aunque una compra lo cambie durante el corte', async () => {
      const e = await empresa();
      const proveedor = await prisma.proveedor.create({ data: { tenantId: e.tenantId, nombre: 'Distribuidora Norte' } });
      const v = await ventana(e); // costo del tornillo al emitir: 4.00
      // Durante el corte la oficina recibe una compra: costo 6.00 y 10 unidades más.
      const compra = await operaciones.compra(e.tenantId, e.admin, {
        solicitudId: randomUUID(), proveedorId: proveedor.id, numeroFactura: 'FAC-CORTE-1', isv: 0,
        items: [{ productoId: e.p1, cantidad: 10, costo: 6 }],
      } as any);
      const detalle = await prisma.detalleOrdenCompra.findFirstOrThrow({ where: { ordenId: compra.id } });
      await operaciones.recibir(e.tenantId, e.admin, compra.id, { solicitudId: randomUUID(), items: [{ detalleId: detalle.id, cantidad: 10 }] } as any);
      expect(Number((await prisma.producto.findUniqueOrThrow({ where: { id: e.p1 } })).precioCosto)).toBe(6);
      expect(await stock(e.p1)).toBe(30);
      // La recepción actualiza la asociación producto–proveedor con el último costo.
      const asociacion = () => prisma.productoProveedor.findFirstOrThrow({ where: { tenantId: e.tenantId, productoId: e.p1, proveedorId: proveedor.id } });
      expect(Number((await asociacion()).ultimoCosto)).toBe(6);

      // La caja vende 2 unidades con el catálogo de la ventana.
      const [res] = (await enviar(e, [operacion(e, v.id)])).resultados;
      expect(res.estado).toBe('APLICADA');
      const [linea] = await prisma.detalleVenta.findMany({ where: { ventaId: res.ventaId } });
      expect(Number(linea.costoUnitario)).toBe(4);
      expect(await stock(e.p1)).toBe(28);
      // La venta offline no modifica la asociación con el proveedor.
      expect(Number((await asociacion()).ultimoCosto)).toBe(6);
      // El equipo nunca recibe el costo.
      const { catalogo } = await emitirRegistrada(svc, e.tenantId, e.cajero, { dispositivoId: e.dispositivoId });
      expect(JSON.stringify(catalogo)).not.toMatch(/costoCentavos|precioCosto/);
    });

    it('el mismo producto vendido después de la compra usa el costo nuevo (la instantánea nueva lo refleja)', async () => {
      const e = await empresa();
      await prisma.producto.update({ where: { id: e.p1 }, data: { precioCosto: 6 } });
      const v = await ventana(e);
      const [res] = (await enviar(e, [operacion(e, v.id)])).resultados;
      expect(res.estado).toBe('APLICADA');
      const [linea] = await prisma.detalleVenta.findMany({ where: { ventaId: res.ventaId } });
      expect(Number(linea.costoUnitario)).toBe(6);
    });
  });

  // ───────────── Correcciones finales: DEF-04 (propiedad de la ventana), R-01 (ventanas anteriores), R-02 (cierre manual) ─────────────
  describe('DEF-04: la ventana pertenece al cajero que la pidió', () => {
    async function conSegundoCajero() {
      const e = await empresa();
      const cajero2 = randomUUID();
      await prisma.usuario.create({ data: { id: cajero2, tenantId: e.tenantId, nombre: 'Cajero 2', email: `${cajero2}@test.invalid`, passwordHash: 'x', rol: 'CAJERO', permisosConfigurados: false, permisos: [] } as any });
      const caja2 = await prisma.caja.create({ data: { tenantId: e.tenantId, codigo: 'CAJA-2', usuarioId: cajero2, montoApertura: 50, estado: 'ABIERTA' } as any });
      return { ...e, cajero2, caja2: caja2.id };
    }
    const movimientos = (cajaId: string) => prisma.movimientoCaja.count({ where: { cajaId } });

    // H-5: el rechazo por ventana ajena no crea fila (una fila RECHAZADA a nombre de quien envía bloquearía al dueño). Queda evidencia.
    it('un cajero con la ventana de otro: rechazo definitivo, sin venta, sin movimiento en ninguna caja y sin cambio de stock; solo evidencia para el remitente', async () => {
      const e = await conSegundoCajero();
      const v = await ventana(e); // la pidió el cajero 1
      const caja1 = (await prisma.caja.findFirstOrThrow({ where: { tenantId: e.tenantId, usuarioId: e.cajero } })).id;
      const [a, b] = [await movimientos(caja1), await movimientos(e.caja2)];
      const op = operacion(e, v.id, { cajeroId: e.cajero2 });
      const res = await svc.recibirLote(e.tenantId, e.cajero2, 'CAJERO', { dispositivoId: e.dispositivoId, pendientesRestantes: 0, operaciones: [op] } as any);
      expect(res.resultados[0]).toMatchObject({ operacionId: op.operacionId, estado: 'RECHAZADA_TECNICA', codigo: 'CAJERO_NO_AUTORIZADO' });
      expect(await ventas(e.tenantId)).toBe(0);
      expect(await stock(e.p1)).toBe(20);
      expect([await movimientos(caja1), await movimientos(e.caja2)]).toEqual([a, b]);
      // Sin fila: el UUID del cajero 1 no queda a nombre del cajero 2. La evidencia queda solo para el remitente.
      expect(await prisma.operacionContingencia.findFirst({ where: { tenantId: e.tenantId, id: { in: [idSolicitud(e.tenantId, op.operacionId), op.operacionId] } } })).toBeNull();
      expect(await prisma.auditoriaOperacion.count({ where: { tenantId: e.tenantId, operacion: 'CONTINGENCIA_OPERACION_NO_REGISTRADA', entidadId: idSolicitud(e.tenantId, op.operacionId), usuarioId: e.cajero2 } })).toBe(1);
      // El reintento responde lo mismo y no duplica nada.
      const otra = await svc.recibirLote(e.tenantId, e.cajero2, 'CAJERO', { dispositivoId: e.dispositivoId, pendientesRestantes: 0, operaciones: [op] } as any);
      expect(otra.resultados[0]).toMatchObject({ estado: 'RECHAZADA_TECNICA', codigo: 'CAJERO_NO_AUTORIZADO' });
      expect(await prisma.operacionContingencia.count({ where: { tenantId: e.tenantId } })).toBe(0);
      // Sin fila no hay nada que forzar ni reintentar: el administrador recibe «no encontrada».
      await expect(svc.resolver(e.tenantId, e.admin, op.operacionId, { accion: 'ACEPTAR', nota: 'Intento de forzar una operación rechazada' } as any)).rejects.toThrow();
      await expect(svc.resolver(e.tenantId, e.admin, op.operacionId, { accion: 'REINTENTAR', nota: 'Intento de reintentar una operación rechazada' } as any)).rejects.toThrow();
      expect(await ventas(e.tenantId)).toBe(0);
      // H-5: el cajero dueño de la ventana conserva la capacidad de cobrar esa misma operación.
      const duenio = (await svc.recibirLote(e.tenantId, e.cajero, 'CAJERO', { dispositivoId: e.dispositivoId, pendientesRestantes: 0, operaciones: [{ ...op, cajeroId: e.cajero }] } as any)).resultados[0];
      expect(duenio).toMatchObject({ operacionId: op.operacionId, estado: 'APLICADA' });
      expect(await ventas(e.tenantId)).toBe(1);
    });

    it('el cajero dueño de la ventana sí cobra en su caja; un administrador puede enviar la operación del cajero dueño', async () => {
      const e = await conSegundoCajero();
      const v = await ventana(e);
      const r1 = (await enviar(e, [operacion(e, v.id)])).resultados[0];
      expect(r1.estado).toBe('APLICADA');
      const r2 = (await svc.recibirLote(e.tenantId, e.admin, 'ADMIN', { dispositivoId: e.dispositivoId, pendientesRestantes: 0, operaciones: [operacion(e, v.id)] } as any)).resultados[0];
      expect(r2.estado).toBe('APLICADA');
      const caja1 = (await prisma.caja.findFirstOrThrow({ where: { tenantId: e.tenantId, usuarioId: e.cajero } })).id;
      expect(await prisma.venta.count({ where: { tenantId: e.tenantId, cajaId: caja1 } })).toBe(2);
      expect(await prisma.venta.count({ where: { tenantId: e.tenantId, cajaId: e.caja2 } })).toBe(0);
    });

    it('si la caja de la ventana no es del cajero (dato alterado), se rechaza igual sin efectos', async () => {
      const e = await conSegundoCajero();
      const v = await ventana(e);
      await prisma.contingenciaVentana.update({ where: { id: v.id }, data: { cajaId: e.caja2 } });
      const res = (await enviar(e, [operacion(e, v.id)])).resultados[0];
      expect(res).toMatchObject({ estado: 'RECHAZADA_TECNICA', codigo: 'CAJA_DE_VENTANA_NO_VALIDA' });
      expect(await ventas(e.tenantId)).toBe(0);
      expect(await movimientos(e.caja2)).toBe(0);
    });

    it('otra empresa no puede usar la ventana ni el dispositivo (404/ventana desconocida) y no deja rastro en la empresa dueña', async () => {
      const a = await empresa(); const b = await empresa();
      const v = await ventana(a);
      const res = (await svc.recibirLote(b.tenantId, b.cajero, 'CAJERO', { dispositivoId: b.dispositivoId, pendientesRestantes: 0, operaciones: [operacion(b, v.id)] } as any)).resultados[0];
      expect(res.estado).toBe('RECHAZADA_TECNICA');
      expect(await ventas(a.tenantId)).toBe(0);
      expect(await prisma.operacionContingencia.count({ where: { tenantId: a.tenantId } })).toBe(0);
    });
  });

  describe('R-01: ventanas anteriores a DEF-01', () => {
    /** Deja la instantánea de la ventana como la guardaba la versión anterior: sin la marca de precio aprobado. */
    async function volverVentanaAnterior(tenantId: string, ventanaId: string) {
      const v = await prisma.contingenciaVentana.findUniqueOrThrow({ where: { id: ventanaId } });
      const snap = await prisma.catalogoInstantanea.findUniqueOrThrow({ where: { tenantId_hash: { tenantId, hash: v.catalogoHash } } });
      const productos = ((snap.datos as any).productos as any[]).map(({ precioAprobado: _a, ...resto }) => resto);
      const hash = `anterior-${randomUUID()}`;
      await prisma.catalogoInstantanea.create({ data: { tenantId, hash, datos: { productos } as any } });
      await prisma.contingenciaVentana.update({ where: { id: ventanaId }, data: { catalogoHash: hash } });
    }

    it('una operación de una ventana anterior se rechaza de forma explícita, se conserva como evidencia y no queda atrapada en revisión', async () => {
      const e = await empresa();
      const v = await ventana(e);
      await volverVentanaAnterior(e.tenantId, v.id);
      const cajaId = (await prisma.caja.findFirstOrThrow({ where: { tenantId: e.tenantId, usuarioId: e.cajero } })).id;
      const efectivoAntes = await prisma.movimientoCaja.count({ where: { cajaId } });
      const op = operacion(e, v.id);
      const res = (await enviar(e, [op])).resultados[0];
      expect(res).toMatchObject({ estado: 'RECHAZADA_TECNICA', codigo: 'VENTANA_OBSOLETA' });
      expect(res.mensaje).toMatch(/Solicite una ventana nueva/);
      expect(await ventas(e.tenantId)).toBe(0);
      expect(await stock(e.p1)).toBe(20);
      expect(await prisma.movimientoCaja.count({ where: { cajaId } })).toBe(efectivoAntes);
      const fila = await prisma.operacionContingencia.findUniqueOrThrow({ where: { id: idSolicitud(e.tenantId, op.operacionId) } });
      expect(fila.estado).toBe('RECHAZADA');
      expect((fila.conflictos as any[]).map((c) => c.codigo)).toEqual(['VENTANA_OBSOLETA']);
      expect((fila.payload as any).totalCentavos).toBe(2300); // evidencia completa para conciliar
      // Salida explícita: el administrador la ve y la cierra conciliando el efectivo (R-02).
      const lista = await svc.listar(e.tenantId, { soloRevision: true });
      expect(lista.map((x: any) => [x.operacionId, x.estado])).toEqual([[idSolicitud(e.tenantId, op.operacionId), 'RECHAZADA']]);
      const cierre: any = await svc.resolver(e.tenantId, e.admin, op.operacionId, { accion: 'CERRAR_MANUAL', nota: 'Venta física verificada; efectivo en caja' } as any);
      expect(cierre.estado).toBe('RESUELTA_MANUAL');
      expect(cierre.conciliacionCaja.monto).toBe(23);
      // F-01: el cierre devuelve la mercancía pendiente de conciliar físicamente, sin tocar existencias ni crear venta.
      expect(cierre.inventarioPendiente).toEqual([expect.objectContaining({ productoId: e.p1, codigo: 'TOR-1', cantidad: 2 })]);
      expect(await stock(e.p1)).toBe(20);
      expect(await ventas(e.tenantId)).toBe(0);
      const auditoria = await prisma.auditoriaOperacion.findFirstOrThrow({ where: { tenantId: e.tenantId, operacion: 'CONTINGENCIA_INVENTARIO_PENDIENTE', entidadId: idSolicitud(e.tenantId, op.operacionId) } });
      expect((auditoria.datos as any).existenciasModificadas).toBe(false);
    });

    it('O-02: la consulta posterior repite estado, código e instrucción de la primera respuesta mientras la operación siga rechazada', async () => {
      const e = await empresa();
      const v = await ventana(e);
      await volverVentanaAnterior(e.tenantId, v.id);
      const op = operacion(e, v.id);
      const primera = (await enviar(e, [op])).resultados[0];
      const consulta = (await svc.estados(e.tenantId, e.cajero, 'CAJERO', [op.operacionId]))[0];
      expect(primera).toMatchObject({ estado: 'RECHAZADA_TECNICA', codigo: 'VENTANA_OBSOLETA' });
      expect(consulta).toMatchObject({ estado: primera.estado, codigo: primera.codigo, mensaje: primera.mensaje, instruccion: primera.instruccion });
      expect(primera.instruccion).toMatch(/Solicite una ventana nueva/);
    });

    it('al pedir una ventana nueva se revocan las anteriores incompatibles, no las vigentes', async () => {
      const e = await empresa();
      const vieja = await ventana(e);
      await volverVentanaAnterior(e.tenantId, vieja.id);
      const nueva = await ventana(e);
      expect((await prisma.contingenciaVentana.findUniqueOrThrow({ where: { id: vieja.id } })).revocadaAt).not.toBeNull();
      expect((await prisma.contingenciaVentana.findUniqueOrThrow({ where: { id: nueva.id } })).revocadaAt).toBeNull();
      const otra = await ventana(e);
      expect((await prisma.contingenciaVentana.findUniqueOrThrow({ where: { id: nueva.id } })).revocadaAt).toBeNull();
      expect(otra.id).not.toBe(nueva.id);
      // La ventana nueva sigue vendiendo.
      expect((await enviar(e, [operacion(e, nueva.id)])).resultados[0].estado).toBe('APLICADA');
    });

    it('una operación ya recibida antes (reintento) no se rechaza por haberse vuelto obsoleta la ventana: se responde lo ya registrado', async () => {
      const e = await empresa();
      const v = await ventana(e);
      const op = operacion(e, v.id);
      expect((await enviar(e, [op])).resultados[0].estado).toBe('APLICADA');
      await volverVentanaAnterior(e.tenantId, v.id);
      const again = (await enviar(e, [op])).resultados[0];
      expect(again.estado).toBe('APLICADA');
      expect(await ventas(e.tenantId)).toBe(1);
    });
  });

  describe('R-02: el cierre manual no oculta el efectivo cobrado', () => {
    /** Operación no aplicable: pide más unidades que las existentes → REVISION por stock insuficiente. */
    const operacionEnRevision = (e: any, ventanaId: string) => operacion(e, ventanaId, {
      lineas: [{ productoId: e.p1, cantidadCentesimas: 5000, precioCentavos: 1000 }],
      subtotalCentavos: 50000, isvCentavos: 7500, totalCentavos: 57500, efectivoRecibidoCentavos: 60000, cambioCentavos: 2500,
    });
    const efectivoEsperado = async (cajaId: string) => {
      const c = await prisma.caja.findUniqueOrThrow({ where: { id: cajaId } });
      const m = await prisma.movimientoCaja.findMany({ where: { cajaId, metodo: 'EFECTIVO' } });
      return Number(c.montoApertura) + m.reduce((s, x) => s + Number(x.monto), 0);
    };

    it('cerrar sin vender registra un ingreso de conciliación en la caja del cajero, con referencia a la operación, sin crear venta ni tocar inventario', async () => {
      const e = await empresa();
      const v = await ventana(e);
      const op = operacionEnRevision(e, v.id);
      const r = (await enviar(e, [op])).resultados[0];
      expect(r.estado).toBe('REVISION');
      const cajaId = (await prisma.caja.findFirstOrThrow({ where: { tenantId: e.tenantId, usuarioId: e.cajero } })).id;
      const antes = await efectivoEsperado(cajaId);
      const cierre: any = await svc.resolver(e.tenantId, e.admin, op.operacionId, { accion: 'CERRAR_MANUAL', nota: 'Venta física verificada con el cliente' } as any);
      expect(cierre.estado).toBe('RESUELTA_MANUAL');
      expect(cierre.conciliacionCaja).toMatchObject({ cajaId, monto: 575, reutilizado: false });
      expect(await efectivoEsperado(cajaId)).toBe(antes + 575);
      const mov = await prisma.movimientoCaja.findMany({ where: { cajaId, tipo: 'INGRESO_MANUAL' } });
      expect(mov).toHaveLength(1);
      expect(mov[0]).toMatchObject({ referencia: idSolicitud(e.tenantId, op.operacionId), usuarioId: e.admin });
      expect(mov[0].concepto).toMatch(/Conciliación contingencia .* efectivo cobrado sin venta aplicada/);
      expect(await ventas(e.tenantId)).toBe(0);
      expect(await stock(e.p1)).toBe(20);
      expect(await prisma.auditoriaOperacion.count({ where: { tenantId: e.tenantId, operacion: 'CONTINGENCIA_CONCILIAR_EFECTIVO' } })).toBe(1);
      // Un segundo cierre no duplica el ingreso.
      await expect(svc.resolver(e.tenantId, e.admin, op.operacionId, { accion: 'CERRAR_MANUAL', nota: 'Segundo cierre accidental' } as any)).rejects.toThrow(/ya está resuelta/);
      expect(await prisma.movimientoCaja.count({ where: { cajaId, tipo: 'INGRESO_MANUAL' } })).toBe(1);
    });

    it('sin caja abierta no se puede cerrar: la operación sigue en revisión y no se registra nada', async () => {
      const e = await empresa();
      const v = await ventana(e);
      const op = operacionEnRevision(e, v.id);
      await enviar(e, [op]);
      await prisma.caja.updateMany({ where: { tenantId: e.tenantId }, data: { estado: 'CERRADA' } });
      await expect(svc.resolver(e.tenantId, e.admin, op.operacionId, { accion: 'CERRAR_MANUAL', nota: 'Intento sin caja abierta' } as any)).rejects.toThrow(/Abra una caja/);
      const fila = await prisma.operacionContingencia.findUniqueOrThrow({ where: { id: idSolicitud(e.tenantId, op.operacionId) } });
      expect(fila.estado).toBe('REVISION');
      expect(await prisma.movimientoCaja.count({ where: { tipo: 'INGRESO_MANUAL', referencia: fila.id } })).toBe(0);
      // Con una caja abierta indicada explícitamente (otra del administrador) sí se concilia.
      const cajaAdmin = await prisma.caja.create({ data: { tenantId: e.tenantId, codigo: 'CAJA-ADM', usuarioId: e.admin, montoApertura: 0, estado: 'ABIERTA' } as any });
      const cierre: any = await svc.resolver(e.tenantId, e.admin, op.operacionId, { accion: 'CERRAR_MANUAL', nota: 'Conciliado en la caja del administrador', cajaId: cajaAdmin.id } as any);
      expect(cierre.conciliacionCaja.cajaId).toBe(cajaAdmin.id);
    });

    it('una caja de otra empresa o cerrada no sirve para conciliar', async () => {
      const a = await empresa(); const b = await empresa();
      const v = await ventana(a);
      const op = operacionEnRevision(a, v.id);
      await enviar(a, [op]);
      const cajaB = (await prisma.caja.findFirstOrThrow({ where: { tenantId: b.tenantId } })).id;
      await expect(svc.resolver(a.tenantId, a.admin, op.operacionId, { accion: 'CERRAR_MANUAL', nota: 'Caja de otra empresa', cajaId: cajaB } as any)).rejects.toThrow(/no existe o está cerrada/);
      expect(await prisma.movimientoCaja.count({ where: { cajaId: cajaB } })).toBe(0);
    });
  });
});
