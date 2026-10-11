import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { ContingenciaService, claveDeOperaciones, sanearParaJsonb } from '../src/contingencia/contingencia.service';
import { operacionEmitida } from '../src/contingencia/operaciones-emitidas';
import { idSolicitud } from '../src/operaciones/ledger';
import { emitirRegistrada, siguienteOperacion } from './helpers/operaciones-emitidas';

// H5 (CENTINELA): errores HTTP 4xx antes de registrar la operación no deben dejar operaciones sin rastro en el servidor.


describe('Contingencia texto seguro: surrogates, invisibles, evidencia y entradas sin DTO (CENTINELA sobre 826a6e16) / PostgreSQL aislado', () => {
  const bin = process.env.PG_BIN || '/usr/lib/postgresql/16/bin';
  const exe = (name: string) => join(bin, name);
  let directory = '';
  let started = false;
  let prisma: PrismaService;
  let svc: ContingenciaService;
  let port = 0;

  beforeAll(async () => {
    if (!existsSync(exe('initdb'))) throw new Error(`PostgreSQL no instalado en ${bin}`);
    process.env.POS_OFFLINE_ENABLED = 'true';
    directory = mkdtempSync(join(tmpdir(), 'ferresystem-contingencia-texto-'));
    const listener = createServer();
    await new Promise<void>((done, reject) => { listener.once('error', reject); listener.listen(0, '127.0.0.1', done); });
    port = (listener.address() as { port: number }).port;
    await new Promise<void>((done) => listener.close(() => done()));
    const url = `postgresql://postgres@127.0.0.1:${port}/postgres`;
    const options = { windowsHide: true, timeout: 60000, stdio: 'pipe' as const };
    execFileSync(exe('initdb'), ['-D', join(directory, 'data'), '-U', 'postgres', '-A', 'trust', '--locale=C', '-E', 'UTF8', '--no-sync'], options);
    execFileSync(exe('pg_ctl'), ['-D', join(directory, 'data'), '-l', join(directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -k ${directory}`, '-w', 'start'], { ...options, stdio: 'ignore' });
    started = true;
    // Base completa: todas las migraciones en orden.
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
      if (directory && resolve(directory).startsWith(resolve(tmpdir()) + sep) && directory.includes('ferresystem-contingencia-texto-')) {
        rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
      }
    }
  });

  async function empresa() {
    const equipoId = randomUUID();
    const tenantId = randomUUID();
    const admin = randomUUID();
    const cajero = randomUUID();
    await prisma.tenant.create({ data: { id: tenantId, nombreComercial: 'Ferretería migración', estado: 'ACTIVO', configuracion: { contingenciaOffline: { habilitada: true } } as any } });
    for (const [id, rol] of [[admin, 'ADMIN'], [cajero, 'CAJERO']] as const) {
      await prisma.usuario.create({ data: { id, tenantId, nombre: rol, email: `${id}@test.invalid`, passwordHash: 'x', rol, permisosConfigurados: false, permisos: [] } as any });
    }
    const caja = await prisma.caja.create({ data: { tenantId, codigo: 'CAJA-1', usuarioId: cajero, montoApertura: 100, estado: 'ABIERTA' } as any });
    const p1 = await prisma.producto.create({ data: { precioAprobado: true, tenantId, codigo: 'TOR-1', nombre: 'Tornillo', precioVenta: 10, precioCosto: 4, stockActual: 20 } as any });
    await svc.registrarDispositivo(tenantId, cajero, { dispositivoId: equipoId, nombre: 'Caja principal' });
    const { ventana } = await emitirRegistrada(svc, tenantId, cajero, { dispositivoId: equipoId });
    // La FK de la operación apunta al id interno del dispositivo, no al identificador que envía el equipo.
    const interno = await prisma.dispositivoPos.findFirstOrThrow({ where: { tenantId } });
    return { tenantId, admin, cajero, cajaId: caja.id, p1: p1.id, equipoId, dispositivoId: interno.id, ventanaId: ventana.id as string };
  }

  let secuencia = 0;
  /** Fila legada tal como la dejó la forma anterior: estado y conflictos explícitos, sin venta. */
  async function filaLegada(e: Awaited<ReturnType<typeof empresa>>, estado: string, conflictos: unknown[], resolucion: unknown = null, usuarioId: string = e.cajero) {
    const id = randomUUID();
    secuencia += 1;
    await prisma.$executeRawUnsafe(
      `INSERT INTO operaciones_contingencia (id,tenant_id,dispositivo_id,ventana_id,usuario_id,caja_id,secuencia_local,correlativo_local,
        ocurrido_at_local,ocurrido_at_estimado,payload,payload_hash,total_centavos,efectivo_recibido_centavos,estado,requiere_revision,conflictos,resolucion)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW(),$9::jsonb,$10,2300,2500,$11,true,$12::jsonb,$13::jsonb)`,
      id, e.tenantId, e.dispositivoId, e.ventanaId, usuarioId, e.cajaId, 1000 + secuencia, `CT-01-L${secuencia}`,
      JSON.stringify({ totalCentavos: 2300, efectivoRecibidoCentavos: 2500, lineas: [{ productoId: e.p1, cantidadCentesimas: 200, precioCentavos: 1000 }] }),
      `hash-${id}`, estado, JSON.stringify(conflictos), resolucion === null ? null : JSON.stringify(resolucion),
    );
    return id;
  }

  const obsoleta = [{ codigo: 'VENTANA_OBSOLETA', severidad: 'DURO', detalle: { mensaje: 'Ventana anterior' } }];
  const otroCajero = [{ codigo: 'VENTANA_DE_OTRO_CAJERO', severidad: 'DURO', detalle: { mensaje: 'Ventana de otro cajero' } }];
  const stock = [{ codigo: 'STOCK_INSUFICIENTE', severidad: 'DURO', detalle: {} }];

  let contador = 0;
  const operacion = (e: any, extra: Record<string, any> = {}) => {
    const n = ++contador;
    return {
      ...siguienteOperacion(e.ventanaId), dispositivoId: e.equipoId, ventanaId: e.ventanaId, secuenciaLocal: 900 + n,
      correlativoLocal: `CT-01-${String(n).padStart(4, '0')}`, ocurridoAtLocal: new Date().toISOString(), cajeroId: e.cajero,
      lineas: [{ productoId: e.p1, cantidadCentesimas: 200, precioCentavos: 1000 }],
      subtotalCentavos: 2000, isvCentavos: 300, totalCentavos: 2300, efectivoRecibidoCentavos: 2500, cambioCentavos: 200,
      esquemaVersion: 1, ...extra,
    };
  };
  const recibir = (e: any, ops: any[], usuario = e.cajero, rol = 'CAJERO') =>
    svc.recibirLote(e.tenantId, usuario, rol, { dispositivoId: e.equipoId, pendientesRestantes: 0, operaciones: ops } as any);
  const ventasDe = async (tenantId: string) => (await prisma.$queryRawUnsafe<any[]>(`SELECT COUNT(*)::int AS n FROM ventas WHERE tenant_id='${tenantId}'`))[0].n;
  const filaDe = (tenantId: string, operacionId: string) => prisma.operacionContingencia.findFirst({ where: { tenantId, id: { in: [idSolicitud(tenantId, operacionId), operacionId] } } });

  /** Segundo cajero del mismo equipo, con caja abierta y ventana propia. */
  async function segundoCajero(e: Awaited<ReturnType<typeof empresa>>) {
    const id = randomUUID();
    await prisma.usuario.create({ data: { id, tenantId: e.tenantId, nombre: 'Cajero B', email: `${id}@test.invalid`, passwordHash: 'x', rol: 'CAJERO', permisosConfigurados: false, permisos: [] } as any });
    const caja = await prisma.caja.create({ data: { tenantId: e.tenantId, codigo: `CAJA-B-${id.slice(0, 4)}`, usuarioId: id, montoApertura: 0, estado: 'ABIERTA' } as any });
    const { ventana } = await emitirRegistrada(svc, e.tenantId, id, { dispositivoId: e.equipoId });
    return { id, cajaId: caja.id, ventanaId: ventana.id as string };
  }

  const lote = (e: any, ops: any[], usuario = e.cajero, rol = 'CAJERO') =>
    svc.recibirLote(e.tenantId, usuario, rol, { dispositivoId: e.equipoId, pendientesRestantes: 0, operaciones: ops } as any);
  const dto = async () => {
    const { validate } = await import('class-validator');
    const { plainToInstance } = await import('class-transformer');
    const m = await import('../src/contingencia/dto/contingencia.dto');
    return { validate, plainToInstance, ...m };
  };

  // Puntos de código que no son texto visible. Lista de la auditoría (H-G) más los de otras categorías Unicode de formato, control y espacio.
  const INVISIBLES = [
    0x3164, 0x2800, 0x180e, 0x200e, 0x200f, 0x00ad, 0x0001, 0x2062, 0x2063, 0x202a, 0x115f, 0xffa0, 0x034f, 0xfe0f, 0xe0020, 0x0085,
    0x200b, 0x200c, 0x200d, 0x2060, 0xfeff, 0x00a0, 0x2028, 0x2029, 0x3000, 0x1160, 0x061c, 0x2066, 0x2067, 0x2068, 0x2069, 0x206a,
    0xe0001, 0x2003, 0x2009, 0x200a, 0x202f, 0x205f, 0x1680, 0x0009, 0x000a, 0x000d, 0x007f, 0x009f, 0xfe00, 0xfe0e,
  ];

  // H-G: un texto sin caracteres visibles no cuenta como nota ni como motivo, sea cual sea el carácter invisible.
  it('H-G: una nota o un motivo hecho solo de caracteres invisibles se rechaza, para toda la lista', async () => {
    const { validate, plainToInstance, ResolverOperacionDto } = await dto();
    const aceptada = async (campos: any) => (await validate(plainToInstance(ResolverOperacionDto, campos))).length === 0;
    const base = { accion: 'CERRAR_MANUAL', nota: 'Nota de la decisión suficientemente larga', regularizarCajaCerrada: true, motivoRegularizacion: 'Motivo suficiente y claro para auditar' };
    expect(await aceptada(base)).toBe(true);
    const aceptadas: string[] = [];
    for (const cp of INVISIBLES) {
      const c = String.fromCodePoint(cp);
      if (await aceptada({ ...base, nota: c.repeat(12) })) aceptadas.push(`nota U+${cp.toString(16)}`);
      if (await aceptada({ ...base, motivoRegularizacion: c.repeat(25) })) aceptadas.push(`motivo U+${cp.toString(16)}`);
      // Mezclado con texto visible insuficiente: 4 letras y relleno invisible hasta superar la longitud mínima.
      if (await aceptada({ ...base, nota: `abcd${c.repeat(20)}` })) aceptadas.push(`nota mezclada U+${cp.toString(16)}`);
    }
    expect(aceptadas).toEqual([]);
    // Texto real con acentos, signos y emoji sigue siendo válido.
    expect(await aceptada({ ...base, nota: 'Cobro verificado: ñandú, ¿cómo? 😀 listo' })).toBe(true);
  });

  it('H-G: el servidor también mide caracteres visibles y la referencia de solo invisibles no se guarda como texto', async () => {
    const e = await empresa();
    const op = operacion(e, { efectivoRecibidoCentavos: 2000, cambioCentavos: 0 });
    await lote(e, [op]);
    await prisma.caja.update({ where: { id: e.cajaId }, data: { estado: 'CERRADA', montoCierreFisico: 100, montoEsperado: 100, diferencia: 0 } });
    await expect(svc.resolver(e.tenantId, e.admin, op.operacionId, { accion: 'CERRAR_MANUAL', nota: 'Regularización con motivo invisible', regularizarCajaCerrada: true, motivoRegularizacion: '\u3164'.repeat(25) } as any)).rejects.toThrow(/al menos 20 caracteres/);
    const venta = operacion(e, { referenciaFacturaExterna: '\u200b\u200b' });
    await lote(e, [venta]);
    expect((await filaDe(e.tenantId, venta.operacionId))?.referenciaFacturaExterna ?? null).toBeNull();
  });

  // H-F: un par sustituto suelto rompe Prisma («lone surrogate»); el operador lo escribe por error de copia o por un corte en el borde de maxLength.
  it('H-F: un par sustituto suelto en cualquier texto del lote se rechaza por operación y el lote sigue', async () => {
    const e = await empresa();
    const buena = operacion(e);
    const conSustituto = (extra: Record<string, any>) => operacion(e, extra);
    const malas = [
      conSustituto({ clienteNombre: 'Ana \ud800 X' }),
      conSustituto({ clienteRtn: '0801\udc00' }),
      conSustituto({ referenciaFacturaExterna: 'F\udc00' }),
      conSustituto({ lineas: [{ productoId: 'p\ud800', cantidadCentesimas: 100, precioCentavos: 1000 }] }),
      conSustituto({ cajeroId: `${e.cajero}\ud83d` }),
    ];
    const otra = operacion(e);
    const r = (await lote(e, [buena, ...malas, otra])).resultados;
    expect(r).toHaveLength(7);
    expect(r[0]).toMatchObject({ operacionId: buena.operacionId, estado: 'APLICADA' });
    for (let i = 1; i <= 5; i++) expect(r[i], `operación ${i}`).toMatchObject({ estado: 'RECHAZADA_TECNICA', codigo: 'FORMATO_INVALIDO' });
    expect(r[6]).toMatchObject({ operacionId: otra.operacionId, estado: 'APLICADA' });
    // Un par sustituto completo (emoji) es texto válido.
    const conEmoji = operacion(e, { clienteNombre: 'Cliente 😀' });
    expect((await lote(e, [conEmoji])).resultados[0]).toMatchObject({ estado: 'APLICADA' });
    expect(await ventasDe(e.tenantId)).toBe(3);
  });

  it('H-F: la nota, la referencia y el nombre del equipo con par sustituto suelto o carácter nulo se rechazan en el DTO', async () => {
    const { validate, plainToInstance, ResolverOperacionDto, ActualizarReferenciaDto, RegistrarDispositivoDto } = await dto();
    const invalido = async (cls: any, campos: any) => (await validate(plainToInstance(cls, campos))).length > 0;
    expect(await invalido(ResolverOperacionDto, { accion: 'MARCAR_REVISADA', nota: 'Nota larga con \ud800 suelto' })).toBe(true);
    expect(await invalido(ActualizarReferenciaDto, { referenciaFacturaExterna: 'F\udc00' })).toBe(true);
    expect(await invalido(RegistrarDispositivoDto, { dispositivoId: randomUUID(), nombre: 'Caja\u0000' })).toBe(true);
    expect(await invalido(RegistrarDispositivoDto, { dispositivoId: randomUUID(), nombre: 'Caja \ud83d' })).toBe(true);
    expect(await invalido(RegistrarDispositivoDto, { dispositivoId: randomUUID(), nombre: 'Caja principal 😀' })).toBe(false);
  });

  // H-H: la evidencia no se corrompe ni se pierde.
  it('H-H: la evidencia conserva la secuencia literal «\\u0000» y quita solo el carácter nulo y los pares sueltos', async () => {
    const e = await empresa();
    const ops = [0, 1, 2].map((i) => operacion(e, {
      correlativoLocal: 'MAL', clienteNombre: i === 0 ? 'x\\u0000n' : i === 1 ? 'y\u0000z' : 'w\ud800q',
    }));
    const r = (await lote(e, ops)).resultados;
    expect(r.map((x: any) => x.codigo)).toEqual(['FORMATO_INVALIDO', 'FORMATO_INVALIDO', 'FORMATO_INVALIDO']);
    const evidencia = async (op: any) => (await prisma.auditoriaOperacion.findFirstOrThrow({ where: { tenantId: e.tenantId, operacion: 'CONTINGENCIA_OPERACION_NO_REGISTRADA', entidadId: idSolicitud(e.tenantId, op.operacionId) } })).datos as any;
    expect((await evidencia(ops[0])).payload.clienteNombre).toBe('x\\u0000n'); // la secuencia literal se conserva intacta
    expect((await evidencia(ops[1])).payload.clienteNombre).toBe('yz');
    expect((await evidencia(ops[2])).payload.clienteNombre).toBe('wq');
  });

  it('H-H: sanearParaJsonb limpia cadenas y claves, recorre listas y no toca el resto', () => {
    const sucio = { 'k\u0000ey': ['a\u0000b', { 'x\ud800': 'c\udc00d' }], n: 5, t: true, v: null, literal: 'a\\u0000b' };
    expect(sanearParaJsonb(sucio)).toEqual({ key: ['ab', { x: 'cd' }], n: 5, t: true, v: null, literal: 'a\\u0000b' });
    expect(() => JSON.stringify(sanearParaJsonb(sucio))).not.toThrow();
  });

  // H-I: entradas que no pasan por un DTO.
  it('H-I: latido, estados, listar y resumen con valores hostiles responden de forma controlada', async () => {
    const e = await empresa();
    for (const pendientes of [Number.NaN, Number.POSITIVE_INFINITY, 1e12, -5]) {
      await expect(svc.latido(e.tenantId, e.cajero, e.equipoId, pendientes)).resolves.toMatchObject({ ok: true });
    }
    const interno = await prisma.dispositivoPos.findFirstOrThrow({ where: { tenantId: e.tenantId } });
    expect(interno.pendientesReportados).toBe(0);
    const est = await svc.estados(e.tenantId, e.cajero, 'CAJERO', ['a\u0000b', 'x'.repeat(500), randomUUID()]);
    expect(est).toHaveLength(3);
    expect(est.every((x: any) => x.estado === 'NO_REGISTRADA')).toBe(true);
    expect(JSON.stringify(est)).not.toContain('\u0000');
    await expect(svc.listar(e.tenantId, { estado: 'REVISION\u0000' })).rejects.toThrow(/Estado de filtro inválido/);
    await expect(svc.listar(e.tenantId, { dispositivoId: 'abc\u0000' })).rejects.toThrow(/Dispositivo de filtro inválido/);
    await expect(svc.listar(e.tenantId, { desde: 'no-es-fecha' })).rejects.toThrow(/Fecha inválida/);
    await expect(svc.resumen(e.tenantId, '2026-13-45')).rejects.toThrow(/Fecha inválida/);
    await expect(svc.resumen(e.tenantId, '2026-02-30')).rejects.toThrow(/Fecha inválida/);
    await expect(svc.resumen(e.tenantId, '2026-10-11')).resolves.toMatchObject({ fecha: '2026-10-11' });
    await expect(svc.listar(e.tenantId, { estado: 'REVISION' })).resolves.toEqual([]);
  });

  // Invariante que cierra la clase de defecto: todo texto que la validación acepta se puede guardar en PostgreSQL (text y jsonb).
  it('invariante: todo carácter que esTextoSeguro acepta se guarda en PostgreSQL como text y como jsonb (plano básico completo y muestra de los demás)', async () => {
    const { esTextoSeguro } = await dto();
    const fallos: string[] = [];
    let probados = 0;
    const probar = async (cp: number) => {
      if (cp >= 0xd800 && cp <= 0xdfff) return; // los sustitutos solo existen en pares; los sueltos se prueban aparte
      const c = String.fromCodePoint(cp);
      const texto = `a${c}b`;
      if (!esTextoSeguro(texto)) { if (cp !== 0) fallos.push(`rechazado sin motivo: U+${cp.toString(16)}`); return; }
      probados++;
      try {
        const [fila] = await prisma.$queryRawUnsafe<any[]>('SELECT $1::text AS t, to_jsonb($1::text) AS j', texto);
        if (fila.t !== texto || fila.j !== texto) fallos.push(`no vuelve igual: U+${cp.toString(16)}`);
      } catch (error: any) {
        fallos.push(`no se guarda: U+${cp.toString(16)} (${String(error?.message).slice(0, 60)})`);
      }
    };
    for (let cp = 0; cp <= 0xffff; cp++) await probar(cp);
    for (let cp = 0x10000; cp <= 0x10ffff; cp += 211) await probar(cp);
    expect(fallos).toEqual([]);
    expect(probados).toBeGreaterThan(60000);
    // Lo que sí rechaza: el nulo y los sustitutos sueltos, en cualquier posición.
    for (const malo of ['\u0000', 'a\u0000', '\ud800', 'a\udc00b', '\ud83dx', 'x\ude00']) expect(esTextoSeguro(malo), JSON.stringify(malo)).toBe(false);
    for (const bueno of ['', 'ñandú', '😀', 'a\ud83d\ude00b', '\u200b', '\u3164']) expect(esTextoSeguro(bueno), JSON.stringify(bueno)).toBe(true);
  }, 300000);

  it('H-I: el motivo de desactivación se sanea antes de llegar a la base', async () => {
    const { limpiarTexto, sanearTexto } = await dto();
    expect(limpiarTexto(sanearTexto('Equipo \u0000 robado \ud800 \u200b'))).toBe('Equipo  robado');
  });
});
