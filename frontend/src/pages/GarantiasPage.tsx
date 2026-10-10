import React, { useState } from 'react';
import { TopBar } from '../components/TopBar';
import { ShieldCheck, Search, Plus, CheckCircle, AlertTriangle } from 'lucide-react';
import { diaCalendarioEnZona } from '../utils/format';
import { formatearFechaNegocio, sumarMesesCalendario } from '../utils/fechasNegocio';
import { useI18n } from '../context/I18nContext';
import { useTenant } from '../context/TenantContext';

export interface RegistroGarantiaItem {
  id: string;
  numeroSerie: string;
  productoNombre: string;
  clienteNombre: string;
  clienteTelefono: string;
  numeroFactura: string;
  fechaVenta: string;
  mesesGarantia: number;
  fechaVencimientoGarantia: string;
  estado: 'VIGENTE' | 'EXPIRADA';
}

const INITIAL_GARANTIAS: RegistroGarantiaItem[] = [
  {
    id: 'gar-1',
    numeroSerie: 'SN-TAL-98765',
    productoNombre: 'Taladro Percutor 1/2" DeWalt 20V',
    clienteNombre: 'Constructora del Norte S. de R.L.',
    clienteTelefono: '+504 9876-5432',
    numeroFactura: 'FACT-1042',
    fechaVenta: '2026-01-10',
    mesesGarantia: 12,
    fechaVencimientoGarantia: '2027-01-10',
    estado: 'VIGENTE',
  },
  {
    id: 'gar-2',
    numeroSerie: 'SN-INV-11223',
    productoNombre: 'Inversor Soldadora 200A Miller',
    clienteNombre: 'Taller Mecánico San José',
    clienteTelefono: '+504 3311-2244',
    numeroFactura: 'FACT-0980',
    fechaVenta: '2025-02-15',
    mesesGarantia: 12,
    fechaVencimientoGarantia: '2026-02-15',
    estado: 'EXPIRADA',
  },
];

const isDemoTenant = (id: string) => id === 'tenant-demo-1' || id === 't-1';

