import { BadRequestException } from '@nestjs/common';
import { normalizeTenantConfiguration, validateTenantConfiguration } from './tenant-configuration';

describe('RTN del emisor en la configuración de la empresa', () => {
  it('acepta 14 dígitos o null para quitarlo', () => {
    expect(() => validateTenantConfiguration({ rtn: '08019999000000' })).not.toThrow();
    expect(() => validateTenantConfiguration({ rtn: null })).not.toThrow();
  });

  it('rechaza RTN con longitud o caracteres inválidos', () => {
    for (const rtn of ['0801999900000', '080199990000000', '0801-9999-0000', '', 123]) {
      expect(() => validateTenantConfiguration({ rtn })).toThrow(BadRequestException);
    }
  });

  it('se devuelve solo si es válido; un valor corrupto se trata como ausente', () => {
    expect(normalizeTenantConfiguration({ rtn: '08019999000000' }).rtn).toBe('08019999000000');
    expect(normalizeTenantConfiguration({}).rtn).toBeNull();
    expect(normalizeTenantConfiguration({ rtn: 'abc' }).rtn).toBeNull();
  });
});
