import React, { createContext, useContext, useState, useEffect } from 'react';
import { useTenant } from './TenantContext';

export interface SolicitudDescuento {
  id: string;
  cajeroId: string;
  cajeroNombre: string;
  subtotal: number;
  totalOriginal: number;
  descuentoPorcentaje: number;
  totalConDescuento: number;
  estado: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';
  fecha: string;
  respondidoPor?: string;
}

interface NotificationContextType {
  solicitudes: SolicitudDescuento[];
  solicitarDescuento: (solicitud: Omit<SolicitudDescuento, 'id' | 'estado' | 'fecha'>) => SolicitudDescuento;
  responderSolicitud: (id: string, nuevoEstado: 'APROBADA' | 'RECHAZADA', respondidoPor: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { tenant } = useTenant();
  const currentTenantId = tenant?.id || 'tenant-demo-1';
  const storageKey = `ferre_solicitudes_descuento_${currentTenantId}`;

  const [loadedTenantId, setLoadedTenantId] = useState<string>(currentTenantId);

  const loadSolicitudes = (tId: string): SolicitudDescuento[] => {
    const saved = localStorage.getItem(`ferre_solicitudes_descuento_${tId}`);
    if (saved) return JSON.parse(saved);
    if (tId === 'tenant-demo-1' || tId === 't-1') {
      const legacy = localStorage.getItem('ferre_solicitudes_descuento');
      return legacy ? JSON.parse(legacy) : [];
    }
    return [];
  };

  const [solicitudes, setSolicitudes] = useState<SolicitudDescuento[]>(() =>
    loadSolicitudes(currentTenantId),
  );

  useEffect(() => {
    if (loadedTenantId !== currentTenantId) {
      setSolicitudes(loadSolicitudes(currentTenantId));
      setLoadedTenantId(currentTenantId);
    }
  }, [currentTenantId, loadedTenantId]);

  useEffect(() => {
    if (loadedTenantId === currentTenantId) {
      localStorage.setItem(storageKey, JSON.stringify(solicitudes));
    }
  }, [solicitudes, currentTenantId, loadedTenantId, storageKey]);

  // Escuchar cambios de localStorage en otras pestañas
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === storageKey) {
        if (e.newValue) {
          setSolicitudes(JSON.parse(e.newValue));
        } else {
          setSolicitudes([]);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [storageKey]);

  const solicitarDescuento = (
    data: Omit<SolicitudDescuento, 'id' | 'estado' | 'fecha'>,
  ): SolicitudDescuento => {
    const nueva: SolicitudDescuento = {
      ...data,
      id: `sol-${Date.now()}`,
      estado: 'PENDIENTE',
      fecha: new Date().toISOString(),
    };

    const actualizadas = [nueva, ...solicitudes];
    setSolicitudes(actualizadas);
    localStorage.setItem(storageKey, JSON.stringify(actualizadas));
    return nueva;
  };

  const responderSolicitud = (
    id: string,
    nuevoEstado: 'APROBADA' | 'RECHAZADA',
    respondidoPor: string,
  ) => {
    const actualizadas = solicitudes.map((s) =>
      s.id === id ? { ...s, estado: nuevoEstado, respondidoPor } : s,
    );
    setSolicitudes(actualizadas);
    localStorage.setItem(storageKey, JSON.stringify(actualizadas));
  };

  return (
    <NotificationContext.Provider
      value={{
        solicitudes,
        solicitarDescuento,
        responderSolicitud,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};
