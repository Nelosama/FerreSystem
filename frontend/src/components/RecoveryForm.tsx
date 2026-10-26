import { useLayoutEffect, useState } from 'react';
import { api } from '../utils/api';
import { useI18n } from '../context/I18nContext';

// Enlaces privados de un solo uso (verificar correo, definir contraseña de un empleado). Solo aparece al abrir uno;
// el token viaja en el fragmento de la URL y se borra de la barra en cuanto se lee. No hay MFA en ninguno de estos pasos.
export function RecoveryForm() {
  const { t } = useI18n();
  const [initial] = useState(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const token = params.get('token') || '', action = params.get('action') || 'RESET_ADMIN';
    return { token, action };
  });
  const [token, setToken] = useState(initial.token);
  const [nextPassword, setNextPassword] = useState('');
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  useLayoutEffect(() => {
    if (initial.token) window.history.replaceState({ ...window.history.state, usr: null }, '', window.location.pathname + window.location.search);
  }, [initial.token]);
  if (!initial.token) return null;
  const verify = initial.action === 'VERIFY_EMAIL';
  const run = async (path: string, body: object) => {
    if (busy) return;
    setBusy(true); setMessage('');
    try {
      await api.post(`/auth/security/${path}`, body);
      setMessage(t('security.done')); setToken(''); setNextPassword('');
    } catch { setMessage(t('security.failed')); }
    finally { setBusy(false); }
  };
  return <details open style={{ marginTop: 20 }}>
    <summary>{t('security.recovery')}</summary>
    {message && <p role="status">{message}</p>}
    {busy && <p role="status">{t('shell.login.verifying')}</p>}
    <form className="login-formulario" onSubmit={e => {
      e.preventDefault();
      if (verify) void run('verify-email', { token });
      else void run('reset', { token, password: nextPassword });
    }}>
      <label htmlFor="recovery-token">{t('security.token')}</label><input id="recovery-token" className="form-input" value={token} required onChange={e => setToken(e.target.value.trim())} autoComplete="off" />
      {!verify && <><label htmlFor="recovery-password">{t('security.new_password')}</label><input id="recovery-password" className="form-input" type="password" autoComplete="new-password" required value={nextPassword} onChange={e => setNextPassword(e.target.value)} /></>}
      <button className="btn btn-primary" disabled={busy}>{t('security.continue')}</button>
    </form>
  </details>;
}
