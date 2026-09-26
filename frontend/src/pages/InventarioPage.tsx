import React, { useState } from 'react';
import { TopBar } from '../components/TopBar';
import { Search, Plus, AlertTriangle, Check, X, Calendar, ShieldCheck } from 'lucide-react';
import { formatLempiras } from '../utils/format';
import { useMockData } from '../context/MockDataContext';
import { useRubroConfig } from '../hooks/useRubroConfig';

export const InventarioPage: React.FC = () => {
  const { productos, agregarProducto } = useMockData();
  const rubroConfig = useRubroConfig();

  const [search, setSearch] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('TODAS');
  const [modalAbierto, setModalAbierto] = useState(false);

  // Form State
  const [formCodigo, setFormCodigo] = useState('');
  const [formNombre, setFormNombre] = useState('');
  const [formCategoria, setFormCategoria] = useState(rubroConfig.categoriasDefault[0] || 'General');
  const [formUnidadMedida, setFormUnidadMedida] = useState(rubroConfig.unidadesMedida[0] || 'unidad');
  const [formPrecioVenta, setFormPrecioVenta] = useState('');
  const [formPrecioCosto, setFormPrecioCosto] = useState('');
  const [formStockActual, setFormStockActual] = useState('');
  const [formStockMinimo, setFormStockMinimo] = useState('');

  // Rubro specific fields
  const [formFechaVencimiento, setFormFechaVencimiento] = useState('');
  const [formLote, setFormLote] = useState('');
  const [formNumeroSerie, setFormNumeroSerie] = useState('');
  const [formMesesGarantia, setFormMesesGarantia] = useState('');

  const categorias = ['TODAS', ...rubroConfig.categoriasDefault];

  const productosFiltrados = productos.filter((p) => {
    const matchSearch =
      p.nombre.toLowerCase().includes(search.toLowerCase()) ||
      p.codigo.toLowerCase().includes(search.toLowerCase());
    const matchCat = filtroCategoria === 'TODAS' || p.categoria === filtroCategoria;
    return matchSearch && matchCat;
  });

  const handleCrearProducto = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCodigo || !formNombre || !formPrecioVenta) return;

    agregarProducto({
      codigo: formCodigo.toUpperCase().trim(),
      nombre: formNombre.trim(),
      categoria: formCategoria,
      precioVenta: parseFloat(formPrecioVenta) || 0,
      precioCosto: parseFloat(formPrecioCosto) || 0,
      stockActual: parseInt(formStockActual, 10) || 0,
      stockMinimo: parseInt(formStockMinimo, 10) || 5,
      unidadMedida: formUnidadMedida,
      fechaVencimiento: rubroConfig.activarVencimientos ? formFechaVencimiento : undefined,
      lote: rubroConfig.activarVencimientos ? formLote : undefined,
      numeroSerie: rubroConfig.activarGarantiaSerie ? formNumeroSerie : undefined,
      mesesGarantia: rubroConfig.activarGarantiaSerie ? parseInt(formMesesGarantia, 10) || 0 : undefined,
      requiereGarantia: rubroConfig.activarGarantiaSerie && !!formNumeroSerie,
    });

    setModalAbierto(false);
    // Limpiar formulario
    setFormCodigo('');
    setFormNombre('');
    setFormPrecioVenta('');
    setFormPrecioCosto('');
    setFormStockActual('');
    setFormStockMinimo('');
    setFormFechaVencimiento('');
    setFormLote('');
    setFormNumeroSerie('');
    setFormMesesGarantia('');
  };

  return (
    <div style={styles.container}>
      <TopBar title={rubroConfig.nombreCatalogo.toUpperCase()} subtitle="Control de Stock y Precios por Rubro" />

      <main style={styles.content}>
        {/* Barra de Filtros y Acción */}
        <div style={styles.actionsBar}>
          <div style={styles.searchWrapper}>
            <Search size={18} strokeWidth={2.4} style={styles.searchIcon} />
            <input
              type="text"
              placeholder="Buscar por código SKU o nombre de producto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-input"
              style={{ paddingLeft: '38px' }}
            />
          </div>

          <div style={styles.categoriesFilter}>
            {categorias.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setFiltroCategoria(cat)}
                style={{
                  ...styles.catButton,
                  ...(filtroCategoria === cat ? styles.catButtonActive : {}),
                }}
              >
                {cat}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setModalAbierto(true)}
            style={{ marginLeft: 'auto' }}
          >
            <Plus size={18} strokeWidth={2.5} />
            <span>NUEVO ARTÍCULO</span>
          </button>
        </div>

        {/* Tabla Industrial de Productos */}
        <div className="table-container" style={{ marginTop: '20px' }}>
          <table className="industrial-table">
            <thead>
              <tr>
                <th>CÓDIGO SKU</th>
                <th>NOMBRE DEL ARTÍCULO</th>
                <th>CATEGORÍA</th>
                <th>UNIDAD</th>
                <th style={{ textAlign: 'right' }}>PRECIO VENTA</th>
                <th style={{ textAlign: 'right' }}>PRECIO COSTO</th>
                <th style={{ textAlign: 'center' }}>STOCK ACTUAL</th>
                <th style={{ textAlign: 'center' }}>MÍNIMO</th>
                <th style={{ textAlign: 'center' }}>ESTADO</th>
              </tr>
            </thead>
            <tbody>
              {productosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '36px', color: '#78716C' }}>
                    No se encontraron productos coincidentes
                  </td>
                </tr>
              ) : (
                productosFiltrados.map((p) => {
                  const stockBajo = p.stockActual <= p.stockMinimo;
                  return (
                    <tr key={p.id}>
                      <td style={{ fontFamily: 'var(--font-display)', fontWeight: 800 }}>{p.codigo}</td>
                      <td style={{ fontWeight: 600 }}>
                        <div>{p.nombre}</div>
                        {(p.fechaVencimiento || p.numeroSerie) && (
                          <div style={{ fontSize: '10px', color: '#78716C', display: 'flex', gap: '8px', marginTop: '2px' }}>
                            {p.fechaVencimiento && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                <Calendar size={11} /> Vence: {p.fechaVencimiento} {p.lote ? `(Lote: ${p.lote})` : ''}
                              </span>
                            )}
                            {p.numeroSerie && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: '#0284C7' }}>
                                <ShieldCheck size={11} /> S/N: {p.numeroSerie} ({p.mesesGarantia || 12}m garantía)
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className="badge badge-dark">{p.categoria}</span>
                      </td>
                      <td style={{ fontSize: '12px', color: '#78716C', textTransform: 'lowercase' }}>
                        {p.unidadMedida}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-display)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {formatLempiras(p.precioVenta)}
                      </td>
                      <td style={{ textAlign: 'right', color: '#78716C', whiteSpace: 'nowrap' }}>
                        {formatLempiras(p.precioCosto)}
                      </td>
                      <td
                        style={{
                          textAlign: 'center',
                          fontFamily: 'var(--font-display)',
                          fontWeight: 800,
                          fontSize: '15px',
                          color: stockBajo ? 'var(--color-primary)' : 'inherit',
                        }}
                      >
                        {p.stockActual}
                      </td>
                      <td style={{ textAlign: 'center', color: '#78716C' }}>{p.stockMinimo}</td>
                      <td style={{ textAlign: 'center' }}>
                        {stockBajo ? (
                          <span className="badge badge-danger">
                            <AlertTriangle size={11} strokeWidth={2.6} /> STOCK BAJO
                          </span>
                        ) : (
                          <span className="badge badge-success">DISPONIBLE</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </main>

      {/* Modal de Creación */}
      {modalAbierto && (
        <div style={styles.modalOverlay}>
          <div className="industrial-card" style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h2 style={{ fontSize: '18px', textTransform: 'uppercase' }}>AGREGAR NUEVO ARTÍCULO</h2>
              <button
                type="button"
                onClick={() => setModalAbierto(false)}
                style={styles.closeBtn}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCrearProducto} style={{ marginTop: '16px' }}>
              <div style={styles.formRow}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">CÓDIGO / SKU</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. ART-005"
                    value={formCodigo}
                    onChange={(e) => setFormCodigo(e.target.value)}
                    className="form-input"
                  />
                </div>

                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">CATEGORÍA</label>
                  <select
                    value={formCategoria}
                    onChange={(e) => setFormCategoria(e.target.value)}
                    className="form-select"
                  >
                    {(rubroConfig.categoriasDefault.length > 0
                      ? rubroConfig.categoriasDefault
                      : ['General', 'Otros']
                    ).map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">DESCRIPCIÓN DEL ARTÍCULO</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Nombre del producto"
                  value={formNombre}
                  onChange={(e) => setFormNombre(e.target.value)}
                  className="form-input"
                />
              </div>

              <div style={styles.formRow}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">UNIDAD DE MEDIDA</label>
                  <select
                    value={formUnidadMedida}
                    onChange={(e) => setFormUnidadMedida(e.target.value)}
                    className="form-select"
                  >
                    {rubroConfig.unidadesMedida.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">PRECIO VENTA (L.)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={formPrecioVenta}
                    onChange={(e) => setFormPrecioVenta(e.target.value)}
                    className="form-input"
                  />
                </div>

                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">PRECIO COSTO (L.)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={formPrecioCosto}
                    onChange={(e) => setFormPrecioCosto(e.target.value)}
                    className="form-input"
                  />
                </div>
              </div>

              <div style={styles.formRow}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">STOCK INICIAL</label>
                  <input
                    type="number"
                    placeholder="0"
                    value={formStockActual}
                    onChange={(e) => setFormStockActual(e.target.value)}
                    className="form-input"
                  />
                </div>

                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">STOCK MÍNIMO ALERTA</label>
                  <input
                    type="number"
                    placeholder="5"
                    value={formStockMinimo}
                    onChange={(e) => setFormStockMinimo(e.target.value)}
                    className="form-input"
                  />
                </div>
              </div>

              {/* Campos dinámicos según RubroConfig */}
              {rubroConfig.activarVencimientos && (
                <div style={{ ...styles.formRow, marginTop: '10px', padding: '10px', backgroundColor: '#FEF3C7', borderRadius: '4px' }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label" style={{ color: '#B45309' }}>FECHA VENCIMIENTO (OPCIONAL)</label>
                    <input
                      type="date"
                      value={formFechaVencimiento}
                      onChange={(e) => setFormFechaVencimiento(e.target.value)}
                      className="form-input"
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label" style={{ color: '#B45309' }}>NÚMERO DE LOTE</label>
                    <input
                      type="text"
                      placeholder="Ej. LOT-2026-X"
                      value={formLote}
                      onChange={(e) => setFormLote(e.target.value)}
                      className="form-input"
                    />
                  </div>
                </div>
              )}

              {rubroConfig.activarGarantiaSerie && (
                <div style={{ ...styles.formRow, marginTop: '10px', padding: '10px', backgroundColor: '#E0F2FE', borderRadius: '4px' }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label" style={{ color: '#0369A1' }}>NÚMERO DE SERIE</label>
                    <input
                      type="text"
                      placeholder="Ej. SN-987654321"
                      value={formNumeroSerie}
                      onChange={(e) => setFormNumeroSerie(e.target.value)}
                      className="form-input"
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label" style={{ color: '#0369A1' }}>GARANTÍA (MESES)</label>
                    <input
                      type="number"
                      placeholder="Ej. 12"
                      value={formMesesGarantia}
                      onChange={(e) => setFormMesesGarantia(e.target.value)}
                      className="form-input"
                    />
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setModalAbierto(false)}
                >
                  CANCELAR
                </button>
                <button type="submit" className="btn btn-primary">
                  <Check size={16} strokeWidth={2.6} /> GUARDAR PRODUCTO
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
  categoriesFilter: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
  },
  catButton: {
    padding: '8px 12px',
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    backgroundColor: '#FFFFFF',
    border: '1.5px solid var(--color-border)',
    borderRadius: 'var(--radius-xs)',
    cursor: 'pointer',
  },
  catButtonActive: {
    backgroundColor: 'var(--color-sidebar-bg)',
    color: '#FAFAF9',
    borderColor: 'var(--color-sidebar-bg)',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
    padding: '20px',
  },
  modalContent: {
    width: '100%',
    maxWidth: '580px',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: '12px',
    borderBottom: '2px solid var(--color-border)',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--color-text-main)',
  },
  formRow: {
    display: 'flex',
    gap: '14px',
  },
};
