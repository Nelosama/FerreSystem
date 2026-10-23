import React from 'react';
import { GitBranch } from 'lucide-react';
import { useTenant } from '../context/TenantContext';
import { useI18n } from '../context/I18nContext';
import { useSucursales } from '../hooks/useSucursales';

/** Selector de sucursal activa. Lo comparten la barra superior de las páginas y la del Administrador; solo escritorio. */
export const SucursalSelect: React.FC = () => {
  const { tenant, switchSucursal } = useTenant();
  const { t } = useI18n();
  const sucursalesDisponibles = useSucursales();
  return (
    <div className="topbar-desktop-only" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <GitBranch size={13} color="var(--color-primary-text)" aria-hidden="true" />
      <select
        value={tenant.sucursal || 'Sucursal Principal'}
        disabled={sucursalesDisponibles.length < 2}
        onChange={(e) => switchSucursal(e.target.value, tenant.id)}
        className="app-branch-select" style={estiloSelector}
        aria-label={t('topbar.select_branch')}
      >
        {sucursalesDisponibles.map((s: any) => (
          <option key={s.id} value={s.nombre}>
            {s.nombre}
          </option>
        ))}
      </select>
    </div>
  );
};

const estiloSelector: React.CSSProperties = {
  padding: '3px 8px',
  fontFamily: 'var(--font-display)',
  fontWeight: 700,
  fontSize: '11px',
  border: '1.5px solid var(--color-border)',
  borderRadius: 'var(--radius-xs)',
  backgroundColor: '#FFFFFF',
  cursor: 'pointer',
};
