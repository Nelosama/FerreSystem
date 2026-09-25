import React, { useState } from 'react';
import { Plus, CheckCircle, Building, ShoppingCart, Power } from 'lucide-react';
import { TopBar } from '../components/TopBar';

interface TenantItem {
  id: string;
  nombreComercial: string;
  contacto: string;
  telefono: string;
  plan: string;
  estado: 'ACTIVO' | 'SUSPENDIDO';
  usuariosCount: number;
  ventasCount: number;
  colorPrimario: string;
}

const INITIAL_TENANTS: TenantItem[] = [
  {
    id: 't-1',
    nombreComercial: 'LA MUNDIAL - SUCURSAL CENTRO',
    contacto: 'cajero@lamundial.hn',
    telefono: '+504 2550-1234',
    plan: 'Plan Pro Ferretero',
    estado: 'ACTIVO',
    usuariosCount: 4,
    ventasCount: 1042,
    colorPrimario: '#EA580C',
  },
  {
    id: 't-2',
    nombreComercial: 'FERRETERÍA EL MARTILLO DE ORO',
    contacto: 'admin@elmartillodeoro.hn',
    telefono: '+504 2233-4455',
    plan: 'Plan Básico',
    estado: 'ACTIVO',
    usuariosCount: 2,
    ventasCount: 310,
    colorPrimario: '#0284C7',
  },
  {
    id: 't-3',
    nombreComercial: 'DISTRIBUIDORA FERRETERA DEL SUR',
    contacto: 'gerencia@ferreterasur.hn',
    telefono: '+504 2780-9988',
    plan: 'Plan Básico',
    estado: 'SUSPENDIDO',
    usuariosCount: 1,
    ventasCount: 85,
    colorPrimario: '#DC2626',
  },
];

