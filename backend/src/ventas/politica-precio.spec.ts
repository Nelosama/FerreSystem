import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { exigirPoliticaPrecio, lineasConPrecioDistinto, PERMISO_EXCEPCION_PRECIO, type LineaPrecio } from './politica-precio';

const linea = (precioVigente: number, precioCobrado: number): LineaPrecio => ({ productoId: 'p1', producto: 'Clavo', precioVigente, precioCobrado });
const motivo = 'Precio negociado con el cliente';
const admin = { rol: 'ADMIN', permisos: [PERMISO_EXCEPCION_PRECIO] };

describe('política única de precio distinto del vigente', () => {
  it('sin cambio de precio no exige nada y no audita', () => {
    expect(exigirPoliticaPrecio({ rol: 'CAJERO' }, [linea(10, 10)], undefined)).toBeNull();
    expect(exigirPoliticaPrecio({ rol: 'CAJERO' }, [linea(10.1, 10.10)])).toBeNull();
  });

  it('compara en centavos: un precio igual con otra escritura no cuenta como cambio', () => {
    expect(lineasConPrecioDistinto([linea(10.1, 10.1), linea(5, 5.01)]).map(l => l.precioCobrado)).toEqual([5.01]);
  });

  it('sin excepción explícita responde 409, también para ADMIN con permiso', () => {
    expect(() => exigirPoliticaPrecio(admin, [linea(10, 9)], undefined)).toThrow(ConflictException);
    expect(() => exigirPoliticaPrecio(admin, [linea(10, 9)], null)).toThrow(ConflictException);
  });

  it('un objeto de excepción sin motivo válido responde 400 sin importar el rol', () => {
    expect(() => exigirPoliticaPrecio(admin, [linea(10, 9)], {})).toThrow(BadRequestException);
    expect(() => exigirPoliticaPrecio(admin, [linea(10, 9)], { motivo: 'corto' })).toThrow(BadRequestException);
    expect(() => exigirPoliticaPrecio(admin, [linea(10, 9)], { motivo: '   ' })).toThrow(BadRequestException);
    expect(() => exigirPoliticaPrecio(admin, [linea(10, 9)], { motivo: 'x'.repeat(301) })).toThrow(BadRequestException);
  });

  it('el rol nunca concede la excepción: CAJERO y VENDEDOR reciben 403 aunque traigan motivo', () => {
    for (const rol of ['CAJERO', 'VENDEDOR', 'BODEGUERO']) {
      expect(() => exigirPoliticaPrecio({ rol, permisos: [PERMISO_EXCEPCION_PRECIO] }, [linea(10, 9)], { motivo })).toThrow(ForbiddenException);
    }
  });

  it('ADMIN sin el permiso asignado recibe 403: el permiso es explícito', () => {
    expect(() => exigirPoliticaPrecio({ rol: 'ADMIN', permisos: ['pos.vender'] }, [linea(10, 9)], { motivo })).toThrow(ForbiddenException);
    expect(() => exigirPoliticaPrecio({ rol: 'ADMIN' }, [linea(10, 9)], { motivo })).toThrow(ForbiddenException);
  });

  it('ADMIN con permiso y motivo obtiene la excepción auditable con solo las líneas que cambian', () => {
    const resultado = exigirPoliticaPrecio(admin, [linea(10, 10), { ...linea(20, 18), productoId: 'p2', producto: 'Tubo' }], { motivo: `  ${motivo}  ` });
    expect(resultado).toEqual({ motivo, lineas: [{ productoId: 'p2', producto: 'Tubo', precioVigente: 20, precioCobrado: 18 }] });
  });
});
