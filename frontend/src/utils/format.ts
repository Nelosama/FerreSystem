/**
 * Formatea un número como moneda Lempiras (HNL) con separador de miles (,) y decimales (.).
 * Ej: 21275 -> "L. 21,275.00"
 */
export function formatLempiras(amount: number): string {
  const formatted = Number(amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `L. ${formatted}`;
}

/**
 * Formatea solo el número con separador de miles y 2 decimales.
 * Ej: 21275 -> "21,275.00"
 */
export function formatNumber(amount: number): string {
  return Number(amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Formatea una fecha u hora de emisión en zona horaria de Honduras (America/Tegucigalpa, UTC-6).
 * Formato dd/mm/yyyy.
 * Respeta la zona horaria America/Tegucigalpa para todos los timestamps reales.
 * Si el string es solo fecha de calendario (ej: "2026-10-08" de 10 caracteres), delega a formatDateOnlyHN.
 */
export function formatDateHN(dateInput?: string | Date | null): string {
  if (!dateInput) return '';
  // Si el valor ya está formateado como DD/MM/YYYY, devolver tal cual
  if (typeof dateInput === 'string' && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateInput.trim())) {
    return dateInput.trim();
  }

  // Si es una cadena de solo fecha sin hora (YYYY-MM-DD), delegar a formatDateOnlyHN para evitar desfase UTC
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
    return formatDateOnlyHN(dateInput);
  }

  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return typeof dateInput === 'string' ? dateInput : '';

  return d.toLocaleDateString('es-HN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Tegucigalpa',
  });
}

/**
 * Formatea una fecha de solo día/mes/año (como fechaValidez de base de datos) usando UTC
 * para evitar que cambie de día por el desfase horario local.
 * Formato dd/mm/yyyy.
 */
export function formatDateOnlyHN(dateInput?: string | Date | null): string {
  if (!dateInput) return '';
  // Si ya viene formateada como DD/MM/YYYY, devolver directamente
  if (typeof dateInput === 'string' && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateInput.trim())) {
    return dateInput.trim();
  }

  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return typeof dateInput === 'string' ? dateInput : '';

  return d.toLocaleDateString('es-HN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
