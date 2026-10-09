import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateVentaDto } from './dto/create-venta.dto';

const base = { metodoPago: 'CREDITO', clienteId: 'c1', detalles: [{ productoId: 'p1', cantidad: 1, precioUnitario: 10 }] };
const errores = async (extra: object) =>
  (await validate(plainToInstance(CreateVentaDto, { ...base, ...extra }))).filter(e => e.property === 'vencimiento');

describe('CreateVentaDto.vencimiento (FS-01)', () => {
  it('acepta fecha ISO solo con día (input type=date)', async () => expect(await errores({ vencimiento: '2026-10-09' })).toHaveLength(0));
  it('acepta fecha-hora ISO 8601', async () => expect(await errores({ vencimiento: '2026-10-09T00:00:00.000Z' })).toHaveLength(0));
  it('trata cadena vacía como ausente (antes: "must be a valid ISO 8601 date string")', async () => {
    expect(await errores({ vencimiento: '' })).toHaveLength(0);
    expect(await errores({ vencimiento: '  ' })).toHaveLength(0);
  });
  it('sigue rechazando texto que no es fecha', async () => expect(await errores({ vencimiento: 'mañana' })).toHaveLength(1));
});
