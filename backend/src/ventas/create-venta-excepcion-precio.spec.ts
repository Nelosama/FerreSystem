import { ValidationPipe } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CreateVentaDto } from './dto/create-venta.dto';

describe('Excepción de precio del POS — DTO HTTP', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true });
  const validar = (motivo: unknown) => pipe.transform({
    solicitudId: randomUUID(), excepcionPrecio: { motivo },
    detalles: [{ productoId: 'producto', cantidad: 1, precioUnitario: 1 }],
  }, { type: 'body', metatype: CreateVentaDto });

  it.each([' '.repeat(20), '  corto  ', '', 'x'.repeat(301), null, 123])('rechaza un motivo vacío o inválido: %j', async motivo => {
    await expect(validar(motivo)).rejects.toMatchObject({ status: 400 });
  });

  it('normaliza el motivo antes de validarlo y auditarlo', async () => {
    const dto = await validar('  Precio acordado con el cliente  ');
    expect(dto.excepcionPrecio.motivo).toBe('Precio acordado con el cliente');
  });
});
