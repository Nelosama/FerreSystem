import React, { useState } from 'react';
import { TopBar } from '../components/TopBar';
import { GitBranch, ArrowRight, Plus, CheckCircle } from 'lucide-react';
import { useMockData } from '../context/MockDataContext';

export interface TransferenciaItem {
  id: string;
  codigo: string;
  sucursalOrigen: string;
  sucursalDestino: string;
  productoId: string;
  productoNombre: string;
  cantidad: number;
  fechaEnvio: string;
  estado: 'EN_TRANSITO' | 'RECIBIDO';
  usuarioNombre: string;
}

const INITIAL_TRANSFERENCIAS: TransferenciaItem[] = [
  {
    id: 'trf-1',
    codigo: 'TRF-2026-001',
    sucursalOrigen: 'Sucursal Centro (Principal)',
    sucursalDestino: 'Sucursal Circunvalación',
    productoId: 'p-1',
    productoNombre: 'Martillo de Uña Curva 16oz Stanley',
    cantidad: 5,
    fechaEnvio: '2026-03-22',
    estado: 'EN_TRANSITO',
    usuarioNombre: 'Carlos Ramos (Admin)',
  },
];

export const TransferenciasPage: React.FC = () => {
  const { productos } = useMockData();
  const [transferencias, setTransferencias] = useState<TransferenciaItem[]>(() => {
    const saved = localStorage.getItem('ferre_mock_transferencias');
    return saved ? JSON.parse(saved) : INITIAL_TRANSFERENCIAS;
  });

  React.useEffect(() => {
    localStorage.setItem('ferre_mock_transferencias', JSON.stringify(transferencias));
  }, [transferencias]);

  const [modalNuevo, setModalNuevo] = useState(false);
  const [sucOrigen, setSucOrigen] = useState('Sucursal Centro (Principal)');
  const [sucDestino, setSucDestino] = useState('Sucursal Circunvalación');
  const [selectedProdId, setSelectedProdId] = useState(productos[0]?.id || 'p-1');
  const [cantidad, setCantidad] = useState('2');

  const handleCrearTransferencia = (e: React.FormEvent) => {
    e.preventDefault();
    const prod = productos.find((p) => p.id === selectedProdId);
    const qty = parseInt(cantidad, 10) || 1;

    const nueva: TransferenciaItem = {
      id: `trf-${Date.now()}`,
      codigo: `TRF-2026-${(transferencias.length + 1).toString().padStart(3, '0')}`,
      sucursalOrigen: sucOrigen,
      sucursalDestino: sucDestino,
      productoId: prod ? prod.id : 'p-1',
      productoNombre: prod ? prod.nombre : 'Producto',
      cantidad: qty,
      fechaEnvio: new Date().toISOString().split('T')[0],
      estado: 'EN_TRANSITO',
      usuarioNombre: 'Carlos Ramos (Admin)',
    };

    setTransferencias([nueva, ...transferencias]);
    setModalNuevo(false);
  };

  const handleConfirmarRecepcion = (id: string) => {
    setTransferencias(
      transferencias.map((t) => (t.id === id ? { ...t, estado: 'RECIBIDO' } : t)),
    );
  };

  return (
    <div style={styles.container}>
      <TopBar title="TRANSFERENCIAS ENTRE SUCURSALES" subtitle="Movimiento e Intercambio de Stock Inter-Sede" />

      <main style={styles.content}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ fontSize: '13px', color: '#78716C', fontWeight: 600 }}>
            Permite mover stock entre sucursales de forma segura descontando el origen y sumando al confirmar destino.
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setModalNuevo(true)}>
            <Plus size={18} /> NUEVA TRANSFERENCIA
          </button>
        </div>

        <div className="table-container">
          <table className="industrial-table">
            <thead>
              <tr>
                <th>CÓDIGO</th>
                <th>ORIGEN</th>
                <th style={{ textAlign: 'center' }}>→</th>
                <th>DESTINO</th>
                <th>ARTÍCULO TRANSFERIDO</th>
                <th style={{ textAlign: 'center' }}>CANTIDAD</th>
                <th style={{ textAlign: 'center' }}>FECHA ENVÍO</th>
                <th style={{ textAlign: 'center' }}>ESTADO</th>
                <th style={{ textAlign: 'center' }}>ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {transferencias.map((t) => (
                <tr key={t.id}>
                  <td style={{ fontFamily: 'var(--font-display)', fontWeight: 800 }}>{t.codigo}</td>
                  <td style={{ fontWeight: 700 }}>{t.sucursalOrigen}</td>
                  <td style={{ textAlign: 'center', color: '#EA580C' }}><ArrowRight size={16} /></td>
                  <td style={{ fontWeight: 700 }}>{t.sucursalDestino}</td>
                  <td style={{ fontWeight: 600 }}>{t.productoNombre}</td>
                  <td style={{ textAlign: 'center', fontWeight: 900, fontSize: '15px' }}>{t.cantidad}</td>
                  <td style={{ textAlign: 'center', fontSize: '12px' }}>{t.fechaEnvio}</td>
                  <td style={{ textAlign: 'center' }}>
                    {t.estado === 'EN_TRANSITO' ? (
                      <span className="badge badge-warning">EN TRÁNSITO</span>
                    ) : (
                      <span className="badge badge-success">RECIBIDO</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {t.estado === 'EN_TRANSITO' && (
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        onClick={() => handleConfirmarRecepcion(t.id)}
                      >
                        <CheckCircle size={13} /> CONFIRMAR RECEPCIÓN EN DESTINO
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {/* Modal Nueva Transferencia */}
      {modalNuevo && (
        <div style={styles.modalOverlay}>
          <div className="industrial-card" style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>CREAR ENVÍO DE TRASLADO</h2>
            </div>
            <form onSubmit={handleCrearTransferencia} style={{ marginTop: '16px' }}>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">SUCURSAL ORIGEN</label>
                  <select value={sucOrigen} onChange={(e) => setSucOrigen(e.target.value)} className="form-select">
                    <option value="Sucursal Centro (Principal)">Sucursal Centro (Principal)</option>
                    <option value="Sucursal Circunvalación">Sucursal Circunvalación</option>
                    <option value="Sucursal Chamelecón">Sucursal Chamelecón</option>
                  </select>
                </div>

                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">SUCURSAL DESTINO</label>
                  <select value={sucDestino} onChange={(e) => setSucDestino(e.target.value)} className="form-select">
                    <option value="Sucursal Circunvalación">Sucursal Circunvalación</option>
                    <option value="Sucursal Chamelecón">Sucursal Chamelecón</option>
                    <option value="Sucursal Centro (Principal)">Sucursal Centro (Principal)</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">PRODUCTO A TRANSFERIR</label>
                <select value={selectedProdId} onChange={(e) => setSelectedProdId(e.target.value)} className="form-select">
                  {productos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} (Disponible en origen: {p.stockActual})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">CANTIDAD A TRASLADAR</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  className="form-input"
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setModalNuevo(false)}>
                  CANCELAR
                </button>
                <button type="submit" className="btn btn-primary">
                  <GitBranch size={16} /> ENVIAR TRASLADO
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
