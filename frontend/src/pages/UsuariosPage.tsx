import React, { useState } from 'react';
import { TopBar } from '../components/TopBar';
import { useMockData, type Usuario, PERMISOS_DEFAULT_POR_ROL } from '../context/MockDataContext';
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
  const { usuarios, agregarUsuario, actualizarUsuario } = useMockData();

  const [modalAbierto, setModalAbierto] = useState(false);
  const [usuarioEditando, setUsuarioEditando] = useState<Usuario | null>(null);

  // Form states
  const [formNombre, setFormNombre] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRolBase, setFormRolBase] = useState<'ADMIN' | 'CAJERO' | 'BODEGUERO' | 'VENDEDOR'>('CAJERO');
  const [formSucursalActual, setFormSucursalActual] = useState('Sucursal Centro (Principal)');
  const [formPermisos, setFormPermisos] = useState<string[]>([]);
  const [formDescuentoMaximo, setFormDescuentoMaximo] = useState<number>(10);
  const [formActivo, setFormActivo] = useState(true);

  const SUCURSALES_OPCIONES = [
    'Sucursal Centro (Principal)',
    'Sucursal San Pedro (Norte)',
    'Sucursal Choluteca (Sur)',
  ];

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
    setModalAbierto(true);
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNombre || !formEmail) return;

    if (usuarioEditando) {
      actualizarUsuario(usuarioEditando.id, {
        nombre: formNombre.trim(),
        email: formEmail.trim(),
        rolBase: formRolBase,
        sucursalActual: formSucursalActual,
        permisos: formPermisos,
        descuentoMaximo: formDescuentoMaximo,
        activo: formActivo,
      });
    } else {
      agregarUsuario({
        nombre: formNombre.trim(),
        email: formEmail.trim(),
        rolBase: formRolBase,
        sucursalActual: formSucursalActual,
        permisos: formPermisos,
        descuentoMaximo: formDescuentoMaximo,
        activo: formActivo,
      });
    }

    setModalAbierto(false);
  };

  return (
    <div style={styles.container}>
      <TopBar title="GESTIÓN DE USUARIOS Y PERMISOS" subtitle="Administración de Personal de la Ferretería" />

      <main style={styles.content}>
        <div style={styles.headerRow}>
          <div>
            <h2 style={{ fontSize: '16px', textTransform: 'uppercase' }}>EQUIPO DE TRABAJO</h2>
            <p style={{ fontSize: '12px', color: '#78716C' }}>
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
              {usuarios.map((u) => (
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
                    <span className="badge badge-neutral">{u.permisos.length} permisos</span>
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

            <form onSubmit={handleSubmit} style={{ marginTop: '16px' }}>
              <div style={styles.formRow}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">NOMBRE COMPLETO</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Mario López"
                    value={formNombre}
                    onChange={(e) => setFormNombre(e.target.value)}
                    className="form-input"
                  />
                </div>

                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">CORREO ELECTRÓNICO</label>
                  <input
                    type="email"
                    required
                    placeholder="mario@lamundial.hn"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="form-input"
                  />
                </div>
              </div>

              {!usuarioEditando && (
                <div className="form-group">
                  <label className="form-label">CONTRASEÑA TEMPORAL</label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    className="form-input"
                  />
                </div>
              )}

              <div style={styles.formRow}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">SUCURSAL DE TRABAJO (TRASLADO / ASIGNACIÓN)</label>
                  <select
                    value={formSucursalActual}
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
                  <label className="form-label">ROL BASE</label>
                  <select
                    value={formRolBase}
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
                  <label className="form-label">DESCUENTO MÁXIMO PERMITIDO (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    required
                    value={formDescuentoMaximo}
                    onChange={(e) => setFormDescuentoMaximo(Number(e.target.value))}
                    className="form-input"
                  />
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
              <div style={{ borderTop: '1px solid #D6D3D1', marginTop: '14px', paddingTop: '12px' }}>
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
                  onClick={() => setModalAbierto(false)}
                >
                  CANCELAR
                </button>
                <button type="submit" className="btn btn-primary">
                  <Check size={16} strokeWidth={2.6} /> GUARDAR USUARIO
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
    backgroundColor: '#FAFAF9',
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
    color: '#1C1917',
  },
  permisoLabel: {
    fontSize: '10px',
    color: '#78716C',
  },
};
