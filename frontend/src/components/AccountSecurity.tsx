import { useEffect, useRef, useState } from 'react';
import { useTenant } from '../context/TenantContext';
import { useI18n } from '../context/I18nContext';
import { api } from '../utils/api';
import { useNavigate } from 'react-router-dom';

export function AccountSecurity() {
  const { user, tenant, logout, isImpersonating } = useTenant();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [currentPassword, setCurrent] = useState(''), [password, setPassword] = useState(''), [mfaCode, setCode] = useState('');
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [token, setToken] = useState(''), [secret, setSecret] = useState('');
  const [open, setOpen] = useState(false);
  const [codes, setCodes] = useState<string[]>([]), [link, setLink] = useState('');
  const [targetTenant, setTargetTenant] = useState(tenant.id), [target, setTarget] = useState('');
  const [users, setUsers] = useState<{ id: string; nombre: string }[]>([]);
  const platform = user?.rol === 'SUPERADMIN', admin = platform || user?.rol === 'ADMIN';
  const logoutRef = useRef(logout);
  useEffect(() => { logoutRef.current = logout; }, [logout]);
  const userId = user?.id;

  // No local unlock or PIN. Resume after timeout requires a new online login.
  useEffect(() => {
    if (!userId) return;
    let last = Date.now();
    const check = () => { if (Date.now() - last >= 5 * 60000) logoutRef.current(); };
    const activity = () => { check(); last = Date.now(); };
    const timer = window.setInterval(check, 1000);
    const events = ['pointerdown', 'keydown'] as const;
    events.forEach(event => window.addEventListener(event, activity, { passive: true }));
    window.addEventListener('focus', check); document.addEventListener('visibilitychange', check);
    return () => { clearInterval(timer); events.forEach(event => window.removeEventListener(event, activity)); window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check); };
  }, [userId]);

  const run = async (path: string, body: object) => {
    if (busy) return;
    setBusy(true); setMessage(''); setLink('');
    try {
      const { data } = await api.post(`/auth/security/${path}`, body);
      if (data.secret) { setSecret(data.secret); setToken(data.token); }
      else if (data.recoveryCodes) { setCodes(data.recoveryCodes); setSecret(''); setToken(''); logout(); navigate('/login', { replace: true, state: { recoveryCodes: data.recoveryCodes } }); }
      else if (data.token) { const url = new URL('/login', window.location.origin); url.searchParams.set('empresa', targetTenant); url.hash = new URLSearchParams({ token: data.token, action: 'RESET_ADMIN' }).toString(); setLink(url.href); }
      else setMessage(t('security.done'));
      setCurrent(''); setPassword(''); setCode('');
      if (path === 'change-password') logout();
    } catch { setMessage(t('security.failed')); }
    finally { setBusy(false); }
  };
  if (!user || isImpersonating) return null;
  return <details style={{ marginBottom: 16 }} onToggle={e => setOpen(e.currentTarget.open)}>
    <summary>{t('security.account')}</summary>
    {open && <>
    <button type="button" className="btn btn-secondary" onClick={logout}>{t('security.switch')}</button>
    {message && <p role="status">{message}</p>}
    {link && <div><p>{t('security.private_link')}</p><input className="form-input" aria-label={t('security.private_link')} readOnly value={link} onFocus={e => e.target.select()} /><button type="button" className="btn btn-secondary" onClick={() => setLink('')}>{t('common.close')}</button></div>}
    <form className="login-formulario" style={{ maxWidth: 440 }} onSubmit={e => { e.preventDefault(); void run('change-password', { currentPassword, password, mfaCode }); }}>
      <label htmlFor="security-current">{t('security.current')}</label><input id="security-current" className="form-input" type="password" autoComplete="current-password" value={currentPassword} onChange={e => setCurrent(e.target.value)} required />
      {!platform && <><label htmlFor="security-code">{t('security.mfa')}</label><input id="security-code" className="form-input" autoComplete="one-time-code" value={mfaCode} onChange={e => setCode(e.target.value.trim())} /></>}
      <label htmlFor="security-new">{t('security.new_password')}</label><input id="security-new" className="form-input" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} required />
      <button className="btn btn-primary" disabled={busy}>{t('security.change')}</button>
      {admin && <>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => run('verification', {})}>{t('security.verify')}</button>
        {/* MFA opcional para administradores de negocio; el Super Admin no lo usa. */}
        {!platform && <button type="button" className="btn btn-secondary" disabled={busy || !currentPassword} onClick={() => run('mfa/enroll', { currentPassword })}>{t('security.enroll')}</button>}
        {secret && <><p style={{ overflowWrap: 'anywhere' }}>{t('security.secret')}: {secret}</p><button type="button" className="btn btn-primary" disabled={busy || !mfaCode} onClick={() => run('mfa/confirm', { token, secret, mfaCode })}>{t('security.continue')}</button></>}
        {codes.length > 0 && <><p>{t('security.save_codes')}</p><pre style={{ whiteSpace: 'pre-wrap' }}>{codes.join('\n')}</pre></>}
        {platform && <><label htmlFor="security-tenant">{t('security.tenant')}</label><input id="security-tenant" className="form-input" value={targetTenant} onChange={e => setTargetTenant(e.target.value)} /></>}
        <button type="button" className="btn btn-secondary" disabled={busy || !targetTenant} onClick={async () => {
          try { const { data } = await api.get(platform ? `/admin/tenants/${encodeURIComponent(targetTenant)}/usuarios?gestion=true` : '/usuarios'); setUsers(data); }
          catch { setMessage(t('security.failed')); }
        }}>{t('security.load_users')}</button>
        <label htmlFor="security-target">{t('security.employee')}</label><select id="security-target" className="form-input" value={target} onChange={e => setTarget(e.target.value)}><option value="">—</option>{users.filter(u => u.id !== user.id).map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select>
        <button type="button" className="btn btn-secondary" disabled={busy || !target || !currentPassword} onClick={() => run('admin-reset', { usuarioId: target, tenantId: targetTenant, currentPassword, mfaCode })}>{t('security.admin_reset')}</button>
      </>}
    </form>
    </>}
  </details>;
}
