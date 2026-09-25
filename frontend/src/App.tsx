import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { TenantProvider } from './context/TenantContext';
import { Sidebar } from './components/Sidebar';
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

          {/* Rutas con Sidebar institucional */}
          <Route
            path="/"
            element={
              <AppLayout>
                <DashboardPage />
              </AppLayout>
            }
          />
          <Route
            path="/inventario"
            element={
              <AppLayout>
                <InventarioPage />
              </AppLayout>
            }
          />
          <Route
            path="/pos"
            element={
              <AppLayout>
                <POSPage />
              </AppLayout>
            }
          />
          <Route
            path="/cotizaciones"
            element={
              <AppLayout>
                <CotizacionesPage />
              </AppLayout>
            }
          />
          <Route
            path="/configuracion"
            element={
              <AppLayout>
                <ConfiguracionPage />
              </AppLayout>
            }
          />
          <Route
            path="/admin"
            element={
              <AppLayout>
                <SuperAdminPage />
              </AppLayout>
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
