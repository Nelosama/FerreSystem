import React, { useState } from 'react';
import { TopBar } from '../components/TopBar';
import { Calculator, CheckCircle, Clock } from 'lucide-react';
import { formatLempiras } from '../utils/format';
import { useMockData } from '../context/MockDataContext';

export interface ArqueoRecord {
  id: string;
  usuarioNombre: string;
  fecha: string;
  efectivoEsperado: number;
  efectivoContado: number;
  diferencia: number;
  tipoDiferencia: 'CUADRADO' | 'SOBRANTE' | 'FALTANTE';
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
    observaciones: 'Turno sin novedades',
  },
  {
    id: 'arq-2',
    usuarioNombre: 'Carlos Ramos (Cajero Principal)',
    fecha: '2026-03-23 17:05:00',
    efectivoEsperado: 8400.0,
    efectivoContado: 8350.0,
    diferencia: -50.0,
    tipoDiferencia: 'FALTANTE',
    observaciones: 'Faltante de L.50 en cambio de billetes',
  },
];

export const ArqueoCajaPage: React.FC = () => {
  const { ventas } = useMockData();
  const [arqueos, setArqueos] = useState<ArqueoRecord[]>(() => {
    const saved = localStorage.getItem('ferre_mock_arqueos');
    return saved ? JSON.parse(saved) : INITIAL_ARQUEOS;
  });

  React.useEffect(() => {
    localStorage.setItem('ferre_mock_arqueos', JSON.stringify(arqueos));
  }, [arqueos]);

  const ventasEfectivoTurno = ventas
    .filter((v) => v.metodoPago === 'EFECTIVO')
    .reduce((acc, v) => acc + v.total, 0);

  const fondoInicial = 1000.0;
  const totalEsperado = fondoInicial + ventasEfectivoTurno;

  const [montoContadoInput, setMontoContadoInput] = useState('');
  const [notasInput, setNotasInput] = useState('');
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);

  const handleCerrarTurno = (e: React.FormEvent) => {
    e.preventDefault();
    const contado = parseFloat(montoContadoInput) || 0;
    const diff = contado - totalEsperado;

    let tipo: 'CUADRADO' | 'SOBRANTE' | 'FALTANTE' = 'CUADRADO';
    if (diff > 0) tipo = 'SOBRANTE';
    if (diff < 0) tipo = 'FALTANTE';

    const nuevo: ArqueoRecord = {
      id: `arq-${Date.now()}`,
      usuarioNombre: 'Carlos Ramos (Cajero Principal)',
      fecha: new Date().toLocaleString('es-HN'),
      efectivoEsperado: totalEsperado,
      efectivoContado: contado,
      diferencia: diff,
      tipoDiferencia: tipo,
      observaciones: notasInput.trim() || 'Cierre de turno habitual',
    };

    setArqueos([nuevo, ...arqueos]);
    setMontoContadoInput('');
    setNotasInput('');
    setMensajeExito('¡Cierre y Arqueo de Caja registrado correctamente!');
    setTimeout(() => setMensajeExito(null), 4000);
  };

  return (
    <div style={styles.container}>
      <TopBar title="ARQUEO Y CIERRE DE CAJA" subtitle="Control diario de efectivo por cajero y turno" />

      <main style={styles.content}>
        {mensajeExito && (
          <div style={styles.successBanner}>
            <CheckCircle size={20} color="#15803D" />
            <span style={{ fontWeight: 700 }}>{mensajeExito}</span>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '24px' }}>
          <div className="industrial-card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', borderBottom: '2px solid #292524', paddingBottom: '10px' }}>
              <Calculator size={22} color="var(--color-primary)" />
              <h2 style={{ fontSize: '15px', textTransform: 'uppercase' }}>CIERRE Y CONTEO DE CAJA ACTUAL</h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', backgroundColor: '#FAFAF9', padding: '16px', border: '1.5px solid #D6D3D1', borderRadius: '4px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span>Fondo de Caja Fijo:</span>
                <span style={{ fontWeight: 700 }}>{formatLempiras(fondoInicial)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span>Ventas Efectivo del Turno:</span>
                <span style={{ fontWeight: 700, color: '#16A34A' }}>{formatLempiras(ventasEfectivoTurno)}</span>
              </div>
              <div style={{ height: '1px', backgroundColor: '#D6D3D1', margin: '4px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 900 }}>
                <span>EFECTIVO ESPERADO EN CAJA:</span>
                <span style={{ color: 'var(--color-primary)' }}>{formatLempiras(totalEsperado)}</span>
              </div>
            </div>

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

              {montoContadoInput && (
                <div style={{ padding: '12px', borderRadius: '4px', marginBottom: '14px', backgroundColor: parseFloat(montoContadoInput) === totalEsperado ? '#DCFCE7' : '#FEE2E2', border: '1.5px solid #1C1917' }}>
                  <div style={{ fontSize: '12px', fontWeight: 800 }}>
                    DIFERENCIA: {formatLempiras(parseFloat(montoContadoInput) - totalEsperado)}
                  </div>
                  <div style={{ fontSize: '11px', marginTop: '2px' }}>
                    {parseFloat(montoContadoInput) === totalEsperado
                      ? '✓ Caja perfectamente cuadrada'
                      : parseFloat(montoContadoInput) > totalEsperado
                      ? '⚠ Hay dinero sobrante en el arqueo'
                      : '⚠ Hay dinero faltante en el arqueo'}
                  </div>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">NOTAS O JUSTIFICACIÓN</label>
                <textarea
                  placeholder="Escriba aquí notas de billetes o diferencia..."
                  value={notasInput}
                  onChange={(e) => setNotasInput(e.target.value)}
                  className="form-input"
                  rows={2}
                />
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '12px' }}>
                <CheckCircle size={18} /> REGISTRAR ARQUEO Y CERRAR TURNO
              </button>
            </form>
          </div>

          <div className="industrial-card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', borderBottom: '2px solid #292524', paddingBottom: '10px' }}>
              <Clock size={22} color="#0284C7" />
              <h2 style={{ fontSize: '15px', textTransform: 'uppercase' }}>HISTORIAL DE ARQUEOS POR CAJERO</h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '420px', overflowY: 'auto' }}>
              {arqueos.map((a) => (
                <div key={a.id} style={{ padding: '12px', backgroundColor: '#FAFAF9', border: '1.5px solid #D6D3D1', borderRadius: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 800, fontSize: '12px' }}>{a.usuarioNombre}</span>
                    <span style={{ fontSize: '11px', color: '#78716C' }}>{a.fecha}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '12px' }}>
                    <span>Esperado: {formatLempiras(a.efectivoEsperado)}</span>
                    <span>Contado: {formatLempiras(a.efectivoContado)}</span>
                  </div>
                  <div style={{ marginTop: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', color: '#78716C' }}>{a.observaciones}</span>
                    {a.tipoDiferencia === 'CUADRADO' && <span className="badge badge-success">CUADRADO</span>}
                    {a.tipoDiferencia === 'SOBRANTE' && <span className="badge badge-warning">SOBRANTE ({formatLempiras(a.diferencia)})</span>}
                    {a.tipoDiferencia === 'FALTANTE' && <span className="badge badge-danger">FALTANTE ({formatLempiras(a.diferencia)})</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
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
};
