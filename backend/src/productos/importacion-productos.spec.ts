import { describe, expect, it } from 'vitest';
import { claveTexto, filaTienePrecio, leerImporte, leerUnidad, validarFilasImportacion } from './importacion-productos';

const base = (extra: Record<string, unknown> = {}) => ({ codigo: 'CLV-1', nombre: 'Clavo 2 pulgadas', stockActual: '10', ...extra });

describe('leerImporte: ausente, cero y formato', () => {
  it('una celda vacía es ausente (null), no cero', () => {
    expect(leerImporte('')).toEqual({ valor: null });
    expect(leerImporte('   ')).toEqual({ valor: null });
    expect(leerImporte(undefined)).toEqual({ valor: null });
    expect(leerImporte(null)).toEqual({ valor: null });
  });
  it('acepta números y texto con punto decimal y dos decimales', () => {
    expect(leerImporte('85.00')).toEqual({ valor: 85 });
    expect(leerImporte('25.99')).toEqual({ valor: 25.99 });
    expect(leerImporte(4)).toEqual({ valor: 4 });
    expect(leerImporte('0')).toEqual({ valor: 0 });
  });
  it('rechaza texto, separadores de miles y más de dos decimales', () => {
    expect(leerImporte('abc').error).toBeDefined();
    expect(leerImporte('1,250.00').error).toBeDefined();
    expect(leerImporte('25.999').error).toBeDefined();
    expect(leerImporte(25.999).error).toBeDefined();
    expect(leerImporte({}).error).toBeDefined();
    expect(leerImporte(Number.NaN).error).toBeDefined();
  });
  it('devuelve el negativo para que la regla de negocio lo rechace con su campo', () => {
    expect(leerImporte('-15.00')).toEqual({ valor: -15 });
  });
});

describe('validarFilasImportacion: precios', () => {
  it('un precio positivo queda como propuesto; una celda vacía queda sin precio', () => {
    const { validas, errores } = validarFilasImportacion([base({ precioVenta: '85.00', precioCosto: '50' }), base({ codigo: 'CLV-2', nombre: 'Clavo 3', precioVenta: '' })]);
    expect(errores).toEqual([]);
    expect(validas[0]).toMatchObject({ precioVenta: 85, precioCosto: 50 });
    expect(validas[1]).toMatchObject({ precioVenta: null, precioCosto: null });
  });
  it('precio de venta negativo se rechaza con el campo y la fila', () => {
    const { errores } = validarFilasImportacion([base({ precioVenta: '-15.00' })]);
    expect(errores).toEqual([expect.objectContaining({ fila: 1, campo: 'precioVenta', mensaje: 'no puede ser negativo' })]);
  });
  it('precio de venta cero explícito no es vendible y se rechaza', () => {
    const { errores } = validarFilasImportacion([base({ precioVenta: '0' })]);
    expect(errores).toEqual([expect.objectContaining({ campo: 'precioVenta' })]);
    expect(errores[0].mensaje).toMatch(/cero/);
  });
  it('costo cero explícito es legítimo y se conserva como 0', () => {
    const { validas, errores } = validarFilasImportacion([base({ precioCosto: '0' })]);
    expect(errores).toEqual([]);
    expect(validas[0].precioCosto).toBe(0);
  });
  it('costo negativo se rechaza', () => {
    const { errores } = validarFilasImportacion([base({ precioCosto: '-1' })]);
    expect(errores).toEqual([expect.objectContaining({ campo: 'precioCosto', mensaje: 'no puede ser negativo' })]);
  });
});

