import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ValidationPipe } from '@nestjs/common';
import { altaPrevia, esChoqueDeId, huellaAlta, idAlta } from './idempotencia-alta';
import { esIdInterno } from '../operaciones/ledger';
import { CreateClienteDto } from '../clientes/dto/create-cliente.dto';
import { CreateCotizacionDto, DuplicarCotizacionDto } from '../cotizaciones/dto/create-cotizacion.dto';

// A-02: clave de reintento de altas de clientes y cotizaciones. La prueba con PostgreSQL y HTTP está en
// test/idempotencia-altas.postgres.integration.ts; aquí, las reglas puras.
describe('idempotencia de altas (A-02)', () => {
  const tenantA = 'tenant-a', tenantB = 'tenant-b';

  it('el identificador depende de la empresa, del tipo de operación y de la clave, y es un id interno', () => {
    const clave = randomUUID();
    const id = idAlta(tenantA, 'CLIENTE_CREAR', clave);
    expect(idAlta(tenantA, 'CLIENTE_CREAR', clave)).toBe(id);
    expect(esIdInterno(id)).toBe(true);
    expect(new Set([
      id,
      idAlta(tenantB, 'CLIENTE_CREAR', clave),
      idAlta(tenantA, 'COTIZACION_CREAR', clave),
      idAlta(tenantA, 'COTIZACION_DUPLICAR', clave),
      idAlta(tenantA, 'CLIENTE_CREAR', randomUUID()),
    ]).size).toBe(5);
  });

  it('una clave que es un identificador interno no se acepta como solicitud nueva', () => {
    expect(() => idAlta(tenantA, 'CLIENTE_CREAR', idAlta(tenantA, 'CLIENTE_CREAR', randomUUID()))).toThrow(BadRequestException);
  });

  it('la huella no depende del orden de las claves ni de la propia clave de solicitud, y sí del contenido y de la operación', () => {
    const base = { nombre: 'Delta', detalles: [{ productoId: 'p', cantidad: 2, descuento: undefined }], telefono: undefined };
    const h = huellaAlta('COTIZACION_CREAR', base);
    expect(huellaAlta('COTIZACION_CREAR', { detalles: [{ cantidad: 2, productoId: 'p' }], nombre: 'Delta', solicitudId: randomUUID() })).toBe(h);
    expect(huellaAlta('COTIZACION_CREAR', { ...base, nombre: 'Delta ' })).not.toBe(h);
    expect(huellaAlta('COTIZACION_CREAR', { ...base, detalles: [{ productoId: 'p', cantidad: 3 }] })).not.toBe(h);
    expect(huellaAlta('COTIZACION_CREAR', { ...base, detalles: [...base.detalles, { productoId: 'q', cantidad: 1 }] })).not.toBe(h);
    expect(huellaAlta('CLIENTE_CREAR', base)).not.toBe(h);
  });

  it('un reintento se reconoce solo con el mismo usuario, la misma clave y el mismo contenido', async () => {
    const clave = randomUUID();
    const hash = huellaAlta('CLIENTE_CREAR', { nombre: 'Delta' });
    const fila = { usuario_id: 'u1', datos: { solicitudId: clave, solicitudHash: hash } };
    const db = (filas: any[]) => ({ $queryRawUnsafe: vi.fn().mockResolvedValue(filas) }) as any;
    await expect(altaPrevia(db([]), tenantA, 'u1', 'CLIENTE_CREAR', clave, hash)).resolves.toBeNull();
    await expect(altaPrevia(db([fila]), tenantA, 'u1', 'CLIENTE_CREAR', clave, hash)).resolves.toBe(idAlta(tenantA, 'CLIENTE_CREAR', clave));
    await expect(altaPrevia(db([fila]), tenantA, 'u2', 'CLIENTE_CREAR', clave, hash)).rejects.toBeInstanceOf(ConflictException);
    await expect(altaPrevia(db([fila]), tenantA, 'u1', 'CLIENTE_CREAR', clave, huellaAlta('CLIENTE_CREAR', { nombre: 'Otro' }))).rejects.toBeInstanceOf(ConflictException);
    // La consulta siempre filtra por empresa, operación y el identificador derivado.
    const consulta = db([]);
    await altaPrevia(consulta, tenantA, 'u1', 'COTIZACION_DUPLICAR', clave, hash);
    expect(consulta.$queryRawUnsafe.mock.calls[0].slice(1)).toEqual([tenantA, 'COTIZACION_DUPLICAR', idAlta(tenantA, 'COTIZACION_DUPLICAR', clave)]);
  });

  it('distingue el choque de la clave primaria de otros choques de unicidad', () => {
    expect(esChoqueDeId({ code: 'P2002', meta: { target: ['id'] } })).toBe(true);
    expect(esChoqueDeId({ code: 'P2002', meta: { target: 'clientes_pkey' } })).toBe(true);
    expect(esChoqueDeId({ code: 'P2002', meta: { target: ['tenant_id', 'numero_cliente'] } })).toBe(false);
    expect(esChoqueDeId({ code: 'P2002', meta: { target: ['tenantId', 'numeroCotizacion'] } })).toBe(false);
    expect(esChoqueDeId({ code: 'P2003', meta: { target: ['id'] } })).toBe(false);
  });

  describe('DTO', () => {
    const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false });
    const validar = (metatype: any, valor: unknown) => pipe.transform(valor, { type: 'body', metatype });
    const linea = { productoId: 'producto-1', cantidad: 1 };

    it('la clave es opcional (compatibilidad) y, si se envía, debe ser un UUID v4', async () => {
      const clave = randomUUID();
      expect((await validar(CreateClienteDto, { nombre: 'Delta', solicitudId: clave })).solicitudId).toBe(clave);
      expect((await validar(CreateClienteDto, { nombre: 'Delta' })).solicitudId).toBeUndefined();
      expect((await validar(CreateCotizacionDto, { detalles: [linea], solicitudId: clave })).solicitudId).toBe(clave);
      expect((await validar(DuplicarCotizacionDto, { solicitudId: clave })).solicitudId).toBe(clave);
      await expect(validar(DuplicarCotizacionDto, {})).resolves.toBeInstanceOf(DuplicarCotizacionDto);
      for (const mala of ['reintento-1', '', 12, '00000000-0000-1000-8000-000000000000']) {
        await expect(validar(CreateClienteDto, { nombre: 'Delta', solicitudId: mala })).rejects.toBeInstanceOf(BadRequestException);
        await expect(validar(CreateCotizacionDto, { detalles: [linea], solicitudId: mala })).rejects.toBeInstanceOf(BadRequestException);
        await expect(validar(DuplicarCotizacionDto, { solicitudId: mala })).rejects.toBeInstanceOf(BadRequestException);
      }
    });
  });
});
