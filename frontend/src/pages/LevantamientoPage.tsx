import React, { useState, useEffect, useRef } from 'react';
import {
  ClipboardList,
  Plus,
  Camera,
  Check,
  FileSpreadsheet,
  ArrowLeft,
  Search,
  Trash2,
  FolderOpen,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  RefreshCw,
  Edit2,
  CheckCircle2,
  FileText,
} from 'lucide-react';
import { useRubroConfig } from '../hooks/useRubroConfig';
import { useI18n } from '../context/I18nContext';
import { exportToCSV } from '../utils/csvExport';
import { api } from '../utils/api';

export type LevantamientoStatus = 'BORRADOR' | 'EN_PROGRESO' | 'REVISION' | 'FINALIZADO';

export interface LevantamientoItem {
  id: string;
  levantamientoId?: string;
  descripcion: string;
  cantidad: number;
  unidadMedida: string;
  codigo?: string;
  codigoBarras?: string;
  marca?: string;
  categoria?: string;
  precioEst?: number;
  ubicacion?: string;
  notas?: string;
  fotoUrl?: string;
  fechaCreacion?: string;
  syncStatus?: 'SAVED' | 'SAVING' | 'ERROR';
}

export interface LevantamientoSession {
  id: string;
  nombre: string;
  descripcion?: string;
  estado: LevantamientoStatus;
  fechaCreacion: string;
  fechaActualizacion?: string;
  itemsCount?: number;
  items: LevantamientoItem[];
}

const COMMON_UNITS = [
  'Unidad',
  'Caja',
  'Bolsa',
  'Saco',
  'Metro',
  'Kilogramo',
  'Litro',
  'Par',
  'Juego',
  'Rollo',
  'Paquete',
];

