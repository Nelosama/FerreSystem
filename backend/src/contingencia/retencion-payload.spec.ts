import { createHash } from 'node:crypto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { huellaPayloadContingencia } from './contingencia.service';
import { OperacionContingenciaDto } from './dto/contingencia.dto';
import { aOperacionDto, payloadCanonico } from '../../test/helpers/payload-cliente';

const op: any = {
  operacionId: 'd2a39691-8de8-4b93-893b-34eaeeff14e0', dispositivoId: 'e13e6405-8b2d-4493-871a-89b78fda38ea',
  ventanaId: 'c63b1aba-c862-4ff8-a061-22a289c8b705', cajaId: 'caja', cajeroId: 'cajero',
  indiceOperacion: 2, secuenciaLocal: 9, correlativoLocal: 'CT-01-0009', ocurridoAtLocal: '2026-11-05T12:00:00.000Z',
  lineas: [{ productoId: 'p', cantidadCentesimas: 125, precioCentavos: 100, nombre: 'Etiqueta local' }],
  subtotalCentavos: 125, isvCentavos: 19, totalCentavos: 144, efectivoRecibidoCentavos: 200, cambioCentavos: 56,
  clienteNombre: 'José «Cliente»', clienteRtn: 'dato sintético', esquemaVersion: 1,
};
const hashCliente = (o: any) => createHash('sha256').update(payloadCanonico(o)).digest('hex');

describe('Retención: mismo payload inmutable en cliente y PostgreSQL', () => {
  it.each([op, { ...op, clienteNombre: '', clienteRtn: '' }, { ...op, indiceOperacion: undefined }])('atraviesa DTO y JSON sin cambiar la huella', async (local) => {
    const recibido = plainToInstance(OperacionContingenciaDto, JSON.parse(JSON.stringify(aOperacionDto(local))));
    expect(await validate(recibido, { whitelist: true })).toEqual([]);
    const persistido = JSON.parse(JSON.stringify(recibido));
    expect(huellaPayloadContingencia(persistido)).toBe(hashCliente(local));
    const reordenado = Object.fromEntries(Object.entries(persistido).reverse());
    expect(huellaPayloadContingencia(reordenado)).toBe(hashCliente(local));
  });
  it('detecta cambios en cada campo del DTO, incluidos identidad, cliente y versión', () => {
    for (const campo of Object.keys(aOperacionDto(op))) {
      const copia = structuredClone(op);
      if (campo === 'metodoPago') continue;
      if (campo === 'lineas') copia.lineas[0].cantidadCentesimas++;
      else copia[campo] = typeof copia[campo] === 'number' ? copia[campo] + 1 : `${copia[campo]}X`;
      expect(hashCliente(copia), campo).not.toBe(hashCliente(op));
    }
    expect(huellaPayloadContingencia({ ...aOperacionDto(op), metodoPago: 'OTRO' })).not.toBe(hashCliente(op));
    expect(hashCliente({ ...op, cajaId: 'otra', estado: 'REVISION', cajeroNombre: 'Etiqueta' })).toBe(hashCliente(op));
  });
  it('rechaza el hash de una proyección o de una sola serialización', () => {
    const dto = aOperacionDto(op);
    expect(huellaPayloadContingencia(dto)).not.toBe(createHash('sha256').update(JSON.stringify(dto)).digest('hex'));
    expect(huellaPayloadContingencia({ operacionId: op.operacionId, totalCentavos: op.totalCentavos })).not.toBe(hashCliente(op));
  });
});
