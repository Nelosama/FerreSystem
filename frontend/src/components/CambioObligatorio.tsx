import { useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { MarcaJowa } from './MarcaJowa';
import { useTenant } from '../context/TenantContext';
import { useI18n } from '../context/I18nContext';
import { api } from '../utils/api';
import { dejarAvisoLogin } from '../utils/loginNotice';

// Tras entrar con una clave temporal o una contraseña asignada no se muestran módulos: primero se establece
// una contraseña propia. El backend impone la misma restricción; al terminar se cierran todas las sesiones.
export function CambioObligatorio() {
  const { user, logout } = useTenant();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [password, setPassword] = useState(''), [confirmacion, setConfirmacion] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (password !== confirmacion) { setError(t('security.required.mismatch')); return; }
    setBusy(true); setError('');
    try {
      await api.post('/auth/security/required-change', { password });
      dejarAvisoLogin(t('security.required.done'));
      logout();
      navigate('/login', { replace: true });
    } catch (err: any) {
      const message = err?.response?.data?.message;
      setError(Array.isArray(message) ? message.join(', ') : message || t('security.failed'));
    } finally { setBusy(false); }
  };

  return <main className="login-pagina">
    <div className="industrial-card login-tarjeta">
      <header className="login-marca">
        <MarcaJowa size={44} />
        <h1 className="login-titulo">{t('security.required.title')}</h1>
        <p className="login-subtitulo">{t('security.required.help', { nombre: user?.nombre || '' })}</p>
      </header>
      {error && <div className="login-aviso" role="alert"><span>{error}</span></div>}
      <form className="login-formulario" onSubmit={enviar} aria-busy={busy}>
        <div className="form-group">
          <label className="form-label" htmlFor="cambio-nueva">{t('security.new_password')}</label>
          <div className="login-campo"><KeyRound size={16} aria-hidden="true" />
            <input id="cambio-nueva" className="form-input" type="password" autoComplete="new-password" required value={password} onChange={e => setPassword(e.target.value)} /></div>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="cambio-confirmar">{t('security.required.confirm')}</label>
          <div className="login-campo"><KeyRound size={16} aria-hidden="true" />
            <input id="cambio-confirmar" className="form-input" type="password" autoComplete="new-password" required value={confirmacion} onChange={e => setConfirmacion(e.target.value)} /></div>
        </div>
        <button type="submit" className="btn btn-primary login-entrar" disabled={busy}>
          {busy && <Loader2 size={18} className="animate-spin" aria-hidden="true" />}<span>{t('security.required.submit')}</span>
        </button>
        <button type="button" className="btn btn-secondary" onClick={logout}>{t('security.required.logout')}</button>
      </form>
    </div>
  </main>;
}
