import React, { useState } from 'react';
import { TopBar } from '../components/TopBar';
import { Plus, Search, Bell, CheckCircle } from 'lucide-react';
import { formatLempiras } from '../utils/format';

export interface PedidoEspecialItem {
  id: string;
  codigo: string;
  clienteNombre: string;
  clienteTelefono: string;
  productoNombre: string;
  cantidad: number;
  precioEstimado: number;
  fechaSolicitud: string;
  estado: 'PENDIENTE' | 'STOCK_LLEGA' | 'NOTIFICADO' | 'ENTREGADO';
}

const INITIAL_PEDIDOS: PedidoEspecialItem[] = [
  {
    id: 'pe-1',
    codigo: 'PE-2026-001',
    clienteNombre: 'Ing. Roberto Flores',
    clienteTelefono: '+504 3311-2244',
    productoNombre: 'Tubo PVC Sanitario 4" x 6m Durman',
    cantidad: 50,
    precioEstimado: 19000.0,
    fechaSolicitud: '2026-03-18',
    estado: 'PENDIENTE',
  },
  {
    id: 'pe-2',
    codigo: 'PE-2026-002',
    clienteNombre: 'Constructora del Norte',
    clienteTelefono: '+504 9876-5432',
    productoNombre: 'Cable THHN Calibre 12 AWG Rollo 100m',
    cantidad: 10,
    precioEstimado: 14500.0,
    fechaSolicitud: '2026-03-21',
    estado: 'STOCK_LLEGA',
  },
];