export const LevantamientoPage: React.FC = () => {
  const rubroConfig = useRubroConfig();
  const { t } = useI18n();

  // API State
  const [sessions, setSessions] = useState<LevantamientoSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [loadingSessions, setLoadingSessions] = useState<boolean>(true);
  const [loadingItems, setLoadingItems] = useState<boolean>(false);

  // New Session Modal / Form state
  const [showCreateSessionModal, setShowCreateSessionModal] = useState<boolean>(false);
  const [newSessionNombre, setNewSessionNombre] = useState<string>('');
  const [newSessionDesc, setNewSessionDesc] = useState<string>('');
  const [creatingSession, setCreatingSession] = useState<boolean>(false);

  // Capture Form States
  const [descripcion, setDescripcion] = useState<string>('');
  const [cantidad, setCantidad] = useState<number>(1);
  const [unidadMedida, setUnidadMedida] = useState<string>('Unidad');

  // More Info Accordion Toggle
  const [showMoreInfo, setShowMoreInfo] = useState<boolean>(false);

  // Secondary Optional Fields
  const [codigo, setCodigo] = useState<string>('');
  const [codigoBarras, setCodigoBarras] = useState<string>('');
  const [marca, setMarca] = useState<string>('');
  const [categoria, setCategoria] = useState<string>('');
  const [precioEst, setPrecioEst] = useState<string>('');
  const [ubicacion, setUbicacion] = useState<string>('');
  const [notas, setNotas] = useState<string>('');
  const [fotoUrl, setFotoUrl] = useState<string>('');

  // Edit Mode & Sync Statuses
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'IDLE' | 'SAVING' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [lastErrorMsg, setLastErrorMsg] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Filter & Search inside session
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Refs for auto-focus
  const descripcionInputRef = useRef<HTMLInputElement>(null);

  const activeSession = sessions.find((s) => s.id === activeSessionId) || null;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Load Sessions from API
  const fetchSessionsFromApi = async () => {
    setLoadingSessions(true);
    try {
      const response = await api.get('/levantamientos');
      if (response.data && Array.isArray(response.data)) {
        setSessions(
          response.data.map((s: any) => ({
            id: s.id,
            nombre: s.nombre,
            descripcion: s.descripcion,
            estado: s.estado || 'BORRADOR',
            fechaCreacion: s.fechaCreacion || s.createdAt || new Date().toISOString(),
            fechaActualizacion: s.fechaActualizacion || s.updatedAt,
            itemsCount: s._count?.items ?? s.items?.length ?? 0,
            items: s.items || [],
          }))
        );
      }
    } catch (err: any) {
      console.warn('API /levantamientos fetch warning:', err);
    } finally {
      setLoadingSessions(false);
    }
  };

  useEffect(() => {
    fetchSessionsFromApi();
  }, []);

  // Load Items from API when opening session
  const fetchItemsForSession = async (sessionId: string) => {
    setLoadingItems(true);
    try {
      let itemsData: LevantamientoItem[] = [];
      try {
        const response = await api.get(`/levantamientos/${sessionId}/items`);
        if (response.data && Array.isArray(response.data)) {
          itemsData = response.data;
        }
      } catch {
        const response = await api.get(`/levantamientos/${sessionId}`);
        if (response.data && Array.isArray(response.data.items)) {
          itemsData = response.data.items;
        }
      }

      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, items: itemsData } : s))
      );
    } catch (err: any) {
      console.warn('API /levantamientos/:id/items fetch error:', err);
    } finally {
      setLoadingItems(false);
    }
  };

  const handleSelectSession = (sessionId: string) => {
    setActiveSessionId(sessionId);
    fetchItemsForSession(sessionId);
  };

  // Create new Levantamiento Session via API
  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSessionNombre.trim() || creatingSession) return;

    setCreatingSession(true);
    setLastErrorMsg(null);

    try {
      const response = await api.post('/levantamientos', {
        nombre: newSessionNombre.trim(),
        descripcion: newSessionDesc.trim() || undefined,
      });

      const created: LevantamientoSession = {
        id: response.data.id,
        nombre: response.data.nombre || newSessionNombre.trim(),
        descripcion: response.data.descripcion || newSessionDesc.trim() || undefined,
        estado: response.data.estado || 'BORRADOR',
        fechaCreacion: response.data.fechaCreacion || new Date().toISOString(),
        items: [],
      };

      setSessions((prev) => [created, ...prev]);
      setActiveSessionId(created.id);
      setShowCreateSessionModal(false);
      setNewSessionNombre('');
      setNewSessionDesc('');
      showToast(t('stock_taking.saved'));
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Error al crear levantamiento';
      setLastErrorMsg(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setCreatingSession(false);
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

  // Main Action: GUARDAR Y SIGUIENTE (POST /levantamientos/:id/items or PATCH)
  const handleSaveAndNext = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (!activeSession || saveStatus === 'SAVING') return;
    const cleanDesc = descripcion.trim();
    if (!cleanDesc) return;

    setSaveStatus('SAVING');
    setLastErrorMsg(null);

    const payload = {
      descripcion: cleanDesc,
      cantidad: Math.max(0, cantidad),
      unidadMedida: unidadMedida || 'Unidad',
      codigo: codigo.trim() || undefined,
      codigoBarras: codigoBarras.trim() || undefined,
      marca: marca.trim() || undefined,
      categoria: categoria.trim() || undefined,
      precioEst: precioEst ? parseFloat(precioEst) : undefined,
      ubicacion: ubicacion.trim() || undefined,
      notas: notas.trim() || undefined,
      fotoUrl: fotoUrl || undefined,
    };

    try {
      let savedItem: LevantamientoItem;

      if (editingItemId) {
        // Edit existing item via API
        const response = await api.patch(`/levantamientos/${activeSession.id}/items/${editingItemId}`, payload);
        savedItem = {
          ...response.data,
          id: response.data.id || editingItemId,
          syncStatus: 'SAVED',
        };
      } else {
        // Create new item via API
        const response = await api.post(`/levantamientos/${activeSession.id}/items`, payload);
        savedItem = {
          ...response.data,
          id: response.data.id,
          syncStatus: 'SAVED',
        };
      }

      setSaveStatus('SUCCESS');

      // Update Session items in state
      setSessions((prevSessions) =>
        prevSessions.map((sess) => {
          if (sess.id !== activeSession.id) return sess;
          const existingIdx = sess.items.findIndex((i) => i.id === savedItem.id);
          let updatedItems = [...sess.items];

          if (existingIdx >= 0) {
            updatedItems[existingIdx] = savedItem;
          } else {
            updatedItems = [savedItem, ...updatedItems];
          }

          return {
            ...sess,
            estado: sess.estado === 'BORRADOR' ? 'EN_PROGRESO' : sess.estado,
            fechaActualizacion: new Date().toISOString(),
            items: updatedItems,
          };
        })
      );

      showToast(editingItemId ? t('stock_taking.saved') : t('stock_taking.item_added_success'));

      // Reset form input for continuous fast keying
      setDescripcion('');
      setCantidad(1);
      setCodigo('');
      setCodigoBarras('');
      setMarca('');
      setCategoria('');
      setPrecioEst('');
      setNotas('');
      setFotoUrl('');
      setEditingItemId(null);
      setSaveStatus('IDLE');

      setTimeout(() => {
        descripcionInputRef.current?.focus();
      }, 50);
    } catch (err: any) {
      setSaveStatus('ERROR');
      const errDetail = err?.response?.data?.message
        ? (Array.isArray(err.response.data.message) ? err.response.data.message.join(', ') : err.response.data.message)
        : (err?.message || t('stock_taking.save_error'));

      setLastErrorMsg(`${t('stock_taking.save_error')} (${errDetail})`);
    }
  };

  const handleStartEdit = (item: LevantamientoItem) => {
    setEditingItemId(item.id);
    setDescripcion(item.descripcion);
    setCantidad(item.cantidad);
    setUnidadMedida(item.unidadMedida);
    setCodigo(item.codigo || '');
    setCodigoBarras(item.codigoBarras || '');
    setMarca(item.marca || '');
    setCategoria(item.categoria || '');
    setPrecioEst(item.precioEst ? String(item.precioEst) : '');
    setUbicacion(item.ubicacion || '');
    setNotas(item.notas || '');
    setFotoUrl(item.fotoUrl || '');

    if (item.codigo || item.codigoBarras || item.marca || item.categoria || item.precioEst || item.fotoUrl || item.notas) {
      setShowMoreInfo(true);
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!activeSession) return;
    if (!window.confirm(t('stock_taking.confirm_delete_item'))) return;

    try {
      await api.delete(`/levantamientos/${activeSession.id}/items/${itemId}`);

      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSession.id
            ? {
                ...s,
                items: s.items.filter((i) => i.id !== itemId),
                fechaActualizacion: new Date().toISOString(),
              }
            : s
        )
      );

      if (editingItemId === itemId) {
        setEditingItemId(null);
        setDescripcion('');
        setCantidad(1);
      }
      showToast(t('stock_taking.saved'));
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Error al eliminar registro';
      alert(Array.isArray(msg) ? msg.join(', ') : msg);
    }
  };

  const handleFinalizeSession = async () => {
    if (!activeSession) return;
    if (!window.confirm(t('stock_taking.confirm_finalize'))) return;

    try {
      await api.patch(`/levantamientos/${activeSession.id}`, { estado: 'FINALIZADO' });

      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSession.id
            ? { ...s, estado: 'FINALIZADO', fechaActualizacion: new Date().toISOString() }
            : s
        )
      );
      showToast(t('stock_taking.saved'));
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Error al finalizar levantamiento';
      alert(Array.isArray(msg) ? msg.join(', ') : msg);
    }
  };

  const handleExportCSV = () => {
    if (!activeSession || activeSession.items.length === 0) return;

    const exportData = activeSession.items.map((item) => ({
      descripcion: item.descripcion,
      cantidad: item.cantidad,
      unidadMedida: item.unidadMedida,
      codigo: item.codigo || '',
      codigoBarras: item.codigoBarras || '',
      marca: item.marca || '',
      categoria: item.categoria || '',
      precioEst: item.precioEst || '',
      ubicacion: item.ubicacion || '',
      notas: item.notas || '',
    }));

    const dateStr = new Date().toISOString().split('T')[0];
    exportToCSV(`Levantamiento_${activeSession.nombre.replace(/\s+/g, '_')}_${dateStr}.csv`, exportData, [
      { key: 'descripcion', label: 'descripcion' },
      { key: 'cantidad', label: 'cantidad' },
      { key: 'unidadMedida', label: 'unidadMedida' },
      { key: 'codigo', label: 'codigo' },
      { key: 'codigoBarras', label: 'codigoBarras' },
      { key: 'marca', label: 'marca' },
      { key: 'categoria', label: 'categoria' },
      { key: 'precioEst', label: 'precioEst' },
      { key: 'ubicacion', label: 'ubicacion' },
      { key: 'notas', label: 'notas' },
    ]);
  };

  const filteredItems = (activeSession?.items || []).filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      item.descripcion.toLowerCase().includes(q) ||
      (item.codigo && item.codigo.toLowerCase().includes(q)) ||
      (item.marca && item.marca.toLowerCase().includes(q))
    );
  });

  const getStatusBadgeClass = (st: LevantamientoStatus) => {
    switch (st) {
      case 'BORRADOR':
        return 'badge badge-secondary';
      case 'EN_PROGRESO':
        return 'badge badge-primary';
      case 'REVISION':
        return 'badge badge-warning';
      case 'FINALIZADO':
        return 'badge badge-success';
    }
  };

  const getStatusText = (st: LevantamientoStatus) => {
    switch (st) {
      case 'BORRADOR':
        return t('stock_taking.status_draft');
      case 'EN_PROGRESO':
        return t('stock_taking.status_in_progress');
      case 'REVISION':
        return t('stock_taking.status_review');
      case 'FINALIZADO':
        return t('stock_taking.status_completed');
    }
  };

  return (
    <div style={styles.container}>
      {/* Toast Notification */}
      {toastMessage && (
        <div style={styles.toast}>
          <CheckCircle2 size={18} color="#FFFFFF" />
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

        {activeSession && (
          <div style={{ marginTop: '12px', display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setActiveSessionId(null);
                setEditingItemId(null);
              }}
              style={{ fontSize: '12px', padding: '8px 14px' }}
            >
              <ArrowLeft size={16} />
              <span>{t('stock_taking.back_to_sessions')}</span>
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleExportCSV}
              disabled={activeSession.items.length === 0}
              style={{ fontSize: '12px', padding: '8px 14px' }}
            >
              <FileSpreadsheet size={16} />
              <span>{t('stock_taking.export_csv')}</span>
            </button>
          </div>
        )}
      </div>

      {/* VIEW 1: ACTIVE LEVANTAMIENTO CAPTURE INTERFACE */}
      {activeSession ? (
        <div style={{ marginTop: '16px' }}>
          {/* Active Session Info Bar */}
          <div className="industrial-card" style={{ padding: '16px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <span className={getStatusBadgeClass(activeSession.estado)}>
                  {getStatusText(activeSession.estado)}
                </span>
                <h2 style={{ fontSize: '18px', fontWeight: 800, margin: '6px 0 2px 0' }}>
                  {activeSession.nombre}
                </h2>
                {activeSession.descripcion && (
                  <p style={{ fontSize: '12px', color: '#78716C', margin: 0 }}>
                    {activeSession.descripcion}
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '11px', color: '#78716C', textTransform: 'uppercase', fontWeight: 800 }}>
                    {t('stock_taking.total_records')}
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--color-primary)' }}>
                    {activeSession.items.length}
                  </div>
                </div>

                {activeSession.estado !== 'FINALIZADO' && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleFinalizeSession}
                    style={{ fontSize: '12px', padding: '8px 12px' }}
                  >
                    <Check size={16} />
                    <span>{t('stock_taking.finalize_session')}</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Ultra-Fast Capture Card */}
          <div className="industrial-card" style={styles.captureCard}>
            <div style={styles.cardHeader}>
              <span style={styles.cardHeaderTag}>
                {t('stock_taking.quick_count')}
              </span>
              {saveStatus === 'SAVING' && (
                <span style={styles.savingTag}>
                  <RefreshCw size={14} className="spin" /> {t('stock_taking.saving')}
                </span>
              )}
            </div>

            <form onSubmit={handleSaveAndNext} style={{ marginTop: '14px' }}>
              {/* Field 1: Descripción (Required, Prominent) */}
              <div style={styles.fieldGroup}>
                <label style={styles.fieldLabel}>
                  {t('stock_taking.description')} *
                </label>
                <input
                  ref={descripcionInputRef}
                  type="text"
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder={t('stock_taking.description_placeholder')}
                  className="industrial-input"
                  style={{ width: '100%', fontSize: '16px', fontWeight: 700, padding: '12px 14px' }}
                  required
                  autoFocus
                />
              </div>

              {/* Field 2: Cantidad (Direct input + Quick Touch Steppers) */}
              <div style={{ ...styles.fieldGroup, marginTop: '16px' }}>
                <label style={styles.fieldLabel}>{t('stock_taking.quantity')} *</label>
                <div style={styles.quantityContainer}>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      style={styles.touchBtnSecondary}
                      onClick={() => setCantidad((prev) => Math.max(0, prev - 10))}
                    >
                      -10
                    </button>
                    <button
                      type="button"
                      style={styles.touchBtnSecondary}
                      onClick={() => setCantidad((prev) => Math.max(0, prev - 5))}
                    >
                      -5
                    </button>
                    <button
                      type="button"
                      style={styles.touchBtnSecondary}
                      onClick={() => setCantidad((prev) => Math.max(0, prev - 1))}
                    >
                      -1
                    </button>
                  </div>

                  <input
                    type="number"
                    min="0"
                    value={cantidad}
                    onChange={(e) => setCantidad(Math.max(0, parseInt(e.target.value, 10) || 0))}
                    style={styles.quantityInput}
                  />

                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      style={styles.touchBtnPrimary}
                      onClick={() => setCantidad((prev) => prev + 1)}
                    >
                      +1
                    </button>
                    <button
                      type="button"
                      style={styles.touchBtnPrimary}
                      onClick={() => setCantidad((prev) => prev + 5)}
                    >
                      +5
                    </button>
                    <button
                      type="button"
                      style={styles.touchBtnPrimary}
                      onClick={() => setCantidad((prev) => prev + 10)}
                    >
                      +10
                    </button>
                  </div>
                </div>
              </div>

              {/* Field 3: Unidad de Medida */}
              <div style={{ ...styles.fieldGroup, marginTop: '16px' }}>
                <label style={styles.fieldLabel}>{t('stock_taking.unit_of_measure')}</label>
                <select
                  value={unidadMedida}
                  onChange={(e) => setUnidadMedida(e.target.value)}
                  className="industrial-select"
                  style={{ width: '100%', height: '44px', fontSize: '15px', fontWeight: 600 }}
                >
                  {(rubroConfig.unidadesMedida.length > 0
                    ? rubroConfig.unidadesMedida
                    : COMMON_UNITS
                  ).map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>

              {/* Accordion: + Más Información (Secondary fields) */}
              <div style={{ marginTop: '16px' }}>
                <button
                  type="button"
                  onClick={() => setShowMoreInfo(!showMoreInfo)}
                  style={styles.accordionToggle}
                >
                  <span>{showMoreInfo ? t('stock_taking.hide_more_info') : t('stock_taking.more_info')}</span>
                  {showMoreInfo ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>

                {showMoreInfo && (
                  <div style={styles.accordionContent}>
                    <div style={styles.secondaryGrid}>
                      <div>
                        <label style={styles.fieldLabel}>{t('stock_taking.code')}</label>
                        <input
                          type="text"
                          value={codigo}
                          onChange={(e) => setCodigo(e.target.value)}
                          placeholder="Ej. FER-1001"
                          className="industrial-input"
                          style={{ width: '100%' }}
                        />
                      </div>
                      <div>
                        <label style={styles.fieldLabel}>{t('stock_taking.barcode')}</label>
                        <input
                          type="text"
                          value={codigoBarras}
                          onChange={(e) => setCodigoBarras(e.target.value)}
                          placeholder="Ej. 750123456789"
                          className="industrial-input"
                          style={{ width: '100%' }}
                        />
                      </div>
                      <div>
                        <label style={styles.fieldLabel}>{t('stock_taking.brand')}</label>
                        <input
                          type="text"
                          value={marca}
                          onChange={(e) => setMarca(e.target.value)}
                          placeholder="Ej. Truper, Stanley"
                          className="industrial-input"
                          style={{ width: '100%' }}
                        />
                      </div>
                      <div>
                        <label style={styles.fieldLabel}>{t('stock_taking.category')}</label>
                        <select
                          value={categoria}
                          onChange={(e) => setCategoria(e.target.value)}
                          className="industrial-select"
                          style={{ width: '100%', height: '38px' }}
                        >
                          <option value="">-- Sin categoría --</option>
                          {rubroConfig.categoriasDefault.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={styles.fieldLabel}>{t('stock_taking.price')}</label>
                        <input
                          type="number"
                          step="0.01"
                          value={precioEst}
                          onChange={(e) => setPrecioEst(e.target.value)}
                          placeholder="0.00"
                          className="industrial-input"
                          style={{ width: '100%' }}
                        />
                      </div>
                      <div>
                        <label style={styles.fieldLabel}>{t('stock_taking.location')}</label>
                        <input
                          type="text"
                          value={ubicacion}
                          onChange={(e) => setUbicacion(e.target.value)}
                          placeholder="Ej. Pasillo 3, Estante B"
                          className="industrial-input"
                          style={{ width: '100%' }}
                        />
                      </div>
                    </div>

                    {/* Photo capture optional */}
                    <div style={{ marginTop: '14px' }}>
                      <label style={styles.fieldLabel}>{t('stock_taking.photo')}</label>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '4px' }}>
                        <label
                          className="btn btn-secondary"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            cursor: 'pointer',
                            fontSize: '13px',
                          }}
                        >
                          <Camera size={18} style={{ color: fotoUrl ? '#16A34A' : 'var(--color-primary)' }} />
                          <span>{fotoUrl ? t('stock_taking.photo_added') : t('stock_taking.take_photo')}</span>
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={handlePhotoCapture}
                            style={{ display: 'none' }}
                          />
                        </label>

                        {fotoUrl && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <img src={fotoUrl} alt="Preview" style={styles.photoPreviewThumb} />
                            <button
                              type="button"
                              onClick={() => setFotoUrl('')}
                              style={{ background: 'none', border: 'none', color: '#DC2626', cursor: 'pointer', fontSize: '12px' }}
                            >
                              {t('stock_taking.remove_photo')}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Notes field */}
                    <div style={{ marginTop: '12px' }}>
                      <label style={styles.fieldLabel}>{t('stock_taking.notes')}</label>
                      <textarea
                        value={notas}
                        onChange={(e) => setNotas(e.target.value)}
                        placeholder="Observaciones adicionales..."
                        className="industrial-input"
                        rows={2}
                        style={{ width: '100%', resize: 'none' }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Error display with Retry option */}
              {lastErrorMsg && (
                <div style={styles.errorBox}>
                  <AlertCircle size={18} color="#DC2626" />
                  <span style={{ flex: 1, fontSize: '13px', color: '#B91C1C' }}>{lastErrorMsg}</span>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => handleSaveAndNext()}
                    style={{ fontSize: '12px', padding: '4px 10px' }}
                  >
                    <RefreshCw size={14} />
                    <span>{t('stock_taking.retry')}</span>
                  </button>
                </div>
              )}

              {/* Primary Action Button: GUARDAR Y SIGUIENTE */}
              <div style={{ marginTop: '20px' }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saveStatus === 'SAVING'}
                  style={{
                    ...styles.primarySaveBtn,
                    opacity: saveStatus === 'SAVING' ? 0.7 : 1,
                  }}
                >
                  <Plus size={22} />
                  <span>
                    {editingItemId ? t('common.save') : t('stock_taking.save_and_next')}
                  </span>
                </button>
              </div>
            </form>
          </div>

          {/* Captured Items List & Search */}
          <div className="industrial-card" style={{ marginTop: '20px', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 800, margin: 0, textTransform: 'uppercase' }}>
                {t('stock_taking.items_list')} ({activeSession.items.length})
              </h3>

              {/* Search Bar */}
              <div style={{ position: 'relative', minWidth: '240px' }}>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('stock_taking.search_placeholder')}
                  className="industrial-input"
                  style={{ width: '100%', paddingLeft: '32px', fontSize: '13px' }}
                />
                <Search
                  size={16}
                  style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }}
                />
              </div>
            </div>

            {loadingItems ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#78716C' }}>
                <RefreshCw size={20} className="spin" />
                <p style={{ fontSize: '13px', marginTop: '8px' }}>Cargando registros...</p>
              </div>
            ) : filteredItems.length === 0 ? (
              <p style={{ fontSize: '13px', color: '#78716C', textAlign: 'center', padding: '24px 0' }}>
                {t('stock_taking.no_records')}
              </p>
            ) : (
              <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {filteredItems.map((item) => (
                  <div key={item.id} style={styles.itemCard}>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flex: 1 }}>
                      {item.fotoUrl ? (
                        <img src={item.fotoUrl} alt={item.descripcion} style={styles.itemPhotoThumb} />
                      ) : (
                        <div style={styles.noPhotoPlaceholder}>
                          <FileText size={18} />
                        </div>
                      )}

                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--color-text-main)' }}>
                          {item.descripcion}
                        </div>
                        <div style={{ fontSize: '12px', color: '#78716C', marginTop: '2px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 800, color: 'var(--color-primary)' }}>
                            {item.cantidad} {item.unidadMedida}
                          </span>
                          {item.codigo && <span>• Cód: <strong>{item.codigo}</strong></span>}
                          {item.marca && <span>• Marca: {item.marca}</span>}
                          {item.ubicacion && <span>• Ubic: {item.ubicacion}</span>}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => handleStartEdit(item)}
                        style={{ padding: '6px 10px', fontSize: '12px' }}
                      >
                        <Edit2 size={14} />
                        <span>{t('stock_taking.edit_item')}</span>
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
        /* VIEW 2: SESSIONS LIST & CREATION (DEFAULT SCREEN) */
        <div style={{ marginTop: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <FolderOpen size={20} style={{ color: 'var(--color-primary)' }} />
              <h2 style={{ fontSize: '16px', fontWeight: 800, textTransform: 'uppercase', margin: 0 }}>
                {t('stock_taking.sessions_title')}
              </h2>
            </div>

            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowCreateSessionModal(true)}
              style={{ fontSize: '13px', padding: '10px 16px' }}
            >
              <Plus size={18} />
              <span>{t('stock_taking.new_session')}</span>
            </button>
          </div>

          {/* Modal / Form for Creating Session */}
          {showCreateSessionModal && (
            <div className="industrial-card" style={{ padding: '20px', marginBottom: '20px', border: '2px solid var(--color-primary)' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 800, margin: '0 0 14px 0', textTransform: 'uppercase' }}>
                {t('stock_taking.create_session_title')}
              </h3>
              <form onSubmit={handleCreateSession}>
                <div style={styles.fieldGroup}>
                  <label style={styles.fieldLabel}>{t('stock_taking.session_name')} *</label>
                  <input
                    type="text"
                    value={newSessionNombre}
                    onChange={(e) => setNewSessionNombre(e.target.value)}
                    placeholder={t('stock_taking.session_name_placeholder')}
                    className="industrial-input"
                    style={{ width: '100%', fontSize: '14px' }}
                    required
                    autoFocus
                  />
                </div>

                <div style={{ ...styles.fieldGroup, marginTop: '12px' }}>
                  <label style={styles.fieldLabel}>{t('stock_taking.session_desc')}</label>
                  <input
                    type="text"
                    value={newSessionDesc}
                    onChange={(e) => setNewSessionDesc(e.target.value)}
                    placeholder={t('stock_taking.session_desc_placeholder')}
                    className="industrial-input"
                    style={{ width: '100%', fontSize: '14px' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '16px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowCreateSessionModal(false)}
                  >
                    {t('common.cancel')}
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={creatingSession}>
                    {creatingSession ? t('stock_taking.saving') : t('stock_taking.create_and_start')}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Sessions List */}
          {loadingSessions ? (
            <div className="industrial-card" style={{ padding: '40px 20px', textAlign: 'center', color: '#78716C' }}>
              <RefreshCw size={24} className="spin" style={{ marginBottom: '8px' }} />
              <p style={{ fontSize: '14px', margin: 0 }}>{t('stock_taking.saving')}</p>
            </div>
          ) : sessions.length === 0 ? (
            <div className="industrial-card" style={{ padding: '40px 20px', textAlign: 'center' }}>
              <ClipboardList size={40} style={{ color: '#9CA3AF', marginBottom: '12px' }} />
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 6px 0' }}>
                {t('stock_taking.no_active_sessions')}
              </h3>
              <p style={{ fontSize: '13px', color: '#78716C', margin: '0 0 16px 0' }}>
                {t('stock_taking.no_active_sessions_desc')}
              </p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowCreateSessionModal(true)}
              >
                <Plus size={18} />
                <span>{t('stock_taking.new_session')}</span>
              </button>
            </div>
          ) : (
            <div style={styles.sessionsGrid}>
              {sessions.map((sess) => (
                <div
                  key={sess.id}
                  className="industrial-card"
                  style={styles.sessionCard}
                  onClick={() => handleSelectSession(sess.id)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span className={getStatusBadgeClass(sess.estado)}>
                      {getStatusText(sess.estado)}
                    </span>
                    <span style={{ fontSize: '12px', color: '#78716C' }}>
                      {new Date(sess.fechaCreacion).toLocaleDateString()}
                    </span>
                  </div>

                  <h3 style={{ fontSize: '16px', fontWeight: 800, margin: '10px 0 4px 0' }}>
                    {sess.nombre}
                  </h3>
                  {sess.descripcion && (
                    <p style={{ fontSize: '12px', color: '#78716C', margin: '0 0 12px 0' }}>
                      {sess.descripcion}
                    </p>
                  )}

                  <div style={styles.sessionFooter}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-main)' }}>
                      <strong>{sess.itemsCount ?? sess.items.length}</strong> {t('stock_taking.total_records').toLowerCase()}
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--color-primary)' }}>
                      {t('stock_taking.continue_session')} &rarr;
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '20px',
    maxWidth: '900px',
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
  captureCard: {
    padding: '20px',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: '10px',
    borderBottom: '1px solid var(--color-border)',
  },
  cardHeaderTag: {
    fontSize: '12px',
    fontWeight: 900,
    color: 'var(--color-primary)',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  },
  savingTag: {
    fontSize: '12px',
    color: 'var(--color-primary)',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
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
  quantityContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  touchBtnSecondary: {
    minWidth: '42px',
    height: '44px',
    padding: '0 8px',
    borderRadius: '6px',
    border: '2px solid var(--color-border)',
    backgroundColor: '#F5F5F4',
    color: 'var(--color-text-main)',
    fontWeight: 800,
    fontSize: '13px',
    cursor: 'pointer',
  },
  touchBtnPrimary: {
    minWidth: '42px',
    height: '44px',
    padding: '0 8px',
    borderRadius: '6px',
    border: '2px solid var(--color-primary)',
    backgroundColor: '#FFEDD5',
    color: 'var(--color-primary-dark, #C2410C)',
    fontWeight: 800,
    fontSize: '13px',
    cursor: 'pointer',
  },
  quantityInput: {
    width: '76px',
    height: '44px',
    textAlign: 'center',
    fontSize: '18px',
    fontWeight: 900,
    border: '2px solid var(--color-border)',
    borderRadius: '6px',
  },
  accordionToggle: {
    width: '100%',
    padding: '10px',
    backgroundColor: '#FAFAF9',
    border: '1px dashed var(--color-border)',
    borderRadius: '6px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 700,
    color: 'var(--color-text-main)',
  },
  accordionContent: {
    marginTop: '12px',
    padding: '14px',
    border: '1px solid var(--color-border)',
    borderRadius: '6px',
    backgroundColor: '#FFFFFF',
  },
  secondaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: '12px',
  },
  photoPreviewThumb: {
    width: '40px',
    height: '40px',
    objectFit: 'cover',
    borderRadius: '4px',
    border: '1px solid var(--color-border)',
  },
  errorBox: {
    marginTop: '14px',
    padding: '10px 14px',
    backgroundColor: '#FEE2E2',
    border: '1px solid #FCA5A5',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  primarySaveBtn: {
    width: '100%',
    padding: '14px',
    fontSize: '16px',
    fontWeight: 900,
    justifyContent: 'center',
    letterSpacing: '0.04em',
    minHeight: '50px',
  },
  itemCard: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 14px',
    border: '1px solid var(--color-border)',
    borderRadius: '6px',
    backgroundColor: '#FFFFFF',
    flexWrap: 'wrap',
    gap: '10px',
  },
  itemPhotoThumb: {
    width: '44px',
    height: '44px',
    objectFit: 'cover',
    borderRadius: '4px',
    border: '1px solid var(--color-border)',
  },
  noPhotoPlaceholder: {
    width: '44px',
    height: '44px',
    backgroundColor: '#F5F5F4',
    border: '1px solid var(--color-border)',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#9CA3AF',
  },
  sessionsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '16px',
  },
  sessionCard: {
    padding: '16px',
    cursor: 'pointer',
    transition: 'transform 0.15s ease, border-color 0.15s ease',
  },
  sessionFooter: {
    marginTop: '14px',
    paddingTop: '10px',
    borderTop: '1px solid var(--color-border)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
};
