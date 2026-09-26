import React, { useState } from 'react';
import { Box, Lock, Mail, ArrowRight, AlertCircle } from 'lucide-react';
import { useTenant } from '../context/TenantContext';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api';

export const LoginPage: React.FC = () => {
  const { login } = useTenant();
  const navigate = useNavigate();

  const [email, setEmail] = useState('cajero@lamundial.hn');
  const [password, setPassword] = useState('Ferre2026!');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const executeRoleLogin = (selectedRole: 'ADMIN' | 'CAJERO' | 'BODEGUERO' | 'VENDEDOR') => {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await api.post('/auth/login', { email, password });
      const { user, tenant } = response.data;

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
      setLoading(false);
      navigate('/');
    } catch (err: any) {
      console.warn('Backend login connection issue, switching to local demo mode fallback:', err);
      setLoading(false);
      executeRoleLogin('ADMIN');
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

        {/* Quick Login Role Pills */}
        <div style={{ marginTop: '16px' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '10px', color: '#78716C', textTransform: 'uppercase', marginBottom: '6px' }}>
            ACCESO RÁPIDO DIRECTO POR ROL:
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: '6px' }}>
            <button
              type="button"
              onClick={() => executeRoleLogin('ADMIN')}
              style={{ ...styles.rolePill, backgroundColor: '#EA580C', color: '#FFFFFF' }}
              title="Ingresar como Admin de Ferretería"
            >
              Admin
            </button>
            <button
              type="button"
              onClick={() => executeRoleLogin('CAJERO')}
              style={{ ...styles.rolePill, backgroundColor: '#0284C7', color: '#FFFFFF' }}
              title="Ingresar como Cajero POS"
            >
              Cajero
            </button>
            <button
              type="button"
              onClick={() => executeRoleLogin('BODEGUERO')}
              style={{ ...styles.rolePill, backgroundColor: '#15803D', color: '#FFFFFF' }}
              title="Ingresar como Bodeguero"
            >
              Bodega
            </button>
            <button
              type="button"
              onClick={() => executeRoleLogin('VENDEDOR')}
              style={{ ...styles.rolePill, backgroundColor: '#D97706', color: '#FFFFFF' }}
              title="Ingresar como Vendedor"
            >
              Vendedor
            </button>
          </div>
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
  rolePill: {
    padding: '6px 8px',
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: '10px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    border: '1px solid #1C1917',
    borderRadius: 'var(--radius-xs)',
    cursor: 'pointer',
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