export const PedidosEspecialesPage: React.FC = () => {
  const [pedidos, setPedidos] = useState<PedidoEspecialItem[]>(() => {
    const saved = localStorage.getItem('ferre_mock_pedidos_especiales');
    return saved ? JSON.parse(saved) : INITIAL_PEDIDOS;
  });

  React.useEffect(() => {
    localStorage.setItem('ferre_mock_pedidos_especiales', JSON.stringify(pedidos));
  }, [pedidos]);

  const [search, setSearch] = useState('');
  const [modalNuevo, setModalNuevo] = useState(false);
  const [notificacionExito, setNotificacionExito] = useState<string | null>(null);

  // Form
  const [cliNombre, setCliNombre] = useState('');
  const [cliTel, setCliTel] = useState('');
  const [prodNombre, setProdNombre] = useState('');
  const [cant, setCant] = useState('1');
  const [precio, setPrecio] = useState('0');

  const handleCrearPedido = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseInt(cant, 10) || 1;
    const p = parseFloat(precio) || 0;

    const nuevo: PedidoEspecialItem = {
      id: `pe-${Date.now()}`,
      codigo: `PE-2026-${(pedidos.length + 1).toString().padStart(3, '0')}`,
      clienteNombre: cliNombre.trim(),
      clienteTelefono: cliTel.trim(),
      productoNombre: prodNombre.trim(),
      cantidad: qty,
      precioEstimado: p * qty,
      fechaSolicitud: new Date().toISOString().split('T')[0],
      estado: 'PENDIENTE',
    };

    setPedidos([nuevo, ...pedidos]);
    setModalNuevo(false);
    setCliNombre('');
    setCliTel('');
    setProdNombre('');
  };

  const handleNotificarCliente = (pe: PedidoEspecialItem) => {
    setPedidos(
      pedidos.map((p) => (p.id === pe.id ? { ...p, estado: 'NOTIFICADO' } : p)),
    );
    setNotificacionExito(`¡Notificación enviada a ${pe.clienteNombre} (${pe.clienteTelefono})!`);
    setTimeout(() => setNotificacionExito(null), 4000);
  };

  return (
    <div style={styles.container}>
      <TopBar title="PEDIDOS ESPECIALES (BACKORDER)" subtitle="Encargos de productos sin stock & Notificación a clientes" />

      <main style={styles.content}>
        {notificacionExito && (
          <div style={styles.successBanner}>
            <Bell size={20} color="#15803D" />
            <span style={{ fontWeight: 700 }}>{notificacionExito}</span>
          </div>
        )}

        <div style={styles.actionsBar}>
          <div style={styles.searchWrapper}>
            <Search size={18} style={styles.searchIcon} />
            <input
              type="text"
              placeholder="Buscar por cliente o producto encargado..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-input"
              style={{ paddingLeft: '38px' }}
            />
          </div>

          <button type="button" className="btn btn-primary" onClick={() => setModalNuevo(true)}>
            <Plus size={18} /> REGISTRAR PEDIDO ESPECIAL
          </button>
        </div>

        <div className="table-container" style={{ marginTop: '20px' }}>
          <table className="industrial-table">
            <thead>
              <tr>
                <th>CÓDIGO</th>
                <th>CLIENTE</th>
                <th>PRODUCTO ENCARGADO</th>
                <th style={{ textAlign: 'center' }}>CANT.</th>
                <th style={{ textAlign: 'right' }}>VALOR ESTIMADO</th>
                <th style={{ textAlign: 'center' }}>FECHA SOLICITUD</th>
                <th style={{ textAlign: 'center' }}>ESTADO</th>
                <th style={{ textAlign: 'center' }}>ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {pedidos.map((p) => (
                <tr key={p.id}>
                  <td style={{ fontFamily: 'var(--font-display)', fontWeight: 800 }}>{p.codigo}</td>
                  <td>
                    <div style={{ fontWeight: 700 }}>{p.clienteNombre}</div>
                    <div style={{ fontSize: '11px', color: '#78716C' }}>{p.clienteTelefono}</div>
                  </td>
                  <td style={{ fontWeight: 600 }}>{p.productoNombre}</td>
                  <td style={{ textAlign: 'center', fontWeight: 900 }}>{p.cantidad}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatLempiras(p.precioEstimado)}</td>
                  <td style={{ textAlign: 'center', fontSize: '12px' }}>{p.fechaSolicitud}</td>
                  <td style={{ textAlign: 'center' }}>
                    {p.estado === 'PENDIENTE' && <span className="badge badge-warning">EN ESPERA STOCK</span>}
                    {p.estado === 'STOCK_LLEGA' && <span className="badge badge-dark">STOCK DISPONIBLE</span>}
                    {p.estado === 'NOTIFICADO' && <span className="badge badge-success">CLIENTE NOTIFICADO</span>}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {p.estado !== 'NOTIFICADO' && (
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        onClick={() => handleNotificarCliente(p)}
                      >
                        <Bell size={13} /> NOTIFICAR AL CLIENTE
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {/* Modal Nuevo Pedido */}
      {modalNuevo && (
        <div style={styles.modalOverlay}>
          <div className="industrial-card" style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>REGISTRAR PEDIDO ESPECIAL DE CLIENTE</h2>
            </div>
            <form onSubmit={handleCrearPedido} style={{ marginTop: '16px' }}>
              <div style={{ display: 'flex', gap: '12px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">NOMBRE DEL CLIENTE</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Ing. Roberto Flores"
                    value={cliNombre}
                    onChange={(e) => setCliNombre(e.target.value)}
                    className="form-input"
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">TELÉFONO DE NOTIFICACIÓN</label>
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

              <div className="form-group">
                <label className="form-label">DESCRIPCIÓN DEL PRODUCTO SOLICITADO</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Saco de Cemento Bijao 42.5kg x 100 unidades"
                  value={prodNombre}
                  onChange={(e) => setProdNombre(e.target.value)}
                  className="form-input"
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">CANTIDAD REQUERIDA</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={cant}
                    onChange={(e) => setCant(e.target.value)}
                    className="form-input"
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">PRECIO ESTIMADO UNITARIO (L.)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={precio}
                    onChange={(e) => setPrecio(e.target.value)}
                    className="form-input"
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setModalNuevo(false)}>
                  CANCELAR
                </button>
                <button type="submit" className="btn btn-primary">
                  <CheckCircle size={16} /> GUARDAR PEDIDO
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
    maxWidth: '540px',
  },
  modalHeader: {
    paddingBottom: '12px',
    borderBottom: '2px solid var(--color-border)',
  },
};
