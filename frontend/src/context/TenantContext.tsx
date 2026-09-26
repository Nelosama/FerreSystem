import React, { createContext, useContext, useState, useEffect } from 'react';
import type { TenantInfo, UserInfo } from '../types';

interface TenantContextType {
  tenant: TenantInfo;
  user: UserInfo | null;
  isAuthenticated: boolean;
  isImpersonating: boolean;
  originalSuperAdminUser: UserInfo | null;
  updateBranding: (colorPrimario: string, nombreComercial: string) => void;
  login: (user: UserInfo, tenant: TenantInfo) => void;
  logout: () => void;
  impersonateTenantAdmin: (targetTenant: TenantInfo, targetAdminUser: UserInfo) => void;
  stopImpersonating: () => void;
  switchSucursal: (targetSucursalName: string, targetTenantId: string) => void;
}

const DEFAULT_TENANT: TenantInfo = {
  id: 'tenant-demo-1',
  nombreComercial: 'LA MUNDIAL - SUCURSAL CENTRO',
  sucursal: 'Sucursal Centro',
  colorPrimario: '#EA580C',
  logoUrl: null,
};


const TenantContext = createContext<TenantContextType | undefined>(undefined);

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tenant, setTenant] = useState<TenantInfo>(() => {
    const saved = localStorage.getItem('ferre_tenant');
    return saved ? JSON.parse(saved) : DEFAULT_TENANT;
  });

  const [user, setUser] = useState<UserInfo | null>(() => {
    const saved = localStorage.getItem('ferre_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [originalSuperAdminUser, setOriginalSuperAdminUser] = useState<UserInfo | null>(() => {
    const saved = localStorage.getItem('ferre_original_superadmin_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [originalTenant, setOriginalTenant] = useState<TenantInfo | null>(() => {
    const saved = localStorage.getItem('ferre_original_superadmin_tenant');
    return saved ? JSON.parse(saved) : null;
  });

  // Inyección dinámica de variables CSS por Tenant (White-labeling)
  useEffect(() => {
    const root = document.documentElement;
    const color = tenant.colorPrimario || '#EA580C';
    root.style.setProperty('--color-primary', color);
    root.style.setProperty('--color-primary-hover', adjustColorBrightness(color, -15));
    root.style.setProperty('--color-primary-active', adjustColorBrightness(color, -30));
    root.style.setProperty('--color-primary-light', `${color}1F`);
    root.style.setProperty('--color-sidebar-active-bg', color);
  }, [tenant.colorPrimario]);

  const updateBranding = (colorPrimario: string, nombreComercial: string) => {
    const updated = { ...tenant, colorPrimario, nombreComercial };
    setTenant(updated);
    localStorage.setItem('ferre_tenant', JSON.stringify(updated));
  };

  const login = (newUser: UserInfo, newTenant: TenantInfo) => {
    setUser(newUser);
    setTenant(newTenant);
    localStorage.setItem('ferre_user', JSON.stringify(newUser));
    localStorage.setItem('ferre_tenant', JSON.stringify(newTenant));
  };

  const impersonateTenantAdmin = (targetTenant: TenantInfo, targetAdminUser: UserInfo) => {
    if (user?.rol === 'SUPERADMIN') {
      setOriginalSuperAdminUser(user);
      setOriginalTenant(tenant);
      localStorage.setItem('ferre_original_superadmin_user', JSON.stringify(user));
      localStorage.setItem('ferre_original_superadmin_tenant', JSON.stringify(tenant));
    }
    setUser(targetAdminUser);
    setTenant(targetTenant);
    localStorage.setItem('ferre_user', JSON.stringify(targetAdminUser));
    localStorage.setItem('ferre_tenant', JSON.stringify(targetTenant));
  };

  const stopImpersonating = () => {
    if (originalSuperAdminUser && originalTenant) {
      setUser(originalSuperAdminUser);
      setTenant(originalTenant);
      localStorage.setItem('ferre_user', JSON.stringify(originalSuperAdminUser));
      localStorage.setItem('ferre_tenant', JSON.stringify(originalTenant));
    }
    setOriginalSuperAdminUser(null);
    setOriginalTenant(null);
    localStorage.removeItem('ferre_original_superadmin_user');
    localStorage.removeItem('ferre_original_superadmin_tenant');
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
    setUser(null);
    setOriginalSuperAdminUser(null);
    setOriginalTenant(null);
    localStorage.removeItem('ferre_user');
    localStorage.removeItem('ferre_original_superadmin_user');
    localStorage.removeItem('ferre_original_superadmin_tenant');
  };

  return (
    <TenantContext.Provider
      value={{
        tenant,
        user,
        isAuthenticated: !!user,
        isImpersonating: !!originalSuperAdminUser,
        originalSuperAdminUser,
        updateBranding,
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
