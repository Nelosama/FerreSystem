import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateClienteDto, UpdateClienteDto } from './dto/create-cliente.dto';

// Los textos del cliente no tenían largo máximo: una petición podía guardar cadenas de hasta 2 MB por campo.
const campos = async (Dto: typeof CreateClienteDto | typeof UpdateClienteDto, datos: object) =>
  (await validate(plainToInstance(Dto, datos))).map(e => e.property).sort();

describe('largo máximo de los datos del cliente', () => {
  const normal = { nombre: 'Constructora del Norte', rtn: '08019999123456', telefono: '9876-5432', direccion: 'Barrio El Centro, Tegucigalpa' };
  const largo = { nombre: 'n'.repeat(201), rtn: '1'.repeat(101), telefono: '9'.repeat(51), direccion: 'd'.repeat(501) };
  const limite = { nombre: 'n'.repeat(200), rtn: '1'.repeat(100), telefono: '9'.repeat(50), direccion: 'd'.repeat(500) };

  for (const [nombre, Dto] of [['alta', CreateClienteDto], ['edición', UpdateClienteDto]] as const) {
    it(`${nombre}: acepta datos habituales y el largo exacto del límite`, async () => {
      expect(await campos(Dto, normal)).toEqual([]);
      expect(await campos(Dto, limite)).toEqual([]);
    });
    it(`${nombre}: rechaza cada campo que supera su límite`, async () => {
      expect(await campos(Dto, largo)).toEqual(['direccion', 'nombre', 'rtn', 'telefono']);
    });
  }
  it('el mensaje al usuario está en español', async () => {
    const [error] = await validate(plainToInstance(CreateClienteDto, { nombre: 'n'.repeat(201) }));
    expect(Object.values(error.constraints ?? {})).toEqual(['El nombre del cliente no puede superar 200 caracteres']);
  });
});
