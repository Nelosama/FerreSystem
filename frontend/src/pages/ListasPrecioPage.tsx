import React, { useState } from 'react';
import { TopBar } from '../components/TopBar';
import { Plus, CheckCircle } from 'lucide-react';

export interface ListaPrecioItem {
  id: string;
  nombreSegmento: string; // Consumidor Final | Mayorista | Contratista
  descuentoPorcentaje: number;
  descripcion: string;
  clientesCount: number;
}

const INITIAL_LISTAS: ListaPrecioItem[] = [
  { id: 'lp-1', nombreSegmento: 'Consumidor Final', descuentoPorcentaje: 0, descripcion: 'Precio de catálogo estándar', clientesCount: 150 },
  { id: 'lp-2', nombreSegmento: 'Mayorista / Subdistribuidor', descuentoPorcentaje: 10, descripcion: 'Descuento automático del 10% en POS', clientesCount: 18 },
  { id: 'lp-3', nombreSegmento: 'Contratista / Maestro de Obra', descuentoPorcentaje: 7, descripcion: 'Descuento especial del 7% en volúmenes', clientesCount: 35 },
];

export const ListasPrecioPage: React.FC = () => {
  const [listas, setListas] = useState<ListaPrecioItem[]>(() => {
    const saved = localStorage.getItem('ferre_mock_listas_precio');
    return saved ? JSON.parse(saved) : INITIAL_LISTAS;
  });

  React.useEffect(() => {
    localStorage.setItem('ferre_mock_listas_precio', JSON.stringify(listas));
  }, [listas]);

  const [modalNuevo, setModalNuevo] = useState(false);
  const [segNombre, setSegNombre] = useState('');
  const [descPct, setDescPct] = useState('5');
  const [descTexto, setDescTexto] = useState('');

  const handleCrearLista = (e: React.FormEvent) => {
    e.preventDefault();
    const nueva: ListaPrecioItem = {
      id: `lp-${Date.now()}`,
      nombreSegmento: segNombre.trim(),
      descuentoPorcentaje: parseFloat(descPct) || 0,
      descripcion: descTexto.trim() || 'Lista de precio personalizada',
      clientesCount: 0,
    };
    setListas([...listas, nueva]);
    setModalNuevo(false);
    setSegNombre('');
    setDescPct('5');
    setDescTexto('');
  };

  return (
    <div style={styles.container}>
      <TopBar title="LISTAS DE PRECIO Y SEGMENTACIÓN DE CLIENTES" subtitle="Tarifas Diferenciadas (Consumidor | Mayorista | Contratista)" />

      <main style={styles.content}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ fontSize: '13px', color: '#78716C', fontWeight: 600 }}>
            Al seleccionar el tipo de cliente en el POS, el sistema aplica automáticamente el porcentaje o tarifa correspondiente.
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setModalNuevo(true)}>
            <Plus size={18} /> NUEVA LISTA DE PRECIO
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
          {listas.map((l) => (
            <div key={l.id} className="industrial-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span className="badge badge-dark" style={{ fontSize: '11px' }}>SEGMENTO CLIENTE</span>
                  <span style={{ fontSize: '20px', fontWeight: 900, color: 'var(--color-primary)', fontFamily: 'var(--font-display)' }}>
                    -{l.descuentoPorcentaje}%
                  </span>
                </div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, textTransform: 'uppercase', margin: '0 0 6px 0' }}>{l.nombreSegmento}</h3>
                <p style={{ fontSize: '12px', color: '#78716C', margin: 0 }}>{l.descripcion}</p>
              </div>

              <div style={{ marginTop: '20px', paddingTop: '12px', borderTop: '1px solid #D6D3D1', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: '#44403C' }}>
                <span>Clientes Asignados: <strong>{l.clientesCount}</strong></span>
                <span className="badge badge-success">ACTIVA</span>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Modal Nueva Lista */}
      {modalNuevo && (
        <div style={styles.modalOverlay}>
          <div className="industrial-card" style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>CREAR SEGMENTO / LISTA DE PRECIOS</h2>
            </div>
            <form onSubmit={handleCrearLista} style={{ marginTop: '16px' }}>
              <div className="form-group">
                <label className="form-label">NOMBRE DEL SEGMENTO</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Institucional / Gobierno"
                  value={segNombre}
                  onChange={(e) => setSegNombre(e.target.value)}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">% DE DESCUENTO AUTOMÁTICO EN POS</label>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={descPct}
                  onChange={(e) => setDescPct(e.target.value)}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label className="form-label">DESCRIPCIÓN / CONDICIONES</label>
                <input
                  type="text"
                  placeholder="Ej. Aplica para compras al por mayor"
                  value={descTexto}
                  onChange={(e) => setDescTexto(e.target.value)}
                  className="form-input"
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setModalNuevo(false)}>
                  CANCELAR
                </button>
                <button type="submit" className="btn btn-primary">
                  <CheckCircle size={16} /> GUARDAR LISTA
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
