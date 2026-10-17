import { BadRequestException } from '@nestjs/common';

const options: Record<string, readonly string[]> = {
  idioma: ['es', 'en'],
  rubro: ['FERRETERIA', 'PULPERIA', 'MINIMARKET', 'FARMACIA', 'PAPELERIA', 'DISTRIBUIDORA', 'AGROSERVICIO', 'REPUESTOS_AUTOMOTRICES', 'ELECTRODOMESTICOS', 'GENERAL'],
  estiloUI: ['INDUSTRIAL', 'MINIMALISTA', 'MODERNO'],
  templateVersion: ['v1', 'v2'],
  v2Mode: ['light', 'dark', 'hybrid'],
  fuenteTitulos: ['Archivo', 'Space Grotesk', 'Poppins', 'Montserrat'],
  fuenteCuerpo: ['Inter', 'IBM Plex Sans', 'Nunito Sans'],
  // Formato de facturas, recibos y tickets: hoja A4 o papel de rollo térmico (80 mm o 58 mm).
  formatoImpresion: ['A4', 'ROLLO_80MM', 'ROLLO_58MM'],
};

export function validateTenantConfiguration(value: unknown): asserts value is Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Configuración inválida');
  const configuration = value as Record<string, any>;
  for (const [key, field] of Object.entries(configuration)) {
    if (Object.prototype.hasOwnProperty.call(options, key)) {
      if (!options[key].includes(field)) throw new BadRequestException(`Configuración inválida: ${key}`);
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
  const defaults = { idioma: 'es', rubro: 'FERRETERIA', estiloUI: 'INDUSTRIAL', templateVersion: 'v1', v2Mode: 'light', fuenteTitulos: 'Archivo', fuenteCuerpo: 'Inter', formatoImpresion: 'A4' };
  return {
    ...Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key, options[key].includes(configuration[key] as string) ? configuration[key] : fallback])),
    moneda: { simbolo: 'L.', codigo: 'HNL' }, impuesto: { nombre: 'ISV', tasa: 15 },
  };
}
