import React, { createContext, useContext, useState, useEffect } from 'react';
import { useTenant } from './TenantContext';
import { parseStoredArray, readStoredArray } from '../utils/storage';

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

export interface NotificacionTransferencia {
  id: string;
  codigo: string;
  productoNombre: string;
  cantidad: number;
  sucursalOrigen: string;
  sucursalDestino: string;
  fecha: string;
  leida?: boolean;
}

interface NotificationContextType {
  solicitudes: SolicitudDescuento[];
  notificacionesTransferencia: NotificacionTransferencia[];
  solicitarDescuento: (solicitud: Omit<SolicitudDescuento, 'id' | 'estado' | 'fecha'>) => SolicitudDescuento;
  responderSolicitud: (id: string, nuevoEstado: 'APROBADA' | 'RECHAZADA', respondidoPor: string) => void;
  notificarTransferencia: (trf: Omit<NotificacionTransferencia, 'id' | 'fecha' | 'leida'>) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { tenant } = useTenant();
  const currentTenantId = tenant?.id || 'tenant-demo-1';
  const storageKey = `ferre_solicitudes_descuento_${currentTenantId}`;
  const transferStorageKey = `ferre_notificaciones_transferencia_${currentTenantId}`;

  const [loadedTenantId, setLoadedTenantId] = useState<string>(currentTenantId);

  const loadSolicitudes = (tId: string): SolicitudDescuento[] => {
    // Usar datos antiguos únicamente cuando todavía no exista la lista del tenant.
    try {
      const saved = localStorage.getItem(`ferre_solicitudes_descuento_${tId}`);
      if (saved !== null) return parseStoredArray<SolicitudDescuento>(saved);
      if (tId === 'tenant-demo-1' || tId === 't-1') {
        return readStoredArray<SolicitudDescuento>('ferre_solicitudes_descuento');
      }
    } catch {
      // Una caché inválida no debe impedir abrir la pantalla de ingreso.
    }
    return [];
  };

  const loadNotificacionesTransferencia = (tId: string): NotificacionTransferencia[] => {
    return readStoredArray<NotificacionTransferencia>(`ferre_notificaciones_transferencia_${tId}`);
  };

  const [solicitudes, setSolicitudes] = useState<SolicitudDescuento[]>(() =>
    loadSolicitudes(currentTenantId),
  );

  const [notificacionesTransferencia, setNotificacionesTransferencia] = useState<NotificacionTransferencia[]>(() =>
    loadNotificacionesTransferencia(currentTenantId),
  );

  useEffect(() => {
    if (loadedTenantId !== currentTenantId) {
      setSolicitudes(loadSolicitudes(currentTenantId));
      setNotificacionesTransferencia(loadNotificacionesTransferencia(currentTenantId));
      setLoadedTenantId(currentTenantId);
    }
  }, [currentTenantId, loadedTenantId]);

  useEffect(() => {
    if (loadedTenantId === currentTenantId) {
      localStorage.setItem(storageKey, JSON.stringify(solicitudes));
    }
  }, [solicitudes, currentTenantId, loadedTenantId, storageKey]);

  useEffect(() => {
    if (loadedTenantId === currentTenantId) {
      localStorage.setItem(transferStorageKey, JSON.stringify(notificacionesTransferencia));
    }
  }, [notificacionesTransferencia, currentTenantId, loadedTenantId, transferStorageKey]);

  // Escuchar cambios de localStorage en otras pestañas
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === storageKey) {
        setSolicitudes(parseStoredArray<SolicitudDescuento>(e.newValue));
      } else if (e.key === transferStorageKey) {
        setNotificacionesTransferencia(parseStoredArray<NotificacionTransferencia>(e.newValue));
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [storageKey, transferStorageKey]);

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

  const notificarTransferencia = (
    trfData: Omit<NotificacionTransferencia, 'id' | 'fecha' | 'leida'>,
  ) => {
    const nueva: NotificacionTransferencia = {
      ...trfData,
      id: `trf-notif-${Date.now()}`,
      fecha: new Date().toISOString(),
      leida: false,
    };

    const actualizadas = [nueva, ...notificacionesTransferencia];
    setNotificacionesTransferencia(actualizadas);
    localStorage.setItem(transferStorageKey, JSON.stringify(actualizadas));
  };

  return (
    <NotificationContext.Provider
      value={{
        solicitudes,
        notificacionesTransferencia,
        solicitarDescuento,
        responderSolicitud,
        notificarTransferencia,
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
