import React, { useState, useEffect } from 'react';
import { TopBar } from '../components/TopBar';

export function formatUsuarioApiError(err: any, defaultMsg: string): string {
  if (!err) return defaultMsg;
  const status = err.response?.status;
  const rawMsg = err.response?.data?.message;

  if (status === 409) {
    return 'Ya existe un usuario registrado con este correo electrónico.';
  }
  if (status === 403 || status === 401) {
    return 'No tiene permisos suficientes para gestionar usuarios o modificar este perfil.';
  }
  if (status === 400) {
    if (Array.isArray(rawMsg)) return rawMsg.join(', ');
    if (typeof rawMsg === 'string' && rawMsg.trim()) return rawMsg;
    return 'Los datos del usuario ingresados no son válidos. Por favor revise el formulario.';
  }
  if (status >= 500) {
    return 'Ocurrió un error en el servidor al guardar el usuario. Reintente en unos momentos.';
  }
  if (err.message === 'Network Error' || !err.response) {
    return 'No se pudo conectar con el servidor backend. Verifique su conexión a internet.';
  }
  if (rawMsg) {
    return Array.isArray(rawMsg) ? rawMsg.join(', ') : String(rawMsg);
  }
  return defaultMsg;
}

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

const TODOS_LOS_PERMISOS = [
  { clave: 'pos.vender', label: 'Realizar ventas en POS' },
  { clave: 'pos.anular_venta', label: 'Anular ventas en POS' },
  { clave: 'pos.aplicar_descuento', label: 'Aplicar descuentos' },
  { clave: 'inventario.ver', label: 'Ver catálogo e inventario' },
  { clave: 'inventario.editar', label: 'Crear / Editar productos' },
  { clave: 'cotizaciones.crear', label: 'Crear cotizaciones' },
  { clave: 'cotizaciones.aprobar', label: 'Aprobar cotizaciones' },
  { clave: 'cotizaciones.convertir_venta', label: 'Convertir cotización a venta' },
  { clave: 'reportes.ver', label: 'Ver reportes de ventas' },
  { clave: 'usuarios.gestionar', label: 'Gestionar usuarios y permisos' },
  { clave: 'configuracion.editar', label: 'Editar configuración de ferretería' },
];

