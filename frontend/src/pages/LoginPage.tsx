import React, { useState } from 'react';
import { Box, Lock, Mail, ArrowRight, AlertCircle } from 'lucide-react';
import { useTenant } from '../context/TenantContext';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api';

export const LoginPage: React.FC = () => {
  const { login } = useTenant();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await api.post('/auth/login', { email, password });
      const { type, accessToken, user, tenant, superAdmin } = response.data;

      if (typeof accessToken !== 'string' || !accessToken) {
        setError('El servidor no devolvió una sesión válida.');
        return;
      }

      if (type === 'super_admin' && superAdmin?.id) {
        localStorage.setItem('ferre_token', accessToken);
        login(
          {
            id: superAdmin.id,
            nombre: superAdmin.nombre,
            email: superAdmin.email,
            rol: 'SUPERADMIN',
          },
          {
            id: 'saas-global',
            nombreComercial: 'FerreSystem Admin Portal',
            sucursal: 'Global',
            colorPrimario: '#1C1917',
          },
        );
        navigate('/admin');
      } else if (type === 'tenant' && user?.id && tenant?.id) {
        localStorage.setItem('ferre_token', accessToken);
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
      } else {
        localStorage.removeItem('ferre_token');
        setError('El servidor devolvió un tipo de sesión desconocido.');
      }
    } catch (err: any) {
      if (err.response) {
        const message = err.response.data?.message;
        setError(
          Array.isArray(message)
            ? message.join(', ')
            : message || 'Correo o contraseña incorrectos'
        );
      } else {
        setError('No se pudo conectar con el servidor. Verifique que el backend en Render esté disponible.');
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
