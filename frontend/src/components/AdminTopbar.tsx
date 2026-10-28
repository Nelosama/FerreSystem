import React from 'react';
import { LogOut, MapPin } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useTenant } from '../context/TenantContext';
import { useI18n } from '../context/I18nContext';
import { LogotipoNegocio } from './LogotipoNegocio';
import { SucursalSelect } from './SucursalSelect';
import { EstadoCajaBadge } from './EstadoCajaBadge';
import { NotificacionesBell } from './NotificacionesBell';
import { TaskFinder } from './TaskFinder';

/**
 * Barra superior contextual de la navegación híbrida (la usan todos los roles del negocio, junto a su rail): negocio y
 * sucursal activa a la izquierda; búsqueda de tareas, estado de caja, notificaciones, usuario con su rol y cierre de sesión
 * a la derecha. Todo viene de los servicios y contextos existentes y respeta rol, permisos y módulos. Las acciones de
 * navegación viven solo en el rail: aquí no se repiten. TopBar solo dibuja el encabezado de la página.
 */
export const AdminTopbar: React.FC = () => {
  const { user, tenant, logout } = useTenant();
  const { t } = useI18n();
  const navigate = useNavigate();
  const iniciales = (user?.nombre || '').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || 'A';
  const claveRol = `navigation.role_${(user?.rol || 'admin').toLowerCase()}`;
  const etiquetaRol = t(claveRol) === claveRol ? (user?.rol ?? '') : t(claveRol);

  const cerrarSesion = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="shell-topbar admin-topbar">
      <div className="shell-topbar-area admin-topbar-negocio">
        {/* En móvil no hay rail: el logotipo de la barra lleva a Inicio. */}
        <Link to="/" aria-label={t('navigation.home_link')} className="admin-topbar-logo"><LogotipoNegocio size={32} /></Link>
        <div className="admin-topbar-identidad">
          <strong>{tenant.nombreComercial || t('shell.business_default')}</strong>
          {user?.rol === 'ADMIN'
            ? <SucursalSelect />
            : tenant.sucursal && <span className="admin-topbar-sucursal" title={t('navigation.branch_active')}><MapPin size={13} aria-hidden="true" />{tenant.sucursal}</span>}
          {user?.rol === 'ADMIN' && tenant.sucursal && <span className="admin-topbar-sucursal-movil">{tenant.sucursal}</span>}
        </div>
      </div>
      <TaskFinder />
      <div className="shell-topbar-actions">
        <EstadoCajaBadge />
        <NotificacionesBell />
        <span className="admin-topbar-divisor" aria-hidden="true" />
        {user && (
          <Link to="/mi-cuenta" aria-label={t('security.account')} title={t('security.account')} className="admin-topbar-perfil" style={{ color: 'inherit', textDecoration: 'none' }}>
            <span className="admin-topbar-avatar" aria-hidden="true">{iniciales}</span>
            <span className="admin-topbar-perfil-texto">
              <strong>{user.nombre}</strong>
              <small>{etiquetaRol}</small>
            </span>
          </Link>
        )}
        <button type="button" onClick={cerrarSesion} className="shell-topbar-logout" title={t('topbar.logout_title')}>
          <LogOut size={14} strokeWidth={2.4} aria-hidden="true" />
          <span>{t('topbar.logout')}</span>
        </button>
      </div>
    </header>
  );
};