export const GarantiasPage: React.FC = () => {
  const { tenant, isReadOnly } = useTenant();
  const { t, locale } = useI18n();
  const currentTenantId = tenant?.id || 'tenant-demo-1';
  const [loadedTenantId, setLoadedTenantId] = useState(currentTenantId);

  const loadGarantias = (tId: string): RegistroGarantiaItem[] => {
    const saved = localStorage.getItem(`ferre_mock_garantias_${tId}`);
    if (saved) return JSON.parse(saved);
    if (isDemoTenant(tId)) {
      const legacy = localStorage.getItem('ferre_mock_garantias');
      return legacy ? JSON.parse(legacy) : INITIAL_GARANTIAS;
    }
    return [];
  };

  const [garantias, setGarantias] = useState<RegistroGarantiaItem[]>(() =>
    loadGarantias(currentTenantId),
  );

  React.useEffect(() => {
    if (loadedTenantId !== currentTenantId) {
      setGarantias(loadGarantias(currentTenantId));
      setLoadedTenantId(currentTenantId);
    }
  }, [currentTenantId, loadedTenantId]);

  React.useEffect(() => {
    if (loadedTenantId === currentTenantId) {
      localStorage.setItem(`ferre_mock_garantias_${currentTenantId}`, JSON.stringify(garantias));
    }
  }, [garantias, currentTenantId, loadedTenantId]);

  const [search, setSearch] = useState('');
  const [modalNuevo, setModalNuevo] = useState(false);

  // Form
  const [numSerie, setNumSerie] = useState('');
  const [prodNombre, setProdNombre] = useState('Taladro Percutor DeWalt');
  const [cliNombre, setCliNombre] = useState('');
  const [cliTel, setCliTel] = useState('');
  const [numFactura, setNumFactura] = useState('FACT-1043');
  const [meses, setMeses] = useState('12');

  const handleCrearGarantia = (e: React.FormEvent) => {
    e.preventDefault();
    const m = parseInt(meses, 10) || 12;
    const hoy = diaCalendarioEnZona();
    const expiry = sumarMesesCalendario(hoy, m);

    const nueva: RegistroGarantiaItem = {
      id: `gar-${Date.now()}`,
      numeroSerie: numSerie.toUpperCase().trim(),
      productoNombre: prodNombre.trim(),
      clienteNombre: cliNombre.trim(),
      clienteTelefono: cliTel.trim(),
      numeroFactura: numFactura.trim(),
      fechaVenta: hoy,
      mesesGarantia: m,
      fechaVencimientoGarantia: expiry,
      estado: 'VIGENTE',
    };

    setGarantias([nueva, ...garantias]);
    setModalNuevo(false);
    setNumSerie('');
    setCliNombre('');
    setCliTel('');
  };

  const filtradas = garantias.filter(
    (g) =>
      g.numeroSerie.toLowerCase().includes(search.toLowerCase()) ||
      g.clienteNombre.toLowerCase().includes(search.toLowerCase()) ||
      g.productoNombre.toLowerCase().includes(search.toLowerCase()) ||
      g.numeroFactura.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div style={styles.container}>
      <TopBar title={t('warranties.title')} subtitle={t('warranties.subtitle')} />

      <main style={styles.content}>
        <div style={styles.actionsBar}>
          <div style={styles.searchWrapper}>
            <Search size={18} style={styles.searchIcon} />
            <input
              type="text"
              placeholder="Buscar por Nº de Serie, Cliente o Factura..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-input"
              style={{ paddingLeft: '38px' }}
            />
          </div>

          <button
            type="button"
            className="btn btn-primary"
            disabled={isReadOnly}
            onClick={() => setModalNuevo(true)}
            title={isReadOnly ? 'Modo solo lectura — soporte activo' : undefined}
          >
            <Plus size={18} /> {t('warranties.register_warranty_title')}
          </button>
        </div>

        <div className="table-container" style={{ marginTop: '20px' }}>
          <table className="industrial-table">
            <thead>
              <tr>
                <th>Nº DE SERIE (S/N)</th>
                <th>EQUIPO / PRODUCTO</th>
                <th>CLIENTE BENEFICIARIO</th>
                <th>FACTURA</th>
                <th style={{ textAlign: 'center' }}>FECHA VENTA</th>
                <th style={{ textAlign: 'center' }}>VIGENCIA</th>
                <th style={{ textAlign: 'center' }}>VENCIMIENTO</th>
                <th style={{ textAlign: 'center' }}>ESTADO GARANTÍA</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map((g) => (
                <tr key={g.id}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 900, color: '#0284C7', fontSize: '14px' }}>
                    {g.numeroSerie}
                  </td>
                  <td style={{ fontWeight: 700 }}>{g.productoNombre}</td>
                  <td>
                    <div style={{ fontWeight: 700 }}>{g.clienteNombre}</div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{g.clienteTelefono}</div>
                  </td>
                  <td style={{ fontWeight: 600 }}>{g.numeroFactura}</td>
                  <td style={{ textAlign: 'center', fontSize: '12px' }}>{formatearFechaNegocio(g.fechaVenta, locale)}</td>
                  <td style={{ textAlign: 'center', fontWeight: 800 }}>{g.mesesGarantia} MESES</td>
                  <td style={{ textAlign: 'center', fontSize: '12px', fontWeight: 700 }}>{formatearFechaNegocio(g.fechaVencimientoGarantia, locale)}</td>
                  <td style={{ textAlign: 'center' }}>
                    {g.estado === 'VIGENTE' ? (
                      <span className="badge badge-success">
                        <CheckCircle size={11} /> VIGENTE
                      </span>
                    ) : (
                      <span className="badge badge-danger">
                        <AlertTriangle size={11} /> EXPIRADA
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {/* Modal Registrar Garantia */}
      {modalNuevo && (
        <div style={styles.modalOverlay}>
          <div className="industrial-card" style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>{t('warranties.register_warranty_title')}</h2>
            </div>
            <form onSubmit={handleCrearGarantia} style={{ marginTop: '16px' }}>
              <div className="form-group">
                <label className="form-label">{t('warranties.serial_number')}</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. SN-8899001122"
                  value={numSerie}
                  onChange={(e) => setNumSerie(e.target.value)}
                  className="form-input"
                  style={{ fontFamily: 'monospace', fontWeight: 700 }}
                />
              </div>

              <div className="form-group">
                <label className="form-label">{t('warranties.equipment_name')}</label>
                <input
                  type="text"
                  required
                  value={prodNombre}
                  onChange={(e) => setProdNombre(e.target.value)}
                  className="form-input"
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">{t('warranties.client_name')}</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Juan Pérez"
                    value={cliNombre}
                    onChange={(e) => setCliNombre(e.target.value)}
                    className="form-input"
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">{t('warranties.client_phone')}</label>
                  <input
                    type="text"
                    required
                    placeholder="+504 9900-1122"
                    value={cliTel}
                    onChange={(e) => setCliTel(e.target.value)}
                    className="form-input"
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">{t('warranties.invoice_number')}</label>
                  <input
                    type="text"
                    required
                    value={numFactura}
                    onChange={(e) => setNumFactura(e.target.value)}
                    className="form-input"
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">{t('warranties.warranty_duration')}</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={meses}
                    onChange={(e) => setMeses(e.target.value)}
                    className="form-input"
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setModalNuevo(false)}>
                  {t('warranties.cancel')}
                </button>
                <button type="submit" className="btn btn-primary" disabled={isReadOnly}>
                  <ShieldCheck size={16} /> {t('warranties.new_claim')}
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
  actionsBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    flexWrap: 'wrap',
  },
  searchWrapper: {
    position: 'relative',
    minWidth: '320px',
    flex: 1,
  },
  searchIcon: {
    position: 'absolute',
    left: '12px',
    top: '50%',
    transform: 'translateY(-50%)',
    color: 'var(--color-text-muted)',
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
  },
  modalHeader: {
    paddingBottom: '12px',
    borderBottom: '2px solid var(--color-border)',
  },
};
