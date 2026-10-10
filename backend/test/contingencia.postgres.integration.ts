import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { ContingenciaService } from '../src/contingencia/contingencia.service';

// POS offline de contingencia contra PostgreSQL real: cadena completa de migraciones, clúster temporal exclusivo.
// Nunca lee DATABASE_URL. Ejecutar como usuario no root (initdb lo exige).
describe('Contingencia offline / PostgreSQL aislado', () => {
  const bin = process.env.PG_BIN || '/usr/lib/postgresql/16/bin';
  const exe = (name: string) => join(bin, name);
  let directory = '';
  let started = false;
  let prisma: PrismaService;
  let svc: ContingenciaService;

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
    const p1 = await prisma.producto.create({ data: { tenantId, codigo: 'TOR-1', nombre: 'Tornillo', precioVenta: 10, precioCosto: 4, stockActual: 20 } as any });
    const p2 = await prisma.producto.create({ data: { tenantId, codigo: 'BIS-1', nombre: 'Bisagra', precioVenta: 25.5, precioCosto: 10, stockActual: 8 } as any });
    const dispositivoId = randomUUID();
    if (hab) await svc.registrarDispositivo(tenantId, cajero, { dispositivoId, nombre: 'Caja principal' });
    else await prisma.dispositivoPos.create({ data: { id: dispositivoId, tenantId, codigo: '01', nombre: 'Caja principal', registradoPor: admin } });
    return { tenantId, admin, cajero, p1: p1.id, p2: p2.id, dispositivoId };
  }

  /** Emite la ventana y devuelve la instantánea. */
  async function ventana(e: Awaited<ReturnType<typeof empresa>>) {
    const r = await svc.emitirVentana(e.tenantId, e.cajero, { dispositivoId: e.dispositivoId });
    return r.ventana;
  }

  /** Operación de un TOR-1 × 2 (20.00) + ISV 3.00 = 23.00, recibe 25.00, cambio 2.00. */
  function operacion(e: Awaited<ReturnType<typeof empresa>>, ventanaId: string, extra: Partial<Record<string, any>> = {}) {
    const n = ++contador;
    return {
      operacionId: randomUUID(), dispositivoId: e.dispositivoId, ventanaId, secuenciaLocal: n,
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
      await expect(svc.emitirVentana(e.tenantId, e.cajero, { dispositivoId: e.dispositivoId })).rejects.toBeInstanceOf(ForbiddenException);
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
      const r = await svc.emitirVentana(e.tenantId, e.cajero, { dispositivoId: e.dispositivoId });
      const tor = r.catalogo!.productos.find((p: any) => p.id === e.p1);
      expect(tor).toMatchObject({ precioCentavos: 1000, libreCentesimas: 2000, cupoCentesimas: 1000 });
      expect(r.ventana.vigenteHasta.getTime()).toBeGreaterThan(Date.now() + 35 * 3_600_000);
    });

    it('si el dispositivo ya tiene el catálogo, no se reenvía', async () => {
      const e = await empresa();
      const primera = await svc.emitirVentana(e.tenantId, e.cajero, { dispositivoId: e.dispositivoId });
      const segunda = await svc.emitirVentana(e.tenantId, e.cajero, { dispositivoId: e.dispositivoId, catalogoHashActual: primera.ventana.catalogoHash });
      expect(segunda.catalogo).toBeNull();
    });

    it('sin caja abierta no hay ventana', async () => {
      const e = await empresa();
      await prisma.caja.updateMany({ where: { tenantId: e.tenantId }, data: { estado: 'CERRADA' } });
      await expect(svc.emitirVentana(e.tenantId, e.cajero, { dispositivoId: e.dispositivoId })).rejects.toMatchObject({ status: 409 });
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
      const venta = await prisma.venta.findUniqueOrThrow({ where: { id: op.operacionId } });
      expect(venta).toMatchObject({ origen: 'CONTINGENCIA', estado: 'COMPLETADA', metodoPago: 'EFECTIVO', correlativoLocal: op.correlativoLocal });
      expect(Number(venta.total)).toBe(23);
      expect(Number(venta.efectivoRecibido)).toBe(25);
      expect(Number(venta.cambio)).toBe(2);
      expect(await stock(e.p1)).toBe(18);
      const mov = await prisma.movimientoCaja.findMany({ where: { referencia: op.operacionId } });
      expect(mov).toHaveLength(1);
      expect(mov[0]).toMatchObject({ tipo: 'VENTA_POS', metodo: 'EFECTIVO' });
      expect(Number(mov[0].monto)).toBe(23);
      expect(await prisma.auditoriaOperacion.count({ where: { tenantId: e.tenantId, operacion: 'CONTINGENCIA_APLICAR', entidadId: op.operacionId } })).toBe(1);
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
      expect(await prisma.movimientoCaja.count({ where: { referencia: op.operacionId } })).toBe(1);
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
      const fila = await prisma.operacionContingencia.findUniqueOrThrow({ where: { id: op.operacionId } });
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
      const movs = await prisma.movimientoCaja.findMany({ where: { referencia: op.operacionId } });
      expect(movs[0].cajaId).toBe(otra.id);
      const cierreDespues = await prisma.caja.findUniqueOrThrow({ where: { id: cajaCerrada.id } });
      expect(cierreDespues.montoCierreFisico?.toString()).toBe(cierreAntes.montoCierreFisico?.toString());
      expect(await prisma.movimientoCaja.count({ where: { cajaId: cajaCerrada.id, referencia: op.operacionId } })).toBe(0);
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
      expect(await prisma.auditoriaOperacion.count({ where: { tenantId: e.tenantId, operacion: 'CONTINGENCIA_RESOLVER', entidadId: op.operacionId } })).toBe(1);
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

  describe('diario inmutable y aislamiento', () => {
    it('la carga recibida no puede modificarse ni borrarse en PostgreSQL', async () => {
      const e = await empresa();
      const v = await ventana(e);
      const op = operacion(e, v.id);
      await enviar(e, [op]);
      await expect(prisma.$executeRawUnsafe(`UPDATE operaciones_contingencia SET total_centavos=1 WHERE id=$1`, op.operacionId)).rejects.toThrow(/inmutable/);
      await expect(prisma.$executeRawUnsafe(`DELETE FROM operaciones_contingencia WHERE id=$1`, op.operacionId)).rejects.toThrow(/no admite borrados/);
      const fila = await prisma.operacionContingencia.findUniqueOrThrow({ where: { id: op.operacionId } });
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
      await prisma.dispositivoPos.update({ where: { id: e.dispositivoId }, data: { ultimoContactoAt: new Date(Date.now() - 3600_000) } });
      const r = await svc.resumen(e.tenantId);
      expect(r.aviso).toMatch(/desactualizad/);
    });
  });
});
