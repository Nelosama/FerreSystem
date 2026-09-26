import React, { useState } from 'react';
import { ShieldCheck, Lock, Mail, ArrowRight, AlertCircle } from 'lucide-react';
import { useTenant } from '../context/TenantContext';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api';

export const SuperAdminLoginPage: React.FC = () => {
  const { login } = useTenant();
  const navigate = useNavigate();

  const [email, setEmail] = useState('admin@ferresystem.hn');
  const [password, setPassword] = useState('FerreSuperAdmin2026!');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const executeSuperAdminDemo = () => {
    login(
      {
        id: 'superadmin-demo',
        nombre: 'Ing. Nelo — SaaS Owner',
        email: 'admin@ferresystem.hn',
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
      const response = await api.post('/admin/auth/login', { email, password });
      login(
        {
          id: response.data.admin?.id || 'superadmin-1',
          nombre: response.data.admin?.nombre || 'Super Admin',
          email,
          rol: 'SUPERADMIN',
        },
        {
          id: 'saas-global',
          nombreComercial: 'FerreSystem Admin Portal',
          sucursal: 'Global',
          colorPrimario: '#1C1917',
        },
      );
      setLoading(false);
      navigate('/admin');
    } catch (err: any) {
      console.warn('Backend connection issue, falling back to SuperAdmin local demo mode:', err);
      setLoading(false);
      executeSuperAdminDemo();
    }
  };

  return (
    <div style={styles.container}>
      <div className="industrial-card" style={styles.loginCard}>
        <div style={styles.logoSection}>
          <div style={styles.logoIcon}>
            <ShieldCheck size={42} strokeWidth={2.5} color="#EA580C" />
          </div>
          <div style={styles.brandTitle}>
            <span style={{ color: '#FAFAF9' }}>FerreSystem</span>
            <span style={{ color: '#EA580C', fontSize: '14px', display: 'block', fontWeight: 800 }}>
              PORTAL EXCLUSIVO PROVEEDOR SAAS
            </span>
          </div>
        </div>

        {error && (
          <div style={styles.errorBanner}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ marginTop: '24px' }}>
          <div className="form-group">
            <label className="form-label" style={{ color: '#A8A29E' }}>
              CORREO ADMINISTRADOR SAAS
            </label>
            <div style={styles.inputWrapper}>
              <Mail size={16} style={styles.inputIcon} />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="form-input"
                style={styles.darkInput}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" style={{ color: '#A8A29E' }}>
              CONTRASEÑA MAESTRA
            </label>
            <div style={styles.inputWrapper}>
              <Lock size={16} style={styles.inputIcon} />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="form-input"
                style={styles.darkInput}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '20px', padding: '14px', backgroundColor: '#EA580C', borderColor: '#C2410C' }}
          >
            <span>{loading ? 'AUTENTICANDO...' : 'INGRESAR AL PORTAL SAAS'}</span>
            <ArrowRight size={18} />
          </button>
        </form>

        <div style={styles.demoBox}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={executeSuperAdminDemo}
            style={{ width: '100%', backgroundColor: '#292524', color: '#FAFAF9', borderColor: '#44403C' }}
          >
            ACCESO RÁPIDO SUPER ADMIN (DEMO)
          </button>
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
    backgroundColor: '#0C0A09',
    padding: '20px',
  },
  loginCard: {
    width: '100%',
    maxWidth: '420px',
    backgroundColor: '#1C1917',
    border: '2px solid #292524',
    padding: '36px 32px',
    color: '#FAFAF9',
  },
  logoSection: {
    textAlign: 'center',
  },
  logoIcon: {
    display: 'inline-flex',
    padding: '12px',
    backgroundColor: '#292524',
    border: '2px solid #EA580C',
    borderRadius: '6px',
    marginBottom: '12px',
  },
  brandTitle: {
    fontFamily: 'var(--font-display)',
    fontWeight: 900,
    fontSize: '28px',
  },
  inputWrapper: {
    position: 'relative',
  },
  inputIcon: {
    position: 'absolute',
    left: '11px',
    top: '50%',
    transform: 'translateY(-50%)',
    color: '#A8A29E',
  },
  darkInput: {
    paddingLeft: '36px',
    backgroundColor: '#292524',
    color: '#FAFAF9',
    borderColor: '#44403C',
  },
  errorBanner: {
    marginTop: '16px',
    padding: '10px 14px',
    backgroundColor: '#7F1D1D',
    border: '1px solid #DC2626',
    borderRadius: '4px',
    color: '#FEE2E2',
    fontSize: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  demoBox: {
    marginTop: '20px',
    paddingTop: '16px',
    borderTop: '1px solid #292524',
  },
};
