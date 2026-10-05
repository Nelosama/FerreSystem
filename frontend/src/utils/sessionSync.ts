import type { UserInfo } from '../types';

// La API mantiene la autoridad de los permisos; esta sincronización actualiza la interfaz.
export function startSessionSync(getProfile: () => Promise<any>, onUser: (user: UserInfo) => void) {
  let disposed = false, inFlight = false;
  const refresh = async () => {
    if (disposed || inFlight || document.visibilityState === 'hidden') return;
    const savedUser = localStorage.getItem('ferre_user');
    const savedTenant = localStorage.getItem('ferre_tenant');
    const savedToken = localStorage.getItem('ferre_token');
    if (!savedUser || !savedTenant || !savedToken) return;
    inFlight = true;
    try {
      const original = JSON.parse(savedUser), tenant = JSON.parse(savedTenant);
      if (original.rol === 'SUPERADMIN') return;
      const response = await getProfile();
      if (disposed || localStorage.getItem('ferre_user') !== savedUser || localStorage.getItem('ferre_tenant') !== savedTenant || localStorage.getItem('ferre_token') !== savedToken) return;
      const profile = response.data?.user;
      if (profile?.sub !== original.id || profile.tenantId !== tenant.id || !['ADMIN', 'CAJERO', 'BODEGUERO', 'VENDEDOR'].includes(profile.rol)) return;
      const updated = { ...original, rol: profile.rol, permisos: profile.permisos, permisosConfigurados: profile.permisosConfigurados, descuentoMaximo: profile.descuentoMaximo };
      if (JSON.stringify(updated) !== savedUser) { localStorage.setItem('ferre_user', JSON.stringify(updated)); onUser(updated); }
    } catch {
      // Desconexión: conservar sesión/datos; el interceptor gestiona las sesiones vencidas.
    } finally { inFlight = false; }
  };
  const notify = () => { void refresh(); };
  window.addEventListener('focus', notify);
  document.addEventListener('visibilitychange', notify);
  const timer = setInterval(notify, 30000);
  notify();
  return () => { disposed = true; clearInterval(timer); window.removeEventListener('focus', notify); document.removeEventListener('visibilitychange', notify); };
}
