import React, { useState, useEffect } from 'react';
import {
  ClipboardList,
  Plus,
  Minus,
  Camera,
  Check,
  FileSpreadsheet,
  ArrowLeft,
  Search,
  Trash2,
  FolderOpen,
  Layers,
  Sparkles,
  RotateCcw,
} from 'lucide-react';
import { useRubroConfig } from '../hooks/useRubroConfig';
import { useTenant } from '../context/TenantContext';
import { useI18n } from '../context/I18nContext';
import { exportToCSV } from '../utils/csvExport';

export interface CountedProduct {
  id: string;
  nombre: string;
  categoria: string;
  cantidad: number;
  unidadMedida: string;
  fotoUrl?: string;
  fechaCreacion: string;
}

export const LevantamientoPage: React.FC = () => {
  const rubroConfig = useRubroConfig();
  const { tenant } = useTenant();
  const { t } = useI18n();

  const categories =
    rubroConfig.categoriasDefault.length > 0
      ? rubroConfig.categoriasDefault
      : ['General', 'Otros'];

  const storageKey = `ferre_stock_taking_${tenant.id}`;

  const [items, setItems] = useState<CountedProduct[]>(() => {
    const saved = localStorage.getItem(storageKey);
    return saved ? JSON.parse(saved) : [];
  });

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState<boolean>(false);

  // Quick count form states
  const [nombre, setNombre] = useState<string>('');
  const [cantidad, setCantidad] = useState<number>(1);
  const [unidadMedida, setUnidadMedida] = useState<string>(
    rubroConfig.unidadesMedida[0] || 'unidad'
  );
  const [fotoUrl, setFotoUrl] = useState<string>('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Sync with localStorage
  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(items));
  }, [items, storageKey]);

  // Set default unit when category or rubro config changes
  useEffect(() => {
    if (rubroConfig.unidadesMedida.length > 0 && !unidadMedida) {
      setUnidadMedida(rubroConfig.unidadesMedida[0]);
    }
  }, [rubroConfig.unidadesMedida]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Helper for matching product in current category
  const categoryItems = selectedCategory
    ? items.filter((i) => i.categoria === selectedCategory)
    : [];

  const matchedExistingProduct = selectedCategory
    ? categoryItems.find(
        (i) => i.nombre.trim().toLowerCase() === nombre.trim().toLowerCase()
      )
    : undefined;

  const handleSelectAutocomplete = (prod: CountedProduct) => {
    setNombre(prod.nombre);
    setUnidadMedida(prod.unidadMedida);
    if (prod.fotoUrl && !fotoUrl) {
      setFotoUrl(prod.fotoUrl);
    }
  };

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFotoUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveAndAddAnother = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const cleanNombre = nombre.trim();
    if (!cleanNombre || !selectedCategory) return;

    if (editingId) {
      // Direct edit mode
      setItems((prev) =>
        prev.map((i) =>
          i.id === editingId
            ? {
                ...i,
                nombre: cleanNombre,
                cantidad: Math.max(1, cantidad),
                unidadMedida,
                fotoUrl: fotoUrl || i.fotoUrl,
              }
            : i
        )
      );
      showToast(t('stock_taking.saved_success'));
      setEditingId(null);
    } else {
      // Check duplicate/matching in current category
      const existingIndex = items.findIndex(
        (i) =>
          i.categoria === selectedCategory &&
          i.nombre.trim().toLowerCase() === cleanNombre.toLowerCase()
      );

      if (existingIndex >= 0) {
        // Sum quantity to existing product
        setItems((prev) =>
          prev.map((item, idx) =>
            idx === existingIndex
              ? {
                  ...item,
                  cantidad: item.cantidad + Math.max(1, cantidad),
                  unidadMedida,
                  fotoUrl: fotoUrl || item.fotoUrl,
                }
              : item
          )
        );
        showToast(
          `${t('stock_taking.saved_success')} (+${cantidad} ${unidadMedida})`
        );
      } else {
        // Create new counted product
        const newItem: CountedProduct = {
          id: 'ST-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
          nombre: cleanNombre,
          categoria: selectedCategory,
          cantidad: Math.max(1, cantidad),
          unidadMedida: unidadMedida || rubroConfig.unidadesMedida[0] || 'unidad',
          fotoUrl: fotoUrl || undefined,
          fechaCreacion: new Date().toISOString(),
        };
        setItems((prev) => [newItem, ...prev]);
        showToast(t('stock_taking.saved_success'));
      }
    }

    // Reset form fields for fast next entry
    setNombre('');
    setCantidad(1);
    setFotoUrl('');
  };

  const handleStartEdit = (prod: CountedProduct) => {
    setEditingId(prod.id);
    setNombre(prod.nombre);
    setCantidad(prod.cantidad);
    setUnidadMedida(prod.unidadMedida);
    setFotoUrl(prod.fotoUrl || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    if (editingId === id) {
      setEditingId(null);
      setNombre('');
      setCantidad(1);
      setFotoUrl('');
    }
  };

  const handleClearAll = () => {
    if (window.confirm(t('stock_taking.confirm_clear'))) {
      setItems([]);
      localStorage.removeItem(storageKey);
      showToast('Levantamiento reiniciado.');
    }
  };

  const handleExportCSV = () => {
    if (items.length === 0) {
      alert('No hay productos contados para exportar.');
      return;
    }

    // EXACT CSV columns requested for importer template:
    // (nombre, codigo, categoria, precioCosto, precioVenta, stockActual, stockMinimo, unidadMedida)
    const exportData = items.map((item) => ({
      nombre: item.nombre,
      codigo: '',
      categoria: item.categoria,
      precioCosto: '',
      precioVenta: '',
      stockActual: item.cantidad,
      stockMinimo: '',
      unidadMedida: item.unidadMedida,
    }));

    const dateStr = new Date().toISOString().split('T')[0];
    exportToCSV(`Levantamiento_Inventario_${dateStr}.csv`, exportData, [
      { key: 'nombre', label: 'nombre' },
      { key: 'codigo', label: 'codigo' },
      { key: 'categoria', label: 'categoria' },
      { key: 'precioCosto', label: 'precioCosto' },
      { key: 'precioVenta', label: 'precioVenta' },
      { key: 'stockActual', label: 'stockActual' },
      { key: 'stockMinimo', label: 'stockMinimo' },
      { key: 'unidadMedida', label: 'unidadMedida' },
    ]);
  };

  const totalUniqueProducts = items.length;
  const totalUnits = items.reduce((acc, i) => acc + i.cantidad, 0);

  return (
    <div style={styles.container}>
      {/* Toast Notification */}
      {toastMessage && (
        <div style={styles.toast}>
          <Check size={18} color="#FFFFFF" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="page-header" style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={styles.headerIconWrapper}>
            <ClipboardList size={26} style={{ color: 'var(--color-primary)' }} />
          </div>
          <div>
            <h1 style={{ fontSize: '20px', margin: 0, textTransform: 'uppercase' }}>
              {t('stock_taking.title')}
            </h1>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-muted)' }}>
              {t('stock_taking.subtitle')}
            </p>
          </div>
        </div>

        {/* Global Action Toolbar */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '12px' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setShowSummary(!showSummary);
              setSelectedCategory(null);
            }}
            style={{ fontSize: '12px', padding: '8px 14px' }}
          >
            <Layers size={16} />
            <span>{showSummary ? t('stock_taking.back_to_categories') : t('stock_taking.view_summary')}</span>
          </button>

          <button
            type="button"
            className="btn btn-primary"
            onClick={handleExportCSV}
            disabled={items.length === 0}
            style={{ fontSize: '12px', padding: '8px 14px' }}
          >
            <FileSpreadsheet size={16} />
            <span>{t('stock_taking.export_csv')}</span>
          </button>
        </div>
      </div>

      {/* Overview Stats Cards */}
      <div style={styles.statsGrid}>
        <div className="industrial-card" style={styles.statCard}>
          <span style={styles.statLabel}>{t('stock_taking.total_counted_products')}</span>
          <span style={styles.statValue}>{totalUniqueProducts}</span>
        </div>
        <div className="industrial-card" style={styles.statCard}>
          <span style={styles.statLabel}>{t('stock_taking.total_counted_units')}</span>
          <span style={{ ...styles.statValue, color: 'var(--color-primary)' }}>{totalUnits}</span>
        </div>
      </div>

      {/* VIEW 1: SUMMARY SCREEN */}
      {showSummary ? (
        <div style={{ marginTop: '20px' }}>
          <div className="industrial-card" style={{ padding: '20px' }}>
            <div style={styles.sectionHeader}>
              <h2 style={{ fontSize: '16px', textTransform: 'uppercase', margin: 0 }}>
                {t('stock_taking.summary_title')}
              </h2>
              {items.length > 0 && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleClearAll}
                  style={{ fontSize: '12px', color: '#DC2626' }}
                >
                  <RotateCcw size={14} />
                  <span>{t('stock_taking.clear_all')}</span>
                </button>
              )}
            </div>

            {/* Category summary progress breakdown */}
            <div style={styles.summaryCategoryGrid}>
              {categories.map((cat) => {
                const catProds = items.filter((i) => i.categoria === cat);
                const catUnits = catProds.reduce((acc, i) => acc + i.cantidad, 0);

                return (
                  <div
                    key={cat}
                    style={styles.summaryCatCard}
                    onClick={() => {
                      setSelectedCategory(cat);
                      setShowSummary(false);
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 800, fontSize: '13px' }}>{cat}</span>
                      <span className="badge badge-primary">{catProds.length} prod</span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#78716C', marginTop: '6px' }}>
                      Total unidades contadas: <strong>{catUnits}</strong>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Full product table list */}
            <h3 style={{ fontSize: '14px', marginTop: '24px', textTransform: 'uppercase' }}>
              Detalle Completo de Productos Contados ({items.length})
            </h3>

            {items.length === 0 ? (
              <p style={{ fontSize: '13px', color: '#78716C', textAlign: 'center', padding: '24px 0' }}>
                No hay productos contados aún. Selecciona una categoría para comenzar el conteo.
              </p>
            ) : (
              <div className="table-container" style={{ marginTop: '12px' }}>
                <table className="industrial-table" style={{ fontSize: '13px' }}>
                  <thead>
                    <tr>
                      <th style={{ width: '50px' }}>FOTO</th>
                      <th>PRODUCTO</th>
                      <th>CATEGORÍA</th>
                      <th style={{ textAlign: 'center' }}>CANTIDAD</th>
                      <th>UNIDAD</th>
                      <th style={{ textAlign: 'right' }}>ACCIONES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td style={{ textAlign: 'center' }}>
                          {item.fotoUrl ? (
                            <img
                              src={item.fotoUrl}
                              alt={item.nombre}
                              style={{ width: '36px', height: '36px', objectFit: 'cover', borderRadius: '4px' }}
                            />
                          ) : (
                            <div style={styles.noPhotoPlaceholder}>-</div>
                          )}
                        </td>
                        <td style={{ fontWeight: 700 }}>{item.nombre}</td>
                        <td>
                          <span className="badge badge-secondary">{item.categoria}</span>
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 800, fontSize: '14px' }}>
                          {item.cantidad}
                        </td>
                        <td style={{ textTransform: 'lowercase' }}>{item.unidadMedida}</td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={() => handleDeleteItem(item.id)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626' }}
                            title="Eliminar registro"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : selectedCategory ? (
        /* VIEW 2: FAST COUNT SCREEN FOR SELECTED CATEGORY */
        <div style={{ marginTop: '16px' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setSelectedCategory(null);
              setEditingId(null);
              setNombre('');
              setCantidad(1);
              setFotoUrl('');
            }}
            style={{ marginBottom: '14px', fontSize: '12px' }}
          >
            <ArrowLeft size={16} />
            <span>{t('stock_taking.back_to_categories')}</span>
          </button>

          <div className="industrial-card" style={styles.countCard}>
            <div style={styles.countHeader}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {t('stock_taking.quick_count')}
                </span>
                <h2 style={{ fontSize: '18px', margin: 0, textTransform: 'uppercase' }}>
                  {selectedCategory}
                </h2>
              </div>
              <span className="badge badge-primary" style={{ fontSize: '12px', padding: '6px 12px' }}>
                {categoryItems.length} registrados
              </span>
            </div>

            <form onSubmit={handleSaveAndAddAnother} style={{ marginTop: '16px' }}>
              {/* Product Name & Autocomplete */}
              <div style={styles.fieldGroup}>
                <label style={styles.fieldLabel}>
                  {t('stock_taking.product_name')} *
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    placeholder={t('stock_taking.product_name_placeholder')}
                    className="industrial-input"
                    style={{ width: '100%', paddingRight: '36px', fontSize: '15px', fontWeight: 600 }}
                    required
                    autoFocus
                  />
                  <Search
                    size={18}
                    style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }}
                  />
                </div>

                {/* Autocomplete suggestions dropdown for THIS category */}
                {nombre.trim().length > 1 &&
                  categoryItems.filter(
                    (i) =>
                      i.nombre.toLowerCase().includes(nombre.toLowerCase().trim()) &&
                      i.nombre.toLowerCase() !== nombre.toLowerCase().trim()
                  ).length > 0 && (
                    <div style={styles.autocompleteDropdown}>
                      {categoryItems
                        .filter(
                          (i) =>
                            i.nombre.toLowerCase().includes(nombre.toLowerCase().trim()) &&
                            i.nombre.toLowerCase() !== nombre.toLowerCase().trim()
                        )
                        .slice(0, 5)
                        .map((prod) => (
                          <div
                            key={prod.id}
                            style={styles.suggestionRow}
                            onClick={() => handleSelectAutocomplete(prod)}
                          >
                            <span style={{ fontWeight: 700 }}>{prod.nombre}</span>
                            <span style={{ fontSize: '11px', color: '#78716C' }}>
                              ({prod.cantidad} {prod.unidadMedida} previo)
                            </span>
                          </div>
                        ))}
                    </div>
                  )}

                {/* Match existing warning indicator */}
                {matchedExistingProduct && !editingId && (
                  <div style={styles.matchAlert}>
                    <Sparkles size={16} color="#D97706" />
                    <span>
                      Este producto ya existe en esta categoría ({matchedExistingProduct.cantidad} {matchedExistingProduct.unidadMedida}). {t('stock_taking.matching_existing')}
                    </span>
                  </div>
                )}
              </div>

              {/* Quantity Stepper (Mobile Friendly Touch Controls) */}
              <div style={{ ...styles.fieldGroup, marginTop: '16px' }}>
                <label style={styles.fieldLabel}>{t('stock_taking.quantity')} *</label>
                <div style={styles.stepperContainer}>
                  <button
                    type="button"
                    style={styles.stepperBtn}
                    onClick={() => setCantidad((prev) => Math.max(1, prev - 1))}
                  >
                    <Minus size={22} />
                  </button>

                  <input
                    type="number"
                    min="1"
                    value={cantidad}
                    onChange={(e) => setCantidad(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    style={styles.stepperInput}
                  />

                  <button
                    type="button"
                    style={styles.stepperBtn}
                    onClick={() => setCantidad((prev) => prev + 1)}
                  >
                    <Plus size={22} />
                  </button>

                  {/* Quick increment buttons */}
                  <div style={{ display: 'flex', gap: '6px', marginLeft: 'auto' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setCantidad((prev) => prev + 5)}
                      style={{ padding: '8px 12px', fontSize: '12px', fontWeight: 800 }}
                    >
                      +5
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setCantidad((prev) => prev + 10)}
                      style={{ padding: '8px 12px', fontSize: '12px', fontWeight: 800 }}
                    >
                      +10
                    </button>
                  </div>
                </div>
              </div>

              {/* Unit of Measure & Camera Input Row */}
              <div style={styles.unitAndPhotoRow}>
                {/* Unit Dropdown */}
                <div style={{ flex: 1 }}>
                  <label style={styles.fieldLabel}>{t('stock_taking.unit_of_measure')}</label>
                  <select
                    value={unidadMedida}
                    onChange={(e) => setUnidadMedida(e.target.value)}
                    className="industrial-select"
                    style={{ width: '100%', height: '42px', fontSize: '14px', fontWeight: 600 }}
                  >
                    {(rubroConfig.unidadesMedida.length > 0
                      ? rubroConfig.unidadesMedida
                      : ['unidad', 'caja', 'metro', 'kg']
                    ).map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Photo Input (Mobile Camera direct trigger via capture="environment") */}
                <div>
                  <label style={styles.fieldLabel}>{t('stock_taking.take_photo')}</label>
                  <label
                    className="btn btn-secondary"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      height: '42px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      padding: '0 14px',
                    }}
                  >
                    <Camera size={18} style={{ color: fotoUrl ? '#16A34A' : 'var(--color-primary)' }} />
                    <span>{fotoUrl ? t('stock_taking.photo_added') : 'Foto'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handlePhotoCapture}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>
              </div>

              {/* Photo Preview Thumbnail */}
              {fotoUrl && (
                <div style={styles.photoPreviewBox}>
                  <img src={fotoUrl} alt="Preview" style={styles.photoPreviewImg} />
                  <button
                    type="button"
                    onClick={() => setFotoUrl('')}
                    style={styles.removePhotoBtn}
                  >
                    Quitar foto
                  </button>
                </div>
              )}

              {/* Action Button: Guardar y agregar otro */}
              <div style={{ marginTop: '20px' }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{
                    width: '100%',
                    padding: '14px',
                    fontSize: '15px',
                    fontWeight: 800,
                    justifyContent: 'center',
                    letterSpacing: '0.03em',
                  }}
                >
                  <Plus size={20} />
                  <span>
                    {editingId ? 'Actualizar Producto' : t('stock_taking.save_and_add_another')}
                  </span>
                </button>
              </div>
            </form>
          </div>

          {/* List of items already counted in THIS category */}
          <div className="industrial-card" style={{ marginTop: '20px', padding: '16px' }}>
            <h3 style={{ fontSize: '14px', textTransform: 'uppercase', marginBottom: '12px' }}>
              {t('stock_taking.items_in_category')} ({categoryItems.length})
            </h3>

            {categoryItems.length === 0 ? (
              <p style={{ fontSize: '13px', color: '#78716C', textAlign: 'center', padding: '16px 0' }}>
                {t('stock_taking.no_items_in_category')}
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {categoryItems.map((item) => (
                  <div key={item.id} style={styles.itemRowCard}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {item.fotoUrl ? (
                        <img
                          src={item.fotoUrl}
                          alt={item.nombre}
                          style={{ width: '42px', height: '42px', objectFit: 'cover', borderRadius: '4px' }}
                        />
                      ) : (
                        <div style={styles.noPhotoPlaceholder}>-</div>
                      )}
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '14px' }}>{item.nombre}</div>
                        <div style={{ fontSize: '12px', color: '#78716C', marginTop: '2px' }}>
                          <span style={{ fontWeight: 800, color: 'var(--color-primary)' }}>
                            {item.cantidad}
                          </span>{' '}
                          {item.unidadMedida}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => handleStartEdit(item)}
                        style={{ padding: '6px 10px', fontSize: '11px' }}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteItem(item.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', padding: '6px' }}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* VIEW 3: CATEGORY SELECTION LIST (DEFAULT HOME) */
        <div style={{ marginTop: '20px' }}>
          <div style={styles.categoryHeader}>
            <FolderOpen size={20} style={{ color: 'var(--color-primary)' }} />
            <h2 style={{ fontSize: '16px', textTransform: 'uppercase', margin: 0 }}>
              {t('stock_taking.categories_title')}
            </h2>
          </div>

          <div style={styles.categoryGrid}>
            {categories.map((cat) => {
              const count = items.filter((i) => i.categoria === cat).length;
              const totalCatUnits = items
                .filter((i) => i.categoria === cat)
                .reduce((acc, i) => acc + i.cantidad, 0);

              return (
                <div
                  key={cat}
                  className="industrial-card"
                  style={styles.categoryCard}
                  onClick={() => setSelectedCategory(cat)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 800, margin: 0 }}>{cat}</h3>
                    <span
                      className={count > 0 ? 'badge badge-primary' : 'badge badge-secondary'}
                      style={{ fontSize: '11px' }}
                    >
                      {t('stock_taking.products_count').replace('{count}', String(count))}
                    </span>
                  </div>

                  <div style={{ marginTop: '12px', fontSize: '12px', color: '#78716C', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{count > 0 ? `${totalCatUnits} unidades` : 'Sin contar'}</span>
                    <span style={{ fontWeight: 800, color: 'var(--color-primary)' }}>Tocar para contar &rarr;</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '20px',
    maxWidth: '1000px',
    margin: '0 auto',
    paddingBottom: '100px',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    paddingBottom: '16px',
    borderBottom: '2px solid var(--color-border)',
  },
  headerIconWrapper: {
    width: '44px',
    height: '44px',
    backgroundColor: 'var(--color-primary-light, #FFEDD5)',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toast: {
    position: 'fixed',
    bottom: '80px',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: '#16A34A',
    color: '#FFFFFF',
    padding: '12px 24px',
    borderRadius: '8px',
    fontWeight: 700,
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
    zIndex: 9999,
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '12px',
    marginTop: '16px',
  },
  statCard: {
    padding: '14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  statLabel: {
    fontSize: '11px',
    fontWeight: 800,
    color: 'var(--color-text-muted)',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: '24px',
    fontWeight: 900,
    fontFamily: 'var(--font-display)',
  },
  categoryHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '14px',
  },
  categoryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '14px',
  },
  categoryCard: {
    padding: '16px',
    cursor: 'pointer',
    transition: 'transform 0.15s ease, border-color 0.15s ease',
  },
  countCard: {
    padding: '20px',
  },
  countHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: '12px',
    borderBottom: '1px solid var(--color-border)',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  fieldLabel: {
    fontSize: '12px',
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
    color: 'var(--color-text-main)',
  },
  stepperContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  stepperBtn: {
    width: '46px',
    height: '46px',
    borderRadius: '6px',
    border: '2px solid var(--color-border)',
    backgroundColor: '#FFFFFF',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--color-text-main)',
  },
  stepperInput: {
    width: '80px',
    height: '46px',
    textAlign: 'center',
    fontSize: '18px',
    fontWeight: 800,
    border: '2px solid var(--color-border)',
    borderRadius: '6px',
  },
  unitAndPhotoRow: {
    display: 'flex',
    gap: '12px',
    alignItems: 'flex-end',
    marginTop: '16px',
  },
  photoPreviewBox: {
    marginTop: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '8px',
    border: '1px dashed var(--color-border)',
    borderRadius: '6px',
  },
  photoPreviewImg: {
    width: '50px',
    height: '50px',
    objectFit: 'cover',
    borderRadius: '4px',
  },
  removePhotoBtn: {
    fontSize: '12px',
    color: '#DC2626',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontWeight: 700,
  },
  autocompleteDropdown: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    border: '2px solid var(--color-border)',
    borderRadius: '4px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    zIndex: 10,
    marginTop: '4px',
  },
  suggestionRow: {
    padding: '10px 14px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'pointer',
    borderBottom: '1px solid #F5F5F4',
  },
  matchAlert: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    backgroundColor: '#FEF3C7',
    border: '1px solid #FCD34D',
    borderRadius: '4px',
    fontSize: '12px',
    color: '#92400E',
    marginTop: '6px',
  },
  itemRowCard: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    border: '1px solid var(--color-border)',
    borderRadius: '6px',
    backgroundColor: '#FFFFFF',
  },
  noPhotoPlaceholder: {
    width: '42px',
    height: '42px',
    backgroundColor: '#F5F5F4',
    border: '1px solid var(--color-border)',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#9CA3AF',
    fontWeight: 700,
  },
  sectionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: '12px',
    borderBottom: '2px solid var(--color-border)',
  },
  summaryCategoryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: '12px',
    marginTop: '16px',
  },
  summaryCatCard: {
    padding: '12px',
    border: '1.5px solid var(--color-border)',
    borderRadius: '6px',
    backgroundColor: '#FAFAF9',
    cursor: 'pointer',
  },
};
