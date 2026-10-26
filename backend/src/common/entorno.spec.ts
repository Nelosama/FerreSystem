import { esProduccion } from './entorno';

describe('esProduccion', () => {
  it('reconoce production sin importar espacios ni mayúsculas', () => {
    expect(esProduccion('production')).toBe(true);
    expect(esProduccion(' Production\n')).toBe(true);
  });
  it('no trata como producción los demás valores ni la ausencia', () => {
    expect(esProduccion(undefined)).toBe(false);
    expect(esProduccion('development')).toBe(false);
    expect(esProduccion('prod')).toBe(false);
  });
});
