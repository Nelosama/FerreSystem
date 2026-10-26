import React, { useState, useEffect } from 'react';
import { Lock, Mail, ArrowRight, AlertCircle, Clock, Loader2 } from 'lucide-react';
import { MarcaJowa } from '../components/MarcaJowa';
import { useI18n } from '../context/I18nContext';
import { useTenant } from '../context/TenantContext';
import { useNavigate } from 'react-router-dom';
import { SESSION_EXPIRED_MESSAGE, hasSessionExpiredNotice, clearSessionExpiredNotice } from '../utils/authInterceptors';
import { api } from '../utils/api';
import { RecoveryForm } from '../components/RecoveryForm';
import { ForcedPasswordChange } from '../components/ForcedPasswordChange';

export const LoginPage: React.FC = () => {
  const { login } = useTenant();
  const { t } = useI18n();
  const navigate = useNavigate();

  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  // Recuperación: la ofrece el servidor solo tras el tercer fallo de una cuenta válida de Admin o Super Admin.
  const [recuperacion, setRecuperacion] = useState(false);
  const [recuperacionMensaje, setRecuperacionMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);
  // Token de cambio obligatorio (contraseña temporal): mientras exista no se muestra el formulario ni ningún módulo.
  const [cambioToken, setCambioToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(() => hasSessionExpiredNotice() ? SESSION_EXPIRED_MESSAGE : null);

  // El aviso pertenece a la redirección actual, no a visitas futuras al login.
  useEffect(() => { clearSessionExpiredNotice(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await api.post('/auth/login', { usuario, password });
      const { type, accessToken, user, tenant, superAdmin, cambioToken: cambio } = response.data;

      if (type === 'password_change_required' && typeof cambio === 'string' && cambio) {
        setCambioToken(cambio); setPassword(''); setRecuperacion(false);
        return;
      }

      if (typeof accessToken !== 'string' || !accessToken) {
        setError(t('shell.login.invalid_session'));
        return;
      }

      if (type === 'super_admin' && superAdmin?.id) {
        localStorage.setItem('ferre_token', accessToken);
        login(
          {
            id: superAdmin.id,
            nombre: superAdmin.nombre,
            email: superAdmin.email,
            rol: 'SUPERADMIN',
          },
          {
            id: 'saas-global',
            nombreComercial: 'Jowa System Admin Portal',
            sucursal: 'Global',
            colorPrimario: '#1C1917',
          },
        );
        navigate('/admin');
      } else if (type === 'tenant' && user?.id && tenant?.id) {
        localStorage.setItem('ferre_token', accessToken);
        login(
          {
            id: user.id,
            nombre: user.nombre,
            email: user.email,
            rol: user.rol,
            permisos: user.permisos,
            permisosConfigurados: user.permisosConfigurados,
            descuentoMaximo: user.descuentoMaximo,
          },
          {
            ...tenant,
            id: tenant.id,
            nombreComercial: tenant.nombreComercial,
            sucursal: 'Sucursal Principal',
            colorPrimario: tenant.colorPrimario || '#EA580C',
          },
        );
        navigate('/');
      } else {
        localStorage.removeItem('ferre_token');
        setError(t('shell.login.unknown_session'));
      }
    } catch (err: any) {
      if (err.response) {
        if (err.response.data?.recuperacionDisponible === true) setRecuperacion(true);
        const message = err.response.data?.message;
        setError(
          Array.isArray(message)
            ? message.join(', ')
            : message || t('shell.login.bad_credentials')
        );
      } else {
        setError(t('shell.login.network_error'));
      }
    } finally {
      setLoading(false);
    }
  };

  const solicitarRecuperacion = async () => {
    if (enviando || !usuario) return;
    setEnviando(true); setRecuperacionMensaje('');
    try {
      await api.post('/auth/security/request', { usuario });
      setRecuperacionMensaje(t('security.accepted'));
    } catch { setRecuperacionMensaje(t('security.failed')); }
    finally { setEnviando(false); }
  };

  const sesionExpirada = error === SESSION_EXPIRED_MESSAGE;

  return (
    <main className="login-pagina">
      <div className="industrial-card login-tarjeta">
        {/* Marca del producto: nombre completo «Jowa System» en un solo color legible */}
        <header className="login-marca">
          <MarcaJowa size={52} />
          <h1 className="login-titulo">Jowa System</h1>
          <p className="login-subtitulo">{t('shell.login.subtitle')}</p>
        </header>

        {error && (
          <div className={`login-aviso${sesionExpirada ? ' login-aviso--info' : ''}`} role={sesionExpirada ? 'status' : 'alert'}>
            {sesionExpirada ? <Clock size={18} aria-hidden="true" /> : <AlertCircle size={18} aria-hidden="true" />}
            <span>{error}</span>
          </div>
        )}

        {cambioToken ? (
          <ForcedPasswordChange token={cambioToken} onDone={() => { setCambioToken(''); setPassword(''); setError(null); setRecuperacionMensaje(t('security.forced_done')); }} />
        ) : (
          <>
        <form onSubmit={handleSubmit} className="login-formulario" aria-busy={loading}>
          <div className="form-group">
            <label className="form-label" htmlFor="login-correo">{t('shell.login.email')}</label>
            <div className="login-campo">
              <Mail size={16} strokeWidth={2.2} aria-hidden="true" />
              <input
                id="login-correo"
                type="text"
                required
                autoComplete="username"
                autoCapitalize="none"
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                className="form-input"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="login-clave">{t('shell.login.password')}</label>
            <div className="login-campo">
              <Lock size={16} strokeWidth={2.2} aria-hidden="true" />
              <input
                id="login-clave"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="form-input"
              />
            </div>
          </div>

          <button type="submit" disabled={loading} className="btn btn-primary login-entrar">
            {loading ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : null}
            <span>{loading ? t('shell.login.verifying') : t('shell.login.submit')}</span>
            {!loading && <ArrowRight size={18} strokeWidth={2.4} aria-hidden="true" />}
          </button>
        </form>
        {recuperacion && (
          <section aria-labelledby="login-recuperacion" style={{ marginTop: 20 }}>
            <h2 id="login-recuperacion" className="login-subtitulo">{t('security.recovery')}</h2>
            <p>{t('security.recovery_offer')}</p>
            <button type="button" className="btn btn-secondary" disabled={enviando || !usuario} onClick={() => void solicitarRecuperacion()}>{t('security.send')}</button>
          </section>
        )}
        {recuperacionMensaje && <p role="status">{recuperacionMensaje}</p>}
        <RecoveryForm />
          </>
        )}
      </div>
    </main>
  );
};
