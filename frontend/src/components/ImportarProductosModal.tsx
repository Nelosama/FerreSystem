import React, { useState } from 'react';
import Papa from 'papaparse';
import { Upload, Download, AlertTriangle, Check, X, FileSpreadsheet, CheckCircle2 } from 'lucide-react';
import { useI18n } from '../context/I18nContext';
import { api } from '../utils/api';
import {
  MAX_FILAS_IMPORTACION,
  construirSolicitud,
  huellaSolicitud,
  interpretarErrorImportacion,
  nuevoSolicitudId,
  prepararPrevia,
  type ErrorImportacion,
  type EstadoPrecio,
  type FilaPrevia,
  type ProductoExistente,
  type RespuestaImportacion,
} from '../utils/importacionProductos';

interface ImportarProductosModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** ADMIN puede importar y aprobar precios. BODEGUERO importa existencias y datos, sin precios. */
  esAdmin: boolean;
}

type Fase = 'seleccion' | 'previa' | 'confirmar' | 'enviando' | 'resultado';

const ENCABEZADOS_PLANTILLA = ['nombre', 'codigo', 'codigoBarras', 'categoria', 'unidadMedida', 'stockActual', 'stockMinimo', 'precioCosto', 'precioVenta'];

const ESTADO_PRECIO_TEXTO: Record<EstadoPrecio, string> = {
  APROBADO: 'Aprobado',
  PENDIENTE_APROBACION: 'Pendiente de aprobación',
  SIN_PRECIO: 'Sin precio',
};

const ACCION_TEXTO: Record<FilaPrevia['accion'], string> = {
  NUEVO: 'Nuevo',
  OMITIR: 'Se omite (ya existe)',
  ACTUALIZAR: 'Se actualiza',
  ERROR: 'Corregir',
};

