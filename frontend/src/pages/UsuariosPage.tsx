import React, { useState, useEffect } from 'react';
import { TopBar } from '../components/TopBar';

export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rolBase: 'ADMIN' | 'CAJERO' | 'BODEGUERO' | 'VENDEDOR';
  sucursalActual?: string;
  permisos: string[];
  descuentoMaximo: number;
  activo: boolean;
}

export const PERMISOS_DEFAULT_POR_ROL = {
  ADMIN: {
    permisos: [
      'pos.vender',
      'pos.anular_venta',
      'pos.aplicar_descuento',
      'inventario.ver',
      'inventario.editar',
      'cotizaciones.crear',
      'cotizaciones.aprobar',
      'cotizaciones.convertir_venta',
      'reportes.ver',
      'usuarios.gestionar',
      'configuracion.editar',
    ],
    descuentoMaximo: 100,
  },
  CAJERO: {
    permisos: ['pos.vender', 'cotizaciones.crear', 'pos.aplicar_descuento'],
    descuentoMaximo: 15,
  },
  BODEGUERO: {
    permisos: ['inventario.ver', 'inventario.editar'],
    descuentoMaximo: 0,
  },
  VENDEDOR: {
    permisos: ['pos.vender', 'cotizaciones.crear'],
    descuentoMaximo: 10,
  },
};

