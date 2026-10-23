import React, { createContext, useContext, useState, useEffect } from 'react';
import type { TenantInfo, UserInfo } from '../types';
import { api } from '../utils/api';
import { startSessionValidation, profileRequestConfig, type SessionStatus } from '../utils/sessionValidation';
import { clearSessionStorage, clearSessionExpiredNotice } from '../utils/authInterceptors';
import { readStoredJson } from '../utils/storage';
import { normalizeTenantSettings, TenantSettingsReads } from '../utils/tenantSettings';
import { variantesMarca } from '../utils/colorMarca';

interface TenantContextType {
  tenant: TenantInfo;
  user: UserInfo | null;
  isAuthenticated: boolean;
  authStatus: SessionStatus;
  retrySession: () => void;
  isImpersonating: boolean;
  isReadOnly: boolean;
  originalSuperAdminUser: UserInfo | null;
  updateBranding: (colorPrimario: string, nombreComercial: string) => void;
  updateTenantConfig: (updates: Partial<TenantInfo>) => void;
  login: (user: UserInfo, tenant: TenantInfo) => void;
  logout: () => void;
  impersonateTenantAdmin: (targetTenant: TenantInfo, targetAdminUser: UserInfo, supportSessionId?: string, motivo?: string) => Promise<void>;
  stopImpersonating: () => Promise<void>;
  enableEditMode: (motivo?: string) => Promise<void>;
  switchSucursal: (targetSucursalName: string, targetTenantId: string) => void;
}

const DEFAULT_TENANT: TenantInfo = {
  id: '',
  nombreComercial: 'Jowa System',
  sucursal: 'Sucursal Principal',
  colorPrimario: '#EA580C',
  logoUrl: null,
};


