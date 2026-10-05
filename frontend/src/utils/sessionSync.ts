import type { UserInfo } from '../types';

// La API mantiene la autoridad de los permisos; esta sincronización actualiza la interfaz.
export function startSessionSync(
  getProfile: () => Promise<any>,
  onUser: (user: UserInfo) => void,
  identity: { userId: string; tenantId: string; onChanged: () => void },
) {
  let disposed = false, inFlight = false, invalidated = false;
  const readSession = () => {
    const savedUser = localStorage.getItem('ferre_user');
    const savedTenant = localStorage.getItem('ferre_tenant');
    const savedToken = localStorage.getItem('ferre_token');
    return { savedUser, savedTenant, savedToken, original: savedUser ? JSON.parse(savedUser) : null, tenant: savedTenant ? JSON.parse(savedTenant) : null };
  };
  const matchesIdentity = (session: ReturnType<typeof readSession>) => {
    if (session.savedToken && session.original?.id === identity.userId && session.tenant?.id === identity.tenantId) return true;
    invalidated = true;
    identity.onChanged();
    return false;
  };
  const refresh = async () => {
    if (disposed || invalidated) return;
    let session: ReturnType<typeof readSession>;
    try { session = readSession(); if (!matchesIdentity(session)) return; } catch { return; }
    if (inFlight || document.visibilityState === 'hidden') return;
    const { savedUser, savedTenant, savedToken, original, tenant } = session;
    inFlight = true;
    try {
      if (original.rol === 'SUPERADMIN') return;
      const response = await getProfile();
      if (disposed || invalidated) return;
      const current = readSession();
      if (!matchesIdentity(current) || current.savedUser !== savedUser || current.savedTenant !== savedTenant || current.savedToken !== savedToken) return;
      const profile = response.data?.user;
      if (profile?.sub !== original.id || profile.tenantId !== tenant.id || !['ADMIN', 'CAJERO', 'BODEGUERO', 'VENDEDOR'].includes(profile.rol)) return;
      const updated = { ...original, rol: profile.rol, permisos: profile.permisos, permisosConfigurados: profile.permisosConfigurados, descuentoMaximo: profile.descuentoMaximo };
      if (JSON.stringify(updated) !== savedUser) { localStorage.setItem('ferre_user', JSON.stringify(updated)); onUser(updated); }
    } catch {
      // Desconexión: conservar sesión/datos; el interceptor gestiona las sesiones vencidas.
    } finally { inFlight = false; }
  };
  const notify = () => { void refresh(); };
  const storageChanged = (event: StorageEvent) => {
    if (event.key === null || ['ferre_user', 'ferre_tenant', 'ferre_token'].includes(event.key)) notify();
  };
  window.addEventListener('focus', notify);
  window.addEventListener('storage', storageChanged);
  document.addEventListener('visibilitychange', notify);
  const timer = setInterval(notify, 30000);
  notify();
  return () => { disposed = true; clearInterval(timer); window.removeEventListener('focus', notify); window.removeEventListener('storage', storageChanged); document.removeEventListener('visibilitychange', notify); };
}