import { api } from '../utils/api';
import {
  Users,
  Plus,
  Edit2,
  Check,
  X,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  GitBranch,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { useI18n } from '../context/I18nContext';

/** Traduce un error de la API de usuarios a un mensaje para el usuario. */
export function formatUsuarioApiError(err: any, defaultMsg: string, t: (key: string, options?: any) => string): string {
  if (!err) return defaultMsg;
  const status = err.response?.status;
  const rawMsg = err.response?.data?.message;

  if (status === 409) {
    return t('validation.err_409_user');
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

export const UsuariosPage: React.FC = () => {
  const { t } = useI18n();

  const TODOS_LOS_PERMISOS = [
    { clave: 'pos.vender', labelKey: 'users.perm_pos_vender' },
    { clave: 'pos.anular_venta', labelKey: 'users.perm_pos_anular' },
    { clave: 'pos.aplicar_descuento', labelKey: 'users.perm_pos_descuento' },
    { clave: 'inventario.ver', labelKey: 'users.perm_inv_ver' },
    { clave: 'inventario.editar', labelKey: 'users.perm_inv_editar' },
    { clave: 'cotizaciones.crear', labelKey: 'users.perm_cot_crear' },
    { clave: 'cotizaciones.aprobar', labelKey: 'users.perm_cot_aprobar' },
    { clave: 'cotizaciones.convertir_venta', labelKey: 'users.perm_cot_convertir' },
    { clave: 'reportes.ver', labelKey: 'users.perm_rep_ver' },
    { clave: 'usuarios.gestionar', labelKey: 'users.perm_usr_gestionar' },
    { clave: 'configuracion.editar', labelKey: 'users.perm_cfg_editar' },
  ];

  const [listaUsuarios, setListaUsuarios] = useState<Usuario[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  const [modalAbierto, setModalAbierto] = useState(false);
  const [usuarioEditando, setUsuarioEditando] = useState<Usuario | null>(null);

  // Form states & field-level errors
  const [formNombre, setFormNombre] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRolBase, setFormRolBase] = useState<'ADMIN' | 'CAJERO' | 'BODEGUERO' | 'VENDEDOR'>('CAJERO');
  const [formSucursalActual, setFormSucursalActual] = useState('Sucursal Centro (Principal)');
  const [formPermisos, setFormPermisos] = useState<string[]>([]);
  const [formDescuentoMaximo, setFormDescuentoMaximo] = useState<number>(10);
  const [formActivo, setFormActivo] = useState(true);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const SUCURSALES_OPCIONES = [
    'Sucursal Centro (Principal)',
    'Sucursal San Pedro (Norte)',
    'Sucursal Choluteca (Sur)',
  ];

  // Fetch real users on mount
  useEffect(() => {
    const fetchUsuariosBackend = async () => {
      setLoadingList(true);
      setErrorBanner(null);
      try {
        const response = await api.get('/usuarios');
        if (Array.isArray(response.data)) {
          const apiUsers: Usuario[] = response.data.map((u: any) => ({
            id: u.id,
            nombre: u.nombre,
            email: u.email,
            rolBase: u.rol as 'ADMIN' | 'CAJERO' | 'BODEGUERO' | 'VENDEDOR',
            permisos: u.permisosConfigurados ? u.permisos : PERMISOS_DEFAULT_POR_ROL[u.rol as keyof typeof PERMISOS_DEFAULT_POR_ROL]?.permisos || [],
            descuentoMaximo: Number(u.descuentoMaximo || 0),
            activo: u.activo,
            sucursalActual: 'Sucursal Centro (Principal)',
          }));
          setListaUsuarios(apiUsers);
        }
      } catch (err: any) {
        console.error('Error al obtener lista de usuarios desde la API real:', err);
        const errorMsg = err.response?.data?.message
          ? Array.isArray(err.response.data.message)
            ? err.response.data.message.join(', ')
            : err.response.data.message
          : t('users.error_loading');
        setErrorBanner(errorMsg);
      } finally {
        setLoadingList(false);
      }
    };

    fetchUsuariosBackend();
  }, [t]);

  const abrirNuevoUsuario = () => {
    setUsuarioEditando(null);
    setFormNombre('');
    setFormEmail('');
    setFormPassword('Ferre2026!');
    setFormRolBase('CAJERO');
    setFormSucursalActual('Sucursal Centro (Principal)');
    setFormPermisos(PERMISOS_DEFAULT_POR_ROL.CAJERO.permisos);
    setFormDescuentoMaximo(PERMISOS_DEFAULT_POR_ROL.CAJERO.descuentoMaximo);
    setFormActivo(true);
    setFieldErrors({});
    setModalError(null);
    setModalAbierto(true);
  };

  const abrirEditarUsuario = (usr: Usuario) => {
    setUsuarioEditando(usr);
    setFormNombre(usr.nombre);
    setFormEmail(usr.email);
    setFormPassword('');
    setFormRolBase(usr.rolBase);
    setFormSucursalActual(usr.sucursalActual || 'Sucursal Centro (Principal)');
    setFormPermisos(usr.permisos);
    setFormDescuentoMaximo(usr.descuentoMaximo);
    setFormActivo(usr.activo);
    setFieldErrors({});
    setModalError(null);
    setModalAbierto(true);
  };

  const validarFormularioUsuario = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formNombre.trim()) {
      errors.nombre = t('validation.required_field');
    }

    if (!formEmail.trim()) {
      errors.email = t('validation.required_field');
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formEmail.trim())) {
        errors.email = t('validation.invalid_email');
      }
    }

    if (!usuarioEditando && (!formPassword || formPassword.length < 6)) {
      errors.password = t('validation.min_length', { min: 6 });
    }

    if (formDescuentoMaximo < 0 || formDescuentoMaximo > 100 || isNaN(formDescuentoMaximo)) {
      errors.descuentoMaximo = t('validation.number_range', { min: 0, max: 100 });
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

  const handleCambioRolBase = (nuevoRol: 'ADMIN' | 'CAJERO' | 'BODEGUERO' | 'VENDEDOR') => {
    setFormRolBase(nuevoRol);
    const defaults = PERMISOS_DEFAULT_POR_ROL[nuevoRol];
    setFormPermisos(defaults.permisos);
    setFormDescuentoMaximo(defaults.descuentoMaximo);
  };

  const togglePermiso = (clavePermiso: string) => {
    if (formPermisos.includes(clavePermiso)) {
      setFormPermisos(formPermisos.filter((p) => p !== clavePermiso));
    } else {
      setFormPermisos([...formPermisos, clavePermiso]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    if (!validarFormularioUsuario()) {
      setModalError(t('validation.form_has_errors'));
      return;
    }

    setSubmitting(true);
    setModalError(null);

    const payload = {
      nombre: formNombre.trim(),
      email: formEmail.trim(),
      rol: formRolBase,
      permisos: formPermisos,
      descuentoMaximo: formDescuentoMaximo,
      activo: formActivo,
      ...(formPassword ? { password: formPassword } : {}),
    };

    try {
      if (usuarioEditando) {
        // HTTP PUT to real backend
        const res = await api.put(`/usuarios/${usuarioEditando.id}`, payload);
        const updatedData = res.data;

        const updatedUsuario: Usuario = {
          id: updatedData.id || usuarioEditando.id,
          nombre: updatedData.nombre || formNombre.trim(),
          email: updatedData.email || formEmail.trim(),
          rolBase: formRolBase,
          sucursalActual: formSucursalActual,
          permisos: formPermisos,
          descuentoMaximo: formDescuentoMaximo,
          activo: formActivo,
        };

        setListaUsuarios((prev) =>
          prev.map((u) => (u.id === usuarioEditando.id ? updatedUsuario : u)),
        );
        showSuccess(t('users.updated_success', { name: updatedUsuario.nombre }));
      } else {
        // HTTP POST to real backend
        const res = await api.post('/usuarios', payload);
        const newData = res.data;

        const nuevoUsuario: Usuario = {
          id: newData.id,
          nombre: newData.nombre || formNombre.trim(),
          email: newData.email || formEmail.trim(),
          rolBase: formRolBase,
          sucursalActual: formSucursalActual,
          permisos: formPermisos,
          descuentoMaximo: formDescuentoMaximo,
          activo: formActivo,
        };

        setListaUsuarios((prev) => [nuevoUsuario, ...prev]);
        showSuccess(t('users.saved_success', { name: nuevoUsuario.nombre }));
      }

      setModalAbierto(false);
    } catch (err: any) {
      console.error('Error al guardar usuario en backend:', err);
      setModalError(formatUsuarioApiError(err, t('users.save_error'), t));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={styles.container}>
      <TopBar title={t('users.title')} subtitle={t('users.subtitle')} />

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

        <div style={styles.headerRow}>
          <div>
            <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>{t('users.team')}</h2>
            <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
              {t('users.team_desc')}
            </p>
          </div>

          <button type="button" className="btn btn-primary" onClick={abrirNuevoUsuario}>
            <Plus size={18} strokeWidth={2.5} />
            <span>{t('users.new_user')}</span>
          </button>
        </div>

        {/* Tabla Industrial de Usuarios */}
        <div className="table-container" style={{ marginTop: '20px' }}>
          {loadingList ? (
            <div style={{ padding: '36px', textAlign: 'center', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <Loader2 size={20} className="animate-spin" />
              <span>{t('users.loading_users')}</span>
            </div>
          ) : (
            <table className="industrial-table">
              <thead>
                <tr>
                  <th>{t('users.user_name')}</th>
                  <th>{t('users.email')}</th>
                  <th>{t('users.assigned_branch')}</th>
                  <th style={{ textAlign: 'center' }}>{t('users.base_role')}</th>
                  <th style={{ textAlign: 'center' }}>{t('users.max_discount')}</th>
                  <th style={{ textAlign: 'center' }}>{t('users.active_permissions')}</th>
                  <th style={{ textAlign: 'center' }}>{t('users.status')}</th>
                  <th style={{ textAlign: 'center' }}>{t('users.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {listaUsuarios.map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontFamily: 'var(--font-display)', fontWeight: 800 }}>{u.nombre}</td>
                    <td style={{ fontWeight: 600, color: '#444' }}>{u.email}</td>
                    <td>
                      <span className="badge badge-neutral" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <GitBranch size={11} /> {u.sucursalActual || 'Sucursal Centro (Principal)'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span className="badge badge-dark">{u.rolBase}</span>
                    </td>
                    <td style={{ textAlign: 'center', fontFamily: 'var(--font-display)', fontWeight: 800 }}>
                      {u.descuentoMaximo}%
                    </td>
                    <td style={{ textAlign: 'center', fontSize: '11px', color: '#666' }}>
                      <span className="badge badge-neutral">{t('users.permissions_count', { count: (u.permisos || []).length })}</span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {u.activo ? (
                        <span className="badge badge-success">
                          <CheckCircle2 size={11} /> {t('users.active')}
                        </span>
                      ) : (
                        <span className="badge badge-danger">
                          <XCircle size={11} /> {t('users.inactive')}
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => abrirEditarUsuario(u)}
                      >
                        <Edit2 size={13} /> {t('users.edit')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {/* Modal Crear / Editar Usuario */}
      {modalAbierto && (
        <div style={styles.modalOverlay}>
          <div className="industrial-card" style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={20} color="var(--color-primary)" />
                <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>
                  {usuarioEditando ? t('users.edit_user') : t('users.new_user')}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setModalAbierto(false)}
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

            <form onSubmit={handleSubmit} style={{ marginTop: '16px' }}>
              <div style={styles.formRow}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">{t('users.full_name')}</label>
                  <input
                    type="text"
                    required
                    placeholder={t('users.placeholder_name')}
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

                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">{t('users.email')}</label>
                  <input
                    type="email"
                    required
                    placeholder={t('users.placeholder_email')}
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

              {!usuarioEditando && (
                <div className="form-group">
                  <label className="form-label">{t('users.temp_password')}</label>
                  <input
                    type="password"
                    required
                    disabled={submitting}
                    placeholder="••••••••"
                    value={formPassword}
                    onChange={(e) => {
                      setFormPassword(e.target.value);
                      if (fieldErrors.password) setFieldErrors({ ...fieldErrors, password: '' });
                    }}
                    className="form-input"
                    style={fieldErrors.password ? styles.inputError : {}}
                  />
                  {fieldErrors.password && (
                    <span style={styles.fieldErrorText}>{fieldErrors.password}</span>
                  )}
                </div>
              )}

              <div style={styles.formRow}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">{t('users.work_branch')}</label>
                  <select
                    value={formSucursalActual}
                    disabled={submitting}
                    onChange={(e) => setFormSucursalActual(e.target.value)}
                    className="form-select"
                  >
                    {SUCURSALES_OPCIONES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">{t('users.base_role')}</label>
                  <select
                    value={formRolBase}
                    disabled={submitting}
                    onChange={(e) =>
                      handleCambioRolBase(e.target.value as 'ADMIN' | 'CAJERO' | 'BODEGUERO' | 'VENDEDOR')
                    }
                    className="form-select"
                  >
                    <option value="ADMIN">ADMIN</option>
                    <option value="CAJERO">CAJERO</option>
                    <option value="BODEGUERO">BODEGUERO</option>
                    <option value="VENDEDOR">VENDEDOR</option>
                  </select>
                </div>
              </div>

              <div style={styles.formRow}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">{t('users.max_allowed_discount')}</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    required
                    disabled={submitting}
                    value={formDescuentoMaximo}
                    onChange={(e) => {
                      setFormDescuentoMaximo(Number(e.target.value));
                      if (fieldErrors.descuentoMaximo) setFieldErrors({ ...fieldErrors, descuentoMaximo: '' });
                    }}
                    className="form-input"
                    style={fieldErrors.descuentoMaximo ? styles.inputError : {}}
                  />
                  {fieldErrors.descuentoMaximo && (
                    <span style={styles.fieldErrorText}>{fieldErrors.descuentoMaximo}</span>
                  )}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">{t('users.account_status')}</label>
                <div style={{ display: 'flex', gap: '16px', marginTop: '6px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600 }}>
                    <input
                      type="radio"
                      name="activo"
                      checked={formActivo === true}
                      onChange={() => setFormActivo(true)}
                    />
                    {t('users.active_can_login')}
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: '#DC2626' }}>
                    <input
                      type="radio"
                      name="activo"
                      checked={formActivo === false}
                      onChange={() => setFormActivo(false)}
                    />
                    {t('users.inactive_blocked')}
                  </label>
                </div>
              </div>

              {/* Matriz de Permisos Individuales */}
              <div style={{ borderTop: '1px solid var(--color-sidebar-text)', marginTop: '14px', paddingTop: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                  <ShieldCheck size={16} color="var(--color-primary)" />
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '12px', textTransform: 'uppercase' }}>
                    {t('users.fine_tuning_permissions')}
                  </span>
                </div>

                <div style={styles.permisosGrid}>
                  {TODOS_LOS_PERMISOS.map((p) => {
                    const estaActivo = formPermisos.includes(p.clave);
                    return (
                      <div
                        key={p.clave}
                        onClick={() => togglePermiso(p.clave)}
                        style={{
                          ...styles.permisoBox,
                          ...(estaActivo ? styles.permisoBoxActive : {}),
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={estaActivo}
                          onChange={() => {}} // handled by parent div
                          style={{ cursor: 'pointer' }}
                        />
                        <div>
                          <div style={styles.permisoKey}>{p.clave}</div>
                          <div style={styles.permisoLabel}>{t(p.labelKey)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={submitting}
                  onClick={() => setModalAbierto(false)}
                >
                  {t('users.cancel')}
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>{t('users.saving')}</span>
                    </>
                  ) : (
                    <>
                      <Check size={16} strokeWidth={2.6} />
                      <span>{t('users.save_user')}</span>
                    </>
                  )}
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
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '14px',
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
    maxWidth: '640px',
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
  permisosGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    gap: '8px',
    maxHeight: '220px',
    overflowY: 'auto',
    padding: '4px',
  },
  permisoBox: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    padding: '8px 10px',
    border: '1px solid #E7E5E4',
    borderRadius: 'var(--radius-xs)',
    backgroundColor: 'var(--color-bg)',
    cursor: 'pointer',
    userSelect: 'none',
  },
  permisoBoxActive: {
    borderColor: 'var(--color-primary)',
    backgroundColor: 'var(--color-primary-light)',
  },
  permisoKey: {
    fontFamily: 'monospace',
    fontWeight: 700,
    fontSize: '11px',
    color: 'var(--color-sidebar-bg)',
  },
  permisoLabel: {
    fontSize: '10px',
    color: 'var(--color-text-muted)',
  },
};
