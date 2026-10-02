import React from 'react';
import { Navigate } from 'react-router-dom';
import { useTenant } from '../context/TenantContext';
import { Lock } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
  requiredPermiso?: string;
  requiredModule?: string;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  allowedRoles,
  requiredPermiso,
  requiredModule,
}) => {
  const { user, tenant, isAuthenticated } = useTenant();

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  // Verificar rol
  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.rol)) {
    return (
      <div style={styles.deniedContainer}>
        <Lock size={48} color="#DC2626" />
        <h2 style={styles.title}>Acceso Denegado</h2>
        <p style={styles.message}>No tienes permisos suficientes para acceder a esta vista.</p>
      </div>
    );
  }

  // Verificar permiso específico
  if (requiredPermiso && user.permisos && !user.permisos.includes(requiredPermiso)) {
    return (
      <div style={styles.deniedContainer}>
        <Lock size={48} color="#DC2626" />
        <h2 style={styles.title}>Permiso Insuficiente</h2>
        <p style={styles.message}>Su usuario no tiene el permiso necesario ({requiredPermiso}).</p>
      </div>
    );
  }

  // Verificar si el módulo está habilitado para el Tenant
  if (requiredModule) {
    const defaultModules = [
      'inventario',
    'levantamiento',
      'pos',
      'cotizaciones',
      'usuarios',
      'configuracion',
      'apartados',
      'arqueo_caja',
      'ordenes_compra',
      'transferencias_sucursal',
      'garantias',
      'pedidos_especiales',
      'listas_precio',
      'comisiones_venta',
      'reportes',
    ];

    const activeModules = tenant.modulosHabilitados || defaultModules;

    if (!activeModules.includes(requiredModule)) {
      return (
        <div style={styles.deniedContainer}>
          <Lock size={48} color="#EA580C" />
          <h2 style={styles.title}>Módulo No Contratado / Deshabilitado</h2>
          <p style={styles.message}>
            El módulo requerido (<strong>{requiredModule}</strong>) no está habilitado para la empresa{' '}
            <strong>{tenant.nombreComercial}</strong>. Contacte al administrador del sistema.
          </p>
        </div>
      );
    }
  }

  return <>{children}</>;
};

const styles: Record<string, React.CSSProperties> = {
  deniedContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 20px',
    textAlign: 'center',
    minHeight: '60vh',
    gap: '12px',
  },
  title: {
    fontFamily: 'var(--font-display, sans-serif)',
    fontSize: '22px',
    fontWeight: 900,
    textTransform: 'uppercase',
    color: 'var(--color-text-main, #1C1917)',
    margin: 0,
  },
  message: {
    fontFamily: 'var(--font-body, sans-serif)',
    fontSize: '14px',
    color: 'var(--color-text-muted)',
    maxWidth: '500px',
    margin: 0,
  },
};
