import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BadRequestException } from '@nestjs/common';
import { ContingenciaController } from '../src/contingencia/contingencia.controller';
import { longitudDeNegocio, caracteresVisibles } from '../src/contingencia/texto-minimo';
import { ContingenciaService } from '../src/contingencia/contingencia.service';
import { ActualizarReferenciaDto, OperacionContingenciaDto, SolicitarVentanaDto, ResolverOperacionDto, esFechaHoraIso } from '../src/contingencia/dto/contingencia.dto';

// CENTINELA sobre 71ec3a00 (H-J..H-O): entradas que no pasan por un DTO de texto. No requiere base de datos.
describe('Contingencia: cierre de entradas fuera de los DTO (H-J..H-O)', () => {
  const llamadas: any[] = [];
  const servicio: any = {
    desactivarDispositivo: (...a: any[]) => { llamadas.push(['desactivar', ...a]); return {}; },
    estados: (...a: any[]) => { llamadas.push(['estados', ...a]); return {}; },
  };
  const controlador = new ContingenciaController(servicio);
  const pipeDeId = () => {
    const meta = Reflect.getMetadata('__routeArguments__', ContingenciaController, 'latido');
    const param = Object.values<any>(meta).find((m) => m.data === 'id');
    return param.pipes[0] as { transform: (v: string) => string };
  };

  it('H-J: truncar el motivo a 300 no parte un emoji ni deja un sustituto suelto', () => {
    controlador.desactivarDispositivo('t', 'u', 'id', { motivo: 'a'.repeat(299) + '😀' });
    const motivo = llamadas.at(-1)[4] as string;
    expect([...motivo].length).toBe(300);
    expect(motivo.isWellFormed()).toBe(true);
  });

  it('H-K: los :id con nulo, vacíos o demasiado largos son 400; un UUID pasa', () => {
    const pipe = pipeDeId();
    for (const malo of ['\u0000', 'a\u0000b', '', 'x'.repeat(101), '\uD800']) expect(() => pipe.transform(malo)).toThrow(BadRequestException);
    expect(pipe.transform('7d4f0a0e-6f1e-4c0e-9c0e-0a0b0c0d0e0f')).toBe('7d4f0a0e-6f1e-4c0e-9c0e-0a0b0c0d0e0f');
  });

  it('H-L: marcas de combinación, selectores suplementarios e ignorables no cuentan como visibles ni como longitud', () => {
    for (const falso of ['\u0301', '\u{E0100}', '\u17B4', '\u180B', '\u0E3A', '\u2065', '\uFFF0']) {
      expect(caracteresVisibles(falso.repeat(25)), `visibles ${falso.codePointAt(0)!.toString(16)}`).toBe(0);
    }
    expect(longitudDeNegocio('Cambio de caja')).toBe(14);
    expect(caracteresVisibles('Cambio de caja')).toBe(12);
    expect(caracteresVisibles('Señal ¿ok? ¡sí! Nº 5 😀')).toBeGreaterThanOrEqual(15);
  });

  it('H-L: la nota y el motivo con solo marcas se rechazan por HTTP-DTO', async () => {
    const nota = plainToInstance(ActualizarReferenciaDto, { referenciaFacturaExterna: '́'.repeat(12) });
    const r = plainToInstance(ResolverOperacionDto, { accion: 'CERRAR_MANUAL', nota: '\u{E0100}'.repeat(12) } as any);
    expect((await validate(nota)).length + (await validate(r)).length).toBeGreaterThan(0);
  });

  it('H-M: solo se aceptan fechas ISO de calendario; semanal, ordinal y fuera de rango se rechazan', async () => {
    for (const mala of ['2026-W41-1', '2026-284', '2026-02-30T10:00:00Z', 'ayer', '9999-12-31T00:00:00Z', '1960-01-01T00:00:00Z']) expect(esFechaHoraIso(mala)).toBe(false);
    for (const buena of ['2026-10-11T12:30:00.123Z', '2026-10-11T12:30:00-06:00', '2026-10-11']) expect(esFechaHoraIso(buena)).toBe(true);
    const v = plainToInstance(SolicitarVentanaDto, { dispositivoId: '7d4f0a0e-6f1e-4c0e-9c0e-0a0b0c0d0e0f', relojLocal: '2026-W41-1' });
    expect((await validate(v)).some((e) => e.property === 'relojLocal')).toBe(true);
    const o = plainToInstance(OperacionContingenciaDto, { ocurridoAtLocal: '2026-284' } as any);
    expect((await validate(o)).some((e) => e.property === 'ocurridoAtLocal')).toBe(true);
  });

  it('H-N: ids repetidos (arreglo) no tumban el endpoint de estados', () => {
    controlador.estados('t', { sub: 'u', rol: 'CAJERO' }, ['a', 'b'] as any);
    expect(llamadas.at(-1).slice(-1)[0]).toEqual(['a', 'b']);
    controlador.estados('t', { sub: 'u', rol: 'CAJERO' }, undefined as any);
    expect(llamadas.at(-1).slice(-1)[0]).toEqual([]);
  });

  it('H-O: años fuera de 1900-2100 son 400 en listar y resumen; page se acota', async () => {
    const svc = new ContingenciaService({} as any);
    await expect(svc.resumen('t', '9999-12-31')).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.listar('t', { desde: '9999-12-31' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.listar('t', { desde: '1800-01-01' })).rejects.toBeInstanceOf(BadRequestException);
    let skip = -1;
    const prisma: any = { operacionContingencia: { findMany: async (q: any) => { skip = q.skip; return []; }, count: async () => 0 } };
    await new ContingenciaService(prisma).listar('t', { page: 1e300 }).catch(() => undefined);
    expect(skip).toBeLessThanOrEqual(100000 * 200);
  });
});
