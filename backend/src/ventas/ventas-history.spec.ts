import { NotFoundException } from '@nestjs/common';
import { VentasService } from './ventas.service';

describe('Sale history ownership', () => {
  it('filters at the database before pagination', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new VentasService({ venta: { findMany } } as any);
    await service.findAll('tenant-1', 10, 2, 'cashier-1');
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: 'tenant-1', usuarioId: 'cashier-1' }, take: 10, skip: 20,
    }));
    await service.findAll('tenant-1');
    expect(findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { tenantId: 'tenant-1' } }));
  });
  it('does not reveal a sale belonging to another cashier', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const service = new VentasService({ venta: { findFirst } } as any);
    await expect(service.findById('tenant-1', 'sale-2', 'cashier-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'sale-2', tenantId: 'tenant-1', usuarioId: 'cashier-1' },
    }));
  });
});
