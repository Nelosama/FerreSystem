import React, { useState } from 'react';
import { TopBar } from '../components/TopBar';
import { Truck, Plus, PackageCheck, Building2, Check } from 'lucide-react';
import { formatLempiras } from '../utils/format';
import { useMockData } from '../context/MockDataContext';

export interface ProveedorItem {
  id: string;
  nombre: string;
  rtn: string;
  contacto: string;
  telefono: string;
}

export interface OrdenCompraItem {
  id: string;
  numeroOrden: string;
  proveedorNombre: string;
  fechaEmision: string;
  fechaEntregaEsperada: string;
  totalEsperado: number;
  estado: 'PENDIENTE' | 'RECIBIDA_PARCIAL' | 'RECIBIDA_TOTAL';
  items: Array<{
    productoId: string;
    productoNombre: string;
    cantidadPedida: number;
    cantidadRecibida: number;
    costoUnitario: number;
  }>;
}

const INITIAL_PROVEEDORES: ProveedorItem[] = [
  { id: 'prv-1', nombre: 'Distribuidora Truper Honduras', rtn: '08019001122334', contacto: 'Mario Zelaya', telefono: '+504 2234-5678' },
  { id: 'prv-2', nombre: 'Aceros de Centroamérica S.A.', rtn: '05019002233445', contacto: 'Lic. Claudia Meza', telefono: '+504 2556-7890' },
];

const INITIAL_ORDENES: OrdenCompraItem[] = [
  {
    id: 'oc-1',
    numeroOrden: 'OC-2026-001',
    proveedorNombre: 'Distribuidora Truper Honduras',
    fechaEmision: '2026-03-15',
    fechaEntregaEsperada: '2026-03-25',
    totalEsperado: 4500.0,
    estado: 'PENDIENTE',
    items: [
      { productoId: 'p-1', productoNombre: 'Martillo de Uña Curva 16oz Stanley', cantidadPedida: 20, cantidadRecibida: 0, costoUnitario: 160.0 },
      { productoId: 'p-6', productoNombre: 'Cinta Métrica 8m Truper', cantidadPedida: 10, cantidadRecibida: 0, costoUnitario: 130.0 },
    ],
  },
];

