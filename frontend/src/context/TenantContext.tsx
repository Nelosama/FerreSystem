import React, { createContext, useContext, useState, useEffect } from 'react';
import type { TenantInfo, UserInfo } from '../types';
import { api } from '../utils/api';
import { readStoredJson } from '../utils/storage';

interface TenantContextType {
  tenant: TenantInfo;
  user: UserInfo | null;
  isAuthenticated: boolean;
  isImpersonating: boolean;
  isReadOnly: boolean;
  originalSuperAdminUser: UserInfo | null;
  updateBranding: (colorPrimario: string, nombreComercial: string) => void;
  updateTenantConfig: (updates: Partial<TenantInfo>) => void;
  login: (user: UserInfo, tenant: TenantInfo) => void;
  logout: () => void;
  impersonateTenantAdmin: (targetTenant: TenantInfo, targetAdminUser: UserInfo, supportSessionId?: string) => Promise<void>;
  stopImpersonating: () => void;
  enableEditMode: () => Promise<void>;
  switchSucursal: (targetSucursalName: string, targetTenantId: string) => void;
}

const DEFAULT_TENANT: TenantInfo = {
  id: '',
  nombreComercial: 'FerreSystem',
  sucursal: 'Sucursal Principal',
  colorPrimario: '#EA580C',
  logoUrl: null,
};


