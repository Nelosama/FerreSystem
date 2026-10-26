import React, { useState, useEffect } from 'react';
import { Lock, Mail, ArrowRight, AlertCircle, Clock, Loader2, KeyRound } from 'lucide-react';
import { MarcaJowa } from '../components/MarcaJowa';
import { useI18n } from '../context/I18nContext';
import { useTenant } from '../context/TenantContext';
import { useNavigate } from 'react-router-dom';
import { leerAvisoLogin, limpiarAvisoLogin } from '../utils/loginNotice';
import { SESSION_EXPIRED_MESSAGE, hasSessionExpiredNotice, clearSessionExpiredNotice } from '../utils/authInterceptors';
import { api } from '../utils/api';
import { RecoveryForm } from '../components/RecoveryForm';

/** Fallos seguidos tras los que un Admin o Super Admin puede pedir una contraseña temporal. */
const FALLOS_PARA_RECUPERAR = 3;

export const LoginPage: React.FC = () => {
  const { login } = useTenant();
  const { t } = useI18n();
  const navigate = useNavigate();

  // Solo usuario (o código o correo) y contraseña. El sistema determina empresa y rol.
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Un enlace privado de empresa (?empresa=) acota la búsqueda a ese negocio; no se muestra ni se pide.
  const [tenantId] = useState(() => new URLSearchParams(window.location.search).get('empresa') || '');
  const [mfaRequerido, setMfaRequerido] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [fallos, setFallos] = useState(0);
  const [recuperacion, setRecuperacion] = useState<'idle' | 'enviando' | 'enviada'>('idle');
  const [aviso, setAviso] = useState<string | null>(() => leerAvisoLogin());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(() => hasSessionExpiredNotice() ? SESSION_EXPIRED_MESSAGE : null);

  // El aviso pertenece a la redirección actual, no a visitas futuras al login.
  useEffect(() => { clearSessionExpiredNotice(); limpiarAvisoLogin(); }, []);

  const cambiarIdentificador = (valor: string) => {
    setEmail(valor);
    // Los fallos, el segundo factor y la recuperación pertenecen al identificador escrito.
    setFallos(0); setMfaRequerido(false); setMfaCode(''); setRecuperacion('idle');
  };

  const pedirClaveTemporal = async () => {
    if (recuperacion === 'enviando' || !email.trim()) return;
    setRecuperacion('enviando'); setError(null);
    try {
      const { data } = await api.post('/auth/security/request', { email, ...(tenantId && { tenantId }) });
      setAviso(data?.message || t('security.temporary.accepted'));
      setRecuperacion('enviada');
    } catch {
      setError(t('security.failed'));
      setRecuperacion('idle');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setAviso(null);
    setLoading(true);

    try {
      const response = await api.post('/auth/login', { email, password, ...(tenantId ? { tenantId } : {}), ...(mfaRequerido && mfaCode && { mfaCode }) });
      const { type, accessToken, user, tenant, superAdmin } = response.data;

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
            debeCambiarPassword: !!superAdmin.debeCambiarPassword,
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
            debeCambiarPassword: !!user.debeCambiarPassword,
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
        const message = err.response.data?.message;
        const code = err.response.data?.code;
        if (code === 'MFA_REQUERIDO') {
          // Contraseña correcta de una cuenta con MFA: solo entonces aparece el código.
          setMfaRequerido(true);
          setError(t('security.mfa_prompt'));
          return;
        }
        if (err.response.status === 401 && code !== 'CUENTA_BLOQUEADA') setFallos(previo => previo + 1);
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

        {aviso && <div className="login-aviso login-aviso--info" role="status"><span>{aviso}</span></div>}

        {error && (
          <div className={`login-aviso${sesionExpirada ? ' login-aviso--info' : ''}`} role={sesionExpirada ? 'status' : 'alert'}>
            {sesionExpirada ? <Clock size={18} aria-hidden="true" /> : <AlertCircle size={18} aria-hidden="true" />}
            <span>{error}</span>
          </div>
        )}

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
                value={email}
                onChange={(e) => cambiarIdentificador(e.target.value)}
                placeholder="danielcm / 44556 / correo@empresa.com"
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

          {mfaRequerido && <div className="form-group"><label className="form-label" htmlFor="login-mfa">{t('security.mfa')}</label><input id="login-mfa" className="form-input" value={mfaCode} onChange={e => setMfaCode(e.target.value.trim())} autoComplete="one-time-code" inputMode="numeric" required autoFocus /></div>}
          <button type="submit" disabled={loading} className="btn btn-primary login-entrar">
            {loading ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : null}
            <span>{loading ? t('shell.login.verifying') : t('shell.login.submit')}</span>
            {!loading && <ArrowRight size={18} strokeWidth={2.4} aria-hidden="true" />}
          </button>
        </form>
        {fallos >= FALLOS_PARA_RECUPERAR && (
          <section className="login-recuperacion" aria-labelledby="login-recuperacion-titulo">
            <h2 id="login-recuperacion-titulo" className="form-label"><KeyRound size={16} aria-hidden="true" /> {t('security.temporary.title')}</h2>
            <p>{t('security.temporary.help')}</p>
            <button type="button" className="btn btn-secondary" disabled={recuperacion !== 'idle' || !email.trim()} onClick={pedirClaveTemporal}>
              {recuperacion === 'enviando' ? t('shell.login.verifying') : t('security.temporary.send')}
            </button>
            <p>{t('security.temporary.employees')}</p>
          </section>
        )}
        <RecoveryForm />
      </div>
    </main>
  );
};
