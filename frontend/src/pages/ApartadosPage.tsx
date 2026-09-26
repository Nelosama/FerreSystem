import React, { useState } from 'react';
import { TopBar } from '../components/TopBar';
import { Plus, Search, DollarSign, CheckCircle, XCircle } from 'lucide-react';
import { formatLempiras } from '../utils/format';
import { useMockData } from '../context/MockDataContext';

export interface ApartadoItem {
  id: string;
  codigo: string;
  clienteNombre: string;
  clienteTelefono: string;
  productoNombre: string;
  productoId: string;
  cantidad: number;
  precioTotal: number;
  montoAbonado: number;
  saldoPendiente: number;
  fechaCreacion: string;
  fechaLimite: string;
  estado: 'ACTIVO' | 'COMPLETADO' | 'CANCELADO';
  historialAbonos: Array<{ id: string; fecha: string; monto: number; nota?: string }>;
}

const INITIAL_APARTADOS: ApartadoItem[] = [
  {
    id: 'apt-1',
    codigo: 'APT-1001',
    clienteNombre: 'María Fernanda López',
    clienteTelefono: '+504 9911-2233',
    productoNombre: 'Martillo de Uña Curva 16oz Stanley',
    productoId: 'p-1',
    cantidad: 2,
    precioTotal: 490.0,
    montoAbonado: 200.0,
    saldoPendiente: 290.0,
    fechaCreacion: '2026-03-20',
    fechaLimite: '2026-04-20',
    estado: 'ACTIVO',
    historialAbonos: [
      { id: 'ab-1', fecha: '2026-03-20', monto: 200.0, nota: 'Abono inicial 40%' },
    ],
  },
  {
    id: 'apt-2',
    codigo: 'APT-1002',
    clienteNombre: 'Juan Carlos Rodríguez',
    clienteTelefono: '+504 3322-1100',
    productoNombre: 'Cable THHN Calibre 12 AWG Rollo 100m',
    productoId: 'p-5',
    cantidad: 1,
    precioTotal: 1450.0,
    montoAbonado: 1450.0,
    saldoPendiente: 0,
    fechaCreacion: '2026-03-10',
    fechaLimite: '2026-04-10',
    estado: 'COMPLETADO',
    historialAbonos: [
      { id: 'ab-2', fecha: '2026-03-10', monto: 500.0, nota: 'Abono inicial' },
      { id: 'ab-3', fecha: '2026-03-22', monto: 950.0, nota: 'Liquidación final' },
    ],
  },
];

