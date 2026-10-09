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

export function formatApiError(err: any, defaultMsg: string, t: (key: string, options?: any) => string): string {
  if (!err) return defaultMsg;
  const status = err.response?.status;
  const rawMsg = err.response?.data?.message;

  if (status === 409) {
    return t('validation.err_409_client');
  }
  if (status === 403 || status === 401) {
    return t('validation.err_403');
  }
  if (status === 400) {
    if (Array.isArray(rawMsg)) return rawMsg.join(', ');
    if (typeof rawMsg === 'string' && rawMsg.trim()) return rawMsg;
    return t('validation.err_400_general');
  }
  if (status >= 500) {
    return t('validation.err_500');
  }
  if (err.message === 'Network Error' || !err.response) {
    return t('validation.err_network');
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
  creditoHabilitado?: boolean;
  limiteCredito?: string | number | null;
  saldoPendiente?: string | number;
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
  const [clienteCredito, setClienteCredito] = useState<Cliente | null>(null);
  const [creditoActivo, setCreditoActivo] = useState(false);
  const [creditoLimite, setCreditoLimite] = useState('');
  const [creditoError, setCreditoError] = useState<string | null>(null);
  const [guardandoCredito, setGuardandoCredito] = useState(false);

  // Form states & field-level errors
  const [formNombre, setFormNombre] = useState('');
  const [formRtn, setFormRtn] = useState('');
  const [formTelefono, setFormTelefono] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formDireccion, setFormDireccion] = useState('');
  const [formTipo, setFormTipo] = useState<'CONSUMIDOR_FINAL' | 'MAYORISTA' | 'CONTRATISTA'>('CONSUMIDOR_FINAL');

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const abrirCredito = (c: Cliente) => {
    setClienteCredito(c);
    setCreditoActivo(!!c.creditoHabilitado);
    setCreditoLimite(c.limiteCredito === null || c.limiteCredito === undefined ? '' : String(Number(c.limiteCredito)));
    setCreditoError(null);
  };

  const guardarCredito = async () => {
    if (!clienteCredito) return;
    const texto = creditoLimite.trim();
    const limite = texto === '' ? null : Number(texto);
    if (limite !== null && (!Number.isFinite(limite) || limite < 0)) {
      setCreditoError('El límite debe ser un número mayor o igual a 0, o vacío para crédito sin límite.');
      return;
    }
    setGuardandoCredito(true);
    setCreditoError(null);
    try {
      await api.patch(`/clientes/${clienteCredito.id}/credito`, { creditoHabilitado: creditoActivo, limiteCredito: limite });
      setSuccessBanner(`Crédito de ${clienteCredito.nombre} actualizado.`);
      setClienteCredito(null);
      await fetchClientes();
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setCreditoError(Array.isArray(msg) ? msg.join(', ') : msg || 'No se pudo guardar el crédito.');
    } finally {
      setGuardandoCredito(false);
    }
  };

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
      setErrorBanner(formatApiError(err, t('clients.fetch_error'), t));
    } finally {
      setLoading(false);
    }
  }, [search, t]);

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
      errors.nombre = t('validation.required_field');
    }

    if (formEmail.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formEmail.trim())) {
        errors.email = t('validation.invalid_email');
      }
    }

    if (formRtn.trim()) {
      const cleanRtn = formRtn.replace(/\D/g, '');
      if (cleanRtn.length !== 14) {
        errors.rtn = t('validation.invalid_rtn_length');
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
      setModalError(t('validation.form_has_errors'));
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
        showSuccess(t('clients.updated_success', { name: payload.nombre }));
      } else {
        await api.post('/clientes', payload);
        showSuccess(t('clients.saved_success', { name: payload.nombre }));
      }
      setModalFormAbierto(false);
      await fetchClientes();
    } catch (err: any) {
      console.error('Error al guardar cliente:', err);
      setModalError(formatApiError(err, t('clients.save_error'), t));
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
      showSuccess(t('clients.deleted_success', { name: nombreEliminado }));
      await fetchClientes();
    } catch (err: any) {
      console.error('Error al eliminar cliente:', err);
      setErrorBanner(formatApiError(err, t('clients.delete_error'), t));
      setClienteEliminar(null);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div style={styles.container}>
      <TopBar title={t('clients.new_client')} subtitle={t('tasks.clientes.description')} />

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
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label={t('common.clear_search')}
                style={styles.clearSearchBtn}
              >
                <X size={16} />
              </button>
            )}
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
                  <th style={{ textAlign: 'center' }}>CRÉDITO</th>
                  <th style={{ textAlign: 'center' }}>ACCIONES</th>
                </tr>
              </thead>
              <tbody>
                {clientes.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '36px', color: 'var(--color-text-muted)' }}>
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
                      <td style={{ textAlign: 'center', fontSize: '12px' }}>
                        {c.creditoHabilitado ? (
                          <>
                            <span className="badge badge-dark" style={{ fontSize: '10px' }}>HABILITADO</span>
                            <div>Límite: {c.limiteCredito === null || c.limiteCredito === undefined ? 'sin límite' : `L ${Number(c.limiteCredito).toFixed(2)}`}</div>
                            <div>Saldo: L {Number(c.saldoPendiente ?? 0).toFixed(2)}</div>
                          </>
                        ) : <span style={{ color: 'var(--color-text-muted)' }}>No habilitado</span>}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => abrirCredito(c)}>
                            CRÉDITO
                          </button>
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
                  {clienteEditando ? t('clients.edit_client') : t('clients.new_client')}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setModalFormAbierto(false)}
                style={styles.closeBtn}
                aria-label={t('common.close_modal')}
              >
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
                  {t('clients.client_name')} <span style={{ color: '#DC2626' }}>*</span>
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
                  <label className="form-label">{t('clients.rtn')}</label>
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
                  <label className="form-label">{t('clients.client_type')} <span style={{ color: '#DC2626' }}>*</span></label>
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
                  <label className="form-label">{t('clients.phone')}</label>
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
                  <label className="form-label">{t('clients.email')}</label>
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
                <label className="form-label">{t('clients.address')}</label>
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
                  {t('common.cancel')}
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>{t('clients.saving')}</span>
                    </>
                  ) : (
                    <>
                      <Check size={16} strokeWidth={2.6} />
                      <span>{t('clients.save_client')}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {clienteCredito && (
        <div style={styles.modalOverlay}>
          <div className="industrial-card" style={{ ...styles.modalContent, maxWidth: '440px' }}>
            <div style={styles.modalHeader}>
              <h2 style={{ fontSize: '15px', textTransform: 'uppercase' }}>Crédito: {clienteCredito.nombre}</h2>
              <button type="button" aria-label={t('common.close_modal')} onClick={() => setClienteCredito(null)} className="btn btn-secondary btn-sm">✕</button>
            </div>
            <div style={{ padding: '16px', display: 'grid', gap: '12px' }}>
              {creditoError && <div role="alert" style={styles.modalErrorBanner}><span>{creditoError}</span></div>}
              <p style={{ fontSize: '12px' }}>Saldo pendiente actual: L {Number(clienteCredito.saldoPendiente ?? 0).toFixed(2)}</p>
              <label style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input type="checkbox" checked={creditoActivo} disabled={guardandoCredito} onChange={e => setCreditoActivo(e.target.checked)} />
                Permitir ventas a crédito a este cliente
              </label>
              <label>Límite de crédito (L), vacío = sin límite
                <input className="form-input" type="number" min="0" step="0.01" inputMode="decimal" value={creditoLimite} disabled={guardandoCredito} onChange={e => setCreditoLimite(e.target.value)} />
              </label>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" disabled={guardandoCredito} onClick={() => setClienteCredito(null)}>Cancelar</button>
                <button type="button" className="btn btn-primary" disabled={guardandoCredito} onClick={guardarCredito}>{guardandoCredito ? 'Guardando…' : 'Guardar crédito'}</button>
              </div>
            </div>
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
                  {t('clients.confirm_delete')}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => !deletingId && setClienteEliminar(null)}
                disabled={Boolean(deletingId)}
                style={styles.closeBtn}
                aria-label={t('common.close_modal')}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ marginTop: '16px', fontSize: '13px', lineHeight: '1.5', color: '#444' }}>
              {t('clients.delete_warning', { name: clienteEliminar.nombre })}
              <br />
              <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '6px', display: 'block' }}>
                {t('clients.delete_subtext')}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={Boolean(deletingId)}
                onClick={() => setClienteEliminar(null)}
              >
                {t('common.cancel')}
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
                    <span>{t('clients.deleting')}</span>
                  </>
                ) : (
                  <span>{t('clients.delete_permanently')}</span>
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
  clearSearchBtn: {
    position: 'absolute',
    right: '10px',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
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
