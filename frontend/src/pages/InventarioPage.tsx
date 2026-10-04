import { ProductoGestion } from '../components/ProductoGestion';
import React, { useState, useEffect, useCallback } from 'react';
import { TopBar } from '../components/TopBar';
import { Search, Plus, Upload, AlertTriangle, Check, X, Calendar, ShieldCheck, RefreshCw } from 'lucide-react';
import { formatLempiras } from '../utils/format';
import { api } from '../utils/api';
import type { ProductItem } from '../types';
import { useRubroConfig } from '../hooks/useRubroConfig';
import { useI18n } from '../context/I18nContext';
import { ImportarProductosModal } from '../components/ImportarProductosModal';
import { normalizarUnidadMedida } from '../utils/unidadMedida';

export const InventarioPage: React.FC = () => {
  const rubroConfig = useRubroConfig();
  const { t } = useI18n();

  const [productos, setProductos] = useState<ProductItem[]>([]);
  const [errorText, setErrorText] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('TODAS');
  const [modalAbierto, setModalAbierto] = useState(false);
  const [importModalAbierto, setImportModalAbierto] = useState(false);

  const fetchProductos = useCallback(async () => {
    setErrorText(null);
    try {
      const response = await api.get('/productos');
      // Format response data to match ProductItem interface
      const data = response.data.map((p: any) => ({
        id: p.id,
        codigo: p.codigo,
        codigoBarras:p.codigoBarras,
        codigoFabricante:p.codigoFabricante,
        nombre: p.nombre,
        descripcion: p.descripcion,
        categoria: p.categoria?.nombre || p.categoria || 'General',
        precioVenta: Number(p.precioVenta),
        precioCosto: Number(p.precioCosto),
        stockActual: Number(p.stockActual),
        stockReservado:Number(p.stockReservado||0),stockDisponible:Number(p.stockDisponible??p.stockActual),
        stockMinimo: Number(p.stockMinimo),
        unidadMedida: p.unidadMedida || 'UNIDAD',
        usaMedida: Boolean(p.usaMedida),
        activo: Boolean(p.activo),
        stockBajo: p.stockBajo ?? (Number(p.stockActual) <= Number(p.stockMinimo)),
      }));
      setProductos(data);
    } catch (err: any) {
      console.error('Error al cargar productos desde la API:', err);
      setErrorText('Error al cargar productos desde el servidor.');
    }
  }, []);

  useEffect(() => {
    fetchProductos();
  }, [fetchProductos]);

  // Form State
  const [formCodigo, setFormCodigo] = useState('');
  const [formBarcode,setFormBarcode]=useState('');
  const [formFabricante,setFormFabricante]=useState('');
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
      p.codigo.toLowerCase().includes(search.toLowerCase()) || p.codigoBarras?.includes(search) || p.codigoFabricante?.toLowerCase().includes(search.toLowerCase()) || p.descripcion?.toLowerCase().includes(search.toLowerCase());
    const matchCat = filtroCategoria === 'TODAS' || p.categoria === filtroCategoria;
    return matchSearch && matchCat;
  });

  const handleCrearProducto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNombre || !formPrecioVenta) return;

    try {
      await api.post('/productos', {
        codigo: formCodigo.toUpperCase().trim() || undefined,
        codigoBarras: formBarcode.trim() || undefined,
        codigoFabricante: formFabricante.trim() || undefined,
        nombre: formNombre.trim(),
        categoria: formCategoria,
        precioVenta: parseFloat(formPrecioVenta) || 0,
        precioCosto: parseFloat(formPrecioCosto) || 0,
        stockActual: formStockActual === '' ? 0 : Number(formStockActual),
        stockMinimo: formStockMinimo === '' ? 5 : Number(formStockMinimo),
        unidadMedida: normalizarUnidadMedida(formUnidadMedida),
        usaMedida: false,
      });

      await fetchProductos();
      setModalAbierto(false);

      // Limpiar formulario
      setFormCodigo('');setFormBarcode('');setFormFabricante('');
      setFormNombre('');
      setFormPrecioVenta('');
      setFormPrecioCosto('');
      setFormStockActual('');
      setFormStockMinimo('');
      setFormFechaVencimiento('');
      setFormLote('');
      setFormNumeroSerie('');
      setFormMesesGarantia('');
    } catch (err: any) {
      console.error('Error al crear producto:', err);
      alert(err.response?.data?.message || 'Error al guardar el producto en el servidor');
    }
  };

  return (
    <div style={styles.container}>
      <TopBar title={rubroConfig.nombreCatalogo.toUpperCase()} subtitle={t('inventory.subtitle')} />

      <main style={styles.content}>
        <ProductoGestion productos={productos} onSaved={fetchProductos}/>
        {/* Barra de Filtros y Acción */}
        <div style={styles.actionsBar}>
          <div style={styles.searchWrapper}>
            <Search size={18} strokeWidth={2.4} style={styles.searchIcon} />
            <input
              type="text"
              placeholder={t('pos.search_products')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-input"
              style={{ paddingLeft: '38px' }}
            />
          </div>

          <div style={styles.categoriesFilter}>
            {categorias.map((cat) => (
              <button
                key={cat === 'TODAS' ? t('common.all') : cat}
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

          <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setImportModalAbierto(true)}
            >
              <Upload size={18} strokeWidth={2.2} />
              <span>{t('inventory.import_products')}</span>
            </button>

            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setModalAbierto(true)}
            >
              <Plus size={18} strokeWidth={2.5} />
              <span>{t('inventory.new_product')}</span>
            </button>
          </div>
        </div>

        {errorText && (
          <div style={{ marginTop: '16px', padding: '12px 16px', backgroundColor: '#FEE2E2', color: '#991B1B', borderRadius: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{errorText}</span>
            <button type="button" onClick={fetchProductos} className="btn btn-secondary btn-sm" style={{ padding: '4px 10px', fontSize: '12px' }}>
              <RefreshCw size={14} /> {t('common.retry')}
            </button>
          </div>
        )}

        {/* Tabla Industrial de Productos */}
        <div className="table-container" style={{ marginTop: '20px' }}>
          <table className="industrial-table">
            <thead>
              <tr>
                <th>{t('inventory.code')}</th>
                <th>{t('inventory.product')}</th>
                <th>{t('inventory.category')}</th>
                <th>{t('common.unit')}</th>
                <th style={{ textAlign: 'right' }}>{t('inventory.price')}</th>
                <th style={{ textAlign: 'right' }}>{t('inventory.cost')}</th>
                <th style={{ textAlign: 'center' }}>{t('inventory.stock')}</th>
                <th style={{ textAlign: 'center' }}>{t('inventory.minimum')}</th>
                <th style={{ textAlign: 'center' }}>{t('common.status')}</th>
              </tr>
            </thead>
            <tbody>
              {productosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '36px', color: 'var(--color-text-muted)' }}>
                    {t('operational.no_se_encontraron_productos_coincidentes')}
                  </td>
                </tr>
              ) : (
                productosFiltrados.map((p) => {
                  const stockBajo = (p.stockDisponible??p.stockActual) <= p.stockMinimo;
                  return (
                    <tr key={p.id}>
                      <td style={{ fontFamily: 'var(--font-display)', fontWeight: 800 }}>{p.codigo}</td>
                      <td style={{ fontWeight: 600 }}>
                        <div>{p.nombre}</div>
                        {(p.fechaVencimiento || p.numeroSerie) && (
                          <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', display: 'flex', gap: '8px', marginTop: '2px' }}>
                            {p.fechaVencimiento && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                <Calendar size={11} /> {t('operational.vence')} {p.fechaVencimiento} {p.lote ? `(Lote: ${p.lote})` : ''}
                              </span>
                            )}
                            {p.numeroSerie && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: '#0284C7' }}>
                                <ShieldCheck size={11} /> S/N: {p.numeroSerie} ({p.mesesGarantia || 12}{t('operational.m_garantia')}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className="badge badge-dark">{p.categoria}</span>
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--color-text-muted)', textTransform: 'lowercase' }}>
                        {p.unidadMedida}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--font-display)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {formatLempiras(p.precioVenta)}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
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
                        {p.stockActual} físicos
                        <small style={{display:'block',fontSize:10}}>{p.stockReservado||0} reservados · {p.stockDisponible??p.stockActual} disponibles</small>
                      </td>
                      <td style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>{p.stockMinimo}</td>
                      <td style={{ textAlign: 'center' }}>
                        {stockBajo ? (
                          <span className="badge badge-danger">
                            <AlertTriangle size={11} strokeWidth={2.6} /> {t('operational.stock_bajo')}
                          </span>
                        ) : (
                          <span className="badge badge-success">{t('inventory.available')}</span>
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

      {/* Modal de Importación Masiva */}
      <ImportarProductosModal
        isOpen={importModalAbierto}
        onClose={() => { setImportModalAbierto(false); void fetchProductos(); }}
      />

      {/* Modal de Creación */}
      {modalAbierto && (
        <div style={styles.modalOverlay}>
          <div className="industrial-card" style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h2 style={{ fontSize: '18px', textTransform: 'uppercase' }}>{t('inventory.add_article')}</h2>
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
                  <label className="form-label">{t('inventory.sku')}</label>
                  <input
                    type="text"
                    
                    placeholder={t('operational.ej_art_005')}
                    value={formCodigo}
                    onChange={(e) => setFormCodigo(e.target.value)}
                    className="form-input"
                  />
                </div>

                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">{t('inventory.category')}</label>
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

              <div className="form-group"><label className="form-label">Código de barras (opcional)</label><input className="form-input" value={formBarcode} onChange={e=>setFormBarcode(e.target.value)}/></div><div className="form-group"><label className="form-label">Código del fabricante (opcional)</label><input className="form-input" value={formFabricante} onChange={e=>setFormFabricante(e.target.value)}/></div><div className="form-group">
                <label className="form-label">{t('inventory.article_description')}</label>
                <input
                  type="text"
                  required
                  placeholder={t('operational.ej_nombre_del_producto')}
                  value={formNombre}
                  onChange={(e) => setFormNombre(e.target.value)}
                  className="form-input"
                />
              </div>

              <div style={styles.formRow}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">{t('inventory.unit_measure')}</label>
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
                  <label className="form-label">{t('inventory.sale_price')}</label>
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
                  <label className="form-label">{t('inventory.cost_price')}</label>
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
                  <label className="form-label">{t('inventory.initial_stock')}</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0"
                    value={formStockActual}
                    onChange={(e) => setFormStockActual(e.target.value)}
                    className="form-input"
                  />
                </div>

                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">{t('inventory.minimum_alert')}</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
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
                    <label className="form-label" style={{ color: '#B45309' }}>{t('operational.fecha_vencimiento_opcional')}</label>
                    <input
                      type="date"
                      value={formFechaVencimiento}
                      onChange={(e) => setFormFechaVencimiento(e.target.value)}
                      className="form-input"
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label" style={{ color: '#B45309' }}>{t('operational.numero_de_lote')}</label>
                    <input
                      type="text"
                      placeholder={t('operational.ej_lot_2026_x')}
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
                    <label className="form-label" style={{ color: '#0369A1' }}>{t('operational.numero_de_serie')}</label>
                    <input
                      type="text"
                      placeholder={t('operational.ej_sn_987654321')}
                      value={formNumeroSerie}
                      onChange={(e) => setFormNumeroSerie(e.target.value)}
                      className="form-input"
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label" style={{ color: '#0369A1' }}>{t('operational.garantia_meses')}</label>
                    <input
                      type="number"
                      placeholder={t('operational.ej_12')}
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
                  {t('operational.cancelar')}
                </button>
                <button type="submit" className="btn btn-primary">
                  <Check size={16} strokeWidth={2.6} /> {t('inventory.save_product')}
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
    color: 'var(--color-text-muted)',
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
    color: 'var(--color-bg)',
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

