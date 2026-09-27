import React, { useState } from 'react';
import { TopBar } from '../components/TopBar';
import { Calculator, CheckCircle, Clock, Printer, X, ShieldAlert, FileText } from 'lucide-react';
import { formatLempiras } from '../utils/format';
import { useMockData } from '../context/MockDataContext';
import { useTenant } from '../context/TenantContext';
import { useI18n } from '../context/I18nContext';

export interface ArqueoRecord {
  id: string;
  usuarioNombre: string;
  fecha: string;
  efectivoEsperado: number;
  efectivoContado: number;
  diferencia: number;
  tipoDiferencia: 'CUADRADO' | 'SOBRANTE' | 'FALTANTE';
  ventasEfectivo: number;
  ventasTarjeta: number;
  ventasCredito: number;
  totalVentasTurno: number;
  observaciones?: string;
}

const INITIAL_ARQUEOS: ArqueoRecord[] = [
  {
    id: 'arq-1',
    usuarioNombre: 'Carlos Ramos (Cajero Principal)',
    fecha: '2026-03-24 17:00:00',
    efectivoEsperado: 12500.0,
    efectivoContado: 12500.0,
    diferencia: 0,
    tipoDiferencia: 'CUADRADO',
    ventasEfectivo: 11500.0,
    ventasTarjeta: 3500.0,
    ventasCredito: 2000.0,
    totalVentasTurno: 17000.0,
    observaciones: 'Turno sin novedades. Cuadrado perfecto.',
  },
  {
    id: 'arq-2',
    usuarioNombre: 'Carlos Ramos (Cajero Principal)',
    fecha: '2026-03-23 17:05:00',
    efectivoEsperado: 8400.0,
    efectivoContado: 8350.0,
    diferencia: -50.0,
    tipoDiferencia: 'FALTANTE',
    ventasEfectivo: 7400.0,
    ventasTarjeta: 1200.0,
    ventasCredito: 0,
    totalVentasTurno: 8600.0,
    observaciones: 'Faltante de L.50 en cambio de billetes',
  },
];

const isDemoTenant = (id: string) => id === 'tenant-demo-1' || id === 't-1';

