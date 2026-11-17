import { BadRequestException, type ArgumentMetadata } from '@nestjs/common';
import { ValidationPipeEnEspanol, traducirMensajeValidacion } from './mensajes-validacion';
import { AjusteDto, PagoDto } from '../../operaciones/operaciones.dto';
import { CreateClienteDto } from '../../clientes/dto/create-cliente.dto';
import { CreateVentaDto } from '../../ventas/dto/create-venta.dto';

// T-06: los mensajes de validación por defecto llegan en español; los mensajes propios de cada DTO no cambian.
describe('Mensajes de validación en español (mismo pipe global que main.ts)', () => {
  const pipe = new ValidationPipeEnEspanol({ whitelist: true, transform: true, forbidNonWhitelisted: false });
  const mensajes = async (cuerpo: unknown, metatype: ArgumentMetadata['metatype']): Promise<string[]> => {
    try { await pipe.transform(cuerpo, { type: 'body', metatype }); } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      const respuesta = (e as BadRequestException).getResponse() as { statusCode: number; message: string[]; error: string };
      expect(respuesta.statusCode).toBe(400);
      expect(Array.isArray(respuesta.message)).toBe(true);
      return respuesta.message;
    }
    return [];
  };
  const sinIngles = (lista: string[]) => expect(lista.filter((m) => /\b(should|must|each value|characters|elements)\b/.test(m))).toEqual([]);

  it('ajuste de inventario sin motivo: antes «motivo should not be empty»', async () => {
    const lista = await mensajes({ solicitudId: '11111111-1111-4111-8111-111111111111', stock: 5, stockAnterior: 4 }, AjusteDto);
    expect(lista).toContain('motivo: este dato es obligatorio');
    expect(lista).toContain('motivo: debe ser texto');
    sinIngles(lista);
  });

  it('tipos, límites e identificadores inválidos se explican en español', async () => {
    const lista = await mensajes({ solicitudId: 'no-es-uuid', stock: -1, stockAnterior: 'abc', motivo: 'x'.repeat(501) }, AjusteDto);
    expect(lista).toEqual(expect.arrayContaining([
      'solicitudId: identificador no válido',
      'stock: no puede ser menor que 0',
      'stockAnterior: debe ser un número válido',
      'motivo: admite hasta 500 caracteres',
    ]));
    sinIngles(lista);
    sinIngles(await mensajes({}, PagoDto));
  });

  it('un cuerpo válido pasa igual que antes y un dato sobrante se descarta sin error', async () => {
    const dto = await pipe.transform({ solicitudId: '11111111-1111-4111-8111-111111111111', stock: 5, stockAnterior: 4, motivo: 'Conteo', extra: 1 }, { type: 'body', metatype: AjusteDto });
    expect(dto).toBeInstanceOf(AjusteDto);
    expect((dto as any).extra).toBeUndefined();
  });

  it('las líneas anidadas conservan la ruta del dato', async () => {
    const lista = await mensajes({ solicitudId: '11111111-1111-4111-8111-111111111111', metodoPago: 'EFECTIVO', detalles: [{ productoId: 'x', cantidad: 'dos' }] }, CreateVentaDto);
    expect(lista.some((m) => m.startsWith('detalles.0.'))).toBe(true);
    sinIngles(lista);
  });

  it('los mensajes propios de un DTO no se tocan', async () => {
    const lista = await mensajes({ nombre: '', email: 'no-es-correo' }, CreateClienteDto);
    expect(lista).toContain('El nombre del cliente es obligatorio');
    expect(lista).toContain('El correo electrónico no es válido');
  });

  it('un texto que no es de class-validator se devuelve sin cambios', () => {
    for (const texto of ['La cotización debe tener al menos un ítem', 'Pago mayor al saldo', '', 'motivo']) expect(traducirMensajeValidacion(texto)).toBe(texto);
    expect(traducirMensajeValidacion('each value in etiquetas must be a string')).toBe('etiquetas: debe ser texto (en cada valor)');
    expect(traducirMensajeValidacion('rol must be one of the following values: ADMIN, CAJERO')).toBe('rol: valor no permitido (opciones: ADMIN, CAJERO)');
  });
});
