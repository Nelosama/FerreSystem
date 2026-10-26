import { useState } from 'react';
import { api } from '../utils/api';
import { useI18n } from '../context/I18nContext';

// Paso obligatorio tras entrar con la contraseña temporal. Mientras se muestra no existe sesión: el servidor solo entregó un
// token de cambio de un uso (no es un access token) y la pantalla no ofrece módulos ni navegación. Al terminar se vuelve al login.
export function ForcedPasswordChange({ token, onDone }: { token: string; onDone: () => void }) {
  const { t } = useI18n();
  const [password, setPassword] = useState(''), [confirm, setConfirm] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (password !== confirm) { setError(t('security.password_mismatch')); return; }
    setBusy(true); setError('');
    try {
      await api.post('/auth/security/forced-change', { token, password });
      setPassword(''); setConfirm('');
      onDone();
    } catch (err: any) {
      const message = err.response?.data?.message;
      setError(Array.isArray(message) ? message.join(', ') : t('security.failed'));
    } finally { setBusy(false); }
  };
  return <form className="login-formulario" onSubmit={submit} aria-busy={busy}>
    <h2 className="login-titulo" style={{ fontSize: 18 }}>{t('security.forced_title')}</h2>
    <p>{t('security.forced_help')}</p>
    {error && <p role="alert">{error}</p>}
    <label htmlFor="forced-password">{t('security.new_password')}</label>
    <input id="forced-password" className="form-input" type="password" autoComplete="new-password" required value={password} onChange={e => setPassword(e.target.value)} />
    <label htmlFor="forced-confirm">{t('security.confirm_password')}</label>
    <input id="forced-confirm" className="form-input" type="password" autoComplete="new-password" required value={confirm} onChange={e => setConfirm(e.target.value)} />
    <button className="btn btn-primary" disabled={busy}>{t('security.continue')}</button>
  </form>;
}
