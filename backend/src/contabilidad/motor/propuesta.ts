/**
 * Propuesta de contabilización de UNA operación: reglas + origen + cuentas. Pura.
 * El estado dice si se puede contabilizar (LISTA), si falta configurar cuentas (FALTA_MAPEO), si no hay nada que contabilizar (SIN_ASIENTO) o si la operación no cuadra (ERROR).
 * El servicio (con base de datos) solo lee las operaciones, llama aquí y contabiliza las propuestas LISTA elegidas.
 */
import { huellaOrigen, type OrigenAsiento } from './origen';
import type { ErrorMotor, ResultadoAsiento } from './reglas';
import { resolverCuentas, type CuentaCatalogo, type LineaResuelta, type MapeoVigencia, type MotivoCuenta } from './resolucion';
import type { Concepto } from './conceptos';

export interface DatosPropuesta {
  origen: OrigenAsiento;
  /** Día calendario contable de la operación en la zona del negocio. */
  fecha: string;
  concepto: string;
  resultado: ResultadoAsiento;
  /** Datos tal como se leyeron de la operación, para la huella de trazabilidad. */
  fuente: unknown;
}
export type Propuesta =
  | { estado: 'LISTA'; origen: OrigenAsiento; fecha: string; concepto: string; regla: string; version: number; huella: string; lineas: LineaResuelta[]; totalCentavos: number }
  | { estado: 'FALTA_MAPEO'; origen: OrigenAsiento; fecha: string; concepto: string; regla: string; faltantes: Concepto[]; invalidas: { concepto: Concepto; motivo: MotivoCuenta }[] }
  | { estado: 'SIN_ASIENTO'; origen: OrigenAsiento; fecha: string; concepto: string; regla: string }
  | { estado: 'ERROR'; origen: OrigenAsiento; fecha: string; concepto: string; regla: string; errores: ErrorMotor[] };

export function proponer(d: DatosPropuesta, mapeos: readonly MapeoVigencia[], cuentas: readonly CuentaCatalogo[]): Propuesta {
  const base = { origen: d.origen, fecha: d.fecha, concepto: d.concepto, regla: d.resultado.regla };
  if (d.resultado.ok === false) return { estado: 'ERROR', ...base, errores: d.resultado.errores };
  // Operación válida sin importe contabilizable (p. ej. venta solo de líneas sin inventario para el costo): no genera asiento.
  if (d.resultado.lineas.length === 0) return { estado: 'SIN_ASIENTO', ...base };
  const r = resolverCuentas(d.resultado.lineas, d.fecha, mapeos, cuentas);
  if (r.ok === false) return { estado: 'FALTA_MAPEO', ...base, faltantes: r.faltantes, invalidas: r.invalidas };
  return { estado: 'LISTA', ...base, version: d.resultado.version, huella: huellaOrigen({ fuente: d.fuente, origen: d.origen, regla: d.resultado.regla, version: d.resultado.version }), lineas: r.lineas, totalCentavos: d.resultado.totalCentavos };
}
