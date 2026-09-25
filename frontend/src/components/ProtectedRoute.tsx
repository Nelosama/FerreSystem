import React from 'react';
import { Navigate } from 'react-router-dom';
import { useTenant } from '../context/TenantContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { user, isAuthenticated } = useTenant();

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.rol)) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>Acceso Denegado</h2>
        <p>No tienes permisos suficientes para acceder a esta vista.</p>
      </div>
    );
  }

  return <>{children}</>;
};
