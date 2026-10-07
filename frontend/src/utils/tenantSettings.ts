import type { TenantInfo } from '../types';

const defaults = {
  rubro: 'FERRETERIA', estiloUI: 'INDUSTRIAL', templateVersion: 'v1', v2Mode: 'light',
  fuenteTitulos: 'Archivo', fuenteCuerpo: 'Inter',
} as const;

/** Server fields are rebuilt; only branch selection is a local session preference. */
export function normalizeTenantSettings(data: any, local?: Pick<TenantInfo, 'sucursal'>): TenantInfo {
  const configuration = data.configuracion ?? data;
  return {
    id: data.id, nombreComercial: data.nombreComercial ?? 'FerreSystem',
    colorPrimario: data.colorPrimario ?? '#EA580C', logoUrl: data.logoUrl ?? null,
    direccion: data.direccion ?? '', telefono: data.telefono ?? '', email: data.email ?? '',
    modoNavegacion: data.modoNavegacion ?? 'SIDEBAR',
    modulosHabilitados: data.modulosHabilitados,
    ...Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key, configuration[key] ?? fallback])),
    moneda: { simbolo: 'L.', codigo: 'HNL' }, impuesto: { nombre: 'ISV', tasa: 15 },
    updatedAt: data.updatedAt, sucursal: local?.sucursal ?? data.sucursal ?? 'Sucursal Principal',
  };
}

/** Latest issued read wins, except that no read can roll back an accepted server version. */
export class TenantSettingsReads {
  private sequence = 0;
  invalidate() { this.sequence++; }
  begin() { return ++this.sequence; }
  accepts(ticket: number, incoming: TenantInfo, current: TenantInfo) {
    if (ticket !== this.sequence || incoming.id !== current.id) return false;
    const version = Date.parse(incoming.updatedAt ?? '');
    const previous = Date.parse(current.updatedAt ?? '');
    return !Number.isFinite(previous) || (Number.isFinite(version) && version >= previous);
  }
}