describe('validarFilasImportacion: duplicados dentro del archivo', () => {
  it('bloquea todas las filas con el mismo código, sin importar mayúsculas', () => {
    const { errores } = validarFilasImportacion([base({ codigo: 'abc' }), base({ codigo: 'ABC', nombre: 'Otro' })]);
    expect(errores.map((e) => [e.fila, e.campo])).toEqual([[1, 'codigo'], [2, 'codigo']]);
  });
  it('bloquea códigos de barras repetidos dentro del archivo', () => {
    const { errores } = validarFilasImportacion([
      base({ codigo: 'A1', codigoBarras: '7501234567890' }),
      base({ codigo: 'A2', nombre: 'Otro', codigoBarras: '7501234567890' }),
    ]);
    expect(errores.map((e) => [e.fila, e.campo])).toEqual([[1, 'codigoBarras'], [2, 'codigoBarras']]);
  });
  it('un nombre repetido con código distinto no bloquea: solo advierte', () => {
    const { errores, advertencias } = validarFilasImportacion([base({ codigo: 'M-1', nombre: 'Martillo' }), base({ codigo: 'M-2', nombre: 'martillo' })]);
    expect(errores).toEqual([]);
    expect(advertencias.map((a) => [a.fila, a.tipo])).toEqual([[1, 'NOMBRE_REPETIDO_EN_ARCHIVO'], [2, 'NOMBRE_REPETIDO_EN_ARCHIVO']]);
  });
});

describe('validarFilasImportacion: filas malformadas y campos', () => {
  it('una fila que no es objeto se rechaza sin tumbar el resto', () => {
    const { errores, validas } = validarFilasImportacion(['texto', [1, 2], base()]);
    expect(errores.map((e) => [e.fila, e.campo])).toEqual([[1, '*'], [2, '*']]);
    expect(validas).toHaveLength(1);
  });
  it('código y nombre son obligatorios', () => {
    const { errores } = validarFilasImportacion([{ codigo: '', nombre: '   ' }]);
    expect(errores.map((e) => e.campo).sort()).toEqual(['codigo', 'nombre']);
  });
  it('tipos de dato no válidos (objeto en el nombre) se rechazan', () => {
    const { errores } = validarFilasImportacion([base({ nombre: { a: 1 } })]);
    expect(errores).toEqual([expect.objectContaining({ campo: 'nombre' })]);
  });
  it('stock negativo o con más de dos decimales se rechaza', () => {
    const { errores } = validarFilasImportacion([base({ stockActual: '-2' }), base({ codigo: 'B', stockActual: '1.005' })]);
    expect(errores.map((e) => [e.fila, e.campo])).toEqual([[1, 'stockActual'], [2, 'stockActual']]);
  });
  it('acepta existencias fraccionarias de dos decimales', () => {
    const { validas, errores } = validarFilasImportacion([base({ stockActual: '2.50' })]);
    expect(errores).toEqual([]);
    expect(validas[0].stockActual).toBe(2.5);
  });
  it('una unidad fuera del catálogo se rechaza, pero acepta acentos y mayúsculas', () => {
    expect(validarFilasImportacion([base({ unidadMedida: 'FURLONG' })]).errores[0].campo).toBe('unidadMedida');
    expect(validarFilasImportacion([base({ unidadMedida: 'galón' })]).validas[0].unidadMedida).toBe('GALON');
    expect(validarFilasImportacion([base({ unidadMedida: ' caja ' })]).validas[0].unidadMedida).toBe('CAJA');
  });
  it('un código numérico (como llega de un CSV) se acepta como texto', () => {
    const { validas } = validarFilasImportacion([base({ codigo: 12345 })]);
    expect(validas[0].codigo).toBe('12345');
  });
});

describe('claveTexto y filaTienePrecio', () => {
  it('compara categorías sin acentos, sin mayúsculas y con espacios colapsados', () => {
    expect(claveTexto('  TORNILLERÍA  ')).toBe(claveTexto('tornilleria'));
    expect(claveTexto('Herramientas   Manuales')).toBe('herramientas manuales');
  });
  it('filaTienePrecio ignora celdas vacías', () => {
    expect(filaTienePrecio({ precioVenta: '' })).toBe(false);
    expect(filaTienePrecio({ precioCosto: '0' })).toBe(true);
    expect(filaTienePrecio({ precioVenta: '5' })).toBe(true);
    expect(filaTienePrecio(null)).toBe(false);
  });
});

describe('leerUnidad', () => {
  it('reconoce el enumerado y sus alias, y rechaza lo desconocido', () => {
    expect(leerUnidad('UNIDAD').valor).toBe('UNIDAD');
    expect(leerUnidad('metro').valor).toBe('METRO');
    expect(leerUnidad('LB').valor).toBe('LIBRA');
    expect(leerUnidad('').valor).toBeNull();
    expect(leerUnidad('barril').error).toMatch(/no válida/);
  });
});
