import React, { useState, useEffect } from 'react';
import { Lock, Mail, ArrowRight, AlertCircle, Clock, Loader2, KeyRound, ShieldCheck } from 'lucide-react';
import { MarcaJowa } from '../components/MarcaJowa';
import { useI18n } from '../context/I18nContext';
import { useTenant } from '../context/TenantContext';
import { useNavigate } from 'react-router-dom';
import { SESSION_EXPIRED_MESSAGE, hasSessionExpiredNotice, clearSessionExpiredNotice } from '../utils/authInterceptors';
import { api } from '../utils/api';
import { RecoveryForm } from '../components/RecoveryForm';
import { ForcedPasswordChange } from '../components/ForcedPasswordChange';

/** Fallos seguidos (en esta pantalla) tras los que se ofrece la contraseña temporal. El servidor decide en secreto si aplica. */
const FALLOS_PARA_RECUPERAR = 3;

export const LoginPage: React.FC = () => {
  const { login } = useTenant();
  const { t } = useI18n();
  const navigate = useNavigate();

  // Solo «Usuario» (usuario, código o correo) y «Contraseña». El sistema determina empresa y rol.
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  // Un enlace privado de empresa (?empresa=) acota la búsqueda a ese negocio; no se muestra ni se pide.
  const [tenantId] = useState(() => new URLSearchParams(window.location.search).get('empresa') || '');
  // El código MFA aparece solo después de una contraseña correcta (obligatorio para el Super Admin).
  const [mfaRequerido, setMfaRequerido] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [enrolar, setEnrolar] = useState(false);
  // Fallos contados en el navegador: el servidor nunca informa si la cuenta es elegible (no hay enumeración).
  const [fallos, setFallos] = useState(0);
  const [recuperacionMensaje, setRecuperacionMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);
  // Token de cambio obligatorio (contraseña temporal): mientras exista no se muestra el formulario ni ningún módulo.
  const [cambioToken, setCambioToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(() => hasSessionExpiredNotice() ? SESSION_EXPIRED_MESSAGE : null);

  // El aviso pertenece a la redirección actual, no a visitas futuras al login.
  useEffect(() => { clearSessionExpiredNotice(); }, []);

  const cambiarIdentificador = (valor: string) => {
    setUsuario(valor);
    // Los fallos, el segundo factor y la recuperación pertenecen al identificador escrito.
    setFallos(0); setMfaRequerido(false); setMfaCode(''); setEnrolar(false); setRecuperacionMensaje('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setRecuperacionMensaje('');
    setLoading(true);

    try {
      const response = await api.post('/auth/login', { usuario, password, ...(tenantId && { tenantId }), ...(mfaRequerido && mfaCode && { mfaCode }) });
      const { type, accessToken, user, tenant, superAdmin, cambioToken: cambio } = response.data;

      if (type === 'password_change_required' && typeof cambio === 'string' && cambio) {
        setCambioToken(cambio); setPassword(''); setMfaCode(''); setMfaRequerido(false); setFallos(0);
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
        const code = err.response.data?.code;
        if (code === 'MFA_REQUERIDO') {
          // Contraseña correcta de una cuenta con MFA: solo entonces aparece el código.
          setMfaRequerido(true); setMfaCode(''); setError(null);
          return;
        }
        if (code === 'MFA_ENROLAMIENTO_REQUERIDO') { setEnrolar(true); setError(t('security.mfa_enroll_prompt')); return; }
        if (err.response.status === 401) { setFallos(previo => previo + 1); setMfaCode(''); }
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
    if (enviando || !usuario.trim()) return;
    setEnviando(true); setRecuperacionMensaje('');
    try {
      await api.post('/auth/security/request', { usuario, ...(tenantId && { tenantId }) });
      setRecuperacionMensaje(t('security.accepted'));
    } catch { setRecuperacionMensaje(t('security.failed')); }
    finally { setEnviando(false); }
  };

  // Enrolamiento inicial del MFA del Super Admin: un enlace al correo de la cuenta, nunca un acceso sin segundo factor.
  const solicitarEnrolamiento = async () => {
    if (enviando || !usuario.trim() || !password) return;
    setEnviando(true); setRecuperacionMensaje('');
    try {
      await api.post('/auth/security/mfa/bootstrap-request', { usuario, password });
      setRecuperacionMensaje(t('security.bootstrap_sent'));
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
          <ForcedPasswordChange token={cambioToken} onDone={() => { setCambioToken(''); setPassword(''); setError(null); setFallos(0); setRecuperacionMensaje(t('security.forced_done')); }} />
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
                onChange={(e) => cambiarIdentificador(e.target.value)}
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

          {mfaRequerido && (
            <div className="form-group">
              <label className="form-label" htmlFor="login-mfa">{t('security.mfa')}</label>
              <div className="login-campo">
                <ShieldCheck size={16} strokeWidth={2.2} aria-hidden="true" />
                <input id="login-mfa" className="form-input" value={mfaCode} onChange={e => setMfaCode(e.target.value.trim())} autoComplete="one-time-code" inputMode="numeric" required autoFocus aria-describedby="login-mfa-ayuda" />
              </div>
              <p id="login-mfa-ayuda" className="login-ayuda">{t('security.mfa_prompt')}</p>
            </div>
          )}
          <button type="submit" disabled={loading} className="btn btn-primary login-entrar">
            {loading ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : null}
            <span>{loading ? t('shell.login.verifying') : t('shell.login.submit')}</span>
            {!loading && <ArrowRight size={18} strokeWidth={2.4} aria-hidden="true" />}
          </button>
        </form>
        {fallos > 0 && <p className="login-ayuda">{t('security.lock_hint')}</p>}
        {enrolar && (
          <section aria-labelledby="login-enrolar" style={{ marginTop: 20 }}>
            <h2 id="login-enrolar" className="form-label"><ShieldCheck size={16} aria-hidden="true" /> {t('security.bootstrap')}</h2>
            <p>{t('security.bootstrap_help')}</p>
            <button type="button" className="btn btn-secondary" disabled={enviando || !usuario.trim() || !password} onClick={() => void solicitarEnrolamiento()}>{t('security.bootstrap')}</button>
          </section>
        )}
        {fallos >= FALLOS_PARA_RECUPERAR && (
          <section aria-labelledby="login-recuperacion" style={{ marginTop: 20 }}>
            <h2 id="login-recuperacion" className="form-label"><KeyRound size={16} aria-hidden="true" /> {t('security.recovery')}</h2>
            <p>{t('security.recovery_offer')}</p>
            <button type="button" className="btn btn-secondary" disabled={enviando || !usuario.trim()} onClick={() => void solicitarRecuperacion()}>{enviando ? t('shell.login.verifying') : t('security.send')}</button>
            <p>{t('security.employee_help')}</p>
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