export const ArqueoCajaPage: React.FC = () => {
  const { ventas } = useMockData();
  const { tenant, user } = useTenant();
  const { t } = useI18n();

  const currentTenantId = tenant?.id || 'tenant-demo-1';
  const [loadedTenantId, setLoadedTenantId] = useState(currentTenantId);

  const loadArqueos = (tId: string): ArqueoRecord[] => {
    const saved = localStorage.getItem(`ferre_mock_arqueos_${tId}`);
    if (saved) return JSON.parse(saved);
    if (isDemoTenant(tId)) {
      const legacy = localStorage.getItem('ferre_mock_arqueos');
      return legacy ? JSON.parse(legacy) : INITIAL_ARQUEOS;
    }
    return [];
  };

  const [arqueos, setArqueos] = useState<ArqueoRecord[]>(() =>
    loadArqueos(currentTenantId),
  );

  const [modalImprimir, setModalImprimir] = useState<ArqueoRecord | null>(null);

  React.useEffect(() => {
    if (loadedTenantId !== currentTenantId) {
      setArqueos(loadArqueos(currentTenantId));
      setLoadedTenantId(currentTenantId);
    }
  }, [currentTenantId, loadedTenantId]);

  React.useEffect(() => {
    if (loadedTenantId === currentTenantId) {
      localStorage.setItem(`ferre_mock_arqueos_${currentTenantId}`, JSON.stringify(arqueos));
    }
  }, [arqueos, currentTenantId, loadedTenantId]);

  // Cálculos de ventas en el turno actual por método de pago
  const ventasEfectivoTurno = ventas
    .filter((v) => v.metodoPago === 'EFECTIVO')
    .reduce((acc, v) => acc + v.total, 0);

  const ventasTarjetaTurno = ventas
    .filter((v) => v.metodoPago === 'TARJETA')
    .reduce((acc, v) => acc + v.total, 0);

  const ventasCreditoTurno = ventas
    .filter((v) => v.metodoPago === 'CREDITO')
    .reduce((acc, v) => acc + v.total, 0);

  const totalVentasTurno = ventasEfectivoTurno + ventasTarjetaTurno + ventasCreditoTurno;

  const fondoInicial = 1000.0;
  const totalEsperado = fondoInicial + ventasEfectivoTurno;

  const [montoContadoInput, setMontoContadoInput] = useState('');
  const [notasInput, setNotasInput] = useState('');
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);

  const contadoNumber = parseFloat(montoContadoInput) || 0;
  const diferenciaCalculada = contadoNumber - totalEsperado;
  const existeDescuadre = montoContadoInput !== '' && Math.abs(diferenciaCalculada) > 0.01;

  const handleCerrarTurno = (e: React.FormEvent) => {
    e.preventDefault();
    const diff = diferenciaCalculada;

    let tipo: 'CUADRADO' | 'SOBRANTE' | 'FALTANTE' = 'CUADRADO';
    if (diff > 0.01) tipo = 'SOBRANTE';
    if (diff < -0.01) tipo = 'FALTANTE';

    const nuevo: ArqueoRecord = {
      id: `arq-${Date.now()}`,
      usuarioNombre: user?.nombre || 'Carlos Ramos (Cajero Principal)',
      fecha: new Date().toLocaleString('es-HN'),
      efectivoEsperado: totalEsperado,
      efectivoContado: contadoNumber,
      diferencia: diff,
      tipoDiferencia: tipo,
      ventasEfectivo: ventasEfectivoTurno,
      ventasTarjeta: ventasTarjetaTurno,
      ventasCredito: ventasCreditoTurno,
      totalVentasTurno,
      observaciones: notasInput.trim() || (tipo === 'CUADRADO' ? 'Arqueo sin novedades' : 'Reporte con ajuste de dinero'),
    };

    setArqueos([nuevo, ...arqueos]);
    setModalImprimir(nuevo);
    setMontoContadoInput('');
    setNotasInput('');
    setMensajeExito('¡Cierre y Arqueo de Caja registrado correctamente!');
    setTimeout(() => setMensajeExito(null), 4000);
  };

  return (
    <div style={styles.container}>
      <TopBar title={t('cash_drawer.title')} subtitle={t('cash_drawer.subtitle')} />

      <main style={styles.content}>
        {mensajeExito && (
          <div style={styles.successBanner}>
            <CheckCircle size={20} color="#15803D" />
            <span style={{ fontWeight: 700 }}>{mensajeExito}</span>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '24px' }}>
          {/* PANEL DE CONTEO Y ARQUEO EN VIVO */}
          <div className="industrial-card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', borderBottom: '2px solid #292524', paddingBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Calculator size={22} color="var(--color-primary)" />
                <h2 style={{ fontSize: '15px', textTransform: 'uppercase' }}>CIERRE Y CONTEO DE CAJA ACTUAL</h2>
              </div>
              <span className="badge badge-dark">SISTEMA VALIDADO</span>
            </div>

            {/* RESUMEN DE VENTAS POR MÉTODO DE PAGO */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', backgroundColor: '#FAFAF9', padding: '16px', border: '1.5px solid #D6D3D1', borderRadius: '4px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span>Fondo Fijo Inicial de Caja:</span>
                <span style={{ fontWeight: 700 }}>{formatLempiras(fondoInicial)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span>Ventas en Efectivo del Turno:</span>
                <span style={{ fontWeight: 700, color: '#16A34A' }}>{formatLempiras(ventasEfectivoTurno)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span>Ventas con Tarjeta (P.O.S):</span>
                <span style={{ fontWeight: 700, color: '#0284C7' }}>{formatLempiras(ventasTarjetaTurno)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <span>Ventas a Crédito Cliente:</span>
                <span style={{ fontWeight: 700, color: '#D97706' }}>{formatLempiras(ventasCreditoTurno)}</span>
              </div>

              <div style={{ height: '1px', backgroundColor: '#D6D3D1', margin: '4px 0' }} />

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 800 }}>
                <span>TOTAL RECAUDADO EN TURNO:</span>
                <span>{formatLempiras(totalVentasTurno)}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 900, color: 'var(--color-primary)', paddingTop: '4px', borderTop: '1px dashed #A8A29E' }}>
                <span>EFECTIVO ESPERADO EN BÓVEDA/CAJA:</span>
                <span>{formatLempiras(totalEsperado)}</span>
              </div>
            </div>

            {/* FORMULARIO DE INGRESO FÍSICO Y VALIDADOR */}
            <form onSubmit={handleCerrarTurno}>
              <div className="form-group">
                <label className="form-label">EFECTIVO FÍSICO CONTADO EN CAJA (L.)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={montoContadoInput}
                  onChange={(e) => setMontoContadoInput(e.target.value)}
                  className="form-input"
                  style={{ fontSize: '18px', fontWeight: 800, fontFamily: 'monospace' }}
                />
              </div>

              {/* CUADRO DE VALIDACIÓN Y ALERTAS EN TIEMPO REAL */}
              {montoContadoInput !== '' && (
                <div
                  style={{
                    padding: '14px',
                    borderRadius: '4px',
                    marginBottom: '16px',
                    backgroundColor: !existeDescuadre ? '#DCFCE7' : '#FEF2F2',
                    border: !existeDescuadre ? '2px solid #16A34A' : '2px solid #DC2626',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontWeight: 900, fontSize: '13px', color: !existeDescuadre ? '#15803D' : '#991B1B' }}>
                      {!existeDescuadre ? '✓ ARQUEO CUADRADO CON SISTEMA' : '⚠ DESVIACIÓN REGISTRADA EN ARQUEO'}
                    </div>
                    <span style={{ fontWeight: 900, fontFamily: 'monospace', fontSize: '13px' }}>
                      {formatLempiras(diferenciaCalculada)}
                    </span>
                  </div>

                  {existeDescuadre && (
                    <div style={{ fontSize: '11px', color: '#991B1B', marginTop: '6px', lineHeight: '1.4' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                        <ShieldAlert size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                        <span>
                          <strong>VALIDADOR DE SEGURIDAD:</strong> El monto contado difiere en{' '}
                          <strong>{formatLempiras(Math.abs(diferenciaCalculada))}</strong> respecto al total reportado por el sistema de ventas.
                          Por favor ingrese la justificación obligatoria en las notas.
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="form-group">
                <label className="form-label">NOTAS DE AUDITORÍA / JUSTIFICACIÓN</label>
                <textarea
                  placeholder="Escriba aquí observaciones de billetes dañados o justificación de diferencia..."
                  value={notasInput}
                  onChange={(e) => setNotasInput(e.target.value)}
                  className="form-input"
                  rows={2}
                  required={existeDescuadre}
                />
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '12px' }}>
                <CheckCircle size={18} /> REGISTRAR ARQUEO Y IMPRIMIR CIERRE (PDF)
              </button>
            </form>
          </div>

          {/* HISTORIAL DE ARQUEOS REALIZADOS */}
          <div className="industrial-card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', borderBottom: '2px solid #292524', paddingBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Clock size={22} color="#0284C7" />
                <h2 style={{ fontSize: '15px', textTransform: 'uppercase' }}>HISTORIAL DE ARQUEOS Y CIERRES</h2>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '520px', overflowY: 'auto' }}>
              {arqueos.map((a) => (
                <div key={a.id} style={{ padding: '14px', backgroundColor: '#FAFAF9', border: '1.5px solid #D6D3D1', borderRadius: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 800, fontSize: '13px' }}>{a.usuarioNombre}</span>
                    <span style={{ fontSize: '11px', color: '#78716C', fontFamily: 'monospace' }}>{a.fecha}</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '12px' }}>
                    <span>Efectivo Esperado: <strong>{formatLempiras(a.efectivoEsperado)}</strong></span>
                    <span>Efectivo Declarado: <strong>{formatLempiras(a.efectivoContado)}</strong></span>
                  </div>

                  <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '6px', borderTop: '1px solid #E7E5E4' }}>
                    <span style={{ fontSize: '11px', color: '#78716C' }}>{a.observaciones}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {a.tipoDiferencia === 'CUADRADO' && <span className="badge badge-success">CUADRADO</span>}
                      {a.tipoDiferencia === 'SOBRANTE' && <span className="badge badge-warning">SOBRANTE ({formatLempiras(a.diferencia)})</span>}
                      {a.tipoDiferencia === 'FALTANTE' && <span className="badge badge-danger">FALTANTE ({formatLempiras(a.diferencia)})</span>}

                      <button
                        type="button"
                        onClick={() => setModalImprimir(a)}
                        className="btn btn-sm btn-secondary"
                        title="Ver e Imprimir Reporte en PDF"
                        style={{ padding: '4px 8px' }}
                      >
                        <Printer size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* MODAL / COMPONENTE DE IMPRESIÓN PDF DEL CIERRE DE CAJA */}
      {modalImprimir && (
        <div style={styles.modalOverlay}>
          <div className="industrial-card" style={{ ...styles.modalContent, maxWidth: '600px' }}>
            <div style={styles.modalHeader} className="no-print">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <FileText size={20} color="var(--color-primary)" />
                  <h2 style={{ fontSize: '15px', textTransform: 'uppercase' }}>REPORTE OFICIAL DE CIERRE DE CAJA</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setModalImprimir(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* PLANTILLA DE IMPRESIÓN OFICIAL DEL REPORTE */}
            <div id="print-cierre-area" style={{ padding: '20px', backgroundColor: '#FFFFFF', color: '#1C1917' }}>
              <div style={{ textAlign: 'center', borderBottom: '2px solid #1C1917', paddingBottom: '12px', marginBottom: '16px' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '18px', textTransform: 'uppercase' }}>
                  {tenant.nombreComercial}
                </div>
                <div style={{ fontSize: '11px', color: '#44403C', marginTop: '2px' }}>
                  {tenant.direccion || 'Barrio El Centro, San Pedro Sula'} • Tel: {tenant.telefono || '+504 2550-1234'}
                </div>
                <div style={{ fontSize: '11px', fontWeight: 800, marginTop: '2px' }}>
                  RTN: 05019001234567 • SEDE: {tenant.sucursal || 'Sucursal Principal'}
                </div>
                <div style={{ marginTop: '8px', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '13px', textTransform: 'uppercase', color: 'var(--color-primary)' }}>
                  COMPROBANTE Y ACTA DE ARQUEO DE CAJA
                </div>
              </div>

              {/* DATOS DEL CIERRE */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '11px', marginBottom: '16px', backgroundColor: '#FAFAF9', padding: '10px', border: '1px solid #D6D3D1' }}>
                <div><strong>CAJERO RESPONSABLE:</strong> {modalImprimir.usuarioNombre}</div>
                <div><strong>FECHA / HORA CIERRE:</strong> {modalImprimir.fecha}</div>
                <div><strong>ESTADO ARQUEO:</strong> {modalImprimir.tipoDiferencia}</div>
                <div><strong>CORREO/ID:</strong> {user?.email || 'cajero@lamundial.hn'}</div>
              </div>

              {/* DESGLOSE DE VENTAS DEL TURNO */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', marginBottom: '6px' }}>
                  1. RESUMEN DE VENTAS POR MÉTODO DE PAGO
                </div>
                <table className="industrial-table" style={{ width: '100%', fontSize: '11px' }}>
                  <thead>
                    <tr>
                      <th>CONCEPTO / PAGO</th>
                      <th style={{ textAlign: 'right' }}>MONTO RECAUDADO</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Ventas en Efectivo</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatLempiras(modalImprimir.ventasEfectivo || 0)}</td>
                    </tr>
                    <tr>
                      <td>Ventas con Tarjeta (P.O.S)</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatLempiras(modalImprimir.ventasTarjeta || 0)}</td>
                    </tr>
                    <tr>
                      <td>Ventas a Crédito Cliente</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatLempiras(modalImprimir.ventasCredito || 0)}</td>
                    </tr>
                    <tr style={{ fontWeight: 900, backgroundColor: '#FAFAF9' }}>
                      <td>TOTAL VENTAS TURNO</td>
                      <td style={{ textAlign: 'right', color: 'var(--color-primary)' }}>{formatLempiras(modalImprimir.totalVentasTurno || 0)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* DESGLOSE DE AUDITORÍA Y ARQUEO */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', marginBottom: '6px' }}>
                  2. AUDITORÍA DE EFECTIVO EN CAJA FÍSICA
                </div>
                <table className="industrial-table" style={{ width: '100%', fontSize: '11px' }}>
                  <tbody>
                    <tr>
                      <td>Fondo Fijo Inicial de Caja</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatLempiras(1000.00)}</td>
                    </tr>
                    <tr>
                      <td>Ventas Efectivo del Turno</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatLempiras(modalImprimir.ventasEfectivo || 0)}</td>
                    </tr>
                    <tr style={{ fontWeight: 800 }}>
                      <td>TOTAL EFECTIVO ESPERADO EN SISTEMA</td>
                      <td style={{ textAlign: 'right' }}>{formatLempiras(modalImprimir.efectivoEsperado)}</td>
                    </tr>
                    <tr style={{ fontWeight: 800 }}>
                      <td>TOTAL EFECTIVO DECLARADO POR CAJERO</td>
                      <td style={{ textAlign: 'right' }}>{formatLempiras(modalImprimir.efectivoContado)}</td>
                    </tr>
                    <tr style={{ fontWeight: 900, backgroundColor: modalImprimir.diferencia === 0 ? '#DCFCE7' : '#FEE2E2' }}>
                      <td>DIFERENCIA REGISTRADA (SOBRANTE / FALTANTE)</td>
                      <td style={{ textAlign: 'right', color: modalImprimir.diferencia === 0 ? '#15803D' : '#991B1B' }}>
                        {formatLempiras(modalImprimir.diferencia)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* JUSTIFICACIÓN / OBSERVACIONES */}
              <div style={{ marginBottom: '24px', fontSize: '11px', padding: '10px', backgroundColor: '#FAFAF9', border: '1px solid #D6D3D1' }}>
                <strong>NOTAS Y OBSERVACIONES DE AUDITORÍA:</strong>
                <div style={{ marginTop: '4px', color: '#44403C' }}>{modalImprimir.observaciones || 'Sin observaciones'}</div>
              </div>

              {/* FIRMAS DE RESPONSABILIDAD */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', marginTop: '40px', textAlign: 'center', fontSize: '11px' }}>
                <div>
                  <div style={{ borderTop: '1.5px solid #1C1917', paddingTop: '6px', fontWeight: 800 }}>
                    ________________________________
                  </div>
                  <div>FIRMA Y NOMBRE DEL CAJERO</div>
                  <div style={{ fontSize: '10px', color: '#78716C' }}>Declaración Bajo Juramento</div>
                </div>

                <div>
                  <div style={{ borderTop: '1.5px solid #1C1917', paddingTop: '6px', fontWeight: 800 }}>
                    ________________________________
                  </div>
                  <div>FIRMA SUPERVISOR / GERENCIA</div>
                  <div style={{ fontSize: '10px', color: '#78716C' }}>Aprobado y Conforme</div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }} className="no-print">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setModalImprimir(null)}
              >
                CERRAR
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => window.print()}
              >
                <Printer size={16} /> IMPRIMIR CIERRE (PDF)
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
    gap: '10px',
    padding: '14px 18px',
    backgroundColor: '#DCFCE7',
    border: '2px solid #15803D',
    borderRadius: 'var(--radius-xs)',
    marginBottom: '20px',
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
    backgroundColor: '#FFFFFF',
  },
  modalHeader: {
    paddingBottom: '12px',
    borderBottom: '2px solid var(--color-border)',
  },
};
