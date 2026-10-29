import { ForbiddenException } from '@nestjs/common';
import { EXENCIONES_HABILITADAS, exigirSinExencion } from './politica-exenciones';

describe('política provisional de exenciones (T6)', () => {
  const db = { $queryRawUnsafe: vi.fn().mockResolvedValue([]) };

  beforeEach(() => db.$queryRawUnsafe.mockClear());

  it('está deshabilitada mientras las decisiones D3 y D5 estén pendientes', () => {
    expect(EXENCIONES_HABILITADAS).toBe(false);
  });

  it('no hace nada con líneas gravadas', async () => {
    await expect(exigirSinExencion(db, 't', 'u', 'CREAR', null, [{ productoId: 'p', exento: false }])).resolves.toBeUndefined();
    expect(db.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('rechaza una exención con 403 y deja el intento en auditoría', async () => {
    await expect(exigirSinExencion(db, 't', 'u', 'EDITAR', 'cot-1', [{ productoId: 'p1', exento: true }, { productoId: 'p2' }]))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(db.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    const args = db.$queryRawUnsafe.mock.calls[0];
    expect(args).toContain('EXENCION_BLOQUEADA');
    expect(args).toContain('cot-1');
    expect(JSON.parse(args.at(-1))).toMatchObject({ intento: 'EDITAR', motivo: 'DECISION_FISCAL_PENDIENTE', lineas: 1, productoIds: ['p1'] });
  });

  it('tolera líneas sin array (la validación del DTO lo rechaza antes)', async () => {
    await expect(exigirSinExencion(db, 't', 'u', 'CREAR', null, undefined as any)).resolves.toBeUndefined();
  });
});
