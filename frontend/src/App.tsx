import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { TenantProvider } from './context/TenantContext';
import { MockDataProvider } from './context/MockDataContext';
import { NotificationProvider } from './context/NotificationContext';
import { I18nProvider } from './context/I18nContext';
import { Sidebar } from './components/Sidebar';
import { TopNavigation } from './components/TopNavigation';
import { ProtectedRoute } from './components/ProtectedRoute';

import './App.css';

import { useTenant } from './context/TenantContext';

// Dynamic page imports with React.lazy
const DashboardPage = React.lazy(() =>
  import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage }))
);
const InventarioPage = React.lazy(() =>
  import('./pages/InventarioPage').then(m => ({ default: m.InventarioPage }))
);
const POSPage = React.lazy(() =>
  import('./pages/POSPage').then(m => ({ default: m.POSPage }))
);
const CotizacionesPage = React.lazy(() =>
  import('./pages/CotizacionesPage').then(m => ({ default: m.CotizacionesPage }))
);
const ConfiguracionPage = React.lazy(() =>
  import('./pages/ConfiguracionPage').then(m => ({ default: m.ConfiguracionPage }))
);
const SuperAdminPage = React.lazy(() =>
  import('./pages/SuperAdminPage').then(m => ({ default: m.SuperAdminPage }))
);
const SuperAdminLoginPage = React.lazy(() =>
  import('./pages/SuperAdminLoginPage').then(m => ({ default: m.SuperAdminLoginPage }))
);
const UsuariosPage = React.lazy(() =>
  import('./pages/UsuariosPage').then(m => ({ default: m.UsuariosPage }))
);
const LoginPage = React.lazy(() =>
  import('./pages/LoginPage').then(m => ({ default: m.LoginPage }))
);

// Nuevos módulos con React.lazy
const ApartadosPage = React.lazy(() =>
  import('./pages/ApartadosPage').then(m => ({ default: m.ApartadosPage }))
);
const ArqueoCajaPage = React.lazy(() =>
  import('./pages/ArqueoCajaPage').then(m => ({ default: m.ArqueoCajaPage }))
);
const OrdenesCompraPage = React.lazy(() =>
  import('./pages/OrdenesCompraPage').then(m => ({ default: m.OrdenesCompraPage }))
);
const TransferenciasPage = React.lazy(() =>
  import('./pages/TransferenciasPage').then(m => ({ default: m.TransferenciasPage }))
);
const GarantiasPage = React.lazy(() =>
  import('./pages/GarantiasPage').then(m => ({ default: m.GarantiasPage }))
);
const PedidosEspecialesPage = React.lazy(() =>
  import('./pages/PedidosEspecialesPage').then(m => ({ default: m.PedidosEspecialesPage }))
);
const ListasPrecioPage = React.lazy(() =>
  import('./pages/ListasPrecioPage').then(m => ({ default: m.ListasPrecioPage }))
);
const ComisionesPage = React.lazy(() =>
  import('./pages/ComisionesPage').then(m => ({ default: m.ComisionesPage }))
);
const ReportesPage = React.lazy(() =>
  import('./pages/ReportesPage').then(m => ({ default: m.ReportesPage }))
);

// Componente de carga para Suspense acorde al estilo industrial
const PageLoader: React.FC = () => (
  <div style={{
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '60vh',
    gap: '12px',
    color: 'var(--color-text-muted, #78716C)',
    fontFamily: 'var(--font-display, sans-serif)',
    fontWeight: 700,
    fontSize: '13px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  }}>
    <Loader2 size={32} className="animate-spin" style={{ color: 'var(--color-primary, #EA580C)', animation: 'spin 1s linear infinite' }} />
    <span>Cargando módulo...</span>
  </div>
);

// Componente para manejar redirección raíz según rol
const HomeRoute: React.FC = () => {
  const { user } = useTenant();
  if (user?.rol === 'SUPERADMIN') {
    return <Navigate to="/admin" replace />;
  }
  return <DashboardPage />;
};

// Layout principal que admite modo Sidebar lateral o modo TopNav horizontal
const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { tenant } = useTenant();
  const isTopNav = tenant.modoNavegacion === 'TOPNAV';

  return (
    <div className={isTopNav ? "app-container-topnav" : "app-container"} style={isTopNav ? { display: 'flex', flexDirection: 'column', minHeight: '100vh' } : undefined}>
      {isTopNav ? <TopNavigation /> : <Sidebar />}
      <div className="main-content" style={isTopNav ? { flex: 1, width: '100%' } : undefined}>
        {children}
      </div>
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
              <Suspense fallback={<PageLoader />}>
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
                    path="/reportes"
                    element={
                      <ProtectedRoute allowedRoles={['ADMIN', 'CAJERO', 'VENDEDOR']} requiredPermiso="reportes.ver" requiredModule="reportes">
                        <AppLayout>
                          <ReportesPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/usuarios"
                    element={
                      <ProtectedRoute allowedRoles={['ADMIN']} requiredModule="usuarios">
                        <AppLayout>
                          <UsuariosPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/inventario"
                    element={
                      <ProtectedRoute allowedRoles={['ADMIN', 'BODEGUERO']} requiredModule="inventario">
                        <AppLayout>
                          <InventarioPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/pos"
                    element={
                      <ProtectedRoute allowedRoles={['ADMIN', 'CAJERO', 'VENDEDOR']} requiredModule="pos">
                        <AppLayout>
                          <POSPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/cotizaciones"
                    element={
                      <ProtectedRoute allowedRoles={['ADMIN', 'VENDEDOR', 'CAJERO']} requiredModule="cotizaciones">
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
                      <ProtectedRoute allowedRoles={['ADMIN', 'CAJERO', 'VENDEDOR']} requiredModule="apartados">
                        <AppLayout>
                          <ApartadosPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/arqueo-caja"
                    element={
                      <ProtectedRoute allowedRoles={['ADMIN', 'CAJERO']} requiredModule="arqueo_caja">
                        <AppLayout>
                          <ArqueoCajaPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/ordenes-compra"
                    element={
                      <ProtectedRoute allowedRoles={['ADMIN', 'BODEGUERO']} requiredModule="ordenes_compra">
                        <AppLayout>
                          <OrdenesCompraPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/transferencias"
                    element={
                      <ProtectedRoute allowedRoles={['ADMIN', 'BODEGUERO']} requiredModule="transferencias_sucursal">
                        <AppLayout>
                          <TransferenciasPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/garantias"
                    element={
                      <ProtectedRoute allowedRoles={['ADMIN', 'CAJERO', 'VENDEDOR']} requiredModule="garantias">
                        <AppLayout>
                          <GarantiasPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/pedidos-especiales"
                    element={
                      <ProtectedRoute allowedRoles={['ADMIN', 'VENDEDOR', 'CAJERO']} requiredModule="pedidos_especiales">
                        <AppLayout>
                          <PedidosEspecialesPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/listas-precio"
                    element={
                      <ProtectedRoute allowedRoles={['ADMIN', 'VENDEDOR']} requiredModule="listas_precio">
                        <AppLayout>
                          <ListasPrecioPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/comisiones"
                    element={
                      <ProtectedRoute allowedRoles={['ADMIN']} requiredModule="comisiones_venta">
                        <AppLayout>
                          <ComisionesPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />

                  <Route
                    path="/configuracion"
                    element={
                      <ProtectedRoute allowedRoles={['SUPERADMIN', 'ADMIN']} requiredModule="configuracion">
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
              </Suspense>
            </BrowserRouter>
          </NotificationProvider>
        </MockDataProvider>
      </I18nProvider>
    </TenantProvider>
  );
};

export default App;
