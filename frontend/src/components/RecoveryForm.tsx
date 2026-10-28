import { useLayoutEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../utils/api';
import { useI18n } from '../context/I18nContext';

// Enlaces privados de un solo uso: verificar correo y definir la contraseña de un empleado (enlace del Admin). Solo aparece
// al abrir uno; el token viaja en el fragmento de la URL y se borra de la barra antes de pintar. La recuperación de
// Admin/Super Admin con contraseña temporal vive en el login.
export function RecoveryForm() {
  const { t } = useI18n();
  const location = useLocation();
  const [initial] = useState(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const token = params.get('token') || '', action = params.get('action') || 'RESET_ADMIN';
    return { token, action };
  });
  const [token, setToken] = useState(initial.token), [action, setAction] = useState(initial.action);
  const [nextPassword, setNextPassword] = useState('');
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  // Visible desde que llega un enlace (al cargar o en una navegación posterior) y hasta salir del login.
  const [abierto, setAbierto] = useState(!!initial.token);
  useLayoutEffect(() => {
    // Un segundo enlace privado a la misma página es una navegación por fragmento; React conserva el formulario montado,
    // así que el estado inicial ya no basta.
    const params = new URLSearchParams(location.hash.slice(1));
    const incoming = params.get('token');
    if (incoming) {
      setToken(incoming); setAction(params.get('action') || 'RESET_ADMIN'); setAbierto(true);
      setNextPassword(''); setMessage('');
      window.history.replaceState({ ...window.history.state }, '', window.location.pathname + window.location.search);
    }
  }, [location]);
  if (!abierto) return null;
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
    <summary>{t('security.private_link_title')}</summary>
    {message && <p role="status">{message}</p>}
    {busy && <p role="status">{t('shell.login.verifying')}</p>}
    <form className="login-formulario" onSubmit={e => {
      e.preventDefault();
      if (action === 'VERIFY_EMAIL') void run('verify-email', { token });
      else void run('reset', { token, password: nextPassword });
    }}>
      <label htmlFor="recovery-token">{t('security.token')}</label><input id="recovery-token" className="form-input" value={token} required onChange={e => setToken(e.target.value.trim())} autoComplete="off" />
      {action !== 'VERIFY_EMAIL' && <><label htmlFor="recovery-password">{t('security.new_password')}</label><input id="recovery-password" className="form-input" type="password" autoComplete="new-password" required value={nextPassword} onChange={e => setNextPassword(e.target.value)} /></>}
      <button className="btn btn-primary" disabled={busy}>{t('security.continue')}</button>
    </form>
  </details>;
}
