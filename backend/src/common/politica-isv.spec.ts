import { ArgumentMetadata, BadRequestException, ValidationPipe } from '@nestjs/common';
import { TASA_ISV_PORCIENTO } from './dinero';
import { esTasaIsvAutorizada, exigirTasaIsvAutorizada, TASAS_ISV_AUTORIZADAS, tasaIsvEstructuralmenteValida } from './politica-isv';
import { CreateCotizacionDto } from '../cotizaciones/dto/create-cotizacion.dto';

describe('P2-H1 política de tasas de ISV', () => {
  it('la lista autorizada es la tasa que ya aplica el POS y no se puede alterar en ejecución', () => {
    expect(TASAS_ISV_AUTORIZADAS).toEqual([TASA_ISV_PORCIENTO]);
    expect(Object.isFrozen(TASAS_ISV_AUTORIZADAS)).toBe(true);
    expect(() => (TASAS_ISV_AUTORIZADAS as number[]).push(500)).toThrow();
  });

  it.each([15, 15.0, 15.00])('acepta la tasa autorizada %s', (tasa) => {
    expect(esTasaIsvAutorizada(tasa)).toBe(true);
    expect(exigirTasaIsvAutorizada(tasa)).toBe(15);
  });

  it.each([0, 14.99, 15.01, 12, 18, 99.99])('rechaza la tasa estructuralmente posible pero no autorizada %s', (tasa) => {
    expect(tasaIsvEstructuralmenteValida(tasa)).toBe(true);
    expect(esTasaIsvAutorizada(tasa)).toBe(false);
    expect(() => exigirTasaIsvAutorizada(tasa)).toThrow(BadRequestException);
  });

  it.each([500, 100, 100.01, -0.01, -15, 15.001, Number.NaN, Number.POSITIVE_INFINITY, '15', null, undefined, {}, [15], true])(
    'rechaza el valor inválido %s', (valor) => {
      expect(tasaIsvEstructuralmenteValida(valor)).toBe(false);
      expect(() => exigirTasaIsvAutorizada(valor)).toThrow(/Tasa de ISV no autorizada/);
    });

  it('el mensaje orienta a marcar la línea exenta en lugar de usar una tasa de 0 %', () => {
    expect(() => exigirTasaIsvAutorizada(0)).toThrow(/15 %.*exenta/);
  });
});

describe('P2-H1 manipulación del DTO de cotización (mismo ValidationPipe global)', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false });
  const meta: ArgumentMetadata = { type: 'body', metatype: CreateCotizacionDto };
  const base = { detalles: [{ productoId: 'p-1', cantidad: 1 }] };
  const validar = (cuerpo: object) => pipe.transform(cuerpo, meta);

  it('admite omitir la tasa o enviar la autorizada', async () => {
    await expect(validar(base)).resolves.toBeInstanceOf(CreateCotizacionDto);
    await expect(validar({ ...base, porcentajeIsv: 15 })).resolves.toMatchObject({ porcentajeIsv: 15 });
  });

  it.each([500, 0, 18, 14.99, 15.001, -1, '15', '500', null, [15], { valor: 15 }])('rechaza porcentajeIsv=%j con 400', async (porcentajeIsv) => {
    await expect(validar({ ...base, porcentajeIsv })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('descarta importes fiscales enviados por el cliente: el servidor los calcula', async () => {
    const dto = await validar({ ...base, isv: 0, total: 1, subtotal: 1, detalles: [{ productoId: 'p-1', cantidad: 1, isv: 0, totalLinea: 1 }] });
    expect(dto).not.toHaveProperty('isv');
    expect(dto).not.toHaveProperty('total');
    expect(dto).not.toHaveProperty('subtotal');
    expect(dto.detalles[0]).not.toHaveProperty('isv');
    expect(dto.detalles[0]).not.toHaveProperty('totalLinea');
  });

  it('la marca de exención por línea solo acepta booleanos', async () => {
    await expect(validar({ detalles: [{ productoId: 'p-1', cantidad: 1, exento: 'true' }] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(validar({ detalles: [{ productoId: 'p-1', cantidad: 1, exento: true }] })).resolves.toBeInstanceOf(CreateCotizacionDto);
  });
});
