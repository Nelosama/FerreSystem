import React, { useState, useEffect, useCallback } from 'react';
import { TopBar } from '../components/TopBar';
import { api } from '../utils/api';
import { useI18n } from '../context/I18nContext';
import { formatNumeroCliente } from '../utils/numeroCliente';
import {
  Users,
  Search,
  Plus,
  Edit2,
  Trash2,
  X,
  Check,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Phone,
  Mail,
  MapPin,
  UserCheck,
} from 'lucide-react';

export function formatApiError(err: any, defaultMsg: string): string {
  if (!err) return defaultMsg;
  const status = err.response?.status;
  const rawMsg = err.response?.data?.message;

  if (status === 409) {
    return 'Ya existe un cliente registrado con esta información (RTN o correo).';
  }
  if (status === 403 || status === 401) {
    return 'No tiene los permisos necesarios para realizar esta operación.';
  }
  if (status === 400) {
    if (Array.isArray(rawMsg)) return rawMsg.join(', ');
    if (typeof rawMsg === 'string' && rawMsg.trim()) return rawMsg;
    return 'Datos del cliente no válidos. Revise la información ingresada e inténtelo nuevamente.';
  }
  if (status >= 500) {
    return 'Ocurrió un error en el servidor al procesar la solicitud. Intente nuevamente más tarde.';
  }
  if (err.message === 'Network Error' || !err.response) {
    return 'No se pudo conectar con el servidor. Verifique su conexión a internet e inténtelo nuevamente.';
  }
  if (rawMsg) {
    return Array.isArray(rawMsg) ? rawMsg.join(', ') : String(rawMsg);
  }
  return defaultMsg;
}

export interface Cliente {
  id: string;
  numeroCliente?: number;
  nombre: string;
  rtn?: string | null;
  telefono?: string | null;
  email?: string | null;
  direccion?: string | null;
  tipo: 'CONSUMIDOR_FINAL' | 'MAYORISTA' | 'CONTRATISTA';
  createdAt?: string;
  updatedAt?: string;
}