export const ApartadosPage: React.FC = () => {
  const { productos } = useMockData();
  const [apartados, setApartados] = useState<ApartadoItem[]>(() => {
    const saved = localStorage.getItem('ferre_mock_apartados');
    return saved ? JSON.parse(saved) : INITIAL_APARTADOS;
  });

  React.useEffect(() => {
    localStorage.setItem('ferre_mock_apartados', JSON.stringify(apartados));
  }, [apartados]);

  const [search, setSearch] = useState('');
  const [modalNuevo, setModalNuevo] = useState(false);
  const [modalAbono, setModalAbono] = useState<ApartadoItem | null>(null);

  // Form Nuevo
  const [clienteNombre, setClienteNombre] = useState('');
  const [clienteTelefono, setClienteTelefono] = useState('');
  const [selectedProdId, setSelectedProdId] = useState(productos[0]?.id || 'p-1');
  const [cantidad, setCantidad] = useState('1');
  const [abonoInicial, setAbonoInicial] = useState('');

  // Form Abono
  const [montoAbono, setMontoAbono] = useState('');
  const [notaAbono, setNotaAbono] = useState('');

  const prodSel = productos.find((p) => p.id === selectedProdId) || productos[0];
  const totalEstimado = (prodSel?.precioVenta || 0) * (parseInt(cantidad, 10) || 1);

  const handleCrearApartado = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseInt(cantidad, 10) || 1;
    const initial = parseFloat(abonoInicial) || 0;
    const total = (prodSel?.precioVenta || 0) * qty;

    const nuevo: ApartadoItem = {
      id: `apt-${Date.now()}`,
      codigo: `APT-${1000 + apartados.length + 1}`,
      clienteNombre: clienteNombre.trim(),
      clienteTelefono: clienteTelefono.trim(),
      productoNombre: prodSel?.nombre || 'Producto',
      productoId: prodSel?.id || '',
      cantidad: qty,
      precioTotal: total,
      montoAbonado: initial,
      saldoPendiente: Math.max(0, total - initial),
      fechaCreacion: new Date().toISOString().split('T')[0],
      fechaLimite: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      estado: initial >= total ? 'COMPLETADO' : 'ACTIVO',
      historialAbonos: initial > 0 ? [{ id: `ab-${Date.now()}`, fecha: new Date().toISOString().split('T')[0], monto: initial, nota: 'Abono Inicial' }] : [],
    };

    setApartados([nuevo, ...apartados]);
    setModalNuevo(false);
    setClienteNombre('');
    setClienteTelefono('');
    setAbonoInicial('');
  };

  const handleRegistrarAbono = (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalAbono) return;
    const monto = parseFloat(montoAbono) || 0;
    if (monto <= 0) return;

    const nuevoAbono = {
      id: `ab-${Date.now()}`,
      fecha: new Date().toISOString().split('T')[0],
      monto,
      nota: notaAbono.trim() || 'Abono parcial',
    };

    setApartados(
      apartados.map((a) => {
        if (a.id === modalAbono.id) {
          const nuevoTotalAbonado = a.montoAbonado + monto;
          const nuevoSaldo = Math.max(0, a.precioTotal - nuevoTotalAbonado);
          return {
            ...a,
            montoAbonado: nuevoTotalAbonado,
            saldoPendiente: nuevoSaldo,
            estado: nuevoSaldo === 0 ? 'COMPLETADO' : 'ACTIVO',
            historialAbonos: [...a.historialAbonos, nuevoAbono],
          };
        }
        return a;
      }),
    );

    setModalAbono(null);
    setMontoAbono('');
    setNotaAbono('');
  };

  const handleCancelarApartado = (id: string) => {
    setApartados(
      apartados.map((a) => (a.id === id ? { ...a, estado: 'CANCELADO' } : a)),
    );
  };

  const filtrados = apartados.filter(
    (a) =>
      a.clienteNombre.toLowerCase().includes(search.toLowerCase()) ||
      a.codigo.toLowerCase().includes(search.toLowerCase()) ||
      a.productoNombre.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div style={styles.container}>
      <TopBar title="MÓDULO DE APARTADOS (LAYAWAY)" subtitle="Reserva de Productos & Pagos Parciales" />

      <main style={styles.content}>
        <div style={styles.actionsBar}>
          <div style={styles.searchWrapper}>
            <Search size={18} style={styles.searchIcon} />
            <input
              type="text"
              placeholder="Buscar por cliente, código o producto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-input"
              style={{ paddingLeft: '38px' }}
            />
          </div>

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setModalNuevo(true)}
          >
            <Plus size={18} /> NUEVO APARTADO
          </button>
        </div>

        <div className="table-container" style={{ marginTop: '20px' }}>
          <table className="industrial-table">
            <thead>
              <tr>
                <th>CÓDIGO</th>
                <th>CLIENTE</th>
                <th>PRODUCTO RESERVADO</th>
                <th style={{ textAlign: 'center' }}>CANT.</th>
                <th style={{ textAlign: 'right' }}>TOTAL</th>
                <th style={{ textAlign: 'right' }}>ABONADO</th>
                <th style={{ textAlign: 'right' }}>SALDO PENDIENTE</th>
                <th style={{ textAlign: 'center' }}>VENCIMIENTO</th>
                <th style={{ textAlign: 'center' }}>ESTADO</th>
                <th style={{ textAlign: 'center' }}>ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((a) => (
                <tr key={a.id}>
                  <td style={{ fontFamily: 'var(--font-display)', fontWeight: 800 }}>{a.codigo}</td>
                  <td>
                    <div style={{ fontWeight: 700 }}>{a.clienteNombre}</div>
                    <div style={{ fontSize: '11px', color: '#78716C' }}>{a.clienteTelefono}</div>
                  </td>
                  <td style={{ fontWeight: 600 }}>{a.productoNombre}</td>
                  <td style={{ textAlign: 'center', fontWeight: 800 }}>{a.cantidad}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatLempiras(a.precioTotal)}</td>
                  <td style={{ textAlign: 'right', color: '#16A34A', fontWeight: 700 }}>{formatLempiras(a.montoAbonado)}</td>
                  <td style={{ textAlign: 'right', color: a.saldoPendiente > 0 ? '#DC2626' : '#78716C', fontWeight: 800 }}>
                    {formatLempiras(a.saldoPendiente)}
                  </td>
                  <td style={{ textAlign: 'center', fontSize: '12px' }}>{a.fechaLimite}</td>
                  <td style={{ textAlign: 'center' }}>
                    {a.estado === 'ACTIVO' && <span className="badge badge-warning">ACTIVO</span>}
                    {a.estado === 'COMPLETADO' && <span className="badge badge-success">COMPLETADO</span>}
                    {a.estado === 'CANCELADO' && <span className="badge badge-danger">CANCELADO</span>}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', gap: '6px' }}>
                      {a.estado === 'ACTIVO' && (
                        <>
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            onClick={() => setModalAbono(a)}
                          >
                            <DollarSign size={13} /> ABONAR
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-secondary"
                            onClick={() => handleCancelarApartado(a.id)}
                            title="Liberar reserva de stock"
                          >
                            <XCircle size={13} /> CANCELAR
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {/* Modal Nuevo Apartado */}
      {modalNuevo && (
        <div style={styles.modalOverlay}>
          <div className="industrial-card" style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>CREAR RESERVA DE APARTADO</h2>
            </div>
            <form onSubmit={handleCrearApartado} style={{ marginTop: '16px' }}>
              <div className="form-group">
                <label className="form-label">NOMBRE COMPLETO DEL CLIENTE</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Carlos Martínez"
                  value={clienteNombre}
                  onChange={(e) => setClienteNombre(e.target.value)}
                  className="form-input"
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">TELÉFONO DE CONTACTO</label>
                  <input
                    type="text"
                    required
                    placeholder="+504 9999-0000"
                    value={clienteTelefono}
                    onChange={(e) => setClienteTelefono(e.target.value)}
                    className="form-input"
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">PRODUCTO A RESERVAR</label>
                  <select
                    value={selectedProdId}
                    onChange={(e) => setSelectedProdId(e.target.value)}
                    className="form-select"
                  >
                    {productos.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre} ({formatLempiras(p.precioVenta)})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">CANTIDAD</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={cantidad}
                    onChange={(e) => setCantidad(e.target.value)}
                    className="form-input"
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">ABONO INICIAL (L.)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={abonoInicial}
                    onChange={(e) => setAbonoInicial(e.target.value)}
                    className="form-input"
                  />
                </div>
              </div>

              <div style={{ padding: '10px 14px', backgroundColor: '#FEF3C7', borderRadius: '4px', fontSize: '12px', fontWeight: 700, color: '#B45309' }}>
                TOTAL A PAGAR: {formatLempiras(totalEstimado)} • SALDO PENDIENTE: {formatLempiras(Math.max(0, totalEstimado - (parseFloat(abonoInicial) || 0)))}
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setModalNuevo(false)}>
                  CANCELAR
                </button>
                <button type="submit" className="btn btn-primary">
                  <CheckCircle size={16} /> CONFIRMAR RESERVA
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Abonar */}
      {modalAbono && (
        <div style={styles.modalOverlay}>
          <div className="industrial-card" style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>REGISTRAR ABONO • {modalAbono.codigo}</h2>
            </div>
            <form onSubmit={handleRegistrarAbono} style={{ marginTop: '16px' }}>
              <div style={{ fontSize: '13px', marginBottom: '12px', color: '#44403C' }}>
                Cliente: <strong>{modalAbono.clienteNombre}</strong> • Saldo actual: <strong style={{ color: '#DC2626' }}>{formatLempiras(modalAbono.saldoPendiente)}</strong>
              </div>

              <div className="form-group">
                <label className="form-label">MONTO A ABONAR (L.)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder={modalAbono.saldoPendiente.toString()}
                  value={montoAbono}
                  onChange={(e) => setMontoAbono(e.target.value)}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">NOTA / OBSERVACIÓN</label>
                <input
                  type="text"
                  placeholder="Ej. Pago parcial en efectivo"
                  value={notaAbono}
                  onChange={(e) => setNotaAbono(e.target.value)}
                  className="form-input"
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setModalAbono(null)}>
                  CANCELAR
                </button>
                <button type="submit" className="btn btn-primary">
                  <DollarSign size={16} /> REGISTRAR PAGO
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
    color: '#78716C',
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
