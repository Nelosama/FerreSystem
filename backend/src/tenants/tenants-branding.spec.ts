import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { TenantsService } from './tenants.service';

// Auditoría 12/10 (P3): el color de marca se valida antes de cualquier escritura.
describe('updateTenantBranding: color de marca', () => {
  const prisma = () => ({ tenant: { update: vi.fn(), findUnique: vi.fn() } }) as any;

  it.each(['NOTAHEX', '#EA580', '#EA580CC', 'EA580C', '#GGGGGG', '#ea580c;'])('rechaza %s sin escribir en la base', async (color) => {
    const db = prisma();
    const service = new TenantsService(db);
    await expect(service.updateTenantBranding('t1', { colorPrimario: color })).rejects.toThrow(BadRequestException);
    expect(db.tenant.update).not.toHaveBeenCalled();
  });
});
