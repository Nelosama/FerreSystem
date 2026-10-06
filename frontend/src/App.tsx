import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { TenantProvider } from './context/TenantContext';
import { NotificationProvider } from './context/NotificationContext';
import { I18nProvider } from './context/I18nContext';
import { Sidebar } from './components/Sidebar';
import { TopNavigation } from './components/TopNavigation';
import { BottomNavigation } from './components/BottomNavigation';
import { ProtectedRoute } from './components/ProtectedRoute';

import './App.css';
import './v2-theme.css';
import { TaskFinder } from './components/TaskFinder';
import { ModuloPendiente } from './components/ModuloPendiente';

import { useTenant } from './context/TenantContext';

const AuditoriaPage=React.lazy(()=>import('./pages/AuditoriaPage').then(m=>({default:m.AuditoriaPage})));
const DevolucionesPage=React.lazy(()=>import('./pages/DevolucionesPage').then(m=>({default:m.DevolucionesPage})));
const OperacionesPage=React.lazy(()=>import('./pages/OperacionesPage').then(m=>({default:m.OperacionesPage})));

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
const UsuariosPage = React.lazy(() =>
  import('./pages/UsuariosPage').then(m => ({ default: m.UsuariosPage }))
);
const ClientesPage = React.lazy(() =>
  import('./pages/ClientesPage').then(m => ({ default: m.ClientesPage }))
);
const LoginPage = React.lazy(() =>
  import('./pages/LoginPage').then(m => ({ default: m.LoginPage }))
);

// Nuevos módulos con React.lazy
const ApartadosPage=()=> <ModuloPendiente nombre="APARTADOS"/>;
const ArqueoCajaPage = React.lazy(() =>
  import('./pages/ArqueoCajaPage').then(m => ({ default: m.ArqueoCajaPage }))
);
const OrdenesCompraPage = React.lazy(() =>
  import('./pages/OrdenesCompraPage').then(m => ({ default: m.OrdenesCompraPage }))
);
const TransferenciasPage=()=> <ModuloPendiente nombre="TRANSFERENCIAS ENTRE SUCURSALES"/>;
const GarantiasPage=()=> <ModuloPendiente nombre="GARANTÍAS"/>;
const PedidosEspecialesPage=()=> <ModuloPendiente nombre="PEDIDOS ESPECIALES" especial/>;
const ListasPrecioPage=()=> <ModuloPendiente nombre="LISTAS DE PRECIO"/>;
const ComisionesPage = React.lazy(() =>
  import('./pages/ComisionesPage').then(m => ({ default: m.ComisionesPage }))
);
const ReportesPage = React.lazy(() =>
  import('./pages/ReportesPage').then(m => ({ default: m.ReportesPage }))
);
const LevantamientoPage = React.lazy(() =>
  import('./pages/LevantamientoPage').then(m => ({ default: m.LevantamientoPage }))
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
  const [isMobile, setIsMobile] = React.useState(
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false
  );

  React.useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className={isTopNav ? "app-container-topnav" : "app-container"} style={isTopNav ? { display: 'flex', flexDirection: 'column', minHeight: '100vh' } : undefined}>
      {isTopNav ? <TopNavigation /> : <Sidebar />}
      <div
        className="main-content"
        style={{
          ...(isTopNav ? { flex: 1, width: '100%' } : {}),
          ...(isMobile ? { paddingBottom: '72px' } : {}),
        }}
      >
        <TaskFinder />
        {children}
      </div>
      <BottomNavigation />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <TenantProvider>
      <I18nProvider>
          <NotificationProvider>
            <BrowserRouter>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                <Route path="/devoluciones" element={<ProtectedRoute allowedRoles={['ADMIN','CAJERO','VENDEDOR']}><AppLayout><DevolucionesPage/></AppLayout></ProtectedRoute>}/>
                  <Route path="/auditoria" element={<ProtectedRoute allowedRoles={['ADMIN']}><AppLayout><AuditoriaPage/></AppLayout></ProtectedRoute>}/>
                  {/* Rutas públicas de login */}
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/admin/login" element={<Navigate to="/login" replace />} />

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
                    path="/clientes"
                    element={
                      <ProtectedRoute allowedRoles={['ADMIN', 'CAJERO', 'VENDEDOR']}>
                        <AppLayout>
                          <ClientesPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/levantamiento"
                    element={
                      <ProtectedRoute allowedRoles={['ADMIN', 'BODEGUERO']} requiredModule="levantamiento">
                        <AppLayout>
                          <LevantamientoPage />
                        </AppLayout>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/reportes"
                    element={
                      <ProtectedRoute allowedRoles={['ADMIN']} requiredPermiso="reportes.ver" requiredModule="reportes">
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
                      <ProtectedRoute allowedRoles={['ADMIN', 'CAJERO', 'VENDEDOR']}>
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

                  <Route path="/cuentas" element={<ProtectedRoute allowedRoles={['ADMIN','CAJERO']}><AppLayout><OperacionesPage modo="cuentas"/></AppLayout></ProtectedRoute>}/>
                  <Route path="/entregas" element={<ProtectedRoute allowedRoles={['ADMIN','CAJERO','BODEGUERO']}><AppLayout><OperacionesPage modo="entregas"/></AppLayout></ProtectedRoute>}/>
                  {/* Fallback */}
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </NotificationProvider>
      </I18nProvider>
    </TenantProvider>
  );
};

export default App;

