import { ClientesService } from './clientes.service';
import { BadRequestException } from '@nestjs/common';

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

  it('rejects an abono greater than the client balance', async () => {
    const tx = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([]),
      cliente: { findFirst: vi.fn().mockResolvedValue({ id: 'c1', saldoPendiente: 20 }) },
    };
    const prisma = { $transaction: vi.fn((callback) => callback(tx)) };
    const service = new ClientesService(prisma as any);
    await expect(service.addPayment('t1', 'c1', { monto: 20.01 })).rejects.toBeInstanceOf(BadRequestException);
  });
});
