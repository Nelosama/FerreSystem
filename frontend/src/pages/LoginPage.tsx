import React, { useState } from 'react';
import { Box, Lock, Mail, ArrowRight, ShieldCheck } from 'lucide-react';
import { useTenant } from '../context/TenantContext';
import { useNavigate } from 'react-router-dom';

export const LoginPage: React.FC = () => {
  const { login } = useTenant();
  const navigate = useNavigate();

  const [email, setEmail] = useState('cajero@lamundial.hn');
  const [password, setPassword] = useState('Ferre2026!');
  const [isSuperAdminMode, setIsSuperAdminMode] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (isSuperAdminMode) {
      // Super Admin login
      navigate('/admin');
    } else {
      // Tenant login
      login(
        {
          id: 'user-demo-1',
          nombre: 'Carlos Ramos (Cajero Principal)',
          email,
          rol: 'ADMIN',
        },
        {
          id: 'tenant-demo-1',
          nombreComercial: 'LA MUNDIAL - SUCURSAL CENTRO',
          sucursal: 'Sucursal Centro',
          colorPrimario: '#EA580C',
        },
      );
      navigate('/');
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
          <div style={styles.subtitle}>
            {isSuperAdminMode ? 'PORTAL DE GESTIÓN SAAS • DUEÑO' : 'SISTEMA DE GESTIÓN PARA FERRETERÍAS'}
          </div>
        </div>

        {/* Demo Fast Login Pills */}
        <div style={styles.demoPills}>
          <button
            type="button"
            onClick={() => {
              setIsSuperAdminMode(false);
              setEmail('cajero@lamundial.hn');
              setPassword('Ferre2026!');
            }}
            style={{
              ...styles.pillBtn,
              backgroundColor: !isSuperAdminMode ? '#1C1917' : '#FFFFFF',
              color: !isSuperAdminMode ? '#FAFAF9' : '#1C1917',
            }}
          >
            Ferretería (La Mundial)
          </button>
          <button
            type="button"
            onClick={() => {
              setIsSuperAdminMode(true);
              setEmail('admin@ferresystem.hn');
              setPassword('SuperAdmin2026!');
            }}
            style={{
              ...styles.pillBtn,
              backgroundColor: isSuperAdminMode ? '#1C1917' : '#FFFFFF',
              color: isSuperAdminMode ? '#FAFAF9' : '#1C1917',
            }}
          >
            <ShieldCheck size={13} /> Super-Admin
          </button>
        </div>

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
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '16px', padding: '14px' }}
          >
            <span>INGRESAR AL SISTEMA</span>
            <ArrowRight size={18} strokeWidth={2.5} />
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
  demoPills: {
    display: 'flex',
    gap: '8px',
    marginTop: '20px',
  },
  pillBtn: {
    flex: 1,
    padding: '8px',
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '11px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    border: '1.5px solid #1C1917',
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
