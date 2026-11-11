import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { ConvertirCotizacionDto, CreateCotizacionDto, EstadoCotizacionDto, MAXIMO_LINEAS_COTIZACION } from './create-cotizacion.dto';
import { normalizarAutorizacion } from '../../operaciones/aprobaciones-bancarias';

// Las entradas inválidas de cotizaciones y de su conversión responden 400 en la validación; antes llegaban al servicio
// o a la base y terminaban en error 500 (auditoría del 10-nov-2026).
const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false });
const validar = (metatype: any, valor: unknown) => pipe.transform(valor, { type: 'body', metatype });
const linea = { productoId: 'producto-1', cantidad: 1 };

describe('DTO de cotizaciones', () => {
  it('acepta una cotización mínima y el porcentaje de descuento recalculado por la pantalla', async () => {
    await expect(validar(CreateCotizacionDto, { detalles: [linea] })).resolves.toBeInstanceOf(CreateCotizacionDto);
    await expect(validar(CreateCotizacionDto, { diasValidez: 365, descuentoGeneral: 11.11111111, tipoDescuentoGeneral: 'PORCENTAJE', detalles: [{ ...linea, descuento: 12.3456789, tipoDescuento: 'PORCENTAJE' }] })).resolves.toBeDefined();
  });

  it.each([
    ['vigencia enorme', { diasValidez: 1e12, detalles: [linea] }],
    ['vigencia fraccionaria', { diasValidez: 1.5, detalles: [linea] }],
    ['vigencia mayor a un año', { diasValidez: 366, detalles: [linea] }],
    ['sin líneas', { detalles: [] }],
    ['demasiadas líneas', { detalles: Array.from({ length: MAXIMO_LINEAS_COTIZACION + 1 }, () => linea) }],
    ['precio con tres decimales', { detalles: [{ ...linea, precioUnitario: 1.234 }] }],
    ['precio fuera de rango', { detalles: [{ ...linea, precioUnitario: 1e13 }] }],
    ['cantidad fuera de rango', { detalles: [{ ...linea, cantidad: 1e9 }] }],
    ['descuento negativo', { detalles: [{ ...linea, descuento: -1 }] }],
    ['nota desmesurada', { notas: 'x'.repeat(2001), detalles: [linea] }],
    ['detalles que no son un arreglo', { detalles: 'x' }],
  ])('rechaza con 400: %s', async (_caso, cuerpo) => {
    await expect(validar(CreateCotizacionDto, cuerpo)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('el cambio de estado solo admite estados que el usuario puede fijar', async () => {
    await expect(validar(EstadoCotizacionDto, { estado: 'ENVIADA' })).resolves.toMatchObject({ estado: 'ENVIADA' });
    for (const estado of ['CONVERTIDA', '', 5, null, undefined, { a: 1 }]) {
      await expect(validar(EstadoCotizacionDto, { estado })).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('la conversión valida método de pago, autorización bancaria y motivo de excepción', async () => {
    await expect(validar(ConvertirCotizacionDto, {})).resolves.toBeInstanceOf(ConvertirCotizacionDto);
    await expect(validar(ConvertirCotizacionDto, { metodoPago: 'TARJETA', pagoElectronico: { referencia: 'AUT-123', terminal: 'T1' } })).resolves.toMatchObject({ metodoPago: 'TARJETA' });
    await expect(validar(ConvertirCotizacionDto, { metodoPago: 'TRANSFERENCIA', pagoElectronico: { referencia: 'AUT-123' } })).resolves.toBeDefined();
    for (const cuerpo of [
      { metodoPago: 'BITCOIN' }, { metodoPago: 7 }, { metodoPago: 'TARJETA', pagoElectronico: { referencia: 12345, terminal: 'T1' } },
      { metodoPago: 'TARJETA', pagoElectronico: 'AUT-123' }, { excepcionPrecio: { motivo: 'corto' } }, { excepcionPrecio: { motivo: 99 } },
    ]) await expect(validar(ConvertirCotizacionDto, cuerpo)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('la autorización bancaria con un valor que no es texto responde 400 también para consumidores internos', () => {
    expect(() => normalizarAutorizacion('TARJETA', { referencia: 12345 as any, terminal: 'T1' })).toThrow(BadRequestException);
    expect(() => normalizarAutorizacion('TARJETA', { referencia: 'AUT-123', terminal: { a: 1 } as any })).toThrow(BadRequestException);
    expect(normalizarAutorizacion('TARJETA', { referencia: ' aut-123 ', terminal: 't1' })).toEqual({ metodo: 'TARJETA', terminal: 'T1', referencia: 'AUT-123' });
  });
});
