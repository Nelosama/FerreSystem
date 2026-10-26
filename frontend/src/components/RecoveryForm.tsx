import { useLayoutEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../utils/api';
import { useI18n } from '../context/I18nContext';

// Enlaces privados de un solo uso: verificar correo, definir la contraseña de un empleado (enlace del Admin) y enrolar el
// MFA inicial del Super Admin. Solo aparece al abrir uno (o con los códigos de emergencia recién creados); el token viaja en
// el fragmento de la URL y se borra de la barra antes de pintar. La recuperación de Admin/Super Admin vive en el login.
export function RecoveryForm() {
  const { t } = useI18n();
  const location = useLocation();
  const [initial] = useState(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const token = params.get('token') || '', action = params.get('action') || 'RESET_ADMIN';
    return { token, action };
  });
  const [token, setToken] = useState(initial.token), [action, setAction] = useState(initial.action);
  const [nextPassword, setNextPassword] = useState(''), [code, setCode] = useState(''), [secret, setSecret] = useState('');
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [codes, setCodes] = useState<string[]>(location.state?.recoveryCodes || []);
  useLayoutEffect(() => {
    if (initial.token || location.state?.recoveryCodes) window.history.replaceState({ ...window.history.state, usr: null }, '', window.location.pathname + window.location.search);
  }, [initial.token, location.state]);
  if (!initial.token && codes.length === 0) return null;
  const run = async (path: string, body: object) => {
    if (busy) return;
    setBusy(true); setMessage('');
    try {
      const { data } = await api.post(`/auth/security/${path}`, body);
      if (data.secret) { setSecret(data.secret); setToken(data.token); setAction('MFA_ENROLL'); setNextPassword(''); }
      else if (data.recoveryCodes) { setCodes(data.recoveryCodes); setToken(''); setSecret(''); setCode(''); }
      else { setMessage(t('security.done')); setToken(''); setNextPassword(''); setCode(''); }
    } catch { setMessage(t('security.failed')); }
    finally { setBusy(false); }
  };
  return <details open style={{ marginTop: 20 }}>
    <summary>{t('security.private_link_title')}</summary>
    {message && <p role="status">{message}</p>}
    {busy && <p role="status">{t('shell.login.verifying')}</p>}
    {codes.length > 0 ? <div><p>{t('security.save_codes')}</p><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{codes.join('\n')}</pre></div> : (
      <form className="login-formulario" onSubmit={e => {
        e.preventDefault();
        if (action === 'VERIFY_EMAIL') void run('verify-email', { token });
        else if (action === 'BOOTSTRAP_MFA') void run('mfa/bootstrap', { token, currentPassword: nextPassword });
        else if (action === 'MFA_ENROLL') void run('mfa/confirm', { token, secret, mfaCode: code });
        else void run('reset', { token, password: nextPassword });
      }}>
        <label htmlFor="recovery-token">{t('security.token')}</label><input id="recovery-token" className="form-input" value={token} required onChange={e => setToken(e.target.value.trim())} autoComplete="off" />
        {secret && <p style={{ overflowWrap: 'anywhere' }}>{t('security.secret')}: <strong>{secret}</strong></p>}
        {action !== 'VERIFY_EMAIL' && action !== 'MFA_ENROLL' && <><label htmlFor="recovery-password">{t(action === 'BOOTSTRAP_MFA' ? 'security.current' : 'security.new_password')}</label><input id="recovery-password" className="form-input" type="password" autoComplete={action === 'BOOTSTRAP_MFA' ? 'current-password' : 'new-password'} required value={nextPassword} onChange={e => setNextPassword(e.target.value)} /></>}
        {action === 'MFA_ENROLL' && <><label htmlFor="recovery-code">{t('security.mfa')}</label><input id="recovery-code" className="form-input" value={code} onChange={e => setCode(e.target.value.trim())} autoComplete="one-time-code" inputMode="numeric" required /></>}
        <button className="btn btn-primary" disabled={busy}>{t('security.continue')}</button>
      </form>
    )}
  </details>;
}
