import { diagnosticoSeguro } from './diagnostico-seguro';

describe('diagnosticoSeguro', () => {
  it('no incluye los argumentos de una invocación de Prisma', () => {
    const error = Object.assign(new Error('\nInvalid `prisma.venta.create()` invocation:\n\n{\n  data: { clienteNombre: "Juana Pérez", clienteRtn: "08011999000001" }\n}\n\nUnique constraint failed'), { name: 'PrismaClientKnownRequestError', code: 'P2002' });
    const texto = diagnosticoSeguro(error);
    expect(texto).toBe('PrismaClientKnownRequestError P2002: invocación de Prisma rechazada');
    expect(texto).not.toMatch(/Juana|0801/);
  });

  it('conserva la primera línea de errores propios, acotada, y tolera valores no estándar', () => {
    expect(diagnosticoSeguro(new Error('Caja cerrada\nsegunda línea'))).toBe('Error: Caja cerrada');
    expect(diagnosticoSeguro(new Error('x'.repeat(500))).length).toBeLessThan(220);
    expect(diagnosticoSeguro(undefined)).toBe('Error');
    expect(diagnosticoSeguro({ code: 'no-es-prisma', message: 5 })).toBe('Error');
  });
});
