import { ClientesService } from './clientes.service';
import { GoneException } from '@nestjs/common';

describe('ClientesService numbering failures', () => {
  it.each([
    { code: 'P2002', meta: { target: ['tenant_id', 'numero_cliente'] } },
    { code: 'P2022', meta: { column: 'clientes.numero_cliente' } },
    { code: 'P2004', meta: { database_error: 'check constraint clientes_numero_cliente_positive violated' } },
  ])('explains incomplete customer numbering instead of returning a generic 500: $code', async (error) => {
    const prisma = { cliente: { create: vi.fn().mockRejectedValue(error) } };
    const service = new ClientesService(prisma as any);
    await expect(service.create('t1', { nombre: 'Cliente' })).rejects.toMatchObject({
      status: 503, message: expect.stringContaining('migración de numeración'),
    });
    expect(prisma.cliente.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.not.objectContaining({ numeroCliente: expect.anything() }) }));
  });

  it('does not misclassify unrelated database errors as numbering failures', async () => {
    const error = { code: 'P2002', meta: { target: ['email'] } };
    const service = new ClientesService({ cliente: { create: vi.fn().mockRejectedValue(error) } } as any);
    await expect(service.create('t1', { nombre: 'Cliente' })).rejects.toBe(error);
  });

  it('blocks the legacy client abono route without touching balances or payments', async () => {
    const tx = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([]),
      cliente: { findFirst: vi.fn().mockResolvedValue({ id: 'c1', saldoPendiente: 20 }) },
    };
    const prisma = { $transaction: vi.fn((callback) => callback(tx)) };
    const service = new ClientesService(prisma as any);
    await expect(service.addPayment('t1', 'c1', { monto: 20 })).rejects.toBeInstanceOf(GoneException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('ClientesService.findAll search queries', () => {
  it('searches by CLI-0001 customer number and code', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const queryRaw = vi.fn().mockResolvedValue([]);
    const prisma = { cliente: { findMany }, $queryRaw: queryRaw };
    const service = new ClientesService(prisma as any);

    await service.findAll('t1', 'CLI-0001');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 't1',
          activo: true,
          OR: expect.arrayContaining([
            { numeroCliente: 1 },
            { codigo: { contains: 'CLI-0001', mode: 'insensitive' } },
            { nombre: { contains: 'CLI-0001', mode: 'insensitive' } },
          ]),
        }),
      }),
    );
  });

  it('searches phone numbers with and without dashes, spaces and country code +504', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const queryRaw = vi.fn().mockResolvedValue([{ id: 'c-match' }]);
    const prisma = { cliente: { findMany }, $queryRaw: queryRaw };
    const service = new ClientesService(prisma as any);

    await service.findAll('t1', '+504 9999-8888');

    expect(queryRaw).toHaveBeenCalled();
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 't1',
          activo: true,
          OR: expect.arrayContaining([
            { id: { in: ['c-match'] } },
          ]),
        }),
      }),
    );
  });

  it('handles clients with empty or null optional fields', async () => {
    const mockClients = [
      { id: 'c1', numeroCliente: 1, nombre: 'Juan Perez', rtn: null, telefono: null, email: null, direccion: null, activo: true },
    ];
    const findMany = vi.fn().mockResolvedValue(mockClients);
    const prisma = { cliente: { findMany } };
    const service = new ClientesService(prisma as any);

    const result = await service.findAll('t1', 'Juan');
    expect(result).toHaveLength(1);
    expect(result[0].nombre).toBe('Juan Perez');
  });

  it('returns empty array when search finds no results', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const queryRaw = vi.fn().mockResolvedValue([]);
    const prisma = { cliente: { findMany }, $queryRaw: queryRaw };
    const service = new ClientesService(prisma as any);

    const result = await service.findAll('t1', 'Inexistente_12345');
    expect(result).toHaveLength(0);
  });
});
