import React, { useState } from 'react';
import Papa from 'papaparse';
import { Upload, Download, AlertTriangle, Check, X, FileSpreadsheet, CheckCircle2 } from 'lucide-react';
import { useRubroConfig } from '../hooks/useRubroConfig';
import { useI18n } from '../context/I18nContext';
import { api } from '../utils/api';
import { inventoryNumber } from '../utils/inventoryNumber';
import { normalizarUnidadMedida } from '../utils/unidadMedida';

interface ImportarProductosModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ParsedRow {
  index: number;
  codigo: string;
  nombre: string;
  categoria: string;
  precioCosto: number;
  precioVenta: number;
  stockActual: number;
  stockMinimo: number;
  unidadMedida: string;
  esValido: boolean;
  errores: string[];
}

interface ImportSummary {
  importadosCount: number;
  actualizadosCount: number;
  errorCount: number;
  omitidosCount: number;
}

export const ImportarProductosModal: React.FC<ImportarProductosModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [productos, setProductos] = useState<any[]>([]);
  const rubroConfig = useRubroConfig();
  const { t } = useI18n();

  React.useEffect(() => {
    if (isOpen) {
      api.get('/productos')
        .then((res) => {
          if (Array.isArray(res.data)) setProductos(res.data);
        })
        .catch((err) => console.error('Error al cargar productos:', err));
    }
  }, [isOpen]);

  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showDuplicateConfirm, setShowDuplicateConfirm] = useState<boolean>(false);
  const [duplicateCount, setDuplicateCount] = useState<number>(0);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  if (!isOpen) return null;

  const handleDownloadTemplate = () => {
    const headers = ['nombre', 'codigo', 'categoria', 'precioCosto', 'precioVenta', 'stockActual', 'stockMinimo', 'unidadMedida'];
    const cats = rubroConfig.categoriasDefault.length > 0 ? rubroConfig.categoriasDefault : ['General', 'Otros'];
    const units = rubroConfig.unidadesMedida.length > 0 ? rubroConfig.unidadesMedida : ['unidad', 'metro'];

    const cat1 = cats[0] || 'General';
    const cat2 = cats[1] || cat1;
    const unit1 = units[0] || 'unidad';
    const unit2 = units[1] || unit1;

    const sampleRows = [
      ['Producto Ejemplo 1', 'COD-001', cat1, '50.00', '75.00', '100', '10', unit1],
      ['Producto Ejemplo 2', 'COD-002', cat2, '120.00', '180.00', '50', '5', unit2],
      ['Producto Ejemplo 3', 'COD-003', cat1, '15.50', '25.00', '200', '20', unit1],
    ];

    const csvContent = [
      headers.join(','),
      ...sampleRows.map((r) => r.map((field) => `"${field.replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'plantilla_productos.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getFieldValue = (rawObj: Record<string, any>, possibleKeys: string[]): string => {
    for (const k of Object.keys(rawObj)) {
      const cleanKey = k.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (possibleKeys.includes(cleanKey)) {
        return String(rawObj[k] ?? '').trim();
      }
    }
    return '';
  };

  const validateAndParseRawData = (rawObjects: Record<string, any>[]): ParsedRow[] => {
    const allowedUnits = rubroConfig.unidadesMedida.map((u) => u.toLowerCase().trim());
    const defaultCategory = rubroConfig.categoriasDefault[0] || 'General';
    const defaultUnit = rubroConfig.unidadesMedida[0] || 'unidad';

    return rawObjects.map((raw, idx) => {
      const codigo = getFieldValue(raw, ['codigo', 'code', 'sku', 'codigoproducto', 'cod']);
      const nombre = getFieldValue(raw, ['nombre', 'name', 'producto', 'articulo', 'descripcion']);
      let categoria = getFieldValue(raw, ['categoria', 'category', 'cat']);
      const precioCostoStr = getFieldValue(raw, ['preciocosto', 'costo', 'cost', 'costprice']);
      const precioVentaStr = getFieldValue(raw, ['precioventa', 'precio', 'price', 'sellingprice']);
      const stockActualStr = getFieldValue(raw, ['stockactual', 'stock', 'cantidad', 'qty', 'quantity']);
      const stockMinimoStr = getFieldValue(raw, ['stockminimo', 'minimo', 'minstock']);
      let unidadMedida = getFieldValue(raw, ['unidadmedida', 'unidad', 'medida', 'unit']);

      const errores: string[] = [];

      if (!codigo) {
        errores.push(t('inventory.invalid_code'));
      }

      if (!nombre) {
        errores.push(t('inventory.invalid_name'));
      }

      const numCosto = inventoryNumber(precioCostoStr, 0);
      if (isNaN(numCosto) || numCosto < 0) {
        errores.push(t('inventory.invalid_prices'));
      }

      const numVenta = inventoryNumber(precioVentaStr, 0);
      if (isNaN(numVenta) || numVenta < 0) {
        errores.push(t('inventory.invalid_prices'));
      }

      const numStock = inventoryNumber(stockActualStr, 0);
      if (isNaN(numStock) || numStock < 0) {
        errores.push(t('inventory.invalid_prices'));
      }

      const numStockMin = inventoryNumber(stockMinimoStr, 5);
      if (isNaN(numStockMin) || numStockMin < 0) {
        errores.push(t('inventory.invalid_prices'));
      }

      if (!unidadMedida) {
        unidadMedida = defaultUnit;
      } else if (
        allowedUnits.length > 0 &&
        !allowedUnits.includes(unidadMedida.toLowerCase().trim())
      ) {
        errores.push(t('inventory.invalid_unit') + `: "${unidadMedida}"`);
      }

      if (!categoria) {
        categoria = defaultCategory;
      }

      return {
        index: idx + 1,
        codigo,
        nombre,
        categoria,
        precioCosto: isNaN(numCosto) ? 0 : numCosto,
        precioVenta: isNaN(numVenta) ? 0 : numVenta,
        stockActual: isNaN(numStock) ? 0 : numStock,
        stockMinimo: isNaN(numStockMin) ? 5 : numStockMin,
        unidadMedida,
        esValido: errores.length === 0,
        errores,
      };
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setLoading(true);
    setErrorMsg(null);
    setSummary(null);
    setShowDuplicateConfirm(false);

    if (!file.name.toLowerCase().endsWith('.csv') || file.size > 5 * 1024 * 1024) {
      setErrorMsg('Selecciona un archivo CSV de hasta 5 MB. Si usas Excel, guárdalo como CSV UTF-8.');
      setRows([]); setLoading(false); return;
    }
    {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          try {
            if (results.errors?.length || results.data.length > 5000) throw new Error('CSV inválido o más de 5000 filas');
            const json = results.data as Record<string, any>[];
            if (!json || json.length === 0) {
              setErrorMsg('El archivo CSV está vacío o no tiene encabezados válidos.');
              setRows([]);
            } else {
              const parsed = validateAndParseRawData(json);
              setRows(parsed);
            }
          } catch (err) {
            setErrorMsg('Revisa el formato CSV y utiliza como máximo 5000 filas por archivo.');
            setRows([]);
          } finally {
            setLoading(false);
          }
        },
        error: (err) => {
          setErrorMsg('Error al leer el archivo CSV: ' + err.message);
          setRows([]);
          setLoading(false);
        },
      });
    }
  };

  const validRows = rows.filter((r) => r.esValido);
  const invalidRows = rows.filter((r) => !r.esValido);

  const handleIniciarImportacion = () => {
    if (validRows.length === 0) return;

    // Check duplicates against existing products in MockData
    const existingCodes = new Set(productos.map((p) => p.codigo.trim().toUpperCase()));
    const duplicates = validRows.filter((r) => existingCodes.has(r.codigo.trim().toUpperCase()));

    if (duplicates.length > 0) {
      setDuplicateCount(duplicates.length);
      setShowDuplicateConfirm(true);
    } else {
      ejecutarImportacion(false);
    }
  };

  const ejecutarImportacion = async (sobrescribir: boolean) => {
    if (loading) return;
    setLoading(true);
    let importados = 0;
    let actualizados = 0;
    let errores = invalidRows.length;
    let omitidos = 0;
    const existentes = new Map(productos.map((p) => [p.codigo.trim().toUpperCase(), p.id]));

    try {
      for (const r of validRows) {
        const payload = {
          codigo: r.codigo.toUpperCase().trim(),
          motivo: 'Importación de inventario revisada',
          nombre: r.nombre.trim(),
          categoria: r.categoria,
          precioVenta: r.precioVenta,
          precioCosto: r.precioCosto,
          stockActual: r.stockActual,
          stockMinimo: r.stockMinimo,
          unidadMedida: normalizarUnidadMedida(r.unidadMedida),
        };

        try {
          const existenteId = existentes.get(payload.codigo);
          if (existenteId) {
            if (!sobrescribir) { omitidos++; continue; }
            await api.put(`/productos/${existenteId}`, payload);
            actualizados++;
          } else {
            const res = await api.post('/productos', payload);
            existentes.set(payload.codigo, res.data.id);
            importados++;
          }
        } catch {
          errores++;
        }
      }

      setSummary({
        importadosCount: importados,
        actualizadosCount: actualizados,
        errorCount: errores,
        omitidosCount: omitidos,
      });
    } catch (err: any) {
      setErrorMsg('Error durante la importación: ' + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
      setShowDuplicateConfirm(false);
    }
  };

  const resetModal = () => {
    setRows([]);
    setFileName('');
    setErrorMsg(null);
    setSummary(null);
    setShowDuplicateConfirm(false);
    onClose();
  };

  return (
    <div style={styles.modalOverlay}>
      <div className="industrial-card" style={styles.modalContent}>
        {/* Header */}
        <div style={styles.modalHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileSpreadsheet size={22} style={{ color: 'var(--color-primary)' }} />
            <h2 style={{ fontSize: '18px', textTransform: 'uppercase' }}>
              {t('inventory.import_modal_title')}
            </h2>
          </div>
          <button type="button" onClick={resetModal} style={styles.closeBtn}>
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ marginTop: '16px' }}>
          {/* Summary View if finished */}
          {summary ? (
            <div style={styles.summaryContainer}>
              <CheckCircle2 size={48} style={{ color: '#16A34A', marginBottom: '12px' }} />
              <h3 style={{ fontSize: '18px', fontWeight: 800, textTransform: 'uppercase' }}>
                {t('inventory.summary_title')}
              </h3>
              <p style={{ fontSize: '14px', marginTop: '8px', textAlign: 'center', color: '#44403C' }}>
                {t('inventory.import_summary_counts', { imported: summary.importadosCount, updated: summary.actualizadosCount, errors: summary.errorCount, skipped: summary.omitidosCount })}
              </p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={resetModal}
                style={{ marginTop: '24px' }}
              >
                {t('common.accept')}
              </button>
            </div>
          ) : showDuplicateConfirm ? (
            /* Duplicate Confirmation Prompt */
            <div style={styles.confirmBox}>
              <AlertTriangle size={36} style={{ color: '#D97706', marginBottom: '12px' }} />
              <h3 style={{ fontSize: '16px', fontWeight: 700, textAlign: 'center' }}>
                {t('inventory.overwrite_confirmation')}
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', textAlign: 'center', marginTop: '6px' }}>
                Se detectaron {duplicateCount} productos con código ya existente en su inventario actual.
              </p>

              <div style={{ display: 'flex', gap: '12px', marginTop: '20px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowDuplicateConfirm(false)}
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => ejecutarImportacion(false)}
                >
                  Ignorar duplicados (solo agregar nuevos)
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => ejecutarImportacion(true)}
                >
                  <Check size={16} /> Sobrescribir stock y precio
                </button>
              </div>
            </div>
          ) : (
            /* Main Upload & Preview Form */
            <>
              <p>Importa un CSV de hasta 5 MB y 5000 productos. Desde Excel: Guardar como → CSV UTF-8.</p>
              {/* Action Toolbar: Template & File Upload */}
              <div style={styles.uploadBar}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleDownloadTemplate}
                  title="Descargar plantilla de ejemplo CSV para este rubro"
                >
                  <Download size={16} />
                  <span>{t('inventory.download_template')}</span>
                </button>

                <label className="btn btn-primary" style={{ cursor: 'pointer', margin: 0 }}>
                  <Upload size={16} />
                  <span>{fileName ? 'Cambiar archivo' : t('inventory.select_file')}</span>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>

              {fileName && (
                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '8px' }}>
                  Archivo seleccionado: <strong>{fileName}</strong>
                </div>
              )}

              {errorMsg && (
                <div style={styles.errorBox}>
                  <AlertTriangle size={16} />
                  <span>{errorMsg}</span>
                </div>
              )}

              {loading && (
                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--color-text-muted)' }}>
                  Procesando archivo...
                </div>
              )}

              {/* Preview Table */}
              {rows.length > 0 && !loading && (
                <div style={{ marginTop: '16px' }}>
                  <div style={styles.previewStats}>
                    <span style={{ fontWeight: 700, fontSize: '13px' }}>
                      {t('inventory.preview_title')} ({rows.length} total)
                    </span>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <span className="badge badge-success">
                        {validRows.length} {t('inventory.valid_rows')}
                      </span>
                      {invalidRows.length > 0 && (
                        <span className="badge badge-danger">
                          {invalidRows.length} {t('inventory.error_rows')}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="table-container" style={{ maxHeight: '320px', overflowY: 'auto', marginTop: '10px' }}>
                    <table className="industrial-table" style={{ fontSize: '12px' }}>
                      <thead>
                        <tr>
                          <th style={{ width: '40px' }}>#</th>
                          <th>CÓDIGO</th>
                          <th>NOMBRE</th>
                          <th>CATEGORÍA</th>
                          <th>UNIDAD</th>
                          <th style={{ textAlign: 'right' }}>COSTO</th>
                          <th style={{ textAlign: 'right' }}>VENTA</th>
                          <th style={{ textAlign: 'center' }}>STOCK</th>
                          <th>ESTADO</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr
                            key={r.index}
                            style={!r.esValido ? { backgroundColor: '#FEF2F2' } : undefined}
                          >
                            <td style={{ color: 'var(--color-text-muted)' }}>{r.index}</td>
                            <td style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                              {r.codigo || <em style={{ color: '#DC2626' }}>[Vacío]</em>}
                            </td>
                            <td>{r.nombre || <em style={{ color: '#DC2626' }}>[Vacío]</em>}</td>
                            <td>{r.categoria}</td>
                            <td style={{ textTransform: 'lowercase' }}>{r.unidadMedida}</td>
                            <td style={{ textAlign: 'right' }}>L. {r.precioCosto.toFixed(2)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 700 }}>L. {r.precioVenta.toFixed(2)}</td>
                            <td style={{ textAlign: 'center', fontWeight: 700 }}>{r.stockActual}</td>
                            <td>
                              {r.esValido ? (
                                <span className="badge badge-success">VÁLIDO</span>
                              ) : (
                                <span
                                  className="badge badge-danger"
                                  title={r.errores.join(', ')}
                                  style={{ whiteSpace: 'normal', textAlign: 'left' }}
                                >
                                  {r.errores.join('; ')}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Confirmation Button Footer */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
                    <button type="button" className="btn btn-secondary" onClick={resetModal}>
                      {t('common.cancel')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={validRows.length === 0}
                      onClick={handleIniciarImportacion}
                    >
                      <Check size={16} />
                      <span>
                        Importar {validRows.length} productos válidos
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
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
    maxWidth: '920px',
    maxHeight: '90vh',
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
  uploadBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    flexWrap: 'wrap',
    padding: '12px',
    backgroundColor: 'var(--color-surface-hover)',
    borderRadius: '4px',
    border: '1px dashed var(--color-border)',
  },
  errorBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 14px',
    backgroundColor: '#FEF2F2',
    color: '#991B1B',
    borderRadius: '4px',
    fontSize: '13px',
    marginTop: '12px',
    border: '1px solid #FCA5A5',
  },
  previewStats: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
  },
  summaryContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px 16px',
  },
  confirmBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 16px',
    backgroundColor: '#FEF3C7',
    borderRadius: '6px',
    border: '1px solid #FCD34D',
  },
};

