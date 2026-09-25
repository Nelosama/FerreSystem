import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { TenantProvider } from './context/TenantContext';
import { Sidebar } from './components/Sidebar';
import { ProtectedRoute } from './components/ProtectedRoute';
import { DashboardPage } from './pages/DashboardPage';
import { InventarioPage } from './pages/InventarioPage';
import { POSPage } from './pages/POSPage';
import { CotizacionesPage } from './pages/CotizacionesPage';
import { ConfiguracionPage } from './pages/ConfiguracionPage';
import { SuperAdminPage } from './pages/SuperAdminPage';
import { LoginPage } from './pages/LoginPage';
import './App.css';

// Layout principal que incluye el Sidebar institucional
const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="app-container">
      <Sidebar />
      <div className="main-content">{children}</div>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <TenantProvider>
      <BrowserRouter>
        <Routes>
          {/* Ruta pública de login */}
          <Route path="/login" element={<LoginPage />} />

          {/* Rutas con Sidebar institucional y autenticación protegida */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <DashboardPage />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/inventario"
            element={
              <ProtectedRoute allowedRoles={['ADMIN', 'BODEGUERO']}>
                <AppLayout>
                  <InventarioPage />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/pos"
            element={
              <ProtectedRoute allowedRoles={['ADMIN', 'CAJERO', 'VENDEDOR']}>
                <AppLayout>
                  <POSPage />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/cotizaciones"
            element={
              <ProtectedRoute allowedRoles={['ADMIN', 'VENDEDOR', 'CAJERO']}>
                <AppLayout>
                  <CotizacionesPage />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/configuracion"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <AppLayout>
                  <ConfiguracionPage />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['SUPERADMIN', 'ADMIN']}>
                <AppLayout>
                  <SuperAdminPage />
                </AppLayout>
              </ProtectedRoute>
            }
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </TenantProvider>
  );
};

export default App;
