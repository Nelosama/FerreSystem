import React from 'react';
import { LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTenant } from '../context/TenantContext';
import { useI18n } from '../context/I18nContext';
import { LogotipoNegocio } from './LogotipoNegocio';
import { SucursalSelect } from './SucursalSelect';
import { EstadoCajaBadge } from './EstadoCajaBadge';
import { NotificacionesBell } from './NotificacionesBell';

/**
 * Barra superior del administrador (shell en modo barra lateral): negocio y sucursal activa a la izquierda; estado de
 * caja, notificaciones, usuario con su rol y cierre de sesión a la derecha. Todo viene de los servicios y contextos
 * existentes; no hay datos de muestra. TopBar solo dibuja el encabezado de la página dentro de este shell.
 */
export const AdminTopbar: React.FC = () => {
  const { user, tenant, logout } = useTenant();
  const { t } = useI18n();
  const navigate = useNavigate();
  const iniciales = (user?.nombre || '').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || 'A';

  const cerrarSesion = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="shell-topbar admin-topbar">
      <div className="shell-topbar-area admin-topbar-negocio">
        <span className="admin-topbar-logo"><LogotipoNegocio size={32} /></span>
        <div className="admin-topbar-identidad">
          <strong>{tenant.nombreComercial || t('shell.business_default')}</strong>
          <SucursalSelect />
          {tenant.sucursal && <span className="admin-topbar-sucursal-movil">{tenant.sucursal}</span>}
        </div>
      </div>
      <div className="shell-topbar-actions">
        <EstadoCajaBadge />
        <NotificacionesBell />
        <span className="admin-topbar-divisor" aria-hidden="true" />
        {user && (
          <div className="admin-topbar-perfil">
            <span className="admin-topbar-avatar" aria-hidden="true">{iniciales}</span>
            <span className="admin-topbar-perfil-texto">
              <strong>{user.nombre}</strong>
              <small>{t('navigation.role_admin')}</small>
            </span>
          </div>
        )}
        <button type="button" onClick={cerrarSesion} className="shell-topbar-logout" title={t('topbar.logout_title')}>
          <LogOut size={14} strokeWidth={2.4} aria-hidden="true" />
          <span>{t('topbar.logout')}</span>
        </button>
      </div>
    </header>
  );
};
