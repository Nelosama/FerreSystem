import { useLayoutEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../utils/api';
import { useI18n } from '../context/I18nContext';

export function RecoveryForm({ email, tenantId, platform, password }: { email: string; tenantId: string; platform: boolean; password: string }) {
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
    // A second private link to the same login page is a fragment navigation:
    // React keeps this form mounted, so its initial state is no longer enough.
    const params = new URLSearchParams(location.hash.slice(1));
    const incoming = params.get('token');
    if (incoming) {
      setToken(incoming); setAction(params.get('action') || 'RESET_ADMIN');
      setNextPassword(''); setCode(''); setSecret(''); setCodes([]); setMessage('');
    }
    if (incoming || location.state?.recoveryCodes) window.history.replaceState({ ...window.history.state, usr: null }, '', window.location.pathname + window.location.search);
  }, [location]);
  const run = async (path: string, body: object) => {
    if (busy) return;
    setBusy(true); setMessage('');
    try {
      const { data } = await api.post(`/auth/security/${path}`, body);
      if (data.secret) { setSecret(data.secret); setToken(data.token); setAction('MFA_ENROLL'); }
      else if (data.recoveryCodes) { setCodes(data.recoveryCodes); setToken(''); setSecret(''); }
      else { setMessage(t(path.includes('request') ? 'security.accepted' : 'security.done')); if (!path.includes('request')) { setToken(''); setNextPassword(''); setCode(''); } }
    } catch { setMessage(t('security.failed')); }
    finally { setBusy(false); }
  };
  return <details open={!!initial.token || !!token || codes.length > 0} style={{ marginTop: 20 }}>
    <summary>{t('security.recovery')}</summary>
    <p>{t('security.employee_help')}</p>
    {message && <p role="status">{message}</p>}
    {busy && <p role="status">{t('shell.login.verifying')}</p>}
    {codes.length > 0 ? <div><p>{t('security.save_codes')}</p><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{codes.join('\n')}</pre></div> : <>
      <button className="btn btn-secondary" type="button" disabled={busy || !email} onClick={() => run('request', { email, tenantId, scope: platform ? 'super_admin' : 'tenant' })}>{t('security.send')}</button>
      {platform && <button className="btn btn-secondary" type="button" disabled={busy || !email || !password} onClick={() => run('mfa/bootstrap-request', { email, password })}>{t('security.bootstrap')}</button>}
      <form className="login-formulario" onSubmit={e => {
        e.preventDefault();
        if (action === 'VERIFY_EMAIL') void run('verify-email', { token });
        else if (action === 'BOOTSTRAP_MFA') void run('mfa/bootstrap', { token, currentPassword: nextPassword });
        else if (action === 'MFA_ENROLL') void run('mfa/confirm', { token, secret, mfaCode: code });
        else void run('reset', { token, password: nextPassword, mfaCode: code });
      }}>
        <label htmlFor="recovery-token">{t('security.token')}</label><input id="recovery-token" className="form-input" value={token} required onChange={e => setToken(e.target.value.trim())} autoComplete="off" />
        {secret && <p style={{ overflowWrap: 'anywhere' }}>{t('security.secret')}: <strong>{secret}</strong></p>}
        {action !== 'VERIFY_EMAIL' && action !== 'MFA_ENROLL' && <><label htmlFor="recovery-password">{t(action === 'BOOTSTRAP_MFA' ? 'security.current' : 'security.new_password')}</label><input id="recovery-password" className="form-input" type="password" autoComplete={action === 'BOOTSTRAP_MFA' ? 'current-password' : 'new-password'} required value={nextPassword} onChange={e => setNextPassword(e.target.value)} /></>}
        <label htmlFor="recovery-code">{t('security.mfa')}</label><input id="recovery-code" className="form-input" value={code} onChange={e => setCode(e.target.value.trim())} autoComplete="one-time-code" />
        <button className="btn btn-primary" disabled={busy}>{t('security.continue')}</button>
      </form>
    </>}
  </details>;
}