const TenantContext = createContext<TenantContextType | undefined>(undefined);

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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

  const [activeSupportSessionId, setActiveSupportSessionId] = useState<string | null>(() => {
    return localStorage.getItem('ferre_active_support_session_id');
  });

  // Sincronización continua de la configuración del Tenant desde ferre_saas_tenants y variables CSS
  useEffect(() => {
    const syncTenantFromStorage = () => {
      const saasTenantsRaw = localStorage.getItem('ferre_saas_tenants');
      if (saasTenantsRaw) {
        try {
          const saasTenants = JSON.parse(saasTenantsRaw);
          const match = saasTenants.find(
            (t: any) => t.id === tenant.id || t.nombreComercial === tenant.nombreComercial,
          );
          if (match) {
            let needsUpdate = false;
            const updates: Partial<TenantInfo> = {};

            if (match.colorPrimario && match.colorPrimario !== tenant.colorPrimario) {
              updates.colorPrimario = match.colorPrimario;
              needsUpdate = true;
            }
            if (match.modoNavegacion && match.modoNavegacion !== tenant.modoNavegacion) {
              updates.modoNavegacion = match.modoNavegacion;
              needsUpdate = true;
            }
            if (
              match.modulosHabilitados &&
              JSON.stringify(match.modulosHabilitados) !== JSON.stringify(tenant.modulosHabilitados)
            ) {
              updates.modulosHabilitados = match.modulosHabilitados;
              needsUpdate = true;
            }

            if (needsUpdate) {
              setTenant((prev) => {
                const updated = { ...prev, ...updates };
                localStorage.setItem('ferre_tenant', JSON.stringify(updated));
                return updated;
              });
            }
          }
        } catch (e) {
          // Fallback
        }
      }
    };

    syncTenantFromStorage();

    const root = document.documentElement;
    let color = tenant.colorPrimario || '#EA580C';
    let estiloUI = tenant.estiloUI || 'INDUSTRIAL';
    let fuenteTitulos = tenant.fuenteTitulos || 'Archivo';
    let fuenteCuerpo = tenant.fuenteCuerpo || 'Inter';

    root.style.setProperty('--color-primary', color);
    root.style.setProperty('--color-primary-hover', adjustColorBrightness(color, -15));
    root.style.setProperty('--color-primary-active', adjustColorBrightness(color, -30));
    root.style.setProperty('--color-primary-light', `${color}1F`);

    // Estilo de interfaz (INDUSTRIAL, MINIMALISTA, MODERNO)
    if (estiloUI === 'MINIMALISTA') {
      root.style.setProperty('--color-sidebar-bg', '#FFFFFF');
      root.style.setProperty('--color-sidebar-text', '#1C1917');
      root.style.setProperty('--color-sidebar-active-bg', color);
      root.style.setProperty('--radius-sm', '6px');
      root.style.setProperty('--radius-md', '10px');
      root.style.setProperty('--shadow-hard', '0 2px 8px rgba(0,0,0,0.08)');
      root.style.setProperty('--shadow-hard-sm', '0 1px 3px rgba(0,0,0,0.1)');
      root.style.setProperty('--shadow-hard-primary', `0 2px 8px ${color}33`);
    } else if (estiloUI === 'MODERNO') {
      root.style.setProperty('--color-sidebar-bg', color);
      root.style.setProperty('--color-sidebar-text', '#FFFFFF');
      root.style.setProperty('--color-sidebar-active-bg', adjustColorBrightness(color, -20));
      root.style.setProperty('--radius-sm', '8px');
      root.style.setProperty('--radius-md', '12px');
      root.style.setProperty('--shadow-hard', '0 4px 14px rgba(0,0,0,0.12)');
      root.style.setProperty('--shadow-hard-sm', '0 2px 6px rgba(0,0,0,0.1)');
      root.style.setProperty('--shadow-hard-primary', `0 4px 14px ${color}40`);
    } else {
      // INDUSTRIAL (Default)
      root.style.setProperty('--color-sidebar-bg', '#1C1917');
      root.style.setProperty('--color-sidebar-text', '#D6D3D1');
      root.style.setProperty('--color-sidebar-active-bg', color);
      root.style.setProperty('--radius-sm', '3px');
      root.style.setProperty('--radius-md', '4px');
      root.style.setProperty('--shadow-hard', '3px 3px 0px #1C1917');
      root.style.setProperty('--shadow-hard-sm', '2px 2px 0px #1C1917');
      root.style.setProperty('--shadow-hard-primary', `3px 3px 0px ${color}`);
    }

    // Tipografías
    root.style.setProperty('--font-display', `'${fuenteTitulos}', sans-serif`);
    root.style.setProperty('--font-body', `'${fuenteCuerpo}', sans-serif`);
  }, [tenant.id, tenant.nombreComercial, tenant.colorPrimario, tenant.estiloUI, tenant.fuenteTitulos, tenant.fuenteCuerpo]);

  const updateBranding = (colorPrimario: string, nombreComercial: string) => {
    const updated = { ...tenant, colorPrimario, nombreComercial };
    setTenant(updated);
    localStorage.setItem('ferre_tenant', JSON.stringify(updated));
  };

  const updateTenantConfig = (updates: Partial<TenantInfo>) => {
    const updated = { ...tenant, ...updates };
    setTenant(updated);
    localStorage.setItem('ferre_tenant', JSON.stringify(updated));
  };

  const login = (newUser: UserInfo, newTenant: TenantInfo) => {
    setOriginalSuperAdminUser(null);
    setOriginalTenant(null);
    setIsReadOnlyState(false);
    setActiveSupportSessionId(null);
    ['ferre_original_superadmin_user', 'ferre_original_superadmin_tenant', 'ferre_original_superadmin_token', 'ferre_support_target', 'ferre_is_read_only', 'ferre_active_support_session_id'].forEach((key) => localStorage.removeItem(key));
    setUser(newUser);
    setTenant(newTenant);
    localStorage.setItem('ferre_user', JSON.stringify(newUser));
    localStorage.setItem('ferre_tenant', JSON.stringify(newTenant));
  };

  const impersonateTenantAdmin = async (targetTenant: TenantInfo, targetAdminUser: UserInfo, supportSessionId?: string) => {
    if (user?.rol !== 'SUPERADMIN') throw new Error('Se requiere una sesión de superadmin');
    const token = localStorage.getItem('ferre_token');
    const savedUser = localStorage.getItem('ferre_user');
    const target = { tenantId: targetTenant.id, usuarioId: targetAdminUser.id, readOnly: true };
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

  const enableEditMode = async () => {
    const savedTarget = localStorage.getItem('ferre_support_target');
    const adminToken = localStorage.getItem('ferre_original_superadmin_token');
    if (!savedTarget || !adminToken) throw new Error('Vuelve a iniciar la sesión de soporte');
    const target = { ...JSON.parse(savedTarget), readOnly: false };
    const supportToken = localStorage.getItem('ferre_token');
    const { data } = await api.post('/admin/support/token', target, { headers: { Authorization: `Bearer ${adminToken}` } });
    if (localStorage.getItem('ferre_token') !== supportToken || localStorage.getItem('ferre_support_target') !== savedTarget) throw new Error('La sesión de soporte cambió');
    if (!data.accessToken) throw new Error('No se pudo activar el modo de edición');
    localStorage.setItem('ferre_token', data.accessToken);
    localStorage.setItem('ferre_support_target', JSON.stringify(target));
    setIsReadOnlyState(false);
    localStorage.setItem('ferre_is_read_only', JSON.stringify(false));

    if (activeSupportSessionId) {
      const logsRaw = localStorage.getItem('ferre_mock_auditoria_soporte');
      if (logsRaw) {
        try {
          const logs = JSON.parse(logsRaw);
          const updated = logs.map((log: any) =>
            log.id === activeSupportSessionId ? { ...log, modoEdicionActivado: true } : log,
          );
          localStorage.setItem('ferre_mock_auditoria_soporte', JSON.stringify(updated));
        } catch (e) {
          // Fallback
        }
      }
    }
  };

  const stopImpersonating = () => {
    const adminToken = localStorage.getItem('ferre_original_superadmin_token');
    // Compatibilidad con sesiones antiguas: conservaban el token de superadmin.
    if (adminToken) localStorage.setItem('ferre_token', adminToken);
    localStorage.removeItem('ferre_original_superadmin_token');
    localStorage.removeItem('ferre_support_target');
    if (activeSupportSessionId) {
      const logsRaw = localStorage.getItem('ferre_mock_auditoria_soporte');
      if (logsRaw) {
        try {
          const logs = JSON.parse(logsRaw);
          const nowFormatted = new Date().toISOString().replace('T', ' ').slice(0, 16);
          const updated = logs.map((log: any) =>
            log.id === activeSupportSessionId && !log.fechaFin ? { ...log, fechaFin: nowFormatted } : log,
          );
          localStorage.setItem('ferre_mock_auditoria_soporte', JSON.stringify(updated));
        } catch (e) {
          // Fallback
        }
      }
    }

    if (originalSuperAdminUser && originalTenant) {
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
    const updatedTenant = {
      ...tenant,
      id: targetTenantId,
      sucursal: targetSucursalName,
    };
    setTenant(updatedTenant);
    localStorage.setItem('ferre_tenant', JSON.stringify(updatedTenant));
  };

  const logout = () => {
    const logoutPath = user?.rol === 'SUPERADMIN' || originalSuperAdminUser ? '/admin/auth/logout' : '/auth/logout';
    void api.post(logoutPath).catch(() => {});
    localStorage.removeItem('ferre_token');
    setUser(null);
    setOriginalSuperAdminUser(null);
    setOriginalTenant(null);
    localStorage.removeItem('ferre_user');
    localStorage.removeItem('ferre_original_superadmin_user');
    localStorage.removeItem('ferre_original_superadmin_tenant');
    ['ferre_original_superadmin_token', 'ferre_support_target', 'ferre_is_read_only', 'ferre_active_support_session_id'].forEach((key) => localStorage.removeItem(key));
    setIsReadOnlyState(false);
    setActiveSupportSessionId(null);
  };

  return (
    <TenantContext.Provider
      value={{
        tenant,
        user,
        isAuthenticated: !!user,
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

// Helper para calcular hover/active colors a partir del HEX primario
function adjustColorBrightness(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) + amt;
  const G = ((num >> 8) & 0x00ff) + amt;
  const B = (num & 0x0000ff) + amt;
  return (
    '#' +
    (
      0x1000000 +
      (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
      (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
      (B < 255 ? (B < 1 ? 0 : B) : 255)
    )
      .toString(16)
      .slice(1)
  );
}
