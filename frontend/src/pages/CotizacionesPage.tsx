import React, { useState } from 'react';
import { TopBar } from '../components/TopBar';
import { useTenant } from '../context/TenantContext';
import {
  FileText,
  Plus,
  ArrowRightCircle,
  Clock,
  CheckCircle2,
  XCircle,
  FileCheck,
  Printer,
  X,
} from 'lucide-react';
import { formatLempiras } from '../utils/format';

interface Cotizacion {
  id: string;
  numero: number;
  cliente: string;
  rtn?: string;
  fechaValidez: string;
  subtotal: number;
  isv: number;
  total: number;
  estado: 'BORRADOR' | 'ENVIADA' | 'APROBADA' | 'RECHAZADA' | 'CONVERTIDA';
  itemsCount: number;
}

const COTIZACIONES_DATA: Cotizacion[] = [
  {
    id: 'cot-1',
    numero: 8,
    cliente: 'Constructora del Norte S. de R.L.',
    rtn: '05019001234567',
    fechaValidez: '25/09/2026', // Vence hoy!
    subtotal: 18500.00,
    isv: 2775.00,
    total: 21275.00,
    estado: 'APROBADA',
    itemsCount: 4,
  },
  {
    id: 'cot-2',
    numero: 7,
    cliente: 'Ferretería El Progreso (Subdistribuidor)',
    rtn: '05021980001234',
    fechaValidez: '25/09/2026', // Vence hoy!
    subtotal: 8400.00,
    isv: 1260.00,
    total: 9660.00,
    estado: 'ENVIADA',
    itemsCount: 2,
  },
  {
    id: 'cot-3',
    numero: 6,
    cliente: 'Ing. Roberto Flores',
    fechaValidez: '25/09/2026', // Vence hoy!
    subtotal: 3200.00,
    isv: 480.00,
    total: 3680.00,
    estado: 'BORRADOR',
    itemsCount: 3,
  },
  {
    id: 'cot-4',
    numero: 5,
    cliente: 'Inversiones Industriales Cortés',
    fechaValidez: '28/09/2026',
    subtotal: 45000.00,
    isv: 6750.00,
    total: 51750.00,
    estado: 'ENVIADA',
    itemsCount: 8,
  },
  {
    id: 'cot-5',
    numero: 4,
    cliente: 'Taller Mecánico San José',
    fechaValidez: '18/09/2026',
    subtotal: 6200.00,
    isv: 930.00,
    total: 7130.00,
    estado: 'CONVERTIDA',
    itemsCount: 5,
  },
];