export const UsuariosPage: React.FC = () => {
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
        setErrorBanner(formatUsuarioApiError(err, 'No se pudo conectar con el servidor para obtener los usuarios.'));
      } finally {
        setLoadingList(false);
      }
    };

    fetchUsuariosBackend();
  }, []);

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
      errors.nombre = 'El nombre completo del usuario es obligatorio.';
    } else if (formNombre.trim().length < 3) {
      errors.nombre = 'El nombre debe contener al menos 3 caracteres.';
    }

    if (!formEmail.trim()) {
      errors.email = 'El correo electrónico es obligatorio.';
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formEmail.trim())) {
        errors.email = 'Ingrese un correo electrónico válido (ej. usuario@empresa.hn).';
      }
    }

    if (!usuarioEditando && (!formPassword || formPassword.length < 6)) {
      errors.password = 'La contraseña temporal debe tener al menos 6 caracteres.';
    }

    if (formDescuentoMaximo < 0 || formDescuentoMaximo > 100 || isNaN(formDescuentoMaximo)) {
      errors.descuentoMaximo = 'El descuento máximo debe estar entre 0% y 100%.';
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
      setModalError('Revise los campos marcados antes de guardar el usuario.');
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
        showSuccess(`Usuario "${updatedUsuario.nombre}" actualizado correctamente.`);
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
        showSuccess(`Usuario "${nuevoUsuario.nombre}" creado exitosamente.`);
      }

      setModalAbierto(false);
    } catch (err: any) {
      console.error('Error al guardar usuario en backend:', err);
      setModalError(formatUsuarioApiError(err, 'No se pudo guardar el usuario. Inténtelo de nuevo.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={styles.container}>
      <TopBar title="GESTIÓN DE USUARIOS Y PERMISOS" subtitle="Administración de Personal de la Ferretería" />

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
            <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>EQUIPO DE TRABAJO</h2>
            <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
              Asignación de roles base, personalización fina de permisos individuales y límites de descuento.
            </p>
          </div>

          <button type="button" className="btn btn-primary" onClick={abrirNuevoUsuario}>
            <Plus size={18} strokeWidth={2.5} />
            <span>NUEVO USUARIO</span>
          </button>
        </div>

        {/* Tabla Industrial de Usuarios */}
        <div className="table-container" style={{ marginTop: '20px' }}>
          {loadingList ? (
            <div style={{ padding: '36px', textAlign: 'center', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <Loader2 size={20} className="animate-spin" />
              <span>Cargando usuarios desde la API real...</span>
            </div>
          ) : (
            <table className="industrial-table">
              <thead>
                <tr>
                  <th>NOMBRE DEL USUARIO</th>
                  <th>CORREO ELECTRÓNICO</th>
                  <th>SUCURSAL ASIGNADA</th>
                  <th style={{ textAlign: 'center' }}>ROL BASE</th>
                  <th style={{ textAlign: 'center' }}>DESC. MÁXIMO</th>
                  <th style={{ textAlign: 'center' }}>PERMISOS ACTIVOS</th>
                  <th style={{ textAlign: 'center' }}>ESTADO</th>
                  <th style={{ textAlign: 'center' }}>ACCIONES</th>
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
                      <span className="badge badge-neutral">{(u.permisos || []).length} permisos</span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {u.activo ? (
                        <span className="badge badge-success">
                          <CheckCircle2 size={11} /> ACTIVO
                        </span>
                      ) : (
                        <span className="badge badge-danger">
                          <XCircle size={11} /> INACTIVO
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => abrirEditarUsuario(u)}
                      >
                        <Edit2 size={13} /> EDITAR
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
                  {usuarioEditando ? 'EDITAR USUARIO' : 'NUEVO USUARIO'}
                </h2>
              </div>
              <button type="button" onClick={() => setModalAbierto(false)} style={styles.closeBtn}>
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
                  <label className="form-label">
                    NOMBRE COMPLETO <span style={{ color: '#DC2626' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    disabled={submitting}
                    placeholder="Ej. Mario López"
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
                  <label className="form-label">
                    CORREO ELECTRÓNICO <span style={{ color: '#DC2626' }}>*</span>
                  </label>
                  <input
                    type="email"
                    required
                    disabled={submitting}
                    placeholder="mario@lamundial.hn"
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
                  <label className="form-label">
                    CONTRASEÑA TEMPORAL <span style={{ color: '#DC2626' }}>*</span>
                  </label>
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
                  <label className="form-label">SUCURSAL DE TRABAJO (TRASLADO / ASIGNACIÓN) <span style={{ color: '#DC2626' }}>*</span></label>
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
                  <label className="form-label">ROL BASE <span style={{ color: '#DC2626' }}>*</span></label>
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
                  <label className="form-label">DESCUENTO MÁXIMO PERMITIDO (0-100%) <span style={{ color: '#DC2626' }}>*</span></label>
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
                <label className="form-label">ESTADO DE CUENTA</label>
                <div style={{ display: 'flex', gap: '16px', marginTop: '6px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600 }}>
                    <input
                      type="radio"
                      name="activo"
                      checked={formActivo === true}
                      onChange={() => setFormActivo(true)}
                    />
                    Activo (Puede iniciar sesión)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: '#DC2626' }}>
                    <input
                      type="radio"
                      name="activo"
                      checked={formActivo === false}
                      onChange={() => setFormActivo(false)}
                    />
                    Inactivo (Bloqueado)
                  </label>
                </div>
              </div>

              {/* Matriz de Permisos Individuales */}
              <div style={{ borderTop: '1px solid var(--color-sidebar-text)', marginTop: '14px', paddingTop: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                  <ShieldCheck size={16} color="var(--color-primary)" />
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '12px', textTransform: 'uppercase' }}>
                    PERSONALIZACIÓN FINA DE PERMISOS
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
                          <div style={styles.permisoLabel}>{p.label}</div>
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
                      <span>GUARDAR USUARIO</span>
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

