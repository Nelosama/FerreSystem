import { describe, expect, it } from 'vitest';
import { formatFechaCalendario } from './format';

describe('formatFechaCalendario (FS-04)', () => {
  it('muestra el día capturado sin desplazarlo por zona horaria', () => {
    expect(formatFechaCalendario('2026-10-09T00:00:00.000Z')).toBe('09/10/2026');
    expect(formatFechaCalendario('2026-10-09')).toBe('09/10/2026');
    expect(formatFechaCalendario(new Date('2026-01-01T00:00:00.000Z'))).toBe('01/01/2026');
  });
  it('devuelve guion para valores vacíos o inválidos', () => {
    expect(formatFechaCalendario(null)).toBe('—');
    expect(formatFechaCalendario('')).toBe('—');
    expect(formatFechaCalendario('x')).toBe('—');
  });
});
