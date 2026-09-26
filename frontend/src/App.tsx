import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { TenantProvider } from './context/TenantContext';
import { MockDataProvider } from './context/MockDataContext';
import { NotificationProvider } from './context/NotificationContext';
import { I18nProvider } from './context/I18nContext';
import { Sidebar } from './components/Sidebar';
import { ProtectedRoute } from './components/ProtectedRoute';
import { DashboardPage } from './pages/DashboardPage';
import { InventarioPage } from './pages/InventarioPage';
import { POSPage } from './pages/POSPage';
import { CotizacionesPage } from './pages/CotizacionesPage';
import { ConfiguracionPage } from './pages/ConfiguracionPage';
import { SuperAdminPage } from './pages/SuperAdminPage';
import { SuperAdminLoginPage } from './pages/SuperAdminLoginPage';
import { UsuariosPage } from './pages/UsuariosPage';
import { LoginPage } from './pages/LoginPage';

// Nuevos módulos
import { ApartadosPage } from './pages/ApartadosPage';
import { ArqueoCajaPage } from './pages/ArqueoCajaPage';
import { OrdenesCompraPage } from './pages/OrdenesCompraPage';
import { TransferenciasPage } from './pages/TransferenciasPage';
import { GarantiasPage } from './pages/GarantiasPage';
import { PedidosEspecialesPage } from './pages/PedidosEspecialesPage';
import { ListasPrecioPage } from './pages/ListasPrecioPage';
import { ComisionesPage } from './pages/ComisionesPage';

import './App.css';

import { useTenant } from './context/TenantContext';

// Componente para manejar redirección raíz según rol
const HomeRoute: React.FC = () => {
  const { user } = useTenant();
  if (user?.rol === 'SUPERADMIN') {
    return <Navigate to="/admin" replace />;
  }
  return <DashboardPage />;
};

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
      <I18nProvider>
        <MockDataProvider>
          <NotificationProvider>
            <BrowserRouter>
              <Routes>
                {/* Rutas públicas de login */}
                <Route path="/login" element={<LoginPage />} />
                <Route path="/admin/login" element={<SuperAdminLoginPage />} />

                {/* Rutas con Sidebar institucional y autenticación protegida */}
                <Route
                  path="/"
                  element={
                    <ProtectedRoute>
                      <AppLayout>
                        <HomeRoute />
                      </AppLayout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/usuarios"
                  element={
                    <ProtectedRoute allowedRoles={['ADMIN']}>
                      <AppLayout>
                        <UsuariosPage />
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

                {/* Nuevos módulos */}
                <Route
                  path="/apartados"
                  element={
                    <ProtectedRoute allowedRoles={['ADMIN', 'CAJERO', 'VENDEDOR']}>
                      <AppLayout>
                        <ApartadosPage />
                      </AppLayout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/arqueo-caja"
                  element={
                    <ProtectedRoute allowedRoles={['ADMIN', 'CAJERO']}>
                      <AppLayout>
                        <ArqueoCajaPage />
                      </AppLayout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/ordenes-compra"
                  element={
                    <ProtectedRoute allowedRoles={['ADMIN', 'BODEGUERO']}>
                      <AppLayout>
                        <OrdenesCompraPage />
                      </AppLayout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/transferencias"
                  element={
                    <ProtectedRoute allowedRoles={['ADMIN', 'BODEGUERO']}>
                      <AppLayout>
                        <TransferenciasPage />
                      </AppLayout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/garantias"
                  element={
                    <ProtectedRoute allowedRoles={['ADMIN', 'CAJERO', 'VENDEDOR']}>
                      <AppLayout>
                        <GarantiasPage />
                      </AppLayout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/pedidos-especiales"
                  element={
                    <ProtectedRoute allowedRoles={['ADMIN', 'VENDEDOR', 'CAJERO']}>
                      <AppLayout>
                        <PedidosEspecialesPage />
                      </AppLayout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/listas-precio"
                  element={
                    <ProtectedRoute allowedRoles={['ADMIN', 'VENDEDOR']}>
                      <AppLayout>
                        <ListasPrecioPage />
                      </AppLayout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/comisiones"
                  element={
                    <ProtectedRoute allowedRoles={['ADMIN']}>
                      <AppLayout>
                        <ComisionesPage />
                      </AppLayout>
                    </ProtectedRoute>
                  }
                />

                <Route
                  path="/configuracion"
                  element={
                    <ProtectedRoute allowedRoles={['SUPERADMIN']}>
                      <AppLayout>
                        <ConfiguracionPage />
                      </AppLayout>
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/admin"
                  element={
                    <ProtectedRoute allowedRoles={['SUPERADMIN']}>
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
          </NotificationProvider>
        </MockDataProvider>
      </I18nProvider>
    </TenantProvider>
  );
};

export default App;
