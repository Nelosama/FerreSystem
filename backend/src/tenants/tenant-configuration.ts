import { BadRequestException } from '@nestjs/common';

const options: Record<string, readonly string[]> = {
  rubro: ['FERRETERIA', 'PULPERIA', 'MINIMARKET', 'FARMACIA', 'PAPELERIA', 'DISTRIBUIDORA', 'AGROSERVICIO', 'REPUESTOS_AUTOMOTRICES', 'ELECTRODOMESTICOS', 'GENERAL'],
  estiloUI: ['INDUSTRIAL', 'MINIMALISTA', 'MODERNO'],
  templateVersion: ['v1', 'v2'],
  v2Mode: ['light', 'dark', 'hybrid'],
  fuenteTitulos: ['Archivo', 'Space Grotesk', 'Poppins', 'Montserrat'],
  fuenteCuerpo: ['Inter', 'IBM Plex Sans', 'Nunito Sans'],
};

export function validateTenantConfiguration(value: unknown): asserts value is Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Configuración inválida');
  const configuration = value as Record<string, any>;
  for (const [key, field] of Object.entries(configuration)) {
    if (Object.prototype.hasOwnProperty.call(options, key)) {
      if (!options[key].includes(field)) throw new BadRequestException(`Configuración inválida: ${key}`);
    } else if (key === 'moneda') {
      if (!field || typeof field !== 'object' || Object.keys(field).some(k => !['simbolo', 'codigo'].includes(k)) || typeof field.simbolo !== 'string' || !field.simbolo.trim() || typeof field.codigo !== 'string' || !/^[A-Z]{3}$/.test(field.codigo)) throw new BadRequestException('Moneda inválida');
    } else if (key === 'impuesto') {
      if (!field || typeof field !== 'object' || Object.keys(field).some(k => !['nombre', 'tasa'].includes(k)) || typeof field.nombre !== 'string' || !field.nombre.trim() || typeof field.tasa !== 'number' || !Number.isFinite(field.tasa) || field.tasa < 0 || field.tasa > 100) throw new BadRequestException('Impuesto inválido');
    } else throw new BadRequestException('Configuración desconocida');
  }
}
