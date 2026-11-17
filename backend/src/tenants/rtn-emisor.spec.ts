import { BadRequestException } from '@nestjs/common';
import { normalizeTenantConfiguration, validateTenantConfiguration } from './tenant-configuration';

describe('RTN del emisor en la configuración de la empresa', () => {
  it('acepta 14 dígitos, espacios o guiones y guarda solo los dígitos', () => {
    for (const rtn of ['08019999000000', '0801-9999-000000', '0801 9999 000000']) {
      expect(() => validateTenantConfiguration({ rtn })).not.toThrow();
      expect(normalizeTenantConfiguration({ rtn }).rtn).toBe('08019999000000');
    }
    expect(() => validateTenantConfiguration({ rtn: null })).not.toThrow();
    expect(() => validateTenantConfiguration({ rtn: '' })).not.toThrow();
  });

  it('rechaza RTN con longitud o caracteres inválidos', () => {
    for (const rtn of ['0801999900000', '080199990000000', '0801-9999-00000A', '0801.9999.000000', 123]) {
      expect(() => validateTenantConfiguration({ rtn })).toThrow(BadRequestException);
    }
  });

  it('se devuelve solo si es válido; un valor corrupto se trata como ausente', () => {
    expect(normalizeTenantConfiguration({ rtn: '08019999000000' }).rtn).toBe('08019999000000');
    expect(normalizeTenantConfiguration({}).rtn).toBeNull();
    expect(normalizeTenantConfiguration({ rtn: 'abc' }).rtn).toBeNull();
  });
});
