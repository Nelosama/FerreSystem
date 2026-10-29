import { calcularTotalesCompra } from './compra-totales';

describe('calcularTotalesCompra: validación aritmética (no tributaria)', () => {
  const linea = (costo: number, cantidad = 10) => ({ costo, cantidad });

  it('calcula subtotal y total de las líneas, sin usar importes del cliente', () => {
    expect(calcularTotalesCompra([linea(45)], 67.5)).toEqual({ lineas: [450], subtotal: 450, isv: 67.5, total: 517.5 });
  });

  it('acepta ISV igual al subtotal y ISV cero: ninguna tasa concreta se valida aquí', () => {
    expect(calcularTotalesCompra([linea(45)], 450).total).toBe(900);
    expect(calcularTotalesCompra([linea(45)], 0).total).toBe(450);
    expect(calcularTotalesCompra([linea(45)], 67.5).total).toBe(517.5);
  });

  it('rechaza ISV mayor que el subtotal (500 % de la base, y cualquier exceso de céntimo)', () => {
    // Subtotal 45 × 10 = 450.
    expect(() => calcularTotalesCompra([linea(45)], 2250)).toThrow('El ISV no puede superar el subtotal');
    expect(() => calcularTotalesCompra([linea(45)], 450.01)).toThrow('El ISV no puede superar el subtotal');
    expect(() => calcularTotalesCompra([linea(45)], 450)).not.toThrow();
  });

  it('rechaza costo cero o negativo en cualquier línea', () => {
    expect(() => calcularTotalesCompra([linea(0)], 0)).toThrow('Costo: debe ser mayor que cero');
    expect(() => calcularTotalesCompra([linea(45), linea(-1)], 0)).toThrow('Costo: debe ser mayor que cero');
  });

  it('rechaza ISV negativo y con más de dos decimales (validación previa del importe)', () => {
    expect(() => calcularTotalesCompra([linea(45)], -1)).toThrow();
    expect(() => calcularTotalesCompra([linea(45)], 1.234)).toThrow(/dos decimales/);
  });
});
