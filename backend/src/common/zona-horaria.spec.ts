import { ZONA_HORARIA_NEGOCIO, diaCalendario, inicioDiaEnZona, rangoDiasEnZona, sumarDias } from './zona-horaria';

describe('zona-horaria', () => {
  it('usa America/Tegucigalpa como zona de referencia por defecto', () => {
    expect(ZONA_HORARIA_NEGOCIO).toBe('America/Tegucigalpa');
  });

  describe('diaCalendario', () => {
    it('una venta a las 23:59:59 local sigue en su día; a las 00:00 local ya es el día siguiente', () => {
      expect(diaCalendario(new Date('2026-10-10T05:59:59.999Z'))).toBe('2026-10-09');
      expect(diaCalendario(new Date('2026-10-10T06:00:00.000Z'))).toBe('2026-10-10');
    });

    it('una venta a las 20:30 local (02:30 UTC del día siguiente) pertenece al día local anterior', () => {
      expect(diaCalendario(new Date('2026-10-10T02:30:00.000Z'))).toBe('2026-10-09');
    });

    it('no depende de la zona horaria del proceso', () => {
      expect(diaCalendario(new Date('2026-10-10T02:30:00.000Z'), 'UTC')).toBe('2026-10-10');
    });
  });

  describe('inicioDiaEnZona', () => {
    it('Tegucigalpa (UTC-6, sin horario de verano): 00:00 local = 06:00 UTC', () => {
      expect(inicioDiaEnZona('2026-10-10').toISOString()).toBe('2026-10-10T06:00:00.000Z');
    });

    it('respeta el cambio de horario de verano de Nueva York (inicio: EST, luego EDT)', () => {
      expect(inicioDiaEnZona('2026-03-08', 'America/New_York').toISOString()).toBe('2026-03-08T05:00:00.000Z');
      expect(inicioDiaEnZona('2026-03-09', 'America/New_York').toISOString()).toBe('2026-03-09T04:00:00.000Z');
    });
  });

  describe('rangoDiasEnZona', () => {
    it('un día completo local: [00:00 local, 00:00 local del día siguiente)', () => {
      const { inicio, fin } = rangoDiasEnZona('2026-10-09', '2026-10-09');
      expect(inicio.toISOString()).toBe('2026-10-09T06:00:00.000Z');
      expect(fin.toISOString()).toBe('2026-10-10T06:00:00.000Z');
    });

    it('varios días: incluye el último día completo', () => {
      const { inicio, fin } = rangoDiasEnZona('2026-09-30', '2026-10-01');
      expect(inicio.toISOString()).toBe('2026-09-30T06:00:00.000Z');
      expect(fin.toISOString()).toBe('2026-10-02T06:00:00.000Z');
    });

    it('cambio de mes y de año', () => {
      const { fin } = rangoDiasEnZona('2026-12-31', '2026-12-31');
      expect(fin.toISOString()).toBe('2027-01-01T06:00:00.000Z');
    });
  });

  it('sumarDias cruza meses y años por calendario', () => {
    expect(sumarDias('2026-10-01', -1)).toBe('2026-09-30');
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(sumarDias('2026-02-28', 1)).toBe('2026-03-01');
  });
});