export const ClientesPage: React.FC = () => {
  const { t } = useI18n();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  // Modales
  const [modalFormAbierto, setModalFormAbierto] = useState(false);
  const [clienteEditando, setClienteEditando] = useState<Cliente | null>(null);
  const [clienteEliminar, setClienteEliminar] = useState<Cliente | null>(null);

  // Form states & field-level errors
  const [formNombre, setFormNombre] = useState('');
  const [formRtn, setFormRtn] = useState('');
  const [formTelefono, setFormTelefono] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formDireccion, setFormDireccion] = useState('');
  const [formTipo, setFormTipo] = useState<'CONSUMIDOR_FINAL' | 'MAYORISTA' | 'CONTRATISTA'>('CONSUMIDOR_FINAL');

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const fetchClientes = useCallback(async () => {
    setLoading(true);
    setErrorBanner(null);
    try {
      const response = await api.get('/clientes', {
        params: search ? { search } : undefined,
      });
      setClientes(response.data);
    } catch (err: any) {
      console.error('Error al obtener clientes:', err);
      setErrorBanner(formatApiError(err, 'No se pudo obtener la lista de clientes. Intente nuevamente.'));
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    fetchClientes();
  }, [fetchClientes]);

  const abrirNuevoCliente = () => {
    setClienteEditando(null);
    setFormNombre('');
    setFormRtn('');
    setFormTelefono('');
    setFormEmail('');
    setFormDireccion('');
    setFormTipo('CONSUMIDOR_FINAL');
    setFieldErrors({});
    setModalError(null);
    setModalFormAbierto(true);
  };

  const abrirEditarCliente = (c: Cliente) => {
    setClienteEditando(c);
    setFormNombre(c.nombre);
    setFormRtn(c.rtn || '');
    setFormTelefono(c.telefono || '');
    setFormEmail(c.email || '');
    setFormDireccion(c.direccion || '');
    setFormTipo(c.tipo);
    setFieldErrors({});
    setModalError(null);
    setModalFormAbierto(true);
  };

  const validarFormulario = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formNombre.trim()) {
      errors.nombre = 'El nombre o razón social es obligatorio.';
    } else if (formNombre.trim().length < 3) {
      errors.nombre = 'El nombre debe tener al menos 3 caracteres.';
    }

    if (formEmail.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formEmail.trim())) {
        errors.email = 'Ingrese un correo electrónico válido (ej. contacto@empresa.hn).';
      }
    }

    if (formRtn.trim()) {
      const cleanRtn = formRtn.replace(/\D/g, '');
      if (cleanRtn.length !== 14) {
        errors.rtn = 'El RTN de Honduras debe contener exactamente 14 dígitos numéricos.';
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const showSuccess = (msg: string) => {
    setSuccessBanner(msg);
    setTimeout(() => {
      setSuccessBanner(null);
    }, 4000);
  };

  const handleGuardarCliente = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    if (!validarFormulario()) {
      setModalError('Por favor corrija los campos marcados antes de guardar.');
      return;
    }

    setSubmitting(true);
    setModalError(null);

    const payload = {
      nombre: formNombre.trim(),
      rtn: formRtn.trim() || null,
      telefono: formTelefono.trim() || null,
      email: formEmail.trim() || null,
      direccion: formDireccion.trim() || null,
      tipo: formTipo,
    };

    try {
      if (clienteEditando) {
        await api.put(`/clientes/${clienteEditando.id}`, payload);
        showSuccess(`Cliente "${payload.nombre}" actualizado correctamente.`);
      } else {
        await api.post('/clientes', payload);
        showSuccess(`Cliente "${payload.nombre}" creado exitosamente.`);
      }
      setModalFormAbierto(false);
      await fetchClientes();
    } catch (err: any) {
      console.error('Error al guardar cliente:', err);
      setModalError(formatApiError(err, 'No se pudo guardar el cliente. Revise la información e inténtelo de nuevo.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleEliminarCliente = async () => {
    if (!clienteEliminar || deletingId) return;

    const nombreEliminado = clienteEliminar.nombre;
    setDeletingId(clienteEliminar.id);
    setErrorBanner(null);

    try {
      await api.delete(`/clientes/${clienteEliminar.id}`);
      setClienteEliminar(null);
      showSuccess(`Cliente "${nombreEliminado}" eliminado correctamente.`);
      await fetchClientes();
    } catch (err: any) {
      console.error('Error al eliminar cliente:', err);
      setErrorBanner(formatApiError(err, 'No se pudo eliminar el cliente. Verifique que no posea ventas ni cotizaciones.'));
      setClienteEliminar(null);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div style={styles.container}>
      <TopBar title="GESTIÓN DE CLIENTES" subtitle="Directorio Comercial y Datos Fiscales RTN" />

      <main style={styles.content}>
        {errorBanner && (
          <div style={styles.errorBanner}>
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span>{errorBanner}</span>
          </div>
        )}

        {successBanner && (
          <div style={styles.successBanner}>
            <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
            <span>{successBanner}</span>
          </div>
        )}

        <div style={styles.actionsBar}>
          <div style={styles.searchWrapper}>
            <Search size={18} strokeWidth={2.4} style={styles.searchIcon} />
            <input
              type="text"
              placeholder={t('clientPicker.placeholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-input"
              style={{ paddingLeft: '38px', height: '42px' }}
            />
          </div>

          <button type="button" className="btn btn-primary" onClick={abrirNuevoCliente}>
            <Plus size={18} strokeWidth={2.5} />
            <span>{t('clients.new_client')}</span>
          </button>
        </div>

        {/* Tabla Industrial de Clientes */}
        <div className="table-container" style={{ marginTop: '20px' }}>
          {loading ? (
            <div style={{ padding: '36px', textAlign: 'center', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <Loader2 size={20} className="animate-spin" />
              <span>Cargando directorio de clientes desde Supabase...</span>
            </div>
          ) : (
            <table className="industrial-table">
              <thead>
                <tr>
                  <th>{t('clientPicker.numberLabel')}</th>
                  <th>NOMBRE DEL CLIENTE</th>
                  <th>RTN / ID FISCAL</th>
                  <th>CONTACTO</th>
                  <th>DIRECCIÓN</th>
                  <th style={{ textAlign: 'center' }}>TIPO</th>
                  <th style={{ textAlign: 'center' }}>ACCIONES</th>
                </tr>
              </thead>
              <tbody>
                {clientes.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: 'var(--color-text-muted)' }}>
                      No se encontraron clientes registrados.
                    </td>
                  </tr>
                ) : (
                  clientes.map((c) => (
                    <tr key={c.id}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{formatNumeroCliente(c.numeroCliente)}</td>
                      <td style={{ fontFamily: 'var(--font-display)', fontWeight: 800 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <UserCheck size={16} color="var(--color-primary)" />
                          <span>{c.nombre}</span>
                        </div>
                      </td>
                      <td style={{ fontWeight: 600, color: '#444', fontFamily: 'monospace' }}>
                        {c.rtn || '---'}
                      </td>
                      <td style={{ fontSize: '12px' }}>
                        {c.telefono && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Phone size={11} color="var(--color-text-muted)" /> {c.telefono}
                          </div>
                        )}
                        {c.email && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--color-text-muted)' }}>
                            <Mail size={11} /> {c.email}
                          </div>
                        )}
                        {!c.telefono && !c.email && '---'}
                      </td>
                      <td style={{ fontSize: '12px', color: '#555', maxWidth: '240px' }}>
                        {c.direccion ? (
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '4px' }}>
                            <MapPin size={12} color="var(--color-text-muted)" style={{ marginTop: '2px', flexShrink: 0 }} />
                            <span>{c.direccion}</span>
                          </div>
                        ) : (
                          '---'
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className="badge badge-dark" style={{ fontSize: '10px' }}>
                          {c.tipo.replace('_', ' ')}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => abrirEditarCliente(c)}
                          >
                            <Edit2 size={13} /> EDITAR
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ color: '#DC2626', borderColor: '#FCA5A5' }}
                            onClick={() => setClienteEliminar(c)}
                          >
                            <Trash2 size={13} /> ELIMINAR
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {/* Modal Crear / Editar Cliente */}
      {modalFormAbierto && (
        <div style={styles.modalOverlay}>
          <div className="industrial-card" style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={20} color="var(--color-primary)" />
                <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>
                  {clienteEditando ? 'EDITAR CLIENTE' : 'NUEVO CLIENTE'}
                </h2>
              </div>
              <button type="button" onClick={() => setModalFormAbierto(false)} style={styles.closeBtn}>
                <X size={20} />
              </button>
            </div>

            {modalError && (
              <div style={styles.modalErrorBanner}>
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleGuardarCliente} style={{ marginTop: '16px' }}>
              <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '12px' }}>
                {clienteEditando ? `${t('clientPicker.numberLabel')}: ${formatNumeroCliente(clienteEditando.numeroCliente)}` : t('clientPicker.numberAutomatic')}
              </p>

              <div className="form-group">
                <label className="form-label">
                  NOMBRE COMPLETO / RAZÓN SOCIAL <span style={{ color: '#DC2626' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  disabled={submitting}
                  placeholder="Ej. Constructora del Norte S.A."
                  value={formNombre}
                  onChange={(e) => {
                    setFormNombre(e.target.value);
                    if (fieldErrors.nombre) setFieldErrors({ ...fieldErrors, nombre: '' });
                  }}
                  className="form-input"
                  style={fieldErrors.nombre ? styles.inputError : {}}
                />
                {fieldErrors.nombre && (
                  <span style={styles.fieldErrorText}>{fieldErrors.nombre}</span>
                )}
              </div>

              <div style={styles.formRow}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">RTN / IDENTIFICACIÓN FISCAL (14 DÍGITOS)</label>
                  <input
                    type="text"
                    disabled={submitting}
                    placeholder="Ej. 08011990123456"
                    value={formRtn}
                    onChange={(e) => {
                      setFormRtn(e.target.value);
                      if (fieldErrors.rtn) setFieldErrors({ ...fieldErrors, rtn: '' });
                    }}
                    className="form-input"
                    style={fieldErrors.rtn ? styles.inputError : {}}
                  />
                  {fieldErrors.rtn && (
                    <span style={styles.fieldErrorText}>{fieldErrors.rtn}</span>
                  )}
                </div>

                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">TIPO DE CLIENTE <span style={{ color: '#DC2626' }}>*</span></label>
                  <select
                    value={formTipo}
                    disabled={submitting}
                    onChange={(e) => setFormTipo(e.target.value as any)}
                    className="form-select"
                  >
                    <option value="CONSUMIDOR_FINAL">CONSUMIDOR FINAL</option>
                    <option value="MAYORISTA">MAYORISTA</option>
                    <option value="CONTRATISTA">CONTRATISTA / MAESTRO DE OBRA</option>
                  </select>
                </div>
              </div>

              <div style={styles.formRow}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">TELÉFONO DE CONTACTO</label>
                  <input
                    type="text"
                    disabled={submitting}
                    placeholder="+504 9999-8888"
                    value={formTelefono}
                    onChange={(e) => setFormTelefono(e.target.value)}
                    className="form-input"
                  />
                </div>

                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">CORREO ELECTRÓNICO</label>
                  <input
                    type="email"
                    disabled={submitting}
                    placeholder="contacto@empresa.hn"
                    value={formEmail}
                    onChange={(e) => {
                      setFormEmail(e.target.value);
                      if (fieldErrors.email) setFieldErrors({ ...fieldErrors, email: '' });
                    }}
                    className="form-input"
                    style={fieldErrors.email ? styles.inputError : {}}
                  />
                  {fieldErrors.email && (
                    <span style={styles.fieldErrorText}>{fieldErrors.email}</span>
                  )}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">DIRECCIÓN FÍSICA</label>
                <textarea
                  rows={2}
                  disabled={submitting}
                  placeholder="Ej. Barrio El Centro, Ave. San Isidro, La Ceiba"
                  value={formDireccion}
                  onChange={(e) => setFormDireccion(e.target.value)}
                  className="form-input"
                  style={{ resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={submitting}
                  onClick={() => setModalFormAbierto(false)}
                >
                  CANCELAR
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>GUARDANDO...</span>
                    </>
                  ) : (
                    <>
                      <Check size={16} strokeWidth={2.6} />
                      <span>GUARDAR CLIENTE</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Confirmar Eliminación */}
      {clienteEliminar && (
        <div style={styles.modalOverlay}>
          <div className="industrial-card" style={{ ...styles.modalContent, maxWidth: '440px' }}>
            <div style={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#DC2626' }}>
                <AlertCircle size={20} />
                <h2 style={{ fontSize: '15px', textTransform: 'uppercase', color: '#DC2626' }}>
                  CONFIRMAR ELIMINACIÓN
                </h2>
              </div>
              <button
                type="button"
                onClick={() => !deletingId && setClienteEliminar(null)}
                disabled={Boolean(deletingId)}
                style={styles.closeBtn}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ marginTop: '16px', fontSize: '13px', lineHeight: '1.5', color: '#444' }}>
              ¿Está seguro de eliminar al cliente <strong>{clienteEliminar.nombre}</strong>?
              <br />
              <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '6px', display: 'block' }}>
                Esta acción enviará una petición DELETE a la API real en Supabase. Si el cliente posee ventas o cotizaciones asociadas, la API rechazará la operación para mantener la integridad histórica.
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={Boolean(deletingId)}
                onClick={() => setClienteEliminar(null)}
              >
                CANCELAR
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={Boolean(deletingId)}
                onClick={handleEliminarCliente}
                style={{ backgroundColor: '#DC2626', borderColor: '#B91C1C' }}
              >
                {deletingId ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>ELIMINANDO...</span>
                  </>
                ) : (
                  <span>ELIMINAR DEFINITIVAMENTE</span>
                )}
              </button>
            </div>
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
  errorBanner: {
    marginBottom: '16px',
    padding: '12px 16px',
    backgroundColor: '#FEE2E2',
    border: '1px solid #EF4444',
    borderRadius: '4px',
    color: '#991B1B',
    fontSize: '13px',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  successBanner: {
    marginBottom: '16px',
    padding: '12px 16px',
    backgroundColor: '#DCFCE7',
    border: '1px solid #22C55E',
    borderRadius: '4px',
    color: '#15803D',
    fontSize: '13px',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  modalErrorBanner: {
    marginTop: '12px',
    padding: '10px 14px',
    backgroundColor: '#FEE2E2',
    border: '1px solid #EF4444',
    borderRadius: '4px',
    color: '#991B1B',
    fontSize: '12px',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  inputError: {
    borderColor: '#DC2626',
    backgroundColor: '#FEF2F2',
  },
  fieldErrorText: {
    fontSize: '11px',
    color: '#DC2626',
    fontWeight: 600,
    marginTop: '4px',
    display: 'block',
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
    maxWidth: '580px',
    maxHeight: '90vh',
    overflowY: 'auto',
    backgroundColor: '#FFFFFF',
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
  },
  formRow: {
    display: 'flex',
    gap: '14px',
  },
};
