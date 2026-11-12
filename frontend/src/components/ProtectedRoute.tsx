import React from 'react';
import { Link, Navigate, matchPath, useLocation } from 'react-router-dom';
import { useTenant } from '../context/TenantContext';
import { NAVIGATION_ITEMS } from '../config/navigation';
import { canNavigate } from '../utils/taskNavigation';
import { modulosPorDefecto, PENDING_MODULES } from '../config/modulesCatalog';
import { useI18n } from '../context/I18nContext';
import { Lock } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
  requiredPermiso?: string;
  requiredModule?: string;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  allowedRoles,
  requiredPermiso,
  requiredModule,
}) => {
  const { user, tenant, authStatus, retrySession } = useTenant();
  const { pathname } = useLocation();
  const { t } = useI18n();

  const mountedIdentity = React.useRef('');
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const ready = authStatus === 'ready' || (authStatus === 'offline' && pathname === '/pos-contingencia');
  const identity = `${user.id}:${tenant.id}`;
  if (ready) mountedIdentity.current = identity;
  const sessionGate = <div role={authStatus === 'checking' ? 'status' : 'alert'} style={styles.deniedContainer}>
    <p>{authStatus === 'checking' ? 'Verificando sesión…' : authStatus === 'denied' ? 'Acceso denegado. Tu sesión sigue abierta.' : 'No pudimos verificar la sesión. Revisa la conexión y vuelve a intentar.'}</p>
    {authStatus !== 'checking' && <button className="btn btn-primary" onClick={retrySession}>Reintentar</button>}
  </div>;
  if (!ready && mountedIdentity.current !== identity) return sessionGate;

  if (pathname === '/' && user.rol === 'SUPERADMIN') return <Navigate to="/admin" replace />;
  // El contador no tiene panel operativo: su inicio es Contabilidad (la ruta aplica módulo, rol y permiso).
  if (pathname === '/' && user.rol === 'CONTADOR') return <Navigate to="/contabilidad" replace />;

  // Las pantallas de acceso denegado no tienen menú: siempre ofrecen una salida para no dejar al usuario atascado.
  const volver = <Link to="/" className="btn btn-primary" style={{ marginTop: '8px', minHeight: '44px' }}>{t('navigation.denied_back')}</Link>;

  const entry = NAVIGATION_ITEMS.find(item => matchPath({ path: item.route, end: true }, pathname));
  if (entry && !canNavigate(entry, user, tenant)) return <div role="alert" style={styles.deniedContainer}><Lock size={48} /><h2>{t('navigation.denied')}</h2><p>{t('navigation.denied_help')}</p>{pathname !== '/' && volver}</div>;

  // Verificar rol
  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.rol)) {
    return (
      <div role="alert" style={styles.deniedContainer}>
        <Lock size={48} color="#DC2626" aria-hidden="true" />
        <h2 style={styles.title}>{t('navigation.denied')}</h2>
        <p style={styles.message}>{t('navigation.denied_help')}</p>
        {pathname !== '/' && volver}
      </div>
    );
  }

  // Verificar permiso específico
  if (requiredPermiso && user.rol !== 'ADMIN' && user.permisosConfigurados && !user.permisos?.includes(requiredPermiso)) {
    return (
      <div role="alert" style={styles.deniedContainer}>
        <Lock size={48} color="#DC2626" aria-hidden="true" />
        <h2 style={styles.title}>{t('navigation.denied')}</h2>
        <p style={styles.message}>{t('navigation.denied_permission')}</p>
        {pathname !== '/' && volver}
      </div>
    );
  }

  // Verificar si el módulo está habilitado para el Tenant
  if (requiredModule) {
    const activeModules = tenant.modulosHabilitados || modulosPorDefecto();

    if (PENDING_MODULES.has(requiredModule) || !activeModules.includes(requiredModule)) {
      return (
        <div role="alert" style={styles.deniedContainer}>
          <Lock size={48} color="#EA580C" aria-hidden="true" />
          <h2 style={styles.title}>{t('navigation.denied')}</h2>
          <p style={styles.message}>{t('navigation.module_off_help', { negocio: tenant.nombreComercial })}</p>
          {pathname !== '/' && volver}
        </div>
      );
    }
  }

  return <>
    {!ready && sessionGate}
    <div data-protected-content key={identity} hidden={!ready} inert={!ready}>{children}</div>
  </>;
};

const styles: Record<string, React.CSSProperties> = {
  deniedContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 20px',
    textAlign: 'center',
    minHeight: '60vh',
    gap: '12px',
  },
  title: {
    fontFamily: 'var(--font-display, sans-serif)',
    fontSize: '22px',
    fontWeight: 900,
    textTransform: 'uppercase',
    color: 'var(--color-text-main, #1C1917)',
    margin: 0,
  },
  message: {
    fontFamily: 'var(--font-body, sans-serif)',
    fontSize: '14px',
    color: 'var(--color-text-muted)',
    maxWidth: '500px',
    margin: 0,
  },
};

