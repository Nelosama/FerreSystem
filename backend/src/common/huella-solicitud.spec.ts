import { describe, expect, it } from 'vitest';
import { aCentesimas, canonicalJson, huellaAccionVenta, huellaCanonica, normalizarTexto } from './huella-solicitud';

const base = {
  tipo: 'ENTREGA',
  ventaId: 'venta-1',
  usuarioId: 'usuario-1',
  origen: 'ONLINE' as const,
  lineas: [
    { detalleVentaId: 'det-b', cantidadCentesimas: 200 },
    { detalleVentaId: 'det-a', cantidadCentesimas: 100 },
  ],
  receptorNombre: 'Juan Pérez',
  motivo: null,
};

describe('canonicalJson', () => {
  it('ordena claves en todos los niveles y no depende del orden de inserción', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { z: 0, y: 1 }] } })).toBe('{"a":{"c":[3,{"y":1,"z":0}],"d":2},"b":1}');
  });

  it('rechaza decimales: las cantidades deben estar en centésimas', () => {
    expect(() => canonicalJson({ cantidad: 1.5 })).toThrow();
  });

  it('omite propiedades indefinidas y conserva null', () => {
    expect(canonicalJson({ a: undefined, b: null })).toBe('{"b":null}');
  });
});

describe('aCentesimas', () => {
  it('convierte cantidades con hasta dos decimales sin error de coma flotante', () => {
    expect(aCentesimas(2, 'c')).toBe(200);
    expect(aCentesimas(2.5, 'c')).toBe(250);
    expect(aCentesimas(0.1 + 0.2, 'c', true)).toBe(30);
  });

  it('rechaza más de dos decimales, valores no finitos y ceros cuando se exige positivo', () => {
    expect(() => aCentesimas(1.005, 'c')).toThrow('máximo dos decimales');
    expect(() => aCentesimas(Number.NaN, 'c')).toThrow();
    expect(() => aCentesimas(0, 'c', true)).toThrow('mayor que cero');
    expect(() => aCentesimas(-1, 'c')).toThrow('no negativo');
  });
});

describe('normalizarTexto', () => {
  it('recorta, colapsa espacios y normaliza a NFC', () => {
    expect(normalizarTexto('  Juan   Pérez ')).toBe('Juan Pérez');
    expect(normalizarTexto('Pérez')).toBe('Pérez');
    expect(normalizarTexto('   ')).toBeNull();
    expect(normalizarTexto(null)).toBeNull();
  });
});

describe('huellaAccionVenta (T47: equivalencias)', () => {
  it('líneas en otro orden producen la misma huella', () => {
    const invertida = { ...base, lineas: [...base.lineas].reverse() };
    expect(huellaAccionVenta(invertida)).toBe(huellaAccionVenta(base));
  });

  it('cantidades escritas como 2, 2.0 o 2.00 llegan como las mismas centésimas', () => {
    const a = { ...base, lineas: [{ detalleVentaId: 'det-a', cantidadCentesimas: aCentesimas(2, 'q') }] };
    const b = { ...base, lineas: [{ detalleVentaId: 'det-a', cantidadCentesimas: aCentesimas(2.0, 'q') }] };
    const c = { ...base, lineas: [{ detalleVentaId: 'det-a', cantidadCentesimas: aCentesimas(2.00, 'q') }] };
    expect(huellaAccionVenta(a)).toBe(huellaAccionVenta(b));
    expect(huellaAccionVenta(b)).toBe(huellaAccionVenta(c));
  });

  it('espacios y forma Unicode del receptor no cambian la huella', () => {
    const otro = { ...base, receptorNombre: '  Juan   Pérez ' };
    expect(huellaAccionVenta(otro)).toBe(huellaAccionVenta({ ...base, receptorNombre: 'Juan Pérez' }));
  });

  it('cualquier diferencia de contenido produce otra huella (T43, T44, T45)', () => {
    const h = huellaAccionVenta(base);
    expect(huellaAccionVenta({ ...base, lineas: [{ detalleVentaId: 'det-a', cantidadCentesimas: 150 }, base.lineas[0]] })).not.toBe(h);
    expect(huellaAccionVenta({ ...base, receptorNombre: 'María López' })).not.toBe(h);
    expect(huellaAccionVenta({ ...base, usuarioId: 'usuario-2' })).not.toBe(h);
    expect(huellaAccionVenta({ ...base, tipo: 'PREPARACION' })).not.toBe(h);
    expect(huellaAccionVenta({ ...base, origen: 'OFFLINE' })).not.toBe(h);
  });

  it('el hash es SHA-256 hexadecimal de 64 caracteres en minúsculas (CHECK de la tabla)', () => {
    expect(huellaAccionVenta(base)).toMatch(/^[0-9a-f]{64}$/);
    expect(huellaCanonica({ x: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });
});