export const ImportarProductosModal: React.FC<ImportarProductosModalProps> = ({ isOpen, onClose, esAdmin }) => {
  const { t } = useI18n();
  const [existentes, setExistentes] = useState<ProductoExistente[]>([]);
  const [fase, setFase] = useState<Fase>('seleccion');
  const [fileName, setFileName] = useState<string>('');
  const [crudas, setCrudas] = useState<Record<string, unknown>[] | null>(null);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const [cargando, setCargando] = useState<boolean>(false);
  const [sobrescribir, setSobrescribir] = useState<boolean>(false);
  const [aprobarPrecios, setAprobarPrecios] = useState<boolean>(false);
  const [solicitud, setSolicitud] = useState<{ id: string; huella: string } | null>(null);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [erroresServidor, setErroresServidor] = useState<ErrorImportacion[]>([]);
  const [resultado, setResultado] = useState<RespuestaImportacion | null>(null);

  React.useEffect(() => {
    if (isOpen) cargarExistentes();
  }, [isOpen]);

  if (!isOpen) return null;

  // Solo lectura: la lista de productos sirve para detectar duplicados y mostrar el estado actual del precio.
  function cargarExistentes() {
    api.get('/productos')
      .then((res) => {
        if (Array.isArray(res.data)) setExistentes(res.data as ProductoExistente[]);
      })
      .catch(() => setErrorEnvio('No se pudo cargar el inventario actual para revisar duplicados. Cierre y vuelva a abrir la importación.'));
  }

  const previa = crudas
    ? prepararPrevia(crudas, { existentes, sobrescribir, aprobarPrecios: esAdmin && aprobarPrecios, puedePrecios: esAdmin })
    : null;
  const bloqueado = !previa || previa.resumen.conError > 0 || previa.resumen.total === 0;

  const descargarPlantilla = () => {
    const contenido = ENCABEZADOS_PLANTILLA.join(',') + '\n';
    const blob = new Blob(['﻿' + contenido], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.setAttribute('href', url);
    enlace.setAttribute('download', 'plantilla_productos.csv');
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);
  };

  const cargarArchivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setFileName(archivo.name);
    setErrorArchivo(null);
    setErrorEnvio(null);
    setResultado(null);
    setErroresServidor([]);
    setCrudas(null);
    setFase('seleccion');
    if (!archivo.name.toLowerCase().endsWith('.csv') || archivo.size > 5 * 1024 * 1024) {
      setErrorArchivo('Selecciona un archivo CSV de hasta 5 MB. Si usas Excel, guárdalo como CSV UTF-8.');
      return;
    }
    setCargando(true);
    Papa.parse(archivo, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setCargando(false);
        if (results.errors?.length || results.data.length > MAX_FILAS_IMPORTACION) {
          setErrorArchivo(`Revisa el formato CSV y utiliza como máximo ${MAX_FILAS_IMPORTACION} filas por archivo.`);
          return;
        }
        const datos = results.data as Record<string, unknown>[];
        if (!datos.length) {
          setErrorArchivo('El archivo CSV está vacío o no tiene encabezados válidos.');
          return;
        }
        setCrudas(datos);
        setFase('previa');
      },
      error: (err) => {
        setCargando(false);
        setErrorArchivo('Error al leer el archivo CSV: ' + err.message);
      },
    });
  };

  const enviarImportacion = async () => {
    if (fase === 'enviando' || !previa || bloqueado) return;
    const opciones = { sobrescribir, aprobarPrecios: esAdmin && aprobarPrecios, puedePrecios: esAdmin };
    const cuerpoSinId = construirSolicitud(previa.filas, opciones, '');
    const huella = huellaSolicitud(cuerpoSinId);
    // El mismo archivo y las mismas opciones reutilizan el solicitudId: un reintento no duplica nada.
    const id = solicitud && solicitud.huella === huella ? solicitud.id : nuevoSolicitudId();
    setSolicitud({ id, huella });
    setFase('enviando');
    setErrorEnvio(null);
    setErroresServidor([]);
    try {
      const res = await api.post('/productos/importacion', construirSolicitud(previa.filas, opciones, id));
      setResultado(res.data as RespuestaImportacion);
      setFase('resultado');
    } catch (err) {
      const error = interpretarErrorImportacion(err);
      if (error.tipo === 'VALIDACION') {
        setErroresServidor(error.errores);
        setErrorEnvio(error.mensaje);
      } else if (error.tipo === 'CONFLICTO') {
        if (error.nuevaSolicitud) setSolicitud(null);
        setErrorEnvio(error.mensaje);
        if (error.recargar) cargarExistentes();
      } else {
        setErrorEnvio(error.mensaje);
      }
      setFase('previa');
    }
  };

  const resetModal = () => {
    setFase('seleccion');
    setCrudas(null);
    setFileName('');
    setErrorArchivo(null);
    setErrorEnvio(null);
    setErroresServidor([]);
    setResultado(null);
    setSolicitud(null);
    setSobrescribir(false);
    setAprobarPrecios(false);
    onClose();
  };

  const erroresDeFila = (fila: FilaPrevia) => [
    ...fila.errores.map((e) => `${etiqueta(e.campo)}: ${e.mensaje}`),
    ...erroresServidor.filter((e) => e.fila === fila.fila).map((e) => `${etiqueta(e.campo)}: ${e.mensaje}`),
  ];

  return (
    <div style={styles.modalOverlay}>
      <div className="industrial-card" style={styles.modalContent}>
        <div style={styles.modalHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileSpreadsheet size={22} style={{ color: 'var(--color-primary-text)' }} />
            <h2 style={{ fontSize: '18px', textTransform: 'uppercase' }}>{t('inventory.import_modal_title')}</h2>
          </div>
          <button type="button" onClick={resetModal} style={styles.closeBtn} aria-label={t('navigation.close')}>
            <X size={20} />
          </button>
        </div>

        <div style={{ marginTop: '16px' }}>
          {fase === 'resultado' && resultado ? (
            <div style={styles.summaryContainer}>
              <CheckCircle2 size={48} style={{ color: '#16A34A', marginBottom: '12px' }} />
              <h3 style={{ fontSize: '18px', fontWeight: 800, textTransform: 'uppercase' }}>{t('inventory.summary_title')}</h3>
              <p role="status" style={{ fontSize: '14px', marginTop: '8px', textAlign: 'center', color: '#44403C' }}>
                {resultado.reintento
                  ? 'Esta importación ya estaba aplicada. No se duplicó ningún producto.'
                  : `${resultado.creados} creados, ${resultado.actualizados} actualizados, ${resultado.omitidos} omitidos, ${resultado.sinCambios} sin cambios.`}
              </p>
              {esAdmin && (
                <p style={{ fontSize: '13px', marginTop: '8px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                  {contarEstados(resultado.filas)}
                </p>
              )}
              {resultado.advertencias.length > 0 && (
                <ul style={{ fontSize: '12px', marginTop: '12px', color: '#92400E', textAlign: 'left' }}>
                  {resultado.advertencias.map((a, i) => <li key={i}>Fila {a.fila}: {a.mensaje}</li>)}
                </ul>
              )}
              <button type="button" className="btn btn-primary" onClick={resetModal} style={{ marginTop: '24px' }}>
                {t('common.accept')}
              </button>
            </div>
          ) : fase === 'confirmar' && previa ? (
            <div style={styles.confirmBox}>
              <AlertTriangle size={36} style={{ color: '#D97706', marginBottom: '12px' }} />
              <h3 style={{ fontSize: '16px', fontWeight: 700, textAlign: 'center' }}>Confirmar importación</h3>
              <p style={{ fontSize: '14px', marginTop: '8px', textAlign: 'center' }}>
                Se crearán <strong>{previa.resumen.nuevos}</strong> productos, se actualizarán <strong>{previa.resumen.actualizar}</strong> y
                se omitirán <strong>{previa.resumen.omitir}</strong> (ya existen y no se sobrescriben).
              </p>
              {esAdmin && (
                <p style={{ fontSize: '13px', marginTop: '8px', textAlign: 'center' }}>
                  Precios: {previa.resumen.precioAprobado} aprobados, {previa.resumen.precioPendiente} pendientes de aprobación y {previa.resumen.sinPrecio} sin precio.
                </p>
              )}
              {esAdmin && previa.resumen.sinPrecio > 0 && (
                <p role="alert" style={{ fontSize: '13px', marginTop: '8px', textAlign: 'center', color: '#92400E' }}>
                  {previa.resumen.sinPrecio} productos quedarán sin precio y no se podrán vender hasta que se les asigne uno.
                </p>
              )}
              <div style={{ display: 'flex', gap: '12px', marginTop: '20px', flexWrap: 'wrap', justifyContent: 'center' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setFase('previa')}>
                  Volver a revisar
                </button>
                <button type="button" className="btn btn-primary" onClick={() => void enviarImportacion()}>
                  <Check size={16} /> Confirmar importación
                </button>
              </div>
            </div>
          ) : (
            <>
              <p style={{ fontSize: '13px' }}>
                Importa un CSV de hasta 5 MB y {MAX_FILAS_IMPORTACION} productos. Desde Excel: Guardar como → CSV UTF-8.
                Un precio vacío significa «no informado»: no se cambia ni se guarda como 0.
              </p>

              <div style={styles.uploadBar}>
                <button type="button" className="btn btn-secondary" onClick={descargarPlantilla} title="Descargar plantilla CSV vacía">
                  <Download size={16} />
                  <span>{t('inventory.download_template')}</span>
                </button>
                <label className="btn btn-primary" style={{ cursor: 'pointer', margin: 0 }}>
                  <Upload size={16} />
                  <span>{fileName ? 'Cambiar archivo' : t('inventory.select_file')}</span>
                  <input type="file" accept=".csv" onChange={cargarArchivo} style={{ display: 'none' }} />
                </label>
              </div>

              {fileName && (
                <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '8px' }}>
                  Archivo seleccionado: <strong>{fileName}</strong>
                </div>
              )}
              {errorArchivo && <div role="alert" style={styles.errorBox}><AlertTriangle size={16} /><span>{errorArchivo}</span></div>}
              {errorEnvio && <div role="alert" style={styles.errorBox}><AlertTriangle size={16} /><span>{errorEnvio}</span></div>}
              {cargando && <div style={{ textAlign: 'center', padding: '24px', color: 'var(--color-text-muted)' }}>Procesando archivo...</div>}
              {fase === 'enviando' && <div role="status" style={{ textAlign: 'center', padding: '16px' }}>Importando...</div>}

              {previa && fase !== 'enviando' && (
                <div style={{ marginTop: '16px' }}>
                  {previa.avisos.map((aviso) => (
                    <div key={aviso} role="status" className="operation-note" style={{ marginBottom: '8px' }}>{aviso}</div>
                  ))}

                  <div style={styles.opciones}>
                    <label style={styles.opcion}>
                      <input type="checkbox" checked={sobrescribir} onChange={(e) => setSobrescribir(e.target.checked)} />
                      <span>Sobrescribir productos que ya existen (actualiza sus datos con los del archivo). Sin esta opción se omiten.</span>
                    </label>
                    {esAdmin && (
                      <label style={styles.opcion}>
                        <input type="checkbox" checked={aprobarPrecios} onChange={(e) => setAprobarPrecios(e.target.checked)} />
                        <span>Aprobar los precios de venta de este archivo. Sin esta opción quedan pendientes y no se venden.</span>
                      </label>
                    )}
                    {!esAdmin && (
                      <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                        Su usuario no importa precios: las columnas de precio se ignoran. Los precios actuales no cambian.
                      </p>
                    )}
                  </div>

                  <div style={styles.previewStats}>
                    <span style={{ fontWeight: 700, fontSize: '13px' }}>
                      {t('inventory.preview_title')} ({previa.resumen.total} total): {previa.resumen.nuevos} nuevos · {previa.resumen.actualizar} a actualizar · {previa.resumen.omitir} omitidos · {previa.resumen.conError} con error
                    </span>
                  </div>

                  <div className="table-container" style={{ maxHeight: '340px', overflowY: 'auto', marginTop: '10px' }}>
                    <table className="industrial-table" style={{ fontSize: '12px' }}>
                      <thead>
                        <tr>
                          <th style={{ width: '40px' }}>Fila</th>
                          <th>Código</th>
                          <th>Nombre</th>
                          <th>Unidad</th>
                          <th style={{ textAlign: 'center' }}>Existencias</th>
                          {esAdmin && <th style={{ textAlign: 'right' }}>Costo</th>}
                          {esAdmin && <th style={{ textAlign: 'right' }}>Venta</th>}
                          {esAdmin && <th>Precio</th>}
                          <th>Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previa.filas.map((fila) => {
                          const errores = erroresDeFila(fila);
                          const advertencias = fila.advertencias;
                          return (
                            <tr key={fila.fila} style={errores.length ? { backgroundColor: '#FEF2F2' } : undefined}>
                              <td style={{ color: 'var(--color-text-muted)' }}>{fila.fila}</td>
                              <td style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>{fila.codigo || <em style={{ color: '#DC2626' }}>[Vacío]</em>}</td>
                              <td>
                                {fila.nombre || <em style={{ color: '#DC2626' }}>[Vacío]</em>}
                                {errores.map((texto) => <div key={texto} style={{ color: '#991B1B', fontSize: '11px' }}>{texto}</div>)}
                                {advertencias.map((texto) => <div key={texto} style={{ color: '#92400E', fontSize: '11px' }}>{texto}</div>)}
                              </td>
                              <td style={{ textTransform: 'lowercase' }}>{fila.valores.unidadMedida || <em>por defecto</em>}</td>
                              <td style={{ textAlign: 'center' }}>{fila.valores.stockActual || <em>no informado</em>}</td>
                              {esAdmin && <td style={{ textAlign: 'right' }}>{fila.valores.precioCosto || <em>no informado</em>}</td>}
                              {esAdmin && <td style={{ textAlign: 'right' }}>{fila.valores.precioVenta || <em>no informado</em>}</td>}
                              {esAdmin && (
                                <td>
                                  {fila.estadoPrecioPrevisto ? (
                                    <span className={fila.estadoPrecioPrevisto === 'APROBADO' ? 'badge badge-success' : 'badge badge-warning'}>
                                      {ESTADO_PRECIO_TEXTO[fila.estadoPrecioPrevisto]}
                                    </span>
                                  ) : '—'}
                                </td>
                              )}
                              <td>
                                <span className={fila.accion === 'ERROR' ? 'badge badge-danger' : 'badge badge-success'}>
                                  {ACCION_TEXTO[fila.accion]}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {bloqueado && previa.resumen.total > 0 && (
                    <p role="alert" style={{ ...styles.errorBox, marginTop: '12px' }}>
                      Corrija las filas con error para poder importar. Ningún producto se guardará hasta entonces.
                    </p>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
                    <button type="button" className="btn btn-secondary" onClick={resetModal}>
                      {t('common.cancel')}
                    </button>
                    <button type="button" className="btn btn-primary" disabled={bloqueado} onClick={() => setFase('confirmar')}>
                      <Check size={16} />
                      <span>Revisar y confirmar</span>
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

/** Nombre legible del campo para mensajes por fila. */
const etiqueta = (campo: string): string => {
  const nombres: Record<string, string> = {
    codigo: 'Código', nombre: 'Nombre', codigoBarras: 'Código de barras', categoria: 'Categoría',
    unidadMedida: 'Unidad', stockActual: 'Existencias', stockMinimo: 'Stock mínimo',
    precioCosto: 'Costo', precioVenta: 'Venta', '*': 'Fila',
  };
  return nombres[campo] ?? campo;
};

/** Cuenta los estados de precio que devolvió el servidor (solo ADMIN los recibe). */
const contarEstados = (filas: RespuestaImportacion['filas']): string => {
  const conteo: Record<EstadoPrecio, number> = { APROBADO: 0, PENDIENTE_APROBACION: 0, SIN_PRECIO: 0 };
  for (const f of filas) if (f.estadoPrecio) conteo[f.estadoPrecio] += 1;
  return `Precios: ${conteo.APROBADO} ${ESTADO_PRECIO_TEXTO.APROBADO.toLowerCase()} · ${conteo.PENDIENTE_APROBACION} ${ESTADO_PRECIO_TEXTO.PENDIENTE_APROBACION.toLowerCase()} · ${conteo.SIN_PRECIO} ${ESTADO_PRECIO_TEXTO.SIN_PRECIO.toLowerCase()}`;
};

const styles: Record<string, React.CSSProperties> = {
  modalOverlay: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 999, padding: '20px',
  },
  modalContent: { width: '100%', maxWidth: '980px', maxHeight: '90vh', overflowY: 'auto' },
  modalHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    paddingBottom: '12px', borderBottom: '2px solid var(--color-border)',
  },
  closeBtn: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-main)' },
  uploadBar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap',
    padding: '12px', backgroundColor: 'var(--color-surface-hover)', borderRadius: '4px', border: '1px dashed var(--color-border)',
  },
  errorBox: {
    display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', backgroundColor: '#FEF2F2',
    color: '#991B1B', borderRadius: '4px', fontSize: '13px', marginTop: '12px', border: '1px solid #FCA5A5',
  },
  opciones: { display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' },
  opcion: { display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer' },
  previewStats: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginTop: '12px' },
  summaryContainer: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 16px' },
  confirmBox: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 16px',
    backgroundColor: '#FEF3C7', borderRadius: '6px', border: '1px solid #FCD34D',
  },
};
