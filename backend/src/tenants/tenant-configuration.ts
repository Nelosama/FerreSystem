import { BadRequestException } from '@nestjs/common';

const options: Record<string, readonly string[]> = {
  idioma: ['es', 'en'],
  rubro: ['FERRETERIA', 'PULPERIA', 'MINIMARKET', 'FARMACIA', 'PAPELERIA', 'DISTRIBUIDORA', 'AGROSERVICIO', 'REPUESTOS_AUTOMOTRICES', 'ELECTRODOMESTICOS', 'GENERAL'],
  // Formato de facturas, recibos y tickets: hoja A4 o papel de rollo térmico (80 mm o 58 mm).
  formatoImpresion: ['A4', 'ROLLO_80MM', 'ROLLO_58MM'],
};

/** Diseño único de Jowa System: las antiguas variantes visuales ya no se configuran. Clientes en caché pueden seguir enviándolas; se ignoran sin error y no se guardan. */
export const CLAVES_VISUALES_RETIRADAS = ['templateVersion', 'v2Mode', 'estiloUI', 'fuenteTitulos', 'fuenteCuerpo'] as const;

/** Quita de un objeto de configuración las claves visuales retiradas. */
export function retirarClavesVisuales<T extends Record<string, any>>(value: T | null | undefined): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key]) => !(CLAVES_VISUALES_RETIRADAS as readonly string[]).includes(key)));
}

export function validateTenantConfiguration(value: unknown): asserts value is Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Configuración inválida');
  const configuration = value as Record<string, any>;
  for (const [key, field] of Object.entries(configuration)) {
    if ((CLAVES_VISUALES_RETIRADAS as readonly string[]).includes(key)) continue;
    if (Object.prototype.hasOwnProperty.call(options, key)) {
      if (!options[key].includes(field)) throw new BadRequestException(`Configuración inválida: ${key}`);
    } else if (key === 'modoGuia') {
      if (typeof field !== 'boolean') throw new BadRequestException('Modo Guía inválido');
    } else if (key === 'moneda') {
      if (!field || typeof field !== 'object' || Object.keys(field).some(k => !['simbolo', 'codigo'].includes(k)) || field.simbolo !== 'L.' || field.codigo !== 'HNL') throw new BadRequestException('Solo se admite HNL (L.); no hay conversión monetaria');
    } else if (key === 'impuesto') {
      if (!field || typeof field !== 'object' || Object.keys(field).some(k => !['nombre', 'tasa'].includes(k)) || field.nombre !== 'ISV' || field.tasa !== 15) throw new BadRequestException('La configuración general admite únicamente ISV del 15%; las tasas transaccionales de cotización se conservan');
    } else throw new BadRequestException('Configuración desconocida');
  }
}

/** Defaults for legacy/empty configurations. Fiscal settings cannot relabel stored money. */
export function normalizeTenantConfiguration(value: unknown) {
  const configuration = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const defaults = { idioma: 'es', rubro: 'FERRETERIA', formatoImpresion: 'A4' };
  return {
    ...Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key, options[key].includes(configuration[key] as string) ? configuration[key] : fallback])),
    modoGuia: configuration.modoGuia === true,
    moneda: { simbolo: 'L.', codigo: 'HNL' }, impuesto: { nombre: 'ISV', tasa: 15 },
  };
}
