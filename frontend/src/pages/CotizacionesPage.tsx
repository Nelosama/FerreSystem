import React, { useState } from 'react';
import { TopBar } from '../components/TopBar';
import { useTenant } from '../context/TenantContext';
import { useMockData, type QuotationItem } from '../context/MockDataContext';
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
  Check,
} from 'lucide-react';
import { formatLempiras } from '../utils/format';

export const CotizacionesPage: React.FC = () => {
  const { tenant } = useTenant();
  const { cotizaciones, agregarCotizacion, convertirCotizacionAVenta } = useMockData();
  const [modalConvertir, setModalConvertir] = useState<QuotationItem | null>(null);
  const [modalPdf, setModalPdf] = useState<QuotationItem | null>(null);
  const [modalNueva, setModalNueva] = useState(false);
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);

  // Form para nueva cotización rápida
  const [formCliente, setFormCliente] = useState('');
  const [formRtn, setFormRtn] = useState('');
  const [formSubtotal, setFormSubtotal] = useState('');

  const handleCrearCotizacion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCliente || !formSubtotal) return;

    const subtotal = parseFloat(formSubtotal) || 0;
    const isv = Math.round(subtotal * 0.15 * 100) / 100;
    const total = subtotal + isv;

    // Calcular fecha validez (+7 días)
    const fechaVal = new Date();
    fechaVal.setDate(fechaVal.getDate() + 7);
    const day = fechaVal.getDate().toString().padStart(2, '0');
    const month = (fechaVal.getMonth() + 1).toString().padStart(2, '0');
    const year = fechaVal.getFullYear();
    const fechaValidezFormatted = `${day}/${month}/${year}`;

    agregarCotizacion({
      cliente: formCliente.trim(),
      rtn: formRtn.trim() || undefined,
      subtotal,
      isv,
      total,
      fechaValidez: fechaValidezFormatted,
      estado: 'ENVIADA',
      itemsCount: 1,
    });

    setModalNueva(false);
    setFormCliente('');
    setFormRtn('');
    setFormSubtotal('');
    setMensajeExito('¡Cotización registrada exitosamente!');
    setTimeout(() => setMensajeExito(null), 4000);
  };

  // Conversión con un clic a venta
  const handleConvertir = (cot: QuotationItem) => {
    convertirCotizacionAVenta(cot.id);
    setModalConvertir(null);
    setMensajeExito(
      `¡Cotización #${cot.numero} convertida exitosamente a Venta! Registrada en POS y reporte.`,
    );
    setTimeout(() => setMensajeExito(null), 5000);
  };

  const getStatusBadge = (estado: QuotationItem['estado']) => {
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

          <button type="button" className="btn btn-primary" onClick={() => setModalNueva(true)}>
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

      {/* Modal de Creación de Nueva Cotización Rápida */}
      {modalNueva && (
        <div style={styles.modalOverlay}>
          <div className="industrial-card" style={styles.modalCard}>
            <div style={styles.modalHeader}>
              <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>
                CREAR NUEVA COTIZACIÓN
              </h2>
              <button type="button" onClick={() => setModalNueva(false)} style={styles.closeBtn}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCrearCotizacion} style={{ marginTop: '16px' }}>
              <div className="form-group">
                <label className="form-label">CLIENTE O EMPRESA</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Constructora San Pedro"
                  value={formCliente}
                  onChange={(e) => setFormCliente(e.target.value)}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">RTN (OPCIONAL)</label>
                <input
                  type="text"
                  placeholder="05019000123456"
                  value={formRtn}
                  onChange={(e) => setFormRtn(e.target.value)}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">MONTO SUBTOTAL (L.)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={formSubtotal}
                  onChange={(e) => setFormSubtotal(e.target.value)}
                  className="form-input"
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setModalNueva(false)}
                >
                  CANCELAR
                </button>
                <button type="submit" className="btn btn-primary">
                  <Check size={16} strokeWidth={2.6} /> GUARDAR COTIZACIÓN
                </button>
              </div>
            </form>
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
