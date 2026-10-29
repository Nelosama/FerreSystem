import { BadRequestException } from '@nestjs/common';
import { TASA_ISV_PORCIENTO } from './dinero';

/**
 * Política única de tasas de ISV transaccionales (P2-H1, docs/AUDITORIA_P2_FISCAL_20261029.md).
 *
 * Solo se admiten las tasas que el sistema ya aplica en todas sus rutas de venta: la del POS en línea y sin conexión
 * (`common/dinero.ts`) y la única que acepta la configuración del negocio (`tenants/tenant-configuration.ts`). Esta lista
 * NO es una decisión tributaria nueva: añadir una tasa (18 %, 0 % de exonerado u otra) requiere aprobación del contador
 * y del dueño, y entonces su origen debería ser `fiscal_tasas` con vigencia (ver H3 del mismo documento).
 *
 * La exención por línea (`exento`) es independiente de la tasa: una línea exenta no lleva ISV con cualquier tasa autorizada.
 */
export const TASAS_ISV_AUTORIZADAS: readonly number[] = Object.freeze([TASA_ISV_PORCIENTO]);

/** Límite estructural: ninguna tasa de ISV es del 100 % o más (mismo CHECK que `fiscal_tasas.porcentaje`). */
export const TASA_ISV_MAXIMA_ESTRUCTURAL = 100;

const centesimas = (valor: number) => Math.round(valor * 100);

/** Número finito, no negativo, menor que el límite estructural y con a lo sumo dos decimales. */
export function tasaIsvEstructuralmenteValida(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor) && valor >= 0 && valor < TASA_ISV_MAXIMA_ESTRUCTURAL
    && Math.abs(valor * 100 - centesimas(valor)) < 1e-6;
}

export function esTasaIsvAutorizada(valor: unknown): valor is number {
  return tasaIsvEstructuralmenteValida(valor) && TASAS_ISV_AUTORIZADAS.some((t) => centesimas(t) === centesimas(valor));
}

export const mensajeTasaNoAutorizada = () =>
  `Tasa de ISV no autorizada. Tasas permitidas: ${TASAS_ISV_AUTORIZADAS.map((t) => `${t} %`).join(', ')}. Las exenciones de línea están bloqueadas hasta la decisión fiscal`;

/** Devuelve la tasa normalizada o rechaza con 400. Se usa en el servicio además del DTO: los consumidores internos no pasan por ValidationPipe. */
export function exigirTasaIsvAutorizada(valor: unknown): number {
  if (!esTasaIsvAutorizada(valor)) throw new BadRequestException(mensajeTasaNoAutorizada());
  return centesimas(valor) / 100;
}