const TenantContext = createContext<TenantContextType | undefined>(undefined);

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [sessionGeneration, setSessionGeneration] = useState(0);
  const [authStatus, setAuthStatus] = useState<SessionStatus>('checking');
  const configRevision = React.useRef(0);
  const settingsReads = React.useRef(new TenantSettingsReads());
  const [tenant, setTenant] = useState<TenantInfo>(() => {
    return readStoredJson('ferre_tenant', DEFAULT_TENANT);
  });

  const [user, setUser] = useState<UserInfo | null>(() => {
    return readStoredJson('ferre_user', null);
  });

  const [originalSuperAdminUser, setOriginalSuperAdminUser] = useState<UserInfo | null>(() => {
    return readStoredJson('ferre_original_superadmin_user', null);
  });

  const [originalTenant, setOriginalTenant] = useState<TenantInfo | null>(() => {
    return readStoredJson('ferre_original_superadmin_tenant', null);
  });

  const [isReadOnlyState, setIsReadOnlyState] = useState<boolean>(() => {
    return readStoredJson('ferre_is_read_only', true);
  });

  const [, setActiveSupportSessionId] = useState<string | null>(() => {
    return localStorage.getItem('ferre_active_support_session_id');
  });

  const resetIdentity = React.useCallback(() => {
    document.documentElement.dataset.sessionPending = 'true';
    configRevision.current++;
    settingsReads.current.invalidate();
    setUser(null);
    setTenant(DEFAULT_TENANT);
    setOriginalSuperAdminUser(null);
    setOriginalTenant(null);
    setIsReadOnlyState(false);
    setActiveSupportSessionId(null);
    setAuthStatus('checking');
  }, []);

  React.useLayoutEffect(() => {
    window.addEventListener('ferre:session-expired', resetIdentity);
    return () => window.removeEventListener('ferre:session-expired', resetIdentity);
  }, [resetIdentity]);

  React.useLayoutEffect(() => {
    if (!user) return;
    return startSessionValidation({
      profile: () => api.get('/auth/me', { ...profileRequestConfig, params: { _session: Date.now() } }),
      userId: user.id, tenantId: tenant.id, superAdmin: user.rol === 'SUPERADMIN',
      onStatus: setAuthStatus,
      onChanged: resetIdentity,
      onProfile: profile => {
        if (user.rol === 'SUPERADMIN') return;
        setUser(previous => {
          if (!previous || previous.id !== profile.sub) return previous;
          const next = { ...previous, rol: profile.rol, permisos: profile.permisos, permisosConfigurados: profile.permisosConfigurados, descuentoMaximo: profile.descuentoMaximo };
          if (JSON.stringify(previous) === JSON.stringify(next)) return previous;
          localStorage.setItem('ferre_user', JSON.stringify(next));
          return next;
        });
      },
    });
  }, [user?.id, tenant.id, !!originalSuperAdminUser, resetIdentity, sessionGeneration]);

  useEffect(() => {
    if (authStatus !== 'ready' || !user || user.rol === 'SUPERADMIN' || !tenant.id) return;
    let active = true;
    const refresh = () => {
      const revision = configRevision.current;
      const ticket = settingsReads.current.begin();
      const session = localStorage.getItem('ferre_token');
      return api.get('/tenant/settings').then(({ data }) => {
        if (!active || session !== localStorage.getItem('ferre_token') || revision !== configRevision.current || data.id !== tenant.id || readStoredJson<UserInfo | null>('ferre_user', null)?.id !== user.id) return;
        setTenant(previous => {
          if (!active || revision !== configRevision.current || session !== localStorage.getItem('ferre_token')) return previous;
          const updated = normalizeTenantSettings(data, previous);
          if (!settingsReads.current.accepts(ticket, updated, previous)) return previous;
          if (JSON.stringify(previous) === JSON.stringify(updated)) return previous;
          localStorage.setItem('ferre_tenant', JSON.stringify(updated));
          return updated;
        });
      }).catch(() => {});
    };
    void refresh();
    window.addEventListener('focus', refresh);
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 30000);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [user?.id, tenant.id, authStatus]);

  // Diseño único de Jowa System: solo el color de marca cambia por negocio; tipografía y estilo son fijos.
  // El color se usa tal cual en fondos; el texto encima y el texto de marca sobre fondo claro se derivan legibles.
  useEffect(() => {
    const root = document.documentElement;
    const marca = variantesMarca(tenant.colorPrimario || '#EA580C');
    root.style.setProperty('--color-primary', marca.primario);
    root.style.setProperty('--color-primary-hover', marca.hover);
    root.style.setProperty('--color-primary-active', marca.activo);
    root.style.setProperty('--color-primary-light', marca.tinte);
    root.style.setProperty('--color-primary-border', marca.borde);
    root.style.setProperty('--color-on-primary', marca.sobrePrimario);
    root.style.setProperty('--color-primary-text', marca.texto);
  }, [user?.id, tenant.id, tenant.colorPrimario]);

  const updateBranding = (colorPrimario: string, nombreComercial: string) => {
    configRevision.current++;
    settingsReads.current.invalidate();
    const updated = { ...tenant, colorPrimario, nombreComercial };
    setTenant(updated);
    localStorage.setItem('ferre_tenant', JSON.stringify(updated));
  };

  const updateTenantConfig = (updates: Partial<TenantInfo>) => {
    configRevision.current++;
    settingsReads.current.invalidate();
    if (updates.id !== tenant.id) return;
    const updated = normalizeTenantSettings(updates, tenant);
    if (tenant.updatedAt && (!updated.updatedAt || Date.parse(updated.updatedAt) < Date.parse(tenant.updatedAt))) return;
    setTenant(updated);
    localStorage.setItem('ferre_tenant', JSON.stringify(updated));
  };

  const login = (newUser: UserInfo, newTenant: TenantInfo) => {
    setAuthStatus('checking');
    setSessionGeneration(value => value + 1);
    clearSessionExpiredNotice();
    configRevision.current++;
    settingsReads.current.invalidate();
    setOriginalSuperAdminUser(null);
    setOriginalTenant(null);
    setIsReadOnlyState(false);
    setActiveSupportSessionId(null);
    ['ferre_original_superadmin_user', 'ferre_original_superadmin_tenant', 'ferre_original_superadmin_token', 'ferre_support_target', 'ferre_is_read_only', 'ferre_active_support_session_id'].forEach((key) => localStorage.removeItem(key));
    setUser(newUser);
    setTenant(normalizeTenantSettings(newTenant));
    localStorage.setItem('ferre_user', JSON.stringify(newUser));
    localStorage.setItem('ferre_tenant', JSON.stringify(normalizeTenantSettings(newTenant)));
  };

  const impersonateTenantAdmin = async (targetTenant: TenantInfo, targetAdminUser: UserInfo, supportSessionId?: string, motivo?: string) => {
    if (user?.rol !== 'SUPERADMIN') throw new Error('Se requiere una sesión de superadmin');
    const token = localStorage.getItem('ferre_token');
    const savedUser = localStorage.getItem('ferre_user');
    const target = { tenantId: targetTenant.id, usuarioId: targetAdminUser.id, readOnly: true, motivo: (motivo || '').trim() };
    const { data } = await api.post('/admin/support/token', target);
    if (localStorage.getItem('ferre_user') !== savedUser) throw new Error('La sesión cambió durante el inicio de soporte');
    if (!data.accessToken || !data.user || !token) throw new Error('No se pudo iniciar la sesión de soporte');
    // El interceptor puede haber renovado el token de superadmin durante esta petición.
    localStorage.setItem('ferre_original_superadmin_token', localStorage.getItem('ferre_token') || token);
    localStorage.setItem('ferre_token', data.accessToken);
    localStorage.setItem('ferre_support_target', JSON.stringify(target));
    targetAdminUser = data.user;
    if (user?.rol === 'SUPERADMIN') {
      setOriginalSuperAdminUser(user);
      setOriginalTenant(tenant);
      localStorage.setItem('ferre_original_superadmin_user', JSON.stringify(user));
      localStorage.setItem('ferre_original_superadmin_tenant', JSON.stringify(tenant));
    }
    configRevision.current++;
    settingsReads.current.invalidate();
    setAuthStatus('checking');
    setSessionGeneration(value => value + 1);
    setUser(targetAdminUser);
    setTenant(targetTenant);
    setIsReadOnlyState(true);
    localStorage.setItem('ferre_user', JSON.stringify(targetAdminUser));
    localStorage.setItem('ferre_tenant', JSON.stringify(targetTenant));
    localStorage.setItem('ferre_is_read_only', JSON.stringify(true));

    if (supportSessionId) {
      setActiveSupportSessionId(supportSessionId);
      localStorage.setItem('ferre_active_support_session_id', supportSessionId);
    }
  };

  const enableEditMode = async (motivo?: string) => {
    const savedTarget = localStorage.getItem('ferre_support_target');
    const adminToken = localStorage.getItem('ferre_original_superadmin_token');
    if (!savedTarget || !adminToken) throw new Error('Vuelve a iniciar la sesión de soporte');
    const justificacion = (motivo || '').trim();
    if (justificacion.length < 10) throw new Error('Escriba el motivo de la edición (mínimo 10 caracteres)');
    const target = { ...JSON.parse(savedTarget), readOnly: false, confirmarEscritura: true, motivo: justificacion };
    const supportToken = localStorage.getItem('ferre_token');
    const { data } = await api.post('/admin/support/token', target, { headers: { Authorization: `Bearer ${adminToken}` } });
    if (localStorage.getItem('ferre_token') !== supportToken || localStorage.getItem('ferre_support_target') !== savedTarget) throw new Error('La sesión de soporte cambió');
    if (!data.accessToken) throw new Error('No se pudo activar el modo de edición');
    localStorage.setItem('ferre_token', data.accessToken);
    localStorage.setItem('ferre_support_target', JSON.stringify(target));
    setIsReadOnlyState(false);
    localStorage.setItem('ferre_is_read_only', JSON.stringify(false));
    // La sesión de solo lectura anterior queda revocada en el servidor: no debe seguir vigente junto a la de escritura.
    await api.post('/admin/support/finalizar', {}, { headers: { Authorization: `Bearer ${supportToken}` } }).catch(() => {});
  };

  const stopImpersonating = async () => {
    configRevision.current++;
    settingsReads.current.invalidate();
    const adminToken = localStorage.getItem('ferre_original_superadmin_token');
    const supportToken = localStorage.getItem('ferre_token');
    // Revoca la sesión de soporte en el servidor (queda registrada como finalizada). Si la red falla, el token
    // de soporte vence solo en pocos minutos; la identidad original se recupera igual para no bloquear al Super Admin.
    if (adminToken && supportToken && adminToken !== supportToken && localStorage.getItem('ferre_support_target')) {
      await api.post('/admin/support/finalizar', {}, { headers: { Authorization: `Bearer ${supportToken}` } }).catch((error) => {
        console.error('No se pudo revocar la sesión de soporte en el servidor:', error);
      });
    }
    // Compatibilidad con sesiones antiguas: conservaban el token de superadmin.
    if (adminToken) localStorage.setItem('ferre_token', adminToken);
    localStorage.removeItem('ferre_original_superadmin_token');
    localStorage.removeItem('ferre_support_target');

    if (originalSuperAdminUser && originalTenant) {
      setAuthStatus('checking');
      setSessionGeneration(value => value + 1);
      setUser(originalSuperAdminUser);
      setTenant(originalTenant);
      localStorage.setItem('ferre_user', JSON.stringify(originalSuperAdminUser));
      localStorage.setItem('ferre_tenant', JSON.stringify(originalTenant));
    }
    setOriginalSuperAdminUser(null);
    setOriginalTenant(null);
    setIsReadOnlyState(false);
    setActiveSupportSessionId(null);
    localStorage.removeItem('ferre_original_superadmin_user');
    localStorage.removeItem('ferre_original_superadmin_tenant');
    localStorage.removeItem('ferre_is_read_only');
    localStorage.removeItem('ferre_active_support_session_id');
  };

  const switchSucursal = (targetSucursalName: string, targetTenantId: string) => {
    configRevision.current++;
    settingsReads.current.invalidate();
    if (targetTenantId !== tenant.id) throw new Error('Para cambiar de empresa debes iniciar una sesión autorizada para esa empresa');
    const updatedTenant = {
      ...tenant,
      id: targetTenantId,
      sucursal: targetSucursalName,
    };
    setTenant(updatedTenant);
    localStorage.setItem('ferre_tenant', JSON.stringify(updatedTenant));
  };

  const logout = () => {
    configRevision.current++;
    settingsReads.current.invalidate();
    const logoutPath = user?.rol === 'SUPERADMIN' || originalSuperAdminUser ? '/admin/auth/logout' : '/auth/logout';
    // Capturar el Bearer antes de borrar el estado: Axios ejecuta su interceptor de forma asíncrona.
    const token = localStorage.getItem('ferre_token');
    const original = localStorage.getItem('ferre_original_superadmin_token');
    if (original && token) void api.post('/admin/support/finalizar', {}, { headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    void api.post(logoutPath, undefined, { headers: { Authorization: `Bearer ${original || token || ''}` } }).catch(() => {});
    clearSessionStorage();
    clearSessionExpiredNotice();
    resetIdentity();
  };

  return (
    <TenantContext.Provider
      value={{
        tenant,
        user,
        isAuthenticated: !!user && (authStatus === 'ready' || authStatus === 'offline'),
        authStatus,
        retrySession: () => window.dispatchEvent(new Event('ferre:session-retry')),
        isImpersonating: !!originalSuperAdminUser,
        isReadOnly: !!originalSuperAdminUser && isReadOnlyState,
        originalSuperAdminUser,
        enableEditMode,
        updateBranding,
        updateTenantConfig,
        login,
        logout,
        impersonateTenantAdmin,
        stopImpersonating,
        switchSucursal,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
};

export const useTenant = () => {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
};
