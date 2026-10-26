import React from 'react';
import { LogOut, UserCheck } from 'lucide-react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTenant } from '../context/TenantContext';
import { useI18n } from '../context/I18nContext';
import { AREAS_PLATAFORMA, areaDeSeccion, seccionDePlataforma } from '../config/platformNavigation';
import { NotificacionesBell } from './NotificacionesBell';

/** Topbar del Super Admin: área actual a la izquierda; idioma, usuario y cierre de sesión a la derecha. */
export const PlatformTopbar: React.FC = () => {
  const { user, logout } = useTenant();
  const { locale, setLocale, t } = useI18n();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [parametros] = useSearchParams();

  const enNegocio = pathname.startsWith('/admin/negocios');
  const area = AREAS_PLATAFORMA.find(item => item.id === (enNegocio ? 'empresas' : areaDeSeccion(seccionDePlataforma(parametros))));

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="shell-topbar">
      <div className="shell-topbar-area">
        <strong>{area?.etiqueta ?? 'Inicio'}</strong>
        <span className="shell-pill">Super Admin</span>
      </div>
      <div className="shell-topbar-actions">
        <NotificacionesBell />
        <div aria-label="Idioma de la plataforma" className="shell-topbar-idioma" style={{ display: 'flex', gap: 4 }}>
          {(['es', 'en'] as const).map(lang => <button key={lang} type="button" aria-pressed={locale === lang} onClick={() => setLocale(lang)} className="btn-sm">{lang.toUpperCase()}</button>)}
        </div>
        {user && <span className="shell-topbar-user" title={user.nombre}><UserCheck size={14} aria-hidden="true" /> {user.nombre}</span>}
        <button type="button" onClick={handleLogout} className="shell-topbar-logout" title={t('topbar.logout_title')}>
          <LogOut size={14} strokeWidth={2.4} aria-hidden="true" />
          <span>{t('topbar.logout')}</span>
        </button>
      </div>
    </header>
  );
};
