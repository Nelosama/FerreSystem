/**
 * Resolución de conceptos a cuentas del catálogo, con la vigencia del mapeo a la fecha contable.
 * Puro: recibe los mapeos y las cuentas ya leídos. Nunca elige una cuenta por su cuenta: sin mapeo vigente no hay asiento.
 */
import type { Concepto } from './conceptos';
import type { LineaPropuesta } from './reglas';

export interface MapeoVigencia { concepto: Concepto; cuentaId: string; desde: string; hasta: string | null }
export interface CuentaCatalogo { id: string; codigo: string; nombre: string; activa: boolean; aceptaMovimientos: boolean }
export interface LineaResuelta extends LineaPropuesta { cuentaId: string; cuentaCodigo: string; cuentaNombre: string }
export type MotivoCuenta = 'MAPEO_AMBIGUO' | 'CUENTA_INEXISTENTE' | 'CUENTA_INACTIVA' | 'CUENTA_NO_ACEPTA_MOVIMIENTOS';
export type ResultadoResolucion =
  | { ok: true; lineas: LineaResuelta[] }
  | { ok: false; faltantes: Concepto[]; invalidas: { concepto: Concepto; motivo: MotivoCuenta }[] };

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** `fecha` es un día calendario `YYYY-MM-DD` (la fecha contable de la operación en la zona del negocio). */
export function resolverCuentas(
  lineas: readonly LineaPropuesta[],
  fecha: string,
  mapeos: readonly MapeoVigencia[],
  cuentas: readonly CuentaCatalogo[],
): ResultadoResolucion {
  if (!DIA.test(fecha)) throw new RangeError('La fecha contable debe ser YYYY-MM-DD');
  const porCuenta = new Map(cuentas.map((c) => [c.id, c]));
  const decididos = new Map<Concepto, CuentaCatalogo>();
  const faltantes: Concepto[] = [];
  const invalidas: { concepto: Concepto; motivo: MotivoCuenta }[] = [];

  for (const concepto of new Set(lineas.map((l) => l.concepto))) {
    const vigentes = mapeos.filter((m) => m.concepto === concepto && m.desde <= fecha && (m.hasta === null || fecha <= m.hasta));
    if (vigentes.length === 0) { faltantes.push(concepto); continue; }
    if (vigentes.length > 1) { invalidas.push({ concepto, motivo: 'MAPEO_AMBIGUO' }); continue; }
    const cuenta = porCuenta.get(vigentes[0].cuentaId);
    if (!cuenta) invalidas.push({ concepto, motivo: 'CUENTA_INEXISTENTE' });
    else if (!cuenta.activa) invalidas.push({ concepto, motivo: 'CUENTA_INACTIVA' });
    else if (!cuenta.aceptaMovimientos) invalidas.push({ concepto, motivo: 'CUENTA_NO_ACEPTA_MOVIMIENTOS' });
    else decididos.set(concepto, cuenta);
  }
  if (faltantes.length || invalidas.length) return { ok: false, faltantes, invalidas };
  return {
    ok: true,
    lineas: lineas.map((l) => {
      const c = decididos.get(l.concepto)!;
      return { ...l, cuentaId: c.id, cuentaCodigo: c.codigo, cuentaNombre: c.nombre };
    }),
  };
}
