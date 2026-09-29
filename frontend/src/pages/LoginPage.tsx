import React, { useState } from 'react';
import { Box, Lock, Mail, ArrowRight, AlertCircle } from 'lucide-react';
import { useTenant } from '../context/TenantContext';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api';

const roleProfiles = {
  ADMIN: {
    id: 'usr-admin-1',
    nombre: 'Carlos Ramos (Administrador General)',
    email: 'admin@lamundial.hn',
    rol: 'ADMIN' as const,
    permisos: [
      'pos.vender',
      'pos.anular_venta',
      'pos.aplicar_descuento',
      'inventario.ver',
      'inventario.editar',
      'cotizaciones.crear',
      'cotizaciones.aprobar',
      'cotizaciones.convertir_venta',
      'reportes.ver',
      'usuarios.gestionar',
      'configuracion.editar',
    ],
  },
  CAJERO: {
    id: 'usr-cajero-1',
    nombre: 'Carlos Ramos (Cajero Principal)',
    email: 'cajero@lamundial.hn',
    rol: 'CAJERO' as const,
    permisos: ['pos.vender', 'cotizaciones.crear'],
  },
  BODEGUERO: {
    id: 'usr-bodega-1',
    nombre: 'Jorge Mendoza (Bodeguero)',
    email: 'bodega@lamundial.hn',
    rol: 'BODEGUERO' as const,
    permisos: ['inventario.ver', 'inventario.editar'],
  },
  VENDEDOR: {
    id: 'usr-vendedor-1',
    nombre: 'Ana Martínez (Vendedora)',
    email: 'vendedor@lamundial.hn',
    rol: 'VENDEDOR' as const,
    permisos: ['pos.vender', 'cotizaciones.crear'],
  },
};