export const OrdenesCompraPage: React.FC = () => {
  const { productos } = useMockData();
  const [proveedores, setProveedores] = useState<ProveedorItem[]>(() => {
    const saved = localStorage.getItem('ferre_mock_proveedores');
    return saved ? JSON.parse(saved) : INITIAL_PROVEEDORES;
  });

  const [ordenes, setOrdenes] = useState<OrdenCompraItem[]>(() => {
    const saved = localStorage.getItem('ferre_mock_ordenes');
    return saved ? JSON.parse(saved) : INITIAL_ORDENES;
  });

  React.useEffect(() => {
    localStorage.setItem('ferre_mock_proveedores', JSON.stringify(proveedores));
  }, [proveedores]);

  React.useEffect(() => {
    localStorage.setItem('ferre_mock_ordenes', JSON.stringify(ordenes));
  }, [ordenes]);

  const [tab, setTab] = useState<'ordenes' | 'proveedores'>('ordenes');
  const [search, setSearch] = useState('');
  const [modalNuevaOC, setModalNuevaOC] = useState(false);
  const [modalNuevoProv, setModalNuevoProv] = useState(false);

  // Form Proveedor
  const [provNombre, setProvNombre] = useState('');
  const [provRtn, setProvRtn] = useState('');
  const [provContacto, setProvContacto] = useState('');
  const [provTelefono, setProvTelefono] = useState('');

  // Form Orden Compra
  const [ocProvId, setOcProvId] = useState(proveedores[0]?.id || 'prv-1');
  const [ocProdId, setOcProdId] = useState(productos[0]?.id || 'p-1');
  const [ocCantidad, setOcCantidad] = useState('10');
  const [ocCosto, setOcCosto] = useState('150');

  const handleCrearProveedor = (e: React.FormEvent) => {
    e.preventDefault();
    const nuevo: ProveedorItem = {
      id: `prv-${Date.now()}`,
      nombre: provNombre.trim(),
      rtn: provRtn.trim(),
      contacto: provContacto.trim(),
      telefono: provTelefono.trim(),
    };
    setProveedores([...proveedores, nuevo]);
    setModalNuevoProv(false);
    setProvNombre('');
    setProvRtn('');
    setProvContacto('');
    setProvTelefono('');
  };

  const handleCrearOrden = (e: React.FormEvent) => {
    e.preventDefault();
    const prv = proveedores.find((p) => p.id === ocProvId);
    const prod = productos.find((p) => p.id === ocProdId);
    const qty = parseInt(ocCantidad, 10) || 1;
    const costo = parseFloat(ocCosto) || 0;

    const nueva: OrdenCompraItem = {
      id: `oc-${Date.now()}`,
      numeroOrden: `OC-2026-${(ordenes.length + 1).toString().padStart(3, '0')}`,
      proveedorNombre: prv ? prv.nombre : 'Proveedor General',
      fechaEmision: new Date().toISOString().split('T')[0],
      fechaEntregaEsperada: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      totalEsperado: qty * costo,
      estado: 'PENDIENTE',
      items: [
        {
          productoId: prod ? prod.id : 'p-1',
          productoNombre: prod ? prod.nombre : 'Producto',
          cantidadPedida: qty,
          cantidadRecibida: 0,
          costoUnitario: costo,
        },
      ],
    };

    setOrdenes([nueva, ...ordenes]);
    setModalNuevaOC(false);
  };

  const handleRecepcionTotal = (id: string) => {
    setOrdenes(
      ordenes.map((o) => {
        if (o.id === id) {
          const updatedItems = o.items.map((i) => ({ ...i, cantidadRecibida: i.cantidadPedida }));
          return { ...o, estado: 'RECIBIDA_TOTAL', items: updatedItems };
        }
        return o;
      }),
    );
  };

  return (
    <div style={styles.container}>
      <TopBar title="ÓRDENES DE COMPRA Y PROVEEDORES" subtitle="Recepción de Inventario y Control de Abastecimiento" />

      <main style={styles.content}>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          <button
            type="button"
            className={`btn ${tab === 'ordenes' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab('ordenes')}
          >
            <Truck size={16} /> ÓRDENES DE COMPRA ({ordenes.length})
          </button>
          <button
            type="button"
            className={`btn ${tab === 'proveedores' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab('proveedores')}
          >
            <Building2 size={16} /> CATÁLOGO PROVEEDORES ({proveedores.length})
          </button>
        </div>

        {tab === 'ordenes' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Buscar por número de orden o proveedor..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="form-input"
                style={{ maxWidth: '340px' }}
              />
              <button type="button" className="btn btn-primary" onClick={() => setModalNuevaOC(true)}>
                <Plus size={18} /> NUEVA ÓRDEN DE COMPRA
              </button>
            </div>

            <div className="table-container" style={{ marginTop: '20px' }}>
              <table className="industrial-table">
                <thead>
                  <tr>
                    <th>Nº ÓRDEN</th>
                    <th>PROVEEDOR</th>
                    <th>FECHA EMISIÓN</th>
                    <th style={{ textAlign: 'right' }}>TOTAL ESPERADO</th>
                    <th style={{ textAlign: 'center' }}>ESTADO</th>
                    <th style={{ textAlign: 'center' }}>RECEPCIÓN DE STOCK</th>
                  </tr>
                </thead>
                <tbody>
                  {ordenes.map((o) => (
                    <tr key={o.id}>
                      <td style={{ fontFamily: 'var(--font-display)', fontWeight: 800 }}>{o.numeroOrden}</td>
                      <td style={{ fontWeight: 700 }}>{o.proveedorNombre}</td>
                      <td>{o.fechaEmision}</td>
                      <td style={{ textAlign: 'right', fontWeight: 800 }}>{formatLempiras(o.totalEsperado)}</td>
                      <td style={{ textAlign: 'center' }}>
                        {o.estado === 'PENDIENTE' && <span className="badge badge-warning">PENDIENTE</span>}
                        {o.estado === 'RECIBIDA_PARCIAL' && <span className="badge badge-dark">RECIBIDA PARCIAL</span>}
                        {o.estado === 'RECIBIDA_TOTAL' && <span className="badge badge-success">RECIBIDA TOTAL</span>}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {o.estado !== 'RECIBIDA_TOTAL' && (
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            onClick={() => handleRecepcionTotal(o.id)}
                          >
                            <PackageCheck size={14} /> CONFIRMAR RECEPCIÓN TOTAL
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'proveedores' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '14px' }}>LISTADO DE PROVEEDORES</div>
              <button type="button" className="btn btn-primary" onClick={() => setModalNuevoProv(true)}>
                <Plus size={18} /> REGISTRAR PROVEEDOR
              </button>
            </div>

            <div className="table-container" style={{ marginTop: '20px' }}>
              <table className="industrial-table">
                <thead>
                  <tr>
                    <th>NOMBRE EMPRESA</th>
                    <th>RTN</th>
                    <th>CONTACTO PRINCIPAL</th>
                    <th>TELÉFONO</th>
                  </tr>
                </thead>
                <tbody>
                  {proveedores.map((p) => (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 800 }}>{p.nombre}</td>
                      <td style={{ fontFamily: 'monospace' }}>{p.rtn}</td>
                      <td>{p.contacto}</td>
                      <td>{p.telefono}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Modal Nueva OC */}
      {modalNuevaOC && (
        <div style={styles.modalOverlay}>
          <div className="industrial-card" style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>CREAR ÓRDEN DE COMPRA</h2>
            </div>
            <form onSubmit={handleCrearOrden} style={{ marginTop: '16px' }}>
              <div className="form-group">
                <label className="form-label">SELECCIONAR PROVEEDOR</label>
                <select value={ocProvId} onChange={(e) => setOcProvId(e.target.value)} className="form-select">
                  {proveedores.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">PRODUCTO A REABASTECER</label>
                <select value={ocProdId} onChange={(e) => setOcProdId(e.target.value)} className="form-select">
                  {productos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} (Stock actual: {p.stockActual})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">CANTIDAD PEDIDA</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={ocCantidad}
                    onChange={(e) => setOcCantidad(e.target.value)}
                    className="form-input"
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">COSTO UNITARIO ESPERADO (L.)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={ocCosto}
                    onChange={(e) => setOcCosto(e.target.value)}
                    className="form-input"
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setModalNuevaOC(false)}>
                  CANCELAR
                </button>
                <button type="submit" className="btn btn-primary">
                  <Check size={16} /> GENERAR ÓRDEN DE COMPRA
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Nuevo Proveedor */}
      {modalNuevoProv && (
        <div style={styles.modalOverlay}>
          <div className="industrial-card" style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>REGISTRAR PROVEEDOR</h2>
            </div>
            <form onSubmit={handleCrearProveedor} style={{ marginTop: '16px' }}>
              <div className="form-group">
                <label className="form-label">NOMBRE DE LA EMPRESA / RAZÓN SOCIAL</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Distribuidora Central S.A."
                  value={provNombre}
                  onChange={(e) => setProvNombre(e.target.value)}
                  className="form-input"
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">RTN DE EMPRESA</label>
                  <input
                    type="text"
                    required
                    placeholder="08019000000000"
                    value={provRtn}
                    onChange={(e) => setProvRtn(e.target.value)}
                    className="form-input"
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">TELÉFONO</label>
                  <input
                    type="text"
                    required
                    placeholder="+504 2550-0000"
                    value={provTelefono}
                    onChange={(e) => setProvTelefono(e.target.value)}
                    className="form-input"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">CONTACTO PRINCIPAL / VENDEDOR</label>
                <input
                  type="text"
                  placeholder="Ej. Juan Pérez"
                  value={provContacto}
                  onChange={(e) => setProvContacto(e.target.value)}
                  className="form-input"
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setModalNuevoProv(false)}>
                  CANCELAR
                </button>
                <button type="submit" className="btn btn-primary">
                  <Check size={16} /> GUARDAR PROVEEDOR
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
