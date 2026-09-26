import React, { createContext, useContext, useState, useEffect } from 'react';

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

const STORAGE_KEY = 'ferre_solicitudes_descuento';

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [solicitudes, setSolicitudes] = useState<SolicitudDescuento[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  });

  // Escuchar cambios de localStorage en otras pestañas
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
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
  }, []);

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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(actualizadas));
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(actualizadas));
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
