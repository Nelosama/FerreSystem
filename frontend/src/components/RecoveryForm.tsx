import { useLayoutEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../utils/api';
import { useI18n } from '../context/I18nContext';

// Enlaces privados que llegan al login: restablecimiento emitido por un Admin o Super Admin (RESET_ADMIN)
// y verificación del correo de un administrador (VERIFY_EMAIL). Sin enlace no se muestra nada: la recuperación
// pública de Admin y Super Admin usa la contraseña temporal del formulario de login.
export function RecoveryForm() {
  const { t } = useI18n();
  const location = useLocation();
  const [initial] = useState(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const token = params.get('token') || '', action = params.get('action') === 'VERIFY_EMAIL' ? 'VERIFY_EMAIL' : 'RESET_ADMIN';
    return { token, action };
  });
  const [token, setToken] = useState(initial.token);
  const [nextPassword, setNextPassword] = useState('');
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const [codes] = useState<string[]>(location.state?.recoveryCodes || []);
  useLayoutEffect(() => {
    // El token sale de la URL antes de pintar: no queda en historial, Referer ni almacenamiento.
    if (initial.token || location.state?.recoveryCodes) window.history.replaceState({ ...window.history.state, usr: null }, '', window.location.pathname + window.location.search);
  }, [initial.token, location.state]);
  useLayoutEffect(() => {
    // Un segundo enlace abierto en la misma pestaña sustituye al primero.
    const params = new URLSearchParams(location.hash.slice(1));
    const next = params.get('token');
    if (next) { setToken(next); window.history.replaceState({ ...window.history.state, usr: null }, '', window.location.pathname + window.location.search); }
  }, [location.hash, location.key]);
  if (!initial.token && !token && codes.length === 0 && !message) return null;

  const run = async (path: string, body: object) => {
    if (busy) return;
    setBusy(true); setMessage('');
    try {
      await api.post(`/auth/security/${path}`, body);
      setMessage(t('security.done')); setToken(''); setNextPassword('');
    } catch { setMessage(t('security.failed')); }
    finally { setBusy(false); }
  };
  return <section style={{ marginTop: 20 }} aria-labelledby="recovery-title">
    <h2 id="recovery-title" className="form-label">{t('security.recovery')}</h2>
    {message && <p role="status">{message}</p>}
    {busy && <p role="status">{t('shell.login.verifying')}</p>}
    {codes.length > 0 ? <div><p>{t('security.save_codes')}</p><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{codes.join('\n')}</pre></div> : (initial.token || token) && <form className="login-formulario" onSubmit={e => {
      e.preventDefault();
      if (initial.action === 'VERIFY_EMAIL') void run('verify-email', { token });
      else void run('reset', { token, password: nextPassword });
    }}>
      <label htmlFor="recovery-token">{t('security.token')}</label><input id="recovery-token" className="form-input" value={token} required onChange={e => setToken(e.target.value.trim())} autoComplete="off" />
      {initial.action !== 'VERIFY_EMAIL' && <><label htmlFor="recovery-password">{t('security.new_password')}</label><input id="recovery-password" className="form-input" type="password" autoComplete="new-password" required value={nextPassword} onChange={e => setNextPassword(e.target.value)} /></>}
      <button className="btn btn-primary" disabled={busy}>{t('security.continue')}</button>
    </form>}
  </section>;
}
