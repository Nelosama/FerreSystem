import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../utils/api';
import { alertas } from '../utils/alertas';
import { CAMPOS_PROVEEDOR, cambiosProveedor, datosProveedor, type ProveedorDatos } from '../utils/proveedorEdicion';

// JW-08: proveedores registrados para el administrador. Edición (nombre, RTN, contacto), desactivación y reactivación
// sobre /proveedores (solo ADMIN en el servidor, auditado). Un proveedor desactivado conserva compras y cuentas por pagar.
type Proveedor = { id: string; activo: boolean } & Partial<Record<keyof ProveedorDatos, string | null>>;
const ETIQUETAS: Record<keyof ProveedorDatos, string> = { nombre: 'Nombre', rtn: 'RTN', telefono: 'Teléfono', email: 'Correo', contacto: 'Contacto', direccion: 'Dirección' };
const mensajeError = (e: any) => { const m = e?.response?.data?.message; return Array.isArray(m) ? m.join(', ') : m || 'No se pudo guardar el proveedor. Revise la conexión y reintente.'; };

export const ProveedoresGestion: React.FC<{ disabled?: boolean; onCambio?: (activos: string[]) => void }> = ({ disabled, onCambio }) => {
  const [lista, setLista] = useState<Proveedor[]>([]);
  const [editando, setEditando] = useState<Proveedor | null>(null);
  const [form, setForm] = useState<ProveedorDatos>(datosProveedor({}));
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const { data } = await api.get('/proveedores', { params: { incluirInactivos: 'true' } });
      const proveedores: Proveedor[] = Array.isArray(data) ? data : [];
      setLista(proveedores);
      onCambio?.(proveedores.filter((p) => p.activo).map((p) => p.id));
    } catch (e) { setError(mensajeError(e)); }
  }, [onCambio]);
  useEffect(() => { void cargar(); }, [cargar]);

  const ejecutar = async (accion: () => Promise<unknown>, exito: string) => {
    setOcupado(true); setError(''); setAviso('');
    try { await accion(); setAviso(exito); setEditando(null); await cargar(); }
    catch (e) { setError(mensajeError(e)); }
    finally { setOcupado(false); }
  };
  const desactivar = async (p: { id: string; nombre?: string | null }) => {
    const confirmado = await alertas.confirmar({ texto: `¿Desactivar a ${p.nombre}? Sus compras y cuentas por pagar se conservan.`, confirmar: 'Desactivar', peligroso: true });
    if (confirmado) void ejecutar(() => api.delete(`/proveedores/${p.id}`), 'Proveedor desactivado.');
  };
  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editando) return;
    const r = cambiosProveedor(datosProveedor(editando), form);
    if (!r.ok) { setError(r.error); return; }
    if (!Object.keys(r.cambios).length) { setEditando(null); return; }
    void ejecutar(() => api.patch(`/proveedores/${editando.id}`, r.cambios), 'Proveedor actualizado.');
  };
  const bloqueado = disabled || ocupado;

  return <section className="operation-card proveedores-gestion">
    <h2>Proveedores registrados</h2>
    {error && <p role="alert" className="operation-error">{error}</p>}
    {aviso && <p role="status" className="operation-success">{aviso}</p>}
    {lista.length === 0 ? <p className="form-hint">Aún no hay proveedores registrados.</p> :
      <div className="operation-table"><table>
        <thead><tr><th>Nombre</th><th>RTN</th><th>Teléfono</th><th>Estado</th><th>Acciones</th></tr></thead>
        <tbody>{lista.map((p) => <tr key={p.id}>
          <td>{p.nombre}</td><td>{p.rtn || '—'}</td><td>{p.telefono || '—'}</td><td>{p.activo ? 'Activo' : 'Desactivado'}</td>
          <td>
            <button type="button" className="btn btn-secondary btn-sm" disabled={bloqueado} onClick={() => { setEditando(p); setForm(datosProveedor(p)); setError(''); setAviso(''); }}>Editar {p.nombre}</button>{' '}
            {p.activo
              ? <button type="button" className="btn btn-secondary btn-sm" disabled={bloqueado} onClick={() => void desactivar(p)}>Desactivar {p.nombre}</button>
              : <button type="button" className="btn btn-secondary btn-sm" disabled={bloqueado} onClick={() => void ejecutar(() => api.patch(`/proveedores/${p.id}`, { activo: true }), 'Proveedor reactivado.')}>Reactivar {p.nombre}</button>}
          </td>
        </tr>)}</tbody>
      </table></div>}
    {editando && <form className="operation-form" onSubmit={guardar}>
      <fieldset disabled={bloqueado} className="operation-form">
        {CAMPOS_PROVEEDOR.map((campo) => <label key={campo}>{ETIQUETAS[campo]}
          <input className="form-input" required={campo === 'nombre'} type={campo === 'email' ? 'email' : 'text'} maxLength={campo === 'rtn' ? 30 : 300} value={form[campo]} onChange={(e) => setForm({ ...form, [campo]: e.target.value })} />
        </label>)}
      </fieldset>
      <button className="btn btn-primary" disabled={bloqueado}>Guardar proveedor</button>{' '}
      <button type="button" className="btn btn-secondary" disabled={ocupado} onClick={() => setEditando(null)}>Cancelar</button>
    </form>}
  </section>;
};