export const SuperAdminPage: React.FC = () => {
  const [tenants, setTenants] = useState<TenantItem[]>(INITIAL_TENANTS);
  const [modalNuevoTenant, setModalNuevoTenant] = useState(false);

  // Formulario nuevo tenant
  const [nombreComercial, setNombreComercial] = useState('');
  const [adminNombre, setAdminNombre] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [telefono, setTelefono] = useState('');
  const [colorPrimario, setColorPrimario] = useState('#EA580C');
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);

  const toggleEstado = (id: string) => {
    setTenants(
      tenants.map((t) =>
        t.id === id ? { ...t, estado: t.estado === 'ACTIVO' ? 'SUSPENDIDO' : 'ACTIVO' } : t,
      ),
    );
  };

  const handleCrearTenant = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombreComercial || !adminEmail || !adminPassword) return;

    const nuevo: TenantItem = {
      id: `t-${Date.now()}`,
      nombreComercial: nombreComercial.toUpperCase().trim(),
      contacto: adminEmail.trim(),
      telefono: telefono || '+504 9000-0000',
      plan: 'Plan Pro (Trial)',
      estado: 'ACTIVO',
      usuariosCount: 1,
      ventasCount: 0,
      colorPrimario,
    };

    setTenants([nuevo, ...tenants]);
    setModalNuevoTenant(false);
    setMensajeExito(`¡Ferretería "${nuevo.nombreComercial}" aprovisionada exitosamente con su administrador!`);
    setTimeout(() => setMensajeExito(null), 5000);

    // Limpiar
    setNombreComercial('');
    setAdminNombre('');
    setAdminEmail('');
    setAdminPassword('');
    setTelefono('');
  };

  return (
    <div style={styles.container}>
      <TopBar title="PANEL SUPER-ADMIN (SAAS)" subtitle="Portal del Dueño de FerreSystem • Control de Clientes" />

      <main style={styles.content}>
        {mensajeExito && (
          <div style={styles.successBanner}>
            <CheckCircle size={20} strokeWidth={2.5} color="#15803D" />
            <span style={{ fontWeight: 700, fontSize: '13px' }}>{mensajeExito}</span>
          </div>
        )}

        {/* Resumen Superior de Métricas SaaS */}
        <div style={styles.metricsRow}>
          <div className="industrial-card" style={styles.metricCard}>
            <Building size={24} strokeWidth={2.4} color="var(--color-primary)" />
            <div style={styles.metricValue}>{tenants.length}</div>
            <div style={styles.metricLabel}>FERRETERÍAS REGISTRADAS</div>
          </div>

          <div className="industrial-card" style={styles.metricCard}>
            <CheckCircle size={24} strokeWidth={2.4} color="#15803D" />
            <div style={styles.metricValue}>{tenants.filter((t) => t.estado === 'ACTIVO').length}</div>
            <div style={styles.metricLabel}>SUSCRIPCIONES ACTIVAS</div>
          </div>

          <div className="industrial-card" style={styles.metricCard}>
            <ShoppingCart size={24} strokeWidth={2.4} color="var(--color-primary)" />
            <div style={styles.metricValue}>
              {tenants.reduce((acc, t) => acc + t.ventasCount, 0)}
            </div>
            <div style={styles.metricLabel}>VENTAS TOTALES PROCESADAS</div>
          </div>
        </div>

        {/* Header de Gestión de Clientes */}
        <div style={styles.headerRow}>
          <div>
            <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>CLIENTES TENANTS (FERRETERÍAS)</h2>
            <p style={{ fontSize: '12px', color: '#78716C' }}>
              Aprovisionamiento de nuevos clientes independientes y control de estado de suscripción.
            </p>
          </div>

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setModalNuevoTenant(true)}
          >
            <Plus size={18} strokeWidth={2.5} />
            <span>NUEVO TENANT (FERRETERÍA)</span>
          </button>
        </div>

        {/* Tabla Industrial de Tenants */}
        <div className="table-container" style={{ marginTop: '20px' }}>
          <table className="industrial-table">
            <thead>
              <tr>
                <th>NOMBRE COMERCIAL</th>
                <th>CONTACTO PRINCIPAL</th>
                <th>TELÉFONO</th>
                <th style={{ textAlign: 'center' }}>COLOR MARCA</th>
                <th style={{ textAlign: 'center' }}>USUARIOS</th>
                <th style={{ textAlign: 'center' }}>VENTAS POS</th>
                <th style={{ textAlign: 'center' }}>ESTADO</th>
                <th style={{ textAlign: 'center' }}>ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id}>
                  <td style={{ fontFamily: 'var(--font-display)', fontWeight: 800 }}>
                    {t.nombreComercial}
                  </td>
                  <td style={{ fontWeight: 600 }}>{t.contacto}</td>
                  <td style={{ color: '#78716C' }}>{t.telefono}</td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <span
                        style={{
                          width: '16px',
                          height: '16px',
                          borderRadius: '2px',
                          border: '1px solid #1C1917',
                          backgroundColor: t.colorPrimario,
                        }}
                      />
                      <span style={{ fontSize: '11px', fontFamily: 'monospace' }}>{t.colorPrimario}</span>
                    </div>
                  </td>
                  <td style={{ textAlign: 'center', fontWeight: 700 }}>{t.usuariosCount}</td>
                  <td style={{ textAlign: 'center', fontWeight: 800, color: 'var(--color-primary)' }}>
                    {t.ventasCount}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {t.estado === 'ACTIVO' ? (
                      <span className="badge badge-success">ACTIVO</span>
                    ) : (
                      <span className="badge badge-danger">SUSPENDIDO</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      type="button"
                      className={`btn btn-sm ${t.estado === 'ACTIVO' ? 'btn-secondary' : 'btn-primary'}`}
                      onClick={() => toggleEstado(t.id)}
                    >
                      <Power size={13} strokeWidth={2.5} />
                      {t.estado === 'ACTIVO' ? 'SUSPENDER' : 'ACTIVAR'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {/* Modal Aprovisionar Nuevo Tenant */}
      {modalNuevoTenant && (
        <div style={styles.modalOverlay}>
          <div className="industrial-card" style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>
                CREAR NUEVO TENANT (FERRETERÍA)
              </h2>
            </div>

            <form onSubmit={handleCrearTenant} style={{ marginTop: '16px' }}>
              <div className="form-group">
                <label className="form-label">NOMBRE COMERCIAL DE LA FERRETERÍA</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. FERRETERÍA SAN PEDRO S. DE R.L."
                  value={nombreComercial}
                  onChange={(e) => setNombreComercial(e.target.value)}
                  className="form-input"
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">TELÉFONO</label>
                  <input
                    type="text"
                    placeholder="+504 2550-0000"
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    className="form-input"
                  />
                </div>

                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">COLOR DE MARCA</label>
                  <input
                    type="color"
                    value={colorPrimario}
                    onChange={(e) => setColorPrimario(e.target.value)}
                    style={{ width: '100%', height: '42px', cursor: 'pointer', border: '2px solid #292524' }}
                  />
                </div>
              </div>

              <div style={{ borderTop: '1px solid #D6D3D1', margin: '14px 0 12px', paddingTop: '10px' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', marginBottom: '8px' }}>
                  ADMINISTRADOR INICIAL DE LA FERRETERÍA
                </div>

                <div className="form-group">
                  <label className="form-label">NOMBRE DEL DUEÑO / GERENTE</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Mario Rivera"
                    value={adminNombre}
                    onChange={(e) => setAdminNombre(e.target.value)}
                    className="form-input"
                  />
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">EMAIL DE ACCESO</label>
                    <input
                      type="email"
                      required
                      placeholder="admin@ferreteria.hn"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      className="form-input"
                    />
                  </div>

                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">CONTRASEÑA TEMPORAL</label>
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      className="form-input"
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setModalNuevoTenant(false)}
                >
                  CANCELAR
                </button>
                <button type="submit" className="btn btn-primary">
                  <CheckCircle size={16} strokeWidth={2.6} /> CREAR Y ACTIVAR TENANT
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minHeight: '100vh',
    backgroundColor: 'var(--color-bg)',
  },
  content: {
    padding: '24px 32px 48px',
    maxWidth: '1400px',
    width: '100%',
  },
  successBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '14px 18px',
    backgroundColor: '#DCFCE7',
    border: '2px solid #15803D',
    borderRadius: 'var(--radius-xs)',
    marginBottom: '20px',
  },
  metricsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: '20px',
    marginBottom: '28px',
  },
  metricCard: {
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  metricValue: {
    fontFamily: 'var(--font-display)',
    fontWeight: 900,
    fontSize: '28px',
    color: 'var(--color-text-main)',
  },
  metricLabel: {
    fontFamily: 'var(--font-display)',
    fontWeight: 800,
    fontSize: '11px',
    letterSpacing: '0.04em',
    color: '#78716C',
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '14px',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.65)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
    padding: '20px',
  },
  modalContent: {
    width: '100%',
    maxWidth: '540px',
    backgroundColor: '#FFFFFF',
  },
  modalHeader: {
    paddingBottom: '12px',
    borderBottom: '2px solid var(--color-border)',
  },
};
