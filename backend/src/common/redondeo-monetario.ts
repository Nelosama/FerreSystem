import { BadRequestException } from '@nestjs/common';

/**
 * Conversión a centavos enteros para cálculos monetarios en línea (ventas, descuentos y cotizaciones).
 *
 * Reglas (las mismas que el módulo offline de `common/dinero.ts`, que es el que se prueba con vectores compartidos):
 * - Los importes entran con dos decimales como máximo y salen como centavos enteros: nunca se multiplica un
 *   decimal en coma flotante.
 * - Redondeo al centavo: mitad hacia arriba, aplicado sobre enteros.
 * - Subtotal de línea = precio (centavos) × cantidad (centésimas) / 100, redondeado.
 * - ISV = 15% de la base (subtotal − descuento), redondeado; total = base + ISV.
 */

/** Convierte un importe o precio a centavos. Rechaza más de dos decimales (un redondeo silencioso cambiaría el total). */
export function aCentavos(valor: number, etiqueta = 'Importe'): number {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) throw new BadRequestException(`${etiqueta}: valor no numérico`);
  const centavos = Math.round(valor * 100);
  if (Math.abs(valor * 100 - centavos) > 1e-7) throw new BadRequestException(`${etiqueta}: use hasta dos decimales`);
  if (!Number.isSafeInteger(centavos)) throw new BadRequestException(`${etiqueta}: fuera de rango`);
  return centavos;
}

/** División entera redondeada con mitad hacia arriba. Solo para enteros no negativos. */
export function divisionMitadArriba(numerador: number, divisor: number): number {
  return Math.floor((numerador * 2 + divisor) / (divisor * 2));
}