export const LoginPage: React.FC = () => {
  const { login } = useTenant();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const executeRoleLogin = (selectedRole: 'ADMIN' | 'CAJERO' | 'BODEGUERO' | 'VENDEDOR') => {
    const prof = roleProfiles[selectedRole];
    login(
      {
        id: prof.id,
        nombre: prof.nombre,
        email: prof.email,
        rol: prof.rol,
        permisos: prof.permisos,
        descuentoMaximo: selectedRole === 'ADMIN' ? 100 : 15,
        activo: true,
      },
      {
        id: 'tenant-demo-1',
        nombreComercial: 'LA MUNDIAL - SUCURSAL CENTRO',
        sucursal: 'Sucursal Centro',
        colorPrimario: '#EA580C',
      },
    );
    navigate('/');
  };

  const handleDemoLogin = (emailInput: string, passwordInput: string): boolean => {
    const cleanEmail = emailInput.trim().toLowerCase();

    const matchedKey = (Object.keys(roleProfiles) as Array<keyof typeof roleProfiles>).find(
      (key) => roleProfiles[key].email.toLowerCase() === cleanEmail
    );

    if (matchedKey) {
      if (passwordInput !== 'Ferre2026!') {
        setError('Correo o contraseña incorrectos');
        return false;
      }
      executeRoleLogin(matchedKey);
      return true;
    }

    try {
      const savedAdminsRaw = localStorage.getItem('ferre_saas_admins');
      const savedTenantsRaw = localStorage.getItem('ferre_saas_tenants');

      if (savedAdminsRaw && savedTenantsRaw) {
        const savedAdmins = JSON.parse(savedAdminsRaw);
        const savedTenants = JSON.parse(savedTenantsRaw);

        const matchedAdmin = savedAdmins.find(
          (a: any) => a.email && a.email.trim().toLowerCase() === cleanEmail
        );

        if (matchedAdmin) {
          if (matchedAdmin.activo === false) {
            setError('El usuario se encuentra inactivo / suspendido');
            return false;
          }

          const expectedPass = matchedAdmin.password || 'Ferre2026!';
          if (passwordInput !== expectedPass) {
            setError('Correo o contraseña incorrectos');
            return false;
          }

          const matchedTenant = savedTenants.find((t: any) => t.id === matchedAdmin.tenantId);

          if (matchedTenant) {
            if (matchedTenant.estado === 'SUSPENDIDO') {
              setError('La cuenta del tenant se encuentra suspendida');
              return false;
            }

            login(
              {
                id: matchedAdmin.id || `usr-admin-${Date.now()}`,
                nombre: matchedAdmin.nombre || 'Administrador',
                email: matchedAdmin.email,
                rol: 'ADMIN',
                permisos: [
                  'pos.vender',
                  'pos.anular_venta',
                  'pos.aplicar_descuento',
                  'inventario.ver',
                  'inventario.editar',
                  'cotizaciones.crear',
                  'cotizaciones.aprobar',
                  'cotizaciones.convertir_venta',
                  'reportes.ver',
                  'usuarios.gestionar',
                  'configuracion.editar',
                ],
                descuentoMaximo: 100,
                activo: true,
              },
              {
                id: matchedTenant.id,
                nombreComercial: matchedTenant.nombreComercial,
                sucursal: 'Sucursal Principal',
                colorPrimario: matchedTenant.colorPrimario || '#EA580C',
                logoUrl: matchedTenant.logoUrl || null,
                modoNavegacion: matchedTenant.modoNavegacion || 'SIDEBAR',
                rubro: matchedTenant.rubro,
                modulosHabilitados: matchedTenant.modulosHabilitados,
              }
            );
            navigate('/');
            return true;
          }
        }
      }
    } catch (e) {
      console.error('Error reading saas admins/tenants from localStorage:', e);
    }

    setError('Correo o contraseña incorrectos');
    return false;
  };

  const executeSuperAdminLogin = (superAdmin: { id: string; nombre: string; email: string }) => {
    login(
      {
        id: superAdmin.id,
        nombre: superAdmin.nombre,
        email: superAdmin.email,
        rol: 'SUPERADMIN',
        permisos: ['usuarios.gestionar', 'configuracion.editar'],
        descuentoMaximo: 100,
        activo: true,
      },
      {
        id: 'saas-global',
        nombreComercial: 'FerreSystem Admin Portal',
        sucursal: 'Global',
        colorPrimario: '#1C1917',
      },
    );
    navigate('/admin');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await api.post('/auth/login', { email, password });
      const { accessToken, user, tenant } = response.data;

      if (accessToken) {
        localStorage.setItem('ferre_token', accessToken);
      }

      login(
        {
          id: user.id,
          nombre: user.nombre,
          email: user.email,
          rol: user.rol,
        },
        {
          id: tenant.id,
          nombreComercial: tenant.nombreComercial,
          sucursal: 'Sucursal Principal',
          colorPrimario: tenant.colorPrimario || '#EA580C',
        },
      );
      navigate('/');
    } catch (err: any) {
      // If backend responded with an HTTP status (e.g. 401 Unauthorized, 400, 403), show error directly without falling back to demo mode
      if (err.response) {
        const message = err.response.data?.message;
        setError(Array.isArray(message) ? message.join(', ') : message || 'Correo o contraseña incorrectos');
      } else {
        // Only if network/connection failed completely (no response), attempt superadmin login or local demo fallback
        try {
          const superResponse = await api.post('/admin/auth/login', { email, password });
          if (superResponse.data?.accessToken) {
            localStorage.setItem('ferre_token', superResponse.data.accessToken);
          }
          executeSuperAdminLogin(superResponse.data.superAdmin || superResponse.data.admin);
        } catch (superErr: any) {
          if (!superErr.response) {
            console.warn('Backend login connection issue, switching to local demo mode fallback:', superErr);
            handleDemoLogin(email, password);
          } else {
            const message = superErr.response.data?.message;
            setError(Array.isArray(message) ? message.join(', ') : message || 'Correo o contraseña incorrectos');
          }
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div className="industrial-card" style={styles.loginCard}>
        {/* Brand Header */}
        <div style={styles.logoSection}>
          <div style={styles.logoIcon}>
            <Box size={38} strokeWidth={2.6} color="var(--color-primary)" />
          </div>
          <div style={styles.brandTitle}>
            <span style={{ color: '#1C1917' }}>Ferre</span>
            <span style={{ color: 'var(--color-primary)' }}>System</span>
          </div>
          <div style={styles.subtitle}>SISTEMA DE GESTIÓN PARA FERRETERÍAS</div>
        </div>

        {error && (
          <div
            style={{
              marginTop: '16px',
              padding: '10px 14px',
              backgroundColor: '#FEE2E2',
              border: '1px solid #EF4444',
              borderRadius: '4px',
              color: '#991B1B',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontWeight: 600,
            }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ marginTop: '20px' }}>
          <div className="form-group">
            <label className="form-label">CORREO ELECTRÓNICO</label>
            <div style={styles.inputWrapper}>
              <Mail size={16} strokeWidth={2.4} style={styles.inputIcon} />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="correo@empresa.com"
                className="form-input"
                style={{ paddingLeft: '36px' }}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">CONTRASEÑA</label>
            <div style={styles.inputWrapper}>
              <Lock size={16} strokeWidth={2.4} style={styles.inputIcon} />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="form-input"
                style={{ paddingLeft: '36px' }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '16px', padding: '14px', opacity: loading ? 0.7 : 1 }}
          >
            <span>{loading ? 'VERIFICANDO...' : 'INGRESAR AL SISTEMA'}</span>
            {!loading && <ArrowRight size={18} strokeWidth={2.5} />}
          </button>
        </form>

        <div style={styles.footerNote}>
          Honduras • SAR Compliance ISV 15% • Multi-Tenant
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E7E5E4',
    padding: '20px',
  },
  loginCard: {
    width: '100%',
    maxWidth: '440px',
    backgroundColor: '#FFFFFF',
    padding: '36px 32px',
  },
  logoSection: {
    textAlign: 'center',
  },
  logoIcon: {
    display: 'inline-flex',
    padding: '10px',
    backgroundColor: '#FAFAF9',
    border: '2px solid #1C1917',
    borderRadius: '4px',
    marginBottom: '10px',
  },
  brandTitle: {
    fontFamily: 'var(--font-display)',
    fontWeight: 900,
    fontSize: '32px',
    letterSpacing: '-0.02em',
  },
  subtitle: {
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: '10px',
    letterSpacing: '0.06em',
    color: '#78716C',
    marginTop: '4px',
  },
  inputWrapper: {
    position: 'relative',
  },
  inputIcon: {
    position: 'absolute',
    left: '11px',
    top: '50%',
    transform: 'translateY(-50%)',
    color: '#78716C',
  },
  footerNote: {
    textAlign: 'center',
    fontSize: '11px',
    color: '#A8A29E',
    marginTop: '24px',
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
  },
};