export const CotizacionesPage: React.FC = () => {
  const { tenant } = useTenant();
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>(COTIZACIONES_DATA);
  const [modalConvertir, setModalConvertir] = useState<Cotizacion | null>(null);
  const [modalPdf, setModalPdf] = useState<Cotizacion | null>(null);
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);

  // Conversión con un clic a venta
  const handleConvertir = (cot: Cotizacion) => {
    setCotizaciones(
      cotizaciones.map((c) => (c.id === cot.id ? { ...c, estado: 'CONVERTIDA' } : c)),
    );
    setModalConvertir(null);
    setMensajeExito(
      `¡Cotización #${cot.numero} convertida exitosamente a Venta! Stock descontado y registrada en POS.`,
    );
    setTimeout(() => setMensajeExito(null), 5000);
  };

  const getStatusBadge = (estado: Cotizacion['estado']) => {
    switch (estado) {
      case 'APROBADA':
        return <span className="badge badge-success"><CheckCircle2 size={11} /> APROBADA</span>;
      case 'ENVIADA':
        return <span className="badge badge-warning"><Clock size={11} /> ENVIADA</span>;
      case 'CONVERTIDA':
        return <span className="badge badge-dark"><FileCheck size={11} /> CONVERTIDA A VENTA</span>;
      case 'RECHAZADA':
        return <span className="badge badge-danger"><XCircle size={11} /> RECHAZADA</span>;
      default:
        return <span className="badge" style={{ backgroundColor: '#F5F5F4' }}>BORRADOR</span>;
    }
  };

  return (
    <div style={styles.container}>
      <TopBar title="COTIZACIONES" subtitle="Presupuestos y Conversión a Ventas" />

      <main style={styles.content}>
        {mensajeExito && (
          <div style={styles.successBanner}>
            <CheckCircle2 size={20} strokeWidth={2.5} color="#15803D" />
            <span style={{ fontWeight: 700, fontSize: '13px' }}>{mensajeExito}</span>
          </div>
        )}

        <div style={styles.headerRow}>
          <div>
            <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>HISTORIAL DE PRESUPUESTOS</h2>
            <p style={{ fontSize: '12px', color: '#78716C' }}>
              Las cotizaciones aprobadas pueden ser convertidas a factura POS con un solo clic.
            </p>
          </div>

          <button type="button" className="btn btn-primary" onClick={() => alert('Creación de cotización rápida en POS')}>
            <Plus size={18} strokeWidth={2.5} />
            <span>NUEVA COTIZACIÓN</span>
          </button>
        </div>

        {/* Tabla Industrial de Cotizaciones */}
        <div className="table-container" style={{ marginTop: '20px' }}>
          <table className="industrial-table">
            <thead>
              <tr>
                <th>COTIZACIÓN N°</th>
                <th>CLIENTE</th>
                <th style={{ textAlign: 'center' }}>VENCE</th>
                <th style={{ textAlign: 'center' }}>ITEMS</th>
                <th style={{ textAlign: 'right' }}>SUBTOTAL</th>
                <th style={{ textAlign: 'right' }}>ISV (15%)</th>
                <th style={{ textAlign: 'right' }}>TOTAL</th>
                <th style={{ textAlign: 'center' }}>ESTADO</th>
                <th style={{ textAlign: 'center' }}>ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {cotizaciones.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontFamily: 'var(--font-display)', fontWeight: 800 }}>
                    COT-{c.numero.toString().padStart(4, '0')}
                  </td>
                  <td style={{ fontWeight: 600 }}>{c.cliente}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span
                      style={{
                        fontWeight: 700,
                        color: c.fechaValidez === '25/09/2026' ? 'var(--color-primary)' : 'inherit',
                      }}
                    >
                      {c.fechaValidez}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>{c.itemsCount}</td>
                  <td style={{ textAlign: 'right', color: '#78716C', whiteSpace: 'nowrap' }}>
                    {formatLempiras(c.subtotal)}
                  </td>
                  <td style={{ textAlign: 'right', color: '#78716C', whiteSpace: 'nowrap' }}>
                    {formatLempiras(c.isv)}
                  </td>
                  <td
                    style={{
                      textAlign: 'right',
                      fontFamily: 'var(--font-display)',
                      fontWeight: 800,
                      fontSize: '14px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {formatLempiras(c.total)}
                  </td>
                  <td style={{ textAlign: 'center' }}>{getStatusBadge(c.estado)}</td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setModalPdf(c)}
                        title="Ver PDF Proforma"
                      >
                        <FileText size={14} /> PDF
                      </button>

                      {c.estado === 'APROBADA' && (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => setModalConvertir(c)}
                          title="Convertir a Venta Inmediata"
                        >
                          <ArrowRightCircle size={14} /> A VENTA
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {/* Modal Confirmar Conversión Directa a Venta */}
      {modalConvertir && (
        <div style={styles.modalOverlay}>
          <div className="industrial-card" style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>
                CONVERTIR COTIZACIÓN A VENTA POS
              </h2>
              <button type="button" onClick={() => setModalConvertir(null)} style={styles.closeBtn}>
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '16px 0', fontSize: '13px', lineHeight: 1.5 }}>
              <p>
                ¿Desea convertir la <strong>Cotización COT-{modalConvertir.numero.toString().padStart(4, '0')}</strong> en una factura de venta?
              </p>
              <div style={styles.convertDetailBox}>
                <div><strong>Cliente:</strong> {modalConvertir.cliente}</div>
                <div><strong>Total a cobrar:</strong> {formatLempiras(modalConvertir.total)} (Incluye ISV 15%)</div>
                <div><strong>Acción automática:</strong> Descontará inventario y generará secuencial de venta oficial.</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setModalConvertir(null)}
              >
                CANCELAR
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => handleConvertir(modalConvertir)}
              >
                CONFIRMAR Y CONVERTIR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Vista Previa de Documento PDF de Cotización */}
      {modalPdf && (
        <div style={styles.modalOverlay}>
          <div className="industrial-card" style={styles.pdfModalCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <span className="badge badge-dark">DOCUMENTO FORMAL DE COTIZACIÓN</span>
              <button type="button" onClick={() => setModalPdf(null)} style={styles.closeBtn}>
                <X size={20} />
              </button>
            </div>

            <div style={styles.pdfPaper}>
              {/* Header con Branding del Tenant */}
              <div style={styles.pdfHeader}>
                <div>
                  <h2 style={{ color: 'var(--color-primary)', fontSize: '20px', textTransform: 'uppercase' }}>
                    {tenant.nombreComercial}
                  </h2>
                  <div style={{ fontSize: '11px', color: '#555' }}>
                    Barrio El Centro, 3ra Ave, 4ta Calle • Tel: +504 2550-1234
                  </div>
                  <div style={{ fontSize: '11px', color: '#555' }}>
                    RTN: 05019002345678 • San Pedro Sula, Honduras
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '16px' }}>
                    COTIZACIÓN #{modalPdf.numero}
                  </div>
                  <div style={{ fontSize: '11px', color: '#78716C' }}>Fecha: 25/09/2026</div>
                  <div style={{ fontSize: '11px', color: 'var(--color-primary)', fontWeight: 700 }}>
                    Válida hasta: {modalPdf.fechaValidez}
                  </div>
                </div>
              </div>

              <div style={{ borderBottom: '2px solid #292524', margin: '14px 0' }} />

              <div style={{ fontSize: '12px', marginBottom: '14px' }}>
                <div><strong>Cotizado a:</strong> {modalPdf.cliente}</div>
                {modalPdf.rtn && <div><strong>RTN:</strong> {modalPdf.rtn}</div>}
              </div>

              <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', marginBottom: '20px' }}>
                <thead>
                  <tr style={{ borderBottom: '1.5px solid #292524' }}>
                    <th style={{ textAlign: 'left', padding: '6px 0' }}>DESCRIPCIÓN</th>
                    <th style={{ textAlign: 'right', padding: '6px 0' }}>SUBTOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding: '8px 0' }}>Partida de Materiales de Construcción & Herramientas</td>
                    <td style={{ textAlign: 'right', padding: '8px 0', whiteSpace: 'nowrap' }}>
                      {formatLempiras(modalPdf.subtotal)}
                    </td>
                  </tr>
                </tbody>
              </table>

              <div style={{ borderTop: '1px solid #D6D3D1', paddingTop: '10px', textAlign: 'right', fontSize: '12px' }}>
                <div>Subtotal: {formatLempiras(modalPdf.subtotal)}</div>
                <div>ISV (15%): {formatLempiras(modalPdf.isv)}</div>
                <div style={{ fontSize: '16px', fontWeight: 900, color: 'var(--color-primary)', marginTop: '4px' }}>
                  TOTAL OFERTADO: {formatLempiras(modalPdf.total)}
                </div>
              </div>

              <div style={{ marginTop: '24px', fontSize: '10px', color: '#78716C', borderTop: '1px dashed #78716C', paddingTop: '8px' }}>
                * Precios sujetos a confirmación y disponibilidad de stock al momento de la orden.
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => window.print()} style={{ flex: 1 }}>
                <Printer size={16} /> IMPRIMIR PDF
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setModalPdf(null)} style={{ flex: 1 }}>
                CERRAR
              </button>
            </div>
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
  modalCard: {
    width: '100%',
    maxWidth: '500px',
    backgroundColor: '#FFFFFF',
  },
  pdfModalCard: {
    width: '100%',
    maxWidth: '620px',
    backgroundColor: '#FFFFFF',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: '10px',
    borderBottom: '2px solid var(--color-border)',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
  },
  convertDetailBox: {
    backgroundColor: '#FAFAF9',
    border: '1.5px solid var(--color-border)',
    borderRadius: 'var(--radius-xs)',
    padding: '12px',
    marginTop: '10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    fontSize: '12px',
  },
  pdfPaper: {
    backgroundColor: '#FFFFFF',
    border: '2px solid #292524',
    padding: '24px',
    boxShadow: '3px 3px 0px #292524',
  },
  pdfHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
};
