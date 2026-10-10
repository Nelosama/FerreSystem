import { ProductoGestion } from '../components/ProductoGestion';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { TopBar } from '../components/TopBar';
import { Search, Plus, Upload, AlertTriangle, Check, X, Calendar, ShieldCheck, RefreshCw } from 'lucide-react';
import { formatLempiras } from '../utils/format';
import { api } from '../utils/api';
import type { ProductItem } from '../types';
import { useRubroConfig } from '../hooks/useRubroConfig';
import { useI18n } from '../context/I18nContext';
import { ImportarProductosModal } from '../components/ImportarProductosModal';
import { useTenant } from '../context/TenantContext';
import { newRequestId } from '../utils/requestId';
import { readStoredJson } from '../utils/storage';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { normalizarUnidadMedida } from '../utils/unidadMedida';

export const InventarioPage: React.FC = () => {
  const { tenant, user } = useTenant();
  return <InventarioContent key={`${tenant.id}:${user?.id}`} />;
};

const InventarioContent: React.FC = () => {
  const rubroConfig = useRubroConfig();
  const { t } = useI18n();
  const { tenant, user, isReadOnly } = useTenant();
  // Decisión 3: solo ADMIN define costo y precio; el alta de otro rol queda pendiente de configuración.
  const esAdmin = user?.rol === 'ADMIN';
  const pendingKey = `ferre_pending_product:${tenant.id}:${user?.id}`;
  const [pendingProduct, setPendingProduct] = useState<any>(() => readStoredJson(pendingKey, null));
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  const inFlight = useRef(false);

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
        margen:p.margen==null?undefined:Number(p.margen),
        imagenUrl:p.imagenUrl,
        // FS-07: campos reales para editar. 'categoria' es solo texto de visualización (usa 'General' como respaldo).
        version: p.version,
        marca: p.marca ?? null,
        categoriaId: p.categoriaId ?? null,
        categoriaNombre: p.categoria?.nombre ?? '',
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
      setErrorText(t('inventory_create.load_error'));
    }
  }, [t]);

  useEffect(() => {
    fetchProductos();
  }, [fetchProductos]);

  // Form State
  const [formCodigo, setFormCodigo] = useState('');
  const [formBarcode,setFormBarcode]=useState('');
  const [formFabricante,setFormFabricante]=useState('');
  const [formMarca,setFormMarca]=useState('');
  const [formNombre, setFormNombre] = useState('');
  const [formDescripcion, setFormDescripcion] = useState('');
  const [formUsaMedida, setFormUsaMedida] = useState(false);
  const [formCategoria, setFormCategoria] = useState(rubroConfig.categoriasDefault[0] || 'General');
  const [formUnidadMedida, setFormUnidadMedida] = useState(rubroConfig.unidadesMedida[0] || 'unidad');
  const [formPrecioVenta, setFormPrecioVenta] = useState('');
  const [formPrecioCosto, setFormPrecioCosto] = useState('');
  const [formStockActual, setFormStockActual] = useState('');
  const [formStockMinimo, setFormStockMinimo] = useState('');

  const categorias = ['TODAS', ...new Set([...rubroConfig.categoriasDefault, ...productos.map(p => p.categoria)])];

  const productosFiltrados = productos.filter((p) => {
    const matchSearch =
      p.nombre.toLowerCase().includes(search.trim().toLowerCase()) ||
      p.codigo.toLowerCase().includes(search.trim().toLowerCase()) || p.codigoBarras?.toLowerCase().includes(search.trim().toLowerCase()) || p.codigoFabricante?.toLowerCase().includes(search.trim().toLowerCase()) || p.descripcion?.toLowerCase().includes(search.trim().toLowerCase()) || p.categoria.toLowerCase().includes(search.trim().toLowerCase());
    const matchCat = filtroCategoria === 'TODAS' || p.categoria === filtroCategoria;
    return matchSearch && matchCat;
  });

  const guardarAlta = async (command: any) => {
    await api.post('/productos', command);
    localStorage.removeItem(pendingKey); setPendingProduct(null);
    setSavedMessage(t('inventory_create.saved', { nombre: command.nombre }));
    setModalAbierto(false);
    setFormCodigo(''); setFormBarcode(''); setFormFabricante(''); setFormMarca('');
    setFormNombre(''); setFormDescripcion(''); setFormUsaMedida(false);
    setFormPrecioVenta(''); setFormPrecioCosto(''); setFormStockActual(''); setFormStockMinimo('');
    await fetchProductos();
  };

  const handleCrearProducto = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (inFlight.current || isReadOnly) return;
    const command = pendingProduct ?? {
      solicitudId: newRequestId(),
      codigo: formCodigo.toUpperCase().trim() || undefined,
      codigoBarras: formBarcode.trim() || undefined,
      codigoFabricante: formFabricante.trim() || undefined,
      marca: formMarca.trim() || undefined,
      nombre: formNombre.trim(), descripcion: formDescripcion.trim() || undefined,
      categoria: formCategoria,
      precioVenta: esAdmin ? Number(formPrecioVenta) : 0, precioCosto: esAdmin ? Number(formPrecioCosto || 0) : 0,
      stockActual: Number(formStockActual || 0), stockMinimo: Number(formStockMinimo || 5),
      unidadMedida: normalizarUnidadMedida(formUnidadMedida), usaMedida: formUsaMedida,
    };
    if (!pendingProduct && (!command.nombre || (esAdmin && !formPrecioVenta.trim()) ||
      [command.precioVenta, command.precioCosto, command.stockActual, command.stockMinimo].some(n =>
        !Number.isFinite(n) || n < 0 || n > 9999999999.99 || Math.abs(n * 100 - Math.round(n * 100)) > 0.00001))) {
      setCreateError(t('inventory_create.validation')); return;
    }
    inFlight.current = true; setSaving(true); setCreateError(''); setSavedMessage('');
    try {
      // Antes del envío: conserva clave y contenido incluso si se pierde la respuesta o se recarga.
      localStorage.setItem(pendingKey, JSON.stringify(command)); setPendingProduct(command);
      await guardarAlta(command);
    } catch (err: any) {
      if (err.response?.status >= 400 && err.response?.status < 500) {
        localStorage.removeItem(pendingKey); setPendingProduct(null);
      }
      const message = err.response?.data?.message;
      setCreateError(Array.isArray(message) ? message.join(' · ') : message || t('inventory_create.network'));
    } finally { inFlight.current = false; setSaving(false); }
  };

  return (
    <div style={styles.container}>
      <TopBar title={rubroConfig.nombreCatalogo.toUpperCase()} subtitle={t('inventory.subtitle')} />

      <main style={styles.content}>
        {savedMessage && <p role="status">{savedMessage}</p>}
        {pendingProduct && !modalAbierto && <div role="alert" className="operation-card"><p>{t('inventory_create.pending', { nombre: pendingProduct.nombre })}</p><button type="button" className="btn btn-primary" disabled={saving || isReadOnly} onClick={() => void handleCrearProducto()}>{saving ? t('inventory_create.saving') : t('inventory_create.retry')}</button></div>}
        {createError && !modalAbierto && <p role="alert">{createError}</p>}
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
                {cat === 'TODAS' ? t('common.all') : cat}
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
              disabled={saving || !!pendingProduct || isReadOnly}
              onClick={() => { setCreateError(''); setModalAbierto(true); }}
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
                <th className="numeric-cell" style={{ textAlign: 'right' }}>{t('inventory.price')}</th>
                {esAdmin && <th className="numeric-cell" style={{ textAlign: 'right' }}>{t('inventory.cost')}</th>}
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
                      <td className="numeric-cell" style={{ textAlign: 'right', fontFamily: 'var(--font-display)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {formatLempiras(p.precioVenta)}
                      </td>
                      {esAdmin && (<td className="numeric-cell" style={{ textAlign: 'right', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                        {formatLempiras(p.precioCosto)}
                      </td>)}
                      <td className="numeric-cell" style={{ textAlign: 'center', fontFamily: 'var(--font-display)',
                          fontWeight: 800,
                          fontSize: '15px',
                          color: stockBajo ? 'var(--color-primary)' : 'inherit',
                        }}
                      >
                        {p.stockActual} físicos
                        <small style={{display:'block',fontSize:10}}>{p.stockReservado||0} reservados · {p.stockDisponible??p.stockActual} disponibles</small>
                      </td>
                      <td className="numeric-cell" style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>{p.stockMinimo}</td>
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
          <div role="dialog" aria-modal="true" aria-label={t('inventory.add_article')} className="industrial-card inventory-create-modal" style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h2 style={{ fontSize: '18px', textTransform: 'uppercase' }}>{t('inventory.add_article')}</h2>
              <button
                type="button"
                aria-label={t('navigation.close')}
                disabled={saving}
                  onClick={() => setModalAbierto(false)}
                style={styles.closeBtn}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCrearProducto} style={{ marginTop: '16px' }}>
              {createError && <p role="alert">{createError}</p>}
              {pendingProduct && <p role="status">{t('inventory_create.pending', { nombre: pendingProduct.nombre })}</p>}
              <fieldset disabled={saving || !!pendingProduct} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
                <label className="form-label" htmlFor="create-name">{t('product_edit.field.nombre')} *</label>
                <input id="create-name" className="form-input" required maxLength={500} value={formNombre} onChange={e => setFormNombre(e.target.value)} placeholder={t('inventory_create.name_example')} />
                <p>{t('inventory_create.variant_help')}</p>
                <label className="form-label" htmlFor="create-barcode">{t('product_edit.field.codigoBarras')}</label>
                <input id="create-barcode" className="form-input" maxLength={100} value={formBarcode} onChange={e => setFormBarcode(e.target.value)} />
                <details><summary>{t('inventory_create.scan')}</summary><BarcodeScanner disabled={saving || !!pendingProduct} onCode={setFormBarcode}/></details>
                <div style={styles.formRow}>
                  <label className="form-group" style={{ flex: '1 1 140px', minWidth: 0 }}>{t('inventory.category')}
                    <select className="form-select" value={formCategoria} onChange={e => setFormCategoria(e.target.value)}>
                      {categorias.filter(c => c !== 'TODAS').map(c => <option key={c}>{c}</option>)}
                    </select>
                  </label>
                  <label className="form-group" style={{ flex: '1 1 140px', minWidth: 0 }}>{t('inventory.unit_measure')}
                    <select className="form-select" value={formUnidadMedida} onChange={e => setFormUnidadMedida(e.target.value)}>
                      {rubroConfig.unidadesMedida.map(u => <option key={u}>{u}</option>)}
                    </select>
                  </label>
                </div>
                {esAdmin ? (
<div style={styles.formRow}>
                    <label className="form-group" style={{ flex: '1 1 140px', minWidth: 0 }}>{t('inventory.sale_price')}
                      <input className="form-input" type="number" inputMode="decimal" min="0" step="0.01" required value={formPrecioVenta} onChange={e => setFormPrecioVenta(e.target.value)} />
                    </label>
                    <label className="form-group" style={{ flex: '1 1 140px', minWidth: 0 }}>{t('inventory.cost_price')}
                      <input className="form-input" type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" value={formPrecioCosto} onChange={e => setFormPrecioCosto(e.target.value)} />
                    </label>
                  </div>
) : (
  <p className="form-hint">{t('inventory_create.price_pending_note')}</p>
)}
                <div style={styles.formRow}>
                  <label className="form-group" style={{ flex: '1 1 140px', minWidth: 0 }}>{t('inventory.initial_stock')}
                    <input className="form-input" type="number" inputMode="decimal" min="0" step="0.01" placeholder="0" value={formStockActual} onChange={e => setFormStockActual(e.target.value)} />
                  </label>
                  <label className="form-group" style={{ flex: '1 1 140px', minWidth: 0 }}>{t('inventory.minimum_alert')}
                    <input className="form-input" type="number" inputMode="decimal" min="0" step="0.01" placeholder="5" value={formStockMinimo} onChange={e => setFormStockMinimo(e.target.value)} />
                  </label>
                </div>
                <details>
                  <summary>{t('inventory_create.details')}</summary>
                  <label className="form-label">{t('inventory.sku')}<input className="form-input" placeholder={t('inventory_create.auto_code')} value={formCodigo} onChange={e => setFormCodigo(e.target.value)}/></label>
                  <label className="form-label">{t('product_edit.field.codigoFabricante')}<input className="form-input" value={formFabricante} onChange={e => setFormFabricante(e.target.value)}/></label>
                  <label className="form-label">{t('product_edit.field.marca')}<input className="form-input" maxLength={100} value={formMarca} onChange={e => setFormMarca(e.target.value)}/></label>
                  <label className="form-label">{t('product_edit.field.descripcion')}<textarea className="form-input" value={formDescripcion} onChange={e => setFormDescripcion(e.target.value)}/></label>
                  <label><input type="checkbox" checked={formUsaMedida} onChange={e => setFormUsaMedida(e.target.checked)}/>{t('product_edit.field.usaMedida')}</label>
                </details>
              </fieldset>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={saving}
                  onClick={() => setModalAbierto(false)}
                >
                  {t('operational.cancelar')}
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving || isReadOnly}>
                  <Check size={16} strokeWidth={2.6} /> {saving ? t('inventory_create.saving') : pendingProduct ? t('inventory_create.retry') : t('inventory.save_product')}
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
    minWidth: '0',
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
    maxHeight: 'calc(100dvh - 40px)',
    overflowY: 'auto',
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
    flexWrap: 'wrap',
  },
};

